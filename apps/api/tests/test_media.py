import subprocess

import cv2
import pytest

from app.pipeline.media import audio_envelope, extract_frames, normalize, probe
from app.pipeline.run import PipelineError
from tests.fixtures import make_clips as mk


def _stream(path, entries):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", f"stream={entries}",
         "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True).stdout.strip()
    return out.split(",")


def _norm(src, tmp_path, max_seconds=120):
    a, p = tmp_path / "a.mp4", tmp_path / "p.mp4"
    return normalize(src, a, p, max_seconds), a, p


def test_fake_mp4_raises_invalid_video(tmp_path):
    fake = tmp_path / "x.mp4"
    fake.write_text("not a video")
    with pytest.raises(PipelineError) as e:
        _norm(fake, tmp_path)
    assert e.value.code == "INVALID_VIDEO"


def test_over_limit_raises_video_too_long(tmp_path):
    src = mk.testsrc(tmp_path / "s.mp4", seconds=3)
    with pytest.raises(PipelineError) as e:
        _norm(src, tmp_path, max_seconds=1)
    assert e.value.code == "VIDEO_TOO_LONG"


def test_no_audio_is_supported(tmp_path):
    src = mk.testsrc(tmp_path / "s.mp4", audio=False)
    info, a, _ = _norm(src, tmp_path)
    assert info.has_audio is False
    assert audio_envelope(a) is None


def test_audio_envelope(tmp_path):
    info, a, _ = _norm(mk.testsrc(tmp_path / "s.mp4"), tmp_path)
    env = audio_envelope(a)
    assert info.has_audio and len(env) >= 15 and env[5][1] > 0.05


def test_vfr_becomes_30fps(tmp_path):
    _, a, _ = _norm(mk.vfr(tmp_path / "v.mp4"), tmp_path)
    assert _stream(a, "r_frame_rate,avg_frame_rate") == ["30/1", "30/1"]


def test_rotation_is_applied(tmp_path):
    info, a, _ = _norm(mk.rotated(tmp_path / "r.mp4"), tmp_path)
    assert (info.width, info.height) == (180, 320)
    assert _stream(a, "width,height")[:2] == ["180", "320"]


def test_portrait_keeps_aspect(tmp_path):
    src = mk.testsrc(tmp_path / "p.mp4", size="360x640", audio=False)
    info, _, p = _norm(src, tmp_path)
    assert (info.width, info.height) == (360, 640)
    assert _stream(p, "width,height")[:2] == ["360", "640"]


def test_playback_is_h264_720p_or_less(tmp_path):
    src = mk.testsrc(tmp_path / "4k.mp4", seconds=1, size="3840x2160", audio=False)
    info, a, p = _norm(src, tmp_path)
    assert (info.width, info.height) == (3840, 2160)  # 분석용은 원본 해상도
    codec, w, h = _stream(p, "codec_name,width,height")
    assert (codec, w, h) == ("h264", "1280", "720")


def test_frame_timestamps_are_exact(tmp_path):
    _, a, _ = _norm(mk.counter(tmp_path / "c.mp4"), tmp_path)
    for fps, start, end in [(30, 0, None), (5, 0, None), (15, 0.5, 1.5)]:
        out = tmp_path / f"f{fps}_{start}"
        frames = extract_frames(a, fps, out, start=start, end=end)
        assert frames
        for k, f in enumerate(frames):
            assert f.t == pytest.approx(start + k / fps, abs=1e-6)
            gray = cv2.imread(str(f.path), cv2.IMREAD_GRAYSCALE).mean()
            assert round((gray - 8) / 4) == round(f.t * 30), (fps, k, gray)


def test_audio_only_raises_invalid_video(tmp_path):
    src = tmp_path / "a.m4a"
    mk._ff("-f", "lavfi", "-i", "sine=duration=2", "-c:a", "aac", str(src))
    with pytest.raises(PipelineError) as e:
        _norm(src, tmp_path)
    assert e.value.code == "INVALID_VIDEO"


def test_clip_shorter_than_one_frame_interval(tmp_path):
    src = mk.testsrc(tmp_path / "tiny.mp4", seconds=0.1, rate=30, audio=False)
    info, a, _ = _norm(src, tmp_path)
    frames = extract_frames(a, 5, tmp_path / "f")
    assert info.duration > 0 and [f.t for f in frames] == [0.0]


def test_duration_falls_back_to_stream(tmp_path):
    # 파이프로 쓴 webm에는 컨테이너 길이가 없다.
    src = tmp_path / "s.webm"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=25:duration=2",
                  "-c:v", "libvpx", "-f", "webm", "-"], capture_output=True, check=True).stdout
    src.write_bytes(raw)
    assert probe(src).duration == pytest.approx(2, abs=0.2)


def test_extract_frames_ignores_stale_files(tmp_path):
    _, a, _ = _norm(mk.counter(tmp_path / "c.mp4", frames=30), tmp_path)
    out = tmp_path / "f"
    out.mkdir()
    (out / "000099.jpg").write_bytes(b"stale")
    assert len(extract_frames(a, 5, out)) == 5
    assert not (out / "000099.jpg").exists()


def _len(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                 str(path)], capture_output=True, text=True, check=True).stdout)


def _astream_len(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                                 "stream=duration", "-of", "csv=p=0", str(path)],
                                capture_output=True, text=True, check=True).stdout)


def test_normalize_cuts_requested_range(tmp_path):
    src = mk.testsrc(tmp_path / "s.mp4", seconds=10)
    a, p = tmp_path / "a.mp4", tmp_path / "p.mp4"
    info = normalize(src, a, p, 120, trim=(2.5, 6.0))
    assert info.duration == pytest.approx(3.5, abs=0.2)
    assert _len(p) == pytest.approx(3.5, abs=0.2) and _astream_len(a) == pytest.approx(3.5, abs=0.2)
    # 첫 프레임이 원본 2.5초 부근인지(시작 지점이 맞는지)를 영상 내용으로 확인한다.
    ref, cut = tmp_path / "ref.png", tmp_path / "cut.png"
    for f, args in ((ref, ["-ss", "2.5", "-i", str(src)]), (cut, ["-i", str(a)])):
        subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-frames:v", "1", str(f)], check=True)
    d = cv2.absdiff(cv2.imread(str(ref)), cv2.imread(str(cut)))
    assert d.mean() < 3


def test_normalize_allows_long_source_when_trim_fits(tmp_path):
    src = mk.testsrc(tmp_path / "s.mp4", seconds=5)
    info, _, _ = _norm_trim(src, tmp_path, max_seconds=2, trim=(1.0, 3.0))
    assert info.duration == pytest.approx(2.0, abs=0.2)


def test_normalize_accepts_tiny_trim_start(tmp_path):
    # str(0.00001)은 1e-05라 ffmpeg가 거부한다.
    src = mk.testsrc(tmp_path / "s.mp4", seconds=3)
    info, _, _ = _norm_trim(src, tmp_path, max_seconds=5, trim=(0.00001, 2.0))
    assert info.duration == pytest.approx(2.0, abs=0.2)


def _norm_trim(src, tmp_path, max_seconds, trim):
    a, p = tmp_path / "a.mp4", tmp_path / "p.mp4"
    return normalize(src, a, p, max_seconds, trim=trim), a, p


def test_normalize_clamps_trim_end_to_video_end(tmp_path):
    src = mk.testsrc(tmp_path / "s.mp4", seconds=4)
    info, _, _ = _norm_trim(src, tmp_path, 120, (2.0, 50.0))
    assert info.duration == pytest.approx(2.0, abs=0.2)


def test_normalize_fails_when_trim_starts_after_end_of_video(tmp_path):
    src = mk.testsrc(tmp_path / "s.mp4", seconds=3)
    with pytest.raises(PipelineError) as e:
        _norm_trim(src, tmp_path, 120, (5.0, 8.0))
    assert e.value.code == "INVALID_TRIM"


def test_normalize_without_trim_still_rejects_long_video(tmp_path):
    src = mk.testsrc(tmp_path / "s.mp4", seconds=3)
    with pytest.raises(PipelineError) as e:
        _norm(src, tmp_path, max_seconds=1)
    assert e.value.code == "VIDEO_TOO_LONG"
