"""앱 아이콘 만들기: 학생용 '메이크파크' / 선생님용 '메이크파크 선생님'

공원 지도(일반 계절)의 MAKE PARK 정문을 오려(길 바닥은 투명하게) 배경 위에 올립니다.
 - 학생: 하늘색→크림색 배경 + 정문
 - 선생님: 보라색 배경 + 정문 + 아래 '선생님' 띠
크기: 192·512(일반), 512 maskable(안전 영역 80% 안), 180(애플 홈 화면)
실행: python tools/build_icons.py  → assets/icons/
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'icons')
MAP = os.path.join(ROOT, 'assets', 'maps', 'makepark-normal.webp')
BOX = (1180, 1690, 1640, 2110)   # 2배 지도에서 정문 자리


def gate():
    im = Image.open(MAP).convert('RGBA').crop(BOX)
    a = np.array(im).astype(int)
    rgb = a[..., :3]
    # 길 바닥(분홍빛 베이지): 네 귀퉁이 색과 가까운 픽셀 중 가장자리와 이어진 것만 투명하게
    ref = np.median(np.concatenate([rgb[:12, :12].reshape(-1, 3), rgb[:12, -12:].reshape(-1, 3)]), axis=0)
    near = np.abs(rgb - ref).sum(-1) < 70
    lab, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    # 옆 화단 조각(가장자리에 붙은 작은 덩어리)도 지움
    keep = ~bg
    lab2, n2 = ndimage.label(keep)
    if n2:
        sizes = ndimage.sum(keep, lab2, range(1, n2 + 1))
        main = int(np.argmax(sizes)) + 1
        keep = lab2 == main
    keep = ndimage.binary_closing(keep, iterations=2)
    alpha = Image.fromarray((keep * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.8))
    im.putalpha(alpha)
    return im.crop(im.getbbox())


def rounded(size, radius, top, bottom):
    bgc = Image.new('RGBA', (size, size))
    d = ImageDraw.Draw(bgc)
    for y in range(size):
        t = y / (size - 1)
        c = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)) + (255,)
        d.line([(0, y), (size, y)], fill=c)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(bgc, (0, 0), mask)
    return out


def compose(kind, size, safe):
    """safe: 그림이 들어갈 가운데 비율(maskable 은 0.72)"""
    if kind == 'student':
        icon = rounded(size, int(size * 0.22), (143, 211, 255), (255, 243, 214))
    else:
        icon = rounded(size, int(size * 0.22), (139, 86, 194), (74, 35, 112))
    g = gate()
    area = int(size * safe)
    gh = area if kind == 'student' else int(area * 0.78)
    s = gh / g.height
    g = g.resize((int(g.width * s), gh), Image.LANCZOS)
    x = (size - g.width) // 2
    y = (size - area) // 2 + (area - gh) // 2 if kind == 'student' else (size - area) // 2
    # 그림자
    sh = Image.new('RGBA', g.size, (40, 20, 60, 0)); sh.putalpha(g.getchannel('A').point(lambda v: v * 0.35))
    icon.alpha_composite(sh.filter(ImageFilter.GaussianBlur(size * 0.012)), (x, y + int(size * 0.012)))
    icon.alpha_composite(g, (x, y))
    if kind == 'teacher':
        d = ImageDraw.Draw(icon)
        bh = int(area * 0.24)
        by = (size - area) // 2 + area - bh
        bw = int(area * 0.86); bx = (size - bw) // 2
        d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=bh // 2, fill=(255, 241, 196), outline=(226, 179, 87), width=max(2, size // 128))
        try:
            font = ImageFont.truetype(r'C:\Windows\Fonts\malgunbd.ttf', int(bh * 0.62))
        except OSError:
            font = ImageFont.load_default()
        d.text((size / 2, by + bh / 2), '선생님', fill=(74, 35, 112), font=font, anchor='mm')
    return icon


def main():
    os.makedirs(OUT, exist_ok=True)
    for kind in ('student', 'teacher'):
        for size in (192, 512):
            compose(kind, size, 0.86).save(os.path.join(OUT, f'{kind}-{size}.png'))
        full = compose(kind, 512, 0.72)
        # maskable: 둥근 모서리 없이 꽉 찬 배경(기기가 모양을 오림)
        m = Image.new('RGBA', (512, 512), (143, 211, 255, 255) if kind == 'student' else (106, 61, 154, 255))
        m.alpha_composite(full)
        m.save(os.path.join(OUT, f'{kind}-maskable-512.png'))
        compose(kind, 180, 0.86).save(os.path.join(OUT, f'{kind}-apple-180.png'))
    print('ok', sorted(os.listdir(OUT)))


if __name__ == '__main__':
    main()
