"""golden.json 항목별로 사람이 정답을 빨리 확인할 수 있는 Markdown과 시각이 찍힌 시트 이미지를 만든다.

시트 이미지는 영상 장면이므로 저장소 밖에만 쓴다.
실행: cd apps/api && uv run python scripts/eval_review.py --videos <폴더> [<폴더> ...] --sheets <저장소 밖 폴더>
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
GOLDEN = ROOT / "eval" / "golden.json"
REVIEW = ROOT / "eval" / "review"
TILE_W, COLS = 320, 6
OVERVIEW_TILES = 36
ZOOM_S, ZOOM_STEP = 2.0, 0.2  # 충돌 앞뒤 2초를 0.2초 간격으로 본다.


def contact_sheet(video: Path, times: list[float], out: Path) -> None:
    cap = cv2.VideoCapture(str(video))
    tiles = []
    for t in times:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, im = cap.read()
        if not ok:
            continue
        im = cv2.resize(im, (TILE_W, round(im.shape[0] * TILE_W / im.shape[1])))
        cv2.rectangle(im, (0, 0), (74, 22), (0, 0, 0), -1)
        cv2.putText(im, f"{t:.1f}", (3, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 1, cv2.LINE_AA)
        tiles.append(im)
    cap.release()
    if not tiles:
        raise ValueError(f"프레임을 읽지 못함: {video}")
    tiles += [np.zeros_like(tiles[0])] * (-len(tiles) % COLS)
    grid = np.vstack([np.hstack(tiles[i:i + COLS]) for i in range(0, len(tiles), COLS)])
    out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out), grid, [cv2.IMWRITE_JPEG_QUALITY, 82])


def duration(video: Path) -> float:
    cap = cv2.VideoCapture(str(video))
    d = cap.get(cv2.CAP_PROP_FRAME_COUNT) / (cap.get(cv2.CAP_PROP_FPS) or 30)
    cap.release()
    return d


def overview_times(d: float) -> list[float]:
    step = max(0.5, d / OVERVIEW_TILES)
    return [round(i * step, 2) for i in range(int(d / step) + 1)]


def zoom_times(t: float, d: float) -> list[float]:
    n = round(ZOOM_S / ZOOM_STEP)
    return [round(t + i * ZOOM_STEP, 2) for i in range(-n, n + 1) if 0 <= t + i * ZOOM_STEP <= d]


def page(e: dict, overview: Path, zoom: Path | None) -> str:
    rows = "\n".join(f"| {k} | {e.get(k)} |" for k in
                     ("is_accident", "involvement", "collision_t", "chart_id", "me", "my_fault", "unsure", "split"))
    lines = [f"# {e['file']}", "", "초안 라벨이다. 맞으면 golden.json의 `checked_by`에 이름을 적고, 틀리면 값을 고친다.", "",
             "| 항목 | 초안 |", "|---|---|", rows, "", f"메모: {e.get('note') or '없음'}", "", f"전체 시트: `{overview.name}`"]
    if zoom:
        lines.append(f"충돌 앞뒤 시트: `{zoom.name}`")
    if e.get("cut_from"):
        lines.append(f"원본 구간: {e['cut_from']}")
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos", nargs="+", type=Path, required=True)
    ap.add_argument("--sheets", type=Path, required=True)
    a = ap.parse_args()
    REVIEW.mkdir(parents=True, exist_ok=True)
    index = ["# 정답 확인 목록", "", "시트 이미지는 영상 장면이라 저장소에 없다. 위 실행 명령의 --sheets 폴더에 만들어 파일 이름으로 찾는다.", "", "| 파일 | 사고 | 충돌 시각 | 도표 | 내 과실 | 불확실 | 확인자 |", "|---|---|---|---|---|---|---|"]
    for e in json.loads(GOLDEN.read_text(encoding="utf-8")):
        stem = Path(e["file"]).stem
        video = next((d / e["file"] for d in a.videos if (d / e["file"]).exists()), None)
        if video is None:
            raise SystemExit(f"영상 없음: {e['file']}")
        d = duration(video)
        overview = a.sheets / f"{stem}_overview.jpg"
        contact_sheet(video, overview_times(d), overview)
        zoom = None
        if e.get("collision_t") is not None:
            zoom = a.sheets / f"{stem}_zoom.jpg"
            contact_sheet(video, zoom_times(e["collision_t"], d), zoom)
        (REVIEW / f"{stem}.md").write_text(page(e, overview, zoom), encoding="utf-8")
        index.append(f"| [{e['file']}]({stem}.md) | {e['is_accident']} | {e.get('collision_t')} | {e.get('chart_id')} "
                     f"| {e.get('my_fault')} | {'예' if e.get('unsure') else ''} | {e.get('checked_by') or ''} |")
    (REVIEW / "README.md").write_text("\n".join(index) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
