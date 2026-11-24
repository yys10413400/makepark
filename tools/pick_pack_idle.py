"""
걷기 그림 팩에서 방향마다 '서 있기'로 쓸 열과 몸 키(bodyPx)를 골라 출력합니다.
결과를 js/data/character-packs.js 의 idle / bodyPx 에 옮겨 적으세요.

  python tools/pick_pack_idle.py assets/characters/packs/hanbok-nine

고르는 법: 칸의 아래쪽 20% 에서 몸 가운데를 기준으로 앞발·뒷발(또는 왼발·오른발) 쪽의 가장 낮은 곳이
바닥에서 얼마나 떠 있는지 더해, 가장 적게 뜬(두 발이 바닥에 가까운) 프레임. 같으면 다리 폭이 좁은 쪽.
bodyPx: 앞모습 서 있기 프레임에서 발 기준점(anchorPixels.y)부터 머리 끝까지 높이의 평균.
"""
import json, os, sys

import numpy as np
from PIL import Image


def main(pack):
    info = json.load(open(os.path.join(pack, 'walk.json'), encoding='utf-8'))
    fw, fh, ay = info['frameWidth'], info['frameHeight'], info['anchorPixels']['y']
    name = os.path.basename(os.path.normpath(pack))
    hs = []
    for cid, c in info['characters'].items():
        a_img = np.array(Image.open(os.path.join(pack, c['texture'])).convert('RGBA'))[..., 3]
        idle = {}
        for d, a in c['animations'].items():
            best = None
            for k in range(a['frameCount']):
                col = a['firstColumn'] + k
                cell = a_img[a['row'] * fh:(a['row'] + 1) * fh, col * fw:(col + 1) * fw] > 40
                ys, xs = np.where(cell)
                y0, y1 = ys.min(), ys.max()
                low = cell[y1 - (y1 - y0) // 5:y1 + 1]
                lx = np.where(low.any(0))[0]
                cx = (lx.min() + lx.max()) // 2
                lift = 0
                for half in (low[:, :cx], low[:, cx:]):
                    rows = np.where(half.any(1))[0]
                    lift += len(low) - 1 - (rows.max() if len(rows) else 0)
                score = (lift, lx.max() - lx.min())
                if best is None or score < best[0]:
                    best = (score, k, ys.min())
            idle[d] = best[1]
            if d == 'front':
                hs.append(ay - best[2])
        print("    '%s/%s': %s," % (name, cid, json.dumps(idle).replace('"', '')))
    print('bodyPx', round(float(np.mean(hs))))


if __name__ == '__main__':
    for p in sys.argv[1:]:
        main(p)
