"""
걷기 그림 팩 원본(PNG)을 게임에서 빨리 받을 수 있는 파일로 바꿉니다.

  python tools/build_pack_web.py                 # 모든 팩
  python tools/build_pack_web.py park-trio       # 몇 개만

원본: assets/characters-src/packs/<팩>/walk.json, <texture>.png  (2688x1280, 224x320 칸 12열 x 4줄)
결과: assets/characters/packs/<팩>/walk.json       (원본 그대로 복사)
      assets/characters/packs/<팩>/<texture 이름>.webp   — 원본과 크기·칸 배치가 똑같은 WebP(약 1/4 크기)
      assets/characters/packs/<팩>/cards/<캐릭터>.webp  — 고르기 화면 카드용 작은 그림
                 (앞모습 서 있기 칸 224x320 을 절반 112x160 으로. 발 기준점은 칸 기준점의 절반)

왜: PNG 한 장이 3~4MB 라서 고르기 화면이 열릴 때 17장(약 60MB)을 받고 풀어 게임이 느려졌음.
    지도에서는 이 WebP 에서 한 칸을 그대로 잘라 그리고(js/characters.js), 카드는 작은 그림만 받음.
서 있기 열은 js/data/character-packs.js 의 idle 을 따름.
"""
import json, os, re, shutil, sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'characters-src', 'packs')
OUT = os.path.join(ROOT, 'assets', 'characters', 'packs')
PACKS_JS = os.path.join(ROOT, 'js', 'data', 'character-packs.js')


def idle_table():
    txt = open(PACKS_JS, encoding='utf-8').read()
    out = {}
    for key, body in re.findall(r"'([\w-]+/[\w-]+)': \{([^}]*)\}", txt):
        out[key] = {k: int(v) for k, v in re.findall(r'(\w+): (\d+)', body)}
    return out


def build(pack, idle):
    src, out = os.path.join(SRC, pack), os.path.join(OUT, pack)
    os.makedirs(os.path.join(out, 'cards'), exist_ok=True)
    shutil.copyfile(os.path.join(src, 'walk.json'), os.path.join(out, 'walk.json'))
    info = json.load(open(os.path.join(src, 'walk.json'), encoding='utf-8'))
    fw, fh = info['frameWidth'], info['frameHeight']
    for cid, c in info['characters'].items():
        im = Image.open(os.path.join(src, c['texture'])).convert('RGBA')
        stem = os.path.splitext(c['texture'])[0]
        im.save(os.path.join(out, stem + '.webp'), 'WEBP', quality=90, alpha_quality=100, method=4)
        a = c['animations']['front']
        col = a['firstColumn'] + idle.get(pack + '/' + cid, {}).get('front', 0)
        cell = im.crop((col * fw, a['row'] * fh, (col + 1) * fw, (a['row'] + 1) * fh))
        cell.resize((fw // 2, fh // 2), Image.LANCZOS).save(os.path.join(out, 'cards', cid + '.webp'), 'WEBP', quality=90, alpha_quality=100, method=6)
        print(pack, cid, 'ok')


def main():
    idle = idle_table()
    packs = sys.argv[1:] or sorted(os.listdir(SRC))
    for p in packs:
        build(p, idle)


if __name__ == '__main__':
    main()
