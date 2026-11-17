/*
 * 코스터 명령 실행 로직 (화면과 분리된 순수 로직 — 브라우저와 node 검증에서 함께 사용)
 * 프로그램: [{ id, type: 'fwd'|'left'|'right'|'wait'|'repeat'|'if', n, body, then, else }]
 * makeRun() 은 명령을 하나씩 실행하는 생성기를 돌려줌. 화면은 이벤트마다 애니메이션을 기다렸다 다음을 꺼냄.
 */
window.MP_COASTER_LOGIC = (function () {
  var DIRS = ['E', 'S', 'W', 'N'];
  var DELTA = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
  var OPP = { E: 'W', W: 'E', N: 'S', S: 'N' };
  var CONN = { h: ['E', 'W'], v: ['N', 'S'], ne: ['N', 'E'], se: ['S', 'E'], sw: ['S', 'W'], nw: ['N', 'W'] };

  function key(c, r) { return c + ',' + r; }
  function turn(dir, side) { var i = DIRS.indexOf(dir); return DIRS[(i + (side === 'right' ? 1 : 3)) % 4]; }

  function railMap(m) {
    var map = {};
    m.rails.forEach(function (t) { map[key(t[0], t[1])] = t[2]; });
    return map;
  }
  /* 지금 칸에서 dir 쪽으로 레일이 이어지는지 */
  function canMove(map, c, r, dir) {
    var here = map[key(c, r)];
    if (!here || CONN[here].indexOf(dir) < 0) return false;
    var d = DELTA[dir], next = map[key(c + d[0], r + d[1])];
    return !!next && CONN[next].indexOf(OPP[dir]) >= 0;
  }
  /* 레일을 따라 도착까지 남은 칸 수(방향 무시) */
  function distance(m, c, r) {
    var map = railMap(m), goal = key(m.to[0], m.to[1]), seen = {}, q = [[c, r, 0]];
    seen[key(c, r)] = true;
    while (q.length) {
      var cur = q.shift();
      if (key(cur[0], cur[1]) === goal) return cur[2];
      for (var i = 0; i < 4; i++) {
        var d = DIRS[i];
        if (!canMove(map, cur[0], cur[1], d)) continue;
        var nc = cur[0] + DELTA[d][0], nr = cur[1] + DELTA[d][1];
        if (!seen[key(nc, nr)]) { seen[key(nc, nr)] = true; q.push([nc, nr, cur[2] + 1]); }
      }
    }
    return -1;
  }
  function countBlocks(list) {
    var n = 0;
    (list || []).forEach(function (b) { n += 1 + countBlocks(b.body) + countBlocks(b.then) + countBlocks(b.else); });
    return n;
  }
  /* 신호 조합: signals 의 각 칸을 red/green 으로 (bits 의 i번째 비트가 1이면 빨강) */
  function signalState(m, bits) {
    var s = {};
    (m.signals || []).forEach(function (cell, i) { s[key(cell[0], cell[1])] = (bits >> i) & 1 ? 'red' : 'green'; });
    return s;
  }
  function randomSignals(m) { return signalState(m, Math.floor(Math.random() * (1 << (m.signals || []).length))); }

  /*
   * 실행 생성기. yield 하는 이벤트:
   *  { type: 'move', block, from, to, dir }          앞으로 한 칸
   *  { type: 'turn', block, dir }                     돌기
   *  { type: 'wait', block, cell }                    기다리기(신호가 초록으로)
   *  { type: 'check', block, value }                  만약 — 신호 확인(true=초록)
   *  { type: 'repeat', block, round, total }          반복 몇 번째
   *  { type: 'success', block }                       도착(즉시 멈춤)
   *  { type: 'blocked', block, reason }               못 감: 'norail' | 'red' | 'nowait'
   *  { type: 'end' }                                  명령을 다 했는데 도착 못 함
   * state 는 실행 중 계속 바뀌는 객체: { c, r, dir, signals, executed }
   */
  function makeRun(m, program, signals) {
    var map = railMap(m);
    var st = { c: m.from[0], r: m.from[1], dir: m.dir, signals: Object.assign({}, signals || {}), executed: {} };
    function ahead() { var d = DELTA[st.dir]; return key(st.c + d[0], st.r + d[1]); }
    function* exec(list) {
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        st.executed[b.id] = true;
        if (b.type === 'fwd') {
          if (!canMove(map, st.c, st.r, st.dir)) { yield { type: 'blocked', block: b.id, reason: 'norail' }; return 'stop'; }
          if (st.signals[ahead()] === 'red') { yield { type: 'blocked', block: b.id, reason: 'red' }; return 'stop'; }
          var from = [st.c, st.r], d = DELTA[st.dir];
          st.c += d[0]; st.r += d[1];
          yield { type: 'move', block: b.id, from: from, to: [st.c, st.r], dir: st.dir };
          if (st.c === m.to[0] && st.r === m.to[1]) { yield { type: 'success', block: b.id }; return 'done'; }
        } else if (b.type === 'left' || b.type === 'right') {
          st.dir = turn(st.dir, b.type);
          yield { type: 'turn', block: b.id, dir: st.dir };
        } else if (b.type === 'wait') {
          var a = ahead();
          if (st.signals[a] !== 'red') { yield { type: 'blocked', block: b.id, reason: 'nowait' }; return 'stop'; }
          st.signals[a] = 'green';
          yield { type: 'wait', block: b.id, cell: a };
        } else if (b.type === 'repeat') {
          for (var k = 0; k < b.n; k++) {
            yield { type: 'repeat', block: b.id, round: k + 1, total: b.n };
            var r1 = yield* exec(b.body || []);
            if (r1) return r1;
          }
        } else if (b.type === 'if') {
          var green = st.signals[ahead()] !== 'red';
          yield { type: 'check', block: b.id, value: green };
          var r2 = yield* exec((green ? b.then : b.else) || []);
          if (r2) return r2;
        }
      }
    }
    function* top() {
      var res = yield* exec(program || []);
      if (!res) yield { type: 'end' };
    }
    return { state: st, gen: top() };
  }
  /* 끝까지 실행해 결과만 돌려줌(검증용) */
  function runAll(m, program, signals) {
    var run = makeRun(m, program, signals), last = null, ev;
    while (!(ev = run.gen.next()).done) last = ev.value;
    return { result: last && last.type, reason: last && last.reason, state: run.state };
  }
  /* 모든 신호 조합에서 성공하는지 */
  function solvesAll(m, program) {
    var n = 1 << (m.signals || []).length, fails = [];
    for (var bits = 0; bits < n; bits++) {
      var r = runAll(m, program, signalState(m, bits));
      if (r.result !== 'success') fails.push({ bits: bits, result: r.result, reason: r.reason });
    }
    return { ok: fails.length === 0, combos: n, fails: fails };
  }
  /* 블록에 고유 번호 붙인 복사본(미션 데이터의 정답·처음 목록을 실제 프로그램으로 쓸 때) */
  var seq = 0;
  function withIds(list) {
    return (list || []).map(function (b) {
      var o = { id: 'b' + (++seq), type: b.type };
      if (b.type === 'repeat') { o.n = b.n || 2; o.body = withIds(b.body); }
      if (b.type === 'if') { o.then = withIds(b.then); o.else = withIds(b.else); }
      return o;
    });
  }
  return { DIRS: DIRS, DELTA: DELTA, CONN: CONN, turn: turn, withIds: withIds, canMove: canMove, railMap: railMap, distance: distance,
    countBlocks: countBlocks, signalState: signalState, randomSignals: randomSignals, makeRun: makeRun, runAll: runAll, solvesAll: solvesAll };
})();
