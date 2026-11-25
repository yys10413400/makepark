// 토리네 도시락 주문 판정 검증: node tools/verify_picnic.js
// 1) 처음 판 예시 주문: 정답·오답 예시, 도시락 하나 주문은 모든 조합을 훑어 정답 수 확인
// 2) 판마다 새 주문: 학년마다 600판 — 이번 판 재료 4가지(송편은 하나만)로만 주문, 유형·숫자 범위가 예시와 같은지 등
'use strict';
var P = require('../js/picnic/orders.js');
var fails = 0;
function box(o) { var b = {}; P.FOODS.forEach(function (f) { b[f] = (o && o[f]) || 0; }); return b; }
function ok(label, pass, extra) { if (!pass) fails++; console.log((pass ? '  ok  ' : '  FAIL') + ' ' + label + (extra ? '  → ' + extra : '')); }
function T(g, i, boxes, want, label) { var r = P.judge(P.ORDERS[g][i], boxes.map(box)); ok(g + '학년 ' + (i + 1) + '번 ' + label, r.ok === want, r.hint); }
function sumBox(b) { return P.FOODS.reduce(function (s, f) { return s + (b[f] || 0); }, 0); }
// 도시락 하나 주문의 정답 수: 이번 판 재료 4가지로 담을 수 있는 모든 조합(합 16개까지)
function countSolutions(o, set) {
  var c = 0, x = {};
  (function rec(i, left) {
    if (i === set.length) { if (P.judge(o, [box(x)]).ok) c++; return; }
    for (var k = 0; k <= left; k++) { x[set[i]] = k; rec(i + 1, left - k); }
    x[set[i]] = 0;
  })(0, 16);
  return c;
}

console.log('음식 ' + P.ALL.length + '가지: ' + P.ALL.map(function (f) { return P.NAME[f]; }).join(', '));
ok('음식 12가지, 이름 모두 있음', P.ALL.length === 12 && P.ALL.every(function (f) { return P.NAME[f]; }));
ok('조사: 귤로·주먹밥으로·달걀말이로', P.josa('귤', '으로', '로') === '귤로' && P.josa('주먹밥', '으로', '로') === '주먹밥으로' && P.josa('달걀말이', '으로', '로') === '달걀말이로');

console.log('\n처음 판 예시 주문(주먹밥·김밥·귤·달걀말이)');
var J = 'jumeokbap', G = 'gimbap', TG = 'tangerine', E = 'eggroll', o1 = {}, o2 = {};
for (var g = 1; g <= 6; g++) {
  var texts = P.ORDERS[g].map(function (o) { return o.text; });
  ok(g + '학년 주문 3개가 서로 다름', P.ORDERS[g].length === 3 && new Set(texts).size === 3);
  P.ORDERS[g].forEach(function (o, i) { ok(g + '학년 ' + (i + 1) + '번 정답 예시 통과', P.judge(o, o.answer.map(box)).ok, o.text); });
}
o1[J] = 2; o1[TG] = 3; T(1, 0, [o1], true, '주먹밥2 귤3');
o2[J] = 2; o2[TG] = 3; o2[E] = 1; T(1, 0, [o2], false, '다른 재료가 섞임');
T(1, 0, [{}], false, '빈 도시락');
var s0 = P.startBoxes(P.ORDERS[2][0]);
ok('2학년 1번 시작 상태가 귤 4개', s0[0][TG] === 4 && P.total(s0[0]) === 4);
ok('2학년 1번 그대로 전달하면 실패', !P.judge(P.ORDERS[2][0], s0).ok);
T(3, 0, [{ gimbap: 5 }, { gimbap: 3 }], false, '5·3');
T(3, 0, [{ gimbap: 4 }, { gimbap: 4 }], true, '4개씩');
T(4, 0, [{ tangerine: 2, jumeokbap: 4 }, { tangerine: 2, eggroll: 4 }], true, '여러 정답 ①');
T(4, 0, [{ tangerine: 2, gimbap: 1, eggroll: 3 }, { tangerine: 2, jumeokbap: 2, gimbap: 2 }], true, '여러 정답 ②');
T(4, 0, [{ tangerine: 3, jumeokbap: 3 }, { tangerine: 1, eggroll: 5 }], false, '귤 3·1');
T(5, 0, [{ tangerine: 4, jumeokbap: 8 }], true, '귤4 주먹밥8');
T(5, 0, [{ tangerine: 3, jumeokbap: 9 }], false, '귤3');
T(6, 0, [{ tangerine: 6, eggroll: 9 }], true, '귤6 달걀말이9');
T(6, 0, [{ tangerine: 9, eggroll: 6 }], false, '거꾸로 3:2');
T(6, 0, [{ tangerine: 4, eggroll: 6 }], false, '2:3이지만 10개');
for (g = 1; g <= 6; g++) {
  P.ORDERS[g].forEach(function (o, i) {
    if (o.boxes !== 1) return;
    var c = countSolutions(o, P.FIRST_SET), want = g === 4 && i === 1 ? c > 1 : c === 1;
    ok(g + '학년 ' + (i + 1) + '번 정답 ' + c + '가지', want);
  });
}

// ---------- 판마다 새 주문 ----------
function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
console.log('\n판마다 새 주문: 학년마다 600판');
var ROUNDS = 600, BRUTE = 40, seen = {};
P.ALL.forEach(function (f) { seen[f] = 0; });
for (g = 1; g <= 6; g++) {
  var rng = seeded(1000 + g), prev = [], bad = 0, kinds = {}, range = [[1e9, 0], [1e9, 0], [1e9, 0]];
  var fr = P.makeRound(g, { first: true });
  if (fr.map(function (o) { return o.text; }).join() !== P.ORDERS[g].map(function (o) { return o.text; }).join() || fr.foods.join() !== P.FIRST_SET.join()) { bad++; console.log('  FAIL 처음 판이 예시 주문이 아님'); }
  for (var k = 0; k < ROUNDS; k++) {
    var round = P.makeRound(g, { rng: rng, avoid: prev }), set = round.foods;
    if (round.length !== 3 || set.length !== 4 || new Set(set).size !== 4) { bad++; console.log('  FAIL 재료 4가지가 아님', set); continue; }
    if (set.filter(function (f) { return P.SONGPYEON.indexOf(f) >= 0; }).length > 1) { bad++; console.log('  FAIL 송편이 둘 이상', set); }
    set.forEach(function (f) { seen[f]++; });
    round.forEach(function (o, i) {
      var fixed = P.ORDERS[g][i];
      kinds[o.text] = 1;
      if (o.boxes !== fixed.boxes || !!o.start !== !!fixed.start) { bad++; console.log('  FAIL 유형 다름', g, i, o.text); }
      if (prev.indexOf(o.text) >= 0) { bad++; console.log('  FAIL 바로 전 판과 같은 주문', o.text); }
      // 주문에 쓴 음식은 모두 이번 판 재료 버튼에 있어야 함
      var used = {};
      o.answer.concat(o.start || []).forEach(function (b) { Object.keys(b).forEach(function (f) { if (b[f]) used[f] = 1; }); });
      Object.keys(used).forEach(function (f) { if (set.indexOf(f) < 0) { bad++; console.log('  FAIL 버튼에 없는 음식', P.NAME[f], o.text); } });
      P.ALL.forEach(function (f) { if (set.indexOf(f) < 0 && o.text.indexOf(P.NAME[f]) >= 0 && !set.some(function (s) { return P.NAME[s].indexOf(P.NAME[f]) >= 0; })) { bad++; console.log('  FAIL 문장에 버튼에 없는 음식', P.NAME[f], o.text); } });
      var ans = o.answer.map(box);
      if (!P.judge(o, ans).ok) { bad++; console.log('  FAIL 정답 예시가 틀림', o.text, P.judge(o, ans).hint); }
      if (ans.concat((o.start || []).map(box)).some(function (b) { return sumBox(b) > P.BOX_MAX; })) { bad++; console.log('  FAIL 도시락 20개 넘음', o.text); }
      if (o.start && P.judge(o, P.startBoxes(o)).ok) { bad++; console.log('  FAIL 처음 상태가 정답', o.text); }
      set.forEach(function (f) { var w = ans.map(function (b) { return Object.assign({}, b); }); w[0][f]++; if (P.judge(o, w).ok) { bad++; console.log('  FAIL 하나 더 담아도 통과', o.text, f); } });
      var tot = ans.reduce(function (s, b) { return s + sumBox(b); }, 0);
      range[i][0] = Math.min(range[i][0], tot); range[i][1] = Math.max(range[i][1], tot);
      if (k < BRUTE && o.boxes === 1) {
        var cnt = countSolutions(o, set), want = g === 4 && i === 1 ? cnt > 1 : cnt === 1;
        if (!want) { bad++; console.log('  FAIL 정답 수', cnt, o.text); }
      }
    });
    prev = round.map(function (o) { return o.text; });
  }
  fails += bad;
  console.log((bad ? '  FAIL' : '  ok  ') + ' ' + g + '학년: 서로 다른 주문 ' + Object.keys(kinds).length + '가지 · 담는 개수 ' +
    range.map(function (r, i) { return (i + 1) + '번 ' + r[0] + '~' + r[1] + '개'; }).join(', '));
}
ok('12가지 음식이 모두 재료 버튼으로 나옴', P.ALL.every(function (f) { return seen[f] > 0; }),
  P.ALL.map(function (f) { return P.NAME[f] + ' ' + seen[f]; }).join(' · '));

console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과');
process.exit(fails ? 1 : 0);
