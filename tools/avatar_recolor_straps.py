# 노랑 배낭 어깨끈(fitted/bag_straps_*.png)을 코랄·네이비 가방 색으로 바꿔 같은 모양의 끈을 만듭니다.
# 끈 모양·명암은 그대로 두고 색만 각 가방 그림의 몸통 색에 맞춥니다.
#   python tools/avatar_recolor_straps.py
import colorsys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / 'assets' / 'avatar'


def body_color(path):
    """가방 그림에서 가장 넓게 칠해진 색(몸통 색)의 평균 HSV"""
    a = np.array(Image.open(path).convert('RGBA')).astype(float) / 255
    m = a[..., 3] > 0.9
    rgb = a[..., :3][m]
    hsv = np.array([colorsys.rgb_to_hsv(*p) for p in rgb[::7]])
    sat = hsv[hsv[:, 1] > 0.35]  # 흰 지퍼·금속 장식 제외
    h = np.median(sat[:, 0]); s = np.median(sat[:, 1]); v = np.median(sat[:, 2])
    return h, s, v


def recolor(src, dst, ref_from, ref_to):
    im = np.array(Image.open(src).convert('RGBA')).astype(float) / 255
    h0, s0, v0 = ref_from; h1, s1, v1 = ref_to
    out = im.copy()
    hh, ww = im.shape[:2]
    for y in range(hh):
        for x in range(ww):
            r, g, b, al = im[y, x]
            if al <= 0: continue
            h, s, v = colorsys.rgb_to_hsv(r, g, b)
            if s < 0.25:  # 흰색·회색 부분(버클 등)은 그대로
                continue
            nh = (h1 + (h - h0)) % 1
            ns = min(1, s * s1 / max(s0, 1e-3))
            nv = min(1, v * v1 / max(v0, 1e-3))
            out[y, x, :3] = colorsys.hsv_to_rgb(nh, ns, nv)
    Image.fromarray((out * 255).round().astype('uint8')).save(dst)


if __name__ == '__main__':
    acc = ROOT / 'accessories'
    yellow = body_color(acc / 'bag_yellow_down.png')
    for name in ('coral', 'navy'):
        target = body_color(acc / f'bag_{name}_down.png')
        for d in ('down', 'left', 'right', 'up'):
            recolor(ROOT / 'fitted' / f'bag_straps_{d}.png', ROOT / 'fitted' / f'bag_straps_{name}_{d}.png', yellow, target)
        print(name, 'from', [round(v, 3) for v in yellow], 'to', [round(v, 3) for v in target])
