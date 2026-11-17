"""지도 간판 글씨 고치기: 짜릿 어드벤처 간판의 잘못 그려진 글자(파랫/파렛)를 지우고 다시 씀.

사용법: python tools/fix_sign_thrill.py <원본 지도.png> <저장할 파일.png>
- 글자 영역(지도 좌표 1067~1163, 488~512)을 간판 바탕색으로 메운 뒤 맑은 고딕 Bold로 '짜릿 어드벤처'를 씀.
- 새 지도를 받으면 간판 위치가 다를 수 있으니 좌표를 확인하고 쓸 것.
"""
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(float)
X0, Y0, X1, Y1 = 1067, 488, 1163, 512           # 글자 영역
reg = a[Y0:Y1, X0:X1]; lum = reg.mean(-1)
mask = lum < 215                                  # 글자 + 번짐
m = np.pad(mask, 1); mask = mask | m[:-2,1:-1] | m[2:,1:-1] | m[1:-1,:-2] | m[1:-1,2:]
# 바깥 테두리 한 줄은 판 색으로 남김
mask[0, :] = mask[-1, :] = False
out = a.copy()
for yy in range(Y1 - Y0):
    row = reg[yy]; mk = mask[yy]; good = np.where(~mk)[0]
    if len(good) < 2: continue
    for xx in np.where(mk)[0]:
        L = good[good < xx]; R = good[good > xx]
        if len(L) and len(R):
            l, r = L[-1], R[0]; t = (xx - l) / (r - l); out[Y0 + yy, X0 + xx] = row[l] * (1 - t) + row[r] * t
        else:
            out[Y0 + yy, X0 + xx] = row[(L[-1] if len(L) else R[0])]
base = Image.fromarray(out.clip(0, 255).astype(np.uint8))
# 새 글씨: 4배로 그린 뒤 줄여 부드럽게
text, S4 = '짜릿 어드벤처', 4
font = ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf', 22 * S4)
tmp = Image.new('L', (200 * S4, 50 * S4), 0); d = ImageDraw.Draw(tmp)
d.text((10 * S4, 5 * S4), text, font=font, fill=255, stroke_width=3, stroke_fill=255)  # 원래 글씨처럼 굵게
bb = tmp.getbbox(); glyph = tmp.crop(bb)
tw, th = 86, 18                                     # 원래 글자 폭·높이에 맞춤
k = min(tw / (glyph.width / S4 * 0.9), th / (glyph.height / S4))
gw, gh = round(glyph.width / S4 * k * 0.9), round(glyph.height / S4 * k)  # 가로 90%로 살짝 좁혀 높이를 원래와 비슷하게
glyph = glyph.resize((gw, gh), Image.LANCZOS)
cx, cy = (1072 + 1157) / 2, (491 + 509) / 2
px, py = round(cx - gw / 2), round(cy - gh / 2)
color = Image.new('RGB', (gw, gh), (46, 40, 30))
base.paste(color, (px, py), glyph)
base.save(dst, optimize=True)
print('glyph', gw, gh, 'at', px, py)
