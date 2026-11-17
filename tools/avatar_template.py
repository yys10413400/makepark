# 캐릭터 아이템 그리기 템플릿 만들기
#   python tools/avatar_template.py
# docs/avatar-art/ 에 방향별 템플릿(그 위에 그리는 밑그림)과 설명이 붙은 한눈 보기 그림을 만듭니다.
# 좌표는 '착용 칸' 256×376 기준입니다(기존 그림 칸 256×320 위에 모자 여유 56px를 더한 것).
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'avatar-art'
M = json.loads((ROOT / 'assets/avatar/manifest.json').read_text(encoding='utf-8'))
HR, W, H = 56, 256, 376
DIRS = ['down', 'left', 'right', 'up']
NAME = {'down': '앞(down)', 'left': '왼쪽(left)', 'right': '오른쪽(right)', 'up': '뒤(up)'}

# 기준선(착용 칸 좌표). 기존 그림에서 잰 값 + 56(위 여유)
# band(모자 띠 선) = 디자이너가 맞춰 그린 버킷햇(fitted/bucket_hair1)의 모자 맨 아래 높이
GUIDE = {
    'down':  {'band': 155, 'eye': 178, 'center': 128, 'ear': None,              'bag': None,                   'strap': [(100, 227), (156, 227)]},
    'left':  {'band': 167, 'eye': 177, 'center': None, 'ear': (120, 176, 153, 219), 'bag': (110, 225, 194, 301), 'strap': [(128, 231)]},
    'right': {'band': 167, 'eye': 177, 'center': None, 'ear': (103, 176, 136, 219), 'bag': (62, 225, 146, 301),  'strap': [(128, 231)]},
    'up':    {'band': 182, 'eye': None, 'center': 128, 'ear': None,              'bag': (90, 221, 166, 301),    'strap': []},
}
FOOT = (128, 360)
COL = {'band': (220, 40, 40), 'eye': (30, 100, 220), 'ear': (20, 150, 60), 'bag': (130, 60, 180),
       'strap': (240, 130, 0), 'head': (90, 90, 90), 'room': (255, 220, 120), 'foot': (0, 0, 0)}


def img(p): return Image.open(ROOT / p.replace('assets/', 'assets/avatar/', 1)).convert('RGBA')


def base_char(d):
    """기준 캐릭터(머리1·얼굴1·라벤더 맨투맨, 서 있는 칸)"""
    c = Image.new('RGBA', (W, H))
    for p in [M['bodies']['5'][d][1], M['shoes']['3']['5'][d][1], M['faces']['1'][d], M['hair']['1'][d]]:
        layer = Image.new('RGBA', (W, H)); layer.alpha_composite(img(p), (0, HR)); c.alpha_composite(layer)
    return c


def head_union(d):
    """머리 8종을 모두 겹친 가장 큰 머리 모양 - 모자는 이 윤곽을 덮어야 함"""
    u = np.zeros((H, W), bool)
    for h in M['hair']:
        a = np.array(img(M['hair'][h][d]))[..., 3] > 60
        u[HR:HR + 320] |= a
    u[HR:HR + 320] |= np.array(img(M['faces']['1'][d]))[..., 3] > 60
    return u


def skull(d):
    """두피(얼굴 그림의 윗부분) - 모자가 꼭 덮어야 하는 곳"""
    u = np.zeros((H, W), bool)
    for f in M['faces']: u[HR:HR + 320] |= np.array(img(M['faces'][f][d]))[..., 3] > 60
    return u


def outline(mask):
    m = Image.fromarray((mask * 255).astype('uint8'))
    edge = np.array(m.filter(ImageFilter.MaxFilter(3))) > 0
    return edge & ~mask


def font(size):
    for f in ['malgun.ttf', 'gulim.ttc']:
        p = Path('C:/Windows/Fonts') / f
        if p.exists(): return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def template(d, scale=2, labels=False):
    g = GUIDE[d]
    S = scale
    c = Image.new('RGBA', (W * S, H * S), (255, 255, 255, 255))
    dr = ImageDraw.Draw(c)
    # 위쪽 모자 여유
    dr.rectangle([0, 0, W * S, HR * S], fill=COL['room'] + (90,))
    # 기준 캐릭터(흐리게)
    bc = base_char(d).resize((W * S, H * S), Image.LANCZOS)
    a = np.array(bc); a[..., 3] = (a[..., 3] * 0.38).astype('uint8')
    c.alpha_composite(Image.fromarray(a))
    # 머리 최대 윤곽(점선)
    ol = outline(head_union(d))
    ys, xs = np.where(ol)
    for i, (y, x) in enumerate(zip(ys, xs)):
        if (x + y) % 4 < 2: dr.rectangle([x * S, y * S, x * S + S - 1, y * S + S - 1], fill=COL['head'])
    # 선들
    def hline(y, col, w=2): dr.line([(0, y * S), (W * S, y * S)], fill=col, width=w)
    hline(g['band'], COL['band'], 3)
    if g['eye']: hline(g['eye'], COL['eye'])
    if g['center']: dr.line([(g['center'] * S, 0), (g['center'] * S, H * S)], fill=COL['eye'] + (160,), width=1)
    if g['ear']: x0, y0, x1, y1 = g['ear']; dr.ellipse([x0 * S, y0 * S, x1 * S, y1 * S], outline=COL['ear'], width=3)
    if g['bag']: x0, y0, x1, y1 = g['bag']; dr.rectangle([x0 * S, y0 * S, x1 * S, y1 * S], outline=COL['bag'], width=3)
    for (x, y) in g['strap']: dr.ellipse([(x - 4) * S, (y - 4) * S, (x + 4) * S, (y + 4) * S], fill=COL['strap'])
    fx, fy = FOOT; dr.line([((fx - 8) * S, fy * S), ((fx + 8) * S, fy * S)], fill=COL['foot'], width=2); dr.line([(fx * S, (fy - 8) * S), (fx * S, (fy + 8) * S)], fill=COL['foot'], width=2)
    dr.rectangle([0, 0, W * S - 1, H * S - 1], outline=(150, 150, 150), width=1)
    if labels:
        f = font(11 * S // 2 + 4)
        dr.text((6, 4), '모자 여유(위 56px)', fill=(150, 100, 0), font=f)
        dr.text((6, g['band'] * S - 16 * S // 2 - 6), '모자 띠 선', fill=COL['band'], font=f)
        if g['eye']: dr.text((6, g['eye'] * S + 3), '눈 선', fill=COL['eye'], font=f)
        if g['ear']: dr.text((g['ear'][2] * S + 4, g['ear'][1] * S), '귀', fill=COL['ear'], font=f)
        if g['bag']: dr.text((g['bag'][0] * S + 4, g['bag'][3] * S - 18), '가방', fill=COL['bag'], font=f)
        if g['strap']: dr.text(((g['strap'][0][0] + 6) * S, (g['strap'][0][1] - 6) * S), '끈', fill=COL['strap'], font=f)
        dr.text(((FOOT[0] + 10) * S, (FOOT[1] - 8) * S), '발 기준점', fill=(0, 0, 0), font=f)
    return c


def overview():
    tiles = [template(d, 2, True) for d in DIRS]
    tw, th = tiles[0].size
    legend_h = 170
    O = Image.new('RGBA', (tw * 4 + 50, th + 70 + legend_h), (255, 255, 255, 255))
    dr = ImageDraw.Draw(O); f = font(26); fs = font(19)
    for i, t in enumerate(tiles):
        O.alpha_composite(t, (10 + i * (tw + 10), 56))
        dr.text((10 + i * (tw + 10) + 8, 14), NAME[DIRS[i]], fill=(40, 40, 40), font=f)
    y = th + 70
    items = [(COL['room'], '노랑 띠: 모자 여유 칸(맨 위 56px). 모자 윗부분은 여기까지 그려도 됨'),
             (COL['band'], '빨강 선: 모자 띠 선 - 모자 맨 아래(챙 끝)가 오는 높이 (디자이너 맞춤 버킷햇 기준)'),
             (COL['head'], '회색 점선: 머리 8종을 겹친 가장 큰 윤곽(참고) - 모자는 빨강 선 위 두피를 모두 덮기'),
             (COL['eye'], '파랑 선: 눈 높이 / 세로선: 얼굴 가운데'),
             (COL['ear'], '초록 원: 귀 - 옆모습 안경다리는 여기서 끝남'),
             (COL['bag'], '보라 상자: 등 가방이 놓이는 곳   주황 점: 어깨끈이 어깨에 걸리는 곳   + : 발 기준점(128,360)')]
    for i, (col, t) in enumerate(items):
        dr.rectangle([14, y + i * 27 + 4, 34, y + i * 27 + 20], fill=col)
        dr.text((44, y + i * 27), t, fill=(40, 40, 40), font=fs)
    return O


def examples():
    """좋은 예(맞춤 그림: 캐릭터 칸에서 그린 것) / 나쁜 예(따로 그린 모자를 상자에 넣은 것)"""
    f = font(22); fs = font(17)
    O = Image.new('RGBA', (1040, 350), (255, 255, 255, 255)); dr = ImageDraw.Draw(O)
    def head(d, layers):
        c = Image.new('RGBA', (W, H), (243, 230, 210, 255))
        for p, box in layers:
            im = img(p)
            if box: im = im.resize((box[2], box[3]), Image.LANCZOS); c.alpha_composite(im, (box[0], box[1] + HR))
            else: layer = Image.new('RGBA', (W, H)); layer.alpha_composite(im, (0, HR)); c.alpha_composite(layer)
        return c.crop((13, 20, 243, 250))
    good = [head(d, [(M['bodies']['5'][d][1], None), (M['faces']['1'][d], None), (M['fitted']['bucket_hair1'][d], None)]) for d in ('down', 'left')]
    bad = [head(d, [(M['bodies']['5'][d][1], None), (M['faces']['1'][d], None), (M['hair']['4'][d], None), (M['accessories']['beret'][d], [40, -4, 178, 89])]) for d in ('down', 'left')]
    for i, t in enumerate(good + bad): O.alpha_composite(t, (10 + i * 240 + (60 if i > 1 else 0), 50))
    dr.text((14, 12), '좋은 예: 캐릭터 칸 위에서 머리에 맞춰 그린 그림', fill=(20, 120, 60), font=f)
    dr.text((550, 12), '나쁜 예: 따로 그려 위치만 옮긴 그림', fill=(190, 40, 40), font=f)
    dr.text((14, 288), '모자 안쪽이 안 보이고,\n머리카락이 모자 아래로 자연스럽게 나옴', fill=(60, 60, 60), font=fs)
    dr.text((550, 288), '모자 안감이 이마를 덮고, 비율이 찌그러지고,\n머리 위에 떠 보임', fill=(60, 60, 60), font=fs)
    return O


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for d in DIRS:
        template(d, 2, False).save(OUT / f'template_{d}.png')
    overview().save(OUT / 'template_overview.png')
    examples().save(OUT / 'example_good_bad.png')
    print('ok', OUT)
