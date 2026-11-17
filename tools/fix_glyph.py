"""간판의 잘못 그려진 글자 한두 개만 바꾸기 (간판 그림은 그대로 두고).

사용법: python tools/fix_glyph.py <입력 2배 지도.png> <출력.png>

- FIXES 의 box(2배 지도 좌표)를 간판 바탕색으로 부드럽게 덮고, 같은 크기로 새 글자를 씁니다.
- 바탕색은 상자 둘레 간판 바탕(밝은 크림색) 픽셀을 줄마다 모아 정하므로 그라데이션이 이어집니다.
- 지금 고치는 것: 멜로디 스테이지 간판 첫 글자 '엘/앨' → '멜' (두 지도 모두 같은 위치)
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT = 'C:/Windows/Fonts/malgunbd.ttf'
# 덮을 상자(x0, y0, x1, y1, 2배 지도 좌표), 쓸 글자, 바탕색을 고를 둘레 영역
FIXES = [
    {'box': (420, 945, 447, 978), 'text': '멜', 'sample': (395, 935, 560, 990)},
]


def fix(img, f):
    a = np.asarray(img).astype(float)
    x0, y0, x1, y1 = f['box']
    sx0, sy0, sx1, sy1 = f['sample']
    reg = a[sy0:sy1, sx0:sx1]
    lum = reg.mean(-1)
    cream = (lum > 215) & (reg.max(-1) - reg.min(-1) < 60)
    glyph = reg[lum < 90]
    ink = tuple(int(v) for v in np.median(glyph, axis=0)) if len(glyph) else (40, 34, 30)
    # 줄마다 간판 바탕색(중앙값) → 덮개 색
    cover = np.zeros((y1 - y0 + 6, x1 - x0 + 6, 3))
    fallback = np.median(reg[cream], axis=0)
    for i, y in enumerate(range(y0 - 3, y1 + 3)):
        row = a[y, sx0:sx1]; ok = cream[y - sy0] if sy0 <= y < sy1 else np.zeros(sx1 - sx0, bool)
        cover[i, :] = np.median(row[ok], axis=0) if ok.sum() >= 5 else fallback
    patch = Image.fromarray(cover.clip(0, 255).astype(np.uint8))
    # 둥근 사각형 + 가장자리를 부드럽게 해서 덮기
    m = Image.new('L', patch.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([1, 1, patch.width - 2, patch.height - 2], radius=5, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(1.6))
    img.paste(patch, (x0 - 3, y0 - 3), m)
    # 새 글자: 4배로 그려 줄여서 부드럽게, 상자 높이에 맞춤
    S = 4; font = ImageFont.truetype(FONT, 40 * S)
    tmp = Image.new('L', (80 * S, 80 * S), 0)
    ImageDraw.Draw(tmp).text((10 * S, 5 * S), f['text'], font=font, fill=255, stroke_width=2, stroke_fill=255)
    g = tmp.crop(tmp.getbbox())
    h = y1 - y0; w = round(g.width * h / g.height)
    w = min(w, x1 - x0 + 2)
    g = g.resize((w, h), Image.LANCZOS)
    cx = (x0 + x1) / 2
    img.paste(Image.new('RGB', g.size, ink), (round(cx - w / 2), y0), g)
    return img


if __name__ == '__main__':
    im = Image.open(sys.argv[1]).convert('RGB')
    for f in FIXES:
        im = fix(im, f)
    im.save(sys.argv[2])
    print('saved', sys.argv[2])
