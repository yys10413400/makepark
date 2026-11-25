/*
 * 토리네 도시락: 학년별 주문과 정답 판정
 * ------------------------------------------------------------
 * 음식은 12가지(ALL). 한 판마다 그중 4가지를 골라 아래 재료 버튼으로 내고(round.foods), 주문은 그 4가지로만 만듭니다.
 * 주문 하나 = {
 *   text   : 토리가 말하는 주문. {중괄호} 안은 딸기색 큰 글자로 보임
 *   boxes  : 도시락 개수(1 또는 2)
 *   start  : 처음 담겨 있는 재료(도시락마다 { 재료: 개수 }), 없으면 빈 도시락
 *   check  : 담은 상태(도시락마다 { 음식 id: 개수 })를 받아 맞으면 null, 틀리면 짧은 힌트 문장
 *   answer : 정답 예시(검증용)
 * }
 * 학년마다 주문 3칸의 '유형'(T)과 숫자 범위는 고정이고(난이도 그대로), 판마다 음식과 숫자만 바꿉니다(GEN).
 * 처음 하는 학년의 첫 판은 정해진 예시 주문(FIRST — 하는 법 설명과 맞춤).
 * 판정은 담은 순서와 상관없이 재료별 개수만 봅니다. 화면은 js/picnic/ui.js, 검증: node tools/verify_picnic.js
 */
(function (root) {
  'use strict';
  // 음식 그림: assets/picnic/food-<id>.webp (python -I tools/build_picnic.py 가 assets/picnic-src/foods-1~3 에서 잘라 냄)
  var ALL = ['jumeokbap', 'gimbap', 'eggroll', 'tangerine', 'yakgwa', 'songpyeon-green', 'skewer', 'songpyeon-pink',
    'flowercake', 'tteokgalbi', 'apple', 'songpyeon-white'];
  var NAME = {
    jumeokbap: '주먹밥', gimbap: '김밥', eggroll: '달걀말이', tangerine: '귤', yakgwa: '약과', 'songpyeon-green': '쑥송편',
    skewer: '꼬치전', 'songpyeon-pink': '분홍 송편', flowercake: '꽃떡', tteokgalbi: '떡갈비', apple: '사과', 'songpyeon-white': '흰 송편'
  };
  var SONGPYEON = ['songpyeon-green', 'songpyeon-pink', 'songpyeon-white'];   // 모양이 같아 한 판에 하나만(헷갈리지 않게)
  var FIRST_SET = ['jumeokbap', 'gimbap', 'tangerine', 'eggroll'];   // 처음 판(예시 주문)의 재료 버튼
  var FOODS = ALL;   // 판정은 12가지 모두 셈(다른 판 재료가 섞일 일은 없지만 안전하게)
  var BOX_MAX = 20;   // 도시락 하나에 담을 수 있는 최대 개수(낱개를 셀 수 있게)

  // 받침에 맞는 조사: josa('귤', '이', '가') → '귤이', josa('귤', '으로', '로') → '귤로'(ㄹ 받침은 '로')
  function josa(w, a, b) {
    var c = w.charCodeAt(w.length - 1) - 0xAC00, has = c >= 0 && c <= 11171 && c % 28 !== 0;
    if (a === '으로') return w + (has && c % 28 !== 8 ? '으로' : '로');
    return w + (has ? a : b);
  }
  function n(box, f) { return (box && box[f]) || 0; }
  function total(box) { return FOODS.reduce(function (s, f) { return s + n(box, f); }, 0); }
  function all(boxes, f) { return boxes.reduce(function (s, b) { return s + n(b, f); }, 0); }
  function allTotal(boxes) { return boxes.reduce(function (s, b) { return s + total(b); }, 0); }
  function pre(boxes, i) { return boxes.length > 1 ? '도시락 ' + (i + 1) + '의 ' : ''; }
  function N(f) { return NAME[f]; }
  function notOrdered(f) { return '주문에 없는 ' + josa(N(f), '이', '가') + ' 들어 있어요. 주문을 다시 읽어 봐!'; }

  // 도시락 하나가 want 와 똑같은지(want 에 없는 재료는 0개여야 함)
  function exact(boxes, i, want) {
    var b = boxes[i], p = pre(boxes, i);
    for (var k = 0; k < FOODS.length; k++) { var f = FOODS[k]; if (!want[f] && n(b, f)) return p + notOrdered(f); }
    for (var j = 0; j < FOODS.length; j++) { var g = FOODS[j]; if (want[g] && n(b, g) !== want[g]) return p + N(g) + ' 개수를 다시 세어 봐!'; }
    return null;
  }
  // 앞에서부터 첫 번째 힌트(없으면 null)
  function first() {
    for (var i = 0; i < arguments.length; i++) { var h = typeof arguments[i] === 'function' ? arguments[i]() : arguments[i]; if (h) return h; }
    return null;
  }
  // 두 도시락에 똑같이 나누기: 각 재료를 전체 want 만큼, 도시락마다 절반씩
  function shareEqually(want) {
    return function (b) {
      for (var k = 0; k < FOODS.length; k++) { var f = FOODS[k]; if (!want[f] && all(b, f)) return notOrdered(f); }
      if (FOODS.some(function (f) { return want[f] && all(b, f) !== want[f]; })) return '두 도시락의 전체 개수를 다시 살펴봐!';
      for (var j = 0; j < FOODS.length; j++) {
        var g = FOODS[j];
        if (want[g] && n(b[0], g) !== n(b[1], g)) return '두 도시락에 ' + josa(N(g), '이', '가') + ' 똑같이 들어갔는지 세어 봐!';
      }
      return null;
    };
  }
  // 비(a:b), 모두 sum 개: 다른 재료 없음
  function ratio(i, fa, fb, a, bb, sum) {
    return function (b) {
      var box = b[i], p = pre(b, i);
      for (var k = 0; k < FOODS.length; k++) { var f = FOODS[k]; if (f !== fa && f !== fb && n(box, f)) return p + notOrdered(f); }
      if (n(box, fa) + n(box, fb) !== sum) return p + '전체 개수가 ' + sum + '개인지 다시 세어 봐!';
      if (n(box, fa) * bb !== n(box, fb) * a) return p + josa(N(fa), '과', '와') + ' ' + N(fb) + '의 비가 ' + a + ':' + bb + '인지 살펴봐! 전체를 ' + (a + bb) + '묶음으로 나눠 생각해 봐.';
      return null;
    };
  }
  function one(f, c) { var o = {}; o[f] = c; return o; }
  function two(f, a, g, b) { var o = {}; o[f] = a; o[g] = b; return o; }
  function ratioText(f, g, a, b) { return josa(N(f), '과', '와') + ' ' + josa(N(g), '을', '를') + ' {' + a + ':' + b + '}의 비로'; }
  // 분수: 글자와 뒤에 붙는 조사(읽는 소리 '삼분의 일은', '오분의 이는')
  var FRAC = { '1/3': ['⅓', '은'], '1/4': ['¼', '은'], '2/3': ['⅔', '는'], '3/4': ['¾', '은'], '2/5': ['⅖', '는'], '3/5': ['⅗', '은'] };

  /* ---------- 주문 유형(학년마다 3칸). 음식(f)과 숫자를 넣으면 주문을 만듦 ---------- */
  var T = {
    // 1학년 개수 세기
    1: [
      function (f, a, b) { var w = two(f[0], a, f[1], b);   // 두 재료 a개·b개
        return { text: N(f[0]) + ' {' + a + '}개랑 ' + N(f[1]) + ' {' + b + '}개 담아 주세요.', boxes: 1, check: function (x) { return exact(x, 0, w); }, answer: [w] }; },
      function (f, c) { var w = one(f[0], c);   // 한 재료 c개
        return { text: N(f[0]) + ' {' + c + '}개 담아 주세요.', boxes: 1, check: function (x) { return exact(x, 0, w); }, answer: [w] }; },
      function (f, a) { var w = two(f[0], a, f[1], 1);   // 한 재료 a개 + 다른 재료 1개
        return { text: N(f[0]) + ' {' + a + '}개랑 ' + N(f[1]) + ' {1}개 담아 주세요.', boxes: 1, check: function (x) { return exact(x, 0, w); }, answer: [w] }; }
    ],
    // 2학년 더 담기와 빼기(처음 담긴 재료가 있음)
    2: [
      function (f, s, k) { var w = one(f[0], s + k);
        return { text: N(f[0]) + ' {' + s + '}개가 담겨 있어요. {' + k + '}개 더 담아 주세요.', boxes: 1, start: [one(f[0], s)], check: function (x) { return exact(x, 0, w); }, answer: [w] }; },
      function (f, s, k) { var w = one(f[0], s - k);
        return { text: N(f[0]) + ' {' + s + '}개가 담겨 있어요. {' + k + '}개를 빼 주세요.', boxes: 1, start: [one(f[0], s)], check: function (x) { return exact(x, 0, w); }, answer: [w] }; },
      function (f, a, k, b, m) { var w = two(f[0], a - k, f[1], b + m);
        return { text: N(f[0]) + ' {' + a + '}개, ' + N(f[1]) + ' {' + b + '}개가 담겨 있어요. ' + josa(N(f[0]), '은', '는') + ' {' + k + '}개 빼고, ' +
          josa(N(f[1]), '은', '는') + ' {' + m + '}개 더 담아 주세요.', boxes: 1, start: [two(f[0], a, f[1], b)], check: function (x) { return exact(x, 0, w); }, answer: [w] }; }
    ],
    // 3학년 똑같이 나누기(도시락 두 개)
    3: [
      function (f, t) {
        return { text: N(f[0]) + ' {' + t + '}개를 도시락 두 개에 똑같이 나눠 주세요.', boxes: 2, check: shareEqually(one(f[0], t)), answer: [one(f[0], t / 2), one(f[0], t / 2)] }; },
      function (f, a, b) { var h = two(f[0], a / 2, f[1], b / 2);
        return { text: N(f[0]) + ' {' + a + '}개와 ' + N(f[1]) + ' {' + b + '}개를 도시락 두 개에 똑같이 나눠 주세요.', boxes: 2, check: shareEqually(two(f[0], a, f[1], b)), answer: [h, h] }; },
      function (f, t) {
        return { text: N(f[0]) + ' {' + t + '}개가 도시락 1에 다 담겨 있어요. 두 도시락에 똑같이 나눠 주세요.', boxes: 2, start: [one(f[0], t), {}],
          check: shareEqually(one(f[0], t)), answer: [one(f[0], t / 2), one(f[0], t / 2)] }; }
    ],
    // 4학년 여러 조건 맞추기(조건을 만족하는 조합은 모두 정답)
    4: [
      function (f, t) { var k = 2, h = t / 2;   // 두 도시락 같은 개수, 한 재료 2개씩
        return { text: '도시락 두 개에 음식을 모두 {' + t + '}개 담아 주세요. 두 도시락의 음식 개수는 같고, ' + josa(N(f[0]), '은', '는') + ' {' + k + '}개씩 넣어 주세요.', boxes: 2,
          check: function (x) {
            return first(
              allTotal(x) !== t && '두 도시락의 전체 개수를 다시 살펴봐!',
              total(x[0]) !== total(x[1]) && '두 도시락의 음식 개수가 같은지 세어 봐!',
              n(x[0], f[0]) !== k && '도시락 1의 ' + N(f[0]) + ' 개수를 다시 세어 봐!',
              n(x[1], f[0]) !== k && '도시락 2의 ' + N(f[0]) + ' 개수를 다시 세어 봐!');
          }, answer: [two(f[0], k, f[1], h - k), two(f[0], k, f[1], h - k)] }; },
      function (f, t, c) { var d = 2, rest = t - c - d, lo = Math.floor(rest / 2), ans = {};   // 전체 t개, 한 재료 c개, f1 이 f2 보다 2개 더(f3 는 자유)
        ans[f[0]] = c; ans[f[2]] = lo; ans[f[1]] = lo + d; ans[f[3]] = rest - lo * 2;
        return { text: '음식을 {' + t + '}개 담아 주세요. ' + josa(N(f[0]), '은', '는') + ' {' + c + '}개, ' + josa(N(f[1]), '은', '는') + ' ' + N(f[2]) + '보다 {' + d + '}개 더 많게 넣어 주세요.', boxes: 1,
          check: function (x) {
            var y = x[0];
            return first(
              total(y) !== t && '전체 개수가 ' + t + '개인지 다시 세어 봐!',
              n(y, f[0]) !== c && N(f[0]) + ' 개수를 다시 세어 봐!',
              n(y, f[1]) - n(y, f[2]) !== d && josa(N(f[1]), '이', '가') + ' ' + N(f[2]) + '보다 ' + d + '개 더 많은지 비교해 봐!');
          }, answer: [ans] }; },
      function (f, a, k, c) { var b = a - k;   // 도시락 1은 a개, 도시락 2는 k개 적게, 한 재료 c개씩
        return { text: '도시락 1에는 음식 {' + a + '}개, 도시락 2에는 도시락 1보다 {' + k + '}개 적게 담아 주세요. 두 도시락 모두 ' + josa(N(f[0]), '은', '는') + ' {' + c + '}개씩 넣어 주세요.', boxes: 2,
          check: function (x) {
            return first(
              total(x[0]) !== a && '도시락 1의 전체 개수를 다시 세어 봐!',
              total(x[1]) !== b && '도시락 2는 도시락 1보다 ' + k + '개 적어야 해. 다시 세어 봐!',
              n(x[0], f[0]) !== c && '도시락 1의 ' + N(f[0]) + ' 개수를 다시 세어 봐!',
              n(x[1], f[0]) !== c && '도시락 2의 ' + N(f[0]) + ' 개수를 다시 세어 봐!');
          }, answer: [two(f[0], c, f[1], a - c), two(f[0], c, f[1], b - c)] }; }
    ],
    // 5학년 전체의 분수
    5: [
      fracOrder,   // 단위분수(⅓·¼)
      fracOrder,   // 단위분수가 아닌 분수(⅖·⅗·⅔·¾)
      function (f, t) { var q = t / 4, h = t / 2, a1 = two(f[0], q, f[1], h), a2 = two(f[0], q, f[1], h);   // 도시락마다 ¼·½, 나머지 자유
        a1[f[2]] = t - q - h; a2[f[3]] = t - q - h;
        return { text: '도시락 두 개에 음식을 {' + t + '}개씩 담아 주세요. 도시락마다 {¼}은 ' + N(f[0]) + ', {½}은 ' + N(f[1]) + ', 나머지는 자유예요.', boxes: 2,
          check: function (x) {
            for (var i = 0; i < 2; i++) {
              var y = x[i], p = '도시락 ' + (i + 1) + '의 ';
              if (total(y) !== t) return p + '전체 개수가 ' + t + '개인지 다시 세어 봐!';
              if (n(y, f[0]) !== q) return p + josa(N(f[0]), '이', '가') + ' ' + t + '개의 ¼인지 살펴봐!';
              if (n(y, f[1]) !== h) return p + josa(N(f[1]), '이', '가') + ' ' + t + '개의 ½인지 살펴봐!';
            }
            return null;
          }, answer: [a1, a2] }; }
    ],
    // 6학년 비
    6: [
      ratioOrder,
      ratioOrder,
      function (f, a, b, m1, m2) { var s = a + b, t1 = s * m1, t2 = s * m2;   // 두 도시락 같은 비, 개수 다르게
        return { text: '두 도시락 모두 ' + ratioText(f[0], f[1], a, b) + ' 담아 주세요. 도시락 1에는 {' + t1 + '}개, 도시락 2에는 {' + t2 + '}개예요.', boxes: 2,
          check: function (x) { return first(ratio(0, f[0], f[1], a, b, t1)(x), ratio(1, f[0], f[1], a, b, t2)(x)); },
          answer: [two(f[0], a * m1, f[1], b * m1), two(f[0], a * m2, f[1], b * m2)] }; }
    ]
  };
  // 지정한 두 재료만 담는 분수 주문: 전체 t개 중 num/den 은 f0, 나머지는 f1
  function fracOrder(f, t, frac) {
    var parts = frac.split('/'), num = +parts[0], den = +parts[1], fr = FRAC[frac], p = t / den * num;
    return { text: '음식을 {' + t + '}개 담아 주세요. 그중 {' + fr[0] + '}' + fr[1] + ' ' + N(f[0]) + ', 나머지는 ' + josa(N(f[1]), '으로', '로') + ' 주세요.', boxes: 1,
      check: function (x) {
        var y = x[0];
        return first(
          FOODS.some(function (g) { return g !== f[0] && g !== f[1] && n(y, g); }) && josa(N(f[0]), '과', '와') + ' ' + N(f[1]) + '만 담아야 해. 주문을 다시 읽어 봐!',
          total(y) !== t && '전체 개수가 ' + t + '개인지 다시 세어 봐!',
          n(y, f[0]) !== p && (num === 1
            ? t + '개를 똑같이 ' + den + '묶음으로 나누면 한 묶음은 몇 개일까? ' + N(f[0]) + ' 개수를 살펴봐!'
            : t + '개를 ' + den + '묶음으로 나누고 그중 ' + num + '묶음이 ' + N(f[0]) + '야. 다시 세어 봐!'));
      }, answer: [two(f[0], p, f[1], t - p)] };
  }
  // 두 재료를 a:b 의 비로 모두 (a+b)×m 개
  function ratioOrder(f, a, b, m) {
    var t = (a + b) * m;
    return { text: ratioText(f[0], f[1], a, b) + ', 모두 {' + t + '}개 담아 주세요.', boxes: 1,
      check: ratio(0, f[0], f[1], a, b, t), answer: [two(f[0], a * m, f[1], b * m)] };
  }

  /* ---------- 처음 하는 학년의 예시 주문(재료: 주먹밥·김밥·귤·달걀말이) ---------- */
  var J = 'jumeokbap', G = 'gimbap', TG = 'tangerine', E = 'eggroll';
  var FIRST = {
    1: [T[1][0]([J, TG], 2, 3), T[1][1]([G], 4), T[1][2]([E, J], 5)],
    2: [T[2][0]([TG], 4, 2), T[2][1]([J], 7, 3), T[2][2]([G, E], 5, 2, 3, 4)],
    3: [T[3][0]([G], 8), T[3][1]([TG, J], 6, 4), T[3][2]([E], 12)],
    4: [T[4][0]([TG, J], 12), T[4][1]([E, J, G, TG], 10, 4), T[4][2]([J, G], 8, 3, 3)],
    5: [T[5][0]([TG, J], 12, '1/3'), T[5][1]([E, G], 10, '2/5'), T[5][2]([TG, J, G, E], 8)],
    6: [T[6][0]([TG, E], 2, 3, 3), T[6][1]([J, G], 3, 1, 3), T[6][2]([TG, J], 1, 2, 2, 3)]
  };

  /* ---------- 새 주문 만들기(코스터·유령의 집처럼 판마다 새 문제) ----------
   * 유형마다 숫자 범위는 예시 주문과 같은 크기로 고정(난이도 그대로), 음식은 이번 판의 4가지(set)에서 고름 */
  function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }
  function int(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  function shuffle(rng, list) {
    var l = list.slice();
    for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = l[i]; l[i] = l[j]; l[j] = t; }
    return l;
  }
  // 이번 판 재료 버튼 4가지: 12가지 중 무작위, 송편(쑥·분홍·흰)은 많아야 하나
  function pickSet(rng) {
    var out = [];
    shuffle(rng, ALL).forEach(function (f) {
      if (out.length >= 4) return;
      if (SONGPYEON.indexOf(f) >= 0 && out.some(function (g) { return SONGPYEON.indexOf(g) >= 0; })) return;
      out.push(f);
    });
    return out;
  }
  var GEN = {
    1: [
      function (r, f) { return T[1][0](f, int(r, 2, 3), int(r, 2, 3)); },
      function (r, f) { return T[1][1](f, int(r, 3, 5)); },
      function (r, f) { return T[1][2](f, int(r, 4, 5)); }
    ],
    2: [
      function (r, f) { return T[2][0](f, int(r, 3, 5), int(r, 2, 3)); },
      function (r, f) { return T[2][1](f, int(r, 6, 8), int(r, 2, 3)); },
      function (r, f) { return T[2][2](f, int(r, 4, 6), int(r, 1, 2), int(r, 2, 4), int(r, 3, 4)); }
    ],
    3: [
      function (r, f) { return T[3][0](f, pick(r, [6, 8, 10])); },
      function (r, f) { var a = pick(r, [4, 6]); return T[3][1](f, a, a === 4 ? 6 : 4); },
      function (r, f) { return T[3][2](f, pick(r, [10, 12, 14])); }
    ],
    4: [
      function (r, f) { return T[4][0](f, pick(r, [10, 12, 14])); },
      function (r, f) { return T[4][1](f, int(r, 9, 11), int(r, 3, 4)); },
      function (r, f) { return T[4][2](f, int(r, 7, 9), int(r, 2, 3), int(r, 2, 3)); }
    ],
    5: [
      function (r, f) { var q = pick(r, [['1/3', [9, 12, 15]], ['1/4', [8, 12, 16]]]); return T[5][0](f, pick(r, q[1]), q[0]); },
      function (r, f) { var q = pick(r, [['2/5', [10]], ['3/5', [10]], ['2/3', [9, 12]], ['3/4', [8, 12]]]); return T[5][1](f, pick(r, q[1]), q[0]); },
      function (r, f) { return T[5][2](f, pick(r, [8, 12])); }
    ],
    6: [
      function (r, f) { var q = pick(r, [[2, 3, 3], [3, 2, 3], [1, 4, 3], [2, 3, 2], [3, 4, 2]]); return T[6][0](f, q[0], q[1], q[2]); },
      function (r, f) { var q = pick(r, [[3, 1, 3], [1, 3, 3], [3, 1, 4], [2, 1, 4], [1, 2, 5]]); return T[6][1](f, q[0], q[1], q[2]); },
      function (r, f) { var q = pick(r, [[1, 2, 2, 3], [2, 1, 2, 3], [1, 3, 2, 3], [1, 2, 3, 2]]); return T[6][2](f, q[0], q[1], q[2], q[3]); }
    ]
  };
  /* 한 판(주문 3개) 만들기 → 주문 배열(round.foods = 이번 판 재료 버튼 4가지)
     first=true 면 예시 주문 그대로. avoid: 바로 전 판 주문 문장들(같은 문장은 다시 내지 않음) */
  function makeRound(g, opts) {
    opts = opts || {};
    var round;
    if (opts.first) { round = FIRST[g].slice(); round.foods = FIRST_SET.slice(); return round; }
    var rng = opts.rng || Math.random, avoid = opts.avoid || [], fixed = FIRST[g].map(function (o) { return o.text; });
    var set = opts.foods || pickSet(rng);
    round = GEN[g].map(function (make) {
      var o;
      for (var t = 0; t < 40; t++) { o = make(rng, shuffle(rng, set)); if (avoid.indexOf(o.text) < 0 && fixed.indexOf(o.text) < 0) break; }
      return o;
    });
    round.foods = set;
    return round;
  }

  // 공통 판정: 빈 도시락 → 안내, 아니면 주문의 check
  function judge(order, boxes) {
    if (allTotal(boxes) === 0) return { ok: false, hint: '도시락이 비어 있어요. 아래 재료를 눌러 담아 봐!' };
    var h = order.check(boxes);
    return h ? { ok: false, hint: h } : { ok: true, hint: null };
  }
  function startBoxes(order) {
    var out = [];
    for (var i = 0; i < order.boxes; i++) {
      var s = (order.start && order.start[i]) || {}, b = {};
      FOODS.forEach(function (f) { b[f] = s[f] || 0; });
      out.push(b);
    }
    return out;
  }

  var api = { FOODS: FOODS, ALL: ALL, NAME: NAME, FIRST_SET: FIRST_SET, SONGPYEON: SONGPYEON, BOX_MAX: BOX_MAX,
    ORDERS: FIRST, GEN: GEN, makeRound: makeRound, pickSet: pickSet, judge: judge, startBoxes: startBoxes, total: total, josa: josa };
  root.MP_PICNIC = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
