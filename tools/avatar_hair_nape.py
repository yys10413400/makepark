# 옆모습 머리의 뒷머리를 아래로 늘려 뒤통수 아랫부분(귀 뒤 피부)을 덮기
#   python tools/avatar_hair_nape.py [머리번호 ...]     (기본: 1~8 전부)
# 받은 머리 그림은 뒷머리가 짧아 옆모습에서 귀 뒤 두상 아래쪽 피부가 드러남.
# 귀 뒤쪽 열마다 머리 아래 끝을 두상 아래 끝 근처까지 세로로 늘림(정수리 쪽은 그대로, 귀 쪽으로 갈수록 덜 늘림).
# 늘리기 전 그림은 assets/avatar/worn-base/ 에 두고 항상 그것에서 다시 만듭니다.
import shutil, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WORN = ROOT / 'assets' / 'avatar' / 'worn'
BASE = ROOT / 'assets' / 'avatar' / 'worn-base'
FACE = ROOT / 'assets' / 'avatar' / 'faces' / '1_left.png'
HR = 56
EAR_BACK, RAMP = 153, 5      # 왼쪽 보기 기준: 귀 뒤 끝 x, 여기서부터 RAMP px 동안 늘리는 양을 0→100%
TOP = 120                    # 이 높이(칸 좌표)부터 아래만 늘림: 정수리 모양은 그대로
MARGIN = 2                   # 두상 아래 끝보다 이만큼 위까지 덮음
MAX_STRETCH = 2.2            # 한 열을 최대 몇 배까지 늘릴지(너무 늘어나 보이지 않게)
EXCEPT = {}                  # (번호, 방향): 건너뛸 것
# 짧은 머리: 뒷머리를 더 길게. 귀 앞쪽(START)부터 서서히 늘려 귀도 덮고, 두상 아래 끝보다 EXTRA px 더 내려 목·후드 위까지
SHORT = {'1': dict(START=112, RAMP=34, EXTRA=8, MAX=3.0, ENV=25),
         '2': dict(START=112, RAMP=34, EXTRA=8, MAX=3.0, ENV=25),
         '3': dict(START=112, RAMP=34, EXTRA=8, MAX=3.0, ENV=25),
         '8': dict(START=112, RAMP=34, EXTRA=8, MAX=3.0, ENV=25)}


def face_bottom():
    f = np.array(Image.open(FACE))[..., 3] > 40
    fb = np.full(f.shape[1], -1)
    for x in range(f.shape[1]):
        ys = np.where(f[:, x])[0]
        if len(ys): fb[x] = ys.max() + HR
    return fb


def stretch(im, fb, START=EAR_BACK, RAMP=RAMP, EXTRA=-MARGIN, MAX=MAX_STRETCH, SMOOTH=7, OPEN=0, ENV=1):
    """왼쪽 보기 그림(오른쪽 보기는 좌우를 뒤집어 넣음)의 귀 뒤 열을 세로로 늘림"""
    if OPEN:   # 가는 머리 가닥 끝은 늘리면 길쭉한 선이 되므로 먼저 지움(귀 근처 아래쪽만)
        from PIL import ImageFilter
        al0 = im.getchannel('A')
        opened = al0.filter(ImageFilter.MinFilter(OPEN)).filter(ImageFilter.MaxFilter(OPEN))
        a0 = np.array(im.convert('RGBA'))
        keep = np.array(opened).astype(np.float32)
        zone = np.zeros(a0.shape[:2], bool); zone[TOP + 30:, START:] = True
        a0[..., 3] = np.where(zone, np.minimum(a0[..., 3], keep), a0[..., 3]).astype(np.uint8)
        im = Image.fromarray(a0)
    a = np.array(im.convert('RGBA')).astype(np.float32)
    H, W = a.shape[:2]
    al = a[..., 3] > 100
    pm = a.copy(); pm[..., :3] *= a[..., 3:] / 255
    out = pm.copy()
    yy = np.arange(H, dtype=np.float32)
    # 열마다 늘릴 비율 계산 후 가로로 부드럽게
    ratio = np.ones(W)
    # 열마다 머리 아래 끝. ENV>1 이면 이웃 열 중 가장 긴 끝을 씀: 긴 머리 가닥 옆 짧은 가닥만 길쭉하게 늘어나지 않게
    bot = np.array([np.where(al[:, x])[0].max() if al[:, x].any() else -1 for x in range(W)])
    if ENV > 1:
        bot = np.array([bot[max(0, x - ENV // 2):x + ENV // 2 + 1].max() if bot[x] >= 0 else -1 for x in range(W)])
    last = -1
    for x in range(START, W):
        if fb[x] >= 0: last = fb[x]
        if last < 0: continue
        if bot[x] <= TOP: continue
        b, t = bot[x], last + EXTRA
        if t <= b: continue
        r = min(MAX, (t - TOP) / (b - TOP))
        ramp = min(1, (x - START) / RAMP)
        ratio[x] = 1 + (r - 1) * ramp
    k = np.ones(SMOOTH) / SMOOTH
    ratio = np.convolve(np.pad(ratio, SMOOTH // 2, mode='edge'), k, mode='valid')
    for x in range(W):
        if ratio[x] <= 1.001: continue
        src = np.where(yy > TOP, TOP + (yy - TOP) / ratio[x], yy)
        for c in range(4): out[:, x, c] = np.interp(src, yy, pm[:, x, c])
    al2 = out[..., 3:]
    out[..., :3] = np.where(al2 > 0, out[..., :3] * 255 / np.maximum(al2, 1e-3), 0)
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


if __name__ == '__main__':
    nums = sys.argv[1:] or [str(n) for n in range(1, 9)]
    BASE.mkdir(exist_ok=True)
    fb = face_bottom()
    for n in nums:
        for d in ('left', 'right'):
            name = f'hair_{n}_{d}.png'
            b = BASE / name
            if not b.exists(): shutil.copy2(WORN / name, b)
            im = Image.open(b).convert('RGBA')
            if (n, d) in EXCEPT: im.save(WORN / name); continue
            kw = dict(SHORT.get(n, {}), SMOOTH=15) if n in SHORT else {}
            if d == 'right': im = stretch(im.transpose(Image.FLIP_LEFT_RIGHT), fb, **kw).transpose(Image.FLIP_LEFT_RIGHT)
            else: im = stretch(im, fb, **kw)
            im.save(WORN / name)
            print(name)
