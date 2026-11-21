/*
 * 코스터역 — 학년별 무작위 판 만들기 ('새 꽃밭')
 * 학년마다 배울 개념이 꼭 필요한 '틀'은 고정하고 숫자·위치·방향만 무작위로 바꾼 뒤,
 * js/coaster/logic.js 로 직접 풀어 보고 검사를 통과한 판만 냄. 몇 번 해도 안 되면 고정 미션(missions.js)을 냄.
 *  1학년 앞으로 → 돌기 → 앞으로          (거북이 위치·방향, 도는 쪽, 칸 수)
 *  2학년 왼쪽·오른쪽 한 번씩 꺾기         (꺾는 순서, 구간 길이, 곧장 가는 길을 막는 꽃밭)
 *  3학년 반복 안에 '앞으로 N칸 + 돌기'    (한 변 2~4칸, 출발 방향, 시계/반시계)
 *  4학년 긴 변·짧은 변 묶음 2번 반복      (가로·세로 길이, 출발 방향, 도는 쪽)
 *  5학년 역까지 반복 + 앞이 튤립이면 돌기 (길 모양·꺾는 횟수, 판 두 개를 매번 새로)
 *  6학년 튤립이면 오른쪽·해바라기면 왼쪽  (두 꽃을 만나는 순서·횟수)
 * 검사: 대표 풀이는 성공 / 개념 없이 쓴 풀이는 실패(2학년 직진, 5학년 다른 판의 순서 풀이, 6학년 튤립만 보는 풀이)
 * make(grade, seed?) → 미션 객체(missions.js 와 같은 모양, random: true, sig: 판 모양 문자열)
 */
window.MP_COASTER_GEN = (function () {
  var LG = window.MP_COASTER_LOGIC, MS = window.MP_COASTER_MISSIONS;
  var D = LG.DELTA, K = LG.key, OPP = LG.OPP;
  var MAX_COLS = 8, MAX_ROWS = 5;

  function rng(seed) {   // 같은 seed 면 같은 판(선생님이 판 번호로 나눠 줄 때 쓸 수 있음)
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function tools(R) {
    return { int: function (a, b) { return a + Math.floor(R() * (b - a + 1)); },
      pick: function (l) { return l[Math.floor(R() * l.length)]; } };
  }
  var F = { type: 'fwd', n: 1 }, RT = { type: 'right' }, LT = { type: 'left' };
  function fwd(n, edit) { return { type: 'fwd', n: n, edit: !!edit }; }
  function rep(n, body, edit) { return { type: 'repeat', n: n, body: body || [], edit: !!edit }; }
  function until(body) { return { type: 'until', body: body || [] }; }
  function iff(cond, body) { return { type: 'if', cond: cond, body: body || [] }; }
  function ifelse(cond, body, els) { return { type: 'ifelse', cond: cond, body: body || [], else: els || [] }; }
  function turnBlock(s) { return s === 'R' ? RT : LT; }
  function times(n, x) { var o = []; for (var i = 0; i < n; i++) o.push(x); return o; }

  /* 상대 좌표 (0,0)에서 dir 을 보고 acts(F/L/R)대로 걸어 봄. 이미 지난 칸으로 가면(겹침) null.
     turns: 도는 곳마다 { at, ahead(돌기 전 바로 앞 칸), side } */
  function trace(dir, acts, loop) {
    var c = 0, r = 0, cells = [[0, 0]], seen = {}, turns = [];
    seen[K(0, 0)] = true;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a === 'F') {
        c += D[dir][0]; r += D[dir][1];
        var last = i === acts.length - 1 || acts.slice(i + 1).every(function (x) { return x !== 'F'; });
        if (seen[K(c, r)]) { if (loop && last && c === 0 && r === 0) continue; return null; }
        seen[K(c, r)] = true; cells.push([c, r]);
      } else {
        turns.push({ at: [c, r], ahead: [c + D[dir][0], r + D[dir][1]], side: a });
        dir = LG.turn(dir, a === 'R' ? 'right' : 'left');
      }
    }
    return { cells: cells, turns: turns, endDir: dir, seen: seen };
  }
  /* 쓰는 칸들을 감싸는 격자 크기·위치를 정하고 옮김. 너무 크면 null */
  function fit(T, used) {
    var minc = 1e9, minr = 1e9, maxc = -1e9, maxr = -1e9;
    used.forEach(function (p) { minc = Math.min(minc, p[0]); maxc = Math.max(maxc, p[0]); minr = Math.min(minr, p[1]); maxr = Math.max(maxr, p[1]); });
    var w = maxc - minc + 1, h = maxr - minr + 1;
    if (w > MAX_COLS || h > MAX_ROWS) return null;
    var cols = Math.min(MAX_COLS, Math.max(6, w + T.int(0, 2))), rows = Math.min(MAX_ROWS, Math.max(4, h + T.int(0, 1)));
    var oc = T.int(0, cols - w) - minc, or = T.int(0, rows - h) - minr;
    return { cols: cols, rows: rows, mv: function (p) { return [p[0] + oc, p[1] + or]; } };
  }
  /* 장식 꽃: 길·역·다른 꽃이 없는 빈 칸에 n개 */
  function decorate(T, L, n, avoid) {
    var taken = {};
    avoid.forEach(function (p) { taken[K(p[0], p[1])] = true; });
    (L.tulip || []).concat(L.sunflower || []).forEach(function (p) { taken[K(p[0], p[1])] = true; });
    var free = [];
    for (var c = 0; c < L.cols; c++) for (var r = 0; r < L.rows; r++) if (!taken[K(c, r)]) free.push([c, r]);
    for (var i = 0; i < n && free.length; i++) {
      var p = free.splice(T.int(0, free.length - 1), 1)[0];
      var kind = T.pick(['tulip', 'sunflower']);
      (L[kind] = L[kind] || []).push(p);
    }
  }
  function dirs(T) { return T.pick(['E', 'S', 'W', 'N']); }

  /* 역으로 가는 판(1·2·5·6학년): acts 대로 간 끝이 역. pre: 거북이 뒤로 이미 놓인 선로 칸 수 */
  function goalLayout(T, dir, acts, opts) {
    var tr = trace(dir, acts, false); if (!tr) return null;
    var pre = [];
    for (var i = opts.pre || 0; i >= 1; i--) pre.push([-D[dir][0] * i, -D[dir][1] * i]);
    var flowers = (opts.flowers || []).map(function (f) { return { p: f.p, kind: f.kind }; });
    for (var j = 0; j < flowers.length; j++) if (tr.seen[K(flowers[j].p[0], flowers[j].p[1])]) return null;
    var used = tr.cells.concat(pre, flowers.map(function (f) { return f.p; }));
    var g = fit(T, used); if (!g) return null;
    var L = { cols: g.cols, rows: g.rows, start: g.mv([0, 0]).concat([dir]), goal: g.mv(tr.cells[tr.cells.length - 1]) };
    if (pre.length) L.pre = pre.map(g.mv).concat([g.mv([0, 0])]);
    flowers.forEach(function (f) { (L[f.kind] = L[f.kind] || []).push(g.mv(f.p)); });
    decorate(T, L, T.int(opts.decoMin || 1, opts.decoMax || 3), tr.cells.map(g.mv).concat(L.pre || []));
    return L;
  }
  /* 한 바퀴 판(3·4학년): 출발역에서 acts 대로 돌아 다시 역으로. 안쪽은 튤립 꽃밭 */
  function loopLayout(T, dir, acts) {
    var tr = trace(dir, acts, true); if (!tr) return null;
    var minc = 1e9, minr = 1e9, maxc = -1e9, maxr = -1e9;
    tr.cells.forEach(function (p) { minc = Math.min(minc, p[0]); maxc = Math.max(maxc, p[0]); minr = Math.min(minr, p[1]); maxr = Math.max(maxr, p[1]); });
    var inside = [];
    for (var c = minc + 1; c < maxc; c++) for (var r = minr + 1; r < maxr; r++) inside.push([c, r]);
    var g = fit(T, tr.cells); if (!g) return null;
    var L = { cols: g.cols, rows: g.rows, start: g.mv([0, 0]).concat([dir]), goal: null, loop: true,
      target: tr.cells.map(g.mv), tulip: inside.map(g.mv) };
    decorate(T, L, T.int(0, 2), tr.cells.map(g.mv));
    return L;
  }
  function seqActs(list) {   // 'F'·'L'·'R' 목록 → 블록 목록
    return list.map(function (a) { return a === 'F' ? F : turnBlock(a); });
  }

  var MAKERS = {
    1: function (T) {
      var side = T.pick(['L', 'R']), a = T.int(1, 2), b = T.int(1, 2), dir = dirs(T);
      var acts = times(a, 'F').concat([side], times(b, 'F'));
      var L = goalLayout(T, dir, acts, { pre: T.int(1, 3) });
      return L && { title: '역까지 선로 잇기', say: '역까지 선로를 이어 줘! 거북이가 바라보는 쪽을 잘 보고, 어느 쪽으로 돌지 생각해 봐.',
        palette: [F, LT, RT], layouts: [L], answer: seqActs(acts) };
    },
    2: function (T) {
      var t1 = T.pick(['L', 'R']), t2 = t1 === 'L' ? 'R' : 'L', s0 = T.int(1, 2), s1 = T.int(1, 2), s2 = T.int(1, 2), dir = dirs(T);
      var acts = times(s0, 'F').concat([t1], times(s1, 'F'), [t2], times(s2, 'F'));
      var tr = trace(dir, acts, false); if (!tr) return null;
      // 곧장 가는 길을 막는 튤립 꽃밭(첫 모퉁이 앞), 가끔 두 번째 모퉁이 앞에도 해바라기
      var fl = [{ p: tr.turns[0].ahead, kind: 'tulip' }];
      if (T.int(0, 1)) fl.push({ p: tr.turns[1].ahead, kind: 'sunflower' });
      var L = goalLayout(T, dir, acts, { pre: T.int(1, 2), flowers: fl, decoMin: 0, decoMax: 2 });
      return L && { title: '꽃밭 모퉁이', say: '꽃밭이 길을 막고 있어! 왼쪽과 오른쪽으로 꺾어서 역까지 가 보자.',
        palette: [F, LT, RT], layouts: [L], answer: seqActs(acts),
        wrong: [seqActs(times(s0 + s1 + s2, 'F'))] };
    },
    3: function (T) {
      var n = T.int(2, 4), side = T.pick(['R', 'L']), dir = dirs(T), acts = [];
      for (var i = 0; i < 4; i++) acts = acts.concat(times(n, 'F'), [side]);
      var L = loopLayout(T, dir, acts);
      return L && { title: '네모 꽃밭', say: '튤립 꽃밭 둘레에 네모 선로를 놓자. 한 변이 몇 칸인지 세어 보고, 역으로 한 바퀴 돌아와!',
        palette: [F, fwd(n), LT, RT, rep(4)], layouts: [L], answer: [rep(4, [fwd(n), turnBlock(side)])] };
    },
    4: function (T) {
      var lo = T.int(3, 5), sh = T.int(1, 2), side = T.pick(['R', 'L']), dir = dirs(T), acts = [];
      for (var i = 0; i < 2; i++) acts = acts.concat(times(lo, 'F'), [side], times(sh, 'F'), [side]);
      var L = loopLayout(T, dir, acts);
      return L && { title: '길쭉한 꽃밭', say: '길쭉한 꽃밭이야. 긴 변·짧은 변이 몇 칸인지 세어 한 묶음으로 만들고 반복해 볼까?',
        palette: [fwd(1, true), LT, RT, rep(2, null, true)], layouts: [L],
        answer: [rep(2, [fwd(lo), turnBlock(side), fwd(sh), turnBlock(side)])] };
    },
    5: function (T) {
      function one() {
        var m = T.int(1, 2), dir = dirs(T), acts = times(T.int(1, 3), 'F');
        for (var i = 0; i < m; i++) acts = acts.concat(['R'], times(T.int(1, 3), 'F'));
        var tr = trace(dir, acts, false); if (!tr) return null;
        var L = goalLayout(T, dir, acts, { flowers: tr.turns.map(function (t) { return { p: t.ahead, kind: 'tulip' }; }), decoMin: 1, decoMax: 2 });
        return L && { L: L, acts: acts };
      }
      var A = one(), B = one();
      if (!A || !B) return null;
      return { title: '꽃밭 앞에서', say: '바로 앞에 튤립이 있으면 돌고, 없으면 앞으로! 꽃밭 두 개를 같은 코드로 가야 해.',
        palette: [F, LT, RT, until(), iff('tulip')], layouts: [A.L, B.L],
        answer: [until([iff('tulip', [RT]), F])],
        wrongOn: [[seqActs(A.acts), 1], [seqActs(B.acts), 0]] };
    },
    6: function (T) {
      var m = T.int(2, 3), sides = ['R', 'L'];
      while (sides.length < m) sides.push(T.pick(['R', 'L']));
      for (var i = sides.length - 1; i > 0; i--) { var j = T.int(0, i), t = sides[i]; sides[i] = sides[j]; sides[j] = t; }
      var dir = dirs(T), acts = times(T.int(1, 2), 'F');
      sides.forEach(function (s) { acts = acts.concat([s], times(T.int(1, 2), 'F')); });
      var tr = trace(dir, acts, false); if (!tr) return null;
      var L = goalLayout(T, dir, acts, { flowers: tr.turns.map(function (t) { return { p: t.ahead, kind: t.side === 'R' ? 'tulip' : 'sunflower' }; }), decoMin: 1, decoMax: 2 });
      return L && { title: '두 꽃밭 사이로', say: '앞이 튤립이면 오른쪽, 해바라기면 왼쪽으로 돌고 앞으로! 역까지 가 보자.',
        palette: [F, LT, RT, until(), ifelse('tulip'), iff('sunflower'), iff('tulip')], layouts: [L],
        answer: [until([ifelse('tulip', [RT], [iff('sunflower', [LT])]), F])],
        wrong: [[until([iff('tulip', [RT]), F])]] };   // 튤립만 보는 풀이는 해바라기 앞에서 막혀야 함
    }
  };

  function ok(L, prog) { return LG.runAll(L, LG.withIds(prog)).result === 'success'; }
  function check(m) {
    if (!m) return false;
    for (var i = 0; i < m.layouts.length; i++) {
      var L = m.layouts[i];
      if (L.goal && ((L.tulip || []).concat(L.sunflower || [])).some(function (p) { return p[0] === L.goal[0] && p[1] === L.goal[1]; })) return false;
      if (!ok(L, m.answer)) return false;
      if ((m.wrong || []).some(function (w) { return ok(L, w); })) return false;   // 개념 없이도 풀리면 안 됨
    }
    if ((m.wrongOn || []).some(function (w) { return ok(m.layouts[w[1]], w[0]); })) return false;
    return true;
  }
  function sigOf(m) { return JSON.stringify(m.layouts); }
  /* avoid: 바로 전에 나온 판 모양(sig) — 같은 판이 연달아 나오지 않게 */
  function make(grade, seed, avoid) {
    var R = rng(seed == null ? Math.floor(Math.random() * 4294967296) : seed), T = tools(R);
    for (var tries = 0; tries < 120; tries++) {
      var m = MAKERS[grade](T);
      if (!check(m)) continue;
      var sig = sigOf(m);
      if (avoid && sig === avoid) continue;
      m.id = 'g' + grade + '-r'; m.grade = grade; m.random = true; m.sig = sig;
      return m;
    }
    return MS.byGrade(grade);   // 못 만들면 고정 미션
  }
  return { make: make, check: check };
})();
