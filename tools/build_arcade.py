"""플레이 아케이드 · 별빛 팡팡 에셋 만들기
원본(assets/arcade-src) → 게임용(assets/arcade)
 - pixel-walk-sheet.webp : 4×2 옆걸음 8프레임(윗줄 1~4, 아랫줄 5~8) → pixel-walk.webp (가로 8칸 띠)
     프레임마다 발바닥(맨 아래 불투명 줄)과 머리 가운데(위쪽 45% 무게중심)를 같은 자리에 맞춰,
     프레임이 바뀔 때 몸이 들썩이거나 옆으로 튀지 않게 함
 - pixel-idle.webp       : 정지 자세 한 장 → 걷기 프레임과 같은 키·같은 기준점으로 맞춘 pixel-idle.webp
 - star-sheet.webp       : 4×2 낙하 별 8프레임 → star.webp (가로 8칸 띠)
     원본 바탕의 흰 안개(반투명 흰색)를 걷어 내고, 별 몸통 가운데를 칸마다 같은 자리에 맞춤
 - lobby.webp / starpang-bg.webp : 그대로 복사(webp 품질 다시 저장)
실행: python tools/build_arcade.py
"""
from PIL import Image
import numpy as np
import os

SRC = 'assets/arcade-src'
OUT = 'assets/arcade'
os.makedirs(OUT, exist_ok=True)


def cells(im, cols, rows):
    W, H = im.size
    out = []
    for r in range(rows):
        for c in range(cols):
            box = (round(c * W / cols), round(r * H / rows), round((c + 1) * W / cols), round((r + 1) * H / rows))
            out.append(im.crop(box))
    return out


def bbox(a, th):
    ys, xs = np.nonzero(a > th)
    return xs.min(), ys.min(), xs.max(), ys.max()


# ---------------- 픽셀 옆걸음 ----------------
CW, CH = 300, 420          # 출력 칸 크기
FOOT_Y, HEAD_X = 400, 150  # 칸 안 발바닥 줄 / 머리 가운데
walk = Image.open(f'{SRC}/pixel-walk-sheet.webp').convert('RGBA')
frames = cells(walk, 4, 2)
strip = Image.new('RGBA', (CW * 8, CH), (0, 0, 0, 0))
heights = []
for i, f in enumerate(frames):
    a = np.array(f)[:, :, 3]
    x0, y0, x1, y1 = bbox(a, 40)
    heights.append(y1 - y0)
    head = a[y0:y0 + int((y1 - y0) * 0.45)] > 40
    hx = np.nonzero(head)[1].mean()
    # 이웃 칸 그림이 비치지 않게: 셀 안 bbox 밖은 버림
    f = f.crop((x0, y0, x1 + 1, y1 + 1))
    ox = round(i * CW + HEAD_X - (hx - x0))
    oy = round(FOOT_Y - (y1 - y0))
    strip.alpha_composite(f, (ox, oy))
    print('walk', i + 1, 'bbox', (x0, y0, x1, y1), 'head x', round(hx, 1))
strip.save(f'{OUT}/pixel-walk.webp', quality=92)

# ---------------- 픽셀 정지 ----------------
idle = Image.open(f'{SRC}/pixel-idle.webp').convert('RGBA')
a = np.array(idle)[:, :, 3]
x0, y0, x1, y1 = bbox(a, 40)
idle = idle.crop((x0, y0, x1 + 1, y1 + 1))
target_h = float(np.median([heights[0], heights[3], heights[4], heights[7]]))  # 두 발 모은 프레임 키
k = target_h / idle.height
idle = idle.resize((round(idle.width * k), round(idle.height * k)), Image.LANCZOS)
a = np.array(idle)[:, :, 3]
head = a[: int(idle.height * 0.45)] > 40
hx = np.nonzero(head)[1].mean()
canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
canvas.alpha_composite(idle, (round(HEAD_X - hx), round(FOOT_Y - idle.height)))
canvas.save(f'{OUT}/pixel-idle.webp', quality=92)
print('idle scale', round(k, 3), 'size', idle.size)

# ---------------- 낙하 별 ----------------
SW, SH = 240, 330           # 출력 칸
STAR_X, STAR_Y = 120, 250   # 칸 안 별 몸통 가운데
star = Image.open(f'{SRC}/star-sheet.webp').convert('RGBA')
sframes = cells(star, 4, 2)
sstrip = Image.new('RGBA', (SW * 8, SH), (0, 0, 0, 0))
for i, f in enumerate(sframes):
    px = np.array(f).astype(np.float32)
    r, g, b, al = px[..., 0], px[..., 1], px[..., 2], px[..., 3]
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    # 흰 안개 걷기: 채도가 낮은(흰·회색) 곳은 투명하게, 노랑·주황 빛은 남김
    keep = np.clip((sat - 34) / 80, 0, 1) ** 0.9
    keep = np.maximum(keep, np.clip((al - 200) / 40, 0, 1))   # 별 몸통의 흰 하이라이트(거의 불투명)는 지킴
    body = (sat > 90) & (al > 200)
    ys, xs = np.nonzero(body)
    lower = ys > np.percentile(ys, 35)      # 꼬리 말고 몸통(아래쪽) 무게중심
    cx, cy = xs[lower].mean(), ys[lower].mean()
    # 별 몸통·빛 꼬리 둘레 밖의 남은 안개는 부드럽게 0으로(칸 모양 네모 자국이 보이지 않게)
    yy, xx = np.mgrid[0:px.shape[0], 0:px.shape[1]]
    dx = (xx - cx) / 105
    dy = np.where(yy < cy, (yy - cy) / 230, (yy - cy) / 85)
    d = np.sqrt(dx * dx + dy * dy)
    fall = np.clip((1.15 - d) / 0.35, 0, 1)
    a2 = al * keep * fall
    a2 = np.where(al >= 240, al * fall, np.clip((a2 - 10) * 255 / 245, 0, 255))
    px[..., 3] = a2
    f = Image.fromarray(px.clip(0, 255).astype(np.uint8))
    sstrip.alpha_composite(f, (round(i * SW + STAR_X - cx), round(STAR_Y - cy)), )
    print('star', i + 1, 'body', round(cx, 1), round(cy, 1))
# 칸 밖으로 넘친 그림은 이웃 칸에 비치지 않게 잘라 냄
clean = Image.new('RGBA', sstrip.size, (0, 0, 0, 0))
for i in range(8):
    clean.alpha_composite(sstrip.crop((i * SW + 2, 0, (i + 1) * SW - 2, SH)), (i * SW + 2, 0))
clean.save(f'{OUT}/star.webp', quality=92)

for n in ['lobby', 'starpang-bg']:
    Image.open(f'{SRC}/{n}.webp').convert('RGB').save(f'{OUT}/{n}.webp', quality=88)
print('done')
