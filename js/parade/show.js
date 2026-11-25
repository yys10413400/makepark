/*
 * 무지개 행진길 — 퍼레이드 보기(그리기만 담당)
 * ------------------------------------------------------------
 * 현수막 꾸미기 화면(js/parade/ui.js)의 퍼레이드 팝업 안에 그립니다.
 *  1. 리리가 8프레임 오프닝으로 인사하고 무지개 꼬리를 펼침(assets/parade/riri-opening.webp, 640 칸, 발 (370,608) — 활짝 편 꼬리깃이 칸 안에 다 들어가게 발을 오른쪽에 둠)
 *  2. 시작 1120ms(오프닝 README 의 카트 신호)에 모모·루루가 현수막을 들고 왼쪽에서 걸어 들어옴.
 *     리리는 행렬이 가까이 오면 걷기 그림으로 바꿔 맨 앞에서 같이 걸음
 *  3. 현수막 가운데가 화면 가운데에 오면 잠깐 멈춰 작품을 보여 주고, 다시 걸어서 오른쪽으로 퇴장
 * 걷기 시트(한복, 448 칸, 4×2): 장대 중심 x 모모 329, 루루 125. 모모·루루는 같은 프레임 번호·같은 속도.
 * 현수막은 아이가 꾸민 그림(비율 그대로)을 두 장대 사이에 붙이고, 그림 아래 술 장식(아랫단)만 살짝 흔듦.
 * 오색 꽃가루(assets/parade/confetti/*.png — 꽃잎·한지 색종이·별 × 다홍·청록·황금·아이보리·보라 15장):
 *  행진 시작에 양옆에서 팡 → 행진 중 위에서 조금씩(2~3초마다) → 퇴장할 때 피날레(왼쪽 → 오른쪽 → 양쪽 함께)
 *  뒤쪽 꽃가루(작고 옅게)는 캐릭터 뒤에, 앞쪽 꽃가루(조금 크고 선명하게)는 캐릭터 앞에 같은 캔버스로 그림
 * 좌표는 배경 그림(1672×941) 기준.
 */
(function () {
  'use strict';
  var IW = 1672, IH = 941;
  var OPEN_MS = [220, 110, 290, 135, 110, 130, 125, 760], CART_CUE = 1120;
  var RIRI_FOOT_X = 370;                                       // 인사 그림 칸 안 발 가운데 x (tools/build_hanok_npcs.py 의 RIRI_FOOT)
  var WALK = { size: 448, frameMs: 95, speed: 0.33 };          // 걷기 칸·한 프레임 시간·화면 px/ms
  var K = 1.08;                                                // 걷기 그림 배율(몸 키 약 440px)
  var KO = K * 408 / 580;                                      // 오프닝 배율: 오프닝 몸 키(580)를 걷기 몸 키(408)에 맞춤
  var GROUND = 884;                                            // 발이 닿는 바닥 y
  // 시트 안 기준(그림 픽셀): 장대 중심 x, 발 밑 y, 몸 왼쪽·오른쪽 끝
  var MOMO = { pole: 329, foot: 408, left: 122, right: 353 };
  var LULU = { pole: 125, foot: 422, left: 104, right: 346 };
  var RIRI = { foot: 424, left: 107, right: 345, mid: 226 };
  var BANNER_TOP = 348;          // 바닥에서 현수막 윗단까지(걷기 그림 픽셀) — 두 장대 공(꼭대기)보다 아래
  var BANNER_H = 290;            // 현수막 천 높이(걷기 그림 픽셀) — 두 장대 끝보다 위에서 끝남
  var HEM = 20;                  // 아랫단 술 장식 높이(화면 px)
  var PAUSE_MS = 2800, RIRI_GAP = 24, GREET_X = 1250, STOP_SHIFT = 45;   // 멈출 때 현수막 가운데를 조금 왼쪽에 두어 맨 앞 리리까지 화면 안에

  var cache = {};
  function load(base, name) {
    var key = base + name;
    if (!cache[key]) cache[key] = new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = rej;
      im.src = base + name + '.webp';
    });
    return cache[key];
  }
  function loadImg(src) {
    if (!cache[src]) cache[src] = new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src;
    });
    return cache[src];
  }
  var CF_KINDS = ['petal', 'paper', 'star'];
  function loadAll(base) {
    var confetti = [];
    CF_KINDS.forEach(function (k) { for (var c = 0; c < 5; c++) confetti.push(loadImg(base + 'confetti/' + k + '-' + c + '.png')); });
    return Promise.all(['parade-bg', 'riri-opening', 'riri', 'momo', 'lulu'].map(function (n) { return load(base, n); }).concat(confetti))
      .then(function (a) {
        var cf = { petal: a.slice(5, 10), paper: a.slice(10, 15), star: a.slice(15, 20) };
        return { bg: a[0], open: a[1], riri: a[2], momo: a[3], lulu: a[4], confetti: cf };
      });
  }

  // ---------- 오색 꽃가루(파티클) ----------
  // 크기는 1920×1080 화면 기준 8~24px → 이 캔버스(1672 폭)에 비례. 캔버스가 화면 크기대로 늘고 줄어 함께 비례함
  var CF_SCALE = IW / 1920, CF_MAX = 200;
  // 종류마다 낙하: 중력 g(px/s²) · 공기 저항 k(1/s) → 끝 속도 약 g/k
  var CF_KIND = {
    petal: { g: 240, k: 3.2 },    // 약 75px/s, 좌우로 살랑
    paper: { g: 260, k: 2.7 },    // 약 95px/s, 빙글빙글 뒤집힘
    star: { g: 170, k: 3.6 }      // 약 47px/s, 천천히 반짝
  };
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function makeConfetti(ctx, set) {
    var parts = [], t = 0;
    function add(o) {
      if (parts.length >= CF_MAX) return;
      var kind = o.kind || pick(CF_KINDS), front = o.front != null ? o.front : Math.random() < 0.45;
      var im = pick(set[kind]), base = rnd(8, 24) * CF_SCALE;
      var size = base * (front ? rnd(1.15, 1.45) : rnd(0.55, 0.8));
      parts.push({
        kind: kind, im: im, front: front, size: size, ar: im.height / im.width,
        x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0,
        r: rnd(0, Math.PI * 2),
        vr: (Math.random() < 0.5 ? -1 : 1) * (kind === 'paper' ? rnd(2.2, 5.5) : rnd(0.3, 1.2)),
        ph: rnd(0, Math.PI * 2), sf: kind === 'paper' ? rnd(4, 9) : kind === 'star' ? rnd(3, 6) : rnd(1.6, 2.8),
        sway: kind === 'petal' ? rnd(25, 55) : kind === 'paper' ? rnd(8, 22) : rnd(5, 12),
        drag0: o.burst ? rnd(0.45, 0.85) : null,   // 터질 때는 공기 저항이 약하다가 점점 종류의 값으로
        age: 0, life: o.life || rnd(6, 9), alpha: front ? rnd(0.9, 1) : rnd(0.5, 0.7)
      });
    }
    // 양옆 아래에서 위로 팡: side -1 왼쪽, 1 오른쪽
    function burst(side, n, life) {
      for (var i = 0; i < n; i++) add({
        burst: true, life: life ? rnd(life[0], life[1]) : rnd(4, 6),
        x: side < 0 ? rnd(-20, 40) : IW - rnd(-20, 40), y: IH * rnd(0.8, 0.98),
        vx: -side * rnd(220, 980), vy: -rnd(900, 1500)
      });
    }
    // 위에서 조금씩 흩날림(꽃잎·색종이 위주)
    function drift(n) {
      for (var i = 0; i < n; i++) add({
        kind: Math.random() < 0.85 ? (Math.random() < 0.55 ? 'petal' : 'paper') : 'star',
        x: rnd(-40, IW + 40), y: rnd(-60, -20), vx: rnd(-20, 20), vy: rnd(20, 60), life: rnd(9, 13)
      });
    }
    function wind(time) { return 26 * Math.sin(time / 2.3) + 11 * Math.sin(time / 0.83 + 1.3); }
    function update(dt) {
      t += dt;
      var w = wind(t);
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i], kd = CF_KIND[p.kind];
        p.age += dt;
        var k = p.drag0 != null ? p.drag0 + (kd.k - p.drag0) * Math.min(1, p.age / 1.1) : kd.k;
        p.vy += kd.g * dt;
        p.vx += (w - p.vx) * Math.min(1, k * 0.35 * dt);          // 바람 쪽으로 천천히 끌림
        p.vx -= p.vx * k * 0.25 * dt; p.vy -= p.vy * k * dt;       // 공기 저항(세로가 더 커서 넓게 퍼지며 떨어짐)
        p.ph += p.sf * dt;
        p.x += (p.vx + (p.kind === 'petal' ? p.sway * Math.cos(p.ph) : p.sway * 0.5 * Math.cos(p.ph * 0.5))) * dt;
        p.y += p.vy * dt;
        p.r += p.vr * dt;
        if (p.age > p.life || p.y > IH + 40 || p.x < -120 || p.x > IW + 120) parts.splice(i, 1);
      }
    }
    function draw(front) {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.front !== front) continue;
        var fade = Math.min(1, p.age / 0.25) * Math.min(1, (p.life - p.age) / 0.9);   // 나타날 때·사라질 때 부드럽게
        var sx = 1, sy = 1, a = p.alpha * fade, r = p.r;
        if (p.kind === 'petal') { r += 0.5 * Math.sin(p.ph); sx = 0.72 + 0.28 * Math.cos(p.ph * 1.3); }
        else if (p.kind === 'paper') { sx = Math.cos(p.ph); if (Math.abs(sx) < 0.08) sx = sx < 0 ? -0.08 : 0.08; }
        else { var tw = Math.sin(p.ph); sx = sy = 0.9 + 0.12 * tw; a *= 0.78 + 0.22 * tw; }
        if (a <= 0.01) continue;
        var c = Math.cos(r), s = Math.sin(r), w = p.size, h = p.size * p.ar;
        ctx.globalAlpha = a;
        ctx.setTransform(c * sx, s * sx, -s * sy, c * sy, p.x, p.y);
        ctx.drawImage(p.im, -w / 2, -h / 2, w, h);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    }
    return { burst: burst, drift: drift, update: update, draw: draw, count: function () { return parts.length; },
      clear: function () { parts.length = 0; t = 0; } };
  }
  function openingFrame(ms) {
    for (var i = 0, end = 0; i < OPEN_MS.length; i++) { end += OPEN_MS[i]; if (ms < end) return i; }
    return OPEN_MS.length - 1;
  }

  // 아랫단 술 장식(무지개 색 반원 + 작은 술) 한 장 — 흔들 때는 세로 줄로 나눠 높이만 바꿔 그림
  function makeHem(w) {
    var c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(w)); c.height = HEM;
    var g = c.getContext('2d');
    var cols = ['#e8545a', '#f39a3a', '#f4c94a', '#7fbf5a', '#57b4e0', '#5a7fd8', '#a07ad4', '#ef8fa8'];
    var n = Math.max(6, Math.round(w / 34)), step = w / n;
    g.fillStyle = '#c9707e'; g.fillRect(0, 0, w, 4);
    for (var i = 0; i < n; i++) {
      var cx = step * (i + 0.5);
      g.fillStyle = cols[i % cols.length];
      g.beginPath(); g.arc(cx, 3, step * 0.46, 0, Math.PI); g.fill();
      g.strokeStyle = 'rgba(120,60,50,0.35)'; g.lineWidth = 1.2; g.stroke();
      g.fillStyle = '#e2b357'; g.fillRect(cx - 1.5, step * 0.46, 3, HEM - step * 0.46 - 3);
      g.beginPath(); g.arc(cx, HEM - 3, 3, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  /*
   * create({ canvas, base, banner, onEnd })
   *  canvas : 그릴 <canvas> (내부 크기 1672×941 로 맞춤)
   *  base   : 그림 폴더('assets/parade/')
   *  banner : 아이가 꾸민 현수막(canvas 또는 img). 비율 그대로 들어감
   *  onEnd  : 퍼레이드가 끝나면 부름
   * 돌려줌: { play(), stop(), ready(Promise), setBanner(b) }
   */
  function create(opt) {
    var cv = opt.canvas, ctx = cv.getContext('2d');
    cv.width = IW; cv.height = IH;
    var banner = opt.banner, hem = null, art = null, raf = 0, t0 = 0, ended = false, imgs = null;
    var cf = null, cues = null, lastMs = 0;
    var ready = loadAll(opt.base || 'assets/parade/').then(function (a) { imgs = a; cf = makeConfetti(ctx, a.confetti); return a; });

    // 현수막 크기: 높이는 정해 두고, 폭은 꾸민 그림 비율 그대로(장대 간격 = 현수막 폭)
    var bh = BANNER_H * K, bw = bh * 2;
    function setBanner(b) {
      banner = b;
      var r = b && b.width && b.height ? b.width / b.height : 2;
      bw = bh * r;
      hem = makeHem(bw);
      // 그림은 화면 크기로 한 번 줄여 둠(매 프레임 큰 그림을 줄이지 않게)
      art = document.createElement('canvas');
      art.width = Math.round(bw * 2); art.height = Math.round(bh * 2);
      var g = art.getContext('2d');
      g.imageSmoothingQuality = 'high';
      if (b) g.drawImage(b, 0, 0, art.width, art.height);
    }
    setBanner(banner);

    // 시간 → 행렬 위치. travel 은 걸은 거리(멈춘 동안은 늘지 않음)
    function timeline(ms) {
      var startX = -(bw + (LULU.right - LULU.pole) * K) - 20;          // 루루 몸 오른쪽 끝까지 화면 밖
      var stopX = IW / 2 - STOP_SHIFT - bw / 2;                         // 현수막 가운데 ≈ 화면 가운데
      var walkIn = (stopX - startX) / WALK.speed;
      var exitX = IW + (MOMO.pole - MOMO.left) * K + 20;               // 모모 몸 왼쪽 끝까지 화면 밖
      var walkOut = (exitX - stopX) / WALK.speed;
      var w = Math.max(0, ms - CART_CUE), travel, phase;
      if (w < walkIn) { travel = w; phase = 'in'; }
      else if (w < walkIn + PAUSE_MS) { travel = walkIn; phase = 'pause'; }
      else { travel = walkIn + Math.min(walkOut, w - walkIn - PAUSE_MS); phase = w - walkIn - PAUSE_MS >= walkOut ? 'done' : 'out'; }
      return { pole: startX + travel * WALK.speed, travel: travel, phase: phase, walking: phase === 'in' || phase === 'out',
        outAt: CART_CUE + walkIn + PAUSE_MS };
    }

    function sheet(im, frame, x, y) {
      var s = WALK.size;
      ctx.drawImage(im, frame % 4 * s, Math.floor(frame / 4) * s, s, s, x, y, s * K, s * K);
    }
    function drawBanner(x, y, ms) {
      // 천: 꾸민 그림 그대로(일그러뜨리지 않음) + 윗단 띠
      ctx.save();
      ctx.shadowColor = 'rgba(90,40,40,0.25)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
      ctx.drawImage(art, x, y, bw, bh);
      ctx.restore();
      ctx.fillStyle = '#c9707e'; ctx.fillRect(x, y - 7, bw, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y - 6, bw, 2);
      // 아랫단: 양끝·윗줄은 그대로, 가운데로 갈수록 아래로 최대 3px 흔들림(preview.html 과 같은 식)
      for (var col = 0; col < bw; col += 2) {
        var sway = 3 * Math.sin(Math.PI * col / bw) * Math.sin(ms / 185 + col / 45);
        ctx.drawImage(hem, col, 0, 2, HEM, x + col, y + bh, 2, HEM + sway);
      }
    }
    function render(ms) {
      if (!imgs) return;
      ctx.clearRect(0, 0, IW, IH);
      ctx.drawImage(imgs.bg, 0, 0, IW, IH);
      if (cf) cf.draw(false);                            // 뒤쪽 꽃가루(작고 옅게)
      var tl = timeline(ms);
      var frame = tl.walking ? Math.floor(tl.travel / WALK.frameMs) % 8 : 0;
      var momoX = tl.pole - MOMO.pole * K, momoY = GROUND - MOMO.foot * K;
      var luluPole = tl.pole + bw, luluX = luluPole - LULU.pole * K, luluY = GROUND - LULU.foot * K;
      var bannerY = GROUND - BANNER_TOP * K;
      // 그림자
      [[tl.pole - 80 * K, 120], [luluPole + 100 * K, 120]].forEach(function (s) { shadow(s[0], s[1] * K); });
      drawBanner(tl.pole, bannerY, ms);                 // 장대·손이 현수막 가장자리를 덮도록 천을 먼저
      sheet(imgs.momo, frame, momoX, momoY);
      sheet(imgs.lulu, frame, luluX, luluY);
      // 리리: 인사 → 꼬리 펼치고 기다림 → 행렬이 다가오면 맨 앞에서 같이 걸음
      var lead = luluX + LULU.right * K + RIRI_GAP + (RIRI.mid - RIRI.left) * K;
      if (lead <= GREET_X) {
        shadow(GREET_X, 140 * K);
        var f = openingFrame(ms), s = 640;
        ctx.drawImage(imgs.open, f % 4 * s, Math.floor(f / 4) * s, s, s, GREET_X - RIRI_FOOT_X * KO, GROUND - 608 * KO, s * KO, s * KO);
      } else {
        shadow(lead, 110 * K);
        sheet(imgs.riri, frame, lead - RIRI.mid * K, GROUND - RIRI.foot * K);
      }
      if (cf) cf.draw(true);                             // 앞쪽 꽃가루(조금 크고 선명하게)
      return tl.phase;
    }
    function shadow(x, w) {
      ctx.save();
      ctx.translate(x, GROUND - 4); ctx.scale(1, 0.22);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
      g.addColorStop(0, 'rgba(140,60,70,0.32)'); g.addColorStop(1, 'rgba(140,60,70,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // 꽃가루 일정(행진 시간에 맞춤): 행진 시작 팡(양옆 합쳐 40~60) → 2~3초마다 조금씩 → 퇴장할 때 피날레(130)
    function makeCues() {
      var tl = timeline(0), list = [];
      list.push({ at: CART_CUE, fn: function () { var n = 40 + Math.floor(Math.random() * 21); cf.burst(-1, Math.ceil(n / 2)); cf.burst(1, Math.floor(n / 2)); } });
      for (var at = CART_CUE + 2400; at < tl.outAt + 400; at += rnd(2000, 3000)) list.push({ at: at, fn: function () { cf.drift(3 + Math.floor(Math.random() * 4)); } });
      list.push({ at: tl.outAt + 500, fn: function () { cf.burst(-1, 30, [4, 5.5]); } });
      list.push({ at: tl.outAt + 1300, fn: function () { cf.burst(1, 30, [4, 5.5]); } });
      list.push({ at: tl.outAt + 2300, fn: function () { cf.burst(-1, 35, [4.5, 6]); cf.burst(1, 35, [4.5, 6]); } });
      return list.sort(function (a, b) { return a.at - b.at; });
    }
    function runCues(ms) {
      while (cues && cues.length && cues[0].at <= ms) cues.shift().fn();
    }
    function loop(now) {
      var ms = now - t0, dt = Math.min(0.05, Math.max(0, (ms - lastMs) / 1000));
      lastMs = ms;
      runCues(ms); cf.update(dt);
      var phase = render(ms);
      if (phase === 'done' && !ended) { ended = true; if (opt.onEnd) opt.onEnd(); }
      // 행진이 끝나도 마지막 꽃가루가 다 흩날려 사라질 때까지 그림
      if (phase === 'done' && !cf.count() && !(cues && cues.length)) return;
      raf = requestAnimationFrame(loop);
    }
    function play() {
      cancelAnimationFrame(raf); ended = false;
      return ready.then(function () {
        cancelAnimationFrame(raf);
        cf.clear(); cues = makeCues(); lastMs = 0;     // 다시 보기: 남은 꽃가루·일정을 비우고 처음부터(겹치지 않게)
        t0 = performance.now();
        raf = requestAnimationFrame(loop);
      });
    }
    function stop() { cancelAnimationFrame(raf); if (cf) cf.clear(); cues = null; }
    return {
      play: play, stop: stop, ready: ready, setBanner: setBanner,
      // 검증용: 특정 시각의 장면을 그려 보고 위치를 돌려줌
      _confetti: function () { return cf ? cf.count() : 0; },
      _at: function (ms) {
        cancelAnimationFrame(raf); render(ms);
        var tl = timeline(ms);
        return { phase: tl.phase, momoPole: tl.pole, luluPole: tl.pole + bw, bannerW: bw, bannerH: bh,
          frame: tl.walking ? Math.floor(tl.travel / WALK.frameMs) % 8 : 0 };
      }
    };
  }

  window.MPParadeShow = { create: create, IW: IW, IH: IH };
})();
