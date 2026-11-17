# 캐릭터 부품 조합 확인 그림 만들기 (js/avatar/avatar.js 의 그리기 순서·보정값과 똑같이 합성)
#   python tools/avatar_sheet.py out.png [조합 JSON 목록] [--crop y0 y1] [--frames]
# 예) python tools/avatar_sheet.py base.png '[{"outfit":"5","hair":"1","hat":"bucket","glasses":"glasses_teal","bag":"bag_yellow"}]' --frames
import json, re, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
M = json.loads((ROOT / 'assets/avatar/manifest.json').read_text(encoding='utf-8'))
fit_src = (ROOT / 'js/avatar/avatar-fit.js').read_text(encoding='utf-8')
FIT = json.loads(fit_src[fit_src.index('{', fit_src.index('MP_AVATAR_FIT')):fit_src.rindex('}') + 1])
DIRS = M['directions']
DEFAULT = dict(outfit='1', hair='1', face='1', shoes='1', glasses='none', clip='none', hat='none', bag='none')
_cache = {}


def img(p):
    p = p.replace('assets/', 'assets/avatar/', 1)
    if p not in _cache: _cache[p] = Image.open(ROOT / p).convert('RGBA')
    return _cache[p]


def put(c, p, box=None, off=(0, 0)):
    im = img(p)
    if box:
        x, y, w, h = box
        name = Path(p).stem.rsplit('_', 1)[0]
        cb = FIT.get('cropBottom', {}).get(name)
        if cb and cb < im.height: h = h * cb / im.height; im = im.crop((0, 0, im.width, cb))
        im = im.resize((max(1, round(w)), max(1, round(h))), Image.LANCZOS)
        c.alpha_composite(im, (round(x + off[0]), round(y + off[1])))
    else:
        layer = Image.new('RGBA', c.size)
        layer.alpha_composite(im, (round(off[0]), round(off[1])))
        c.alpha_composite(layer)


def scaled(box, adj):
    if not adj: return box
    dx, dy = adj[0], adj[1]; s = adj[2] if len(adj) > 2 else 1
    x, y, w, h = box
    return [x + dx - w * (s - 1) / 2, y + dy - h * (s - 1), w * s, h * s]  # 아래(챙) 기준으로 키움


def compose(a, d, f, bg=(239, 221, 207, 255)):
    a = {**DEFAULT, **a}
    c = Image.new('RGBA', (256, 320), bg)
    o, fitted = a['outfit'], M['fitted']
    bag = FIT['bag'].get(a['bag']) if a['bag'] != 'none' else None
    fbag = bool(bag and bag.get('fitted'))
    hat_hair = a['hair'] == '1' and a['hat'] == 'bucket'
    if d != 'up' and bag:
        if fbag: put(c, fitted['bag_yellow'][d])
        elif bag.get(d): put(c, M['accessories'][a['bag']][d], bag[d])
    put(c, M['bodies'][o][d][f])
    put(c, M['shoes'][a['shoes']][o][d][f])
    if d != 'up' and bag:
        put(c, fitted['bag_straps'][d] if fbag else f"assets/fitted/{bag['straps']}_{d}.png")
    if d == 'up' and bag:  # 뒷모습: 머리보다 먼저 그려 긴 머리가 가방 위로 내려오게
        if fbag: put(c, fitted['bag_yellow']['up'])
        else: put(c, M['accessories'][a['bag']][bag.get('upImage', 'up')], bag['up'])
    put(c, M['faces'][a['face']][d])
    g = a['glasses']
    def glasses():
        o1 = FIT['glasses'][d]; o2 = FIT['glassesByFace'].get(a['face'], {}).get(d, [0, 0])
        put(c, fitted[g][d], off=(o1[0] + o2[0], o1[1] + o2[1]))
    # 옆모습: 안경다리가 귀 쪽 머리카락 밑으로 들어가게 머리보다 먼저 / 앞모습: 머리 위에
    if d in ('left', 'right') and g != 'none': glasses()
    put(c, fitted['bucket_hair1'][d] if hat_hair else M['hair'][a['hair']][d])
    if d == 'down' and g != 'none': glasses()
    if a['clip'] != 'none' and FIT['clip'].get(d):
        adj = FIT['clipByHair'].get(a['hair'], {}).get(d)
        put(c, M['accessories'][a['clip']][d], scaled(FIT['clip'][d], adj))
    if a['hat'] != 'none' and not hat_hair:
        hb = FIT['hatByHair'].get(a['hair'], {})
        adj = (hb.get(a['hat']) or hb.get('*') or {}).get(d)
        put(c, M['accessories'][a['hat']][d], scaled(FIT['hat'][a['hat']][d], adj))
    return c


def sheet(combos, crop=(0, 320), frames=False, scale=0.5):
    y0, y1 = crop; ch = y1 - y0
    cols = [(d, f) for d in DIRS for f in (range(4) if frames else [1])]
    cw, rh = round(256 * scale), round(ch * scale)
    W = Image.new('RGBA', (len(cols) * cw, len(combos) * rh), (255, 255, 255, 255))
    for i, a in enumerate(combos):
        for j, (d, f) in enumerate(cols):
            im = compose(a, d, f).crop((0, y0, 256, y1)).resize((cw, rh), Image.LANCZOS)
            W.alpha_composite(im, (j * cw, i * rh))
    return W


if __name__ == '__main__':
    args = sys.argv[1:]
    out = args.pop(0)
    crop, frames, scale = (0, 320), False, 0.5
    if '--crop' in args:
        i = args.index('--crop'); crop = (int(args[i + 1]), int(args[i + 2])); del args[i:i + 3]
    if '--frames' in args: args.remove('--frames'); frames = True
    if '--scale' in args:
        i = args.index('--scale'); scale = float(args[i + 1]); del args[i:i + 2]
    combos = json.loads(args[0]) if args else [dict(outfit='5', hair='1', face='1', hat='bucket', glasses='glasses_teal', bag='bag_yellow', shoes='3')]
    sheet(combos, crop, frames, scale).save(out)
