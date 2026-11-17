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
  var TILE_W = 256, TILE_H = 320, ANCHOR_X = 128, ANCHOR_Y = 304;
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
  // ops: [경로, 상자[x,y,w,h] 또는 null, 옮김[dx,dy] 또는 null]
  function layers(a, d, f) {
    var ops = [], fitted = M.fitted, o = a.outfit;
    var bag = a.bag !== 'none' ? FIT.bag[a.bag] : null, fbag = !!(bag && bag.fitted);
    var hatHair = a.hair === '1' && a.hat === 'bucket';   // 머리1+버킷햇: 맞춤 그림 한 장(머리·모자 중복 없음)
    function add(p, box, off) { if (p) ops.push([p, box || null, off || null]); }
    // 1) 등 뒤 가방 (앞·옆에서는 몸 뒤)
    if (d !== 'up' && bag) {
      if (fbag) add(fitted.bag_yellow[d]);
      else if (bag[d]) add(M.accessories[a.bag][d], bag[d]);
    }
    // 2) 몸(옷·팔다리 걷기 칸) → 신발
    add(M.bodies[o][d][f]);
    add(M.shoes[a.shoes][o][d][f]);
    // 3) 어깨끈: 몸 위, 머리 아래
    if (d !== 'up' && bag) add(fbag ? fitted.bag_straps[d] : 'assets/fitted/' + bag.straps + '_' + d + '.png');
    // 4) 뒷모습 가방: 머리보다 먼저 그려 긴 머리가 가방 위로 내려오게
    if (d === 'up' && bag) {
      if (fbag) add(fitted.bag_yellow.up);
      else add(M.accessories[a.bag][bag.upImage || 'up'], bag.up);
    }
    // 5) 얼굴 → (옆모습 안경) → 머리 → (앞모습 안경)
    add(M.faces[a.face][d]);
    var gOff = null;
    if (a.glasses !== 'none' && d !== 'up') {
      var g1 = FIT.glasses[d] || [0, 0], g2 = (FIT.glassesByFace[a.face] || {})[d] || [0, 0];
      gOff = [g1[0] + g2[0], g1[1] + g2[1]];
    }
    if (gOff && d !== 'down') add(fitted[a.glasses][d], null, gOff);   // 안경다리가 귀 쪽 머리카락 밑으로
    add(hatHair ? fitted.bucket_hair1[d] : M.hair[a.hair][d]);
    if (gOff && d === 'down') add(fitted[a.glasses][d], null, gOff);
    // 6) 머리핀 → 모자
    if (a.clip !== 'none' && FIT.clip[d]) add(M.accessories[a.clip][d], scaled(FIT.clip[d], ((FIT.clipByHair[a.hair] || {})[d])));
    if (a.hat !== 'none' && !hatHair) {
      var hb = FIT.hatByHair[a.hair] || {}, adj = (hb[a.hat] || hb['*'] || {})[d];
      add(M.accessories[a.hat][d], scaled(FIT.hat[a.hat][d], adj));
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
  function load(p) {
    var e = images[p];
    if (e) return e;
    e = images[p] = { img: new Image(), ok: false, done: false };
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
  function composite(a, d, f) {
    var k = key(a) + '|' + d + '|' + f;
    if (frames[k]) return frames[k];
    var ops = layers(a, d, f);
    for (var i = 0; i < ops.length; i++) { var e = load(ops[i][0]); if (!e.done) return null; }
    var c = document.createElement('canvas'); c.width = TILE_W; c.height = TILE_H;
    var g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    ops.forEach(function (op) {
      var e = images[op[0]]; if (!e.ok) return;
      var img = e.img, box = op[1], off = op[2];
      if (box) {
        var name = op[0].split('/').pop().replace(/_(down|left|right|up)\.png$/, '');
        var sh = cropBottom[name] && cropBottom[name] < img.naturalHeight ? cropBottom[name] : img.naturalHeight;
        g.drawImage(img, 0, 0, img.naturalWidth, sh, box[0], box[1], box[2], box[3] * sh / img.naturalHeight);
      } else {
        g.drawImage(img, off ? off[0] : 0, off ? off[1] : 0);
      }
    });
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
    var s = this.height / TILE_H;
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
    var s = h / TILE_H;
    ctx.drawImage(c, x - ANCHOR_X * s, y - ANCHOR_Y * s, TILE_W * s, TILE_H * s);
    return true;
  }

  window.MPAvatar = {
    OPTIONS: OPTIONS, DEFAULT: DEFAULT, normalize: normalize, layers: layers,
    preload: preload, missingOf: missingOf, Character: Character, drawPreview: drawPreview,
    directions: M.directions
  };
})();
