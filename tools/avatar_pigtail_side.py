# 양갈래(머리 7) 옆모습 다시 만들기
#   python tools/avatar_pigtail_side.py   →  그다음 python tools/avatar_hair_nape.py 7
# 받은 옆모습 그림은 목덜미 아래에 꽁지 하나가 달려 있어 앞모습(귀 높이 양옆 묶음)과 맞지 않고,
# 귀까지 그려 와서 얼굴 귀와 겹쳐 귀가 두 개처럼 보였음.
# 옆모습 그림에서 꽁지·귀를 지우고, 앞모습 그림의 묶음을 좌우 뒤집어 귀 뒤 같은 높이에 붙입니다.
# 원본 옆모습: assets/avatar/worn-src/hair7_side_gpt.png 에서 가져온 것(worn-base/hair_7_*.orig.png)
import shutil
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WORN = ROOT / 'assets' / 'avatar' / 'worn'
BASE = ROOT / 'assets' / 'avatar' / 'worn-base'
TAIL = (152, 183)          # 왼쪽 보기: 이 x 뒤, 이 y 아래의 꽁지를 지움
EAR = (130, 150, 155, 188) # 왼쪽 보기: 그림에 딸려 온 귀(밝은 피부색)를 지울 범위
PIG = (25, 184, 93, 252)   # 앞모습에서 화면 왼쪽 묶음을 잘라 올 범위
TIE = (140, 166)           # 왼쪽 보기: 묶음(뒤집은 뒤 왼쪽 위 모서리)을 놓을 자리 = 귀 뒤 윗부분


def side_left(orig, front):
    a = np.array(orig.convert('RGBA'))
    a[TAIL[1]:, TAIL[0]:, 3] = 0
    x0, y0, x1, y1 = EAR
    reg = a[y0:y1, x0:x1]
    pale = (reg[..., :3].astype(int).mean(-1) > 150) & (reg[..., 3] > 0)
    reg[pale, 3] = 0
    out = Image.fromarray(a)
    pig = front.crop(PIG).transpose(Image.FLIP_LEFT_RIGHT)
    out.alpha_composite(pig, TIE)
    return out


if __name__ == '__main__':
    front = Image.open(WORN / 'hair_7_down.png').convert('RGBA')
    for d in ('left', 'right'):
        o = BASE / f'hair_7_{d}.orig.png'
        if not o.exists(): shutil.copy2(BASE / f'hair_7_{d}.png', o)
        im = Image.open(o).convert('RGBA')
        if d == 'right': im = side_left(im.transpose(Image.FLIP_LEFT_RIGHT), front).transpose(Image.FLIP_LEFT_RIGHT)
        else: im = side_left(im, front)
        im.save(BASE / f'hair_7_{d}.png')
        print(f'worn-base/hair_7_{d}.png')
