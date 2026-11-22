// 토리네 도시락 주문 판정 검증: node tools/verify_picnic.js
// 학년마다 주문 3개, 정답 예시는 통과하고 틀린 예시는 힌트가 나오는지, 도시락 하나 주문은 모든 조합을 훑어 정답 개수를 셉니다.
'use strict';
var P = require('../js/picnic/orders.js');
var fails = 0;
function box(o) { var b = {}; P.FOODS.forEach(function (f) { b[f] = (o && o[f]) || 0; }); return b; }
function expect(label, got, ok) {
  var pass = got.ok === ok;
  if (!pass) fails++;
  console.log((pass ? '  ok  ' : '  FAIL') + ' ' + label + (got.hint ? '  → ' + got.hint : ''));
}
function T(g, i, boxes, ok, label) { expect(g + '학년 ' + (i + 1) + '번 ' + label, P.judge(P.ORDERS[g][i], boxes.map(box)), ok); }

for (var g = 1; g <= 6; g++) {
  if (!P.ORDERS[g] || P.ORDERS[g].length !== 3) { fails++; console.log('FAIL ' + g + '학년 주문이 3개가 아님'); }
  var texts = P.ORDERS[g].map(function (o) { return o.text; });
  if (new Set(texts).size !== 3) { fails++; console.log('FAIL ' + g + '학년 주문이 서로 다르지 않음'); }
}

console.log('1학년 개수 세기');
T(1, 0, [{ onigiri: 2, strawberry: 3 }], true, '주먹밥2 딸기3');
T(1, 0, [{ onigiri: 2, strawberry: 3, tomato: 1 }], false, '다른 재료가 섞임');
T(1, 0, [{ onigiri: 3, strawberry: 3 }], false, '주먹밥 3');
T(1, 0, [{}], false, '빈 도시락');

console.log('2학년 미리 담긴 재료 + 더하기/빼기');
var s0 = P.startBoxes(P.ORDERS[2][0]);
expect('2학년 1번 시작 상태가 딸기 4개', { ok: s0.length === 1 && s0[0].strawberry === 4 && P.total(s0[0]) === 4 }, true);
expect('2학년 1번 그대로 전달하면 실패', P.judge(P.ORDERS[2][0], s0), false);
T(2, 0, [{ strawberry: 6 }], true, '딸기 6');
T(2, 1, [{ onigiri: 4 }], true, '주먹밥 7-3=4');
T(2, 1, [{ onigiri: 7 }], false, '빼지 않음');
T(2, 2, [{ sandwich: 3, tomato: 7 }], true, '샌드위치3 토마토7');

console.log('3학년 똑같이 나누기(도시락 두 개)');
T(3, 0, [{ sandwich: 4 }, { sandwich: 4 }], true, '4개씩');
T(3, 0, [{ sandwich: 5 }, { sandwich: 3 }], false, '5·3');
T(3, 0, [{ sandwich: 8 }, {}], false, '한쪽에 다 담음');
T(3, 0, [{ sandwich: 4 }, { sandwich: 3 }], false, '전체 7');
T(3, 1, [{ strawberry: 3, onigiri: 2 }, { onigiri: 2, strawberry: 3 }], true, '딸기3 주먹밥2씩');
var s3 = P.startBoxes(P.ORDERS[3][2]);
expect('3학년 3번 시작: 도시락1 토마토12, 도시락2 비어 있음', { ok: s3[0].tomato === 12 && P.total(s3[1]) === 0 }, true);
T(3, 2, [{ tomato: 6 }, { tomato: 6 }], true, '6개씩');

console.log('4학년 여러 조건(여러 정답)');
T(4, 0, [{ strawberry: 2, onigiri: 4 }, { strawberry: 2, tomato: 4 }], true, '딸기2+주먹밥4 / 딸기2+토마토4');
T(4, 0, [{ strawberry: 2, onigiri: 1, sandwich: 1, tomato: 2 }, { strawberry: 2, sandwich: 3, tomato: 1 }], true, '섞어서');
T(4, 0, [{ strawberry: 2, onigiri: 5 }, { strawberry: 2, tomato: 3 }], false, '7·5 개수 다름');
T(4, 0, [{ strawberry: 3, onigiri: 3 }, { strawberry: 1, tomato: 5 }], false, '딸기 3·1');
T(4, 2, [{ onigiri: 3, sandwich: 5 }, { onigiri: 3, tomato: 2 }], true, '8개·5개, 주먹밥 3씩');

console.log('5학년 분수');
T(5, 0, [{ strawberry: 4, onigiri: 8 }], true, '딸기4 주먹밥8');
T(5, 0, [{ strawberry: 3, onigiri: 9 }], false, '딸기3');
T(5, 1, [{ tomato: 4, sandwich: 6 }], true, '토마토4 샌드위치6');
T(5, 2, [{ strawberry: 2, onigiri: 4, tomato: 2 }, { strawberry: 2, onigiri: 4, sandwich: 1, tomato: 1 }], true, '나머지 자유');

console.log('6학년 비');
T(6, 0, [{ strawberry: 6, tomato: 9 }], true, '딸기6 토마토9');
T(6, 0, [{ strawberry: 9, tomato: 6 }], false, '거꾸로 3:2');
T(6, 0, [{ strawberry: 4, tomato: 6 }], false, '2:3이지만 10개');
T(6, 0, [{ strawberry: 6, tomato: 9, onigiri: 1 }], false, '주먹밥 섞임');
T(6, 1, [{ onigiri: 9, sandwich: 3 }], true, '주먹밥9 샌드위치3');
T(6, 2, [{ strawberry: 2, onigiri: 4 }, { strawberry: 3, onigiri: 6 }], true, '2·4 / 3·6');

// 도시락 하나 주문: 모든 조합(재료당 0~15)을 훑어 정답 수 세기 — 정답이 하나 이상, 4학년 2번은 여럿
console.log('도시락 하나 주문 전수 검사');
for (g = 1; g <= 6; g++) {
  P.ORDERS[g].forEach(function (o, i) {
    if (o.boxes !== 1) return;
    var count = 0;
    for (var a = 0; a <= 15; a++) for (var b = 0; b <= 15; b++) for (var c = 0; c <= 15; c++) for (var d = 0; d <= 15; d++) {
      if (a + b + c + d > P.BOX_MAX) continue;
      if (P.judge(o, [{ onigiri: a, sandwich: b, strawberry: c, tomato: d }]).ok) count++;
    }
    var want = g === 4 && i === 1 ? count > 1 : count === 1;
    if (!want) fails++;
    console.log((want ? '  ok  ' : '  FAIL') + ' ' + g + '학년 ' + (i + 1) + '번 정답 ' + count + '가지');
  });
}

// ---------- 판마다 새 주문(GEN) ----------
// 정해진 씨앗으로 같은 결과가 나오게
function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function sumBox(b) { return P.FOODS.reduce(function (s, f) { return s + (b[f] || 0); }, 0); }
function countSolutions(o) {
  var c = 0;
  for (var a = 0; a <= 16; a++) for (var b = 0; b <= 16 - a; b++) for (var d = 0; d <= 16 - a - b; d++) for (var e = 0; e <= 16 - a - b - d; e++)
    if (P.judge(o, [{ onigiri: a, sandwich: b, strawberry: d, tomato: e }]).ok) c++;
  return c;
}
console.log('\n판마다 새 주문: 학년마다 600판');
var ROUNDS = 600, BRUTE = 40;
for (g = 1; g <= 6; g++) {
  var rng = seeded(1000 + g), prev = [], bad = 0, texts = {}, range = [[1e9, 0], [1e9, 0], [1e9, 0]];
  var first = P.makeRound(g, { first: true });
  if (first.map(function (o) { return o.text; }).join() !== P.ORDERS[g].map(function (o) { return o.text; }).join()) { bad++; console.log('  FAIL 처음 판이 예시 주문이 아님'); }
  for (var k = 0; k < ROUNDS; k++) {
    var round = P.makeRound(g, { rng: rng, avoid: prev });
    if (round.length !== 3) { bad++; continue; }
    round.forEach(function (o, i) {
      var fixed = P.ORDERS[g][i];
      texts[o.text] = 1;
      // 유형이 그대로인지: 도시락 수·처음 담긴 재료 유무가 예시와 같음
      if (o.boxes !== fixed.boxes || !!o.start !== !!fixed.start) { bad++; console.log('  FAIL 유형 다름', g, i, o.text); }
      if (prev.indexOf(o.text) >= 0) { bad++; console.log('  FAIL 바로 전 판과 같은 주문', o.text); }
      // 정답 예시는 통과, 도시락 크기 안
      var ans = o.answer.map(box);
      if (!P.judge(o, ans).ok) { bad++; console.log('  FAIL 정답 예시가 틀림', o.text, JSON.stringify(o.answer), P.judge(o, ans).hint); }
      if (ans.concat((o.start || []).map(box)).some(function (b) { return sumBox(b) > P.BOX_MAX; })) { bad++; console.log('  FAIL 도시락 20개 넘음', o.text); }
      // 처음 담긴 그대로 전달하면 실패
      if (o.start && P.judge(o, P.startBoxes(o)).ok) { bad++; console.log('  FAIL 처음 상태가 정답', o.text); }
      // 정답에 재료 하나를 더하면 실패
      P.FOODS.forEach(function (f) { var w = ans.map(function (b) { return Object.assign({}, b); }); w[0][f]++; if (P.judge(o, w).ok) { bad++; console.log('  FAIL 하나 더 담아도 통과', o.text, f); } });
      // 힌트 문장이 비어 있지 않음
      var h = P.judge(o, ans.map(function () { return box({}); }).map(function (b, j) { if (j === 0) b[P.FOODS[0]] = 1; return b; }));
      if (!h.ok && !h.hint) { bad++; console.log('  FAIL 힌트 없음', o.text); }
      // 숫자 범위(난이도): 담는 전체 개수를 예시와 비교해 기록
      var tot = ans.reduce(function (s, b) { return s + sumBox(b); }, 0);
      range[i][0] = Math.min(range[i][0], tot); range[i][1] = Math.max(range[i][1], tot);
      // 도시락 하나 주문: 정답 개수(4학년 2번만 여러 개, 나머지는 하나)
      if (k < BRUTE && o.boxes === 1) {
        var cnt = countSolutions(o), want = g === 4 && i === 1 ? cnt > 1 : cnt === 1;
        if (!want) { bad++; console.log('  FAIL 정답 수', cnt, o.text); }
      }
    });
    prev = round.map(function (o) { return o.text; });
  }
  fails += bad;
  console.log((bad ? '  FAIL' : '  ok  ') + ' ' + g + '학년: 서로 다른 주문 ' + Object.keys(texts).length + '가지 · 담는 개수 ' +
    range.map(function (r, i) { var fx = P.ORDERS[g][i]; return (i + 1) + '번 ' + r[0] + '~' + r[1] + '개'; }).join(', '));
}

console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과');
process.exit(fails ? 1 : 0);
