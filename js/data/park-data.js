/*
 * 메이크파크 공원 데이터
 * ------------------------------------------------------------
 * 모든 좌표는 "시즌 지도 이미지 픽셀" 기준입니다 (가로 1672 × 세로 941, 왼쪽 위가 0,0).
 * 크리스마스·일반 지도 모두 같은 크기·같은 배치라서 좌표계 하나를 함께 씁니다.
 * 좌표 찾기: 주소 뒤에 ?debug=1 을 붙이거나 게임 중 F2 키 → 마우스 위치의 지도 좌표가 표시됩니다.
 */
window.MP_PARK = {
  world: { width: 1672, height: 941 },

  // 시즌 배경. 기본은 크리스마스, 플레이어가 고른 시즌은 기기에 저장됩니다.
  // 완성 지도에 눈·장식·시설 이름이 이미 그려져 있으므로 장식 레이어나 글자를 따로 올리지 않습니다.
  // (이전 패키지의 기본 지도와 개별 장식은 assets/legacy 에 보관만 합니다.)
  defaultSeason: 'christmas',
  seasons: {
    christmas: { label: '크리스마스', map: 'assets/maps/makepark-christmas.png' },
    normal: { label: '일반', map: 'assets/maps/makepark-normal.png' }
  },

  // 캐릭터 시작 위치: 정문 아치 바로 안쪽 길
  start: { x: 835, y: 630 },

  // 충돌 판정은 캐릭터 발밑의 작은 영역(가로 2×halfWidth, 세로 2×halfHeight)으로 합니다.
  foot: { halfWidth: 5, halfHeight: 2 },

  // 이동 가능 영역 = 두 지도 공통 자동 추출 격자(walkmask.js) + 아래 수정 → 시작점과 연결된 칸만 사용
  // add: 이동 가능하게 추가, remove: 막기.  rect = {x,y,w,h}, ellipse = {cx,cy,rx,ry}
  walkEdits: [
    { op: 'remove', rect: { x: 570, y: 690, w: 535, h: 150 }, note: '정문 아치·기둥: 간판 위로 캐릭터가 떠 보이지 않게 막음' },
    { op: 'add', rect: { x: 818, y: 632, w: 36, h: 58 }, note: '아치 위로 솟은 깃대: 광장 한가운데서 걸리지 않게 통과' },
    { op: 'remove', rect: { x: 1160, y: 110, w: 280, h: 178 }, note: '짜릿 어드벤처 건물·범퍼카 지붕(회색 지붕이 길로 잡힘)' },
    { op: 'remove', rect: { x: 1290, y: 590, w: 210, h: 72 }, note: '플레이 아케이드 안쪽 바닥(게임기 위로 걷지 않게)' },
    { op: 'remove', ellipse: { cx: 1150, cy: 418, rx: 108, ry: 60 }, note: '스타 페스티벌 안쪽 전시대 (앞쪽 열린 입구는 남김)' }
  ],

  // 공원 중심 장소 (입장 시설 아님)
  landmarks: [
    { id: 'fountain', name: '분수 광장', x: 835, y: 440 }
  ],

  // 입장 시설.  entrance = 캐릭터가 서야 하는 입구 앞 길 좌표,  radius = 입장 버튼이 뜨는 거리
  // pin = 전체 지도 핀의 끝 위치. 지도에 그려진 시설 이름표를 가리지 않게 이름표 바로 위/아래에 둠
  facilities: [
    { id: 'coaster', name: '코스터 익스프레스', desc: '구불구불 레일 위를 달리는 신나는 롤러코스터예요.',
      entrance: { x: 330, y: 300 }, radius: 60, pin: { x: 340, y: 212 } },
    { id: 'parade', name: '레인보우 퍼레이드', desc: '알록달록 꽃차가 공원을 누비는 퍼레이드예요.',
      entrance: { x: 290, y: 690 }, radius: 60, pin: { x: 310, y: 578 } },
    { id: 'melody', name: '멜로디 스테이지', desc: '음악과 공연이 가득한 야외 무대예요.',
      entrance: { x: 845, y: 235 }, radius: 60, pin: { x: 835, y: 112 } },
    { id: 'thrill', name: '짜릿 어드벤처', desc: '범퍼카와 미끄럼틀이 있는 모험 놀이터예요.',
      entrance: { x: 1290, y: 318 }, radius: 60, pin: { x: 1296, y: 228 } },
    { id: 'ghost', name: '유령의 집', desc: '살금살금, 귀여운 유령들이 사는 집이에요.',
      entrance: { x: 1470, y: 475 }, radius: 60, pin: { x: 1481, y: 390 } },
    { id: 'arcade', name: '플레이 아케이드', desc: '여러 가지 게임기가 모여 있는 오락실이에요.',
      entrance: { x: 1400, y: 685 }, radius: 60, pin: { x: 1376, y: 562 } },
    { id: 'star', name: '스타 페스티벌', desc: '반짝이는 작품을 뽐내는 축제 마당이에요.',
      entrance: { x: 1160, y: 492 }, radius: 60, pin: { x: 1141, y: 368 } },
    { id: 'mypark', name: '마이파크', desc: '내가 만든 놀이기구를 세울 나만의 공원이에요.',
      entrance: { x: 130, y: 540 }, radius: 60, pin: { x: 130, y: 415 } },
    { id: 'ticket', name: '매표소', desc: '공원 이용 안내를 받을 수 있는 곳이에요.',
      entrance: { x: 465, y: 862 }, radius: 55, pin: { x: 465, y: 752 } },
    { id: 'shop', name: '기념품 가게', desc: '메이크파크 기념품이 가득한 가게예요.',
      entrance: { x: 1200, y: 862 }, radius: 60, pin: { x: 1206, y: 752 } }
  ],

  // 카메라
  camera: {
    playViewHeight: 560,   // 플레이 화면에서 세로로 보이는 지도 픽셀 수(작을수록 확대)
    playViewWidth: 900,    // 가로로 최소한 이만큼은 보이게(세로 화면에서 과하게 확대되지 않게)
    maxScale: 1.8,         // 원본 1px 을 화면 몇 px 까지 키울지 상한(너무 흐려지지 않게)
    follow: 6              // 따라가는 부드러움(클수록 빠르게 따라감)
  },

  player: { speed: 170 },

  // 클릭 지점이 길에서 이 거리(px) 이상 떨어져 있으면 이동을 취소합니다.
  maxSnapDistance: 90
};
