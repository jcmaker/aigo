"""레포트 형식과 신뢰도 규칙. API 프로세스도 쓰므로 무거운 라이브러리를 import하지 않는다."""
from typing import Literal

from pydantic import BaseModel

Confidence = Literal["high", "medium", "low"]


class Evidence(BaseModel):
    t: float
    text: str


class FaultStep(BaseModel):
    label: str
    delta: int  # 내 과실에 미치는 증감
    evidence: Evidence


class LawRef(BaseModel):
    name: str
    article: str
    title: str
    url: str


class CaseRef(BaseModel):
    court: str
    date: str
    number: str
    url: str


class FaultAssessment(BaseModel):
    chart_id: str
    chart_title: str
    source_url: str
    me: Literal["A", "B"]
    base: int
    my_min: int
    my_max: int
    steps: list[FaultStep]
    unknown: list[str]
    laws: list[LawRef] = []  # 이 칸이 없던 저장 레포트도 읽힌다.
    cases: list[CaseRef] = []


class SeriousViolation(BaseModel):
    item: str  # 12대 중과실 항목
    likelihood: Literal["high", "medium", "low", "unknown"]
    evidence: Evidence | None
    party: Literal["me", "other", "unknown"] = "unknown"  # 누구의 위반인지. 이 칸이 없던 저장 레포트도 읽힌다.


class Report(BaseModel):
    involvement: Literal["party", "witness", "none"]
    reason: str | None
    accident_type: str | None
    summary: str | None
    collision_t: float | None
    confidence: Confidence
    severity: Literal["low", "medium", "high"] | None
    timeline: list[Evidence]
    facts: list[Evidence]
    unseen: list[str]
    fault: FaultAssessment | None
    fault_note: str | None
    serious_violations: list[SeriousViolation]
    favorable: list[str]
    unfavorable: list[str]
    actions_now: list[str]
    actions_later: list[str]


def confidence(collision_found: bool, evidence_count: int, unknown_count: int) -> Confidence:
    """collision_found는 후보가 있다는 뜻이 아니라 관찰에서 프레임으로 확인했다는 뜻이다(후보는 오탐이 많다)."""
    if not collision_found:
        return "low"
    return "high" if evidence_count >= 3 and unknown_count <= 1 else "medium"
