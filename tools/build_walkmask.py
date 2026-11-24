"""시즌 지도들에서 '포장길' 픽셀을 찾아 공통 이동 격자(js/data/walkmask.js)를 만든다.

사용법:
  python tools/build_walkmask.py js/data/walkmask.js assets/maps/makepark-christmas.webp assets/maps/makepark-normal.webp --ground assets/maps/makepark-normal-ground.png
  (--ground: 땅 지도에서 길인 칸을 더함. 땅 지도는 이 격자를 씨앗으로 만들므로, 그림을 바꾸면 이 도구 → build_ground_mask.py → 이 도구(--ground) 순서로)

- 모든 지도에서 길로 판정된 칸만 남긴다(공통 충돌 영역). 시즌을 바꿔도 같은 영역을 쓴다.
- 길 판정: 밝은 분홍빛 베이지 포장(빨강 > 초록 > 파랑, 밝음). 눈, 물, 잔디, 건물은 제외된다.
  같은 판정을 js/game.js 의 isPavingPixel 에서도 써서 건물 가림 레이어를 만든다(둘을 함께 고칠 것).
- 결과는 자동 추출본이다. 손으로 고칠 부분은 js/data/park-data.js 의 walkEdits 에서 고친다.
- 런타임에서 정문 시작점과 연결된 칸만 실제 이동 영역으로 쓴다(떨어진 섬은 자동 제외).
"""
import sys
import numpy as np
from PIL import Image

CELL = 4
STRONG = 0.5  # 칸 안의 포장 픽셀 비율이 이 값보다 크면 길
CURB = 2      # 포장길 가장자리의 흐린 경계 픽셀만 포함(크게 넓히면 얇은 울타리를 넘어감)
SMOOTH = 1    # 가장자리의 한 칸짜리 홈을 메워 키보드 이동 때 걸리지 않게 함


WORLD = (1448, 1086)  # 게임 좌표계(1배 지도) 크기. 2배 지도도 이 크기로 줄여서 판정


def paving(path):
    im = Image.open(path).convert('RGB')
    if im.size != WORLD:
        im = im.resize(WORLD, Image.LANCZOS)
    a = np.asarray(im).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r > 215) & (r - g >= 20) & (r - g <= 48) & (g - b >= -4) & (g - b <= 26) & (b > 160)


def dilate(m, r):
    # 반지름 r 원 모양으로 넓히기 (numpy만 사용)
    out = m.copy()
    H, W = m.shape
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r or (dx == 0 and dy == 0):
                continue
            ys, yd = (slice(dy, H), slice(0, H - dy)) if dy >= 0 else (slice(0, H + dy), slice(-dy, H))
            xs, xd = (slice(dx, W), slice(0, W - dx)) if dx >= 0 else (slice(0, W + dx), slice(-dx, W))
            out[yd, xd] |= m[ys, xs]
    return out


def cells_of(path):
    m = dilate(paving(path), CURB)
    rows, cols = m.shape[0] // CELL, m.shape[1] // CELL
    frac = m[:rows * CELL, :cols * CELL].reshape(rows, CELL, cols, CELL).mean((1, 3))
    cells = frac > STRONG
    p = np.pad(cells, 1)
    nb = sum(p[1 + dy:rows + 1 + dy, 1 + dx:cols + 1 + dx].astype(int) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    return cells | (nb >= 6)  # 한 칸짜리 구멍 메우기


def ground_cells(path, shape):
    # 땅 지도(tools/build_ground_mask.py 결과, 불투명 = 길)에서 반 이상이 길인 칸
    a = Image.open(path).convert('LA').resize(WORLD, Image.BILINEAR)
    g = np.asarray(a)[..., 1] > 128
    rows, cols = shape
    return g[:rows * CELL, :cols * CELL].reshape(rows, CELL, cols, CELL).mean((1, 3)) > 0.5


args = sys.argv[1:]
grounds = []
while '--ground' in args:
    i = args.index('--ground'); grounds.append(args[i + 1]); del args[i:i + 2]
out, maps = args[0], args[1:]
common = None
for path in maps:
    c = cells_of(path)
    print(path, 'cells', int(c.sum()))
    common = c if common is None else (common & c)
# 색 판정이 놓친 길 가장자리·얼룩진 곳을 땅 지도로 채움(땅 지도는 길 덩어리와 이어진 길 색만 담고 있어 더 정확함)
for gp in grounds:
    gc = ground_cells(gp, common.shape)
    print(gp, 'adds', int((gc & ~common).sum()))
    common = common | gc
# 닫기(넓혔다가 같은 만큼 줄이기): 길 가장자리의 작은 홈·튀어나온 점을 정리
def erode(m, r):
    return ~dilate(~m, r)
common = erode(dilate(common, SMOOTH), SMOOTH) | common
rows, cols = common.shape
lines = [''.join('1' if v else '0' for v in row) for row in common]
with open(out, 'w', encoding='utf-8') as f:
    f.write('// 자동 생성 파일 (tools/build_walkmask.py). 직접 고치지 말고 park-data.js 의 walkEdits 를 쓰세요.\n')
    f.write('// 원본: %s\n' % ', '.join(p.replace('\\', '/') for p in maps))
    f.write('window.MP_WALKMASK = {\n  cell: %d,\n  cols: %d,\n  rows: %d,\n  data: [\n' % (CELL, cols, rows))
    f.write(',\n'.join('    "%s"' % l for l in lines))
    f.write('\n  ]\n};\n')
print('common cells', cols, rows, int(common.sum()))
