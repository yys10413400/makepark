"""
학생 캐릭터의 움직이는 걷기 GIF(제미나이, 앞·뒤·옆 3칸이 함께 걷는 그림)를 게임용 프레임 시트로 만듭니다.

  python tools/build_char_anim.py            # 전부
  python tools/build_char_anim.py F1 R2g     # 몇 개만

원본: assets/characters-src/gif/<id>-walk.gif  (id 는 F1·F2·R1b·R1g … 처럼 그림 파일 id)
결과: assets/characters/<id>-anim.webp, js/data/character-sprites.js 의 <id>.anim
방법은 동물 선생님 걷기 GIF 와 같습니다(tools/build_teachers.py 의 build_anim):
 바닥 선·칸 이름 글자 지우기 → 배경 지우기 → 끝과 시작이 이어지는 한 걸음 구간 찾기 →
 앞모습 키를 서 있는 그림과 같게 맞춰 절반 크기로 저장. 색은 학생 캐릭터와 같은 정도로 다듬습니다.
js/characters.js 는 anim 이 있는 캐릭터를 걸을 때 이 프레임을 차례로 보여 줍니다.
"""
import json, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_teachers import build_anim  # noqa: E402
from build_characters import enhance  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GIF_DIR = os.path.join(ROOT, 'assets', 'characters-src', 'gif')
OUT = os.path.join(ROOT, 'assets', 'characters')
JS = os.path.join(ROOT, 'js', 'data', 'character-sprites.js')


def main():
    only = sys.argv[1:]
    txt = open(JS, encoding='utf-8').read()
    head = txt[:txt.index('window.MP_CHAR_SPRITES')]
    meta = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
    for f in sorted(os.listdir(GIF_DIR)):
        if not f.endswith('-walk.gif'):
            continue
        cid = f[:-9]
        if cid not in meta or (only and cid not in only):
            continue
        build_anim(cid, os.path.join(GIF_DIR, f), meta, out_dir=OUT, web='assets/characters/', enh=enhance, by_height=True)
    with open(JS, 'w', encoding='utf-8') as fo:
        fo.write(head + 'window.MP_CHAR_SPRITES = ' + json.dumps(meta, ensure_ascii=False, indent=1, sort_keys=True) + ';\n'
                 + "window.MP_CHAR_VER = '" + time.strftime('%Y%m%d%H%M%S') + "';\n")


if __name__ == '__main__':
    main()
