/*
 * 콩콩 범퍼카 — 토토의 범퍼카 연구소
 * ------------------------------------------------------------
 * 장면 1 로비(assets/thrill/lobby.webp, 1672×941): 공원 캐릭터로 빨간 지붕 범퍼카장 앞 광장을 걷다가
 *        왼쪽 기록대 옆 수달 연구원 토토에게 '말 걸기' → 첫 대사 · 1~6학년 고르기 → 연구소 들어가기
 *        (걷기·말 걸기·학년 고르기·나가기는 코스터역 대기실(js/coaster/ui.js)과 같은 방식)
 * 장면 2 게임(같은 창 안에서 로비와 바꿔 보여 줌 — 코스터와 같은 방식)
 *        위: 학년 · 이번 목표 한 줄 · 도움말 · 나가기 / 가운데: 16:9 경기장(낮, 5학년은 밤) / 아래: 방향 패드 · 버튼
 *        하는 방법 → [게임 시작] → 자유 연습 → [미션 시작] → 별 이야기 카드 3장 모으기(카드마다 과학자 이야기)
 *        → 퀴즈 3문제 → 결과: [자유 주행] [다른 학년 선택] [공원으로 돌아가기]
 * 움직임: js/thrill/physics.js, 학년별 과학자 이야기·퀴즈: js/thrill/missions.js (확인: node tools/verify_thrill.js)
 * 그림: assets/thrill/ (python -I tools/build_thrill.py 로 assets/thrill-src 원본에서 만듦)
 *   car-dir.webp 8칸(↓ ↙ ← ↖ ↑ ↗ → ↘), car-drive/crash.webp 오른쪽 8프레임 — 칸 360×420, 범퍼 바닥 (180, 404)
 *   toto.webp 수첩 대기 8프레임 — 칸 300×440, 발 (150, 425). 별 이야기 카드는 코드로 그림
 * 티켓: 모든 건물 같은 규칙(game.js awardTicket) — 학년마다 처음 끝내면 1장, 모든 건물 합쳐 하루 3장
 * 저장(window.MP_API): save.thrill = { howto, done: { g1: true … }, met, last, cleared }
 *   cleared 가 처음 true 가 될 때 건물 보상 캐릭터(R4)가 열림(game.js facilityCleared('thrill')) — 한 번만, 새로고침해도 그대로
 */
(function () {
  'use strict';
  var P = window.MP_THRILL_PHYS, MS = window.MP_THRILL_MISSIONS;
  var BASE = 'assets/thrill/';
  var IW = 1672, IH = 941;
  var TOTO_SAYS = '안녕, 나는 토토야! 범퍼카를 직접 몰면서 오늘의 미션을 해결해 볼까?';
  var FIRST_TIP = '기록대 옆 수달 연구원 토토에게 다가가 말을 걸어 보세요.';
  var DEBUG = /[?&]debug=1/.test(location.search);

  var S = {
    open: false, scene: 'lobby', grade: 1,
    me: { x: 836, y: 860, dir: 'up', moving: false }, keys: {}, dest: null, nearToto: false, nearExit: false, dialog: false,
    ms: null, mode: 'practice', modal: false, pad: { x: 0, y: 0 }, fx: [], crashT: 9, crashN: null, t: 0, last: 0, raf: 0
  };
  var ui = {};

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function pct(v, of) { return (v / of * 100) + '%'; }
  function api() { return window.MP_API; }
  function save() { return (api() && api().readSave()) || {}; }
  var imgs = {};
  function img(name) { if (!imgs[name]) { imgs[name] = new Image(); imgs[name].src = BASE + name + '.webp'; } return imgs[name]; }
  function ready(i) { return i.complete && i.naturalWidth; }

  // ---------- 저장 ----------
  var mem = null;   // 저장이 안 되는 기기: 이번 방문 동안만
  function thrillData() {
    var d = save().thrill;
    if ((!d || typeof d !== 'object') && mem) d = mem;
    d = d && typeof d === 'object' ? JSON.parse(JSON.stringify(d)) : {};
    d.done = d.done && typeof d.done === 'object' ? d.done : {};
    d.met = d.met && typeof d.met === 'object' ? d.met : {};     // 학년별 만난 인물 번호들
    d.last = d.last && typeof d.last === 'object' ? d.last : {};  // 학년별 바로 전 판 인물
    return d;
  }
  function writeThrill(d) {
    if (api()) api().patchSave({ thrill: d });
    mem = JSON.parse(JSON.stringify(d));
    return api() ? api().storageOk() : false;
  }

  // ================================================================
  // 장면 1: 로비
  // ================================================================
  // 걸을 수 있는 분홍 광장(그림 좌표 다각형)과 막힌 곳(기록대·가로등·토토 발 기준 타원)
  var FLOOR = [[0, 560], [150, 520], [300, 478], [372, 470], [380, 432], [520, 432], [548, 482], [580, 508], [760, 518], [1110, 518], [1262, 490], [1290, 446], [1420, 498], [1672, 548], [1672, 934], [0, 934]];
  var TOTO = { x: 560, y: 500, h: 225 };   // 발 위치·몸 키(모든 로비 안내 캐릭터와 같은 225)
  var BLOCKS = [{ x: 428, y: 470, rx: 56, ry: 22 }, { x: 322, y: 462, rx: 30, ry: 14 }, { x: TOTO.x, y: TOTO.y, rx: 50, ry: 20 }];
  var EXIT_Y = 900, LOBBY_SCALE = 1.3, FLOOR_TOP = 470;
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
    var stage = ui.lobbyStage = el('div', 'th-lstage');
    var lobby = ui.lobby = el('div', 'th-lobby');
    lobby.style.backgroundImage = 'url(' + BASE + 'lobby.webp)';
    ui.canvas = el('canvas', 'th-canvas'); ui.canvas.width = IW; ui.canvas.height = IH;
    ui.canvas.setAttribute('aria-label', '범퍼카 연구소 앞 광장. 방향키나 바닥을 눌러 걸어요');
    ui.canvas.tabIndex = -1;
    lobby.appendChild(ui.canvas);
    ui.totoHot = btn('th-totohot', '', function () { if (S.nearToto) openDialog(); else S.dest = { x: TOTO.x + 130, y: TOTO.y + 40 }; });
    ui.totoHot.setAttribute('aria-label', '수달 연구원 토토에게 말 걸기');
    ui.totoHot.style.left = pct(TOTO.x - 80, IW); ui.totoHot.style.top = pct(TOTO.y - TOTO.h, IH);
    ui.totoHot.style.width = pct(160, IW); ui.totoHot.style.height = pct(TOTO.h + 10, IH);
    ui.talk = btn('th-prompt', '', openDialog);
    ui.talk.innerHTML = '말 걸기 <kbd>스페이스</kbd>'; ui.talk.hidden = true;
    ui.leave = btn('th-prompt th-prompt-exit', '', close);
    ui.leave.innerHTML = '공원으로 나가기 <kbd>스페이스</kbd>'; ui.leave.hidden = true;
    ui.tip = el('p', 'th-tip', FIRST_TIP);
    ui.lobbyExit = btn('th-pill th-lexit', '공원으로', close);
    [ui.totoHot, ui.talk, ui.leave, ui.tip, ui.lobbyExit].forEach(function (n) { lobby.appendChild(n); });

    // 토토 대화창: 첫 대사 → 학년 → 연구소 들어가기 / 나중에 할래
    var d = ui.dialog = el('div', 'th-dialog'); d.hidden = true;
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'thDlgName');
    var face = el('img', 'th-dialog-face'); face.src = BASE + 'toto-face.webp'; face.alt = ''; d.appendChild(face);
    var body = el('div', 'th-dialog-body');
    var nm = el('p', 'th-dialog-name', '수달 연구원 토토'); nm.id = 'thDlgName';
    body.appendChild(nm);
    body.appendChild(el('p', 'th-dialog-text', TOTO_SAYS));
    var gr = el('div', 'th-grades'); gr.setAttribute('role', 'radiogroup'); gr.setAttribute('aria-label', '학년');
    gr.appendChild(el('span', 'th-grades-label', '학년'));
    ui.gradeBtns = [];
    for (var g = 1; g <= 6; g++) (function (g) {
      var b = btn('th-grade', g + '학년', function () { setGrade(g); });
      b.setAttribute('role', 'radio'); ui.gradeBtns.push(b); gr.appendChild(b);
    })(g);
    body.appendChild(gr);
    ui.gradeNote = el('p', 'th-grade-note'); body.appendChild(ui.gradeNote);
    ui.ticketNote = el('p', 'th-ticket-note'); body.appendChild(ui.ticketNote);
    var acts = el('div', 'th-dialog-acts');
    ui.goBtn = btn('th-choice', '연구소 들어가기', function () { closeDialog(); openGame(S.grade); });
    acts.appendChild(ui.goBtn);
    acts.appendChild(btn('th-choice light', '나중에 할래', closeDialog));
    body.appendChild(acts);
    d.appendChild(body);
    lobby.appendChild(d);
    stage.appendChild(lobby);
    ui.root.appendChild(stage);

    ui.canvas.addEventListener('pointerdown', function (e) {
      if (S.dialog) return;
      var r = ui.canvas.getBoundingClientRect(), p = { x: (e.clientX - r.left) / r.width * IW, y: (e.clientY - r.top) / r.height * IH };
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
    // 이번 판 인물: 이 학년에서 아직 안 만난 인물부터(다 만났으면 바로 전 판과 다른 인물)
    var d = thrillData(), met = d.met['g' + g] || [], n = MS.GRADES[g].people.length;
    S.who = MS.pick(g, met, d.last['g' + g]);
    var park = api().profile().grade || null, def = MS.person(g, S.who);
    ui.gradeNote.textContent = '이번에 만날 인물: ' + def.emoji + ' ' + def.who + ' (' + def.topic + ') · ' + g + '학년 인물 ' + n + '명 중 ' + Math.min(met.length, n) + '명 만났어요' +
      (park && park !== g ? ' · 바꾼 학년은 이번 놀이에만 써요.' : '');
    ui.ticketNote.textContent = api().ticketNote ? api().ticketNote('thrill', g) : '';   // 모든 건물 같은 티켓 규칙(game.js)
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
  function stepLobby(dt) {
    if (S.dialog) { S.me.moving = false; return; }
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
    S.nearToto = Math.hypot(me.x - TOTO.x, (me.y - TOTO.y) * 1.4) < 240;
    S.nearExit = !S.nearToto && me.y > EXIT_Y;
    ui.talk.hidden = !S.nearToto;
    ui.leave.hidden = !S.nearExit;
    if (S.nearToto) { ui.talk.style.left = pct(TOTO.x, IW); ui.talk.style.top = pct(TOTO.y - TOTO.h - 66, IH); }
    if (S.nearExit) { ui.leave.style.left = pct(me.x, IW); ui.leave.style.top = pct(me.y - charH(me.y) - 64, IH); }
  }
  // 토토 수첩 대기 8프레임: 수첩을 펼쳐 읽고(길게) 덮음. 대화 중에는 수첩을 펼친 채 웃는 칸
  var TOTO_MS = [1100, 160, 160, 900, 260, 900, 160, 160];
  var TOTO_TOTAL = TOTO_MS.reduce(function (a, b) { return a + b; }, 0);
  function totoFrame(t) {
    var ms = (t * 1000) % TOTO_TOTAL;
    for (var i = 0; i < 8; i++) { if (ms < TOTO_MS[i]) return i; ms -= TOTO_MS[i]; }
    return 0;
  }
  function drawToto(c, x, y, h, t, still) {
    var im = img('toto'); if (!ready(im)) return;
    var k = h / 388, fi = still ? 4 : totoFrame(t);
    c.save(); c.fillStyle = 'rgba(90,40,40,0.25)';
    c.beginPath(); c.ellipse(x, y, 58, 14, 0, 0, Math.PI * 2); c.fill(); c.restore();
    c.drawImage(im, fi * 300, 0, 300, 440, x - 150 * k, y - 425 * k, 300 * k, 440 * k);
  }
  function drawLobby(t) {
    var c = ui.canvas.getContext('2d');
    c.clearRect(0, 0, IW, IH);
    var items = [
      { y: TOTO.y, draw: function () { drawToto(c, TOTO.x, TOTO.y, TOTO.h, t, S.dialog); } },
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

  // ================================================================
  // 장면 2: 게임
  // ================================================================
  function buildGame() {
    var g = ui.game = el('div', 'th-game'); g.hidden = true;
    // 위: 학년 · 목표 · 도움말 · 나가기
    var top = el('div', 'th-top');
    ui.gradeChip = el('p', 'th-gchip');
    ui.goal = el('p', 'th-goal'); ui.goal.setAttribute('aria-live', 'polite');
    ui.helpBtn = btn('th-pill', '? 도움말', function () { showHowTo(false); });
    ui.exitBtn = btn('th-pill', '나가기', toLobby);
    ui.exitBtn.setAttribute('aria-label', '나가기 — 토토가 있는 광장으로');
    [ui.gradeChip, ui.goal, ui.helpBtn, ui.exitBtn].forEach(function (n) { top.appendChild(n); });
    g.appendChild(top);
    // 가운데: 경기장
    var mid = ui.mid = el('div', 'th-mid');
    var ar = ui.arena = el('div', 'th-arena');
    ui.gc = el('canvas', 'th-gcanvas'); ui.gc.width = IW; ui.gc.height = IH;
    ui.gc.setAttribute('role', 'img'); ui.gc.setAttribute('aria-label', '범퍼카 경기장');
    ar.appendChild(ui.gc);
    ui.say = el('div', 'th-say'); ui.say.hidden = true;
    var sf = el('img', 'th-say-face'); sf.src = BASE + 'toto-face.webp'; sf.alt = '';
    ui.sayText = el('p', 'th-say-text'); ui.sayText.setAttribute('aria-live', 'polite');
    ui.say.appendChild(sf); ui.say.appendChild(ui.sayText);
    mid.appendChild(ui.say);   // 말풍선 자리는 layoutArena 가 정함(넓은 화면: 경기장 왼쪽 위 / 세로 화면: 경기장 바로 위 빈 곳)
    ui.log = el('div', 'th-log'); ui.log.hidden = true; ar.appendChild(ui.log);
    ui.toast = el('p', 'th-toast'); ui.toast.hidden = true; ui.toast.setAttribute('role', 'status'); ar.appendChild(ui.toast);
    ui.modal = el('div', 'th-modal'); ui.modal.hidden = true;
    ui.card = el('div', 'th-card'); ui.card.setAttribute('role', 'dialog'); ui.card.setAttribute('aria-modal', 'true');
    ui.modal.appendChild(ui.card); ar.appendChild(ui.modal);
    mid.appendChild(ar);
    g.appendChild(mid);
    // 아래: 방향 패드 · 학년 버튼 · 다시 시도
    var bot = el('div', 'th-bot');
    ui.pad = el('div', 'th-pad');
    ui.pad.setAttribute('role', 'group'); ui.pad.setAttribute('aria-label', '방향 패드 (8방향)');
    ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'].forEach(function (a, i) {
      var s = el('span', 'th-pad-a th-pad-' + i, a); s.setAttribute('aria-hidden', 'true'); ui.pad.appendChild(s);
    });
    ui.padKnob = el('span', 'th-pad-knob'); ui.pad.appendChild(ui.padKnob);
    bot.appendChild(ui.pad);
    ui.acts = el('div', 'th-acts');
    bot.appendChild(ui.acts);
    g.appendChild(bot);
    ui.root.appendChild(g);
    bindPad();
    window.addEventListener('resize', layoutArena);
  }
  function layoutArena() {
    if (!S.open || S.scene !== 'game') return;
    var w = ui.mid.clientWidth, h = ui.mid.clientHeight;
    var aw = Math.min(w, h * IW / IH), ah = aw * IH / IW;
    ui.arena.style.width = aw + 'px'; ui.arena.style.height = ah + 'px';
    ui.arena.style.fontSize = Math.max(11, Math.min(20, aw / 62)) + 'px';
    var left = (w - aw) / 2, top = (h - ah) / 2, sy = ui.say.style;
    if (top > 90) { sy.left = left + 'px'; sy.top = 'auto'; sy.bottom = (h - top + 8) + 'px'; sy.maxWidth = aw + 'px'; sy.fontSize = ''; }
    else { sy.left = (left + aw * 0.012) + 'px'; sy.top = (top + ah * 0.02) + 'px'; sy.bottom = 'auto'; sy.maxWidth = (aw * 0.58) + 'px'; sy.fontSize = ui.arena.style.fontSize; }
  }

  // ---------- 방향 패드(8방향, 누른 채 끌면 방향이 바뀜) ----------
  var padId = null;
  function bindPad() {
    function setFrom(e) {
      var r = ui.pad.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      var d = Math.hypot(dx, dy);
      if (d < r.width * 0.12) { S.pad = { x: 0, y: 0 }; }
      else {
        var a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
        S.pad = { x: Math.round(Math.cos(a)), y: Math.round(Math.sin(a)) };
      }
      var k = Math.min(1, d / (r.width * 0.36));
      ui.padKnob.style.transform = 'translate(calc(-50% + ' + (d ? dx / d * k * r.width * 0.3 : 0) + 'px), calc(-50% + ' + (d ? dy / d * k * r.width * 0.3 : 0) + 'px))';
      ui.pad.classList.add('on');
    }
    function release() {
      padId = null; S.pad = { x: 0, y: 0 };
      ui.padKnob.style.transform = ''; ui.pad.classList.remove('on');
    }
    ui.pad.addEventListener('pointerdown', function (e) {
      e.preventDefault(); padId = e.pointerId;
      try { ui.pad.setPointerCapture(e.pointerId); } catch (er) { /* 없음 */ }
      setFrom(e);
    });
    ui.pad.addEventListener('pointermove', function (e) { if (e.pointerId === padId) setFrom(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
      ui.pad.addEventListener(t, function (e) { if (e.pointerId === padId) release(); });
    });
    ui.releasePad = release;
  }
  function releaseAll() { S.keys = {}; if (ui.releasePad) ui.releasePad(); }
  function inputVec() {
    var x = (S.keys.right ? 1 : 0) - (S.keys.left ? 1 : 0) + S.pad.x, y = (S.keys.down ? 1 : 0) - (S.keys.up ? 1 : 0) + S.pad.y;
    return [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))];
  }

  // ---------- 열기 ----------
  function openGame(g) {
    S.grade = g; S.mode = 'practice'; S.fx = []; S.crashT = 9;
    S.ms = MS.create('free', g);
    showScene('game');
    ui.gradeChip.textContent = g + '학년';
    if (S.who == null) S.who = MS.pick(g, thrillData().met['g' + g], thrillData().last['g' + g]);
    ui.arena.style.backgroundImage = 'url(' + BASE + (MS.GRADES[g].night ? 'arena-night' : 'arena-day') + '.webp)';
    ui.arena.classList.toggle('night', !!MS.GRADES[g].night);
    setSay(''); hideModal(); ui.log.hidden = true;
    renderActs(); updateGoal();
    layoutArena();
    showHowTo(true);
  }
  function startPractice() {
    hideModal(); S.mode = 'practice';
    S.ms = MS.create('free', S.grade);
    if (S.ms.night) S.ms.lights = true;
    setSay('먼저 자유롭게 몰아 봐! 사방과 대각선으로 달리고, 손을 떼면 미끄러지다 멈춰. 준비되면 [미션 시작]!');
    renderActs(); updateGoal();
  }
  function startMission() {
    S.mode = 'mission'; S.fx = [];
    S.ms = MS.create(S.grade, null, null, S.who);
    renderActs(); updateGoal(); renderLog();
    stageCard(S.ms.stageIntro(), '미션 · ' + S.ms.def.title);
  }
  function startFree() {
    hideModal(); S.mode = 'free'; S.fx = [];
    S.ms = MS.create('free', S.grade);
    if (S.ms.night) S.ms.lights = true;
    ui.log.hidden = true;
    setSay('자유 주행! 마음껏 달려 봐. 위 [나가기]로 광장에 돌아갈 수 있어.');
    renderActs(); updateGoal();
  }
  function updateGoal() {
    var t = S.mode === 'practice' ? '자유 연습 · 준비되면 [미션 시작]' : S.ms.goal();
    if (ui.goal.textContent !== t) ui.goal.textContent = t;
  }

  // ---------- 아래 버튼 ----------
  function renderActs() {
    var box = ui.acts; box.textContent = '';
    var list = S.ms.buttons();
    list.forEach(function (b) {
      var x = btn('th-act' + (b.on ? ' on' : '') + (b.glow ? ' glow' : ''), b.label, function () {
        if (S.modal) return;
        handle(S.ms.action(b.id)); renderActs(); updateGoal();
      });
      x.disabled = !!b.disabled; x.setAttribute('aria-pressed', String(!!b.on));
      x.dataset.id = b.id;
      box.appendChild(x);
    });
    if (S.mode === 'practice') box.appendChild(btn('th-act main', '▶ 미션 시작', startMission));
    if (S.mode === 'mission' && !S.ms.done) box.appendChild(btn('th-act retry', '↺ 처음 자리로', retry));
    if (S.mode === 'free') box.appendChild(btn('th-act main', '다른 학년 선택', toGradeSelect));
    S.actsSig = sig(list);
  }
  function sig(list) { return list.map(function (b) { return b.id + b.label + (b.on ? 1 : 0) + (b.glow ? 1 : 0) + (b.disabled ? 1 : 0); }).join('|') + S.mode; }
  function retry() {
    if (S.modal || S.mode !== 'mission') return;
    S.ms.retry(); S.fx = []; S.crashT = 9;
    setSay('차를 처음 자리로 돌려놨어. 모은 카드는 그대로야!');
    renderActs(); renderLog();
  }

  // ---------- 토토 말풍선 · 기록 · 알림 ----------
  var sayT = 0;
  function setSay(text) {
    ui.say.hidden = !text;
    if (!text) return;
    ui.sayText.textContent = text;
    ui.say.classList.remove('pop'); void ui.say.offsetWidth; ui.say.classList.add('pop');
    clearTimeout(sayT); sayT = setTimeout(function () { ui.say.classList.add('dim'); }, 9000);
    ui.say.classList.remove('dim');
  }
  var toastT = 0;
  function toast(text) {
    ui.toast.textContent = text; ui.toast.hidden = false;
    ui.toast.classList.remove('pop'); void ui.toast.offsetWidth; ui.toast.classList.add('pop');
    clearTimeout(toastT); toastT = setTimeout(function () { ui.toast.hidden = true; }, 2600);
  }
  // 오른쪽 위 '모은 카드': 누르면 그 이야기를 다시 봄
  function renderLog() {
    var ms = S.ms;
    if (S.mode !== 'mission') { ui.log.hidden = true; return; }
    ui.log.hidden = false; ui.log.textContent = '';
    ui.log.appendChild(el('p', 'th-log-title', '모은 카드 ' + ms.got() + ' / 3'));
    ms.cards.forEach(function (c, i) {
      var d = ms.def.cards[c.i];
      if (!c.got) { ui.log.appendChild(el('p', 'th-log-empty', (i + 1) + '. ☆ 아직 못 찾았어요')); return; }
      var b = btn('th-log-card', (c.i + 1) + '. ' + d.emoji + ' ' + d.title, function () { if (!S.modal) storyCard(d, c.i + 1, true); });
      b.setAttribute('aria-label', d.title + ' 이야기 다시 보기');
      ui.log.appendChild(b);
    });
  }

  // ---------- 카드 ----------
  function showModal(title, lines, btns, node, variant) {
    var c = ui.card; c.textContent = '';
    ui.modal.className = 'th-modal' + (variant ? ' ' + variant : '');
    var h = el('h2', 'th-card-title', title); h.id = 'thCardTitle'; c.setAttribute('aria-labelledby', 'thCardTitle');
    c.appendChild(h);
    if (node) c.appendChild(node);
    lines.forEach(function (l) { if (l) c.appendChild(el('p', 'th-card-line', l)); });
    var row = el('div', 'th-card-btns');
    btns.forEach(function (b) { row.appendChild(btn('th-choice' + (b.main ? '' : ' light'), b.text, b.fn)); });
    c.appendChild(row);
    ui.modal.hidden = false; S.modal = true; releaseAll();
    var f = row.querySelector('.th-choice:not(.light)') || row.querySelector('button');
    if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function hideModal() { ui.modal.hidden = true; S.modal = false; S.helpOpen = false; S.last = performance.now(); }
  function howToNode(g) {
    var def = MS.person(g, S.who), box = el('div', 'th-howto');
    box.appendChild(el('p', 'th-howto-sub', g + '학년 · ' + def.subject));
    var ol = el('ol', 'th-steps');
    [['🎯 목표', def.howto.goal], ['🕹️ 이동', def.howto.move + ' 방향키·WASD 또는 왼쪽 아래 방향 패드(대각선도 돼요).'],
     ['🔘 이번 조작', def.howto.ctrl.join(' · ')]].forEach(function (s) {
      var li = el('li', 'th-step');
      li.appendChild(el('p', 'th-step-title', s[0]));
      li.appendChild(el('p', 'th-step-sub', s[1]));
      ol.appendChild(li);
    });
    box.appendChild(ol);
    box.appendChild(el('p', 'th-howto-tip', '틀려도 괜찮아요! 토토가 어느 카드를 다시 보면 좋은지 알려 줘요.'));
    return box;
  }
  function showHowTo(first) {
    if (S.modal && !first) return;
    var def = MS.person(S.grade, S.who);
    showModal(def.title, [], [first
      ? { text: '게임 시작', main: true, fn: function () { var d = thrillData(); if (!d.howto) { d.howto = true; writeThrill(d); } startPractice(); } }
      : { text: '계속하기', main: true, fn: hideModal }], howToNode(S.grade), 'howto');
    S.helpOpen = !first;
  }
  function stageCard(text, title) {
    showModal(title || '다음 단계', [text], [{ text: '좋아, 해 볼게!', main: true, fn: function () { hideModal(); setSay(text); } }], null, 'stage');
  }
  // 이야기 카드: 과학자 이야기 한 장(다 읽으면 다음 — 3장째면 퀴즈)
  function storyCard(d, n, again) {
    var node = el('div', 'th-story');
    node.appendChild(el('p', 'th-story-emoji', d.emoji));
    node.appendChild(el('p', 'th-story-who', S.ms.def.who + ' 이야기 ' + n + ' / 3'));
    node.appendChild(el('p', 'th-story-text', d.text));
    var last = !again && S.ms.got() === 3;
    showModal(d.title, [], [{ text: again ? '닫기' : last ? '퀴즈 풀러 가기!' : '다음 카드 찾으러 가기', main: true, fn: function () {
      hideModal(); renderLog();
      if (!again) { setSay(last ? '카드를 다 모았어! 이야기를 떠올리며 퀴즈를 풀어 보자.' : '좋아! 남은 별 카드 ' + (3 - S.ms.got()) + '장도 찾아볼까?'); handle(S.ms.storyDone()); }
    } }], node, 'story');
  }
  function askCard(q) {
    var btns = q.options.map(function (o) {
      return { text: o.label, main: true, fn: function () { hideModal(); handle(S.ms.answer(q.id, o.id)); renderActs(); renderLog(); } };
    });
    showModal('토토의 퀴즈', [q.text], btns, null, 'ask');
  }

  // ---------- 사건 처리 ----------
  function handle(evs) {
    evs.forEach(function (e) {
      if (e.type === 'hint') setSay(e.text);
      else if (e.type === 'note') { toast(e.text); renderLog(); }
      else if (e.type === 'story') { var k = S.ms.cards.filter(function (q) { return S.ms.def.cards[q.i] === e.card; })[0]; if (k) S.fx.push({ kind: 'grab', x: k.x, y: k.y, t: 0, life: 0.6 }); renderLog(); storyCard(e.card, e.n, false); }
      else if (e.type === 'ask') { renderLog(); askCard(e.q); }
      else if (e.type === 'complete') { renderLog(); renderActs(); S.finishing = true; setTimeout(finish, 700); }
      else if (e.type === 'crash') { if (S.crashT > 0.35) { S.crashT = 0; S.crashN = e.n; } }
    });
  }
  function finish() {
    S.finishing = false;
    if (S.mode !== 'mission' || !S.ms.done || S.ms.rewarded) return;
    S.ms.rewarded = true;   // 한 판에 한 번만 계산
    var g = S.grade, d = thrillData(), first = !d.cleared, firstGrade = !d.done['g' + g];
    d.done['g' + g] = true;
    var met = d.met['g' + g] || [];
    if (met.indexOf(S.ms.who) < 0) met.push(S.ms.who);
    d.met['g' + g] = met; d.last['g' + g] = S.ms.who;
    S.who = MS.pick(g, met, S.ms.who);   // 다음 판은 다른 인물
    if (!d.cleared) d.cleared = true;   // 어느 학년이든 첫 완료 때 한 번만(건물 보상 캐릭터)
    var saved = writeThrill(d);
    var tk = api().awardTicket ? api().awardTicket('thrill', g) : null;   // 학년마다 처음 1장, 모든 건물 합쳐 하루 3장
    var lines = [resultLine(g)], n = MS.GRADES[g].people.length;
    if (tk) lines.push(tk.line);
    lines.push(met.length < n ? '다음 판에는 새 인물 ' + MS.person(g, S.who).emoji + ' ‘' + MS.person(g, S.who).who + '’ 이야기가 기다려요! (' + g + '학년 인물 ' + met.length + ' / ' + n + '명 만남)'
      : '🎉 ' + g + '학년 인물 ' + n + '명을 모두 만났어요!');
    if (first) {
      var r = window.MPChars && MPChars.byId('R4');
      lines.push('★ 건물 보상 ‘' + (r ? r.name : '범퍼카 레이서') + '’ 캐릭터를 받았어요! 공원 위쪽 ‘캐릭터’에서 골라 봐요.');
    } else if (firstGrade) lines.push(g + '학년 미션을 처음 끝냈어요! (건물 보상 캐릭터는 이미 받았어요)');
    if (!saved) lines.push('이 기기에는 저장되지 않았어요. 기록은 이번에만 남아요.');
    showModal('미션 완료!', lines, [
      { text: '🚗 자유 주행', main: true, fn: startFree },
      { text: '다른 학년 선택', fn: toGradeSelect },
      { text: '공원으로 돌아가기', fn: close }
    ], null, 'done');
  }
  function resultLine() {
    var d = S.ms.def;
    return d.emoji + ' ' + d.who + ' 이야기 카드 3장을 모으고, 퀴즈 3문제를 모두 맞혔어요!';
  }

  // ================================================================
  // 그리기
  // ================================================================
  var CAR_K = 0.48, CAR_FOOT = 44;   // 차 그림 배율, 충돌 원 가운데에서 범퍼 바닥까지(그림 아래쪽으로)
  function drawGame(t) {
    var c = ui.gc.getContext('2d'), ms = S.ms;
    c.clearRect(0, 0, IW, IH);
    var items = [{ y: ms.world.car.y, draw: function () { drawCar(c, ms.world.car, t); } }];
    ms.cards.forEach(function (k) { if (!k.got) items.push({ y: k.y + 30, draw: function () { drawStoryStar(c, k, t); } }); });
    items.sort(function (a, b) { return a.y - b.y; }).forEach(function (i) { i.draw(); });
    if (ms.night) drawNight(c, ms, t);
    drawFx(c);
    if (DEBUG) drawDebug(c, ms);
  }
  // 별 이야기 카드: 바닥에서 둥실 떠 반짝이는 카드(코드로 그림)
  function drawStoryStar(c, k, t) {
    var bob = Math.sin(t * 3 + k.i * 2) * 8, x = k.x, y = k.y - 40 + bob;
    c.save();
    c.fillStyle = 'rgba(40,30,10,0.22)'; c.beginPath(); c.ellipse(k.x, k.y + 22, 46, 14, 0, 0, Math.PI * 2); c.fill();
    var g = c.createRadialGradient(x, y, 10, x, y, 90); g.addColorStop(0, 'rgba(255,236,140,0.85)'); g.addColorStop(1, 'rgba(255,220,90,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 90, 0, Math.PI * 2); c.fill();
    c.translate(x, y); c.rotate(Math.sin(t * 2 + k.i) * 0.08);
    rr(c, -40, -52, 80, 104, 14); c.fillStyle = '#fffaf0'; c.fill(); c.lineWidth = 6; c.strokeStyle = '#e2a72e'; c.stroke();
    starPath(c, 0, -8, 30); c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#b87a00'; c.stroke();
    c.font = "30px 'Gowun Dodum', 'Malgun Gothic', sans-serif"; c.textAlign = 'center'; c.fillStyle = '#c0392b'; c.fillText(String(k.i + 1), 0, 42);
    c.restore();
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function arenaPath(c) {
    var A = P.ARENA;
    c.beginPath();
    c.moveTo(A.x0 + A.rt, A.y0); c.arcTo(A.x1, A.y0, A.x1, A.y1, A.rt); c.arcTo(A.x1, A.y1, A.x0, A.y1, A.rb);
    c.arcTo(A.x0, A.y1, A.x0, A.y0, A.rb); c.arcTo(A.x0, A.y0, A.x1, A.y0, A.rt); c.closePath();
  }
  function starPath(c, x, y, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; if (i) c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); else c.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    c.closePath();
  }
  // 범퍼카: → 는 주행 8프레임 반복 / 충돌 8프레임 한 번, ← 는 좌우 반전, 나머지 방향은 기본 자세 + 흔들림·반동
  function drawCar(c, car, t) {
    var sp = Math.hypot(car.vx, car.vy), di = P.dirIndex(car.ang), side = di === 6 || di === 2;
    var crashing = S.crashT < 0.5, k = CAR_K;
    var x = car.x, foot = car.y + CAR_FOOT, ox = 0, oy = 0, rot = 0;
    // 그림자
    c.save(); c.fillStyle = 'rgba(20,20,40,0.28)'; c.beginPath(); c.ellipse(x, car.y + 30, 74, 28, 0, 0, Math.PI * 2); c.fill(); c.restore();
    var im, fi = 0;
    if (side && crashing) { im = img('car-crash'); fi = Math.min(7, Math.floor(S.crashT / 0.5 * 8)); }
    else if (side && sp > 25) { im = img('car-drive'); fi = Math.floor(t * (8 + sp / 40)) % 8; }
    else {
      im = img('car-dir'); fi = di;
      if (sp > 25) { oy = Math.sin(t * 22) * 2.2; rot = Math.sin(t * 15) * 0.018; }
      if (crashing) {
        var q = 1 - S.crashT / 0.5, n = S.crashN || { nx: 0, ny: 0 };
        ox = -n.nx * 14 * q + Math.sin(S.crashT * 60) * 5 * q; oy += -n.ny * 10 * q; rot += Math.sin(S.crashT * 50) * 0.05 * q;
      }
    }
    if (!ready(im)) return;
    c.save();
    c.translate(x + ox, foot + oy);
    if (rot) c.rotate(rot);
    if (di === 2 && im !== imgs['car-dir']) c.scale(-1, 1);
    c.drawImage(im, fi * 360, 0, 360, 420, -180 * k, -404 * k, 360 * k, 420 * k);
    c.restore();
  }
  // 밤 경기장(5학년): 어둠 위에 헤드라이트 빛을 뚫어 그림
  var dark = null;
  function drawNight(c, ms, t) {
    if (!dark) { dark = document.createElement('canvas'); dark.width = IW / 2; dark.height = IH / 2; }
    var d = dark.getContext('2d'), car = ms.world.car;
    d.setTransform(1, 0, 0, 1, 0, 0); d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, dark.width, dark.height);
    d.fillStyle = 'rgba(4,8,30,0.8)'; d.fillRect(0, 0, dark.width, dark.height);
    d.setTransform(0.5, 0, 0, 0.5, 0, 0);
    d.globalCompositeOperation = 'destination-out';
    // 차 둘레는 살짝 보이게
    var g = d.createRadialGradient(car.x, car.y, 20, car.x, car.y, 170); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g; d.beginPath(); d.arc(car.x, car.y, 170, 0, Math.PI * 2); d.fill();
    // 경기장 위 조명 세 개 아래도 조금
    [[512, 186], [836, 186], [1160, 186]].forEach(function (p) { var q = d.createRadialGradient(p[0], p[1], 10, p[0], p[1], 150); q.addColorStop(0, 'rgba(0,0,0,0.5)'); q.addColorStop(1, 'rgba(0,0,0,0)'); d.fillStyle = q; d.beginPath(); d.arc(p[0], p[1], 150, 0, Math.PI * 2); d.fill(); });
    var rays = ms.rays();
    if (rays.length) {
      d.fillStyle = 'rgba(0,0,0,0.92)';
      lightPolys(rays, function (poly) { d.beginPath(); poly.forEach(function (p, i) { if (i) d.lineTo(p.x, p.y); else d.moveTo(p.x, p.y); }); d.closePath(); d.fill(); });
    }
    // 별 이야기 카드는 어둠 속에서도 스스로 빛남(어디 있는지 보이게)
    ms.cards.forEach(function (k) {
      if (k.got) return;
      var q = d.createRadialGradient(k.x, k.y - 40, 10, k.x, k.y - 40, 120); q.addColorStop(0, 'rgba(0,0,0,0.95)'); q.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = q; d.beginPath(); d.arc(k.x, k.y - 40, 120, 0, Math.PI * 2); d.fill();
    });
    c.drawImage(dark, 0, 0, IW, IH);
    if (rays.length) {
      c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,236,150,0.13)';
      lightPolys(rays, function (poly) { c.beginPath(); poly.forEach(function (p, i) { if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.closePath(); c.fill(); });
      c.restore();
    }
  }
  // 광선 묶음 → 빛 다각형(헤드라이트 부채꼴)
  function lightPolys(rays, fn) {
    var first = [rays[0].pts[0]];
    rays.forEach(function (r) { first.push(r.pts[1]); });
    fn(first);
    for (var i = 1; i < rays.length; i++) {
      var a = rays[i - 1].pts, b = rays[i].pts;
      for (var s = 1; s + 1 < Math.min(a.length, b.length); s++) fn([a[s], a[s + 1], b[s + 1], b[s]]);
    }
  }
  function drawFx(c) {
    S.fx.forEach(function (f) {
      var a = Math.max(0, 1 - f.t / f.life);
      if (f.kind !== 'grab') return;
      c.save(); c.globalAlpha = a;
      for (var i = 0; i < 8; i++) { var ang = i * Math.PI / 4 + f.t * 2, r = 30 + f.t * 160; starPath(c, f.x + Math.cos(ang) * r, f.y - 40 + Math.sin(ang) * r, 14); c.fillStyle = '#ffd23f'; c.fill(); }
      c.restore();
    });
  }
  function drawDebug(c, ms) {
    var w = ms.world;
    c.save(); c.strokeStyle = 'lime'; c.lineWidth = 3;
    arenaPath(c); c.stroke();
    c.strokeStyle = 'red';
    [w.car].concat(w.bodies).forEach(function (o) { c.beginPath(); c.arc(o.x, o.y, o.r, 0, Math.PI * 2); c.stroke(); });
    (w.boxes || []).forEach(function (b) { c.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); });
    c.strokeStyle = 'gold'; S.ms.cards.forEach(function (k) { c.beginPath(); c.arc(k.x, k.y, MS.GRAB, 0, Math.PI * 2); c.stroke(); });
    c.restore();
  }

  // ================================================================
  // 루프 · 열기 · 닫기 · 장면
  // ================================================================
  function loop(now) {
    if (!S.open) return;
    var dt = Math.min(0.05, (now - S.last) / 1000); S.last = now;
    var t = now / 1000;
    if (S.scene === 'lobby') { stepLobby(dt); drawLobby(t); }
    else if (S.ms) {
      if (!S.modal && !S.finishing) {
        var i = inputVec();
        handle(S.ms.step(i[0], i[1], dt));
        S.crashT += dt;
        if (sig(S.ms.buttons()) !== S.actsSig) renderActs();
        updateGoal();
      }
      S.fx.forEach(function (f) { f.t += dt; });
      S.fx = S.fx.filter(function (f) { return f.t < f.life; });
      drawGame(t);
    }
    S.raf = requestAnimationFrame(loop);
  }
  function open() {
    if (!ui.root) return;
    S.grade = api().profile().grade || 1;   // 공원 학년이 기본. 대화창에서 바꾼 학년은 이번 놀이에만
    S.open = true;
    ui.root.hidden = false;
    document.body.classList.add('thrill-open');
    S.me = { x: 836, y: 860, dir: 'up', moving: false };
    S.dest = null; releaseAll(); closeDialog();
    ui.tip.hidden = false;
    showScene('lobby');
    ui.canvas.focus && ui.canvas.focus();
  }
  function close() {
    S.open = false; cancelAnimationFrame(S.raf); hideModal(); releaseAll();
    ui.root.hidden = true;
    document.body.classList.remove('thrill-open');
    if (api().exitThrill) api().exitThrill();
  }
  function showScene(name) {
    S.scene = name;
    ui.lobbyStage.hidden = name !== 'lobby';
    ui.game.hidden = name !== 'game';
    S.last = performance.now();
    cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(loop);
    if (name === 'game') setTimeout(layoutArena, 0);
  }
  function toLobby() {
    hideModal(); releaseAll(); S.finishing = false;
    S.me = { x: TOTO.x + 150, y: TOTO.y + 50, dir: 'left', moving: false };   // 토토 앞에 서서 바로 다시 말을 걸 수 있게
    S.dest = null; closeDialog(); ui.tip.hidden = true;
    showScene('lobby');
  }
  function toGradeSelect() { toLobby(); openDialog(); }

  // ---------- 입력 ----------
  function onKey(e, down) {
    if (!S.open) return;
    if (S.scene === 'lobby' && !S.dialog) {
      if (KEYMAP[e.code]) { e.preventDefault(); S.keys[KEYMAP[e.code]] = down; return; }
      if (down && e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (S.nearToto) openDialog(); else if (S.nearExit) close();
      }
      if (down && e.code === 'Escape') { e.preventDefault(); close(); }
      return;
    }
    if (S.dialog) { if (down && e.code === 'Escape') { e.preventDefault(); closeDialog(); } return; }
    if (S.scene === 'game') {
      if (KEYMAP[e.code] && !S.modal) { e.preventDefault(); S.keys[KEYMAP[e.code]] = down; return; }
      if (KEYMAP[e.code]) { S.keys[KEYMAP[e.code]] = false; return; }
      if (down && e.code === 'Escape' && S.modal && S.helpOpen) { e.preventDefault(); hideModal(); }
    }
  }

  function init() {
    ui.root = document.getElementById('thrill');
    if (!P || !MS || !ui.root) return;
    ui.root.textContent = '';
    buildLobby();
    buildGame();
    window.addEventListener('keydown', function (e) { onKey(e, true); });
    window.addEventListener('keyup', function (e) { onKey(e, false); });
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', function () { if (document.hidden) releaseAll(); });
    ['car-dir', 'car-drive', 'car-crash', 'toto'].forEach(img);
  }
  window.MPThrill = {
    open: open, close: close, _S: S, _ui: ui,
    // 검증용: 바로 미션 열기, 시간 흘리기(화면이 숨겨져 애니메이션이 느릴 때)
    _openGame: function (g, who) { if (!S.open) open(); S.who = who == null ? null : who; openGame(g); },
    _tick: function (sec, ix, iy) {
      var step = 1 / 60;
      for (var t = 0; t < sec; t += step) {
        if (S.scene === 'lobby') { if (ix != null) { S.keys = { left: ix < 0, right: ix > 0, up: iy < 0, down: iy > 0 }; } stepLobby(step); continue; }
        if (S.modal || S.finishing || !S.ms) continue;
        handle(S.ms.step(ix || 0, iy || 0, step)); S.crashT += step;
        S.fx.forEach(function (f) { f.t += step; });
      }
      if (S.scene === 'lobby') drawLobby(0); else { renderActs(); updateGoal(); drawGame(performance.now() / 1000); }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
