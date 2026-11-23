/*
 * 짜릿 어드벤처 · 토토의 범퍼카 연구소 자동 검증
 * 실행: node tools/verify_thrill.js
 * - 자유 주행: 대각선 속도 정규화, 손을 떼면 감속해 멈춤, 벽을 뚫지 않고 살짝 튕김, 물체와 겹친 채 멈추지 않음
 * - 학년별 과학자 이야기: 카드 3장·퀴즈 3문제, 카드 자리에 차가 갈 수 있는지,
 *   카드를 몰아서 모으면 이야기 → 3장째 뒤 퀴즈, 틀리면 힌트와 같은 문제, 다 맞히면 완료, 처음 자리로 가도 모은 카드 유지
 */
'use strict';
global.MP_THRILL_PHYS = require('../js/thrill/physics.js');
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

console.log('[이야기·퀴즈 데이터]');
(function () {
  for (var g = 1; g <= 6; g++) {
    var d = M.GRADES[g], spots = M.SPOTS[g - 1];
    var good = d.cards.length === 3 && d.quiz.length === 3 && d.quiz.every(function (q) { return q.opts.length === 3 && q.hint >= 1 && q.hint <= 3 && new Set(q.opts).size === 3; });
    var reach = spots.every(function (p) { return !P.wallFix(p[0], p[1], P.CAR.r) && Math.hypot(p[0] - M.START.x, p[1] - M.START.y) > M.GRAB + 100; });
    ok(good && reach, g + '학년 ' + d.who + ': 카드 3장 · 퀴즈 3문제(보기 3개) · 카드 자리에 차가 갈 수 있고 출발 자리와 떨어져 있음');
  }
})();

console.log('[학년별 플레이]');
for (var g = 1; g <= 6; g++) (function (g) {
  var ms = M.create(g, null, 17), evs = [];
  run(ms, 1, [0, 0], evs);
  ok(!types(evs, 'story').length, g + '학년: 가만히 있으면 카드를 모으지 않음');
  var stories = [];
  ms.cards.forEach(function (c, i) {
    var e = [];
    run(ms, 8, driveTo(c.x, c.y, 10), e);
    stories = stories.concat(types(e, 'story'));
    if (i === 0) { ms.retry(); ok(ms.got() >= 1 && ms.world.car.x === M.START.x, g + '학년: 처음 자리로 가도 모은 카드는 그대로'); }
    if (ms.got() < 3) ok(!types(ms.storyDone(), 'ask').length, g + '학년: 카드 ' + ms.got() + '장 모았을 때는 아직 퀴즈 없음');
  });
  ok(stories.length === 3 && ms.got() === 3, g + '학년: 카드 3장에 차를 대면 이야기 3개 (' + stories.map(function (s) { return s.card.emoji; }).join(' ') + ')');
  var q = types(ms.storyDone(), 'ask')[0];
  ok(q && q.q.options.length === 3, g + '학년: 3장을 다 모으면 퀴즈');
  for (var k = 0; k < 3; k++) {
    var wrong = q.q.options.filter(function (o) { return o.id !== '0'; })[0];
    var w = ms.answer(q.q.id, wrong.id);
    var h = types(w, 'hint')[0], again = types(w, 'ask')[0];
    if (k === 0) ok(h && /번 카드/.test(h.text) && again && again.q.id === q.q.id && !ms.done, g + '학년: 틀리면 “어느 카드를 떠올려 볼지” 힌트와 같은 문제 — ' + h.text);
    var r = ms.answer(again.q.id, '0');
    q = types(r, 'ask')[0];
    if (k < 2) ok(q && q.q.id === 'q' + (k + 1), g + '학년: 퀴즈 ' + (k + 1) + ' 정답 → 다음 문제');
    else ok(ms.done && types(r, 'complete').length, g + '학년: 퀴즈 3문제를 다 맞히면 완료');
  }
})(g);

console.log('\n' + (n - fails) + ' / ' + n + ' 통과');
process.exit(fails ? 1 : 0);
