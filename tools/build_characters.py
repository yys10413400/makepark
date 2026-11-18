"""
캐릭터 원본 그림(assets/characters-src/*.png, 제미나이 3칸 시트)을 게임용 그림으로 만듭니다.

  python tools/build_characters.py

하는 일 (캐릭터마다)
 1. 평평한 회색 배경을 투명하게 지웁니다. (테두리와 이어진 배경색 영역만 지우므로, 외곽선 안쪽의 흰 옷은 남습니다)
 2. 작은 조각(제미나이 별 표시, 글자, 반짝이)을 지웁니다.
 3. 앞·뒤·옆 3칸으로 나눕니다. (왼쪽부터 앞, 뒤, 옆모습. 왼쪽을 보는 옆모습은 SIDE_FACES_LEFT 로 뒤집어 오른쪽을 보게)
 4. 세 칸을 같은 배율로 키를 맞춥니다: 앞모습 키(모자 제외 보정값 HAT) 가 BODY_H 가 되게.
 5. 색을 지도에 맞게 조금 진하게(enhance) 하고, 한 캐릭터의 세 칸을 한 장(assets/characters/<id>.webp)에 나란히 붙이고,
    칸마다 위치와 발 기준점을 js/data/character-sprites.js 에 적습니다.

왼쪽을 볼 때는 게임에서 옆모습(right)을 좌우로 뒤집어 그립니다.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'characters-src')
OUT = os.path.join(ROOT, 'assets', 'characters')
JS = os.path.join(ROOT, 'js', 'data', 'character-sprites.js')

BODY_H = 300          # 모자를 뺀 몸 키(픽셀). 게임에서 이 높이를 지도 위 몇 px로 그릴지 정합니다.
PAD = 4
# 모자·헬멧 때문에 전체 키가 커 보이는 캐릭터: 전체 키 = 몸 키 × HAT
HAT = {
    'R1b': 1.06, 'R1g': 1.06, 'R2b': 1.28, 'R2g': 1.28, 'R3g': 1.02, 'R5g': 1.10,
    'R6g': 1.04, 'R7g': 1.03,
    'S1': 1.08, 'S2': 1.20, 'S5': 1.06, 'S6': 1.22, 'S7': 1.03, 'S9': 1.02, 'S10': 1.03,
}
VIEWS = ['down', 'up', 'right']
# 지도 그림이 진하고 화사해서 캐릭터 색을 조금 더 진하게(채도·대비) 맞춤
COLOR, CONTRAST, BRIGHT = 1.35, 1.10, 1.02


def enhance(im):
    from PIL import ImageEnhance
    a = im.getchannel('A')
    rgb = ImageEnhance.Color(im.convert('RGB')).enhance(COLOR)
    rgb = ImageEnhance.Brightness(ImageEnhance.Contrast(rgb).enhance(CONTRAST)).enhance(BRIGHT)
    out = rgb.convert('RGBA'); out.putalpha(a)
    return out
# 제미나이가 옆모습을 왼쪽을 보게 그린 캐릭터: 옆모습 칸을 좌우로 뒤집어 모두 오른쪽을 보게 맞춤
SIDE_FACES_LEFT = {'F1', 'F2', 'R1b', 'R1g', 'R4b', 'R4g', 'R5b', 'R5g', 'R6b', 'R6g', 'R7b', 'S2', 'S4', 'S7'}


def remove_bg(rgb):
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    # 배경과 비슷한 색 중 테두리와 이어진 부분만 배경
    like = dist < 22
    lab, n = ndimage.label(like)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(edge))
    # 경계 부드럽게: 배경 가장자리 2px 안에서는 색 차이에 따라 반투명
    near = ndimage.binary_dilation(bgmask, iterations=2) & ~bgmask
    alpha = np.where(bgmask, 0.0, 1.0)
    soft = np.clip((dist - 14) / 40.0, 0, 1)
    alpha[near] = np.maximum(alpha[near] * 0, soft[near])
    # 작은 조각 지우기
    solid = alpha > 0.5
    lab2, n2 = ndimage.label(solid)
    if n2:
        sizes = ndimage.sum(solid, lab2, range(1, n2 + 1))
        keep = np.zeros(n2 + 1, bool)
        keep[1:] = sizes >= sizes.max() * 0.04
        keepmask = ndimage.binary_dilation(keep[lab2], iterations=2)
        alpha[~keepmask] = 0
    # 반투명 가장자리의 회색 번짐 줄이기(배경색을 빼고 다시 계산)
    a3 = alpha[..., None]
    out = np.where(a3 > 0.02, (rgb - (1 - a3) * bg) / np.maximum(a3, 0.02), rgb)
    out = np.clip(out, 0, 255)
    return np.dstack([out, alpha * 255]).astype(np.uint8)


def split3(rgba):
    a = rgba[..., 3] > 40
    lab, n = ndimage.label(a)
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    comps = [(objs[i], sizes[i]) for i in range(n)]
    # 큰 조각 3개를 칸의 중심으로 삼고, 나머지 조각은 가까운 칸에 붙임
    comps.sort(key=lambda c: -c[1])
    centers = sorted(((c[0][1].start + c[0][1].stop) / 2 for c in comps[:3]))
    if len(centers) < 3:
        raise ValueError('3칸을 찾지 못함')
    groups = [[] for _ in range(3)]
    for i in range(n):
        sl = objs[i]
        cx = (sl[1].start + sl[1].stop) / 2
        k = int(np.argmin([abs(cx - c) for c in centers]))
        groups[k].append(i + 1)
    panels = []
    for g in groups:
        m = np.isin(lab, g)
        m = ndimage.binary_dilation(m, iterations=3) & (rgba[..., 3] > 0)
        ys, xs = np.where(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        p = rgba[y0:y1, x0:x1].copy()
        p[..., 3] = np.where(m[y0:y1, x0:x1], p[..., 3], 0)
        panels.append(p)
    return panels


def foot_x(p):
    # 발 위치: 아래 12% 줄의 불투명 픽셀 가운데
    a = p[..., 3] > 100
    h = a.shape[0]
    ys, xs = np.where(a[int(h * 0.88):])
    return float(xs.mean()) if len(xs) else p.shape[1] / 2


def main():
    os.makedirs(OUT, exist_ok=True)
    ids = sorted(f[:-4] for f in os.listdir(SRC) if f.endswith('.png'))
    only = sys.argv[1:]
    meta = {}
    if os.path.exists(JS):
        txt = open(JS, encoding='utf-8').read()
        meta = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
    for cid in ids:
        if only and cid not in only:
            continue
        rgb = np.array(Image.open(os.path.join(SRC, cid + '.png')).convert('RGB')).astype(float)
        rgba = remove_bg(rgb)
        panels = split3(rgba)
        s = BODY_H * HAT.get(cid, 1.0) / panels[0].shape[0]
        ims, rects, x = [], {}, 0
        for v, p in zip(VIEWS, panels):
            im = Image.fromarray(p).resize((max(1, round(p.shape[1] * s)), max(1, round(p.shape[0] * s))), Image.LANCZOS)
            if v == 'right' and cid in SIDE_FACES_LEFT:
                im = im.transpose(Image.FLIP_LEFT_RIGHT)
            fx = foot_x(np.array(im))
            ims.append(im)
            rects[v] = [x + PAD, PAD, im.width, im.height, round(fx, 1), im.height]
            x += im.width + PAD * 2
        sheet = Image.new('RGBA', (x, max(i.height for i in ims) + PAD * 2), (0, 0, 0, 0))
        for im, v in zip(ims, VIEWS):
            sheet.paste(im, (rects[v][0], rects[v][1]))
        sheet = enhance(sheet)
        sheet.save(os.path.join(OUT, cid + '.webp'), 'WEBP', quality=90, method=6)
        meta[cid] = {'src': 'assets/characters/' + cid + '.webp', 'views': rects}
        print(cid, sheet.size, {v: rects[v][2:4] for v in VIEWS})
    with open(JS, 'w', encoding='utf-8') as f:
        f.write('// tools/build_characters.py 가 만듦. 칸: [x, y, 너비, 높이, 발x(칸 안), 발y(칸 안)], 몸 키 ' + str(BODY_H) + 'px 기준\n')
        f.write('window.MP_CHAR_SPRITES = ' + json.dumps(meta, ensure_ascii=False, indent=1, sort_keys=True) + ';\n')


if __name__ == '__main__':
    main()
