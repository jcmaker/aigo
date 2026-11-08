import pytest

from app.pipeline.media import extract_frames, normalize
from app.pipeline.scan import _model, scan
from tests.fixtures import make_clips as mk


def _blank_frames(tmp_path, seconds=2):
    src = tmp_path / "b.mp4"
    mk._ff("-f", "lavfi", "-i", f"color=c=gray:size=320x240:rate=30:duration={seconds}", "-pix_fmt", "yuv420p", str(src))
    normalize(src, tmp_path / "a.mp4", tmp_path / "p.mp4", 120)
    return extract_frames(tmp_path / "a.mp4", 5, tmp_path / "f")


@pytest.mark.model  # 실제 YOLO 모델을 로드한다(첫 실행 시 가중치 다운로드).
def test_scan_returns_empty_tracks_for_blank_video(tmp_path):
    frames = _blank_frames(tmp_path)
    result = scan(frames)
    assert result.tracks == {}
    assert len(result.motion) == len(frames) - 1
    assert all(m == 0 for _, m in result.motion)


@pytest.mark.model
def test_consecutive_scans_start_fresh(tmp_path):
    frames = _blank_frames(tmp_path)  # 10장
    scan(frames)
    scan(frames[:3])
    # 트래커가 새로 만들어졌다면 프레임 번호가 3이다(이어졌다면 13).
    assert _model().predictor.trackers[0].frame_id == 3


@pytest.mark.model
def test_single_frame_clip(tmp_path):
    result = scan(_blank_frames(tmp_path, seconds=0.1))
    assert result.tracks == {} and result.motion == []
