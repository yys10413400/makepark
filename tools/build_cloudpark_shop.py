"""
구름동산 상점(추억 상점) 아이템 그림 만들기
------------------------------------------------------------
받은 시트 5장(assets/cloudpark-src/shop/, 원본 그대로 보관)을 아이템 하나하나 투명 WebP 로 잘라 assets/cloudpark/shop/ 에 씁니다.
  season-12.png          사계절 한옥 놀이공원 장식 12종 (봄·여름·가을·겨울 각 3개 — 그 계절에만 살 수 있음)
  facility-9.png         별마당 아홉 가지 장식 (놀이기구·건물 기념 장식)
  rides-6.png            조선풍 한옥 놀이기구 6종
  village-9.png          한국 전통마을 소품 3×3
  trees-houses-10.png    나무 5종 + 한옥 가게 5종

자르는 방법: 시트마다 행·열 경계(px)를 적어 두고, 알파로 이어진 덩어리를 중심이 들어가는 칸에 모읍니다.
  한 덩어리가 두 칸에 걸치면(꽃집·기념품 가게가 2px 붙어 있음) 경계선에서 픽셀 단위로 나눕니다.
  옆 칸 픽셀은 지우고 투명 여백은 2px 만 남깁니다. 색·비율은 손대지 않습니다(알파 245 이상만 255 로).
실행: python -I tools/build_cloudpark_shop.py   (크기·바닥 기준점은 tools/cloudpark-shop-cuts.json 에도 적어 둠)
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'cloudpark-src', 'shop')
OUT = os.path.join(ROOT, 'assets', 'cloudpark', 'shop')

# 시트: (파일, 행 경계 y, 행마다 열 경계 x, 행마다 칸 이름)
SHEETS = [
    ('season-12.png', [362, 710, 1058], [[355, 725]] * 4, [
        ['sp-cherry-garden', 'sp-picnic-pavilion', 'sp-flower-cart'],
        ['su-water-spout', 'su-cool-pavilion', 'su-bingsu-stand'],
        ['au-maple-garden', 'au-harvest-pavilion', 'au-moon-lantern'],
        ['wi-christmas-tree', 'wi-snowman-yard', 'wi-gift-sled'],
    ]),
    ('facility-9.png', [342, 670], [[520, 1006]] * 3, [
        ['fx-coaster', 'fx-ghost', 'fx-parade'],
        ['fx-melody', 'fx-picnic', 'fx-thrill'],
        ['fx-arcade', 'fx-geulmaru', 'fx-shapes'],
    ]),
    ('rides-6.png', [505], [[487, 1000], [514, 1000]], [
        ['ride-ferris', 'ride-carousel', 'ride-coaster'],
        ['ride-viking', 'ride-teacup', 'ride-train'],
    ]),
    ('village-9.png', [385, 755], [[430, 870]] * 3, [
        ['vl-lotus-pond', 'vl-waterfall', 'vl-fountain'],
        ['vl-bridge', 'vl-flower-arch', 'vl-jangdok'],
        ['vl-sotdae', 'vl-jangseung', 'vl-bell'],
    ]),
    ('trees-houses-10.png', [380], [[400, 790, 1190, 1590], [400, 775, 1186, 1582]], [
        ['tr-maple', 'tr-bamboo', 'tr-ginkgo', 'tr-hydrangea', 'tr-plum'],
        ['hs-thatch', 'hs-pavilion2', 'hs-teahouse', 'hs-flowershop', 'hs-souvenir'],
    ]),
]


def cell_of(y, x, ycuts, xcuts_rows):
    r = sum(y >= c for c in ycuts)
    c = sum(x >= v for v in xcuts_rows[r])
    return r, c


def cut_sheet(fname, ycuts, xcuts_rows, names):
    a = np.array(Image.open(os.path.join(SRC, fname)).convert('RGBA'))
    h, w = a.shape[:2]
    alpha = a[..., 3]
    mask = alpha > 8
    lab, k = ndimage.label(mask)
    cents = ndimage.center_of_mass(mask, lab, range(1, k + 1))
    objs = ndimage.find_objects(lab)
    # 칸 번호 지도: 덩어리는 중심이 든 칸으로, 두 칸에 걸친 큰 덩어리는 픽셀 위치로
    owner = np.full((h, w), -1, dtype=np.int32)
    yy, xx = np.mgrid[0:h, 0:w]
    for i in range(k):
        sl = objs[i]
        m = lab[sl] == i + 1
        r0, c0 = cell_of(cents[i][0], cents[i][1], ycuts, xcuts_rows)
        cy0, cy1, cx0, cx1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        rA, cA = cell_of(cy0, cx0, ycuts, xcuts_rows)
        rB, cB = cell_of(cy1 - 1, cx1 - 1, ycuts, xcuts_rows)
        big = m.sum() > 20000
        sub = owner[sl]
        if big and (rA, cA) != (rB, cB):
            ys, xs = yy[sl][m], xx[sl][m]
            ids = []
            for y, x in zip(ys, xs):
                r, c = cell_of(y, x, ycuts, xcuts_rows)
                ids.append(r * 10 + c)
            sub[m] = np.array(ids)
        else:
            sub[m] = r0 * 10 + c0
    out = {}
    for r, row in enumerate(names):
        for c, nm in enumerate(row):
            sel = owner == r * 10 + c
            # 아주 옅은 가장자리(알파 1~8)도 같은 칸이면 살림
            grow = ndimage.binary_dilation(sel, iterations=2) & (alpha > 0) & ((owner == -1) | sel)
            ys, xs = np.where(grow)
            assert len(ys), (fname, nm)
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            piece = a[y0:y1, x0:x1].copy()
            piece[..., 3] = np.where(grow[y0:y1, x0:x1], piece[..., 3], 0)
            piece = np.pad(piece, ((2, 2), (2, 2), (0, 0)))
            al = piece[..., 3]
            piece[..., 3] = np.where(al >= 245, 255, al)
            piece[piece[..., 3] == 0] = 0
            out[nm] = piece
    return out


def bottom_anchor(p):
    al = p[..., 3] > 128
    ys, xs = np.where(al)
    by = ys.max()
    row = xs[ys >= by - 6]
    return int(round((row.min() + row.max()) / 2)), int(by)


def main():
    os.makedirs(OUT, exist_ok=True)
    info = {}
    for fname, ycuts, xcuts, names in SHEETS:
        for nm, p in cut_sheet(fname, ycuts, xcuts, names).items():
            Image.fromarray(p, 'RGBA').save(os.path.join(OUT, nm + '.webp'), 'WEBP', quality=92, method=6)
            fx, fy = bottom_anchor(p)
            info[nm] = [int(p.shape[1]), int(p.shape[0]), fx, fy]
    with open(os.path.join(ROOT, 'tools', 'cloudpark-shop-cuts.json'), 'w', encoding='utf-8') as f:
        json.dump(info, f, ensure_ascii=False, indent=1)
    js = ['/* 추억 상점 아이템 그림 크기·바닥 기준점 [폭, 높이, 발 x, 발 y] — tools/build_cloudpark_shop.py 가 만듦. 손으로 고치지 마세요. */',
          'window.MP_CLOUD_SHOP_CUTS = ' + json.dumps(info, ensure_ascii=False, sort_keys=True) + ';', '']
    with open(os.path.join(ROOT, 'js', 'data', 'cloudpark-shop-cuts.js'), 'w', encoding='utf-8') as f:
        f.write('
'.join(js))
    for nm in info:
        print(nm, info[nm])


if __name__ == '__main__':
    main()
