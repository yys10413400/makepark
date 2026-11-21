"""가림 레이어용 '땅(길) 지도' 만들기.

사용법: python tools/build_ground_mask.py

왜 필요한가
- 캐릭터가 건물 뒤로 지나갈 때 게임은 건물 그림을 캐릭터 위에 다시 그립니다(park-data.js occluders).
  이때 길 부분은 투명하게 빼야 캐릭터가 '막'에 덮이지 않습니다.
- 크리스마스 지도는 눈길과 눈 덮인 지붕의 색이 거의 같아서 색만으로는 길을 가려낼 수 없습니다.
- 두 계절 지도는 배치가 같으므로(1~2픽셀 차이), 분홍 포장길이라 구분이 쉬운 일반 지도에서 길을 찾고
  크리스마스 지도에는 어긋난 만큼 옮겨서 씁니다.

방법 (일반 지도, 2배 크기 그림 기준)
1) 자동 추출 길 격자(js/data/walkmask.js)에서 둘레까지 모두 길인 칸 = 확실한 길(씨앗)
2) 씨앗 픽셀로 길 색 평균·편차를 재고, 길 색과 비슷한 픽셀만 고름
3) 가는 연결(지붕 꼭대기 하이라이트 등)을 끊은 뒤, 씨앗과 이어진 덩어리만 길로 봄 → 다시 원래 두께로
4) 결과: assets/maps/makepark-<계절>-ground.png (불투명 = 길 = 가림 레이어에서 지울 부분)
   park-data.js 의 seasons.<계절>.ground 로 연결합니다. 지도 그림을 바꾸면 이 도구를 다시 돌리세요.
"""
import re
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = __file__.replace('\\', '/').rsplit('/tools/', 1)[0] + '/'
MAPS = {'normal': 'assets/maps/makepark-normal.webp', 'christmas': 'assets/maps/makepark-christmas.webp'}


def base_grid():
    t = open(ROOT + 'js/data/walkmask.js', encoding='utf8').read()
    cell = int(re.search(r'cell:\s*(\d+)', t).group(1))
    rows = re.findall(r'"([01]+)"', t)
    return np.array([[c == '1' for c in r] for r in rows]), cell


def ground_from_normal(a, k):
    B, cell = base_grid()
    interior = ndimage.binary_erosion(np.pad(B, 1), np.ones((3, 3)))[1:-1, 1:-1] & B
    seeds = np.kron(interior, np.ones((cell * k, cell * k), bool))
    seeds = np.pad(seeds, ((0, max(0, a.shape[0] - seeds.shape[0])), (0, max(0, a.shape[1] - seeds.shape[1]))))
    seeds = seeds[:a.shape[0], :a.shape[1]]
    px = a[seeds]
    mean, std = px.mean(0), px.std(0)
    tol = np.maximum(18, 2.5 * std)
    pc = (np.abs(a - mean) <= tol).all(-1)
    core = ndimage.binary_opening(pc, iterations=2 * k)       # 가는 연결 끊기
    lab, n = ndimage.label(core)
    keep = np.zeros(n + 1, bool); keep[np.unique(lab[seeds & core])] = True; keep[0] = False
    g = ndimage.binary_dilation(keep[lab], iterations=2 * k) & pc  # 원래 두께로(길 색 안에서만)
    return g | seeds


def best_shift(a, b, r=6):
    """a 를 (dx,dy) 만큼 옮겼을 때 b 와 가장 잘 맞는 정수 이동(가장자리 그림 비교)"""
    ea = np.abs(ndimage.sobel(a.mean(-1), 0)) + np.abs(ndimage.sobel(a.mean(-1), 1))
    eb = np.abs(ndimage.sobel(b.mean(-1), 0)) + np.abs(ndimage.sobel(b.mean(-1), 1))
    m = 40
    best = None
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            s = np.roll(np.roll(ea, dy, 0), dx, 1)[m:-m, m:-m]
            e = -np.corrcoef(s.ravel()[::7], eb[m:-m, m:-m].ravel()[::7])[0, 1]
            if best is None or e < best[0]:
                best = (e, dx, dy)
    return best[1], best[2]


def save(g, path):
    # 길 = 불투명(알파 255), 나머지 = 투명. 게임은 이 그림을 destination-out 으로 덮어 길 부분을 지움
    a = (g * 255).astype(np.uint8)
    Image.fromarray(np.dstack([a, a]), 'LA').save(path, optimize=True)


def main():
    n = np.array(Image.open(ROOT + MAPS['normal']).convert('RGB')).astype(float)
    k = round(n.shape[1] / 1448)
    g = ground_from_normal(n, k)
    save(g, ROOT + 'assets/maps/makepark-normal-ground.png')
    print('normal ground', round(g.mean() * 100, 1), '%')
    for season, path in MAPS.items():
        if season == 'normal':
            continue
        b = np.array(Image.open(ROOT + path).convert('RGB')).astype(float)
        dx, dy = best_shift(n, b)
        gs = np.roll(np.roll(g, dy, 0), dx, 1)
        # 이 계절 지도에만 길 위에 놓인 물체(크리스마스트리·선물 등)는 길에서 뺌 → 캐릭터를 가릴 수 있게
        lum = b.mean(-1); sat = b.max(-1) - b.min(-1)
        obj = gs & ~((lum > 150) & (sat < 50))
        obj = ndimage.binary_opening(obj, iterations=2 * k)
        lab, cnt = ndimage.label(obj)
        sizes = ndimage.sum(obj, lab, range(1, cnt + 1))
        big = np.zeros(cnt + 1, bool); big[1:] = sizes >= 400 * k * k  # 그림자·얼룩 같은 작은 것은 무시
        obj = ndimage.binary_fill_holes(ndimage.binary_dilation(big[lab], iterations=2 * k))
        gs = gs & ~obj
        print(season, 'objects on path', int(big.sum()))
        save(gs, ROOT + 'assets/maps/makepark-%s-ground.png' % season)
        print(season, 'shift from normal', dx, dy)


if __name__ == '__main__':
    main()
