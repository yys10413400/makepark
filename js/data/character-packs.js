/*
 * 걷기 그림 팩(walk.json + PNG) ↔ 게임 캐릭터 연결표
 * ------------------------------------------------------------
 * 팩마다 폴더가 따로 있음: assets/characters/packs/<팩>/walk.json, <texture>.png
 *  walk.json: 칸 224x320, 12열 x 4줄(front·left·right·back), 80ms, 발 기준점 (112, 294)
 * 게임 그림 id(기본 F1·F2, 보상 캐릭터 R<n> + 남 b / 여 g)는 그대로 두고, 아래 표로 팩 캐릭터 id 에 하나씩 직접 연결합니다.
 * (목록 순서·파일 이름 검색·성별로 짐작해서 연결하지 않음. star ≠ star-girl, flute ≠ flute-boy 는 서로 다른 캐릭터)
 *
 * bodyPx: 서 있는 앞모습의 발(기준점)부터 머리 끝까지 높이(px). 지도 캐릭터 키(DRAW_H)에 맞춰 같은 비율로 줄임
 * idle  : 멈췄을 때 고정할 열(0~11). 그 방향에서 두 발이 바닥에 가장 가까운 프레임(tools/pick_pack_idle.py 로 고름)
 */
window.MP_CHAR_PACKS = {
  packs: {
    'hanbok-basic': { dir: 'assets/characters/packs/hanbok-basic/', bodyPx: 276 },
    'hanbok-nine': { dir: 'assets/characters/packs/hanbok-nine/', bodyPx: 276 },
    'star-flute-sogo': { dir: 'assets/characters/packs/star-flute-sogo/', bodyPx: 276 }
  },
  // 게임 그림 id: [팩, walk.json 의 캐릭터 id, 고르기 화면 이름]
  map: {
    F1: ['hanbok-basic', 'boy', '기본 남자아이'],
    F2: ['hanbok-basic', 'girl', '기본 여자아이'],
    R1b: ['hanbok-nine', 'goggles-boy', '고글 소년'],
    R1g: ['hanbok-nine', 'goggles-girl', '고글 소녀'],
    R2b: ['star-flute-sogo', 'sogo', '소고 소년'],
    R2g: ['hanbok-nine', 'rainbow-drum-girl', '무지개 북 소녀'],
    R3b: ['hanbok-nine', 'flute-boy', '피리 소년'],
    R3g: ['star-flute-sogo', 'flute', '피리 소녀'],
    R7b: ['star-flute-sogo', 'star', '별 소년'],
    R7g: ['hanbok-nine', 'star-girl', '별마당 소녀'],
    R8b: ['hanbok-nine', 'lunchbox-boy', '도시락 소년'],
    R8g: ['hanbok-nine', 'lunchbox-girl', '도시락 소녀'],
    R9b: ['hanbok-nine', 'flower-charm-boy', '꽃참 소년'],
    R9g: ['hanbok-nine', 'flower-charm-girl', '꽃참 소녀']
  },
  idle: {
    'hanbok-basic/boy': { front: 5, left: 3, right: 4, back: 2 },
    'hanbok-basic/girl': { front: 5, left: 0, right: 4, back: 2 },
    'hanbok-nine/goggles-girl': { front: 5, left: 3, right: 5, back: 2 },
    'hanbok-nine/lunchbox-boy': { front: 11, left: 3, right: 9, back: 8 },
    'hanbok-nine/flower-charm-girl': { front: 5, left: 0, right: 0, back: 2 },
    'hanbok-nine/star-girl': { front: 11, left: 0, right: 0, back: 2 },
    'hanbok-nine/flute-boy': { front: 5, left: 4, right: 5, back: 2 },
    'hanbok-nine/rainbow-drum-girl': { front: 5, left: 0, right: 5, back: 2 },
    'hanbok-nine/goggles-boy': { front: 5, left: 10, right: 9, back: 8 },
    'hanbok-nine/lunchbox-girl': { front: 5, left: 4, right: 0, back: 2 },
    'hanbok-nine/flower-charm-boy': { front: 11, left: 10, right: 4, back: 8 },
    'star-flute-sogo/star': { front: 5, left: 10, right: 4, back: 2 },
    'star-flute-sogo/flute': { front: 11, left: 0, right: 0, back: 2 },
    'star-flute-sogo/sogo': { front: 5, left: 10, right: 4, back: 2 }
  }
};
