/*
 * 짜릿 어드벤처 · 토토의 범퍼카 연구소 자동 검증
 * 실행: node tools/verify_thrill.js
 * - 자유 주행: 대각선 속도 정규화, 손을 떼면 감속해 멈춤, 벽을 뚫지 않고 살짝 튕김
 * - 물체: 차와 카트가 겹친 채 멈추지 않음(벽 구석으로 밀어붙여도)
 * - 학년별 미션을 실제 입력(방향키 흉내)으로 끝까지 해 보고, 틀린 행동에는 힌트가 나오는지
 */
'use strict';
global.MP_THRILL_PHYS = require('../js/thrill/physics.js');
var P = global.MP_THRILL_PHYS;
var M = require('../js/thrill/missions.js');
var fails = 0, n = 0;
function ok(cond, msg) { n++; if (!cond) { fails++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); }
var DT = 1 / 60;
// 미션 진행 도우미: 입력 함수를 sec 초 동안, 사건 모으기
function run(ms, sec, input, evs) {
  for (var t = 0; t < sec; t += DT) {
    var i = typeof input === 'function' ? input(ms, t) : input;
    var out = ms.step(i[0], i[1], DT);
    out.forEach(function (e) { evs && evs.push(e); });
    if (evs && evs.stopOn && out.some(function (e) { return evs.stopOn(e); })) return true;
  }
  return false;
}
// 목표 점까지 8방향으로 몰기(가까워지면 손 뗌)
function driveTo(tx, ty, stopDist) {
  return function (ms) {
    var c = ms.world.car, dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
    if (d < (stopDist || 20)) return [0, 0];
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
  // 벽: 위·오른쪽·구석으로 계속 밀어도 벽 안
  var worst = 0, bounced = false;
  [[0, -1], [1, 0], [1, -1], [-1, 1], [-1, -1]].forEach(function (d) {
    f = M.create('free', 1); car = f.world.car;
    for (var t = 0; t < 4; t += DT) {
      f.step(d[0], d[1], DT);
      if (P.wallFix(car.x, car.y, car.r - 0.5)) worst++;
      if (d[0] === 1 && d[1] === 0 && car.vx < -20) bounced = true;
    }
  });
  ok(worst === 0, '벽을 뚫거나 벽에 묻힌 프레임 없음');
  f = M.create('free', 1); car = f.world.car; car.x = 1300; car.y = 520;
  run(f, 0.7, [1, 0]); run(f, 0.12, [0, 0]);
  ok(car.vx < -20 || bounced, '벽에 닿으면 살짝 튕김(되돌아오는 속도 ' + car.vx.toFixed(0) + ')');
})();

console.log('[차와 카트]');
(function () {
  var ms = M.create(3), car = ms.world.car, c = ms.cart, overlaps = 0, moved;
  var c0 = c.x;
  run(ms, 1.2, [1, 0]);
  ok(c.x > c0 + 40, '카트 뒤에 닿으면 접촉 방향(→)으로 카트가 움직임');
  // 카트를 오른쪽 벽으로 몰아붙이기 → 겹침·벽 통과 없음
  for (var t = 0; t < 6; t += DT) { ms.step(1, 0, DT); if (P.overlapping(ms.world).length) overlaps++; }
  ok(overlaps === 0, '벽에 몰아붙여도 차·카트가 겹치거나 벽을 통과하지 않음');
  ms.retry();
  ok(Math.abs(ms.cart.x - c0) < 1 && Math.abs(ms.world.car.x - P.ARENA.x0 - 156) < 1 || ms.world.car.x === 260, '다시 시도하면 차와 카트가 처음 자리로');
})();

console.log('[1학년 별 칸에 주차]');
(function () {
  var ms = M.create(1), evs = [];
  // 너무 늦게 놓기 → 지나감 힌트
  var pad = ms.pad;
  run(ms, 5, function (m) { var c = m.world.car; if (Math.abs(c.y - pad.y) > 8 && c.x < 700) return [1, Math.sign(pad.y - c.y)]; return c.x < pad.x + 40 ? [1, 0] : [0, 0]; }, evs);
  ok(types(evs, 'hint').some(function (e) { return /지나갔네/.test(e.text); }), '칸을 지나 멈추면 “별 칸을 지나갔네…” 힌트');
  ok(ms.marks.length && ms.marks[ms.marks.length - 1].stop, '흰 점(놓은 곳)과 별(멈춘 곳)을 기록');
  ms.retry(); evs = [];
  // 칸 앞에서 놓아 칸 안에 멈추기
  run(ms, 6, function (m) {
    var c = m.world.car;
    if (Math.abs(c.y - pad.y) > 8 && c.x < 700) return [1, Math.sign(pad.y - c.y)];
    return c.x < pad.x - 150 ? [1, 0] : [0, 0];
  }, evs);
  ok(ms.stage === 1, '칸 안에서 감속해 멈추면 1단계 성공 (멈춘 x ' + ms.world.car.x.toFixed(0) + ')');
  // 통과만 하면 성공 아님
  var ms2 = M.create(1); var e2 = [];
  run(ms2, 3, [1, 0.45], e2);
  ok(ms2.stage === 0, '칸을 지나가기만 하면 성공으로 치지 않음');
})();

console.log('[2학년 밀판]');
(function () {
  var res = {};
  ['flat', 'curve'].forEach(function (kind) {
    var ms = M.create(2), evs = [];
    if (kind === 'curve') { ms.stage = 1; ms.setup(); }
    // 상자를 밀어 오른쪽으로 → 대각선으로 코너 돌기 → 아래로
    run(ms, 9, function (m) {
      var c = m.world.car;
      if (c.x < 1180) return [1, 0];
      if (c.y < 560) return [1, 1];
      return [0, 1];
    }, evs);
    res[kind] = { slips: ms.log.length ? ms.log[0].slips : ms.slips, stage: ms.stage, box: [Math.round(ms.box.x), Math.round(ms.box.y)], pushed: Math.round(ms.pushed) };
  });
  console.log('    평평한', JSON.stringify(res.flat), ' 굽은', JSON.stringify(res.curve));
  ok(res.flat.slips > res.curve.slips || (res.flat.slips >= 1 && res.curve.slips === 0), '같은 코너에서 평평한 밀판은 상자가 더 잘 빠짐');
  ok(res.flat.stage >= 1, '평평한 밀판 시험이 끝나면 다음 단계로');
})();

console.log('[4학년 자석]');
(function () {
  var ms = M.create(4), evs = [];
  // 같은 극(N–N): 천천히 다가가기 → 닿기 전에 밀려남
  var minGapSame = 1e9;
  run(ms, 4.5, function (m) {
    var g = Math.hypot(m.cart.x - m.world.car.x, m.cart.y - m.world.car.y) - m.cart.r - m.world.car.r;
    minGapSame = Math.min(minGapSame, g);
    return Math.hypot(m.world.car.vx, m.world.car.vy) < 140 ? [1, 0] : [0, 0];
  }, evs);
  ok(ms.log.some(function (l) { return l.kind === 'repel'; }), '같은 극이면 닿기 전에 밀어냄을 관찰로 기록');
  ok(minGapSame > 5, '밀려나는 동안 차와 카트가 닿지 않음(가장 가까운 틈 ' + minGapSame.toFixed(0) + 'px)');
  run(ms, 2, [0, 0], evs);   // 같은 자리로 돌아옴
  ms.action('flip');
  var cx0 = ms.cart.x, pulledBeforeTouch = false;
  run(ms, 4.5, function (m) {
    var g = Math.hypot(m.cart.x - m.world.car.x, m.cart.y - m.world.car.y) - m.cart.r - m.world.car.r;
    if (m.cart.x < cx0 - 5 && g > 0) pulledBeforeTouch = true;
    return Math.hypot(m.world.car.vx, m.world.car.vy) < 140 ? [1, 0] : [0, 0];
  }, evs);
  ok(pulledBeforeTouch, '자석을 뒤집으면 닿기 전에 카트가 끌려옴');
  ok(ms.stage === 1, '두 반응을 모두 보면 배달 단계로');
  // 일반 접촉으로만 민 경우 기록하지 않음: 카트 뒤(오른쪽)에서 들이받기
  var m2 = M.create(4); m2.world.car.x = 1250; m2.world.car.y = 540; m2.world.car.ang = Math.PI;
  run(m2, 2.5, [-1, 0]);
  ok(!m2.log.length, '자석 쪽이 아닌 곳을 들이받아 민 것은 관찰로 기록하지 않음');
  // 배달: 끌어당기는 극(S)으로 붙여서 왼쪽 위 배달 칸까지
  evs = [];
  run(ms, 0.1, [0, 0], evs);
  run(ms, 2.5, [0, 0], evs);
  run(ms, 5, function (m) { return m.attached ? [0, 0] : (Math.hypot(m.world.car.vx, m.world.car.vy) < 120 ? [1, 0] : [0, 0]); }, evs);
  ok(ms.attached, '끌어당기는 극이면 카트가 차 앞에 붙음');
  evs.stopOn = function (e) { return e.type === 'ask'; };
  var asked = run(ms, 8, function (m) {
    var p = M._G.G4.pad, c = m.cart, dx = p.x - c.x, dy = p.y - c.y;
    if (Math.hypot(dx, dy) < 25) return [0, 0];
    var a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
    return [Math.round(Math.cos(a)), Math.round(Math.sin(a))];
  }, evs);
  ok(asked, '카트를 붙인 채 배달 칸에 오면 토토가 질문');
  var a1 = ms.answer('pole', 'NN');
  ok(types(a1, 'hint').length && !ms.done, '틀린 답이면 힌트, 완료 아님');
  var a2 = ms.answer('pole', 'SN');
  ok(ms.done && types(a2, 'complete').length, '“S극과 N극”을 고르면 완료');
})();

console.log('[4학년 자석 뒤집기: 닿기 전 같은 자리]');
(function () {
  var ms = M.create(4), car = ms.world.car, c = ms.cart;
  function at(pole) {
    ms.retry(); car = ms.world.car; c = ms.cart; ms.magnet = pole;
    car.x = c.x - c.r - car.r - 70;   // 틈 70px(닿지 않음)
    ms.step(0, 0, 0.1);
    return { vx: c.vx, gap: Math.hypot(c.x - car.x, c.y - car.y) - c.r - car.r };
  }
  var n = at('N'), s = at('S');
  ok(n.vx > 5 && s.vx < -5 && n.gap > 0 && s.gap > 0, '같은 자리·닿기 전: N극이면 밀려남(vx ' + n.vx.toFixed(0) + '), 뒤집어 S극이면 끌려옴(vx ' + s.vx.toFixed(0) + ')');
})();

console.log('[5학년 빛]');
(function () {
  var ms = M.create(5), G5 = M._G.G5, evs = [];
  ms.action('lights');
  // 첫 표지판: 왼쪽 위 표지판을 바라보기
  run(ms, 3, driveTo(330, 480, 30), evs);
  run(ms, 0.6, [0, -1], evs); run(ms, 0.6, [0, 0], evs);
  ok(ms.stage === 1, '헤드라이트로 첫 표지판을 찾으면 다음 단계 (stage ' + ms.stage + ')');
  // 가림막 아래에서 위로 비추기 → 막힘, 표지판 2는 켜지지 않음
  var m2 = M.create(5); m2.stage = 1; m2.setup(); m2.action('lights');
  m2.world.car.x = 1460; m2.world.car.y = 560; m2.world.car.ang = -Math.PI / 2; m2.world.car.want = -Math.PI / 2;
  var e2 = []; run(m2, 2, [0, 0], e2);
  var rays = m2.rays(), blocked = rays.filter(function (r) { return r.blocked === G5.screen; }).length, direct = rays.some(function (r) { return r.hits.some(function (h) { return h.id === 's2'; }); });
  ok(blocked > 30 && !direct, '가림막이 직접광을 막음(막힌 광선 ' + blocked + '/41)');
  ok(m2.stage === 1, '직접 비춰서는 숨은 표지판이 켜지지 않음');
  run(m2, 2, [0, 0], e2);
  ok(types(e2, 'hint').some(function (e) { return /가림막/.test(e.text); }), '막히면 “빛이 가림막에 막혔어…” 힌트');
  // 거울 아래에서 위로 → 반사광으로 표지판 2
  var m3 = M.create(5); m3.stage = 1; m3.setup(); m3.action('lights');
  var e3 = [];
  run(m3, 4, driveTo(905, 560, 12), e3);
  run(m3, 1.2, [0, -1], e3); run(m3, 1, [0, 0], e3);
  ok(m3.done && types(e3, 'path').length, '거울로 반사된 빛이 닿으면 완료하고 차→거울→표지판 경로 표시');
  var p = types(e3, 'path')[0];
  if (p) console.log('    경로', p.pts.map(function (q) { return Math.round(q.x) + ',' + Math.round(q.y); }).join(' → '));
})();

console.log('[6학년 주행 기록]');
(function () {
  var ms = M.create(6), evs = [];
  // 1번: 곧게(→) 달리기
  run(ms, 4.5, [1, 0], evs);
  // 다시 시도 → 2번: 선을 지나 위로 꺾어 달리기(굽은 길)
  ms.retry();
  var linePass = false, restarts = 0, lastT = 0;
  run(ms, 5, function (m, t) {
    if (m.meter.on) { if (m.meter.t < lastT - 1e-6) restarts++; lastT = m.meter.t; }
    var c = m.world.car;
    if (c.x < 640) return [1, 0];
    return [-1, -1];   // 선 쪽으로 되돌아가며 선을 다시 밟음
  }, evs);
  ok(ms.runs.length === 2, '두 번 달리면 기록 2개');
  ok(restarts === 0, '측정 중 선을 다시 밟아도 타이머가 처음부터 다시 시작하지 않음');
  var r2 = ms.runs[1], plen = 0;
  for (var i = 1; i < r2.path.length; i++) plen += Math.hypot(r2.path[i].x - r2.path[i - 1].x, r2.path[i].y - r2.path[i - 1].y);
  var chord = Math.hypot(r2.path[r2.path.length - 1].x - r2.path[0].x, r2.path[r2.path.length - 1].y - r2.path[0].y);
  ok(Math.abs(plen - r2.px) < 1 && r2.px > chord + 50, '굽은 길은 실제 지나간 길이로 기록(경로 ' + (r2.px / 100).toFixed(2) + 'm > 직선거리 ' + (chord / 100).toFixed(2) + 'm)');
  ok(r2.m === Math.round(r2.px / 10) / 10, '화면 숫자(m) = 그림 px ÷ 100, 소수 첫째 자리');
  var q = types(evs, 'ask')[0];
  ok(q && q.q.id === 'faster', '두 번 달리면 비교 질문');
  var a = ms.runs[0].m, b = ms.runs[1].m, right = a > b ? '1' : b > a ? '2' : 'same';
  var wrong = right === '1' ? '2' : '1';
  ok(types(ms.answer('faster', wrong), 'hint').length, '틀리게 고르면 힌트');
  var out = ms.answer('faster', right), sq = types(out, 'ask')[0];
  ok(sq && sq.q.id === 'speed', '맞게 고르면 평균 속력 질문');
  ok(sq.q.right === (Math.round(a / 3 * 10) / 10).toFixed(1), '평균 속력 정답 = 화면에 보인 거리 ÷ 3 (' + a.toFixed(1) + ' ÷ 3 = ' + sq.q.right + ')');
  ms.answer('speed', sq.q.right);
  ok(ms.done, '평균 속력을 맞히면 완료');
  // 같아요
  var m2 = M.create(6); m2.runs = [{ m: 9.6 }, { m: 9.6 }]; m2.asking = true;
  var o2 = m2.answer('faster', 'same');
  ok(types(o2, 'ask').some(function (e) { return e.q.id === 'speed'; }), '같은 거리면 ‘같아요’가 정답');
})();

console.log('[3학년 밀고 당기기]');
(function () {
  var ms = M.create(3), evs = [];
  run(ms, 6, function (m) { return m.cart.x < 1130 ? [1, 0] : [0, 0]; }, evs);
  ok(ms.stage === 1, '카트 뒤를 밀어 밀기 구역에 넣으면 당기기 단계로');
  ok(types(evs, 'arrow').length >= 1, '카트가 움직이기 시작할 때 방향 화살표');
  var noRope = ms.action('hitch');
  ok(ms.rope, '고리 가까이에서 [견인 줄 달기]');
  evs = [];
  run(ms, 5, function (m) { return m.cart.x > 330 ? [-1, 0] : [0, 0]; }, evs);
  ok(ms.done, '줄로 끌어 당기기 구역에 넣으면 완료 (줄로 옮긴 거리 ' + Math.round(ms.ropeMoved || 0) + ')');
  // 줄 없이 밀어서 당기기 구역에 넣으면 완료 아님
  var m2 = M.create(3); m2.stage = 1; m2.setup();
  m2.world.car.x = 1300; m2.world.car.y = 520;
  var e2 = []; run(m2, 6, function (m) { return m.cart.x > 330 ? [-1, 0] : [0, 0]; }, e2);
  ok(!m2.done && types(e2, 'hint').length, '줄 없이 밀어서 넣으면 완료하지 않고 힌트');
})();

console.log('\n' + (n - fails) + ' / ' + n + ' 통과');
process.exit(fails ? 1 : 0);
