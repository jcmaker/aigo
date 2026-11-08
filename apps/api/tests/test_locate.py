import math

import numpy as np
import pytest

from app.pipeline.locate import OFF_PATH_RISK, SHORT_TRACK_POINTS, STEP_S, _decel, drop_hood, find_candidates, pick_candidates
from app.pipeline.scan import TrackPoint

W, H = 1920, 1080
AREA = W * H
DUR = 20.0


def _times(start, end):
    return [round(start + i * 0.2, 6) for i in range(int(round((end - start) / 0.2)) + 1)]


def _track(start, end, box_at, cls="car"):
    """box_at(u)는 u(0~1)에서의 상자를 준다."""
    ts = _times(start, end)
    return [TrackPoint(t, box_at(i / max(len(ts) - 1, 1)), cls, 0.8) for i, t in enumerate(ts)]


def _approach(cx=W / 2, cy=H * 0.6, small=60, big=700):
    """화면 가운데에서 가파르게 커지는 앞차. 크기는 끝에 몰린다(거리에 반비례)."""
    def box(u):
        s = small + (big - small) * u ** 3
        return (cx - s / 2, cy - s * 0.4, cx + s / 2, cy + s * 0.4)
    return box


def _still(x1=800, y1=500, x2=1100, y2=750):
    return lambda u: (x1, y1, x2, y2)


def _motion(spikes=(), base=4.0, end=DUR):
    """주행 중 잔잔한 흔들림(약간의 변동) 위에 spikes[t] = 값을 얹는다."""
    out = []
    for i, t in enumerate(_times(0.2, end)):
        v = base + (0.3 if i % 2 else -0.3) + (0.2 if i % 3 == 0 else 0)
        for st, sv in spikes:
            if abs(t - st) < 0.01:
                v = sv
        out.append((t, v))
    return out


def _audio(spikes=(), base=0.01, end=DUR):
    """조용한 바탕 위의 짧은 소리. hop 0.1초."""
    out = []
    for i in range(int(end * 10)):
        t = round(i * 0.1, 6)
        v = base * (1.2 if i % 2 else 0.8)
        for st, sv in spikes:
            if abs(t - st) < 0.15:
                v = sv
        out.append((t, v))
    return out


def test_box_expansion_finds_collision():
    tracks = {1: _track(4, 8, _approach())}
    got = find_candidates(tracks, AREA, _motion(), None)
    assert len(got) == 1
    assert abs(got[0].t - 8) <= 0.6
    assert got[0].signals["box"] > 0.5


def test_camera_shake_finds_offscreen_collision():
    # 차가 화면 밖에서 부딪혔다: 상자 신호 없이 화면이 크게 흔들리고 충돌음이 난다.
    got = find_candidates({}, AREA, _motion([(9.8, 25), (10.0, 35), (10.2, 28)]), _audio([(10.0, 0.5)]))
    assert len(got) == 1
    assert abs(got[0].t - 10) <= 0.4
    assert got[0].signals["box"] == 0


def test_camera_shake_alone_finds_offscreen_collision():
    got = find_candidates({}, AREA, _motion([(9.8, 25), (10.0, 35), (10.2, 28)]), None)
    assert len(got) == 1 and abs(got[0].t - 10) <= 0.4


def _leaving_track():
    # 실제 클립 AA8U의 트랙: 충돌 직전 화면 아래로 벗어나 트랙이 끊긴다. 이후 상자는 없다.
    boxes = [(1001, 528, 1138, 599), (1017, 534, 1167, 612), (1031, 541, 1208, 633), (1048, 546, 1254, 652),
             (1056, 528, 1315, 661), (1064, 502, 1389, 669), (1068, 504, 1483, 718), (1048, 519, 1601, 805)]
    return [TrackPoint(round(12.2 + i * 0.2, 6), b, "car", 0.8) for i, b in enumerate(boxes)]


# 상자만(0.49)이면 점수 0.27로 MIN_SCORE 0.3에 못 미친다. 살리려면 MIN_SCORE를 0.25로 내려야 하는데,
# 그러면 사고 후보(1초 이내) 재현율이 17/18에서 16/18로 준다(Task 7a 조정 보고서, 초안 정답 기준).
# 실제 AA8U는 충돌음이 더해져 후보로 잡힌다.
@pytest.mark.xfail(strict=True, reason="상자 단독 후보는 Task 7 가중치에서 포기(사고 후보 17/18 우선)")
def test_car_leaving_frame_finds_collision():
    got = find_candidates({1: _leaving_track()}, AREA, _motion(), None)
    assert got and abs(got[0].t - 13.6) <= 0.6


def test_car_leaving_frame_keeps_box_signal():
    debug: dict = {}
    find_candidates({1: _leaving_track()}, AREA, _motion(), None, debug=debug)
    box = np.array(debug["box"])
    # 단독 점수(0.27)는 MIN_SCORE 아래다. 상자 신호가 남는지만 본다.
    assert box.max() > 0.4 and abs(int(np.argmax(box)) * STEP_S - 13.6) <= 0.6


def test_audio_spike_adds_score():
    tracks = {1: _track(4, 8, _approach())}
    plain = find_candidates(tracks, AREA, _motion(), _audio())
    loud = find_candidates(tracks, AREA, _motion(), _audio([(7.9, 0.5)]))
    assert loud[0].signals["audio"] > 0.5
    assert loud[0].score > plain[0].score


def test_audio_none_still_works():
    tracks = {1: _track(4, 8, _approach())}
    with_none = find_candidates(tracks, AREA, _motion(), None)
    assert with_none and with_none[0].signals["audio"] == 0


def test_continuous_music_drops_audio_signal():
    # 음악은 중앙값이 최대값의 35%를 넘는다. 소리만으로는 후보가 생기지 않는다.
    music = [(round(i * 0.1, 6), 0.3 + 0.25 * abs(math.sin(i * 0.4))) for i in range(200)]
    tracks = {1: _track(4, 8, _approach())}
    got = find_candidates(tracks, AREA, _motion(), music)
    assert len(got) == 1 and abs(got[0].t - 8) <= 0.6
    assert got[0].signals["audio"] == 0
    # 음악을 뺐으면 소리 없는 경우와 같은 점수다.
    assert got[0].score == find_candidates(tracks, AREA, _motion(), None)[0].score


def test_nearby_peaks_are_merged_within_2s():
    tracks = {1: _track(4, 8, _approach()), 2: _track(5.5, 9.4, _approach(cx=700))}
    got = find_candidates(tracks, AREA, _motion(), None)
    assert len(got) == 1


def test_returns_at_most_three():
    tracks = {i: _track(t - 3, t, _approach()) for i, t in enumerate((4, 8, 12, 16, 19.6))}
    got = find_candidates(tracks, AREA, _motion(), None)
    assert len(got) == 3
    assert got == sorted(got, key=lambda c: -c.score)
    assert all(abs(a.t - b.t) > 2 for i, a in enumerate(got) for b in got[i + 1:])


def test_quiet_video_returns_no_candidates():
    tracks = {1: _track(0, DUR, _still()), 2: _track(3, 9, _approach(big=90))}
    assert find_candidates(tracks, AREA, _motion(), _audio()) == []
    assert find_candidates({}, AREA, [], None) == []


def test_parked_large_vehicle_does_not_dominate():
    # 화면을 크게 차지하지만 거의 자라지 않는 버스보다, 실제로 빠르게 다가오는 차가 앞선다.
    def bus(u):
        return (300 - 30 * u, 200 - 15 * u, 1100 + 30 * u, 900 + 15 * u)
    got = find_candidates({1: _track(0, DUR, bus, "bus"), 2: _track(10, 14, _approach())},
                          AREA, _motion(), None)
    assert len(got) == 1 and abs(got[0].t - 14) <= 0.6


def test_far_small_growth_is_not_a_collision():
    # 멀리 있는 작은 차는 비율로는 두 배가 되어도 가깝지 않다.
    got = find_candidates({1: _track(5, 6, _approach(small=20, big=60))}, AREA, _motion(), None)
    assert got == []


def _hood(u):
    k = 8 * (u * 10 % 1)  # 진동으로 미세하게 흔들리는 상자
    return (0 - k, 700 - k, 1300 + k, H - 15)


def test_ego_hood_is_ignored():
    # 자기 차 보닛이 차로 잡혔다. 영상 전체든 몇 초 조각이든 후보가 되지 않는다.
    assert find_candidates({1: _track(0, DUR, _hood)}, AREA, _motion(), None) == []
    assert find_candidates({1: _track(6, 9.4, _hood), 2: _track(14, 19, _hood)}, AREA, _motion(), None) == []


def test_close_car_at_bottom_edge_is_not_hood():
    # 바짝 붙어 아래변에 닿은 진짜 차는 상자가 움직인다.
    def car(u):
        return (300 + 500 * u, 300 - 200 * u, 1200 + 700 * u, H)
    kept = drop_hood({1: _track(10, 13, car), 2: _track(0, 5, _hood)}, H)
    assert set(kept) == {1}


def test_short_low_confidence_track_is_ignored():
    # 건물이나 끝부분의 보닛이 잠깐 차로 잡힌 경우(실제 클립 GA4b, AAQW). 진짜 끼어들기는 신뢰도가 높다.
    def flash(conf):
        return {1: [TrackPoint(t, (100, 56, 1500, 1000), "truck", conf) for t in (9.0, 9.2, 9.4)]}
    assert find_candidates(flash(0.38), AREA, _motion(), None) == []
    assert find_candidates(flash(0.8), AREA, _motion(), None)


def test_clip_start_is_not_a_candidate():
    # 첫 프레임의 페이드인과 처음부터 가까이 있던 차는 충돌이 아니다.
    tracks = {1: _track(0.2, 6, _still(300, 200, 1500, 1000))}
    assert find_candidates(tracks, AREA, _motion([(0.2, 138)]), None) == []


def _road_noise():
    return [(round(i * 0.1, 6), 0.07 + (0.1 if 99 <= i <= 101 else 0.0005 * (i % 3))) for i in range(200)]


def test_steady_road_noise_impact_finds_collision():
    got = find_candidates({1: _track(6, 10, _approach(big=420))}, AREA, _motion(), _road_noise())
    assert got[0].signals["audio"] > 0.5


def test_steady_road_noise_keeps_impact_sound():
    # 주행 소음은 중앙값이 높아도 음악이 아니다. 그 위의 충격음은 살린다(실제 클립 GA4b).
    debug: dict = {}
    find_candidates({1: _track(6, 10, _approach(big=420))}, AREA, _motion(), _road_noise(), debug=debug)
    audio = np.array(debug["audio"])
    assert audio.max() > 0.5 and abs(int(np.argmax(audio)) * STEP_S - 10.0) <= 0.4


def test_silent_audio_track_counts_as_no_audio():
    # 실제 클립의 무음 트랙: 거의 0이고 아주 작은 잡음만 튄다(CQkN 최대 0.00026).
    silent = [(round(i * 0.1, 6), 0.00026 if i == 50 else 0.00002) for i in range(200)]
    tracks = {1: _track(4, 8, _approach())}
    assert find_candidates(tracks, AREA, _motion(), silent) == find_candidates(tracks, AREA, _motion(), None)


def test_aspect_sets_the_lane():
    # 세로 영상에서 가운데 차를 옆 차로 오해하지 않는다.
    w, h = 1080, 1920
    tracks = {1: _track(4, 8, _approach(cx=w / 2, cy=h / 2))}
    assert find_candidates(tracks, w * h, _motion(), None, aspect=w / h)


def _stop_at(cx, stop=5.0, w=800):
    """아래변이 매 0.2초 일정하게 내려오며 커지다가(접근) stop에서 크기 변화가 멈추는 앞차."""
    def box(t):
        k = min(t, stop) - 3.0
        s = w + 60 * k
        return (cx - s / 2, 500 - 10 * k, cx + s / 2, 700 + 30 * k)
    return [TrackPoint(t, box(t), "car", 0.8) for t in _times(3.0, 7.0)]


def _n():
    return round(DUR / STEP_S) + 1


def test_decel_peaks_when_lead_car_stops():
    d = _decel({1: _stop_at(W / 2)}, W, H, _n())
    assert d.max() > 0
    assert 4.8 <= int(np.argmax(d)) * STEP_S <= 5.4


def test_decel_zero_without_tracks_or_short_track():
    assert not _decel({}, W, H, _n()).any()
    short = [p for p in _stop_at(W / 2) if 4.4 <= p.t <= 5.6][:SHORT_TRACK_POINTS - 1]
    assert not _decel({1: short}, W, H, _n()).any()


def test_off_path_car_stop_ignored():
    # 같은 크기 상자다. 화면 왼쪽 밖으로 걸친 차는 진행 경로와 겹치지 않아 OFF_PATH_RISK 비율만 남는다.
    on = _decel({1: _stop_at(W / 2, w=900)}, W, H, _n()).max()
    off = _decel({1: _stop_at(-100, w=900)}, W, H, _n()).max()
    assert 0 < off < on
    assert off == pytest.approx(OFF_PATH_RISK * on)


def test_candidate_records_signal_peaks():
    got = find_candidates({}, AREA, _motion([(5.0, 30)]), _audio([(5.1, 0.5)]))
    assert got and abs(got[0].t - 5.0) <= 0.4
    assert got[0].peaks["motion"] == 5.0 and got[0].peaks["audio"] == 5.0
    assert got[0].peaks["box"] is None and got[0].peaks["decel"] is None


def test_signal_peak_is_original_time_not_candidate_time():
    # 소리 한 점이 5.4에 있다. 후보는 흔들림 쪽 5.0이지만 소리 시각은 번지기 전 원래 정점 5.4다.
    audio = [(t, 0.5 if abs(t - 5.4) < 0.01 else v) for t, v in _audio()]
    got = find_candidates({}, AREA, _motion([(5.0, 30)]), audio)
    assert got[0].t == 5.0
    assert got[0].peaks["motion"] == 5.0 and got[0].peaks["audio"] == 5.4


def test_debug_series_includes_decel():
    debug: dict = {}
    find_candidates({1: _stop_at(W / 2)}, AREA, _motion(), None, debug=debug)
    assert "decel" in debug


def test_decel_same_time_points_do_not_divide_by_zero():
    track = _stop_at(W / 2)
    assert _decel({1: track[:5] + [track[4]] + track[5:]}, W, H, _n()).max() > 0


def test_raw_debug_reproduces_candidates():
    # 임계값 조정은 저장한 원래 배열로 후보를 다시 고른다. 영상을 다시 돌린 것과 같아야 한다.
    debug: dict = {}
    got = find_candidates({1: _track(4, 8, _approach())}, AREA, _motion([(10.0, 35)]), _audio([(10.0, 0.5)]), debug=debug)
    assert pick_candidates(debug["raw"]) == got
