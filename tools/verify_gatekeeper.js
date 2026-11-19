/*
 * 문지기의 비밀 규칙 자동 점검:  node tools/verify_gatekeeper.js
 * - 학년(1~2 / 3~4 / 5~6) × 3단계 × 여러 판:
 *   처음 기록 4장(통과 2·잠깐 2)이 규칙과 맞고, 기록만으로 그 단계 규칙 후보가 하나로 정해짐
 *   손님마다 공정함(지금 보이는 기록과 맞는 후보가 모두 같은 답), 답 = 규칙 정의
 *   단계마다 기록에 없던 모습 손님이 나오고, 통과·잠깐 손님이 모두 나옴, 오답이면 힌트가 나옴
 *   퀴즈: 보기 3개, 정답은 하나뿐(나머지 둘은 지금 기록과 안 맞음)
 *   3~4학년 3단계는 '그리고', 5~6학년 3단계는 '또는'/'~만 빼고' — 한 가지 규칙과 다름
 * - 친구 모드: 학년별로 고를 수 있는 카드 조합 전부
 */
var G = require('../js/gatekeeper/rules.js');
var fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; if (fails < 30) console.log('  ✗ ' + msg); } }

function playStage(R, label) {
  var masks = G.candidates(R.domain, R.shapes).map(function (c) { return c.mask; });
  ok(R.records.length === 4 && R.records.filter(function (k) { return k.pass; }).length === 2, label + ': 기록 4장(통과 2)');
  R.records.forEach(function (k) { ok(G.evaluate(R.rule, k) === k.pass, label + ': 기록이 규칙과 다름'); });
  var novel = 0, v = {}, g;
  while ((g = R.next())) {
    ok(G.isFair(masks, R.known, g), label + ': 공정하지 않은 손님 ' + G.comboText(g));
    ok(g.pass === G.evaluate(R.rule, g), label + ': 손님 답이 규칙과 다름');
    if (!R.known.some(function (k) { return G.sameCombo(k, g); })) novel++;
    v[g.pass] = 1;
    var wrong = R.judge(g, !g.pass);
    ok(!wrong.correct && wrong.hint && wrong.hint.text, label + ': 오답 힌트 없음');
    ok(R.judge(g, g.pass).correct, label + ': 정답이 맞다고 나오지 않음');
  }
  ok(R.count === R.total, label + ': 손님 수');
  ok(novel >= 1, label + ': 기록에 없던 모습 손님이 없음');
  ok(v[true] && v[false], label + ': 통과·잠깐 손님이 모두 나오지 않음');
  var combos = G.domainCombos(R.domain), q = R.quiz();
  var right = q.filter(function (r) { return G.maskOf(r, combos) === G.maskOf(R.rule, combos); });
  ok(q.length === 3 && right.length === 1, label + ': 퀴즈 보기 3개·정답 1개 (' + q.map(G.describe).join(' / ') + ')');
  if (R.rule.op !== 'not') ok(q.every(function (r) { return r.op !== 'not'; }), label + ': 쉬운 단계 퀴즈에 ~만 빼고 보기');
  q.forEach(function (r) {
    if (right.indexOf(r) >= 0) return;
    ok(G.consistent([G.maskOf(r, combos)], R.known).length === 0, label + ': 퀴즈 오답 보기가 기록과 맞음 ' + G.describe(r));
  });
  return { extras: R.extras.length, novel: novel };
}

['low', 'middle', 'high'].forEach(function (band) {
  var st = { extras: 0, novel: 0, n: 0 }, kinds = {};
  for (var seed = 1; seed <= 300; seed++) {
    var rand = G.rng(seed * 7919 + band.length), used = [];
    for (var n = 1; n <= 3; n++) {
      var plan = G.stagePlan(band, n, rand, used); used.push(plan.rule);
      if (n === 3) {
        kinds[plan.rule.op] = (kinds[plan.rule.op] || 0) + 1;
        if (band === 'middle') ok(plan.rule.op === 'and', '3~4학년 3단계는 그리고');
        if (band === 'high') ok(plan.rule.op === 'or' || plan.rule.op === 'not', '5~6학년 3단계는 또는/만 빼고');
        if (band === 'low') ok(plan.rule.op === 'is' && used.slice(0, 2).every(function (r) { return r.a !== plan.rule.a; }), '1~2학년 3단계는 다른 한 가지');
      }
      var R = G.newRound({ rule: plan.rule, domain: plan.domain, shapes: plan.shapes, rand: rand });
      var s = playStage(R, band + ' ' + n + '단계 #' + seed + ' ' + R.text);
      st.extras += s.extras; st.novel += s.novel; st.n++;
    }
  }
  console.log(band + ': ' + st.n + '단계 점검, 3단계 규칙 ' + JSON.stringify(kinds) + ', 단계당 새 모습 손님 ' + (st.novel / st.n).toFixed(1) + ', 더 꺼낸 기록 ' + (st.extras / st.n).toFixed(2));
});
var ex = G.newRound({ rule: { op: 'is', a: 'star' }, domain: 'd4', shapes: ['single'], rand: G.rng(3) });
console.log('예) ' + ex.text + '  기록: ' + ex.records.map(function (k) { return G.comboText(k) + (k.pass ? ' ✔' : ' ✋'); }).join(' | '));

// 친구 모드
var built = 0, playable = 0;
Object.keys(G.FRIEND).forEach(function (band) {
  var F = G.FRIEND[band], atoms = G.domainAtoms(F.domain), d = G.DOMAINS[F.domain];
  F.links.forEach(function (link) {
    var list = [];
    if (link === 'one' || link === 'not') atoms.forEach(function (a) { list.push({ link: link, card: a }); });
    else d.badges.forEach(function (b) { d.items.forEach(function (i) { list.push({ link: link, badge: b, item: i }); }); });
    list.forEach(function (parts) {
      var rule = G.buildRule(parts); built++;
      ok(G.describe(rule).length > 5, '친구 규칙 설명 없음');
      if (!G.checkRule(rule, band).ok) return;
      playable++;
      for (var seed = 1; seed <= 6; seed++) {
        playStage(G.newRound({ rule: rule, domain: F.domain, shapes: F.shapes, guests: 4, rand: G.rng(seed * 31 + built) }), 'friend ' + band + ' ' + G.describe(rule));
      }
    });
  });
});
console.log('친구 모드 규칙 ' + built + '가지 중 놀 수 있는 규칙 ' + playable + '가지 점검');
console.log(fails ? '\n실패 ' + fails + ' / ' + checks : '\n모두 통과 (' + checks + '개 확인)');
process.exit(fails ? 1 : 0);
