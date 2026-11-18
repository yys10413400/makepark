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
HR = 56  # 모자가 머리 위로 나갈 수 있게 칸 위에 둔 여유(js/avatar/avatar.js 의 HEADROOM 과 같게)


def img(p):
    p = p.replace('assets/', 'assets/avatar/', 1)
    if p not in _cache: _cache[p] = Image.open(ROOT / p).convert('RGBA')
    return _cache[p]


def put(c, p, box=None, off=(0, 0), im=None):
    im = im or img(p)
    off = (off[0], off[1] + HR)
    if box:
        x, y, w, h = box
        name = Path(p).stem.rsplit('_', 1)[0] if p else ''
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


def hat_image(name, d):
    """모자 그림에서 머리가 들어가는 입구(안감)를 지운 그림"""
    import math
    import numpy as np
    k = ('hat', name, d)
    if k in _cache: return _cache[k]
    im = img(M['accessories'][name][d])
    e = FIT.get('hatOpening', {}).get(name, {}).get(d)
    if e:
        a = np.array(im).copy(); h, w = a.shape[:2]; yy, xx = np.mgrid[0:h, 0:w]
        cx, cy, rx, ry, ang = e; t = math.radians(ang); dx = xx - cx; dy = yy - cy
        u = (dx * math.cos(t) + dy * math.sin(t)) / rx; v = (-dx * math.sin(t) + dy * math.cos(t)) / ry
        a[(u * u + v * v <= 1) | ((np.abs(u) <= 1) & (v >= 0)), 3] = 0  # 입구 + 그 아래 앞쪽 테두리
        im = Image.fromarray(a)
    _cache[k] = im
    return im


def hat_cut_line(ha, rise=2.2):
    """모자 아래 가장자리 선. 모자 바깥 옆으로는 머리 둥근 모양을 따라 비스듬히 올라감(세로로 뚝 끊기지 않게)"""
    import numpy as np
    w = ha.shape[1]; cut = np.full(w, -1.0)
    cols = [x for x in range(w) if ha[:, x].any()]
    for x in cols: cut[x] = np.where(ha[:, x])[0].max()
    if not cols: return cut
    x0, x1 = cols[0], cols[-1]
    for x in range(x0): cut[x] = cut[x0] - rise * (x0 - x)
    for x in range(x1 + 1, w): cut[x] = cut[x1] - rise * (x - x1)
    return cut


WORN_DIR = ROOT / 'assets/avatar/worn'


def worn(n):
    """착용 그림(캐릭터 칸 256×376에 맞춰 그린 그림)이 있으면 경로, 없으면 None (avatar.js 의 worn 과 같음)"""
    return f'assets/worn/{n}.png' if (WORN_DIR / f'{n}.png').exists() else None


def raw(c, p):
    """착용 그림: 이미 칸(위 여유 포함)에 맞춰져 있어 그대로 겹침"""
    layer = Image.new('RGBA', c.size); layer.alpha_composite(img(p)); c.alpha_composite(layer)


def compose(a, d, f, bg=(239, 221, 207, 255)):
    """js/avatar/avatar.js 의 layers()·composite() 와 같은 순서로 합성"""
    import numpy as np
    a = {**DEFAULT, **a}
    c = Image.new('RGBA', (256, 320 + HR), bg)
    o, fitted = a['outfit'], M['fitted']
    bag = FIT['bag'].get(a['bag']) if a['bag'] != 'none' else None
    fbag = bool(bag and bag.get('fitted'))
    hat_front = worn(f"hat_{a['hat']}_front_{d}") if a['hat'] != 'none' else None
    hat_back = worn(f"hat_{a['hat']}_back_{d}") if hat_front else None
    hat_hair_w = worn(f"hathair_{a['hair']}_{d}") if hat_front and a['hat'] != 'headband' else None
    hat_hair = not hat_front and a['hair'] == '1' and a['hat'] == 'bucket'
    bag_body = worn(f"{a['bag']}_body_{d}") if bag else None
    bag_straps = worn(f"{a['bag']}_straps_{d}") if bag and d != 'up' else None
    if d != 'up' and bag:   # 등 뒤 가방
        if bag_body: raw(c, bag_body)
        elif fbag: put(c, fitted['bag_yellow'][d])
        elif bag.get(d): put(c, M['accessories'][a['bag']][bag.get('sideImage', {}).get(d, d)], bag[d])
    put(c, M['bodies'][o][d][f])
    put(c, M['shoes'][a['shoes']][o][d][f])
    if d != 'up' and bag:   # 어깨끈
        if bag_straps: raw(c, bag_straps)
        elif not bag_body: put(c, fitted['bag_straps'][d] if fbag else f"assets/fitted/{bag['straps']}_{d}.png")
    if d == 'up' and bag:   # 뒷모습: 머리보다 먼저 그려 긴 머리가 가방 위로 내려오게
        if bag_body: raw(c, bag_body)
        elif fbag: put(c, fitted['bag_yellow']['up'])
        else: put(c, M['accessories'][a['bag']][bag.get('upImage', 'up')], bag['up'])
    if hat_back: raw(c, hat_back)
    # 머리(얼굴·머리카락)는 따로 그린 뒤, 모자를 쓰면 모자 띠 선 위쪽을 지우고 합침
    body_c = c
    c = Image.new('RGBA', body_c.size)
    put(c, M['faces'][a['face']][d])
    g = a['glasses']
    def glasses():
        o1 = FIT['glasses'][d]; o2 = FIT['glassesByFace'].get(a['face'], {}).get(d, [0, 0])
        im = img(fitted[g][d]); cx = FIT.get('glassesClipX', {}).get(d)
        if cx:  # 옆모습: 안경다리가 귀에서 끝나게
            im = im.copy(); px = im.load()
            for yy in range(im.height):
                for xx in range(im.width):
                    if not (cx[0] - o1[0] - o2[0] <= xx < cx[1] - o1[0] - o2[0]): px[xx, yy] = (0, 0, 0, 0)
        put(c, None, off=(o1[0] + o2[0], o1[1] + o2[1]), im=im)
    hair_w = worn(f"hair_{a['hair']}_{d}")
    if hat_hair_w: raw(c, hat_hair_w)
    elif hat_hair and not hair_w: put(c, fitted['bucket_hair1'][d])
    elif hair_w: raw(c, hair_w)
    else: put(c, M['hair'][a['hair']][d])
    if d != 'up' and g != 'none': glasses()   # 머리카락 위에(앞머리가 렌즈를 가리지 않게)
    hat_layer, cut_on = None, False
    if hat_front:
        hat_layer = Image.new('RGBA', c.size); raw(hat_layer, hat_front)
        cut_on = not hat_hair_w and a['hat'] not in FIT.get('hatNoCut', [])
    elif a['hat'] != 'none' and not hat_hair:
        hb = FIT['hatByHair'].get(a['hair'], {})
        adj = (hb.get(a['hat']) or hb.get('*') or {}).get(d) or [0, 0, 1]
        hx, hy, hs = FIT['hat'][a['hat']][d]
        im = hat_image(a['hat'], d); hs *= (adj[2] if len(adj) > 2 else 1)
        hat_layer = Image.new('RGBA', c.size)
        put(hat_layer, None, [hx + adj[0], hy + adj[1], im.width * hs, im.height * hs], im=im)
        cut_on = a['hat'] not in FIT.get('hatNoCut', [])
    if hat_layer and cut_on:
        # 모자 아래 가장자리보다 위쪽의 머리(얼굴·머리카락)를 지움: 모자 밖으로 삐져나온 머리를 숨김
        arr = np.array(c)
        cut = hat_cut_line(np.array(hat_layer)[..., 3] > 60)
        yy = np.arange(arr.shape[0])[:, None]
        m = np.clip((cut[None, :] - yy) / 3.0 + 0.5, 0, 1)   # 선 위쪽은 지우고, 선 근처 3px은 부드럽게
        arr[..., 3] = (arr[..., 3] * (1 - m)).astype('uint8')
        c = Image.fromarray(arr)
    body_c.alpha_composite(c); c = body_c
    clip_w = worn(f"{a['clip']}_{d}") if a['clip'] != 'none' else None
    if clip_w: raw(c, clip_w)
    elif a['clip'] != 'none' and FIT['clip'].get(d) and not worn(f"{a['clip']}_down"):
        adj = FIT['clipByHair'].get(a['hair'], {}).get(d)
        put(c, M['accessories'][a['clip']][d], scaled(FIT['clip'][d], adj))
    if hat_layer: c.alpha_composite(hat_layer)
    return c


def sheet(combos, crop=(0, 320), frames=False, scale=0.5):
    y0, y1 = crop; ch = y1 - y0
    cols = [(d, f) for d in DIRS for f in (range(4) if frames else [1])]
    cw, rh = round(256 * scale), round(ch * scale)
    W = Image.new('RGBA', (len(cols) * cw, len(combos) * rh), (255, 255, 255, 255))
    for i, a in enumerate(combos):
        for j, (d, f) in enumerate(cols):
            im = compose(a, d, f).crop((0, y0 + HR, 256, y1 + HR)).resize((cw, rh), Image.LANCZOS)
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
