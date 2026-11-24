"""
한옥 옷 학생 캐릭터(기본·건물 보상)의 걷기 그림 모음(makepark-walk-sprites-v4)을 게임용 프레임 시트로 만듭니다.

  python tools/build_hanok_walk.py <풀어 둔 폴더>      # 예: python tools/build_hanok_walk.py assets/characters-src/hanok-walk

걷기 그림 팩(walk.json + PNG)으로 바꾼 캐릭터(js/data/character-packs.js 의 map)는 PNG 를 그대로 쓰므로 여기서 만들지 않습니다.

원본: <폴더>/<세트>/boy.png, girl.png  (2304x768, 192px 칸 12열 x 4줄, 줄 = 앞·왼쪽·오른쪽·뒤)
      <폴더>/<세트>/boy-front.png 가 있으면 그 그림을 앞모습 서 있기 그림으로 씀
결과: assets/characters/<id>-anim.webp, js/data/character-sprites.js 의 <id>
      시트: 줄 = 프레임(12장 + 맨 끝 서 있기 1장), 칸 = down·left·right·up
js/characters.js 는 이 시트로 걷기(12장 차례로)와 서 있기(idle 프레임)를 그립니다.
"""
import json, os, re, sys, time

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'characters')
JS = os.path.join(ROOT, 'js', 'data', 'character-sprites.js')
PACKS = os.path.join(ROOT, 'js', 'data', 'character-packs.js')
CELL, COLS = 192, 12
ROWS = ['down', 'left', 'right', 'up']          # 원본 줄 순서
VIEWS = ['down', 'left', 'right', 'up']          # 결과 시트 칸 순서
BODY_H = 300                                     # js/characters.js 의 BODY_H
MS = 83                                          # 초당 12장
# 세트 폴더 → 게임 그림 id (기본은 성별마다 F1/F2, 보상은 R<n>b / R<n>g)
SETS = {
    'base': ('F1', 'F2'),
    'coaster': ('R1b', 'R1g'),
    'parade': ('R2b', 'R2g'),
    'music-hall': ('R3b', 'R3g'),
    'bumper-cars': ('R4b', 'R4g'),
    'haunted-hanok': ('R5b', 'R5g'),
    'arcade': ('R6b', 'R6g'),
    'star-courtyard': ('R7b', 'R7g'),
    'tori-lunchbox': ('R8b', 'R8g'),
    'souvenir': ('R9b', 'R9g'),
}


def clean(cell):
    """희미한 배경 안개·떨어진 작은 점을 지우고 캐릭터 덩어리만 남김."""
    a = cell[..., 3].astype(np.int32)
    a[a < 28] = 0
    lab, n = ndimage.label(a > 0)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        big = sizes.max()
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes >= max(80, big * 0.01)
        a[~keep[lab]] = 0
    out = cell.copy()
    out[..., 3] = a.astype(np.uint8)
    out[a == 0] = 0
    return out


def bbox(cell):
    ys, xs = np.where(cell[..., 3] > 0)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def leg_width(cell):
    """아래쪽 20% 의 너비(두 발이 모일수록 좁음)."""
    x0, y0, x1, y1 = bbox(cell)
    low = cell[y1 - (y1 - y0) // 5:y1, :, 3] > 0
    xs = np.where(low.any(0))[0]
    return xs.max() - xs.min()


def load_frames(path, cw=CELL, ch=CELL):
    im = np.array(Image.open(path).convert('RGBA'))
    return {v: [clean(im[r * ch:(r + 1) * ch, k * cw:(k + 1) * cw]) for k in range(COLS)]
            for r, v in enumerate(ROWS)}


def build(fr, front, sid, k, ms=MS):
    """fr: 방향별 프레임 12장. front: 앞모습 서 있기 그림(없으면 None)."""
    idle = {v: int(np.argmin([leg_width(c) for c in fr[v]])) for v in VIEWS}
    extra = {v: (front if (v == 'down' and front is not None) else fr[v][idle[v]]) for v in VIEWS}
    boxes = {}
    for v in VIEWS:
        bs = [bbox(c) for c in fr[v] + [extra[v]]]
        x0 = max(0, min(b[0] for b in bs) - 2); y0 = max(0, min(b[1] for b in bs) - 2)
        x1 = min(fr[v][0].shape[1], max(b[2] for b in bs) + 2); y1 = min(fr[v][0].shape[0], max(b[3] for b in bs) + 2)
        # 발 기준점: 프레임마다 아래쪽 끝(가장 낮은 곳) 중 가장 많이 쓰인 높이, 가로는 몸 가운데의 중앙값
        foot_y = int(np.median([b[3] for b in bs]))
        foot_x = float(np.median([(b[0] + b[2]) / 2 for b in bs]))
        boxes[v] = (x0, y0, x1, y1, foot_x, foot_y)
    row_h = int(max(b[3] - b[1] for b in boxes.values()) + 4)
    xs, x = {}, 4
    for v in VIEWS:
        xs[v] = x; x += boxes[v][2] - boxes[v][0] + 4
    sheet = Image.new('RGBA', (x, row_h * (COLS + 1) + 4), (0, 0, 0, 0))
    for v in VIEWS:
        x0, y0, x1, y1 = boxes[v][:4]
        for i, c in enumerate(fr[v] + [extra[v]]):
            sheet.paste(Image.fromarray(c[y0:y1, x0:x1]), (xs[v], 4 + i * row_h))
    # 시트는 실제 크기 그대로(k = 그림 키 / BODY_H 로 그릴 때 맞춤)
    sheet.save(os.path.join(OUT, sid + '-anim.webp'), 'WEBP', quality=92, alpha_quality=100, method=4)
    views = {v: [int(xs[v]), 4, int(boxes[v][2] - boxes[v][0]), int(boxes[v][3] - boxes[v][1]),
                 round(float(boxes[v][4] - boxes[v][0]), 1), int(boxes[v][5] - boxes[v][1])] for v in VIEWS}
    src = 'assets/characters/' + sid + '-anim.webp'
    still = {v: [r[0], r[1] + COLS * row_h, r[2], r[3], r[4], r[5]] for v, r in views.items()}
    return {
        'src': src, 'k': k, 'views': still,
        'anim': {'src': src, 'frames': COLS, 'ms': ms, 'k': k, 'rowH': int(row_h), 'views': views,
                 'idle': {v: COLS for v in VIEWS}},
    }


def idle_h(fr, front):
    c = front if front is not None else fr['down'][int(np.argmin([leg_width(c) for c in fr['down']]))]
    b = bbox(c)
    return b[3] - b[1]


def old_idle_h(m):
    """지금 게임에 들어 있는 그림의 앞모습 서 있기 키(원본 px)와 k."""
    return m['views']['down'][3], m.get('k', 1)


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    txt = open(JS, encoding='utf-8').read()
    head = txt[:txt.index('window.MP_CHAR_SPRITES')]
    meta = json.loads(txt[txt.index('{'):txt.index('};') + 1])
    srcdir = sys.argv[1]
    data = {}
    for s, ids in SETS.items():
        for g, sid in zip(('boy', 'girl'), ids):
            p = os.path.join(srcdir, s, g + '.png')
            fp = os.path.join(srcdir, s, g + '-front.png')
            front = clean(np.array(Image.open(fp).convert('RGBA'))) if os.path.exists(fp) else None
            data[sid] = (load_frames(p), front)
    # 크기: 기본 캐릭터 둘의 앞모습 서 있기 키를 BODY_H 로 봄 → 모든 세트에 같은 비율(원본끼리 키 차이는 그대로)
    hs = []
    for sid in ('F1', 'F2'):
        fr, front = data[sid]
        c = front if front is not None else fr['down'][int(np.argmin([leg_width(c) for c in fr['down']]))]
        b = bbox(c); hs.append(b[3] - b[1])
    k = round(float(np.mean(hs)) / BODY_H, 4)
    packed = set(re.findall(r"^\s+([FR]\d+[bg]?): \[", open(PACKS, encoding='utf-8').read(), re.M))
    for sid, (fr, front) in data.items():
        if sid in packed:
            continue   # 걷기 그림 팩 PNG 를 그대로 씀
        meta[sid] = build(fr, front, sid, k)
        print(sid, 'ok')
    save(head, meta)


def save(head, meta):
    with open(JS, 'w', encoding='utf-8') as fo:
        fo.write(head + 'window.MP_CHAR_SPRITES = ' + json.dumps(meta, ensure_ascii=False, indent=1, sort_keys=True) + ';\n'
                 + "window.MP_CHAR_VER = '" + time.strftime('%Y%m%d%H%M%S') + "';\n")


if __name__ == '__main__':
    main()
