/*
 * 문지기의 비밀 규칙 — 그림 크기와 기준점
 * 그림: assets/gatekeeper/*.webp (python tools/build_gatekeeper.py 가 받은 시트에서 잘라 냄)
 * 좌표는 모두 그 그림 한 장의 픽셀 기준. 화면에서는 %로 바꿔 놓으므로 창 크기가 바뀌어도 손·배지가 어긋나지 않습니다.
 *
 * 아이 그림(남녀 기본 캐릭터): 윗줄 전신 = 문 앞 손님, 아랫줄 상반신 = 기록 카드
 *   badge : 흰 티셔츠 가운데(배지 중심)와 배지 너비
 *   fist  : 화면 오른쪽 쥔 손의 중심과 반지름(손을 소품 위에 다시 그려 '쥔' 것처럼 보이게)
 *   key / lantern : 소품을 그릴 높이(px)
 *   frame : 소품까지 다 들어가는 틀(손님·카드는 이 틀을 기준으로 크기를 맞춤)
 * 소품의 잡는 곳(grip): 열쇠는 자루(머리 고리 아래 대), 호박등은 손잡이 윗부분
 */
window.MP_GATE_SPR = {
  base: 'assets/gatekeeper/',
  kids: {
    'boy-full': { w: 261, h: 535, badge: { x: 122, y: 284, w: 46 }, fist: { x: 231, y: 238, r: 21 }, key: 118, lantern: 104,
      frame: { x: 0, y: 0, w: 300, h: 535 }, shoes: 'boy-full-shoes' },
    'girl-full': { w: 264, h: 524, badge: { x: 124, y: 266, w: 46 }, fist: { x: 235, y: 236, r: 21 }, key: 118, lantern: 104,
      frame: { x: 0, y: 0, w: 300, h: 524 }, shoes: 'girl-full-shoes', pin: 'girl-full-pin' },
    'boy-bust': { w: 407, h: 607, badge: { x: 192, y: 436, w: 82 }, fist: { x: 366, y: 368, r: 36 }, key: 205, lantern: 182,
      frame: { x: 0, y: 0, w: 480, h: 607 } },
    'girl-bust': { w: 425, h: 589, badge: { x: 198, y: 410, w: 82 }, fist: { x: 383, y: 365, r: 36 }, key: 205, lantern: 182,
      frame: { x: 0, y: 0, w: 490, h: 589 }, pin: 'girl-bust-pin' }
  },
  items: {
    star: { src: 'item-star', w: 453, h: 432 },
    moon: { src: 'item-moon', w: 401, h: 440 },
    key: { src: 'item-key', w: 287, h: 581, grip: { x: 145, y: 330 } },
    lantern: { src: 'item-lantern', w: 475, h: 571, grip: { x: 238, y: 28 } }
  },
  ghost: {
    idle: { w: 346, h: 455 }, hello: { w: 383, h: 455 }, think: { w: 323, h: 455 },
    pass: { w: 416, h: 459 }, stop: { w: 346, h: 459 }, cheer: { w: 418, h: 449 }
  },
  // 가로 기록판(record-board-wide.webp, 1600×820 — 받은 세로 기록판 조각으로 tools/build_gatekeeper.py 가 조립)
  // 카드 칸: 왼쪽 두 칸 '통과', 오른쪽 두 칸 '잠깐!' — 판 그림 기준 %
  board: { src: 'record-board-wide', w: 1600, h: 820 },
  boardSlots: [
    { x: 3.438, y: 27.805, w: 21.562, h: 66.829 }, { x: 26.25, y: 27.805, w: 21.562, h: 66.829 },
    { x: 52.188, y: 27.805, w: 21.562, h: 66.829 }, { x: 75.0, y: 27.805, w: 21.562, h: 66.829 }
  ],
  // 판정과 상관없는 꾸밈 색(머리핀·신발 색조 회전, 도)
  pinHues: [0, 70, 150, 230],
  shoeHues: [0, 120, 200, 280]
};
