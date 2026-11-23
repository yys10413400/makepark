"""레인보우 퍼레이드 그림 만들기

받은 원본(assets/parade-src)을 게임용 그림(assets/parade)으로 바꿉니다.
- lobby.webp        : 장밋빛 퍼레이드 로비(1672×941) — 대기실 배경
- parade-bg.webp    : 분수 정원 광장(1672×941) — 퍼레이드 팝업 배경
- riri-opening.webp : 리리 인사 8프레임(640×640 칸, 4×2) — 발 기준점 (320, 608)
- riri/momo/lulu.webp : 걷기 8프레임(448×448 칸, 4×2) — 장대 중심 x 모모 330, 루루 125 (walk-README.md)
(assets/parade-src/toolbox.png 는 처음 받은 화면 시안 — 참고용, 게임에는 쓰지 않음)
그림을 바꾸려면 assets/parade-src 의 같은 이름 파일을 바꾸고 다시 실행하세요.

실행: python tools/build_parade.py
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'parade-src')
OUT = os.path.join(ROOT, 'assets', 'parade')


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, ext in (('lobby', '.png'), ('parade-bg', '.webp')):
        Image.open(os.path.join(SRC, name + ext)).convert('RGB').save(os.path.join(OUT, name + '.webp'), quality=88)
    for name in ('riri-opening', 'riri', 'momo', 'lulu'):
        im = Image.open(os.path.join(SRC, name + '.png')).convert('RGBA')
        im.save(os.path.join(OUT, name + '.webp'), quality=90, alpha_quality=100, method=6)
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')


if __name__ == '__main__':
    main()
