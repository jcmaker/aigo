"""앱 아이콘(ADR 0050): 남색 원형 그라데이션 + 흰 AIGO 글자 + O 안 빨간 점. 결정적이다.

입력: assets/brand/wordtext-light.png (brand.py가 만든 흰 AIGO 글자)
출력: assets/brand/app-icon.png(1024, iOS·웹·기본 아이콘), app-icon-bg.png / app-icon-fg.png / app-icon-mono.png(안드로이드 적응형 아이콘)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "assets" / "brand"
S = 1024
K = 4  # 점은 4배로 그려 줄여서 가장자리를 매끄럽게 한다
CENTER, EDGE = (44, 78, 140), (10, 20, 52)  # 가운데 밝은 남색 → 모서리 짙은 남색
DOT = (240, 68, 56, 255)  # 녹화 점 빨강
O_HOLE = (1162, 203, 60)  # wordtext-light.png 안 O 구멍의 중심 x, y와 점 반지름(px)


def background():
    yy, xx = np.mgrid[0:S, 0:S] / S
    t = np.clip(np.sqrt((xx - 0.5) ** 2 + (yy - 0.5) ** 2) / 0.78, 0, 1)[..., None] ** 1.3
    c = np.array(CENTER, float) + (np.array(EDGE, float) - np.array(CENTER, float)) * t
    return Image.fromarray(c.clip(0, 255).astype(np.uint8)).convert("RGBA")


def word(width, color=None):
    w = Image.open(ROOT / "wordtext-light.png").convert("RGBA")
    big = w.resize((w.width * K, w.height * K), Image.LANCZOS)
    x, y, r = (v * K for v in O_HOLE)
    ImageDraw.Draw(big).ellipse([x - r, y - r, x + r, y + r], fill=DOT if color is None else color)
    w = big.resize(w.size, Image.LANCZOS)
    if color is not None:  # 흑백 아이콘: 모양(알파)만 쓴다
        a = np.asarray(w)[..., 3]
        w = Image.fromarray(np.dstack([np.full_like(a, 255)] * 3 + [a]))
    return w.resize((width, round(w.height * width / w.width)), Image.LANCZOS)


def on(canvas, w):
    canvas.alpha_composite(w, ((S - w.width) // 2, (S - w.height) // 2))
    return canvas


on(background(), word(740)).convert("RGB").save(ROOT / "app-icon.png")
# 적응형 아이콘은 기기마다 원·둥근 네모로 잘린다. 보이는 영역은 가운데 2/3뿐이라 글자 폭을 그 안의 약 70%(470px)로 줄인다.
background().convert("RGB").save(ROOT / "app-icon-bg.png")
on(Image.new("RGBA", (S, S), (0, 0, 0, 0)), word(470)).save(ROOT / "app-icon-fg.png")
on(Image.new("RGBA", (S, S), (0, 0, 0, 0)), word(470, color=(255, 255, 255, 255))).save(ROOT / "app-icon-mono.png")
