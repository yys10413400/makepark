"""피크닉 가게(소풍 한 바구니) 그림 만들기

받은 원본(assets/picnic-src)을 게임용 그림(assets/picnic)으로 나눕니다.
- lobby.webp        : 가게 대기실 배경(1672×941) 그대로
- food-*.webp       : 재료 시트(2×2)를 칸마다 잘라 투명 여백을 없앤 아이콘 4장
                      좌상 주먹밥 onigiri, 우상 샌드위치 sandwich, 좌하 딸기 strawberry, 우하 방울토마토 tomato
- lunchbox.webp     : 빈 도시락(투명 여백만 자르고 폭 1000px로)
- tori-idle-00~07   : 토리 인사 시트(4×2, 384×384 고정 캔버스) 그대로 8장
그림을 바꾸려면 assets/picnic-src 의 같은 이름 파일을 바꾸고 다시 실행하세요.

실행: python tools/build_picnic.py
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'picnic-src')
OUT = os.path.join(ROOT, 'assets', 'picnic')
FOODS = ['onigiri', 'sandwich', 'strawberry', 'tomato']


def trim(im, pad=6):
    a = np.array(im)[:, :, 3]
    ys, xs = np.where(a > 10)
    x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
    x1, y1 = min(im.width, xs.max() + 1 + pad), min(im.height, ys.max() + 1 + pad)
    return im.crop((int(x0), int(y0), int(x1), int(y1)))


def fit(im, side):
    k = side / max(im.size)
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS) if k < 1 else im


def main():
    os.makedirs(OUT, exist_ok=True)
    Image.open(os.path.join(SRC, 'lobby.webp')).convert('RGB').save(os.path.join(OUT, 'lobby.webp'), quality=88)

    sheet = Image.open(os.path.join(SRC, 'foods-sheet.webp')).convert('RGBA')
    hw, hh = sheet.width // 2, sheet.height // 2
    for i, name in enumerate(FOODS):
        cx, cy = (i % 2) * hw, (i // 2) * hh
        cell = trim(sheet.crop((cx, cy, cx + hw, cy + hh)))
        cell = fit(cell, 256)
        cell.save(os.path.join(OUT, 'food-' + name + '.webp'), quality=92)
        print(name, cell.size)

    box = trim(Image.open(os.path.join(SRC, 'lunchbox.webp')).convert('RGBA'), pad=2)
    box = box.resize((1000, round(box.height * 1000 / box.width)), Image.LANCZOS)
    box.save(os.path.join(OUT, 'lunchbox.webp'), quality=92)
    print('lunchbox', box.size)

    tori = Image.open(os.path.join(SRC, 'tori-sprites.png')).convert('RGBA')
    bottoms = []
    for i in range(8):
        x, y = (i % 4) * 384, (i // 4) * 384
        f = tori.crop((x, y, x + 384, y + 384))
        a = np.array(f)[:, :, 3]
        bottoms.append(int(np.where(a > 10)[0].max()))
        f.save(os.path.join(OUT, 'tori-idle-%02d.webp' % i), quality=92)
    print('tori bottoms', bottoms)


if __name__ == '__main__':
    main()
