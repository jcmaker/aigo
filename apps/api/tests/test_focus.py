import re

import cv2
import numpy as np
import pytest

from app.pipeline.focus import dense_keyframes, select_keyframes, uniform_keyframes
from app.pipeline.locate import Candidate
from app.pipeline.scan import TrackPoint
from tests.fixtures import make_clips as mk

W, H = 320, 180


@pytest.fixture(scope="module")
def clip(tmp_path_factory):
    return mk.testsrc(tmp_path_factory.mktemp("focus") / "c.mp4", seconds=10, rate=30, audio=False)


def _cand(t, score=0.8):
    return Candidate(t, score, {"box": 1.0, "motion": 0.0, "audio": 0.0})


def _track(box, cls="car", end=10):
    return [TrackPoint(i * 0.2, box, cls, 0.9) for i in range(int(end * 5) + 1)]


def test_keyframes_cover_3s_before_and_2s_after(clip, tmp_path):
    got = select_keyframes(clip, [_cand(5)], {}, tmp_path)
    ts = [k.t for k in got]
    assert len(got) == 10  # 5초 창의 0.5초 칸마다 한 장
    assert ts == sorted(ts)
    assert 2.0 <= ts[0] < 2.5 and 6.5 <= ts[-1] < 7.0


def test_keyframes_clamped_to_video_bounds(clip, tmp_path):
    head = select_keyframes(clip, [_cand(1)], {}, tmp_path / "h")
    tail = select_keyframes(clip, [_cand(9.5)], {}, tmp_path / "t")
    assert len(head) == 6 and head[0].t >= 0
    assert len(tail) == 7 and tail[-1].t < 10


def test_sharpest_frame_chosen_per_bin(tmp_path):
    # 0.5초 칸마다 한 프레임(n % 15 == 4인 짝수 프레임)만 선명하고 나머지는 흐리다.
    src = mk.testsrc(tmp_path / "b.mp4", seconds=8, rate=30, audio=False, size="640x360",
                     extra_vf="gblur=sigma=12:enable='not(eq(mod(n\\,30)\\,4)+eq(mod(n\\,30)\\,20))'")
    got = select_keyframes(src, [_cand(4)], {}, tmp_path / "o")
    assert len(got) == 10
    for k in got:
        assert round(k.t * 30) % 30 in (4, 20)


def test_frames_split_across_candidates_in_score_order(clip, tmp_path):
    got = select_keyframes(clip, [_cand(2, 0.9), _cand(7, 0.6)], {}, tmp_path, max_frames=7)
    assert len(got) == 7
    assert sum(k.t < 4 for k in got) == 4  # 남는 한 장은 점수가 높은 후보에 간다.
    # 적은 장수로도 후보 시각 바로 곁의 프레임은 꼭 들어간다.
    assert any(abs(k.t - 7) < 0.5 for k in got) and any(abs(k.t - 2) < 0.5 for k in got)


def test_overlapping_candidates_do_not_repeat_frames(clip, tmp_path):
    got = select_keyframes(clip, [_cand(5, 0.9), _cand(7, 0.7)], {}, tmp_path)
    ts = [k.t for k in got]
    assert len(set(ts)) == len(ts) == 12


def test_annotated_box_numbers_match_text(clip, tmp_path):
    tracks = {17: _track((40, 30, 120, 90)), 3: _track((180, 60, 300, 170), "truck")}
    got = select_keyframes(clip, [_cand(5)], tracks, tmp_path)
    numbers = {}
    for k in got:
        raw, ann = cv2.imread(str(k.raw_path)), cv2.imread(str(k.annotated_path))
        assert raw.shape[:2] == (H, W) and ann.shape == raw.shape
        lines = k.boxes_text.splitlines()
        assert len(lines) == 2
        for line in lines:
            m = re.fullmatch(r"#(\d+) (\w+) track=(\d+) box=\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)", line)
            n, cls, tid = int(m[1]), m[2], int(m[3])
            assert numbers.setdefault(tid, n) == n  # 같은 차는 모든 프레임에서 같은 번호다.
            assert cls == {17: "car", 3: "truck"}[tid]
            x1, y1, x2, y2 = (float(m[i]) for i in range(4, 8))
            # 글의 좌표가 가리키는 자리에 실제로 상자가 그려졌다.
            top = np.abs(ann[round(y1 * H), round(x1 * W) + 2:round(x2 * W) - 2].astype(int)
                         - raw[round(y1 * H), round(x1 * W) + 2:round(x2 * W) - 2]).sum(axis=1)
            assert (top > 60).mean() > 0.8
    assert sorted(numbers.values()) == [1, 2]


def test_boxes_follow_interpolated_time(clip, tmp_path):
    # 키프레임은 15fps라 스캔 시각(5fps) 사이에 온다. 상자는 그 사이로 보간한다.
    track = [TrackPoint(i * 0.2, (10 + i * 2.0, 20, 60 + i * 2.0, 70), "car", 0.9) for i in range(51)]
    for k in select_keyframes(clip, [_cand(5)], {1: track}, tmp_path):
        x1 = float(re.search(r"box=\(([\d.]+)", k.boxes_text)[1]) * W
        assert abs(x1 - (10 + k.t * 10)) < 0.5


def test_number_stays_with_track_when_others_appear(clip, tmp_path):
    # 왼쪽에 새 차가 나타나 프레임 안 순서가 밀려도 기존 차의 번호는 그대로다.
    tracks = {5: _track((200, 40, 280, 100)), 6: [p for p in _track((10, 40, 60, 100)) if p.t >= 5]}
    got = select_keyframes(clip, [_cand(5)], tracks, tmp_path)
    assert all("#1 car track=5" in k.boxes_text for k in got)
    assert "#2 car track=6" in got[-1].boxes_text


def test_track_absent_at_frame_time_is_not_drawn(clip, tmp_path):
    tracks = {1: [p for p in _track((40, 30, 120, 90)) if 3 <= p.t <= 4]}
    got = select_keyframes(clip, [_cand(5)], tracks, tmp_path)
    assert all(("track=1" in k.boxes_text) == (2.9 <= k.t <= 4.1) for k in got)


def test_track_gap_is_not_interpolated(clip, tmp_path):
    tracks = {1: [p for p in _track((40, 30, 120, 90)) if p.t < 3.1 or p.t > 5.9]}
    got = select_keyframes(clip, [_cand(5)], tracks, tmp_path)
    assert all(("track=1" in k.boxes_text) == (k.t <= 3.01 or k.t >= 5.99) for k in got)


def test_ego_hood_not_annotated(clip, tmp_path):
    tracks = {1: _track((20, 140, 300, H)), 2: _track((100, 40, 160, 90))}
    got = select_keyframes(clip, [_cand(5)], tracks, tmp_path)
    assert all("track=1" not in k.boxes_text and "track=2" in k.boxes_text for k in got)


def test_uniform_keyframes_span_video(clip, tmp_path):
    got = uniform_keyframes(clip, {7: _track((40, 30, 120, 90))}, tmp_path)
    assert len(got) == 12
    edges = [10 * i / 12 for i in range(13)]
    for k, lo, hi in zip(got, edges, edges[1:]):
        assert lo - 1e-5 <= k.t < hi
        assert "track=7" in k.boxes_text and k.raw_path.exists() and k.annotated_path.exists()


def test_uniform_keyframes_on_short_clip(tmp_path):
    src = mk.testsrc(tmp_path / "s.mp4", seconds=0.5, rate=30, audio=False)
    got = uniform_keyframes(src, {}, tmp_path / "o")
    assert 1 <= len(got) <= 12
    assert all(k.boxes_text == "" for k in got)


def test_boxes_text_coordinates_are_clamped(clip, tmp_path):
    tracks = {1: _track((-32.0, -18.0, 352.0, 90.0))}
    got = select_keyframes(clip, [_cand(5)], tracks, tmp_path)
    assert all("box=(0.000, 0.000, 1.000, 0.500)" in k.boxes_text for k in got)


def test_dense_keyframes_keep_every_step_around_the_time(clip, tmp_path):
    got = dense_keyframes(clip, 5.0, {}, tmp_path)
    assert [round(k.t, 1) for k in got] == [round(3.5 + i * 0.2, 1) for i in range(15)]
    assert [k.t for k in dense_keyframes(clip, 0.2, {}, tmp_path / "h")][0] == 0
    assert dense_keyframes(clip, 9.8, {}, tmp_path / "t")[-1].t < 10
