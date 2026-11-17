/*
 * 메이크파크 공원 데이터
 * ------------------------------------------------------------
 * 모든 좌표는 "기본 지도 이미지 픽셀" 기준입니다 (가로 1672 × 세로 941, 왼쪽 위가 0,0).
 * 화면 크기나 확대 비율과 상관없이 이 좌표계 하나만 씁니다.
 * 좌표 찾기: 주소 뒤에 ?debug=1 을 붙이거나 게임 중 F2 키 → 마우스 위치의 지도 좌표가 표시됩니다.
 */
window.MP_PARK = {
  world: { width: 1672, height: 941 },

  // 시즌별 배경. 앞쪽 파일부터 불러보고, 없으면 다음 파일을 씁니다.
  // christmas-map.png(눈·장식이 그려진 완성 맵)를 assets/maps 에 넣으면 자동으로 사용됩니다.
  // 완성 맵에는 장식이 이미 그려져 있으므로 decorations 레이어는 올리지 않습니다.
  season: 'christmas',
  seasons: {
    christmas: { maps: ['assets/maps/christmas-map.png', 'assets/maps/base-map.png'] },
    normal: { maps: ['assets/maps/base-map.png'] }
  },
  // 개별 장식 PNG(assets/decorations)는 이후 시즌 전환용으로 보관만 합니다. 이번 버전에서는 화면에 올리지 않습니다.

  // 캐릭터 시작 위치: 정문 아치 바로 안쪽 길
  start: { x: 830, y: 655 },

  // 이동 가능 영역 = 자동 추출 격자(walkmask.js) + 아래 수정 → 시작점과 연결된 칸만 사용
  // add: 이동 가능하게 추가, remove: 막기.  rect = {x,y,w,h}, ellipse = {cx,cy,rx,ry}
  walkEdits: [
    { op: 'add', rect: { x: 285, y: 318, w: 70, h: 36 }, note: '코스터 앞 가로등 옆 길 연결' },
    { op: 'add', rect: { x: 200, y: 338, w: 115, h: 28 }, note: '코스터 앞 → 왼쪽 바깥 길 연결' },
    { op: 'remove', rect: { x: 735, y: 690, w: 190, h: 175 }, note: '정문 아치: 간판 위로 캐릭터가 떠 보이지 않게 막음' },
    { op: 'add', rect: { x: 500, y: 692, w: 70, h: 28 }, note: '레인보우 퍼레이드 앞길 → 광장 길 연결' },
    { op: 'add', rect: { x: 515, y: 858, w: 45, h: 22 }, note: '바깥 순환길 → 매표소 앞 연결' },
    { op: 'remove', rect: { x: 650, y: 735, w: 142, h: 128 }, note: '정문 왼쪽 돌담·기둥' },
    { op: 'remove', rect: { x: 870, y: 735, w: 150, h: 128 }, note: '정문 오른쪽 돌담·기둥' },
    { op: 'remove', rect: { x: 68, y: 455, w: 34, h: 100 }, note: '마이파크 문 왼쪽 기둥' },
    { op: 'remove', rect: { x: 198, y: 455, w: 34, h: 100 }, note: '마이파크 문 오른쪽 기둥' },
    { op: 'remove', ellipse: { cx: 830, cy: 452, rx: 108, ry: 62 }, note: '분수와 둘레 화단' }
  ],

  // 공원 중심 장소 (입장 시설 아님)
  landmarks: [
    { id: 'fountain', name: '분수 광장', x: 830, y: 455 }
  ],

  // 입장 시설.  entrance = 캐릭터가 서야 하는 입구 앞 길 좌표,  radius = 입장 버튼이 뜨는 거리
  // pin = 전체 지도 핀의 끝 위치. 지도에 그려진 시설 이름표를 가리지 않게 이름표 바로 위/아래에 둠
  facilities: [
    { id: 'coaster', name: '코스터 익스프레스', desc: '구불구불 레일 위를 달리는 신나는 롤러코스터예요.',
      entrance: { x: 360, y: 345 }, radius: 60, pin: { x: 365, y: 252 } },
    { id: 'parade', name: '레인보우 퍼레이드', desc: '알록달록 꽃차가 공원을 누비는 퍼레이드예요.',
      entrance: { x: 380, y: 718 }, radius: 60, pin: { x: 405, y: 582 } },
    { id: 'melody', name: '멜로디 스테이지', desc: '음악과 공연이 가득한 야외 무대예요.',
      entrance: { x: 845, y: 268 }, radius: 60, pin: { x: 845, y: 228 } },
    { id: 'thrill', name: '짜릿 어드벤처', desc: '범퍼카와 미끄럼틀이 있는 모험 놀이터예요.',
      entrance: { x: 1280, y: 338 }, radius: 60, pin: { x: 1290, y: 248 } },
    { id: 'ghost', name: '유령의 집', desc: '살금살금, 귀여운 유령들이 사는 집이에요.',
      entrance: { x: 1436, y: 505 }, radius: 60, pin: { x: 1440, y: 396 } },
    { id: 'arcade', name: '플레이 아케이드', desc: '여러 가지 게임기가 모여 있는 오락실이에요.',
      entrance: { x: 1372, y: 705 }, radius: 60, pin: { x: 1372, y: 630 } },
    { id: 'star', name: '스타 페스티벌', desc: '반짝이는 작품을 뽐내는 축제 마당이에요.',
      entrance: { x: 1078, y: 548 }, radius: 65, pin: { x: 1085, y: 440 } },
    { id: 'mypark', name: '마이파크', desc: '내가 만든 놀이기구를 세울 나만의 공원이에요.',
      entrance: { x: 150, y: 552 }, radius: 60, pin: { x: 150, y: 530 } },
    { id: 'ticket', name: '매표소', desc: '공원 이용 안내를 받을 수 있는 곳이에요.',
      entrance: { x: 600, y: 878 }, radius: 55, pin: { x: 600, y: 762 } },
    { id: 'shop', name: '기념품 가게', desc: '메이크파크 기념품이 가득한 가게예요.',
      entrance: { x: 1125, y: 880 }, radius: 60, pin: { x: 1110, y: 757 } }
  ],

  // 카메라
  camera: {
    playViewHeight: 560,   // 플레이 화면에서 세로로 보이는 지도 픽셀 수(작을수록 확대)
    playViewWidth: 900,    // 가로로 최소한 이만큼은 보이게(세로 화면에서 과하게 확대되지 않게)
    maxScale: 1.8,       // 원본 1px 을 화면 몇 px 까지 키울지 상한(너무 흐려지지 않게)
    follow: 6              // 따라가는 부드러움(클수록 빠르게 따라감)
  },

  player: { speed: 170 },

  // 클릭 지점이 길에서 이 거리(px) 이상 떨어져 있으면 이동을 취소합니다.
  maxSnapDistance: 90
};
