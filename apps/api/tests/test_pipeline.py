import shutil
from pathlib import Path

import pytest

from app.fault import FaultTable
from app.pipeline import run as run_mod
from app.pipeline.assess import AssessOut
from app.pipeline.observe import Fact, Observation
from app.pipeline.run import PIPELINE_VERSION, Context, run_pipeline
from app.pipeline.scan import ScanResult, TrackPoint
from tests.fixtures import make_clips as mk
from tests.fixtures.fake_llm import FakeLLM

pytestmark = pytest.mark.model
STAGES = ["normalize", "scan", "locate", "focus", "observe", "assess"]


@pytest.fixture(scope="module")
def clip_with_motion(tmp_path_factory):
    return mk.flash(tmp_path_factory.mktemp("clip") / "motion.mp4", bang=True)  # 흔들림과 소리가 같이 있어야 후보가 된다.


@pytest.fixture(scope="module")
def clip_blank(tmp_path_factory):
    return mk.blank(tmp_path_factory.mktemp("clip") / "blank.mp4")


def observation(t=3.0, **kw) -> Observation:
    base = dict(involvement="party", reason=None, scene="lane_change", road="도로", ego_action="직진",
                other_action="차로 변경", signal=None, collision_t=t, suspect_t=None,
                facts=[], unseen=[])
    o = Observation(**{**base, **kw})
    if t is not None and not o.facts:
        o.facts = [Fact(t=t, text="접촉"), Fact(t=t, text="흔들림"), Fact(t=t, text="멈춤")]
    return o


def verdict(**kw) -> AssessOut:
    base = dict(accident_type="접촉", summary="요약", severity="low", severity_fact=0, timeline=[0], chart_id="차43-2", chart_facts=[0], me="A",
                applied=[], unknown=[], serious=[], favorable=[], unfavorable=[], actions_now=[], actions_later=[])
    return AssessOut(**{**base, **kw})


def context(tmp_path: Path, src: Path, llm) -> tuple[Context, list]:
    shutil.copy(src, tmp_path / "source.mp4")
    stages = []
    return Context(1, tmp_path, None, llm, FaultTable.load(),
                   lambda stage, detail=None, status="done": stages.append((stage, detail, status))), stages


def test_pipeline_runs_with_fixed_llm(clip_with_motion, tmp_path):
    llm = FakeLLM(observation(), verdict())
    ctx, stages = context(tmp_path, clip_with_motion, llm)
    res = run_pipeline(ctx)
    assert res.report.fault.chart_id == "차43-2" and res.report.collision_t == 3.0
    assert res.playback_path.exists() and llm.responses == []
    done = [s for s, _, status in stages if status == "done"]
    assert done == STAGES
    assert [s for s, _, status in stages if status == "running"] == STAGES
    assert PIPELINE_VERSION == "2026-11-05.1"

    details = {s: d for s, d, status in stages if status == "done"}
    assert details["normalize"]["duration"] == pytest.approx(6, abs=0.2)
    assert details["scan"]["tracks"] == 0
    assert details["locate"]["candidates"] and details["focus"]["frames"] > 0
    assert details["observe"]["frames"] > 0

    t = res.trace
    assert t["candidates"] and t["keyframes"] and t["model"] and t["prompt_version"]
    assert set(t["stage_seconds"]) == set(STAGES) and "llm_calls" in t and t["observation"]["collision_t"] == 3.0
    assert res.overlay == {"width": 320, "height": 180, "frames": []}


def test_no_candidates_uses_uniform_keyframes_and_low_confidence(clip_blank, tmp_path):
    llm = FakeLLM(observation(t=None, involvement="none", reason="차가 보이지 않습니다"))
    ctx, stages = context(tmp_path, clip_blank, llm)
    res = run_pipeline(ctx)
    assert res.report.involvement == "none" and res.report.confidence == "low"
    assert res.trace["candidates"] == [] and len(res.trace["keyframes"]) == 12
    assert [s for s, _, st in stages if st == "done"] == STAGES


def test_no_candidates_caps_confidence_even_with_a_collision(clip_blank, tmp_path):
    # 균등 표본에서 충돌을 봤다면 그 주변을 다시 보고, 그래도 신뢰도는 낮음이다.
    llm = FakeLLM(observation(t=3.0), observation(t=3.0), verdict())
    ctx, _ = context(tmp_path, clip_blank, llm)
    res = run_pipeline(ctx)
    assert res.report.collision_t == 3.0 and res.report.confidence == "low" and res.trace["extra_focus"]


def test_collision_outside_candidate_windows_gets_one_extra_focus(clip_with_motion, tmp_path):
    # 후보는 3초뿐이고 창은 0~5초다. 5.5초 충돌은 창 밖이다.
    llm = FakeLLM(observation(t=5.5), observation(t=5.5), verdict())
    ctx, _ = context(tmp_path, clip_with_motion, llm)
    res = run_pipeline(ctx)
    assert res.trace["extra_focus"] and llm.responses == [] and res.report.collision_t == 5.5
    assert sum(4 <= t <= 6 for t in res.trace["keyframes"]) >= 9  # 앞뒤 1.5초를 0.2초 간격으로 봤다.
    first, second = llm.seen[0][0], llm.seen[1][0]
    assert "0.00" in str(second[1]["content"][0])  # 재확인 창은 점수 0으로 내보내 후보가 증거처럼 보이지 않게 한다.
    assert first != second


def test_lead_up_facts_survive_the_second_look(clip_with_motion, tmp_path):
    early = [Fact(t=1.0, text="멀리 있던 차"), Fact(t=5.5, text="첫 번째로 본 충돌")]
    llm = FakeLLM(observation(t=5.5, facts=early), observation(t=5.5, facts=[Fact(t=5.4, text="다시 본 충돌")]), verdict())
    ctx, _ = context(tmp_path, clip_with_motion, llm)
    assert [f.text for f in run_pipeline(ctx).report.facts] == ["멀리 있던 차", "다시 본 충돌"]


def test_second_look_can_withdraw_the_collision(clip_with_motion, tmp_path):
    llm = FakeLLM(observation(t=5.5), observation(t=None, involvement="none", reason="접촉이 보이지 않습니다"))
    ctx, _ = context(tmp_path, clip_with_motion, llm)
    res = run_pipeline(ctx)
    assert res.report.involvement == "none" and res.report.collision_t is None and res.report.fault is None


def test_suspect_time_gets_a_second_look_that_can_confirm(clip_with_motion, tmp_path):
    first = observation(t=None, involvement="none", reason="보이지 않습니다", suspect_t=3.5)
    llm = FakeLLM(first, observation(t=3.5), verdict())
    ctx, _ = context(tmp_path, clip_with_motion, llm)
    res = run_pipeline(ctx)
    assert res.trace["extra_focus"] and res.report.collision_t == 3.5 and llm.responses == []


def test_second_look_happens_only_once(clip_with_motion, tmp_path):
    suspicious = observation(t=None, involvement="none", reason="보이지 않습니다", suspect_t=3.5)
    llm = FakeLLM(suspicious, suspicious)
    ctx, _ = context(tmp_path, clip_with_motion, llm)
    assert run_pipeline(ctx).report.involvement == "none" and llm.responses == []


def test_collision_inside_candidate_window_does_not_refocus(clip_with_motion, tmp_path):
    llm = FakeLLM(observation(t=3.5), verdict())
    ctx, _ = context(tmp_path, clip_with_motion, llm)
    assert run_pipeline(ctx).trace["extra_focus"] is False


def test_collision_time_outside_video_is_dropped(clip_with_motion, tmp_path):
    llm = FakeLLM(observation(t=500.0))
    ctx, _ = context(tmp_path, clip_with_motion, llm)
    r = run_pipeline(ctx).report
    assert r.involvement == "none" and r.collision_t is None and r.confidence == "low"


def test_collision_past_the_end_from_second_look_is_dropped(clip_with_motion, tmp_path):
    late = observation(t=6.5, facts=[Fact(t=5.9, text="접촉")])  # 사실은 영상 안, 충돌 시각만 영상 밖
    llm = FakeLLM(observation(t=5.5), late)
    ctx, _ = context(tmp_path, clip_with_motion, llm)
    r = run_pipeline(ctx).report
    assert r.involvement == "none" and r.collision_t is None and r.fault is None and llm.responses == []


def test_second_look_keeps_first_context_and_trace(clip_with_motion, tmp_path):
    first = observation(t=5.5, road="편도 2차로", signal="녹색", ego_action="직진")
    second = observation(t=5.5, road=None, signal=None, ego_action="서행", other_action=None)
    llm = FakeLLM(first, second, verdict())
    ctx, _ = context(tmp_path, clip_with_motion, llm)
    t = run_pipeline(ctx).trace
    o = t["observation"]
    assert (o["road"], o["signal"], o["ego_action"], o["other_action"]) == ("편도 2차로", "녹색", "서행", "차로 변경")
    assert t["first_observation"]["road"] == "편도 2차로"


def test_tracks_become_normalized_overlay_and_aspect_is_passed(clip_with_motion, tmp_path, monkeypatch):
    tracks = {4: [TrackPoint(0.2, (-16.0, 18.0, 160.0, 200.0), "car", 0.9),
                  TrackPoint(0.4, (32.0, 18.0, 160.0, 90.0), "car", 0.9)],
              7: [TrackPoint(0.4, (0.0, 0.0, 32.0, 18.0), "bus", 0.8)]}
    monkeypatch.setattr(run_mod, "scan", lambda frames: ScanResult(tracks, [(0.2, 0.0)]))
    seen = {}
    real = run_mod.find_candidates

    def spy(*a, **kw):
        seen.update(kw)
        return real(*a, **kw)

    monkeypatch.setattr(run_mod, "find_candidates", spy)
    ctx, stages = context(tmp_path, clip_with_motion, FakeLLM(observation(t=None, involvement="none", reason="없음")))
    res = run_pipeline(ctx)
    assert seen["aspect"] == pytest.approx(320 / 180)
    assert res.overlay["frames"][0] == {"t": 0.2, "boxes": [{"id": 4, "cls": "car", "box": [0, 0.1, 0.5, 1]}]}
    assert res.overlay["frames"][1]["t"] == 0.4 and {b["id"] for b in res.overlay["frames"][1]["boxes"]} == {4, 7}
    assert next(d for s, d, st in stages if s == "scan" and st == "done")["tracks"] == 2


def test_tracking_crash_falls_back_and_stays_low(clip_blank, tmp_path, monkeypatch):
    def boom(frames):
        raise RuntimeError("yolo")

    monkeypatch.setattr(run_mod, "scan", boom)
    llm = FakeLLM(observation(t=3.0), observation(t=3.0), verdict())
    ctx, _ = context(tmp_path, clip_blank, llm)
    res = run_pipeline(ctx)
    assert res.trace["scan_failed"] and res.report.confidence == "low"


def test_no_tracks_with_candidates_stays_low(clip_with_motion, tmp_path):
    # 소리나 흔들림만으로 후보가 나온 영상. 프레임은 후보 주변을 쓰되 번호 상자가 없으니 낮음이다.
    llm = FakeLLM(observation(), verdict())
    ctx, _ = context(tmp_path, clip_with_motion, llm)
    res = run_pipeline(ctx)
    assert res.trace["track_count"] == 0 and res.trace["candidates"] and res.report.confidence == "low"


def test_run_pipeline_passes_estimate(clip_with_motion, tmp_path, monkeypatch):
    # 실제 흔들림·소리 신호에 트랙 하나만 얹는다. 관찰이 접촉을 못 봐도 센서 추정이 레포트를 낸다.
    real = run_mod.scan
    track = {1: [TrackPoint(1.0, (100.0, 60.0, 140.0, 90.0), "car", 0.9)]}
    monkeypatch.setattr(run_mod, "scan", lambda frames: ScanResult(track, real(frames).motion))
    llm = FakeLLM(observation(t=None, involvement="none", reason="접촉이 보이지 않습니다"))
    ctx, _ = context(tmp_path, clip_with_motion, llm)
    res = run_pipeline(ctx)
    assert res.trace["candidates"] and res.trace["candidates"][0]["t"] == 3.0
    assert res.trace["estimate"] == {"t": 3.0, "facts": [{"t": 3.0, "text": "화면이 크게 흔들림"},
                                                         {"t": 3.0, "text": "충돌음이 크게 남"}]}
    assert res.report.involvement == "party" and res.report.collision_t == 3.0 and res.report.summary.startswith("충돌 추정: ")
    assert res.report.confidence == "low" and llm.responses == []


def test_no_tracks_means_no_estimate(clip_with_motion, tmp_path):
    llm = FakeLLM(observation(t=None, involvement="none", reason="접촉이 보이지 않습니다"))
    ctx, _ = context(tmp_path, clip_with_motion, llm)
    res = run_pipeline(ctx)
    assert res.trace["candidates"] and res.trace["track_count"] == 0
    assert res.trace["estimate"] is None and res.report.involvement == "none"


def test_no_candidates_leaves_no_estimate(clip_blank, tmp_path):
    llm = FakeLLM(observation(t=None, involvement="none", reason="차가 보이지 않습니다"))
    ctx, _ = context(tmp_path, clip_blank, llm)
    res = run_pipeline(ctx)
    assert res.trace["estimate"] is None and res.report.involvement == "none"


def test_worker_runs_real_pipeline_and_saves_report(db, user, storage, clip_with_motion):
    from app import worker
    from app.models import Analysis, AnalysisStatus

    a = Analysis(user_id=user.id, status=AnalysisStatus.queued, source_size=clip_with_motion.stat().st_size)
    db.add(a)
    db.flush()
    a.source_key = f"analyses/{a.id}/source.mp4"
    db.flush()
    storage.s3.put_object(Bucket=storage.bucket, Key=a.source_key, Body=clip_with_motion.read_bytes())
    a = worker.claim_next(db)
    worker.process(db, a, storage, llm=FakeLLM(observation(), verdict()), table=FaultTable.load())
    assert a.status == AnalysisStatus.done and a.pipeline_version == PIPELINE_VERSION
    assert a.report["fault"]["chart_id"] == "차43-2" and a.trace["prompt_version"]
    assert a.progress["assess"]["status"] == "done" and a.progress["locate"]["detail"]["candidates"]
    assert storage.head(a.playback_key) and storage.head(f"analyses/{a.id}/overlay.json")


def test_failed_job_keeps_token_usage_in_trace(db, user, storage, clip_with_motion):
    from app import worker
    from app.errors import PipelineError
    from app.models import Analysis, AnalysisStatus

    a = Analysis(user_id=user.id, status=AnalysisStatus.queued, source_size=clip_with_motion.stat().st_size)
    db.add(a)
    db.flush()
    a.source_key = f"analyses/{a.id}/source.mp4"
    db.flush()
    storage.s3.put_object(Bucket=storage.bucket, Key=a.source_key, Body=clip_with_motion.read_bytes())
    a = worker.claim_next(db)
    llm = FakeLLM(PipelineError("MODEL_INVALID", "실패"))
    llm.calls.append({"schema": "Observation", "input_tokens": 10, "output_tokens": 2, "valid": False})
    worker.process(db, a, storage, llm=llm, table=FaultTable.load())
    assert a.status == AnalysisStatus.failed and a.trace["llm_calls"][0]["input_tokens"] == 10
