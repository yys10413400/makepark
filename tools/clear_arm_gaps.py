"""팔과 몸 사이에 갇힌 흰 배경 지우기

캐릭터 그림(assets/characters/<id>.webp, <id>-walk.webp)은 원본의 흰 배경을 바깥에서부터 지워 만들어서,
팔·손과 몸 사이처럼 사방이 막힌 틈에는 흰 배경이 그대로 남아 있었습니다(뒷모습·옆모습 손 옆에 하얀 띠).
여기서는 그런 틈만 찾아 투명하게 만듭니다.

찾는 조건(한 칸 = 한 방향 그림):
  - 아주 밝고 색이 거의 없는 픽셀 덩어리(흰색)
  - 그 칸에서 가장 큰 흰 덩어리(셔츠)가 아님, 크기 6~600픽셀
  - 몸 높이 45%~74% 사이(팔·손 높이. 얼굴 눈빛·양말·신발은 건드리지 않음)
  - 덩어리 둘레에 살색(팔·손)이 닿아 있음
  - 셔츠보다 조금 따뜻한 색(배경이 피부 옆에서 번진 색) 또는 셔츠 그늘색이 아닌 순백
지운 뒤 둘레 1픽셀의 밝은 번짐도 함께 지웁니다.

실행: python tools/clear_arm_gaps.py          (그림을 고침)
      python tools/clear_arm_gaps.py --dry    (찾기만 하고 표시 그림을 TEMP 에 저장)
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 흰 옷을 입은 캐릭터(요리사·유령 등)는 옷까지 잡히므로, 흰 티셔츠 기본 캐릭터만(필요하면 id 를 더 넣어 씀)
TARGETS = sys.argv[1:] and [a for a in sys.argv[1:] if not a.startswith('--')] or ['F1', 'F2']
JS = os.path.join(ROOT, 'js', 'data', 'character-sprites.js')


def load_meta():
    t = open(JS, encoding='utf-8').read()
    return json.loads(t[t.index('{'):t.index('};') + 1])


def skin(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r > 200) & (g > 140) & (g < 225) & (b > 100) & (b < 200) & (r - b > 35)


def find(cell):
    rgb = cell[..., :3].astype(int)
    a = cell[..., 3]
    h = cell.shape[0]
    light = (rgb.min(-1) > 212) & (rgb.max(-1) - rgb.min(-1) < 34) & (a > 60)
    lab, n = ndimage.label(light)
    if not n:
        return np.zeros(light.shape, bool)
    sizes = ndimage.sum(light, lab, range(1, n + 1))
    shirt = int(np.argmax(sizes)) + 1
    sk = skin(rgb) & (a > 200)
    out = np.zeros(light.shape, bool)
    for i in range(1, n + 1):
        if i == shirt or not (6 <= sizes[i - 1] <= 600):
            continue
        m = lab == i
        cy = ndimage.center_of_mass(m)[0]
        if not (0.45 * h < cy < 0.74 * h):
            continue
        ring = ndimage.binary_dilation(m, iterations=3) & ~m
        if (sk & ring).sum() < 3:
            continue
        px = rgb[m]
        warm = (px[:, 0] - px[:, 2]).mean()
        # 셔츠 그늘(푸르스름한 회색)은 남기고, 따뜻한 흰색·순백만
        if warm < 4 and px.min(-1).mean() < 245:
            continue
        out |= m
    if out.any():
        halo = ndimage.binary_dilation(out, iterations=1) & (rgb.min(-1) > 190) & ~sk
        out |= halo
    return out


def main():
    dry = '--dry' in sys.argv
    meta = load_meta()
    total, marks = 0, []
    for sid, m in meta.items():
        if sid not in TARGETS:
            continue
        for kind, mm in (('', m), ('-walk', m.get('walk'))):
            if not mm:
                continue
            path = os.path.join(ROOT, mm['src'])
            sheet = np.array(Image.open(path).convert('RGBA'))
            changed = 0
            for view, r in mm['views'].items():
                x, y, w, h = r[0], r[1], r[2], r[3]
                cell = sheet[y:y + h, x:x + w]
                mask = find(cell)
                if mask.any():
                    changed += int(mask.sum())
                    if dry:
                        vis = Image.new('RGBA', (w, h), (60, 20, 80, 255))
                        vis.alpha_composite(Image.fromarray(cell))
                        v = np.array(vis); v[mask] = [255, 0, 0, 255]
                        marks.append((sid + kind + ' ' + view, Image.fromarray(v)))
                    else:
                        cell[..., 3][mask] = 0
            if changed:
                total += changed
                print(sid + kind, changed, 'px')
                if not dry:
                    Image.fromarray(sheet).save(path, 'WEBP', quality=90, method=6)
    if dry and marks:
        H = max(im.height for _, im in marks)
        W = sum(im.width + 6 for _, im in marks)
        s = Image.new('RGB', (W, H)); x = 0
        for _, im in marks:
            s.paste(im.convert('RGB'), (x, 0)); x += im.width + 6
        p = os.path.join(os.environ.get('TEMP', '.'), 'gk', 'gap-marks.png')
        s.save(p); print('marks:', p, len(marks))
    print('total', total)


if __name__ == '__main__':
    main()
