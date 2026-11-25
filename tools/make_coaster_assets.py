# 코스터역(블록으로 선로 만들기) 그림 만들기: python tools/make_coaster_assets.py
# 원본(assets/coaster-src, 새 그림은 assets/coaster-src/v2) → 게임용(assets/coaster)
#  - lobby.webp           대기실 배경 1672×941 (coaster-src/lobby.webp)
#  - turtle-S/N/W/E       거북이 역장 4방향 (v2/turtle-4dir: 왼위=앞 S, 오위=뒤 N, 왼아래=왼쪽 W, 오아래=오른쪽 E)
#  - rail-h, rail-v       직선 레일 / rail-ne, se, sw, nw 커브 레일(이어지는 두 방향 이름) (v2/rails)
#  - station, station-goal 출발역(파란 깃발) / 도착역(체크무늬 깃발) (v2/stations)
#  - tulip, sunflower, grass  꽃 두 가지와 잔디 칸 (v2/flowers-grass)
#  - coaster              손님이 탄 맨 앞 칸 (v2/coaster-riders)
#  - car-E/W/N/S          뒤따르는 빈 칸 4방향 (v2/cars-4view: 왼위=오른쪽으로 감 E, 오위=W, 왼아래=뒷모습 N, 오아래=앞모습 S)
# 레일 맞물림: 커브는 오른쪽 위(북·동을 잇는) 조각을, 두 끝의 레일 가운데가 칸 가장자리 가운데에 오도록 잘라 씀
# (끝의 둥근 마개는 잘라 내서 이음매가 매끄럽게). 직선은 세로 조각 가운데의 침목 한 칸씩을 이어 붙여
# 커브와 같은 레일 간격(칸 크기 대비)이 되게 만듦.
# ※ turtle-S 는 tools/build_hanok_npcs.py 도 덮어씀(대기 움직임 0번 프레임) — 새 4방향 그림을 쓰려면 이 스크립트를 나중에 실행
import os
from PIL import Image
import numpy as np
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'coaster-src')
V2 = os.path.join(SRC, 'v2')
OUT = os.path.join(ROOT, 'assets', 'coaster')
TILE = 192


def load(path):
    return Image.open(path).convert('RGBA')


def clean(im, cut=40):
    a = np.array(im)
    a[a[..., 3] < cut] = 0
    return Image.fromarray(a)


def pieces(im, min_area=20000):
    """시트에서 떨어진 그림 조각마다 (상자, 그 조각만 남긴 그림)을 위→아래, 왼→오른쪽 순서로"""
    a = np.array(im)
    lab, _ = ndimage.label(ndimage.binary_dilation(a[..., 3] > 30, iterations=6))
    out = []
    for i, s in enumerate(ndimage.find_objects(lab), 1):
        if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) < min_area:
            continue
        b = a.copy()
        b[lab != i] = 0
        out.append(((s[1].start, s[0].start, s[1].stop, s[0].stop), Image.fromarray(b)))
    out.sort(key=lambda p: (p[0][1] // 300, p[0][0]))
    return out


def bbox_crop(im, pad=4):
    a = np.array(im)[..., 3] > 30
    ys, xs = np.where(a)
    return im.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), min(im.width, xs.max() + pad + 1), min(im.height, ys.max() + pad + 1)))


def fit_h(im, h):
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def fit_w(im, w):
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def save(im, name, q=90):
    im.save(os.path.join(OUT, name + '.webp'), quality=q, method=6)
    print(name, im.size)


def red_runs(v):
    """한 줄에서 빨간 레일이 지나는 구간들의 가운데 위치"""
    idx = np.where(v)[0]
    if not len(idx):
        return []
    groups = np.split(idx, np.where(np.diff(idx) > 3)[0] + 1)
    return [g.mean() for g in groups if len(g) >= 8]


def is_red(a):
    a = a.astype(int)
    return (a[..., 0] > 170) & (a[..., 1] < 120) & (a[..., 2] < 120) & (a[..., 3] > 128)


os.makedirs(OUT, exist_ok=True)

# 대기실
lobby = Image.open(os.path.join(SRC, 'lobby.webp')).convert('RGB').resize((1672, 941), Image.LANCZOS)
lobby.save(os.path.join(OUT, 'lobby.webp'), quality=84, method=6)
print('lobby', lobby.size)

# 거북이 4방향
for d, (b, im) in zip('SNWE', pieces(clean(load(os.path.join(V2, 'turtle-4dir.webp'))))):
    save(fit_h(bbox_crop(im), 240), 'turtle-' + d)

# 레일: 조각 순서 = 가로 직선, 세로 직선, 오른쪽 위 커브, (아래 커브 셋)
rp = pieces(clean(load(os.path.join(V2, 'rails.webp'))))
(vb, vim), (cb, cim) = rp[1], rp[2]

# 커브(북·동): 세로 끝의 레일 가운데 x, 가로 끝의 레일 가운데 y
ca = np.array(cim)
red = is_red(ca)
top_y = cb[1] + 30
xs = red_runs(red[top_y, cb[0]:cb[2]])
xc, gauge = cb[0] + (xs[0] + xs[-1]) / 2, xs[-1] - xs[0]
right_x = cb[2] - 45
ys = red_runs(red[cb[1]:cb[3], right_x])
yc = cb[1] + (ys[0] + ys[-1]) / 2
cy = cb[1] + 18                  # 위쪽 둥근 마개를 잘라 냄
R = yc - cy                      # 칸 반쪽
cx = xc + R
print('curve: xc %.1f yc %.1f gauge %.1f R %.1f → 칸 %d px, 레일 간격 비율 %.3f' % (xc, yc, gauge, R, 2 * R, gauge / (2 * R)))
ne = cim.crop((round(cx - 2 * R), round(cy), round(cx), round(cy + 2 * R))).resize((TILE, TILE), Image.LANCZOS)
save(ne, 'rail-ne')
save(ne.rotate(-90, expand=True), 'rail-se')     # 시계 방향 90°: 북→동, 동→남
save(ne.rotate(180, expand=True), 'rail-sw')
save(ne.rotate(90, expand=True), 'rail-nw')

# 직선(세로): 침목 가운데를 기준으로 한 칸씩 잘라 이어 붙임
va = np.array(vim)
vred = is_red(va)
mid_y = (vb[1] + vb[3]) // 2
vx = red_runs(vred[mid_y, vb[0]:vb[2]])
vxc, vgauge = vb[0] + (vx[0] + vx[-1]) / 2, vx[-1] - vx[0]
probe = round(vb[0] + vx[0] - vgauge * 0.18)      # 왼쪽 레일 바깥, 침목만 지나는 세로줄
col = va[:, probe, 3] > 100
runs = np.split(np.where(col)[0], np.where(np.diff(np.where(col)[0]) > 2)[0] + 1)
centers = [r.mean() for r in runs if 30 < len(r) < 70]   # 침목(맨 끝의 큰 마개 덩어리는 뺌)
period = float(np.mean(np.diff(centers)))
inner = centers[1:-1] or centers
W = round(vgauge * 2 * R / gauge)               # 커브와 같은 비율이 되는 칸 너비(원본 픽셀)
n = max(1, round(W / period))
ph = round(period)
strip = Image.new('RGBA', (W, n * ph), (0, 0, 0, 0))
for i in range(n):
    c = inner[i % len(inner)]
    seg = vim.crop((round(vxc - W / 2), round(c - period / 2), round(vxc - W / 2) + W, round(c - period / 2) + ph))
    strip.alpha_composite(seg, (0, i * ph))
v = strip.resize((TILE, TILE), Image.LANCZOS)
# 이음매 맞추기: 커브 북쪽 끝 바로 안쪽 줄의 레일 단면(굵기·위치·빛)을 직선 칸 전체 길이에 그대로 칠함
na = np.array(ne)
prof = na[2].copy()
va2 = np.array(v)
old = ndimage.binary_dilation(is_red(va2).mean(axis=0) > 0.6, iterations=1)   # 원래 직선의 (가는) 레일 세로줄
new = prof[:, 3] > 200                                                          # 커브 끝 단면의 레일 세로줄
both = old | new
for c in np.where(old & ~new)[0]:               # 새 레일이 덮지 않는 옛 레일 줄은 바로 바깥 줄(침목·빈칸)로 채움
    d = 1
    while True:
        side = [x for x in (c - d, c + d) if 0 <= x < TILE and not both[x]]
        if side:
            va2[:, c] = va2[:, side[0]]
            break
        d += 1
rails = Image.new('RGBA', (TILE, TILE), (0, 0, 0, 0))
ra = np.array(rails)
ra[:, new] = prof[new]
v = Image.alpha_composite(Image.fromarray(va2), Image.fromarray(ra))
print('straight: gauge %.1f period %.1f → %d칸 이어 붙임' % (vgauge, period, n))
save(v, 'rail-v')
save(v.rotate(90, expand=True), 'rail-h')

# 역(출발=파란 깃발, 도착=체크무늬 깃발)
sp = pieces(clean(load(os.path.join(V2, 'stations.webp'))))
save(fit_w(bbox_crop(sp[0][1]), 360), 'station')
save(fit_w(bbox_crop(sp[1][1]), 360), 'station-goal')

# 꽃·잔디
fp = pieces(clean(load(os.path.join(V2, 'flowers-grass.webp'))))
save(fit_h(bbox_crop(fp[0][1]), 220), 'sunflower')
save(fit_h(bbox_crop(fp[1][1]), 220), 'tulip')
save(bbox_crop(fp[2][1], 0).resize((TILE, TILE), Image.LANCZOS), 'grass')

# 코스터: 손님 탄 앞 칸 + 빈 칸 4방향
save(fit_w(bbox_crop(clean(load(os.path.join(V2, 'coaster-riders.webp')), 60)), 420), 'coaster')
for d, (b, im) in zip('EWNS', pieces(clean(load(os.path.join(V2, 'cars-4view.webp')), 60))):
    save(fit_h(bbox_crop(im), 260), 'car-' + d)
