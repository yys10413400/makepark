/*
 * 유령의 집 — 문지기의 비밀 규칙 화면
 * ------------------------------------------------------------
 * 장면 1 로비(assets/gatekeeper/lobby.webp): 공원 캐릭터로 걸어 다니다 문지기 유령에게 '말 걸기'
 * 장면 2 검문대(checkpoint.webp): 왼쪽 손님 기록판, 황금문 앞 손님, 옆자리 유령, 검문대 위 '통과'·'잠깐!' 버튼
 * 장면 3 친구랑 문지기: 규칙 만들기 → 봉인 → 기기 건네기 → 검문대
 * 위치는 모두 배경 그림(1672×941) 기준 %라서 창 크기가 바뀌어도 함께 커지고 작아집니다.
 * 규칙·기록·판정·힌트·설명은 js/gatekeeper/rules.js 한 곳에서, 그림 기준점은 js/gatekeeper/sprites.js 에서.
 * 공원과의 연결: window.MP_API (game.js) — 저장·프로필·캐릭터·공원 복귀
 */
(function () {
  'use strict';
  var G = window.MP_GATE_RULES, SPR = window.MP_GATE_SPR;
  var IW = 1672, IH = 941;
  var BAND_OF = function (g) { return g <= 2 ? 'low' : g <= 4 ? 'middle' : 'high'; };
  var BAND_LABEL = { low: '1~2학년', middle: '3~4학년', high: '5~6학년' };
  var TICKETS = { solo: 5, friend: 3 };   // 판(라운드)마다 한 번
  var GHOST_SAYS = '어떤 손님이 이 문을 지날 수 있을까? 내 기록을 보고 비밀 규칙을 찾아봐!';
  var FIRST_GUIDE = '네 손님의 기록을 살펴보고, 다음 손님이 지나갈 수 있을지 골라봐.';
  var NAMES = { star: '별 배지', moon: '달 배지', none: '배지 없음', key: '열쇠', lantern: '호박등', empty: '빈손' };

  var S = {
    open: false, scene: 'lobby', grade: 1, mode: 'solo',
    me: { x: 870, y: 880, dir: 'up', moving: false }, keys: {}, dest: null, nearGhost: false, nearExit: false,
    dialog: false, round: null, guest: null, busy: false, firstTry: true, score: 0, rewarded: false,
    friend: { maker: 1, parts: null },
    t0: 0, raf: 0, last: 0
  };
  var ui = {};

  // ---------- 작은 도우미 ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function img(name, cls, alt) { var e = el('img', cls); e.src = SPR.base + name + '.webp'; e.alt = alt || ''; e.draggable = false; return e; }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function pct(v, of) { return (v / of * 100) + '%'; }
  function place(node, x, y, w, h, fw, fh) {
    node.style.left = pct(x, fw); node.style.top = pct(y, fh); node.style.width = pct(w, fw); node.style.height = pct(h, fh);
  }
  function api() { return window.MP_API; }
  function save() { return (api() && api().readSave()) || {}; }
  function gateSave() { var g = save().gate; return g && typeof g === 'object' ? g : {}; }
  function patchGate(fn) {
    var g = gateSave(), extra = fn(g) || {}, patch = { gate: g };
    for (var k in extra) patch[k] = extra[k];
    api().patchSave(patch);
    return api().storageOk();
  }
  function rand(n) { return Math.floor(Math.random() * n); }

  // ---------- 아이 그림 + 배지 + 손 소품 겹치기 ----------
  // look = { gender:'boy'|'girl', pin: 0~3, shoes: 0~3 }  (판정과 상관없는 꾸밈)
  // combo = { badge, item }
  function figure(kind, look, combo) {
    var id = look.gender + '-' + kind, K = SPR.kids[id], F = K.frame;
    var box = el('div', 'gk-fig gk-fig-' + kind);
    box.style.aspectRatio = F.w + ' / ' + F.h;
    function put(node, x, y, w, h) { place(node, x - F.x, y - F.y, w, h, F.w, F.h); box.appendChild(node); return node; }
    put(img(id, 'gk-kid'), 0, 0, K.w, K.h);
    if (K.pin) put(img(K.pin, 'gk-tint'), 0, 0, K.w, K.h).style.filter = 'hue-rotate(' + SPR.pinHues[look.pin || 0] + 'deg)';
    if (K.shoes) put(img(K.shoes, 'gk-tint'), 0, 0, K.w, K.h).style.filter = 'hue-rotate(' + SPR.shoeHues[look.shoes || 0] + 'deg)';
    if (combo.badge !== 'none') {
      var b = SPR.items[combo.badge], bw = K.badge.w, bh = bw * b.h / b.w;
      put(img(b.src, 'gk-badge', NAMES[combo.badge]), K.badge.x - bw / 2, K.badge.y - bh / 2, bw, bh);
    }
    if (combo.item !== 'empty') {
      var it = SPR.items[combo.item], h = K[combo.item], s = h / it.h;
      put(img(it.src, 'gk-item gk-item-' + combo.item, NAMES[combo.item]), K.fist.x - it.grip.x * s, K.fist.y - it.grip.y * s, it.w * s, h);
      // 쥔 손을 소품 위에 한 번 더: 열쇠 자루·호박등 손잡이가 주먹 안으로 들어간 것처럼
      var fist = put(img(id, 'gk-fist'), 0, 0, K.w, K.h);
      fist.style.clipPath = 'ellipse(' + pct(K.fist.r, K.w) + ' ' + pct(K.fist.r, K.h) + ' at ' + pct(K.fist.x, K.w) + ' ' + pct(K.fist.y, K.h) + ')';
    }
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', (combo.badge === 'none' ? '배지 없음' : NAMES[combo.badge]) + ', ' + (combo.item === 'empty' ? '빈손' : NAMES[combo.item] + '을 든') + ' 손님');
    return box;
  }
  // 외형: 상반신 카드에서 보이는 모습(남/여+머리핀) 기준으로 서로 다르게
  var LOOKS = [{ gender: 'boy', pin: 0 }, { gender: 'girl', pin: 0 }, { gender: 'girl', pin: 1 }, { gender: 'girl', pin: 2 }, { gender: 'girl', pin: 3 }];
  function lookKey(l) { return l.gender + (l.gender === 'girl' ? l.pin : ''); }
  function recordLooks(n) {
    var all = G.shuffle(LOOKS, Math.random);
    // 남자아이가 기록에 꼭 한 명은 들어가게
    if (all.slice(0, n).every(function (l) { return l.gender === 'girl'; })) { var bi = all.findIndex(function (l) { return l.gender === 'boy'; }); var t = all[0]; all[0] = all[bi]; all[bi] = t; }
    return all.slice(0, n).map(function (l) { return { gender: l.gender, pin: l.pin, shoes: rand(4) }; });
  }
  function guestLook(avoid) {
    var used = {};
    avoid.forEach(function (l) { used[lookKey(l)] = 1; });
    var free = LOOKS.filter(function (l) { return !used[lookKey(l)]; });
    var l = (free.length ? free : LOOKS)[rand(free.length || LOOKS.length)];
    return { gender: l.gender, pin: l.pin, shoes: rand(4) };
  }

  // ---------- 화면 만들기 ----------
  function build() {
    ui.root = document.getElementById('gatekeeper');
    var st = ui.stage = el('div', 'gk-stage');
    ui.root.appendChild(st);

    // 로비
    var lobby = ui.lobby = el('div', 'gk-scene gk-lobby');
    lobby.style.backgroundImage = 'url(' + SPR.base + 'lobby.webp)';
    ui.canvas = el('canvas', 'gk-canvas'); ui.canvas.width = IW; ui.canvas.height = IH;
    ui.canvas.setAttribute('aria-label', '유령의 집 로비. 방향키나 화면을 눌러 걸어요');
    lobby.appendChild(ui.canvas);
    ui.talk = btn('gk-prompt', '', function () { openDialog(); });
    ui.talk.innerHTML = '말 걸기 <kbd>스페이스</kbd>'; ui.talk.hidden = true;
    ui.leave = btn('gk-prompt gk-prompt-exit', '', function () { close(); });
    ui.leave.innerHTML = '공원으로 나가기 <kbd>스페이스</kbd>'; ui.leave.hidden = true;
    ui.tip = el('p', 'gk-tip', '방향키나 바닥을 눌러 걸어가서, 문 앞 문지기 유령에게 말을 걸어 봐요');
    ui.lobbyExit = btn('gk-pill gk-exit', '공원으로', function () { close(); });
    lobby.appendChild(ui.talk); lobby.appendChild(ui.leave); lobby.appendChild(ui.tip); lobby.appendChild(ui.lobbyExit);
    buildDialog(lobby);
    st.appendChild(lobby);

    // 검문대
    var gate = ui.gate = el('div', 'gk-scene gk-gate'); gate.hidden = true;
    gate.style.backgroundImage = 'url(' + SPR.base + 'checkpoint.webp)';
    var board = ui.board = el('div', 'gk-board');
    board.appendChild(img('record-board', 'gk-board-img', '손님 기록판: 위 두 칸은 통과, 아래 두 칸은 잠깐'));
    ui.slots = SPR.boardSlots.map(function (s, i) {
      var d = el('div', 'gk-slot ' + (i < 2 ? 'is-pass' : 'is-stop'));
      d.style.left = s.x + '%'; d.style.top = s.y + '%'; d.style.width = s.w + '%'; d.style.height = s.h + '%';
      board.appendChild(d); return d;
    });
    ui.morePanel = el('div', 'gk-more-panel'); ui.morePanel.hidden = true;
    ui.morePanel.appendChild(el('h3', 'gk-more-title', '더 본 기록'));
    ui.moreList = el('div', 'gk-more-list'); ui.morePanel.appendChild(ui.moreList);
    board.appendChild(ui.morePanel);
    gate.appendChild(board);
    ui.moreBtn = btn('gk-pill gk-more', '기록 더 보기', toggleMore);
    gate.appendChild(ui.moreBtn);
    ui.guestWrap = el('div', 'gk-guest'); gate.appendChild(ui.guestWrap);
    ui.ghost = img('ghost-think', 'gk-ghost', '문지기 유령'); gate.appendChild(ui.ghost);
    ui.bubble = el('p', 'gk-bubble'); ui.bubble.setAttribute('role', 'status'); ui.bubble.setAttribute('aria-live', 'polite');
    gate.appendChild(ui.bubble);
    ui.info = el('p', 'gk-info'); gate.appendChild(ui.info);
    ui.gateExit = btn('gk-pill gk-exit', '로비로', function () { toLobby(); });
    gate.appendChild(ui.gateExit);
    ui.passBtn = btn('gk-judge gk-judge-pass', '통과', function () { judge(true); });
    ui.stopBtn = btn('gk-judge gk-judge-stop', '잠깐!', function () { judge(false); });
    gate.appendChild(ui.passBtn); gate.appendChild(ui.stopBtn);
    ui.modal = el('div', 'gk-modal'); ui.modal.hidden = true;
    ui.modalCard = el('div', 'gk-card'); ui.modalCard.setAttribute('role', 'dialog'); ui.modalCard.setAttribute('aria-modal', 'true');
    ui.modal.appendChild(ui.modalCard);
    gate.appendChild(ui.modal);
    st.appendChild(gate);

    // 친구: 규칙 만들기 / 기기 건네기
    ui.builder = el('div', 'gk-scene gk-builder'); ui.builder.hidden = true;
    ui.builder.style.backgroundImage = 'url(' + SPR.base + 'checkpoint.webp)';
    st.appendChild(ui.builder);
    ui.handoff = el('div', 'gk-scene gk-handoff'); ui.handoff.hidden = true;
    st.appendChild(ui.handoff);

    // 그림 미리 불러오기
    ['ghost-idle', 'ghost-hello', 'ghost-think', 'ghost-pass', 'ghost-stop', 'ghost-cheer'].forEach(function (n) { var i = new Image(); i.src = SPR.base + n + '.webp'; });
  }

  // ---------- 로비 대화: 첫 대사 → 학년 → 놀이 고르기 ----------
  function buildDialog(parent) {
    var d = ui.dialog = el('div', 'gk-dialog'); d.hidden = true;
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'gkDlgName');
    d.appendChild(img('ghost-hello', 'gk-dialog-face'));
    var body = el('div', 'gk-dialog-body');
    var nm = el('p', 'gk-dialog-name', '문지기 유령'); nm.id = 'gkDlgName';
    body.appendChild(nm);
    body.appendChild(el('p', 'gk-dialog-text', GHOST_SAYS));
    var gr = el('div', 'gk-grades'); gr.setAttribute('role', 'radiogroup'); gr.setAttribute('aria-label', '난이도 학년');
    gr.appendChild(el('span', 'gk-grades-label', '난이도'));
    ui.gradeBtns = [];
    for (var g = 1; g <= 6; g++) {
      (function (g) {
        var b = btn('gk-grade', g + '학년', function () { setGrade(g); });
        b.setAttribute('role', 'radio'); ui.gradeBtns.push(b); gr.appendChild(b);
      })(g);
    }
    body.appendChild(gr);
    ui.gradeNote = el('p', 'gk-grade-note'); body.appendChild(ui.gradeNote);
    var acts = el('div', 'gk-dialog-acts');
    ui.soloBtn = btn('gk-choice', '혼자 추리하기', function () { startSolo(); });
    ui.friendBtn = btn('gk-choice', '친구랑 문지기', function () { startFriend(); });
    acts.appendChild(ui.soloBtn); acts.appendChild(ui.friendBtn);
    acts.appendChild(btn('gk-choice light', '나중에 할래', function () { closeDialog(); }));
    body.appendChild(acts);
    d.appendChild(body);
    parent.appendChild(d);
  }
  function setGrade(g) {
    S.grade = g;
    ui.gradeBtns.forEach(function (b, i) { b.setAttribute('aria-checked', String(i + 1 === g)); b.classList.toggle('on', i + 1 === g); });
    var park = (api().profile().grade) || null;
    ui.gradeNote.textContent = (park ? '공원 학년은 ' + park + '학년이에요. ' : '') + (park && park !== g ? '바꾼 학년은 이번 놀이에만 써요.' : '다른 학년 난이도도 골라 볼 수 있어요.');
  }
  function openDialog() {
    if (S.dialog) return;
    S.dialog = true; S.keys = {}; S.dest = null; S.me.moving = false;
    ui.dialog.hidden = false; ui.talk.hidden = true; ui.leave.hidden = true;
    setGrade(S.grade);
    ui.soloBtn.focus();
  }
  function closeDialog() {
    S.dialog = false; ui.dialog.hidden = true; S.keys = {};
  }

  // ---------- 열기·닫기 ----------
  function open() {
    if (!ui.root) return;
    var prof = api().profile();
    S.grade = prof.grade || 1;   // 공원에서 고른 학년이 기본. 여기서 바꾼 학년은 이번 놀이에만
    S.open = true;
    ui.root.hidden = false;
    document.body.classList.add('gate-open');
    showScene('lobby');
    S.me = { x: 870, y: 880, dir: 'up', moving: false };
    S.dest = null; S.keys = {}; S.dialog = false; ui.dialog.hidden = true;
    S.last = performance.now();
    cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(loop);
    ui.canvas.focus && ui.canvas.focus();
  }
  function close() {
    S.open = false; cancelAnimationFrame(S.raf); clearTimeout(S.timer);
    ui.root.hidden = true;
    document.body.classList.remove('gate-open');
    if (api().exitGate) api().exitGate();
  }
  function showScene(name) {
    S.scene = name;
    ui.lobby.hidden = name !== 'lobby';
    ui.gate.hidden = name !== 'gate';
    ui.builder.hidden = name !== 'builder';
    ui.handoff.hidden = name !== 'handoff';
  }
  function toLobby() {
    clearTimeout(S.timer); S.round = null; S.busy = false;
    showScene('lobby');
    // 유령 앞에 서서 바로 다시 말을 걸 수 있게
    S.me = { x: GHOST.x - 150, y: GHOST.y + 40, dir: 'right', moving: false };
    S.dest = null; S.keys = {};
    closeDialog();
    S.last = performance.now();
    cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(loop);
  }

  // ---------- 로비 걷기 ----------
  // 걸을 수 있는 바닥(그림 좌표 다각형)과 막힌 가구(발 기준 타원)
  var FLOOR = [[30, 640], [115, 520], [330, 470], [470, 432], [1560, 432], [1640, 520], [1652, 860], [1060, 872], [1050, 936],
    [690, 936], [680, 872], [24, 860]];
  var BLOCKS = [{ x: 240, y: 440, rx: 135, ry: 42 }, { x: 615, y: 425, rx: 95, ry: 22 }, { x: 1640, y: 470, rx: 70, ry: 60 }];
  var GHOST = { x: 1180, y: 560, h: 235 };
  var EXIT_Y = 912;
  function inPoly(x, y, p) {
    var c = false;
    for (var i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    }
    return c;
  }
  function walkable(x, y) {
    if (!inPoly(x, y, FLOOR)) return false;
    for (var i = 0; i < BLOCKS.length; i++) { var b = BLOCKS[i], dx = (x - b.x) / b.rx, dy = (y - b.y) / b.ry; if (dx * dx + dy * dy < 1) return false; }
    var gx = (x - GHOST.x) / 70, gy = (y - GHOST.y) / 26;   // 유령 발밑
    return gx * gx + gy * gy >= 1;
  }
  function charH(y) { return 168 + (y - 432) * 0.2; }   // 안쪽(위)일수록 작게
  var KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  function step(dt) {
    if (S.dialog || S.scene !== 'lobby') { S.me.moving = false; return; }
    var dx = 0, dy = 0, sp = 330 * dt, me = S.me;
    if (S.keys.left) dx -= 1; if (S.keys.right) dx += 1; if (S.keys.up) dy -= 1; if (S.keys.down) dy += 1;
    if (dx || dy) S.dest = null;
    else if (S.dest) {
      var tx = S.dest.x - me.x, ty = S.dest.y - me.y, d = Math.hypot(tx, ty);
      if (d < 6) S.dest = null; else { dx = tx / d; dy = ty / d; }
    }
    var moved = false;
    if (dx || dy) {
      var n = Math.hypot(dx, dy); dx /= n; dy /= n;
      if (walkable(me.x + dx * sp, me.y + dy * sp)) { me.x += dx * sp; me.y += dy * sp; moved = true; }
      else if (dx && walkable(me.x + Math.sign(dx) * sp, me.y)) { me.x += Math.sign(dx) * sp; moved = true; }
      else if (dy && walkable(me.x, me.y + Math.sign(dy) * sp)) { me.y += Math.sign(dy) * sp; moved = true; }
      else S.dest = null;
      me.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    }
    me.moving = moved;
    S.nearGhost = Math.hypot(me.x - GHOST.x, (me.y - GHOST.y) * 1.4) < 250;
    S.nearExit = !S.nearGhost && me.y > EXIT_Y;
    ui.talk.hidden = !S.nearGhost;
    ui.leave.hidden = !S.nearExit;
    if (S.nearGhost) { ui.talk.style.left = pct(GHOST.x, IW); ui.talk.style.top = pct(GHOST.y - GHOST.h - 70, IH); }
    if (S.nearExit) { ui.leave.style.left = pct(me.x, IW); ui.leave.style.top = pct(me.y - charH(me.y) - 70, IH); }
  }
  var ghostImgs = {};
  function ghostImg(n) {
    if (!ghostImgs[n]) { ghostImgs[n] = new Image(); ghostImgs[n].src = SPR.base + 'ghost-' + n + '.webp'; }
    return ghostImgs[n];
  }
  function drawLobby(t) {
    var c = ui.canvas.getContext('2d');
    c.clearRect(0, 0, IW, IH);
    var pose = S.nearGhost || S.dialog ? 'hello' : 'idle', gi = ghostImg(pose), gm = SPR.ghost[pose];
    var items = [
      { y: GHOST.y, draw: function () {
        var bob = Math.sin(t * 2.2) * 8, w = GHOST.h * gm.w / gm.h;
        c.save(); c.fillStyle = 'rgba(20,0,40,0.28)';
        c.beginPath(); c.ellipse(GHOST.x, GHOST.y, 70 - bob, 16, 0, 0, Math.PI * 2); c.fill(); c.restore();
        if (gi.complete && gi.naturalWidth) c.drawImage(gi, GHOST.x - w / 2, GHOST.y - GHOST.h - 26 + bob, w, GHOST.h);
      } },
      { y: S.me.y, draw: function () { drawMe(c, t); } }
    ];
    items.sort(function (a, b) { return a.y - b.y; }).forEach(function (i) { i.draw(); });
    if (DEBUG) {
      c.strokeStyle = 'lime'; c.lineWidth = 3; c.beginPath();
      FLOOR.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); c.stroke();
      c.strokeStyle = 'red'; BLOCKS.forEach(function (b) { c.beginPath(); c.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, Math.PI * 2); c.stroke(); });
    }
  }
  var DEBUG = /[?&]debug=1/.test(location.search);
  function drawMe(c, t) {
    var me = S.me, h = charH(me.y), sid = api().character ? api().character().sid : 'F1';
    c.save(); c.fillStyle = 'rgba(20,0,40,0.3)';
    c.beginPath(); c.ellipse(me.x, me.y - 2, h * 0.24, h * 0.07, 0, 0, Math.PI * 2); c.fill(); c.restore();
    if (!window.MPChars) return;
    var opt;
    if (me.moving) {
      var f = Math.floor(t * 7) % 4, side = me.dir === 'left' || me.dir === 'right';
      opt = f % 2 === 0 ? { walk: true, mirror: f === 2 && !side } : { bob: h * 0.02 };
    } else opt = { sy: 1 + Math.sin(t * 2.4) * 0.01 };
    if (!MPChars.drawSprite(c, sid, me.x, me.y, me.dir, h, opt)) MPChars.drawSprite(c, sid, me.x, me.y, me.dir, h, { bob: opt.bob });
  }
  function loop(now) {
    if (!S.open) return;
    var dt = Math.min(0.05, (now - S.last) / 1000); S.last = now;
    if (S.scene === 'lobby') { step(dt); drawLobby(now / 1000); }
    S.raf = requestAnimationFrame(loop);
  }
  function lobbyPoint(e) {
    var r = ui.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * IW, y: (e.clientY - r.top) / r.height * IH };
  }

  // ---------- 검문대 ----------
  function startSolo() {
    closeDialog();
    S.mode = 'solo';
    var band = BAND_OF(S.grade);
    if (!gateSave().practiced) startRound({ practice: true });
    else startRound({ band: band });
  }
  function startRound(opt) {
    var P = G.PRACTICE, R;
    if (opt.practice) R = G.newRound({ band: 'low', rule: P.rule, practice: true, records: P.records, script: P.guests, guests: P.guests.length });
    else R = G.newRound({ band: opt.band, rule: opt.rule });
    S.round = R; S.score = 0; S.rewarded = false; S.busy = false; S.guest = null;
    R.looks = recordLooks(4);
    showScene('gate');
    renderBoard();
    renderMore();
    ui.morePanel.hidden = true; updateMoreBtn();
    ui.guestWrap.textContent = '';
    setGhost('think');
    say(R.practice ? '연습 문제야! 손님 기록을 먼저 살펴봐.' : '자, 오늘의 비밀 규칙이야. 기록을 잘 봐!');
    setJudgeEnabled(false);
    updateInfo();
    var lines = [FIRST_GUIDE];
    if (!R.practice) lines.push('이번엔 배지가 없는 손님과 빈손인 손님도 와요.');
    var title = R.practice ? '연습 문제' : (S.mode === 'friend' ? '친구가 만든 비밀 규칙' : '본 게임') + ' · ' + BAND_LABEL[R.band];
    showModal(title, lines, [{ text: '시작하기', main: true, fn: function () { hideModal(); nextGuest(); } }]);
  }
  function renderBoard() {
    var R = S.round;
    // 위: 통과 2장, 아래: 잠깐 2장
    var order = R.records.filter(function (k) { return k.pass; }).concat(R.records.filter(function (k) { return !k.pass; }));
    ui.slots.forEach(function (slot, i) {
      slot.textContent = '';
      var k = order[i]; if (!k) return;
      k.look = k.look || R.looks[i];
      k.el = slot;
      slot.appendChild(figure('bust', k.look, k));
      slot.setAttribute('aria-label', (k.pass ? '통과한 손님: ' : '멈춘 손님: ') + G.comboText(k));
    });
  }
  // 더 본 기록: 게임이 꺼낸 기록 + 판정을 끝낸 손님
  function renderMore() {
    var R = S.round; ui.moreList.textContent = '';
    var list = R.known.filter(function (k) { return R.records.indexOf(k) < 0; });
    if (!list.length) { ui.moreList.appendChild(el('p', 'gk-more-empty', '판정한 손님과 새로 꺼낸 기록이 여기에 쌓여요.')); return; }
    list.forEach(function (k) {
      var c = el('div', 'gk-mcard ' + (k.pass ? 'is-pass' : 'is-stop') + (k.extra ? ' is-extra' : ''));
      var fig = el('div', 'gk-mcard-fig'); fig.appendChild(figure('bust', k.look || guestLook([]), k)); c.appendChild(fig);
      c.appendChild(el('span', 'gk-tag ' + (k.pass ? 'pass' : 'stop'), (k.pass ? '통과' : '잠깐!') + (k.extra ? ' · 새 기록' : '')));
      c.setAttribute('aria-label', (k.pass ? '통과: ' : '잠깐: ') + G.comboText(k));
      k.el = c; ui.moreList.appendChild(c);
    });
  }
  function updateMoreBtn() {
    var R = S.round, n = R ? R.known.length - R.records.length : 0;
    ui.moreBtn.textContent = ui.morePanel.hidden ? '기록 더 보기' + (n ? ' (' + n + ')' : '') : '처음 기록 보기';
    ui.moreBtn.setAttribute('aria-expanded', String(!ui.morePanel.hidden));
  }
  function toggleMore(force) {
    ui.morePanel.hidden = typeof force === 'boolean' ? !force : !ui.morePanel.hidden;
    updateMoreBtn();
  }
  function updateInfo() {
    var R = S.round;
    var head = R.practice ? '연습' : S.mode === 'friend' ? '친구 규칙' : BAND_LABEL[R.band];
    ui.info.textContent = head + ' · 손님 ' + Math.min(R.count, R.total) + ' / ' + R.total;
  }
  function setGhost(pose) { ui.ghost.src = SPR.base + 'ghost-' + pose + '.webp'; ui.ghost.dataset.pose = pose; }
  function say(text) { ui.bubble.textContent = text; ui.bubble.classList.remove('pop'); void ui.bubble.offsetWidth; ui.bubble.classList.add('pop'); }
  function setJudgeEnabled(on) { ui.passBtn.disabled = !on; ui.stopBtn.disabled = !on; }
  function clearMarks() {
    document.querySelectorAll('.gk-gate .is-hint').forEach(function (e) { e.classList.remove('is-hint'); });
  }

  function nextGuest() {
    var R = S.round;
    clearMarks();
    var g = R.next();
    updateInfo();
    if (!g) return finishRound();
    S.guest = g; S.firstTry = true;
    var prev = S.prevLook ? [S.prevLook] : [];
    g.look = R.count === 1 ? guestLook(R.looks) : guestLook(prev);   // 첫 손님은 기록 속 아이들과 다른 모습
    S.prevLook = g.look;
    if (g.extra.length) {
      g.extra.forEach(function (k) { k.look = guestLook([]); });
      renderMore(); toggleMore(true);
      g.extra.forEach(function (k) { k.el && k.el.classList.add('is-hint'); });
      say('기록만으로는 아직 헷갈릴 수 있어. 기록을 한 장 더 꺼냈어!');
    } else {
      say(R.count === 1 ? FIRST_GUIDE : '이 손님은 지나갈 수 있을까?');
    }
    setGhost('think');
    ui.guestWrap.textContent = '';
    var fig = figure('full', g.look, g);
    ui.guestWrap.appendChild(fig);
    ui.guestWrap.className = 'gk-guest enter';
    void ui.guestWrap.offsetWidth;
    ui.guestWrap.className = 'gk-guest';
    S.busy = false;
    setJudgeEnabled(true);
  }
  function judge(answer) {
    if (S.busy || !S.guest || !S.round) return;
    var R = S.round, g = S.guest, res = R.judge(g, answer);
    clearMarks();
    if (!res.correct) {
      S.firstTry = false;
      setGhost('think');
      say('음… 다시 생각해 봐! ' + res.hint.text);
      var extraShown = false;
      res.hint.show.forEach(function (k) {
        if (R.records.indexOf(k) < 0) extraShown = true;
      });
      if (extraShown) { renderMore(); toggleMore(true); } else if (res.hint.show.length) toggleMore(false);
      res.hint.show.forEach(function (k) { if (k.el) k.el.classList.add('is-hint'); });
      var b = answer ? ui.passBtn : ui.stopBtn;
      b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
      return;
    }
    if (S.firstTry) S.score++;
    S.busy = true; setJudgeEnabled(false);
    // 판정한 손님은 기록에 남음(모습도 그대로)
    R.judged[R.judged.length - 1].look = g.look;
    setGhost(g.pass ? 'pass' : 'stop');
    say(g.pass ? '맞아! 이 손님은 통과!' : '맞아! 이 손님은 잠깐!');
    S.timer = setTimeout(function () {
      ui.guestWrap.className = 'gk-guest ' + (g.pass ? 'leave-pass' : 'leave-stop');
      S.timer = setTimeout(function () {
        renderMore(); updateMoreBtn();
        nextGuest();
      }, 650);
    }, 1100);
  }
  function finishRound() {
    var R = S.round;
    S.guest = null; setJudgeEnabled(false); setGhost('cheer');
    ui.guestWrap.textContent = '';
    say('오늘 손님은 여기까지! 비밀 규칙을 알려 줄게.');
    var lines = [], btns = [], gain = 0, newClear = false, saved = true;
    if (R.practice) {
      saved = patchGate(function (g) { g.practiced = true; });
      lines.push('처음에 맞힌 손님 ' + S.score + ' / ' + R.total);
      btns.push({ text: '본 게임 시작', main: true, fn: function () { hideModal(); startRound({ band: BAND_OF(S.grade) }); } });
    } else if (!S.rewarded) {
      S.rewarded = true;   // 보상은 판마다 한 번만
      gain = TICKETS[S.mode];
      saved = patchGate(function (g) {
        g.rounds = (g.rounds || 0) + 1;
        if (S.mode === 'solo' && !g.cleared) { g.cleared = true; newClear = true; }
        g.best = g.best || {};
        if (S.mode === 'solo') g.best[R.band] = Math.max(g.best[R.band] || 0, S.score);
        return { tickets: (save().tickets || 0) + gain };
      });
      lines.push('처음에 맞힌 손님 ' + S.score + ' / ' + R.total + ' · 티켓 ' + gain + '장을 받았어요!');
      if (newClear) lines.push('★ 꼬마 유령 캐릭터를 받았어요! 공원 위쪽 ‘캐릭터’에서 골라 봐요.');
    }
    if (!saved) lines.push('이 기기에는 저장되지 않았어요. 기록은 이번에만 남아요.');
    if (S.mode === 'friend') {
      var maker = S.friend.maker;
      btns.push({ text: '역할 바꾸기', main: true, fn: function () { hideModal(); S.friend.maker = maker === 1 ? 2 : 1; S.friend.parts = defaultParts(); openBuilder(); } });
      btns.push({ text: '로비로', fn: function () { hideModal(); toLobby(); } });
    } else if (!R.practice) {
      btns.push({ text: '한 판 더', main: true, fn: function () { hideModal(); startRound({ band: BAND_OF(S.grade) }); } });
      btns.push({ text: '로비로', fn: function () { hideModal(); toLobby(); } });
      btns.push({ text: '공원으로', fn: function () { hideModal(); close(); } });
    } else {
      btns.push({ text: '로비로', fn: function () { hideModal(); toLobby(); } });
    }
    var who = R.practice ? '연습 끝! 비밀 규칙' : S.mode === 'friend' ? (S.friend.maker === 1 ? '친구 1이' : '친구 2가') + ' 만든 비밀 규칙' : '비밀 규칙';
    showModal(who, lines, btns, R.text);
  }

  function showModal(title, lines, btns, ruleText) {
    var c = ui.modalCard; c.textContent = '';
    var h = el('h2', 'gk-card-title', title); h.id = 'gkModalTitle'; c.setAttribute('aria-labelledby', 'gkModalTitle');
    c.appendChild(h);
    if (ruleText) c.appendChild(el('p', 'gk-card-rule', ruleText));
    lines.forEach(function (l) { c.appendChild(el('p', 'gk-card-line', l)); });
    var row = el('div', 'gk-card-btns');
    var first = null;
    btns.forEach(function (b) { var x = btn('gk-choice' + (b.main ? '' : ' light'), b.text, b.fn); row.appendChild(x); if (!first) first = x; });
    c.appendChild(row);
    ui.modal.hidden = false;
    if (first) setTimeout(function () { first.focus(); }, 30);
  }
  function hideModal() { ui.modal.hidden = true; }

  // ---------- 친구랑 문지기 ----------
  function defaultParts() { return { link: 'and', badge: 'moon', item: 'key', item2: 'lantern' }; }
  function startFriend() {
    closeDialog();
    S.mode = 'friend'; S.friend.maker = 1; S.friend.parts = defaultParts();
    openBuilder();
  }
  var CARD_ITEMS = { badge: ['star', 'moon', 'none'], item: ['key', 'lantern', 'empty'] };
  function cardPic(v) {
    var w = el('span', 'gk-cardpic');
    if (v === 'none' || v === 'empty') w.appendChild(el('span', 'gk-cardpic-x', '✕'));
    else w.appendChild(img(SPR.items[v].src, '', ''));
    return w;
  }
  function openBuilder() {
    var band = BAND_OF(S.grade), links = G.LINKS[band], P = S.friend.parts;
    if (links.indexOf(P.link) < 0) P.link = 'and';
    showScene('builder');
    var root = ui.builder; root.textContent = '';
    var panel = el('div', 'gk-build'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'gkBuildTitle');
    var h = el('h2', 'gk-build-title', '규칙 만드는 사람: 친구 ' + S.friend.maker); h.id = 'gkBuildTitle';
    panel.appendChild(h);
    panel.appendChild(el('p', 'gk-build-sub', '카드를 골라 비밀 규칙을 만들어 봐. 문지기 친구에게는 보여 주지 마! (' + BAND_LABEL[band] + ')'));
    // 연결 방식
    var lrow = el('div', 'gk-build-row'); lrow.appendChild(el('span', 'gk-build-label', '연결'));
    links.forEach(function (l) {
      var b = btn('gk-chip' + (P.link === l ? ' on' : ''), G.LINK_LABEL[l], function () { P.link = l; openBuilder(); });
      b.setAttribute('aria-pressed', String(P.link === l)); lrow.appendChild(b);
    });
    panel.appendChild(lrow);
    // 카드 칸: [배지] [연결] [소품] (+ 아니면 [소품])
    var slots = el('div', 'gk-build-slots');
    function slot(kind, key, label) {
      var g = el('div', 'gk-build-slot'); g.appendChild(el('span', 'gk-build-label', label));
      var row = el('div', 'gk-cards'); row.setAttribute('role', 'radiogroup'); row.setAttribute('aria-label', label);
      CARD_ITEMS[kind].forEach(function (v) {
        var b = btn('gk-card-pick' + (P[key] === v ? ' on' : ''), '', function () { P[key] = v; openBuilder(); });
        b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(P[key] === v));
        b.appendChild(cardPic(v)); b.appendChild(el('span', 'gk-card-name', NAMES[v]));
        row.appendChild(b);
      });
      g.appendChild(row); return g;
    }
    var mid = { and: '그리고', or: '또는', xor: '둘 중 하나만', exc: '하지만', cond: '이면' }[P.link];
    slots.appendChild(slot('badge', 'badge', P.link === 'cond' ? '이 배지를 단 손님은' : '배지 카드'));
    slots.appendChild(el('span', 'gk-build-link', mid));
    slots.appendChild(slot('item', 'item', P.link === 'cond' ? '이 소품을 들어야 하고' : '소품 카드'));
    if (P.link === 'cond') {
      slots.appendChild(el('span', 'gk-build-link', '아니면'));
      slots.appendChild(slot('item', 'item2', '나머지 손님은 이 소품'));
    }
    panel.appendChild(slots);
    var rule = G.buildRule(P), chk = G.checkRule(rule);
    var read = el('p', 'gk-build-read'); read.setAttribute('aria-live', 'polite');
    read.textContent = '“' + G.describe(rule) + '”';
    panel.appendChild(read);
    var msg = el('p', 'gk-build-msg', chk.ok ? '' : chk.msg); panel.appendChild(msg);
    var acts = el('div', 'gk-card-btns');
    var seal = btn('gk-choice', '규칙 봉인하기', function () { if (chk.ok) sealRule(rule); });
    seal.disabled = !chk.ok;
    acts.appendChild(seal);
    acts.appendChild(btn('gk-choice light', '로비로', function () { toLobby(); }));
    panel.appendChild(acts);
    root.appendChild(panel);
    setTimeout(function () { var f = root.querySelector('.gk-chip.on'); if (f && document.activeElement === document.body) f.focus(); }, 0);
  }
  function sealRule(rule) {
    // 편집 내용을 완전히 지우고(화면에서 사라짐) 기기 건네기 화면으로
    ui.builder.textContent = '';
    S.friend.rule = rule;
    showScene('handoff');
    var h = ui.handoff; h.textContent = '';
    var box = el('div', 'gk-handoff-box');
    box.appendChild(img('ghost-hello', 'gk-handoff-ghost'));
    box.appendChild(el('p', 'gk-handoff-seal', '🔒 비밀 규칙을 봉인했어!'));
    box.appendChild(el('p', 'gk-handoff-text', '이제 문지기 친구에게 기기를 건네줘!'));
    box.appendChild(el('p', 'gk-handoff-sub', '친구 ' + (S.friend.maker === 1 ? 2 : 1) + '(문지기)가 받으면 아래 버튼을 눌러요.'));
    var ready = btn('gk-choice', '준비됐어', function () {
      showScene('gate');
      startRound({ band: BAND_OF(S.grade), rule: S.friend.rule });
    });
    box.appendChild(ready);
    h.appendChild(box);
    setTimeout(function () { ready.focus(); }, 30);
  }

  // ---------- 입력 ----------
  function onKey(e, down) {
    if (!S.open) return;
    if (S.scene === 'lobby' && !S.dialog) {
      if (KEYMAP[e.code]) { e.preventDefault(); S.keys[KEYMAP[e.code]] = down; return; }
      if (down && e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (S.nearGhost) openDialog(); else if (S.nearExit) close();
      }
      if (down && e.code === 'Escape') { e.preventDefault(); close(); }
      return;
    }
    if (!down) return;
    if (S.dialog && e.code === 'Escape') { e.preventDefault(); closeDialog(); return; }
    if (S.scene === 'gate' && e.code === 'Escape' && !ui.morePanel.hidden) { e.preventDefault(); toggleMore(false); }
  }

  function init() {
    if (!G || !SPR || !document.getElementById('gatekeeper')) return;
    build();
    window.addEventListener('keydown', function (e) { onKey(e, true); });
    window.addEventListener('keyup', function (e) { onKey(e, false); });
    window.addEventListener('blur', function () { S.keys = {}; });
    ui.canvas.addEventListener('pointerdown', function (e) {
      if (S.dialog) return;
      var p = lobbyPoint(e);
      // 유령을 누르면 그 앞으로 걸어감
      if (Math.abs(p.x - GHOST.x) < 110 && p.y > GHOST.y - GHOST.h - 30 && p.y < GHOST.y + 20) p = { x: GHOST.x - 140, y: GHOST.y + 30 };
      if (!walkable(p.x, p.y)) {
        // 가장 가까운 바닥 칸으로
        var best = null;
        for (var r = 10; r < 240 && !best; r += 10) for (var a = 0; a < 360; a += 20) {
          var x = p.x + Math.cos(a * Math.PI / 180) * r, y = p.y + Math.sin(a * Math.PI / 180) * r;
          if (walkable(x, y)) { best = { x: x, y: y }; break; }
        }
        if (!best) return; p = best;
      }
      S.dest = p;
    });
  }
  window.MPGate = { open: open, close: close, _state: S, _ui: ui, _walkable: walkable };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
