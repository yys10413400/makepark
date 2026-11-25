"""
구름동산 에셋 만들기
------------------------------------------------------------
받은 원본(assets/cloudpark-src/)을 그대로 두고, 아이템 하나하나를 투명 WebP 로 잘라 assets/cloudpark/ 에 씁니다.
  - map-hanok-sage-1448x1086.webp  → assets/cloudpark/map.webp (크기·비율 그대로, 다시 압축만)
  - items-15-sheet.webp            → 기본 아이템 15종
  - items-dir-16-sheet.webp        → 벤치 4방향 · 돌담 연결 10종 · 나무 산책로 가로/세로

자르는 방법: 알파(불투명도)로 이어진 덩어리를 찾아, 각 칸(행·열)에 중심이 들어오는 덩어리만 모읍니다.
           옆 칸 덩어리 픽셀은 지우고, 투명 여백은 2px 만 남기고 잘라 냅니다. 색·비율은 손대지 않습니다.
           (원본 알파가 대부분 253 이라 아주 살짝 비쳐 보여서, 245 이상은 255 로 맞춰 길 타일이 겹칠 때 비치지 않게 함)
           길 타일 3종은 테두리 그림자까지 포함한 '네모 안쪽'만 잘라 이어 붙일 때 틈이 없게 합니다.

실행: python -I tools/build_cloudpark.py   (결과 크기·기준점은 tools/cloudpark-cuts.json 에도 적어 둠)
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'cloudpark-src')
OUT = os.path.join(ROOT, 'assets', 'cloudpark')

# 칸 이름: 행마다 왼쪽부터
SHEET15 = [
    ['path-brick', 'path-stone', 'path-wood', 'tree-pine', 'tree-round'],
    ['tree-cherry', 'shrub', 'flower-pink', 'flower-white', 'rock'],
    ['bench', 'lantern', 'wall', 'hanok', 'pavilion'],
]
SHEET16 = [
    ['bench-front', 'bench-right', 'bench-back', 'bench-left'],
    ['wall-h', 'wall-v', 'wall-corner-bl', 'wall-corner-br'],
    ['wall-corner-tl', 'wall-corner-tr', 'wall-end-left', 'wall-end-right'],
    ['wall-end-top', 'wall-end-bottom', 'path-wood-h', 'path-wood-v'],
]
TILES = {'path-brick', 'path-stone', 'path-wood', 'path-wood-h', 'path-wood-v'}


def cut_sheet(name, grid):
    im = Image.open(os.path.join(SRC, name)).convert('RGBA')
    a = np.array(im)
    alpha = a[..., 3]
    mask = alpha > 8
    lab, k = ndimage.label(mask)
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(mask, lab, range(1, k + 1))
    cents = ndimage.center_of_mass(mask, lab, range(1, k + 1))
    big = [i for i in range(k) if sizes[i] > 1500]
    # 큰 덩어리 중심으로 행·열 경계를 정함
    rows = len(grid)
    ys = sorted(cents[i][0] for i in big)
    # 행: 중심 y 를 rows 개로 나눔(k-means 1차원 대신 정렬 후 큰 간격)
    gaps = sorted(range(1, len(ys)), key=lambda j: ys[j] - ys[j - 1], reverse=True)[:rows - 1]
    ycuts = sorted((ys[j] + ys[j - 1]) / 2 for j in gaps)
    def row_of(cy):
        return sum(cy > c for c in ycuts)
    out = {}
    for r, names in enumerate(grid):
        members = [i for i in big if row_of(cents[i][0]) == r]
        members.sort(key=lambda i: cents[i][1])
        assert len(members) == len(names), (name, r, len(members))
        xs = [cents[i][1] for i in members]
        xcuts = [(xs[j] + xs[j - 1]) / 2 for j in range(1, len(xs))]
        for c, nm in enumerate(names):
            x0 = xcuts[c - 1] if c else -1
            x1 = xcuts[c] if c < len(xcuts) else 1e9
            y0 = ycuts[r - 1] if r else -1
            y1 = ycuts[r] if r < len(ycuts) else 1e9
            # 이 칸에 중심이 있는 모든 덩어리(작은 꽃잎·그림자 조각 포함)
            keep = [i + 1 for i in range(k) if x0 <= cents[i][1] < x1 and y0 <= cents[i][0] < y1]
            sel = np.isin(lab, keep)
            # 덩어리 바깥의 아주 옅은 가장자리(알파 1~8)도 포함: 선택 영역을 3px 넓혀서 그 안의 픽셀은 살림
            grow = ndimage.binary_dilation(sel, iterations=3) & (alpha > 0)
            other = mask & ~sel
            grow &= ~ndimage.binary_dilation(other, iterations=1)
            yy, xx = np.where(grow)
            bx0, by0, bx1, by1 = xx.min(), yy.min(), xx.max() + 1, yy.max() + 1
            piece = a[by0:by1, bx0:bx1].copy()
            piece[..., 3] = np.where(grow[by0:by1, bx0:bx1], piece[..., 3], 0)
            if nm in TILES:
                piece = square_tile(piece)
            else:
                pad = 2
                piece = np.pad(piece, ((pad, pad), (pad, pad), (0, 0)))
            al = piece[..., 3]
            piece[..., 3] = np.where(al >= 245, 255, al)
            # 완전히 투명한 픽셀의 색은 0 으로(가장자리 번짐 방지)
            piece[piece[..., 3] == 0] = 0
            out[nm] = piece
    return out


def square_tile(piece):
    """길 타일: 둥근 모서리·바깥 그림자를 빼고 안쪽 네모만 남겨 이어 붙였을 때 틈이 없게."""
    al = piece[..., 3] >= 250
    h, w = al.shape
    rows = al.mean(axis=1)
    cols = al.mean(axis=0)
    # 가로·세로로 90% 이상 꽉 찬 줄만
    ys = np.where(rows > 0.9)[0]
    xs = np.where(cols > 0.9)[0]
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    # 둥근 모서리가 들어오지 않도록 3px 더 안쪽
    inset = 3
    y0, y1, x0, x1 = y0 + inset, y1 - inset, x0 + inset, x1 - inset
    # 가운데 정사각형(칸에 넣을 때 늘이거나 줄이지 않게)
    side = min(y1 - y0, x1 - x0)
    cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
    y0, x0 = cy - side // 2, cx - side // 2
    t = piece[y0:y0 + side, x0:x0 + side].copy()
    t[..., 3] = 255
    return t


def bottom_anchor(piece):
    """바닥 기준점: 불투명 픽셀의 가장 아래 줄의 가운데."""
    al = piece[..., 3] > 128
    ys, xs = np.where(al)
    by = ys.max()
    row = xs[ys >= by - 6]
    return int(round((row.min() + row.max()) / 2)), int(by)


MASK_CELL = 8
GRASS = (129, 179, 98)
GATE_BOX = (548, 820, 862, 1000)   # 한옥 입구(전경 레이어로 다시 그릴 영역)


def build_masks(m):
    """잔디(꾸밀 수 있는 곳)와 걸을 수 있는 곳을 8px 칸으로. 개울·외곽 숲·꽃밭 테두리·입구는 빠짐."""
    a = np.array(m).astype(int)
    d = np.sqrt(((a - np.array(GRASS)) ** 2).sum(axis=2))
    g = d < 26
    lab, k = ndimage.label(g)
    sizes = ndimage.sum(g, lab, range(1, k + 1))
    g = lab == (int(np.argmax(sizes)) + 1)
    g = ndimage.binary_fill_holes(g)
    g = ndimage.binary_opening(g, iterations=4)
    # 입구 그림(지붕·기둥) 자리는 잔디가 비쳐 보여도 빼기: 기둥 사이 아래쪽만 걸을 수 있게
    gx0, gy0, gx1, gy1 = GATE_BOX
    gate = np.zeros_like(g)
    gate[gy0:gy1, gx0:gx1] = ~g[gy0:gy1, gx0:gx1]
    walk = ndimage.binary_erosion(g, iterations=6)
    place = ndimage.binary_erosion(g, iterations=10)
    # 입구 바로 안쪽(캐릭터가 나타나는 곳)은 비워 둠
    place[800:1000, 600:812] = False

    def cells(mask):
        h, w = mask.shape
        cw, ch = (w + MASK_CELL - 1) // MASK_CELL, (h + MASK_CELL - 1) // MASK_CELL
        rows = []
        for cy in range(ch):
            r = []
            for cx in range(cw):
                blk = mask[cy * MASK_CELL:(cy + 1) * MASK_CELL, cx * MASK_CELL:(cx + 1) * MASK_CELL]
                r.append('1' if blk.size and blk.mean() > 0.99 else '0')
            rows.append(''.join(r))
        return cw, ch, rows
    cw, ch, wrows = cells(walk)
    _, _, prows = cells(place)
    js = ['/* 구름동산 지도(assets/cloudpark/map.webp, 1448×1086) 칸 정보 — tools/build_cloudpark.py 가 만듦. 손으로 고치지 마세요.',
          ' * walk: 걸을 수 있는 잔디(개울·외곽 숲·꽃밭 테두리·입구 지붕 빼고) · place: 아이템을 놓을 수 있는 잔디(가장자리에서 조금 더 안쪽, 입구 앞 빈터 뺌)',
          ' * 한 글자 = 8×8px 칸, 1 = 됨 */',
          'window.MP_CLOUD_MASK = {', '  cell: %d, cols: %d, rows: %d,' % (MASK_CELL, cw, ch),
          '  walk: [', ',\n'.join("    '%s'" % r for r in wrows), '  ],',
          '  place: [', ',\n'.join("    '%s'" % r for r in prows), '  ]', '};', '']
    with open(os.path.join(ROOT, 'js', 'data', 'cloudpark-mask.js'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(js))
    # 입구 전경: 입구 영역에서 잔디가 아닌 픽셀(지붕·기둥·초롱)만 남긴 투명 그림
    rgba = np.dstack([a.astype(np.uint8), np.where(gate, 255, 0).astype(np.uint8)])
    crop = rgba[gy0:gy1, gx0:gx1]
    Image.fromarray(crop, 'RGBA').save(os.path.join(OUT, 'gate-front.webp'), 'WEBP', quality=95, method=6)


def main():
    os.makedirs(OUT, exist_ok=True)
    m = Image.open(os.path.join(SRC, 'map-hanok-sage-1448x1086.webp')).convert('RGB')
    m.save(os.path.join(OUT, 'map.webp'), 'WEBP', quality=95, method=6)
    build_masks(m)
    info = {}
    pieces = {}
    pieces.update(cut_sheet('items-15-sheet.webp', SHEET15))
    pieces.update(cut_sheet('items-dir-16-sheet.webp', SHEET16))
    for nm, p in pieces.items():
        img = Image.fromarray(p, 'RGBA')
        img.save(os.path.join(OUT, nm + '.webp'), 'WEBP', quality=94, method=6, exact=False)
        ax, ay = bottom_anchor(p)
        info[nm] = {'w': int(p.shape[1]), 'h': int(p.shape[0]), 'footX': ax, 'footY': ay}
    with open(os.path.join(ROOT, 'tools', 'cloudpark-cuts.json'), 'w', encoding='utf-8') as f:
        json.dump(info, f, ensure_ascii=False, indent=1)
    for nm in sorted(info):
        print(nm, info[nm])


if __name__ == '__main__':
    sys.exit(main())
