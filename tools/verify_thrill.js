/*
 * 짜릿 어드벤처 · 토토의 범퍼카 연구소 자동 검증
 * 실행: node tools/verify_thrill.js
 * - 자유 주행: 대각선 속도 정규화, 손을 떼면 감속해 멈춤, 벽을 뚫지 않고 살짝 튕김, 물체와 겹친 채 멈추지 않음
 * - 학년별 인물(js/thrill/people.js): 인물마다 카드 3장·퀴즈 3문제, 카드 자리에 차가 갈 수 있는지, 안 만난 인물부터 고르기,
 *   카드를 몰아서 모으면 이야기 → 3장째 뒤 퀴즈, 틀리면 힌트와 같은 문제, 다 맞히면 완료, 처음 자리로 가도 모은 카드 유지
 */
'use strict';
global.MP_THRILL_PHYS = require('../js/thrill/physics.js');
global.MP_THRILL_PEOPLE = require('../js/thrill/people.js');
var P = global.MP_THRILL_PHYS;
var M = require('../js/thrill/missions.js');
var fails = 0, n = 0;
function ok(cond, msg) { n++; if (!cond) { fails++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); }
var DT = 1 / 60;
function run(ms, sec, input, evs) {
  for (var t = 0; t < sec; t += DT) {
    var i = typeof input === 'function' ? input(ms, t) : input;
    ms.step(i[0], i[1], DT).forEach(function (e) { if (evs) evs.push(e); });
  }
}
function driveTo(tx, ty, stop) {
  return function (ms) {
    var c = ms.world.car, dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
    if (d < (stop || 20)) return [0, 0];
    var a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
    return [Math.round(Math.cos(a)), Math.round(Math.sin(a))];
  };
}
function types(evs, t) { return evs.filter(function (e) { return e.type === t; }); }

console.log('[자유 주행]');
(function () {
  var f = M.create('free', 1), car = f.world.car;
  car.x = 800; car.y = 520;
  run(f, 0.6, [1, 1]);
  var v = Math.hypot(car.vx, car.vy);
  ok(Math.abs(v - P.CAR.vmax) < 2, '대각선 속도가 최고 속도와 같음(정규화): ' + v.toFixed(1));
  ok(P.dirIndex(car.ang) === 7, '↘ 입력이면 차 그림이 ↘ 칸(7)');
  f = M.create('free', 1); car = f.world.car; car.x = 500; car.y = 520;
  run(f, 1, [1, 0]);
  var x0 = car.x, stopT = 0;
  for (var t = 0; t < 3 && Math.hypot(car.vx, car.vy) > 0.01; t += DT) { f.step(0, 0, DT); stopT = t; }
  ok(car.x - x0 > 60 && car.x - x0 < 220, '손을 떼면 조금 굴러간 뒤 멈춤: ' + (car.x - x0).toFixed(0) + 'px, ' + stopT.toFixed(2) + '초');
  var worst = 0;
  [[0, -1], [1, 0], [1, -1], [-1, 1], [-1, -1]].forEach(function (d) {
    f = M.create('free', 1); car = f.world.car;
    for (var t = 0; t < 4; t += DT) { f.step(d[0], d[1], DT); if (P.wallFix(car.x, car.y, car.r - 0.5)) worst++; }
  });
  ok(worst === 0, '벽을 뚫거나 벽에 묻힌 프레임 없음');
  f = M.create('free', 1); car = f.world.car; car.x = 1300; car.y = 520;
  run(f, 0.7, [1, 0]); run(f, 0.12, [0, 0]);
  ok(car.vx < -20, '벽에 닿으면 살짝 튕김(되돌아오는 속도 ' + car.vx.toFixed(0) + ')');
  // 물체(원)를 벽으로 몰아붙여도 겹치지 않음
  var w = { car: P.makeCar(700, 520, 0), bodies: [P.makeBody('cart', 900, 520, 62, { fric: 400, mass: 1.5 })], boxes: [], t: 0 }, bad = 0;
  for (var t2 = 0; t2 < 6; t2 += DT) { P.stepWorld(w, 1, 0, DT); if (P.overlapping(w).length) bad++; }
  ok(bad === 0 && w.bodies[0].x > 1300, '물체를 벽으로 밀어붙여도 차·물체가 겹치거나 벽을 통과하지 않음');
})();

console.log('[인물 데이터]');
(function () {
  var names = [];
  for (var g = 1; g <= 6; g++) {
    var G = M.GRADES[g], spots = M.SPOTS[g - 1];
    var reach = spots.every(function (p) { return !P.wallFix(p[0], p[1], P.CAR.r) && Math.hypot(p[0] - M.START.x, p[1] - M.START.y) > M.GRAB + 100; });
    ok(G.people.length >= 2 && reach, g + '학년 인물 ' + G.people.length + '명(' + G.people.map(function (d) { return d.who; }).join(', ') + ') · 카드 자리에 차가 갈 수 있음');
    G.people.forEach(function (d) {
      names.push(d.who);
      var good = d.cards.length === 3 && d.quiz.length === 3 && d.quiz.every(function (q) { return q.opts.length === 3 && q.hint >= 1 && q.hint <= 3 && new Set(q.opts).size === 3; });
      if (!good) ok(false, g + '학년 ' + d.who + ': 카드 3장 · 퀴즈 3문제(보기 3개, 힌트 카드 1~3)');
    });
  }
  ok(new Set(names).size === names.length, '모든 인물이 카드 3장·퀴즈 3문제, 학년 사이 겹치는 인물 없음 (' + names.length + '명)');
  ['우장춘', '세종대왕'].forEach(function (x) { ok(names.indexOf(x) < 0, x + '은(는) 넣지 않음'); });
})();

console.log('[판마다 인물 고르기]');
(function () {
  var okAll = true;
  for (var g = 1; g <= 6; g++) {
    var n = M.GRADES[g].people.length, met = [], last = null;
    for (var k = 0; k < n; k++) { var w = M.pick(g, met, last, Math.random()); if (met.indexOf(w) >= 0) okAll = false; met.push(w); last = w; }
    for (var r = 0; r < 50; r++) { var w2 = M.pick(g, met, last, Math.random()); if (n > 1 && w2 === last) okAll = false; last = w2; }
  }
  ok(okAll, '아직 안 만난 인물부터 나오고, 다 만난 뒤에는 바로 전 판 인물이 다시 나오지 않음');
})();

console.log('[인물별 플레이]');
for (var g = 1; g <= 6; g++) M.GRADES[g].people.forEach(function (d, who) {
  var ms = M.create(g, null, 17 + who, who), evs = [], tag = g + '학년 ' + d.who;
  run(ms, 1, [0, 0], evs);
  var lazy = !types(evs, 'story').length, stories = [], early = false, retryOk = true;
  ms.cards.forEach(function (c, i) {
    var e = [];
    run(ms, 8, driveTo(c.x, c.y, 10), e);
    stories = stories.concat(types(e, 'story'));
    if (i === 0) { ms.retry(); retryOk = ms.got() >= 1 && ms.world.car.x === M.START.x; }
    if (ms.got() < 3 && types(ms.storyDone(), 'ask').length) early = true;
  });
  var q = types(ms.storyDone(), 'ask')[0], hintOk = true, flow = !!q;
  for (var k = 0; k < 3 && q; k++) {
    var wrong = q.q.options.filter(function (o) { return o.id !== '0'; })[0];
    var w = ms.answer(q.q.id, wrong.id), h = types(w, 'hint')[0], again = types(w, 'ask')[0];
    if (!(h && /번 카드/.test(h.text) && again && again.q.id === q.q.id && !ms.done)) hintOk = false;
    var r = ms.answer(again.q.id, '0');
    q = types(r, 'ask')[0];
    if (k < 2 && !(q && q.q.id === 'q' + (k + 1))) flow = false;
    if (k === 2 && !(ms.done && types(r, 'complete').length)) flow = false;
  }
  ok(lazy && retryOk && !early && stories.length === 3 && flow && hintOk && ms.def.who === d.who,
    tag + ': 카드 3장 → 이야기 3개 → 퀴즈(틀리면 힌트·같은 문제) → 3문제 정답이면 완료, 처음 자리로 가도 카드 유지');
});

console.log('\n' + (n - fails) + ' / ' + n + ' 통과');
process.exit(fails ? 1 : 0);
