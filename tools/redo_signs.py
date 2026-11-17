"""지도 간판 글씨를 깨끗하게 지우고 글자만 다시 쓰기 (덮개 배경 없이).

사용법: python tools/redo_signs.py <입력 2배 지도.png> <출력.png>

방법
1) 간판 바탕(크림색 / 보라색)과 이어진 영역을 찾고, 그 바탕에 둘러싸인 '구멍' = 글자 픽셀만 고릅니다.
   간판 테두리·장식은 바탕 밖이므로 건드리지 않습니다.
2) 글자 픽셀은 둘레 바탕색에서 부드럽게 번져 들어오도록 메웁니다(확산 채우기). 줄무늬·네모 덮개가 생기지 않습니다.
3) 지운 자리 가운데에 맑은 고딕 Bold로 글자만 씁니다(배경 없이).
좌표는 1배 지도(1448×1086) 기준이며 그림 크기에 맞춰 배율을 적용합니다.
"""
import sys
from collections import deque
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT = 'C:/Windows/Fonts/malgunbd.ttf'
WORLD_W = 1448
# id, 글자, 글자 대략 상자(1배 x0,y0,x1,y1), 간판 종류(cream: 크림 바탕 진한 글씨 / purple: 보라 바탕 흰 글씨)
SIGNS = [
    ('coaster', '코스터 익스프레스', (280, 272, 405, 300), 'cream'),
    ('ticket', '매표소', (580, 213, 632, 240), 'cream'),
    ('shop', '기념품 가게', (806, 278, 896, 302), 'cream'),
    ('mypark', '마이파크', (1100, 157, 1162, 180), 'cream'),
    ('star', '스타 페스티벌', (1118, 285, 1222, 311), 'purple'),
    ('melody', '멜로디 스테이지', (206, 466, 306, 494), 'cream'),
    ('thrill', '짜릿 어드벤처', (1066, 487, 1164, 513), 'cream'),
    ('fountain', '분수 광장', (657, 628, 726, 652), 'cream'),
    ('parade', '레인보우 퍼레이드', (240, 722, 362, 749), 'cream'),
    ('arcade', '플레이 아케이드', (779, 742, 873, 768), 'cream'),
    ('ghost', '유령의 집', (1128, 767, 1197, 794), 'purple'),
]
INK = {'cream': (48, 34, 26), 'purple': (255, 251, 242)}


def bg_mask(reg, kind):
    r, g, b = reg[..., 0], reg[..., 1], reg[..., 2]
    lum = reg.mean(-1); sat = reg.max(-1) - reg.min(-1)
    if kind == 'cream':
        return (lum > 178) & (sat < 90) & (r >= b)
    return (b > r + 8) & (b > g + 20) & (lum < 175) & (lum > 50)


def flood(mask, seeds):
    H, W = mask.shape; out = np.zeros_like(mask); q = deque()
    for y, x in seeds:
        if 0 <= y < H and 0 <= x < W and mask[y, x] and not out[y, x]:
            out[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True; q.append((ny, nx))
    return out


def label(m):
    """4방향 연결 덩어리 번호 매기기"""
    H, W = m.shape; lab = np.zeros((H, W), int); n = 0
    for y in range(H):
        for x in range(W):
            if m[y, x] and not lab[y, x]:
                n += 1; q = deque([(y, x)]); lab[y, x] = n
                while q:
                    cy, cx = q.popleft()
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n; q.append((ny, nx))
    return lab


def dilate(m, r):
    out = m.copy()
    for _ in range(r):
        p = np.pad(out, 1)
        out = out | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    return out


def diffuse_fill(reg, hole, iters=600):
    """구멍(hole)을 둘레 색이 고르게 번져 들어오도록 채움(라플라스 확산)"""
    out = reg.astype(float).copy()
    known = ~hole
    out[hole] = out[known].mean(0) if known.any() else 0
    for _ in range(iters):
        p = np.pad(out, ((1, 1), (1, 1), (0, 0)), mode='edge')
        avg = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) / 4
        out[hole] = avg[hole]
    return out


def draw_text(img, text, cx, cy, h, max_w, ink):
    S = 4
    font = ImageFont.truetype(FONT, 32 * S)
    tmp = Image.new('L', (len(text) * 46 * S, 64 * S), 0)
    ImageDraw.Draw(tmp).text((8 * S, 6 * S), text, font=font, fill=255, stroke_width=S, stroke_fill=255)
    g = tmp.crop(tmp.getbbox())
    k = h / g.height
    w = g.width * k
    if w > max_w:  # 넘치면 가로를 조금(90%까지) 좁히고, 그래도 넘치면 전체를 줄임
        sx = max(0.9, max_w / w); w *= sx
        if w > max_w:
            k *= max_w / w; w = max_w
    gw, gh = max(1, round(w)), max(1, round(g.height * k))
    g = g.resize((gw, gh), Image.LANCZOS)
    img.paste(Image.new('RGB', (gw, gh), ink), (round(cx - gw / 2), round(cy - gh / 2)), g)


def process(img):
    a = np.asarray(img).astype(int)
    K = img.width / WORLD_W
    out = a.astype(float).copy()
    jobs = []
    for sid, text, box, kind in SIGNS:
        bx0, by0, bx1, by1 = [round(v * K) for v in box]
        mx, my = round(26 * K), round(16 * K)
        X0, Y0, X1, Y1 = max(0, bx0 - mx), max(0, by0 - my), bx1 + mx, by1 + my
        reg = a[Y0:Y1, X0:X1]
        bg = bg_mask(reg, kind)
        # 글자 상자 안의 바탕 픽셀을 씨앗으로 간판 바탕 영역 찾기
        sy0, sy1, sx0, sx1 = by0 - Y0, by1 - Y0, bx0 - X0, bx1 - X0
        seeds = [(y, x) for y in range(sy0, sy1, 2) for x in range(sx0, sx1, 2) if bg[y, x]]
        inner = flood(bg, seeds)
        # 바탕에 둘러싸인 구멍 = 영역 가장자리에서 바탕을 건너지 않고는 닿을 수 없는 픽셀
        outside = flood(~inner, [(y, x) for y in range(inner.shape[0]) for x in (0, inner.shape[1] - 1)] +
                        [(y, x) for x in range(inner.shape[1]) for y in (0, inner.shape[0] - 1)])
        holes = ~inner & ~outside
        if not holes.any():
            print('글자를 찾지 못함:', sid); continue
        # 글자 위치는 '원래 글자 상자' 안에 중심이 있는 구멍 덩어리만으로 정함(테두리 못·장식 제외)
        lab = label(holes)
        keep = np.zeros_like(holes)
        pad = round(4 * K)
        for idx in range(1, lab.max() + 1):
            cy_, cx_ = [v.mean() for v in np.where(lab == idx)]
            if sx0 - pad <= cx_ <= sx1 + pad and sy0 - pad <= cy_ <= sy1 + pad:
                keep |= lab == idx
        if not keep.any():
            keep = holes
        ys, xs = np.where(keep)
        tx0, tx1 = np.percentile(xs, 0.5), np.percentile(xs, 99.5)
        # 세로는 글자가 몰린 띠(아치형 간판에서 높이가 부풀지 않게)
        rowc = keep.sum(1); pk = rowc.max(); yc = int(np.argmax(rowc))
        ty0 = yc
        while ty0 > 0 and rowc[ty0 - 1] > pk * 0.08: ty0 -= 1
        ty1 = yc
        while ty1 < len(rowc) - 1 and rowc[ty1 + 1] > pk * 0.08: ty1 += 1
        hole = dilate(holes, max(1, round(1 * K))) & (inner | holes)
        filled = diffuse_fill(reg, hole)
        out[Y0:Y1, X0:X1][hole] = filled[hole]
        # 간판 안쪽 폭(글자 줄 높이에서)으로 최대 폭 정하기
        midrow = inner[int((ty0 + ty1) // 2)]
        cols = np.where(midrow)[0]
        inner_w = (cols.max() - cols.min()) if len(cols) else (tx1 - tx0)
        rows = np.where(inner[:, int((tx0 + tx1) // 2)])[0]
        inner_h = (rows.max() - rows.min()) if len(rows) else (ty1 - ty0)
        th = min(ty1 - ty0 + 1, inner_h * 0.6)
        jobs.append((text, X0 + (tx0 + tx1) / 2, Y0 + (ty0 + ty1) / 2, th, min(inner_w * 0.86, (tx1 - tx0) * 1.04), INK[kind]))
        print(sid, 'letters', int(holes.sum()), 'text box', (X0 + tx0, Y0 + ty0, X0 + tx1, Y0 + ty1))
    res = Image.fromarray(out.clip(0, 255).astype(np.uint8))
    for text, cx, cy, th, mw, ink in jobs:
        draw_text(res, text, cx, cy, th, mw, ink)
    return res


if __name__ == '__main__':
    im = Image.open(sys.argv[1]).convert('RGB')
    process(im).save(sys.argv[2])
