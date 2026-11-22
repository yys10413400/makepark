/*
 * 멜로디 스테이지 화면
 * ------------------------------------------------------------
 * 장면 1 대기 공간(assets/melody/stage.webp): 공원 캐릭터로 걸어 다니다 무대 위 유니콘에게 '말 걸기' → 학년·모드 고르기
 * 장면 2 댄스 미션: 유니콘 시범 → 4박 카운트다운 → 따라 하기(←·→·↑·Space 또는 터치 버튼) × 3세트 → 결과
 * 장면 3 자유 연주: 연주자·악기를 무대에 올리고 아래 8칸 소리판(리듬 줄·멜로디 줄)에서 연주 순서를 정해 재생·저장
 * 위치는 모두 배경 그림(1672×941) 기준 %라서 창 크기가 바뀌어도 함께 커지고 작아집니다.
 * 값(속도·판정 범위·미션·학년별 난이도·요소)은 js/melody/data.js, 판정은 js/melody/rhythm.js, 소리는 js/melody/audio.js.
 * 공원과의 연결: window.MP_API (game.js) — 저장·프로필·캐릭터·공원 복귀
 */
(function () {
  'use strict';
  var D = window.MP_MELODY_DATA, RH = window.MP_MELODY_RHYTHM, AU = window.MelodyAudio;
  var IW = 1672, IH = 941, BASE = 'assets/melody/';
  var BAND_OF = function (g) { return g <= 2 ? 'low' : g <= 4 ? 'middle' : 'high'; };
  var DEBUG = /[?&]debug=1/.test(location.search);

  var S = {
    open: false, scene: 'lobby', grade: 1,
    me: { x: 836, y: 880, dir: 'up', moving: false }, keys: {}, dest: null, nearNpc: false, nearExit: false,
    dialog: false, raf: 0, last: 0, npcNext: 0, npcStep: 0, wasNear: false,
    run: null, mission: null,
    play: null
  };
  var ui = {};

  // ---------- 작은 도우미 ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function pct(v, of) { return (v / of * 100) + '%'; }
  function api() { return window.MP_API; }
  function save() { return (api() && api().readSave()) || {}; }
  function melSave() { var m = save().melody; return m && typeof m === 'object' ? m : {}; }
  function patchMel(fn) {
    var m = melSave(), extra = fn(m) || {}, patch = { melody: m };
    for (var k in extra) patch[k] = extra[k];
    api().patchSave(patch);
    return api().storageOk();
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function ticketCount() { return save().tickets || 0; }

  // ---------- 동작 아이콘(SVG). 좌우는 따로 그린 화살표(그림 뒤집기 아님) ----------
  var ICON = {
    left: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M22 8 6 24l16 16v-10h20V18H22z"/></svg>',
    right: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M26 8l16 16-16 16v-10H6V18h20z"/></svg>',
    jump: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 42c2-12 8-20 18-24l-2-6 16 2-8 14-2-5c-8 3-13 9-15 19z"/><path d="M6 44h12" stroke-width="3" stroke-linecap="round"/></svg>',
    freeze: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4l5.6 12.4L43 18l-10 9.2L35.6 41 24 34.2 12.4 41 15 27.2 5 18l13.4-1.6z"/></svg>',
    rest: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="10" y="20" width="28" height="8" rx="4"/></svg>'
  };
  function actIcon(a, cls) { var s = el('span', 'ml-ico ' + (cls || '')); s.innerHTML = ICON[a]; return s; }

  // ---------- 유니콘 그림(프레임 고정 크기, 자르기·확대·좌우 반전 없음) ----------
  var FR = {};
  function frameSrc(n) { return D.ANIM.base + n + '.webp'; }
  function frameImg(n) { if (!FR[n]) { FR[n] = new Image(); FR[n].src = frameSrc(n); } return FR[n]; }
  function preloadFrames() {
    frameImg(D.ANIM.idle);
    Object.keys(D.ANIM.actions).forEach(function (a) { D.ANIM.actions[a].frames.forEach(frameImg); });
  }
  // 동작 재생기: play(action) → 0번 프레임부터 한 번. 좌우·점프는 끝나면 대기 자세, 멈춤은 마지막 포즈 유지
  function Uni(imgEl) { this.img = imgEl; this.action = null; this.t0 = 0; this.cur = ''; this.show(D.ANIM.idle); }
  Uni.prototype.show = function (n) { if (n === this.cur) return; this.cur = n; if (this.img) this.img.src = frameSrc(n); };
  Uni.prototype.play = function (action, now) { this.action = D.ANIM.actions[action] ? action : null; this.t0 = now || performance.now(); this.update(this.t0); };
  Uni.prototype.idle = function () { this.action = null; this.show(D.ANIM.idle); };
  Uni.prototype.frame = function (now) {
    if (!this.action) return D.ANIM.idle;
    var A = D.ANIM.actions[this.action], t = now - this.t0, acc = 0;
    for (var i = 0; i < A.frames.length; i++) { acc += A.ms[i]; if (t < acc) return A.frames[i]; }
    if (A.end === 'hold') return A.frames[A.frames.length - 1];
    this.action = null; return D.ANIM.idle;
  };
  Uni.prototype.update = function (now) { this.show(this.frame(now || performance.now())); };
  // 유니콘 밴드 재생기(자유 연주): 오디오 시계 기준. hitAt(t) = t 에 소리가 들릴 때 frame_02(연주 자세)가 보이게
  // leadMs 먼저 0번(=idle)부터 한 번 재생 → 끝나면 idle. 같은 캐릭터가 다시 연주하면 그 예약으로 처음부터(다른 캐릭터와 따로)
  var BF = {};
  function bandSrc(cid, f) { return D.PLAY.band.base + cid + '/' + f + '.webp'; }
  function preloadBand() {
    D.PLAY.items.forEach(function (it) { D.PLAY.band.frames.forEach(function (f) { var k = it.band + '/' + f; if (!BF[k]) { BF[k] = new Image(); BF[k].src = bandSrc(it.band, f); } }); });
  }
  function Band(img, cid) { this.img = img; this.cid = cid; this.start = null; this.next = null; this.cur = ''; this.show('idle'); }
  Band.prototype.show = function (f) { if (f === this.cur) return; this.cur = f; if (this.img) this.img.src = bandSrc(this.cid, f); };
  Band.prototype.hitAt = function (t) { this.next = t - D.PLAY.band.leadMs / 1000; };
  Band.prototype.cancel = function () { this.next = null; };
  Band.prototype.update = function (now) {
    var B = D.PLAY.band;
    if (this.next != null && now >= this.next) { this.start = this.next; this.next = null; }
    if (this.start == null) { this.show('idle'); return; }
    var e = (now - this.start) * 1000, acc = 0;
    for (var i = 0; i < B.frames.length; i++) { acc += B.ms[i]; if (e < acc) { this.show(B.frames[i]); return; } }
    this.start = null; this.show('idle');
  };
  // 그림 상자: 캔버스(320×320) 기준점(160,298)을 바닥 점(x,y)에 맞추고 크기 size(그림 px)로 고정
  function placeUni(box, x, y, size) {
    var c = D.ANIM.canvas, a = D.ANIM.anchor;
    box.style.left = pct(x - a[0] / c[0] * size, IW); box.style.top = pct(y - a[1] / c[1] * size, IH);
    box.style.width = pct(size, IW); box.style.height = pct(size, IH);
  }

  // =====================================================================
  // 화면 만들기
  // =====================================================================
  function build() {
    ui.root = document.getElementById('melody');
    var st = ui.stage = el('div', 'ml-stage');
    st.style.backgroundImage = 'url(' + BASE + 'stage.webp)';
    ui.root.appendChild(st);
    buildLobby(st);
    buildDance(st);
    buildPlay(st);
    ui.modal = el('div', 'ml-modal'); ui.modal.hidden = true;
    ui.modalCard = el('div', 'ml-card'); ui.modalCard.setAttribute('role', 'dialog'); ui.modalCard.setAttribute('aria-modal', 'true');
    ui.modal.appendChild(ui.modalCard);
    st.appendChild(ui.modal);
    ui.toast = el('p', 'ml-toast'); ui.toast.hidden = true; ui.toast.setAttribute('role', 'status'); st.appendChild(ui.toast);
    ui.tickets = el('p', 'ml-tickets');
    ui.tickets.appendChild(el('span', '', '🎟'));
    ui.tickets.appendChild(document.createTextNode(' 티켓 '));
    ui.ticketNum = el('b', '', '0'); ui.tickets.appendChild(ui.ticketNum);
    ui.tickets.appendChild(document.createTextNode('장'));
    ui.tickets.setAttribute('aria-live', 'polite');
    st.appendChild(ui.tickets);
    preloadFrames();
  }
  function toast(text, ms) {
    ui.toast.textContent = text; ui.toast.hidden = false;
    ui.toast.classList.remove('pop'); void ui.toast.offsetWidth; ui.toast.classList.add('pop');
    clearTimeout(S.toastT); S.toastT = setTimeout(function () { ui.toast.hidden = true; }, ms || 2200);
  }
  function showTickets(from) {
    var e = ui.tickets, to = ticketCount();
    clearTimeout(S.tkT);
    if (from == null || from >= to) { ui.ticketNum.textContent = String(to); return; }
    var plus = el('span', 'ml-tickets-plus', '+' + (to - from)); e.appendChild(plus);
    setTimeout(function () { if (plus.parentNode) plus.parentNode.removeChild(plus); }, 1600);
    e.classList.add('gain');
    var n = from;
    (function up() { n++; ui.ticketNum.textContent = String(n); if (n < to) S.tkT = setTimeout(up, 140); else setTimeout(function () { e.classList.remove('gain'); }, 500); })();
  }

  // ---------- 모달(미션 안내·결과·하는 방법·일시정지) ----------
  function showModal(title, lines, btns, extra, variant) {
    var c = ui.modalCard; c.textContent = '';
    ui.modal.className = 'ml-modal' + (variant ? ' ' + variant : '');
    var h = el('h2', 'ml-card-title', title); h.id = 'mlModalTitle'; c.setAttribute('aria-labelledby', 'mlModalTitle');
    c.appendChild(h);
    if (extra) c.appendChild(extra);
    lines.forEach(function (l) { if (l) c.appendChild(el('p', 'ml-card-line', l)); });
    var first = null;
    if (btns.length) {
      var row = el('div', 'ml-card-btns');
      btns.forEach(function (b) {
        var x = btn('ml-choice' + (b.main ? '' : ' light'), b.text, function () { if (x.disabled) return; x.disabled = true; b.fn(); });
        row.appendChild(x); if (!first) first = x;
      });
      c.appendChild(row);
    }
    ui.modal.hidden = false;
    if (first) setTimeout(function () { first.focus(); }, 30);
  }
  function hideModal() { ui.modal.hidden = true; }

  // =====================================================================
  // 장면 1: 대기 공간
  // =====================================================================
  // 걸을 수 있는 광장 바닥(그림 좌표). 벤치·화분·피아노·무대 앞면은 바깥
  var FLOOR = [[0, 705], [130, 672], [400, 655], [520, 648], [690, 662], [980, 662], [1150, 648], [1265, 645], [1500, 660], [1580, 684], [1672, 700],
    [1672, 935], [0, 935]];
  var NPC = { x: 836, y: 588, size: 205 };        // 무대 가운데 유니콘(발 기준점), 그림 상자 크기
  var TALK = { x: 836, y: 700 };                 // 이 근처(계단 앞)에 오면 '말 걸기'
  var EXIT_Y = 895;
  function inPoly(x, y, p) {
    var c = false;
    for (var i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    }
    return c;
  }
  function walkable(x, y) { return inPoly(x, y, FLOOR); }
  var LOBBY_SCALE = 1.2, FLOOR_TOP = 645;
  function charH(y) {
    var r = ui.canvas.getBoundingClientRect(), px = api().charScreenH ? api().charScreenH() : 94;
    var base = r.height ? px * IH / r.height : 125;
    var depth = 0.9 + Math.max(0, Math.min(1, (y - FLOOR_TOP) / (IH - FLOOR_TOP))) * 0.25;
    return base * LOBBY_SCALE * depth;
  }

  function buildLobby(st) {
    var lobby = ui.lobby = el('div', 'ml-scene ml-lobby');
    ui.canvas = el('canvas', 'ml-canvas'); ui.canvas.width = IW; ui.canvas.height = IH;
    ui.canvas.setAttribute('aria-label', '멜로디 스테이지 앞 광장. 방향키나 바닥을 눌러 걸어요');
    lobby.appendChild(ui.canvas);
    ui.npcName = el('p', 'ml-npc-name', '멜로디 유니콘');
    ui.npcName.style.left = pct(NPC.x, IW); ui.npcName.style.top = pct(NPC.y - NPC.size * 0.98, IH);
    lobby.appendChild(ui.npcName);
    ui.talk = btn('ml-prompt', '', function () { openDialog(); });
    ui.talk.innerHTML = '말 걸기 <kbd>스페이스</kbd>'; ui.talk.hidden = true;
    ui.talk.style.left = pct(NPC.x, IW); ui.talk.style.top = pct(NPC.y - NPC.size - 56, IH);
    ui.leave = btn('ml-prompt ml-prompt-exit', '', function () { close(); });
    ui.leave.innerHTML = '공원으로 나가기 <kbd>스페이스</kbd>'; ui.leave.hidden = true;
    ui.tip = el('p', 'ml-tip', '무대 위 유니콘에게 다가가 말을 걸어 봐요');
    ui.lobbyExit = btn('ml-pill ml-exit', '공원으로', function () { close(); });
    [ui.talk, ui.leave, ui.tip, ui.lobbyExit].forEach(function (n) { lobby.appendChild(n); });
    buildDialog(lobby);
    st.appendChild(lobby);
  }

  function buildDialog(parent) {
    var d = ui.dialog = el('div', 'ml-dialog'); d.hidden = true;
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'mlDlgName');
    var face = el('div', 'ml-dialog-face'); var fi = el('img'); fi.src = frameSrc('idle'); fi.alt = ''; fi.draggable = false; face.appendChild(fi);
    d.appendChild(face);
    var body = el('div', 'ml-dialog-body');
    var nm = el('p', 'ml-dialog-name', '멜로디 유니콘'); nm.id = 'mlDlgName'; body.appendChild(nm);
    body.appendChild(el('p', 'ml-dialog-text', '안녕! 박자에 맞춰 나랑 같이 춤출래? 아니면 무대를 꾸며서 너만의 음악을 만들어 볼래?'));
    var gr = el('div', 'ml-grades'); gr.setAttribute('role', 'radiogroup'); gr.setAttribute('aria-label', '난이도 학년');
    gr.appendChild(el('span', 'ml-grades-label', '난이도'));
    ui.gradeBtns = [];
    for (var g = 1; g <= 6; g++) (function (g) {
      var b = btn('ml-grade', g + '학년', function () { setGrade(g); });
      b.setAttribute('role', 'radio'); ui.gradeBtns.push(b); gr.appendChild(b);
    })(g);
    body.appendChild(gr);
    ui.gradeNote = el('p', 'ml-grade-note'); body.appendChild(ui.gradeNote);
    var acts = el('div', 'ml-dialog-acts');
    ui.danceBtn = btn('ml-choice', '💃 댄스 미션', function () { closeDialog(); openMissionIntro(nextMission()); });
    acts.appendChild(ui.danceBtn);
    acts.appendChild(btn('ml-choice teal', '🎹 자유 연주', function () { closeDialog(); openPlay(); }));
    acts.appendChild(btn('ml-choice light', '나중에 할래', function () { closeDialog(); }));
    body.appendChild(acts);
    d.appendChild(body);
    parent.appendChild(d);
  }
  function setGrade(g) {
    S.grade = g;
    ui.gradeBtns.forEach(function (b, i) { b.setAttribute('aria-checked', String(i + 1 === g)); b.classList.toggle('on', i + 1 === g); });
    var park = api().profile().grade || null, G = D.GRADES[BAND_OF(g)];
    ui.gradeNote.textContent = G.label + ' · ' + G.guide + (park && park !== g ? ' (바꾼 학년은 이번 놀이에만 써요)' : '');
  }
  function openDialog() {
    if (S.dialog) return;
    S.dialog = true; S.keys = {}; S.dest = null; S.me.moving = false;
    ui.dialog.hidden = false; ui.talk.hidden = true; ui.leave.hidden = true; ui.tip.hidden = true;
    setGrade(S.grade);
    ui.danceBtn.focus();
  }
  function closeDialog() { S.dialog = false; ui.dialog.hidden = true; S.keys = {}; }

  var KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  function stepLobby(dt) {
    if (S.dialog || !ui.modal.hidden) { S.me.moving = false; return; }
    var dx = 0, dy = 0, sp = 330 * dt, me = S.me;
    if (S.keys.left) dx -= 1; if (S.keys.right) dx += 1; if (S.keys.up) dy -= 1; if (S.keys.down) dy += 1;
    if (dx || dy) S.dest = null;
    else if (S.dest) { var tx = S.dest.x - me.x, ty = S.dest.y - me.y, d = Math.hypot(tx, ty); if (d < 6) S.dest = null; else { dx = tx / d; dy = ty / d; } }
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
    S.nearNpc = Math.hypot(me.x - TALK.x, (me.y - TALK.y) * 1.3) < 190;
    S.nearExit = !S.nearNpc && me.y > EXIT_Y;
    ui.talk.hidden = !S.nearNpc;
    ui.npcName.hidden = S.nearNpc || S.dialog;
    ui.leave.hidden = !S.nearExit;
    if (S.nearExit) { ui.leave.style.left = pct(me.x, IW); ui.leave.style.top = pct(me.y - charH(me.y) - 70, IH); }
  }
  // 무대 위 유니콘: 가끔 왼쪽·오른쪽 스텝, 가까이 오면 반갑게 점프
  var npcUni = new Uni(null);
  function npcTick(now) {
    if (S.nearNpc && !S.wasNear) { npcUni.play('jump', now); S.npcNext = now + 2200; }
    S.wasNear = S.nearNpc;
    if (now > S.npcNext && !S.dialog) { npcUni.play(S.npcStep++ % 2 ? 'right' : 'left', now); S.npcNext = now + 2600; }
  }
  function drawLobby(now) {
    var c = ui.canvas.getContext('2d'), t = now / 1000;
    c.clearRect(0, 0, IW, IH);
    npcTick(now);
    var items = [
      { y: NPC.y, draw: function () {
        var im = frameImg(npcUni.frame(now)), s = NPC.size, a = D.ANIM.anchor, cv = D.ANIM.canvas;
        c.save(); c.fillStyle = 'rgba(60,30,20,0.22)'; c.beginPath(); c.ellipse(NPC.x, NPC.y - 2, s * 0.2, s * 0.05, 0, 0, Math.PI * 2); c.fill(); c.restore();
        if (im.complete && im.naturalWidth) c.drawImage(im, NPC.x - a[0] / cv[0] * s, NPC.y - a[1] / cv[1] * s, s, s);
      } },
      { y: S.me.y, draw: function () { drawMe(c, t); } }
    ];
    items.sort(function (a, b) { return a.y - b.y; }).forEach(function (i) { i.draw(); });
    if (DEBUG) {
      c.strokeStyle = 'lime'; c.lineWidth = 3; c.beginPath();
      FLOOR.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); c.stroke();
      c.strokeStyle = 'yellow'; c.beginPath(); c.ellipse(TALK.x, TALK.y, 190, 190 / 1.3, 0, 0, Math.PI * 2); c.stroke();
    }
  }
  function drawMe(c, t) {
    var me = S.me, h = charH(me.y), sid = api().character ? api().character().sid : 'F1';
    var sw = h * 0.3, g = c.createRadialGradient(me.x, me.y, 0, me.x, me.y, sw);
    g.addColorStop(0, 'rgba(70,40,30,0.4)'); g.addColorStop(1, 'rgba(70,40,30,0)');
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
  function lobbyPoint(e) {
    var r = ui.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * IW, y: (e.clientY - r.top) / r.height * IH };
  }
  function onLobbyPointer(e) {
    if (S.dialog || S.scene !== 'lobby') return;
    var p = lobbyPoint(e);
    // 유니콘(무대)을 누르면 계단 앞으로 걸어감
    if (Math.abs(p.x - NPC.x) < 110 && p.y > NPC.y - NPC.size && p.y < NPC.y + 70) p = { x: TALK.x, y: TALK.y + 10 };
    if (!walkable(p.x, p.y)) {
      var best = null;
      for (var r = 10; r < 300 && !best; r += 10) for (var a = 0; a < 360; a += 20) {
        var x = p.x + Math.cos(a * Math.PI / 180) * r, y = p.y + Math.sin(a * Math.PI / 180) * r;
        if (walkable(x, y)) { best = { x: x, y: y }; break; }
      }
      if (!best) return; p = best;
    }
    S.dest = p;
  }

  // =====================================================================
  // 열기·닫기·장면
  // =====================================================================
  function open() {
    if (!ui.root) return;
    S.grade = api().profile().grade || 1;   // 공원 학년이 기본. 대화창에서 바꾼 학년은 이번 놀이에만
    S.open = true;
    ui.root.hidden = false;
    document.body.classList.add('melody-open');
    S.me = { x: 836, y: 880, dir: 'up', moving: false };
    S.dest = null; S.keys = {}; S.dialog = false; ui.dialog.hidden = true; hideModal();
    showScene('lobby');
    ui.tip.hidden = false;
    S.last = performance.now();
    cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(loop);
  }
  function close() {
    stopRun(); stopPlayback();
    S.open = false; cancelAnimationFrame(S.raf);
    ui.root.hidden = true;
    document.body.classList.remove('melody-open');
    if (api().exitMelody) api().exitMelody();
  }
  function showScene(name) {
    S.scene = name;
    ui.lobby.hidden = name !== 'lobby';
    ui.dance.hidden = name !== 'dance';
    ui.play.hidden = name !== 'play';
    ui.tickets.className = 'ml-tickets at-' + name;
    ui.tickets.hidden = name === 'play';
    showTickets();
  }
  function toLobby() {
    stopRun(); stopPlayback(); hideModal();
    showScene('lobby');
    S.me = { x: TALK.x - 120, y: TALK.y + 30, dir: 'up', moving: false };   // 유니콘 앞에 서서 바로 다시 말 걸 수 있게
    S.dest = null; S.keys = {}; closeDialog(); ui.tip.hidden = true;
  }
  function loop(now) {
    if (!S.open) return;
    var dt = Math.min(0.05, (now - S.last) / 1000); S.last = now;
    if (S.scene === 'lobby') { stepLobby(dt); drawLobby(now); }
    else if (S.scene === 'dance') danceFrame(now);
    else if (S.scene === 'play') playFrame(now);
    S.raf = requestAnimationFrame(loop);
  }

  // =====================================================================
  // 장면 2: 댄스 미션
  // =====================================================================
  var UNI_STAGE = { x: 836, y: 578, size: 330 };
  function buildDance(st) {
    var s = ui.dance = el('div', 'ml-scene ml-dance'); s.hidden = true;
    // 위: 돌아가기 · 미션과 목표 · 하는 방법 · 소리 · 일시정지
    var top = el('div', 'ml-top');
    top.appendChild(btn('ml-pill', '← 대기 공간', function () { toLobby(); }));
    var head = el('div', 'ml-head');
    ui.mTitle = el('p', 'ml-head-title'); ui.mGoal = el('p', 'ml-head-goal');
    head.appendChild(ui.mTitle); head.appendChild(ui.mGoal);
    top.appendChild(head);
    var tools = el('div', 'ml-tools');
    tools.appendChild(btn('ml-pill', '? 하는 방법', function () { openHowTo(); }));
    ui.soundBtn = btn('ml-pill ml-icon-btn', '🔊', function () { toggleSound(); });
    ui.soundBtn.setAttribute('aria-label', '소리 끄기');
    ui.pauseBtn = btn('ml-pill ml-icon-btn', '⏸', function () { pauseRun(true); });
    ui.pauseBtn.setAttribute('aria-label', '일시정지');
    tools.appendChild(ui.soundBtn); tools.appendChild(ui.pauseBtn);
    top.appendChild(tools);
    s.appendChild(top);
    // 가운데: 지금 단계 · 박자 · 세트
    var status = el('div', 'ml-status');
    ui.phase = el('p', 'ml-phase'); ui.phase.setAttribute('aria-live', 'polite');
    ui.lamp = el('span', 'ml-lamp'); ui.lamp.setAttribute('aria-hidden', 'true');
    ui.sets = el('div', 'ml-sets'); ui.sets.setAttribute('aria-label', '세트');
    status.appendChild(ui.lamp); status.appendChild(ui.phase); status.appendChild(ui.sets);
    s.appendChild(status);
    // 유니콘(고정 크기 상자)
    ui.uniBox = el('div', 'ml-uni');
    ui.uniImg = el('img'); ui.uniImg.alt = '춤추는 유니콘'; ui.uniImg.draggable = false;
    ui.uniBox.appendChild(ui.uniImg);
    placeUni(ui.uniBox, UNI_STAGE.x, UNI_STAGE.y, UNI_STAGE.size);
    s.appendChild(ui.uniBox);
    ui.uni = new Uni(ui.uniImg);
    ui.count = el('p', 'ml-count'); ui.count.hidden = true; s.appendChild(ui.count);
    ui.feedback = el('p', 'ml-feedback'); ui.feedback.setAttribute('role', 'status'); ui.feedback.setAttribute('aria-live', 'polite'); s.appendChild(ui.feedback);
    ui.next = el('div', 'ml-next'); ui.next.hidden = true; s.appendChild(ui.next);
    ui.sparks = el('div', 'ml-sparks'); s.appendChild(ui.sparks);
    // 아래: 동작 안내 · 터치 버튼(키보드 표시)
    var bottom = el('div', 'ml-bottom');
    ui.cards = el('div', 'ml-cards'); ui.cards.setAttribute('aria-label', '동작 순서');
    bottom.appendChild(ui.cards);
    var pads = el('div', 'ml-pads');
    ui.pads = {};
    ['left', 'right', 'jump', 'freeze'].forEach(function (a) {
      var A = D.ACTIONS[a], b = btn('ml-pad ' + A.color);
      b.appendChild(actIcon(a));
      b.appendChild(el('span', 'ml-pad-label', A.label));
      b.appendChild(el('kbd', 'ml-pad-key', A.key));
      b.setAttribute('aria-label', A.label + ' (' + (a === 'freeze' ? '스페이스' : A.key) + ')');
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); input(a, e); });
      b.addEventListener('click', function (e) { if (e.detail === 0) input(a, e); });   // 키보드로 버튼을 눌렀을 때(Enter)
      ui.pads[a] = b; pads.appendChild(b);
    });
    bottom.appendChild(pads);
    s.appendChild(bottom);
    st.appendChild(s);
  }
  function toggleSound() {
    AU.setMuted(!AU.isMuted());
    ui.soundBtn.textContent = AU.isMuted() ? '🔇' : '🔊';
    ui.soundBtn.setAttribute('aria-label', AU.isMuted() ? '소리 켜기' : '소리 끄기');
    if (ui.playSound) { ui.playSound.textContent = ui.soundBtn.textContent; ui.playSound.setAttribute('aria-label', ui.soundBtn.getAttribute('aria-label')); }
  }

  function missionsOf(band) { return D.MISSIONS[band]; }
  function nextMission() {
    var band = BAND_OF(S.grade), list = missionsOf(band), paid = melSave().paid || {};
    for (var i = 0; i < list.length; i++) if (!paid[list[i].id]) return list[i];
    return list[0];
  }
  function bandCfg() { return D.GRADES[BAND_OF(S.grade)]; }
  function setPhase(p, text) { ui.phase.className = 'ml-phase ' + p; ui.phase.textContent = text; }
  function feedback(text, kind) {
    ui.feedback.textContent = text; ui.feedback.className = 'ml-feedback ' + (kind || '');
    void ui.feedback.offsetWidth; ui.feedback.classList.add('pop');
  }
  function renderCards(pattern, hide) {
    ui.cards.textContent = '';
    ui.cards.classList.toggle('eight', pattern.length > 4);
    ui.cardEls = pattern.map(function (a, i) {
      var A = D.ACTIONS[a], c = el('div', 'ml-cardi ' + A.color + (hide && hide[i] ? ' hidden' : ''));
      c.appendChild(el('span', 'ml-cardi-num', String(i + 1)));
      c.appendChild(actIcon(a));
      c.appendChild(el('span', 'ml-cardi-label', A.label));
      c.appendChild(el('span', 'ml-cardi-q', '?'));
      c.appendChild(el('span', 'ml-cardi-mark'));
      c.setAttribute('aria-label', (i + 1) + '번째: ' + (hide && hide[i] ? '기억해요' : A.label));
      ui.cards.appendChild(c); return c;
    });
  }
  function markCard(i, cls) { var c = ui.cardEls && ui.cardEls[i]; if (!c) return; c.classList.remove('now', 'hit', 'miss'); if (cls) c.classList.add(cls); }
  function nowCard(i) { (ui.cardEls || []).forEach(function (c, k) { c.classList.toggle('now', k === i); }); }
  function renderSets(results, cur, total) {
    ui.sets.textContent = '';
    for (var i = 0; i < total; i++) {
      var r = results[i], d = el('span', 'ml-set' + (r ? (r.pass ? ' pass' : ' fail') : i === cur ? ' now' : ''), r ? (r.pass ? '★' : '·') : String(i + 1));
      ui.sets.appendChild(d);
    }
  }
  function showNext(a) {
    if (!a) { ui.next.hidden = true; return; }
    var A = D.ACTIONS[a];
    ui.next.hidden = false; ui.next.className = 'ml-next ' + A.color; ui.next.textContent = '';
    ui.next.appendChild(el('span', 'ml-next-label', '다음'));
    ui.next.appendChild(actIcon(a));
    ui.next.appendChild(el('span', 'ml-next-name', A.label));
  }

  function setHeader(m) { ui.mTitle.textContent = m.title + ' · ' + bandCfg().label; ui.mGoal.textContent = m.goal; }
  // ---------- 미션 안내 ----------
  function openMissionIntro(m) {
    stopRun();
    S.mission = m;
    showScene('dance');
    ui.uni.idle(); ui.count.hidden = true; ui.next.hidden = true; ui.feedback.textContent = '';
    var G = bandCfg(), band = BAND_OF(S.grade);
    setHeader(m);
    renderCards(m.pattern);
    renderSets([], -1, D.CONFIG.sets);
    setPhase('ready', '미션 안내');
    var ms = melSave(), paid = ms.paid || {};
    var pick = el('div', 'ml-mpick'); pick.setAttribute('role', 'radiogroup'); pick.setAttribute('aria-label', '미션 고르기');
    missionsOf(band).forEach(function (x, i) {
      var b = btn('ml-mchip' + (x === m ? ' on' : ''), (paid[x.id] ? '★ ' : '') + (i + 1) + '. ' + x.title, function () { hideModal(); openMissionIntro(x); });
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(x === m)); pick.appendChild(b);
    });
    var box = el('div', 'ml-intro');
    box.appendChild(pick);
    var seq = el('div', 'ml-seq');
    m.pattern.forEach(function (a, i) {
      var A = D.ACTIONS[a], c = el('span', 'ml-seqi ' + A.color); c.appendChild(actIcon(a)); c.appendChild(el('span', '', A.label));
      seq.appendChild(c); if (i < m.pattern.length - 1) seq.appendChild(el('span', 'ml-seq-arrow', '›'));
    });
    box.appendChild(seq);
    var lines = [
      '유니콘이 먼저 보여 줄게. 카운트다운 4박이 끝나면 네 차례야!',
      '세트 ' + D.CONFIG.sets + '번 중 ' + D.CONFIG.missionPassSets + '번 이상 성공하면 공연 성공 · ' + G.bpm + ' BPM',
      m.pattern.indexOf('rest') >= 0 ? '‘쉼’ 박자에는 아무것도 누르지 않아요. (‘멈춤’은 Space를 눌러 포즈!)' : '',
      G.hide.some(Boolean) ? '2세트부터 안내 카드가 조금씩 숨어요. 시범을 잘 기억해!' : ''
    ];
    showModal('미션 · ' + m.title, lines, [
      { text: '▶ 시작!', main: true, fn: function () { hideModal(); startRun(m, 'mission'); } },
      { text: '연습하기(시범 다시 보기)', fn: function () { hideModal(); startRun(m, 'practice'); } },
      { text: '대기 공간으로', fn: function () { toLobby(); } }
    ], box);
  }

  // ---------- 하는 방법 ----------
  function openHowTo() {
    var wasRunning = S.run && !S.run.paused && !S.run.over;
    if (wasRunning) pauseRun(false);
    var box = el('div', 'ml-howto');
    [['left', '왼쪽 스텝', '←'], ['right', '오른쪽 스텝', '→'], ['jump', '점프', '↑'], ['freeze', '멈춤 포즈', 'Space']].forEach(function (r) {
      var row = el('div', 'ml-howto-row ' + D.ACTIONS[r[0]].color);
      row.appendChild(actIcon(r[0])); row.appendChild(el('span', '', r[1])); row.appendChild(el('kbd', '', r[2]));
      box.appendChild(row);
    });
    var restRow = el('div', 'ml-howto-row rest'); restRow.appendChild(actIcon('rest')); restRow.appendChild(el('span', '', '쉼: 아무것도 누르지 않아요'));
    box.appendChild(restRow);
    showModal('하는 방법', ['👀 시범 보기 → 4·3·2·1 → 🙋 내 차례! 박자에 맞춰 눌러요.', '한 박자에 한 번만 눌러요. 마구 누르면 세트가 실패해요.'],
      [{ text: S.run && !S.run.over ? '계속하기' : '알겠어!', main: true, fn: function () { hideModal(); if (S.run && S.run.paused) resumeRun(); } }], box);
  }

  // ---------- 한 판 진행(오디오 시계 기준) ----------
  // 박자 목록(events[n] = n번째 박): ready(시범 준비) · demo(시범) · count(카운트다운) · turn(내 차례) · gap(세트 결과)
  function planEvents(m, fromSet, lastSet, lead, skipDemo) {
    var C = D.CONFIG, ev = [], n = m.pattern.length;
    for (var s = fromSet; s <= lastSet; s++) {
      var first = s === fromSet;
      if (first && skipDemo) {
        for (var k = 0; k < C.countIn; k++) ev.push({ kind: 'count', k: C.countIn - k, set: s });
      } else {
        if (first && lead) for (var q = 0; q < (lead === 'intro' ? C.introBeats : C.countIn); q++) ev.push({ kind: lead === 'intro' ? 'ready' : 'count', k: C.countIn - q, set: s, lead: true });
        for (var i = 0; i < n; i++) ev.push({ kind: 'demo', i: i, action: m.pattern[i], set: s });
        for (var c = 0; c < C.countIn; c++) ev.push({ kind: 'count', k: C.countIn - c, set: s });
      }
      for (var j = 0; j < n; j++) ev.push({ kind: 'turn', i: j, action: m.pattern[j], set: s });
      for (var g = 0; g < C.gapBeats; g++) ev.push({ kind: 'gap', set: s, g: g });
    }
    return ev;
  }
  function startRun(m, mode) {
    stopRun();
    if (!AU.unlock()) toast('이 브라우저는 소리를 낼 수 없어요. 화면을 보며 해 봐요.');
    var G = bandCfg(), bpm = G.bpm || D.CONFIG.bpm;
    S.run = {
      id: Date.now(), mission: m, mode: mode, band: BAND_OF(S.grade), grade: S.grade,
      bpm: bpm, beatSec: 60 / bpm, sets: mode === 'practice' ? 1 : D.CONFIG.sets,
      results: [], setIdx: 0, paused: false, over: false, rewarded: false, demoDone: false
    };
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    S.mission = m; setHeader(m);
    renderSets([], 0, S.run.sets);
    schedule(0, 'intro', false);
  }
  // fromSet 세트부터 다시 짜서 시작(처음·일시정지 뒤 재개)
  function schedule(fromSet, lead, skipDemo) {
    var R = S.run, m = R.mission;
    if (R.sched) R.sched.stop();
    R.setIdx = fromSet;
    R.events = planEvents(m, fromSet, R.sets - 1, lead, skipDemo);
    R.t0 = AU.now() + 0.25;
    R.fired = 0; R.turns = {};
    // 세트마다 따라 하기 판정표(박자 시각은 오디오 시계)
    R.events.forEach(function (e, n) {
      if (e.kind === 'turn' && e.i === 0) R.turns[e.set] = RH.makeTurn(m.pattern, R.t0 + n * R.beatSec, R.beatSec, D.CONFIG);
    });
    R.endT = R.t0 + R.events.length * R.beatSec;
    R.results.length = fromSet;   // 다시 하는 세트부터는 결과를 지움
    renderSets(R.results, fromSet, R.sets);
    renderCards(m.pattern);
    R.sched = AU.beatScheduler(R.t0, R.beatSec, function (n, t) {
      if (S.run !== R || R.paused) return;
      AU.musicBeat(n, t, R.beatSec);
      var e = R.events[n];
      if (!e) return;
      if (e.kind === 'demo' && e.action !== 'rest') AU.play(AU.CUE[e.action], t, { vol: 0.8 });
      if (e.kind === 'count' && !e.lead) AU.play('count', t, { high: e.k === 1, vol: 0.8 });
      if (e.kind === 'count' && e.lead) AU.play('count', t, { vol: 0.5 });
    });
  }
  function stopRun() {
    var R = S.run;
    if (!R) return;
    if (R.sched) R.sched.stop();
    R.over = true;
    S.run = null;
    ui.count.hidden = true; ui.next.hidden = true;
  }
  function turnOf(R) { return R.turns[R.setIdx]; }

  function danceFrame(now) {
    ui.uni.update(now);
    var R = S.run;
    if (!R || R.paused || R.over) return;
    var t = AU.heardNow();
    // 박자마다 화면 바꾸기(소리와 같은 오디오 시계)
    while (R.fired < R.events.length && t >= R.t0 + R.fired * R.beatSec) {
      fireEvent(R.events[R.fired], R.fired, now);
      R.fired++;
      if (S.run !== R) return;
    }
    // 판정 범위가 끝난 박자 마무리
    var turn = turnOf(R);
    if (turn) {
      RH.close(turn, t).forEach(function (b) {
        markCard(b.i, b.result);
        if (b.action === 'rest' && b.result === 'hit') feedback('쉼 ✓', 'soft');
        else if (b.result === 'miss') { feedback(b.label, 'miss'); }
      });
      if (bandCfg().showNext) {
        var up = turn.beats.filter(function (b) { return !b.result; })[0];
        showNext(up && t > turn.beats[0].t - R.beatSec * 4.5 ? up.action : null);
      }
    }
    if (t >= R.endT) finishRun();
  }
  function fireEvent(e, n, now) {
    var R = S.run, m = R.mission, G = bandCfg();
    ui.lamp.classList.remove('beat'); void ui.lamp.offsetWidth; ui.lamp.classList.add('beat');
    if (e.set !== R.setIdx) { R.setIdx = e.set; renderCards(m.pattern); renderSets(R.results, e.set, R.sets); }
    var setLabel = R.mode === 'practice' ? '연습' : '세트 ' + (e.set + 1) + '/' + R.sets;
    if (e.kind === 'ready') { setPhase('ready', '🎵 시범 준비 · ' + setLabel); ui.count.hidden = true; }
    else if (e.kind === 'demo') {
      setPhase('demo', '👀 시범 보기 · 보기만 해요');
      ui.count.hidden = true;
      nowCard(e.i);
      if (e.action !== 'rest') ui.uni.play(e.action, now);
    } else if (e.kind === 'count') {
      setPhase('count', e.lead ? '다시 박자를 맞춰요' : '곧 내 차례!');
      nowCard(-1);
      ui.count.hidden = false; ui.count.textContent = String(e.k);
      ui.count.classList.remove('pop'); void ui.count.offsetWidth; ui.count.classList.add('pop');
      if (!e.lead && e.k === D.CONFIG.countIn) {
        // 기억 도전: 내 차례가 되면 카드 일부를 가림
        var hide = RH.hiddenCards(m.pattern.length, R.mode === 'practice' ? 0 : G.hide[e.set] || 0);
        renderCards(m.pattern, hide);
      }
    } else if (e.kind === 'turn') {
      setPhase('turn', '🙋 내 차례! ' + setLabel);
      ui.count.hidden = true;
      nowCard(e.i);
    } else if (e.kind === 'gap' && e.g === 0) {
      ui.next.hidden = true; nowCard(-1);
      var turn = R.turns[e.set];
      if (turn) {
        RH.close(turn, Infinity).forEach(function (b) { markCard(b.i, b.result); });
        var res = RH.result(turn);
        R.results[e.set] = res;
        renderSets(R.results, e.set + 1, R.sets);
        (ui.cardEls || []).forEach(function (c) { c.classList.remove('hidden'); });
        var msg = res.pass ? '세트 성공! ' + res.hits + ' / ' + res.total : res.strays > res.strayMax ? '박자에 맞춰 한 번씩만 눌러요' : '아쉬워요 ' + res.hits + ' / ' + res.total;
        setPhase('gap', msg);
        feedback(res.pass ? '★ 잘했어요!' : '다음엔 할 수 있어요!', res.pass ? 'good' : 'soft');
        if (res.pass) { ui.uni.play('jump', now); AU.play('good', null, { vol: 0.8 }); }
      }
    }
  }
  // 키보드·터치 공통 입력
  function input(action, e) {
    var R = S.run;
    if (S.scene !== 'dance' || !ui.modal.hidden) return;
    var pad = ui.pads[action];
    if (pad) { pad.classList.remove('press'); void pad.offsetWidth; pad.classList.add('press'); }
    if (!R || R.paused || R.over) return;
    var turn = turnOf(R), t = AU.eventTime(e);
    var inTurn = turn && t >= turn.beats[0].t - turn.win && t <= turn.beats[turn.beats.length - 1].t + turn.win;
    if (!inTurn) {
      var ev = R.events[Math.max(0, Math.min(R.events.length - 1, R.fired - 1))];
      feedback(ev && ev.kind === 'demo' ? '지금은 시범을 봐요' : '내 차례를 기다려요', 'soft');
      return;
    }
    ui.uni.play(action, performance.now());     // 입력 순간 그 동작을 첫 프레임부터
    var r = RH.judge(turn, action, t);
    if (r.type === 'hit') { markCard(r.beat.i, 'hit'); feedback(r.label, r.label === '좋아요' ? 'good' : 'ok'); AU.play(AU.CUE[action], null, { vol: 0.45 }); }
    else if (r.type === 'wrong' || r.type === 'rest') { markCard(r.beat.i, 'miss'); feedback(r.label, 'miss'); AU.play('miss', null, { vol: 0.6 }); }
    else if (r.type === 'stray') feedback(r.label, 'soft');
  }

  // ---------- 일시정지 · 탭 전환 ----------
  function pauseRun(withMenu) {
    var R = S.run;
    if (!R || R.paused || R.over) return;
    R.paused = true;
    if (R.sched) R.sched.stop();
    AU.suspend();
    // 지금 세트의 따라 하기를 시작했는지(시범을 이미 봤는지)
    var t = AU.heardNow(), turn = turnOf(R);
    R.demoDone = !!(turn && t >= turn.beats[0].t - R.beatSec * D.CONFIG.countIn);
    setPhase('ready', '⏸ 잠깐 멈춤');
    ui.count.hidden = true; ui.next.hidden = true;
    if (withMenu) {
      showModal('잠깐 멈춤', ['다시 시작하면 카운트다운으로 박자를 맞춘 뒤 이어서 해요.'], [
        { text: '▶ 계속하기', main: true, fn: function () { hideModal(); resumeRun(); } },
        { text: '처음부터', fn: function () { hideModal(); var m = R.mission, mode = R.mode; AU.resume(); startRun(m, mode); } },
        { text: '대기 공간으로', fn: function () { toLobby(); } }
      ]);
    }
  }
  function resumeRun() {
    var R = S.run;
    if (!R || !R.paused) return;
    AU.resume().then(function () {
      if (S.run !== R) return;
      R.paused = false;
      // 지금 세트를 카운트다운부터 다시(시범을 이미 봤으면 시범은 건너뜀). 이 세트 기록은 새로
      schedule(R.setIdx, 'count', R.demoDone);
    });
  }
  function onVisibility() {
    if (document.hidden) {
      if (S.scene === 'dance' && S.run && !S.run.paused && !S.run.over) pauseRun(true);
      if (S.scene === 'play' && S.play && S.play.playing) stopPlayback();
    }
  }

  // ---------- 결과 · 보상 ----------
  function finishRun() {
    var R = S.run;
    if (!R || R.over) return;
    R.over = true;
    if (R.sched) R.sched.stop();
    ui.count.hidden = true; ui.next.hidden = true;
    var m = R.mission;
    if (R.mode === 'practice') {
      var pr = R.results[0] || { hits: 0, total: m.pattern.length };
      S.run = null;
      setPhase('ready', '연습 끝');
      showModal('연습 끝!', [pr.hits + ' / ' + pr.total + ' 박자를 맞혔어요.', '준비됐으면 시작해 봐요!'], [
        { text: '▶ 시작!', main: true, fn: function () { hideModal(); startRun(m, 'mission'); } },
        { text: '한 번 더 연습', fn: function () { hideModal(); startRun(m, 'practice'); } },
        { text: '미션 안내로', fn: function () { hideModal(); openMissionIntro(m); } }
      ]);
      return;
    }
    var res = RH.mission(R.results, D.CONFIG);
    var stars = el('div', 'ml-result-sets');
    R.results.forEach(function (r) { stars.appendChild(el('span', 'ml-set ' + (r && r.pass ? 'pass' : 'fail'), r && r.pass ? '★' : '·')); });
    if (res.pass) {
      setPhase('gap', '🎉 공연 성공!');
      celebrate();
      var rw = reward(R);
      var lines = ['세트 ' + res.passed + ' / ' + R.sets + ' 성공!', rw.line];
      if (rw.newClear) lines.push('★ ‘꼬마 가수’ 캐릭터를 받았어요! 공원 위쪽 ‘캐릭터’에서 골라 봐요.');
      if (!rw.saved) lines.push('이 기기에는 저장되지 않았어요. 기록은 이번에만 남아요.');
      var list = missionsOf(R.band), idx = list.indexOf(m), next = list[idx + 1];
      var btns = [];
      if (next) btns.push({ text: '다음 미션 ›', main: true, fn: function () { hideModal(); openMissionIntro(next); } });
      btns.push({ text: '다시 하기', main: !next, fn: function () { hideModal(); startRun(m, 'mission'); } });
      btns.push({ text: '대기 공간으로', fn: function () { toLobby(); } });
      setTimeout(function () { if (S.scene === 'dance' && !S.run) showModal('공연 성공!', lines, btns, stars); }, 900);
      S.run = null;
    } else {
      setPhase('ready', '다시 해 봐요');
      showModal('아쉬워요!', ['세트 ' + res.passed + ' / ' + R.sets + ' 성공 · ' + res.need + '세트 이상 성공하면 돼요.', '박자 소리를 들으며 한 박자에 한 번씩 눌러 봐요.'], [
        { text: '다시 연습하기', main: true, fn: function () { hideModal(); startRun(m, 'practice'); } },
        { text: '재도전', fn: function () { hideModal(); startRun(m, 'mission'); } },
        { text: '대기 공간으로', fn: function () { toLobby(); } }
      ], stars);
      S.run = null;
    }
  }
  function celebrate() {
    AU.play('fanfare', null, { vol: 0.9 });
    var t0 = performance.now();
    ui.uni.play('jump', t0);
    setTimeout(function () { if (S.scene === 'dance') ui.uni.play('jump', performance.now()); }, 560);
    setTimeout(function () { if (S.scene === 'dance') ui.uni.play('freeze', performance.now()); }, 1120);
    ui.sparks.textContent = '';
    for (var i = 0; i < 18; i++) {
      var s = el('span', 'ml-spark', ['★', '♪', '✦', '♫'][i % 4]);
      s.style.left = (30 + Math.random() * 40) + '%'; s.style.top = (18 + Math.random() * 40) + '%';
      s.style.animationDelay = (Math.random() * 0.6) + 's';
      s.style.color = ['#ffd23f', '#ff8fb1', '#7fe3d0', '#c9a7ff'][i % 4];
      ui.sparks.appendChild(s);
    }
    setTimeout(function () { ui.sparks.textContent = ''; }, 2600);
  }
  /* 티켓(다른 놀이기구와 같은 기준): 학년군에서 처음 성공한 미션 3장, 그 뒤 처음 성공하는 다른 미션마다 1장(하루 5장까지).
     같은 미션을 다시 성공하면 주지 않음(미션 id 로 저장). 판마다 한 번만(R.rewarded) */
  function reward(R) {
    if (R.rewarded) return { line: '', saved: true };
    R.rewarded = true;
    var T = D.CONFIG.tickets, kind = 'again', gain = 0, newClear = false, before = ticketCount(), m = R.mission, dayN = 0;
    var saved = patchMel(function (g) {
      if (!g.day || g.day.date !== today()) g.day = { date: today(), n: 0 };
      g.done = g.done || {}; g.paid = g.paid || {}; g.best = g.best || {};
      var passed = R.results.filter(function (r) { return r && r.pass; }).length;
      g.best[m.id] = Math.max(g.best[m.id] || 0, passed);
      g.plays = (g.plays || 0) + 1;
      if (!g.cleared) { g.cleared = true; newClear = true; }
      if (!g.paid[m.id]) {
        if (!g.done[R.band]) { g.done[R.band] = true; g.paid[m.id] = true; kind = 'first'; gain = T.first; }
        else if (g.day.n < T.dayMax) { g.day.n++; g.paid[m.id] = true; kind = 'new'; gain = T.again; }
        else kind = 'daymax';   // 오늘 한도: 받은 것으로 치지 않아 내일 다시 성공하면 받을 수 있음
      }
      dayN = g.day.n;
      return gain ? { tickets: (save().tickets || 0) + gain } : {};
    });
    if (gain) showTickets(before);
    var line = kind === 'first' ? '🎟 티켓 ' + gain + '장을 받았어요! 다른 미션을 처음 성공하면 1장씩 더 받아요.'
      : kind === 'new' ? '🎟 새 미션 티켓 1장을 받았어요! (오늘 ' + dayN + ' / ' + T.dayMax + ')'
      : kind === 'daymax' ? '오늘 받을 수 있는 새 미션 티켓(' + T.dayMax + '장)은 다 받았어요. 내일 또 받아요!'
      : '이 미션 티켓은 이미 받았어요. 다른 미션에 도전해 봐요!';
    return { line: line, saved: saved, newClear: newClear };
  }

  // =====================================================================
  // 장면 3: 자유 연주
  // =====================================================================
  // 무대 위 꾸미기 영역(그림 좌표). 여기서 위치는 꾸미기용이고, 연주 시점은 아래 소리판 칸이 정함
  var AREA = { x0: 500, x1: 1170, y0: 330, y1: 610 };
  var SPOTS = [[640, 590], [1030, 590], [760, 610], [910, 610], [590, 470], [1080, 470], [740, 500], [930, 500]];
  function itemOf(id) { return D.PLAY.items.filter(function (x) { return x.id === id; })[0]; }
  function emptySong() { var n = D.PLAY.steps, a = [], b = []; for (var i = 0; i < n; i++) { a.push(null); b.push(null); } return { name: '', tempo: 'mid', backing: D.PLAY.defaultBacking, swing: false, stage: [], rhythm: a, melody: b }; }
  function cleanSong(s) {
    var e = emptySong();
    if (!s || typeof s !== 'object') return e;
    e.name = typeof s.name === 'string' ? s.name.slice(0, 14) : '';
    e.tempo = D.PLAY.tempos.some(function (t) { return t.id === s.tempo; }) ? s.tempo : 'mid';
    e.backing = D.PLAY.backings.some(function (b) { return b.id === s.backing; }) ? s.backing : D.PLAY.defaultBacking;
    e.swing = s.swing === true;
    var seen = {};
    (Array.isArray(s.stage) ? s.stage : []).forEach(function (p) {
      if (p && itemOf(p.id) && !seen[p.id] && e.stage.length < D.PLAY.maxOnStage) {
        seen[p.id] = 1;
        e.stage.push({ id: p.id, x: Math.max(AREA.x0, Math.min(AREA.x1, +p.x || 800)), y: Math.max(AREA.y0, Math.min(AREA.y1, +p.y || 560)) });
      }
    });
    ['rhythm', 'melody'].forEach(function (line) {
      var src = Array.isArray(s[line]) ? s[line] : [];
      for (var i = 0; i < D.PLAY.steps; i++) { var id = src[i], it = itemOf(id); e[line][i] = it && it.line === line && seen[id] ? id : null; }
    });
    return e;
  }

  function buildPlay(st) {
    var s = ui.play = el('div', 'ml-scene ml-play'); s.hidden = true;
    var top = el('div', 'ml-top');
    top.appendChild(btn('ml-pill', '← 대기 공간', function () { leavePlay(); }));
    var head = el('div', 'ml-head ml-namebox');
    var lab = el('label', 'ml-name-label', '작품 이름'); lab.htmlFor = 'mlSongName';
    ui.nameInput = el('input', 'ml-name'); ui.nameInput.id = 'mlSongName'; ui.nameInput.maxLength = 14; ui.nameInput.placeholder = '나의 무대';
    ui.nameInput.autocomplete = 'off'; ui.nameInput.spellcheck = false;
    ui.nameInput.addEventListener('input', function () { S.play.song.name = ui.nameInput.value; dirty(); });
    head.appendChild(lab); head.appendChild(ui.nameInput);
    top.appendChild(head);
    var tools = el('div', 'ml-tools');
    ui.saveBtn = btn('ml-pill ml-save', '💾 저장', function () { saveSong(); });
    ui.playSound = btn('ml-pill ml-icon-btn', '🔊', function () { toggleSound(); });
    ui.playSound.setAttribute('aria-label', '소리 끄기');
    tools.appendChild(ui.saveBtn); tools.appendChild(ui.playSound);
    top.appendChild(tools);
    s.appendChild(top);
    ui.stageArea = el('div', 'ml-area');
    ui.stageArea.style.left = pct(AREA.x0 - 70, IW); ui.stageArea.style.top = pct(AREA.y0 - 90, IH);
    ui.stageArea.style.width = pct(AREA.x1 - AREA.x0 + 140, IW); ui.stageArea.style.height = pct(AREA.y1 - AREA.y0 + 110, IH);
    ui.stageArea.hidden = true;
    s.appendChild(ui.stageArea);
    ui.emptyHint = el('p', 'ml-empty', '아래에서 연주자·악기를 골라 무대에 올려 봐요!');
    s.appendChild(ui.emptyHint);
    ui.tokens = el('div', 'ml-tokens'); s.appendChild(ui.tokens);
    ui.delBtn = btn('ml-del', '✕ 무대에서 빼기', function () { removeItem(S.play.sel); });
    ui.delBtn.hidden = true; s.appendChild(ui.delBtn);

    var bottom = el('div', 'ml-bottom ml-play-bottom');
    // 고르기(리듬·멜로디)
    var pal = el('div', 'ml-palette');
    ui.palBtns = {};
    [['rhythm', '리듬'], ['melody', '멜로디']].forEach(function (L) {
      var row = el('div', 'ml-pal-row ' + L[0]);
      row.appendChild(el('span', 'ml-pal-label', L[1]));
      D.PLAY.items.filter(function (x) { return x.line === L[0]; }).forEach(function (it) {
        var b = btn('ml-pal', '', function () { if (S.play.palDragged) { S.play.palDragged = false; return; } pickItem(it.id); });
        b.dataset.id = it.id;
        var face = el('span', 'ml-pal-face'); face.style.backgroundImage = 'url(' + bandSrc(it.band, 'idle') + ')';
        face.appendChild(el('span', 'ml-pal-badge', it.icon));
        b.appendChild(face);
        b.appendChild(el('span', 'ml-pal-name', it.name));
        b.setAttribute('aria-label', it.name + ' 고르기(소리 듣기)');
        ui.palBtns[it.id] = b; row.appendChild(b);
      });
      pal.appendChild(row);
    });
    bottom.appendChild(pal);
    // 8칸 소리판
    var board = el('div', 'ml-board');
    ui.selInfo = el('p', 'ml-selinfo'); ui.selInfo.setAttribute('aria-live', 'polite');
    board.appendChild(ui.selInfo);
    var grid = el('div', 'ml-grid');
    grid.appendChild(el('span', 'ml-grid-corner', '칸 = 연주 순서'));
    ui.colHeads = [];
    for (var c = 0; c < D.PLAY.steps; c++) { var h = el('span', 'ml-grid-num', String(c + 1)); ui.colHeads.push(h); grid.appendChild(h); }
    ui.cells = { rhythm: [], melody: [] };
    [['rhythm', '🥁 리듬'], ['melody', '🎵 멜로디']].forEach(function (L) {
      grid.appendChild(el('span', 'ml-grid-label ' + L[0], L[1]));
      for (var i = 0; i < D.PLAY.steps; i++) (function (line, i) {
        var b = btn('ml-cell ' + line, '', function () { tapCell(line, i); });
        b.setAttribute('aria-label', (line === 'rhythm' ? '리듬' : '멜로디') + ' ' + (i + 1) + '번 칸');
        ui.cells[line].push(b); grid.appendChild(b);
      })(L[0], i);
    });
    board.appendChild(grid);
    bottom.appendChild(board);
    // 재생·빠르기·지우기
    var ctl = el('div', 'ml-ctl');
    ui.playBtn = btn('ml-playbtn', '▶ 재생', function () { if (S.play.playing) stopPlayback(); else startPlayback(); });
    ctl.appendChild(ui.playBtn);
    var tempos = el('div', 'ml-tempos'); ui.tempoBtns = {};
    D.PLAY.tempos.forEach(function (t) {
      var b = btn('ml-tempo', t.label, function () { S.play.song.tempo = t.id; dirty(); renderPlay(); restartIfPlaying(); });
      ui.tempoBtns[t.id] = b; tempos.appendChild(b);
    });
    ctl.appendChild(tempos);
    // 함께 연주(반주) · 깡총 박자 · 예시 음악 — 소리한스푼처럼 소리를 풍성하게
    var backs = el('div', 'ml-tempos ml-backs'); ui.backBtns = {};
    D.PLAY.backings.forEach(function (bk) {
      var b = btn('ml-tempo', bk.short, function () { S.play.song.backing = bk.id; dirty(); renderPlay(); restartIfPlaying(); toast('🎶 ' + bk.label + (bk.id === 'off' ? '' : ' · 한 바퀴마다 화음이 바뀌어요')); });
      b.setAttribute('aria-label', '함께 연주: ' + bk.label); b.title = bk.label;
      ui.backBtns[bk.id] = b; backs.appendChild(b);
    });
    ctl.appendChild(backs);
    var extra = el('div', 'ml-tempos');
    ui.swingBtn = btn('ml-tempo ml-swing', '깡총 박자', function () { S.play.song.swing = !S.play.song.swing; dirty(); renderPlay(); restartIfPlaying(); });
    extra.appendChild(ui.swingBtn);
    extra.appendChild(btn('ml-tempo ml-example', '🎼 예시 음악', function () { openExamples(); }));
    ctl.appendChild(extra);
    ctl.appendChild(btn('ml-clear', '전체 지우기', function () { clearAll(); }));
    bottom.appendChild(ctl);
    s.appendChild(bottom);
    st.appendChild(s);

    // 무대 위 요소 끌어 옮기기
    ui.tokens.addEventListener('pointerdown', onTokenDown);
    pal.addEventListener('pointerdown', onPalDown);
    window.addEventListener('pointermove', onTokenMove);
    window.addEventListener('pointerup', onTokenUp);
    window.addEventListener('pointercancel', onTokenUp);
  }

  function openPlay() {
    stopRun();
    var ms = melSave();
    S.play = { song: cleanSong(ms.song), sel: null, playing: false, dirty: false, drag: null, band: {} };
    preloadBand();
    ui.nameInput.value = S.play.song.name;
    showScene('play');
    renderPlay();
    if (ms.song) toast('저장한 작품을 불러왔어요' + (S.play.song.name ? ': ' + S.play.song.name : ''));
  }
  function dirty() { S.play.dirty = true; ui.saveBtn.classList.add('dirty'); }
  function renderPlay() {
    var P = S.play, song = P.song, onStage = {}, si = P.sel && itemOf(P.sel);
    song.stage.forEach(function (p) { onStage[p.id] = p; });
    // 무대 위 요소
    ui.tokens.textContent = ''; P.tokenEls = {};
    song.stage.slice().sort(function (a, b) { return a.y - b.y; }).forEach(function (p) {
      var it = itemOf(p.id), t = el('div', 'ml-token band ' + it.line + (P.sel === p.id ? ' sel' : ''));
      t.dataset.id = p.id;
      t.style.left = pct(p.x, IW); t.style.top = pct(p.y, IH);
      // 캔버스 320×320 그대로(자르기·확대·뒤집기 없음). 캐릭터마다 발끝 높이가 달라 아래 여백만 맞춤
      var im = el('img', 'ml-token-band'); im.alt = ''; im.draggable = false;
      im.style.marginBottom = 'calc(var(--band-w) * ' + (-(D.PLAY.band.canvas - (D.PLAY.band.foot[it.band] || 310)) / D.PLAY.band.canvas - 0.03).toFixed(4) + ')';
      t.appendChild(im);
      if (!P.band[p.id]) P.band[p.id] = new Band(im, it.band); else { P.band[p.id].img = im; P.band[p.id].cur = ''; P.band[p.id].update(AU.heardNow()); }
      t.appendChild(el('span', 'ml-token-name', it.name));
      t.setAttribute('role', 'button'); t.setAttribute('tabindex', '0'); t.setAttribute('aria-label', '무대 위 ' + it.name + (P.sel === p.id ? ' (골랐어요)' : ''));
      t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectItem(p.id, true); } if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeItem(p.id); } });
      P.tokenEls[p.id] = t; ui.tokens.appendChild(t);
    });
    ui.emptyHint.hidden = song.stage.length > 0;
    // 선택 표시 · 빼기 버튼
    var sp = P.sel && onStage[P.sel];
    ui.delBtn.hidden = !sp || P.playing;
    if (sp) { ui.delBtn.style.left = pct(sp.x, IW); ui.delBtn.style.top = pct(Math.min(sp.y + 34, AREA.y1 + 8), IH); }
    // 고르기 버튼
    D.PLAY.items.forEach(function (it) {
      var b = ui.palBtns[it.id];
      b.classList.toggle('on-stage', !!onStage[it.id]); b.classList.toggle('sel', P.sel === it.id);
    });
    // 소리판
    ['rhythm', 'melody'].forEach(function (line) {
      ui.cells[line].forEach(function (c, i) {
        var id = song[line][i], it = id && itemOf(id);
        c.textContent = it ? it.icon : '';
        c.classList.toggle('filled', !!it);
        c.classList.toggle('mine', !!(it && P.sel === id));
        c.classList.toggle('target', !it && !P.playing && !!(si && si.line === line));
        c.setAttribute('aria-label', (line === 'rhythm' ? '리듬' : '멜로디') + ' ' + (i + 1) + '번 칸: ' + (it ? it.name : '비었어요'));
      });
    });
    ui.selInfo.textContent = si ? si.icon + ' ' + si.name + ' — ' + (si.line === 'rhythm' ? '리듬' : '멜로디') + ' 줄 칸을 눌러 넣어요(한 번 더 누르면 빼요)' : '연주자를 고른 뒤 칸을 눌러 연주 순서를 정해요';
    Object.keys(ui.tempoBtns).forEach(function (k) { ui.tempoBtns[k].classList.toggle('on', song.tempo === k); ui.tempoBtns[k].setAttribute('aria-pressed', String(song.tempo === k)); });
    Object.keys(ui.backBtns).forEach(function (k) { ui.backBtns[k].classList.toggle('on', song.backing === k); ui.backBtns[k].setAttribute('aria-pressed', String(song.backing === k)); });
    ui.swingBtn.classList.toggle('on', !!song.swing); ui.swingBtn.setAttribute('aria-pressed', String(!!song.swing));
    ui.playBtn.textContent = P.playing ? '■ 정지' : '▶ 재생';
    ui.playBtn.classList.toggle('stop', P.playing);
  }
  function preview(id) {
    AU.unlock();
    var it = itemOf(id); if (!it) return;
    AU.play(it.sound, null, { note: it.note, vol: 0.9 });
    if (S.play.band[id]) S.play.band[id].hitAt(AU.now());   // 바로 연주 자세(frame_02)부터
  }
  function freeSpot() {
    var st = S.play.song.stage;
    for (var i = 0; i < SPOTS.length; i++) {
      var s = SPOTS[i];
      if (!st.some(function (p) { return Math.hypot(p.x - s[0], p.y - s[1]) < 70; })) return { x: s[0], y: s[1] };
    }
    return { x: 700 + Math.random() * 270, y: 420 + Math.random() * 160 };
  }
  function pickItem(id) {
    var P = S.play, on = P.song.stage.some(function (p) { return p.id === id; });
    if (!on) {
      if (P.song.stage.length >= D.PLAY.maxOnStage) { toast('무대에는 ' + D.PLAY.maxOnStage + '개까지 올릴 수 있어요'); return; }
      var sp = freeSpot();
      P.song.stage.push({ id: id, x: sp.x, y: sp.y }); dirty();
      // 처음 올리면 그 줄의 빈 칸 하나에 바로 넣어 줌(누르자마자 재생하면 소리가 나게)
      var it = itemOf(id), row = P.song[it.line], at = row.indexOf(null);
      if (row.indexOf(id) < 0 && at >= 0) { row[at] = id; toast(it.icon + ' ' + (at + 1) + '번 칸에 넣었어요. 다른 칸을 눌러 더 넣어 봐요!'); }
    }
    P.sel = id;
    renderPlay();
    preview(id);
  }
  // 칸에 끌어다 놓기(고르기 버튼이나 무대 위 요소를 소리판 칸으로)
  function dropOnCell(id, line, i) {
    var P = S.play, it = itemOf(id); if (!it) return;
    if (it.line !== line) { toast(it.name + '은(는) ' + (it.line === 'rhythm' ? '리듬' : '멜로디') + ' 줄에 넣어요'); return; }
    if (!P.song.stage.some(function (p) { return p.id === id; })) {
      if (P.song.stage.length >= D.PLAY.maxOnStage) { toast('무대에는 ' + D.PLAY.maxOnStage + '개까지 올릴 수 있어요'); return; }
      var sp = freeSpot(); P.song.stage.push({ id: id, x: sp.x, y: sp.y });
    }
    P.song[line][i] = id; P.sel = id;
    dirty(); renderPlay(); preview(id);
  }
  function cellAt(x, y) {
    var c = document.elementFromPoint(x, y); c = c && c.closest && c.closest('.ml-cell');
    if (!c) return null;
    var line = c.classList.contains('rhythm') ? 'rhythm' : 'melody';
    return { line: line, i: ui.cells[line].indexOf(c) };
  }
  function selectItem(id, sound) { S.play.sel = id; renderPlay(); if (sound) preview(id); }
  function removeItem(id) {
    var P = S.play; if (!id) return;
    P.song.stage = P.song.stage.filter(function (p) { return p.id !== id; });
    ['rhythm', 'melody'].forEach(function (line) { P.song[line] = P.song[line].map(function (x) { return x === id ? null : x; }); });
    delete P.band[id];
    if (P.sel === id) P.sel = null;
    dirty(); renderPlay();
    toast(itemOf(id).name + '을(를) 무대에서 뺐어요');
  }
  function tapCell(line, i) {
    var P = S.play, song = P.song, it = P.sel && itemOf(P.sel);
    if (it && it.line === line) {
      song[line][i] = song[line][i] === it.id ? null : it.id;   // 한 칸에는 소리 하나만(같은 걸 다시 누르면 빼기)
      if (song[line][i]) preview(it.id);
    } else if (song[line][i]) {
      song[line][i] = null;   // 고른 것이 없거나 다른 줄 요소면: 채운 칸을 누르면 비우기
    } else {
      toast(it ? it.name + '은(는) ' + (it.line === 'rhythm' ? '리듬' : '멜로디') + ' 줄에 넣어요' : '먼저 위에서 ' + (line === 'rhythm' ? '리듬' : '멜로디') + ' 연주자를 골라요');
      return;
    }
    dirty(); renderPlay();
  }
  function clearAll() {
    var P = S.play;
    if (!P.song.stage.length && !P.song.name) return;
    showModal('전체 지울까요?', ['무대 위 요소와 소리판이 모두 비워져요.'], [
      { text: '모두 지우기', main: true, fn: function () { hideModal(); stopPlayback(); var keep = P.song; P.song = emptySong(); ['name', 'tempo', 'backing', 'swing'].forEach(function (k) { P.song[k] = keep[k]; }); P.sel = null; P.band = {}; dirty(); renderPlay(); } },
      { text: '취소', fn: hideModal }
    ]);
  }
  function saveSong() {
    var P = S.play;
    P.song.name = ui.nameInput.value.trim().slice(0, 14);
    var ok = patchMel(function (g) { g.song = JSON.parse(JSON.stringify(P.song)); g.song.savedAt = new Date().toISOString(); });
    P.dirty = false; ui.saveBtn.classList.remove('dirty');
    toast(ok ? '💾 ‘' + (P.song.name || '나의 무대') + '’을(를) 저장했어요' : '이 기기에는 저장할 수 없어요. 이번에만 남아요.');
  }
  function leavePlay() {
    var P = S.play;
    stopPlayback();
    if (P && P.dirty) {
      showModal('저장할까요?', ['바꾼 작품을 저장하지 않았어요.'], [
        { text: '저장하고 나가기', main: true, fn: function () { saveSong(); toLobby(); } },
        { text: '그냥 나가기', fn: function () { toLobby(); } },
        { text: '계속 만들기', fn: hideModal }
      ]);
      return;
    }
    toLobby();
  }
  // ---------- 재생: 칸 1→8 반복(오디오 시계로 예약) ----------
  function startPlayback() {
    var P = S.play;
    if (!AU.unlock()) { toast('이 브라우저는 소리를 낼 수 없어요'); return; }
    if (!P.song.rhythm.concat(P.song.melody).some(Boolean)) {
      toast('아래 칸이 비어 있어서 소리가 안 나요. 연주자를 고르고 칸을 눌러 넣어요!');
      ['rhythm', 'melody'].forEach(function (l) { ui.cells[l].forEach(function (c) { c.classList.remove('nudge'); void c.offsetWidth; c.classList.add('nudge'); }); });
      return;
    }
    var bpm = D.PLAY.tempos.filter(function (t) { return t.id === P.song.tempo; })[0].bpm, beat = 60 / bpm;
    P.playing = true; P.hits = [];
    P.t0 = AU.now() + 0.12; P.beat = beat;
    var style = P.song.backing;
    P.sched = AU.beatScheduler(P.t0, beat, function (n, t) {
      var i = n % D.PLAY.steps;
      AU.backing(style, n, t, beat, D.PLAY.steps);
      ['rhythm', 'melody'].forEach(function (line) {
        var id = P.song[line][i], it = id && itemOf(id);
        if (!it) return;
        AU.play(it.sound, t, { note: it.note, dur: beat * 0.55, vol: 0.9 });
        if (P.band[id]) P.band[id].hitAt(t);
      });
      P.hits.push({ t: t, col: i });
    }, !!P.song.swing);
    renderPlay();
  }
  function restartIfPlaying() { if (S.play.playing) { stopPlayback(); startPlayback(); } }
  // 예시 음악 골라 듣기 → 그대로 바꿔 보며 나만의 음악으로
  function openExamples() {
    var P = S.play, has = P.song.rhythm.concat(P.song.melody).some(Boolean);
    var btns = D.PLAY.examples.map(function (ex) {
      return { text: '🎵 ' + ex.name, main: true, fn: function () { hideModal(); loadExample(ex); } };
    });
    btns.push({ text: '취소', fn: hideModal });
    showModal('예시 음악', ['골라서 들어 보고, 칸을 바꿔 나만의 음악으로 만들어요!', has ? '지금 소리판 대신 예시가 들어가요. (저장한 작품은 그대로예요)' : ''], btns);
  }
  function loadExample(ex) {
    var P = S.play; stopPlayback();
    var song = emptySong(), used = [];
    ['rhythm', 'melody'].forEach(function (line) { ex[line].forEach(function (id, i) { song[line][i] = id; if (id && used.indexOf(id) < 0) used.push(id); }); });
    used.slice(0, D.PLAY.maxOnStage).forEach(function (id, k) { song.stage.push({ id: id, x: SPOTS[k % SPOTS.length][0], y: SPOTS[k % SPOTS.length][1] }); });
    song.name = P.song.name || ex.name; song.tempo = ex.tempo; song.backing = ex.backing; song.swing = ex.swing;
    P.song = cleanSong(song); P.sel = null; P.band = {};
    ui.nameInput.value = P.song.name;
    dirty(); renderPlay(); startPlayback();
    toast('🎼 ‘' + ex.name + '’ 예시예요. 칸을 바꿔 나만의 음악으로 만들어 봐요!');
  }
  function stopPlayback() {
    var P = S.play;
    if (!P || !P.playing) return;
    P.playing = false;
    if (P.sched) P.sched.stop();
    Object.keys(P.band).forEach(function (k) { P.band[k].cancel(); });
    ui.colHeads.forEach(function (h) { h.classList.remove('now'); });
    ['rhythm', 'melody'].forEach(function (l) { ui.cells[l].forEach(function (c) { c.classList.remove('now'); }); });
    renderPlay();
  }
  function playFrame(now) {
    var P = S.play; if (!P) return;
    var t = AU.heardNow();
    Object.keys(P.band).forEach(function (k) { P.band[k].update(t); });
    if (!P.playing) return;
    while (P.hits.length && P.hits[0].t <= t) {
      var h = P.hits.shift();
      if (h.col != null) {
        ui.colHeads.forEach(function (x, k) { x.classList.toggle('now', k === h.col); });
        ['rhythm', 'melody'].forEach(function (l) { ui.cells[l].forEach(function (c, k) { c.classList.toggle('now', k === h.col); }); });
      }
    }
  }
  // 무대 위 끌기
  function areaPoint(e) {
    var r = ui.stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * IW, y: (e.clientY - r.top) / r.height * IH };
  }
  function onTokenDown(e) {
    var t = e.target.closest && e.target.closest('.ml-token');
    if (!t || S.scene !== 'play') return;
    e.preventDefault();
    var p = S.play.song.stage.filter(function (x) { return x.id === t.dataset.id; })[0], q = areaPoint(e);
    S.play.drag = { id: p.id, sx: q.x, sy: q.y, ox: p.x, oy: p.y, moved: false, el: t };
    if (t.setPointerCapture) try { t.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ }
  }
  function onTokenMove(e) {
    if (S.play && S.play.pdrag) { onPalMove(e); return; }
    var d = S.play && S.play.drag; if (!d) return;
    var q = areaPoint(e), dx = q.x - d.sx, dy = q.y - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 12) return;
    d.moved = true;
    var p = S.play.song.stage.filter(function (x) { return x.id === d.id; })[0];
    p.x = Math.max(AREA.x0, Math.min(AREA.x1, d.ox + dx)); p.y = Math.max(AREA.y0, Math.min(AREA.y1, d.oy + dy));
    d.el.style.left = pct(p.x, IW); d.el.style.top = pct(p.y, IH); d.el.classList.add('drag');
    ui.delBtn.hidden = true; ui.stageArea.hidden = false;   // 끄는 동안만 놓을 수 있는 곳을 보여 줌
  }
  function onTokenUp(e) {
    if (S.play && S.play.pdrag) { onPalUp(e); return; }
    var d = S.play && S.play.drag; if (!d) return;
    S.play.drag = null; ui.stageArea.hidden = true;
    var cell = d.moved && e && e.type === 'pointerup' && cellAt(e.clientX, e.clientY);
    if (cell) {   // 소리판 칸 위에서 놓으면: 자리는 그대로, 그 칸에 넣기
      var p = S.play.song.stage.filter(function (x) { return x.id === d.id; })[0];
      if (p) { p.x = d.ox; p.y = d.oy; }
      dropOnCell(d.id, cell.line, cell.i);
      return;
    }
    if (d.moved) { dirty(); S.play.sel = d.id; renderPlay(); }
    else selectItem(d.id, true);
  }
  // 고르기 버튼을 끌어서 칸에 넣기(끌지 않고 누르면 그냥 고르기)
  function onPalDown(e) {
    var b = e.target.closest && e.target.closest('.ml-pal');
    if (!b || S.scene !== 'play' || (e.button && e.button !== 0)) return;
    S.play.palDragged = false;
    S.play.pdrag = { id: b.dataset.id, x: e.clientX, y: e.clientY, ghost: null };
  }
  function onPalMove(e) {
    var d = S.play && S.play.pdrag; if (!d) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10) return;
      var it = itemOf(d.id);
      d.ghost = el('div', 'ml-ghost', it.icon); document.body.appendChild(d.ghost);
      S.play.sel = d.id; renderPlay();
    }
    d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px';
    var cell = cellAt(e.clientX, e.clientY);
    ['rhythm', 'melody'].forEach(function (l) { ui.cells[l].forEach(function (c, k) { c.classList.toggle('over', !!cell && cell.line === l && cell.i === k); }); });
  }
  function onPalUp(e) {
    var d = S.play.pdrag; S.play.pdrag = null;
    if (!d.ghost) return;   // 끌지 않았으면 click 으로 고르기
    d.ghost.remove(); S.play.palDragged = true;
    setTimeout(function () { if (S.play) S.play.palDragged = false; }, 400);
    ['rhythm', 'melody'].forEach(function (l) { ui.cells[l].forEach(function (c) { c.classList.remove('over'); }); });
    var cell = e && e.type === 'pointerup' && cellAt(e.clientX, e.clientY);
    if (cell) dropOnCell(d.id, cell.line, cell.i);
    else pickItem(d.id);
  }

  // =====================================================================
  // 입력
  // =====================================================================
  var DANCE_KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', Space: 'freeze' };
  var held = {};
  function onKey(e, down) {
    if (!S.open) return;
    if (S.scene === 'lobby' && !S.dialog && ui.modal.hidden) {
      if (KEYMAP[e.code]) { e.preventDefault(); S.keys[KEYMAP[e.code]] = down; return; }
      if (down && e.code === 'Space' && !e.repeat) { e.preventDefault(); if (S.nearNpc) openDialog(); else if (S.nearExit) close(); }
      if (down && e.code === 'Escape') { e.preventDefault(); close(); }
      return;
    }
    if (S.scene === 'lobby' && S.dialog && down && e.code === 'Escape') { e.preventDefault(); closeDialog(); return; }
    if (S.scene === 'dance') {
      var a = DANCE_KEYS[e.code];
      if (a && ui.modal.hidden) {
        e.preventDefault();   // Space 가 화면 버튼을 누르지 않게
        if (!down) { held[e.code] = false; return; }
        if (e.repeat || held[e.code]) return;   // 누르고 있어도 한 번만
        held[e.code] = true;
        input(a, e);
        return;
      }
      if (down && e.code === 'Escape' && ui.modal.hidden && S.run) { e.preventDefault(); pauseRun(true); }
    }
  }

  function init() {
    if (!D || !RH || !AU || !document.getElementById('melody')) return;
    build();
    window.addEventListener('keydown', function (e) { onKey(e, true); });
    window.addEventListener('keyup', function (e) { onKey(e, false); });
    window.addEventListener('blur', function () { S.keys = {}; held = {}; });
    document.addEventListener('visibilitychange', onVisibility);
    ui.canvas.addEventListener('pointerdown', onLobbyPointer);
  }
  window.MPMelody = {
    open: open, close: close, _state: S, _ui: ui, _walkable: walkable,
    _dev: { input: input, startRun: startRun, openMissionIntro: openMissionIntro, openPlay: openPlay, pauseRun: pauseRun, resumeRun: resumeRun }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
