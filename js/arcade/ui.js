/*
 * 별줍는 오락실 — 로비 · 별빛 팡팡 · 캡슐 뽑기
 * ------------------------------------------------------------
 * 장면 1 로비(assets/arcade/lobby.webp, 1671×941): 공원 캐릭터로 걸어 다니다
 *        왼쪽 '별빛 팡팡' 오락기 → 별빛 팡팡 창,  오른쪽 캡슐 기계 → 캡슐 뽑기 창
 *        (걷기·말 걸기·나가기는 코스터역 대기실(js/coaster/ui.js)과 같은 방식, 오락기를 눌러도 열림)
 * 별빛 팡팡 창(로비 위에 뜨는 창, 배경 assets/arcade/starpang-bg.webp 1672×941)
 *   안내(픽셀 + 한 줄 안내 + [카메라로 시작][방향키로 시작])
 *   → 카메라: 연결 → '오른손을 보여 주세요' → 연습 별 / 방향키: 바로 연습 별
 *   → 연습 별을 받으면 '좋았어!' → 3·2·1 → 본게임 30초 → 결과(점수·최고 기록·쿠폰 1장 · [다시 하기][캡슐 뽑기])
 *   창을 닫으면(✕·Esc) 로비로 돌아오고 카메라를 끕니다. 연습·중도 종료에는 쿠폰을 주지 않습니다.
 * 오른손 인식은 js/arcade/hand.js(MPHand). 영상은 기기 안에서만 쓰고, 카메라 모드에서는 작은 거울 화면(켜고 끌 수 있음)에 인식한 손을 표시합니다.
 * 에셋: assets/arcade/pixel-idle.webp · pixel-walk.webp(8칸 띠, 300×420, 발 y=400·머리 x=150)
 *       star.webp(8칸 띠, 240×330, 별 몸통 (120,250)) — tools/build_arcade.py 가 원본 시트에서 잘라 맞춤
 * 저장(window.MP_API): save.arcade = { coupons, welcome, best, rounds, capsules, cleared }
 *       save.decorBox = { items: [{ id, at }] }  ← 내 맵 꾸미기 보관함(캡슐 보상이 들어감)
 */
(function () {
  'use strict';
  var BASE = 'assets/arcade/';
  var IW = 1672, IH = 941;
  var TIP = '방향키나 바닥을 눌러 걸어가서, 오락기를 눌러 봐요';
  var GAME_SEC = 30, CAPSULE_COST = 2;
  // 난이도: speed 떨어지는 속도 배율 · gap 별 간격(초, 최소~최대) · ramp 30초 동안 빨라지는 정도 · big 큰 별 비율 · reach 바구니 판정 여유(px)
  // 처음엔 공원 학년에 맞춰 미리 골라 둠(1~2학년 쉬움 · 3~4학년 보통 · 5~6학년 어려움), 아이가 바꾸면 그 단계를 기억
  var LEVELS = {
    easy: { name: '쉬움', speed: 0.72, gap: [0.95, 1.35], ramp: 0.15, big: 0.22, reach: 24 },
    normal: { name: '보통', speed: 1, gap: [0.62, 0.97], ramp: 0.3, big: 0.17, reach: 10 },
    hard: { name: '어려움', speed: 1.28, gap: [0.46, 0.72], ramp: 0.4, big: 0.13, reach: 4 }
  };
  var LEVEL_IDS = ['easy', 'normal', 'hard'];
  var DEBUG = /[?&]debug=1/.test(location.search);

  // 캡슐에서 나오는 오락기 4종(내 맵 꾸미기 보관함으로 들어감)
  var MACHINES = [
    { id: 'arcade-star', name: '별빛 팡팡 오락기', icon: '🌟', c: '#2f8f7f' },
    { id: 'arcade-claw', name: '인형 뽑기 기계', icon: '🧸', c: '#d9597a' },
    { id: 'arcade-race', name: '꼬마 레이싱 오락기', icon: '🏎️', c: '#3d6fd0' },
    { id: 'arcade-beat', name: '리듬 팡팡 오락기', icon: '🎵', c: '#8a5cc9' }
  ];
  function machine(id) { return MACHINES.filter(function (m) { return m.id === id; })[0]; }

  var S = {
    open: false, me: { x: 836, y: 860, dir: 'up', moving: false }, keys: {}, dest: null, pending: null,
    near: null, nearExit: false, win: null, last: 0, raf: 0
  };
  var ui = {};

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function pct(v, of) { return (v / of * 100) + '%'; }
  function api() { return window.MP_API; }
  function save() { return (api() && api().readSave()) || {}; }
  function img(name) { var i = new Image(); i.src = BASE + name; return i; }

  // ---------- 저장(쿠폰·기록·보관함) ----------
  // 저장이 안 되는 기기에서는 이번 방문 동안 mem 에만 기억
  var mem = null;
  function arcadeData() {
    var a = save().arcade;
    if ((!a || typeof a !== 'object') && mem) a = mem;
    a = a && typeof a === 'object' ? JSON.parse(JSON.stringify(a)) : {};
    a.coupons = Math.max(0, a.coupons | 0); a.best = Math.max(0, a.best | 0);
    a.rounds = a.rounds | 0; a.capsules = a.capsules | 0;
    a.bestBy = a.bestBy && typeof a.bestBy === 'object' ? a.bestBy : {};
    a.playedBy = a.playedBy && typeof a.playedBy === 'object' ? a.playedBy : {};
    // 난이도가 생기기 전 기록은 '보통' 기록으로
    if (a.best && a.bestBy.normal == null && !Object.keys(a.bestBy).length) { a.bestBy.normal = a.best; a.playedBy.normal = true; }
    return a;
  }
  function decorData() {
    var d = save().decorBox;
    if ((!d || typeof d !== 'object') && mem && mem._decor) d = mem._decor;
    d = d && typeof d === 'object' ? JSON.parse(JSON.stringify(d)) : {};
    d.items = Array.isArray(d.items) ? d.items : [];
    return d;
  }
  function writeArcade(a, decor) {
    var patch = { arcade: a };
    if (decor) patch.decorBox = decor;
    if (api()) api().patchSave(patch);
    mem = JSON.parse(JSON.stringify(a)); mem._decor = decor || (mem && mem._decor) || decorData();
    return api() ? api().storageOk() : false;
  }

  // ================================================================
  // 로비
  // ================================================================
  // 걸을 수 있는 분홍 바닥(그림 좌표 다각형). 오락기·캡슐 기계 앞까지
  var FLOOR = [[0, 660], [225, 640], [505, 640], [525, 604], [1195, 604], [1210, 636], [1465, 636], [1545, 646], [1671, 664], [1671, 934], [0, 934]];
  var SPOTS = {
    game: { x: 364, y: 668, box: [222, 230, 506, 640], stand: { x: 364, y: 712 }, label: '별빛 팡팡 하기', top: 220 },
    capsule: { x: 1335, y: 664, box: [1205, 220, 1465, 634], stand: { x: 1335, y: 708 }, label: '캡슐 뽑기', top: 212 }
  };
  var EXIT_Y = 900, LOBBY_SCALE = 1.2, FLOOR_TOP = 604;
  function inPoly(x, y, p) {
    var c = false;
    for (var i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    }
    return c;
  }
  function walkable(x, y) { return inPoly(x, y, FLOOR); }
  function charH(y) {
    var r = ui.canvas.getBoundingClientRect(), px = api().charScreenH ? api().charScreenH() : 94;
    var base = r.height ? px * IH / r.height : 125;
    var depth = 0.86 + Math.max(0, Math.min(1, (y - FLOOR_TOP) / (IH - FLOOR_TOP))) * 0.3;
    return base * LOBBY_SCALE * depth;
  }

  function buildLobby() {
    var stage = ui.stage = el('div', 'ac-stage');
    var lobby = ui.lobby = el('div', 'ac-lobby');
    lobby.style.backgroundImage = 'url(' + BASE + 'lobby.webp)';
    ui.canvas = el('canvas', 'ac-canvas'); ui.canvas.width = IW; ui.canvas.height = IH;
    ui.canvas.setAttribute('aria-label', '별줍는 오락실 로비. 방향키나 바닥을 눌러 걸어요');
    ui.canvas.tabIndex = -1;
    lobby.appendChild(ui.canvas);
    // 오락기·캡슐 기계를 바로 누를 수 있는 버튼(화면 읽기 프로그램·키보드용으로도)
    ui.hot = {};
    Object.keys(SPOTS).forEach(function (k) {
      var s = SPOTS[k], b = btn('ac-hot', '', function () { goSpot(k); });
      b.setAttribute('aria-label', k === 'game' ? '별빛 팡팡 오락기' : '캡슐 뽑기 기계');
      b.style.left = pct(s.box[0], IW); b.style.top = pct(s.box[1], IH);
      b.style.width = pct(s.box[2] - s.box[0], IW); b.style.height = pct(s.box[3] - s.box[1], IH);
      ui.hot[k] = b; lobby.appendChild(b);
    });
    ui.sign = el('p', 'ac-sign', '별빛 팡팡'); place(ui.sign, 364, 196); lobby.appendChild(ui.sign);
    ui.talk = btn('ac-prompt', '', function () { if (S.near) openSpot(S.near); });
    ui.talk.hidden = true;
    ui.leave = btn('ac-prompt ac-prompt-exit', '', close);
    ui.leave.innerHTML = '공원으로 나가기 <kbd>스페이스</kbd>'; ui.leave.hidden = true;
    ui.tip = el('p', 'ac-tip', TIP);
    ui.exit = btn('ac-pill ac-lexit', '공원으로', close);
    ui.coupon = el('p', 'ac-coupon');
    ui.toast = el('p', 'ac-toast'); ui.toast.hidden = true; ui.toast.setAttribute('role', 'status');
    [ui.talk, ui.leave, ui.tip, ui.exit, ui.coupon, ui.toast].forEach(function (n) { lobby.appendChild(n); });
    stage.appendChild(lobby);
    ui.root.appendChild(stage);

    ui.canvas.addEventListener('pointerdown', function (e) {
      if (S.win) return;
      var r = ui.canvas.getBoundingClientRect(), p = { x: (e.clientX - r.left) / r.width * IW, y: (e.clientY - r.top) / r.height * IH };
      S.pending = null;
      if (!walkable(p.x, p.y)) {
        var best = null;
        for (var rr = 10; rr < 260 && !best; rr += 10) for (var a = 0; a < 360; a += 20) {
          var x = p.x + Math.cos(a * Math.PI / 180) * rr, y = p.y + Math.sin(a * Math.PI / 180) * rr;
          if (walkable(x, y)) { best = { x: x, y: y }; break; }
        }
        if (!best) return; p = best;
      }
      S.dest = p;
    });
  }
  function place(n, x, y) { n.style.left = pct(x, IW); n.style.top = pct(y, IH); }
  // 오락기를 누르면: 가까우면 바로 열고, 멀면 그 앞으로 걸어가서 열기
  function goSpot(k) {
    if (S.win) return;
    if (S.near === k) { openSpot(k); return; }
    S.dest = { x: SPOTS[k].stand.x, y: SPOTS[k].stand.y }; S.pending = k;
  }
  function openSpot(k) {
    S.pending = null; S.dest = null; S.keys = {}; S.me.moving = false;
    if (k === 'game') openGame(); else openCapsule();
  }

  var KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  function stepLobby(dt) {
    if (S.win) { S.me.moving = false; return; }
    var dx = 0, dy = 0, sp = 330 * dt, me = S.me;
    if (S.keys.left) dx -= 1; if (S.keys.right) dx += 1; if (S.keys.up) dy -= 1; if (S.keys.down) dy += 1;
    if (dx || dy) { S.dest = null; S.pending = null; }
    else if (S.dest) {
      var tx = S.dest.x - me.x, ty = S.dest.y - me.y, d = Math.hypot(tx, ty);
      if (d < 6) { S.dest = null; if (S.pending) { openSpot(S.pending); return; } } else { dx = tx / d; dy = ty / d; }
    }
    var moved = false;
    if (dx || dy) {
      var n = Math.hypot(dx, dy); dx /= n; dy /= n;
      if (walkable(me.x + dx * sp, me.y + dy * sp)) { me.x += dx * sp; me.y += dy * sp; moved = true; }
      else if (dx && walkable(me.x + Math.sign(dx) * sp, me.y)) { me.x += Math.sign(dx) * sp; moved = true; }
      else if (dy && walkable(me.x, me.y + Math.sign(dy) * sp)) { me.y += Math.sign(dy) * sp; moved = true; }
      else { S.dest = null; if (S.pending) { var k = S.pending; if (Math.hypot(me.x - SPOTS[k].x, me.y - SPOTS[k].y) < 260) { openSpot(k); return; } S.pending = null; } }
      me.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    }
    me.moving = moved;
    S.near = null;
    Object.keys(SPOTS).forEach(function (k) { var s = SPOTS[k]; if (Math.hypot(me.x - s.x, (me.y - s.y) * 1.4) < 220) S.near = k; });
    S.nearExit = !S.near && me.y > EXIT_Y;
    ui.talk.hidden = !S.near;
    if (S.near) {
      var s = SPOTS[S.near];
      if (ui.talk.dataset.k !== S.near) { ui.talk.dataset.k = S.near; ui.talk.innerHTML = s.label + ' <kbd>스페이스</kbd>'; }
      place(ui.talk, s.x, s.top);
    }
    ui.leave.hidden = !S.nearExit;
    if (S.nearExit) place(ui.leave, me.x, me.y - charH(me.y) - 64);
  }
  function drawLobby(t) {
    var c = ui.canvas.getContext('2d');
    c.clearRect(0, 0, IW, IH);
    drawMe(c, t);
    if (DEBUG) {
      c.strokeStyle = 'lime'; c.lineWidth = 3; c.beginPath();
      FLOOR.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); c.stroke();
      c.strokeStyle = 'red'; Object.keys(SPOTS).forEach(function (k) { var b = SPOTS[k].box; c.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); });
      c.beginPath(); c.moveTo(0, EXIT_Y); c.lineTo(IW, EXIT_Y); c.stroke();
    }
  }
  function drawMe(c, t) {
    var me = S.me, h = charH(me.y), sid = api().character ? api().character().sid : 'F1';
    var sw = h * 0.3, g = c.createRadialGradient(me.x, me.y, 0, me.x, me.y, sw);
    g.addColorStop(0, 'rgba(110,40,50,0.35)'); g.addColorStop(1, 'rgba(110,40,50,0)');
    c.save(); c.translate(me.x, me.y); c.scale(1, 0.28); c.translate(-me.x, -me.y);
    c.fillStyle = g; c.beginPath(); c.arc(me.x, me.y, sw, 0, Math.PI * 2); c.fill(); c.restore();
    if (!window.MPChars) return;
    var opt;
    if (me.moving) {
      var f = Math.floor(t * 7) % 4, side = me.dir === 'left' || me.dir === 'right';
      opt = f % 2 === 0 ? { walk: true, mirror: f === 2 && !side } : { bob: h * 0.02 };
    } else opt = { sy: 1 + Math.sin(t * 2.4) * 0.01 };
    if (!(me.moving && MPChars.drawAnim && MPChars.drawAnim(c, sid, me.x, me.y, me.dir, h, t)) &&
        !MPChars.drawSprite(c, sid, me.x, me.y, me.dir, h, opt)) MPChars.drawSprite(c, sid, me.x, me.y, me.dir, h, { bob: opt.bob });
  }
  function showCoupons(gain) {
    var n = arcadeData().coupons;
    ui.coupon.innerHTML = '<span aria-hidden="true">🎫</span> 쿠폰 <b>' + n + '</b>장';
    if (gain) { ui.coupon.classList.remove('gain'); void ui.coupon.offsetWidth; ui.coupon.classList.add('gain'); }
    if (ui.capCount) ui.capCount.textContent = String(n);
  }
  var toastT = 0;
  function lobbyToast(msg) {
    ui.toast.textContent = msg; ui.toast.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { ui.toast.hidden = true; }, 2600);
  }

  // ================================================================
  // 별빛 팡팡 창
  // ================================================================
  var PIX = { cw: 300, ch: 420, foot: 400, head: 150, k: 0.9 };       // 픽셀 그림 칸·기준점·그리는 배율
  var FOOT_Y = 866;                                                     // 나무 발판 위 발바닥 줄
  var MOUTH_Y = FOOT_Y - (PIX.foot - 236) * PIX.k, MOUTH_HALF = 74;    // 바구니 입구 높이·반폭
  var STAR = { cw: 240, ch: 330, cx: 120, cy: 250 };
  var X_MIN = 110, X_MAX = IW - 110;
  var pixIdle = img('pixel-idle.webp'), pixWalk = img('pixel-walk.webp'), starImg = img('star.webp');

  var G = {
    phase: 'intro', mode: null, px: IW / 2, moving: false, dir: 1, walkT: 0,
    stars: [], fx: [], score: 0, left: GAME_SEC, spawn: 0, count: 0, phaseT: 0,
    paused: false, round: 0, paidRound: 0, t: 0, keys: {}, practiceN: 0, showCam: true, level: 'normal'
  };

  function buildGame() {
    var w = ui.win = el('div', 'ac-win'); w.hidden = true;
    var f = ui.frame = el('div', 'ac-frame');
    f.setAttribute('role', 'dialog'); f.setAttribute('aria-modal', 'true'); f.setAttribute('aria-label', '별빛 팡팡');
    f.style.backgroundImage = 'url(' + BASE + 'starpang-bg.webp)';
    ui.gc = el('canvas', 'ac-gcanvas'); ui.gc.width = IW; ui.gc.height = IH;
    ui.gc.setAttribute('aria-hidden', 'true');
    f.appendChild(ui.gc);

    // 위: 점수 · 남은 시간 · 조작 상태
    ui.hScore = el('p', 'ac-h ac-hscore'); ui.hScore.innerHTML = '<span class="ac-hstar" aria-hidden="true">★</span><b>0</b>';
    ui.hScore.setAttribute('aria-label', '점수');
    ui.hTime = el('p', 'ac-h ac-htime'); ui.hTime.innerHTML = '<span aria-hidden="true">⏰</span><b>00:30</b>';
    ui.hStatus = el('p', 'ac-h ac-hstatus'); ui.hStatus.setAttribute('aria-live', 'polite');
    ui.closeX = btn('ac-x', '✕', function () { closeWin(); });
    ui.closeX.setAttribute('aria-label', '창 닫고 아케이드 로비로');
    [ui.hScore, ui.hTime, ui.hStatus, ui.closeX].forEach(function (n) { f.appendChild(n); });

    // 카메라 미리보기(거울 화면). 이 기기 안에서만 그리고 저장·전송하지 않음. 버튼으로 켜고 끔
    ui.camBox = el('div', 'ac-cam'); ui.camBox.hidden = true;
    ui.camCv = el('canvas', 'ac-cam-cv'); ui.camCv.width = 192; ui.camCv.height = 144;
    ui.camCv.setAttribute('aria-label', '내 카메라 거울 화면. 초록 동그라미가 인식한 오른손이에요');
    ui.camBox.appendChild(ui.camCv);
    ui.camBox.appendChild(el('p', 'ac-cam-cap', '초록 ● 오른손 · 회색 ● 다른 손 · 노란 줄 = 화면 양 끝'));
    f.appendChild(ui.camBox);
    ui.camToggle = btn('ac-camtoggle', '', function () { G.showCam = !G.showCam; syncCam(); });
    ui.camToggle.hidden = true;
    f.appendChild(ui.camToggle);

    // 한 줄 안내
    ui.guide = el('p', 'ac-guide'); ui.guide.setAttribute('aria-live', 'polite'); ui.guide.hidden = true;
    f.appendChild(ui.guide);

    // 첫 화면: 제목 · 픽셀의 말 · 조작 고르기
    var intro = ui.intro = el('div', 'ac-intro');
    intro.appendChild(el('h2', 'ac-title', '별빛 팡팡'));
    ui.say = el('p', 'ac-say');
    intro.appendChild(ui.say);
    var lr = el('div', 'ac-levels'); lr.setAttribute('role', 'radiogroup'); lr.setAttribute('aria-label', '난이도');
    lr.appendChild(el('span', 'ac-levels-label', '난이도'));
    ui.levelBtns = LEVEL_IDS.map(function (id) {
      var b = btn('ac-level lv-' + id, LEVELS[id].name, function () { setLevel(id, true); });
      b.setAttribute('role', 'radio'); b.dataset.id = id; lr.appendChild(b); return b;
    });
    intro.appendChild(lr);
    var row = ui.introBtns = el('div', 'ac-btns');
    ui.camBtn = btn('ac-choice', '📷 카메라로 시작', startCamera);
    ui.keyBtn = btn('ac-choice light', '⌨️ 방향키로 시작', function () { startKeys(); });
    row.appendChild(ui.camBtn); row.appendChild(ui.keyBtn);
    intro.appendChild(row);
    ui.privacy = el('p', 'ac-privacy', '카메라 영상은 이 기기에서 손 위치만 찾는 데 쓰고, 저장하거나 보내지 않아요.');
    f.appendChild(intro);
    f.appendChild(ui.privacy);   // 개인정보 안내는 아래 발판 위에(픽셀을 가리지 않게)

    // 3·2·1
    ui.count = el('p', 'ac-count'); ui.count.hidden = true; ui.count.setAttribute('aria-live', 'assertive');
    f.appendChild(ui.count);

    // 손을 놓쳤을 때
    var pz = ui.pause = el('div', 'ac-pause'); pz.hidden = true;
    pz.appendChild(el('p', 'ac-pause-text', '오른손을 다시 보여 주세요'));
    pz.appendChild(el('p', 'ac-pause-sub', '손이 보이면 이어서 해요. 시간과 별은 잠깐 멈췄어요.'));
    pz.appendChild(btn('ac-choice light', '⌨️ 방향키로 계속하기', function () { startKeys(true); }));
    f.appendChild(pz);

    // 결과
    var rs = ui.result = el('div', 'ac-result'); rs.hidden = true;
    rs.appendChild(el('h2', 'ac-rtitle', '끝! 별을 이만큼 받았어요'));
    ui.rLevel = el('p', 'ac-rlevel'); rs.appendChild(ui.rLevel);
    ui.rScore = el('p', 'ac-rscore'); rs.appendChild(ui.rScore);
    ui.rBest = el('p', 'ac-rline'); rs.appendChild(ui.rBest);
    ui.rCoupon = el('p', 'ac-rline ac-rcoupon'); rs.appendChild(ui.rCoupon);
    ui.rExtra = el('p', 'ac-rline ac-rextra'); rs.appendChild(ui.rExtra);
    var rb = el('div', 'ac-btns');
    ui.againBtn = btn('ac-choice', '다시 하기', again);
    rb.appendChild(ui.againBtn);
    rb.appendChild(btn('ac-choice light', '🎁 캡슐 뽑기', function () { closeWin(); openCapsule(); }));
    rs.appendChild(rb);
    rb = el('div', 'ac-btns ac-btns-sub');
    rb.appendChild(btn('ac-mini', '난이도 바꾸기', function () { toIntro(); setTimeout(function () { var b = ui.levelBtns.filter(function (x) { return x.dataset.id === G.level; })[0]; if (b) b.focus(); }, 30); }));
    rs.appendChild(rb);
    f.appendChild(rs);

    // 터치 화면용 ◀ ▶ (방향키 모드에서만)
    ui.pads = [];
    [['left', '◀'], ['right', '▶']].forEach(function (p) {
      var b = btn('ac-pad ac-pad-' + p[0], p[1]);
      b.setAttribute('aria-label', p[0] === 'left' ? '왼쪽으로' : '오른쪽으로');
      var on = function (e) { e.preventDefault(); G.keys[p[0]] = true; }, off = function () { G.keys[p[0]] = false; };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
      b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
      b.hidden = true; ui.pads.push(b); f.appendChild(b);
    });

    w.appendChild(f);
    ui.stage.appendChild(w);
  }

  function setGuide(text) { ui.guide.hidden = !text; if (text) ui.guide.textContent = text; }
  // 카메라 모드일 때만 '카메라 보기' 버튼과 미리보기
  function syncCam() {
    var on = G.mode === 'cam' && G.phase !== 'intro' && G.phase !== 'fail';
    ui.camToggle.hidden = !on;
    ui.camToggle.textContent = G.showCam ? '카메라 화면 숨기기' : '📷 카메라 화면 보기';
    ui.camToggle.setAttribute('aria-pressed', String(G.showCam));
    ui.camBox.hidden = !(on && G.showCam);
  }
  function drawCam() {
    if (ui.camBox.hidden || !window.MPHand || !MPHand.preview) return;
    if ((G.camN = (G.camN || 0) + 1) % 3) return;   // 미리보기는 3화면에 한 번만(가볍게)
    var p = MPHand.preview(), c = ui.camCv.getContext('2d'), W = ui.camCv.width, H = ui.camCv.height;
    c.fillStyle = '#0b1640'; c.fillRect(0, 0, W, H);
    var v = p.video;
    if (v && v.readyState >= 2 && v.videoWidth) {
      c.save(); c.translate(W, 0); c.scale(-1, 1);   // 거울처럼(내 오른쪽 = 화면 오른쪽)
      var k = Math.max(W / v.videoWidth, H / v.videoHeight), vw = v.videoWidth * k, vh = v.videoHeight * k;
      c.drawImage(v, (W - vw) / 2, (H - vh) / 2, vw, vh);
      c.restore();
    } else { c.fillStyle = '#cbd6ff'; c.font = "14px 'Gowun Dodum', 'Malgun Gothic', sans-serif"; c.textAlign = 'center'; c.fillText('카메라 준비 중…', W / 2, H / 2); }
    if (p.range) {
      c.strokeStyle = 'rgba(255,214,64,0.9)'; c.lineWidth = 3; c.setLineDash([8, 6]);
      p.range.forEach(function (x) { c.beginPath(); c.moveTo(x * W, 0); c.lineTo(x * W, H); c.stroke(); });
      c.setLineDash([]);
    }
    p.hands.forEach(function (h) {
      c.beginPath(); c.arc(h.x * W, h.y * H, h.right ? 9 : 6, 0, Math.PI * 2);
      c.fillStyle = h.right ? 'rgba(61,220,110,0.85)' : 'rgba(200,200,200,0.75)'; c.fill();
      c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke();
    });
  }
  function setStatus() {
    syncCam();
    var s = ui.hStatus;
    var pre = G.phase === 'intro' || G.phase === 'fail';
    ui.hScore.hidden = pre; ui.hTime.hidden = pre;   // 첫 화면에는 점수·시간 대신 제목
    if (pre || !G.mode) { s.hidden = true; return; }
    s.hidden = false;
    if (G.mode === 'keys') { s.className = 'ac-h ac-hstatus keys'; s.innerHTML = '<span aria-hidden="true">⌨️</span> 방향키 조작'; return; }
    var r = window.MPHand ? MPHand.read() : { seen: false };
    if (G.phase === 'connect') { s.className = 'ac-h ac-hstatus wait'; s.innerHTML = '<i></i> 카메라 준비 중'; return; }
    s.className = 'ac-h ac-hstatus ' + (r.seen ? 'on' : 'wait');
    s.innerHTML = '<span aria-hidden="true">📷</span><i></i> ' + (r.seen ? '오른손 인식 중' : '오른손을 찾는 중');
  }
  function showHud(n, left) {
    ui.hScore.querySelector('b').textContent = String(n);
    var s = Math.max(0, Math.ceil(left));
    ui.hTime.querySelector('b').textContent = '00:' + (s < 10 ? '0' : '') + s;
    ui.hTime.classList.toggle('hurry', G.phase === 'play' && s <= 5);
  }

  function openGame() {
    S.win = 'game';
    ui.win.hidden = false; ui.capWin.hidden = true;
    ui.talk.hidden = true; ui.leave.hidden = true; ui.tip.hidden = true;
    toIntro();
    setTimeout(function () { ui.camBtn.focus(); }, 30);
  }
  function toIntro(failMsg) {
    if (window.MPHand) MPHand.stop();
    G.phase = failMsg ? 'fail' : 'intro'; G.mode = null; G.stars = []; G.fx = []; G.paused = false; G.keys = {};
    G.px = IW / 2; G.moving = false; G.score = 0; G.left = GAME_SEC;
    ui.intro.hidden = false; ui.result.hidden = true; ui.pause.hidden = true; ui.count.hidden = true;
    ui.say.innerHTML = failMsg ? failMsg : '안녕! 오른손을 옆으로 움직이면 나도 따라가.<br>떨어지는 별 아래로 바구니를 옮겨 봐!';
    ui.camBtn.textContent = failMsg ? '📷 카메라 다시 해 보기' : '📷 카메라로 시작';
    ui.camBtn.disabled = false; ui.keyBtn.disabled = false;
    ui.privacy.hidden = false;
    setLevel(defaultLevel());
    ui.pads.forEach(function (b) { b.hidden = true; });
    setGuide(''); setStatus(); showHud(0, GAME_SEC);
  }
  // 난이도: 저장된 선택이 있으면 그것, 없으면 공원 학년에 맞춰
  function defaultLevel() {
    var a = arcadeData();
    if (LEVELS[a.level]) return a.level;
    var g = (api() && api().profile && api().profile().grade) || 3;
    return g <= 2 ? 'easy' : g <= 4 ? 'normal' : 'hard';
  }
  function setLevel(id, chosen) {
    if (!LEVELS[id]) return;
    G.level = id;
    ui.levelBtns.forEach(function (b) { var on = b.dataset.id === id; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    if (chosen) { var a = arcadeData(); a.level = id; writeArcade(a); }
  }
  function closeWin() {
    // 중도에 닫으면 쿠폰 없이 로비로. 카메라는 꼭 끔
    if (window.MPHand) MPHand.stop();
    G.phase = 'intro'; G.mode = null; G.stars = []; G.fx = []; G.paused = false; G.keys = {};
    ui.win.hidden = true; ui.capWin.hidden = true; S.win = null; S.keys = {};
    S.last = performance.now();
    showCoupons();
    ui.canvas.focus && ui.canvas.focus();
  }

  function startCamera() {
    if (!window.MPHand) { toIntro(camFailText()); return; }
    G.mode = 'cam'; G.phase = 'connect';
    ui.camBtn.disabled = true; ui.keyBtn.disabled = true;
    ui.intro.hidden = true; ui.privacy.hidden = true;
    setGuide('카메라를 연결하고 있어요…'); setStatus();
    var myRound = ++G.round;
    MPHand.start(function (t) { if (G.phase === 'connect') setGuide(t); }).then(function () {
      if (G.round !== myRound || !S.win) return;
      G.phase = 'find'; setGuide('앉은 자리에서 오른손을 카메라에 보여 주세요.'); setStatus();
    }, function (e) {
      if (G.round !== myRound || !S.win || (e && e.message === 'cancel')) return;
      var denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      toIntro(camFailText(denied, e && e.name === 'NotFoundError'));
      ui.keyBtn.focus();
    });
  }
  function camFailText(denied, none) {
    return (denied ? '카메라를 쓸 수 없게 막혀 있어요.' : none ? '연결된 카메라를 찾지 못했어요.' : '카메라나 손 인식을 준비하지 못했어요.') +
      '<br>괜찮아! 방향키로도 별을 받을 수 있어.';
  }
  // 방향키로 시작(첫 화면) 또는 손을 놓쳤을 때 방향키로 바꿔 계속하기(mid)
  function startKeys(mid) {
    if (window.MPHand) MPHand.stop();
    G.mode = 'keys'; G.paused = false; ui.pause.hidden = true;
    ui.pads.forEach(function (b) { b.hidden = false; });
    if (!mid || G.phase === 'intro' || G.phase === 'fail' || G.phase === 'connect' || G.phase === 'find') { G.round++; toPractice(); }
    else setGuide(G.phase === 'practice' ? '← → 키로 바구니를 옮겨 봐!' : '');
    setStatus();
    ui.gc.focus && ui.gc.focus();
  }
  function toPractice() {
    G.phase = 'practice'; G.stars = []; G.practiceN = 0;
    ui.intro.hidden = true; ui.result.hidden = true;
    ui.privacy.hidden = true;
    setGuide(G.mode === 'cam' ? '별 아래로 바구니를 옮겨 봐!' : '← → 키로 바구니를 옮겨 봐!');
    setStatus();
  }
  function toCount() {
    G.phase = 'count'; G.phaseT = 0; G.stars = []; G.score = 0; G.left = GAME_SEC;
    ui.result.hidden = true; ui.intro.hidden = true;
    if (G.mode === 'keys') ui.pads.forEach(function (b) { b.hidden = false; });
    setGuide(''); showHud(0, GAME_SEC);
    ui.count.hidden = false; ui.count.textContent = '3';
    G.round++;
  }
  function again() {
    ui.result.hidden = true;
    if (G.mode === 'cam' && window.MPHand && !MPHand.cameraLive()) { startCamera(); return; }
    toCount();
  }

  function spawnStar(practice) {
    var x;
    if (practice) {
      // 연습 별은 픽셀에서 조금 떨어진 곳에 천천히. 바구니를 옮겨 봐야 받을 수 있게
      var side = G.px > IW / 2 ? -1 : 1;
      x = Math.max(X_MIN + 60, Math.min(X_MAX - 60, G.px + side * (280 + Math.random() * 220)));
      G.stars.push({ x: x, y: -60, vy: 165, big: false, ph: Math.random() * 8, practice: true });
      return;
    }
    var L = LEVELS[G.level], prog = 1 - G.left / GAME_SEC, big = Math.random() < L.big;
    x = X_MIN + 40 + Math.random() * (X_MAX - X_MIN - 80);
    G.stars.push({ x: x, y: -60, vy: (290 + Math.random() * 120) * L.speed * (1 + prog * L.ramp) * (big ? 0.9 : 1), big: big, ph: Math.random() * 8 });
  }
  function catchStar(s) {
    var v = s.big ? 3 : 1;
    for (var i = 0; i < (s.big ? 14 : 8); i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      G.fx.push({ kind: 'spark', x: G.px + (Math.random() - 0.5) * 90, y: MOUTH_Y, vx: Math.cos(a) * (120 + Math.random() * 160), vy: Math.sin(a) * (160 + Math.random() * 200), t: 0, life: 0.7, r: 7 + Math.random() * 8 });
    }
    if (!s.practice) G.fx.push({ kind: 'text', x: G.px, y: MOUTH_Y - 40, text: '+' + v, big: s.big, t: 0, life: 0.9 });
    return v;
  }

  function stepGame(dt) {
    G.t += dt;
    if (G.phase === 'intro' || G.phase === 'fail' || G.phase === 'result') { G.moving = false; stepFx(dt); return; }

    // ----- 움직이기 -----
    var before = G.px, r = null;
    if (G.mode === 'keys') {
      var d = (G.keys.right ? 1 : 0) - (G.keys.left ? 1 : 0);
      G.px += d * 880 * dt;
    } else if (G.mode === 'cam' && window.MPHand) {
      r = MPHand.read();
      if (r.everSeen) {
        // 손 인식은 초당 15~30번이라 그대로 따라가면 뚝뚝 끊겨 보임 → 매 화면마다 목표 쪽으로 부드럽게 다가감
        var target = X_MIN + r.x * (X_MAX - X_MIN), diff = target - G.px;
        if (Math.abs(diff) > 4) G.px += diff * (1 - Math.exp(-dt * 11));
      }
    }
    G.px = Math.max(X_MIN, Math.min(X_MAX, G.px));
    var dx = G.px - before;
    // 걷기 그림이 한 프레임씩 켜졌다 꺼지며 깜빡이지 않게, 멈춘 뒤 0.12초는 걷는 채로 둠
    if (Math.abs(dx) > 40 * dt) { G.dir = dx > 0 ? 1 : -1; G.still = 0; } else G.still = (G.still || 0) + dt;
    G.moving = G.still < 0.12;
    if (G.moving) G.walkT += dt; else G.walkT = 0;

    // ----- 손 확인(카메라) -----
    if (G.mode === 'cam' && r) {
      if (G.phase === 'find' && r.seen) toPractice();
      var watch = G.phase === 'practice' || G.phase === 'nice' || G.phase === 'count' || G.phase === 'play';
      var lost = watch && r.lostMs > 700;
      if (lost !== G.paused) { G.paused = lost; ui.pause.hidden = !lost; }
    } else if (G.paused) { G.paused = false; ui.pause.hidden = true; }
    if (Math.floor(G.t * 4) !== Math.floor((G.t - dt) * 4)) setStatus();
    if (G.paused) { stepFx(dt); return; }

    // ----- 단계별 -----
    if (G.phase === 'nice') { G.phaseT += dt; if (G.phaseT > 1.8) toCount(); }
    else if (G.phase === 'count') {
      G.phaseT += dt;
      var n = 3 - Math.floor(G.phaseT / 0.8);
      ui.count.textContent = n > 0 ? String(n) : '시작!';
      if (G.phaseT > 2.4 + 0.5) { ui.count.hidden = true; G.phase = 'play'; G.spawn = 0.2; }
    } else if (G.phase === 'practice') {
      if (!G.stars.length) spawnStar(true);
    } else if (G.phase === 'play') {
      G.left -= dt;
      G.spawn -= dt;
      if (G.spawn <= 0) {
        var L = LEVELS[G.level];
        spawnStar(false);
        G.spawn = L.gap[0] + Math.random() * (L.gap[1] - L.gap[0]) - (1 - G.left / GAME_SEC) * L.ramp * 0.5;
      }
      if (G.left <= 0) { G.left = 0; finish(); return; }
    }
    stepStars(dt);
    stepFx(dt);
    showHud(G.score, G.phase === 'play' ? G.left : GAME_SEC);
  }
  function stepStars(dt) {
    for (var i = G.stars.length - 1; i >= 0; i--) {
      var s = G.stars[i], py = s.y;
      s.y += s.vy * dt;
      // 별 몸통이 바구니 입구 줄을 지나는 순간, 입구 안이면 받기(한 번만)
      if (!s.done && py < MOUTH_Y && s.y >= MOUTH_Y) {
        s.done = true;
        if (Math.abs(s.x - G.px) <= MOUTH_HALF + (s.big ? 10 : 0) + LEVELS[G.level].reach) {
          var v = catchStar(s);
          G.stars.splice(i, 1);
          if (s.practice) { G.phase = 'nice'; G.phaseT = 0; G.stars = []; setGuide('좋았어! 이제 30초 동안 별을 받아 봐!'); return; }
          G.score += v;
          continue;
        }
      }
      if (s.y > IH + 140) G.stars.splice(i, 1);   // 놓친 별은 화면 아래로 사라짐(연습이면 새 별이 떨어짐)
    }
  }
  function stepFx(dt) {
    for (var i = G.fx.length - 1; i >= 0; i--) {
      var f = G.fx[i]; f.t += dt;
      if (f.kind === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 520 * dt; }
      else f.y -= 70 * dt;
      if (f.t >= f.life) G.fx.splice(i, 1);
    }
  }

  function finish() {
    G.phase = 'result'; G.stars = []; G.paused = false; ui.pause.hidden = true; ui.count.hidden = true;
    setGuide(''); showHud(G.score, 0);
    // 본게임을 끝까지 하면 점수와 관계없이 쿠폰 1장(한 판에 한 번)
    // 최고 기록은 난이도마다 따로(bestBy), best 는 전체 최고
    var a = arcadeData(), first = !a.cleared, gain = 0, lv = G.level, L = LEVELS[lv];
    var prevBest = a.bestBy[lv] || 0, played = !!a.playedBy[lv], newBest = G.score > prevBest;
    if (G.paidRound !== G.round) {
      G.paidRound = G.round; gain = 1;
      a.coupons += 1; a.rounds += 1; a.cleared = true; a.playedBy[lv] = true;
      if (newBest) a.bestBy[lv] = G.score;
      a.best = Math.max(a.best, G.score);
    }
    var saved = writeArcade(a);
    // 티켓(캐릭터 가게용): 모든 건물 같은 규칙 — 공원 학년마다 처음 끝내면 1장, 모든 건물 합쳐 하루 3장. 판마다 한 번
    var tk = gain && api() && api().awardTicket ? api().awardTicket('arcade', api().profile().grade) : null;
    ui.rScore.innerHTML = '<span aria-hidden="true">★</span> <b>' + G.score + '</b>점';
    ui.rLevel.textContent = '난이도 ' + L.name;
    ui.rLevel.className = 'ac-rlevel lv-' + lv;
    var best = a.bestBy[lv] || 0;
    ui.rBest.textContent = newBest && played ? '🏆 새 최고 기록! 내 최고 기록(' + L.name + ') ' + best + '점' : '내 최고 기록(' + L.name + ') ' + best + '점';
    ui.rCoupon.textContent = gain ? '🎫 쿠폰 1장을 받았어요! (지금 ' + a.coupons + '장 · 캡슐 1개 = 쿠폰 ' + CAPSULE_COST + '장)' : '';
    var extra = [];
    if (tk) extra.unshift(tk.line);
    if (first) extra.push('★ ‘게임 챔피언’ 캐릭터를 받았어요! 공원 위쪽 ‘캐릭터’에서 골라 봐요.');
    if (!saved) extra.push('이 기기에는 저장되지 않았어요. 기록은 이번에만 남아요.');
    ui.rExtra.textContent = extra.join(' ');
    ui.rExtra.hidden = !extra.length;
    ui.result.hidden = false;
    ui.pads.forEach(function (b) { b.hidden = true; });
    showCoupons(!!gain);
    setStatus();
    setTimeout(function () { ui.againBtn.focus(); }, 30);
  }

  // ----- 그리기 -----
  function drawGame() {
    var c = ui.gc.getContext('2d');
    c.clearRect(0, 0, IW, IH);
    // 픽셀: 움직일 때만 옆걸음 8프레임(오른쪽 원본, 왼쪽 좌우 반전), 멈추면 정지 자세
    var k = PIX.k, w = PIX.cw * k, h = PIX.ch * k, top = FOOT_Y - PIX.foot * k;
    c.save();
    c.fillStyle = 'rgba(0,20,40,0.28)'; c.beginPath(); c.ellipse(G.px, FOOT_Y - 2, 92, 14, 0, 0, Math.PI * 2); c.fill();
    c.translate(G.px, 0);
    if (G.moving && G.dir < 0) c.scale(-1, 1);
    if (G.moving && pixWalk.complete && pixWalk.naturalWidth) {
      var fi = Math.floor(G.walkT * 13) % 8;
      c.drawImage(pixWalk, fi * PIX.cw, 0, PIX.cw, PIX.ch, -PIX.head * k, top, w, h);
    } else if (pixIdle.complete && pixIdle.naturalWidth) {
      c.drawImage(pixIdle, -PIX.head * k, top, w, h);
    }
    c.restore();
    // 별(픽셀 앞으로 지나가게 픽셀 다음에)
    G.stars.forEach(function (s) {
      var k = s.big ? 1.12 : 0.74, fi = Math.floor(G.t * 11 + s.ph) % 8;
      if (s.practice) k = 0.9;
      if (starImg.complete && starImg.naturalWidth) {
        c.drawImage(starImg, fi * STAR.cw, 0, STAR.cw, STAR.ch, s.x - STAR.cx * k, s.y - STAR.cy * k, STAR.cw * k, STAR.ch * k);
      }
    });
    // 받았을 때 반짝임·점수
    G.fx.forEach(function (f) {
      var a = 1 - f.t / f.life;
      c.save(); c.globalAlpha = Math.max(0, a);
      if (f.kind === 'spark') { c.fillStyle = '#ffe27a'; c.shadowColor = '#ffb300'; c.shadowBlur = 14; starPath(c, f.x, f.y, f.r * (0.6 + a * 0.6)); c.fill(); }
      else {
        c.font = (f.big ? 84 : 64) + "px 'Gowun Dodum', 'Malgun Gothic', sans-serif"; c.textAlign = 'center';
        c.lineWidth = 10; c.strokeStyle = '#7a3d00'; c.strokeText(f.text, f.x, f.y);
        c.fillStyle = f.big ? '#ffd23f' : '#fff4c2'; c.fillText(f.text, f.x, f.y);
      }
      c.restore();
    });
    if (DEBUG) {
      c.strokeStyle = 'lime'; c.lineWidth = 3;
      c.strokeRect(G.px - MOUTH_HALF, MOUTH_Y - 2, MOUTH_HALF * 2, 4);
      c.beginPath(); c.moveTo(0, FOOT_Y); c.lineTo(IW, FOOT_Y); c.stroke();
    }
  }
  function starPath(c, x, y, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      if (i) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }

  // ================================================================
  // 캡슐 뽑기 창
  // ================================================================
  function buildCapsule() {
    var w = ui.capWin = el('div', 'ac-win ac-capwin'); w.hidden = true;
    var p = el('div', 'ac-cap');
    p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-labelledby', 'acCapTitle');
    var x = btn('ac-x', '✕', closeWin); x.setAttribute('aria-label', '캡슐 뽑기 닫기'); p.appendChild(x);
    var h = el('h2', 'ac-cap-title', '캡슐 뽑기'); h.id = 'acCapTitle'; p.appendChild(h);
    var body = el('div', 'ac-cap-body');
    var left = el('div', 'ac-cap-left');
    ui.gumball = el('div', 'ac-gumball'); ui.gumball.style.backgroundImage = 'url(' + BASE + 'lobby.webp)';
    ui.capBall = el('div', 'ac-capball'); ui.capBall.hidden = true;
    ui.gumball.appendChild(ui.capBall);
    left.appendChild(ui.gumball);
    body.appendChild(left);
    var right = el('div', 'ac-cap-right');
    var cnt = el('p', 'ac-cap-count'); cnt.innerHTML = '<span aria-hidden="true">🎫</span> 내 쿠폰 ';
    ui.capCount = el('b', '', '0'); cnt.appendChild(ui.capCount); cnt.appendChild(document.createTextNode('장'));
    right.appendChild(cnt);
    right.appendChild(el('p', 'ac-cap-rule', '쿠폰 ' + CAPSULE_COST + '장으로 캡슐 1개! 오락기가 나오면 ‘내 맵 꾸미기 보관함’에 들어가요.'));
    ui.drawBtn = btn('ac-choice', '🎁 캡슐 뽑기 (쿠폰 ' + CAPSULE_COST + '장)', drawCapsule);
    right.appendChild(ui.drawBtn);
    ui.capMsg = el('p', 'ac-cap-msg'); ui.capMsg.setAttribute('role', 'status'); right.appendChild(ui.capMsg);
    ui.prize = el('div', 'ac-prize'); ui.prize.hidden = true; right.appendChild(ui.prize);
    right.appendChild(el('p', 'ac-box-title', '내 맵 꾸미기 보관함'));
    ui.box = el('div', 'ac-box'); right.appendChild(ui.box);
    ui.capPlay = btn('ac-choice light', '⭐ 별빛 팡팡 하러 가기', function () { closeWin(); openGame(); });
    right.appendChild(ui.capPlay);
    body.appendChild(right);
    p.appendChild(body);
    w.appendChild(p);
    ui.stage.appendChild(w);
  }
  function machineEl(m, n) {
    var d = el('div', 'ac-mc'); d.style.setProperty('--c', m.c);
    d.appendChild(el('span', 'ac-mc-icon', m.icon));
    d.appendChild(el('span', 'ac-mc-name', m.name + (n > 1 ? ' ×' + n : '')));
    return d;
  }
  function renderBox() {
    var items = decorData().items.filter(function (i) { return machine(i.id); }), counts = {};
    items.forEach(function (i) { counts[i.id] = (counts[i.id] || 0) + 1; });
    ui.box.textContent = '';
    var ids = MACHINES.map(function (m) { return m.id; }).filter(function (id) { return counts[id]; });
    if (!ids.length) { ui.box.appendChild(el('p', 'ac-box-empty', '아직 비어 있어요. 첫 캡슐에서는 오락기 4종 중 하나가 나와요!')); return; }
    ids.forEach(function (id) { ui.box.appendChild(machineEl(machine(id), counts[id])); });
  }
  function refreshCapsule() {
    var a = arcadeData();
    showCoupons();
    ui.drawBtn.disabled = a.coupons < CAPSULE_COST || S.drawing;
    if (!S.drawing && a.coupons < CAPSULE_COST) ui.capMsg.textContent = '쿠폰이 ' + (CAPSULE_COST - a.coupons) + '장 더 필요해요. 별빛 팡팡을 한 판 끝내면 1장!';
    else if (!S.drawing && ui.prize.hidden) ui.capMsg.textContent = '';
    ui.capPlay.hidden = a.coupons >= CAPSULE_COST;
    renderBox();
  }
  function openCapsule() {
    S.win = 'capsule';
    ui.capWin.hidden = false; ui.win.hidden = true;
    ui.talk.hidden = true; ui.leave.hidden = true; ui.tip.hidden = true;
    ui.prize.hidden = true; ui.capBall.hidden = true; ui.capMsg.textContent = '';
    refreshCapsule();
    setTimeout(function () { (ui.drawBtn.disabled ? ui.capPlay : ui.drawBtn).focus(); }, 30);
  }
  function drawCapsule() {
    var a = arcadeData();
    if (S.drawing || a.coupons < CAPSULE_COST) return;
    // 쿠폰을 먼저 쓰고 보상을 보관함에 넣은 뒤(한 번에 저장), 뽑는 연출을 보여 줌
    var m = MACHINES[Math.floor(Math.random() * MACHINES.length)];
    var decor = decorData();
    decor.items.push({ id: m.id, from: 'arcade-capsule', at: Date.now() });
    a.coupons -= CAPSULE_COST; a.capsules += 1;
    var saved = writeArcade(a, decor), first = a.capsules === 1;
    S.drawing = true; ui.drawBtn.disabled = true; ui.prize.hidden = true;
    ui.capMsg.textContent = '드르륵… 캡슐이 나오고 있어요!';
    showCoupons(); ui.gumball.classList.remove('shake'); void ui.gumball.offsetWidth; ui.gumball.classList.add('shake');
    ui.capBall.hidden = true;
    setTimeout(function () { ui.capBall.hidden = false; ui.capBall.className = 'ac-capball pop'; }, 900);
    setTimeout(function () {
      ui.capBall.className = 'ac-capball open';
      ui.prize.textContent = '';
      ui.prize.appendChild(machineEl(m, 1));
      ui.prize.hidden = false;
      ui.capMsg.textContent = (first ? '첫 캡슐! ' : '') + '‘' + m.name + '’' + (/[가-힣]/.test(m.name.slice(-1)) && (m.name.charCodeAt(m.name.length - 1) - 0xAC00) % 28 ? '이' : '가') + ' 나왔어요! 내 맵 꾸미기 보관함에 넣었어요.' + (saved ? '' : ' (이 기기에는 저장되지 않아요)');
      S.drawing = false; refreshCapsule();
    }, 1900);
  }

  // ================================================================
  // 열기·닫기·루프·입력
  // ================================================================
  function loop(now) {
    if (!S.open) return;
    var dt = Math.min(0.05, (now - S.last) / 1000); S.last = now;
    stepLobby(dt); if (!S.win) drawLobby(now / 1000);   // 창이 열려 있으면 뒤 로비는 다시 그리지 않음(가볍게)
    if (S.win === 'game') { stepGame(dt); drawGame(); drawCam(); }
    S.raf = requestAnimationFrame(loop);
  }
  function open() {
    if (!ui.root) return;
    S.open = true;
    ui.root.hidden = false;
    document.body.classList.add('arcade-open');
    S.me = { x: 836, y: 860, dir: 'up', moving: false };
    S.dest = null; S.pending = null; S.keys = {}; S.win = null; S.drawing = false; S.near = null; S.nearExit = false;
    ui.talk.hidden = true; ui.leave.hidden = true;
    ui.win.hidden = true; ui.capWin.hidden = true; ui.tip.hidden = false;
    // 아케이드 첫 방문 쿠폰 1장(한 번만)
    var a = arcadeData();
    if (!a.welcome) {
      a.welcome = true; a.coupons += 1; writeArcade(a);
      lobbyToast('🎫 별줍는 오락실 첫 방문 선물! 쿠폰 1장을 받았어요');
      showCoupons(true);
    } else showCoupons();
    S.last = performance.now();
    cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(loop);
    ui.canvas.focus && ui.canvas.focus();
  }
  function close() {
    if (window.MPHand) MPHand.stop();
    S.open = false; S.win = null; cancelAnimationFrame(S.raf);
    G.phase = 'intro'; G.stars = []; G.keys = {};
    ui.root.hidden = true;
    document.body.classList.remove('arcade-open');
    if (api() && api().exitArcade) api().exitArcade();
  }

  var GAME_KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  function onKey(e, down) {
    if (!S.open) return;
    if (S.win === 'game') {
      if (GAME_KEYS[e.code]) {
        e.preventDefault(); G.keys[GAME_KEYS[e.code]] = down;
        // 연습·본게임 중 카메라 모드여도 방향키를 누르면 방향키로 바꿔 계속
        if (down && G.mode === 'cam' && G.paused) startKeys(true);
        return;
      }
      if (down && e.code === 'Escape') { e.preventDefault(); closeWin(); }
      return;
    }
    if (S.win === 'capsule') { if (down && e.code === 'Escape') { e.preventDefault(); closeWin(); } return; }
    if (KEYMAP[e.code]) { e.preventDefault(); S.keys[KEYMAP[e.code]] = down; return; }
    if (down && e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      if (S.near) openSpot(S.near); else if (S.nearExit) close();
    }
    if (down && e.code === 'Escape') { e.preventDefault(); close(); }
  }

  function init() {
    ui.root = document.getElementById('arcade');
    if (!ui.root) return;
    ui.root.textContent = '';
    buildLobby();
    buildGame();
    buildCapsule();
    window.addEventListener('keydown', function (e) { onKey(e, true); });
    window.addEventListener('keyup', function (e) { onKey(e, false); });
    window.addEventListener('blur', function () { S.keys = {}; G.keys = {}; });
  }
  window.MPArcade = {
    open: open, close: close, _S: S, _G: G, _ui: ui,
    // 검증용: 화면이 숨겨져 애니메이션이 느릴 때 시간을 직접 흘려 확인
    _tick: function (sec, step) {
      step = step || 1 / 60;
      for (var t = 0; t < sec; t += step) { stepLobby(step); if (S.win === 'game') stepGame(step); }
      drawLobby(0); if (S.win === 'game') drawGame();
    },
    _spawn: function (x, big) { G.stars.push({ x: x, y: MOUTH_Y - 200, vy: 400, big: !!big, ph: 0 }); },
    _const: { MOUTH_Y: MOUTH_Y, MOUTH_HALF: MOUTH_HALF, FOOT_Y: FOOT_Y }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
