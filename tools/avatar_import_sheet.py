# ChatGPT 등으로 받은 '네 방향 한 줄' 그림을 착용 그림(256×376)으로 나눠 맞추기
#   python tools/avatar_import_sheet.py <그림.png> hat <모자이름> [--width 1.12] [--dy 앞,왼,오,뒤]
# 그림 속 아이템 4개를 왼쪽부터 앞(down)·왼쪽(left)·오른쪽(right)·뒤(up)로 보고,
#   - hat: 머리 최대 윤곽 너비 × width 배로 맞추고, 모자 맨 아래를 템플릿 빨강 선(+dy)에 놓음
# 결과는 assets/avatar/worn/ 에 저장하고, 게임이 읽는 목록 js/avatar/worn-index.js 를 다시 만듭니다.
import sys
from pathlib import Path
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import avatar_template as T

ROOT = Path(__file__).resolve().parent.parent
WORN = ROOT / 'assets' / 'avatar' / 'worn'
HAIR_DROP = 8   # 머리: 가장 잘 맞는 자리보다 이만큼 내려 놓음(정수리가 솟아 보이지 않게)
HAIR_DROP_EXCEPT = {('6', 'down'): 0}   # 포니테일 앞모습은 내리면 앞머리가 눈을 가림


def components(im, n=4):
    """투명 배경 위 아이템 덩어리를 왼쪽부터 n개 찾기(세로 줄 단위로 빈 칸을 기준으로 나눔)"""
    a = np.array(im)[..., 3] > 30
    cols = a.any(0); spans = []; x = 0; W = len(cols)
    while x < W:
        if cols[x]:
            s = x
            while x < W and cols[x]: x += 1
            spans.append((s, x))
        else: x += 1
    spans = [sp for sp in spans if sp[1] - sp[0] > 20]
    # 작은 틈으로 갈라진 조각은 가까운 것끼리 합쳐 n개로
    while len(spans) > n:
        gaps = [spans[i + 1][0] - spans[i][1] for i in range(len(spans) - 1)]
        i = int(np.argmin(gaps)); spans[i:i + 2] = [(spans[i][0], spans[i + 1][1])]
    if len(spans) != n: raise SystemExit(f'아이템을 {n}개로 나누지 못했어요({len(spans)}개). 그림을 확인해 주세요.')
    out = []
    for x0, x1 in spans:
        sub = a[:, x0:x1]; ys = np.where(sub.any(1))[0]
        out.append(im.crop((x0, ys.min(), x1, ys.max() + 1)))
    return out


def write_index():
    names = sorted(p.stem for p in WORN.glob('*.png'))
    (ROOT / 'js' / 'avatar' / 'worn-index.js').write_text(
        '// 착용 그림 목록 (tools/avatar_import_sheet.py 가 자동으로 만듦)\nwindow.MP_AVATAR_WORN = ' +
        '[\n' + ',\n'.join(f'  "{n}"' for n in names) + '\n];\n', encoding='utf-8')
    return names


def import_hat(sheet, name, width=1.12, dy=(0, 0, 0, 0)):
    """앞모습 너비로 배율을 정하고, 네 방향 모두 같은 배율(그림 속 크기 비율 그대로)을 씀.
    앞·뒤는 머리 가운데에, 옆모습은 모자 뒤쪽 끝을 뒤통수에 맞춤(챙은 앞으로 나옴)."""
    parts = components(Image.open(sheet).convert('RGBA'))
    WORN.mkdir(parents=True, exist_ok=True)
    hu = T.head_union('down'); ys, xs = np.where(hu)
    s = (xs.max() - xs.min()) * width / parts[0].width
    for d, c, oy in zip(T.DIRS, parts, dy):
        hu = T.head_union(d); ys, xs = np.where(hu)
        w, h = round(c.width * s), round(c.height * s)
        c = c.resize((w, h), Image.LANCZOS)
        if d == 'left': x = xs.max() + 6 - w           # 왼쪽을 봄: 뒤통수는 화면 오른쪽
        elif d == 'right': x = xs.min() - 6            # 오른쪽을 봄: 뒤통수는 화면 왼쪽
        else: x = round((xs.max() + xs.min()) / 2 - w / 2)
        out = Image.new('RGBA', (T.W, T.H)); out.alpha_composite(c, (x, T.GUIDE[d]['band'] + oy - h))
        out.save(WORN / f'hat_{name}_front_{d}.png')
        print(f'hat_{name}_front_{d}.png  배율 {s:.3f}  크기 {c.size}  x {x}')


def import_headband(sheet, name='headband', width=1.0, dy=(0, 0, 0, 0)):
    """머리띠: 머리카락 위에 얹으므로 띠 윗부분을 머리 꼭대기에 맞춤. 네 방향 같은 배율."""
    parts = components(Image.open(sheet).convert('RGBA'))
    hu = T.head_union('down'); ys, xs = np.where(hu)
    s = (xs.max() - xs.min()) * width / parts[0].width
    for d, c, oy in zip(T.DIRS, parts, dy):
        hu = T.head_union(d); ys, xs = np.where(hu)
        w, h = round(c.width * s), round(c.height * s)
        c = c.resize((w, h), Image.LANCZOS)
        cx = (xs.max() + xs.min()) / 2 + {'left': 10, 'right': -10}.get(d, 0)   # 옆모습: 정수리보다 살짝 뒤
        out = Image.new('RGBA', (T.W, T.H)); out.alpha_composite(c, (round(cx - w / 2), ys.min() + 3 + oy))
        out.save(WORN / f'hat_{name}_front_{d}.png')
        print(f'hat_{name}_front_{d}.png  배율 {s:.3f}  크기 {c.size}')


def import_hair(sheet, num, width=1.04, dy=(0, 0, 0, 0), dirs=None):
    """머리: 원래 머리가 덮던 영역(두피·뒤통수·목 위)을 최대한 덮고, 보이던 얼굴(눈·코·입)은 가리지 않도록
    방향마다 크기·위치를 조금씩 바꿔 가장 잘 맞는 자리를 찾음."""
    dirs = dirs or T.DIRS
    parts = components(Image.open(sheet).convert('RGBA'), len(dirs))
    # 그림에 귀(피부색)까지 그려 온 경우 지움: 귀는 얼굴 그림의 귀를 씀
    def no_skin(im):
        a = np.array(im).astype(int); r, g, b = a[..., 0], a[..., 1], a[..., 2]
        skin = (r > 215) & (g > 160) & (b > 130) & (r - g < 70) & (a[..., 3] > 0)
        a[skin, 3] = 0
        return Image.fromarray(a.astype('uint8'))
    parts = [no_skin(c) for c in parts]
    def mask(im, th=100): return np.array(im)[..., 3] > th
    def tile(p):
        c = Image.new('RGBA', (T.W, T.H)); c.alpha_composite(T.img(p), (0, T.HR)); return c
    x0, y0, x1, y1 = None, None, None, None
    for d, c, oy in zip(dirs, parts, dy):
        hair0 = mask(tile(T.M['hair'][num][d]))
        face = np.zeros_like(hair0)
        for f in T.M['faces']: face |= mask(tile(T.M['faces'][f][d]))
        scalp = face & hair0                 # 원래 머리가 덮던 두피: 꼭 덮어야 함
        front = np.zeros_like(face)          # 얼굴 앞부분(눈·코·입): 가리면 안 됨
        if d == 'down': front[T.HR + 100:T.HR + 175, 70:186] = True
        elif d == 'left': front[T.HR + 100:T.HR + 175, :112] = True
        elif d == 'right': front[T.HR + 100:T.HR + 175, 144:] = True
        forbid = face & ~hair0 & front
        ys, xs = np.where(hair0); bw = xs.max() - xs.min()
        base = bw * width / c.width
        best = None
        for m in np.arange(0.92, 1.30 if d in ('down', 'up') else 1.13, 0.04):   # 옆모습은 지나치게 커지지 않게
            s = base * m; w, h = round(c.width * s), round(c.height * s)
            if w > T.W or h > T.H: continue
            a = mask(c.resize((w, h), Image.LANCZOS), 120)
            # 앞·뒤: 가운데 기준 / 옆: 앞머리 쪽 끝을 원래 머리 앞 끝에 맞춤(얼굴을 덮지 않게)
            if d == 'left': cx0 = xs.min()
            elif d == 'right': cx0 = xs.max() - w
            else: cx0 = round((xs.max() + xs.min()) / 2 - w / 2)
            cy0 = ys.min(); rx = 18 if d in ('down', 'up') else 9
            for ddx in range(-rx, rx + 1, 3):
                for ddy in range(-10, 11, 2):
                    X, Y = cx0 + ddx, cy0 + ddy + oy
                    if X < 0 or Y < 0 or X + w > T.W or Y + h > T.H: continue
                    cov = np.zeros_like(hair0); cov[Y:Y + h, X:X + w] = a
                    score = 4 * (cov & scalp).sum() + (cov & hair0).sum() - 5 * (cov & forbid).sum() - 0.05 * (cov & ~hair0 & ~face).sum()
                    if best is None or score > best[0]: best = (score, s, X, Y, w, h)
        _, s, X, Y, w, h = best
        Y += HAIR_DROP_EXCEPT.get((num, d), HAIR_DROP)
        out = Image.new('RGBA', (T.W, T.H)); out.alpha_composite(c.resize((w, h), Image.LANCZOS), (X, Y))
        out.save(WORN / f'hair_{num}_{d}.png')
        miss = (scalp & ~mask(out, 120)).sum()
        print(f'hair_{num}_{d}.png  배율 {s:.3f}  위치 ({X},{Y})  드러난 두피 {miss}px')


def import_clip(sheet, name, width=42, dy=(0, 0, 0, 0)):
    """머리핀: 앞·왼쪽 두 장만 씀(오른쪽 보기·뒷모습에서는 안 보임). 그림에 세 장이 있으면 앞의 두 장.
    캐릭터 왼쪽 머리(관자놀이 위) 자리에 같은 크기로 놓음."""
    dirs = ['down', 'left']
    im = Image.open(sheet).convert('RGBA')
    try: parts = components(im, 3)[:2]
    except SystemExit: parts = components(im, 2)
    anchor = {'down': (179, 132), 'left': (158, 132), 'up': (77, 132)}   # 착용 칸 좌표(핀 가운데)
    s = width / parts[0].width
    for d, c, oy in zip(dirs, parts, dy):
        w, h = round(c.width * s), round(c.height * s)
        c = c.resize((w, h), Image.LANCZOS)
        ax, ay = anchor[d]
        out = Image.new('RGBA', (T.W, T.H)); out.alpha_composite(c, (round(ax - w / 2), round(ay - h / 2) + oy))
        out.save(WORN / f'{name}_{d}.png')
        print(f'{name}_{d}.png  배율 {s:.3f}  크기 {c.size}')


def import_bag(sheet, name, part, swap=False):
    """가방: part='body'는 왼쪽·오른쪽·뒤 세 장(템플릿 보라 상자에 맞춤),
    part='straps'는 앞·왼쪽·오른쪽 세 장(노랑 배낭 맞춤 끈과 같은 자리·크기)."""
    parts = components(Image.open(sheet).convert('RGBA'), 3)
    if swap: parts[0], parts[1] = parts[1], parts[0]   # 옆모습 두 장이 반대로 그려진 경우
    if part == 'body':
        dirs = ['left', 'right', 'up']
        boxes = {d: T.GUIDE[d]['bag'] for d in dirs}
    else:
        dirs = ['down', 'left', 'right']
        boxes = {}
        for d in dirs:
            a = np.array(T.img(T.M['fitted']['bag_straps'][d]))[..., 3] > 40; ys, xs = np.where(a)
            boxes[d] = (xs.min(), ys.min() + T.HR, xs.max(), ys.max() + T.HR)
    for d, c in zip(dirs, parts):
        x0, y0, x1, y1 = boxes[d]
        s = min((x1 - x0) / c.width, (y1 - y0) / c.height) if part == 'body' else (y1 - y0) / c.height
        w, h = round(c.width * s), round(c.height * s)
        c = c.resize((w, h), Image.LANCZOS)
        if part == 'body' and d == 'left': X = x1 - w          # 등 쪽(화면 오른쪽)에 붙임
        elif part == 'body' and d == 'right': X = x0
        else: X = round((x0 + x1) / 2 - w / 2)
        Y = y0 if part == 'straps' else y1 - h
        out = Image.new('RGBA', (T.W, T.H)); out.alpha_composite(c, (X, Y))
        out.save(WORN / f'{name}_{part}_{d}.png')
        print(f'{name}_{part}_{d}.png  배율 {s:.3f}  크기 {c.size}')


if __name__ == '__main__':
    args = sys.argv[1:]
    width, dy = 1.12, (0, 0, 0, 0)
    if '--width' in args: i = args.index('--width'); width = float(args[i + 1]); del args[i:i + 2]
    dirs = None
    if '--dirs' in args: i = args.index('--dirs'); dirs = args[i + 1].split(','); del args[i:i + 2]
    if '--dy' in args: i = args.index('--dy'); dy = tuple(int(v) for v in args[i + 1].split(',')); del args[i:i + 2]
    sheet, kind, name = args[0], args[1], args[2]
    if kind == 'hat': import_hat(sheet, name, width, dy)
    elif kind == 'hair': import_hair(sheet, name, width if '--width' in sys.argv else 1.04, dy, dirs)
    elif kind == 'clip': import_clip(sheet, name, int(width) if '--width' in sys.argv else 42, dy)
    elif kind in ('bag_body', 'bag_straps'): import_bag(sheet, name, kind.split('_')[1], '--swap' in sys.argv)
    elif kind == 'headband': import_headband(sheet, name, width if '--width' in sys.argv else 1.0, dy)
    else: raise SystemExit('지원하는 종류: hat, headband, hair, clip, bag_body, bag_straps')
    print('목록:', ', '.join(write_index()))
