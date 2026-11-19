/*
 * 코스터 명령 실행 로직 (화면과 분리된 순수 로직 — 브라우저와 node 검증에서 함께 사용)
 * 프로그램: [{ id, type, n, body, then, else }]
 *   type: 'fwd' 앞으로 | 'left' 'right' 돌기 | 'wait' 기다리기 | 'repeat' 반복 | 'if' 만약
 *         'fast' 빠르게(가속) | 'slow' 천천히(브레이크) | 'pick' 손님 태우기
 * makeRun() 은 명령을 하나씩 실행하는 생성기를 돌려줌. 화면은 이벤트마다 애니메이션을 기다렸다 다음을 꺼냄.
 *
 * 미션 장치(missions.js)
 *  rails: [열, 행, 조각]  조각은 h v ne se sw nw, 갈림길은 'h+nw' 처럼 + 로 합침
 *  stars: 레일 위 별 칸(지나가면 저절로 모음)
 *  speedRules: true 면 속도 규칙 — climbs(오르막 칸)에 들어갈 때는 빨라야 하고, 커브 칸에 들어갈 때는 느려야 함
 *  speed: 출발 속도 'slow'(기본) | 'fast'
 *  guests: 손님이 기다리는 칸(늘 같음) / guestCells + guestRandom: 실행할 때마다 일부 칸에만 손님
 *  ifCond: 만약 블록이 보는 것 'green'(앞 칸 신호가 초록, 기본) | 'guest'(지금 칸에 손님)
 *  par: 별 2개 기준 블록 수 / bonus: 별 3개 조건 'stars'|'guests'|'fast'
 */
window.MP_COASTER_LOGIC = (function () {
  var DIRS = ['E', 'S', 'W', 'N'];
  var DELTA = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
  var OPP = { E: 'W', W: 'E', N: 'S', S: 'N' };
  var CONN = { h: ['E', 'W'], v: ['N', 'S'], ne: ['N', 'E'], se: ['S', 'E'], sw: ['S', 'W'], nw: ['N', 'W'] };

  function key(c, r) { return c + ',' + r; }
  function turn(dir, side) { var i = DIRS.indexOf(dir); return DIRS[(i + (side === 'right' ? 1 : 3)) % 4]; }
  function parts(piece) { return String(piece).split('+'); }
  function opens(piece, dir) { return parts(piece).some(function (p) { return CONN[p].indexOf(dir) >= 0; }); }
  function isCurve(piece) { return parts(piece).every(function (p) { return p !== 'h' && p !== 'v'; }); }
  function cellSet(list) { var s = {}; (list || []).forEach(function (c) { s[key(c[0], c[1])] = true; }); return s; }

  function railMap(m) {
    var map = {};
    m.rails.forEach(function (t) { map[key(t[0], t[1])] = t[2]; });
    return map;
  }
  /* 지금 칸에서 dir 쪽으로 레일이 이어지는지 */
  function canMove(map, c, r, dir) {
    var here = map[key(c, r)];
    if (!here || !opens(here, dir)) return false;
    var d = DELTA[dir], next = map[key(c + d[0], r + d[1])];
    return !!next && opens(next, OPP[dir]);
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

  // ---------- 실행할 때마다 달라지는 것(세계): 신호 색, 손님 위치 ----------
  /* 신호 조합: signals 의 각 칸을 red/green 으로 (bits 의 i번째 비트가 1이면 빨강) */
  function signalState(m, bits) {
    var s = {};
    (m.signals || []).forEach(function (cell, i) { s[key(cell[0], cell[1])] = (bits >> i) & 1 ? 'red' : 'green'; });
    return s;
  }
  function guestState(m, bits) {
    if (!m.guestRandom) return cellSet(m.guests);
    var g = {};
    (m.guestCells || []).forEach(function (cell, i) { if ((bits >> i) & 1) g[key(cell[0], cell[1])] = true; });
    return g;
  }
  function randomBits(n) { return Math.floor(Math.random() * (1 << n)); }
  function randomSignals(m) { return signalState(m, randomBits((m.signals || []).length)); }
  function randomWorld(m) {
    var gn = m.guestRandom ? (m.guestCells || []).length : 0, gb = randomBits(gn);
    if (gn && !gb) gb = 1 << Math.floor(Math.random() * gn);   // 화면에서는 손님이 적어도 한 명
    return { signals: randomSignals(m), guests: guestState(m, gb) };
  }
  /* 가능한 모든 세계(검증용) */
  function allWorlds(m) {
    var sn = (m.signals || []).length, gn = m.guestRandom ? (m.guestCells || []).length : 0, out = [];
    for (var a = 0; a < (1 << sn); a++) for (var b = 0; b < (1 << gn); b++) out.push({ signals: signalState(m, a), guests: guestState(m, b), bits: [a, b] });
    return out;
  }

  /*
   * 실행 생성기. yield 하는 이벤트:
   *  { type: 'move', block, from, to, dir }          앞으로 한 칸
   *  { type: 'star', block, cell }                    별을 모음(앞으로 다음에)
   *  { type: 'turn', block, dir }                     돌기
   *  { type: 'speed', block, value }                  빠르게/천천히
   *  { type: 'pick', block, cell }                    손님 태움
   *  { type: 'wait', block, cell }                    기다리기(신호가 초록으로)
   *  { type: 'check', block, value }                  만약 — 확인 결과
   *  { type: 'repeat', block, round, total }          반복 몇 번째
   *  { type: 'success', block }                       도착(즉시 멈춤)
   *  { type: 'blocked', block, reason }               못 감: 'norail' | 'red' | 'nowait' | 'slow' | 'fast' | 'noguest'
   *  { type: 'end' }                                  명령을 다 했는데 도착 못 함
   * state 는 실행 중 계속 바뀌는 객체: { c, r, dir, speed, signals, guests, boarded, stars, executed }
   * world: { signals, guests } (예전처럼 신호 객체만 넘겨도 됨)
   */
  function makeRun(m, program, world) {
    var map = railMap(m), climbs = cellSet(m.climbs), starCells = cellSet(m.stars);
    if (world && !world.signals && !world.guests) world = { signals: world };
    world = world || {};
    var st = { c: m.from[0], r: m.from[1], dir: m.dir, speed: m.speed || 'slow',
      signals: Object.assign({}, world.signals || {}), guests: Object.assign({}, world.guests || cellSet(m.guests)),
      guestTotal: 0, boarded: 0, stars: {}, executed: {} };
    st.guestTotal = Object.keys(st.guests).length;
    function ahead() { var d = DELTA[st.dir]; return key(st.c + d[0], st.r + d[1]); }
    function here() { return key(st.c, st.r); }
    function* exec(list) {
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        st.executed[b.id] = true;
        if (b.type === 'fwd') {
          if (!canMove(map, st.c, st.r, st.dir)) { yield { type: 'blocked', block: b.id, reason: 'norail' }; return 'stop'; }
          var nk = ahead();
          if (st.signals[nk] === 'red') { yield { type: 'blocked', block: b.id, reason: 'red' }; return 'stop'; }
          if (m.speedRules) {
            if (climbs[nk] && st.speed !== 'fast') { yield { type: 'blocked', block: b.id, reason: 'slow' }; return 'stop'; }
            if (isCurve(map[nk]) && st.speed === 'fast') { yield { type: 'blocked', block: b.id, reason: 'fast' }; return 'stop'; }
          }
          var from = [st.c, st.r], d = DELTA[st.dir];
          st.c += d[0]; st.r += d[1];
          yield { type: 'move', block: b.id, from: from, to: [st.c, st.r], dir: st.dir };
          if (starCells[here()] && !st.stars[here()]) { st.stars[here()] = true; yield { type: 'star', block: b.id, cell: here() }; }
          if (st.c === m.to[0] && st.r === m.to[1]) { yield { type: 'success', block: b.id }; return 'done'; }
        } else if (b.type === 'left' || b.type === 'right') {
          st.dir = turn(st.dir, b.type);
          yield { type: 'turn', block: b.id, dir: st.dir };
        } else if (b.type === 'fast' || b.type === 'slow') {
          st.speed = b.type;
          yield { type: 'speed', block: b.id, value: st.speed };
        } else if (b.type === 'pick') {
          if (!st.guests[here()]) { yield { type: 'blocked', block: b.id, reason: 'noguest' }; return 'stop'; }
          delete st.guests[here()]; st.boarded++;
          yield { type: 'pick', block: b.id, cell: here() };
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
          var yes = m.ifCond === 'guest' ? !!st.guests[here()] : st.signals[ahead()] !== 'red';
          yield { type: 'check', block: b.id, value: yes };
          var r2 = yield* exec((yes ? b.then : b.else) || []);
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
  function runAll(m, program, world) {
    var run = makeRun(m, program, world), last = null, ev;
    while (!(ev = run.gen.next()).done) last = ev.value;
    return { result: last && last.type, reason: last && last.reason, state: run.state };
  }

  // ---------- 별 평가 ----------
  var BONUS_LABEL = { stars: '별 모두 모으기', guests: '손님 모두 태우기', fast: '마지막엔 빠르게 도착' };
  /* 목표 3개: 도착 / 블록 par개 이하 / 보너스. 보너스가 없는 미션은 세 번째 별도 블록 수로 받음 */
  function goals(m) {
    return [
      { id: 'arrive', label: '도착역에 도착' },
      { id: 'par', label: '블록 ' + m.par + '개 이하로' },
      { id: 'bonus', label: m.bonus ? BONUS_LABEL[m.bonus] : '블록 ' + m.par + '개 이하로 도착' }
    ];
  }
  function score(m, program, result, state) {
    var arrive = result === 'success';
    var par = arrive && countBlocks(program) <= m.par;
    var bonus = arrive && (
      m.bonus === 'stars' ? Object.keys(state.stars).length === (m.stars || []).length :
      m.bonus === 'guests' ? state.boarded === state.guestTotal :
      m.bonus === 'fast' ? state.speed === 'fast' : par);
    return { arrive: arrive, par: par, bonus: bonus, stars: (arrive ? 1 : 0) + (par ? 1 : 0) + (bonus ? 1 : 0) };
  }
  /* 모든 세계에서 결과(검증용): 성공 수와 가장 적은 별 수 */
  function solvesAll(m, program) {
    var ws = allWorlds(m), fails = [], minStars = 3;
    ws.forEach(function (w) {
      var r = runAll(m, program, w), sc = score(m, program, r.result, r.state);
      minStars = Math.min(minStars, sc.stars);
      if (r.result !== 'success') fails.push({ bits: w.bits, result: r.result, reason: r.reason });
    });
    return { ok: fails.length === 0, combos: ws.length, fails: fails, minStars: minStars };
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
    parts: parts, isCurve: isCurve, countBlocks: countBlocks, signalState: signalState, randomSignals: randomSignals, randomWorld: randomWorld,
    allWorlds: allWorlds, makeRun: makeRun, runAll: runAll, solvesAll: solvesAll, goals: goals, score: score };
})();
