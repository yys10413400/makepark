"""우리말 글마루 그림 만들기

받은 원본(assets/geulmaru-src)을 게임용 그림(assets/geulmaru)으로 나눕니다.

  python -I tools/build_geulmaru.py

원본 → 결과
  lobby.webp            정원으로 열린 조선 서재 로비(1672×941) → lobby.webp 그대로(로비·게임 배경)
  book.webp             전통 문양의 빈 오픈북 → book.webp (투명 여백만 자르고 비율 그대로, 폭 1400)
  star-lamps.webp       별등 두 개(왼쪽 꺼짐·오른쪽 켜짐) → lamp-off.webp, lamp-on.webp (같은 크기·같은 기준점)
  beomi-sheet.webp      범이 4×4: 1~2행 정답 8프레임, 3~4행 오답 설명 8프레임 → beomi.webp (16칸 가로 띠)
  sori-sheet.webp       소리 4×4: 1~2행 정답 날갯짓, 3~4행 오답 갸웃 → sori.webp (16칸 가로 띠)
  greeting-sheet.webp   범이와 소리 입장 인사 4×2 → greet.webp (8칸 가로 띠)

맞추는 방법
  - 칸마다 원본 칸(가로 cols·세로 rows 등분)만 잘라 옆 프레임이 섞이지 않게 함
  - 크기는 모든 프레임 그대로(프레임마다 확대·축소하지 않음)
  - 세로: 칸 안 높이를 그대로 둠 → 발 위치·소리의 점프 높이가 원본 그대로
  - 가로: 범이는 발(아래쪽 끝) 가운데, 소리는 발 가운데, 인사 시트는 범이 신발 가운데를 모든 프레임 같은 x 로
    (원본 범이 시트는 칸보다 좁은 간격으로 그려져 칸마다 32px씩 왼쪽으로 밀려 있어 그대로 쓰면 옆으로 미끄러짐)
  - 결과 칸 크기는 모든 프레임을 담는 가장 작은 크기 + 여백. 발 기준점은 아래 FOOT 로 출력(js/geulmaru/ui.js 에 같은 값)
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'geulmaru-src')
OUT = os.path.join(ROOT, 'assets', 'geulmaru')
T = 40  # 불투명으로 볼 알파 값


def cells(name, cols, rows):
    im = Image.open(os.path.join(SRC, name)).convert('RGBA')
    W, H = im.size
    return [im.crop((round(c * W / cols), round(r * H / rows), round((c + 1) * W / cols), round((r + 1) * H / rows)))
            for r in range(rows) for c in range(cols)]


def alpha(im):
    return np.asarray(im)[..., 3] > T


def foot_x(im, x_max=None, rows=8):
    """아래 끝에서 rows 줄 안 불투명 픽셀의 가로 가운데(x_max 보다 왼쪽만: 인사 시트에서 소리 발 빼기)"""
    a = alpha(im)
    ys, _ = np.nonzero(a)
    yb = ys.max()
    band = a[yb - rows:yb + 1]
    if x_max is not None:
        band = band[:, :x_max]
    xs = np.nonzero(band.any(0))[0]
    return (xs.min() + xs.max()) / 2


def strip(frames, anchors, pad=6):
    """anchors[i] = 프레임 i 의 기준 x. 모두 같은 x 에 오도록 옮겨 한 줄 띠로. → (띠 그림, 칸 w, h, 기준 x, 아래 발 y)"""
    boxes = []
    for f, ax in zip(frames, anchors):
        a = alpha(f)
        ys, xs = np.nonzero(a)
        boxes.append((xs.min() - ax, ys.min(), xs.max() - ax, ys.max()))
    left = min(b[0] for b in boxes) - pad
    right = max(b[2] for b in boxes) + pad
    top = max(0, min(b[1] for b in boxes) - pad)
    bottom = max(b[3] for b in boxes) + pad
    w, h = int(np.ceil(right - left)), int(bottom - top)
    out = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, (f, ax) in enumerate(zip(frames, anchors)):
        cell = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        cell.alpha_composite(f, (int(round(-left - ax)), int(-top)))
        out.alpha_composite(cell, (i * w, 0))
    foot_y = max(b[3] for b in boxes[:1]) - top   # 0번(기본 자세) 발 아래 끝
    return out, w, h, round(-left), int(foot_y)


def main():
    os.makedirs(OUT, exist_ok=True)
    Image.open(os.path.join(SRC, 'lobby.webp')).convert('RGB').save(os.path.join(OUT, 'lobby.webp'), quality=88)

    # 책: 투명 여백만 자르고 비율 그대로
    book = Image.open(os.path.join(SRC, 'book.webp')).convert('RGBA')
    a = alpha(book)
    ys, xs = np.nonzero(a)
    book = book.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    if book.width > 1400:
        book = book.resize((1400, round(book.height * 1400 / book.width)), Image.LANCZOS)
    book.save(os.path.join(OUT, 'book.webp'), quality=90)
    print('book', book.size, 'ratio %.4f' % (book.width / book.height))

    # 별등: 왼쪽·오른쪽 반을 각각 잘라 같은 크기 캔버스, 같은 기준(고리 위 가운데)
    lamps = Image.open(os.path.join(SRC, 'star-lamps.webp')).convert('RGBA')
    halves = [lamps.crop((0, 0, lamps.width // 2, lamps.height)), lamps.crop((lamps.width // 2, 0, lamps.width, lamps.height))]
    bbs = []
    for hlf in halves:
        ys, xs = np.nonzero(alpha(hlf))
        bbs.append((xs.min(), ys.min(), xs.max(), ys.max()))
    w = max(b[2] - b[0] for b in bbs) + 1 + 24
    h = max(b[3] - b[1] for b in bbs) + 1 + 24
    for name, hlf, b in zip(['lamp-off', 'lamp-on'], halves, bbs):
        cx = (b[0] + b[2]) / 2
        c = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        c.alpha_composite(hlf, (int(round(w / 2 - cx)), int(12 - b[1])))
        c = c.resize((round(w * 200 / h), 200), Image.LANCZOS)
        c.save(os.path.join(OUT, name + '.webp'), quality=92)
        print(name, c.size)

    # 범이: 칸마다 발 가운데를 같은 x 로
    fr = cells('beomi-sheet.webp', 4, 4)
    im, w, h, fx, fy = strip(fr, [foot_x(f) for f in fr])
    im.save(os.path.join(OUT, 'beomi.webp'), quality=92)
    print('beomi cell', w, h, 'foot', fx, fy)

    # 소리: 발 가운데를 같은 x 로(점프 높이는 그대로)
    fr = cells('sori-sheet.webp', 4, 4)
    im, w, h, fx, fy = strip(fr, [foot_x(f) for f in fr])
    im.save(os.path.join(OUT, 'sori.webp'), quality=92)
    print('sori cell', w, h, 'foot', fx, fy)

    # 입장 인사: 범이 신발(칸 왼쪽 280px 안) 가운데를 같은 x 로
    fr = cells('greeting-sheet.webp', 4, 2)
    im, w, h, fx, fy = strip(fr, [foot_x(f, x_max=280, rows=20) for f in fr])
    im.save(os.path.join(OUT, 'greet.webp'), quality=92)
    print('greet cell', w, h, 'foot(범이)', fx, fy)


if __name__ == '__main__':
    main()
