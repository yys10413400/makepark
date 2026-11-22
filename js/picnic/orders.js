/*
 * 토리네 도시락: 학년별 주문과 정답 판정
 * ------------------------------------------------------------
 * 주문 하나 = {
 *   text  : 토리가 말하는 주문. {중괄호} 안은 딸기색 큰 글자로 보임
 *   boxes : 도시락 개수(1 또는 2)
 *   start : 처음 담겨 있는 재료(도시락마다 { 재료: 개수 }), 없으면 빈 도시락
 *   check : 담은 상태(도시락마다 { onigiri, sandwich, strawberry, tomato } 개수)를 받아
 *           맞으면 null, 틀리면 짧은 힌트 문장을 돌려줌
 * }
 * ORDERS 는 처음 하는 학년의 예시 주문, GEN 은 같은 유형·같은 숫자 범위로 판마다 새 주문을 만드는 틀입니다.
 * 판정은 담은 순서와 상관없이 재료별 개수만 봅니다. 화면은 js/picnic/ui.js.
 * 검증: node tools/verify_picnic.js
 */
(function (root) {
  'use strict';
  var FOODS = ['onigiri', 'sandwich', 'strawberry', 'tomato'];
  var NAME = { onigiri: '주먹밥', sandwich: '샌드위치', strawberry: '딸기', tomato: '방울토마토' };
  var BOX_MAX = 20;   // 도시락 하나에 담을 수 있는 최대 개수(낱개를 셀 수 있게)

  // 받침에 맞는 조사: josa('딸기', '이', '가') → '딸기가'
  function josa(w, a, b) {
    var c = w.charCodeAt(w.length - 1) - 0xAC00, has = c >= 0 && c <= 11171 && c % 28 !== 0;
    return w + (has ? a : b);
  }
  function n(box, f) { return (box && box[f]) || 0; }
  function total(box) { return FOODS.reduce(function (s, f) { return s + n(box, f); }, 0); }
  function all(boxes, f) { return boxes.reduce(function (s, b) { return s + n(b, f); }, 0); }
  function allTotal(boxes) { return boxes.reduce(function (s, b) { return s + total(b); }, 0); }
  function pre(boxes, i) { return boxes.length > 1 ? '도시락 ' + (i + 1) + '의 ' : ''; }

  // 도시락 하나가 want 와 똑같은지(want 에 없는 재료는 0개여야 함)
  function exact(boxes, i, want) {
    var b = boxes[i], p = pre(boxes, i);
    for (var k = 0; k < FOODS.length; k++) {
      var f = FOODS[k];
      if (!want[f] && n(b, f)) return p + '주문에 없는 ' + josa(NAME[f], '이', '가') + ' 들어 있어요. 주문을 다시 읽어 봐!';
    }
    for (var j = 0; j < FOODS.length; j++) {
      var g = FOODS[j];
      if (want[g] && n(b, g) !== want[g]) return p + NAME[g] + ' 개수를 다시 세어 봐!';
    }
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
      for (var k = 0; k < FOODS.length; k++) {
        var f = FOODS[k];
        if (!want[f] && all(b, f)) return '주문에 없는 ' + josa(NAME[f], '이', '가') + ' 들어 있어요. 주문을 다시 읽어 봐!';
      }
      if (FOODS.some(function (f) { return want[f] && all(b, f) !== want[f]; })) return '두 도시락의 전체 개수를 다시 살펴봐!';
      for (var j = 0; j < FOODS.length; j++) {
        var g = FOODS[j];
        if (want[g] && n(b[0], g) !== n(b[1], g)) return '두 도시락에 ' + josa(NAME[g], '이', '가') + ' 똑같이 들어갔는지 세어 봐!';
      }
      return null;
    };
  }
  // 비(a:b), 모두 sum 개: 다른 재료 없음
  function ratio(i, fa, fb, a, bb, sum) {
    return function (b) {
      var box = b[i], p = pre(b, i);
      for (var k = 0; k < FOODS.length; k++) {
        var f = FOODS[k];
        if (f !== fa && f !== fb && n(box, f)) return p + '주문에 없는 ' + josa(NAME[f], '이', '가') + ' 들어 있어요. 주문을 다시 읽어 봐!';
      }
      if (n(box, fa) + n(box, fb) !== sum) return p + '전체 개수가 ' + sum + '개인지 다시 세어 봐!';
      if (n(box, fa) * bb !== n(box, fb) * a) return p + josa(NAME[fa], '과', '와') + ' ' + NAME[fb] + '의 비가 ' + a + ':' + bb + '인지 살펴봐! 전체를 ' + (a + bb) + '묶음으로 나눠 생각해 봐.';
      return null;
    };
  }

  var ORDERS = {
    // 1학년: 개수 세기
    1: [
      { text: '주먹밥 {2}개랑 딸기 {3}개 담아 주세요.', boxes: 1,
        check: function (b) { return exact(b, 0, { onigiri: 2, strawberry: 3 }); } },
      { text: '샌드위치 {4}개 담아 주세요.', boxes: 1,
        check: function (b) { return exact(b, 0, { sandwich: 4 }); } },
      { text: '방울토마토 {5}개랑 주먹밥 {1}개 담아 주세요.', boxes: 1,
        check: function (b) { return exact(b, 0, { tomato: 5, onigiri: 1 }); } }
    ],
    // 2학년: 더 담기와 빼기(처음 담긴 재료가 있음)
    2: [
      { text: '딸기 {4}개가 담겨 있어요. {2}개 더 담아 주세요.', boxes: 1, start: [{ strawberry: 4 }],
        check: function (b) { return exact(b, 0, { strawberry: 6 }); } },
      { text: '주먹밥 {7}개가 담겨 있어요. {3}개를 빼 주세요.', boxes: 1, start: [{ onigiri: 7 }],
        check: function (b) { return exact(b, 0, { onigiri: 4 }); } },
      { text: '샌드위치 {5}개, 방울토마토 {3}개가 담겨 있어요. 샌드위치는 {2}개 빼고, 방울토마토는 {4}개 더 담아 주세요.', boxes: 1,
        start: [{ sandwich: 5, tomato: 3 }],
        check: function (b) { return exact(b, 0, { sandwich: 3, tomato: 7 }); } }
    ],
    // 3학년: 똑같이 나누기(도시락 두 개)
    3: [
      { text: '샌드위치 {8}개를 도시락 두 개에 똑같이 나눠 주세요.', boxes: 2,
        check: shareEqually({ sandwich: 8 }) },
      { text: '딸기 {6}개와 주먹밥 {4}개를 도시락 두 개에 똑같이 나눠 주세요.', boxes: 2,
        check: shareEqually({ strawberry: 6, onigiri: 4 }) },
      { text: '방울토마토 {12}개가 도시락 1에 다 담겨 있어요. 두 도시락에 똑같이 나눠 주세요.', boxes: 2,
        start: [{ tomato: 12 }, {}],
        check: shareEqually({ tomato: 12 }) }
    ],
    // 4학년: 여러 조건 맞추기(조건을 만족하는 조합은 모두 정답)
    4: [
      { text: '도시락 두 개에 음식을 모두 {12}개 담아 주세요. 두 도시락의 음식 개수는 같고, 딸기는 {2}개씩 넣어 주세요.', boxes: 2,
        check: function (b) {
          return first(
            allTotal(b) !== 12 && '두 도시락의 전체 개수를 다시 살펴봐!',
            total(b[0]) !== total(b[1]) && '두 도시락의 음식 개수가 같은지 세어 봐!',
            n(b[0], 'strawberry') !== 2 && '도시락 1의 딸기 개수를 다시 세어 봐!',
            n(b[1], 'strawberry') !== 2 && '도시락 2의 딸기 개수를 다시 세어 봐!');
        } },
      { text: '음식을 {10}개 담아 주세요. 방울토마토는 {4}개, 주먹밥은 샌드위치보다 {2}개 더 많게 넣어 주세요.', boxes: 1,
        check: function (b) {
          var x = b[0];
          return first(
            total(x) !== 10 && '전체 개수가 10개인지 다시 세어 봐!',
            n(x, 'tomato') !== 4 && '방울토마토 개수를 다시 세어 봐!',
            n(x, 'onigiri') - n(x, 'sandwich') !== 2 && '주먹밥이 샌드위치보다 2개 더 많은지 비교해 봐!');
        } },
      { text: '도시락 1에는 음식 {8}개, 도시락 2에는 도시락 1보다 {3}개 적게 담아 주세요. 두 도시락 모두 주먹밥은 {3}개씩 넣어 주세요.', boxes: 2,
        check: function (b) {
          return first(
            total(b[0]) !== 8 && '도시락 1의 전체 개수를 다시 세어 봐!',
            total(b[1]) !== 5 && '도시락 2는 도시락 1보다 3개 적어야 해. 다시 세어 봐!',
            n(b[0], 'onigiri') !== 3 && '도시락 1의 주먹밥 개수를 다시 세어 봐!',
            n(b[1], 'onigiri') !== 3 && '도시락 2의 주먹밥 개수를 다시 세어 봐!');
        } }
    ],
    // 5학년: 전체의 분수
    5: [
      { text: '음식을 {12}개 담아 주세요. 그중 {⅓}은 딸기, 나머지는 주먹밥으로 주세요.', boxes: 1,
        check: function (b) {
          return first(
            n(b[0], 'sandwich') + n(b[0], 'tomato') > 0 && '딸기와 주먹밥만 담아야 해. 주문을 다시 읽어 봐!',
            total(b[0]) !== 12 && '전체 개수가 12개인지 다시 세어 봐!',
            n(b[0], 'strawberry') !== 4 && '12개를 똑같이 3묶음으로 나누면 한 묶음은 몇 개일까? 딸기 개수를 살펴봐!');
        } },
      { text: '음식을 {10}개 담아 주세요. 그중 {⅖}는 방울토마토, 나머지는 샌드위치로 주세요.', boxes: 1,
        check: function (b) {
          var x = b[0];
          return first(
            n(x, 'onigiri') + n(x, 'strawberry') > 0 && '방울토마토와 샌드위치만 담아야 해. 주문을 다시 읽어 봐!',
            total(x) !== 10 && '전체 개수가 10개인지 다시 세어 봐!',
            n(x, 'tomato') !== 4 && '10개를 5묶음으로 나누고 그중 2묶음이 방울토마토야. 다시 세어 봐!');
        } },
      { text: '도시락 두 개에 음식을 {8}개씩 담아 주세요. 도시락마다 {¼}은 딸기, {½}은 주먹밥, 나머지는 자유예요.', boxes: 2,
        check: function (b) {
          for (var i = 0; i < 2; i++) {
            var x = b[i], p = '도시락 ' + (i + 1) + '의 ';
            if (total(x) !== 8) return p + '전체 개수가 8개인지 다시 세어 봐!';
            if (n(x, 'strawberry') !== 2) return p + '딸기가 8개의 ¼인지 살펴봐!';
            if (n(x, 'onigiri') !== 4) return p + '주먹밥이 8개의 ½인지 살펴봐!';
          }
          return null;
        } }
    ],
    // 6학년: 비
    6: [
      { text: '딸기와 방울토마토를 {2:3}의 비로, 모두 {15}개 담아 주세요.', boxes: 1,
        check: ratio(0, 'strawberry', 'tomato', 2, 3, 15) },
      { text: '주먹밥과 샌드위치를 {3:1}의 비로, 모두 {12}개 담아 주세요.', boxes: 1,
        check: ratio(0, 'onigiri', 'sandwich', 3, 1, 12) },
      { text: '두 도시락 모두 딸기와 주먹밥을 {1:2}의 비로 담아 주세요. 도시락 1에는 {6}개, 도시락 2에는 {9}개예요.', boxes: 2,
        check: function (b) { return first(ratio(0, 'strawberry', 'onigiri', 1, 2, 6)(b), ratio(1, 'strawberry', 'onigiri', 1, 2, 9)(b)); } }
    ]
  };

  /* ---------- 새 주문 만들기(코스터·유령의 집처럼 판마다 새 문제) ----------
   * 학년마다 주문 3칸의 '유형'과 숫자 범위는 위 예시 주문과 같게 두고, 재료와 숫자만 바꿉니다(난이도는 그대로).
   * 만든 주문에는 정답 예시(answer)를 같이 넣어 검증(tools/verify_picnic.js)에 씁니다.
   */
  function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }
  function int(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  function foods(rng, k) {   // 서로 다른 재료 k개
    var l = FOODS.slice();
    for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = l[i]; l[i] = l[j]; l[j] = t; }
    return l.slice(0, k);
  }
  function one(f, c) { var o = {}; o[f] = c; return o; }
  function two(f, a, g, b) { var o = {}; o[f] = a; o[g] = b; return o; }
  function N(f) { return NAME[f]; }
  // 분수: 글자와 뒤에 붙는 조사(읽는 소리 '삼분의 일은', '오분의 이는')
  var FRAC = { '1/3': ['⅓', '은'], '1/4': ['¼', '은'], '2/3': ['⅔', '는'], '3/4': ['¾', '은'], '2/5': ['⅖', '는'], '3/5': ['⅗', '은'] };
  // 지정한 두 재료만 담는 분수 주문(5학년 1·2번 칸)
  function fracOrder(f, t, den, num, fr) {
    var p = t / den * num;
    return { text: '음식을 {' + t + '}개 담아 주세요. 그중 {' + fr[0] + '}' + fr[1] + ' ' + N(f[0]) + ', 나머지는 ' + josa(N(f[1]), '으로', '로') + ' 주세요.', boxes: 1,
      check: function (x) {
        var y = x[0], other = FOODS.filter(function (g) { return f.indexOf(g) < 0; });
        return first(
          other.some(function (g) { return n(y, g); }) && josa(N(f[0]), '과', '와') + ' ' + N(f[1]) + '만 담아야 해. 주문을 다시 읽어 봐!',
          total(y) !== t && '전체 개수가 ' + t + '개인지 다시 세어 봐!',
          n(y, f[0]) !== p && (num === 1
            ? t + '개를 똑같이 ' + den + '묶음으로 나누면 한 묶음은 몇 개일까? ' + N(f[0]) + ' 개수를 살펴봐!'
            : t + '개를 ' + den + '묶음으로 나누고 그중 ' + num + '묶음이 ' + N(f[0]) + '야. 다시 세어 봐!'));
      }, answer: [two(f[0], p, f[1], t - p)] };
  }
  function ratioText(f, a, b) { return josa(N(f[0]), '과', '와') + ' ' + josa(N(f[1]), '을', '를') + ' {' + a + ':' + b + '}의 비로'; }

  var GEN = {
    // 1학년 개수 세기: 두 재료 2~3개씩 / 한 재료 3~5개 / 한 재료 4~5개 + 다른 재료 1개
    1: [
      function (r) { var f = foods(r, 2), a = int(r, 2, 3), b = int(r, 2, 3), w = two(f[0], a, f[1], b);
        return { text: N(f[0]) + ' {' + a + '}개랑 ' + N(f[1]) + ' {' + b + '}개 담아 주세요.', boxes: 1,
          check: function (x) { return exact(x, 0, w); }, answer: [w] }; },
      function (r) { var f = foods(r, 1)[0], c = int(r, 3, 5), w = one(f, c);
        return { text: N(f) + ' {' + c + '}개 담아 주세요.', boxes: 1, check: function (x) { return exact(x, 0, w); }, answer: [w] }; },
      function (r) { var f = foods(r, 2), a = int(r, 4, 5), w = two(f[0], a, f[1], 1);
        return { text: N(f[0]) + ' {' + a + '}개랑 ' + N(f[1]) + ' {1}개 담아 주세요.', boxes: 1,
          check: function (x) { return exact(x, 0, w); }, answer: [w] }; }
    ],
    // 2학년 더하기·빼기: 3~5개에 2~3개 더 / 6~8개에서 2~3개 빼기 / 한 재료는 빼고 다른 재료는 더하기
    2: [
      function (r) { var f = foods(r, 1)[0], s = int(r, 3, 5), k = int(r, 2, 3), w = one(f, s + k);
        return { text: N(f) + ' {' + s + '}개가 담겨 있어요. {' + k + '}개 더 담아 주세요.', boxes: 1, start: [one(f, s)],
          check: function (x) { return exact(x, 0, w); }, answer: [w] }; },
      function (r) { var f = foods(r, 1)[0], s = int(r, 6, 8), k = int(r, 2, 3), w = one(f, s - k);
        return { text: N(f) + ' {' + s + '}개가 담겨 있어요. {' + k + '}개를 빼 주세요.', boxes: 1, start: [one(f, s)],
          check: function (x) { return exact(x, 0, w); }, answer: [w] }; },
      function (r) { var f = foods(r, 2), a = int(r, 4, 6), k = int(r, 1, 2), b = int(r, 2, 4), m = int(r, 3, 4), w = two(f[0], a - k, f[1], b + m);
        return { text: N(f[0]) + ' {' + a + '}개, ' + N(f[1]) + ' {' + b + '}개가 담겨 있어요. ' + josa(N(f[0]), '은', '는') + ' {' + k + '}개 빼고, ' +
          josa(N(f[1]), '은', '는') + ' {' + m + '}개 더 담아 주세요.', boxes: 1, start: [two(f[0], a, f[1], b)],
          check: function (x) { return exact(x, 0, w); }, answer: [w] }; }
    ],
    // 3학년 똑같이 나누기(도시락 두 개): 한 재료 6~10개 / 두 재료 4개·6개 / 도시락 1에 10~14개가 다 담긴 것을 나누기
    3: [
      function (r) { var f = foods(r, 1)[0], t = pick(r, [6, 8, 10]);
        return { text: N(f) + ' {' + t + '}개를 도시락 두 개에 똑같이 나눠 주세요.', boxes: 2, check: shareEqually(one(f, t)), answer: [one(f, t / 2), one(f, t / 2)] }; },
      function (r) { var f = foods(r, 2), a = pick(r, [4, 6]), b = a === 4 ? 6 : 4, h = two(f[0], a / 2, f[1], b / 2);
        return { text: N(f[0]) + ' {' + a + '}개와 ' + N(f[1]) + ' {' + b + '}개를 도시락 두 개에 똑같이 나눠 주세요.', boxes: 2,
          check: shareEqually(two(f[0], a, f[1], b)), answer: [h, h] }; },
      function (r) { var f = foods(r, 1)[0], t = pick(r, [10, 12, 14]);
        return { text: N(f) + ' {' + t + '}개가 도시락 1에 다 담겨 있어요. 두 도시락에 똑같이 나눠 주세요.', boxes: 2, start: [one(f, t), {}],
          check: shareEqually(one(f, t)), answer: [one(f, t / 2), one(f, t / 2)] }; }
    ],
    // 4학년 여러 조건(정답 여러 가지): 두 도시락 같은 개수 + 한 재료 2개씩 / 전체·한 재료 개수·'~보다 2개 더' / 도시락 1보다 2~3개 적게 + 한 재료 2~3개씩
    4: [
      function (r) { var f = foods(r, 2), t = pick(r, [10, 12, 14]), k = 2, h = t / 2;
        return { text: '도시락 두 개에 음식을 모두 {' + t + '}개 담아 주세요. 두 도시락의 음식 개수는 같고, ' + josa(N(f[0]), '은', '는') + ' {' + k + '}개씩 넣어 주세요.', boxes: 2,
          check: function (x) {
            return first(
              allTotal(x) !== t && '두 도시락의 전체 개수를 다시 살펴봐!',
              total(x[0]) !== total(x[1]) && '두 도시락의 음식 개수가 같은지 세어 봐!',
              n(x[0], f[0]) !== k && '도시락 1의 ' + N(f[0]) + ' 개수를 다시 세어 봐!',
              n(x[1], f[0]) !== k && '도시락 2의 ' + N(f[0]) + ' 개수를 다시 세어 봐!');
          }, answer: [two(f[0], k, f[1], h - k), two(f[0], k, f[1], h - k)] }; },
      function (r) { var f = foods(r, 4), t = int(r, 9, 11), c = int(r, 3, 4), d = 2, rest = t - c - d, lo = Math.floor(rest / 2), ans = {};
        ans[f[0]] = c; ans[f[2]] = lo; ans[f[1]] = lo + d; ans[f[3]] = rest - lo * 2;
        return { text: '음식을 {' + t + '}개 담아 주세요. ' + josa(N(f[0]), '은', '는') + ' {' + c + '}개, ' + josa(N(f[1]), '은', '는') + ' ' + N(f[2]) + '보다 {' + d + '}개 더 많게 넣어 주세요.', boxes: 1,
          check: function (x) {
            var y = x[0];
            return first(
              total(y) !== t && '전체 개수가 ' + t + '개인지 다시 세어 봐!',
              n(y, f[0]) !== c && N(f[0]) + ' 개수를 다시 세어 봐!',
              n(y, f[1]) - n(y, f[2]) !== d && josa(N(f[1]), '이', '가') + ' ' + N(f[2]) + '보다 ' + d + '개 더 많은지 비교해 봐!');
          }, answer: [ans] }; },
      function (r) { var f = foods(r, 2), a = int(r, 7, 9), k = int(r, 2, 3), c = int(r, 2, 3), b = a - k;
        return { text: '도시락 1에는 음식 {' + a + '}개, 도시락 2에는 도시락 1보다 {' + k + '}개 적게 담아 주세요. 두 도시락 모두 ' + josa(N(f[0]), '은', '는') + ' {' + c + '}개씩 넣어 주세요.', boxes: 2,
          check: function (x) {
            return first(
              total(x[0]) !== a && '도시락 1의 전체 개수를 다시 세어 봐!',
              total(x[1]) !== b && '도시락 2는 도시락 1보다 ' + k + '개 적어야 해. 다시 세어 봐!',
              n(x[0], f[0]) !== c && '도시락 1의 ' + N(f[0]) + ' 개수를 다시 세어 봐!',
              n(x[1], f[0]) !== c && '도시락 2의 ' + N(f[0]) + ' 개수를 다시 세어 봐!');
          }, answer: [two(f[0], c, f[1], a - c), two(f[0], c, f[1], b - c)] }; }
    ],
    // 5학년 분수: 단위분수(⅓·¼) / 단위분수가 아닌 분수(⅖·⅗·⅔·¾) / 도시락마다 ¼·½, 나머지 자유
    5: [
      function (r) { var q = pick(r, [['1/3', 3, [9, 12, 15]], ['1/4', 4, [8, 12, 16]]]);
        return fracOrder(foods(r, 2), pick(r, q[2]), q[1], 1, FRAC[q[0]]); },
      function (r) { var q = pick(r, [['2/5', 5, 2, [10]], ['3/5', 5, 3, [10]], ['2/3', 3, 2, [9, 12]], ['3/4', 4, 3, [8, 12]]]);
        return fracOrder(foods(r, 2), pick(r, q[3]), q[1], q[2], FRAC[q[0]]); },
      function (r) { var f = foods(r, 4), t = pick(r, [8, 12]), q = t / 4, h = t / 2, a1 = two(f[0], q, f[1], h), a2 = two(f[0], q, f[1], h);
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
    // 6학년 비: 두 수의 합이 5·7인 비로 10~15개 / 한쪽이 1인 비로 9~16개 / 두 도시락 같은 비, 개수 다르게
    6: [
      function (r) { var f = foods(r, 2), q = pick(r, [[2, 3, 3], [3, 2, 3], [1, 4, 3], [2, 3, 2], [3, 4, 2]]), a = q[0], b = q[1], t = (a + b) * q[2];
        return { text: ratioText(f, a, b) + ', 모두 {' + t + '}개 담아 주세요.', boxes: 1,
          check: ratio(0, f[0], f[1], a, b, t), answer: [two(f[0], a * q[2], f[1], b * q[2])] }; },
      function (r) { var f = foods(r, 2), q = pick(r, [[3, 1, 3], [1, 3, 3], [3, 1, 4], [2, 1, 4], [1, 2, 5]]), a = q[0], b = q[1], t = (a + b) * q[2];
        return { text: ratioText(f, a, b) + ', 모두 {' + t + '}개 담아 주세요.', boxes: 1,
          check: ratio(0, f[0], f[1], a, b, t), answer: [two(f[0], a * q[2], f[1], b * q[2])] }; },
      function (r) { var f = foods(r, 2), q = pick(r, [[1, 2, 2, 3], [2, 1, 2, 3], [1, 3, 2, 3], [1, 2, 3, 2]]), a = q[0], b = q[1], s = a + b, t1 = s * q[2], t2 = s * q[3];
        return { text: '두 도시락 모두 ' + ratioText(f, a, b) + ' 담아 주세요. 도시락 1에는 {' + t1 + '}개, 도시락 2에는 {' + t2 + '}개예요.', boxes: 2,
          check: function (x) { return first(ratio(0, f[0], f[1], a, b, t1)(x), ratio(1, f[0], f[1], a, b, t2)(x)); },
          answer: [two(f[0], a * q[2], f[1], b * q[2]), two(f[0], a * q[3], f[1], b * q[3])] }; }
    ]
  };
  /* 한 판(주문 3개) 만들기. first=true 면 위 예시 주문 그대로(처음 하는 학년 — 하는 법 설명과 맞춤).
     avoid: 바로 전 판 주문 문장들(같은 문장은 다시 내지 않음). 예시 주문과 똑같은 문장도 피함 */
  function makeRound(g, opts) {
    opts = opts || {};
    if (opts.first) return ORDERS[g].slice();
    var rng = opts.rng || Math.random, avoid = opts.avoid || [], fixed = ORDERS[g].map(function (o) { return o.text; });
    return GEN[g].map(function (make) {
      var o;
      for (var t = 0; t < 40; t++) { o = make(rng); if (avoid.indexOf(o.text) < 0 && fixed.indexOf(o.text) < 0) break; }
      return o;
    });
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

  var api = { FOODS: FOODS, NAME: NAME, BOX_MAX: BOX_MAX, ORDERS: ORDERS, GEN: GEN, makeRound: makeRound, judge: judge, startBoxes: startBoxes, total: total };
  root.MP_PICNIC = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
