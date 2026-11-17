# 받은 '착용 그림'(docs/avatar-art/README.md 규격) 검사 + 미리보기
#   python tools/avatar_check_worn.py <worn 폴더> [미리보기.png]
# 규격(256×376, 투명), 가장자리 띠, 기준선 위치, 빠진 파일을 확인하고 기준 캐릭터에 씌운 네 방향 미리보기를 만듭니다.
import sys
from pathlib import Path
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import avatar_template as T  # 기준선·기준 캐릭터를 같은 값으로 씀

DIRS = T.DIRS
HATS = ['cap', 'bucket', 'beret', 'headband']
CLIPS = ['clip_star', 'clip_bow', 'clip_flower']
BAGS = ['bag_coral', 'bag_navy']


def expected():
    e = {}
    for h in HATS:
        for d in DIRS: e[f'hat_{h}_front_{d}.png'] = ('hat_front', h, d, True); e[f'hat_{h}_back_{d}.png'] = ('hat_back', h, d, False)
    for n in range(1, 9):
        for d in DIRS: e[f'hathair_{n}_{d}.png'] = ('hathair', str(n), d, True)
    for c in CLIPS:
        for d in ('down', 'left', 'up'): e[f'{c}_{d}.png'] = ('clip', c, d, True)
    for b in BAGS:
        for d in DIRS:
            e[f'{b}_body_{d}.png'] = ('bag_body', b, d, True)
            if d != 'up': e[f'{b}_straps_{d}.png'] = ('bag_straps', b, d, True)
    return e


def check(path, kind, d, name=''):
    msgs = []
    im = Image.open(path)
    if im.size != (T.W, T.H): msgs.append(f'크기 {im.size} (256×376이어야 함)'); return msgs, None
    if im.mode != 'RGBA': msgs.append(f'투명 배경 없음({im.mode})')
    a = np.array(im.convert('RGBA')).astype(int); al = a[..., 3]
    if al.max() == 0: msgs.append('빈 그림'); return msgs, a
    if min(al[0, 0], al[0, -1], al[-1, 0], al[-1, -1]) > 0: msgs.append('모서리가 투명하지 않음(배경이 남아 있음)')
    edge = (al > 20) & (al < 200)
    dark = edge & (a[..., :3].sum(2) < 45)   # 거의 검정(그림 외곽선 갈색은 제외)
    light = edge & (a[..., :3].min(2) > 235)
    if edge.sum() and dark.sum() / edge.sum() > 0.35: msgs.append('가장자리에 검은 띠')
    if edge.sum() and light.sum() / edge.sum() > 0.35: msgs.append('가장자리에 흰 띠')
    g = T.GUIDE[d]; op = al > 60; ys, xs = np.where(op)
    if kind == 'hat_front':
        bottom = ys.max()
        if abs(bottom - g['band']) > 14: msgs.append(f'모자 맨 아래 y={bottom} (빨강 선 {g["band"]} ±14 안이어야 함)')
        if name != 'headband' and d != 'up':
            lim = g['band'] - 24   # 모자 아래쪽은 앞머리가 보이므로 선보다 조금 위까지만 검사
            top = T.skull(d)[:lim]
            miss = (top & ~op[:lim]).sum()
            if miss > 150: msgs.append(f'두피 {miss}px이 모자 밖으로 보임(빨강 선 위 머리를 다 덮어야 함)')
    if kind == 'hathair':
        above = op[:g['band'] - 24].sum()
        if above > 400: msgs.append(f'빨강 선 위에 머리카락 {above}px 남음(모자 위로 삐져나옴)')
    if kind in ('bag_body',) and g['bag']:
        x0, y0, x1, y1 = g['bag']; inside = op[y0:y1, x0:x1].sum() / max(1, op.sum())
        if inside < 0.6: msgs.append(f'가방이 보라 상자 밖에 많음(안쪽 {inside:.0%})')
    if kind == 'bag_straps' and g['strap']:
        near = any(op[max(0, y - 12):y + 12, max(0, x - 12):x + 12].any() for x, y in g['strap'])
        if not near: msgs.append('어깨끈이 주황 점(어깨) 근처에 없음')
    if ys.min() < 0 or xs.min() < 0: pass
    return msgs, a


def preview(found, out):
    """기준 캐릭터(머리1·얼굴1·옷5)에 받은 그림을 씌운 네 방향 미리보기"""
    rows = []
    for h in HATS:
        rows.append(('hat', h))
    rows += [('bag', b) for b in BAGS] + [('clip', c) for c in CLIPS]
    S = 0.6; tw, th = int(T.W * S), int(T.H * S)
    O = Image.new('RGBA', (tw * 4, th * len(rows)), (243, 230, 210, 255))
    for r, (kind, name) in enumerate(rows):
        for j, d in enumerate(DIRS):
            c = Image.new('RGBA', (T.W, T.H))
            def L(fn):
                p = found.get(fn)
                if p: c.alpha_composite(Image.open(p).convert('RGBA'))
            def B(p):
                layer = Image.new('RGBA', (T.W, T.H)); layer.alpha_composite(T.img(p), (0, T.HR)); c.alpha_composite(layer)
            if kind == 'bag' and d != 'up': L(f'{name}_body_{d}.png')
            B(T.M['bodies']['5'][d][1]); B(T.M['shoes']['3']['5'][d][1])
            if kind == 'bag': L(f'{name}_straps_{d}.png') if d != 'up' else L(f'{name}_body_{d}.png')
            if kind == 'hat': L(f'hat_{name}_back_{d}.png')
            B(T.M['faces']['1'][d])
            if kind == 'hat' and name != 'headband' and found.get(f'hathair_1_{d}.png'): L(f'hathair_1_{d}.png')
            else: B(T.M['hair']['1'][d])
            if kind == 'clip': L(f'{name}_{d}.png')
            if kind == 'hat': L(f'hat_{name}_front_{d}.png')
            O.alpha_composite(c.resize((tw, th), Image.LANCZOS), (j * tw, r * th))
    O.save(out)


if __name__ == '__main__':
    folder = Path(sys.argv[1]); out = sys.argv[2] if len(sys.argv) > 2 else str(folder / '_preview.png')
    exp = expected(); found = {p.name: p for p in folder.glob('*.png') if not p.name.startswith('_')}
    bad = 0
    for fn, (kind, name, d, need) in exp.items():
        if fn not in found:
            if need: print(f'빠짐   {fn}'); bad += 1
            continue
        msgs, _ = check(found[fn], kind, d, name)
        print(('확인   ' if not msgs else '고칠것 ') + fn + ('' if not msgs else ' : ' + ' / '.join(msgs)))
        bad += bool(msgs)
    extra = [n for n in found if n not in exp]
    for n in extra: print(f'모르는 파일 {n} (이름 규칙 확인)')
    preview(found, out)
    print(f'\n미리보기: {out}')
    print('모두 통과' if not bad else f'고칠 것 {bad}개')
