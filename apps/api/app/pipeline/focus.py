import math
import shutil
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory

import cv2
import numpy as np

from app.pipeline.locate import Candidate, drop_hood
from app.pipeline.media import Frame, extract_frames, probe
from app.pipeline.scan import TrackPoint

BEFORE_S = 3.0
AFTER_S = 2.0
FOCUS_FPS = 15
BIN_S = 0.5
TRACK_EDGE_S = 0.1  # 트랙 양끝에서 스캔 간격의 절반까지는 상자를 그대로 쓴다.
TRACK_GAP_S = 0.5  # 트랙이 이보다 오래 끊긴 구간은 보간하지 않는다.
BOX_COLOR = (0, 255, 255)
DENSE_S = 1.5
DENSE_FPS = 5


@dataclass
class Keyframe:
    t: float
    raw_path: Path  # 원본 해상도
    annotated_path: Path  # 번호 상자를 그린 사본
    boxes_text: str  # 줄마다 "#번호 종류 track=id box=(x1, y1, x2, y2)", 좌표는 0~1


def _sharpness(path: Path) -> float:
    return float(cv2.Laplacian(cv2.imread(str(path), cv2.IMREAD_GRAYSCALE), cv2.CV_64F).var())


def _sharpest_per_bin(frames: list[Frame], start: float, width: float) -> list[Frame]:
    best: dict[int, tuple[float, Frame]] = {}
    for f in frames:
        b = int((f.t - start + 1e-6) / width)
        s = _sharpness(f.path)
        if b not in best or s > best[b][0]:
            best[b] = (s, f)
    return [best[b][1] for b in sorted(best)]


def _quotas(sizes: list[int], total: int) -> list[int]:
    """점수 순서로 한 장씩 돌려가며 나눈다. 1순위가 틀려도 다른 후보의 충돌 장면이 남는다."""
    quotas = [0] * len(sizes)
    while total and any(q < s for q, s in zip(quotas, sizes)):
        for i, s in enumerate(sizes):
            if total and quotas[i] < s:
                quotas[i] += 1
                total -= 1
    return quotas


def _spaced(frames: list[Frame], k: int, t: float) -> list[Frame]:
    """k장을 창 전체에 고르게 고르되 후보 시각에 가장 가까운 프레임은 꼭 넣는다."""
    if k >= len(frames):
        return frames
    if k == 0:
        return []
    peak = min(range(len(frames)), key=lambda i: abs(frames[i].t - t))
    picks = {round(x) for x in np.linspace(0, len(frames) - 1, k)}
    if peak not in picks:
        picks.remove(min(picks, key=lambda i: abs(i - peak)))
        picks.add(peak)
    return [frames[i] for i in sorted(picks)]


def _box_at(ps: list[TrackPoint], t: float) -> tuple[float, ...] | None:
    """키프레임(15fps)은 스캔 시각(5fps) 사이에 오므로 상자를 보간한다."""
    if t < ps[0].t - TRACK_EDGE_S or t > ps[-1].t + TRACK_EDGE_S:
        return None
    times = [p.t for p in ps]
    after = int(np.searchsorted(times, t))
    if 0 < after < len(ps) and times[after] > t and times[after] - times[after - 1] > TRACK_GAP_S:
        return None
    return tuple(float(np.interp(t, times, [p.box[i] for p in ps])) for i in range(4))


def _draw(img: np.ndarray, box: tuple[float, ...], number: int) -> None:
    thick = max(2, img.shape[1] // 640)
    scale = max(0.5, img.shape[1] / 1600)
    x1, y1, x2, y2 = (round(v) for v in box)
    cv2.rectangle(img, (x1, y1), (x2, y2), BOX_COLOR, thick)
    label = f"#{number}"
    (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, scale, thick)
    top = max(y1, h + 2 * thick)  # 화면 위로 잘리지 않게 한다.
    cv2.rectangle(img, (x1, top - h - 2 * thick), (x1 + w + 2 * thick, top), BOX_COLOR, -1)
    cv2.putText(img, label, (x1 + thick, top - thick), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), thick, cv2.LINE_AA)


def _keyframes(frames: list[Frame], tracks: dict[int, list[TrackPoint]], out_dir: Path) -> list[Keyframe]:
    """고른 프레임을 저장하고 번호 상자를 그린다. 번호는 차마다 모든 프레임에서 같다."""
    if not frames:
        return []
    frames = sorted(frames, key=lambda f: f.t)
    height = cv2.imread(str(frames[0].path)).shape[0]
    tracks = drop_hood(tracks, height)
    numbers: dict[int, int] = {}
    result = []
    for i, f in enumerate(frames):
        raw_path, annotated_path = out_dir / f"{i:02d}_raw.jpg", out_dir / f"{i:02d}_annotated.jpg"
        shutil.copyfile(f.path, raw_path)
        img = cv2.imread(str(raw_path))
        h, w = img.shape[:2]
        boxes = {tid: b for tid, ps in tracks.items() if (b := _box_at(ps, f.t)) is not None}
        lines = []
        for tid, box in sorted(boxes.items(), key=lambda kv: kv[1][0]):
            n = numbers.setdefault(tid, len(numbers) + 1)
            _draw(img, box, n)
            x1, y1, x2, y2 = (min(max(v, 0.0), 1.0) for v in (box[0] / w, box[1] / h, box[2] / w, box[3] / h))
            lines.append(f"#{n} {tracks[tid][0].cls} track={tid} box=({x1:.3f}, {y1:.3f}, {x2:.3f}, {y2:.3f})")
        cv2.imwrite(str(annotated_path), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        result.append(Keyframe(f.t, raw_path, annotated_path, "\n".join(lines)))
    return result


def select_keyframes(video: Path, candidates: list[Candidate], tracks: dict[int, list[TrackPoint]],
                     out_dir: Path, max_frames: int = 12) -> list[Keyframe]:
    """후보마다 앞 3초, 뒤 2초를 초당 15장으로 뽑고 0.5초 칸마다 가장 선명한 프레임을 고른다."""
    out_dir.mkdir(parents=True, exist_ok=True)
    duration = probe(video).duration
    ordered = sorted(candidates, key=lambda c: -c.score)
    with TemporaryDirectory(dir=out_dir) as tmp:
        pools = []
        for i, c in enumerate(ordered):
            start, end = max(0.0, c.t - BEFORE_S), min(duration, c.t + AFTER_S)
            pools.append(_sharpest_per_bin(extract_frames(video, FOCUS_FPS, Path(tmp) / str(i), start, end),
                                           start, BIN_S))
        chosen: dict[float, Frame] = {}
        for c, pool, k in zip(ordered, pools, _quotas([len(p) for p in pools], max_frames)):
            # 창이 겹치면 이미 고른 칸은 건너뛴다.
            fresh = [f for f in pool if f.t not in chosen]
            chosen.update((f.t, f) for f in _spaced(fresh, k, c.t))
        return _keyframes(list(chosen.values()), tracks, out_dir)


def dense_keyframes(video: Path, t: float, tracks: dict[int, list[TrackPoint]], out_dir: Path) -> list[Keyframe]:
    """t 앞뒤를 빠짐없이 뽑는다. 선명도로 고르면 충격으로 흔들린 프레임이 빠지는데 그 프레임이 증거다."""
    out_dir.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=out_dir) as tmp:
        frames = extract_frames(video, DENSE_FPS, Path(tmp), max(0.0, t - DENSE_S), min(probe(video).duration, t + DENSE_S))
        return _keyframes(frames, tracks, out_dir)


def uniform_keyframes(video: Path, tracks: dict[int, list[TrackPoint]], out_dir: Path,
                      count: int = 12) -> list[Keyframe]:
    """후보가 없을 때: 영상을 count칸으로 나눠 칸마다 가장 선명한 프레임을 고른다."""
    out_dir.mkdir(parents=True, exist_ok=True)
    duration = probe(video).duration
    fps = min(30, max(1, math.ceil(2 * count / duration)))  # 칸마다 후보가 두 장은 있게 한다.
    with TemporaryDirectory(dir=out_dir) as tmp:
        frames = extract_frames(video, fps, Path(tmp))
        return _keyframes(_sharpest_per_bin(frames, 0.0, duration / count), tracks, out_dir)
