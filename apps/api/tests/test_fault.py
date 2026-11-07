import json

import pytest

from app.fault import Chart, FaultTable, Modifier, calculate

# 차43-2 형태의 합성 도표: A 기본 30. 수정요소 수치는 계산 규칙만 검증한다.
CHART = Chart(
    id="t", title="t", situation="t", base_a=30, source="https://example.test", scene="lane_change",
    modifiers=[
        Modifier(id="a1", label="A 현저", party="A", delta=10),
        Modifier(id="a2", label="A 감경", party="A", delta=-10),
        Modifier(id="b1", label="B 신호", party="B", delta=10),
        Modifier(id="b2", label="B 중대", party="B", delta=20),
    ],
)


def mid(r):
    return (r.my_min + r.my_max) / 2


def test_applied_modifiers_change_point():
    r = calculate(CHART, "A", ["a1"], [])
    assert (r.base, r.my_min, r.my_max) == (30, 35, 45)
    assert [(s.id, s.effect) for s in r.steps] == [("a1", 10)]


def test_opponent_modifier_reduces_my_fault():
    r = calculate(CHART, "A", ["b1"], [])
    assert mid(r) == 20
    assert r.steps[0].effect == -10
    assert calculate(CHART, "A", ["a2"], []).steps[0].effect == -10


def test_unknown_widens_range_only():
    r = calculate(CHART, "A", [], ["a1", "b2"])  # +10, -20 : 각자 밀어내는 쪽으로만 넓힌다
    assert (r.my_min, r.my_max) == (10, 40)
    assert r.steps == []
    r2 = calculate(CHART, "A", [], ["a1"])
    assert (r2.my_min, r2.my_max) == (30, 40)


def test_range_has_min_width_10():
    r = calculate(CHART, "A", [], [])
    assert (r.my_min, r.my_max) == (25, 35)


def test_range_clamped_to_0_100():
    low = calculate(CHART, "A", ["b2", "b1"], [])  # 30-30=0
    assert (low.my_min, low.my_max) == (0, 10)
    high = calculate(CHART, "B", ["b2", "b1"], [])  # 70+30=100
    assert (high.my_min, high.my_max) == (90, 100)


def test_me_b_uses_inverse_base():
    r = calculate(CHART, "B", [], [])
    assert r.base == 70 and (r.my_min, r.my_max) == (65, 75)


def test_duplicate_modifier_counted_once():
    assert calculate(CHART, "A", ["a1", "a1"], ["a1"]) == calculate(CHART, "A", ["a1"], [])


def test_unknown_modifier_id_rejected():
    with pytest.raises(ValueError):
        calculate(CHART, "A", ["nope"], [])


def test_every_chart_has_source_and_scene():
    t = FaultTable.load()
    assert len(t.charts) >= 8
    for c in t.charts:
        assert c.source.startswith("https://accident.knia.or.kr/")
        assert c.scene
        assert t.get(c.id) is c


def test_shortlist_other_returns_all():
    t = FaultTable.load()
    assert t.shortlist("other") == t.charts


def test_shortlist_filters_by_scene_and_falls_back_to_all():
    t = FaultTable.load()
    assert {c.id for c in t.shortlist("rear_end")} == {"차41-1"}
    assert t.shortlist("pedestrian") == t.charts  # 해당 도표가 없으면 전부


def test_load_rejects_chart_without_scene(tmp_path):
    charts = tmp_path / "c.json"
    charts.write_text(json.dumps([{"id": "x", "title": "", "situation": "", "base_a": 50,
                                   "modifiers": [], "source": "s"}]))
    scenes = tmp_path / "s.json"
    scenes.write_text("{}")
    with pytest.raises(ValueError):
        FaultTable.load(charts, scenes)


def chart43_2():
    return FaultTable.load().get("차43-2")  # a1/a2 = A 현저/중대(10/20), b6/b7 = B 현저/중대(10/20)


def test_exclusive_both_applied_counts_larger_only():
    r = calculate(chart43_2(), "A", ["a1", "a2"], [])
    assert [(s.id, s.effect) for s in r.steps] == [("a2", 20)]
    assert (r.my_min, r.my_max) == (45, 55)  # 30+20=50, 최소 폭 10
    r = calculate(chart43_2(), "A", ["b6", "b7"], [])
    assert [(s.id, s.effect) for s in r.steps] == [("b7", -20)]


def test_exclusive_both_unknown_widens_by_larger_only():
    r = calculate(chart43_2(), "A", [], ["a1", "a2"])
    assert (r.my_min, r.my_max) == (30, 50)  # +30이 아니라 +20
    r = calculate(chart43_2(), "A", [], ["b6", "b7"])
    assert (r.my_min, r.my_max) == (10, 30)


def test_exclusive_applied_plus_unknown_widens_by_difference():
    r = calculate(chart43_2(), "A", ["a1"], ["a2"])
    assert [s.id for s in r.steps] == [("a1")]
    assert (r.my_min, r.my_max) == (40, 50)  # 점 40, 불확실은 차이 10만큼
    r = calculate(chart43_2(), "A", ["a2"], ["a1"])
    assert (r.my_min, r.my_max) == (45, 55)  # 이미 적용된 쪽이 더 크면 넓히지 않는다
