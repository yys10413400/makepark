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
from PIL import Image, ImageDraw
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


def clear_paper(im):
    """종이 바탕색에 가까운 픽셀은 투명하게(조각을 붙인 자리에 네모 자국이 남지 않게). 글자·선만 남김"""
    a = np.array(im).astype(int)
    d = np.abs(a[..., :3] - np.array([246, 234, 215])).sum(-1)
    a[..., 3] = np.clip((d - 14) * 12, 0, 255) * (a[..., 3] > 0)
    return Image.fromarray(a.astype('uint8'))


def nine_slice(src, w, h, c):
    """모서리(c px)는 그대로 두고 가장자리·가운데만 늘려 w×h 로"""
    W, H = src.size
    out = Image.new('RGBA', (w, h))
    xs = [(0, c, 0, c), (c, W - c, c, w - c), (W - c, W, w - c, w)]
    ys = [(0, c, 0, c), (c, H - c, c, h - c), (H - c, H, h - c, h)]
    for sx0, sx1, dx0, dx1 in xs:
        for sy0, sy1, dy0, dy1 in ys:
            piece = src.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.LANCZOS)
            out.alpha_composite(piece, (dx0, dy0))
    return out


# 가로 손님 기록판: 받은 세로 기록판(1024×1356)의 테두리·제목·'통과'/'잠깐!' 머리글·카드 칸을 잘라 가로로 다시 놓음
# (새로 그리지 않고 받은 그림 조각만 씀). 왼쪽 두 칸 = 통과, 오른쪽 두 칸 = 잠깐!
WIDE = (1600, 820)


def build_wide_board(board):
    W, H = WIDE
    # 테두리: 모서리는 그대로, 가장자리는 글자·칸이 없는 깨끗한 줄무늬만 늘림
    BW, BH, c = board.width, board.height, 110
    out = Image.new('RGBA', (W, H))
    for sx, dx in ((0, 0), (BW - c, W - c)):
        for sy, dy in ((0, 0), (BH - c, H - c)):
            out.alpha_composite(board.crop((sx, sy, sx + c, sy + c)), (dx, dy))
    out.alpha_composite(board.crop((150, 0, 300, c)).resize((W - 2 * c, c), Image.LANCZOS), (c, 0))
    out.alpha_composite(board.crop((150, BH - c, 300, BH)).resize((W - 2 * c, c), Image.LANCZOS), (c, H - c))
    out.alpha_composite(board.crop((0, 1236, c, 1246)).resize((c, H - 2 * c), Image.LANCZOS), (0, c))
    out.alpha_composite(board.crop((BW - c, 1236, BW, 1246)).resize((c, H - 2 * c), Image.LANCZOS), (W - c, c))
    out.alpha_composite(board.crop((300, 1236, 700, 1246)).resize((W - 2 * c, H - 2 * c), Image.LANCZOS), (c, c))
    title = clear_paper(board.crop((345, 48, 684, 140)))
    out.alpha_composite(title, ((W - title.width) // 2, 22))
    s = 0.78
    for (y0, y1), cx in (((165, 262), W // 4 + 10), ((697, 800), W * 3 // 4 - 10)):
        head = clear_paper(board.crop((40, y0, 985, y1)))
        head = head.resize((int(head.width * s), int(head.height * s)), Image.LANCZOS)
        out.alpha_composite(head, (cx - head.width // 2, 128))
    # 가운데 세로 구분선(머리글 선과 같은 색)
    line_col = tuple(int(v) for v in np.array(board)[215, 120])
    d = ImageDraw.Draw(out)
    d.line([(W // 2, 150), (W // 2, H - 50)], fill=line_col, width=4)
    slot = board.crop((52, 280, 498, 669))
    slots = []
    cw, ch, top = 345, 548, 228
    for x in (55, 420, W // 2 + 35, W // 2 + 400):
        out.alpha_composite(nine_slice(slot, cw, ch, 48), (x, top))
        slots.append({'x': round(x / W * 100, 3), 'y': round(top / H * 100, 3), 'w': round(cw / W * 100, 3), 'h': round(ch / H * 100, 3)})
    out.save(os.path.join(OUT, 'record-board-wide.webp'), 'WEBP', quality=92, method=6)
    return {'w': W, 'h': H, 'slots': slots}


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
    meta['record-board-wide'] = build_wide_board(part)
    for bg in ('lobby.webp', 'checkpoint.webp'):
        shutil.copyfile(os.path.join(SRC, bg), os.path.join(OUT, bg))
    print(json.dumps(meta, indent=1))


if __name__ == '__main__':
    main()
