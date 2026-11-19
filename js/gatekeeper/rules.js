/*
 * 문지기의 비밀 규칙 — 규칙 정의와 퍼즐 만들기 (화면과 분리된 순수 로직)
 * ------------------------------------------------------------
 * 손님 = { badge: 'star'|'moon'|'none', item: 'key'|'lantern'|'empty' }
 * 규칙은 여기 한 곳에서만 정의하고, 기록 만들기·정답 판정·힌트·규칙 맞히기 퀴즈·마지막 설명이 모두 같은 정의를 씁니다.
 * 남녀·머리핀·신발색은 판정에 쓰지 않습니다(화면에서만 섞음).
 *
 * 한 판 = 3단계 (단계마다 비밀 규칙이 하나, 손님 3명, 끝나면 '내 규칙이 뭘까?' 퀴즈)
 *   1단계  배지 하나만 보기      예) 별 배지면 통과
 *   2단계  손 소품 하나만 보기   예) 호박등을 들면 통과
 *   3단계  학년별 도전
 *          1~2학년  한 가지 그대로(다른 단서)      — 별·달 × 열쇠·호박등 4가지 모습만
 *          3~4학년  둘 다 있어야(그리고)           — 빈손도 나옴
 *          5~6학년  둘 중 하나만 있어도(또는) / ~만 빼고 모두 — 배지 없음·빈손까지 전부
 *
 * 규칙 모양: { op:'is', a } | { op:'not', a } | { op:'and', a, b } | { op:'or', a, b }
 *   a·b: 배지 star·moon·none, 손 소품 key·lantern·empty
 *
 * 공정성: 지금 보이는 기록과 맞는 '그 단계 규칙 후보'가 다음 손님에 대해 서로 다른 답을 내면 그 손님은 내지 않습니다.
 *   맞는 후보끼리 답이 같은 손님을 먼저 내고, 그런 손님이 없으면 후보를 가르는 기록을 한 장 더 꺼냅니다.
 * 브라우저: window.MP_GATE_RULES / node: module.exports
 */
(function (root) {
  'use strict';

  var BADGES = ['star', 'moon', 'none'];
  var ITEMS = ['key', 'lantern', 'empty'];
  var COMBOS = [];
  BADGES.forEach(function (b) { ITEMS.forEach(function (i) { COMBOS.push({ badge: b, item: i }); }); });
  function comboIndex(g) { return BADGES.indexOf(g.badge) * 3 + ITEMS.indexOf(g.item); }
  function sameCombo(a, b) { return a.badge === b.badge && a.item === b.item; }
  function kindOf(a) { return BADGES.indexOf(a) >= 0 ? 'badge' : 'item'; }

  // 나올 수 있는 손님 모습
  var DOMAINS = {
    d4: { badges: ['star', 'moon'], items: ['key', 'lantern'] },
    d6: { badges: ['star', 'moon'], items: ['key', 'lantern', 'empty'] },
    d9: { badges: BADGES, items: ITEMS }
  };
  function domainCombos(key) {
    var d = DOMAINS[key];
    return COMBOS.filter(function (g) { return d.badges.indexOf(g.badge) >= 0 && d.items.indexOf(g.item) >= 0; });
  }
  function domainAtoms(key) { return DOMAINS[key].badges.concat(DOMAINS[key].items); }

  function atom(a, g) { return kindOf(a) === 'badge' ? g.badge === a : g.item === a; }

  // ---------- 판정 ----------
  function evaluate(rule, g) {
    switch (rule.op) {
      case 'is': return atom(rule.a, g);
      case 'not': return !atom(rule.a, g);
      case 'and': return atom(rule.a, g) && atom(rule.b, g);
      case 'or': return atom(rule.a, g) || atom(rule.b, g);
    }
    throw new Error('모르는 규칙: ' + rule.op);
  }
  function maskOf(rule, combos) {
    var m = 0;
    (combos || COMBOS).forEach(function (g) { if (evaluate(rule, g)) m |= 1 << comboIndex(g); });
    return m;
  }
  function bit(mask, g) { return !!(mask & (1 << comboIndex(g))); }

  // ---------- 말로 풀기 ----------
  var ADJ = { star: '별 배지를 단', moon: '달 배지를 단', none: '배지가 없는', key: '열쇠를 든', lantern: '호박등을 든', empty: '빈손인' };
  var CONN = { star: '별 배지를 달고', moon: '달 배지를 달고', none: '배지 없이' };
  var NOUN = { star: '별 배지', moon: '달 배지', none: '배지 없음', key: '열쇠', lantern: '호박등', empty: '빈손' };
  function badgeFirst(a, b) { return kindOf(a) === 'item' ? [b, a] : [a, b]; }
  function describe(rule) {
    var p;
    switch (rule.op) {
      case 'is': return ADJ[rule.a] + ' 손님이 통과해.';
      case 'not': return ADJ[rule.a] + ' 손님만 빼고 모두 통과해.';
      case 'and': p = badgeFirst(rule.a, rule.b); return CONN[p[0]] + ' ' + ADJ[p[1]] + ' 손님이 통과해.';
      case 'or': p = badgeFirst(rule.a, rule.b); return ADJ[p[0]] + ' 손님이나 ' + ADJ[p[1]] + ' 손님이 통과해. 둘 다여도 통과!';
    }
    return '';
  }
  function comboText(g) { return NOUN[g.badge] + ' + ' + NOUN[g.item]; }
  function atomsOf(rule) { return rule.op === 'is' || rule.op === 'not' ? [rule.a] : badgeFirst(rule.a, rule.b); }

  // ---------- 규칙 후보(공정성·퀴즈용) ----------
  // shapes: 'single'(is·not) | 'and' | 'or'
  function family(domainKey, shapes) {
    var d = DOMAINS[domainKey], out = [];
    // '~이면 통과'를 '~만 빼고'보다 먼저(답이 같으면 쉬운 말로 보여 주게)
    if (shapes.indexOf('single') >= 0) {
      domainAtoms(domainKey).forEach(function (a) { out.push({ op: 'is', a: a }); });
      domainAtoms(domainKey).forEach(function (a) { out.push({ op: 'not', a: a }); });
    }
    ['and', 'or'].forEach(function (op) {
      if (shapes.indexOf(op) < 0) return;
      d.badges.forEach(function (a) { d.items.forEach(function (b) { out.push({ op: op, a: a, b: b }); }); });
    });
    return out;
  }
  // 손님 모습마다 답이 같은 규칙은 하나로(먼저 나온 쉬운 모양을 대표로). 아무도/모두 통과는 뺌
  var famCache = {};
  function candidates(domainKey, shapes) {
    var key = domainKey + '|' + shapes.join(','), combos = domainCombos(domainKey);
    if (famCache[key]) return famCache[key];
    var full = 0;
    combos.forEach(function (g) { full |= 1 << comboIndex(g); });
    var seen = {}, out = [];
    family(domainKey, shapes).forEach(function (r) {
      var m = maskOf(r, combos);
      if (m === 0 || m === full || seen[m]) return;
      seen[m] = 1; out.push({ rule: r, mask: m });
    });
    return (famCache[key] = out);
  }
  function masksOf(c) { return c.map(function (x) { return x.mask; }); }

  // ---------- 단계 정하기 ----------
  var BAND = {
    low: { domain: 'd4', shapes: ['single'], tip: '마지막 단계! 이번에도 한 가지만 보면 돼.' },
    middle: { domain: 'd6', shapes: ['single', 'and'], tip: '마지막 단계! 두 가지가 모두 있어야 할 수도 있어. 빈손인 손님도 와.' },
    high: { domain: 'd9', shapes: ['single', 'and', 'or'], tip: '마지막 단계! 둘 중 하나만 있어도 되거나, 하나만 빼고 모두 통과일 수도 있어. 배지 없는 손님, 빈손인 손님도 와.' }
  };
  var STAGE_TIPS = ['1단계! 한 가지만 보면 돼.', '2단계! 이번에도 한 가지만. 아까와 다른 곳을 볼 수도 있어.'];
  function pick(list, rand) { return list[Math.floor(rand() * list.length)]; }
  // used: 이 판에서 이미 나온 규칙 (1~2학년 3단계는 다른 단서로)
  function stagePlan(band, n, rand, used) {
    rand = rand || Math.random; used = used || [];
    if (n === 1) return { rule: { op: 'is', a: pick(['star', 'moon'], rand) }, domain: 'd4', shapes: ['single'], tip: STAGE_TIPS[0] };
    if (n === 2) return { rule: { op: 'is', a: pick(['key', 'lantern'], rand) }, domain: 'd4', shapes: ['single'], tip: STAGE_TIPS[1] };
    var B = BAND[band], rule;
    if (band === 'low') {
      var usedA = used.map(function (r) { return r.a; });
      var left = ['star', 'moon', 'key', 'lantern'].filter(function (a) { return usedA.indexOf(a) < 0; });
      rule = { op: 'is', a: pick(left, rand) };
    } else if (band === 'middle') {
      rule = { op: 'and', a: pick(['star', 'moon'], rand), b: pick(['key', 'lantern'], rand) };
    } else {
      rule = rand() < 0.6
        ? { op: 'or', a: pick(['star', 'moon'], rand), b: pick(['key', 'lantern'], rand) }
        : { op: 'not', a: pick(['star', 'moon', 'key', 'lantern'], rand) };
    }
    return { rule: rule, domain: B.domain, shapes: B.shapes, tip: B.tip };
  }

  // ---------- 기록과 맞는 후보 / 공정한 손님 ----------
  function consistent(masks, known) {
    return masks.filter(function (m) { return known.every(function (k) { return bit(m, k) === k.pass; }); });
  }
  function isFair(masks, known, g) {
    var c = consistent(masks, known);
    return c.every(function (m) { return bit(m, g) === bit(c[0], g); });
  }

  function rng(seed) {
    if (seed == null) return Math.random;
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function shuffle(a, rand) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function less(a, b) { for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] < b[i]; } return false; }
  // 두 장 고르기(같은 모습을 다른 아이로 두 번 써도 됨)
  function pairs(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) for (var j = i; j < list.length; j++) out.push([list[i], list[j]]);
    return out;
  }

  // 통과 2장·잠깐 2장 기록 고르기
  //  1) 기록만으로 규칙 후보가 되도록 하나로 좁혀지게
  //  2) 기록에 없는 모습인데 답이 정해진 손님이 남게(새 모습 손님을 낼 수 있게)
  //  3) 같은 모습 카드는 되도록 적게
  function pickRecords(rule, domainKey, masks, rand) {
    var combos = domainCombos(domainKey), mask = maskOf(rule, combos), pass = [], stop = [];
    combos.forEach(function (g) { (bit(mask, g) ? pass : stop).push(g); });
    if (!pass.length || !stop.length) return null;
    var best = null, bestScore = null;
    pairs(pass).forEach(function (p) {
      pairs(stop).forEach(function (s) {
        var known = [p[0], p[1], s[0], s[1]].map(function (g, i) { return { badge: g.badge, item: g.item, pass: i < 2 }; });
        var left = consistent(masks, known).length;
        var fresh = combos.filter(function (g) {
          return !known.some(function (k) { return sameCombo(k, g); }) && isFair(masks, known, g);
        }).length;
        var dups = (p[0] === p[1] ? 1 : 0) + (s[0] === s[1] ? 1 : 0);
        var score = [left, fresh ? 0 : 1, dups, -fresh, rand()];
        if (!bestScore || less(score, bestScore)) { bestScore = score; best = known; }
      });
    });
    return best;
  }

  /*
   * 한 단계 진행기
   *   var r = newRound({ rule, domain, shapes, guests?, rand? })
   *   r.records          처음 기록판 4장 (통과 2, 잠깐 2)
   *   r.next()           다음 손님 { badge, item, pass, extra: [새로 꺼낸 기록...] } 또는 null(끝)
   *   r.judge(g, answer) 판정(true=통과) → { correct, hint? }
   *   r.known            지금까지 보이는 모든 기록(처음 기록 + 새로 꺼낸 기록 + 판정한 손님)
   *   r.quiz()           '내 규칙이 뭘까?' 보기 3개(정답 1 + 지금 기록과 안 맞는 규칙 2)
   */
  function newRound(opt) {
    var rand = opt.rand || Math.random, rule = opt.rule, domainKey = opt.domain || 'd9';
    var shapes = opt.shapes || ['single'];
    var domain = domainCombos(domainKey);
    var cands = candidates(domainKey, shapes), masks = masksOf(cands);
    var records = pickRecords(rule, domainKey, masks, rand);
    var R = {
      rule: rule, text: describe(rule), domain: domainKey, shapes: shapes,
      records: records, extras: [], judged: [], total: opt.guests || 3, count: 0,
      given: { pass: false, stop: false }, known: records.slice()
    };
    var lastPass = null;
    R.next = function () {
      if (R.count >= R.total) return null;
      var extra = [];
      for (var guard = 0; guard < 12; guard++) {
        var seen = function (g) { return R.known.some(function (k) { return sameCombo(k, g); }); };
        var fair = domain.filter(function (g) { return isFair(masks, R.known, g); });
        var fresh = fair.filter(function (g) { return !seen(g); });
        var unseen = domain.filter(function (g) { return !seen(g); });
        var pool = fresh.length ? fresh : (unseen.length ? null : fair);
        // 통과·잠깐 손님이 한 단계에 한 명씩은: 아직 안 나온 답이 있으면 그 답을 먼저,
        // 마지막 손님인데도 없으면 기록에 있던 모습(이미 공정함)이라도 그 답으로
        var missing = R.given.pass && !R.given.stop ? false : R.given.stop && !R.given.pass ? true : null;
        if (missing !== null && R.count >= R.total - 2) {
          var want = function (g) { return evaluate(rule, g) === missing; };
          if (pool && pool.some(want)) pool = pool.filter(want);
          else if (R.count === R.total - 1) { var seenOk = fair.filter(want); if (seenOk.length) pool = seenOk; }
        }
        if (pool) {
          var weighted = [];
          pool.forEach(function (g) { var p = evaluate(rule, g); weighted.push(g); if (lastPass !== null && p !== lastPass) weighted.push(g); });
          var g = weighted[Math.floor(rand() * weighted.length)];
          var guest = { badge: g.badge, item: g.item, pass: evaluate(rule, g), extra: extra };
          lastPass = guest.pass; R.count++; R.given[guest.pass ? 'pass' : 'stop'] = true;
          return guest;
        }
        // 공정한 새 손님이 없음 → 맞는 후보들을 가장 고르게 가르는 기록을 한 장 더 꺼냄
        var cons = consistent(masks, R.known), bestG = null, bestSplit = -1;
        shuffle(unseen, rand).forEach(function (g) {
          var t = cons.filter(function (m) { return bit(m, g); }).length, split = Math.min(t, cons.length - t);
          if (split > bestSplit) { bestSplit = split; bestG = g; }
        });
        var rec2 = { badge: bestG.badge, item: bestG.item, pass: evaluate(rule, bestG), extra: true };
        R.extras.push(rec2); R.known.push(rec2); extra.push(rec2);
      }
      return null;
    };
    R.judge = function (g, answer) {
      var correct = answer === evaluate(rule, g);
      if (correct) {
        var k = { badge: g.badge, item: g.item, pass: evaluate(rule, g), judged: true };
        R.judged.push(k); R.known.push(k);
        return { correct: true };
      }
      return { correct: false, hint: hint(rule, R.known, g) };
    };
    // 보기: 정답 + 지금까지 기록과 안 맞는 규칙 2개(되도록 같은 모양, 같은 단서를 쓰는 것)
    R.quiz = function (r2) {
      r2 = r2 || rand;
      var mask = maskOf(rule, domain);
      var wrong = cands.filter(function (c) { return c.mask !== mask && consistent([c.mask], R.known).length === 0; });
      var a = atomsOf(rule);
      function score(c) {
        var s = 0;
        if (c.rule.op === rule.op) s += 2;
        if (atomsOf(c.rule).some(function (x) { return a.indexOf(x) >= 0; })) s += 1;
        if (c.rule.op === 'not' && rule.op !== 'not') s -= 3;   // 쉬운 단계 보기에 '~만 빼고'는 헷갈림
        return s + r2() * 0.9;
      }
      wrong.sort(function (x, y) { return score(y) - score(x); });
      return shuffle([rule].concat(wrong.slice(0, 2).map(function (c) { return c.rule; })), r2);
    };
    return R;
  }

  // ---------- 돋보기 힌트: 정답 대신 볼 곳 하나 ----------
  var SUBJ_BADGE = { star: '별 배지를 단 손님들', moon: '달 배지를 단 손님들', none: '배지가 없는 손님들' };
  var SUBJ_ITEM = { key: '열쇠를 든 손님들', lantern: '호박등을 든 손님들', empty: '빈손인 손님들' };
  function hint(rule, known, g) {
    var sameB = known.filter(function (k) { return k.badge === g.badge; });
    var sameI = known.filter(function (k) { return k.item === g.item; });
    function mixed(list) { var o = {}; list.forEach(function (k) { o[k.pass] = 1; }); return o[true] && o[false]; }
    // 같은 배지 손님이 모두 같은 쪽에 있으면 → 그 배지를 보라고
    if (sameB.length && !mixed(sameB)) return { text: SUBJ_BADGE[g.badge] + '을 봐! 모두 어느 쪽에 있지?', show: sameB };
    if (sameI.length && !mixed(sameI)) return { text: SUBJ_ITEM[g.item] + '을 봐! 모두 어느 쪽에 있지?', show: sameI };
    var both = known.filter(function (k) { return sameCombo(k, g); });
    if (both.length) return { text: '이 손님과 배지도 소품도 똑같은 손님이 기록에 있어! 찾아봐.', show: both };
    if (sameB.length) return { text: SUBJ_BADGE[g.badge] + '을 봐. 손에 든 것도 함께 살펴봐!', show: sameB };
    if (sameI.length) return { text: SUBJ_ITEM[g.item] + '을 봐. 배지도 함께 살펴봐!', show: sameI };
    return { text: '통과한 손님들끼리 같은 점을 찾아봐!', show: [] };
  }

  // ---------- 친구랑 문지기: 카드로 규칙 만들기 ----------
  var FRIEND = {
    low: { domain: 'd4', shapes: ['single'], links: ['one'] },
    middle: { domain: 'd6', shapes: ['single', 'and'], links: ['one', 'and'] },
    high: { domain: 'd9', shapes: ['single', 'and', 'or'], links: ['one', 'and', 'or', 'not'] }
  };
  var LINK_LABEL = { one: '카드 1장', and: '그리고 (둘 다)', or: '또는 (하나만 있어도)', not: '~만 빼고 모두' };
  // parts: { link, card, badge, item } → 규칙
  function buildRule(parts) {
    if (parts.link === 'one') return { op: 'is', a: parts.card };
    if (parts.link === 'not') return { op: 'not', a: parts.card };
    return { op: parts.link, a: parts.badge, b: parts.item };
  }
  function checkRule(rule, band) {
    var combos = domainCombos(FRIEND[band].domain), n = 0;
    combos.forEach(function (g) { if (evaluate(rule, g)) n++; });
    if (n < 1) return { ok: false, msg: '이 규칙으로는 아무도 지나갈 수 없어. 다른 카드를 골라 볼까?' };
    if (n === combos.length) return { ok: false, msg: '이 규칙으로는 모든 손님이 지나가. 다른 카드를 골라 볼까?' };
    return { ok: true };
  }

  var API = {
    BADGES: BADGES, ITEMS: ITEMS, COMBOS: COMBOS, DOMAINS: DOMAINS, BAND: BAND, FRIEND: FRIEND, LINK_LABEL: LINK_LABEL, NOUN: NOUN,
    evaluate: evaluate, describe: describe, comboText: comboText, atomsOf: atomsOf, kindOf: kindOf, maskOf: maskOf,
    domainCombos: domainCombos, domainAtoms: domainAtoms, candidates: candidates, consistent: consistent, isFair: isFair,
    stagePlan: stagePlan, pickRecords: pickRecords, newRound: newRound, hint: hint,
    buildRule: buildRule, checkRule: checkRule, rng: rng, shuffle: shuffle, sameCombo: sameCombo, bit: bit
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.MP_GATE_RULES = API;
})(this);
