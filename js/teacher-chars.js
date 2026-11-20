/*
 * 동물 선생님 캐릭터 (곰·토끼·여우·고슴도치·너구리·양)
 * ------------------------------------------------------------
 * 그림: assets/teachers/<id>.webp (tools/build_teachers.py 가 제미나이 원본에서 만듦)
 *       칸 위치·발 기준점·다리 시작 높이(hip): js/data/teacher-sprites.js (window.MP_TEACHER_SPRITES)
 * 방향: down(앞) up(뒤) right(옆) 세 칸. 왼쪽은 옆모습을 좌우로 뒤집어 그립니다.
 * 걷기: 선생님들은 손에 물건을 들고 있어서 몸·팔은 그대로 두고 '다리만' 움직입니다.
 *       hip 아래를 발 가운데에서 왼쪽·오른쪽 다리로 나눠, 번갈아 살짝 들어 올리고(앞·뒤)
 *       옆모습은 앞뒤로 조금씩 내딛습니다. 몸은 걸음마다 아주 살짝만 들썩입니다.
 */
(function () {
  'use strict';
  var SPR = window.MP_TEACHER_SPRITES || {};
  var BODY_H = 300;      // tools/build_teachers.py 의 BODY_H
  var DRAW_H = 60;       // 지도 위 몸 키(px) — 학생 캐릭터(js/characters.js)와 같음
  var ORDER = ['bear', 'rabbit', 'fox', 'hedgehog', 'raccoon', 'sheep'];
  var NAMES = { bear: '곰 선생님', rabbit: '토끼 선생님', fox: '여우 선생님', hedgehog: '고슴도치 선생님', raccoon: '너구리 선생님', sheep: '양 선생님' };
  // 그림이 있는 선생님만 고를 수 있음
  var LIST = ORDER.filter(function (id) { return SPR[id]; }).map(function (id) { return { id: id, name: (SPR[id] && SPR[id].name) || NAMES[id] }; });

  var images = {};
  function load(id) {
    var e = images[id];
    if (e) return e;
    e = images[id] = { img: new Image(), ok: false };
    e.img.onload = function () { e.ok = true; };
    if (SPR[id]) e.img.src = SPR[id].src + (window.MP_TEACHER_VER ? '?v=' + window.MP_TEACHER_VER : '');
    return e;
  }
  function valid(id) { return !!SPR[id]; }
  function first() { return LIST.length ? LIST[0].id : null; }

  // (x, y) = 발 위치. h = 화면에서의 몸 키. step: 0~1 걸음 위치(걷지 않으면 null)
  function drawTeacher(ctx, id, x, y, dir, h, step, breathe) {
    var e = load(id), m = SPR[id];
    if (!e.ok || !m) return false;
    var view = dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'right';
    var r = m.views[view], s = h / BODY_H, flip = dir === 'left';
    var sx = r[0], sy = r[1], w = r[2], hh = r[3], fx = r[4], fy = r[5], hip = r[6] || Math.round(hh * 0.85);
    var legH = hh - hip, img = e.img;
    var walking = step != null;
    var a = walking ? Math.sin(step * Math.PI * 2) : 0;   // +: 왼발을 듦, -: 오른발을 듦
    var up = Math.abs(a), land = walking ? 1 - up : 0;    // land: 두 발이 땅에 닿는 순간 1
    var lift = 12, swing = 13;                    // 그림(300px 키) 기준 px
    var lA = Math.max(0, a) * lift, rA = Math.max(0, -a) * lift;   // 왼발·오른발 들기
    var side = view === 'right';
    // 몸 전체 움직임 (학생 캐릭터처럼 통통 튀게)
    var bob = up * 7;                              // 발을 들 때 몸이 위로
    var sqY = 1 - land * 0.045, sqX = 1 + land * 0.03;   // 발이 닿을 때 살짝 납작
    var tilt = side ? (walking ? 0.07 + up * 0.03 : 0)    // 옆모습: 가는 쪽으로 앞으로 숙임
                    : a * 0.05;                          // 앞·뒤: 디딘 발 쪽으로 좌우로 흔들
    var twist = side ? 0 : a * 0.05;               // 앞·뒤: 엉덩이를 축으로 몸통이 뒤뚱뒤뚱
    ctx.save();
    ctx.translate(x, y - bob * s);                  // 몸과 다리를 함께 올려 엉덩이에 틈이 생기지 않게
    if (tilt) ctx.rotate(flip ? -tilt : tilt);
    ctx.scale((flip ? -1 : 1) * s * sqX, s * sqY * (breathe || 1));
    // 2) 다리: 작은 칸으로 나눠, 칸마다 조금씩 다르게 옮겨 그려 부드럽게 휘게 함 (잘린 자국이 생기지 않게)
    //    - 위아래: 엉덩이(hip)에서는 0, 발로 갈수록 크게 움직임
    //    - 좌우: 두 다리 사이(fx)에서는 0, 다리 가운데로 갈수록 커짐 → 가운데에 끊긴 줄이 생기지 않음
    if (legH > 2) {
      var CW = 4, CH = 4, half = Math.max(8, Math.min(fx, w - fx) * 0.55);
      for (var yy = 0; yy < legH; yy += CH) {
        var ch = Math.min(CH, legH - yy), t = (yy + ch / 2) / legH;
        var wy = t * t * (3 - 2 * t);               // 부드럽게 0 → 1
        for (var xx = 0; xx < w; xx += CW) {
          var cw = Math.min(CW, w - xx), d = (xx + cw / 2 - fx) / half;
          var k = Math.min(1, Math.abs(d)); k = k * k * (3 - 2 * k);
          var ox = 0, oy;
          if (side) {
            // 옆모습: 뒤쪽(왼쪽)·앞쪽(오른쪽) 다리를 서로 반대로 앞뒤로 내딛고, 앞으로 나가는 발을 살짝 듦
            var sg = d < 0 ? -1 : 1;
            ox = sg * a * swing * wy * k;
            oy = -(sg * a > 0 ? Math.abs(a) * lift * 0.6 : 0) * wy * k;
          } else {
            oy = -(d < 0 ? lA : rA) * wy * k;
          }
          // 이웃 칸 그림을 2px 더 가져와 겹쳐 그려(늘이지 않고) 칸 사이 틈이 보이지 않게
          var gw = Math.min(cw + 2, w - xx), gh = Math.min(ch + 2, legH - yy);
          ctx.drawImage(img, sx + xx, sy + hip + yy, gw, gh, -fx + xx + ox, -fy + hip + yy + oy, gw, gh);
        }
      }
    }
    // 1) 몸·머리·손: 다리 위에 그려 엉덩이 이음매를 덮음. 앞·뒤 모습은 엉덩이를 축으로 살짝 뒤뚱
    ctx.save();
    if (twist) { ctx.translate(0, -fy + hip); ctx.rotate(twist); ctx.translate(0, fy - hip); }
    ctx.drawImage(img, sx, sy, w, hip + 1, -fx, -fy, w, hip + 1);
    ctx.restore();
    ctx.restore();
    return true;
  }

  // 공원에서 걷는 선생님. 게임은 draw(ctx, x, y, dir, moving, t) 만 부릅니다(js/characters.js 의 Walker 와 같은 모양).
  function Walker(id) { this.set(id); }
  Walker.prototype.set = function (id) { this.id = valid(id) ? id : first(); this.sid = 'T:' + this.id; if (this.id) load(this.id); };
  Walker.prototype.draw = function (ctx, x, y, dir, moving, t) {
    if (!this.id) return;
    var step = moving ? (t * 2) % 1 : null;     // 1초에 두 걸음씩 두 번(학생 캐릭터와 비슷한 빠르기)
    var sh = moving ? 1 - Math.abs(Math.sin(step * Math.PI * 2)) * 0.15 : 1;
    ctx.save();
    ctx.fillStyle = 'rgba(30,40,60,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y - 1, 17 * sh, 5.4 * sh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawTeacher(ctx, this.id, x, y, dir, DRAW_H, step, moving ? 1 : 1 + Math.sin(t * 2.4) * 0.015);
  };

  // 선생님 화면의 캐릭터 고르기 그림: canvas 에 앞모습을 꽉 차게 그림
  function drawThumb(canvas, id) {
    var e = load(id), m = SPR[id];
    if (!m) return;
    function paint() {
      var c = canvas.getContext('2d'), r = m.views.down;
      var k = Math.min(canvas.width / r[2], canvas.height / r[3]) * 0.94;
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.drawImage(e.img, r[0], r[1], r[2], r[3], (canvas.width - r[2] * k) / 2, canvas.height - r[3] * k - 2, r[2] * k, r[3] * k);
    }
    if (e.ok) paint(); else e.img.addEventListener('load', paint, { once: true });
  }

  window.MPTeacherChars = { LIST: LIST, valid: valid, first: first, Walker: Walker, drawThumb: drawThumb, load: load, name: function (id) { return (SPR[id] && SPR[id].name) || NAMES[id] || '선생님'; } };
})();
