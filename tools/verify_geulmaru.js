// 우리말 글마루 문제 은행·출제 검증: node tools/verify_geulmaru.js
// 학년마다 정해진 낱말 10개(낱말마다 유형이 다른 문제 2개 = 학년 20문제, 모두 120문제), 문제 칸이 모두 차 있는지, 선택지 3개가 서로 다른지, 빈칸 문제에 빈칸이 하나인지,
// 예문이 문제 문장과 다른지, 섞은 뒤에도 정답이 그대로인지, 한 판에 낱말이 겹치지 않는지 확인합니다.
'use strict';
var G = require('../js/geulmaru/words.js');
var fails = 0;
function fail(m) { fails++; console.log('  FAIL ' + m); }

var WORDS = {
  1: ['나란히', '차례', '살금살금', '반짝반짝', '활짝', '꼭꼭', '옆', '사이', '건네다', '줍다'],
  2: ['인물', '장면', '서두르다', '머뭇거리다', '살피다', '뿌듯하다', '서운하다', '아쉽다', '다행', '안심하다'],
  3: ['사건', '순서', '중심', '요약', '과정', '원인', '결과', '짐작하다', '되돌아보다', '이어지다'],
  4: ['사실', '의견', '비교', '공통점', '차이점', '특징', '설명', '구체적', '정확하다', '구분하다'],
  5: ['주장', '근거', '반론', '설득', '뒷받침하다', '타당하다', '드러나다', '강조하다', '적절하다', '판단하다'],
  6: ['관점', '의도', '해석', '함축', '맥락', '신뢰성', '출처', '객관적', '편향', '추론']
};
var TYPES = ['meaning', 'blank', 'usage', 'situation'];

if (G.QUESTIONS.length !== 120) fail('전체 문제가 120개가 아님: ' + G.QUESTIONS.length);
var ids = {};
G.QUESTIONS.forEach(function (q) {
  var tag = q.id + ' ' + q.word;
  if (ids[q.id]) fail(tag + ' id 겹침'); ids[q.id] = true;
  ['word', 'question', 'meaning', 'example', 'hint'].forEach(function (k) { if (!q[k] || typeof q[k] !== 'string') fail(tag + ' ' + k + ' 비어 있음'); });
  if (typeof q.sentence !== 'string') fail(tag + ' sentence 없음');
  if (TYPES.indexOf(q.type) < 0) fail(tag + ' 유형 모름 ' + q.type);
  if (!Array.isArray(q.options) || q.options.length !== 3) fail(tag + ' 선택지가 3개가 아님');
  else if (new Set(q.options).size !== 3) fail(tag + ' 선택지가 겹침');
  if (!(q.correctIndex >= 0 && q.correctIndex < 3)) fail(tag + ' correctIndex 범위 밖');
  var blanks = (q.sentence.match(/___/g) || []).length;
  if (q.type === 'blank' && blanks !== 1) fail(tag + ' 빈칸 문제인데 빈칸이 ' + blanks + '개');
  if (q.type !== 'blank' && blanks) fail(tag + ' 빈칸 문제가 아닌데 빈칸이 있음');
  var plain = q.sentence.replace(/[{}]/g, '');
  if (plain && plain.indexOf(q.example) >= 0) fail(tag + ' 예문이 문제 문장과 같음');
  q.options.forEach(function (o) { if (o === q.example) fail(tag + ' 예문이 선택지와 같음'); });
  if (q.type === 'meaning' && !/\{[^}]+\}/.test(q.sentence)) fail(tag + ' 뜻 문제인데 문장에 굵은 낱말 표시가 없음');
  // 빈칸 문제: 정답을 채운 문장이 자연스러운지 눈으로 보도록 출력
  if (q.type === 'blank') console.log('  빈칸 ' + q.id + ': ' + q.sentence.replace('___', '[' + q.options[q.correctIndex] + ']'));
});

for (var g = 1; g <= 6; g++) {
  var b = G.bank(g), words = b.map(function (q) { return q.word; });
  if (b.length !== 20) fail(g + '학년 문제 수 ' + b.length);
  if (new Set(words).size !== 10) fail(g + '학년 낱말이 10개가 아님');
  WORDS[g].forEach(function (w) {
    var qs = b.filter(function (q) { return q.word === w; });
    if (qs.length !== 2) fail(g + '학년 ' + w + ' 문제가 2개가 아님: ' + qs.length);
    else {
      if (qs[0].type === qs[1].type) fail(g + '학년 ' + w + ' 두 문제 유형이 같음');
      // 한 문제의 예문이 같은 낱말 다른 문제의 문장·선택지와 같으면 답이 보이므로 막음
      qs.forEach(function (a, i) { var o = qs[1 - i], text = o.sentence.replace(/[{}]/g, '') + ' ' + o.options.join(' ');
        if (text.indexOf(a.example) >= 0) fail(a.id + ' 예문이 ' + o.id + ' 문제에 나옴'); });
      if (qs[0].example === qs[1].example) fail(g + '학년 ' + w + ' 두 문제 예문이 같음');
    }
  });
  var types = {}; b.forEach(function (q) { types[q.type] = (types[q.type] || 0) + 1; });
  if (Object.keys(types).length < 3) fail(g + '학년 문제 유형이 3가지보다 적음 ' + JSON.stringify(types));
  console.log(g + '학년 ' + G.THEMES[g] + ' · 유형 ' + JSON.stringify(types));
  // 출제 200번: 10문제·낱말 안 겹침·섞은 뒤 정답이 원래 정답 글과 같음·선택지 순서가 실제로 섞임·문제 20개가 모두 나옴
  var firstPos = {}, seenIds = {};
  for (var t = 0; t < 200; t++) {
    var r = G.makeRound(g);
    if (r.length !== 10) { fail(g + '학년 한 판이 10문제가 아님'); break; }
    if (new Set(r.map(function (it) { return it.q.word; })).size !== 10) fail(g + '학년 한 판에 낱말이 겹침');
    r.forEach(function (it) {
      if (it.options[it.correct] !== it.q.options[it.q.correctIndex]) fail(it.q.id + ' 섞은 뒤 정답이 바뀜');
      if (!G.judge(it, it.correct)) fail(it.q.id + ' 정답 판정 실패');
      [0, 1, 2].forEach(function (k) { if (k !== it.correct && G.judge(it, k)) fail(it.q.id + ' 오답을 정답으로 판정'); });
      if (new Set(it.options).size !== 3) fail(it.q.id + ' 섞은 선택지가 겹침');
    });
    firstPos[r[0].correct] = true;
    r.forEach(function (it) { seenIds[it.q.id] = true; });
  }
  if (Object.keys(firstPos).length < 3) fail(g + '학년 정답 자리가 섞이지 않음');
  if (Object.keys(seenIds).length !== 20) fail(g + '학년 200판 동안 안 나온 문제가 있음');
}

// 복습: 틀린 id 만, 선택지 다시 섞기
var rv = G.makeReview(['g3-06', 'g3-07', 'g3-01']);
if (rv.length !== 3 || rv.some(function (it) { return ['g3-06', 'g3-07', 'g3-01'].indexOf(it.q.id) < 0; })) fail('복습 문제가 틀린 문제와 다름');
// 문제 은행이 늘었을 때: 한 학년에 같은 낱말 문제가 둘 있어도 한 판에 한 번만
G.QUESTIONS.push(Object.assign({}, G.bank(1)[0], { id: 'g1-extra' }));
for (var k = 0; k < 100; k++) if (new Set(G.makeRound(1).map(function (it) { return it.q.word; })).size !== 10) { fail('같은 낱말 문제가 늘었을 때 한 판에 겹침'); break; }
G.QUESTIONS.pop();

console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과');
process.exit(fails ? 1 : 0);
