"""멜로디 스테이지 그림 만들기

  python -I tools/build_melody_assets.py [assets/melody-src]

- assets/melody-src/stage-outdoor.webp(야외 멜로디 스테이지, 1672×941) → assets/melody/stage.webp (그대로 복사)
- assets/melody-src/unicorn_dance_pack/*.png(320×320, 기준점 160,298) → assets/melody/unicorn/*.webp
  캔버스 크기 320×320을 그대로 지키고(자르기·확대 없음) 반투명 가장자리를 남기려고 알파는 무손실로 저장합니다.
- animation.json 도 같이 복사(게임은 js/melody/data.js 의 같은 값을 씀 — file:// 로 열어도 되게)
- assets/melody-src/unicorn_band_pack/<캐릭터>/{idle,frame_01,frame_02,frame_03}.png(320×320) → assets/melody/band/<캐릭터>/*.webp
  frame_00 은 idle 과 똑같아서 idle 을 씀. 캐릭터마다 발끝 높이(idle 의 불투명 영역 아래 끝)를 출력 → data.js PLAY.band.foot
"""
import json, shutil, sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
src = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'assets' / 'melody-src'
out = root / 'assets' / 'melody'
pack = src / 'unicorn_dance_pack'
(out / 'unicorn').mkdir(parents=True, exist_ok=True)

shutil.copyfile(src / 'stage-outdoor.webp', out / 'stage.webp')
anim = json.loads((pack / 'animation.json').read_text(encoding='utf-8'))
cw, ch = anim['canvas']
names = ['idle.png'] + [f for a in anim['actions'].values() for f in a['frames']]
for n in names:
    im = Image.open(pack / n).convert('RGBA')
    assert im.size == (cw, ch), (n, im.size)
    im.save(out / 'unicorn' / n.replace('.png', '.webp'), 'WEBP', quality=92, alpha_quality=100, method=6)
shutil.copyfile(pack / 'animation.json', out / 'unicorn' / 'animation.json')
print('ok', len(names), 'frames')

band = src / 'unicorn_band_pack'
if band.exists():
    banim = json.loads((band / 'animation.json').read_text(encoding='utf-8'))
    feet = {}
    for cid in banim['characters']:
        (out / 'band' / cid).mkdir(parents=True, exist_ok=True)
        for n in ['idle', 'frame_01', 'frame_02', 'frame_03']:
            im = Image.open(band / cid / (n + '.png')).convert('RGBA')
            assert im.size == tuple(banim['canvas']), (cid, n, im.size)
            if n == 'idle': feet[cid] = im.getchannel('A').getbbox()[3]
            im.save(out / 'band' / cid / (n + '.webp'), 'WEBP', quality=90, alpha_quality=100, method=6)
    shutil.copyfile(band / 'animation.json', out / 'band' / 'animation.json')
    print('band ok', len(feet), 'characters · foot', json.dumps(feet))
