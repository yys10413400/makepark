/*
 * 메이크파크 캐릭터(아바타) 그리기
 * ------------------------------------------------------------
 * 받은 캐릭터 통합본(v2)의 분리 PNG를 한 캐릭터 좌표(256×320, 발 기준점 128,304)에 겹쳐 그립니다.
 * - 그림 목록: js/avatar/manifest.js (받은 그대로, 경로 앞 'assets/' → 'assets/avatar/')
 * - 착용 위치 보정: js/avatar/avatar-fit.js (방향·부품별로 손으로 고치는 값)
 * - 확인 그림: python tools/avatar_sheet.py (이 파일과 같은 순서·값으로 합성)
 * 부품을 매번 따로 그리지 않고, (외형·방향·걷기 칸)마다 한 장으로 합쳐 두었다가 그립니다.
 * 그래서 걸을 때 부품이 따로 움직이거나, 반투명으로 그릴 때 부품끼리 비쳐 보이지 않습니다.
 */
(function () {
  'use strict';
  var M = window.MAKEPARK_ASSETS, FIT = window.MP_AVATAR_FIT;
  if (!M || !FIT) return;
  var BASE = 'assets/avatar/';
  // 그림 한 칸은 256×320(발 128,304). 모자가 머리 위로 나갈 수 있게 합칠 때 위쪽에 여유(HEADROOM)를 둡니다.
  var HEADROOM = 56, TILE_W = 256, TILE_H = 320 + HEADROOM, ANCHOR_X = 128, ANCHOR_Y = 304 + HEADROOM;
  var IDLE_FRAME = 1;

  // 고를 수 있는 부품 (이름은 받은 미리보기와 같게)
  var OPTIONS = {
    hair: { label: '머리', items: [['1', '버섯컷'], ['2', '가르마 숏컷'], ['3', '웨이브 숏컷'], ['4', '단발'], ['5', '긴 머리'], ['6', '포니테일'], ['7', '양갈래'], ['8', '곱슬머리']] },
    face: { label: '얼굴', items: [['1', '기본 미소'], ['2', '동그란 눈'], ['3', '씩씩한 미소'], ['4', '나른한 눈'], ['5', '웃는 눈'], ['6', '진한 눈썹']] },
    outfit: { label: '옷', items: [['1', '별 후드'], ['2', '청록 멜빵바지'], ['3', '코랄 야구점퍼'], ['4', '체리 티·청치마'], ['5', '라벤더 맨투맨'], ['6', '코랄 리본 원피스']] },
    shoes: { label: '신발', items: [['1', '청록'], ['2', '코랄'], ['3', '라벤더']] },
    hat: { label: '모자', items: [['none', '없음'], ['cap', '청록 야구모자'], ['bucket', '아이보리 버킷햇'], ['beret', '보라 베레모'], ['headband', '코랄 머리띠']] },
    glasses: { label: '안경', items: [['none', '없음'], ['glasses_brown', '갈색 동그란 안경'], ['glasses_teal', '청록 동그란 안경']] },
    clip: { label: '머리핀', items: [['none', '없음'], ['clip_star', '코랄 별'], ['clip_bow', '노랑 리본'], ['clip_flower', '보라 꽃']] },
    bag: { label: '가방', items: [['none', '없음'], ['bag_yellow', '노랑 배낭'], ['bag_coral', '코랄 배낭'], ['bag_navy', '네이비 가방']] }
  };
  var DEFAULT = { hair: '1', face: '1', outfit: '1', shoes: '1', hat: 'none', glasses: 'none', clip: 'none', bag: 'none' };

  // 저장값이 깨졌거나 모르는 값이면 기본값으로
  function normalize(a) {
    var out = {};
    Object.keys(DEFAULT).forEach(function (k) {
      var v = a && a[k] != null ? String(a[k]) : DEFAULT[k];
      out[k] = OPTIONS[k].items.some(function (it) { return it[0] === v; }) ? v : DEFAULT[k];
    });
    return out;
  }
  function key(a) { return Object.keys(DEFAULT).map(function (k) { return a[k]; }).join('|'); }
  function src(p) { return p.replace(/^assets\//, BASE); }

  // ---------- 그리기 순서(레이어) ----------
  // ops: [경로, 상자[x,y,w,h] 또는 null, 옮김[dx,dy] 또는 null, 무리('body'|'head'|'top'|'hat'), 모자 정보]
  // body: 가방·몸·신발·끈 / head: 얼굴·안경·머리(모자를 쓰면 모자 가장자리 위쪽을 지움) / top: 머리핀 / hat: 모자
  // 착용 그림(worn): 캐릭터 칸(256×376, 위 56px 모자 여유)에서 기준 캐릭터에 맞춰 그린 아이템.
  // 있으면 위치 보정 없이 그대로 겹치고, 없으면 아래의 보정값(avatar-fit.js)으로 따로 그린 그림을 맞춥니다.
  var WORN = {};
  (window.MP_AVATAR_WORN || []).forEach(function (n) { WORN[n] = true; });
  function worn(n) { return WORN[n] ? 'assets/worn/' + n + '.png' : null; }
  var RAW = { raw: true };
  function layers(a, d, f) {
    var ops = [], fitted = M.fitted, o = a.outfit, group = 'body';
    var bag = a.bag !== 'none' ? FIT.bag[a.bag] : null, fbag = !!(bag && bag.fitted);
    var hatFront = a.hat !== 'none' ? worn('hat_' + a.hat + '_front_' + d) : null;
    var hatBack = hatFront ? worn('hat_' + a.hat + '_back_' + d) : null;
    var hatHairW = hatFront && a.hat !== 'headband' ? worn('hathair_' + a.hair + '_' + d) : null;
    var hatHair = !hatFront && a.hair === '1' && a.hat === 'bucket';   // (버킷햇 착용 그림이 있으면 쓰지 않음)   // 머리1+버킷햇: 맞춤 그림 한 장(머리·모자 중복 없음)
    var bagBody = bag ? worn(a.bag + '_body_' + d) : null, bagStraps = bag && d !== 'up' ? worn(a.bag + '_straps_' + d) : null;
    function add(p, box, off, extra) { if (p) ops.push([p, box || null, off || null, group, extra || null]); }
    // 1) 등 뒤 가방 (앞·옆에서는 몸 뒤)
    if (d !== 'up' && bag) {
      if (bagBody) add(bagBody, null, null, RAW);
      else if (fbag) add(fitted.bag_yellow[d]);
      else if (bag[d]) add(M.accessories[a.bag][(bag.sideImage || {})[d] || d], bag[d]);
    }
    // 2) 몸(옷·팔다리 걷기 칸) → 신발
    add(M.bodies[o][d][f]);
    add(M.shoes[a.shoes][o][d][f]);
    // 3) 어깨끈: 몸 위, 머리 아래
    if (d !== 'up' && bag) {
      if (bagStraps) add(bagStraps, null, null, RAW);
      else if (!bagBody) add(fbag ? fitted.bag_straps[d] : 'assets/fitted/' + bag.straps + '_' + d + '.png');
    }
    // 4) 뒷모습 가방: 머리보다 먼저 그려 긴 머리가 가방 위로 내려오게
    if (d === 'up' && bag) {
      if (bagBody) add(bagBody, null, null, RAW);
      else if (fbag) add(fitted.bag_yellow.up);
      else add(M.accessories[a.bag][bag.upImage || 'up'], bag.up);
    }
    // 4-1) 착용 모자의 뒤 조각: 머리 뒤
    if (hatBack) add(hatBack, null, null, RAW);
    // 5) 얼굴 → (옆모습 안경) → 머리 → (앞모습 안경)
    group = 'head';
    add(M.faces[a.face][d]);
    var gOff = null;
    if (a.glasses !== 'none' && d !== 'up') {
      var g1 = FIT.glasses[d] || [0, 0], g2 = (FIT.glassesByFace[a.face] || {})[d] || [0, 0];
      gOff = [g1[0] + g2[0], g1[1] + g2[1]];
    }
    var hairW = worn('hair_' + a.hair + '_' + d);   // 다시 그린 머리(착용 칸 기준)
    if (hatHairW) add(hatHairW, null, null, RAW);   // 모자 쓴 머리
    else if (hatHair && !hairW) add(fitted.bucket_hair1[d]);
    else if (hairW) add(hairW, null, null, RAW);
    else add(M.hair[a.hair][d]);
    // 안경은 머리카락 위에(앞머리가 렌즈를 가리지 않게). 옆모습은 안경다리가 귀에서 끝나게 잘라 그림
    if (gOff) add(fitted[a.glasses][d], null, gOff, { clipX: (FIT.glassesClipX || {})[d] || null });
    // 6) 머리핀 → 모자 (모자는 그림 비율 그대로 [x, y, 배율])
    group = 'top';
    var clipW = a.clip !== 'none' ? worn(a.clip + '_' + d) : null;
    if (clipW) add(clipW, null, null, RAW);
    else if (a.clip !== 'none' && FIT.clip[d] && !worn(a.clip + '_down')) add(M.accessories[a.clip][d], scaled(FIT.clip[d], ((FIT.clipByHair[a.hair] || {})[d])));
    if (hatFront) {
      group = 'hat';
      // 모자 쓴 머리 그림이 없으면 모자 아래 가장자리 위쪽 머리를 지움
      add(hatFront, null, null, { raw: true, worn: true, cut: !hatHairW && (FIT.hatNoCut || []).indexOf(a.hat) < 0 });
    } else if (a.hat !== 'none' && !hatHair) {
      group = 'hat';
      var hb = FIT.hatByHair[a.hair] || {}, adj = (hb[a.hat] || hb['*'] || {})[d] || [0, 0, 1], h = FIT.hat[a.hat][d];
      add(M.accessories[a.hat][d], null, null, { name: a.hat, d: d, x: h[0] + adj[0], y: h[1] + adj[1], s: h[2] * (adj[2] || 1),
        cut: (FIT.hatNoCut || []).indexOf(a.hat) < 0 });
    }
    return ops;
  }
  // [dx, dy, 배율] 보정: 배율은 아래 가장자리(모자 챙) 기준으로 키움
  function scaled(box, adj) {
    if (!adj) return box;
    var s = adj[2] || 1;
    return [box[0] + adj[0] - box[2] * (s - 1) / 2, box[1] + adj[1] - box[3] * (s - 1), box[2] * s, box[3] * s];
  }

  // ---------- 이미지 불러오기 ----------
  var images = {};   // 경로 → { img, ok, done, waiters }
  // (선택) 묶음 그림: 파일 수 제한이 있는 곳(휴대폰 미리보기 페이지)에서는 여러 PNG를 한 장에 모아 올리고
  // window.MP_AVATAR_ATLAS = { '원래 경로': ['묶음 파일', x, y, w, h] } 로 알려 주면 잘라서 똑같이 씁니다.
  var ATLAS = window.MP_AVATAR_ATLAS || null, sheets = {};
  function load(p) {
    var e = images[p];
    if (e) return e;
    e = images[p] = { img: null, ok: false, done: false };
    var at = ATLAS && ATLAS[p];
    if (at) {
      var sh = sheets[at[0]];
      if (!sh) {
        sh = sheets[at[0]] = { img: new Image(), done: false, ok: false, wait: [] };
        sh.img.onload = function () { sh.ok = sh.done = true; sh.wait.forEach(function (f) { f(); }); };
        sh.img.onerror = function () { sh.done = true; sh.wait.forEach(function (f) { f(); }); console.error('캐릭터 묶음 그림을 불러오지 못했어요: ' + at[0]); };
        sh.img.src = at[0];
      }
      var cut = function () {
        if (sh.ok) {
          var c = document.createElement('canvas'); c.width = at[3]; c.height = at[4];
          c.getContext('2d').drawImage(sh.img, at[1], at[2], at[3], at[4], 0, 0, at[3], at[4]);
          c.naturalWidth = at[3]; c.naturalHeight = at[4];
          e.img = c; e.ok = true;
        }
        e.done = true;
      };
      if (sh.done) cut(); else sh.wait.push(cut);
      return e;
    }
    e.img = new Image();
    e.img.onload = function () { e.ok = true; e.done = true; };
    e.img.onerror = function () { e.done = true; console.error('캐릭터 그림을 불러오지 못했어요: ' + p); };
    e.img.src = src(p);
    return e;
  }
  function pathsFor(a) {
    var out = [];
    M.directions.forEach(function (d) { for (var f = 0; f < 4; f++) layers(a, d, f).forEach(function (op) { out.push(op[0]); }); });
    return out;
  }
  function preload(a) {
    var ps = pathsFor(a);
    ps.forEach(load);
    return new Promise(function (resolve) {
      (function check() {
        var done = ps.every(function (p) { return images[p].done; });
        if (done) resolve({ missing: ps.filter(function (p) { return !images[p].ok; }) });
        else setTimeout(check, 50);
      })();
    });
  }
  function missingOf(a) { return pathsFor(a).filter(function (p) { return images[p] && images[p].done && !images[p].ok; }); }

  // ---------- 한 장으로 합치기 ----------
  var frames = {};   // key|dir|frame → canvas
  var cropBottom = FIT.cropBottom || {};
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  // 모자 그림에서 머리가 들어가는 입구(안감)와 그 아래 앞쪽 테두리를 지운 그림 (avatar-fit.js 의 hatOpening)
  var hatCache = {};
  function hatImage(name, d, img) {
    var k = name + '|' + d;
    if (hatCache[k]) return hatCache[k];
    var e = (FIT.hatOpening[name] || {})[d];
    if (!e) return (hatCache[k] = img);
    var w = img.naturalWidth, h = img.naturalHeight, c = canvas(w, h), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    var data = g.getImageData(0, 0, w, h), px = data.data, t = e[4] * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var dx = x - e[0], dy = y - e[1], u = (dx * cs + dy * sn) / e[2], v = (-dx * sn + dy * cs) / e[3];
      if (u * u + v * v <= 1 || (Math.abs(u) <= 1 && v >= 0)) px[(y * w + x) * 4 + 3] = 0;
    }
    g.putImageData(data, 0, 0);
    c.naturalWidth = w; c.naturalHeight = h;
    return (hatCache[k] = c);
  }
  function drawOp(g, op) {
    var img = images[op[0]].img, box = op[1], off = op[2];
    if (box) {
      var name = op[0].split('/').pop().replace(/_(down|left|right|up)\.png$/, '');
      var sh = cropBottom[name] && cropBottom[name] < img.naturalHeight ? cropBottom[name] : img.naturalHeight;
      g.drawImage(img, 0, 0, img.naturalWidth, sh, box[0], box[1] + HEADROOM, box[2], box[3] * sh / img.naturalHeight);
    } else if (op[4] && op[4].raw) {
      g.drawImage(img, 0, 0);          // 착용 그림: 이미 캐릭터 칸(위 여유 포함)에 맞춰져 있음
    } else if (op[4] && op[4].clipX) {
      var cx = op[4].clipX;
      g.save(); g.beginPath(); g.rect(cx[0], 0, cx[1] - cx[0], TILE_H); g.clip();
      g.drawImage(img, off ? off[0] : 0, (off ? off[1] : 0) + HEADROOM);
      g.restore();
    } else {
      g.drawImage(img, off ? off[0] : 0, (off ? off[1] : 0) + HEADROOM);
    }
  }
  // 모자 아래 가장자리 선보다 위쪽의 머리(얼굴·머리카락)를 지워 모자 밖으로 삐져나오지 않게.
  // 모자 바깥 옆으로는 머리 둥근 모양을 따라 비스듬히 올라가고(세로로 뚝 끊기지 않게), 선 근처 3px은 부드럽게 지움.
  // tools/avatar_sheet.py 의 hat_cut_line 과 같은 계산
  function cutHead(hg, tg) {
    var ad = tg.getImageData(0, 0, TILE_W, TILE_H).data, cut = new Float32Array(TILE_W), x0 = -1, x1 = -1, x, y;
    for (x = 0; x < TILE_W; x++) {
      cut[x] = -1;
      for (y = TILE_H - 1; y >= 0; y--) if (ad[(y * TILE_W + x) * 4 + 3] > 60) { cut[x] = y; if (x0 < 0) x0 = x; x1 = x; break; }
    }
    if (x0 < 0) return;
    for (x = 0; x < x0; x++) cut[x] = cut[x0] - 2.2 * (x0 - x);
    for (x = x1 + 1; x < TILE_W; x++) cut[x] = cut[x1] - 2.2 * (x - x1);
    var img = hg.getImageData(0, 0, TILE_W, TILE_H), px = img.data;
    for (x = 0; x < TILE_W; x++) {
      var lim = Math.min(TILE_H, Math.ceil(cut[x] + 2));
      for (y = 0; y < lim; y++) {
        var m = Math.max(0, Math.min(1, (cut[x] - y) / 3 + 0.5));
        if (m > 0) { var i = (y * TILE_W + x) * 4 + 3; px[i] = Math.round(px[i] * (1 - m)); }
      }
    }
    hg.putImageData(img, 0, 0);
  }
  function composite(a, d, f) {
    var k = key(a) + '|' + d + '|' + f;
    if (frames[k]) return frames[k];
    var ops = layers(a, d, f);
    // 아직 불러오는 중이거나 하나라도 못 불러왔으면 합치지 않음(임시 캐릭터로 대신 그림)
    for (var i = 0; i < ops.length; i++) { var e = load(ops[i][0]); if (!e.done || !e.ok) return null; }
    var c = canvas(TILE_W, TILE_H), g = c.getContext('2d');
    var head = canvas(TILE_W, TILE_H), hg = head.getContext('2d');
    var hat = null;
    g.imageSmoothingQuality = hg.imageSmoothingQuality = 'high';
    ops.forEach(function (op) {
      if (op[3] === 'body') drawOp(g, op);
      else if (op[3] === 'head') drawOp(hg, op);
      else if (op[3] === 'hat') {
        var info = op[4];
        hat = canvas(TILE_W, TILE_H);
        var tg = hat.getContext('2d'); tg.imageSmoothingQuality = 'high';
        if (info.worn) tg.drawImage(images[op[0]].img, 0, 0);
        else {
          var im = hatImage(info.name, info.d, images[op[0]].img);
          tg.drawImage(im, info.x, info.y + HEADROOM, im.naturalWidth * info.s, im.naturalHeight * info.s);
        }
        if (info.cut) cutHead(hg, tg);
      }
    });
    g.drawImage(head, 0, 0);
    ops.forEach(function (op) { if (op[3] === 'top') drawOp(g, op); });
    if (hat) g.drawImage(hat, 0, 0);
    frames[k] = c;
    return c;
  }

  // ---------- 게임에서 쓰는 캐릭터 ----------
  // draw(ctx, x, y, dir, moving, time): (x,y)=발 위치(지도 좌표). 그림이 준비되기 전에는 fallback 으로 그림.
  function Character(opts) {
    this.appearance = normalize(opts && opts.appearance);
    this.height = (opts && opts.height) || 66;          // 한 칸(320) 높이를 지도에서 몇 px로 그릴지
    this.fallback = opts && opts.fallback;
    this.isPlaceholder = false;
    preload(this.appearance);
  }
  Character.prototype.setAppearance = function (a) { this.appearance = normalize(a); return preload(this.appearance); };
  Character.prototype.frameAt = function (moving, t) { return moving ? Math.floor(t * (M.fps || 8)) % 4 : IDLE_FRAME; };
  Character.prototype.draw = function (ctx, x, y, dir, moving, t) {
    var d = M.directions.indexOf(dir) >= 0 ? dir : 'down';
    var c = composite(this.appearance, d, this.frameAt(moving, t));
    this.isPlaceholder = !c;
    if (!c) { if (this.fallback) this.fallback.draw(ctx, x, y, dir, moving, t); return; }
    var s = this.height / 320;   // 그림 한 칸(320) 기준 크기
    // 발밑 그림자
    ctx.save();
    ctx.fillStyle = 'rgba(30,40,60,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y - 1, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.drawImage(c, x - ANCHOR_X * s, y - ANCHOR_Y * s, TILE_W * s, TILE_H * s);
  };

  // 꾸미기 미리보기용: 캔버스에 바로 그리기
  function drawPreview(ctx, a, d, f, x, y, h) {
    var c = composite(normalize(a), d, f);
    if (!c) return false;
    var s = h / 320;
    ctx.drawImage(c, x - ANCHOR_X * s, y - ANCHOR_Y * s, TILE_W * s, TILE_H * s);
    return true;
  }

  window.MPAvatar = {
    OPTIONS: OPTIONS, DEFAULT: DEFAULT, normalize: normalize, layers: layers,
    preload: preload, missingOf: missingOf, Character: Character, drawPreview: drawPreview,
    directions: M.directions
  };
})();
