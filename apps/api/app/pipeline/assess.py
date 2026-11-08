import json
import re
from typing import Literal

from pydantic import BaseModel

from app.fault import Chart, FaultTable, calculate
from app.llm import InvalidOutput, ask
from app.pipeline.estimate import Estimate
from app.pipeline.focus import Keyframe
from app.pipeline.locate import ALIGN_S
from app.pipeline.observe import NEAR_FRAME_S, Fact, Observation, near_frame
from app.report import Evidence, FaultAssessment, FaultStep, Report, SeriousViolation, confidence

NO_ACCIDENT = "영상에서 사고를 확인하지 못했습니다."
NO_EVIDENCE = "영상에서 근거 시각이 있는 사실을 확인하지 못했습니다."
NO_CHART = "기준 도표를 찾지 못했습니다."
NO_COLLISION = "영상에서 충돌 순간을 확인하지 못했습니다."
ESTIMATE_PREFIX = "충돌 추정: "
SENSOR_ONLY = ESTIMATE_PREFIX + "센서 신호로 충돌을 추정했지만 영상에서 접촉 장면은 확인하지 못했습니다."
NO_CONTACT = "영상에서 접촉 장면을 확인하지 못해 과실비율을 내지 않았습니다."
PERCENT = re.compile(r"\d+\s*%")
PAIR = re.compile(r"(\d+)\s*:\s*(\d+)")
SeriousItem = Literal[
    "신호위반", "중앙선 침범", "제한속도 20km/h 초과", "앞지르기·끼어들기 위반", "철길건널목 통과 위반", "횡단보도 보행자 보호 위반",
    "무면허운전", "음주운전", "보도 침범", "승객 추락 방지 위반", "어린이보호구역 위반", "화물 고정 위반",
]
UNSEEABLE = ("무면허운전", "음주운전", "제한속도 20km/h 초과")  # 영상으로 확인할 수 없어 근거가 있어도 unknown이다.



def has_fault_number(text: str) -> bool:
    """과실 숫자는 코드만 낸다. 합이 100인 두 수는 시각이 될 수 없어서(시 23 이하, 분 59 이하) 14:07 같은 시각만 통과한다."""
    if PERCENT.search(text):
        return True
    return any(not (len(m) == 2 and int(h) < 24 and int(m) < 60) for h, m in PAIR.findall(text))


PROMPT = """너는 교통사고 관찰 기록을 기준 도표에 맞추는 분석가다. 입력은 관찰 기록과 후보 도표뿐이다. 한국어로 쓴다.

원칙
- 번호가 붙은 사실만 쓴다. 사실에 없는 내용은 어떤 칸에도 쓰지 않는다. 그럴듯한 추측도 안 된다.
- 과실 비율이나 퍼센트, 법정 기한, 금액 같은 숫자를 쓰지 않는다. 숫자는 코드가 계산한다.
- 근거를 적는 칸(fact)에는 그 주장을 직접 뒷받침하는 사실 번호를 쓴다. 그런 사실이 없으면 null이다.

작성
- chart_id: 도표의 situation을 사실과 하나씩 비교한다. 진행 방향, 누가 어디서 어떻게 움직였는지 중 하나라도 사실과 어긋나면 그 도표는 버린다. 비슷해 보인다고 고르지 않는다. 맞는 도표가 없으면 null이다. 도표를 내지 않는 것은 정상 결과다.
- charts는 관찰의 장면 분류로 고른 후보이고 분류는 틀릴 수 있다. other_charts는 나머지 도표의 제목이다. 제목이 사실에 더 맞으면 chart_id에 그 id를 적어라. 상세를 보여 주고 다시 묻는다.
- chart_facts: 고른 도표의 상황을 직접 보여 주는 사실 번호들이다. 도표를 고르지 않으면 빈 목록이다.
- me: 고른 도표에서 촬영 차가 A인지 B인지 적는다. 도표를 고르지 않으면 null이다.
- applied: 사실이 직접 보여 주는 수정요소 id와 사실 번호다.
- unknown: 결과에 영향을 줄 수 있지만 영상으로 판단할 수 없는 수정요소 id다. 사실이 해당 없음을 보여 주면 적지 않는다.
- serious: 12대 중과실 중 이 사고와 관련 있어 보이는 항목만 적는다. likelihood high는 그 사실이 위반 자체를 직접 보여 줄 때만 쓴다. 가까이 있었다, 접근했다 정도면 low나 unknown이다. 음주, 무면허, 속도는 영상으로 알 수 없으니 unknown이다. party는 그 위반을 한 쪽이다. 촬영 차는 me, 상대는 other, 사실로 정할 수 없으면 unknown이다.
- severity, severity_fact: 사실에 보이는 파손과 충격으로 고르고 그 사실 번호를 적는다. 그런 사실이 없으면 둘 다 null이다.
- timeline: 사고 흐름을 보여 주는 사실 번호를 시간순으로 적는다.
- favorable, unfavorable: 촬영 차 운전자에게 유리하거나 불리한 점이다.
- actions_now, actions_later: 일반적인 대응 안내다. 부상 여부처럼 사실에 없는 상황을 있다고 쓰지 않는다. 사용자가 읽는 글이므로 도표 후보, 사실 번호 같은 입력 구조 이야기는 쓰지 않는다.
"""


class Pick(BaseModel):
    id: str
    fact: int | None


class Cite(BaseModel):
    fact: int | None
    text: str


class SeriousPick(BaseModel):
    item: SeriousItem
    likelihood: Literal["high", "medium", "low", "unknown"]
    party: Literal["me", "other", "unknown"]
    fact: int | None


class AssessOut(BaseModel):
    """모델은 사실 번호로만 근거를 댄다. 시각과 근거 문장은 코드가 관찰 기록에서 가져오고 숫자는 코드가 낸다."""
    accident_type: str | None
    summary: str
    severity: Literal["low", "medium", "high"] | None
    severity_fact: int | None
    timeline: list[int | None]
    chart_id: str | None
    chart_facts: list[int]
    me: Literal["A", "B"] | None
    applied: list[Pick]
    unknown: list[str]
    serious: list[SeriousPick]
    favorable: list[Cite]
    unfavorable: list[Cite]
    actions_now: list[str]
    actions_later: list[str]


def _none(reason: str) -> Report:
    return Report(involvement="none", reason=reason, accident_type=None, summary=None, collision_t=None,
                  confidence="low", severity=None, timeline=[], facts=[], unseen=[], fault=None, fault_note=None,
                  serious_violations=[], favorable=[], unfavorable=[], actions_now=[], actions_later=[])


def _chart_view(c: Chart) -> dict:
    # 기본과실과 증감 숫자는 보여 주지 않는다. 모델이 결과를 맞춰 고르지 못하게 한다.
    return {"id": c.id, "title": c.title, "situation": c.situation,
            "modifiers": [{"id": m.id, "party": m.party, "label": m.label} for m in c.modifiers]}


def _messages(o: Observation, facts: list[Fact], collision_t: float, charts: list[Chart], others: list[Chart]) -> list[dict]:
    record = {"involvement": o.involvement, "scene": o.scene, "road": o.road, "ego_action": o.ego_action,
              "other_action": o.other_action, "signal": o.signal, "collision_t": collision_t, "unseen": o.unseen,
              "facts": [{"fact": i, "t": f.t, "text": f.text} for i, f in enumerate(facts)]}
    text = json.dumps({"observation": record, "charts": [_chart_view(c) for c in charts],
                       "other_charts": [{"id": c.id, "title": c.title} for c in others]}, ensure_ascii=False)
    return [{"role": "system", "content": PROMPT}, {"role": "user", "content": text}]


def _fault(chart: Chart, out: AssessOut, cite) -> FaultAssessment:
    mods = {m.id: m for m in chart.modifiers}
    picks = {p.id: cite(p.fact) for p in out.applied if p.id in mods}
    backed = {i: e for i, e in picks.items() if e}
    # 근거 없이 적용했다고 한 수정요소는 버리지 않고 범위를 넓히는 unknown으로 돌린다.
    unknown = [i for i in out.unknown if i in mods] + [i for i, e in picks.items() if not e]
    res = calculate(chart, out.me, list(backed), unknown)

    def name(i: str) -> str:
        return f"{'내' if mods[i].party == out.me else '상대'} {mods[i].label}"

    return FaultAssessment(
        chart_id=chart.id, chart_title=chart.title, source_url=chart.source, me=out.me, base=res.base,
        my_min=res.my_min, my_max=res.my_max,
        steps=[FaultStep(label=name(s.id), delta=s.effect, evidence=backed[s.id]) for s in res.steps],
        unknown=[name(i) for i in dict.fromkeys(unknown) if i not in backed],
        laws=chart.laws, cases=chart.cases)


def _unconfirmed(o: Observation, facts: list[Fact], duration: float) -> str | None:
    """충돌 시각은 영상 안이고 그 곁에 프레임에서 본 사실이 있어야 확인된 것이다. 확인이 안 됐으면 그 이유."""
    if o.involvement == "none":
        return o.reason or NO_ACCIDENT
    if not facts:
        return NO_EVIDENCE
    t = o.collision_t
    if t is None or not 0 <= t <= duration or not any(abs(f.t - t) <= NEAR_FRAME_S for f in facts):
        return NO_COLLISION
    return None


def _sensor_only(o: Observation, estimate: Estimate) -> Report:
    # 프레임 사실이 없으니 판단 모델에 줄 것이 없다. 센서 사실만으로 추정을 보인다.
    return Report(involvement="party", reason=None, accident_type=None, summary=SENSOR_ONLY, collision_t=estimate.t,
                  confidence="low", severity=None, timeline=list(estimate.facts), facts=[], unseen=o.unseen, fault=None,
                  fault_note=NO_CONTACT, serious_violations=[], favorable=[], unfavorable=[], actions_now=[], actions_later=[])


def assess(observation: Observation, keyframes: list[Keyframe], table: FaultTable, llm, duration: float,
           estimate: Estimate | None = None) -> Report:
    o = observation
    facts = sorted((f for f in o.facts if 0 <= f.t <= duration and near_frame(f.t, keyframes)), key=lambda f: f.t)
    collision_t = o.collision_t
    reason = _unconfirmed(o, facts, duration)
    if reason and (estimate is None or o.involvement == "witness"):  # 남의 사고를 당사자로 바꾸지 않는다.
        return _none(reason)
    if reason:
        # 센서 추정: 흔들림이 필수라 촬영 차가 당사자다. 충돌 시각 곁 사실 검사는 발동 조건이 대신한다.
        # 추정 시각 곁에 프레임 사실이 없으면 모델이 볼 장면이 없으니 부르지 않는다.
        if not any(abs(f.t - estimate.t) <= ALIGN_S + NEAR_FRAME_S for f in facts):
            return _sensor_only(o, estimate)
        o, collision_t = o.model_copy(update={"involvement": "party"}), estimate.t
    party = o.involvement == "party"
    # 추정 경로에서 장면을 분류하지 못했으면(other) 도표를 맞출 근거가 없어 과실을 내지 않는다.
    chartable = party and not (reason and o.scene == "other")
    charts = table.shortlist(o.scene) if chartable else []
    others = [c for c in table.charts if c not in charts] if chartable else []

    def check(out: AssessOut) -> None:
        texts = [out.accident_type or "", out.summary, *out.actions_now, *out.actions_later,
                 *(c.text for c in out.favorable + out.unfavorable)]
        if any(has_fault_number(t) for t in texts):
            raise InvalidOutput("글에 과실 비율이나 퍼센트, 대비 숫자를 쓰지 마라.")
        if not chartable or out.chart_id is None:
            return
        if out.chart_id not in {c.id for c in charts}:
            extra = next((c for c in others if c.id == out.chart_id), None)
            if extra is None:
                raise InvalidOutput(f"{out.chart_id}는 없는 도표다. 있는 도표에서 고르거나 chart_id와 me를 null로 답하라.")
            charts.append(extra)  # 다음 답에서 고를 수 있다.
            raise InvalidOutput(f"{extra.id} 상세: {json.dumps(_chart_view(extra), ensure_ascii=False)}\n"
                                "상황을 사실과 비교해 어긋남이 없으면 이 도표로 수정요소까지 답하고, 아니면 다른 도표나 null로 답하라.")
        if out.me is None:
            raise InvalidOutput("도표가 맞으면 me에 A나 B를 적고, 촬영 차가 어느 쪽인지 정할 수 없으면 chart_id와 me를 null로 답하라.")

    out = ask(llm, _messages(o, facts, collision_t, charts, others), AssessOut, check)
    cited: set[int] = set()

    def cite(i: int | None) -> Evidence | None:
        if i is None or not 0 <= i < len(facts):
            return None
        cited.add(i)
        return facts[i]

    def claims(items: list[Cite]) -> list[str]:
        return [f"{c.text} ({e.t:.1f}초)" for c in items if (e := cite(c.fact))] if party else []

    def serious(p: SeriousPick) -> SeriousViolation:
        e = None if p.item in UNSEEABLE else cite(p.fact)
        return SeriousViolation(item=p.item, likelihood=p.likelihood if e else "unknown", evidence=e,
                                party=p.party if e else "unknown")

    supported = chartable and out.chart_id is not None and any([cite(i) for i in out.chart_facts])
    fault = _fault(table.get(out.chart_id), out, cite) if supported else None
    timeline = [e for i in sorted({i for i in out.timeline if i is not None}) if (e := cite(i))]
    violations = [serious(p) for p in out.serious] if party else []
    favorable, unfavorable = claims(out.favorable), claims(out.unfavorable)
    severity = out.severity if cite(out.severity_fact) else None
    level = confidence(True, len(cited), len(fault.unknown) if fault else 0)
    if party and not fault and level == "high":  # 충돌은 확인했어도 과실 판단이 없는 레포트다.
        level = "medium"
    summary = out.summary
    if reason:  # 센서 사실은 모델에 넣지 않고 여기서 타임라인에만 붙인다.
        summary, level = ESTIMATE_PREFIX + summary, "low"
        timeline = sorted({(e.t, e.text): e for e in timeline + estimate.facts}.values(), key=lambda e: e.t)
    return Report(
        involvement=o.involvement, reason=None, accident_type=out.accident_type, summary=summary,
        collision_t=collision_t, confidence=level, severity=severity, timeline=timeline, facts=facts, unseen=o.unseen,
        fault=fault, fault_note=NO_CHART if party and not fault else None, serious_violations=violations,
        favorable=favorable, unfavorable=unfavorable, actions_now=out.actions_now, actions_later=out.actions_later)
