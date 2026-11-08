"""정답 영상마다 후보 단계(media, scan, audio, locate)만 로컬로 돌려 사고가 후보에서 빠지는지 본다. LLM은 부르지 않는다.

초안 정답 기준이다. 같은 이름의 .json에는 후보와 시각별 신호 배열을 남겨 임계값 조정에 쓴다.
실행: cd apps/api && uv run python scripts/candidate_check.py --videos eval/videos <폴더> --out eval/results/<시각>-candidates.md
"""
import argparse
import json
import os
import shutil
import sys
import tempfile
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
GOLDEN = ROOT / "eval" / "golden.json"
NEAR_S = 1.0
os.environ.setdefault("DATABASE_URL", "postgresql:///dashpi_test")  # 설정이 요구하지만 쓰지 않는다.


def run_candidates(video: Path) -> dict:
    from app.config import settings
    from app.pipeline.locate import find_candidates
    from app.pipeline.media import audio_envelope, extract_frames, normalize
    from app.pipeline.run import SCAN_FPS
    from app.pipeline.scan import scan

    with tempfile.TemporaryDirectory() as tmp:  # 영상과 프레임은 저장소에 남기지 않는다.
        work = Path(tmp)
        src = work / f"source{video.suffix}"
        shutil.copy(video, src)
        info = normalize(src, work / "analysis.mp4", work / "playback.mp4", settings.max_video_seconds, None)
        scanned = scan(extract_frames(work / "analysis.mp4", SCAN_FPS, work / "scan"))
        debug: dict = {}
        cands = find_candidates(scanned.tracks, info.width * info.height, scanned.motion, audio_envelope(work / "analysis.mp4"),
                                aspect=info.width / info.height, debug=debug)
    return {"candidates": [asdict(c) for c in cands], "series": debug, "duration": round(info.duration, 1),
            "tracks": len(scanned.tracks)}


def judge(e: dict, cands: list[dict]) -> tuple[str, float | None, float | None, str]:
    """(판정, 가장 가까운 후보 시각, 차이, 후보 신호)"""
    t = e["collision_t"]
    near = min(cands, key=lambda c: abs(c["t"] - t)) if cands and t is not None else None
    diff = round(abs(near["t"] - t), 1) if near else None
    sig = " ".join(f"{k}={v}" for k, v in near["signals"].items() if v) if near else "-"
    if e["is_accident"] is False:
        return "무사고", near and near["t"], diff, sig
    if e["is_accident"] is None:
        return "미정", None, None, "-"
    return ("후보 있음" if diff is not None and diff <= NEAR_S else "후보 없음"), near and near["t"], diff, sig


def render(rows: list[dict]) -> str:
    acc = [r for r in rows if r["verdict"] in ("후보 있음", "후보 없음")]
    have = sum(r["verdict"] == "후보 있음" for r in acc)
    lines = ["# 후보 단계 원인 분석", "", "**초안 정답 기준.** 사람이 확인하지 않은 라벨이다. LLM은 부르지 않았다.", "",
             f"정답이 사고인 영상 {len(acc)}개 중 후보 있음(1초 이내) {have}개, 후보 없음 {len(acc) - have}개. "
             f"무사고 {sum(r['verdict'] == '무사고' for r in rows)}개, 미정 {sum(r['verdict'] == '미정' for r in rows)}개(미정은 세지 않는다).", "",
             "| 파일 | 분할 | 정답 충돌 | 가장 가까운 후보(초) | 차이 | 후보 신호 | 판정 |", "|---|---|---|---|---|---|---|"]
    for r in rows:
        lines.append(f"| {r['file'][:12]} | {r['split']} | {r['collision_t'] if r['collision_t'] is not None else '-'} "
                     f"| {r['nearest'] if r['nearest'] is not None else '-'} | {r['diff'] if r['diff'] is not None else '-'} | {r['signals']} | {r['verdict']} |")
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos", nargs="+", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    rows = []
    for e in json.loads(GOLDEN.read_text(encoding="utf-8")):
        video = next((d.expanduser() / e["file"] for d in a.videos if (d.expanduser() / e["file"]).exists()), None)
        r = {"file": e["file"], "split": e["split"], "collision_t": e["collision_t"], "is_accident": e["is_accident"]}
        if video is None:
            r.update(verdict="영상 없음", nearest=None, diff=None, signals="-", candidates=[], series={})
        else:
            got = run_candidates(video)
            v, near, diff, sig = judge(e, got["candidates"])
            r.update(verdict=v, nearest=near, diff=diff, signals=sig, **got)
        rows.append(r)
        print(r["file"][:12], r["verdict"], flush=True)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.with_suffix(".json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    a.out.write_text(render(rows), encoding="utf-8")
    print(a.out)


if __name__ == "__main__":
    main()
