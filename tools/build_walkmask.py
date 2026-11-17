"""시즌 지도들에서 '포장길' 픽셀을 찾아 공통 이동 격자(js/data/walkmask.js)를 만든다.

사용법:
  python tools/build_walkmask.py js/data/walkmask.js assets/maps/makepark-christmas.png assets/maps/makepark-normal.png

- 모든 지도에서 길로 판정된 칸만 남긴다(공통 충돌 영역). 시즌을 바꿔도 같은 영역을 쓴다.
- 길 판정: 연보라빛 회색 포장(파랑이 빨강·초록보다 큼). 흰 눈, 흰 연석, 잔디, 건물은 제외된다.
- 결과는 자동 추출본이다. 손으로 고칠 부분은 js/data/park-data.js 의 walkEdits 에서 고친다.
- 런타임에서 정문 시작점과 연결된 칸만 실제 이동 영역으로 쓴다(떨어진 섬은 자동 제외).
"""
import sys
import numpy as np
from PIL import Image

CELL = 8
STRONG = 0.5  # 칸 안의 포장 픽셀 비율이 이 값보다 크면 길


def paving(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    return (b - np.maximum(r, g) >= 8) & (mn > 135) & (mx < 248) & (mx - mn < 70)


def cells_of(path):
    m = paving(path)
    rows, cols = m.shape[0] // CELL, m.shape[1] // CELL
    frac = m[:rows * CELL, :cols * CELL].reshape(rows, CELL, cols, CELL).mean((1, 3))
    cells = frac > STRONG
    p = np.pad(cells, 1)
    nb = sum(p[1 + dy:rows + 1 + dy, 1 + dx:cols + 1 + dx].astype(int) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    return cells | (nb >= 6)  # 한 칸짜리 구멍 메우기


out, maps = sys.argv[1], sys.argv[2:]
common = None
for path in maps:
    c = cells_of(path)
    print(path, 'cells', int(c.sum()))
    common = c if common is None else (common & c)
rows, cols = common.shape
lines = [''.join('1' if v else '0' for v in row) for row in common]
with open(out, 'w', encoding='utf-8') as f:
    f.write('// 자동 생성 파일 (tools/build_walkmask.py). 직접 고치지 말고 park-data.js 의 walkEdits 를 쓰세요.\n')
    f.write('// 원본: %s\n' % ', '.join(p.replace('\\', '/') for p in maps))
    f.write('window.MP_WALKMASK = {\n  cell: %d,\n  cols: %d,\n  rows: %d,\n  data: [\n' % (CELL, cols, rows))
    f.write(',\n'.join('    "%s"' % l for l in lines))
    f.write('\n  ]\n};\n')
print('common cells', cols, rows, int(common.sum()))
