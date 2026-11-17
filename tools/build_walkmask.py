"""기본 지도에서 '밝은 회색 포장길' 픽셀을 찾아 이동 가능 격자(js/data/walkmask.js)를 만든다.

사용법:  python tools/build_walkmask.py assets/maps/base-map.png js/data/walkmask.js
- 결과는 자동 추출본이다. 손으로 고칠 부분은 js/data/park-data.js 의 walkEdits(추가/제외 사각형·타원)에서 고친다.
- 런타임에서 정문 시작점과 연결된 칸만 실제 이동 영역으로 쓴다(떨어진 섬은 자동 제외).
"""
import sys, numpy as np
from PIL import Image

CELL = 8
src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGB')).astype(int)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
mx, mn = im.max(-1), im.min(-1)
paving = (mx - mn < 38) & (mn > 150) & (b >= r - 6) & (b >= g - 12)
H, W = paving.shape
rows, cols = H // CELL, W // CELL
frac = paving[:rows * CELL, :cols * CELL].reshape(rows, CELL, cols, CELL).mean((1, 3))
STRONG, EDGE = 0.5, 0.18  # 포장 비율: 확실한 길 / 길 가장자리(연석·그늘)


def neighbours(a):
    p = np.pad(a, 1)
    return sum(p[1 + dy:rows + 1 + dy, 1 + dx:cols + 1 + dx].astype(int) for dy in (-1, 0, 1) for dx in (-1, 0, 1))


cells = frac > STRONG
# 길 가장자리: 포장이 조금이라도 섞인 칸이 확실한 길 옆에 붙어 있으면 포함 (두 번 반복 → 최대 16px 넓힘)
for _ in range(2):
    cells = cells | ((frac > EDGE) & (neighbours(cells) >= 3))
cells = cells | (neighbours(cells) >= 6)  # 한 칸짜리 구멍 메우기
lines = [''.join('1' if v else '0' for v in row) for row in cells]
with open(out, 'w', encoding='utf-8') as f:
    f.write('// 자동 생성 파일 (tools/build_walkmask.py). 직접 고치지 말고 park-data.js 의 walkEdits 를 쓰세요.\n')
    f.write('window.MP_WALKMASK = {\n  cell: %d,\n  cols: %d,\n  rows: %d,\n  data: [\n' % (CELL, cols, rows))
    f.write(',\n'.join('    "%s"' % l for l in lines))
    f.write('\n  ]\n};\n')
print('cells', cols, rows, int(cells.sum()))
