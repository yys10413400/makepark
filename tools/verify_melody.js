/*
 * 멜로디 스테이지 박자 판정 자동 점검:  node tools/verify_melody.js
 * - 정확히/조금 빨리/조금 늦게 누르면 성공, 범위 밖이면 박자 밖(stray)
 * - 한 박자에 한 번만 판정(두 번째 입력은 dup), 다른 동작·쉼 박에 누르면 실패, 안 누른 쉼은 성공
 * - 마구 누르기(박자마다 네 버튼을 다 누르기·사이사이 누르기)로는 세트가 성공하지 않음
 * - 세트 4개 중 3개, 미션 3세트 중 2세트 기준 / 모든 미션 데이터가 올바른 동작 이름만 씀
 */
var D = require('../js/melody/data.js'), RH = require('../js/melody/rhythm.js');
var fails = 0, checks = 0;
function ok(c, m) { checks++; if (!c) { fails++; console.log('  ✗ ' + m); } }
var C = D.CONFIG, beat = 60 / C.bpm, W = RH.windowSec(beat, C);

// 1) 기본 판정
var t = RH.makeTurn(['left', 'right', 'jump', 'freeze'], 10, beat, C);
ok(RH.judge(t, 'left', 10.0).label === '좋아요', '정확히 → 좋아요');
ok(RH.judge(t, 'left', 10.01).type === 'dup', '같은 박자 두 번째 → dup');
var r = RH.judge(t, 'right', 10 + beat - 0.2);
ok(r.type === 'hit' && r.label === '조금 빨랐어요', '200ms 빨리 → 성공(조금 빨랐어요)');
r = RH.judge(t, 'jump', 10 + 2 * beat + 0.2);
ok(r.type === 'hit' && r.label === '조금 늦었어요', '200ms 늦게 → 성공(조금 늦었어요)');
r = RH.judge(t, 'freeze', 10 + 3 * beat + W + 0.02);
ok(r.type === 'stray', '범위 밖 → 박자 밖');
RH.close(t, 100);
var res = RH.result(t);
ok(res.hits === 3 && res.pass, '4개 중 3개 성공 → 세트 성공');

// 2) 다른 동작 / 쉼
t = RH.makeTurn(['left', 'rest', 'right', 'rest'], 0, beat, C);
ok(RH.judge(t, 'right', 0).type === 'wrong', '다른 동작 → 실패');
ok(RH.judge(t, 'right', 0.02).type === 'dup', '틀린 뒤 고쳐 누르기도 같은 박자면 판정 안 함');
ok(RH.judge(t, 'freeze', beat).type === 'rest', '쉼 박에 누름 → 실패');
RH.judge(t, 'right', 2 * beat);
RH.close(t, 100);
ok(t.beats[3].result === 'hit', '안 누른 쉼 → 성공');
ok(!RH.result(t).pass, '2/4 → 세트 실패');

// 3) 마구 누르기: 박자마다 네 버튼 모두
var acts = ['left', 'right', 'jump', 'freeze'];
t = RH.makeTurn(['left', 'right', 'jump', 'freeze'], 0, beat, C);
for (var i = 0; i < 4; i++) acts.forEach(function (a, k) { RH.judge(t, a, i * beat + k * 0.03); });
RH.close(t, 100);
ok(!RH.result(t).pass, '박자마다 네 버튼 다 누르기 → 실패');
// 사이사이 계속 누르기(100ms 마다 무작위)
var passMash = 0;
for (var trial = 0; trial < 300; trial++) {
  t = RH.makeTurn(['left', 'right', 'jump', 'freeze', 'left', 'rest', 'right', 'rest'], 0, beat, C);
  for (var s = -0.3; s < 8 * beat; s += 0.1) RH.judge(t, acts[Math.floor(Math.random() * 4)], s);
  RH.close(t, 100);
  if (RH.result(t).pass) passMash++;
}
ok(passMash === 0, '0.1초마다 아무 버튼 → 성공 ' + passMash + '/300');
// 박자마다 무작위 버튼 하나(정답률 1/4)
var passRand = 0;
for (trial = 0; trial < 2000; trial++) {
  t = RH.makeTurn(['left', 'right', 'jump', 'freeze'], 0, beat, C);
  for (i = 0; i < 4; i++) RH.judge(t, acts[Math.floor(Math.random() * 4)], i * beat);
  RH.close(t, 100);
  if (RH.result(t).pass) passRand++;
}
ok(passRand / 2000 < 0.08, '박자마다 아무 버튼 하나 → 세트 성공률 ' + (passRand / 20).toFixed(1) + '%');

// 4) 미션 성공 기준
ok(RH.mission([{ pass: true }, { pass: false }, { pass: true }], C).pass, '3세트 중 2세트 → 성공');
ok(!RH.mission([{ pass: true }, { pass: false }, { pass: false }], C).pass, '3세트 중 1세트 → 실패');

// 5) 데이터
var ids = {};
Object.keys(D.MISSIONS).forEach(function (band) {
  ok(D.GRADES[band], band + ' 학년 설정');
  D.MISSIONS[band].forEach(function (m) {
    ok(!ids[m.id], '미션 id 중복 ' + m.id); ids[m.id] = 1;
    m.pattern.forEach(function (a) { ok(D.ACTIONS[a], m.id + ' 동작 이름 ' + a); });
    ok(m.pattern[0] !== 'rest', m.id + ' 첫 박은 쉼이 아님');
    ok(band === 'low' ? m.pattern.length === 4 : m.pattern.length === 8, m.id + ' 길이');
  });
});
ok(D.MISSIONS.middle.some(function (m) { return m.pattern.indexOf('rest') >= 0; }), '3~4학년에 쉼');
ok(JSON.stringify(RH.hiddenCards(8, 1)) === JSON.stringify([false, true, true, true, true, true, true, true]), '기억 도전 마지막 세트는 첫 카드만');
ok(RH.hiddenCards(8, 0.5).filter(Boolean).length === 4, '기억 도전 절반 가림');
// 빠른 속도에서도 판정 범위가 겹치지 않음
Object.keys(D.GRADES).forEach(function (b) { var bs = 60 / D.GRADES[b].bpm; ok(RH.windowSec(bs, C) * 2 < bs, b + ' 판정 범위 겹침 없음'); });

console.log((fails ? '✗ ' + fails + '개 실패' : '✓ 모두 통과') + ' (' + checks + '개 점검)');
process.exit(fails ? 1 : 0);
