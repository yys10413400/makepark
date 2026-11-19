/*
 * 문지기의 비밀 규칙 자동 점검:  node tools/verify_gatekeeper.js
 * - 준비한 규칙마다: 통과·멈춤 손님이 2가지 이상, 한 단서 규칙과 다르고(3~6학년은 1~2학년 규칙과도 다름)
 * - 처음 기록 4장으로는 한 단서 규칙이 모두 틀림('열쇠만 보면 된다' 같은 생각으로는 못 풂)
 * - 손님마다: 그때까지 보이는 기록과 맞는 학년 후보가 모두 같은 답을 냄(공정성)
 * - 판마다 기록에 없던 소품 조합 손님이 나옴, 정답 판정 = 규칙 정의, 오답이면 힌트가 나옴
 * - 친구 모드: 고를 수 있는 모든 카드 조합이 같은 규칙 정의로 판정·설명되고, 판이 끝까지 공정함
 */
var G = require('../js/gatekeeper/rules.js');
var fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('  ✗ ' + msg); } }

function playRound(R, label) {
  var seenAtStart = R.records.slice();
  var novel = 0, guests = 0, g, verdicts = {};
  while ((g = R.next())) {
    guests++; verdicts[g.pass] = 1;
    var known = R.known;
    ok(G.isFair(R.practice ? [G.maskOf(R.rule)] : G.candidateMasks(R.band), known, g), label + ': 공정하지 않은 손님 ' + G.comboText(g));
    ok(g.pass === G.evaluate(R.rule, g), label + ': 손님 답이 규칙과 다름');
    if (!R.known.some(function (k) { return G.sameCombo(k, g); })) novel++;
    var wrong = R.judge(g, !g.pass);
    ok(!wrong.correct && wrong.hint && wrong.hint.text, label + ': 오답 힌트 없음');
    (wrong.hint.show || []).forEach(function (k) { ok(R.known.indexOf(k) >= 0, label + ': 힌트가 없는 기록을 가리킴'); });
    ok(R.judge(g, g.pass).correct, label + ': 정답이 맞다고 나오지 않음');
  }
  ok(guests === R.total, label + ': 손님 수 ' + guests);
  if (!R.practice) ok(novel >= 1, label + ': 기록에 없던 조합 손님이 없음');
  ok(verdicts[true] && verdicts[false], label + ': 통과·잠깐 손님이 한 판에 모두 나오지 않음');
  return { novel: novel, extras: R.extras.length };
}

// 1. 준비한 규칙
var singles = G.familyMasks('single'), low = G.familyMasks('low');
Object.keys(G.RULES).forEach(function (band) {
  G.RULES[band].forEach(function (rule) {
    var m = G.maskOf(rule), n = 0;
    G.COMBOS.forEach(function (c) { if (G.bit(m, c)) n++; });
    ok(n >= 3 && 9 - n >= 3, rule.id + ': 통과 ' + n + '가지(준비한 규칙은 통과·잠깐 조합이 3가지 이상씩)');
    ok(singles.indexOf(m) < 0, rule.id + ': 한 단서 규칙과 같음');
    if (band !== 'low') ok(low.indexOf(m) < 0, rule.id + ': 1~2학년 규칙과 같음');
    ok(G.candidateMasks(band).indexOf(m) >= 0, rule.id + ': 학년 후보에 없음');
    var stat = { extras: 0, novel: 0 };
    for (var seed = 1; seed <= 60; seed++) {
      var R = G.newRound({ band: band, rule: rule, rand: G.rng(seed * 7919 + rule.id.charCodeAt(1)) });
      ok(R.records.filter(function (k) { return k.pass; }).length === 2 && R.records.length === 4, rule.id + ': 기록 4장(통과 2)');
      ok(G.consistent(singles, R.records).length === 0, rule.id + ': 한 단서 규칙이 기록과 맞음 (seed ' + seed + ')');
      var s = playRound(R, rule.id + '#' + seed);
      stat.extras += s.extras; stat.novel += s.novel;
    }
    console.log(band + ' ' + rule.id + '  ' + G.describe(rule) + '   (평균 새 조합 ' + (stat.novel / 60).toFixed(1) + ', 더 본 기록 ' + (stat.extras / 60).toFixed(1) + ')');
  });
});

// 2. 연습 문제
var P = G.PRACTICE;
var PR = G.newRound({ band: 'low', rule: P.rule, practice: true, records: P.records, script: P.guests, guests: P.guests.length });
ok(PR.records.map(function (k) { return k.pass; }).join() === 'true,true,false,false', '연습: 통과 2·멈춤 2 순서');
ok(PR.next().pass === true, '연습: 첫 손님(달 배지 + 열쇠)은 통과');
console.log('연습 P1  ' + G.describe(P.rule));

// 3. 친구 모드: 모든 카드 조합
var built = 0, playable = 0;
Object.keys(G.LINKS).forEach(function (band) {
  G.LINKS[band].forEach(function (link) {
    ['star', 'moon', 'none'].forEach(function (b) {
      ['key', 'lantern', 'empty'].forEach(function (i) {
        ['key', 'lantern', 'empty'].forEach(function (i2) {
          if (link !== 'cond' && i2 !== 'key') return;
          var rule = G.buildRule({ link: link, badge: b, item: i, item2: i2 });
          built++;
          ok(G.describe(rule).length > 5, '친구 규칙 설명 없음');
          if (!G.checkRule(rule).ok) return;
          playable++;
          ok(G.candidateMasks(band).indexOf(G.maskOf(rule)) >= 0, '친구 규칙이 학년 후보에 없음: ' + G.describe(rule));
          for (var seed = 1; seed <= 5; seed++) playRound(G.newRound({ band: band, rule: rule, rand: G.rng(seed * 31 + built) }), 'friend ' + G.describe(rule));
        });
      });
    });
  });
});
console.log('친구 모드 규칙 ' + built + '가지 중 놀 수 있는 규칙 ' + playable + '가지 점검');

console.log(fails ? '\n실패 ' + fails + ' / ' + checks : '\n모두 통과 (' + checks + '개 확인)');
process.exit(fails ? 1 : 0);
