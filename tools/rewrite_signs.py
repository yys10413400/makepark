"""지도 간판 글씨를 지우고 다시 쓰기.

사용법:
  python tools/rewrite_signs.py assets/maps-src/makepark-christmas-original.png assets/maps/makepark-christmas.png
  python tools/rewrite_signs.py assets/maps-src/makepark-normal-original.png    assets/maps/makepark-normal.png

- 원본(assets/maps-src)은 그대로 두고 결과만 assets/maps 에 저장합니다.
- 각 간판의 대략적인 글자 위치(SIGNS)에서 글자 모양 덩어리만 찾아 지우고(주변 바탕색으로 메움),
  같은 자리·같은 높이에 맑은 고딕 Bold로 다시 씁니다.
- 글자를 바꾸려면 SIGNS 의 text 를 고치면 됩니다. 새 지도면 위치를 확인하세요.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT = 'C:/Windows/Fonts/malgunbd.ttf'
# id, 쓸 글자, 대략적인 글자 상자(x0,y0,x1,y1), 종류(dark: 크림 바탕 검은 글씨 / light: 보라 바탕 흰 글씨)
SIGNS = [
    ('coaster', '코스터 익스프레스', (280, 272, 405, 300), 'dark'),
    ('ticket', '매표소', (580, 213, 632, 240), 'dark'),
    ('shop', '기념품 가게', (806, 278, 896, 302), 'dark'),
    ('mypark', '마이파크', (1100, 157, 1162, 180), 'dark'),
    ('star', '스타 페스티벌', (1118, 285, 1222, 311), 'light'),
    ('melody', '멜로디 스테이지', (206, 466, 306, 494), 'dark'),
    ('thrill', '짜릿 어드벤처', (1066, 487, 1164, 513), 'dark'),
    ('fountain', '분수 광장', (657, 628, 726, 652), 'dark'),
    ('parade', '레인보우 퍼레이드', (240, 722, 362, 749), 'dark'),
    ('arcade', '플레이 아케이드', (779, 742, 873, 768), 'dark'),
    ('ghost', '유령의 집', (1128, 767, 1197, 794), 'light'),
]
# 간판별 미세 조정: (가로 이동 px, 폭 증감 px). 곡선 간판처럼 테두리에 붙는 경우
ADJUST = {'melody': (4, -10)}
COLORS = {'dark': (44, 38, 30), 'light': (252, 248, 240)}


def letter_mask(a, box, kind):
    """상자 안에서 글자 크기 덩어리(가로 30·세로 24 이하, 상자 가장자리에 닿지 않음)만 골라 마스크로 돌려줌"""
    x0, y0, x1, y1 = box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4
    reg = a[y0:y1, x0:x1].astype(int)
    lum = reg.mean(-1); sat = reg.max(-1) - reg.min(-1)
    m = (lum < 120) if kind == 'dark' else ((lum > 205) & (sat < 45))
    H, W = m.shape
    seen = np.zeros_like(m); keep = np.zeros_like(m)
    for sy in range(H):
        for sx in range(W):
            if not m[sy, sx] or seen[sy, sx]:
                continue
            st = [(sy, sx)]; seen[sy, sx] = 1; pts = []
            while st:
                y, x = st.pop(); pts.append((y, x))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = 1; st.append((ny, nx))
            ys = [q[0] for q in pts]; xs = [q[1] for q in pts]
            bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
            touch = min(xs) == 0 or min(ys) == 0 or max(xs) == W - 1 or max(ys) == H - 1
            # 붙어 버린 글자 덩어리도 잡되(폭 50까지), 간판 테두리처럼 얇고 긴 선은 제외
            glyph = bh <= 24 and (bw <= 22 or (bw <= 50 and bh >= 5))
            if glyph and len(pts) >= 3 and not touch:
                for y, x in pts:
                    keep[y, x] = 1
    full = np.zeros(a.shape[:2], bool)
    full[y0:y1, x0:x1] = keep
    return full


def text_band(m):
    """글자가 가장 많이 몰린 가로 띠(행)와 그 안의 좌우 범위 → 글자 상자. 별·리본 같은 잡티는 빠짐"""
    rows = m.sum(1); peak = rows.max()
    yc = int(np.argmax(rows))
    y0 = yc
    while y0 > 0 and rows[y0 - 1] > peak * 0.06:
        y0 -= 1
    y1 = yc
    while y1 < len(rows) - 1 and rows[y1 + 1] > peak * 0.06:
        y1 += 1
    ys, xs = np.where(m[y0:y1 + 1])
    return (int(np.percentile(xs, 0.5)), y0, int(np.percentile(xs, 99.5)), y1)


def dilate(m, r):
    out = m.copy()
    for _ in range(r):
        p = np.pad(out, 1)
        out = out | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:] | p[:-2, :-2] | p[2:, 2:] | p[:-2, 2:] | p[2:, :-2]
    return out


def erase(a, mask):
    """가로 방향으로 양옆의 지워지지 않은 바탕색을 이어 메움"""
    out = a.astype(float).copy()
    ys = np.where(mask.any(1))[0]
    for y in ys:
        row = out[y]; mk = mask[y]; good = np.where(~mk)[0]
        for x in np.where(mk)[0]:
            L = good[good < x]; R = good[good > x]
            if len(L) and len(R):
                l, r = L[-1], R[0]; t = (x - l) / (r - l)
                row[x] = row[l] * (1 - t) + row[r] * t
            elif len(L) or len(R):
                row[x] = row[L[-1] if len(L) else R[0]]
    return out


def draw_text(img, text, box, color):
    x0, y0, x1, y1 = box
    tw, th = x1 - x0 + 1, y1 - y0 + 1
    S = 4
    font = ImageFont.truetype(FONT, 28 * S)
    tmp = Image.new('L', (len(text) * 40 * S, 60 * S), 0)
    ImageDraw.Draw(tmp).text((10 * S, 5 * S), text, font=font, fill=255, stroke_width=3, stroke_fill=255)
    g = tmp.crop(tmp.getbbox())
    gw0, gh0 = g.width / S, g.height / S
    th = min(th, 17)
    tw = tw + 2                   # 곡선으로 휜 글씨는 띠가 높게 잡히므로 상한
    k = th / gh0                       # 원래 글자 높이에 맞춤
    sx = min(1.0, tw / (gw0 * k))      # 폭이 넘치면 가로를 조금(최대 90%까지) 좁히고
    if sx < 0.9:                       # 그래도 넘치면 전체를 줄임
        k *= sx / 0.9; sx = 0.9
    gw, gh = max(1, round(gw0 * k * sx)), max(1, round(gh0 * k))
    g = g.resize((gw, gh), Image.LANCZOS)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    img.paste(Image.new('RGB', (gw, gh), color), (round(cx - gw / 2), round(cy - gh / 2)), g)


def main(src, dst):
    img = Image.open(src).convert('RGB')
    a = np.asarray(img)
    jobs = []
    for sid, text, box, kind in SIGNS:
        m = letter_mask(a, box, kind)
        if not m.any():
            print('글자를 찾지 못함:', sid); continue
        bb = text_band(m)
        band = np.zeros_like(m); band[bb[1]:bb[3] + 1, bb[0]:bb[2] + 1] = True
        jobs.append((sid, text, kind, dilate(m & band, 2), bb))
    mask = np.zeros(a.shape[:2], bool)
    for j in jobs:
        mask |= j[3]
    out = Image.fromarray(np.clip(erase(a, mask), 0, 255).astype(np.uint8))
    for sid, text, kind, _, bb in jobs:
        dx, dw = ADJUST.get(sid, (0, 0))
        bb = (bb[0] + dx - dw // 2, bb[1], bb[2] + dx + dw // 2, bb[3])
        draw_text(out, text, bb, COLORS[kind])
        print(sid, text, bb)
    out.save(dst, optimize=True)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
