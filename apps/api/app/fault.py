"""과실 기준 도표와 결정적 과실 범위 계산. 숫자는 여기서만 나온다(LLM은 도표와 수정요소만 고른다)."""
import json
from pathlib import Path
from typing import Literal, get_args

from pydantic import BaseModel

SceneType = Literal[
    "signal_intersection", "unsignaled_intersection", "lane_change", "rear_end",
    "opposite_direction", "parking", "pedestrian", "other",
]
Party = Literal["A", "B"]
MIN_WIDTH = 10
DATA = Path(__file__).resolve().parent.parent / "data"


class Modifier(BaseModel):
    id: str
    label: str
    party: Party
    delta: int  # party 본인의 과실 증감(감경은 음수)


class Chart(BaseModel):
    id: str
    title: str
    situation: str
    base_a: int
    modifiers: list[Modifier]
    source: str
    scene: SceneType


class Step(BaseModel):
    id: str
    label: str
    effect: int  # 내 과실에 미치는 부호 있는 증감


class FaultResult(BaseModel):
    base: int
    my_min: int
    my_max: int
    steps: list[Step]


class FaultTable:
    def __init__(self, charts: list[Chart]):
        self.charts = charts
        self._by_id = {c.id: c for c in charts}

    @classmethod
    def load(cls, charts_path: Path = DATA / "fault_charts.json",
             scenes_path: Path = DATA / "chart_scenes.json") -> "FaultTable":
        raw = json.loads(Path(charts_path).read_text(encoding="utf-8"))
        scenes = json.loads(Path(scenes_path).read_text(encoding="utf-8"))
        for c in raw:
            if not c.get("source"):
                raise ValueError(f"{c['id']}: 출처 URL 없음")
            if c["id"] not in scenes:
                raise ValueError(f"{c['id']}: chart_scenes.json에 장면 유형 없음")
            if scenes[c["id"]] not in get_args(SceneType):
                raise ValueError(f"{c['id']}: 알 수 없는 장면 유형 {scenes[c['id']]}")
        return cls([Chart(**c, scene=scenes[c["id"]]) for c in raw])

    def get(self, chart_id: str) -> Chart:
        return self._by_id[chart_id]

    def shortlist(self, scene: SceneType) -> list[Chart]:
        """장면에 맞는 도표. 없거나 other면 전부 돌려줘 LLM이 '맞는 게 없음'도 고를 수 있게 한다."""
        hit = [c for c in self.charts if c.scene == scene]
        return hit if scene != "other" and hit else list(self.charts)


def calculate(chart: Chart, me: Party, applied_ids: list[str], unknown_ids: list[str]) -> FaultResult:
    mods = {m.id: m for m in chart.modifiers}
    base = chart.base_a if me == "A" else 100 - chart.base_a
    applied = list(dict.fromkeys(applied_ids))
    unknown = [i for i in dict.fromkeys(unknown_ids) if i not in applied]
    if bad := [i for i in applied + unknown if i not in mods]:
        raise ValueError(f"{chart.id}에 없는 수정요소: {bad}")

    def effect(i: str) -> int:  # 내 쪽 가감은 더하고, 상대 쪽 가감은 내 과실에서 뺀다
        m = mods[i]
        return m.delta if m.party == me else -m.delta

    def group(i: str) -> str:  # 현저한/중대한 과실은 당사자별로 둘 중 하나만 적용된다
        m = mods[i]
        return m.party if any(w in m.label for w in ("현저한 과실", "중대한 과실")) else i

    best: dict[str, str] = {}  # 그룹별로 효과가 큰 적용 수정요소만 남긴다
    for i in applied:
        if group(i) not in best or abs(effect(i)) > abs(effect(best[group(i)])):
            best[group(i)] = i
    applied = [i for i in applied if best[group(i)] == i]
    done = {g: abs(effect(i)) for g, i in best.items()}

    widen: dict[str, int] = {}  # 그룹별 불확실 수정요소 중 가장 큰 효과 (이미 적용된 만큼은 뺀다)
    for i in unknown:
        extra = abs(effect(i)) - done.get(group(i), 0)
        if extra > abs(widen.get(group(i), 0)):
            widen[group(i)] = extra if effect(i) > 0 else -extra

    steps = [Step(id=i, label=mods[i].label, effect=effect(i)) for i in applied]
    point = base + sum(s.effect for s in steps)
    lo = point + sum(e for e in widen.values() if e < 0)
    hi = point + sum(e for e in widen.values() if e > 0)
    lo, hi = max(lo, 0), min(hi, 100)
    short = MIN_WIDTH - (hi - lo)
    if short > 0:
        lo, hi = lo - short // 2, hi + short - short // 2
        if lo < 0:
            lo, hi = 0, hi - lo
        if hi > 100:
            lo, hi = lo - (hi - 100), 100
    return FaultResult(base=base, my_min=max(lo, 0), my_max=min(hi, 100), steps=steps)
