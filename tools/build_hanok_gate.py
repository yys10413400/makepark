"""유령의 집 검문대 한옥 버전 그림 만들기 (2026-11-25 받은 hanok-ghost-assets.zip)

  python -I tools/build_hanok_gate.py

원본: assets/gatekeeper-src/hanok/  →  결과: assets/gatekeeper/hanok/

- 배경(hanok-checkpoint)·기록 두루마리(guest-record)·단서 아이콘(items) → webp
  (두루마리는 가장자리에 떨어져 있는 붉은 점 같은 찌꺼기를 지움: 가장 큰 덩어리만 남김)
- 안내 귀신 시트(4×2, 1774×887) → 칸을 정수(444)로 맞춰 1776×888 webp. 칸 안 위치는 그대로(떠오르는 움직임이 그림에 있음)
- 손님: 받은 완성 그림(guests/ready, portraits) 8장은 그대로 webp로.
  규칙 엔진에는 '머리 장식 없음'(none)·'빈손'(empty) 손님도 있어서(3~6학년), 그 10가지는 같은 그림으로 만듦:
    완성 그림 = 기본 그림(guests/base: 장식 없음·빈 손바닥) + 머리 장식 조각 + 손 물건 조각 (받은 8장이 정확히 이 모양)
    → 받은 완성 그림에서 기본 그림과 다른 곳만 떼어(x<400 머리, x≥400 손) 다른 조합에 붙임
  기록판 초상은 받은 초상과 같은 방법(완성 그림을 0.6배로 줄여 (45, 0)에서 354×300 자르기)으로 만듦
- 파일 이름: 성별-머리장식-손물건  (머리: blossom 홍매화 · ginkgo 은행잎 · none 없음 / 손: key 열쇠 · pouch 복주머니 · empty 빈손)
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'gatekeeper-src', 'hanok')
OUT = os.path.join(ROOT, 'assets', 'gatekeeper', 'hanok')

HEADS = ['blossom', 'ginkgo', 'none']
HANDS = ['key', 'pouch', 'empty']
SPLIT_X = 400          # 머리 장식(왼쪽 위)과 손 물건(오른쪽) 조각을 가르는 x
PORTRAIT = (0.6, 45, 0, 354, 300)   # 배율, 자르기 x, y, 너비, 높이


def rgba(path):
    return Image.open(path).convert('RGBA')


def save(im, name, q=88):
    im.save(os.path.join(OUT, name), 'WEBP', quality=q, method=6)


def keep_main(im):
    """가장 큰 그림 덩어리만 남김(가장자리 찌꺼기 지우기)"""
    a = np.array(im)
    lab, n = ndimage.label(ndimage.binary_dilation(a[:, :, 3] > 8, iterations=2))
    if n > 1:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        main = lab == (int(np.argmax(sizes)) + 1)
        a[~main] = 0
    return Image.fromarray(a)


def patches(gender):
    """기본 그림과 다른 곳(조각) — head[이름], hand[이름]: (그림 배열, 마스크)"""
    base = np.array(rgba(os.path.join(SRC, 'guests', 'base', gender + '.png'))).astype(np.int16)
    head, hand = {}, {}
    for h in ['blossom', 'ginkgo']:
        for i in ['key', 'pouch']:
            r = np.array(rgba(os.path.join(SRC, 'guests', 'ready', '%s-%s-%s.png' % (gender, h, i)))).astype(np.int16)
            diff = np.abs(r - base).sum(2) > 0
            xs = np.arange(diff.shape[1])[None, :]
            if h not in head: head[h] = (r, diff & (xs < SPLIT_X))
            if i not in hand: hand[i] = (r, diff & (xs >= SPLIT_X))
    return base, head, hand


def portrait(full):
    s, x, y, w, h = PORTRAIT
    small = full.resize((round(full.width * s), round(full.height * s)), Image.LANCZOS)
    return small.crop((x, y, x + w, y + h))


def main():
    os.makedirs(OUT, exist_ok=True)
    save(rgba(os.path.join(SRC, 'background', 'hanok-checkpoint.png')).convert('RGB'), 'checkpoint.webp', 86)
    save(keep_main(rgba(os.path.join(SRC, 'ui', 'guest-record.png'))), 'guest-record.webp')
    for n in ['blossom', 'ginkgo', 'key', 'pouch']:
        save(rgba(os.path.join(SRC, 'items', n + '.png')), 'item-' + n + '.webp')
    guide = rgba(os.path.join(SRC, 'guide', 'lantern-guide-4x2.png'))
    save(guide.resize((444 * 4, 444 * 2), Image.LANCZOS), 'guide-4x2.webp')

    made = []
    for g in ['boy', 'girl']:
        base, head, hand = patches(g)
        for h in HEADS:
            for i in HANDS:
                name = '%s-%s-%s' % (g, h, i)
                ready = os.path.join(SRC, 'guests', 'ready', name + '.png')
                if os.path.exists(ready):   # 받은 완성 그림·초상은 그대로
                    full = rgba(ready)
                    por = rgba(os.path.join(SRC, 'guests', 'portraits', name + '.png'))
                else:
                    a = base.copy()
                    if h != 'none': src, m = head[h]; a[m] = src[m]
                    if i != 'empty': src, m = hand[i]; a[m] = src[m]
                    full = Image.fromarray(a.astype(np.uint8))
                    por = portrait(full)
                    made.append(name)
                save(full, 'guest-' + name + '.webp')
                save(por, 'face-' + name + '.webp')
    print('만든 조합(받은 그림 조각으로):', ', '.join(made))
    print('결과:', OUT)


if __name__ == '__main__':
    main()
