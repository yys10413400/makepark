/*
 * 레인보우 퍼레이드 — 퍼레이드 보기(그리기만 담당)
 * ------------------------------------------------------------
 * 현수막 꾸미기 화면(js/parade/ui.js)의 퍼레이드 팝업 안에 그립니다.
 *  1. 리리가 8프레임 오프닝으로 인사하고 무지개 꼬리를 펼침(assets/parade/riri-opening.webp, 640 칸, 발 (320,608))
 *  2. 시작 1120ms(오프닝 README 의 카트 신호)에 모모·루루가 현수막을 들고 왼쪽에서 걸어 들어옴.
 *     리리는 행렬이 가까이 오면 걷기 그림으로 바꿔 맨 앞에서 같이 걸음
 *  3. 현수막 가운데가 화면 가운데에 오면 잠깐 멈춰 작품을 보여 주고, 다시 걸어서 오른쪽으로 퇴장
 * 걷기 시트(448 칸, 4×2): 장대 중심 x 모모 329, 루루 125. 모모·루루는 같은 프레임 번호·같은 속도.
 * 현수막은 아이가 꾸민 그림(비율 그대로)을 두 장대 사이에 붙이고, 그림 아래 술 장식(아랫단)만 살짝 흔듦.
 * 좌표는 배경 그림(1672×941) 기준.
 */
(function () {
  'use strict';
  var IW = 1672, IH = 941;
  var OPEN_MS = [220, 110, 290, 135, 110, 130, 125, 760], CART_CUE = 1120;
  var WALK = { size: 448, frameMs: 95, speed: 0.33 };          // 걷기 칸·한 프레임 시간·화면 px/ms
  var K = 0.95;                                                // 걷기 그림 배율(몸 키 약 390px)
  var KO = K * 408 / 580;                                      // 오프닝 배율: 오프닝 몸 키(580)를 걷기 몸 키(408)에 맞춤
  var GROUND = 884;                                            // 발이 닿는 바닥 y
  // 시트 안 기준(그림 픽셀): 장대 중심 x, 발 밑 y, 몸 왼쪽·오른쪽 끝
  var MOMO = { pole: 329, foot: 408, left: 122, right: 353 };
  var LULU = { pole: 125, foot: 422, left: 104, right: 346 };
  var RIRI = { foot: 424, left: 107, right: 345, mid: 226 };
  var BANNER_TOP = 330;          // 바닥에서 현수막 윗단까지(걷기 그림 픽셀) — 두 장대 공(꼭대기)보다 아래
  var BANNER_H = 250;            // 현수막 천 높이(걷기 그림 픽셀) — 두 장대 끝보다 위에서 끝남
  var HEM = 20;                  // 아랫단 술 장식 높이(화면 px)
  var PAUSE_MS = 2800, RIRI_GAP = 60, GREET_X = 1180;

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
  function loadAll(base) {
    return Promise.all(['lobby', 'riri-opening', 'riri', 'momo', 'lulu'].map(function (n) { return load(base, n); }))
      .then(function (a) { return { bg: a[0], open: a[1], riri: a[2], momo: a[3], lulu: a[4] }; });
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
    var ready = loadAll(opt.base || 'assets/parade/').then(function (a) { imgs = a; return a; });

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
      var stopX = IW / 2 - bw / 2;                                      // 현수막 가운데 = 화면 가운데
      var walkIn = (stopX - startX) / WALK.speed;
      var exitX = IW + (MOMO.pole - MOMO.left) * K + 20;               // 모모 몸 왼쪽 끝까지 화면 밖
      var walkOut = (exitX - stopX) / WALK.speed;
      var w = Math.max(0, ms - CART_CUE), travel, phase;
      if (w < walkIn) { travel = w; phase = 'in'; }
      else if (w < walkIn + PAUSE_MS) { travel = walkIn; phase = 'pause'; }
      else { travel = walkIn + Math.min(walkOut, w - walkIn - PAUSE_MS); phase = w - walkIn - PAUSE_MS >= walkOut ? 'done' : 'out'; }
      return { pole: startX + travel * WALK.speed, travel: travel, phase: phase, walking: phase === 'in' || phase === 'out' };
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
        ctx.drawImage(imgs.open, f % 4 * s, Math.floor(f / 4) * s, s, s, GREET_X - 320 * KO, GROUND - 608 * KO, s * KO, s * KO);
      } else {
        shadow(lead, 110 * K);
        sheet(imgs.riri, frame, lead - RIRI.mid * K, GROUND - RIRI.foot * K);
      }
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
    function loop(now) {
      var phase = render(now - t0);
      if (phase === 'done') { if (!ended) { ended = true; if (opt.onEnd) opt.onEnd(); } return; }
      raf = requestAnimationFrame(loop);
    }
    function play() {
      cancelAnimationFrame(raf); ended = false;
      return ready.then(function () {
        t0 = performance.now();
        raf = requestAnimationFrame(loop);
      });
    }
    function stop() { cancelAnimationFrame(raf); }
    return {
      play: play, stop: stop, ready: ready, setBanner: setBanner,
      // 검증용: 특정 시각의 장면을 그려 보고 위치를 돌려줌
      _at: function (ms) {
        stop(); render(ms);
        var tl = timeline(ms);
        return { phase: tl.phase, momoPole: tl.pole, luluPole: tl.pole + bw, bannerW: bw, bannerH: bh,
          frame: tl.walking ? Math.floor(tl.travel / WALK.frameMs) % 8 : 0 };
      }
    };
  }

  window.MPParadeShow = { create: create, IW: IW, IH: IH };
})();
