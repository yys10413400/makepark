"""지도 간판 글씨를 지우고 다시 쓰기.

사용법:
  (2배 지도) python tools/rewrite_signs.py assets/maps-src/makepark-christmas-2x-original.png out.png assets/maps-src/makepark-christmas-original.png
  python tools/rewrite_signs.py assets/maps-src/makepark-christmas-original.png assets/maps/makepark-christmas.png
  python tools/rewrite_signs.py assets/maps-src/makepark-normal-original.png    assets/maps/makepark-normal.png

- 1배·2배 지도 모두 됩니다(좌표는 1배 기준, 그림 크기에 맞춰 자동 배율).
- 원본(assets/maps-src)은 그대로 두고 결과만 assets/maps 에 저장합니다.
- 각 간판의 대략적인 글자 위치(SIGNS)에서 글자 모양 덩어리만 찾아 지우고(주변 바탕색으로 메움),
  같은 자리·같은 높이에 맑은 고딕 Bold로 다시 씁니다.
- 글자를 바꾸려면 SIGNS 의 text 를 고치면 됩니다. 새 지도면 위치를 확인하세요.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT = 'C:/Windows/Fonts/malgunbd.ttf'
WORLD_W = 1448   # 아래 좌표의 기준(게임 좌표계 = 1배 지도 가로 픽셀)
K = 1.0          # 실제 그림 배율(2배 지도면 2.0). main 에서 정함
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
    p = round(4 * K)
    x0, y0, x1, y1 = round(box[0] * K) - p, round(box[1] * K) - p, round(box[2] * K) + p, round(box[3] * K) + p
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
            glyph = bh <= 24 * K and (bw <= 22 * K or (bw <= 50 * K and bh >= 5 * K))
            if glyph and len(pts) >= 3 * K * K and not touch:
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


def text_cluster(m, gap=11):
    """글자 띠(text_band) 안에서 가운데 글자 무리의 상자. 빈 열이 gap 칸 이상 이어지면 거기서 끝으로 봄"""
    bx0, by0, bx1, by1 = text_band(m)
    cols = m[by0:by1 + 1].any(0)
    xs = np.where(cols)[0]
    if len(xs) == 0:
        return bx0, by0, bx1, by1
    mid = int(np.median(xs))
    if not cols[mid]:
        mid = xs[np.argmin(np.abs(xs - mid))]
    L = mid; run = 0; x = mid
    while x > 0:
        x -= 1
        if cols[x]: L = x; run = 0
        else:
            run += 1
            if run >= gap: break
    Rr = mid; run = 0; x = mid
    while x < len(cols) - 1:
        x += 1
        if cols[x]: Rr = x; run = 0
        else:
            run += 1
            if run >= gap: break
    rows = m[by0:by1 + 1, L:Rr + 1].any(1); ry = np.where(rows)[0]
    return L, by0 + ry.min(), Rr, by0 + ry.max()


def dilate(m, r):
    out = m.copy()
    for _ in range(r):
        p = np.pad(out, 1)
        out = out | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:] | p[:-2, :-2] | p[2:, 2:] | p[:-2, 2:] | p[2:, :-2]
    return out


def erase(a, mask, anchor_ok=None, vreach=24):
    """지울 칸(mask)을 간판 바탕색으로 메움.
    - 가로로 이어진 지울 구간마다 바로 왼쪽·오른쪽 픽셀이 바탕색(anchor_ok)이면 그 두 색을 이어 칠함
    - 한쪽만 바탕색이면 그 색으로, 양쪽 다 아니면(테두리·남은 글자 조각) 세로 위아래 바탕색으로 이음
      → 테두리 너머 색을 끌어와 줄무늬가 생기지 않게 함"""
    out = a.astype(float).copy()
    ok = ~mask if anchor_ok is None else (~mask & anchor_ok)
    H, W = mask.shape
    for y in np.where(mask.any(1))[0]:
        row = mask[y]; x = 0
        while x < W:
            if not row[x]:
                x += 1; continue
            s0 = x
            while x < W and row[x]:
                x += 1
            e0 = x - 1
            L, R = s0 - 1, e0 + 1
            lok = L >= 0 and ok[y, L]; rok = R < W and ok[y, R]
            if lok and rok:
                for xx in range(s0, e0 + 1):
                    t = (xx - L) / (R - L); out[y, xx] = a[y, L] * (1 - t) + a[y, R] * t
            elif lok or rok:
                c = a[y, L] if lok else a[y, R]
                out[y, s0:e0 + 1] = c
            else:
                for xx in range(s0, e0 + 1):
                    up = next((yy for yy in range(y - 1, max(-1, y - vreach), -1) if ok[yy, xx]), None)
                    dn = next((yy for yy in range(y + 1, min(H, y + vreach)) if ok[yy, xx]), None)
                    if up is not None and dn is not None:
                        t = (y - up) / (dn - up); out[y, xx] = a[up, xx] * (1 - t) + a[dn, xx] * t
                    elif up is not None or dn is not None:
                        out[y, xx] = a[up if up is not None else dn, xx]
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
    th = min(th, 17 * K)
    tw = tw + 2 * K                   # 곡선으로 휜 글씨는 띠가 높게 잡히므로 상한
    k = th / gh0                       # 원래 글자 높이에 맞춤
    sx = min(1.0, tw / (gw0 * k))      # 폭이 넘치면 가로를 조금(최대 90%까지) 좁히고
    if sx < 0.9:                       # 그래도 넘치면 전체를 줄임
        k *= sx / 0.9; sx = 0.9
    gw, gh = max(1, round(gw0 * k * sx)), max(1, round(gh0 * k))
    g = g.resize((gw, gh), Image.LANCZOS)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    img.paste(Image.new('RGB', (gw, gh), color), (round(cx - gw / 2), round(cy - gh / 2)), g)


def main(src, dst, ref=None):
    """src 그림의 간판을 고쳐 dst 로 저장. ref(1배 원본)를 주면 글자 찾기는 ref 에서 하고 src 크기에 맞춰 키움
    (확대·선명화된 2배 그림은 글자가 서로 붙어 덩어리로 찾기 어려우므로)"""
    global K
    img = Image.open(src).convert('RGB')
    a = np.asarray(img)
    detect_img = a
    if ref:
        r = Image.open(ref).convert('RGB')
        K = 1.0
        detect_img = np.asarray(r)
        up = img.width / r.width
    else:
        K = img.width / WORLD_W
        up = 1.0
    jobs = []
    lum_a = a.astype(int).mean(-1); sat_a = a.astype(int).max(-1) - a.astype(int).min(-1)
    for sid, text, box, kind in SIGNS:
        m = letter_mask(detect_img, box, kind)
        if not m.any():
            print('글자를 찾지 못함:', sid); continue
        x0, y0, x1, y1 = text_cluster(m)
        # 글자 상자(지도 그림 배율) + 여유
        mx, my = 3, 3
        R = [int(round((x0 - mx) * up)), int(round((y0 - my) * up)), int(round((x1 + mx + 1) * up)), int(round((y1 + my + 2) * up))]
        rect = np.zeros(a.shape[:2], bool); rect[R[1]:R[3], R[0]:R[2]] = True
        # 상자 안의 글자색 픽셀(어두운 글씨 / 흰 글씨)을 모두 지움 → 2배 그림의 굵어진 획·어긋남도 함께 지워짐
        tp = (lum_a < 150) if kind == 'dark' else ((lum_a > 185) & (sat_a < 70))
        dm = dilate(tp & rect, max(1, round(1.5 * up))) & rect
        bb = (int(round(x0 * up)), int(round(y0 * up)), int(round((x1 + 1) * up)) - 1, int(round((y1 + 1) * up)) - 1)
        jobs.append((sid, text, kind, dm, bb))
    K = img.width / WORLD_W
    mask = np.zeros(a.shape[:2], bool)
    anchor = np.ones(a.shape[:2], bool)
    lum = a.astype(int).mean(-1)
    for sid, text, kind, m, bb in jobs:
        mask |= m
        # 이 간판 둘레에서 바탕색만 기준으로 인정: 크림 간판은 밝은 픽셀, 보라 간판은 흰 글씨가 아닌 픽셀
        ys, xs = np.where(m)
        y0, y1, x0, x1 = max(0, ys.min() - 8), ys.max() + 9, max(0, xs.min() - 30), xs.max() + 31
        reg = lum[y0:y1, x0:x1]
        anchor[y0:y1, x0:x1] = (reg > 175) if kind == 'dark' else (reg < 185)
    out = Image.fromarray(np.clip(erase(a, mask, anchor), 0, 255).astype(np.uint8))
    for sid, text, kind, _, bb in jobs:
        dx, dw = ADJUST.get(sid, (0, 0)); dx = round(dx * K); dw = round(dw * K)
        bb = (bb[0] + dx - dw // 2, bb[1], bb[2] + dx + dw // 2, bb[3])
        draw_text(out, text, bb, COLORS[kind])
        print(sid, text, bb)
    out.save(dst, optimize=True)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
