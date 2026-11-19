/*
 * 문지기의 비밀 규칙 — 규칙 정의와 퍼즐 만들기 (화면과 분리된 순수 로직)
 * ------------------------------------------------------------
 * 손님 = { badge: 'star'|'moon'|'none', item: 'key'|'lantern'|'empty' } (9가지 조합)
 * 규칙은 여기 한 곳에서만 정의하고, 기록 만들기·정답 판정·힌트·마지막 설명이 모두 같은 정의(evaluate/describe)를 씁니다.
 * 남녀·머리핀·신발색은 판정에 쓰지 않습니다(화면에서만 섞음).
 *
 * 규칙 모양
 *   { op:'is',  a }         a 이면 통과                 (한 단서 — 아이가 처음 떠올리는 '후보'로만 씀)
 *   { op:'not', a }         a 만 빼고 통과              (후보로만 씀)
 *   { op:'and', a, b }      a 그리고 b                  (1~2학년)
 *   { op:'or',  a, b }      a 또는 b                    (1~2학년)
 *   { op:'cond', c, t, e }  c 이면 t, 아니면 e          (3~4학년)
 *   { op:'xor', a, b }      a, b 중 하나만              (5~6학년)
 *   { op:'exc', a, b }      a 이면 통과, 단 b 이면 잠깐  (5~6학년, 예외)
 * 단서(atom): 배지 star·moon·none·bany(아무 배지), 손 소품 key·lantern·empty·iany(아무 소품)
 *
 * 공정성: 기록(통과·멈춤)과 맞는 '그 학년 규칙 후보'가 다음 손님에 대해 서로 다른 답을 내면 그 손님은 내지 않습니다.
 *   맞는 후보끼리 답이 같은 손님을 먼저 내고, 그런 손님이 없으면 후보를 가르는 기록을 '기록 더 보기'에 한 장 더 꺼냅니다.
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

  var BADGE_ATOMS = ['star', 'moon', 'none', 'bany'];
  var ITEM_ATOMS = ['key', 'lantern', 'empty', 'iany'];
  function kindOf(a) { return BADGE_ATOMS.indexOf(a) >= 0 ? 'badge' : 'item'; }

  function atom(a, g) {
    switch (a) {
      case 'bany': return g.badge !== 'none';
      case 'iany': return g.item !== 'empty';
      case 'star': case 'moon': case 'none': return g.badge === a;
      default: return g.item === a;
    }
  }

  // ---------- 판정 ----------
  function evaluate(rule, g) {
    switch (rule.op) {
      case 'is': return atom(rule.a, g);
      case 'not': return !atom(rule.a, g);
      case 'and': return atom(rule.a, g) && atom(rule.b, g);
      case 'or': return atom(rule.a, g) || atom(rule.b, g);
      case 'xor': return atom(rule.a, g) !== atom(rule.b, g);
      case 'exc': return atom(rule.a, g) && !atom(rule.b, g);
      case 'cond': return atom(rule.c, g) ? atom(rule.t, g) : atom(rule.e, g);
    }
    throw new Error('모르는 규칙: ' + rule.op);
  }
  // 9가지 손님에 대한 답을 비트로(같은 비트 = 같은 규칙으로 봄)
  function maskOf(rule, domain) {
    var m = 0;
    (domain || COMBOS).forEach(function (g) { if (evaluate(rule, g)) m |= 1 << comboIndex(g); });
    return m;
  }
  function bit(mask, g) { return !!(mask & (1 << comboIndex(g))); }

  // ---------- 말로 풀기 ----------
  var W = {
    // 관형(손님 앞): 별 배지를 단 손님
    adj: { star: '별 배지를 단', moon: '달 배지를 단', none: '배지가 없는', bany: '배지를 단',
      key: '열쇠를 든', lantern: '호박등을 든', empty: '빈손인', iany: '손에 무언가를 든' },
    // 이어 주기(그리고): 별 배지를 달고 열쇠를 든 손님
    conn: { star: '별 배지를 달고', moon: '달 배지를 달고', none: '배지 없이', bany: '배지를 달고',
      key: '열쇠를 들고', lantern: '호박등을 들고', empty: '빈손이고', iany: '무언가를 들고' },
    // 이름
    noun: { star: '별 배지', moon: '달 배지', none: '배지 없음', bany: '배지', key: '열쇠', lantern: '호박등', empty: '빈손', iany: '손 소품' },
    // 조건 갈래(~해야)
    need: { key: '열쇠를 들어야', lantern: '호박등을 들어야', empty: '빈손이어야', iany: '무언가를 들어야',
      star: '별 배지를 달아야', moon: '달 배지를 달아야', none: '배지가 없어야', bany: '배지를 달아야' }
  };
  var POSITIVE = { star: 1, moon: 1, bany: 1, key: 1, lantern: 1, iany: 1 };
  function josa(word, a, b) {
    var c = word.charCodeAt(word.length - 1) - 0xAC00, has = c >= 0 && c <= 11171 && c % 28 !== 0;
    return word + (has ? a : b);
  }
  // 그리고 문장은 배지를 먼저 말함
  function badgeFirst(a, b) { return kindOf(a) === 'item' && kindOf(b) === 'badge' ? [b, a] : [a, b]; }

  function describe(rule) {
    if (rule.text) return rule.text;
    var p;
    switch (rule.op) {
      case 'is': return W.adj[rule.a] + ' 손님이 통과해.';
      case 'not': return W.adj[rule.a] + ' 손님만 빼고 모두 통과해.';
      case 'and': p = badgeFirst(rule.a, rule.b); return W.conn[p[0]] + ' ' + W.adj[p[1]] + ' 손님이 통과해.';
      case 'or': p = badgeFirst(rule.a, rule.b); return W.adj[p[0]] + ' 손님이나 ' + W.adj[p[1]] + ' 손님이 통과해. 둘 다여도 통과!';
      case 'xor':
        p = badgeFirst(rule.a, rule.b);
        if (POSITIVE[p[0]] && POSITIVE[p[1]]) {
          return josa(W.noun[p[0]], '과', '와') + ' ' + W.noun[p[1]] + ' 중 하나만 있으면 통과해. 둘 다 있거나 둘 다 없으면 잠깐!';
        }
        return '‘' + W.noun[p[0]] + '’과 ‘' + W.noun[p[1]] + '’ 중 딱 하나만 맞는 손님이 통과해. 둘 다 맞거나 둘 다 아니면 잠깐!';
      case 'exc': return W.adj[rule.a] + ' 손님은 통과해. 하지만 ' + W.adj[rule.b] + ' 손님은 잠깐!';
      case 'cond': return W.adj[rule.c] + ' 손님은 ' + W.need[rule.t] + ' 하고, 나머지 손님은 ' + W.need[rule.e] + ' 통과해.';
    }
    return '';
  }
  function comboText(g) {
    var b = { star: '별 배지', moon: '달 배지', none: '배지 없음' }[g.badge];
    var i = { key: '열쇠', lantern: '호박등', empty: '빈손' }[g.item];
    return b + ' + ' + i;
  }

  // ---------- 학년별 규칙 후보(공정성 확인용) ----------
  function family(name) {
    var out = [];
    var atoms = BADGE_ATOMS.concat(ITEM_ATOMS);
    if (name === 'single') atoms.forEach(function (a) { out.push({ op: 'is', a: a }); out.push({ op: 'not', a: a }); });
    if (name === 'low') BADGE_ATOMS.forEach(function (a) { ITEM_ATOMS.forEach(function (b) { out.push({ op: 'and', a: a, b: b }); out.push({ op: 'or', a: a, b: b }); }); });
    if (name === 'middle') BADGE_ATOMS.forEach(function (c) { ITEM_ATOMS.forEach(function (t) { ITEM_ATOMS.forEach(function (e) { if (t !== e) out.push({ op: 'cond', c: c, t: t, e: e }); }); }); });
    if (name === 'high') BADGE_ATOMS.forEach(function (a) {
      ITEM_ATOMS.forEach(function (b) {
        out.push({ op: 'xor', a: a, b: b });
        out.push({ op: 'exc', a: b, b: a });   // 열쇠를 든 손님은 통과, 하지만 달 배지면 잠깐
        out.push({ op: 'exc', a: a, b: b });   // 별 배지를 단 손님은 통과, 하지만 호박등이면 잠깐
      });
    });
    return out;
  }
  var BAND_FAMILIES = { low: ['single', 'low'], middle: ['single', 'low', 'middle'], high: ['single', 'low', 'high'] };
  var maskCache = {};
  // 그 학년에서 아이가 세울 수 있는 규칙 후보(9칸 답이 같으면 하나로 침)
  function candidateMasks(band) {
    if (maskCache[band]) return maskCache[band];
    var seen = {}, out = [];
    BAND_FAMILIES[band].forEach(function (f) {
      family(f).forEach(function (r) { var m = maskOf(r); if (!seen[m]) { seen[m] = 1; out.push(m); } });
    });
    return (maskCache[band] = out);
  }
  function familyMasks(name) {
    var seen = {}, out = [];
    family(name).forEach(function (r) { var m = maskOf(r); if (!seen[m]) { seen[m] = 1; out.push(m); } });
    return out;
  }

  // ---------- 학년별로 준비한 비밀 규칙 ----------
  var RULES = {
    low: [   // 두 단서를 함께 보기
      { id: 'L1', op: 'or', a: 'star', b: 'key' },
      { id: 'L2', op: 'or', a: 'moon', b: 'lantern' },
      { id: 'L3', op: 'and', a: 'bany', b: 'iany' },
      { id: 'L4', op: 'or', a: 'none', b: 'key' },
      { id: 'L5', op: 'or', a: 'star', b: 'empty' }
    ],
    middle: [   // 한 단서에 따라 다른 단서 확인
      { id: 'M1', op: 'cond', c: 'moon', t: 'key', e: 'lantern' },
      { id: 'M2', op: 'cond', c: 'star', t: 'lantern', e: 'key' },
      { id: 'M3', op: 'cond', c: 'bany', t: 'key', e: 'empty' },
      { id: 'M4', op: 'cond', c: 'none', t: 'lantern', e: 'key' },
      { id: 'M5', op: 'cond', c: 'star', t: 'empty', e: 'iany' }
    ],
    high: [   // 하나만 맞아야 / 예외
      { id: 'H1', op: 'xor', a: 'star', b: 'key' },
      { id: 'H2', op: 'xor', a: 'moon', b: 'lantern' },
      { id: 'H3', op: 'exc', a: 'iany', b: 'moon' },
      { id: 'H4', op: 'xor', a: 'bany', b: 'iany' },
      { id: 'H5', op: 'exc', a: 'bany', b: 'lantern' }
    ]
  };
  // 조작 연습(첫 퍼즐): 별·달 배지와 열쇠·호박등만, 기록 고정
  var PRACTICE = {
    rule: { id: 'P1', op: 'cond', c: 'moon', t: 'key', e: 'lantern',
      text: '달 배지를 단 손님은 열쇠, 별 배지를 단 손님은 호박등을 들어야 통과해.' },
    records: [
      { badge: 'moon', item: 'key' }, { badge: 'star', item: 'lantern' },      // 통과
      { badge: 'moon', item: 'lantern' }, { badge: 'star', item: 'key' }       // 멈춤
    ],
    guests: [{ badge: 'moon', item: 'key' }, { badge: 'star', item: 'key' }, { badge: 'star', item: 'lantern' }]
  };

  // ---------- 기록과 맞는 후보 / 공정한 손님 ----------
  // known: [{ badge, item, pass }]
  function consistent(masks, known) {
    return masks.filter(function (m) { return known.every(function (k) { return bit(m, k) === k.pass; }); });
  }
  function isFair(masks, known, g) {
    var c = consistent(masks, known);
    return c.every(function (m) { return bit(m, g) === bit(c[0], g); });
  }

  // 간단한 난수(시드를 주면 같은 판이 다시 나옴 — 검증용)
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

  // 통과 2장·멈춤 2장 기록 고르기
  //  1) 한 단서 규칙(예: '열쇠면 통과')은 모두 틀리게 — 한 가지만 봐서는 못 풀게
  //  2) 3~6학년은 더 쉬운(1~2학년) 규칙도 되도록 틀리게
  //  3) 남는 후보가 적게, 4) 배지 없음·빈손 손님도 되도록 하나는
  function pickRecords(rule, band, rand) {
    var mask = maskOf(rule), pass = [], stop = [];
    COMBOS.forEach(function (g) { (bit(mask, g) ? pass : stop).push(g); });
    if (!pass.length || !stop.length) return null;
    var singles = familyMasks('single'), low = familyMasks('low'), cands = candidateMasks(band);
    var best = null, bestScore = null;
    pairs(pass).forEach(function (p) {
      pairs(stop).forEach(function (s) {
        var known = [p[0], p[1], s[0], s[1]].map(function (g, i) { return { badge: g.badge, item: g.item, pass: i < 2 }; });
        var singleLeft = consistent(singles, known).filter(function (m) { return m !== mask; }).length;
        var lowLeft = band === 'low' ? 0 : consistent(low, known).filter(function (m) { return m !== mask; }).length;
        var left = consistent(cands, known).length;
        var plain = known.some(function (k) { return k.badge === 'none' || k.item === 'empty'; }) ? 0 : 1;
        var score = [singleLeft, lowLeft, left, plain, rand()];
        if (!bestScore || less(score, bestScore)) { bestScore = score; best = known; }
      });
    });
    return { records: best, singleLeft: bestScore[0], lowLeft: bestScore[1], left: bestScore[2] };
  }
  // 두 장 고르기. 조합이 하나뿐이면 같은 조합을 다른 아이로 두 번(예: '달 배지 그리고 열쇠'는 통과 조합이 하나)
  function pairs(list) {
    if (list.length === 1) return [[list[0], list[0]]];
    var out = [];
    for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) out.push([list[i], list[j]]);
    return out;
  }
  function less(a, b) { for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] < b[i]; } return false; }

  /*
   * 한 라운드(판) 진행기
   *   var r = newRound({ band, rule?, rand?, guests? })
   *   r.records          처음 기록판 4장 (통과 2, 멈춤 2)
   *   r.next()           다음 손님 { badge, item, pass, extra: [새로 꺼낸 기록...] } 또는 null(끝)
   *   r.judge(g, answer) 판정(true=통과) → { correct, hint? }
   *   r.known            지금까지 보이는 모든 기록(처음 기록 + 더 본 기록 + 판정한 손님)
   */
  function newRound(opt) {
    var band = opt.band, rand = opt.rand || Math.random;
    var rule = opt.rule || RULES[band][Math.floor(rand() * RULES[band].length)];
    var practice = !!opt.practice;
    var domain = practice ? COMBOS.filter(function (g) { return g.badge !== 'none' && g.item !== 'empty'; }) : COMBOS;
    var masks = practice ? [maskOf(rule)] : candidateMasks(band);
    var rec;
    if (opt.records) rec = { records: opt.records.map(function (g) { return { badge: g.badge, item: g.item, pass: evaluate(rule, g) }; }) };
    else rec = pickRecords(rule, band, rand);
    var R = {
      band: band, rule: rule, text: describe(rule), practice: practice,
      records: rec.records, extras: [], judged: [], given: { pass: false, stop: false }, total: opt.guests || 5, count: 0, script: opt.script || null,
      known: rec.records.slice()
    };
    var lastPass = null;
    R.next = function () {
      if (R.count >= R.total) return null;
      var extra = [];
      if (R.script) {
        var s = R.script[R.count];
        R.count++;
        return { badge: s.badge, item: s.item, pass: evaluate(rule, s), extra: extra };
      }
      for (var guard = 0; guard < 12; guard++) {
        var seen = function (g) { return R.known.some(function (k) { return sameCombo(k, g); }); };
        var fair = domain.filter(function (g) { return isFair(masks, R.known, g); });
        var fresh = fair.filter(function (g) { return !seen(g); });
        var unseen = domain.filter(function (g) { return !seen(g); });
        var pool = fresh.length ? fresh : (unseen.length ? null : fair);
        // 통과·잠깐 손님이 한 판에 적어도 한 명씩: 아직 안 나온 답이 있으면 중간부터 그 답을 먼저,
        // 마지막 손님인데도 없으면 기록에 있던 조합(이미 공정함)이라도 그 답으로
        var missing = R.given.pass && !R.given.stop ? false : R.given.stop && !R.given.pass ? true : null;
        if (missing !== null && R.count >= Math.floor(R.total / 2)) {
          var want = function (g) { return evaluate(rule, g) === missing; };
          if (pool && pool.some(want)) pool = pool.filter(want);
          else if (R.count === R.total - 1) { var seenOk = fair.filter(want); if (seenOk.length) pool = seenOk; }
        }
        if (pool) {
          // 정답이 한쪽으로만 몰리지 않게: 바로 앞 손님과 다른 답을 조금 더 자주
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
    return R;
  }

  // ---------- 힌트: 정답을 말하지 않고 비교할 기록을 가리킴 ----------
  var SUBJ_BADGE = { star: '같은 별 배지를 단 두 손님은', moon: '같은 달 배지를 단 두 손님은', none: '배지가 없는 두 손님은' };
  var SUBJ_ITEM = { key: '같은 열쇠를 든 두 손님은', lantern: '같은 호박등을 든 두 손님은', empty: '빈손인 두 손님은' };
  var ONE_BADGE = { star: '별 배지를 단 손님', moon: '달 배지를 단 손님', none: '배지가 없는 손님' };
  var ONE_ITEM = { key: '열쇠를 든 손님', lantern: '호박등을 든 손님', empty: '빈손인 손님' };
  function hint(rule, known, g) {
    var sameB = known.filter(function (k) { return k.badge === g.badge; });
    var sameI = known.filter(function (k) { return k.item === g.item; });
    var p = splitPair(sameB);
    if (p) return { text: SUBJ_BADGE[g.badge] + ' 손에 뭘 들고 있었지?', show: p };
    p = splitPair(sameI);
    if (p) return { text: SUBJ_ITEM[g.item] + ' 어떤 배지를 달고 있었지?', show: p };
    if (sameB.length && sameI.length) {
      return { text: '이 손님처럼 ' + ONE_BADGE[g.badge] + '과 ' + ONE_ITEM[g.item] + '을 기록에서 찾아 비교해 봐.', show: [sameB[0], sameI[0]] };
    }
    if (sameB.length) return { text: '기록 속 ' + ONE_BADGE[g.badge] + '은 무엇을 들고 있었고, 지나갔을까?', show: sameB.slice(0, 2) };
    if (sameI.length) return { text: '기록 속 ' + ONE_ITEM[g.item] + '은 어떤 배지를 달았고, 지나갔을까?', show: sameI.slice(0, 2) };
    var byOp = {
      and: '통과한 손님은 배지와 손 소품을 둘 다 살펴봐.',
      or: '통과한 손님들이 모두 같은 걸 가졌을까? 하나만 맞아도 되는지 살펴봐.',
      cond: '배지에 따라 들어야 하는 소품이 달라지는지 살펴봐.',
      xor: '배지와 소품이 둘 다 맞는 손님은 어떻게 됐는지 살펴봐.',
      exc: '통과할 것 같은데 멈춘 손님이 있는지 살펴봐.'
    };
    return { text: byOp[rule.op] || '통과한 손님과 멈춘 손님을 하나씩 비교해 봐.', show: [] };
  }
  // 한 단서가 같은데 결과가 다른 두 기록
  function splitPair(list) {
    var a = list.filter(function (k) { return k.pass; })[0], b = list.filter(function (k) { return !k.pass; })[0];
    return a && b ? [a, b] : null;
  }

  // ---------- 친구랑 문지기: 카드로 규칙 만들기 ----------
  // 학년에 따라 쓸 수 있는 연결 방식
  var LINKS = {
    low: ['and', 'or'],
    middle: ['and', 'or', 'cond'],
    high: ['and', 'or', 'xor', 'exc']
  };
  var LINK_LABEL = { and: '그리고', or: '또는', cond: '~이면 / 아니면', xor: '둘 중 하나만', exc: '하지만(예외)' };
  // parts: { link, badge, item, item2 } → 규칙
  function buildRule(parts) {
    var l = parts.link;
    if (l === 'cond') return { op: 'cond', c: parts.badge, t: parts.item, e: parts.item2 };
    if (l === 'exc') return { op: 'exc', a: parts.item, b: parts.badge };
    return { op: l, a: parts.badge, b: parts.item };
  }
  // 친구가 만든 규칙으로 놀 수 있는지(통과·멈춤 손님이 둘 이상씩)
  function checkRule(rule) {
    if (rule.op === 'cond' && rule.t === rule.e) return { ok: false, msg: '두 소품을 서로 다르게 골라 줘.' };
    var m = maskOf(rule), n = 0;
    COMBOS.forEach(function (g) { if (bit(m, g)) n++; });
    if (n < 1) return { ok: false, msg: '이 규칙으로는 아무도 지나갈 수 없어. 다른 카드를 골라 볼까?' };
    if (COMBOS.length - n < 1) return { ok: false, msg: '이 규칙으로는 모든 손님이 지나가. 다른 카드를 골라 볼까?' };
    return { ok: true };
  }

  var API = {
    BADGES: BADGES, ITEMS: ITEMS, COMBOS: COMBOS, RULES: RULES, PRACTICE: PRACTICE, LINKS: LINKS, LINK_LABEL: LINK_LABEL,
    evaluate: evaluate, describe: describe, comboText: comboText, maskOf: maskOf, candidateMasks: candidateMasks, familyMasks: familyMasks,
    consistent: consistent, isFair: isFair, pickRecords: pickRecords, newRound: newRound, hint: hint,
    buildRule: buildRule, checkRule: checkRule, rng: rng, shuffle: shuffle, sameCombo: sameCombo, bit: bit
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.MP_GATE_RULES = API;
})(this);
