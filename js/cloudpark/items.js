/*
 * 구름동산 아이템 데이터 (수정하기 쉬운 데이터 — 화면 코드와 분리)
 * ------------------------------------------------------------
 * 그림: assets/cloudpark/<img>.webp (tools/build_cloudpark.py 가 받은 시트에서 잘라 만듦. 원본은 assets/cloudpark-src/)
 * 좌표: 모두 '공원 월드 좌표'(지도 그림 1448×1086 px 기준). 화면 크기와 상관없이 같은 값으로 저장됩니다.
 *       캐릭터 몸 키는 별마당 공원과 같은 60px(MPChars.DRAW_H) → 아이템 크기도 그 비율에 맞춤.
 *
 * 아이템 하나(ITEMS[id])
 *   id        고유 ID(저장에 쓰임 — 바꾸지 마세요)
 *   name      한국어 이름 · cat 카테고리(CATS 의 id)
 *   kind      'path'(바닥 산책로, 32px 칸에 딱 맞춤, 연속 배치) · 'object'(나머지)
 *   layer     'floor'(바닥 — 캐릭터·아이템 아래) · 'sort'(Y축 정렬 — 발 기준점 y 로 앞뒤)
 *   icon      고르기 패널에 보일 그림
 *   width     화면에 그릴 폭(월드 px). 높이는 원본 비율 그대로 계산(그림을 늘리거나 줄이지 않음)
 *   dirs      방향별 그림 { 방향: { img, mirror? } }. 첫 번째가 기본 방향. 회전 버튼은 이 순서대로 돌아감
 *   rotatable 회전 버튼을 보여 줄지(방향이 2개 이상일 때만 true)
 *   foot      바닥 점유 영역(충돌·겹침 판정): 발 기준점에서 { w 폭, d 깊이(위쪽으로), dx 가로 어긋남 }
 *             나뭇잎·지붕처럼 위로 솟은 부분은 넣지 않고 줄기·기둥·주춧돌만 → 캐릭터가 뒤로 지나가면 가려짐
 *             foot: null 이면 막지 않음(산책로)
 *   source    'free'(기본 무료) · 'reward'(게임 보상, 나중에) · 'shop'(상점, 나중에)
 *   limit     null = 수량 제한 없음 · 숫자 = 가질 수 있는 개수(보상·상점 아이템용, 보관함 수량으로 관리)
 *   unlock    (나중에) 보상 조건 예: { facility: 'coaster', grade: 3 }
 */
(function () {
  'use strict';
  // 잘라 낸 그림의 원본 크기와 바닥 기준점(px) — tools/cloudpark-cuts.json 과 같은 값
  var IMG = {
    'path-brick': [224, 224, 112, 223], 'path-stone': [218, 218, 108, 217], 'path-wood': [220, 220, 110, 219],
    'path-wood-h': [218, 218, 108, 217], 'path-wood-v': [219, 219, 109, 218],
    'tree-pine': [297, 258, 132, 251], 'tree-round': [279, 269, 140, 262], 'tree-cherry': [292, 259, 146, 252],
    'shrub': [237, 160, 120, 153], 'flower-pink': [243, 141, 112, 134], 'flower-white': [243, 142, 121, 135], 'rock': [230, 161, 114, 154],
    'bench': [278, 176, 138, 169], 'bench-front': [273, 194, 136, 187], 'bench-right': [172, 212, 86, 205],
    'bench-back': [265, 194, 132, 187], 'bench-left': [171, 212, 84, 205],
    'lantern': [152, 285, 33, 279],
    'hanok': [309, 227, 154, 220], 'pavilion': [271, 277, 136, 271]
  };

  var CATS = [
    { id: 'path', name: '길' },
    { id: 'nature', name: '자연' },
    { id: 'building', name: '건물' },
    { id: 'prop', name: '소품' }
  ];

  // 산책로 칸(32px). (기와 돌담은 2026-11-25 사용자 요청으로 뺌 — 잘라 둔 그림 조각은 assets/cloudpark/wall-*.webp 에 그대로 보관)
  var PATH_CELL = 32, SNAP = 8;

  var ITEMS = {
    'path-brick': { name: '분홍 벽돌길', cat: 'path', kind: 'path', layer: 'floor', icon: 'path-brick',
      dirs: { base: { img: 'path-brick' } } },
    'path-stone': { name: '회색 돌길', cat: 'path', kind: 'path', layer: 'floor', icon: 'path-stone',
      dirs: { base: { img: 'path-stone' } } },
    'path-wood': { name: '나무 산책로', cat: 'path', kind: 'path', layer: 'floor', icon: 'path-wood',
      dirs: { h: { img: 'path-wood-h', label: '가로' }, v: { img: 'path-wood-v', label: '세로' } } },

    'tree-pine': { name: '소나무', cat: 'nature', kind: 'object', layer: 'sort', icon: 'tree-pine', width: 118,
      dirs: { base: { img: 'tree-pine' } }, foot: { w: 18, d: 10, dx: -4 } },
    'tree-round': { name: '둥근 나무', cat: 'nature', kind: 'object', layer: 'sort', icon: 'tree-round', width: 112,
      dirs: { base: { img: 'tree-round' } }, foot: { w: 18, d: 10 } },
    'tree-cherry': { name: '벚꽃나무', cat: 'nature', kind: 'object', layer: 'sort', icon: 'tree-cherry', width: 116,
      dirs: { base: { img: 'tree-cherry' } }, foot: { w: 16, d: 10 } },
    'shrub': { name: '작은 관목', cat: 'nature', kind: 'object', layer: 'sort', icon: 'shrub', width: 60,
      dirs: { base: { img: 'shrub' } }, foot: { w: 46, d: 14 } },
    'flower-pink': { name: '분홍 꽃밭', cat: 'nature', kind: 'object', layer: 'sort', icon: 'flower-pink', width: 58,
      dirs: { base: { img: 'flower-pink' } }, foot: { w: 48, d: 14 } },
    'flower-white': { name: '흰색 꽃밭', cat: 'nature', kind: 'object', layer: 'sort', icon: 'flower-white', width: 58,
      dirs: { base: { img: 'flower-white' } }, foot: { w: 48, d: 14 } },
    'rock': { name: '자연석', cat: 'nature', kind: 'object', layer: 'sort', icon: 'rock', width: 56,
      dirs: { base: { img: 'rock' } }, foot: { w: 48, d: 16 } },

    'bench': { name: '나무 벤치', cat: 'prop', kind: 'object', layer: 'sort', icon: 'bench', width: 66, sit: true,
      // 정면 → 오른쪽 → 뒷면 → 왼쪽 (회전 버튼마다 90도). 그림 자체를 돌리지 않고 방향별 그림을 씀
      dirs: {
        front: { img: 'bench-front', label: '정면', foot: { w: 60, d: 14 } },
        right: { img: 'bench-right', label: '오른쪽', foot: { w: 28, d: 26 } },
        back: { img: 'bench-back', label: '뒷면', foot: { w: 60, d: 14 } },
        left: { img: 'bench-left', label: '왼쪽', foot: { w: 28, d: 26 } }
      }, k: 66 / 273 },
    'lantern': { name: '청사초롱', cat: 'prop', kind: 'object', layer: 'sort', icon: 'lantern', width: 45,
      // 원본은 초롱이 기둥 오른쪽 → '왼쪽'은 좌우 반전
      dirs: { right: { img: 'lantern', label: '오른쪽' }, left: { img: 'lantern', mirror: true, label: '왼쪽' } },
      foot: { w: 14, d: 8 } },

    'hanok': { name: '작은 한옥', cat: 'building', kind: 'object', layer: 'sort', icon: 'hanok', width: 190,
      dirs: { base: { img: 'hanok' } }, foot: { w: 178, d: 52 } },
    'pavilion': { name: '한옥 정자', cat: 'building', kind: 'object', layer: 'sort', icon: 'pavilion', width: 160,
      dirs: { base: { img: 'pavilion' } }, foot: { w: 142, d: 60 } }
  };

  // 기본값 채우기: 소스·수량·회전 가능 여부·순서
  var ORDER = ['path-brick', 'path-stone', 'path-wood', 'tree-pine', 'tree-round', 'tree-cherry', 'shrub',
    'flower-pink', 'flower-white', 'rock', 'bench', 'lantern', 'hanok', 'pavilion'];
  ORDER.forEach(function (id) {
    var it = ITEMS[id];
    it.id = id;
    it.source = it.source || 'free';
    it.limit = it.limit === undefined ? null : it.limit;
    it.dirOrder = Object.keys(it.dirs);
    it.rotatable = it.dirOrder.length > 1;
    it.foot = it.foot === undefined ? null : it.foot;
    if (it.kind === 'path') it.width = PATH_CELL;
  });

  // 그릴 크기·기준점(월드 px): 원본 비율 그대로 배율 하나로 줄임
  function scaleOf(it) {
    if (it.k) return it.k;
    var first = it.dirs[it.dirOrder[0]].img;
    return it.width / IMG[first][0];
  }
  // → { img, w, h, ax, ay, mirror } (ax, ay: 그림 왼쪽 위에서 발 기준점까지)
  function sprite(it, dir, imgOverride) {
    var d = it.dirs[dir] || it.dirs[it.dirOrder[0]], name = imgOverride || d.img, s = IMG[name];
    if (it.kind === 'path') return { img: name, w: PATH_CELL, h: PATH_CELL, ax: PATH_CELL / 2, ay: PATH_CELL / 2, mirror: false };
    var k = scaleOf(it);
    var ax = s[2] * k;
    if (d.mirror) ax = s[0] * k - ax;
    return { img: name, w: s[0] * k, h: s[1] * k, ax: ax, ay: s[3] * k, mirror: !!d.mirror };
  }
  function footOf(it, dir) {
    var d = it.dirs[dir];
    var f = (d && d.foot) || it.foot;
    if (!f) return null;
    var dx = f.dx || 0;
    if (d && d.mirror) dx = -dx;
    return { w: f.w, d: f.d, dx: dx };
  }

  window.MP_CLOUD_ITEMS = {
    VERSION: 2, CATS: CATS, ITEMS: ITEMS, ORDER: ORDER, IMG: IMG,
    PATH_CELL: PATH_CELL, SNAP: SNAP,
    BASE: 'assets/cloudpark/', sprite: sprite, footOf: footOf, scaleOf: scaleOf,
    WORLD: { w: 1448, h: 1086 },
    // 캐릭터가 나타나는 곳(한옥 입구 안쪽)과 나가는 곳
    SPAWN: { x: 705, y: 786 }, EXIT: { x: 705, y: 824, r: 24 },
    // 입구 전경(지붕·기둥): 캐릭터보다 나중에 그려서 입구 아래를 지날 때 가려짐
    GATE: { img: 'gate-front', x: 548, y: 820, w: 314, h: 180, baseY: 990 },
    MAX_ITEMS: 1500, NAME_MAX: 14
  };
})();
