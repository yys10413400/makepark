"""
동물 선생님 원본 그림(assets/teachers-src/<id>.png, 제미나이 3칸 시트)을 게임용 그림으로 만듭니다.

  python tools/build_teachers.py            # 전부
  python tools/build_teachers.py bear fox   # 몇 개만

학생 캐릭터 도구(tools/build_characters.py)와 같은 방법(회색 배경 지우기 → 앞·뒤·옆 3칸 나누기 → 키 맞추기)에
선생님 그림에만 있는 것 두 가지를 더 합니다.
 1. 제미나이가 그려 넣은 바닥 선과 칸 아래 글자(FRONT·BACK·RIGHT SIDE)를 먼저 지웁니다.
 2. 손에 든 물건은 그대로 두고 다리만 움직이게(걷는 자세 그림이 없는 선생님), 칸마다 '다리가 시작하는 높이(hip)'를 찾아 적어 둡니다.
    js/net/teacher-avatar.js 가 hip 아래만 왼쪽·오른쪽 다리로 나눠 번갈아 들어 올려 걷게 그립니다.
걷는 자세 그림: assets/teachers-src/<동물>-walk.png 가 있으면 그 선생님은 학생 캐릭터처럼
   [걷는 자세, 서 있기, 반대 발 걷는 자세(좌우 뒤집기), 서 있기] 로 걷습니다.
색: 원본이 지도보다 잔잔해서 학생 캐릭터보다 조금 더 진하고 선명하게(채도·대비) 맞춥니다.
"""
import json, os, sys, time
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_characters import remove_bg, split3  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'teachers-src')
OUT = os.path.join(ROOT, 'assets', 'teachers')
JS = os.path.join(ROOT, 'js', 'data', 'teacher-sprites.js')

BODY_H = 300          # 학생 캐릭터와 같은 몸 키(px)
PAD = 4
VIEWS = ['down', 'up', 'right']
WALK_H = 0.97         # 걷는 자세는 다리를 벌려 서 있을 때보다 키가 조금 작음
COLOR, CONTRAST, BRIGHT, SHARP = 1.4, 1.14, 1.0, 1.4
NAMES = {
    'bear': '곰 선생님', 'rabbit': '토끼 선생님', 'fox': '여우 선생님',
    'hedgehog': '고슴도치 선생님', 'raccoon': '너구리 선생님', 'sheep': '양 선생님',
}


def clear_floor(rgb):
    """바닥 선(가로로 길게 이어진 얇은 선)과 그 아래(칸 이름 글자)를 배경색으로 칠함."""
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dark = np.sqrt(((rgb - bg) ** 2).sum(axis=2)) > 18

    def longest_run(r):
        best = cur = 0
        for v in r:
            cur = cur + 1 if v else 0
            best = max(best, cur)
        return best
    # 바닥 선: 한 줄이 끊김 없이 그림 폭의 70% 넘게 이어짐(캐릭터는 칸 사이가 비어 있어 이렇게 길지 않음)
    # 선이 살짝 기울어 있으면 한 줄로는 끊겨 보이므로, 가까운 줄 몇 개를 묶은 얇은 띠로 봄
    rows = [y for y in range(int(h * 0.55), h) if dark[y].mean() > 0.8]
    line, group = [], []
    for y in rows + [None]:
        if y is not None and (not group or y == group[-1] + 1):
            group.append(y); continue
        if group and len(group) <= max(3, h * 0.02) and dark[group].any(axis=0).mean() > 0.7:
            line += group
        group = [y] if y is not None else []
    if line:
        # 캐릭터는 이 선을 밟고 서 있음: 선 아래(칸 이름 글자)는 모두 지우되,
        # 선 자체는 바로 위가 배경인 곳만 지움 → 발바닥(선에 닿은 부분)은 잘리지 않음
        y0, y1 = min(line), max(line)
        rgb = rgb.copy()
        rgb[y1 + 3:] = bg
        above = np.sqrt(((rgb[max(0, y0 - 4)] - bg) ** 2).sum(axis=1)) < 22
        band = slice(max(0, y0 - 2), y1 + 3)
        # 선의 색: 위가 배경인 곳의 선 픽셀 평균
        line_px = rgb[y0:y1 + 1][:, above].reshape(-1, 3)
        line_px = line_px[np.sqrt(((line_px - bg) ** 2).sum(axis=1)) > 18]
        rgb[band, above] = bg
        # 발 밑에 남은 선 조각: 선 색과 거의 같은 점만 배경으로 (발 외곽선·회색 꼬리 줄무늬는 남음)
        if len(line_px):
            lc = np.median(line_px, axis=0)
            seg = rgb[band]
            same = np.sqrt(((seg - lc) ** 2).sum(axis=2)) < 14
            seg[same] = bg
            rgb[band] = seg
    return rgb


def enhance(im):
    a = im.getchannel('A')
    rgb = im.convert('RGB')
    rgb = ImageEnhance.Color(rgb).enhance(COLOR)
    rgb = ImageEnhance.Contrast(rgb).enhance(CONTRAST)
    rgb = ImageEnhance.Brightness(rgb).enhance(BRIGHT)
    rgb = ImageEnhance.Sharpness(rgb).enhance(SHARP)
    out = rgb.convert('RGBA'); out.putalpha(a)
    return out


def head_w(p):
    """머리 폭: 키의 10~30% 높이에서 가장 넓은 줄의 불투명 폭(귀 끝은 빼려고 10%부터)."""
    a = p[..., 3] > 100
    h = a.shape[0]
    best = 0
    for y in range(int(h * 0.10), int(h * 0.30)):
        xs = np.where(a[y])[0]
        if len(xs):
            best = max(best, xs.max() - xs.min())
    return float(best or 1)


def body_x(p):
    """몸 가운데 x: 꼬리가 옆으로 나온 캐릭터(여우·너구리)도 몸통(키의 45~75% 높이) 가운데를 씀."""
    a = p[..., 3] > 100
    h = a.shape[0]
    ys, xs = np.where(a[int(h * 0.45):int(h * 0.75)])
    return float(np.median(xs)) if len(xs) else p.shape[1] / 2


def hip_y(p, cx):
    """다리가 시작하는 높이(칸 위에서부터 px): 몸 가운데에서 두 다리 사이 틈이 처음 생기는 줄."""
    a = p[..., 3] > 100
    h = a.shape[0]
    c = int(round(cx))
    top = h
    for y in range(h - 1, int(h * 0.55), -1):
        row = a[y, max(0, c - 2):c + 3]
        if row.size and not row.any():
            top = y
        elif top < h:
            break
    return (top, 1) if top < h - 4 else (int(h * 0.82), 0)


GIF_DIR = os.path.join(SRC, 'gif')
ANIM_K = 0.5          # 걷기 프레임 크기: 서 있는 그림(몸 키 300px)의 절반. 공원에서 그리는 크기(약 60~80px)엔 충분


def cycle_len(frames):
    """GIF 가 같은 걸음을 되풀이하면, 첫 장과 가장 닮은 장(6장 이후)까지가 한 걸음 묶음."""
    g = [np.asarray(f.convert('L'), dtype=float) for f in frames]
    diffs = [np.abs(x - g[0]).mean() for x in g]
    if len(g) < 8:
        return len(g)
    lim = np.median(diffs) * 0.7
    for k in range(6, len(g) - 1):   # 가장 먼저 첫 장과 다시 닮아지는 곳(골짜기)
        if diffs[k] < lim and diffs[k] <= diffs[k - 1] and diffs[k] <= diffs[k + 1]:
            return k
    return len(g)


def build_anim(base, path, meta):
    """움직이는 GIF(앞·뒤·옆 3칸이 함께 걷는 그림) → 한 걸음 묶음을 프레임 시트로.
    시트: 줄 = 프레임, 칸 = down·up·right. 칸마다 모든 프레임에 같은 자르기 상자를 써서 흔들림이 없게 함."""
    from PIL import ImageSequence
    gif = Image.open(path)
    frames = [f.convert('RGB') for f in ImageSequence.Iterator(gif)]
    dur = gif.info.get('duration') or 100
    n = cycle_len(frames)
    frames = frames[:n]
    up = 2   # 작은 GIF 는 2배로 키운 뒤 다듬어야 가장자리가 매끈함
    rgbas = []
    for f in frames:
        rgb = np.array(f.resize((f.width * up, f.height * up), Image.LANCZOS)).astype(float)
        rgbas.append(remove_bg(clear_floor(rgb)))
    # 3칸의 경계: 첫 장을 3칸으로 나눈 가운데들 사이
    a0 = rgbas[0][..., 3] > 40
    lab, cnt = ndimage.label(a0)
    sizes = ndimage.sum(a0, lab, range(1, cnt + 1))
    objs = ndimage.find_objects(lab)
    big = sorted(np.argsort(sizes)[-3:], key=lambda i: objs[i][1].start)
    cx = [(objs[i][1].start + objs[i][1].stop) / 2 for i in big]
    W = a0.shape[1]
    bounds = [0, (cx[0] + cx[1]) / 2, (cx[1] + cx[2]) / 2, W]
    union = np.zeros_like(a0)
    for r in rgbas:
        union |= r[..., 3] > 40
    boxes = []
    for i in range(3):
        x0, x1 = int(bounds[i]), int(bounds[i + 1])
        ys, xs = np.where(union[:, x0:x1])
        boxes.append((ys.min(), ys.max() + 1, x0 + xs.min(), x0 + xs.max() + 1))
    # 크기: 머리 폭을 서 있는 그림의 앞모습과 같게
    st = np.array(Image.open(os.path.join(ROOT, meta[base]['src'])))
    r = meta[base]['views']['down']
    y0, y1, x0, x1 = boxes[0]
    s = head_w(st[r[1]:r[1] + r[3], r[0]:r[0] + r[2]]) / head_w(rgbas[0][y0:y1, x0:x1])
    s *= ANIM_K      # 공원에서는 작게 그리므로 프레임은 절반 크기로 저장(용량 줄이기)
    cw = [max(1, round((b[3] - b[2]) * s)) for b in boxes]
    ch = [max(1, round((b[1] - b[0]) * s)) for b in boxes]
    rowH = max(ch) + PAD * 2
    colX, x = [], 0
    for w in cw:
        colX.append(x + PAD); x += w + PAD * 2
    sheet = Image.new('RGBA', (x, rowH * n), (0, 0, 0, 0))
    views = {}
    for i, v in enumerate(VIEWS):
        y0, y1, x0, x1 = boxes[i]
        first = Image.fromarray(rgbas[0][y0:y1, x0:x1]).resize((cw[i], ch[i]), Image.LANCZOS)
        fx = body_x(np.array(first))
        views[v] = [colX[i], PAD, cw[i], ch[i], round(fx, 1), ch[i]]
        for k in range(n):
            im = Image.fromarray(rgbas[k][y0:y1, x0:x1]).resize((cw[i], ch[i]), Image.LANCZOS)
            sheet.paste(im, (colX[i], PAD + k * rowH))
    sheet = enhance(sheet)
    out = base + '-anim.webp'
    sheet.save(os.path.join(OUT, out), 'WEBP', quality=88, method=6)
    meta[base]['anim'] = {'src': 'assets/teachers/' + out, 'frames': n, 'ms': dur, 'rowH': rowH, 'k': ANIM_K, 'views': views}
    print(base, 'anim', n, '프레임', dur, 'ms', sheet.size)


def main():
    os.makedirs(OUT, exist_ok=True)
    ids = sorted(f[:-4] for f in os.listdir(SRC) if f.endswith('.png'))
    only = sys.argv[1:]
    meta = {}
    if os.path.exists(JS):
        txt = open(JS, encoding='utf-8').read()
        meta = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
    for tid in ids:
        if only and tid not in only:
            continue
        rgb = np.array(Image.open(os.path.join(SRC, tid + '.png')).convert('RGB')).astype(float)
        rgba = remove_bg(clear_floor(rgb))
        panels = split3(rgba)
        walk = tid.endswith('-walk')     # 걷는 자세 그림(<동물>-walk.png)
        s = BODY_H / panels[0].shape[0]
        if walk and tid[:-5] in meta:
            # 걷는 자세는 다리 길이·자세가 달라 키로 맞추면 머리가 작아짐 → 머리 폭이 서 있는 그림과 같게 맞춤
            st = np.array(Image.open(os.path.join(ROOT, meta[tid[:-5]]['src'])))
            r = meta[tid[:-5]]['views']['down']
            s = head_w(st[r[1]:r[1] + r[3], r[0]:r[0] + r[2]]) / head_w(panels[0])
        ims, rects, x = [], {}, 0
        hips = {}
        for v, p in zip(VIEWS, panels):
            im = Image.fromarray(p).resize((max(1, round(p.shape[1] * s)), max(1, round(p.shape[0] * s))), Image.LANCZOS)
            arr = np.array(im)
            fx = body_x(arr)
            ims.append(im)
            hips[v] = hip_y(arr, fx)
            rects[v] = [x + PAD, PAD, im.width, im.height, round(fx, 1), im.height]
            x += im.width + PAD * 2
        # 옆모습은 다리 사이 틈이 잘 안 보이니 앞모습의 비율로 높이만 맞추고, 다리를 나누지 않음(gap=0)
        hips['right'] = (round(rects['right'][3] * hips['down'][0] / rects['down'][3]), 0)
        for v in VIEWS:
            rects[v] += [int(hips[v][0]), hips[v][1]]
        sheet = Image.new('RGBA', (x, max(i.height for i in ims) + PAD * 2), (0, 0, 0, 0))
        for im, v in zip(ims, VIEWS):
            sheet.paste(im, (rects[v][0], rects[v][1]))
        sheet = enhance(sheet)
        sheet.save(os.path.join(OUT, tid + '.webp'), 'WEBP', quality=90, method=6)
        if walk:
            base = tid[:-5]
            meta.setdefault(base, {})['walk'] = {'src': 'assets/teachers/' + tid + '.webp', 'views': rects}
        else:
            meta[tid] = dict(meta.get(tid, {}), src='assets/teachers/' + tid + '.webp', name=NAMES.get(tid, tid), views=rects)
        print(tid, sheet.size, {v: rects[v][2:] for v in VIEWS})
    # 움직이는 걷기 GIF: assets/teachers-src/gif/<동물>-walk.gif
    if os.path.isdir(GIF_DIR):
        for f in sorted(os.listdir(GIF_DIR)):
            base = f[:-9] if f.endswith('-walk.gif') else None
            if base and base in meta and (not only or base in only or f[:-4] in only):
                build_anim(base, os.path.join(GIF_DIR, f), meta)
    with open(JS, 'w', encoding='utf-8') as f:
        f.write('// tools/build_teachers.py 가 만듦. 칸: [x, y, 너비, 높이, 발x, 발y, 다리 시작 y(칸 안), 두 다리 사이 틈 있음(1/0)], 몸 키 ' + str(BODY_H) + 'px 기준\n')
        f.write('window.MP_TEACHER_SPRITES = ' + json.dumps(meta, ensure_ascii=False, indent=1, sort_keys=True) + ';\n')
        f.write("window.MP_TEACHER_VER = '" + time.strftime('%Y%m%d%H%M%S') + "';\n")


if __name__ == '__main__':
    main()
