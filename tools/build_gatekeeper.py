"""문지기의 비밀 규칙 그림 만들기

받은 원본(assets/gatekeeper-src)을 게임용 그림(assets/gatekeeper)으로 나눕니다.
- 시트(아이템 2×2, 아이 2×2, 유령 3×2)는 칸마다 그림 덩어리를 찾아 투명 여백을 잘라 냅니다.
- 배경(로비·검문대)과 기록판은 그대로 옮깁니다(기록판은 투명 여백만 자름).
잘린 위치(원본 시트 기준)는 js/gatekeeper/sprites.js 에 적어 둡니다. 손·배지 기준점은 그 파일에서 손으로 맞춥니다.

실행: python tools/build_gatekeeper.py
"""
import json
import os
import shutil

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'gatekeeper-src')
OUT = os.path.join(ROOT, 'assets', 'gatekeeper')

SHEETS = {
    'items-sheet.webp': (2, 2, ['item-star', 'item-moon', 'item-key', 'item-lantern']),
    'kids-sheet.webp': (2, 2, ['boy-full', 'girl-full', 'boy-bust', 'girl-bust']),
    'ghost-sheet.webp': (3, 2, ['ghost-idle', 'ghost-hello', 'ghost-think', 'ghost-pass', 'ghost-stop', 'ghost-cheer']),
}


def trim(im, pad=4):
    a = np.array(im)[:, :, 3]
    ys, xs = np.where(a > 8)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(im.width, x1 + pad), min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1)), (int(x0), int(y0))


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for name, (cols, rows, ids) in SHEETS.items():
        im = Image.open(os.path.join(SRC, name)).convert('RGBA')
        cw, ch = im.width / cols, im.height / rows
        # 칸 경계를 넘는 그림(머리카락 등)이 있어, 덩어리마다 무게중심이 들어간 칸으로 나눔
        alpha = np.array(im)[:, :, 3] > 8
        lab, n = ndimage.label(alpha, structure=np.ones((3, 3)))
        cms = ndimage.center_of_mass(alpha, lab, range(1, n + 1))
        sizes = ndimage.sum(alpha, lab, range(1, n + 1))
        for i, sid in enumerate(ids):
            c, r = i % cols, i // cols
            keep = [k + 1 for k, (cy, cx) in enumerate(cms)
                    if sizes[k] > 30 and int(cx // cw) == c and int(cy // ch) == r]
            mask = np.isin(lab, keep)
            arr = np.array(im)
            arr[:, :, 3] = np.where(mask, arr[:, :, 3], 0)
            ys, xs = np.where(mask)
            pad = 4
            box = (max(0, xs.min() - pad), max(0, ys.min() - pad), min(im.width, xs.max() + 1 + pad), min(im.height, ys.max() + 1 + pad))
            part = Image.fromarray(arr).crop(box)
            part.save(os.path.join(OUT, sid + '.webp'), 'WEBP', quality=92, method=6)
            meta[sid] = {'w': part.width, 'h': part.height, 'sheetX': int(box[0]), 'sheetY': int(box[1])}
    # 꾸밈 색 바꾸기용 덮개: 머리핀·신발 픽셀만 남긴 그림. 게임에서 색조(hue-rotate)만 바꿔 위에 겹침
    # (얼굴·옷은 그대로 두고, 판정과 상관없는 머리핀·신발 색만 손님마다 달라 보이게)
    def overlay(sid, name, region, test):
        arr = np.array(Image.open(os.path.join(OUT, sid + '.webp')).convert('RGBA')).astype(int)
        r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
        x0, y0, x1, y1 = region
        m = np.zeros(r.shape, bool)
        m[y0:y1, x0:x1] = test(r, g, b)[y0:y1, x0:x1]
        m = ndimage.binary_closing(m, iterations=2) & (arr[..., 3] > 0)
        out = arr.copy()
        out[..., 3] = np.where(m, arr[..., 3], 0)
        Image.fromarray(out.astype('uint8')).save(os.path.join(OUT, sid + '-' + name + '.webp'), 'WEBP', quality=92, method=6)

    pink = lambda r, g, b: (r > 180) & (r - g > 50) & (b - g > 10)
    blue = lambda r, g, b: (b > 120) & (b - r > 40)
    overlay('girl-full', 'pin', (150, 40, 240, 130), pink)
    overlay('girl-bust', 'pin', (240, 80, 350, 180), pink)
    overlay('girl-full', 'shoes', (0, 440, 264, 524), pink)
    overlay('boy-full', 'shoes', (0, 450, 261, 535), blue)

    board = Image.open(os.path.join(SRC, 'record-board.webp')).convert('RGBA')
    part, (ox, oy) = trim(board, pad=0)
    part.save(os.path.join(OUT, 'record-board.webp'), 'WEBP', quality=92, method=6)
    meta['record-board'] = {'w': part.width, 'h': part.height, 'sheetX': ox, 'sheetY': oy}
    for bg in ('lobby.webp', 'checkpoint.webp'):
        shutil.copyfile(os.path.join(SRC, bg), os.path.join(OUT, bg))
    print(json.dumps(meta, indent=1))


if __name__ == '__main__':
    main()
