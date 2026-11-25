/*
 * 별마당 캐릭터 (완성형 캐릭터 고르기)
 * ------------------------------------------------------------
 * 그림: assets/characters/<id>.webp (tools/build_characters.py 가 제미나이 원본에서 만듦)
 *       칸 위치·발 기준점: js/data/character-sprites.js (window.MP_CHAR_SPRITES)
 * 방향: down(앞) up(뒤) right(옆) 칸. 왼쪽(left) 칸이 있으면 그대로, 없으면 옆모습을 좌우로 뒤집어 그립니다.
 * 기본·건물 보상 캐릭터(F·R)는 한옥 옷 걷기 그림 12장(tools/build_hanok_walk.py)을 씁니다.
 * 걷기(좋은 것부터): ① 움직이는 걷기 GIF 프레임(<id>-anim.webp) ② 걷는 자세 그림과 서 있기를 번갈아
 *       ③ 그림이 없으면 걸음마다 살짝 위아래로 움직이고 옆모습은 가는 쪽으로 조금 숙여 걷습니다.
 *
 * 캐릭터 종류
 *  free   : 처음부터 고를 수 있음 (기본 남자아이 F1, 기본 여자아이 F2)
 *  reward : 그 건물(스테이지)을 통과하면 받음. 남자아이(b)·여자아이(g) 그림이 따로 있고,
 *           고르기 화면에는 처음에 고른 성별(기본 남자아이/여자아이)의 그림만 나옴
 *
 * 걷기 그림 팩(js/data/character-packs.js 의 map 에 있는 그림 id):
 *  walk.json 의 texture PNG 에서 224x320 한 칸만 잘라 그대로 그림(좌우 뒤집기·여백 자르기 없음).
 *  방향 줄: 아래로 front(0) · 왼쪽 left(1) · 오른쪽 right(2) · 위로 back(3).
 *  칸 안의 발 기준점(anchorPixels)이 캐릭터의 지도 좌표(발밑)에 오고, 몸 키 bodyPx 를 DRAW_H 로 맞춰 같은 비율로 줄임.
 *  걸을 때만 frameDurationMs(80ms)마다 다음 열(0~11 반복), 멈추면 그 방향의 서 있기 열(idle)을 고정.
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
    { id: 'R8', kind: 'reward', facility: 'picnic', name: '소풍 도시락 친구' },
    { id: 'R9', kind: 'reward', facility: 'shop', name: '추억 수집가' }
  ];
  var BY_ID = {};
  ROSTER.forEach(function (c) { BY_ID[c.id] = c; });

  // 그림 파일 id: 보상 캐릭터는 성별에 따라 R1b / R1g
  function spriteId(id, gender) {
    var c = BY_ID[id];
    return c && c.kind === 'reward' ? id + (gender === 'girl' ? 'g' : 'b') : id;
  }

  // ---------- 걷기 그림 팩 ----------
  var PK = window.MP_CHAR_PACKS || { packs: {}, map: {}, idle: {} };
  var PACK_DIR = { down: 'front', left: 'left', right: 'right', up: 'back' };
  var packInfo = {}, packImgs = {};
  function isPack(sid) { return !!PK.map[sid]; }
  function loadPackInfo(pack) {
    var e = packInfo[pack];
    if (e) return e;
    e = packInfo[pack] = { info: null, done: false };
    fetch(PK.packs[pack].dir + 'walk.json' + (window.MP_CHAR_VER ? '?v=' + window.MP_CHAR_VER : ''))
      .then(function (r) { return r.json(); })
      .then(function (j) { e.info = j; e.done = true; })
      .catch(function () { e.done = true; console.error('걷기 그림 팩 walk.json 을 불러오지 못했어요: ' + pack); });
    return e;
  }
  // 팩 캐릭터 그림: walk.json 과 texture PNG 가 둘 다 준비되면 ok
  function loadPack(sid) {
    var m = PK.map[sid], pi = loadPackInfo(m[0]), e = packImgs[sid];
    if (!e) {
      e = packImgs[sid] = { sid: sid, img: new Image(), started: false, imgOk: false, imgDone: false, ch: null };
      Object.defineProperty(e, 'ok', { get: function () { return e.imgOk && !!e.ch; } });
      Object.defineProperty(e, 'done', { get: function () { return e.imgDone || (pi.done && !pi.info); } });
      e.img.onload = function () { e.imgOk = e.imgDone = true; };
      e.img.onerror = function () { e.imgDone = true; console.error('캐릭터 그림을 불러오지 못했어요: ' + sid); };
    }
    if (!e.started && pi.info) {
      e.started = true;
      e.ch = pi.info.characters[m[1]] || null;
      if (!e.ch) { e.imgDone = true; console.error('walk.json 에 없는 캐릭터예요: ' + m[0] + '/' + m[1]); }
      // 원본 texture(PNG)와 크기·칸 배치가 똑같은 WebP 를 받음(tools/build_pack_web.py, 약 1/4 크기)
      else e.img.src = PK.packs[m[0]].dir + e.ch.texture.replace(/\.png$/i, '.webp') + (window.MP_CHAR_VER ? '?v=' + window.MP_CHAR_VER : '');
    } else if (!e.started && !pi.done && !e.waiting) {
      // walk.json 을 받는 대로 PNG 도 받기 시작
      e.waiting = true;
      var t = setInterval(function () { if (pi.done) { clearInterval(t); e.waiting = false; loadPack(sid); } }, 50);
    }
    return e;
  }
  // 팩 그림 한 칸 그리기. col: 0~11(그 방향 애니메이션 안의 몇 번째 프레임)
  function drawPack(ctx, sid, x, y, dir, h, col) {
    var e = loadPack(sid);
    if (!e.ok) return false;
    var m = PK.map[sid], info = packInfo[m[0]].info, a = e.ch.animations[PACK_DIR[dir] || 'front'];
    if (!a) return false;
    var fw = info.frameWidth, fh = info.frameHeight, ax = info.anchorPixels.x, ay = info.anchorPixels.y;
    var s = h / PK.packs[m[0]].bodyPx, c = a.firstColumn + (col % a.frameCount);
    var dx = x - ax * s, dy = y - ay * s, T = ctx.getTransform ? ctx.getTransform() : null;
    var src = e.img, k = 1;
    if (T && !T.b && !T.c && T.a > 0 && T.d > 0) {
      // ① 화면 점에 맞춤: 지도는 화면 점 단위로 그려지는데 캐릭터만 반 점씩 어긋나면 움직일 때
      //    땅 위에서 미세하게 떨리고 윤곽이 겹쳐 보임 → 칸의 왼쪽 위 모서리를 화면 점에 맞춤(기준점은 그대로 따라감)
      dx = (Math.round(T.a * dx + T.e) - T.e) / T.a;
      dy = (Math.round(T.d * dy + T.f) - T.f) / T.d;
      // ② 미리 줄여 둔 그림: 큰 그림(2688x1280)을 매 장면 1/3 정도로 줄여 그리면 느린 기기에서 무겁고 반짝이므로
      //    지금 화면 크기에 맞게 한 번 줄여 둔 그림에서 거의 1:1 로 잘라 그림(크기가 바뀌면 다시 만듦)
      var cache = scaledAtlas(e, T.a * s);
      if (cache) { src = cache.cv; k = cache.k; }
    }
    ctx.drawImage(src, Math.round(c * fw * k), Math.round(a.row * fh * k), Math.round(fw * k), Math.round(fh * k), dx, dy, fw * s, fh * s);
    return true;
  }
  // 화면에 그려질 배율(devScale)에 맞춰 한 번 줄여 둔 걷기 그림. 배율은 2^(1/4) 단계로 묶어 확대·축소 중 자꾸 다시 만들지 않음
  function scaledAtlas(e, devScale) {
    var k = Math.pow(2, Math.ceil(Math.log(devScale) / Math.LN2 * 4) / 4);   // 조금 크게(흐려지지 않게)
    if (!(k > 0) || k >= 0.85) return null;                                    // 거의 원래 크기면 원본 그대로
    if (e.scaled && e.scaled.k === k) return e.scaled;
    var W = e.img.naturalWidth, H = e.img.naturalHeight, cv = document.createElement('canvas');
    cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    // 칸마다 따로 줄여 칸 경계가 정확히 정수 위치에 오게 함(옆 칸 그림이 섞여 들어오지 않게)
    var info = packInfo[PK.map[e.sid][0]].info, fw = info.frameWidth, fh = info.frameHeight;
    for (var r = 0; r * fh < H; r++) for (var q = 0; q * fw < W; q++) {
      g.drawImage(e.img, q * fw, r * fh, fw, fh, Math.round(q * fw * k), Math.round(r * fh * k), Math.round(fw * k), Math.round(fh * k));
    }
    e.scaled = { k: k, cv: cv };
    return e.scaled;
  }
  function packIdleCol(sid, dir) {
    var m = PK.map[sid], id = PK.idle[m[0] + '/' + m[1]];
    return (id && id[PACK_DIR[dir] || 'front']) || 0;
  }
  function packWalkCol(sid, ms) {
    var e = loadPack(sid), info = packInfo[PK.map[sid][0]].info;
    return Math.floor(ms / (info.frameDurationMs || 80));
  }
  // 고르기 화면 카드: 큰 걷기 그림 대신 앞모습 서 있기 한 칸을 절반 크기로 만든 작은 그림(cards/<캐릭터>.webp)
  var thumbs = {};
  function loadThumb(sid) {
    var e = thumbs[sid];
    if (e) return e;
    var m = PK.map[sid];
    e = thumbs[sid] = { img: new Image(), ok: false, done: false };
    e.img.onload = function () { e.ok = e.done = true; };
    e.img.onerror = function () { e.done = true; console.error('카드 그림을 불러오지 못했어요: ' + sid); };
    e.img.src = PK.packs[m[0]].dir + 'cards/' + m[1] + '.webp' + (window.MP_CHAR_VER ? '?v=' + window.MP_CHAR_VER : '');
    return e;
  }
  // (x, y) = 발 위치, h = 몸 키. 카드 그림은 224x320 칸의 절반이라 기준점(112, 294)도 절반
  function drawThumb(ctx, sid, x, y, h) {
    var e = loadThumb(sid);
    if (!e.ok) return false;
    var m = PK.map[sid], b = PK.packs[m[0]].bodyPx / 2, w = e.img.naturalWidth, hh = e.img.naturalHeight, s = h / b;
    ctx.drawImage(e.img, 0, 0, w, hh, x - (w / 2) * s, y - (294 / 2) * s, w * s, hh * s);
    return true;
  }
  // 고르기 화면 이름(팩 캐릭터는 그 캐릭터 이름)
  function spriteName(sid) { return PK.map[sid] ? PK.map[sid][2] : null; }

  var images = {};
  function load(sid) {
    if (isPack(sid)) return loadPack(sid);
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
    if (isPack(sid)) return loadPack(sid);
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
  // 왼쪽 걷기 그림이 따로 있으면(한옥 캐릭터) 그대로 쓰고, 없으면 옆모습(right)을 뒤집어 씀
  function viewOf(m, dir) {
    return dir === 'up' ? 'up' : dir === 'down' ? 'down' : dir === 'left' && m.views.left ? 'left' : 'right';
  }
  function drawAnim(ctx, sid, x, y, dir, h, t) {
    if (isPack(sid)) return loadPack(sid).ok && drawPack(ctx, sid, x, y, dir, h, packWalkCol(sid, t * 1000));
    var A = SPR[sid] && SPR[sid].anim, e = loadAnim(sid);
    if (!A || !e || !e.ok) return false;
    var k = Math.floor(t * 1000 / A.ms) % A.frames;
    var view = viewOf(A, dir);
    var r = A.views[view], s = h / (BODY_H * (A.k || 1));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale((dir === 'left' && view !== 'left' ? -1 : 1) * s, s);
    ctx.drawImage(e.img, r[0], r[1] + k * A.rowH, r[2], r[3], -r[4], -r[5], r[2], r[3]);
    ctx.restore();
    return true;
  }

  // (x, y) = 발 위치. h = 몸 키(px). 왼쪽은 옆모습을 뒤집음.
  // opt.walk: 걷는 자세 그림(<id>-walk.webp)을 씀, opt.mirror: 좌우를 한 번 더 뒤집음(앞·뒤 모습의 반대 발)
  function drawSprite(ctx, sid, x, y, dir, h, opt) {
    opt = opt || {};
    if (isPack(sid)) return drawPack(ctx, sid, x, y, dir, h, packIdleCol(sid, dir));
    // 걷기 GIF 가 있는 캐릭터는 서 있을 때도 GIF 그림(두 발이 가장 모인 장)을 씀 → 걷기와 서 있기 그림이 같음
    var A = SPR[sid] && SPR[sid].anim, ae = A && !opt.walk && loadAnim(sid);
    if (ae && ae.ok) {
      var av = viewOf(A, dir);
      var ar = A.views[av], as = h / (BODY_H * (A.k || 1)), ak = (A.idle && A.idle[av]) || 0;
      var aflip = (dir === 'left' && av !== 'left') !== !!opt.mirror;
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
    var view = viewOf(m, dir);
    var r = m.views[view], s = h / (BODY_H * (m.k || 1));
    var flip = (dir === 'left' && view !== 'left') !== !!opt.mirror;
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
    this.walkMs = 0; this.lastT = null; this.stillMs = 1e9;
  };
  Object.defineProperty(Walker.prototype, 'isPlaceholder', { get: function () { return !load(this.sid).ok; } });
  Walker.prototype.draw = function (ctx, x, y, dir, moving, t) {
    var e = load(this.sid);
    if (!e.ok) { if (this.fallback) this.fallback.draw(ctx, x, y, dir, moving, t); return; }
    if (isPack(this.sid)) {
      // 걷기 시계: 이 캐릭터가 실제로 움직이는 동안만 흐름(화면을 다시 그릴 때마다 0 으로 돌아가지 않음).
      // 멈추면 0 으로 돌려 다음 걸음은 0열부터, 멈춘 동안은 마지막 방향의 서 있기 열을 고정
      var dt = this.lastT == null ? 0 : Math.min(0.25, Math.max(0, t - this.lastT));
      this.lastT = t;
      // ③ 아주 잠깐 멈춘 것(벽을 따라 미끄러질 때, 친구 위치를 받는 사이)은 멈춤으로 보지 않음:
      //    0.15초보다 짧게 멈추면 걷기를 이어 가고, 그보다 길게 멈춰야 서 있기 그림 + 다음 걸음은 0열부터
      if (moving) { this.walkMs += dt * 1000; this.stillMs = 0; }
      else { this.stillMs = (this.stillMs || 0) + dt * 1000; if (this.stillMs >= 150) this.walkMs = 0; }
      var walking = moving || this.stillMs < 150;
      ctx.save();
      ctx.fillStyle = 'rgba(30,40,60,0.25)';
      ctx.beginPath(); ctx.ellipse(x, y - 1, 16, 5.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      drawPack(ctx, this.sid, x, y, dir, DRAW_H, walking && this.walkMs > 0 ? packWalkCol(this.sid, this.walkMs) : packIdleCol(this.sid, dir));
      return;
    }
    // 예전 방식 그림도 발 위치를 화면 점에 맞춤(지도와 따로 반 점씩 떨리지 않게)
    var T = ctx.getTransform ? ctx.getTransform() : null;
    if (T && !T.b && !T.c && T.a > 0 && T.d > 0) {
      x = (Math.round(T.a * x + T.e) - T.e) / T.a;
      y = (Math.round(T.d * y + T.f) - T.f) / T.d;
    }
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
    spriteId: spriteId, spriteName: spriteName, isPack: isPack, loadThumb: loadThumb, drawThumb: drawThumb, load: load, loadAnim: loadAnim, drawSprite: drawSprite, drawAnim: drawAnim, Walker: Walker, BODY_H: BODY_H, DRAW_H: DRAW_H
  };
})();
