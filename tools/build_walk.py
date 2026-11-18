"""
걷는 자세 그림(assets/characters-src/walk/<id>_<view>.png, 제미나이 한 장에 한 자세)을 게임용으로 만듭니다.

  python tools/build_walk.py

 - view: down(앞) up(뒤) side(옆, 왼쪽을 보게 그림 → 오른쪽을 보게 뒤집음)
 - 배경 지우기는 build_characters.py 와 같은 방법
 - 크기: 서 있는 그림(assets/characters/<id>.webp)과 머리 폭이 같게 맞춤
 - 원본은 서 있는 그림을 제미나이에 올려 "다리·팔만 걷는 자세로" 고쳐 받은 것(비율·색이 그대로)
 - 결과: assets/characters/<id>-walk.webp, js/data/character-sprites.js 의 <id>.walk
게임에서는 [걷는 자세, 서 있기, (앞·뒤는 좌우 뒤집은) 걷는 자세, 서 있기] 순서로 돌려 걷습니다.
"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_characters import remove_bg, ROOT, OUT, JS, PAD

SRC = os.path.join(ROOT, 'assets', 'characters-src', 'walk')
VIEWS = [('down', 'down'), ('up', 'up'), ('side', 'right')]


def crop_alpha(rgba):
    ys, xs = np.where(rgba[..., 3] > 20)
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def head_width(a):
    m = a[..., 3] > 120
    h = m.shape[0]
    rows = m[:int(h * 0.28)]
    return max((np.ptp(np.where(r)[0]) + 1 if r.any() else 0) for r in rows)


def match_color(src, ref):
    """불투명 부분의 채널별 평균·표준편차를 서 있는 그림에 맞춤(조금만: 70%)"""
    out = src.astype(float)
    ms, mr = src[..., 3] > 200, ref[..., 3] > 200
    for c in range(3):
        a, b = out[..., c][ms], ref[..., c][mr].astype(float)
        adj = (out[..., c] - a.mean()) / max(a.std(), 1) * b.std() + b.mean()
        out[..., c] = out[..., c] * 0.3 + adj * 0.7
    out[..., :3] = np.clip(out[..., :3], 0, 255)
    return out.astype(np.uint8)


def main():
    txt = open(JS, encoding='utf-8').read()
    head = txt[:txt.index('window.')]
    meta = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
    ids = sorted({f.split('_')[0] for f in os.listdir(SRC) if f.endswith('.png')})
    for cid in ids:
        sheet = np.array(Image.open(os.path.join(ROOT, meta[cid]['src'])).convert('RGBA'))
        ims, rects, x = [], {}, 0
        for src_view, view in VIEWS:
            f = os.path.join(SRC, f'{cid}_{src_view}.png')
            if not os.path.exists(f):
                continue
            r = meta[cid]['views'][view]
            stand = sheet[r[1]:r[1] + r[3], r[0]:r[0] + r[2]]
            rgba = crop_alpha(remove_bg(np.array(Image.open(f).convert('RGB')).astype(float)))
            if src_view == 'side':
                rgba = rgba[:, ::-1]
            s = head_width(stand) / head_width(rgba)
            im = Image.fromarray(rgba).resize((round(rgba.shape[1] * s), round(rgba.shape[0] * s)), Image.LANCZOS)
            arr = np.array(im)   # (서 있는 그림을 고쳐 받은 자세라 색이 같음. 다르면 match_color(arr, stand))
            im = Image.fromarray(arr)
            a = arr[..., 3] > 100
            ys, xs = np.where(a[int(a.shape[0] * 0.75):])
            fx = float(xs.mean()) if len(xs) else im.width / 2
            if view == 'right':   # 옆모습: 몸통(가운데 줄)을 서 있는 그림의 발 기준점 자리에
                mid = a[int(a.shape[0] * 0.45):int(a.shape[0] * 0.6)]
                fx = float(np.where(mid)[1].mean())
                smid = stand[..., 3][int(stand.shape[0] * 0.45):int(stand.shape[0] * 0.6)] > 100
                fx += r[4] - float(np.where(smid)[1].mean())
            ims.append((view, im))
            rects[view] = [x + PAD, PAD, im.width, im.height, round(fx, 1), im.height]
            x += im.width + PAD * 2
        out = Image.new('RGBA', (x, max(i.height for _, i in ims) + PAD * 2), (0, 0, 0, 0))
        for view, im in ims:
            out.paste(im, (rects[view][0], rects[view][1]))
        out.save(os.path.join(OUT, cid + '-walk.webp'), 'WEBP', quality=90, method=6)
        meta[cid]['walk'] = {'src': 'assets/characters/' + cid + '-walk.webp', 'views': rects}
        print(cid, out.size, {v: r[2:4] for v, r in rects.items()})
    with open(JS, 'w', encoding='utf-8') as fo:
        fo.write(head + 'window.MP_CHAR_SPRITES = ' + json.dumps(meta, ensure_ascii=False, indent=1, sort_keys=True) + ';\n')


if __name__ == '__main__':
    main()
