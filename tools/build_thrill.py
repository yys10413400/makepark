"""짜릿 어드벤처 · 토토의 범퍼카 연구소 에셋 만들기
원본(assets/thrill-src) → 게임용(assets/thrill)
 - lobby.webp / arena-day.webp / arena-night.webp : 1672×941 배경 → webp
 - toto-sheet.webp  : 4×2 수첩 대기 8프레임 → toto.webp (가로 8칸 띠, 칸 300×440, 발바닥 y=425·발 가운데 x=150)
                     + toto-face.webp (대화창 얼굴, 1번 칸 위쪽)
 - car-8dir-b.webp  : 배경을 정리한 8방향 시트(윗줄 ↓ ↙ ← ↖ / 아랫줄 ↑ ↗ → ↘) → car-dir.webp (8칸 띠)
 - car-drive.webp   : 오른쪽 주행 8프레임 → car-drive.webp
 - car-crash.webp   : 오른쪽 충돌 8프레임 → car-crash.webp
     모든 차 칸은 360×420, 범퍼 바닥(맨 아래 불투명 줄) y=404, 범퍼 바닥 가운데 x=180 에 맞춤
     → 방향을 바꾸거나 주행·충돌 프레임으로 넘어가도 차체가 튀지 않음.
     주행·충돌 프레임은 → 방향 기본 자세와 범퍼 폭이 같게 크기를 맞춤
 - props-sheet.webp : 4×2 소품 → cart / pad / mag-red / mag-blue / plate-flat / plate-curve / box / hook .webp
 - night-props.webp : 가림막 / 거울 / 별 표지판 → screen / mirror / sign .webp
   소품은 칸마다 그림만 잘라(여백 4px) 저장. 크기는 js/thrill/ui.js 가 그림 크기를 그대로 읽어 씀
원본 바탕에 남은 아주 옅은 흰 안개(알파 24 미만)는 지움
실행: python -I tools/build_thrill.py   (저장소 맨 위 폴더에서)
"""
from PIL import Image
import numpy as np
import os

SRC = 'assets/thrill-src'
OUT = 'assets/thrill'
os.makedirs(OUT, exist_ok=True)


def load(name):
    im = Image.open(f'{SRC}/{name}').convert('RGBA')
    a = np.array(im)
    a[:, :, 3][a[:, :, 3] < 24] = 0
    return Image.fromarray(a)


def cells(im, cols, rows):
    W, H = im.size
    out = []
    for r in range(rows):
        for c in range(cols):
            out.append(im.crop((round(c * W / cols), round(r * H / rows), round((c + 1) * W / cols), round((r + 1) * H / rows))))
    return out


def bbox(im, th=40):
    a = np.array(im)[:, :, 3]
    ys, xs = np.nonzero(a > th)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def base_center(im, box, band=0.12):
    """바닥(아래쪽 band 비율) 불투명 픽셀의 가로 가운데와 폭"""
    x0, y0, x1, y1 = box
    a = np.array(im)[:, :, 3]
    h = max(3, int((y1 - y0) * band))
    rows = a[y1 - h:y1 + 1, x0:x1 + 1] > 40
    xs = np.nonzero(rows)[1]
    return x0 + (xs.min() + xs.max()) / 2, xs.max() - xs.min()


# ---------------- 배경 ----------------
for n in ('lobby', 'arena-day', 'arena-night'):
    Image.open(f'{SRC}/{n}.webp').convert('RGB').save(f'{OUT}/{n}.webp', quality=90)
    print('bg', n)

# ---------------- 범퍼카 ----------------
CW, CH, FOOT, CX = 360, 420, 404, 180


def put(strip, i, f, scale=1.0):
    box = bbox(f)
    cx, _ = base_center(f, box)
    f = f.crop((box[0], box[1], box[2] + 1, box[3] + 1))
    cx -= box[0]
    if scale != 1.0:
        f = f.resize((round(f.width * scale), round(f.height * scale)), Image.LANCZOS)
        cx *= scale
    ox, oy = round(i * CW + CX - cx), round(FOOT - f.height)
    strip.alpha_composite(f, (max(i * CW, ox), max(0, oy)))
    return f.size


dirs = cells(load('car-8dir-b.webp'), 4, 2)
strip = Image.new('RGBA', (CW * 8, CH), (0, 0, 0, 0))
for i, f in enumerate(dirs):
    print('dir', i, put(strip, i, f))
strip.save(f'{OUT}/car-dir.webp', quality=92)
right = dirs[6]
_, right_w = base_center(right, bbox(right))

for name in ('drive', 'crash'):
    fr = cells(load(f'car-{name}.webp'), 4, 2)
    _, w0 = base_center(fr[0], bbox(fr[0]))
    k = right_w / w0
    strip = Image.new('RGBA', (CW * 8, CH), (0, 0, 0, 0))
    for i, f in enumerate(fr):
        put(strip, i, f, k)
    strip.save(f'{OUT}/car-{name}.webp', quality=92)
    print(name, 'scale', round(k, 3))

# ---------------- 토토 ----------------
TW, TH, TFOOT, TX = 300, 440, 425, 150
toto = cells(load('toto-sheet.webp'), 4, 2)
strip = Image.new('RGBA', (TW * 8, TH), (0, 0, 0, 0))
for i, f in enumerate(toto):
    box = bbox(f)
    cx, _ = base_center(f, box, 0.06)
    g = f.crop((box[0], box[1], box[2] + 1, box[3] + 1))
    strip.alpha_composite(g, (round(i * TW + TX - (cx - box[0])), round(TFOOT - g.height)))
    print('toto', i, box)
strip.save(f'{OUT}/toto.webp', quality=92)
f = toto[0]
box = bbox(f)
face = f.crop((box[0], box[1], box[2] + 1, box[1] + int((box[3] - box[1]) * 0.52)))
face.save(f'{OUT}/toto-face.webp', quality=92)

# ---------------- 소품 ----------------
def save_props(sheet, cols, rows, names):
    for f, n in zip(cells(load(sheet), cols, rows), names):
        x0, y0, x1, y1 = bbox(f, 24)
        g = f.crop((max(0, x0 - 4), max(0, y0 - 4), min(f.width, x1 + 5), min(f.height, y1 + 5)))
        g.save(f'{OUT}/{n}.webp', quality=92)
        print('prop', n, g.size)


save_props('props-sheet.webp', 4, 2, ['cart', 'pad', 'mag-red', 'mag-blue', 'plate-flat', 'plate-curve', 'box', 'hook'])
save_props('night-props.webp', 3, 1, ['screen', 'mirror', 'sign'])
