/*
 * 코스터 익스프레스 미션 데이터 (설계: docs/coaster-missions.md)
 * 좌표 [열, 행], 방향 'E','S','W','N'. 레일 조각: h, v, ne, se, sw, nw
 * blocks: 이 미션에서 공개하는 명령 블록 / limit: 블록 수 제한(없으면 제한 없음)
 * start: 처음 목록(틀린 명령 고치기 미션만). 보통은 비워 둠.
 */
window.MP_COASTER_MISSIONS = (function () {
  function line(n, row) { var r = []; for (var c = 0; c < n; c++) r.push([c, row || 0, 'h']); return r; }
  var COMMON = [
    { id: 'common-1', title: '첫 출발', guide: '앞으로 세 칸 이동해요', goal: '명령을 순서대로 실행해요',
      rails: line(4), from: [0, 0], dir: 'E', to: [3, 0], blocks: ['fwd'], reward: 10,
      answer: [{ type: 'fwd' }, { type: 'fwd' }, { type: 'fwd' }] }
  ];
  var TWO_CORNERS = [[0, 1, 'h'], [1, 1, 'h'], [2, 1, 'nw'], [2, 0, 'se'], [3, 0, 'h'], [4, 0, 'h']];
  var F = { type: 'fwd' }, L = { type: 'left' }, R = { type: 'right' }, W = { type: 'wait' };
  function rep(n, body) { return { type: 'repeat', n: n, body: body }; }
  function ifg(then, els) { return { type: 'if', then: then, else: els }; }
  // 언덕 코스: 두 줄 안에서 위로 올라갔다 내려오는 모양이 n번 (가로로 길어서 칸이 크게 보임)
  function hills(n) {
    var r = [[0, 1, 'h']];
    for (var k = 0; k < n; k++) { var c = 1 + 2 * k; r.push([c, 1, 'nw'], [c, 0, 'se'], [c + 1, 0, 'sw'], [c + 1, 1, 'ne']); }
    r.push([2 * n + 1, 1, 'h']); return r;
  }
  var HILL = [F, L, F, R, F, R, F, L];
  var COURSES = {
    low: { label: '1~2학년 과정', missions: [
      { id: 'low-1', title: '다섯 칸 달리기', guide: '도착역까지 앞으로 네 칸 가요', goal: '순차 이동 복습',
        rails: line(5), from: [0, 0], dir: 'E', to: [4, 0], blocks: ['fwd'], reward: 10, answer: [F, F, F, F] },
      { id: 'low-2', title: '모퉁이 두 번', guide: '모퉁이에서는 방향을 바꿔야 해요', goal: '왼쪽·오른쪽 돌기',
        rails: TWO_CORNERS, from: [0, 1], dir: 'E', to: [4, 0], blocks: ['fwd', 'left', 'right'], reward: 10,
        answer: [F, F, L, F, R, F, F] },
      { id: 'low-3', title: '틀린 명령 고치기', guide: '명령 하나가 틀렸어요. 찾아서 고쳐요', goal: '잘못된 명령 수정',
        rails: [[0, 0, 'h'], [1, 0, 'sw'], [1, 1, 'ne'], [2, 1, 'h'], [3, 1, 'h']], from: [0, 0], dir: 'E', to: [3, 1],
        blocks: ['fwd', 'left', 'right'], reward: 10,
        start: [F, L, F, L, F, F], answer: [F, R, F, L, F, F] }
    ] },
    middle: { label: '3~4학년 과정', missions: [
      { id: 'mid-1', title: '이동·회전 복습', guide: '앞으로와 돌기로 도착역까지 가요', goal: '이동·회전 복습',
        rails: TWO_CORNERS, from: [0, 1], dir: 'E', to: [4, 0], blocks: ['fwd', 'left', 'right'], reward: 10,
        answer: [F, F, L, F, R, F, F] },
      { id: 'mid-2', title: '반복 블록', guide: '블록 3개 안에! 반복 블록을 써 봐요', goal: '정해진 횟수 반복',
        rails: line(7), from: [0, 0], dir: 'E', to: [6, 0], blocks: ['fwd', 'repeat'], limit: 3, reward: 10,
        answer: [rep(6, [F])] },
      { id: 'mid-3', title: '언덕 코스 완주', guide: '같은 언덕이 되풀이돼요. 블록 10개 안에 가요', goal: '반복으로 코스 완주',
        rails: hills(2), from: [0, 1], dir: 'E', to: [5, 1],
        blocks: ['fwd', 'left', 'right', 'repeat'], limit: 10, reward: 10,
        answer: [rep(2, HILL), F] }
    ] },
    high: { label: '5~6학년 과정', missions: [
      { id: 'high-1', title: '반복 복습', guide: '언덕이 세 번! 블록 10개 안에 가요', goal: '반복 복습',
        rails: hills(3), from: [0, 1], dir: 'E', to: [7, 1], blocks: ['fwd', 'left', 'right', 'repeat'], limit: 10, reward: 10,
        answer: [rep(3, HILL), F] },
      { id: 'high-2', title: '신호 보고 가기', guide: '신호가 빨강이면 기다렸다 가요', goal: '만약 / 아니면',
        rails: line(5), from: [0, 0], dir: 'E', to: [4, 0], signals: [[2, 0]], blocks: ['fwd', 'wait', 'if'], reward: 10,
        answer: [F, ifg([F], [W, F]), F, F] },
      { id: 'high-3', title: '구불구불 신호길', guide: '구불구불 길에 신호까지! 블록 14개 안에 가요', goal: '반복과 조건 함께 쓰기',
        rails: hills(2), from: [0, 1], dir: 'E', to: [5, 1], signals: [[1, 0], [3, 0]],
        blocks: ['fwd', 'left', 'right', 'wait', 'repeat', 'if'], limit: 14, reward: 10,
        answer: [rep(2, [F, L, ifg([F], [W, F]), R, F, R, F, L]), F] }
    ] }
  };
  return { common: COMMON, courses: COURSES, stampAfter: 3 };
})();
