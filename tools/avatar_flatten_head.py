# 옆모습 두상의 뒤통수를 납작하게 만들기
#   python tools/avatar_flatten_head.py [배율=0.6]
# 얼굴 옆모습(left·right) 그림에서 귀 뒤(뒤통수 쪽)만 가로로 눌러, 새로 그린 머리카락 밖으로
# 뒤통수 피부가 튀어나오지 않게 합니다. 원본은 assets/avatar/faces-orig/ 에 두고 항상 원본에서 다시 만듭니다.
import shutil, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FACES = ROOT / 'assets' / 'avatar' / 'faces'
ORIG = ROOT / 'assets' / 'avatar' / 'faces-orig'
EAR_BACK = 156   # 왼쪽 보기 기준 귀 뒤 끝 x (오른쪽 보기는 좌우 대칭: 256-156)


def flatten(im, d, k):
    a = np.array(im.convert('RGBA')).astype(np.float32)
    if d == 'right': a = a[:, ::-1]
    xs = np.arange(a.shape[1], dtype=np.float32)
    src = np.where(xs >= EAR_BACK, EAR_BACK + (xs - EAR_BACK) / k, xs)   # 귀 뒤만 k배로 눌림
    pm = a.copy(); pm[..., :3] *= a[..., 3:] / 255   # 가장자리 색이 번지지 않게 알파 곱한 색으로 보간
    out = np.zeros_like(a)
    for y in range(a.shape[0]):
        for c in range(4): out[y, :, c] = np.interp(src, xs, pm[y, :, c], right=0)
    al = out[..., 3:]
    out[..., :3] = np.where(al > 0, out[..., :3] * 255 / np.maximum(al, 1e-3), 0)
    if d == 'right': out = out[:, ::-1]
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


def back_of_head(front, row0=64, edge=5):
    """뒷모습 두상: 원래 뒷모습 얼굴 그림이 비어 있어 머리카락 틈(양갈래 목덜미 등)으로 배경이 보였음.
    앞모습 얼굴의 윤곽·이마 피부를 그대로 쓰고, 눈썹 아래(이목구비)는 이마 색에서 아래로 살짝 어두워지는 피부로 채움."""
    from PIL import ImageFilter
    a = np.array(front.convert('RGBA')).astype(np.float32)
    m = Image.fromarray(((a[..., 3] > 40) * 255).astype(np.uint8))
    inner = np.array(m.filter(ImageFilter.MinFilter(edge * 2 + 1))) > 0
    ys = np.where(inner.any(1))[0]; y1 = ys.max()
    shade = np.array([238, 182, 160], np.float32)
    for y in range(row0, y1 + 1):
        t = (y - row0) / max(1, y1 - row0) * 0.6
        xs = np.where(inner[y])[0]
        for x in xs:
            base = a[row0, x, :3] if inner[row0, x] else a[row0, 128, :3]
            a[y, x, :3] = base * (1 - t) + shade * t
    out = Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8))
    # 채운 경계가 도드라지지 않게 안쪽만 살짝 흐리게
    blur = np.array(out.filter(ImageFilter.GaussianBlur(2))); o = np.array(out)
    o[inner & (np.arange(o.shape[0])[:, None] >= row0 - 4)] = blur[inner & (np.arange(o.shape[0])[:, None] >= row0 - 4)]
    return Image.fromarray(o)


if __name__ == '__main__':
    k = float(sys.argv[1]) if len(sys.argv) > 1 else 0.6
    ORIG.mkdir(exist_ok=True)
    for p in sorted(FACES.glob('*_up.png')):
        face = p.stem.split('_')[0]
        o = ORIG / p.name
        if not o.exists(): shutil.copy2(p, o)
        src = ORIG / f'{face}_down.png' if (ORIG / f'{face}_down.png').exists() else FACES / f'{face}_down.png'
        back_of_head(Image.open(src)).save(p)
        print(p.name, '뒷모습 두상')
    for p in sorted(FACES.glob('*_left.png')) + sorted(FACES.glob('*_right.png')):
        o = ORIG / p.name
        if not o.exists(): shutil.copy2(p, o)
        flatten(Image.open(o), p.stem.split('_')[1], k).save(p)
        print(p.name, '배율', k)
