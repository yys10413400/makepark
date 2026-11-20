"""
동물 선생님 원본 그림(assets/teachers-src/<id>.png, 제미나이 3칸 시트)을 게임용 그림으로 만듭니다.

  python tools/build_teachers.py            # 전부
  python tools/build_teachers.py bear fox   # 몇 개만

학생 캐릭터 도구(tools/build_characters.py)와 같은 방법(회색 배경 지우기 → 앞·뒤·옆 3칸 나누기 → 키 맞추기)에
선생님 그림에만 있는 것 두 가지를 더 합니다.
 1. 제미나이가 그려 넣은 바닥 선과 칸 아래 글자(FRONT·BACK·RIGHT SIDE)를 먼저 지웁니다.
 2. 손에 든 물건은 그대로 두고 다리만 움직이게, 칸마다 '다리가 시작하는 높이(hip)'를 찾아 적어 둡니다.
    js/net/teacher-avatar.js 가 hip 아래만 왼쪽·오른쪽 다리로 나눠 번갈아 들어 올려 걷게 그립니다.
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
    line = [y for y in range(int(h * 0.55), h) if dark[y].mean() > 0.5 and longest_run(dark[y]) > w * 0.7]
    if line:
        y0 = min(line) - 2
        rgb = rgb.copy()
        rgb[y0:] = bg
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
    return top if top < h - 4 else int(h * 0.82)


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
        s = BODY_H / panels[0].shape[0]
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
        # 옆모습은 다리 틈이 없으니 앞모습의 비율을 씀
        hips['right'] = round(rects['right'][3] * hips['down'] / rects['down'][3])
        for v in VIEWS:
            rects[v].append(int(hips[v]))
        sheet = Image.new('RGBA', (x, max(i.height for i in ims) + PAD * 2), (0, 0, 0, 0))
        for im, v in zip(ims, VIEWS):
            sheet.paste(im, (rects[v][0], rects[v][1]))
        sheet = enhance(sheet)
        sheet.save(os.path.join(OUT, tid + '.webp'), 'WEBP', quality=90, method=6)
        meta[tid] = {'src': 'assets/teachers/' + tid + '.webp', 'name': NAMES.get(tid, tid), 'views': rects}
        print(tid, sheet.size, {v: rects[v][2:] for v in VIEWS})
    with open(JS, 'w', encoding='utf-8') as f:
        f.write('// tools/build_teachers.py 가 만듦. 칸: [x, y, 너비, 높이, 발x, 발y, 다리 시작 y(칸 안)], 몸 키 ' + str(BODY_H) + 'px 기준\n')
        f.write('window.MP_TEACHER_SPRITES = ' + json.dumps(meta, ensure_ascii=False, indent=1, sort_keys=True) + ';\n')
        f.write("window.MP_TEACHER_VER = '" + time.strftime('%Y%m%d%H%M%S') + "';\n")


if __name__ == '__main__':
    main()
