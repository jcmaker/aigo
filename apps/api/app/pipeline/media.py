import json
import subprocess
from dataclasses import dataclass
from itertools import count
from pathlib import Path

import numpy as np

from app.errors import PipelineError

TIMEOUT_S = 600  # 하위 프로세스마다 10분
FPS = 30
_BAD = ("INVALID_VIDEO", "영상 파일을 읽을 수 없습니다. 다른 파일로 다시 시도해 주세요.")


@dataclass
class VideoInfo:
    duration: float
    width: int
    height: int
    has_audio: bool


@dataclass
class Frame:
    t: float
    path: Path


def _run(args: list[str], *, binary=False) -> subprocess.CompletedProcess:
    """셸 없이 인자 목록으로 실행한다. 실패와 시간 초과는 모두 INVALID_VIDEO."""
    try:
        return subprocess.run(args, capture_output=True, text=not binary, timeout=TIMEOUT_S, check=True)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as e:
        raise PipelineError(*_BAD) from e


def _duration(path: Path, fmt: dict, stream: dict) -> float:
    """컨테이너 길이가 없으면(MediaRecorder webm 등) 스트림 길이, 그것도 없으면 끝까지 디코드해 잰다."""
    for d in (fmt.get("duration"), stream.get("duration")):
        try:
            return float(d)
        except (TypeError, ValueError):
            pass
    out = _run(["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:v:0", "-f", "null", "-",
                "-progress", "pipe:1", "-nostats"]).stdout
    last = [ln for ln in out.splitlines() if ln.startswith("out_time_us=")]
    return int(last[-1].split("=")[1]) / 1e6


def probe(path: Path) -> VideoInfo:
    """ffprobe로 실제 영상인지 확인한다. 확장자는 믿지 않는다."""
    out = _run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)])
    try:
        data = json.loads(out.stdout)
        streams = data["streams"]
        v = next(s for s in streams if s["codec_type"] == "video"
                 and not s.get("disposition", {}).get("attached_pic"))
        w, h = int(v["width"]), int(v["height"])
        duration = _duration(path, data["format"], v)
    except (ValueError, KeyError, StopIteration, TypeError) as e:
        raise PipelineError(*_BAD) from e
    # 이미지 한 장(png 등)은 영상이 아니다.
    if duration <= 0 or w <= 0 or h <= 0 or v.get("nb_frames") == "1":
        raise PipelineError(*_BAD)
    rot = int(float(v.get("tags", {}).get("rotate", 0)))
    for sd in v.get("side_data_list", []):
        rot = int(float(sd.get("rotation", rot)))
    if abs(rot) % 180 == 90:
        w, h = h, w
    return VideoInfo(duration, w, h, any(s["codec_type"] == "audio" for s in streams))


def normalize(src: Path, dst_analysis: Path, dst_playback: Path, max_seconds: int,
              trim: tuple[float, float] | None = None) -> VideoInfo:
    """분석용(원본 해상도, 30fps 고정 H.264)과 재생용(짧은 변 720 이하)을 만든다. trim은 원본 기준 (시작, 끝) 초."""
    info = probe(src)
    start, end = trim or (0.0, info.duration)
    length = min(end, info.duration) - start
    if length <= 0:
        raise PipelineError("INVALID_TRIM", "선택한 구간이 영상 길이를 벗어났습니다. 구간을 다시 골라 주세요.")
    if length > max_seconds:
        raise PipelineError("VIDEO_TOO_LONG", f"영상이 너무 깁니다. {max_seconds}초 이하의 영상만 분석할 수 있습니다.")
    # 입력 앞의 -ss는 변환할 때 프레임 단위로 정확히 자른다. -to 대신 -t(길이)를 써서 의미가 모호하지 않게 한다.
    cut = ["-ss", f"{start:.3f}", "-t", f"{length:.3f}"] if trim else []  # 1e-05 같은 표기는 ffmpeg가 거부한다.
    # setpts로 시작 오프셋을 0으로 맞춰야 프레임 번호 / 30 = 시각이 된다.
    _run(["ffmpeg", "-v", "error", "-y", *cut, "-i", str(src),
          "-vf", f"setpts=PTS-STARTPTS,fps={FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2",
          "-af", "aresample=async=1:first_pts=0",
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-movflags", "+faststart", str(dst_analysis)])
    # 짧은 변을 720으로 줄이되 키우지는 않는다. 필터 안의 쉼표는 \\로 이스케이프한다.
    short = "min(720\\,min(iw\\,ih))"
    scale = f"scale=if(lt(iw\\,ih)\\,{short}\\,-2):if(lt(iw\\,ih)\\,-2\\,{short})"
    _run(["ffmpeg", "-v", "error", "-y", "-i", str(dst_analysis), "-vf", scale,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-movflags", "+faststart", str(dst_playback)])
    return probe(dst_analysis)


def extract_frames(path: Path, fps: int, out_dir: Path, start: float = 0,
                   end: float | None = None) -> list[Frame]:
    """원본 해상도 JPEG로 뽑는다. 정규화된(30fps 고정) 영상 전용.

    fps 필터는 가까운 프레임을 반올림해 고르므로 시각이 최대 1/15초 어긋난다.
    그래서 프레임 번호로 직접 고르고, t는 고른 프레임의 번호 / 30으로 낸다.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.jpg"):  # 이전 실행의 파일이 다른 t와 짝지어지지 않게 한다.
        old.unlink()
    i0 = round(start * FPS)
    i1 = round(end * FPS) if end is not None else None
    cmd = ["ffmpeg", "-v", "error", "-y"]
    if i0:
        cmd += ["-ss", str(i0 / FPS)]
    if i1 is not None:
        cmd += ["-t", str((i1 - i0) / FPS)]
    # 각 구간(FPS/fps 프레임)의 첫 프레임을 고른다. 번호 n은 start 기준 상대값이다.
    sel = f"select=lt(mod(n*{fps}\\,{FPS})\\,{fps})"
    _run(cmd + ["-i", str(path), "-an", "-vf", sel, "-fps_mode", "passthrough", "-q:v", "2",
                str(out_dir / "%06d.jpg")])
    idx = (i for i in count(i0) if ((i - i0) * fps) % FPS < fps)
    return [Frame(round(i / FPS, 6), f) for i, f in zip(idx, sorted(out_dir.glob("*.jpg")))]


def audio_envelope(path: Path, hop_s: float = 0.1) -> list[tuple[float, float]] | None:
    """hop마다 RMS(0~1). 소리가 없으면 None."""
    if not probe(path).has_audio:
        return None
    rate = 16000
    raw = _run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(rate),
                "-f", "s16le", "-"], binary=True).stdout
    x = np.frombuffer(raw[: len(raw) // 2 * 2], dtype=np.int16).astype(np.float32) / 32768
    hop = int(rate * hop_s)
    return [(round(i * hop_s, 6), float(np.sqrt(np.mean(x[s:s + hop] ** 2))))
            for i, s in enumerate(range(0, len(x) - hop + 1, hop))]
