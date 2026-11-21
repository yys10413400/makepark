/*
 * 코스터역 — 학년별 미션 (블록을 쌓아 거북이 역장이 선로를 놓게 하기)
 * 좌표 [열, 행], 방향 'E'(오른쪽) 'S'(아래) 'W'(왼쪽) 'N'(위). 판 형식은 js/coaster/logic.js 맨 위 설명 참고.
 * palette: 블록 상자에 나오는 블록(그대로 복사해 '내 코드'에 들어감)
 *   { type, n?, cond?, edit? }  edit: true 면 숫자를 눌러 바꿀 수 있음
 * layouts: 판(여러 개면 같은 코드로 모든 판을 차례로 성공해야 미션 성공 — 5학년 조건문)
 * answer: 대표 풀이(검증용, 화면에는 나오지 않음)
 * 보상: 미션을 처음 성공할 때 티켓 tickets 장(같은 미션은 다시 주지 않음)
 */
window.MP_COASTER_MISSIONS = (function () {
  var F = { type: 'fwd', n: 1 }, R = { type: 'right' }, L = { type: 'left' };
  function fwd(n, edit) { return { type: 'fwd', n: n, edit: !!edit }; }
  function rep(n, body, edit) { return { type: 'repeat', n: n, body: body || [], edit: !!edit }; }
  function until(body) { return { type: 'until', body: body || [] }; }
  function iff(cond, body) { return { type: 'if', cond: cond, body: body || [] }; }
  function ifelse(cond, body, els) { return { type: 'ifelse', cond: cond, body: body || [], else: els || [] }; }
  function rect(c0, r0, w, h) {   // 직사각형 테두리 칸
    var out = [];
    for (var c = c0; c < c0 + w; c++) { out.push([c, r0]); out.push([c, r0 + h - 1]); }
    for (var r = r0 + 1; r < r0 + h - 1; r++) { out.push([c0, r]); out.push([c0 + w - 1, r]); }
    return out;
  }
  function fill(c0, r0, w, h) { var out = []; for (var c = c0; c < c0 + w; c++) for (var r = r0; r < r0 + h; r++) out.push([c, r]); return out; }

  var LIST = [
    { id: 'g1', grade: 1, title: '역까지 마지막 두 칸',
      say: '역까지 선로를 이어 줘! 앞으로 가다가 오른쪽으로 돌아 봐.',
      palette: [F, R],
      layouts: [{ cols: 8, rows: 4, pre: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]], start: [4, 2, 'E'], goal: [5, 3],
        tulip: [[2, 3]], sunflower: [[7, 0]], hint: [[4, 2], [5, 2], [5, 3]] }],
      answer: [F, R, F] },
    { id: 'g2', grade: 2, title: '꽃밭 모퉁이',
      say: '앞에 튤립 꽃밭이 있어! 왼쪽과 오른쪽으로 꺾어서 역까지 가 보자.',
      palette: [F, L, R],
      layouts: [{ cols: 7, rows: 4, pre: [[0, 1], [1, 1]], start: [1, 1, 'E'], goal: [4, 2],
        tulip: [[3, 1], [4, 1], [3, 0]], sunflower: [[2, 3], [3, 3]] }],
      answer: [F, R, F, L, F, F] },
    { id: 'g3', grade: 3, title: '네모 꽃밭',
      say: '튤립 꽃밭 둘레에 네모 선로를 놓자. 역에서 출발해 한 바퀴 돌아와야 해!',
      palette: [F, fwd(3), L, R, rep(4)],
      layouts: [{ cols: 6, rows: 4, start: [1, 0, 'E'], goal: null, loop: true, target: rect(1, 0, 4, 4),
        tulip: fill(2, 1, 2, 2), sunflower: [[5, 3]] }],
      answer: [rep(4, [fwd(3), R])] },
    { id: 'g4', grade: 4, title: '길쭉한 꽃밭',
      say: '이번엔 길쭉한 꽃밭이야. 긴 변·짧은 변을 한 묶음으로 만들어 반복해 볼까?',
      palette: [fwd(1, true), L, R, rep(2, null, true)],
      layouts: [{ cols: 7, rows: 4, start: [1, 0, 'E'], goal: null, loop: true, target: rect(1, 0, 5, 3),
        tulip: fill(2, 1, 3, 1), sunflower: [[0, 3], [6, 3]] }],
      answer: [rep(2, [fwd(4), R, fwd(2), R])] },
    { id: 'g5', grade: 5, title: '꽃밭 앞에서',
      say: '바로 앞에 튤립이 있으면 돌고, 없으면 앞으로! 꽃과 역 자리가 바뀌어도 같은 코드로 가야 해.',
      palette: [F, L, R, until(), iff('tulip')],
      layouts: [
        { cols: 6, rows: 4, start: [0, 0, 'E'], goal: [3, 3], tulip: [[4, 0], [0, 3]], sunflower: [[5, 2]] },
        { cols: 6, rows: 4, start: [0, 0, 'E'], goal: [0, 2], tulip: [[2, 0], [1, 3]], sunflower: [[4, 2], [5, 3]] }
      ],
      answer: [until([iff('tulip', [R]), F])] },
    { id: 'g6', grade: 6, title: '두 꽃밭 사이로',
      say: '앞이 튤립이면 오른쪽, 해바라기면 왼쪽으로 돌고 앞으로! 두 꽃밭 사이로 역까지 가자.',
      palette: [F, L, R, until(), ifelse('tulip'), iff('sunflower'), iff('tulip')],
      layouts: [{ cols: 7, rows: 5, start: [0, 1, 'E'], goal: [5, 3],
        tulip: [[3, 1], [3, 0], [4, 0], [4, 1]], sunflower: [[2, 4], [1, 4], [3, 4]] }],
      answer: [until([ifelse('tulip', [R], [iff('sunflower', [L])]), F])] }
  ];
  function byGrade(g) { return LIST.filter(function (m) { return m.grade === g; })[0] || LIST[0]; }
  return { list: LIST, byGrade: byGrade, tickets: 3 };
})();
