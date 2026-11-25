/*
 * 문지기의 비밀 규칙 — 그림 이름과 기준점 (한옥 검문대, 2026-11-25)
 * 그림: assets/gatekeeper/hanok/*.webp  (python -I tools/build_hanok_gate.py 가 assets/gatekeeper-src/hanok 에서 만듦)
 * 로비·대화 얼굴(ghost-*.webp, lobby.webp)은 예전 그대로 assets/gatekeeper/
 *
 * 단서(규칙 엔진 rules.js 의 안쪽 값 → 그림 이름)
 *   머리 장식 badge: star 홍매화(blossom) · moon 은행잎(ginkgo) · none 장식 없음
 *   손 물건   item : key 열쇠(key) · lantern 복주머니(pouch) · empty 빈손
 * 손님 그림 = 'guest-성별-머리-손'(전신 700×887), 기록판 초상 = 'face-성별-머리-손'(354×300)
 *   머리·손이 이미 그려진 완성 그림이라 그 위에 아이콘을 얹지 않습니다. 아이콘(item-*)은 공식·힌트·카드에서만.
 * rings: 규칙 공개 때 빛 고리를 띄울 단서 자리(그림 기준 %) — 받은 그림에서 머리 장식·손 물건 조각의 가운데
 */
window.MP_GATE_SPR = {
  base: 'assets/gatekeeper/',
  hanok: 'hanok/',
  head: { star: 'blossom', moon: 'ginkgo', none: 'none' },
  hand: { key: 'key', lantern: 'pouch', empty: 'empty' },
  full: { w: 700, h: 887 },
  face: { w: 354, h: 300 },
  rings: {
    full: { boy: { head: [25.4, 18.4], hand: [78, 33.5] }, girl: { head: [25.1, 22.8], hand: [79.4, 32.9] } },
    face: { boy: { head: [17.5, 32.7], hand: [80, 59.3] }, girl: { head: [17.2, 40.3], hand: [81.6, 58.3] } }
  },
  items: {
    star: { src: 'hanok/item-blossom' },
    moon: { src: 'hanok/item-ginkgo' },
    key: { src: 'hanok/item-key' },
    lantern: { src: 'hanok/item-pouch' }
  },
  // 손님 기록 두루마리(1049×1499): 위 두 칸 '통과', 아래 두 칸 '잠깐!' — 그림 기준 %
  board: { src: 'hanok/guest-record', w: 1049, h: 1499 },
  boardSlots: [
    { x: 15.06, y: 32.76, w: 33.08, h: 21.75 }, { x: 51.57, y: 32.76, w: 33.08, h: 21.75 },
    { x: 15.06, y: 65.18, w: 33.08, h: 22.35 }, { x: 51.57, y: 65.18, w: 33.08, h: 22.35 }
  ],
  checkpoint: 'hanok/checkpoint'
};
