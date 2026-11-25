"""앱 아이콘 만들기: 학생용 '별마당' / 선생님용 '별마당 선생님'

원본 그림: assets/icons/src/student.webp(한옥 문 + 별), teacher.webp(한옥 문 + 별 + 책)
원본의 둥근 사각형 바깥(검은 귀퉁이)은 투명하게 만듭니다.
크기: 192·512(일반), 512 maskable(꽉 찬 배경 + 그림을 안전 영역 안으로), 180(애플 홈 화면)
실행: python tools/build_icons.py  → assets/icons/
"""
import os

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'icons')
SRC = os.path.join(OUT, 'src')


def load(kind):
    """원본을 읽어 (귀퉁이 투명 그림, 배경색) 을 돌려줌"""
    im = Image.open(os.path.join(SRC, f'{kind}.webp')).convert('RGB')
    a = np.array(im).astype(int)
    dark = a.sum(-1) < 120
    lab, _ = ndimage.label(dark)
    h, w = dark.shape
    corner = {lab[0, 0], lab[0, w - 1], lab[h - 1, 0], lab[h - 1, w - 1]} - {0}
    out = np.isin(lab, list(corner))
    out = ndimage.binary_dilation(out, iterations=2)   # 경계의 어두운 띠까지 걷어냄
    alpha = Image.fromarray(((~out) * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.2))
    rgba = im.convert('RGBA')
    rgba.putalpha(alpha)
    # 배경색: 가장자리 가운데쯤(귀퉁이 아님) 색의 중간값
    m = 40
    strip = np.concatenate([a[m:m + 20, w // 3:2 * w // 3].reshape(-1, 3), a[h // 3:2 * h // 3, m:m + 20].reshape(-1, 3)])
    bg = tuple(int(v) for v in np.median(strip, axis=0))
    return rgba, bg


def main():
    os.makedirs(OUT, exist_ok=True)
    for kind in ('student', 'teacher'):
        icon, bg = load(kind)
        for size in (192, 512):
            icon.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f'{kind}-{size}.png'))
        icon.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, f'{kind}-apple-180.png'))
        # maskable: 꽉 찬 배경색 위에 그림을 82% 크기로(기기가 원·둥근 사각형으로 오려도 지붕이 안 잘림)
        m = Image.new('RGBA', (512, 512), bg + (255,))
        s = int(512 * 0.82)
        m.alpha_composite(icon.resize((s, s), Image.LANCZOS), ((512 - s) // 2, (512 - s) // 2))
        m.save(os.path.join(OUT, f'{kind}-maskable-512.png'))
    print('ok', sorted(os.listdir(OUT)))


if __name__ == '__main__':
    main()
