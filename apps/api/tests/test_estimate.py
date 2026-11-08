from app.pipeline.estimate import estimate_collision
from app.pipeline.locate import Candidate


def c(t, motion=0.0, audio=0.0, decel=0.0, peaks=None):
    return Candidate(t, 0.5, {"box": 0.0, "motion": motion, "audio": audio, "decel": decel},
                     peaks or {"box": None, "motion": t if motion else None, "audio": t if audio else None,
                               "decel": t if decel else None})


def test_shake_and_sound_estimates():
    e = estimate_collision([c(5.0, motion=0.9, audio=0.8)])
    assert e and e.t == 5.0 and {f.text for f in e.facts} == {"화면이 크게 흔들림", "충돌음이 크게 남"}


def test_shake_required():
    assert estimate_collision([c(5.0, audio=0.9, decel=0.9)]) is None


def test_single_signal_not_enough():
    assert estimate_collision([c(5.0, motion=0.95)]) is None


def test_signals_far_apart_not_aligned():
    assert estimate_collision([c(5.0, motion=0.9, audio=0.9, peaks={"box": None, "motion": 5.0, "audio": 6.5, "decel": None})]) is None


def test_shake_and_decel_without_sound_not_enough():
    # 내 급제동(아차사고)도 흔들림과 급정지가 함께 커진다. 발동은 흔들림 + 소리만.
    assert estimate_collision([c(5.0, motion=0.9, decel=0.9, peaks={"box": None, "motion": 5.2, "audio": None, "decel": 4.9})]) is None


def test_earliest_signal_time_is_collision_t():
    e = estimate_collision([c(5.0, motion=0.9, audio=0.9, decel=0.9,
                              peaks={"box": None, "motion": 5.2, "audio": 5.3, "decel": 4.9})])
    assert e.t == 4.9 and [f.t for f in e.facts] == [4.9, 5.2, 5.3]
    assert e.facts[0].text == "앞차와의 거리가 급히 좁혀진 뒤 멈춤"


def test_decel_outside_range_is_not_a_fact():
    e = estimate_collision([c(5.0, motion=0.9, audio=0.9, decel=0.9,
                              peaks={"box": None, "motion": 5.2, "audio": 5.3, "decel": 3.0})])
    assert e.t == 5.2 and {f.text for f in e.facts} == {"화면이 크게 흔들림", "충돌음이 크게 남"}


def test_strongest_candidate_wins():
    e = estimate_collision([c(3.0, motion=0.7, audio=0.7), c(8.0, motion=0.95, audio=0.9)])
    assert e.t == 8.0


def test_manual_candidate_without_peaks_is_ignored():
    assert estimate_collision([Candidate(5.0, 0.0, {})]) is None
