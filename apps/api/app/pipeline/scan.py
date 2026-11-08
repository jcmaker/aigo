from dataclasses import dataclass
from pathlib import Path
from functools import lru_cache

import cv2
import numpy as np

from app.config import settings
from app.pipeline.media import Frame

# COCO: 사람, 자전거, 승용차, 오토바이, 버스, 트럭, 신호등
CLASSES = [0, 1, 2, 3, 5, 7, 9]
TRACKER = str(Path(__file__).with_name("bytetrack_5fps.yaml"))


@dataclass
class TrackPoint:
    t: float
    box: tuple[float, float, float, float]  # 원본 픽셀 x1, y1, x2, y2
    cls: str
    conf: float


@dataclass
class ScanResult:
    tracks: dict[int, list[TrackPoint]]
    motion: list[tuple[float, float]]  # (t, 직전 프레임과의 160px 흑백 평균 차이)


@lru_cache(maxsize=1)
def _model():
    from ultralytics import YOLO  # 지연 import: api 프로세스는 torch를 올리지 않는다.
    return YOLO(settings.yolo_weights)


def scan(frames: list[Frame], imgsz: int | None = None, conf: float | None = None) -> ScanResult:
    # 모델과 트래커 상태가 프로세스 하나에 하나뿐이다: worker는 한 번에 한 분석만 처리한다.
    model = _model()
    model.predictor = None  # 이전 영상의 ByteTrack 상태를 버린다. 가중치는 그대로.
    tracks: dict[int, list[TrackPoint]] = {}
    motion: list[tuple[float, float]] = []
    prev = None
    for f in frames:
        r = model.track(str(f.path), persist=True, tracker=TRACKER, classes=CLASSES,
                          imgsz=imgsz or settings.yolo_imgsz, conf=conf or settings.yolo_conf, verbose=False)[0]
        if r.boxes is not None and r.boxes.id is not None:
            for i, box, c, k in zip(r.boxes.id.int().tolist(), r.boxes.xyxy.tolist(),
                                    r.boxes.conf.tolist(), r.boxes.cls.int().tolist()):
                tracks.setdefault(i, []).append(TrackPoint(f.t, tuple(box), r.names[k], c))
        img = r.orig_img if r.orig_img is not None else cv2.imread(str(f.path))
        g = cv2.cvtColor(cv2.resize(img, (160, max(1, round(img.shape[0] * 160 / img.shape[1])))),
                         cv2.COLOR_BGR2GRAY).astype(np.float32)
        if prev is not None:
            motion.append((f.t, float(np.abs(g - prev).mean())))
        prev = g
    return ScanResult(tracks, motion)
