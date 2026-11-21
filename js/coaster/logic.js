/*
 * 코스터역 — 블록을 쌓아 선로 만들기: 실행 로직 (화면과 분리 — 브라우저와 node 검증(tools/verify_coaster.js)에서 함께 씀)
 *
 * 프로그램: [{ id, type, n?, cond?, body?, else? }]
 *   fwd    앞으로 n칸 — 바라보는 쪽으로 한 칸씩 가며 지나간 자리에 선로를 놓음
 *   left / right   그 자리에서 90° 돌기(선로는 다음 칸으로 갈 때 커브로 이어짐)
 *   repeat n번 반복(body) / until 역에 닿을 때까지 반복(body)
 *   if     만약 바로 앞이 cond(tulip|sunflower)라면(body)
 *   ifelse 만약 바로 앞이 cond라면(body) 아니면(else)
 *
 * 판(layout): { cols, rows, start: [c, r, dir], goal: [c, r] | null, loop: bool, target: [[c, r]...],
 *              pre: [[c, r]...] (처음부터 있는 선로, 마지막 칸이 거북이 자리), tulip: [[c, r]], sunflower: [[c, r]], hint: [[c, r]] }
 *   - 역(goal)으로 가는 판: 거북이가 역 칸에 들어가면 성공
 *   - 순환(loop) 판: 거북이는 역에서 출발. 목표 선로(target)를 모두 놓고 역으로 돌아와 한 바퀴를 이었을 때만 성공
 *   - 꽃 칸·잔디 끝·이미 선로가 있는 칸으로는 갈 수 없음(실패로 멈춤)
 */
window.MP_COASTER_LOGIC = (function () {
  var DIRS = ['E', 'S', 'W', 'N'];
  var DELTA = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
  var OPP = { E: 'W', W: 'E', N: 'S', S: 'N' };
  var MAX_STEPS = 300;   // 끝나지 않는 반복을 안전하게 멈추는 한도(블록 실행 횟수)
  var IDLE_ROUNDS = 4;   // '역에 닿을 때까지 반복'이 이만큼 돌아도 한 칸도 못 가면 멈춤

  function key(c, r) { return c + ',' + r; }
  function turn(dir, side) { var i = DIRS.indexOf(dir); return DIRS[(i + (side === 'right' ? 1 : 3)) % 4]; }
  function cellSet(list) { var s = {}; (list || []).forEach(function (c) { s[key(c[0], c[1])] = true; }); return s; }
  /* 한 칸에 이어진 방향들 → 레일 조각 이름(h v ne se sw nw), 한쪽만 이어졌으면 그 방향의 직선 */
  function pieceOf(conn) {
    var ds = DIRS.filter(function (d) { return conn && conn[d]; });
    if (!ds.length) return null;
    if (ds.length === 1) return ds[0] === 'E' || ds[0] === 'W' ? 'h' : 'v';
    var s = ds.join('');
    return { EW: 'h', NS: 'v', SN: 'v', ES: 'se', EN: 'ne', SW: 'sw', WN: 'nw' }[s] || (conn.E && conn.W ? 'h' : 'v');
  }

  /* 판의 처음 상태 */
  function initial(L) {
    var flowers = {};
    (L.tulip || []).forEach(function (c) { flowers[key(c[0], c[1])] = 'tulip'; });
    (L.sunflower || []).forEach(function (c) { flowers[key(c[0], c[1])] = 'sunflower'; });
    var track = {}, path = (L.pre || []).map(function (c) { return [c[0], c[1]]; });
    for (var i = 1; i < path.length; i++) link(track, path[i - 1], path[i]);
    if (!path.length) path.push([L.start[0], L.start[1]]);
    return { c: L.start[0], r: L.start[1], dir: L.start[2], flowers: flowers, track: track, path: path,
      target: cellSet(L.target), steps: 0 };
  }
  function dirBetween(a, b) {
    for (var i = 0; i < 4; i++) { var d = DELTA[DIRS[i]]; if (a[0] + d[0] === b[0] && a[1] + d[1] === b[1]) return DIRS[i]; }
    return null;
  }
  function link(track, a, b) {
    var d = dirBetween(a, b); if (!d) return;
    var ka = key(a[0], a[1]), kb = key(b[0], b[1]);
    (track[ka] = track[ka] || {})[d] = true;
    (track[kb] = track[kb] || {})[OPP[d]] = true;
  }
  function inside(L, c, r) { return c >= 0 && r >= 0 && c < L.cols && r < L.rows; }
  function ahead(st) { var d = DELTA[st.dir]; return [st.c + d[0], st.r + d[1]]; }
  function aheadIs(st, cond) { var a = ahead(st); return st.flowers[key(a[0], a[1])] === cond; }

  /*
   * 실행 생성기. 이벤트:
   *  { type: 'block', id }                    블록 하나를 시작(화면은 그 블록을 밝힘)
   *  { type: 'turn', id, dir }
   *  { type: 'move', id, from, to, dir }      한 칸 이동 + 선로 놓기(state.track 은 이미 바뀜)
   *  { type: 'check', id, value }             만약 — 확인 결과
   *  { type: 'round', id, n, total }          반복 몇 번째(until 은 total 없음)
   *  { type: 'success' }
   *  { type: 'fail', id, reason, at, dir, flower? }
   *     reason: 'empty' 블록 없음 | 'flower' 앞이 꽃 | 'edge' 잔디 끝 | 'track' 이미 선로 | 'off' 목표 선로 밖(순환 판)
   *             'short' 다 두르지 않고 역으로 | 'end' 명령이 끝남(역 못 감) | 'notback' 순환 판에서 역으로 못 돌아옴 | 'toolong' 반복이 끝나지 않음
   */
  function makeRun(L, program) {
    var st = initial(L), goal = L.goal ? key(L.goal[0], L.goal[1]) : null, home = key(L.start[0], L.start[1]);
    function fail(id, reason, extra) {
      var e = { type: 'fail', id: id, reason: reason, at: [st.c, st.r], dir: st.dir };
      for (var k in extra || {}) e[k] = extra[k];
      return e;
    }
    function targetDone() {
      for (var k in st.target) if (!st.track[k]) return false;
      return true;
    }
    function* step(id) {
      var a = ahead(st), ka = key(a[0], a[1]);
      if (!inside(L, a[0], a[1])) { yield fail(id, 'edge'); return 'stop'; }
      if (st.flowers[ka]) { yield fail(id, 'flower', { flower: st.flowers[ka] }); return 'stop'; }
      if (L.loop && !st.target[ka]) { yield fail(id, 'off'); return 'stop'; }
      var closing = L.loop && ka === home && st.path.length > 1;
      if (st.track[ka] && !closing) { yield fail(id, 'track'); return 'stop'; }
      if (closing) {
        // 역으로 돌아옴: 목표 선로를 다 놓았을 때만 고리를 이음
        var before = {}; for (var k in st.target) if (k !== home) before[k] = true;
        var missing = Object.keys(before).some(function (k) { return !st.track[k]; });
        if (missing) { yield fail(id, 'short'); return 'stop'; }
      }
      var from = [st.c, st.r];
      link(st.track, from, a);
      st.c = a[0]; st.r = a[1]; st.path.push([a[0], a[1]]);
      yield { type: 'move', id: id, from: from, to: [a[0], a[1]], dir: st.dir };
      if (closing && targetDone()) { yield { type: 'success' }; return 'done'; }
      if (goal && ka === goal) { yield { type: 'success' }; return 'done'; }
    }
    function* exec(list) {
      for (var i = 0; i < list.length; i++) {
        var b = list[i], res;
        if (++st.steps > MAX_STEPS) { yield fail(b.id, 'toolong'); return 'stop'; }
        yield { type: 'block', id: b.id };
        if (b.type === 'fwd') {
          for (var k = 0; k < (b.n || 1); k++) { res = yield* step(b.id); if (res) return res; }
        } else if (b.type === 'left' || b.type === 'right') {
          st.dir = turn(st.dir, b.type);
          yield { type: 'turn', id: b.id, dir: st.dir };
        } else if (b.type === 'repeat') {
          for (var n = 0; n < (b.n || 1); n++) {
            yield { type: 'round', id: b.id, n: n + 1, total: b.n || 1 };
            res = yield* exec(b.body || []); if (res) return res;
          }
        } else if (b.type === 'until') {
          // 반복 4번 동안 한 칸도 못 가면(방향만 돌거나 아무것도 안 함) 끝나지 않는 반복으로 보고 멈춤
          for (var m = 1, idle = 0; ; m++) {
            if (++st.steps > MAX_STEPS) { yield fail(b.id, 'toolong'); return 'stop'; }
            yield { type: 'round', id: b.id, n: m };
            var moved = st.path.length;
            res = yield* exec(b.body || []); if (res) return res;
            idle = st.path.length === moved ? idle + 1 : 0;
            if (idle >= IDLE_ROUNDS) { yield fail(b.id, 'toolong'); return 'stop'; }
          }
        } else if (b.type === 'if' || b.type === 'ifelse') {
          var yes = aheadIs(st, b.cond);
          yield { type: 'check', id: b.id, value: yes };
          res = yield* exec((yes ? b.body : b.type === 'ifelse' ? b.else : null) || []);
          if (res) return res;
        }
      }
    }
    function* top() {
      if (!program || !program.length) { yield fail(null, 'empty'); return; }
      var res = yield* exec(program);
      if (!res) yield fail(null, L.loop ? 'notback' : 'end');
    }
    return { state: st, gen: top() };
  }
  /* 끝까지 실행해 마지막 이벤트(성공/실패)를 돌려줌(검증용) */
  function runAll(L, program) {
    var run = makeRun(L, program), last = null, ev;
    while (!(ev = run.gen.next()).done) last = ev.value;
    return { result: last && last.type, reason: last && last.reason, state: run.state, last: last };
  }
  function countBlocks(list) {
    var n = 0;
    (list || []).forEach(function (b) { n += 1 + countBlocks(b.body) + countBlocks(b.else); });
    return n;
  }
  /* 블록에 고유 번호 붙인 복사본(미션 데이터의 정답을 실제 프로그램으로 쓸 때) */
  var seq = 0;
  function withIds(list) {
    return (list || []).map(function (b) {
      var o = { id: 'k' + (++seq), type: b.type };
      if (b.n != null) o.n = b.n;
      if (b.cond) o.cond = b.cond;
      if (b.body) o.body = withIds(b.body);
      if (b.else) o.else = withIds(b.else);
      return o;
    });
  }
  return { DIRS: DIRS, DELTA: DELTA, OPP: OPP, key: key, turn: turn, pieceOf: pieceOf, initial: initial,
    makeRun: makeRun, runAll: runAll, countBlocks: countBlocks, withIds: withIds, MAX_STEPS: MAX_STEPS };
})();
