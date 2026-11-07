from pathlib import Path

import cv2
import numpy as np
import pytest

from app.errors import PipelineError
from app.fault import FaultTable, calculate
from app.pipeline.assess import AssessOut, Cite, Pick, SeriousPick, assess, has_fault_number
from app.pipeline.focus import Keyframe
from app.pipeline.locate import Candidate
from app.pipeline.observe import Fact, Observation, observe, outside_windows, recheck_time
from app.pipeline.scan import TrackPoint
from app.report import SeriousViolation
from tests.fixtures.fake_llm import FakeLLM

TABLE = FaultTable.load()
DURATION = 20.0
FRAMES = [Keyframe(10 + i * 0.5, Path("r"), Path("a"), "") for i in range(9)]  # 10.0 ~ 14.0초


def obs(**kw) -> Observation:
    base = dict(involvement="party", reason=None, scene="lane_change", road="편도 2차로", ego_action="직진",
                other_action="우측에서 차로 변경", signal=None, collision_t=12.0, suspect_t=None,
                facts=[Fact(t=11.0, text="우측 차가 내 차로로 들어온다"), Fact(t=12.0, text="두 차가 접촉한다"),
                       Fact(t=12.5, text="상대 차가 멈춘다")],
                unseen=["방향지시등"])
    return Observation(**{**base, **kw})


def out(**kw) -> AssessOut:
    base = dict(accident_type="차로 변경 접촉", summary="우측 차가 끼어들어 접촉했다.", severity="low", severity_fact=1, timeline=[0, 1],
                chart_id="차43-2", chart_facts=[0, 1], me="A", applied=[], unknown=[], serious=[], favorable=[], unfavorable=[],
                actions_now=["사진을 찍는다"], actions_later=["보험사에 알린다"])
    return AssessOut(**{**base, **kw})


def run(o, *responses, frames=FRAMES):
    llm = FakeLLM(*responses)
    return assess(o, frames, TABLE, llm, DURATION), llm


def test_none_returns_reason_only():
    r, llm = run(obs(involvement="none", reason="충돌이 보이지 않습니다", collision_t=None))
    assert r.involvement == "none" and r.reason == "충돌이 보이지 않습니다" and r.confidence == "low"
    assert r.summary is None and r.accident_type is None and r.fault is None and r.fault_note is None
    assert r.timeline == r.facts == r.unseen == r.actions_now == r.serious_violations == []
    assert llm.seen == []  # 판단 모델을 부르지 않는다.


def test_witness_has_no_fault():
    picked = out(applied=[Pick(id="b3", fact=1)], favorable=[Cite(fact=1, text="유리")],
                 serious=[SeriousPick(item="신호위반", likelihood="high", party="other", fact=1)])
    r, _ = run(obs(involvement="witness"), picked)
    assert r.involvement == "witness" and r.fault is None and r.fault_note is None
    assert r.summary and r.facts and r.collision_t == 12.0
    assert r.favorable == r.unfavorable == r.serious_violations == []


def test_party_uses_calculated_range_not_model_number():
    r, _ = run(obs(), out(applied=[Pick(id="b3", fact=0)]))
    want = calculate(TABLE.get("차43-2"), "A", ["b3"], [])
    assert (r.fault.base, r.fault.my_min, r.fault.my_max) == (want.base, want.my_min, want.my_max)
    assert r.fault.steps[0].delta == -10 and r.fault.steps[0].evidence.t == 11.0
    assert r.fault.source_url == TABLE.get("차43-2").source and r.fault.chart_title
    numeric = {n for n, f in AssessOut.model_fields.items() if "int" in str(f.annotation) and n not in ("timeline", "chart_facts", "severity_fact")}
    assert numeric == set()  # 모델은 사실 번호 말고 숫자를 낼 수 없다.


def test_model_is_not_shown_fault_numbers():
    _, llm = run(obs(), out())
    text = str(llm.seen[0][0])
    assert "차43-2" in text and "delta" not in text and "base_a" not in text
    assert "input_image" not in text  # 판단은 관찰 결과만 받는다.


def test_unknown_chart_id_retries_once_then_fails():
    with pytest.raises(PipelineError) as e:
        run(obs(), out(chart_id="없는도표"), out(chart_id="없는도표"))
    assert e.value.code == "MODEL_INVALID"


def test_unknown_chart_id_repair_mentions_error_and_recovers():
    r, llm = run(obs(), out(chart_id="없는도표"), out())
    assert r.fault.chart_id == "차43-2" and "없는도표" in llm.seen[1][2]


def test_chart_outside_shortlist_is_rejected():
    # 차41-1은 있는 도표지만 차로 변경 장면의 후보가 아니다.
    r, llm = run(obs(), out(chart_id="차41-1"), out())
    assert r.fault.chart_id == "차43-2" and len(llm.seen) == 2


def test_chart_without_side_is_rejected():
    r, llm = run(obs(), out(me=None), out())
    assert r.fault.me == "A" and len(llm.seen) == 2


def test_no_matching_chart_sets_fault_note():
    r, _ = run(obs(), out(chart_id=None, me=None, chart_facts=[]))
    assert r.fault is None and r.fault_note == "기준 도표를 찾지 못했습니다."
    assert r.summary and r.collision_t == 12.0


def test_unknown_modifier_is_removed():
    r, _ = run(obs(), out(applied=[Pick(id="zz", fact=0), Pick(id="b3", fact=0)], unknown=["yy"]))
    assert [s.label for s in r.fault.steps] == ["상대 진로변경 신호불이행·지연"] and r.fault.unknown == []


def test_modifier_without_evidence_widens_instead_of_applying():
    r, _ = run(obs(), out(applied=[Pick(id="b3", fact=None)]))
    assert r.fault.steps == [] and r.fault.unknown == ["상대 진로변경 신호불이행·지연"]
    assert r.fault.my_min == 20 and r.fault.my_max == 30


def test_evidence_time_outside_video_is_removed():
    facts = [Fact(t=999.0, text="영상 밖"), Fact(t=-1.0, text="음수"), Fact(t=12.0, text="접촉"), Fact(t=12.5, text="멈춤")]
    r, llm = run(obs(facts=facts), out(applied=[Pick(id="b3", fact=0)], favorable=[Cite(fact=5, text="없는 번호")]))
    assert r.favorable == [] and [f.t for f in r.facts] == [12.0, 12.5]
    assert "영상 밖" not in str(llm.seen[0][0])


def test_fact_far_from_any_shown_frame_is_removed():
    r, _ = run(obs(facts=[Fact(t=2.0, text="보여 주지 않은 시각"), Fact(t=12.0, text="접촉")]), out(timeline=[0], chart_facts=[0], severity_fact=0))
    assert [f.t for f in r.facts] == [12.0]


def test_claim_without_evidence_time_is_removed():
    r, _ = run(obs(), out(favorable=[Cite(fact=None, text="근거 없음"), Cite(fact=1, text="상대가 끼어듦")],
                          unfavorable=[Cite(fact=7, text="없는 번호")], timeline=[1, 99, None]))
    assert r.favorable == ["상대가 끼어듦 (12.0초)"] and r.unfavorable == []
    assert [e.t for e in r.timeline] == [12.0]


def test_drunk_driving_without_evidence_is_unknown():
    r, _ = run(obs(), out(serious=[SeriousPick(item="음주운전", likelihood="high", party="me", fact=None),
                                   SeriousPick(item="신호위반", likelihood="medium", party="other", fact=None),
                                   SeriousPick(item="중앙선 침범", likelihood="high", party="other", fact=1)]))
    got = {s.item: (s.likelihood, s.evidence.t if s.evidence else None) for s in r.serious_violations}
    assert got == {"음주운전": ("unknown", None), "신호위반": ("unknown", None), "중앙선 침범": ("high", 12.0)}


def test_drunk_driving_cannot_be_seen_even_with_a_cited_fact():
    r, _ = run(obs(), out(serious=[SeriousPick(item="음주운전", likelihood="high", party="me", fact=1),
                                   SeriousPick(item="무면허운전", likelihood="low", party="me", fact=1),
                                   SeriousPick(item="제한속도 20km/h 초과", likelihood="high", party="other", fact=1)]))
    assert {s.likelihood for s in r.serious_violations} == {"unknown"}
    assert all(s.evidence is None for s in r.serious_violations)


def test_three_cited_facts_with_a_chart_is_high():
    r, _ = run(obs(), out(timeline=[0, 1, 2]))
    assert r.confidence == "high" and r.collision_t == 12.0


def test_confidence_counts_cited_facts_not_all_facts():
    r, _ = run(obs(), out(timeline=[0], chart_facts=[0], severity_fact=None))
    assert r.confidence == "medium" and len(r.facts) == 3


def test_party_without_chart_is_at_most_medium():
    r, _ = run(obs(), out(chart_id=None, me=None, chart_facts=[], timeline=[0, 1, 2]))
    assert r.confidence == "medium"


def test_witness_can_be_high_without_chart():
    r, _ = run(obs(involvement="witness"), out(chart_id=None, me=None, chart_facts=[], timeline=[0, 1, 2]))
    assert r.confidence == "high"


def test_severity_without_cited_fact_is_dropped():
    r, _ = run(obs(), out(severity="high", severity_fact=None))
    assert r.severity is None
    r, _ = run(obs(), out(severity="high", severity_fact=9))
    assert r.severity is None
    r, _ = run(obs(), out(severity="high", severity_fact=1))
    assert r.severity == "high"


def test_chart_without_supporting_fact_gives_no_range():
    for facts in ([], [9]):
        r, _ = run(obs(), out(chart_facts=facts))
        assert r.fault is None and r.fault_note == "기준 도표를 찾지 못했습니다."


def test_prompt_lists_other_chart_titles_without_details():
    _, llm = run(obs(), out())
    text = str(llm.seen[0][0])
    assert TABLE.get("차41-1").title in text and TABLE.get("차41-1").situation not in text


def test_chart_from_other_scene_can_be_chosen_after_seeing_details():
    r, llm = run(obs(), out(chart_id="차41-1"), out(chart_id="차41-1"))
    assert r.fault.chart_id == "차41-1"
    assert TABLE.get("차41-1").situation in llm.seen[1][2] and "base_a" not in llm.seen[1][2]


def test_me_repair_allows_returning_to_null():
    r, llm = run(obs(), out(me=None), out(chart_id=None, me=None, chart_facts=[]))
    assert "null" in llm.seen[1][2] and r.fault is None


@pytest.mark.parametrize("field", ["summary", "accident_type"])
@pytest.mark.parametrize("text", ["내 과실은 30%입니다", "과실 70 : 30으로 보입니다"])
def test_fault_numbers_in_text_are_rerequested(field, text):
    r, llm = run(obs(), out(**{field: text}), out())
    assert len(llm.seen) == 2 and text not in str(r.model_dump())


def test_fault_numbers_in_advice_and_claims_fail_after_one_retry():
    bad = out(actions_later=["상대 과실 80%를 주장한다"], favorable=[Cite(fact=1, text="20:80")])
    with pytest.raises(PipelineError):
        run(obs(), bad, bad)


def test_timeline_is_sorted_and_unique():
    r, _ = run(obs(), out(timeline=[2, 0, 2, 1, 0]))
    assert [e.t for e in r.timeline] == [11.0, 12.0, 12.5]


def test_unconfirmed_collision_returns_none_without_asking():
    for involvement in ("party", "witness"):
        r, llm = run(obs(involvement=involvement, collision_t=None))
        assert r.involvement == "none" and r.reason and llm.seen == []
        assert r.confidence == "low" and r.fault is None and r.summary is None


def test_collision_time_without_a_fact_there_is_not_confirmed():
    r, llm = run(obs(collision_t=13.9, facts=[Fact(t=10.0, text="차가 지나간다")]))
    assert r.involvement == "none" and llm.seen == []


def test_collision_time_past_the_end_is_not_confirmed_even_with_a_fact_nearby():
    frames = [Keyframe(19.5, Path("r"), Path("a"), "")]
    r, llm = run(obs(collision_t=20.5, facts=[Fact(t=19.8, text="접촉")]), frames=frames)
    assert r.involvement == "none" and llm.seen == []


def test_party_without_any_grounded_fact_becomes_none():
    r, llm = run(obs(facts=[Fact(t=999.0, text="영상 밖")]))
    assert r.involvement == "none" and r.reason and r.fault is None and llm.seen == []


# ---- observe ----

@pytest.fixture
def frames(tmp_path):
    p = tmp_path / "f.jpg"
    cv2.imwrite(str(p), np.full((90, 160, 3), 128, np.uint8))
    return [Keyframe(float(t), p, p, f"#1 car track=3 box=(0.1, 0.1, 0.2, 0.2) at {t}") for t in range(2, 14)]


def _texts(messages) -> str:
    return str([c.get("text") if isinstance(c, dict) else c for m in messages for c in
                (m["content"] if isinstance(m["content"], list) else [m["content"]])])


def _images(messages) -> list:
    return [c for m in messages if isinstance(m["content"], list) for c in m["content"] if c["type"] == "input_image"]


TRACKS = {3: [TrackPoint(2.0, (0, 0, 1, 1), "car", 0.9)]}


def test_observe_gives_frame_times_boxes_and_candidate_scores(frames):
    llm = FakeLLM(obs())
    cands = [Candidate(5.0, 0.81, {}), Candidate(11.0, 0.42, {})]
    assert observe(frames, cands, TRACKS, llm) == obs()
    text = _texts(llm.seen[0][0])
    assert "t=2.00" in text and "t=13.00" in text and "track=3" in text
    assert "5.00" in text and "0.81" in text and "0.42" in text


def test_observe_sends_every_annotated_frame_and_four_raw_closest_to_top_candidate(frames):
    llm = FakeLLM(obs())
    observe(frames, [Candidate(11.0, 0.9, {}), Candidate(3.0, 0.4, {})], TRACKS, llm)
    assert len(_images(llm.seen[0][0])) == 12 + 4
    text = _texts(llm.seen[0][0])
    raw = [t for t in range(2, 14) if f"원본 t={t:.2f}" in text]
    assert len(raw) == 4 and all(abs(t - 11) <= 2 for t in raw)


def test_observe_without_candidates_spreads_raw_frames(frames):
    llm = FakeLLM(obs())
    observe(frames, [], TRACKS, llm)
    text = _texts(llm.seen[0][0])
    raw = [t for t in range(2, 14) if f"원본 t={t:.2f}" in text]
    assert len(raw) == 4 and raw[-1] - raw[0] >= 6


def test_observe_prompt_forbids_judgement_and_warns_about_false_candidates(frames):
    llm = FakeLLM(obs())
    observe(frames, [Candidate(5.0, 0.8, {})], TRACKS, llm)
    system = llm.seen[0][0][0]["content"]
    assert "판단" in system and "오탐" in system and "null" in system


def test_observe_warns_when_tracking_found_nothing(frames):
    llm = FakeLLM(obs())
    observe(frames, [], {}, llm)
    assert "추적된 물체가 없" in _texts(llm.seen[0][0])


def test_observation_can_say_no_collision_is_visible():
    assert obs(involvement="none", collision_t=None, reason="접촉 없음").collision_t is None


def test_outside_windows_uses_focus_window():
    c = [Candidate(10.0, 0.5, {})]
    assert not outside_windows(7.0, c) and not outside_windows(12.0, c)
    assert outside_windows(6.9, c) and outside_windows(12.1, c)
    assert outside_windows(5.0, [])


def test_recheck_time_rules():
    c = [Candidate(10.0, 0.5, {})]
    assert recheck_time(obs(collision_t=11.0), c, DURATION) is None  # 창 안에서 이미 봤다.
    assert recheck_time(obs(collision_t=15.0), c, DURATION) == 15.0
    assert recheck_time(obs(collision_t=None, suspect_t=11.0), c, DURATION) == 11.0  # 창 안이어도 못 봤으면 다시 본다.
    assert recheck_time(obs(collision_t=None, suspect_t=None), c, DURATION) is None
    assert recheck_time(obs(collision_t=None, suspect_t=99.0), c, DURATION) is None
    assert recheck_time(obs(collision_t=99.0), c, DURATION) is None  # 영상 밖 시각으로 프레임을 뽑지 않는다.


def test_serious_violation_states_whose_it_is():
    r, _ = run(obs(), out(serious=[SeriousPick(item="중앙선 침범", likelihood="high", party="other", fact=1)]))
    assert r.serious_violations[0].party == "other"


def test_serious_violation_without_evidence_has_unknown_party():
    r, _ = run(obs(), out(serious=[SeriousPick(item="중앙선 침범", likelihood="high", party="me", fact=None),
                                   SeriousPick(item="음주운전", likelihood="high", party="me", fact=1)]))
    assert {s.party for s in r.serious_violations} == {"unknown"}


def test_stored_report_without_party_still_loads():
    assert SeriousViolation(item="신호위반", likelihood="low", evidence=None).party == "unknown"


@pytest.mark.parametrize("text", ["14:07에 충돌했습니다", "오후 2:30 사고", "영상 표시 시각 09:05:33", "0:14 지점"])
def test_clock_times_are_not_fault_numbers(text):
    assert not has_fault_number(text)


@pytest.mark.parametrize("text", ["과실 70:30입니다", "7:3으로 보입니다", "3 : 7", "100:0", "내 과실 20%", "20 : 80", "45:55"])
def test_fault_numbers_are_still_rejected(text):
    assert has_fault_number(text)
