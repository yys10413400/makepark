/*
 * 메이크파크 캐릭터 (완성형 캐릭터 고르기)
 * ------------------------------------------------------------
 * 그림: assets/characters/<id>.webp (tools/build_characters.py 가 제미나이 원본에서 만듦)
 *       칸 위치·발 기준점: js/data/character-sprites.js (window.MP_CHAR_SPRITES)
 * 방향: down(앞) up(뒤) right(옆) 세 칸. 왼쪽은 옆모습을 좌우로 뒤집어 그립니다.
 * 걷기(좋은 것부터): ① 움직이는 걷기 GIF 프레임(<id>-anim.webp) ② 걷는 자세 그림과 서 있기를 번갈아
 *       ③ 그림이 없으면 걸음마다 살짝 위아래로 움직이고 옆모습은 가는 쪽으로 조금 숙여 걷습니다.
 *
 * 캐릭터 종류
 *  free   : 처음부터 고를 수 있음 (기본 남자아이 F1, 기본 여자아이 F2)
 *  reward : 그 건물(스테이지)을 통과하면 받음. 남자아이(b)·여자아이(g) 두 그림 중 내 성별 쪽을 씀
 *  shop   : 기념품 가게 티켓으로 삼
 */
(function () {
  'use strict';
  var SPR = window.MP_CHAR_SPRITES || {};
  var BODY_H = 300;        // 그림의 몸 키(px) — tools/build_characters.py 의 BODY_H
  var DRAW_H = 60;         // 지도 위 몸 키(px)

  var ROSTER = [
    { id: 'F1', kind: 'free', gender: 'boy', name: '기본 남자아이' },
    { id: 'F2', kind: 'free', gender: 'girl', name: '기본 여자아이' },
    { id: 'R1', kind: 'reward', facility: 'coaster', name: '꼬마 기관사' },
    { id: 'R2', kind: 'reward', facility: 'parade', name: '퍼레이드 고수' },
    { id: 'R3', kind: 'reward', facility: 'melody', name: '꼬마 가수' },
    { id: 'R4', kind: 'reward', facility: 'thrill', name: '범퍼카 레이서' },
    { id: 'R5', kind: 'reward', facility: 'ghost', name: '꼬마 유령' },
    { id: 'R6', kind: 'reward', facility: 'arcade', name: '게임 챔피언' },
    { id: 'R7', kind: 'reward', facility: 'star', name: '별빛 요정' },
    { id: 'S1', kind: 'shop', price: 2, name: '정글 탐험가' },
    { id: 'S2', kind: 'shop', price: 2, name: '꼬마 요리사' },
    { id: 'S3', kind: 'shop', price: 2, name: '해변 서퍼' },
    { id: 'S4', kind: 'shop', price: 4, name: '공룡 잠옷' },
    { id: 'S5', kind: 'shop', price: 4, name: '꼬마 해적' },
    { id: 'S6', kind: 'shop', price: 4, name: '꼬마 마법사' },
    { id: 'S7', kind: 'shop', price: 6, name: '우주 비행사' },
    { id: 'S8', kind: 'shop', price: 6, name: '꼬마 닌자' },
    { id: 'S9', kind: 'shop', price: 6, name: '꼬마 기사' },
    { id: 'S10', kind: 'shop', price: 6, name: '공주님' }
  ];
  var BY_ID = {};
  ROSTER.forEach(function (c) { BY_ID[c.id] = c; });

  // 그림 파일 id: 보상 캐릭터는 성별에 따라 R1b / R1g
  function spriteId(id, gender) {
    var c = BY_ID[id];
    return c && c.kind === 'reward' ? id + (gender === 'girl' ? 'g' : 'b') : id;
  }

  var images = {};
  function load(sid) {
    var e = images[sid];
    if (e) return e;
    e = images[sid] = { img: new Image(), ok: false, done: false };
    e.img.onload = function () { e.ok = e.done = true; };
    e.img.onerror = function () { e.done = true; console.error('캐릭터 그림을 불러오지 못했어요: ' + sid); };
    var walk = /-walk$/.test(sid), base = SPR[sid.replace(/-walk$/, '')];
    var src = base && (walk ? base.walk && base.walk.src : base.src);
    // 그림을 다시 만들면 버전(MP_CHAR_VER)이 바뀌어 브라우저가 예전 그림을 쓰지 않음
    if (src) e.img.src = src + (window.MP_CHAR_VER ? '?v=' + window.MP_CHAR_VER : ''); else e.done = true;
    return e;
  }
  function hasWalk(sid) { return !!(SPR[sid] && SPR[sid].walk); }

  // 움직이는 걷기 GIF 프레임(assets/characters/<id>-anim.webp, tools/build_char_anim.py 가 만듦)
  // 시트: 줄 = 프레임, 칸 = down·up·right. 프레임은 작게(k배) 저장돼 있음. 왼쪽은 옆모습을 뒤집음
  var anims = {};
  function loadAnim(sid) {
    var A = SPR[sid] && SPR[sid].anim;
    if (!A) return null;
    var e = anims[sid];
    if (!e) {
      e = anims[sid] = { img: new Image(), ok: false };
      e.img.onload = function () { e.ok = true; };
      e.img.src = A.src + (window.MP_CHAR_VER ? '?v=' + window.MP_CHAR_VER : '');
    }
    return e;
  }
  function drawAnim(ctx, sid, x, y, dir, h, t) {
    var A = SPR[sid] && SPR[sid].anim, e = loadAnim(sid);
    if (!A || !e || !e.ok) return false;
    var k = Math.floor(t * 1000 / A.ms) % A.frames;
    var view = dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'right';
    var r = A.views[view], s = h / (BODY_H * (A.k || 1));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale((dir === 'left' ? -1 : 1) * s, s);
    ctx.drawImage(e.img, r[0], r[1] + k * A.rowH, r[2], r[3], -r[4], -r[5], r[2], r[3]);
    ctx.restore();
    return true;
  }

  // (x, y) = 발 위치. h = 몸 키(px). 왼쪽은 옆모습을 뒤집음.
  // opt.walk: 걷는 자세 그림(<id>-walk.webp)을 씀, opt.mirror: 좌우를 한 번 더 뒤집음(앞·뒤 모습의 반대 발)
  function drawSprite(ctx, sid, x, y, dir, h, opt) {
    opt = opt || {};
    // 걷기 GIF 가 있는 캐릭터는 서 있을 때도 GIF 그림(두 발이 가장 모인 장)을 씀 → 걷기와 서 있기 그림이 같음
    var A = SPR[sid] && SPR[sid].anim, ae = A && !opt.walk && loadAnim(sid);
    if (ae && ae.ok) {
      var av = dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'right';
      var ar = A.views[av], as = h / (BODY_H * (A.k || 1)), ak = (A.idle && A.idle[av]) || 0;
      var aflip = (dir === 'left') !== !!opt.mirror;
      ctx.save();
      ctx.translate(x, y - (opt.bob || 0));
      if (opt.tilt) ctx.rotate(opt.tilt);
      ctx.scale((aflip ? -1 : 1) * as * (opt.sx || 1), as * (opt.sy || 1));
      ctx.drawImage(ae.img, ar[0], ar[1] + ak * A.rowH, ar[2], ar[3], -ar[4], -ar[5], ar[2], ar[3]);
      ctx.restore();
      return true;
    }
    var useWalk = opt.walk && hasWalk(sid);
    var e = load(useWalk ? sid + '-walk' : sid), m = SPR[sid] && (useWalk ? SPR[sid].walk : SPR[sid]);
    if (!e.ok || !m) return false;
    var view = dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'right';
    var r = m.views[view], s = h / BODY_H;
    var flip = (dir === 'left') !== !!opt.mirror;
    ctx.save();
    ctx.translate(x, y - (opt.bob || 0));
    if (opt.tilt) ctx.rotate(opt.tilt);
    ctx.scale((flip ? -1 : 1) * s * (opt.sx || 1), s * (opt.sy || 1));
    ctx.drawImage(e.img, r[0], r[1], r[2], r[3], -r[4], -r[5], r[2], r[3]);
    ctx.restore();
    return true;
  }

  // 공원에서 걷는 캐릭터. 게임은 draw(ctx, x, y, dir, moving, t) 만 부릅니다.
  function Walker(opts) {
    this.fallback = opts.fallback;
    this.set(opts.id, opts.gender);
  }
  Walker.prototype.set = function (id, gender) {
    this.id = BY_ID[id] ? id : 'F1';
    this.gender = gender === 'girl' ? 'girl' : 'boy';
    this.sid = spriteId(this.id, this.gender);
    load(this.sid);
    loadAnim(this.sid);   // 걷기 GIF 프레임도 미리
  };
  Object.defineProperty(Walker.prototype, 'isPlaceholder', { get: function () { return !load(this.sid).ok; } });
  Walker.prototype.draw = function (ctx, x, y, dir, moving, t) {
    var e = load(this.sid);
    if (!e.ok) { if (this.fallback) this.fallback.draw(ctx, x, y, dir, moving, t); return; }
    var opt;
    if (moving && SPR[this.sid] && SPR[this.sid].anim && loadAnim(this.sid).ok) {
      // 움직이는 걷기 GIF 가 있으면 그 한 걸음 프레임을 GIF 빠르기대로 차례로 보여 줌
      ctx.save();
      ctx.fillStyle = 'rgba(30,40,60,0.25)';
      ctx.beginPath(); ctx.ellipse(x, y - 1, 16, 5.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      drawAnim(ctx, this.sid, x, y, dir, DRAW_H, t);
      return;
    }
    if (moving && hasWalk(this.sid)) {
      // 걷는 자세 그림이 있으면: [걷는 자세, 서 있기, 반대 발 걷는 자세, 서 있기] 를 돌려 걷기.
      // 앞·뒤 모습의 반대 발은 걷는 자세를 좌우로 뒤집어 씀(옆모습은 두 다리가 같아 보여 그대로).
      // 서 있는 칸에서 몸이 살짝 올라가 걸음마다 통통 튀는 느낌을 줌.
      var f = Math.floor(t * 7) % 4, side2 = dir === 'left' || dir === 'right';
      load(this.sid + '-walk');
      opt = f % 2 === 0
        ? { walk: true, mirror: f === 2 && !side2 }
        : { bob: 1.2 };
      if (opt.walk && !load(this.sid + '-walk').ok) opt = { bob: 1.2 };
    } else if (moving) {
      // 걷기: 한 걸음마다 아주 살짝 위로(bob) 올라갔다 내려오고, 발을 디딜 때 조금 납작(sy).
      // 앞·뒤 모습은 몸이 아주 조금만 좌우로 흔들리고, 옆모습은 기울이지 않고 가는 쪽으로 살짝 숙임.
      var ph = t * 12, k = Math.abs(Math.sin(ph));
      var side = dir === 'left' || dir === 'right';
      opt = side
        ? { bob: k * 1.6, tilt: (dir === 'left' ? -1 : 1) * (0.035 + k * 0.015), sy: 0.985 + k * 0.015 }
        : { bob: k * 1.6, tilt: Math.sin(ph) * 0.018, sy: 0.985 + k * 0.015 };
    } else {
      opt = { sy: 1 + Math.sin(t * 2.4) * 0.01 };   // 가만히 있을 때 숨쉬기
    }
    var sh = moving ? 1 - ((opt.bob || 0) / 1.6) * 0.12 : 1;
    ctx.save();
    ctx.fillStyle = 'rgba(30,40,60,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y - 1, 16 * sh, 5.2 * sh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawSprite(ctx, this.sid, x, y, dir, DRAW_H, opt);
  };

  window.MPChars = {
    ROSTER: ROSTER, byId: function (id) { return BY_ID[id] || null; },
    spriteId: spriteId, load: load, loadAnim: loadAnim, drawSprite: drawSprite, drawAnim: drawAnim, Walker: Walker, BODY_H: BODY_H, DRAW_H: DRAW_H
  };
})();
