/*
 * 별소리 음악당 — 박자 판정 (화면·소리와 분리된 순수 로직)
 * ------------------------------------------------------------
 * 시간은 모두 오디오 시계(초). 키보드와 터치는 같은 judge() 하나로 판정합니다.
 *   turn = makeTurn(pattern, startTime, beatSec, cfg)   따라 하기 한 세트
 *   judge(turn, action, t)  → { type, beat, delta, label }
 *       type: hit(성공) | wrong(다른 동작) | rest(쉼 박에 누름) | stray(박자가 아닌 때) | dup(이미 판정한 박자에 또 누름)
 *   close(turn, now)        → 판정 범위가 끝난 박자를 마무리(누르지 않은 동작 = 놓침, 누르지 않은 쉼 = 성공)
 *   result(turn)            → { hits, total, strays, need, pass }
 *   mission(results, cfg)   → { passed, need, pass }
 * '멈춤(freeze)'은 Space를 눌러 포즈를 취하는 동작이고, '쉼(rest)'은 아무것도 누르지 않는 박자입니다.
 */
(function (root) {
  'use strict';
  function windowSec(beatSec, cfg) { return Math.min(cfg.windowMs / 1000, beatSec * 0.45); }

  function makeTurn(pattern, startTime, beatSec, cfg) {
    return {
      cfg: cfg, beatSec: beatSec, win: windowSec(beatSec, cfg), strays: 0,
      beats: pattern.map(function (a, i) { return { i: i, t: startTime + i * beatSec, action: a, result: null, delta: 0, label: '' }; })
    };
  }

  function nearest(turn, t) {
    var best = null, bd = Infinity;
    turn.beats.forEach(function (b) { var d = Math.abs(t - b.t); if (d <= turn.win && d < bd) { bd = d; best = b; } });
    return best;
  }

  function judge(turn, action, t) {
    t -= (turn.cfg.inputOffsetMs || 0) / 1000;
    var b = nearest(turn, t);
    if (!b) { turn.strays++; return { type: 'stray', beat: null, delta: 0, label: '박자에 맞춰요' }; }
    if (b.result) { turn.strays++; return { type: 'dup', beat: b, delta: t - b.t, label: '' }; }   // 한 박자에 한 번만
    var delta = t - b.t;
    b.delta = delta;
    if (b.action === 'rest') { b.result = 'miss'; b.label = '쉬는 박이에요'; return { type: 'rest', beat: b, delta: delta, label: b.label }; }
    if (b.action !== action) { b.result = 'miss'; b.label = '다른 동작이에요'; return { type: 'wrong', beat: b, delta: delta, label: b.label }; }
    b.result = 'hit';
    b.label = Math.abs(delta) <= turn.win * turn.cfg.perfectRatio ? '좋아요' : delta < 0 ? '조금 빨랐어요' : '조금 늦었어요';
    return { type: 'hit', beat: b, delta: delta, label: b.label };
  }

  function close(turn, now) {
    var done = [];
    turn.beats.forEach(function (b) {
      if (b.result || now <= b.t + turn.win) return;
      if (b.action === 'rest') { b.result = 'hit'; b.label = '잘 쉬었어요'; }
      else { b.result = 'miss'; b.label = '놓쳤어요'; }
      done.push(b);
    });
    return done;
  }

  function result(turn) {
    var total = turn.beats.length, hits = turn.beats.filter(function (b) { return b.result === 'hit'; }).length;
    var need = Math.ceil(total * turn.cfg.setPassRatio - 1e-9), strayMax = Math.floor(total * turn.cfg.strayRatio);
    return { hits: hits, total: total, strays: turn.strays, need: need, strayMax: strayMax, pass: hits >= need && turn.strays <= strayMax };
  }

  function mission(results, cfg) {
    var passed = results.filter(function (r) { return r && r.pass; }).length;
    return { passed: passed, need: cfg.missionPassSets, pass: passed >= cfg.missionPassSets };
  }

  // 5~6학년 기억 도전: 세트마다 가릴 카드(첫 카드는 늘 보여 줌). ratio 0.5 → 홀수 번째, 1 → 첫 카드만 보임
  function hiddenCards(n, ratio) {
    var hide = [];
    for (var i = 0; i < n; i++) hide.push(false);
    if (!ratio) return hide;
    var count = Math.min(n - 1, Math.round(n * ratio));
    // 뒤쪽부터, 고르게 퍼지도록
    var order = [];
    for (var k = n - 1; k >= 1; k -= 2) order.push(k);
    for (var m = n - 2; m >= 1; m -= 2) order.push(m);
    for (var c = 0; c < count; c++) hide[order[c]] = true;
    return hide;
  }

  var api = { makeTurn: makeTurn, judge: judge, close: close, result: result, mission: mission, windowSec: windowSec, hiddenCards: hiddenCards };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MP_MELODY_RHYTHM = api;
})(this);
