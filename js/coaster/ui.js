/*
 * 코스터역 — 블록을 쌓아 선로 만들기
 * ------------------------------------------------------------
 * 장면 1 대기실(assets/coaster/lobby.webp, 1672×941): 공원 캐릭터로 걸어 다니다 거북이 역장에게 '말 걸기' → 학년 → 게임
 *        걷기·말 걸기·학년 고르기·나가기는 유령의 집(js/gatekeeper/ui.js)과 같은 방식
 * 장면 2 게임: 위 연두색 잔디 격자(거북이·선로·꽃·역), 아래 아이보리 조작대(블록 상자 | 내 코드 | ▶ 실행)
 *        처음엔 '하는 방법' 카드 → '게임 시작'을 눌러야 미션 시작
 * 실행 로직은 js/coaster/logic.js, 미션은 js/coaster/missions.js
 * 공원과의 연결: window.MP_API (game.js) — 저장·프로필·캐릭터·공원 복귀(exitCoaster)
 * 저장: save.coaster.build = { done: { 미션 id: true }, cleared: true }  (예전 코스터 기록 stamps 등은 그대로 둠)
 */
(function () {
  'use strict';
  var LG = window.MP_COASTER_LOGIC, MS = window.MP_COASTER_MISSIONS;
  var BASE = 'assets/coaster/';
  var IW = 1672, IH = 941;
  var TURTLE_SAYS = '어서 와! 나는 선로를 놓는 거북이 역장이야. 블록을 쌓아서 코스터가 달릴 길을 함께 만들어 볼래?';
  var FIRST_TIP = '거북이 역장에게 다가가 말을 걸어 보세요.';

  var S = {
    open: false, scene: 'lobby', grade: 1,
    me: { x: 836, y: 860, dir: 'up', moving: false }, keys: {}, dest: null, nearTurtle: false, nearExit: false, dialog: false,
    mission: null, layoutIdx: 0, program: [], cursor: { list: 'root', i: 0 }, started: false, running: false, runToken: 0,
    world: null, ranOnce: false, last: 0, raf: 0
  };
  var ui = {};

  // ---------- 작은 도우미 ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function pic(name, cls, alt) { var e = el('img', cls); e.src = BASE + name + '.webp'; e.alt = alt || ''; e.draggable = false; return e; }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function pct(v, of) { return (v / of * 100) + '%'; }
  function api() { return window.MP_API; }
  function save() { return (api() && api().readSave()) || {}; }
  function buildSave() { var c = save().coaster, b = c && c.build; return b && typeof b === 'object' ? b : {}; }
  function patchBuild(fn) {
    var c = save().coaster; c = c && typeof c === 'object' ? c : {};
    var b = c.build && typeof c.build === 'object' ? c.build : {};
    b.done = b.done && typeof b.done === 'object' ? b.done : {};
    c.build = b;
    var extra = fn(b) || {}, patch = { coaster: c };
    for (var k in extra) patch[k] = extra[k];
    api().patchSave(patch);
    return api().storageOk();
  }
  function wait(ms, token) { return new Promise(function (res) { setTimeout(function () { res(token === S.runToken); }, ms); }); }

  // ================================================================
  // 장면 1: 대기실
  // ================================================================
  // 걸을 수 있는 분홍 바닥(그림 좌표 다각형)과 막힌 곳(발 기준 타원)
  var FLOOR = [[24, 694], [388, 646], [404, 562], [1336, 562], [1350, 662], [1380, 712], [1660, 716], [1660, 934], [12, 934]];
  var TURTLE = { x: 486, y: 652, h: 225 };   // 발 위치·몸 키(모든 로비 안내 캐릭터와 같은 225)
  var BLOCKS = [{ x: TURTLE.x, y: TURTLE.y, rx: 62, ry: 26 }];
  var EXIT_Y = 900;
  var LOBBY_SCALE = 1.3, FLOOR_TOP = 562;
  var DEBUG = /[?&]debug=1/.test(location.search);
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
    return true;
  }
  function charH(y) {
    var r = ui.canvas.getBoundingClientRect(), px = api().charScreenH ? api().charScreenH() : 94;
    var base = r.height ? px * IH / r.height : 125;
    var depth = 0.86 + Math.max(0, Math.min(1, (y - FLOOR_TOP) / (IH - FLOOR_TOP))) * 0.3;
    return base * LOBBY_SCALE * depth;
  }

  function buildLobby() {
    var stage = ui.lobbyStage = el('div', 'cs-lstage');
    var lobby = ui.lobby = el('div', 'cs-lobby');
    lobby.style.backgroundImage = 'url(' + BASE + 'lobby.webp)';
    ui.canvas = el('canvas', 'cs-canvas'); ui.canvas.width = IW; ui.canvas.height = IH;
    ui.canvas.setAttribute('aria-label', '코스터역 대기실. 방향키나 바닥을 눌러 걸어요');
    ui.canvas.tabIndex = -1;
    lobby.appendChild(ui.canvas);
    ui.talk = btn('cs-prompt', '', openDialog);
    ui.talk.innerHTML = '말 걸기 <kbd>스페이스</kbd>'; ui.talk.hidden = true;
    ui.leave = btn('cs-prompt cs-prompt-exit', '', close);
    ui.leave.innerHTML = '공원으로 나가기 <kbd>스페이스</kbd>'; ui.leave.hidden = true;
    ui.tip = el('p', 'cs-tip', FIRST_TIP);
    ui.lobbyExit = btn('cs-pill cs-lexit', '공원으로', close);
    [ui.talk, ui.leave, ui.tip, ui.lobbyExit].forEach(function (n) { lobby.appendChild(n); });
    // 역장 대화창: 첫 대사 → 학년 → 선로 만들러 가기 / 나중에 할래
    var d = ui.dialog = el('div', 'cs-dialog'); d.hidden = true;
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'csDlgName');
    d.appendChild(pic('turtle-S', 'cs-dialog-face'));
    var body = el('div', 'cs-dialog-body');
    var nm = el('p', 'cs-dialog-name', '거북이 역장'); nm.id = 'csDlgName';
    body.appendChild(nm);
    body.appendChild(el('p', 'cs-dialog-text', TURTLE_SAYS));
    var gr = el('div', 'cs-grades'); gr.setAttribute('role', 'radiogroup'); gr.setAttribute('aria-label', '학년');
    gr.appendChild(el('span', 'cs-grades-label', '학년'));
    ui.gradeBtns = [];
    for (var g = 1; g <= 6; g++) (function (g) {
      var b = btn('cs-grade', g + '학년', function () { setGrade(g); });
      b.setAttribute('role', 'radio'); ui.gradeBtns.push(b); gr.appendChild(b);
    })(g);
    body.appendChild(gr);
    ui.gradeNote = el('p', 'cs-grade-note'); body.appendChild(ui.gradeNote);
    ui.ticketNote = el('p', 'cs-ticket-note'); body.appendChild(ui.ticketNote);   // 이번 판에 받을 수 있는 티켓 미리 알려 주기
    var acts = el('div', 'cs-dialog-acts');
    ui.goBtn = btn('cs-choice', '선로 만들러 가기', function () { closeDialog(); openGame(pickMission(S.grade)); });
    acts.appendChild(ui.goBtn);
    acts.appendChild(btn('cs-choice light', '나중에 할래', closeDialog));
    body.appendChild(acts);
    d.appendChild(body);
    lobby.appendChild(d);
    stage.appendChild(lobby);
    ui.root.appendChild(stage);

    ui.canvas.addEventListener('pointerdown', function (e) {
      if (S.dialog) return;
      var r = ui.canvas.getBoundingClientRect(), p = { x: (e.clientX - r.left) / r.width * IW, y: (e.clientY - r.top) / r.height * IH };
      // 역장을 누르면 그 앞으로 걸어감
      if (Math.abs(p.x - TURTLE.x) < 90 && p.y > TURTLE.y - TURTLE.h - 20 && p.y < TURTLE.y + 30) p = { x: TURTLE.x + 120, y: TURTLE.y + 30 };
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
  function setGrade(g) {
    S.grade = g;
    ui.gradeBtns.forEach(function (b, i) { b.setAttribute('aria-checked', String(i + 1 === g)); b.classList.toggle('on', i + 1 === g); });
    var park = api().profile().grade || null, m = MS.byGrade(g), done = (buildSave().done || {})['g' + g];
    ui.gradeNote.textContent = (done ? '이번엔 새 꽃밭이 나와요(‘' + m.title + '’ 연습은 끝!) · ' : '첫 미션: ‘' + m.title + '’ · ') + (park ? '공원 학년은 ' + park + '학년이에요. ' : '') +
      (park && park !== g ? '바꾼 학년은 이번 놀이에만 써요.' : '다른 학년도 골라 볼 수 있어요.');
    ui.ticketNote.textContent = api().ticketNote ? api().ticketNote('coaster', g) : '';   // 모든 건물 같은 티켓 규칙(game.js)
  }
  function openDialog() {
    if (S.dialog) return;
    S.dialog = true; S.keys = {}; S.dest = null; S.me.moving = false;
    ui.dialog.hidden = false; ui.talk.hidden = true; ui.leave.hidden = true; ui.tip.hidden = true;
    setGrade(S.grade);
    ui.goBtn.focus();
  }
  function closeDialog() { S.dialog = false; ui.dialog.hidden = true; S.keys = {}; }

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
    S.nearTurtle = Math.hypot(me.x - TURTLE.x, (me.y - TURTLE.y) * 1.4) < 230;
    S.nearExit = !S.nearTurtle && me.y > EXIT_Y;
    ui.talk.hidden = !S.nearTurtle;
    ui.leave.hidden = !S.nearExit;
    if (S.nearTurtle) { ui.talk.style.left = pct(TURTLE.x, IW); ui.talk.style.top = pct(TURTLE.y - TURTLE.h - 70, IH); }
    if (S.nearExit) { ui.leave.style.left = pct(me.x, IW); ui.leave.style.top = pct(me.y - charH(me.y) - 64, IH); }
  }
  var turtleImgs = {};
  function turtleImg(d) {
    if (!turtleImgs[d]) { turtleImgs[d] = new Image(); turtleImgs[d].src = BASE + 'turtle-' + d + '.webp'; }
    return turtleImgs[d];
  }
  // 대기실 역장 대기 움직임(assets/coaster-src/turtle-idle-hanok.webp → tools/build_hanok_npcs.py, 384×384 고정 캔버스 8프레임: 도면을 펼쳐 보고 접은 뒤 손 흔들기)
  // 대화 중에는 정면 자세(turtle-front) 한 장으로 멈춤. 발 위치는 프레임마다 거의 같음(아래 끝 353)
  var IDLE = { size: 384, ms: [1200, 180, 220, 1200, 220, 180, 250, 1000], foot: 353, draw: 260 };   // 384 캔버스 안 몸 키 333 → 그리면 225
  IDLE.total = IDLE.ms.reduce(function (a, b) { return a + b; }, 0);
  function idleFrame(t) {
    var ms = (t * 1000) % IDLE.total;
    for (var i = 0; i < IDLE.ms.length; i++) { if (ms < IDLE.ms[i]) return i; ms -= IDLE.ms[i]; }
    return 0;
  }
  function drawLobby(t) {
    var c = ui.canvas.getContext('2d');
    c.clearRect(0, 0, IW, IH);
    if (!turtleImgs['idle-00']) IDLE.ms.forEach(function (_, i) { turtleImg('idle-0' + i); });   // 처음에 8장을 미리 받아 둠
    var ti = turtleImg(S.dialog ? 'front' : 'idle-0' + idleFrame(t));
    var items = [
      { y: TURTLE.y, draw: function () {
        c.save(); c.fillStyle = 'rgba(90,40,40,0.25)';
        c.beginPath(); c.ellipse(TURTLE.x, TURTLE.y, 62, 15, 0, 0, Math.PI * 2); c.fill(); c.restore();
        var k = IDLE.draw / IDLE.size;
        if (ti.complete && ti.naturalWidth) c.drawImage(ti, TURTLE.x - IDLE.draw / 2, TURTLE.y + 6 - IDLE.foot * k, IDLE.draw, IDLE.draw);
      } },
      { y: S.me.y, draw: function () { drawMe(c, t); } }
    ];
    items.sort(function (a, b) { return a.y - b.y; }).forEach(function (i) { i.draw(); });
    if (DEBUG) {
      c.strokeStyle = 'lime'; c.lineWidth = 3; c.beginPath();
      FLOOR.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); c.stroke();
      c.strokeStyle = 'red'; BLOCKS.forEach(function (b) { c.beginPath(); c.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, Math.PI * 2); c.stroke(); });
      c.beginPath(); c.moveTo(0, EXIT_Y); c.lineTo(IW, EXIT_Y); c.stroke();
    }
  }
  function drawMe(c, t) {
    var me = S.me, h = charH(me.y), sid = api().character ? api().character().sid : 'F1';
    var sw = h * 0.3, g = c.createRadialGradient(me.x, me.y, 0, me.x, me.y, sw);
    g.addColorStop(0, 'rgba(110,40,50,0.4)'); g.addColorStop(1, 'rgba(110,40,50,0)');
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
  function loop(now) {
    if (!S.open) return;
    var dt = Math.min(0.05, (now - S.last) / 1000); S.last = now;
    if (S.scene === 'lobby') { step(dt); drawLobby(now / 1000); }
    S.raf = requestAnimationFrame(loop);
  }

  // ---------- 열기·닫기·장면 ----------
  function open() {
    if (!ui.root) return;
    S.grade = api().profile().grade || 1;   // 공원에서 고른 학년이 기본. 대화창에서 바꾼 학년은 이번 놀이에만
    S.open = true;
    ui.root.hidden = false;
    document.body.classList.add('coaster-open');
    S.me = { x: 836, y: 860, dir: 'up', moving: false };   // 아래쪽 가운데에서 시작
    S.dest = null; S.keys = {}; closeDialog();
    ui.tip.hidden = false;
    showScene('lobby');
    ui.canvas.focus && ui.canvas.focus();
  }
  function close() {
    stopRun();
    S.open = false; cancelAnimationFrame(S.raf);
    ui.root.hidden = true;
    document.body.classList.remove('coaster-open');
    if (api().exitCoaster) api().exitCoaster();
  }
  function showScene(name) {
    S.scene = name;
    ui.lobbyStage.hidden = name !== 'lobby';
    ui.game.hidden = name !== 'game';
    showTickets();
    if (name === 'lobby') {
      S.last = performance.now();
      cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(loop);
    }
  }
  function toLobby() {
    stopRun(); hideModal();
    // 역장 앞에 서서 바로 다시 말을 걸 수 있게
    S.me = { x: TURTLE.x + 140, y: TURTLE.y + 40, dir: 'left', moving: false };
    S.dest = null; S.keys = {}; closeDialog(); ui.tip.hidden = true;
    showScene('lobby');
  }
  function ticketCount() { return save().tickets || 0; }
  function showTickets(from) {
    [ui.lTickets, ui.gTickets].forEach(function (box) {
      if (!box) return;
      var num = box.querySelector('b'), to = ticketCount();
      if (from == null || from >= to) { num.textContent = String(to); return; }
      var plus = el('span', 'cs-tickets-plus', '+' + (to - from));
      box.appendChild(plus);
      setTimeout(function () { if (plus.parentNode) plus.parentNode.removeChild(plus); }, 1600);
      box.classList.add('gain');
      var n = from;
      (function up() {
        n++; num.textContent = String(n);
        if (n < to) setTimeout(up, 140); else setTimeout(function () { box.classList.remove('gain'); }, 500);
      })();
    });
  }
  function ticketChip() {
    var t = el('p', 'cs-tickets');
    t.appendChild(el('span', 'cs-tickets-icon', '🎟'));
    t.appendChild(document.createTextNode('티켓 '));
    t.appendChild(el('b', '', '0'));
    t.appendChild(document.createTextNode('장'));
    t.setAttribute('aria-live', 'polite');
    return t;
  }

  // ================================================================
  // 블록: 모양 만들기(블록 상자·내 코드·하는 방법 카드가 함께 씀)
  // ================================================================
  var COND_NAME = { tulip: '튤립', sunflower: '해바라기' };
  var KIND = { fwd: 'move', left: 'turn', right: 'turn', repeat: 'loop', until: 'loop', if: 'cond', ifelse: 'cond' };
  function isC(b) { return b.type === 'repeat' || b.type === 'until' || b.type === 'if' || b.type === 'ifelse'; }
  function blockLabel(b, numFn) {
    var w = el('span', 'cs-blabel');
    function num(v) { var n = el('span', 'cs-num' + (b.edit && numFn ? ' edit' : ''), String(v)); if (b.edit && numFn) { n.setAttribute('role', 'button'); n.setAttribute('aria-label', '숫자 바꾸기, 지금 ' + v); n.dataset.num = '1'; } return n; }
    if (b.type === 'fwd') { w.appendChild(el('span', 'cs-ico', '➜')); w.appendChild(document.createTextNode('앞으로 ')); w.appendChild(num(b.n || 1)); w.appendChild(document.createTextNode('칸')); }
    else if (b.type === 'left') { w.appendChild(el('span', 'cs-ico', '↰')); w.appendChild(document.createTextNode('왼쪽 돌기')); }
    else if (b.type === 'right') { w.appendChild(el('span', 'cs-ico', '↱')); w.appendChild(document.createTextNode('오른쪽 돌기')); }
    else if (b.type === 'repeat') { w.appendChild(el('span', 'cs-ico', '↻')); w.appendChild(num(b.n || 2)); w.appendChild(document.createTextNode('번 반복')); }
    else if (b.type === 'until') { w.appendChild(el('span', 'cs-ico', '↻')); w.appendChild(pic('station', 'cs-bpic')); w.appendChild(document.createTextNode('역에 닿을 때까지 반복')); }
    else if (b.type === 'if' || b.type === 'ifelse') {
      w.appendChild(document.createTextNode('만약 바로 앞에 '));
      w.appendChild(pic(b.cond, 'cs-bpic'));
      w.appendChild(document.createTextNode(COND_NAME[b.cond] + (b.cond === 'tulip' ? '이' : '가') + ' 있다면'));
    }
    return w;
  }
  function blockText(b) {
    return b.type === 'fwd' ? '앞으로 ' + (b.n || 1) + '칸' : b.type === 'left' ? '왼쪽 돌기' : b.type === 'right' ? '오른쪽 돌기' :
      b.type === 'repeat' ? (b.n || 2) + '번 반복' : b.type === 'until' ? '역에 닿을 때까지 반복' :
      '만약 바로 앞에 ' + COND_NAME[b.cond] + (b.cond === 'tulip' ? '이' : '가') + ' 있다면' + (b.type === 'ifelse' ? ', 아니면' : '');
  }
  /* 블록 하나(반복·조건은 안쪽까지). opts: { code: true 면 지우기·숫자·자리(slot) 포함 } */
  function blockEl(b, opts) {
    opts = opts || {};
    var e = el('div', 'cs-blk k-' + KIND[b.type] + (isC(b) ? ' is-c' : ''));
    e.dataset.id = b.id || '';
    var head = el('div', 'cs-bhead');
    head.appendChild(blockLabel(b, opts.code));
    if (opts.code) {
      var x = btn('cs-del', '✕'); x.setAttribute('aria-label', blockText(b) + ' 블록 빼기'); x.dataset.del = b.id;
      head.appendChild(x);
    }
    e.appendChild(head);
    if (isC(b)) {
      e.appendChild(innerEl(b, 'body', opts));
      if (b.type === 'ifelse') {
        e.appendChild(el('div', 'cs-bmid', '아니면'));
        e.appendChild(innerEl(b, 'else', opts));
      }
      e.appendChild(el('div', 'cs-bfoot'));
    }
    e.setAttribute('aria-label', blockText(b));
    return e;
  }
  function innerEl(b, part, opts) {
    var w = el('div', 'cs-inner');
    var list = b[part] || [];
    if (opts.code) listInto(w, list, b.id + ':' + part, true);
    else list.forEach(function (c) { w.appendChild(blockEl(c, opts)); });
    if (!opts.code && !list.length) w.appendChild(el('div', 'cs-inner-empty'));
    return w;
  }
  /* 내 코드 목록: 자리(slot) - 블록 - 자리 - 블록 - … - 자리 */
  function listInto(box, list, path, inner) {
    box.dataset.list = path;
    for (var i = 0; i <= list.length; i++) {
      box.appendChild(slotEl(path, i, inner, list.length));
      if (i < list.length) box.appendChild(blockEl(list[i], { code: true }));
    }
  }
  function slotEl(path, i, inner, len) {
    var s = el('div', 'cs-slot' + (inner ? ' inner' : ''));
    s.dataset.list = path; s.dataset.i = i;
    var cur = S.cursor.list === path && S.cursor.i === i;
    if (cur) s.classList.add('cursor');
    if (inner && !len) s.classList.add('empty');
    // 커서가 반복·조건 안에 있으면, 그 블록 바로 뒤(바깥쪽) 자리도 보여 줌
    if (!inner && S.cursor.list !== 'root' && path === parentListOf(S.cursor.list) && i === indexAfter(S.cursor.list)) s.classList.add('outer-hint');
    var txt = inner ? '안쪽에 넣기' : '여기에 쌓기';
    s.appendChild(el('span', 'cs-slot-text', txt));
    s.setAttribute('role', 'button');
    s.setAttribute('aria-label', (inner ? '반복·조건 안쪽 ' : '') + (i + 1) + '번째 자리' + (cur ? ' (선택됨)' : ''));
    return s;
  }

  // ---------- 프로그램 다루기 ----------
  var seq = 0;
  function newId() { return 'b' + (++seq); }
  function clone(t) {
    var o = { id: newId(), type: t.type };
    if (t.n != null) o.n = t.n;
    if (t.edit) o.edit = true;
    if (t.cond) o.cond = t.cond;
    if (isC(t)) o.body = [];
    if (t.type === 'ifelse') o.else = [];
    return o;
  }
  function findBlock(id, list, parentPath) {
    list = list || S.program; parentPath = parentPath || 'root';
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.id === id) return { block: b, list: list, index: i, path: parentPath };
      var r = (b.body && findBlock(id, b.body, b.id + ':body')) || (b.else && findBlock(id, b.else, b.id + ':else'));
      if (r) return r;
    }
    return null;
  }
  function listAt(path) {
    if (path === 'root') return S.program;
    var p = path.split(':'), f = findBlock(p[0]);
    return f ? f.block[p[1]] : null;
  }
  function parentListOf(path) { if (path === 'root') return null; var f = findBlock(path.split(':')[0]); return f ? f.path : null; }
  function indexAfter(path) { var f = findBlock(path.split(':')[0]); return f ? f.index + 1 : -1; }
  function contains(b, path) {   // path 목록이 블록 b 안쪽에 있는지(자기 안에 자기를 넣지 않게)
    if (path === 'root') return false;
    var id = path.split(':')[0];
    if (id === b.id) return true;
    return !!findBlock(id, (b.body || []).concat(b.else || []));
  }
  function insertAt(block, path, i) {
    var list = listAt(path);
    if (!list) { path = 'root'; list = S.program; i = list.length; }
    i = Math.max(0, Math.min(i, list.length));
    list.splice(i, 0, block);
    // 반복·조건을 넣으면 그 안쪽에 이어서 쌓을 수 있게 커서를 안으로, 아니면 방금 넣은 블록 아래로
    S.cursor = isC(block) ? { list: block.id + ':body', i: 0 } : { list: path, i: i + 1 };
    codeChanged(true);
  }
  function removeBlock(id) {
    var f = findBlock(id); if (!f) return null;
    f.list.splice(f.index, 1);
    // 커서가 지운 블록 안에 있었거나 뒤로 밀렸으면 고쳐 줌
    if (S.cursor.list !== 'root' && !listAt(S.cursor.list)) S.cursor = { list: f.path, i: f.index };
    else if (S.cursor.list === f.path && S.cursor.i > f.index) S.cursor.i--;
    return f;
  }
  function codeChanged(follow) {
    renderCode(follow);
    clearFail();
  }

  // ================================================================
  // 장면 2: 게임 화면
  // ================================================================
  function buildGame() {
    var g = ui.game = el('div', 'cs-game'); g.hidden = true;
    // 잔디밭
    var field = ui.field = el('div', 'cs-field');
    ui.grid = el('div', 'cs-grid'); ui.grid.setAttribute('role', 'img');
    field.appendChild(ui.grid);
    // 꽃밭 위쪽 띠: 미션 제목(+꽃밭 1·2) → 역장 얼굴과 말풍선
    var ftop = ui.ftop = el('div', 'cs-ftop');
    var top = el('div', 'cs-top');
    ui.title = el('p', 'cs-mtitle');
    top.appendChild(ui.title);
    ui.layoutTabs = el('div', 'cs-ltabs');
    top.appendChild(ui.layoutTabs);
    ftop.appendChild(top);
    var say = ui.say = el('div', 'cs-say');
    say.appendChild(pic('turtle-S', 'cs-say-face'));
    ui.sayText = el('p', 'cs-say-text'); ui.sayText.setAttribute('role', 'status'); ui.sayText.setAttribute('aria-live', 'polite');
    say.appendChild(ui.sayText);
    ftop.appendChild(say);
    field.appendChild(ftop);
    g.appendChild(field);

    // 오른쪽 코딩창: 위 버튼 줄 → 블록 상자 → 내 코드 → ▶ 실행
    var panel = el('div', 'cs-panel');
    var right = el('div', 'cs-ptop');
    ui.gTickets = ticketChip(); right.appendChild(ui.gTickets);
    ui.helpBtn = btn('cs-pill', '? 하는 방법', function () { if (!S.running) showHowTo(false); });
    right.appendChild(ui.helpBtn);
    right.appendChild(btn('cs-pill', '역으로', toLobby));
    panel.appendChild(right);
    var box = el('section', 'cs-box'); box.setAttribute('aria-label', '블록 상자');
    box.appendChild(el('h3', 'cs-ph', '블록 상자'));
    ui.palette = el('div', 'cs-palette');
    box.appendChild(ui.palette);
    panel.appendChild(box);
    var code = el('section', 'cs-code'); code.setAttribute('aria-label', '내 코드');
    var ch = el('div', 'cs-codehead');
    ch.appendChild(el('h3', 'cs-ph', '내 코드'));
    ui.clearBtn = btn('cs-mini', '모두 빼기', function () {
      if (S.running || !S.program.length) return;
      S.program = []; S.cursor = { list: 'root', i: 0 }; codeChanged(); resetWorld();
    });
    ch.appendChild(ui.clearBtn);
    code.appendChild(ch);
    ui.code = el('div', 'cs-script');
    code.appendChild(ui.code);
    panel.appendChild(code);
    var runw = el('section', 'cs-runw');
    ui.runBtn = btn('cs-run', '▶ 실행', function () { if (S.running) stopRun(true); else runProgram(); });
    runw.appendChild(ui.runBtn);
    ui.runNote = el('p', 'cs-runnote', '');
    runw.appendChild(ui.runNote);
    panel.appendChild(runw);
    g.appendChild(panel);

    // 카드(하는 방법·성공)
    ui.modal = el('div', 'cs-modal'); ui.modal.hidden = true;
    ui.card = el('div', 'cs-card'); ui.card.setAttribute('role', 'dialog'); ui.card.setAttribute('aria-modal', 'true');
    ui.modal.appendChild(ui.card);
    g.appendChild(ui.modal);
    ui.root.appendChild(g);

    // 블록 상자: 누르면 커서 자리에 넣기, 끌면 원하는 자리에 놓기
    ui.palette.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('.cs-blk'); if (!b || S.running || !S.started) return;
      var t = S.mission.palette[+b.dataset.idx];
      startDrag(e, b, { from: 'palette', template: t });
    });
    ui.palette.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('cs-blk')) {
        e.preventDefault(); if (S.running || !S.started) return;
        insertAt(clone(S.mission.palette[+e.target.dataset.idx]), S.cursor.list, S.cursor.i);
      }
    });
    // 내 코드: 자리 누르기 = 커서 옮기기, ✕ = 빼기, 숫자 = 바꾸기, 블록 끌기 = 옮기기(코드 밖에 놓으면 빼기)
    ui.code.addEventListener('pointerdown', function (e) {
      if (S.running || !S.started) return;
      if (e.target.closest('.cs-del') || e.target.closest('[data-num]')) return;
      var slot = e.target.closest('.cs-slot');
      if (slot) { S.cursor = { list: slot.dataset.list, i: +slot.dataset.i }; renderCode(); return; }
      var b = e.target.closest('.cs-blk');
      if (b && b.dataset.id) startDrag(e, b, { from: 'code', id: b.dataset.id });
    });
    ui.code.addEventListener('click', function (e) {
      if (S.running || !S.started) return;
      var d = e.target.closest('.cs-del');
      if (d) { removeBlock(d.dataset.del); codeChanged(); return; }
      var n = e.target.closest('[data-num]');
      if (n) {
        var f = findBlock(n.closest('.cs-blk').dataset.id); if (!f) return;
        var b = f.block, max = b.type === 'fwd' ? 6 : 9, min = b.type === 'fwd' ? 1 : 2;
        b.n = (b.n || min) >= max ? min : (b.n || min) + 1;
        codeChanged();
      }
    });
    ui.code.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var slot = e.target.closest && e.target.closest('.cs-slot');
      if (slot) { e.preventDefault(); S.cursor = { list: slot.dataset.list, i: +slot.dataset.i }; renderCode(); }
    });
    window.addEventListener('resize', function () { if (S.open && S.scene === 'game') layoutGrid(); });
  }

  // ---------- 끌어서 놓기 ----------
  var drag = null;
  function startDrag(e, srcEl, info) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    drag = { info: info, x0: e.clientX, y0: e.clientY, src: srcEl, moved: false, pid: e.pointerId };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragCancel);
  }
  function onDragMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
      drag.moved = true;
      var r = drag.src.getBoundingClientRect();
      drag.dx = drag.x0 - r.left; drag.dy = drag.y0 - r.top;
      // 코드 안 블록은 놓을 때까지 제자리에 흐리게 남겨 둠(자리가 밀리지 않게)
      if (drag.info.from === 'code') { drag.block = findBlock(drag.info.id).block; drag.src.classList.add('lifted'); }
      else drag.block = clone(drag.info.template);
      drag.ghost = blockEl(drag.block, {});
      drag.ghost.classList.add('cs-ghost');
      drag.ghost.style.width = r.width + 'px';
      ui.root.appendChild(drag.ghost);
      ui.code.classList.add('dragging');
    }
    drag.ghost.style.transform = 'translate(' + (e.clientX - drag.dx) + 'px,' + (e.clientY - drag.dy) + 'px)';
    drag.target = nearestSlot(e.clientX, e.clientY, drag.block);
    ui.code.querySelectorAll('.cs-slot.drop').forEach(function (s) { s.classList.remove('drop'); });
    if (drag.target) drag.target.classList.add('drop');
    ui.palette.classList.toggle('trash', drag.info.from === 'code' && !drag.target);
  }
  function nearestSlot(x, y, block) {
    var cr = ui.code.getBoundingClientRect();
    if (x < cr.left - 30 || x > cr.right + 30 || y < cr.top - 30 || y > cr.bottom + 30) return null;
    var best = null, bd = 1e9;
    ui.code.querySelectorAll('.cs-slot').forEach(function (s) {
      if (contains(block, s.dataset.list)) return;
      var r = s.getBoundingClientRect();
      // 안쪽 자리는 들여 쓴 만큼 오른쪽 — 손가락 x 위치로 안/바깥을 구별
      var dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      var dx = x < r.left ? r.left - x : 0;
      var d = dy + dx * 0.6;
      if (d < bd) { bd = d; best = s; }
    });
    return best;
  }
  function endDrag() {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragCancel);
    if (drag && drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
    ui.code.classList.remove('dragging');
    ui.palette.classList.remove('trash');
  }
  function onDragEnd(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    var d = drag; endDrag(); drag = null;
    if (!d.moved) {
      // 눌렀다 뗌: 블록 상자 블록은 커서 자리에 넣기
      if (d.info.from === 'palette') insertAt(clone(d.info.template), S.cursor.list, S.cursor.i);
      // 내 코드의 블록을 누름: 그 블록 바로 아래(반복·조건 블록이면 그 안쪽 맨 아래)를 다음 자리로
      else {
        var fb = findBlock(d.info.id);
        if (fb) S.cursor = isC(fb.block) ? { list: fb.block.id + ':body', i: fb.block.body.length } : { list: fb.path, i: fb.index + 1 };
        renderCode();
      }
      return;
    }
    var path = d.target && d.target.dataset.list, i = d.target ? +d.target.dataset.i : 0;
    if (d.info.from === 'code') {
      var f = findBlock(d.info.id);
      if (d.target && f.path === path && f.index < i) i--;   // 같은 줄에서 아래로 옮기면 빠진 자리만큼 당김
      removeBlock(d.info.id);
    }
    if (d.target) insertAt(d.block, path, i);
    else { codeChanged(); if (d.info.from === 'code') say('블록을 뺐어요.'); }
  }
  function onDragCancel(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    endDrag(); drag = null;
    renderCode();
  }

  // ---------- 그리기: 블록 상자·내 코드 ----------
  /* 블록 상자: '움직이기 · 반복 · 조건' 줄로 묶고, 블록은 한 줄 이름표(안쪽 자리 모양은 작은 꺾쇠로만) */
  var GROUPS = [['움직이기', ['move', 'turn']], ['반복', ['loop']], ['조건', ['cond']]];
  function chipEl(t) {
    var e = el('div', 'cs-blk cs-chip k-' + KIND[t.type] + (isC(t) ? ' is-c' : ''));
    var head = el('div', 'cs-bhead');
    head.appendChild(blockLabel(t));
    if (t.type === 'ifelse') head.appendChild(el('span', 'cs-chipelse', '/ 아니면'));
    e.appendChild(head);
    if (isC(t)) e.appendChild(el('div', 'cs-chipmouth'));
    return e;
  }
  function renderPalette() {
    ui.palette.textContent = '';
    ui.palette.classList.toggle('many', S.mission.palette.length > 5);   // 블록이 많으면 조금 작게
    GROUPS.forEach(function (g) {
      var items = [];
      S.mission.palette.forEach(function (t, i) { if (g[1].indexOf(KIND[t.type]) >= 0) items.push([t, i]); });
      if (!items.length) return;
      var row = el('div', 'cs-pgroup');
      row.appendChild(el('span', 'cs-pglabel', g[0]));
      var wrap = el('div', 'cs-pitems');
      items.forEach(function (x) {
        var b = chipEl(x[0]);
        b.dataset.idx = x[1]; b.tabIndex = 0; b.setAttribute('role', 'button');
        b.setAttribute('aria-label', blockText(x[0]) + ' 블록 넣기');
        wrap.appendChild(b);
      });
      row.appendChild(wrap);
      ui.palette.appendChild(row);
    });
  }
  /* follow: 새 블록을 넣었을 때만 다음 자리(커서)가 보이게 스크롤 — 숫자 바꾸기·빼기 때는 제자리 */
  function renderCode(follow) {
    var sc = ui.code.scrollTop;
    ui.code.textContent = '';
    var hat = el('div', 'cs-hat', '▶ 시작');
    ui.code.appendChild(hat);
    var list = el('div', 'cs-list');
    listInto(list, S.program, 'root', false);
    ui.code.appendChild(list);
    ui.code.querySelectorAll('.cs-slot').forEach(function (s) { s.tabIndex = 0; });
    ui.code.scrollTop = sc;
    var cur = ui.code.querySelector('.cs-slot.cursor');
    if (cur && follow) {
      var r = cur.getBoundingClientRect(), cr = ui.code.getBoundingClientRect();
      if (r.bottom > cr.bottom || r.top < cr.top) ui.code.scrollTop += r.top - cr.top - cr.height / 2;
    }
    ui.clearBtn.disabled = !S.program.length;
  }
  function markRunning(id) {
    ui.code.querySelectorAll('.cs-blk.run').forEach(function (b) { b.classList.remove('run'); });
    if (!id) return;
    var b = ui.code.querySelector('.cs-blk[data-id="' + id + '"]');
    if (!b) return;
    b.classList.add('run');
    var r = b.querySelector('.cs-bhead').getBoundingClientRect(), cr = ui.code.getBoundingClientRect();
    if (r.bottom > cr.bottom - 6 || r.top < cr.top + 6) ui.code.scrollTop += r.top - cr.top - cr.height / 3;
  }
  function markCheck(id, yes) {
    var b = ui.code.querySelector('.cs-blk[data-id="' + id + '"]');
    if (!b) return;
    var t = el('span', 'cs-check ' + (yes ? 'yes' : 'no'), yes ? '맞아요' : '아니에요');
    b.querySelector('.cs-bhead').appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 900);
  }

  // ---------- 잔디밭 격자 ----------
  function layout() { return S.mission.layouts[S.layoutIdx]; }
  function layoutGrid() {
    // 위쪽 띠(제목·말풍선) 아래 남은 곳에서 가장 크게, 가운데
    var L = layout(), fr = ui.field.getBoundingClientRect();
    var topH = ui.ftop.getBoundingClientRect().bottom - fr.top + 12, pad = 16;
    var cell = Math.floor(Math.min((fr.height - topH - pad) / L.rows, (fr.width - pad * 2) / L.cols, 150));
    S.cell = cell;
    var gw = cell * L.cols, gh = cell * L.rows;
    ui.grid.style.width = gw + 'px'; ui.grid.style.height = gh + 'px';
    ui.grid.style.setProperty('--cell', cell + 'px');
    ui.grid.style.left = (fr.width - gw) / 2 + 'px';
    ui.grid.style.top = (topH + (fr.height - topH - pad - gh) / 2) + 'px';
    placeTurtle(true);
  }
  function cellPos(c, r) { return { x: c * S.cell, y: r * S.cell }; }
  function renderWorld() {
    var L = layout(), W = S.world, g = ui.grid;
    g.textContent = '';
    g.setAttribute('aria-label', L.cols + '칸 × ' + L.rows + '줄 잔디밭. 거북이, 선로, 꽃, 역이 있어요');
    var tset = {};
    (L.target || []).forEach(function (c) { tset[LG.key(c[0], c[1])] = 1; });
    for (var r = 0; r < L.rows; r++) for (var c = 0; c < L.cols; c++) {
      var cellEl = el('div', 'cs-cell' + (tset[LG.key(c, r)] ? ' target' : ''));
      cellEl.style.left = c * 100 / L.cols + '%'; cellEl.style.top = r * 100 / L.rows + '%';
      cellEl.style.width = 100 / L.cols + '%'; cellEl.style.height = 100 / L.rows + '%';
      g.appendChild(cellEl);
    }
    ui.rails = el('div', 'cs-layer'); g.appendChild(ui.rails);
    ui.railEls = {};
    for (var k in W.track) drawRail(k);
    // 꽃
    for (var fk in W.flowers) {
      var p = fk.split(',').map(Number), f = pic(W.flowers[fk], 'cs-flower', W.flowers[fk] === 'tulip' ? '튤립' : '해바라기');
      place(f, p[0], p[1], L); g.appendChild(f);
    }
    // 역: 도착역(goal) 또는 순환 판의 출발역
    var st = L.goal || (L.loop ? L.start : null);
    if (st) { ui.station = pic('station', 'cs-station', L.loop ? '출발역' : '도착역'); place(ui.station, st[0], st[1], L); g.appendChild(ui.station); }
    // 첫 판 점선 힌트
    ui.hint = null;
    if (L.hint && !S.ranOnce && !(buildSave().done || {})[S.mission.id]) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'cs-hint'); svg.setAttribute('viewBox', '0 0 ' + L.cols * 10 + ' ' + L.rows * 10);
      svg.setAttribute('preserveAspectRatio', 'none');
      var pts = L.hint.map(function (h, i) {
        var x = h[0] * 10 + 5, y = h[1] * 10 + 5;
        if (i === 0) { var nx = L.hint[1][0] * 10 + 5, ny = L.hint[1][1] * 10 + 5; x += (nx - x) * 0.35; y += (ny - y) * 0.35; }
        if (i === L.hint.length - 1) { var px = L.hint[i - 1][0] * 10 + 5, py = L.hint[i - 1][1] * 10 + 5; x -= (x - px) * 0.45; y -= (y - py) * 0.45; }
        return x + ',' + y;
      }).join(' ');
      var pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl.setAttribute('points', pts); pl.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(pl);
      g.appendChild(svg);
      ui.hint = svg;
    }
    // 거북이
    ui.turtle = el('div', 'cs-turtle');
    ui.turtleImg = pic('turtle-' + W.dir, '', '거북이 역장');
    ui.turtle.appendChild(ui.turtleImg);
    g.appendChild(ui.turtle);
    ui.failMark = el('div', 'cs-failmark', '!'); ui.failMark.hidden = true; g.appendChild(ui.failMark);
    ui.car = pic('coaster', 'cs-car', '손님이 탄 코스터'); ui.car.hidden = true; g.appendChild(ui.car);
    placeTurtle(true);
    renderLayoutTabs();
  }
  function place(node, c, r, L) {
    node.style.left = c * 100 / L.cols + '%'; node.style.top = r * 100 / L.rows + '%';
    node.style.width = 100 / L.cols + '%'; node.style.height = 100 / L.rows + '%';
  }
  /* look: 거북이가 지금 바라보는 방향 — 들어온 쪽만 이어진 칸이면 그쪽으로도 이어진 모양(돌면 바로 커브)으로 미리 그림 */
  function drawRail(k, look) {
    var conn = S.world.track[k];
    if (look && conn && !conn[look] && Object.keys(conn).length === 1) { conn = Object.assign({}, conn); conn[look] = true; }
    var L = layout(), piece = LG.pieceOf(conn);
    if (!piece) return;
    var e = ui.railEls[k];
    if (!e) { e = ui.railEls[k] = el('img', 'cs-rail'); e.alt = ''; e.draggable = false; var p = k.split(',').map(Number); place(e, p[0], p[1], L); ui.rails.appendChild(e); }
    var src = BASE + 'rail-' + piece + '.webp';
    if (e.getAttribute('src') !== src) { e.src = src; e.classList.remove('new'); void e.offsetWidth; e.classList.add('new'); }
  }
  function placeTurtle(instant) {
    if (!ui.turtle || !S.world) return;
    var p = cellPos(S.world.c, S.world.r);
    if (instant) { ui.turtle.style.transition = 'none'; void ui.turtle.offsetWidth; }
    ui.turtle.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
    ui.turtle.style.width = ui.turtle.style.height = S.cell + 'px';
    if (instant) { void ui.turtle.offsetWidth; ui.turtle.style.transition = ''; }
    ui.turtleImg.src = BASE + 'turtle-' + S.world.dir + '.webp';
    ui.turtle.dataset.dir = S.world.dir;
  }
  function renderLayoutTabs() {
    var n = S.mission.layouts.length;
    ui.layoutTabs.textContent = '';
    ui.layoutTabs.hidden = n < 2;
    for (var i = 0; i < n; i++) {
      var t = el('span', 'cs-ltab' + (i === S.layoutIdx ? ' on' : '') + (S.layoutOk && S.layoutOk[i] ? ' ok' : ''), (S.layoutOk && S.layoutOk[i] ? '✓ ' : '') + '꽃밭 ' + (i + 1));
      ui.layoutTabs.appendChild(t);
    }
  }
  function resetWorld(idx) {
    S.layoutIdx = idx || 0;
    S.world = LG.initial(layout());
    renderWorld();
    layoutGrid();
  }
  function say(text, mood) {
    ui.sayText.textContent = text;
    ui.say.className = 'cs-say' + (mood ? ' ' + mood : '');
    void ui.say.offsetWidth; ui.say.classList.add('pop');
  }
  function clearFail() { if (ui.failMark) ui.failMark.hidden = true; }

  // ---------- 미션 열기 ----------
  function openGame(m) {
    S.mission = m; S.program = []; S.cursor = { list: 'root', i: 0 }; S.started = false; S.ranOnce = false; S.layoutOk = null;
    showScene('game');
    ui.title.textContent = titleOf(m);
    renderPalette(); renderCode(); resetWorld(0);
    say(m.say);
    setRunState(false);
    showHowTo(true);
  }
  function startMission() {
    S.started = true; hideModal(); setRunState(false);
    say(S.mission.say);
  }

  // ---------- 실행 ----------
  function setRunState(running) {
    S.running = running;
    ui.runBtn.textContent = running ? '■ 멈추기' : '▶ 실행';
    ui.runBtn.classList.toggle('stop', running);
    ui.runBtn.disabled = !S.started;
    ui.game.classList.toggle('running', running);
    ui.helpBtn.disabled = running;
    ui.clearBtn.disabled = running || !S.program.length;
    ui.runNote.textContent = !S.started ? '' : running ? '거북이가 선로를 놓고 있어요' : S.program.length ? '' : '‘시작’ 아래에 블록을 쌓아요';
  }
  function stopRun(byUser) {
    if (!S.running) return;
    S.runToken++;
    markRunning(null);
    setRunState(false);
    if (byUser) say('멈췄어요. 코드를 고치고 다시 실행해 봐요.');
  }
  var T = { move: 430, turn: 330, block: 160, check: 520, round: 200 };
  async function runProgram() {
    if (S.running || !S.started) return;
    clearFail();
    S.ranOnce = true; S.layoutOk = S.mission.layouts.map(function () { return false; });
    setRunState(true);
    var token = ++S.runToken;
    for (var li = 0; li < S.mission.layouts.length; li++) {
      resetWorld(li);   // 거북이와 선로만 처음 상태로(코드는 그대로)
      if (li > 0) {
        say('좋아! 이번엔 꽃과 역 자리가 바뀐 꽃밭 ' + (li + 1) + '이야. 같은 코드로 다시 가 볼게!', 'good');
        if (!await wait(1800, token)) return;
      } else say('출발! 거북이가 블록을 위에서부터 차례로 해요.');
      var res = await playLayout(token);
      if (res === 'stopped') return;
      if (res !== 'success') { setRunState(false); markRunning(null); return; }
      S.layoutOk[li] = true; renderLayoutTabs();
      if (li < S.mission.layouts.length - 1 && !await wait(700, token)) return;
    }
    markRunning(null);
    await ride(token);
    if (token !== S.runToken) return;
    setRunState(false);
    succeed();
  }
  async function playLayout(token) {
    var run = LG.makeRun(layout(), S.program), ev;
    S.world = run.state;   // 실행 상태를 그대로 화면에 씀
    while (!(ev = run.gen.next()).done) {
      var e = ev.value, ok = true;
      if (e.type === 'block') { markRunning(e.id); ok = await wait(T.block, token); }
      else if (e.type === 'turn') {
        placeTurtle(false); ui.turtle.classList.remove('spin'); void ui.turtle.offsetWidth; ui.turtle.classList.add('spin');
        drawRail(LG.key(S.world.c, S.world.r), S.world.dir);   // 도는 순간 지금 칸 레일이 커브로
        ok = await wait(T.turn, token);
      } else if (e.type === 'move') {
        // 떠나는 칸과 들어가는 칸의 선로를 새로 그림(떠나는 칸 커브는 돌 때 이미 그려 둠)
        drawRail(LG.key(e.from[0], e.from[1])); drawRail(LG.key(e.to[0], e.to[1]));
        if (ui.hint) { ui.hint.remove(); ui.hint = null; }
        placeTurtle(false);
        ok = await wait(T.move, token);
      } else if (e.type === 'check') { markCheck(e.id, e.value); ok = await wait(T.check, token); }
      else if (e.type === 'round') { ok = await wait(T.round, token); }
      else if (e.type === 'success') { say('역에 닿았어!', 'good'); return 'success'; }
      else if (e.type === 'fail') { showFail(e); return 'fail'; }
      if (!ok) return 'stopped';
    }
    return 'fail';
  }
  var FLOWER_SAY = { tulip: '앞은 튤립 꽃밭이야.', sunflower: '앞은 해바라기 꽃밭이야.' };
  function showFail(e) {
    var L = layout(), msg;
    if (e.reason === 'flower') msg = FLOWER_SAY[e.flower] + ' 이 칸에서 어느 쪽으로 돌까?';
    else if (e.reason === 'edge') msg = '앞은 잔디밭 끝이야. 이 칸에서 방향을 바꿔 볼까?';
    else if (e.reason === 'track') msg = '앞에는 벌써 선로가 있어. 다른 쪽으로 가 볼까?';
    else if (e.reason === 'off') msg = '점선 목표 선로 밖으로 나가려고 했어. 이 칸에서 어느 쪽으로 돌까?';
    else if (e.reason === 'short') msg = '꽃밭을 다 두르기 전에 역으로 돌아왔어. 어디서 다르게 돌아야 할까?';
    else if (e.reason === 'end') msg = '블록을 다 했는데 아직 역에 못 갔어. 이어서 어떤 블록을 쌓을까?';
    else if (e.reason === 'notback') msg = '블록을 다 했는데 아직 역으로 돌아오지 못했어. 몇 번 더 해야 할까?';
    else if (e.reason === 'toolong') msg = '같은 자리에서 반복만 하고 있어서 멈췄어. ‘앞으로’가 반복할 때마다 실행되는 자리에 있니?';
    else if (e.reason === 'empty') msg = '‘시작’ 아래에 블록을 쌓아 줘!';
    else msg = '여기서 멈췄어. 코드를 고쳐 볼까?';
    if (S.mission.layouts.length > 1 && S.layoutIdx > 0) msg = '꽃밭 ' + (S.layoutIdx + 1) + '에서 멈췄어. ' + msg;
    say(msg, 'bad');
    markRunning(e.id || null);
    var stuck = e.id && ui.code.querySelector('.cs-blk[data-id="' + e.id + '"]');
    if (stuck) stuck.classList.add('stuck');
    // 막힌 칸(앞 칸)에 느낌표, 거북이는 고개를 흔듦
    if (['flower', 'edge', 'track', 'off', 'short'].indexOf(e.reason) >= 0) {
      var d = LG.DELTA[e.dir], ac = e.at[0] + d[0], ar = e.at[1] + d[1];
      ac = Math.max(-0.4, Math.min(L.cols - 0.6, ac)); ar = Math.max(-0.4, Math.min(L.rows - 0.6, ar));
      ui.failMark.style.transform = 'translate(' + ac * S.cell + 'px,' + ar * S.cell + 'px)';
      ui.failMark.style.width = ui.failMark.style.height = S.cell + 'px';
      ui.failMark.hidden = false;
    }
    ui.turtle.classList.remove('shake'); void ui.turtle.offsetWidth; ui.turtle.classList.add('shake');
  }

  // ---------- 성공: 완성된 선로 위로 손님 코스터가 달림 ----------
  async function ride(token) {
    var path = S.world.path, car = ui.car, cell = S.cell;
    if (!path || path.length < 2) return;
    ui.turtle.classList.add('aside');
    car.hidden = false;
    car.style.width = cell * 1.25 + 'px';
    function put(i, instant) {
      var p = path[i], q = path[Math.min(i + 1, path.length - 1)], o = path[Math.max(i - 1, 0)];
      var dx = (q[0] - o[0]), flip = dx < 0 ? -1 : 1;
      if (instant) { car.style.transition = 'none'; void car.offsetWidth; }
      car.style.transform = 'translate(' + (p[0] * cell + cell / 2) + 'px,' + (p[1] * cell + cell / 2) + 'px) translate(-50%,-62%) scaleX(' + flip + ')';
      if (instant) { void car.offsetWidth; car.style.transition = ''; }
    }
    put(0, true);
    say('선로 완성! 손님을 태운 코스터가 출발해요!', 'good');
    for (var i = 1; i < path.length; i++) {
      put(i, false);
      if (!await wait(260, token)) return;
    }
    await wait(500, token);
  }
  /* 티켓: 모든 건물 같은 규칙(game.js awardTicket) — 학년마다 처음 성공 1장, 모든 건물 합쳐 하루 3장 */
  function succeed() {
    var m = S.mission, gid = 'g' + m.grade, cleared = false;
    var saved = patchBuild(function (b) {
      if (!b.done[gid]) b.done[gid] = true;
      if (!b.cleared) { b.cleared = true; cleared = true; }
      return {};
    });
    var tk = m.paid ? null : api().awardTicket('coaster', m.grade);   // 같은 판을 '다시 만들기'로 또 성공하면 다시 계산하지 않음
    m.paid = true;
    if (tk && tk.gain) showTickets(tk.before);
    var lines = [];
    lines.push(m.layouts.length > 1 ? '꽃과 역 자리가 달라져도 같은 코드로 두 꽃밭 모두 성공했어요!' : '쌓은 블록 ' + LG.countBlocks(S.program) + '개로 선로를 완성했어요!');
    if (tk) lines.push(tk.line);
    if (cleared) lines.push('★ ‘꼬마 기관사’ 캐릭터를 받았어요! 공원 위쪽 ‘캐릭터’에서 골라 봐요.');
    if (!saved) lines.push('이 기기에는 저장되지 않았어요. 기록은 이번에만 남아요.');
    var btns = [{ text: '🎲 새 꽃밭', main: true, fn: function () { hideModal(); openNext(pickMission(m.grade, true)); } }];
    if (m.grade < 6) btns.push({ text: '다음 학년 (' + (m.grade + 1) + '학년)', fn: function () { hideModal(); openNext(pickMission(m.grade + 1)); } });
    btns.push({ text: '다시 만들기', fn: function () { hideModal(); openGameAgain(); } });
    btns.push({ text: '역으로 돌아가기', fn: toLobby });
    showModal('선로 완성!', lines, btns, null, 'done');
  }
  /* 학년 미션 고르기: 그 학년을 처음 하면 고정 미션(연습), 그다음부터는 무작위 새 꽃밭(바로 전 판과 다르게) */
  S.lastSig = {};
  function pickMission(g, fresh) {
    if (!fresh && !(buildSave().done || {})['g' + g]) return MS.byGrade(g);
    var m = window.MP_COASTER_GEN ? MP_COASTER_GEN.make(g, null, S.lastSig[g]) : MS.byGrade(g);
    if (m.sig) S.lastSig[g] = m.sig;
    return m;
  }
  function titleOf(m) { return m.grade + '학년 · ' + m.title + (m.random ? ' · 🎲 새 꽃밭' : ''); }
  function openNext(m) {
    S.mission = m; S.program = []; S.cursor = { list: 'root', i: 0 }; S.ranOnce = false; S.layoutOk = null; S.started = true;
    ui.title.textContent = titleOf(m);
    renderPalette(); renderCode(); resetWorld(0); setRunState(false);
    say(m.say);
  }
  function openGameAgain() { openNext(S.mission); }

  // ---------- 카드 ----------
  function showModal(title, lines, btns, node, variant) {
    var c = ui.card; c.textContent = '';
    ui.modal.className = 'cs-modal' + (variant ? ' ' + variant : '');
    var h = el('h2', 'cs-card-title', title); h.id = 'csCardTitle'; c.setAttribute('aria-labelledby', 'csCardTitle');
    c.appendChild(h);
    if (node) c.appendChild(node);
    lines.forEach(function (l) { c.appendChild(el('p', 'cs-card-line', l)); });
    var row = el('div', 'cs-card-btns'), first = null;
    btns.forEach(function (b) { var x = btn('cs-choice' + (b.main ? '' : ' light'), b.text, b.fn); row.appendChild(x); if (!first || b.main && !first.main) first = x; });
    c.appendChild(row);
    ui.modal.hidden = false;
    var f = row.querySelector('.cs-choice:not(.light)') || row.querySelector('button');
    if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function hideModal() { if (ui.modal) ui.modal.hidden = true; }

  // ---------- 하는 방법 ----------
  // 예시 블록은 아이 코드(S.program)와 따로 만든 것 — 카드를 닫아도 쌓은 코드는 그대로
  function howToNode() {
    var box = el('div', 'cs-howto');
    var demo = el('div', 'cs-demo'); demo.setAttribute('aria-hidden', 'true');
    // ① 블록 상자
    var dp = el('div', 'cs-demo-box');
    dp.appendChild(el('p', 'cs-demo-cap', '블록 상자'));
    var src = blockEl({ type: 'fwd', n: 1 }, {}); src.classList.add('cs-demo-src'); dp.appendChild(src);
    dp.appendChild(blockEl({ type: 'right' }, {}));
    dp.appendChild(el('span', 'cs-demo-finger', '👆'));
    demo.appendChild(dp);
    // ② 내 코드: '시작' 밑에 블록이 붙음
    var dc = el('div', 'cs-demo-code');
    dc.appendChild(el('p', 'cs-demo-cap', '내 코드'));
    dc.appendChild(el('div', 'cs-hat', '▶ 시작'));
    var fly = blockEl({ type: 'fwd', n: 1 }, {}); fly.classList.add('cs-demo-fly'); dc.appendChild(fly);
    demo.appendChild(dc);
    // ③ 실행: 거북이가 한 칸 가며 빨간 레일
    var dg = el('div', 'cs-demo-grid');
    var runb = el('span', 'cs-demo-run', '▶ 실행'); dg.appendChild(runb);
    var cells = el('div', 'cs-demo-cells');
    for (var i = 0; i < 3; i++) cells.appendChild(el('span', 'cs-demo-cell'));
    var r0 = pic('rail-h', 'cs-demo-rail r0'); cells.appendChild(r0);
    var r1 = pic('rail-h', 'cs-demo-rail r1'); cells.appendChild(r1);
    var tt = pic('turtle-E', 'cs-demo-turtle'); cells.appendChild(tt);
    dg.appendChild(cells);
    demo.appendChild(dg);
    box.appendChild(demo);
    var steps = el('ol', 'cs-steps');
    [['블록을 골라요', '오른쪽 위 ‘블록 상자’에서 쓸 블록을 눌러요. (끌어다 놓아도 돼요)'],
     ['차례대로 쌓아요', '‘내 코드’의 ‘시작’ 아래에 거북이가 할 일을 위에서부터 이어요.'],
     ['실행해요', '아래 ‘▶ 실행’을 누르면 왼쪽 꽃밭에서 거북이가 움직이며 지나간 자리에 선로를 놓아요.']].forEach(function (s, i) {
      var li = el('li', 'cs-step');
      li.appendChild(el('span', 'cs-step-num', ['①', '②', '③'][i]));
      var t = el('div');
      t.appendChild(el('p', 'cs-step-title', s[0]));
      t.appendChild(el('p', 'cs-step-sub', s[1]));
      li.appendChild(t); steps.appendChild(li);
    });
    box.appendChild(steps);
    box.appendChild(el('p', 'cs-howto-tip', '반복·조건 블록을 누르면 그 안쪽이, 다른 블록을 누르면 그 아래가 다음 자리(👉)가 돼요. 그다음 블록 상자에서 고르면 그 자리에 들어가요. ✕로 빼고, 끌어서 순서를 바꿀 수 있어요.'));
    return box;
  }
  function showHowTo(first) {
    if (!first && !S.started) return;
    showModal('하는 방법', [], [first
      ? { text: '게임 시작', main: true, fn: startMission }
      : { text: '계속하기', main: true, fn: hideModal }], howToNode(), 'howto');
  }

  // ---------- 입력 ----------
  function onKey(e, down) {
    if (!S.open) return;
    if (S.scene === 'lobby' && !S.dialog) {
      if (KEYMAP[e.code]) { e.preventDefault(); S.keys[KEYMAP[e.code]] = down; return; }
      if (down && e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (S.nearTurtle) openDialog(); else if (S.nearExit) close();
      }
      if (down && e.code === 'Escape') { e.preventDefault(); close(); }
      return;
    }
    if (!down) return;
    if (S.dialog && e.code === 'Escape') { e.preventDefault(); closeDialog(); return; }
    if (S.scene === 'game' && e.code === 'Escape' && !ui.modal.hidden && S.started && ui.modal.classList.contains('howto')) { e.preventDefault(); hideModal(); }
  }

  function init() {
    ui.root = document.getElementById('coaster');
    if (!LG || !MS || !ui.root) return;
    ui.root.textContent = '';
    buildLobby();
    ui.lTickets = ticketChip(); ui.lTickets.classList.add('in-lobby'); ui.lobby.appendChild(ui.lTickets);
    buildGame();
    window.addEventListener('keydown', function (e) { onKey(e, true); });
    window.addEventListener('keyup', function (e) { onKey(e, false); });
    window.addEventListener('blur', function () { S.keys = {}; });
    ['S', 'N', 'E', 'W'].forEach(turtleImg);
  }
  window.MPCoaster = { open: open, close: close, _state: S, _ui: ui, _walkable: walkable,
    // 검증용: 미션 바로 열기·프로그램 넣기
    _openGame: function (g) { if (!S.open) open(); openGame(MS.byGrade(g)); },
    _setProgram: function (p) { S.program = LG.withIds(p); S.cursor = { list: 'root', i: S.program.length }; renderCode(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
