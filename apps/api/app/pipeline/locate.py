from dataclasses import dataclass

import numpy as np

from app.pipeline.scan import TrackPoint

# 평가로 조정하는 값. 바꾸면 사고영상 평가를 다시 돌린다.
WEIGHTS = {"box": 0.5, "motion": 0.3, "audio": 0.2}
MIN_SCORE = 0.3  # 0.5면 사고영상 29개 중 6개가 후보 없음이 된다. 오탐은 관찰 단계가 프레임을 보고 거른다.
MERGE_S = 2.0
STEP_S = 0.2  # 스캔 간격(초당 5장)
ALIGN_S = 0.4  # 상자 정점은 접촉보다 앞서고 흔들림과 소리는 뒤따른다: 이만큼 번지게 해서 합친다.
BASELINE_S = 2.0  # 모션과 소리는 이 길이의 이동 중앙값을 뺀 급변만 본다(회전, 가속은 완만하다).
SKIP_START_S = 0.8  # 페이드인과 처음 잡히는 트랙은 충돌이 아니고, 이보다 앞은 충돌 전 맥락도 없다.
MOTION_MAD_K = 10.0  # 중앙값에서 MAD의 이만큼 벗어나면 1.0
AUDIO_MAD_K = 15.0
BOX_MAD_K = 6.0
MOTION_MAD_FLOOR = 1.0  # 잔잔한 영상의 미세한 흔들림이 1.0이 되지 않게 하는 하한(160px 흑백 차이)
AUDIO_MAD_FLOOR = 0.01
BOX_MAD_FLOOR = 0.05
BOX_WINDOW_S = 0.6  # 이 구간에서 위험도가 얼마나 빨리 올랐나를 잰다.
SHORT_TRACK_POINTS = 5  # 이보다 짧으면서 신뢰도도 낮은 트랙은 건물이나 보닛 오탐이다. 진짜 끼어들기는 짧아도 신뢰도가 높다.
SHORT_TRACK_CONF = 0.5
LANE_HALF = 0.2  # 자기 차 진행 경로: 화면 가운데 좌우 20%
OFF_PATH_RISK = 0.3  # 경로 밖 차의 위험 비율. 옆 차선을 스치는 주차 차량은 커져도 위험이 낮다.
CLIPPED_HEIGHT_SCALE = 0.7  # 옆으로 잘린 상자의 크기를 높이로 어림할 때 쓰는 비율
HOOD_EDGE = 0.97  # 상자 아래변이 화면 높이의 이 비율보다 아래면 바닥에 붙은 것
HOOD_HUG_SHARE = 0.8  # 트랙의 이 비율 이상 바닥에 붙어 있어야 한다.
HOOD_MIN_S = 2.0
HOOD_STILL = 0.03  # 네 변의 표준편차가 화면 높이의 이 비율 이하면 멈춘 것(보닛 0.025 이하, 실제 근접 차 0.05 이상)
SILENCE_RMS = 0.005  # 최대값이 이보다 작으면 소리 없음
MUSIC_RATIO = 0.35  # ponytail: 소리 판별은 단순 휴리스틱, 평가에서 오탐이 나오면 스펙트럼 판별로 교체
MUSIC_LOUD_LEVEL = 0.7
MUSIC_LOUD_SHARE = 0.2  # 최대값의 MUSIC_LOUD_LEVEL을 넘는 시간이 이 비율을 넘어야 음악이다.
NOT_VEHICLE = {"traffic light"}
TIE_BREAK = 1e-3


@dataclass
class Candidate:
    t: float
    score: float
    signals: dict[str, float]


def _on_grid(samples, n: int) -> np.ndarray:
    g = np.zeros(n)
    for t, v in samples:
        i = min(round(t / STEP_S), n - 1)
        g[i] = max(g[i], v)
    return g


def _normalized(x: np.ndarray, k: float, floor: float) -> np.ndarray:
    med = np.median(x)
    mad = np.median(np.abs(x - med))
    return np.clip((x - med) / (k * max(mad, floor)), 0, 1)


def _sudden(x: np.ndarray) -> np.ndarray:
    """이동 중앙값을 뺀다. 지속되는 높은 값은 사라지고 짧은 급변만 남는다."""
    r = round(BASELINE_S / STEP_S)
    base = np.array([np.median(x[max(0, i - r):i + r + 1]) for i in range(len(x))])
    return np.maximum(x - base, 0)


def _spread(x: np.ndarray) -> np.ndarray:
    r = round(ALIGN_S / STEP_S)
    return np.array([x[max(0, i - r):i + r + 1].max() for i in range(len(x))])


def drop_hood(tracks: dict[int, list[TrackPoint]], height: float) -> dict[int, list[TrackPoint]]:
    """자기 차 보닛과 대시보드 오탐을 뺀다: 화면 아래변에 붙은 채 움직이지 않는 트랙.

    실제 영상에서 보닛은 영상 내내 하나로 잡히지 않고 수 초짜리 조각으로 나온다.
    그래서 영상 전체가 아니라 트랙마다 본다. 바짝 붙은 진짜 차는 상자가 움직여서 남는다.
    """
    def is_hood(ps: list[TrackPoint]) -> bool:
        boxes = np.array([p.box for p in ps])
        return (ps[-1].t - ps[0].t >= HOOD_MIN_S
                and np.mean(boxes[:, 3] >= HOOD_EDGE * height) >= HOOD_HUG_SHARE
                and boxes.std(axis=0).max() <= HOOD_STILL * height)
    return {i: ps for i, ps in tracks.items() if not is_hood(ps)}


def _risk(p: TrackPoint, width: float, height: float) -> float:
    """가까운 정도(화면 대비 크기) x 진행 경로와 겹친 정도. 옆으로 잘려도 높이가 크기를 지킨다."""
    x1, y1, x2, y2 = p.box
    size = max(np.sqrt((x2 - x1) * (y2 - y1) / (width * height)), (y2 - y1) / height * CLIPPED_HEIGHT_SCALE)
    lo, hi = width * (0.5 - LANE_HALF), width * (0.5 + LANE_HALF)
    on_path = max(0.0, min(x2, hi) - max(x1, lo)) / (hi - lo)
    return size * (OFF_PATH_RISK + (1 - OFF_PATH_RISK) * on_path)


def _box_rate(tracks, width: float, height: float, n: int) -> np.ndarray:
    """트랙마다 위험도의 상승 속도를 재고 시각별 최댓값을 낸다. 크기가 아니라 변화율이라 큰 주차 차량은 묻힌다."""
    out = np.zeros(n)
    for ps in tracks.values():
        if ps[0].cls in NOT_VEHICLE or (len(ps) < SHORT_TRACK_POINTS
                                        and np.mean([p.conf for p in ps]) < SHORT_TRACK_CONF):
            continue
        risk = [_risk(p, width, height) for p in ps]
        for i, p in enumerate(ps):
            # 끼어드는 차는 처음 잡힐 때 이미 가깝다: 첫 점의 앞은 위험 0으로 친다.
            before = [risk[j] for j in range(i) if p.t - ps[j].t <= BOX_WINDOW_S]
            if p.t - ps[0].t <= BOX_WINDOW_S:
                before.append(0.0)
            k = min(round(p.t / STEP_S), n - 1)
            if before:
                out[k] = max(out[k], (risk[i] - min(before)) / BOX_WINDOW_S)
    return out


def _audio_series(audio, n: int) -> np.ndarray | None:
    if not audio:
        return None
    env = np.array([v for _, v in audio])
    if env.max() < SILENCE_RMS:
        return None
    # 일정한 주행 소음도 중앙값은 높다. 그 위의 충격음은 살리고, 큰 소리가 계속 이어질 때만 음악으로 본다.
    if np.median(env) > MUSIC_RATIO * env.max() and np.mean(env > MUSIC_LOUD_LEVEL * env.max()) > MUSIC_LOUD_SHARE:
        return None
    return _normalized(_sudden(_on_grid(audio, n)), AUDIO_MAD_K, AUDIO_MAD_FLOOR)


def find_candidates(tracks, frame_area, motion, audio, max_candidates=3, aspect=16 / 9) -> list[Candidate]:
    """aspect는 화면 가로/세로 비율이다. 경로 판단과 보닛 판단에 쓴다."""
    ends = [t for t, _ in motion] + [p.t for ps in tracks.values() for p in ps] + [t for t, _ in audio or []]
    if not ends:
        return []
    n = round(max(ends) / STEP_S) + 1
    width = float(np.sqrt(frame_area * aspect))
    height = frame_area / width

    # ponytail: 편집으로 이어 붙인 영상의 장면 전환도 모션 급변으로 잡힌다. 오탐이 문제되면 장면 전환 판별을 넣는다.
    peaks = {"box": _normalized(_box_rate(drop_hood(tracks, height), width, height, n), BOX_MAD_K, BOX_MAD_FLOOR),
              "motion": _normalized(_sudden(_on_grid(motion, n)), MOTION_MAD_K, MOTION_MAD_FLOOR)}
    sound = _audio_series(audio, n)
    if sound is not None:
        peaks["audio"] = sound
    for v in peaks.values():
        v[:round(SKIP_START_S / STEP_S) + 1] = 0
    series = {k: _spread(v) for k, v in peaks.items()}

    total = sum(WEIGHTS[k] for k in series)
    score = sum(WEIGHTS[k] / total * v for k, v in series.items())

    picked: list[Candidate] = []
    # 번진 구간은 값이 평평하다. 원래 신호가 몰린 시각이 앞서도록 순서만 살짝 민다.
    for i in np.argsort(-(score + TIE_BREAK * sum(peaks.values())), kind="stable"):
        if score[i] < MIN_SCORE or len(picked) == max_candidates:
            break
        t = round(float(i) * STEP_S, 6)
        if all(abs(c.t - t) > MERGE_S for c in picked):
            signals = {k: round(float(series[k][i]) if k in series else 0.0, 3) for k in WEIGHTS}
            picked.append(Candidate(t, round(float(score[i]), 3), signals))
    return picked
