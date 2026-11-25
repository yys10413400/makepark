"""한옥 옷을 입은 시설 캐릭터(2026-11-24 받은 시트)를 게임용 그림으로 바꿉니다.

  python -I tools/build_hanok_npcs.py

받은 시트(투명 배경, 칸마다 한 프레임) → 예전 그림과 같은 캔버스·같은 발 위치·같은 키로 맞춰 저장합니다.
그래서 게임 코드의 크기·발 기준값(foot, base 등)은 그대로 씁니다.
  - 칸 안 좌표 → 캔버스 좌표 변환은 모든 프레임에 똑같이 적용(0번 프레임의 발 가운데·아래 끝 기준)
    → 걷기 발 들기, 둥실 떠오르기처럼 그림 안에 든 움직임이 그대로 남음
  - 키(배율)는 0번 프레임 키를 예전 0번 프레임 키에 맞춤

원본 → 결과
  coaster-src/turtle-idle-hanok.webp (4×2)    → coaster/turtle-idle-00~07, turtle-front(0번), turtle-S(대화 얼굴, 0번)
  picnic-src/tori-sprites-hanok.webp (4×2)    → picnic/tori-idle-00~07
  arcade-src/pixel-hanok-sheet.webp (4×2)     → arcade/pixel-walk(8칸 띠), pixel-idle(0번)
  thrill-src/toto-hanok-sheet.webp (4×2)      → thrill/toto(8칸 띠), toto-face(0번 윗부분)
  gatekeeper-src/ghost-float-hanok.webp (4×2) → gatekeeper/ghost-float-00~07, ghost-float-idle, ghost-hello, ghost-idle
  parade-src/riri-opening-hanok-a/b.webp (2×2 두 장) → parade/riri-opening(640 칸 4×2, 발 (370, 608))
  gatekeeper-src/lobby.webp                   → gatekeeper/lobby.webp
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda p: os.path.join(ROOT, 'assets', p)


def cells(path, cols, rows):
    im = Image.open(A(path)).convert('RGBA')
    W, H = im.size
    return [im.crop((round(c * W / cols), round(r * H / rows), round((c + 1) * W / cols), round((r + 1) * H / rows)))
            for r in range(rows) for c in range(cols)]


def bbox(im, t=40):
    a = np.asarray(im)[..., 3] > t
    ys, xs = np.nonzero(a)
    return xs.min(), ys.min(), xs.max(), ys.max()


def foot_anchor(im, frac=0.06):
    """아래 끝 y 와, 아래쪽 frac 높이 안 불투명 픽셀의 가로 가운데"""
    x0, y0, x1, y1 = bbox(im)
    h = max(2, int((y1 - y0) * frac))
    a = np.asarray(im)[y1 - h:y1 + 1, :, 3] > 40
    xs = np.nonzero(a)[1]
    return (xs.min() + xs.max()) / 2, y1


def place_all(frames, size, anchor, height):
    """frames(칸 그림) → size 캔버스들. 0번 프레임 발(anchor)·키(height) 기준, 모든 프레임 같은 변환"""
    ax, ay = foot_anchor(frames[0])
    b = bbox(frames[0])
    k = height / (b[3] - b[1] + 1)
    out = []
    for f in frames:
        g = f.resize((round(f.width * k), round(f.height * k)), Image.LANCZOS)
        c = Image.new('RGBA', size, (0, 0, 0, 0))
        c.alpha_composite(g, (round(anchor[0] - ax * k), round(anchor[1] - ay * k)))
        out.append(c)
    return out


def old_anchor(path, crop=None):
    im = Image.open(A(path)).convert('RGBA')
    if crop:
        im = im.crop(crop)
    x0, y0, x1, y1 = bbox(im)
    ax, ay = foot_anchor(im)
    return (ax, ay), y1 - y0 + 1


def tight(im, pad=4):
    x0, y0, x1, y1 = bbox(im, 8)
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + 1 + pad), min(im.height, y1 + 1 + pad)))


def fit_h(im, h):
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def save(im, path, q=92):
    im.save(A(path), 'WEBP', quality=q, alpha_quality=100, method=6)


def strip(frames, w, h):
    s = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        s.alpha_composite(f, (i * w, 0))
    return s


report = {}

# 거북 역장(코스터)
anc, hgt = old_anchor('coaster/turtle-idle-00.webp')
fr = place_all(cells('coaster-src/turtle-idle-hanok.webp', 4, 2), (384, 384), anc, hgt)
for i, f in enumerate(fr):
    save(f, 'coaster/turtle-idle-%02d.webp' % i)
save(fr[0], 'coaster/turtle-front.webp')
save(fit_h(tight(fr[0]), Image.open(A('coaster/turtle-S.webp')).height), 'coaster/turtle-S.webp', 90)
report['turtle bottoms'] = [int(bbox(f)[3]) for f in fr]

# 토리(도시락)
anc, hgt = old_anchor('picnic/tori-idle-00.webp')
fr = place_all(cells('picnic-src/tori-sprites-hanok.webp', 4, 2), (384, 384), anc, hgt)
for i, f in enumerate(fr):
    save(f, 'picnic/tori-idle-%02d.webp' % i)
report['tori bottoms'] = [int(bbox(f)[3]) for f in fr]

# 픽셀(아케이드): 걷기 8칸 띠 + 대기 0번
anc, hgt = old_anchor('arcade/pixel-idle.webp')
fr = place_all(cells('arcade-src/pixel-hanok-sheet.webp', 4, 2), (300, 420), anc, hgt)
save(strip(fr, 300, 420), 'arcade/pixel-walk.webp')
save(fr[0], 'arcade/pixel-idle.webp')

# 토토(범퍼카)
anc, hgt = old_anchor('thrill/toto.webp', (0, 0, 300, 440))
fr = place_all(cells('thrill-src/toto-hanok-sheet.webp', 4, 2), (300, 440), anc, hgt)
save(strip(fr, 300, 440), 'thrill/toto.webp')
x0, y0, x1, y1 = bbox(fr[0])
save(fr[0].crop((x0, y0, x1 + 1, y0 + int((y1 - y0) * 0.52))), 'thrill/toto-face.webp')

# 문지기 유령(유령의 집): 로비 떠다니기 8프레임 + 대화용 자세
anc, hgt = old_anchor('gatekeeper/ghost-float-00.webp')
fr = place_all(cells('gatekeeper-src/ghost-float-hanok.webp', 4, 2), (384, 384), anc, hgt)
for i, f in enumerate(fr):
    save(f, 'gatekeeper/ghost-float-%02d.webp' % i)
save(fr[0], 'gatekeeper/ghost-float-idle.webp')
for n in ('ghost-hello', 'ghost-idle'):
    save(fit_h(tight(fr[0]), Image.open(A('gatekeeper/%s.webp' % n)).height), 'gatekeeper/%s.webp' % n)
report['ghost bottoms'] = [int(bbox(f)[3]) for f in fr]

# 리리(퍼레이드) 인사: 서기 → 새침 → 치마 인사 → 새침 → 꼬리깃 조금씩 펼치기
a = cells('parade-src/riri-opening-hanok-a.webp', 2, 2)
b = cells('parade-src/riri-opening-hanok-b.webp', 2, 2)
order = [b[0], a[0], b[1], a[1], a[2], b[2], a[3], b[3]]
# 발 기준점을 (370, 608)에 둠 — 꼬리깃을 활짝 편 7번 프레임이 발보다 왼쪽으로 345px 넘게 펼쳐져
# 예전 기준(320)이면 칸 왼쪽에서 잘림. 몸 키 581(예전 그림과 같음). js/parade 의 RIRI_FOOT_X 와 같은 값
RIRI_FOOT = (370, 608)
fr = place_all(order, (640, 640), RIRI_FOOT, 581)
sheet = Image.new('RGBA', (2560, 1280), (0, 0, 0, 0))
for i, f in enumerate(fr):
    sheet.alpha_composite(f, ((i % 4) * 640, (i // 4) * 640))
sheet.save(A('parade/riri-opening.webp'), 'WEBP', quality=90, alpha_quality=100, method=6)
report['riri bottoms'] = [int(bbox(f)[3]) for f in fr]

# 유령의 집 로비
Image.open(A('gatekeeper-src/lobby.webp')).convert('RGB').save(A('gatekeeper/lobby.webp'), 'WEBP', quality=88)

for k, v in report.items():
    print(k, v)
