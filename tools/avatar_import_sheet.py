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


def import_hair(sheet, num, width=1.04, dy=(0, 0, 0, 0)):
    """머리: 원래 머리 그림의 위치(꼭대기·가운데)와 너비에 맞춤. 네 방향 같은 배율."""
    parts = components(Image.open(sheet).convert('RGBA'))
    def bbox(d):
        a = np.array(T.img(T.M['hair'][num][d]))[..., 3] > 60; ys, xs = np.where(a)
        return xs.min(), ys.min() + T.HR, xs.max(), ys.max() + T.HR
    x0, y0, x1, y1 = bbox('down')
    s = (x1 - x0) * width / parts[0].width
    for d, c, oy in zip(T.DIRS, parts, dy):
        x0, y0, x1, y1 = bbox(d)
        w, h = round(c.width * s), round(c.height * s)
        c = c.resize((w, h), Image.LANCZOS)
        top = y0 + oy
        if d == 'up':   # 뒷모습: 원래 머리보다 짧으면 목 위 옷 테두리가 보여서, 원래 아래 끝보다 조금 더 내림(최대 18px)
            top += max(0, min(18, y1 - (top + h) + 4))
        out = Image.new('RGBA', (T.W, T.H)); out.alpha_composite(c, (round((x0 + x1) / 2 - w / 2), top))
        out.save(WORN / f'hair_{num}_{d}.png')
        print(f'hair_{num}_{d}.png  배율 {s:.3f}  크기 {c.size}')


if __name__ == '__main__':
    args = sys.argv[1:]
    width, dy = 1.12, (0, 0, 0, 0)
    if '--width' in args: i = args.index('--width'); width = float(args[i + 1]); del args[i:i + 2]
    if '--dy' in args: i = args.index('--dy'); dy = tuple(int(v) for v in args[i + 1].split(',')); del args[i:i + 2]
    sheet, kind, name = args[0], args[1], args[2]
    if kind == 'hat': import_hat(sheet, name, width, dy)
    elif kind == 'hair': import_hair(sheet, name, width if '--width' in sys.argv else 1.04, dy)
    elif kind == 'headband': import_headband(sheet, name, width if '--width' in sys.argv else 1.0, dy)
    else: raise SystemExit('지원하는 종류: hat, headband, hair')
    print('목록:', ', '.join(write_index()))
