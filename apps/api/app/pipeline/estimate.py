"""관찰이 접촉을 못 봤을 때 센서 신호로 촬영 차의 충돌을 추정한다."""
from dataclasses import dataclass

from app.pipeline.locate import ALIGN_S, Candidate
from app.report import Evidence

# 초안 정답 기준, tuned 분할(eval/results/20261108T101312Z-tuning.md). 세 신호 같은 값으로 0.4~0.9를 0.05 간격으로 훑었다.
# 무사고 7개 추정 0은 0.4~0.9 모두 지킨다. 0.4면 시각이 틀린 추정(AQAX 6.2초, 정답 9.6초)이 켜지고 0.55부터는 1초 이내 추정이 하나 준다.
STRONG = {"motion": 0.45, "audio": 0.45, "decel": 0.45}
SENSOR_TEXT = {"audio": "충돌음이 크게 남", "motion": "화면이 크게 흔들림", "decel": "앞차와의 거리가 급히 좁혀진 뒤 멈춤"}


@dataclass
class Estimate:
    t: float
    facts: list[Evidence]


def _strong(c: Candidate) -> dict[str, float] | None:
    """흔들림과 소리가 둘 다 강하고 ALIGN_S 안에 모여야 발동한다. 급정지는 아차사고(내 급제동)에서도 흔들림과 함께
    커지므로 발동 조건이 되지 못하고, 같은 범위에서 강하면 근거 사실로만 덧붙인다."""
    hits = {k: c.peaks[k] for k, v in STRONG.items() if c.signals.get(k, 0.0) >= v and c.peaks.get(k) is not None}
    core = {k: hits[k] for k in ("motion", "audio") if k in hits}
    if len(core) < 2 or round(abs(core["motion"] - core["audio"]), 6) > ALIGN_S:
        return None
    if "decel" in hits and round(max(*core.values(), hits["decel"]) - min(*core.values(), hits["decel"]), 6) <= ALIGN_S:
        core["decel"] = hits["decel"]
    return core


def estimate_collision(candidates: list[Candidate]) -> Estimate | None:
    scored = [(sum(c.signals[k] for k in hits), hits) for c in candidates if (hits := _strong(c))]
    if not scored:
        return None
    hits = max(scored, key=lambda s: s[0])[1]
    # 흔들림과 소리는 접촉 뒤에 온다. 가장 이른 신호 시각을 충돌 시각으로 둔다.
    facts = sorted((Evidence(t=t, text=SENSOR_TEXT[k]) for k, t in hits.items()), key=lambda e: e.t)
    return Estimate(t=facts[0].t, facts=facts)
