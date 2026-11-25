"""별줍는 오락실 로비 · 손 흔드는 픽셀(한옥 옷) 8프레임
원본 assets/arcade-src/pixel-wave-sheet.webp (4×2, 윗줄 1~4 · 아랫줄 5~8)
 → assets/arcade/pixel-wave.webp (가로 8칸 띠, 칸 300×420, 발바닥 y=400, 몸 가운데 x=160)
 - 원본 프레임마다 그림 크기가 조금씩 달라 그대로 쓰면 몸이 커졌다 작아졌다 함 → 모두 같은 키로 맞춤
 - 들어 올린 팔이 머리 높이에 있어 머리 기준은 흔들리므로, 아래쪽 몸(아래 35%) 가운데와 발바닥으로 맞춤
 - 이웃 칸 그림이 비치지 않게 칸 안의 그림 테두리(bbox)만 잘라 씀
(별빛 팡팡 걷기·정지 그림을 덮어쓰지 않게 build_arcade.py 와 따로 둠)
실행: python tools/build_arcade_wave.py
"""
from PIL import Image
import numpy as np

SRC, OUT = 'assets/arcade-src', 'assets/arcade'
CW, CH, FOOT, BODY_X = 300, 420, 400, 160

sheet = Image.open(f'{SRC}/pixel-wave-sheet.webp').convert('RGBA')
W, H = sheet.size
frames = []
for r in range(2):
    for c in range(4):
        f = sheet.crop((round(c * W / 4), round(r * H / 2), round((c + 1) * W / 4), round((r + 1) * H / 2)))
        ys, xs = np.nonzero(np.array(f)[:, :, 3] > 40)
        frames.append(f.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)))
TH = int(np.median([f.height for f in frames]))
TH = min(TH, FOOT - 4)
strip = Image.new('RGBA', (CW * 8, CH), (0, 0, 0, 0))
for i, f in enumerate(frames):
    k = TH / f.height
    f = f.resize((round(f.width * k), TH), Image.LANCZOS)
    low = np.array(f)[int(TH * 0.65):, :, 3] > 40
    bx = np.nonzero(low)[1].mean()
    strip.alpha_composite(f, (round(i * CW + BODY_X - bx), FOOT - TH))
    print('wave', i + 1, 'scale', round(k, 3), 'w', f.width)
strip.save(f'{OUT}/pixel-wave.webp', quality=92)
print('height', TH)
