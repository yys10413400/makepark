"""무지개 행진길(레인보우 퍼레이드) 그림 만들기

받은 원본(assets/parade-src)을 게임용 그림(assets/parade)으로 바꿉니다.
- lobby.webp        : 대기실 배경(1672×941)
- parade-bg.webp    : 퍼레이드 팝업 배경(1672×941)
- riri/momo/lulu.webp : 한복 걷기 8프레임 — 받은 시트(parade-src/hanbok/*.png, 1774×887 = 443.5 칸)를
                      1792×896(448 칸, 4×2)으로 맞춤. 예전 걷기 시트와 장대 중심 x(모모 330, 루루 125)·발 밑 y가 같아서
                      js/parade/show.js 의 기준값을 그대로 씀
- confetti/{petal,paper,star}-0~4.png : 오색 꽃가루 아틀라스(parade-src/confetti-atlas.png, 5칸×3줄)를 15장으로 나눔
                      줄: 꽃잎 · 한지 색종이 · 별 / 칸: 다홍 · 청록 · 황금 · 아이보리 · 보라
                      칸마다 투명 여백만 잘라 내고(비율·질감 그대로) 긴 변 최대 96px로 줄임
리리 인사(riri-opening.webp)는 tools/build_hanok_npcs.py 가 만듭니다.
(assets/parade-src/toolbox.png 는 처음 받은 화면 시안 — 참고용, 게임에는 쓰지 않음)

실행: python tools/build_parade.py
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'parade-src')
OUT = os.path.join(ROOT, 'assets', 'parade')
KINDS = ['petal', 'paper', 'star']
CONFETTI_MAX = 96


def trim(im, pad=3):
    a = np.array(im)[:, :, 3]
    ys, xs = np.where(a > 8)
    x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
    x1, y1 = min(im.width, xs.max() + 1 + pad), min(im.height, ys.max() + 1 + pad)
    return im.crop((int(x0), int(y0), int(x1), int(y1)))


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, ext in (('lobby', '.png'), ('parade-bg', '.webp')):
        Image.open(os.path.join(SRC, name + ext)).convert('RGB').save(os.path.join(OUT, name + '.webp'), quality=88)
    for name in ('riri', 'momo', 'lulu'):
        im = Image.open(os.path.join(SRC, 'hanbok', name + '.png')).convert('RGBA').resize((1792, 896), Image.LANCZOS)
        im.save(os.path.join(OUT, name + '.webp'), quality=90, alpha_quality=100, method=6)

    atlas = Image.open(os.path.join(SRC, 'confetti-atlas.png')).convert('RGBA')
    cw, ch = atlas.width / 5, atlas.height / 3
    os.makedirs(os.path.join(OUT, 'confetti'), exist_ok=True)
    for r, kind in enumerate(KINDS):
        for c in range(5):
            cell = atlas.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
            piece = trim(cell)
            k = CONFETTI_MAX / max(piece.size)
            if k < 1:
                piece = piece.resize((max(1, round(piece.width * k)), max(1, round(piece.height * k))), Image.LANCZOS)
            path = os.path.join(OUT, 'confetti', '%s-%d.png' % (kind, c))
            piece.save(path, optimize=True)
            print(os.path.relpath(path, ROOT), piece.size)
    for f in sorted(os.listdir(OUT)):
        p = os.path.join(OUT, f)
        if os.path.isfile(p):
            print(f, os.path.getsize(p) // 1024, 'KB')


if __name__ == '__main__':
    main()
