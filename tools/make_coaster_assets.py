# 코스터역(블록으로 선로 만들기) 그림 만들기: python tools/make_coaster_assets.py
# 원본(assets/coaster-src) → 게임용(assets/coaster)
#  - lobby.webp        대기실 배경 1672×941
#  - turtle-S/N/W/E    거북이 역장 4방향(앞·뒤·왼쪽·오른쪽을 보는 모습)
#  - rail-h, rail-v    직선 레일 / rail-ne, se, sw, nw 커브 레일(이어지는 두 방향 이름)
#  - station, tulip, sunflower, coaster
# 레일 맞물림: 직선은 칸 가운데(50%)를 지나고, 커브 원본은 왼쪽 아래 모서리를 중심으로 한 사분원이라
# 레일 가운데 반지름(≈592px)이 칸 반쪽이 되도록 잘라 가장자리 가운데에서 직선과 이어지게 함
import os
from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'coaster-src')
OUT = os.path.join(ROOT, 'assets', 'coaster')
TILE = 192


def load(name):
    return Image.open(os.path.join(SRC, name)).convert('RGBA')


def clean(im, cut=40):
    a = np.array(im)
    a[a[..., 3] < cut] = 0
    return Image.fromarray(a)


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


os.makedirs(OUT, exist_ok=True)

# 대기실
lobby = Image.open(os.path.join(SRC, 'lobby.webp')).convert('RGB').resize((1672, 941), Image.LANCZOS)
lobby.save(os.path.join(OUT, 'lobby.webp'), quality=84, method=6)
print('lobby', lobby.size)

# 거북이 4방향: 왼쪽 위=앞(아래를 봄 S), 오른쪽 위=뒤(위를 봄 N), 왼쪽 아래=왼쪽(W), 오른쪽 아래=오른쪽(E)
t4 = clean(load('turtle-4dir.webp'))
hw, hh = t4.width // 2, t4.height // 2
for d, (x, y) in {'S': (0, 0), 'N': (1, 0), 'W': (0, 1), 'E': (1, 1)}.items():
    save(fit_h(bbox_crop(t4.crop((x * hw, y * hh, (x + 1) * hw, (y + 1) * hh))), 240), 'turtle-' + d)

# 레일
st = clean(load('rail-straight.webp'))           # 1254 정사각형, 레일 가운데 y≈625
h = st.resize((TILE, TILE), Image.LANCZOS)
save(h, 'rail-h')
save(h.rotate(90, expand=True), 'rail-v')
cv = clean(load('rail-curve.webp'))              # 서쪽(왼쪽)과 남쪽(아래)을 잇는 사분원
# 원본에서 왼쪽 끝 레일 가운데 y≈661, 아래 끝 레일 가운데 x≈581 → 두 끝이 모두 칸 가장자리 가운데가 되게
T, X0 = 1185, -11
sw = cv.crop((X0, cv.height - T, X0 + T, cv.height)).resize((TILE, TILE), Image.LANCZOS)
save(sw, 'rail-sw')
save(sw.rotate(-90, expand=True), 'rail-nw')     # 시계 방향 90°: 서→북, 남→서
save(sw.rotate(180, expand=True), 'rail-ne')
save(sw.rotate(90, expand=True), 'rail-se')

# 역·꽃·코스터
save(fit_w(bbox_crop(clean(load('station.webp'))), 360), 'station')
fl = clean(load('flowers.webp'))
save(fit_h(bbox_crop(fl.crop((0, 0, fl.width // 2, fl.height))), 220), 'tulip')
save(fit_h(bbox_crop(fl.crop((fl.width // 2, 0, fl.width, fl.height))), 220), 'sunflower')
save(fit_w(bbox_crop(clean(load('coaster.webp'), 60)), 420), 'coaster')
