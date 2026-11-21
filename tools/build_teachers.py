"""
동물 선생님 원본 그림(assets/teachers-src/<id>.png, 제미나이 3칸 시트)을 게임용 그림으로 만듭니다.

  python tools/build_teachers.py            # 전부
  python tools/build_teachers.py bear fox   # 몇 개만

학생 캐릭터 도구(tools/build_characters.py)와 같은 방법(회색 배경 지우기 → 앞·뒤·옆 3칸 나누기 → 키 맞추기)에
선생님 그림에만 있는 것 두 가지를 더 합니다.
 1. 제미나이가 그려 넣은 바닥 선과 칸 아래 글자(FRONT·BACK·RIGHT SIDE)를 먼저 지웁니다.
 2. 손에 든 물건은 그대로 두고 다리만 움직이게(걷는 자세 그림이 없는 선생님), 칸마다 '다리가 시작하는 높이(hip)'를 찾아 적어 둡니다.
    js/net/teacher-avatar.js 가 hip 아래만 왼쪽·오른쪽 다리로 나눠 번갈아 들어 올려 걷게 그립니다.
걷는 자세 그림: assets/teachers-src/<동물>-walk.png 가 있으면 그 선생님은 학생 캐릭터처럼
   [걷는 자세, 서 있기, 반대 발 걷는 자세(좌우 뒤집기), 서 있기] 로 걷습니다.
색: 원본이 지도보다 잔잔해서 학생 캐릭터보다 조금 더 진하고 선명하게(채도·대비) 맞춥니다.
"""
import json, os, sys, time
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_characters import remove_bg, split3  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'teachers-src')
OUT = os.path.join(ROOT, 'assets', 'teachers')
JS = os.path.join(ROOT, 'js', 'data', 'teacher-sprites.js')

BODY_H = 300          # 학생 캐릭터와 같은 몸 키(px)
PAD = 4
VIEWS = ['down', 'up', 'right']
WALK_H = 0.97         # 걷는 자세는 다리를 벌려 서 있을 때보다 키가 조금 작음
COLOR, CONTRAST, BRIGHT, SHARP = 1.4, 1.14, 1.0, 1.4
NAMES = {
    'bear': '곰 선생님', 'rabbit': '토끼 선생님', 'fox': '여우 선생님',
    'hedgehog': '고슴도치 선생님', 'raccoon': '너구리 선생님', 'sheep': '양 선생님',
}


def clear_floor(rgb):
    """바닥 선(가로로 길게 이어진 얇은 선)과 그 아래(칸 이름 글자)를 배경색으로 칠함."""
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dark = np.sqrt(((rgb - bg) ** 2).sum(axis=2)) > 18

    def longest_run(r):
        best = cur = 0
        for v in r:
            cur = cur + 1 if v else 0
            best = max(best, cur)
        return best
    # 바닥 선: 한 줄이 끊김 없이 그림 폭의 70% 넘게 이어짐(캐릭터는 칸 사이가 비어 있어 이렇게 길지 않음)
    # 선이 살짝 기울어 있으면 한 줄로는 끊겨 보이므로, 가까운 줄 몇 개를 묶은 얇은 띠로 봄
    rows = [y for y in range(int(h * 0.55), h) if dark[y].mean() > 0.8]
    line, group = [], []
    for y in rows + [None]:
        if y is not None and (not group or y == group[-1] + 1):
            group.append(y); continue
        if group and len(group) <= max(3, h * 0.02) and dark[group].any(axis=0).mean() > 0.7:
            line += group
        group = [y] if y is not None else []
    if line:
        # 캐릭터는 이 선을 밟고 서 있음(걷는 GIF 에서는 발이 선 아래로 내려가기도 함).
        # 선 자체는 바로 위가 배경인 곳만 지우고, 선 아래는 '캐릭터와 이어지지 않은 것'(칸 이름 글자·반짝이)만 지움
        # → 발바닥은 선에 닿든 선 아래로 내려가든 잘리지 않음
        y0, y1 = min(line), max(line)
        rgb = rgb.copy()
        above = np.sqrt(((rgb[max(0, y0 - 4)] - bg) ** 2).sum(axis=1)) < 22
        band = slice(max(0, y0 - 2), y1 + 3)
        # 선의 색: 위가 배경인 곳의 선 픽셀 평균
        line_px = rgb[y0:y1 + 1][:, above].reshape(-1, 3)
        line_px = line_px[np.sqrt(((line_px - bg) ** 2).sum(axis=1)) > 18]
        rgb[band, above] = bg
        # 발 밑에 남은 선 조각: 선 색과 거의 같은 점만 배경으로 (발 외곽선·회색 꼬리 줄무늬는 남음)
        if len(line_px):
            lc = np.median(line_px, axis=0)
            seg = rgb[band]
            same = np.sqrt(((seg - lc) ** 2).sum(axis=2)) < 14
            seg[same] = bg
            rgb[band] = seg
        # 선 아래에만 있는 조각(글자·반짝이·남은 선)은 지우고, 위쪽 캐릭터와 이어진 조각(발)은 남김
        ink = np.sqrt(((rgb - bg) ** 2).sum(axis=2)) > 18
        lab, cnt = ndimage.label(ink, structure=np.ones((3, 3)))
        if cnt:
            tops = ndimage.minimum(np.arange(h)[:, None].repeat(w, 1), lab, range(1, cnt + 1))
            below = np.zeros(cnt + 1, bool)
            below[1:] = np.asarray(tops) > y1
            rgb[below[lab]] = bg
    return rgb


def enhance(im):
    a = im.getchannel('A')
    rgb = im.convert('RGB')
    rgb = ImageEnhance.Color(rgb).enhance(COLOR)
    rgb = ImageEnhance.Contrast(rgb).enhance(CONTRAST)
    rgb = ImageEnhance.Brightness(rgb).enhance(BRIGHT)
    rgb = ImageEnhance.Sharpness(rgb).enhance(SHARP)
    out = rgb.convert('RGBA'); out.putalpha(a)
    return out


def head_w(p):
    """머리 폭: 키의 10~30% 높이에서 가장 넓은 줄의 불투명 폭(귀 끝은 빼려고 10%부터)."""
    a = p[..., 3] > 100
    h = a.shape[0]
    best = 0
    for y in range(int(h * 0.10), int(h * 0.30)):
        xs = np.where(a[y])[0]
        if len(xs):
            best = max(best, xs.max() - xs.min())
    return float(best or 1)


def body_x(p):
    """몸 가운데 x: 꼬리가 옆으로 나온 캐릭터(여우·너구리)도 몸통(키의 45~75% 높이) 가운데를 씀."""
    a = p[..., 3] > 100
    h = a.shape[0]
    ys, xs = np.where(a[int(h * 0.45):int(h * 0.75)])
    return float(np.median(xs)) if len(xs) else p.shape[1] / 2


def hip_y(p, cx):
    """다리가 시작하는 높이(칸 위에서부터 px): 몸 가운데에서 두 다리 사이 틈이 처음 생기는 줄."""
    a = p[..., 3] > 100
    h = a.shape[0]
    c = int(round(cx))
    top = h
    for y in range(h - 1, int(h * 0.55), -1):
        row = a[y, max(0, c - 2):c + 3]
        if row.size and not row.any():
            top = y
        elif top < h:
            break
    return (top, 1) if top < h - 4 else (int(h * 0.82), 0)


GIF_DIR = os.path.join(SRC, 'gif')
ANIM_K = 0.5          # 걷기 프레임 크기: 서 있는 그림(몸 키 300px)의 절반. 공원에서 그리는 크기(약 60~80px)엔 충분


def best_loop(frames, minlen=10):
    """멈칫하지 않는 반복 구간 찾기: 제미나이 GIF 는 마지막 장이 첫 장과 달라 처음으로 돌아갈 때 '툭' 튐.
    캐릭터 윤곽만 비교해(GIF 색 얼룩은 무시) 끝 장이 시작 장과 가장 닮은 구간 [i, j) 를 고름.
    점수 = (j 장과 i 장의 차이) / (이웃한 두 장의 보통 차이) — 1 보다 작으면 이어 붙여도 보통 한 걸음보다 매끄러움."""
    ms = []
    for f in frames:
        a = np.asarray(f.convert('RGB'), dtype=float)
        bg = np.median(np.concatenate([a[0], a[-1]]), axis=0)
        ms.append(np.sqrt(((a - bg) ** 2).sum(axis=2)) > 30)
    n = len(ms)
    if n < minlen + 1:
        return 0, n
    d = lambda x, y: float((x ^ y).mean())
    step = float(np.median([d(ms[k], ms[k + 1]) for k in range(n - 1)])) or 1.0
    best = None
    for i in range(n):
        for j in range(i + minlen, n):
            sc = (d(ms[j], ms[i]) / step, -(j - i))
            if best is None or sc < best[0]:
                best = (sc, i, j)
    return best[1], best[2]


def leg_seeds(a):
    """세 사람의 다리 부분: 그림 아래 35% 줄에서, 옆으로 조금 넓혀 두 다리를 한 덩어리로 묶은 뒤 가장 큰 셋.
    → [(가운데 x, 그 다리 마스크)]"""
    ys = np.where(a.any(axis=1))[0]
    band = np.zeros_like(a)
    y0 = int(ys.max() - (ys.max() - ys.min()) * 0.35)
    band[y0:] = a[y0:]
    lab, n = ndimage.label(ndimage.binary_dilation(band, structure=np.ones((1, 31))))
    if not n:
        return []
    sizes = ndimage.sum(band, lab, range(1, n + 1))
    out = []
    for j in np.argsort(sizes)[::-1][:3]:
        m = (lab == j + 1) & band
        out.append((float(np.nonzero(m)[1].mean()), m))
    return out


def split_views(a, cx):
    """한 장의 그림(불투명 마스크 a)을 앞·뒤·옆 세 칸으로 나눔. 칸마다 다리(leg_seeds)에서 시작해,
    그림 안을 따라 한 칸씩 넓혀 감 → 서로 맞닿은 깃발도
    자기 몸에서 이어진 쪽으로 나뉨. 어느 몸통과도 이어지지 않은 조각은 가장 가까운 칸(아주 작은 점은 버림)."""
    h, w = a.shape
    L = np.zeros((h, w), np.int16)
    # 시작점: 칸마다 다리 가운데(cx) 바로 옆 좁은 띠(칸 간격의 ±20%)의 아래 35%만.
    # (예전처럼 다리 줄을 옆으로 넓혀 묶으면, 여우 꼬리처럼 두 사람 사이에서 맞닿는 것이 있을 때
    #  두 사람이 한 덩어리가 되어 한쪽 몸 전체가 다른 칸으로 가 버림)
    ys = np.where(a.any(axis=1))[0]
    if len(ys):
        y0 = int(ys.max() - (ys.max() - ys.min()) * 0.35)
        win = 0.2 * (min(np.diff(sorted(cx))) if len(cx) > 1 else w)
        for i, c in enumerate(cx):
            x0, x1 = max(0, int(c - win)), min(w, int(c + win) + 1)
            band = a[y0:, x0:x1]
            L[y0:, x0:x1][band] = i + 1
    for _ in range(400):
        grown = ndimage.grey_dilation(L, size=(3, 3))
        add = (L == 0) & a & (grown > 0)
        if not add.any():
            break
        L[add] = grown[add]
    own = L.astype(int) - 1
    rest = a & (own < 0)
    if rest.any():
        cols = np.arange(w)
        near = np.argmin(np.abs(cols[None, :] - np.array(cx)[:, None]), axis=0)
        lab2, n2 = ndimage.label(rest, structure=np.ones((3, 3)))
        for j, sl in enumerate(ndimage.find_objects(lab2), 1):
            m = lab2[sl] == j
            if m.sum() < 80:      # 떨어진 작은 점(반짝이·얼룩)은 버림
                continue
            xs = np.nonzero(m)[1] + sl[1].start
            own[sl][m] = near[int(xs.mean())]
    return own


def clear_pockets(rgb, rgba, shadow=False):
    """제미나이 GIF 의 회색 배경 중, 팔과 몸 사이처럼 사방이 막혀 바깥 배경 지우기에 안 걸린 틈을 지움.
    배경색과 아주 비슷하고(색 차이 < 12) 색이 고른 덩어리만 → 흰 옷·회색 옷은 배경과 색이 달라 남음.
    shadow: 발밑의 회색 그림자(색이 거의 없고 배경보다 조금 어두운 점, 그림 아래 7%)도 지움."""
    h, w, _ = rgb.shape
    bg = np.median(np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]), axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    out = rgba.copy()
    a = out[..., 3] > 0
    like = (dist < 12) & a
    lab, n = ndimage.label(like)
    if n:
        sizes = ndimage.sum(like, lab, range(1, n + 1))
        kill = np.zeros(n + 1, bool)
        kill[1:] = sizes >= 30
        m = kill[lab]
        m = ndimage.binary_dilation(m, iterations=1) & (dist < 30)   # 가장자리 번짐도
        out[..., 3][m] = 0
    if shadow:
        ys = np.where(out[..., 3].any(axis=1))[0]
        if len(ys):
            y0 = ys.max() - int((ys.max() - ys.min()) * 0.07)
            band = out[y0:]
            c = rgb[y0:]
            gray = (c.max(axis=2) - c.min(axis=2) < 16) & (c.mean(axis=2) > 120) & (c.mean(axis=2) < bg.mean() + 4)
            band[..., 3][gray] = 0
    return out


def face_side(im):
    """옆모습이 보는 쪽: 머리(위 32%)에서 얼굴 피부색 픽셀의 가운데가 머리 가운데보다 오른쪽이면 +, 왼쪽이면 -.
    (머리카락·모자는 뒤통수 쪽에 많고 얼굴 피부는 보는 쪽에 있음)"""
    a = np.asarray(im.convert('RGBA')).astype(float)
    ys = np.where((a[..., 3] > 100).any(axis=1))[0]
    if not len(ys):
        return 0.0
    top = ys.min()
    head = a[top:top + max(1, int((ys.max() - top) * 0.32))]
    al = head[..., 3] > 100
    r, g, b = head[..., 0], head[..., 1], head[..., 2]
    skin = al & (r > 200) & (g > 150) & (b > 110) & (r - b > 30) & (r - g < 70)
    xs, sx = np.where(al)[1], np.where(skin)[1]
    if len(sx) < 20 or not len(xs):
        return 0.0
    return float((sx.mean() - xs.mean()) / (xs.max() - xs.min() + 1))


def faces_other_way(im, st, r):
    """걷기 옆모습(im)이 서 있는 옆모습(st 의 칸 r)과 반대쪽을 보는지(얼굴 피부색 위치로 판단)."""
    ref = Image.fromarray(np.asarray(st)[r[1]:r[1] + r[3], r[0]:r[0] + r[2]])
    a, b = face_side(im), face_side(ref)
    return a * b < 0


def build_anim(base, path, meta, out_dir=None, web='assets/teachers/', enh=None, by_height=False, pockets=False, holes=True):
    """움직이는 GIF(앞·뒤·옆 3칸이 함께 걷는 그림) → 한 걸음 묶음을 프레임 시트로.
    시트: 줄 = 프레임, 칸 = down·up·right. 칸마다 모든 프레임에 같은 자르기 상자를 써서 흔들림이 없게 함."""
    from PIL import ImageSequence
    gif = Image.open(path)
    frames = [f.convert('RGB') for f in ImageSequence.Iterator(gif)]
    dur = gif.info.get('duration') or 100
    i0, i1 = best_loop(frames)
    frames = frames[i0:i1]
    n = len(frames)
    up = 2   # 작은 GIF 는 2배로 키운 뒤 다듬어야 가장자리가 매끈함
    rgbas = []
    for f in frames:
        rgb = np.array(f.resize((f.width * up, f.height * up), Image.LANCZOS)).astype(float)
        q = remove_bg(clear_floor(rgb))
        # 학생 캐릭터(by_height)만: 막힌 틈의 회색 배경 지우기(회색 털 동물 선생님·흰 망토 유령은 옷까지 지워질 수 있어 뺌)
        rgbas.append(clear_pockets(rgb, q, shadow=pockets) if by_height and holes else q)
    # 3칸의 경계: 첫 장을 3칸으로 나눈 가운데들 사이
    a0 = rgbas[0][..., 3] > 40
    # 가운데 위치는 다리(아래쪽)로 잡음: 위쪽은 깃발처럼 옆 사람과 맞닿을 수 있지만 다리는 셋이 확실히 떨어져 있음
    cx = sorted(c for c, _ in leg_seeds(a0))
    # 프레임마다 그림 덩어리를 가장 가까운 칸(앞·뒤·옆)에 나눠 줌 → 깃발처럼 옆 칸 쪽으로 길게 나온 것도 제 칸에 남음
    # (두 칸의 덩어리가 맞붙으면 그 덩어리만 가운데 선으로 나눔)
    vr = [[], [], []]
    for q in rgbas:
        own = split_views(q[..., 3] > 40, cx)
        for i in range(3):
            v = q.copy()
            v[..., 3] = np.where(own == i, v[..., 3], 0)
            vr[i].append(v)
    boxes = []
    for i in range(3):
        union = np.zeros(a0.shape, bool)
        for v in vr[i]:
            union |= v[..., 3] > 40
        ys, xs = np.where(union)
        boxes.append((ys.min(), ys.max() + 1, xs.min(), xs.max() + 1))
    # 크기: 머리 폭을 서 있는 그림의 앞모습과 같게
    st = np.array(Image.open(os.path.join(ROOT, meta[base]['src'])))
    r = meta[base]['views']['down']
    y0, y1, x0, x1 = boxes[0]
    s = head_w(st[r[1]:r[1] + r[3], r[0]:r[0] + r[2]]) / head_w(vr[0][0][y0:y1, x0:x1])
    if by_height:
        # 키로 맞추기(학생 캐릭터): 머리 옆에 깃발·마이크가 있으면 머리 폭이 잘못 재어지므로,
        # 앞모습의 키(프레임마다 잰 키 중 큰 쪽 = 다리를 모은 순간)를 서 있는 그림의 키와 같게
        hs = []
        for q in vr[0]:
            ys = np.where((q[y0:y1, x0:x1, 3] > 100).any(axis=1))[0]
            if len(ys):
                hs.append(ys.max() - ys.min() + 1)
        s = r[3] / float(np.percentile(hs, 90))
    s *= ANIM_K      # 공원에서는 작게 그리므로 프레임은 절반 크기로 저장(용량 줄이기)
    cw = [max(1, round((b[3] - b[2]) * s)) for b in boxes]
    ch = [max(1, round((b[1] - b[0]) * s)) for b in boxes]
    rowH = max(ch) + PAD * 2
    colX, x = [], 0
    for w in cw:
        colX.append(x + PAD); x += w + PAD * 2
    sheet = Image.new('RGBA', (x, rowH * n), (0, 0, 0, 0))
    views = {}
    for i, v in enumerate(VIEWS):
        y0, y1, x0, x1 = boxes[i]
        first = Image.fromarray(vr[i][0][y0:y1, x0:x1]).resize((cw[i], ch[i]), Image.LANCZOS)
        # 옆모습 방향: 게임은 옆모습이 오른쪽을 본다고 보고 그림(왼쪽으로 갈 때 뒤집음).
        # 제미나이 GIF 는 왼쪽을 보는 것도 있어서, 서 있는 그림의 옆모습과 견줘 반대면 좌우로 뒤집음
        flip = v == 'right' and faces_other_way(first, st, meta[base]['views']['right'])
        if flip:
            first = first.transpose(Image.FLIP_LEFT_RIGHT)
            print(base, '걷기 GIF 옆모습이 왼쪽을 봐서 뒤집음')
        fx = body_x(np.array(first))
        views[v] = [colX[i], PAD, cw[i], ch[i], round(fx, 1), ch[i]]
        for k in range(n):
            im = Image.fromarray(vr[i][k][y0:y1, x0:x1]).resize((cw[i], ch[i]), Image.LANCZOS)
            if flip:
                im = im.transpose(Image.FLIP_LEFT_RIGHT)
            sheet.paste(im, (colX[i], PAD + k * rowH))
    sheet = (enh or enhance)(sheet)
    out = base + '-anim.webp'
    sheet.save(os.path.join(out_dir or OUT, out), 'WEBP', quality=88, method=6)
    # 서 있을 때 쓸 프레임(칸마다): 두 발이 가장 모인 장 = 발 쪽(아래 12%) 폭이 가장 좁고, 그다음 키가 가장 큰 장
    arr = np.asarray(sheet)
    idle = {}
    for v in VIEWS:
        r = views[v]
        best = None
        for k in range(n):
            a = arr[r[1] + k * rowH:r[1] + k * rowH + r[3], r[0]:r[0] + r[2], 3] > 100
            ys = np.where(a.any(axis=1))[0]
            if not len(ys):
                continue
            foot = a[ys.max() - max(2, int(r[3] * 0.12)):ys.max() + 1]
            xs = np.where(foot.any(axis=0))[0]
            sc = (xs.max() - xs.min(), -(ys.max() - ys.min()))
            if best is None or sc < best[0]:
                best = (sc, k)
        idle[v] = best[1] if best else 0
    meta[base]['anim'] = {'src': web + out, 'frames': n, 'ms': dur, 'rowH': rowH, 'k': ANIM_K, 'views': views, 'idle': idle}
    print(base, 'anim', i0, '~', i1 - 1, '프레임', n, dur, 'ms', sheet.size)


def main():
    os.makedirs(OUT, exist_ok=True)
    ids = sorted(f[:-4] for f in os.listdir(SRC) if f.endswith('.png'))
    only = sys.argv[1:]
    meta = {}
    if os.path.exists(JS):
        txt = open(JS, encoding='utf-8').read()
        meta = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
    for tid in ids:
        if only and tid not in only:
            continue
        rgb = np.array(Image.open(os.path.join(SRC, tid + '.png')).convert('RGB')).astype(float)
        rgba = remove_bg(clear_floor(rgb))
        panels = split3(rgba)
        walk = tid.endswith('-walk')     # 걷는 자세 그림(<동물>-walk.png)
        s = BODY_H / panels[0].shape[0]
        if walk and tid[:-5] in meta:
            # 걷는 자세는 다리 길이·자세가 달라 키로 맞추면 머리가 작아짐 → 머리 폭이 서 있는 그림과 같게 맞춤
            st = np.array(Image.open(os.path.join(ROOT, meta[tid[:-5]]['src'])))
            r = meta[tid[:-5]]['views']['down']
            s = head_w(st[r[1]:r[1] + r[3], r[0]:r[0] + r[2]]) / head_w(panels[0])
        ims, rects, x = [], {}, 0
        hips = {}
        for v, p in zip(VIEWS, panels):
            im = Image.fromarray(p).resize((max(1, round(p.shape[1] * s)), max(1, round(p.shape[0] * s))), Image.LANCZOS)
            arr = np.array(im)
            fx = body_x(arr)
            ims.append(im)
            hips[v] = hip_y(arr, fx)
            rects[v] = [x + PAD, PAD, im.width, im.height, round(fx, 1), im.height]
            x += im.width + PAD * 2
        # 옆모습은 다리 사이 틈이 잘 안 보이니 앞모습의 비율로 높이만 맞추고, 다리를 나누지 않음(gap=0)
        hips['right'] = (round(rects['right'][3] * hips['down'][0] / rects['down'][3]), 0)
        for v in VIEWS:
            rects[v] += [int(hips[v][0]), hips[v][1]]
        sheet = Image.new('RGBA', (x, max(i.height for i in ims) + PAD * 2), (0, 0, 0, 0))
        for im, v in zip(ims, VIEWS):
            sheet.paste(im, (rects[v][0], rects[v][1]))
        sheet = enhance(sheet)
        sheet.save(os.path.join(OUT, tid + '.webp'), 'WEBP', quality=90, method=6)
        if walk:
            base = tid[:-5]
            meta.setdefault(base, {})['walk'] = {'src': 'assets/teachers/' + tid + '.webp', 'views': rects}
        else:
            meta[tid] = dict(meta.get(tid, {}), src='assets/teachers/' + tid + '.webp', name=NAMES.get(tid, tid), views=rects)
        print(tid, sheet.size, {v: rects[v][2:] for v in VIEWS})
    # 움직이는 걷기 GIF: assets/teachers-src/gif/<동물>-walk.gif
    if os.path.isdir(GIF_DIR):
        for f in sorted(os.listdir(GIF_DIR)):
            base = f[:-9] if f.endswith('-walk.gif') else None
            if base and base in meta and (not only or base in only or f[:-4] in only):
                build_anim(base, os.path.join(GIF_DIR, f), meta)
    with open(JS, 'w', encoding='utf-8') as f:
        f.write('// tools/build_teachers.py 가 만듦. 칸: [x, y, 너비, 높이, 발x, 발y, 다리 시작 y(칸 안), 두 다리 사이 틈 있음(1/0)], 몸 키 ' + str(BODY_H) + 'px 기준\n')
        f.write('window.MP_TEACHER_SPRITES = ' + json.dumps(meta, ensure_ascii=False, indent=1, sort_keys=True) + ';\n')
        f.write("window.MP_TEACHER_VER = '" + time.strftime('%Y%m%d%H%M%S') + "';\n")


if __name__ == '__main__':
    main()
