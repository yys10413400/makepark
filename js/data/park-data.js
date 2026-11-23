/*
 * 메이크파크 공원 데이터
 * ------------------------------------------------------------
 * 모든 좌표는 "시즌 지도 이미지 픽셀" 기준입니다 (가로 1448 × 세로 1086, 왼쪽 위가 0,0).
 * 크리스마스·일반 지도 모두 같은 크기·같은 배치라서 좌표계 하나를 함께 씁니다.
 * 좌표 찾기: 주소 뒤에 ?debug=1 을 붙이거나 게임 중 F2 키 → 마우스 위치의 지도 좌표가 표시됩니다.
 */
window.MP_PARK = {
  world: { width: 1448, height: 1086 },

  // 시즌 배경. 기본은 크리스마스, 플레이어가 고른 시즌은 기기에 저장됩니다.
  // 완성 지도에 눈·장식·시설 이름이 이미 그려져 있으므로 장식 레이어나 글자를 따로 올리지 않습니다.
  // (이전 지도와 개별 장식은 assets/legacy 에 보관만 합니다.)
  defaultSeason: 'christmas',
  seasons: {
    christmas: {
      label: '크리스마스', map: 'assets/maps/makepark-christmas.webp',
      // 땅(길) 지도: 캐릭터가 건물 뒤로 지나갈 때 덮개에서 길 부분을 지우는 데 씀 (tools/build_ground_mask.py)
      ground: 'assets/maps/makepark-christmas-ground.png',
      // 이 계절 지도에만 있는 물체(길가 크리스마스트리)는 이 계절에서만 막음. 형식은 아래 walkEdits 와 같음
      walkEdits: [
        { op: 'remove', ellipse: { cx: 1042, cy: 312, rx: 18, ry: 20 }, note: '스타 페스티벌 왼쪽 길가 트리' }
      ]
    },
    normal: { label: '일반', map: 'assets/maps/makepark-normal.webp', ground: 'assets/maps/makepark-normal-ground.png' }
  },

  // 캐릭터 시작 위치: 정문 아치 바로 안쪽 길
  start: { x: 705, y: 872 },

  // 충돌 판정은 캐릭터 발밑의 작은 영역(가로 2×halfWidth, 세로 2×halfHeight)으로 합니다.
  foot: { halfWidth: 5, halfHeight: 2 },

  // 이동 가능 영역 = 두 지도 공통 자동 추출 격자(walkmask.js) + 건물 뒤 공간(occluders.walkUnder) + 아래 수정
  //   → 시작점과 연결된 칸만 사용
  // add: 이동 가능하게 추가, remove: 막기.  rect = {x,y,w,h}, ellipse = {cx,cy,rx,ry}
  walkEdits: [
    // 정문 탑: 위쪽(지붕·몸통)은 그 뒤로 지나갈 수 있게 열고(탑 그림이 캐릭터를 가림), 땅에 닿는 받침만 막음
    { op: 'add', rect: { x: 600, y: 860, w: 62, h: 140 }, note: '정문 왼쪽 탑 뒤(가려지는 길) — 화단과 탑 사이가 좁아 못 지나가던 문제' },
    { op: 'add', rect: { x: 746, y: 860, w: 62, h: 140 }, note: '정문 오른쪽 탑 뒤(가려지는 길)' },
    { op: 'remove', rect: { x: 606, y: 1000, w: 50, h: 46 }, note: '정문 왼쪽 탑 받침' },
    { op: 'remove', rect: { x: 752, y: 1000, w: 50, h: 46 }, note: '정문 오른쪽 탑 받침' },
    { op: 'add', rect: { x: 660, y: 880, w: 88, h: 166 }, note: '정문 아치 안쪽 통로(아치 아래로 지나감)' },
    { op: 'add', rect: { x: 515, y: 150, w: 185, h: 72 }, note: '매표소 뒤로 지나가는 길(건물에 가려진 부분)' },
    { op: 'add', rect: { x: 1035, y: 150, w: 175, h: 42 }, note: '마이파크 문 뒤로 지나가는 길' }
  ],

  /*
   * 가림 레이어(앞뒤 순서): 캐릭터 발이 baseY 보다 위(북쪽)에 있으면 이 영역의 그림을 캐릭터 위에 다시 그립니다.
   * 길(포장) 픽셀은 투명하게 빼고 건물·나무만 덮으므로, 캐릭터가 건물 뒤로 지나가는 것처럼 보입니다.
   *   x,y,w,h : 덮을 그림 영역(지도 좌표)
   *   baseY   : 이 물체가 땅에 닿는 앞쪽(남쪽) 선
   *   walkUnder : 물체 위쪽 길 가장자리에서 이만큼(px) 아래까지 '가려진 길'로 보고 걸을 수 있게 함(0이면 안 함)
   */
  occluders: [
    { id: 'gate', x: 600, y: 858, w: 210, h: 190, baseY: 1040, walkUnder: 0 },
    { id: 'mypark', x: 1062, y: 138, w: 140, h: 82, baseY: 218, walkUnder: 0 },
    { id: 'coaster', x: 150, y: 160, w: 325, h: 195, baseY: 352, walkUnder: 24 },
    { id: 'ticket', x: 522, y: 118, w: 170, h: 190, baseY: 305, walkUnder: 0 },
    { id: 'shop', x: 765, y: 228, w: 175, h: 128, baseY: 352, walkUnder: 24 },
    { id: 'cottage-ne', x: 930, y: 212, w: 75, h: 85, baseY: 292, walkUnder: 24 },
    { id: 'star', x: 1072, y: 262, w: 222, h: 110, baseY: 345, walkUnder: 0 },
    { id: 'melody', x: 170, y: 382, w: 160, h: 170, baseY: 548, walkUnder: 30 },
    { id: 'tent', x: 385, y: 418, w: 120, h: 112, baseY: 528, walkUnder: 30 },
    { id: 'cottage-c', x: 605, y: 340, w: 90, h: 100, baseY: 438, walkUnder: 24 },
    { id: 'tower', x: 930, y: 398, w: 122, h: 230, baseY: 626, walkUnder: 30 },
    { id: 'cottages-tower', x: 855, y: 415, w: 92, h: 85, baseY: 498, walkUnder: 30 },
    { id: 'bumper', x: 1135, y: 482, w: 135, h: 120, baseY: 602, walkUnder: 0 },
    { id: 'parade', x: 185, y: 600, w: 230, h: 205, baseY: 800, walkUnder: 30 },
    { id: 'cottages-parade', x: 378, y: 596, w: 145, h: 140, baseY: 735, walkUnder: 30 },
    { id: 'arcade', x: 705, y: 686, w: 250, h: 132, baseY: 816, walkUnder: 30 },
    { id: 'ghost', x: 1055, y: 628, w: 205, h: 205, baseY: 832, walkUnder: 30 },
    { id: 'cottage-s', x: 418, y: 815, w: 115, h: 92, baseY: 900, walkUnder: 24 },
    // 크리스마스 지도에만 있는 범퍼카 오른쪽 길가 트리: 길을 막지 않고 캐릭터가 트리 뒤로 지나가게 함
    { id: 'xmas-tree-e', season: 'christmas', x: 1262, y: 486, w: 84, h: 128, baseY: 612, walkUnder: 0 }
  ],

  // 공원 중심 장소 (입장 시설 아님)
  landmarks: [
    { id: 'fountain', name: '분수 광장', x: 690, y: 565 }
  ],

  // 입장 시설.  entrance = 캐릭터가 서야 하는 입구 앞 길 좌표,  radius = 입장 버튼이 뜨는 거리
  // pin = 전체 지도 핀의 끝 위치. 지도에 그려진 시설 이름표를 가리지 않게 이름표 바로 위에 둠
  facilities: [
    { id: 'coaster', name: '코스터 익스프레스', desc: '구불구불 레일 위를 달리는 신나는 롤러코스터예요.',
      entrance: { x: 335, y: 392 }, radius: 60, pin: { x: 340, y: 266 } },
    { id: 'parade', name: '레인보우 퍼레이드', desc: '현수막을 꾸미면 리리·모모·루루가 들고 행진하는 퍼레이드예요.',
      entrance: { x: 300, y: 822 }, radius: 60, pin: { x: 300, y: 716 } },
    { id: 'melody', name: '멜로디 스테이지', desc: '음악과 공연이 가득한 야외 무대예요.',
      entrance: { x: 250, y: 600 }, radius: 60, pin: { x: 255, y: 461 } },
    { id: 'thrill', name: '짜릿 어드벤처', desc: '수달 연구원 토토와 범퍼카를 몰며 미션을 푸는 범퍼카 연구소예요.',
      entrance: { x: 995, y: 645 }, radius: 60, pin: { x: 1110, y: 481 } },
    { id: 'ghost', name: '유령의 집', desc: '살금살금, 귀여운 유령들이 사는 집이에요.',
      entrance: { x: 1158, y: 856 }, radius: 60, pin: { x: 1160, y: 761 } },
    { id: 'arcade', name: '플레이 아케이드', desc: '여러 가지 게임기가 모여 있는 오락실이에요.',
      entrance: { x: 825, y: 838 }, radius: 60, pin: { x: 825, y: 737 } },
    { id: 'star', name: '스타 페스티벌', desc: '반짝이는 작품을 뽐내는 축제 마당이에요.',
      entrance: { x: 1180, y: 410 }, radius: 60, pin: { x: 1170, y: 282 } },
    { id: 'mypark', name: '마이파크', desc: '내가 만든 놀이기구를 세울 나만의 공원이에요.',
      entrance: { x: 1130, y: 232 }, radius: 60, pin: { x: 1130, y: 150 } },
    // 예전 매표소 건물 → 토리네 도시락(아기 다람쥐 토리와 도시락 주문 수학 놀이). 지도 그림·가림 레이어(occluders 'ticket')는 그대로
    { id: 'picnic', name: '토리네 도시락', desc: '아기 다람쥐 토리와 소풍 도시락을 만드는 가게예요.',
      entrance: { x: 605, y: 320 }, radius: 55, pin: { x: 605, y: 207 } },
    { id: 'shop', name: '기념품 가게', desc: '메이크파크 기념품이 가득한 가게예요.',
      entrance: { x: 850, y: 368 }, radius: 60, pin: { x: 850, y: 272 } }
  ],

  // 카메라
  camera: {
    playViewShort: 460,    // 화면의 짧은 쪽(가로 화면이면 세로)에 보이는 지도 픽셀 수(작을수록 확대)
    maxScale: 2.2,       // 원본 1px 을 화면 몇 px 까지 키울지 상한(너무 흐려지지 않게)
    follow: 6              // 따라가는 부드러움(클수록 빠르게 따라감)
  },

  player: { speed: 170 },

  // 클릭 지점이 길에서 이 거리(px) 이상 떨어져 있으면 이동을 취소합니다.
  maxSnapDistance: 90
};
