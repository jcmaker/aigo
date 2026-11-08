"""원본 PNG(assets/brand/source) -> 다크 변형, 레이어, 적응형 아이콘, 스플래시 PNG. 결정적이다."""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "assets" / "brand"
SRC = ROOT / "source"
REFS = [np.array(c, float) for c in ([10, 50, 200], [20, 230, 190], [250, 250, 250])]  # 파랑, 청록, 흰색
INK, GREEN, PAPER = "#1C1C1C", "#3FCF8E", "#FAFAFA"


def hexc(h):
    return np.array([int(h[i : i + 2], 16) for i in (1, 3, 5)], float)


def load(name):
    return np.asarray(Image.open(SRC / name).convert("RGBA")).astype(float)


def weights(rgb):
    """기준색 근접도 가중치(파랑, 청록, 흰색). 가장자리 안티앨리어싱이 살아남는다."""
    d = np.stack([np.linalg.norm(rgb - r, axis=-1) for r in REFS], -1)
    w = np.exp(-d / 18.0)
    return w / w.sum(-1, keepdims=True)


def img(arr):
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8))


def recolor(name, blue, teal, white):
    a = load(name)
    w = weights(a[..., :3])
    rgb = w[..., 0:1] * hexc(blue) + w[..., 1:2] * hexc(teal) + w[..., 2:3] * hexc(white)
    return np.concatenate([rgb, a[..., 3:]], -1)


def solid(shape, weight, alpha, color):
    rgba = np.zeros((*shape, 4))
    rgba[..., :3] = hexc(color)
    rgba[..., 3] = weight * alpha
    return rgba


def place(im, box, size, ratio):
    """box(로고 영역)가 size 캔버스 가운데 ratio 비율에 오도록 im 전체를 옮겨 붙인다."""
    s = size * ratio / max(box[2] - box[0], box[3] - box[1])
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    cx, cy = (box[0] + box[2]) / 2 * s, (box[1] + box[3]) / 2 * s
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, (round(size / 2 - cx), round(size / 2 - cy)), im)
    return out


# 아이콘, 가로 로고 다크 변형
# 앱 아이콘은 OS가 마스크를 씌우므로 둥근 사각형 영역으로 잘라 INK로 꽉 채운 1024 RGB로 만든다.
ic = img(recolor("icon.png", INK, GREEN, PAPER))
ic = ic.crop(ic.getchannel("A").point(lambda v: 255 if v > 128 else 0).getbbox())
flat = Image.new("RGBA", ic.size, INK)
flat.alpha_composite(ic)
flat.convert("RGB").resize((1024, 1024), Image.LANCZOS).save(ROOT / "icon-dark.png")
img(recolor("wordmark.png", INK, GREEN, PAPER)).save(ROOT / "wordmark-dark.png")

# 글자만 흰색으로 (x 700 이후, 알파 128 초과 행/열로 다시 자름)
txt = recolor("wordmark.png", PAPER, PAPER, PAPER)[:, 700:]
solid_a = txt[..., 3] > 128
rows = np.where(solid_a.sum(1) > 20)[0]
cols = np.where(solid_a.sum(0) > 20)[0]
img(txt[rows[0] : rows[-1] + 1, cols[0] : cols[-1] + 1]).save(ROOT / "wordtext-light.png")

# 레이어: A(흰색), 길과 별(청록). 60px씩 잘라 낸다.
a = load("icon.png")
w, al = weights(a[..., :3]), a[..., 3]
H, W = al.shape
yy, xx = np.mgrid[0:H, 0:W]
star = (yy < 0.38 * H) & (xx > 0.64 * W)
layers = {
    "layer-a": solid((H, W), w[..., 2], al, PAPER),
    "layer-road": solid((H, W), w[..., 1] * ~star, al, GREEN),
    "layer-star": solid((H, W), w[..., 1] * star, al, GREEN),
}
ims = {k: img(v).crop((60, 60, W - 60, H - 60)) for k, v in layers.items()}
for k, im in ims.items():
    im.save(ROOT / f"{k}.png")

# 적응형 아이콘: 로고(A+길+별)를 1024 가운데 66%에, 같은 모양의 흰색 단색
logo = ims["layer-a"].copy()
for k in ("layer-road", "layer-star"):
    logo = Image.alpha_composite(logo, ims[k])
box = logo.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
place(logo, box, 1024, 0.66).save(ROOT / "adaptive-foreground.png")
mono = np.asarray(logo).astype(float)
mono[..., :3] = 255
place(img(mono), box, 1024, 0.66).save(ROOT / "adaptive-monochrome.png")
