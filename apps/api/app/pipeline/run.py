import logging
import time
from collections.abc import Callable
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from app.config import settings
from app.errors import PipelineError  # noqa: F401  worker와 테스트가 여기서 가져간다.
from app.llm import PROMPT_VERSION
from app.pipeline.assess import assess
from app.pipeline.estimate import estimate_collision
from app.pipeline.focus import dense_keyframes, select_keyframes, uniform_keyframes
from app.pipeline.locate import Candidate, drop_hood, find_candidates
from app.pipeline.media import audio_envelope, extract_frames, normalize
from app.pipeline.observe import observe, recheck_time
from app.pipeline.scan import ScanResult, TrackPoint, scan
from app.report import Report
from app.storage import Storage

log = logging.getLogger("pipeline")
PIPELINE_VERSION = "2026-11-05.1"
SCAN_FPS = 5


@dataclass
class Context:
    analysis_id: int
    workdir: Path  # 원본 영상은 workdir/source.<확장자>
    storage: Storage
    llm: Any
    table: Any
    on_stage: Callable[..., None]  # (stage, detail=None, status="done")
    trim: tuple[float, float] | None = None  # 원본 기준 (시작, 끝) 초


@dataclass
class PipelineResult:
    report: Report
    trace: dict
    playback_path: Path
    overlay: dict


def _overlay(tracks: dict[int, list[TrackPoint]], width: int, height: int) -> dict:
    frames: dict[float, list[dict]] = {}
    for tid, points in tracks.items():
        for p in points:
            x1, y1, x2, y2 = p.box
            box = [round(min(max(v, 0.0), 1.0), 4) for v in (x1 / width, y1 / height, x2 / width, y2 / height)]
            frames.setdefault(p.t, []).append({"id": tid, "cls": p.cls, "box": box})
    return {"width": width, "height": height, "frames": [{"t": t, "boxes": b} for t, b in sorted(frames.items())]}


def run_pipeline(ctx: Context) -> PipelineResult:
    seconds: dict[str, float] = {}

    @contextmanager
    def stage(name: str):
        """yield한 dict가 진행 화면의 detail이 된다. 사용자를 알 수 있는 값은 넣지 않는다."""
        started, detail = time.perf_counter(), {}
        ctx.on_stage(name, None, "running")
        yield detail
        seconds[name] = round(time.perf_counter() - started, 2)
        ctx.on_stage(name, detail, "done")

    video, playback = ctx.workdir / "analysis.mp4", ctx.workdir / "playback.mp4"
    with stage("normalize") as d:
        source = next(ctx.workdir.glob("source.*"))
        info = normalize(source, video, playback, settings.max_video_seconds, ctx.trim)
        d.update(duration=round(info.duration, 1), width=info.width, height=info.height)

    scan_failed = False
    with stage("scan") as d:
        frames = extract_frames(video, SCAN_FPS, ctx.workdir / "scan")
        try:
            scanned = scan(frames)
        except Exception:  # 추적이 죽어도 균등 표본과 낮은 신뢰도로 분석은 이어 간다.
            log.exception("객체 추적 실패 %s", ctx.analysis_id)
            scanned, scan_failed = ScanResult({}, []), True
        tracks = scanned.tracks
        d.update(frames=len(frames), tracks=len(tracks))

    with stage("locate") as d:
        candidates = find_candidates(tracks, info.width * info.height, scanned.motion, audio_envelope(video),
                                     aspect=info.width / info.height)
        d.update(candidates=[c.t for c in candidates])

    with stage("focus") as d:
        out_dir = ctx.workdir / "keyframes"
        keyframes = (select_keyframes(video, candidates, tracks, out_dir) if candidates
                     else uniform_keyframes(video, tracks, out_dir))
        d.update(frames=len(keyframes), times=[round(k.t, 2) for k in keyframes])

    extra_focus, first_observation = False, None
    with stage("observe") as d:
        observation = observe(keyframes, candidates, tracks, ctx.llm)
        t = recheck_time(observation, candidates, info.duration)
        if t is not None:
            # 프레임이 듬성한 곳이다. 그 주변을 빠짐없이 뽑아 한 번만 다시 보고, 그 구간은 다시 본 결과를 따른다.
            # 점수 0으로 넘겨 재확인 시각이 증거처럼 보이지 않게 한다.
            extra_focus = True
            again = Candidate(t, 0.0, {})
            dense = dense_keyframes(video, t, tracks, ctx.workdir / "keyframes_extra")
            second = observe(dense, [again], tracks, ctx.llm)
            lead_up = [f for f in observation.facts if not dense[0].t <= f.t <= dense[-1].t]
            second.facts = sorted(lead_up + second.facts, key=lambda f: f.t)
            for field in ("road", "ego_action", "other_action", "signal"):  # 3초 구간에서 안 보인 맥락은 첫 관찰을 쓴다.
                if getattr(second, field) is None:
                    setattr(second, field, getattr(observation, field))
            first_observation = observation.model_dump(mode="json")
            observation, keyframes = second, sorted(keyframes + dense, key=lambda k: k.t)
        d.update(frames=len(keyframes), extra_focus=extra_focus)

    with stage("assess") as d:
        # 관찰이 접촉을 못 봤을 때만 assess가 쓴다. 추적이 없으면 흔들림이 자기 차 충격인지 가릴 단서가 없어 추정하지 않는다.
        estimate = estimate_collision(candidates) if tracks else None
        report = assess(observation, keyframes, ctx.table, ctx.llm, info.duration, estimate)
        if not candidates or not tracks:  # 후보나 추적 없이 얻은 결과는 충돌을 봤더라도 낮음으로 둔다.
            report.confidence = "low"
        d.update(involvement=report.involvement, confidence=report.confidence)

    trace = {"candidates": [asdict(c) for c in candidates], "keyframes": [k.t for k in keyframes],
             "track_count": len(tracks), "scan_failed": scan_failed, "extra_focus": extra_focus,
             "model": settings.openai_model, "reasoning_effort": settings.openai_reasoning_effort,
             "prompt_version": PROMPT_VERSION, "llm_calls": ctx.llm.calls, "stage_seconds": seconds,
             "observation": observation.model_dump(mode="json"), "first_observation": first_observation,
             "estimate": {"t": estimate.t, "facts": [f.model_dump() for f in estimate.facts]} if estimate else None}
    return PipelineResult(report, trace, playback, _overlay(drop_hood(tracks, info.height), info.width, info.height))
