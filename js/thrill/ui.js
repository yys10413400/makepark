/*
 * 짜릿 어드벤처 — 토토의 범퍼카 연구소
 * ------------------------------------------------------------
 * 장면 1 로비(assets/thrill/lobby.webp, 1672×941): 공원 캐릭터로 빨간 지붕 범퍼카장 앞 광장을 걷다가
 *        왼쪽 기록대 옆 수달 연구원 토토에게 '말 걸기' → 첫 대사 · 1~6학년 고르기 → 연구소 들어가기
 *        (걷기·말 걸기·학년 고르기·나가기는 코스터역 대기실(js/coaster/ui.js)과 같은 방식)
 * 장면 2 게임(같은 창 안에서 로비와 바꿔 보여 줌 — 코스터와 같은 방식)
 *        위: 학년 · 이번 목표 한 줄 · 도움말 · 나가기 / 가운데: 16:9 경기장(낮·밤) / 아래: 방향 패드 · 학년별 버튼 · 다시 시도
 *        하는 방법 카드 → [게임 시작] → 자유 연습 → [미션 시작] → 단계마다 짧은 안내 → 결과
 *        결과: [자유 주행] [다른 학년 선택] [공원으로 돌아가기]
 * 움직임·판정: js/thrill/physics.js, 학년 미션: js/thrill/missions.js (확인: node tools/verify_thrill.js)
 * 그림: assets/thrill/ (python -I tools/build_thrill.py 로 assets/thrill-src 원본에서 만듦)
 *   car-dir.webp 8칸(↓ ↙ ← ↖ ↑ ↗ → ↘), car-drive/crash.webp 오른쪽 8프레임 — 칸 360×420, 범퍼 바닥 (180, 404)
 *   toto.webp 수첩 대기 8프레임 — 칸 300×440, 발 (150, 425)
 * 저장(window.MP_API): save.thrill = { howto, done: { g1: true … }, cleared }
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
  var FLOOR = [[0, 560], [150, 520], [300, 478], [372, 470], [380, 432], [520, 432], [548, 478], [760, 492], [1110, 492], [1262, 476], [1290, 446], [1420, 498], [1672, 548], [1672, 934], [0, 934]];
  var TOTO = { x: 560, y: 500, h: 210 };
  var BLOCKS = [{ x: 428, y: 470, rx: 56, ry: 22 }, { x: 322, y: 462, rx: 30, ry: 14 }, { x: TOTO.x, y: TOTO.y, rx: 50, ry: 20 }];
  var EXIT_Y = 900, LOBBY_SCALE = 1.2, FLOOR_TOP = 470;
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
    var park = api().profile().grade || null, def = MS.GRADES[g], done = thrillData().done['g' + g];
    ui.gradeNote.textContent = g + '학년 미션: ‘' + def.title + '’ (' + def.subject + ')' + (done ? ' · 해 봤어요 ✔' : '') +
      (park && park !== g ? ' · 바꾼 학년은 이번 놀이에만 써요.' : '');
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
    var k = h / 410, fi = still ? 4 : totoFrame(t);
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
    S.ms = MS.create(S.grade);
    renderActs(); updateGoal(); renderLog();
    stageCard(S.ms.stageIntro(), '미션 · ' + MS.GRADES[S.grade].title);
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
    if (S.mode === 'mission') box.appendChild(btn('th-act retry', '↺ 다시 시도', retry));
    if (S.mode === 'free') box.appendChild(btn('th-act main', '다른 학년 선택', toGradeSelect));
    S.actsSig = sig(list);
  }
  function sig(list) { return list.map(function (b) { return b.id + b.label + (b.on ? 1 : 0) + (b.glow ? 1 : 0) + (b.disabled ? 1 : 0); }).join('|') + S.mode; }
  function retry() {
    if (S.modal || S.mode !== 'mission') return;
    S.ms.retry(); S.fx = []; S.crashT = 9;
    setSay('차와 소품을 이번 단계 처음 자리로 돌려놨어. 끝낸 단계와 관찰 기록은 그대로야!');
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
  function renderLog() {
    var ms = S.ms, lines = [];
    if (S.mode !== 'mission') { ui.log.hidden = true; return; }
    var g = ms.grade;
    if (g === 1) lines = ['<span class="th-dot"></span> 방향키를 놓은 곳', '<span class="th-star">★</span> 차가 멈춘 곳'];
    if (g === 2) ms.log.forEach(function (l) { if (l.slips != null) lines.push((l.plate === 'flat' ? '평평한' : '굽은') + ' 밀판: 옆으로 ' + l.slips + '번 빠짐'); });
    if (g === 3) { lines.push((ms.stage > 0 ? '✔' : '□') + ' 밀어서 옮기기'); lines.push((ms.done ? '✔' : '□') + ' 당겨서 옮기기'); }
    if (g === 4) ms.log.forEach(function (l) { if (l.pair) lines.push(l.pair + ' → ' + (l.kind === 'repel' ? '밀어냄' : '끌어당김')); });
    if (g === 5) { lines.push((ms.stage > 0 ? '✔' : '□') + ' 첫 표지판'); lines.push((ms.done ? '✔' : '□') + ' 숨은 표지판(반사)'); }
    if (g === 6) (ms.runs || []).forEach(function (r, i) { lines.push((i + 1) + '번 주행: ' + r.m.toFixed(1) + 'm / 3초'); });
    ui.log.hidden = !lines.length;
    ui.log.innerHTML = '<p class="th-log-title">관찰 기록</p>' + lines.map(function (l) { return '<p>' + l + '</p>'; }).join('');
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
    var def = MS.GRADES[g], box = el('div', 'th-howto');
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
    box.appendChild(el('p', 'th-howto-tip', '막히면 아래 [↺ 다시 시도] — 이번 단계 차와 소품만 처음 자리로 돌아가요. 끝낸 단계와 관찰 기록은 그대로예요.'));
    return box;
  }
  function showHowTo(first) {
    if (S.modal && !first) return;
    var def = MS.GRADES[S.grade];
    showModal(def.title, [], [first
      ? { text: '게임 시작', main: true, fn: function () { var d = thrillData(); if (!d.howto) { d.howto = true; writeThrill(d); } startPractice(); } }
      : { text: '계속하기', main: true, fn: hideModal }], howToNode(S.grade), 'howto');
    S.helpOpen = !first;
  }
  function stageCard(text, title) {
    showModal(title || '다음 단계', [text], [{ text: '좋아, 해 볼게!', main: true, fn: function () { hideModal(); setSay(text); } }], null, 'stage');
  }
  function askCard(q) {
    var node = null;
    if (q.compare) node = compareNode();
    var btns = q.options.map(function (o) {
      return { text: o.label, main: !o.light, fn: function () { hideModal(); handle(S.ms.answer(q.id, o.id)); renderActs(); renderLog(); } };
    });
    showModal('토토의 질문', [q.text], btns, node, 'ask');
  }
  // 6학년: 두 주행의 거리 · 3초 · 실제 경로를 나란히
  function compareNode() {
    var box = el('div', 'th-compare'), runs = S.ms.runs || [];
    runs.forEach(function (r, i) {
      var col = el('div', 'th-run');
      var cv = el('canvas', 'th-run-cv'); cv.width = 334; cv.height = 188;
      var c = cv.getContext('2d'), k = cv.width / IW;
      var bg = img('arena-day'); if (ready(bg)) c.drawImage(bg, 0, 0, cv.width, cv.height);
      c.save(); c.scale(k, k);
      c.strokeStyle = '#ffd23f'; c.lineWidth = 10; c.setLineDash([30, 22]); c.beginPath(); c.moveTo(S.ms.g6.lineX, 190); c.lineTo(S.ms.g6.lineX, 840); c.stroke(); c.setLineDash([]);
      c.strokeStyle = i ? '#8a4fd6' : '#ff7a1a'; c.lineWidth = 16; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath(); r.path.forEach(function (p, j) { if (j) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.stroke();
      var e = r.path[r.path.length - 1]; c.fillStyle = '#fff'; c.beginPath(); c.arc(e.x, e.y, 22, 0, Math.PI * 2); c.fill();
      c.restore();
      col.appendChild(cv);
      col.appendChild(el('p', 'th-run-t', (i + 1) + '번 주행'));
      col.appendChild(el('p', 'th-run-v', '거리 ' + r.m.toFixed(1) + 'm · 시간 3초'));
      box.appendChild(col);
    });
    return box;
  }

  // ---------- 사건 처리 ----------
  function handle(evs) {
    evs.forEach(function (e) {
      if (e.type === 'hint') setSay(e.text);
      else if (e.type === 'note') { toast(e.text); renderLog(); }
      else if (e.type === 'stage') { renderLog(); renderActs(); stageCard(e.text); }
      else if (e.type === 'ask') { renderLog(); askCard(e.q); }
      else if (e.type === 'complete') { renderLog(); S.finishing = true; setTimeout(finish, S.grade === 5 ? 3000 : 1000); }   // 5학년은 차→거울→표지판 경로를 잠깐 보여 준 뒤
      else if (e.type === 'arrow') S.fx.push({ kind: 'arrow', x: e.x, y: e.y, ang: e.ang, t: 0, life: 0.9 });
      else if (e.type === 'path') S.fx.push({ kind: 'path', pts: e.pts, t: 0, life: 4 });
      else if (e.type === 'crash') { if (S.crashT > 0.35) { S.crashT = 0; S.crashN = e.n; } }
    });
  }
  function finish() {
    S.finishing = false;
    if (S.mode !== 'mission' || !S.ms.done || S.ms.rewarded) return;
    S.ms.rewarded = true;   // 한 판에 한 번만 계산
    var g = S.grade, d = thrillData(), first = !d.cleared, firstGrade = !d.done['g' + g];
    d.done['g' + g] = true;
    if (!d.cleared) d.cleared = true;   // 어느 학년이든 첫 완료 때 한 번만(건물 보상 캐릭터)
    var saved = writeThrill(d);
    var lines = [resultLine(g)];
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
  function resultLine(g) {
    var ms = S.ms;
    if (g === 1) return '방향키를 놓는 곳을 조절해서 별 칸 두 곳에 딱 멈췄어요!';
    if (g === 2) { var f = ms.log.filter(function (l) { return l.final; })[0]; return '두 밀판을 비교하고 ' + (f && f.plate === 'flat' ? '평평한' : '굽은') + ' 밀판으로 상자를 배달했어요!'; }
    if (g === 3) return '밀면 미는 쪽으로, 당기면 당기는 쪽으로 카트가 움직였어요!';
    if (g === 4) return '같은 극은 밀어내고, 다른 극은 끌어당긴다는 것을 직접 확인했어요!';
    if (g === 5) return '빛은 곧게 나아가다 가림막에 막히고, 거울에서 꺾여 숨은 표지판을 밝혔어요!';
    var r = ms.runs || []; return '두 주행(' + r.map(function (x) { return x.m.toFixed(1) + 'm'; }).join(', ') + ')을 비교하고 평균 속력을 구했어요!';
  }

  // ================================================================
  // 그리기
  // ================================================================
  var CAR_K = 0.48, CAR_FOOT = 44;   // 차 그림 배율, 충돌 원 가운데에서 범퍼 바닥까지(그림 아래쪽으로)
  function drawGame(t) {
    var c = ui.gc.getContext('2d'), ms = S.ms, w = ms.world, L = ms.layout();
    c.clearRect(0, 0, IW, IH);
    // 바닥 표시(가장 먼저)
    if (L.corner) drawCorner(c, L.corner);
    if (L.zone) drawZone(c, L.zone, L.zoneLabel);
    if (L.pad) drawPad(c, L.pad);
    if (L.lineX) drawLine(c, L.lineX, L.meter);
    if (L.runs) L.runs.forEach(function (r, i) { drawPath(c, r.path, i ? 'rgba(138,79,214,0.55)' : 'rgba(255,122,26,0.55)', 8); });
    if (L.meter && L.meter.on) drawPath(c, L.meter.path.concat([{ x: w.car.x, y: w.car.y }]), '#18b6d8', 9);
    if (ms.grade === 1 && ms.marks && !ms.free) drawMarks(c, ms.marks);
    // 세워진 것: y 순서로
    var items = [];
    items.push({ y: w.car.y, draw: function () { drawCarAll(c, ms, t); } });
    w.bodies.forEach(function (b) { items.push({ y: b.y, draw: function () { drawBody(c, b, ms, L); } }); });
    if (L.g5) {
      var G = L.g5;
      items.push({ y: G.screen[3], draw: function () { drawScreen(c, G.screen); } });
      items.push({ y: 300, draw: function () { drawMirror(c, G.mirror); } });
      [G.sign1, G.sign2].forEach(function (s) { items.push({ y: s.y + 40, draw: function () { drawSign(c, s, ms); } }); });
    }
    items.sort(function (a, b) { return a.y - b.y; }).forEach(function (i) { i.draw(); });
    if (L.rope) drawRope(c, L.rear, L.hook, L.rope.taut);
    // 밤: 어둠 + 헤드라이트·반사광
    if (ms.night) drawNight(c, ms, t);
    drawFx(c);
    if (DEBUG) drawDebug(c, ms);
  }
  function drawAt(c, im, x, footY, k) { c.drawImage(im, x - im.naturalWidth * k / 2, footY - im.naturalHeight * k, im.naturalWidth * k, im.naturalHeight * k); }
  function drawPad(c, p) {
    var im = img('pad'); if (!ready(im)) return;
    var w = 230, h = w * im.naturalHeight / im.naturalWidth;
    c.drawImage(im, p.x - w / 2, p.y - h / 2, w, h);
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function drawZone(c, z, label) {
    c.save();
    rr(c, z[0], z[1], z[2] - z[0], z[3] - z[1], 30);
    c.fillStyle = 'rgba(255,230,120,0.22)'; c.fill();
    c.setLineDash([26, 16]); c.lineWidth = 8; c.strokeStyle = 'rgba(255,190,40,0.95)'; c.stroke(); c.setLineDash([]);
    c.font = '40px Jua, sans-serif'; c.textAlign = 'center'; c.lineWidth = 8; c.strokeStyle = 'rgba(80,50,10,0.75)';
    c.strokeText(label, (z[0] + z[2]) / 2, z[1] + 52); c.fillStyle = '#fff6c8'; c.fillText(label, (z[0] + z[2]) / 2, z[1] + 52);
    c.restore();
  }
  function arenaPath(c) {
    var A = P.ARENA;
    c.beginPath();
    c.moveTo(A.x0 + A.rt, A.y0); c.arcTo(A.x1, A.y0, A.x1, A.y1, A.rt); c.arcTo(A.x1, A.y1, A.x0, A.y1, A.rb);
    c.arcTo(A.x0, A.y1, A.x0, A.y0, A.rb); c.arcTo(A.x0, A.y0, A.x1, A.y0, A.rt); c.closePath();
  }
  // 2학년 코너 화단(차·상자가 못 들어가는 곳): 경기장 바닥 안쪽만 칠하고 빨강·흰 연석으로 테두리
  function drawCorner(c, b) {
    var x0 = Math.max(b[0], P.ARENA.x0), y0 = b[1], x1 = b[2], y1 = Math.min(b[3], P.ARENA.y1);
    c.save();
    arenaPath(c); c.clip();
    c.fillStyle = '#7fb36a'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (var gx = x0 + 30; gx < x1 - 20; gx += 64) for (var gy = y0 + 46; gy < y1; gy += 58) {
      var h = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453, r = h - Math.floor(h);
      var fx = gx + (r - 0.5) * 34, fy = gy + (((h * 7) % 1 + 1) % 1 - 0.5) * 26;
      c.fillStyle = r < 0.33 ? '#ffd0e0' : r < 0.66 ? '#fff6dc' : '#ffb3c9';
      for (var k = 0; k < 5; k++) { var a = k * Math.PI * 2 / 5 + r; c.beginPath(); c.arc(fx + Math.cos(a) * 8, fy + Math.sin(a) * 8, 7, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#f5b82e'; c.beginPath(); c.arc(fx, fy, 5, 0, Math.PI * 2); c.fill();
    }
    c.lineWidth = 22;
    for (var s = 0; s < 2; s++) {
      c.strokeStyle = s ? '#fff4ea' : '#e0453a'; c.setLineDash([40, 40]); c.lineDashOffset = s * 40;
      c.beginPath(); c.moveTo(x0 - 20, y0 + 10); c.lineTo(x1 - 10, y0 + 10); c.lineTo(x1 - 10, y1 + 20); c.stroke();
    }
    c.restore();
  }
  function drawLine(c, x, m) {
    c.save();
    c.strokeStyle = m && m.on ? '#ff9f1a' : '#ffd23f'; c.lineWidth = 12; c.setLineDash([34, 22]);
    c.beginPath(); c.moveTo(x, P.ARENA.y0 + 10); c.lineTo(x, P.ARENA.y1 - 10); c.stroke(); c.setLineDash([]);
    c.font = '38px Jua, sans-serif'; c.textAlign = 'center'; c.lineWidth = 8; c.strokeStyle = 'rgba(60,40,0,0.7)';
    c.strokeText('측정선', x, P.ARENA.y0 + 56); c.fillStyle = '#fff3b0'; c.fillText('측정선', x, P.ARENA.y0 + 56);
    c.restore();
  }
  function drawPath(c, pts, color, wd) {
    if (!pts || pts.length < 2) return;
    c.save(); c.strokeStyle = color; c.lineWidth = wd; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.stroke(); c.restore();
  }
  function starPath(c, x, y, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; if (i) c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); else c.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    c.closePath();
  }
  function drawMarks(c, marks) {
    marks.forEach(function (m, i) {
      var a = 0.45 + 0.55 * (i + 1) / marks.length;
      c.save(); c.globalAlpha = a;
      if (m.stop) { c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 4; c.setLineDash([10, 10]); c.beginPath(); c.moveTo(m.rel.x, m.rel.y); c.lineTo(m.stop.x, m.stop.y); c.stroke(); c.setLineDash([]); }
      c.fillStyle = '#fff'; c.strokeStyle = '#3a4a6a'; c.lineWidth = 4;
      c.beginPath(); c.arc(m.rel.x, m.rel.y, 11, 0, Math.PI * 2); c.fill(); c.stroke();
      if (m.stop) { starPath(c, m.stop.x, m.stop.y, 17); c.fillStyle = '#ffd23f'; c.fill(); c.strokeStyle = '#8a5a00'; c.lineWidth = 3; c.stroke(); }
      c.restore();
    });
  }
  // 범퍼카: → 는 주행 8프레임 반복 / 충돌 8프레임 한 번, ← 는 좌우 반전, 나머지 방향은 기본 자세 + 흔들림·반동
  function drawCarAll(c, ms, t) {
    var w = ms.world, car = w.car, behind = Math.sin(car.ang) < -0.5;   // 위쪽을 볼 때만 앞 부품이 차 뒤에 가려짐
    if (w.plate && behind) drawPlate(c, car, w.plate);
    if (ms.grade === 4 && !ms.free && behind) drawCarMagnet(c, ms);
    drawCar(c, car, t);
    if (w.plate && !behind) drawPlate(c, car, w.plate);
    if (ms.grade === 4 && !ms.free && !behind) drawCarMagnet(c, ms);
  }
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
  function drawPlate(c, car, kind) {
    var im = img(kind === 'flat' ? 'plate-flat' : 'plate-curve'); if (!ready(im)) return;
    var f = P.front(car, 16), k = 0.44;
    c.save(); c.translate(f.x, f.y + 18); c.rotate(car.ang - Math.PI / 2);
    c.drawImage(im, -im.naturalWidth * k / 2, -im.naturalHeight * k * 0.35, im.naturalWidth * k, im.naturalHeight * k);
    c.restore();
  }
  function poleBadge(c, x, y, pole) {
    c.save();
    c.beginPath(); c.arc(x, y, 24, 0, Math.PI * 2);
    c.fillStyle = pole === 'N' ? '#e23b3b' : '#2f6fe0'; c.fill();
    c.lineWidth = 5; c.strokeStyle = '#fff'; c.stroke();
    c.font = '34px Jua, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(pole, x, y + 2);
    c.restore();
  }
  function drawMagnetPart(c, x, y, ang, pole) {
    var im = img(pole === 'N' ? 'mag-red' : 'mag-blue');
    if (ready(im)) {
      var k = 0.3;
      c.save(); c.translate(x, y + 16); c.rotate(ang - Math.PI / 2);
      c.drawImage(im, -im.naturalWidth * k / 2, -im.naturalHeight * k * 0.4, im.naturalWidth * k, im.naturalHeight * k);
      c.restore();
    }
    poleBadge(c, x - Math.cos(ang) * 34, y - Math.sin(ang) * 20 - 62, pole);   // 글자는 자석 조금 뒤 위쪽에(붙어 있을 때 두 글자가 겹치지 않게)
  }
  function drawCarMagnet(c, ms) { var car = ms.world.car, f = P.front(ms.world.car, 14); drawMagnetPart(c, f.x, f.y, car.ang, ms.magnet); }
  function drawBody(c, b, ms, L) {
    c.save(); c.fillStyle = 'rgba(20,20,40,0.25)'; c.beginPath(); c.ellipse(b.x, b.y + 24, b.r * 1.1, b.r * 0.4, 0, 0, Math.PI * 2); c.fill(); c.restore();
    if (b.kind === 'box') { var bi = img('box'); if (ready(bi)) drawAt(c, bi, b.x, b.y + 40, 0.32); return; }
    var magBack = ms.grade === 4 && L.mag && Math.sin(b.ang) < -0.5;
    if (magBack) drawMagnetPart(c, L.mag.x, L.mag.y, b.ang, b.pole);
    var ci = img('cart'); if (ready(ci)) drawAt(c, ci, b.x, b.y + 48, 0.44);
    if (ms.grade === 4 && L.mag && !magBack) drawMagnetPart(c, L.mag.x, L.mag.y, b.ang, b.pole);
    if (ms.grade === 3 && L.hook) { var h = img('hook'); if (ready(h)) drawAt(c, h, L.hook.x, L.hook.y + 34, 0.26); }
  }
  function drawRope(c, a, b, taut) {
    c.save(); c.strokeStyle = taut ? '#7a4a1c' : '#a8743c'; c.lineWidth = 9; c.lineCap = 'round';
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + (taut ? 0 : 40);
    c.beginPath(); c.moveTo(a.x, a.y - 6); c.quadraticCurveTo(mx, my, b.x, b.y - 6); c.stroke();
    c.strokeStyle = 'rgba(255,230,180,0.6)'; c.lineWidth = 3; c.setLineDash([12, 12]);
    c.beginPath(); c.moveTo(a.x, a.y - 8); c.quadraticCurveTo(mx, my - 2, b.x, b.y - 8); c.stroke();
    c.restore();
  }
  function drawScreen(c, b) {
    var im = img('screen'); if (!ready(im)) return;
    var x0 = b[0], x1 = Math.min(b[2], P.ARENA.x1), n = Math.max(1, Math.round((x1 - x0) / 290)), w = (x1 - x0) / n, k = w / im.naturalWidth;
    for (var i = 0; i < n; i++) c.drawImage(im, x0 + i * w, b[3] + 6 - im.naturalHeight * k, w, im.naturalHeight * k);
  }
  // 거울: 그림을 거울 면(/) 방향으로 눕혀 그리고, 빛을 꺾는 면을 은색 선으로 한 번 더
  function drawMirror(c, m) {
    var im = img('mirror'), cx = (m.a.x + m.b.x) / 2, cy = (m.a.y + m.b.y) / 2, ang = Math.atan2(m.b.y - m.a.y, m.b.x - m.a.x);
    if (ready(im)) {
      var w = 190, k = w / im.naturalWidth;
      c.save(); c.translate(cx, cy); c.rotate(ang);
      c.drawImage(im, -w / 2, -im.naturalHeight * k * 0.62, w, im.naturalHeight * k);
      c.restore();
    }
    drawMirrorFace(c, m);
  }
  function drawMirrorFace(c, m) {
    c.save(); c.lineCap = 'round';
    c.strokeStyle = 'rgba(40,50,70,0.6)'; c.lineWidth = 16; c.beginPath(); c.moveTo(m.a.x, m.a.y + 4); c.lineTo(m.b.x, m.b.y + 4); c.stroke();
    var g = c.createLinearGradient(m.a.x, m.a.y, m.b.x, m.b.y); g.addColorStop(0, '#dfe7f2'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#b9c6d8');
    c.strokeStyle = g; c.lineWidth = 9; c.beginPath(); c.moveTo(m.a.x, m.a.y); c.lineTo(m.b.x, m.b.y); c.stroke();
    c.restore();
  }
  function drawSign(c, s, ms) {
    var im = img('sign'); if (!ready(im)) return;
    var lit = (ms.found && ms.found[s.id]) || (ms.lights && S.litNow && S.litNow[s.id]);
    if (lit) { c.save(); c.globalCompositeOperation = 'lighter'; var g = c.createRadialGradient(s.x, s.y - 20, 10, s.x, s.y - 20, 120); g.addColorStop(0, 'rgba(255,220,90,0.7)'); g.addColorStop(1, 'rgba(255,200,60,0)'); c.fillStyle = g; c.beginPath(); c.arc(s.x, s.y - 20, 120, 0, Math.PI * 2); c.fill(); c.restore(); }
    drawAt(c, im, s.x, s.y + 50, 0.38);
  }
  // 밤 경기장: 어둠 위에 헤드라이트(직접광)와 거울에서 꺾인 빛을 뚫어 그림
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
    var rays = ms.rays(), lit = {};
    S.litNow = lit;
    if (rays.length) {
      d.fillStyle = 'rgba(0,0,0,0.92)';
      lightPolys(rays, function (poly) { d.beginPath(); poly.forEach(function (p, i) { if (i) d.lineTo(p.x, p.y); else d.moveTo(p.x, p.y); }); d.closePath(); d.fill(); });
      rays.forEach(function (r) { r.hits.forEach(function (h) { if (h.id === 's1' || h.reflected) lit[h.id] = true; }); });
      lit.s2 = lit.s2 && rays.some(function (r) { return r.hits.some(function (h) { return h.id === 's2' && h.reflected; }); });
    }
    // 찾은 표지판은 계속 은은하게
    if (ms.layout().g5) {
      var G = ms.layout().g5;
      [G.sign1, G.sign2].forEach(function (s) {
        if (!((ms.found && ms.found[s.id]) || lit[s.id])) return;
        var q = d.createRadialGradient(s.x, s.y - 10, 10, s.x, s.y - 10, 130); q.addColorStop(0, 'rgba(0,0,0,0.9)'); q.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = q; d.beginPath(); d.arc(s.x, s.y - 10, 130, 0, Math.PI * 2); d.fill();
      });
    }
    c.drawImage(dark, 0, 0, IW, IH);
    if (rays.length) {
      c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,236,150,0.13)';
      lightPolys(rays, function (poly) { c.beginPath(); poly.forEach(function (p, i) { if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.closePath(); c.fill(); });
      c.restore();
      // 다시 차를 어둠 위에 살짝(헤드라이트 쪽)
    }
  }
  // 광선 묶음 → 빛 다각형들(직접광 부채꼴, 거울에서 꺾인 빛 띠)
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
      c.save(); c.globalAlpha = Math.min(1, a * 1.6);
      if (f.kind === 'arrow') {
        c.translate(f.x, f.y - 40); c.rotate(f.ang);
        c.fillStyle = '#ff5a3c'; c.strokeStyle = '#fff'; c.lineWidth = 6;
        c.beginPath(); c.moveTo(-50, -12); c.lineTo(18, -12); c.lineTo(18, -30); c.lineTo(58, 0); c.lineTo(18, 30); c.lineTo(18, 12); c.lineTo(-50, 12); c.closePath(); c.stroke(); c.fill();
      } else if (f.kind === 'path') {
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = '#ffd23f'; c.lineWidth = 10; c.setLineDash([26, 16]); c.lineDashOffset = -f.t * 80; c.lineJoin = 'round';
        c.beginPath(); f.pts.forEach(function (p, i) { if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.stroke();
        c.setLineDash([]); c.fillStyle = '#fff3b0';
        f.pts.forEach(function (p) { c.beginPath(); c.arc(p.x, p.y, 12, 0, Math.PI * 2); c.fill(); });
        c.globalCompositeOperation = 'source-over';
        c.font = '34px Jua, sans-serif'; c.textAlign = 'center'; c.lineWidth = 7; c.strokeStyle = 'rgba(20,20,50,0.8)';
        [['차', f.pts[0]], ['거울', f.pts[1]], ['표지판', f.pts[2]]].forEach(function (q) { c.strokeText(q[0], q[1].x, q[1].y + 50); c.fillStyle = '#fff6c8'; c.fillText(q[0], q[1].x, q[1].y + 50); });
      }
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
    if (w.plate) P.attachSegs(w.car, P.PLATES[w.plate]).forEach(function (s) { c.beginPath(); c.moveTo(s[0].x, s[0].y); c.lineTo(s[1].x, s[1].y); c.stroke(); });
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
    ['car-dir', 'car-drive', 'car-crash', 'toto', 'cart', 'pad', 'box', 'hook', 'mag-red', 'mag-blue', 'plate-flat', 'plate-curve', 'screen', 'mirror', 'sign', 'arena-day'].forEach(img);
  }
  window.MPThrill = {
    open: open, close: close, _S: S, _ui: ui,
    // 검증용: 바로 미션 열기, 시간 흘리기(화면이 숨겨져 애니메이션이 느릴 때)
    _openGame: function (g) { if (!S.open) open(); openGame(g); },
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
