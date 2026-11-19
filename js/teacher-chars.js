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
    var a = step == null ? 0 : Math.sin(step * Math.PI * 2);
    var lift = 9, swing = 10;                     // 그림(300px 키) 기준 px
    var lA = Math.max(0, a) * lift, rA = Math.max(0, -a) * lift;   // 왼발·오른발 들기
    var bob = step == null ? 0 : Math.abs(a) * 4; // 한 발을 들 때 몸이 살짝 올라감
    var side = view === 'right';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale((flip ? -1 : 1) * s, s * (breathe || 1));
    var cut = Math.round(fx);
    // 1) 다리 (몸보다 먼저 그려서 이음매를 몸이 덮음)
    if (legH > 2) {
      if (side) {
        // 옆모습: 뒤쪽 다리(왼쪽 절반)와 앞쪽 다리(오른쪽 절반)를 서로 반대로 앞뒤로 내딛음
        var dx = a * swing;
        ctx.drawImage(img, sx, sy + hip, cut, legH, -fx - dx, -fy + hip - rA, cut, legH);
        ctx.drawImage(img, sx + cut, sy + hip, w - cut, legH, -fx + cut + dx, -fy + hip - lA, w - cut, legH);
      } else {
        ctx.drawImage(img, sx, sy + hip, cut, legH, -fx, -fy + hip - lA, cut, legH);
        ctx.drawImage(img, sx + cut, sy + hip, w - cut, legH, -fx + cut, -fy + hip - rA, w - cut, legH);
      }
    }
    // 2) 몸·머리·손 (그대로, 걸음마다 아주 살짝 들썩)
    ctx.drawImage(img, sx, sy, w, hip + 1, -fx, -fy - bob, w, hip + 1);
    ctx.restore();
    return true;
  }

  // 공원에서 걷는 선생님. 게임은 draw(ctx, x, y, dir, moving, t) 만 부릅니다(js/characters.js 의 Walker 와 같은 모양).
  function Walker(id) { this.set(id); }
  Walker.prototype.set = function (id) { this.id = valid(id) ? id : first(); this.sid = 'T:' + this.id; if (this.id) load(this.id); };
  Walker.prototype.draw = function (ctx, x, y, dir, moving, t) {
    if (!this.id) return;
    ctx.save();
    ctx.fillStyle = 'rgba(30,40,60,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y - 1, 17, 5.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    var step = moving ? (t * 2.2) % 1 : null;
    drawTeacher(ctx, this.id, x, y, dir, DRAW_H, step, moving ? 1 : 1 + Math.sin(t * 2.4) * 0.01);
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
