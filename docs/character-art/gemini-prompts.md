# 메이크파크 캐릭터 그림 — 제미나이(Gemini) 요청서

꾸미기(부품 겹치기) 대신, **완성된 캐릭터를 통째로** 받아서 고르는 방식으로 바꿉니다.
캐릭터 한 명마다 **앞모습 · 뒷모습 · 왼쪽 옆모습** 3장을 한 그림에 나란히 받습니다. 오른쪽은 코드에서 왼쪽을 뒤집어 씁니다.
걷는 모습은 코드로 살짝 통통 튀고 기우뚱하게 움직여 '아장아장' 느낌을 냅니다(걷기 칸은 그리지 않음).

## 캐릭터 목록 (처음 26명)

| 구분 | 받는 방법 | 수 |
|---|---|---|
| 무료 | 처음부터 | 2 |
| 건물 보상 | 그 건물(스테이지)을 통과하면 받기, 살 수 없음. 남자아이·여자아이 버전 | 7 × 2 = 14 |
| 티켓 구매 | 기념품 가게에서 티켓으로 사기 | 10 |

### 무료
| 번호 | 이름 | 모습 |
|---|---|---|
| F1 | 기본 남자아이 | 짧은 갈색 머리, 흰 티셔츠, 파란 반바지, 흰 양말, 파랑 운동화 |
| F2 | 기본 여자아이 | 어깨까지 오는 갈색 머리에 분홍 머리핀, 민트 티셔츠, 청치마, 분홍 운동화 |

### 건물 보상 (스테이지 = 건물 통과, 남자아이 b / 여자아이 g)
건물마다 같은 주제로 남자아이·여자아이 두 명을 그립니다. 받을 때는 내 기본 캐릭터(F1/F2)와 같은 쪽을 받습니다(바꿀 수 있게 할지는 나중에 결정).

| 번호 | 건물 | 캐릭터 | 남자아이 (b) | 여자아이 (g) |
|---|---|---|---|---|
| R1 | 코스터 익스프레스 | 꼬마 기관사 | 줄무늬 기관사 모자, 남색 조끼, 반바지 | 줄무늬 기관사 모자, 땋은 머리, 남색 조끼 원피스 |
| R2 | 레인보우 퍼레이드 | 퍼레이드 고수 | 깃털 모자, 악단 제복, 바지, 작은 북 | 깃털 모자, 포니테일, 악단 제복 치마, 작은 북 |
| R3 | 멜로디 스테이지 | 꼬마 가수 | 반짝이 재킷, 체크 바지, 마이크 | 양갈래 머리, 반짝이 재킷, 주름 치마, 마이크 |
| R4 | 짜릿 어드벤처 | 범퍼카 레이서 | 빨간 레이싱복, 헬멧, 깃발 | 포니테일, 빨간 레이싱복, 헬멧, 깃발 |
| R5 | 유령의 집 | 꼬마 유령 | 이불 유령 옷, 호박 랜턴 | 이불 유령 옷에 리본, 호박 랜턴 |
| R6 | 플레이 아케이드 | 게임 챔피언 | 픽셀 무늬 후드티, 헤드셋, 반바지 | 단발, 픽셀 무늬 후드 원피스, 헤드셋 |
| R7 | 스타 페스티벌 | 별빛 요정 | 별 망토, 날개, 별 지팡이, 바지 | 긴 머리, 별 망토, 날개, 별 지팡이, 치마 |

### 티켓 구매 (가격은 나중에 조정)
| 번호 | 캐릭터 | 티켓 | 모습 |
|---|---|---|---|
| S1 | 정글 탐험가 | 20 | 탐험 모자, 카키 조끼와 반바지, 등에 작은 배낭 |
| S2 | 꼬마 요리사 | 20 | 높은 요리사 모자, 흰 조리복, 빨간 스카프, 손에 국자 |
| S3 | 해변 서퍼 | 20 | 하와이안 셔츠, 반바지, 샌들, 옆에 든 서핑보드 |
| S4 | 공룡 잠옷 | 30 | 초록 공룡 후드 잠옷(얼굴 보임), 꼬리 |
| S5 | 꼬마 해적 | 30 | 해적 모자, 줄무늬 셔츠, 안대, 장난감 망원경 |
| S6 | 꼬마 마법사 | 30 | 보라 고깔모자, 별무늬 로브, 마법책 |
| S7 | 우주 비행사 | 40 | 흰 우주복, 투명한 헬멧(얼굴 보임), 가슴에 버튼 |
| S8 | 꼬마 닌자 | 40 | 남색 닌자복, 이마 띠, 등에 장난감 목검 |
| S9 | 꼬마 기사 | 40 | 은빛 갑옷, 파란 망토, 십자 무늬 방패 |
| S10 | 공주님 | 40 | 분홍 드레스, 작은 왕관, 반짝이 구두 |

---

## 제미나이에서 만드는 순서

1. **F1(기본 남자아이)을 가장 먼저** 만듭니다. 그림체 기준이 되는 캐릭터입니다.
   - 이때 그림체 시안(12가지 테마 쇼케이스 그림)을 함께 올리고 아래 **[공통 프롬프트] + [F1 설명]**을 보냅니다.
2. F1이 마음에 들면, 그 뒤로는 **매번 F1 그림을 함께 올리고** 같은 방식으로 다른 캐릭터를 만듭니다.
   - "Use the attached character as the exact reference for proportions, head size, line weight and coloring style."를 꼭 붙입니다(아래 공통 프롬프트에 들어 있음).
3. 받은 그림은 `assets/characters-src/` 폴더에 `F1.png`, `R1b.png`, `R1g.png`, `S1.png`처럼 번호 이름으로 넣어 주세요. 배경 지우기, 3칸 자르기, 크기·발 위치 맞추기는 코드(도구)로 합니다.
4. 마음에 안 들면 같은 대화에서 "Same character, but ..." 로 고쳐 달라고 하면 됩니다.

### 체크할 것 (받은 그림)
- 3칸 모두 **같은 캐릭터, 같은 크기, 발끝 높이가 같음**
- 옆모습이 **왼쪽을 보고** 있음
- 배경이 **한 가지 색으로 평평함**(그림자·바닥·글자 없음)
- 뒷모습에 얼굴이 보이지 않음

---

## [공통 프롬프트] — 매번 맨 앞에 붙이기

```
Create a character turnaround sprite sheet for a cute 2D kids' amusement park game.

LAYOUT
- One wide image, 3:1 aspect ratio, three equal panels side by side, left to right:
  1) FRONT view (facing the viewer), 2) BACK view (facing away, no face visible),
  3) LEFT SIDE view (full profile, facing to the left).
- The SAME character in all three panels, same size, standing in a neutral standing pose, arms relaxed.
- The character fills about 80% of the panel height, centered horizontally.
- The soles of the feet are at exactly the same height in all three panels.
- Background: perfectly flat, solid light gray (#E6E6E6), no floor, no ground shadow, no gradient,
  no text, no labels, no panel borders.

ART STYLE
- Chibi proportions: about 2.5 heads tall, big round head, small body, short arms and legs.
- Big shiny friendly eyes, small smile, soft pink cheeks.
- Clean, bold dark-brown outlines of even thickness.
- Cel shading with 2-3 tones per color, soft light from the upper left, bright cheerful saturated colors.
- Detailed costume and props, polished mobile game character art.
- Match the attached style reference image (art style only; do not copy its characters).
- If a character reference image is attached, use it as the exact reference for proportions,
  head size, line weight and coloring style.

CHARACTER
```

## [캐릭터 설명] — 공통 프롬프트 바로 뒤에 붙이기

### 무료
**F1 기본 남자아이**
```
A cheerful elementary school boy with short messy brown hair, a plain white t-shirt, blue shorts, white socks and blue-and-white sneakers. No props.
```
**F2 기본 여자아이**
```
A cheerful elementary school girl with shoulder-length brown hair and a small pink hair clip on the right side, a mint green t-shirt, a denim skirt, white socks and pink sneakers. No props.
```

### 건물 보상 (남자아이 b / 여자아이 g)
여자아이 버전을 만들 때는 **같은 건물의 남자아이 그림(b)도 함께 올리고** `Make a girl version of the attached costume character, same theme and colors.` 를 덧붙이면 두 명이 짝처럼 어울립니다.

**R1b 꼬마 기관사 — 남자아이 (코스터 익스프레스)**
```
A boy train conductor with short brown hair: blue-and-white striped engineer cap, navy vest over a white shirt, red neckerchief, dark blue shorts, brown boots, a small silver whistle on a cord around the neck.
```
**R1g 꼬마 기관사 — 여자아이**
```
A girl train conductor with two brown braids: blue-and-white striped engineer cap, navy pinafore dress over a white blouse, red neckerchief, white knee socks, brown boots, a small silver whistle on a cord around the neck.
```
**R2b 퍼레이드 고수 — 남자아이 (레인보우 퍼레이드)**
```
A boy parade drummer: bright marching band jacket with rainbow-colored trim and gold buttons, white pants, tall hat with a fluffy feather, white gloves, a small drum hanging at the hip with two drumsticks.
```
**R2g 퍼레이드 고수 — 여자아이**
```
A girl parade drummer with a high brown ponytail: bright marching band jacket with rainbow-colored trim and gold buttons, short pleated white skirt, white boots, tall hat with a fluffy feather, white gloves, a small drum hanging at the hip with two drumsticks.
```
**R3b 꼬마 가수 — 남자아이 (멜로디 스테이지)**
```
A boy pop singer with neat brown hair: sparkly lavender stage jacket over a white t-shirt, checkered pants, high-top sneakers, holding a microphone in one hand.
```
**R3g 꼬마 가수 — 여자아이**
```
A girl pop singer with pink twin tails and a star-shaped hairband: sparkly lavender stage jacket over a white top, pleated checkered skirt, white boots, holding a microphone in one hand.
```
**R4b 범퍼카 레이서 — 남자아이 (짜릿 어드벤처)**
```
A boy race driver: red-and-white racing suit with number 7 badge, racing gloves, a round helmet tucked under one arm, holding a small black-and-white checkered flag.
```
**R4g 범퍼카 레이서 — 여자아이**
```
A girl race driver with a brown ponytail: red-and-white racing suit with number 7 badge, racing gloves, a round helmet tucked under one arm, holding a small black-and-white checkered flag.
```
**R5b 꼬마 유령 — 남자아이 (유령의 집)**
```
A boy in a cute white bedsheet ghost costume: a soft white sheet draped over the body with a round opening so the smiling face is fully visible, tiny sneakers peeking out, holding a glowing pumpkin lantern. Cute, not scary.
```
**R5g 꼬마 유령 — 여자아이**
```
A girl in a cute white bedsheet ghost costume with a big pink bow on top: a soft white sheet draped over the body with a round opening so the smiling face and brown bangs are fully visible, tiny pink shoes peeking out, holding a glowing pumpkin lantern. Cute, not scary.
```
**R6b 게임 챔피언 — 남자아이 (플레이 아케이드)**
```
A boy gamer champion: teal hoodie with a pixel-heart pattern, headphones with a microphone, cargo shorts, colorful sneakers, holding a handheld game console.
```
**R6g 게임 챔피언 — 여자아이**
```
A girl gamer champion with a brown bob haircut: long teal hoodie dress with a pixel-heart pattern, headphones with cat ears and a microphone, striped leggings, colorful sneakers, holding a handheld game console.
```
**R7b 별빛 요정 — 남자아이 (스타 페스티벌)**
```
A boy star fairy: navy blue cape sprinkled with little gold stars, small translucent glittery wings on the back, star-tipped wand in one hand, soft yellow tunic, navy shorts, golden shoes.
```
**R7g 별빛 요정 — 여자아이**
```
A girl star fairy with long wavy brown hair and a tiny star crown: navy blue cape sprinkled with little gold stars, small translucent glittery wings on the back, star-tipped wand in one hand, soft yellow tutu dress, golden shoes.
```

### 티켓 구매
**S1 정글 탐험가**
```
A kid jungle explorer: khaki safari hat, khaki vest with pockets over a green shirt, brown shorts, hiking boots, a small brown backpack, binoculars around the neck.
```
**S2 꼬마 요리사**
```
A kid chef: tall white chef hat, white double-breasted chef jacket, red neckerchief, black-and-white checkered pants, holding a wooden ladle.
```
**S3 해변 서퍼**
```
A kid beach surfer: orange hawaiian shirt with flower pattern, blue board shorts, sandals, sunglasses pushed up on the head, holding a mint green surfboard upright at the side.
```
**S4 공룡 잠옷**
```
A kid wearing a cozy green dinosaur onesie pajama with the hood up (dinosaur face and little spikes on the hood, the kid's face fully visible), a soft tail at the back, fluffy slippers.
```
**S5 꼬마 해적**
```
A kid pirate: black tricorn pirate hat with a cute skull-free anchor emblem, red-and-white striped shirt, brown vest, black eye patch pushed up on the forehead, short pants, boots, holding a toy spyglass.
```
**S6 꼬마 마법사**
```
A kid wizard: tall floppy purple pointed hat, purple robe with gold star pattern, holding a thick spell book, small glowing sparkles around the hand.
```
**S7 우주 비행사**
```
A kid astronaut: white puffy space suit with orange and blue details, round clear glass helmet with the kid's face fully visible, colorful buttons on the chest, chunky white boots.
```
**S8 꼬마 닌자**
```
A kid ninja: navy blue ninja outfit, purple headband with long tails, face uncovered and smiling, cloth wraps on the legs, a toy wooden sword on the back.
```
**S9 꼬마 기사**
```
A kid knight: shiny silver armor with rounded cute shapes, blue cape, small helmet with the visor up so the face is visible, holding a round shield with a gold cross pattern.
```
**S10 공주님**
```
A kid princess: puffy pink ball gown with ruffles, small golden tiara, long wavy brown hair, sparkly pink shoes, holding a heart-shaped wand.
```

---

### 고쳐 달라고 할 때 쓰는 말 (예시)
- 크기가 다를 때: `Same character. Make all three panels exactly the same size, with the feet at the same height.`
- 옆모습 방향이 틀렸을 때: `Same character. The third panel must be a full left profile, facing left.`
- 배경에 그림자가 있을 때: `Same image, but remove the floor shadow. Keep a perfectly flat #E6E6E6 background.`
- 뒷모습에 얼굴이 보일 때: `Same character. In the second panel show only the back of the head and body, no face.`
