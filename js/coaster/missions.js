/*
 * 코스터 익스프레스 미션 데이터 (설계: docs/coaster-missions.md)
 * 좌표 [열, 행], 방향 'E','S','W','N'. 레일 조각: h, v, ne, se, sw, nw (갈림길은 'h+nw' 처럼 합침)
 * blocks: 이 미션에서 공개하는 명령 블록 / limit: 블록 수 제한(없으면 제한 없음)
 * par: 별 2개 기준 블록 수 / bonus: 별 3개 조건('stars' 별 모두, 'guests' 손님 모두, 'fast' 빠르게 도착)
 * stars: 별 칸 / climbs: 오르막 칸(speedRules) / guests·guestCells: 손님 / ifCond: 만약이 보는 것
 * start: 처음 목록(틀린 명령 고치기 미션만). 보통은 비워 둠.
 * 보상: 새로 받은 별 하나마다 티켓 starTickets 장(미션당 최대 3개)
 */
window.MP_COASTER_MISSIONS = (function () {
  function line(n, row) { var r = []; for (var c = 0; c < n; c++) r.push([c, row || 0, 'h']); return r; }
  var F = { type: 'fwd' }, L = { type: 'left' }, R = { type: 'right' }, W = { type: 'wait' };
  var FAST = { type: 'fast' }, SLOW = { type: 'slow' }, P = { type: 'pick' };
  function rep(n, body) { return { type: 'repeat', n: n, body: body }; }
  function ifg(then, els) { return { type: 'if', then: then, else: els || [] }; }
  var COMMON = [
    { id: 'common-1', title: '첫 출발', guide: '앞으로 세 칸 가서 도착해요', goal: '명령을 순서대로 실행해요',
      rails: line(4), from: [0, 0], dir: 'E', to: [3, 0], blocks: ['fwd'], par: 3,
      answer: [F, F, F] }
  ];
  var TWO_CORNERS = [[0, 1, 'h'], [1, 1, 'h'], [2, 1, 'nw'], [2, 0, 'se'], [3, 0, 'h'], [4, 0, 'h']];
  // 두 갈래 길: 아래로 곧장 가는 짧은 길과, 위로 돌아가며 별이 있는 긴 길
  var FORK = [[0, 1, 'h'], [1, 1, 'h+nw'], [2, 1, 'h'], [3, 1, 'h+ne'], [4, 1, 'h'], [1, 0, 'se'], [2, 0, 'h'], [3, 0, 'sw']];
  // 언덕 코스: 두 줄 안에서 위로 올라갔다 내려오는 모양이 n번
  function hills(n) {
    var r = [[0, 1, 'h']];
    for (var k = 0; k < n; k++) { var c = 1 + 2 * k; r.push([c, 1, 'nw'], [c, 0, 'se'], [c + 1, 0, 'sw'], [c + 1, 1, 'ne']); }
    r.push([2 * n + 1, 1, 'h']); return r;
  }
  function tops(n) { var r = []; for (var k = 0; k < n; k++) r.push([1 + 2 * k, 0]); return r; }
  var HILL = [F, L, F, R, F, R, F, L];
  var COURSES = {
    low: { label: '1~2학년 과정', missions: [
      { id: 'low-1', title: '별 모으며 달리기', guide: '앞으로 가면서 별을 모아 도착해요', goal: '순서대로 이동',
        rails: line(5), from: [0, 0], dir: 'E', to: [4, 0], stars: [[2, 0], [3, 0]], blocks: ['fwd'], par: 4, bonus: 'stars',
        answer: [F, F, F, F] },
      { id: 'low-2', title: '모퉁이 두 번', guide: '모퉁이에서는 방향을 바꿔야 해요', goal: '왼쪽·오른쪽 돌기',
        rails: TWO_CORNERS, from: [0, 1], dir: 'E', to: [4, 0], stars: [[3, 0]], blocks: ['fwd', 'left', 'right'], par: 7, bonus: 'stars',
        answer: [F, F, L, F, R, F, F] },
      { id: 'low-3', title: '두 갈래 길', guide: '짧은 길과 별이 있는 길! 어느 길로 갈까요?', goal: '길 고르기',
        rails: FORK, from: [0, 1], dir: 'E', to: [4, 1], stars: [[2, 0]], blocks: ['fwd', 'left', 'right'], par: 10, bonus: 'stars',
        answer: [F, L, F, R, F, F, R, F, L, F], shortcut: [F, F, F, F] },
      { id: 'low-4', title: '틀린 명령 고치기', guide: '명령 하나가 틀렸어요. 찾아서 고쳐요', goal: '잘못된 명령 고치기',
        rails: [[0, 0, 'h'], [1, 0, 'sw'], [1, 1, 'ne'], [2, 1, 'h'], [3, 1, 'h']], from: [0, 0], dir: 'E', to: [3, 1], stars: [[2, 1]],
        blocks: ['fwd', 'left', 'right'], par: 6, bonus: 'stars',
        start: [F, L, F, L, F, F], answer: [F, R, F, L, F, F] }
    ] },
    middle: { label: '3~4학년 과정', missions: [
      { id: 'mid-1', title: '오르막엔 빠르게', guide: '오르막(⛰)은 빠르게 달려야 올라가요', goal: '속도 바꾸기',
        rails: line(6), from: [0, 0], dir: 'E', to: [5, 0], speedRules: true, climbs: [[3, 0], [4, 0]],
        blocks: ['fwd', 'fast'], par: 6, answer: [F, F, FAST, F, F, F] },
      { id: 'mid-2', title: '커브에선 천천히', guide: '빠른 채로 커브에 들어가면 위험해요!', goal: '가속과 브레이크',
        rails: TWO_CORNERS, from: [0, 1], dir: 'E', to: [4, 0], speedRules: true, speed: 'fast',
        blocks: ['fwd', 'left', 'right', 'fast', 'slow'], par: 9, bonus: 'fast',
        answer: [F, SLOW, F, L, F, R, FAST, F, F] },
      { id: 'mid-3', title: '반복 블록', guide: '블록 3개 안에! 반복 블록을 써 봐요', goal: '정해진 횟수 반복',
        rails: line(7), from: [0, 0], dir: 'E', to: [6, 0], blocks: ['fwd', 'repeat'], limit: 3, par: 2,
        answer: [rep(6, [F])] },
      { id: 'mid-4', title: '언덕 코스 완주', guide: '같은 언덕이 되풀이돼요. 반복으로 줄여요', goal: '반복으로 코스 완주',
        rails: hills(2), from: [0, 1], dir: 'E', to: [5, 1], stars: tops(2),
        blocks: ['fwd', 'left', 'right', 'repeat'], limit: 10, par: 10, bonus: 'stars',
        answer: [rep(2, HILL), F] }
    ] },
    high: { label: '5~6학년 과정', missions: [
      { id: 'high-1', title: '손님 태우기', guide: '손님(🙋)이 있는 칸에서 태우기를 해요', goal: '반복과 동작',
        rails: line(6), from: [0, 0], dir: 'E', to: [5, 0], guests: [[2, 0], [4, 0]],
        blocks: ['fwd', 'pick', 'repeat'], par: 5, bonus: 'guests',
        answer: [rep(2, [F, F, P]), F] },
      { id: 'high-2', title: '신호 보고 가기', guide: '신호가 빨강이면 기다렸다 가요', goal: '만약 / 아니면',
        rails: line(5), from: [0, 0], dir: 'E', to: [4, 0], signals: [[2, 0]], blocks: ['fwd', 'wait', 'if'], par: 7,
        answer: [F, ifg([F], [W, F]), F, F] },
      { id: 'high-3', title: '손님 있는 역만', guide: '손님 자리가 매번 바뀌어요! 손님이 있을 때만 태워요', goal: '반복 + 만약',
        rails: line(7), from: [0, 0], dir: 'E', to: [6, 0], guestRandom: true, guestCells: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]],
        ifCond: 'guest', blocks: ['fwd', 'pick', 'repeat', 'if'], limit: 8, par: 5, bonus: 'guests',
        answer: [rep(5, [F, ifg([P])]), F] },
      { id: 'high-4', title: '구불구불 신호길', guide: '구불구불 길에 신호까지! 블록 14개 안에 가요', goal: '반복과 조건 함께 쓰기',
        rails: hills(2), from: [0, 1], dir: 'E', to: [5, 1], signals: [[1, 0], [3, 0]],
        blocks: ['fwd', 'left', 'right', 'wait', 'repeat', 'if'], limit: 14, par: 13,
        answer: [rep(2, [F, L, ifg([F], [W, F]), R, F, R, F, L]), F] }
    ] }
  };
  return { common: COMMON, courses: COURSES, stampAfter: 3, starTickets: 5 };
})();
