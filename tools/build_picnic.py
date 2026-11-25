"""토리네 도시락 음식 그림 만들기

받은 음식 시트(assets/picnic-src/foods-1~3.webp, 각 2×2칸)를 칸마다 잘라 투명 여백을 없앤
게임용 아이콘(assets/picnic/food-<id>.webp, 긴 쪽 256px) 12장으로 만듭니다.
음식 id·이름·순서는 js/picnic/orders.js 의 ALL·NAME 과 같아야 합니다.

  foods-1: 좌상 달걀말이 eggroll · 우상 약과 yakgwa · 좌하 쑥송편 songpyeon-green · 우하 꼬치전 skewer
  foods-2: 좌상 주먹밥 jumeokbap · 우상 김밥 gimbap · 좌하 분홍 송편 songpyeon-pink · 우하 귤 tangerine
  foods-3: 좌상 꽃떡 flowercake · 우상 떡갈비 tteokgalbi · 좌하 사과 apple · 우하 흰 송편 songpyeon-white

대기실(lobby.webp)·도시락(lunchbox.webp)·토리 그림은 assets/picnic 에 바로 넣어 쓰므로 기본 실행에서는 건드리지 않습니다.
(예전처럼 원본에서 다시 만들려면 --all: lobby·lunchbox·tori-sprites.png 를 assets/picnic-src 에서 다시 만듦)

실행: python -I tools/build_picnic.py
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'picnic-src')
OUT = os.path.join(ROOT, 'assets', 'picnic')
SHEETS = [
    ('foods-1.webp', ['eggroll', 'yakgwa', 'songpyeon-green', 'skewer']),
    ('foods-2.webp', ['jumeokbap', 'gimbap', 'songpyeon-pink', 'tangerine']),
    ('foods-3.webp', ['flowercake', 'tteokgalbi', 'apple', 'songpyeon-white']),
]


def trim(im, pad=6):
    a = np.array(im)[:, :, 3]
    ys, xs = np.where(a > 10)
    x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
    x1, y1 = min(im.width, xs.max() + 1 + pad), min(im.height, ys.max() + 1 + pad)
    return im.crop((int(x0), int(y0), int(x1), int(y1)))


def fit(im, side):
    k = side / max(im.size)
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS) if k < 1 else im


def clean(cell):
    """칸 가장자리에 걸친 아주 옅은 잔여 픽셀(그림자 번짐)은 지우고, 가장 큰 덩어리 주변만 남김"""
    a = np.array(cell)
    alpha = a[:, :, 3]
    alpha[alpha < 12] = 0
    a[:, :, 3] = alpha
    return Image.fromarray(a)


def foods():
    for sheet_name, ids in SHEETS:
        sheet = Image.open(os.path.join(SRC, sheet_name)).convert('RGBA')
        hw, hh = sheet.width // 2, sheet.height // 2
        for i, name in enumerate(ids):
            cx, cy = (i % 2) * hw, (i // 2) * hh
            cell = trim(clean(sheet.crop((cx, cy, cx + hw, cy + hh))))
            cell = fit(cell, 256)
            cell.save(os.path.join(OUT, 'food-' + name + '.webp'), quality=92)
            print(name, cell.size)


def rest():
    Image.open(os.path.join(SRC, 'lobby.webp')).convert('RGB').save(os.path.join(OUT, 'lobby.webp'), quality=88)
    box = trim(Image.open(os.path.join(SRC, 'lunchbox.webp')).convert('RGBA'), pad=2)
    box = box.resize((1000, round(box.height * 1000 / box.width)), Image.LANCZOS)
    box.save(os.path.join(OUT, 'lunchbox.webp'), quality=92)
    print('lunchbox', box.size)
    tori = Image.open(os.path.join(SRC, 'tori-sprites.png')).convert('RGBA')
    for i in range(8):
        x, y = (i % 4) * 384, (i // 4) * 384
        tori.crop((x, y, x + 384, y + 384)).save(os.path.join(OUT, 'tori-idle-%02d.webp' % i), quality=92)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    foods()
    if '--all' in sys.argv:
        rest()
