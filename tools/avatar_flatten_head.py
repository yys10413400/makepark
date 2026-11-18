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


if __name__ == '__main__':
    k = float(sys.argv[1]) if len(sys.argv) > 1 else 0.6
    ORIG.mkdir(exist_ok=True)
    for p in sorted(FACES.glob('*_left.png')) + sorted(FACES.glob('*_right.png')):
        o = ORIG / p.name
        if not o.exists(): shutil.copy2(p, o)
        flatten(Image.open(o), p.stem.split('_')[1], k).save(p)
        print(p.name, '배율', k)
