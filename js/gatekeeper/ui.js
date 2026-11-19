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
  var TICKETS = { solo: 3, friend: 3 };   // 판(라운드)마다 한 번. 혼자 놀기는 규칙 맞히기 별마다 1장 더
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
    board.appendChild(img(SPR.board.src, 'gk-board-img', '손님 기록판: 왼쪽 두 칸은 통과, 오른쪽 두 칸은 잠깐'));
    ui.slots = SPR.boardSlots.map(function (s, i) {
      var d = el('div', 'gk-slot ' + (i < 2 ? 'is-pass' : 'is-stop'));
      d.style.left = s.x + '%'; d.style.top = s.y + '%'; d.style.width = s.w + '%'; d.style.height = s.h + '%';
      board.appendChild(d); return d;
    });
    gate.appendChild(board);
    // 기록판 아래 가로 줄: 판정한 손님이 하나씩 쌓임
    ui.log = el('div', 'gk-log');
    ui.log.appendChild(el('p', 'gk-log-title', '판정한 손님'));
    ui.logList = el('div', 'gk-log-list'); ui.log.appendChild(ui.logList);
    ui.logEmpty = el('p', 'gk-log-empty', '판정한 손님이 여기에 하나씩 쌓여요');
    ui.log.appendChild(ui.logEmpty);
    gate.appendChild(ui.log);
    ui.guestWrap = el('div', 'gk-guest'); gate.appendChild(ui.guestWrap);
    ui.guestSay = el('p', 'gk-guest-say'); ui.guestSay.hidden = true; gate.appendChild(ui.guestSay);
    ui.ghost = img('ghost-think', 'gk-ghost', '문지기 유령'); gate.appendChild(ui.ghost);
    ui.bubble = el('p', 'gk-bubble'); ui.bubble.setAttribute('role', 'status'); ui.bubble.setAttribute('aria-live', 'polite');
    gate.appendChild(ui.bubble);
    ui.info = el('p', 'gk-info'); gate.appendChild(ui.info);
    ui.gateExit = btn('gk-pill gk-exit', '로비로', function () { toLobby(); });
    gate.appendChild(ui.gateExit);
    ui.helpBtn = btn('gk-pill gk-help', '? 어떻게 해요', openHelp);
    gate.appendChild(ui.helpBtn);
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
    S.me = { x: 836, y: 900, dir: 'up', moving: false };
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
    clearTimeout(S.timer); S.round = null; S.busy = false; if (ui.modal) ui.modal.hidden = true;
    showScene('lobby');
    // 유령 앞에 서서 바로 다시 말을 걸 수 있게
    S.me = { x: GHOST.x - 130, y: GHOST.y + 40, dir: 'right', moving: false };
    S.dest = null; S.keys = {};
    closeDialog();
    S.last = performance.now();
    cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(loop);
  }

  // ---------- 로비 걷기 ----------
  // 걸을 수 있는 바닥(그림 좌표 다각형)과 막힌 가구(발 기준 타원)
  var FLOOR = [[60, 600], [120, 520], [180, 470], [430, 450], [470, 432], [1580, 432], [1640, 470], [1660, 560],
    [1660, 930], [1075, 930], [1070, 815], [962, 815], [958, 941], [712, 941], [708, 815], [600, 815], [595, 930], [10, 930], [10, 640]];
  // 의자·스탠드 탁자·괘종시계 받침
  var BLOCKS = [{ x: 275, y: 448, rx: 95, ry: 30 }, { x: 382, y: 440, rx: 45, ry: 20 }, { x: 565, y: 422, rx: 70, ry: 18 }];
  var GHOST = { x: 1095, y: 520, h: 165 };
  var EXIT_Y = 840;   // 아래 카펫(입구) 쪽
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
    var gx = (x - GHOST.x) / 55, gy = (y - GHOST.y) / 22;   // 유령 발밑
    return gx * gx + gy * gy >= 1;
  }
  // 캐릭터 몸 키: 공원에서 돌아다닐 때 화면에 보이는 크기와 똑같이(그림 좌표로 바꿔서)
  function charH() {
    var r = ui.canvas.getBoundingClientRect(), px = api().charScreenH ? api().charScreenH() : 94;
    return r.height ? px * IH / r.height : 125;
  }
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
    S.nearGhost = Math.hypot(me.x - GHOST.x, (me.y - GHOST.y) * 1.4) < 210;
    S.nearExit = !S.nearGhost && me.y > EXIT_Y;
    ui.talk.hidden = !S.nearGhost;
    ui.leave.hidden = !S.nearExit;
    if (S.nearGhost) { ui.talk.style.left = pct(GHOST.x, IW); ui.talk.style.top = pct(GHOST.y - GHOST.h - 80, IH); }
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
        c.beginPath(); c.ellipse(GHOST.x, GHOST.y, 50 - bob * 0.6, 12, 0, 0, Math.PI * 2); c.fill(); c.restore();
        if (gi.complete && gi.naturalWidth) c.drawImage(gi, GHOST.x - w / 2, GHOST.y - GHOST.h - 18 + bob * 0.7, w, GHOST.h);
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

  // ---------- 검문대: 한 판 = 3단계 ----------
  var STAGES = 3, GUESTS = 3, FRIEND_GUESTS = 4;
  function startSolo() {
    closeDialog();
    S.mode = 'solo';
    S.run = { band: BAND_OF(S.grade), stage: 0, used: [], stars: 0, first: 0, guests: 0, rewarded: false };
    var first = !gateSave().howto;   // 처음 한 번은 '어떻게 놀아요?'를 먼저
    if (first) patchGate(function (g) { g.howto = true; });
    nextStage(first);
  }
  function nextStage(withHowTo) {
    var run = S.run; run.stage++;
    var plan = G.stagePlan(run.band, run.stage, null, run.used);
    run.used.push(plan.rule);
    beginStage(G.newRound({ rule: plan.rule, domain: plan.domain, shapes: plan.shapes, guests: GUESTS }), plan.tip, withHowTo);
  }
  // 그 단계에 나오는 모습 안내(배지 없음·빈손)
  function domainNote(R) {
    var d = G.DOMAINS[R.domain], n = [];
    if (d.badges.indexOf('none') >= 0) n.push('배지가 없는 손님');
    if (d.items.indexOf('empty') >= 0) n.push('빈손인 손님');
    return n.length ? n.join('과 ') + '도 와요.' : '';
  }
  function beginStage(R, tip, withHowTo) {
    S.round = R; S.busy = false; S.guest = null; S.streak = 0; S.quizDone = false;
    R.looks = recordLooks(4);
    showScene('gate');
    renderBoard(); renderLog();
    ui.guestWrap.textContent = ''; ui.guestSay.hidden = true;
    setGhost('think');
    say(tip);
    setJudgeEnabled(false);
    updateInfo();
    var lines = [tip];
    if (S.mode === 'friend' && domainNote(R)) lines.push(domainNote(R));
    lines.push(FIRST_GUIDE);
    var title = S.mode === 'friend' ? '친구가 만든 비밀 규칙' : S.run.stage + '단계';
    showModal(title, lines, [{ text: '시작!', main: true, fn: function () { hideModal(); nextGuest(); } }], null,
      withHowTo ? howTo() : S.mode === 'solo' ? stamps() : null);
  }
  // 단계 도장 ★★3
  function stamps() {
    var w = el('div', 'gk-stamps');
    for (var i = 1; i <= STAGES; i++) {
      w.appendChild(el('span', 'gk-stamp' + (i < S.run.stage ? ' done' : i === S.run.stage ? ' now' : ''), i < S.run.stage ? '★' : String(i)));
    }
    return w;
  }
  function renderBoard() {
    var R = S.round;
    // 왼쪽: 통과 2장, 오른쪽: 잠깐 2장
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
  // 기록판 아래 가로 줄: 판정한 손님(과 새로 꺼낸 기록)이 하나씩 쌓임
  function renderLog(fresh) {
    var R = S.round; ui.logList.textContent = '';
    var list = R.known.filter(function (k) { return R.records.indexOf(k) < 0; });
    ui.logEmpty.hidden = list.length > 0;
    list.forEach(function (k) {
      var c = el('div', 'gk-lcard ' + (k.pass ? 'is-pass' : 'is-stop') + (fresh && fresh.indexOf(k) >= 0 ? ' pop' : ''));
      c.appendChild(figure('bust', k.look || guestLook([]), k));
      c.appendChild(el('span', 'gk-tag ' + (k.pass ? 'pass' : 'stop'), (k.pass ? '통과' : '잠깐!') + (k.extra ? ' · 새 기록' : '')));
      c.setAttribute('aria-label', (k.pass ? '통과: ' : '잠깐: ') + G.comboText(k));
      k.el = c; ui.logList.appendChild(c);
    });
    ui.logList.scrollLeft = ui.logList.scrollWidth;
  }
  function updateInfo() {
    var R = S.round, head = S.mode === 'friend' ? '친구 규칙' : S.run.stage + '단계 / ' + STAGES;
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
    if (!g) return finishStage();
    S.guest = g; S.firstTry = true;
    var prev = S.prevLook ? [S.prevLook] : [];
    g.look = R.count === 1 ? guestLook(R.looks) : guestLook(prev);   // 첫 손님은 기록 속 아이들과 다른 모습
    S.prevLook = g.look;
    if (g.extra.length) {
      g.extra.forEach(function (k) { k.look = guestLook([]); });
      renderLog(g.extra);
      g.extra.forEach(function (k) { if (k.el) k.el.classList.add('is-hint'); });
      say('헷갈리지 않게 기록을 한 장 더 꺼냈어! 아래 줄을 봐.');
    } else {
      say(R.count === 1 ? FIRST_GUIDE : '이 손님은 지나갈 수 있을까?');
    }
    setGhost('think');
    ui.guestSay.hidden = true;
    ui.guestWrap.textContent = '';
    ui.guestWrap.appendChild(figure('full', g.look, g));
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
      // 돋보기 힌트: 정답 대신 볼 곳 하나를 가리키고 그 카드들이 빛남
      S.firstTry = false; S.streak = 0;
      setGhost('think');
      say('음… 다시! ' + res.hint.text);
      res.hint.show.forEach(function (k) { if (k.el) k.el.classList.add('is-hint'); });
      var b = answer ? ui.passBtn : ui.stopBtn;
      b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
      return;
    }
    if (S.firstTry) { if (S.run) S.run.first++; S.streak++; }
    if (S.run) S.run.guests++;
    S.busy = true; setJudgeEnabled(false);
    R.judged[R.judged.length - 1].look = g.look;   // 판정한 손님은 아래 줄에 그 모습 그대로 남음
    var combo = S.streak > 0 && S.streak % 3 === 0;
    setGhost(combo ? 'cheer' : g.pass ? 'pass' : 'stop');
    say(combo ? S.streak + '명 연속 정답! 대단해!' : g.pass ? '맞아! 이 손님은 통과!' : '맞아! 이 손님은 잠깐!');
    if (combo) { ui.gate.classList.remove('combo'); void ui.gate.offsetWidth; ui.gate.classList.add('combo'); }
    ui.guestSay.textContent = g.pass ? '야호!' : '히잉…';
    ui.guestSay.className = 'gk-guest-say ' + (g.pass ? 'pass' : 'stop');
    ui.guestSay.hidden = false;
    S.timer = setTimeout(function () {
      ui.guestSay.hidden = true;
      ui.guestWrap.className = 'gk-guest ' + (g.pass ? 'leave-pass' : 'leave-stop');
      S.timer = setTimeout(function () {
        renderLog([R.judged[R.judged.length - 1]]);
        nextGuest();
      }, 650);
    }, 1100);
  }

  // ---------- 단계 끝: '내 규칙이 뭘까?' → 규칙 공개 ----------
  function finishStage() {
    var R = S.round;
    S.guest = null; setJudgeEnabled(false); setGhost('hello');
    ui.guestWrap.textContent = '';
    say('손님은 여기까지! 내 규칙이 뭔지 맞혀 볼래?');
    var box = el('div', 'gk-quiz');
    R.quiz().forEach(function (rule) {
      var b = btn('gk-quiz-opt', '', function () { answerQuiz(rule); });
      b.appendChild(formula(rule));
      b.appendChild(el('span', 'gk-quiz-text', G.describe(rule)));
      box.appendChild(b);
    });
    showModal('내 규칙이 뭘까? 기록을 보면서 골라 봐!', [], [], null, box, 'log');
  }
  function answerQuiz(rule) {
    if (S.quizDone) return;
    S.quizDone = true;
    var R = S.round, combos = G.domainCombos(R.domain);
    var right = G.maskOf(rule, combos) === G.maskOf(R.rule, combos);
    if (right && S.run) S.run.stars++;
    reveal(right);
  }
  function reveal(right) {
    var R = S.round;
    setGhost(right ? 'cheer' : 'pass');
    say(right ? '정답! 내 규칙을 찾았구나!' : '아쉬워! 내 규칙은 이거야.');
    spotlight(R.rule);
    var lines = [right ? (S.run ? '⭐ 정답! 보너스 별을 받았어요.' : '⭐ 정답!') : '기록에서 반짝이는 곳을 보면 규칙이 보여요.'];
    var btns = [];
    if (S.mode === 'solo' && S.run.stage < STAGES) btns.push({ text: '다음 단계', main: true, fn: function () { hideModal(); nextStage(false); } });
    else btns.push({ text: '결과 보기', main: true, fn: function () { hideModal(); finishRound(); } });
    var f = formula(R.rule); f.classList.add('big');
    var title = S.mode === 'friend' ? (S.friend.maker === 1 ? '친구 1이' : '친구 2가') + ' 만든 비밀 규칙' : '비밀 규칙!';
    showModal(title, lines, btns, R.text, f, 'log');
  }
  // 규칙에 쓰인 배지·소품을 기록 카드에서 반짝이게
  function spotlight(rule) {
    var atoms = G.atomsOf(rule);
    S.round.known.forEach(function (k) {
      if (!k.el) return;
      if (atoms.indexOf(k.badge) >= 0) { var b = k.el.querySelector('.gk-badge'); if (b) b.classList.add('gk-spot'); }
      if (atoms.indexOf(k.item) >= 0) { var it = k.el.querySelector('.gk-item'); if (it) it.classList.add('gk-spot'); }
    });
  }
  // 그림 공식: [⭐] → 통과 / [⭐] + [🔑] → 통과 / [⭐] 또는 [🔑] → 통과 / [🎃] → 잠깐!(나머지는 통과)
  function fchip(a) {
    var c = el('span', 'gk-fchip');
    if (a === 'none' || a === 'empty') c.appendChild(el('span', 'gk-fchip-x', '✕'));
    else c.appendChild(img(SPR.items[a].src, '', ''));
    c.appendChild(el('span', 'gk-fchip-name', NAMES[a]));
    return c;
  }
  function formula(rule) {
    var f = el('span', 'gk-formula'), at = G.atomsOf(rule);
    f.appendChild(fchip(at[0]));
    if (at[1]) { f.appendChild(el('span', 'gk-fop', rule.op === 'and' ? '+' : '또는')); f.appendChild(fchip(at[1])); }
    f.appendChild(el('span', 'gk-fop', '→'));
    f.appendChild(el('span', 'gk-fres ' + (rule.op === 'not' ? 'no' : 'ok'), rule.op === 'not' ? '잠깐!' : '통과'));
    if (rule.op === 'not') f.appendChild(el('span', 'gk-fnote', '나머지는 모두 통과'));
    return f;
  }

  // ---------- 판 끝: 도장·별·티켓(판마다 한 번) ----------
  function finishRound() {
    setGhost('cheer');
    say('오늘 문지기 일 끝! 고마워!');
    var lines = [], btns = [], gain = 0, newClear = false, saved = true, extra = null;
    if (S.mode === 'solo') {
      var run = S.run;
      extra = el('div', 'gk-stamps');
      for (var i = 0; i < STAGES; i++) extra.appendChild(el('span', 'gk-stamp done', '★'));
      if (!run.rewarded) {
        run.rewarded = true;   // 보상은 판마다 한 번만
        gain = TICKETS.solo + run.stars;
        saved = patchGate(function (g) {
          g.rounds = (g.rounds || 0) + 1;
          if (!g.cleared) { g.cleared = true; newClear = true; }
          g.best = g.best || {};
          g.best[run.band] = Math.max(g.best[run.band] || 0, run.first);
          return { tickets: (save().tickets || 0) + gain };
        });
      }
      lines.push('처음에 맞힌 손님 ' + run.first + ' / ' + run.guests + ' · 규칙 맞히기 별 ' + run.stars + ' / ' + STAGES);
      if (gain) lines.push('티켓 ' + gain + '장을 받았어요!');
      if (newClear) lines.push('★ 꼬마 유령 캐릭터를 받았어요! 공원 위쪽 ‘캐릭터’에서 골라 봐요.');
      btns.push({ text: '한 판 더', main: true, fn: function () { hideModal(); startSolo(); } });
      btns.push({ text: '로비로', fn: function () { hideModal(); toLobby(); } });
      btns.push({ text: '공원으로', fn: function () { hideModal(); close(); } });
    } else {
      if (!S.friendRewarded) {
        S.friendRewarded = true;   // 보상은 판마다 한 번만
        gain = TICKETS.friend;
        saved = patchGate(function (g) { g.rounds = (g.rounds || 0) + 1; return { tickets: (save().tickets || 0) + gain }; });
        lines.push('티켓 ' + gain + '장을 받았어요!');
      }
      var maker = S.friend.maker;
      btns.push({ text: '역할 바꾸기', main: true, fn: function () { hideModal(); S.friend.maker = maker === 1 ? 2 : 1; S.friend.parts = defaultParts(); openBuilder(); } });
      btns.push({ text: '로비로', fn: function () { hideModal(); toLobby(); } });
    }
    if (!saved) lines.push('이 기기에는 저장되지 않았어요. 기록은 이번에만 남아요.');
    showModal(S.mode === 'solo' ? '3단계 모두 통과!' : '친구랑 문지기 끝!', lines, btns, null, extra);
  }

  function showModal(title, lines, btns, ruleText, extra, variant) {
    var c = ui.modalCard; c.textContent = '';
    ui.modal.className = 'gk-modal' + (variant ? ' ' + variant : '');
    var h = el('h2', 'gk-card-title', title); h.id = 'gkModalTitle'; c.setAttribute('aria-labelledby', 'gkModalTitle');
    c.appendChild(h);
    var top = variant === 'side' || variant === 'log';
    if (extra && top) c.appendChild(extra);
    if (ruleText) c.appendChild(el('p', 'gk-card-rule', ruleText));
    if (extra && !top) c.appendChild(extra);
    lines.forEach(function (l) { c.appendChild(el('p', 'gk-card-line', l)); });
    var first = null;
    if (btns.length) {
      var row = el('div', 'gk-card-btns');
      btns.forEach(function (b) { var x = btn('gk-choice' + (b.main ? '' : ' light'), b.text, b.fn); row.appendChild(x); if (!first) first = x; });
      c.appendChild(row);
    }
    ui.modal.hidden = false;
    first = first || c.querySelector('button');
    if (first) setTimeout(function () { first.focus(); }, 30);
  }
  function hideModal() { ui.modal.hidden = true; }

  // ---------- 어떻게 놀아요? ----------
  function howTo() {
    var box = el('div', 'gk-howto');
    function row(num, title, node) {
      var r = el('div', 'gk-howto-row');
      r.appendChild(el('span', 'gk-howto-num', num));
      var t = el('div', 'gk-howto-text');
      t.appendChild(el('p', 'gk-howto-title', title));
      if (node) t.appendChild(node);
      r.appendChild(t); box.appendChild(r);
    }
    var pics = el('div', 'gk-howto-pics');
    pics.appendChild(el('span', 'gk-howto-group', '가슴 배지'));
    ['star', 'moon'].forEach(function (v) { pics.appendChild(fchip(v)); });
    pics.appendChild(el('span', 'gk-howto-group', '손에 든 것'));
    ['key', 'lantern'].forEach(function (v) { pics.appendChild(fchip(v)); });
    row('1', '배지와 손에 든 것만 봐요 (얼굴·머리핀·신발은 상관없어요)', pics);
    row('2', '‘통과’ 손님들끼리 똑같은 걸 찾아요', el('p', 'gk-howto-sub', '예) 통과한 손님이 모두 별 배지를 달았다면?'));
    var ex = el('div', 'gk-howto-ex'); ex.appendChild(formula({ op: 'is', a: 'star' }));
    row('3', '그게 비밀 규칙! 새 손님이 맞으면 ‘통과’, 아니면 ‘잠깐!’', ex);
    return box;
  }
  function openHelp() {
    if (!ui.modal.hidden || S.scene !== 'gate') return;
    showModal('어떻게 놀아요?', [], [{ text: '알겠어!', main: true, fn: hideModal }], null, howTo());
  }

  // ---------- 친구랑 문지기: 카드 1장 또는 2장 + 연결 ----------
  function defaultParts() { return { link: 'one', card: 'star', badge: 'star', item: 'key' }; }
  function startFriend() {
    closeDialog();
    S.mode = 'friend'; S.run = null; S.friend.maker = 1; S.friend.parts = defaultParts();
    openBuilder();
  }
  function cardPic(v) {
    var w = el('span', 'gk-cardpic');
    if (v === 'none' || v === 'empty') w.appendChild(el('span', 'gk-cardpic-x', '✕'));
    else w.appendChild(img(SPR.items[v].src, '', ''));
    return w;
  }
  function openBuilder() {
    var band = BAND_OF(S.grade), F = G.FRIEND[band], P = S.friend.parts, dom = G.DOMAINS[F.domain];
    if (F.links.indexOf(P.link) < 0) P.link = 'one';
    showScene('builder');
    var root = ui.builder; root.textContent = '';
    var panel = el('div', 'gk-build'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'gkBuildTitle');
    var h = el('h2', 'gk-build-title', '규칙 만드는 사람: 친구 ' + S.friend.maker); h.id = 'gkBuildTitle';
    panel.appendChild(h);
    panel.appendChild(el('p', 'gk-build-sub', '카드를 골라 비밀 규칙을 만들어 봐. 문지기 친구에게는 보여 주지 마! (' + BAND_LABEL[band] + ')'));
    if (F.links.length > 1) {
      var lrow = el('div', 'gk-build-row'); lrow.appendChild(el('span', 'gk-build-label', '규칙 모양'));
      F.links.forEach(function (l) {
        var b = btn('gk-chip' + (P.link === l ? ' on' : ''), G.LINK_LABEL[l], function () { P.link = l; openBuilder(); });
        b.setAttribute('aria-pressed', String(P.link === l)); lrow.appendChild(b);
      });
      panel.appendChild(lrow);
    }
    var slots = el('div', 'gk-build-slots');
    function slot(list, key, label) {
      var g = el('div', 'gk-build-slot'); g.appendChild(el('span', 'gk-build-label', label));
      var row = el('div', 'gk-cards'); row.setAttribute('role', 'radiogroup'); row.setAttribute('aria-label', label);
      list.forEach(function (v) {
        var b = btn('gk-card-pick' + (P[key] === v ? ' on' : ''), '', function () { P[key] = v; openBuilder(); });
        b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(P[key] === v));
        b.appendChild(cardPic(v)); b.appendChild(el('span', 'gk-card-name', NAMES[v]));
        row.appendChild(b);
      });
      g.appendChild(row); return g;
    }
    if (P.link === 'one' || P.link === 'not') {
      var all = dom.badges.concat(dom.items);
      if (all.indexOf(P.card) < 0) P.card = all[0];
      slots.appendChild(slot(all, 'card', P.link === 'not' ? '이 카드만 빼고 모두 통과' : '이 카드를 가진 손님이 통과'));
    } else {
      if (dom.badges.indexOf(P.badge) < 0) P.badge = dom.badges[0];
      if (dom.items.indexOf(P.item) < 0) P.item = dom.items[0];
      slots.appendChild(slot(dom.badges, 'badge', '배지 카드'));
      slots.appendChild(el('span', 'gk-build-link', P.link === 'and' ? '그리고' : '또는'));
      slots.appendChild(slot(dom.items, 'item', '소품 카드'));
    }
    panel.appendChild(slots);
    var rule = G.buildRule(P), chk = G.checkRule(rule, band);
    var prev = el('div', 'gk-build-preview'); prev.appendChild(formula(rule));
    panel.appendChild(prev);
    var read = el('p', 'gk-build-read'); read.setAttribute('aria-live', 'polite');
    read.textContent = '“' + G.describe(rule) + '”';
    panel.appendChild(read);
    panel.appendChild(el('p', 'gk-build-msg', chk.ok ? '' : chk.msg));
    var acts = el('div', 'gk-card-btns');
    var seal = btn('gk-choice', '규칙 봉인하기', function () { if (chk.ok) sealRule(rule); });
    seal.disabled = !chk.ok;
    acts.appendChild(seal);
    acts.appendChild(btn('gk-choice light', '로비로', function () { toLobby(); }));
    panel.appendChild(acts);
    root.appendChild(panel);
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
      var F = G.FRIEND[BAND_OF(S.grade)];
      S.friendRewarded = false;
      beginStage(G.newRound({ rule: S.friend.rule, domain: F.domain, shapes: F.shapes, guests: FRIEND_GUESTS }),
        '친구가 만든 규칙이야. 기록을 잘 봐!', false);
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
      if (Math.abs(p.x - GHOST.x) < 90 && p.y > GHOST.y - GHOST.h - 30 && p.y < GHOST.y + 20) p = { x: GHOST.x - 120, y: GHOST.y + 30 };
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
