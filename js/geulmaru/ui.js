/*
 * 우리말 글마루 화면 (예전 '스타 페스티벌' 자리, 시설 id 'star' 그대로)
 * ------------------------------------------------------------
 * 장면 1 한옥 서재 로비(assets/geulmaru/lobby.webp): 공원 캐릭터로 마루를 걸어 다님.
 *        들어오면 범이와 소리가 한 번 인사(greet.webp 8프레임) → 기본 자세로 기다림.
 *        범이에게 '말 걸기' → 시작 창(학년 1~6) → 게임 방법 창 → [낱말 놀이 시작]
 * 장면 2 낱말 놀이(한 화면, 첨부 시안 기준): 위 간판·학년·진행도·별등 10개 / 가운데 펼친 책(문제판) /
 *        왼쪽 범이, 오른쪽 소리(각각 따로 움직이는 그림). 답 확인 → 뜻 풀이·새 예문 → '다음 낱말'을 누르면 별등 하나가 켜짐
 *        10문제를 마치면 별등이 왼쪽부터 차례로 빛나고 결과 창(틀린 낱말 다시 풀기 · 한 번 더 · 로비로 돌아가기)
 * 위치는 모두 배경 그림(1672×941) 기준 %라서 창 크기가 바뀌어도 함께 커지고 작아집니다(토리네 도시락과 같은 방식).
 * 문제 은행·출제는 js/geulmaru/words.js, 공원과의 연결(저장·티켓)은 window.MP_API (game.js)
 * 저장: save.geulmaru = { cleared, rounds, reviews, mute, lastGrade,
 *        grades: { g2: { plays, firstScore, lastScore, best, done, wrong: [낱말], at, review: { score, total, at } } } }
 */
(function () {
  'use strict';
  var W = window.MP_GEULMARU;
  var IW = 1672, IH = 941, BASE = 'assets/geulmaru/';
  var FID = 'star';   // 지도·저장·티켓에 쓰는 시설 id(예전 이름 그대로 두어 기존 기록과 맞춤)
  var TIP = '방향키나 마루를 눌러 걸어가서, 범이 임금님에게 말을 걸어 봐요';
  var HELLO = '어서 오렴! 우리말 글마루에 온 것을 환영한다. 나와 함께 낱말의 뜻을 알아보고 열 개의 별등을 밝혀 보자꾸나!';
  var DONE_SAYS = '열 개의 별등이 모두 밝혀졌구나! 오늘 배운 우리말을 생활 속에서도 사용해 보렴.';
  var PRAISE = ['훌륭하구나!', '낱말의 뜻을 정확히 알고 있구나!', '참 잘했어!', '멋지구나!'];
  var CHEER = ['괜찮단다. 함께 뜻을 알아보자꾸나!', '지금 알게 되었으니 잘 기억해 보렴.', '새로운 낱말을 하나 배웠구나!'];
  var GUIDE = '문장을 천천히 읽어 보렴. 모르겠으면 나를 눌러 보거라.';

  // ---------- 그림(tools/build_geulmaru.py 가 만든 가로 띠, 칸 크기·발 기준점) ----------
  var SP = {
    beomi: { src: 'beomi.webp', n: 16, cw: 182, ch: 249, fx: 72, fy: 243 },   // 0~7 정답, 8~15 오답 설명, 0 = 기본 자세
    sori: { src: 'sori.webp', n: 16, cw: 283, ch: 244, fx: 114, fy: 238 },    // 0~7 정답 날갯짓, 8~15 오답 갸웃
    greet: { src: 'greet.webp', n: 8, cw: 390, ch: 387, fx: 104, fy: 381 }    // 범이와 소리 입장 인사, fx = 범이 신발 가운데
  };
  var FPS_MS = 110;   // 약 9FPS
  // 게임 화면 배치(그림 좌표): 발 위치와 배율. 범이는 책 왼쪽, 소리는 책 오른쪽(책·선택지·버튼을 가리지 않게)
  var G_BEOMI = { x: 196, y: 878, k: 1.72 };
  var G_SORI = { x: 1494, y: 850, k: 1.16 };
  // 로비: 범이 발 위치와 배율(범이 키 약 250)
  var L_PAIR = { x: 760, y: 716, k: 0.74 };
  var GREET_MS = [240, 130, 130, 300, 170, 130, 130, 140];

  var S = {
    open: false, scene: 'lobby', grade: 1,
    me: { x: 836, y: 880, dir: 'up', moving: false }, keys: {}, dest: null, nearNpc: false, nearExit: false,
    modal: null, greetT: -1, raf: 0, last: 0,
    mode: 'main', items: [], idx: 0, sel: -1, checked: false, busy: false, score: 0, wrong: [], lit: 0, saved: false,
    mainResult: null, timers: []
  };
  var ui = {};

  // ---------- 작은 도우미 ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function pct(v, of) { return (v / of * 100) + '%'; }
  function api() { return window.MP_API; }
  function save() { return (api() && api().readSave()) || {}; }
  function gsave() { var g = save().geulmaru; return g && typeof g === 'object' ? JSON.parse(JSON.stringify(g)) : {}; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function later(fn, ms) { var t = setTimeout(fn, ms); S.timers.push(t); return t; }
  function clearTimers() { S.timers.forEach(clearTimeout); S.timers = []; }
  function josa(w, a, b) {
    var c = w.charCodeAt(w.length - 1) - 0xAC00, has = c >= 0 && c <= 11171 && c % 28 !== 0;
    return w + (has ? a : b);
  }
  var IMGS = {};
  ['beomi', 'sori', 'greet'].forEach(function (k) { var i = new Image(); i.src = BASE + SP[k].src; IMGS[k] = i; });
  ['book', 'lamp-off', 'lamp-on', 'lobby'].forEach(function (n) { var i = new Image(); i.src = BASE + n + '.webp'; });

  // ---------- 따로 움직이는 캐릭터(가로 띠 그림을 한 칸씩 보여 줌) ----------
  function Sprite(kind, pos, cls, label) {
    var sp = SP[kind], e = el('div', 'gm-sprite ' + cls);
    e.setAttribute('role', 'img'); e.setAttribute('aria-label', label);
    e.style.backgroundImage = 'url(' + BASE + sp.src + ')';
    e.style.backgroundSize = (sp.n * 100) + '% 100%';
    var w = sp.cw * pos.k, h = sp.ch * pos.k;
    e.style.left = pct(pos.x - sp.fx * pos.k, IW); e.style.top = pct(pos.y - sp.fy * pos.k, IH);
    e.style.width = pct(w, IW); e.style.height = pct(h, IH);
    this.e = e; this.sp = sp; this.timer = 0;
    this.frame(0);
  }
  Sprite.prototype.frame = function (i) { this.e.style.backgroundPosition = (i / (this.sp.n - 1) * 100) + '% 0'; };
  // from~to 프레임을 한 번 재생하고 기본 자세(0)로
  Sprite.prototype.play = function (from, to, done) {
    var self = this, i = from;
    this.stop();
    (function tick() {
      self.frame(i);
      if (i >= to) { self.timer = setTimeout(function () { self.frame(0); self.timer = 0; if (done) done(); }, FPS_MS); return; }
      i++; self.timer = setTimeout(tick, FPS_MS);
    })();
  };
  Sprite.prototype.stop = function () { clearTimeout(this.timer); this.timer = 0; this.frame(0); };

  // ---------- 효과음(짧고 부드러운 소리, 화면 오른쪽 위 🔊 로 끄고 켬) ----------
  var AC = null;
  function audio() {
    if (gsave().mute) return null;
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
    } catch (e) { return null; }
    return AC;
  }
  function tone(f, at, dur, vol, type) {
    var c = audio(); if (!c) return;
    var t = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  var SFX = {
    tap: function () { tone(660, 0, 0.12, 0.05, 'triangle'); },
    right: function () { tone(659, 0, 0.25, 0.11); tone(988, 0.12, 0.4, 0.1); },
    wrong: function () { tone(392, 0, 0.3, 0.08, 'triangle'); tone(330, 0.16, 0.38, 0.07, 'triangle'); },
    lamp: function () { tone(1319, 0, 0.5, 0.07); tone(1976, 0.05, 0.6, 0.04); },
    finale: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, i * 0.14, 0.6, 0.07); }); }
  };

  // ---------- 화면 만들기 ----------
  function build() {
    ui.root = document.getElementById('geulmaru');
    var st = ui.stage = el('div', 'gm-stage');
    ui.root.appendChild(st);

    // 로비
    var lobby = ui.lobby = el('div', 'gm-scene gm-lobby');
    lobby.style.backgroundImage = 'url(' + BASE + 'lobby.webp)';
    ui.canvas = el('canvas', 'gm-canvas'); ui.canvas.width = IW; ui.canvas.height = IH;
    ui.canvas.setAttribute('aria-label', '우리말 글마루 한옥 서재. 방향키나 화면을 눌러 걸어요');
    lobby.appendChild(ui.canvas);
    ui.hello = el('p', 'gm-bubble gm-hello', HELLO); ui.hello.hidden = true; lobby.appendChild(ui.hello);
    ui.talk = btn('gm-prompt', '', function () { openStart(); });
    ui.talk.innerHTML = '말 걸기 <kbd>스페이스</kbd>'; ui.talk.hidden = true;
    ui.leave = btn('gm-prompt gm-prompt-exit', '', function () { close(); });
    ui.leave.innerHTML = '공원으로 나가기 <kbd>스페이스</kbd>'; ui.leave.hidden = true;
    ui.tip = el('p', 'gm-tip', TIP);
    ui.lobbyExit = btn('gm-pill gm-exit', '공원으로', function () { close(); });
    [ui.talk, ui.leave, ui.tip, ui.lobbyExit].forEach(function (n) { lobby.appendChild(n); });
    ui.lmodal = el('div', 'gm-modal'); ui.lmodal.hidden = true;
    ui.lcard = el('div', 'gm-card'); ui.lcard.setAttribute('role', 'dialog'); ui.lcard.setAttribute('aria-modal', 'true');
    ui.lmodal.appendChild(ui.lcard);
    ui.lmodal.addEventListener('pointerdown', function (e) { if (e.target === ui.lmodal) closeModal(); });
    lobby.appendChild(ui.lmodal);
    st.appendChild(lobby);

    // 낱말 놀이
    var game = ui.game = el('div', 'gm-scene gm-game'); game.hidden = true;
    var bg = el('div', 'gm-bg'); bg.style.backgroundImage = 'url(' + BASE + 'lobby.webp)'; game.appendChild(bg);
    var back = btn('gm-back', '', function () { toLobby(); });
    back.setAttribute('aria-label', '로비로 돌아가기');
    back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>';
    game.appendChild(back);
    ui.mute = btn('gm-mute', '', toggleMute); game.appendChild(ui.mute);
    ui.sign = el('h2', 'gm-sign');
    ui.sign.innerHTML = '<span class="gm-sign-flower" aria-hidden="true">✿</span><span class="gm-sign-text">우리말 글마루</span><span class="gm-sign-flower" aria-hidden="true">✿</span>';
    game.appendChild(ui.sign);
    var status = el('div', 'gm-status');
    ui.sGrade = el('span', 'gm-s-grade'); ui.sProg = el('span', 'gm-s-prog');
    ui.lamps = el('span', 'gm-lamps'); ui.lamps.setAttribute('role', 'img');
    status.appendChild(ui.sGrade); status.appendChild(el('span', 'gm-s-bar', '|'));
    status.appendChild(ui.sProg); status.appendChild(el('span', 'gm-s-bar', '|')); status.appendChild(ui.lamps);
    game.appendChild(status);

    ui.beomi = new Sprite('beomi', G_BEOMI, 'gm-beomi', '호랑이 임금님 범이');
    ui.beomi.e.addEventListener('click', showHint);
    ui.sori = new Sprite('sori', G_SORI, 'gm-sori', '까치 소리');
    game.appendChild(ui.beomi.e); game.appendChild(ui.sori.e);
    ui.say = el('p', 'gm-bubble gm-say'); ui.say.setAttribute('aria-live', 'polite'); game.appendChild(ui.say);

    var book = ui.book = el('div', 'gm-book');
    var head = ui.head = el('div', 'gm-head');
    ui.sent = el('p', 'gm-sent'); ui.q = el('p', 'gm-q');
    head.appendChild(ui.sent); head.appendChild(ui.q);
    book.appendChild(head);
    var opts = ui.opts = el('div', 'gm-opts'); opts.setAttribute('role', 'radiogroup'); opts.setAttribute('aria-label', '선택지');
    ui.optBtns = [0, 1, 2].map(function (i) {
      var b = btn('gm-opt', '', function () { choose(i); });
      b.setAttribute('role', 'radio');
      b.appendChild(el('span', 'gm-opt-num', '①②③'[i]));
      b.appendChild(el('span', 'gm-opt-text'));
      b.appendChild(el('span', 'gm-opt-tag'));
      opts.appendChild(b); return b;
    });
    book.appendChild(opts);
    var foot = el('div', 'gm-foot');
    ui.explain = el('div', 'gm-explain'); ui.explain.setAttribute('aria-live', 'polite');
    ui.go = btn('gm-go', '답 확인', function () { if (S.checked) next(); else check(); });
    foot.appendChild(ui.explain); foot.appendChild(ui.go);
    book.appendChild(foot);
    game.appendChild(book);

    ui.gmodal = el('div', 'gm-modal'); ui.gmodal.hidden = true;
    ui.gcard = el('div', 'gm-card gm-result'); ui.gcard.setAttribute('role', 'dialog'); ui.gcard.setAttribute('aria-modal', 'true');
    ui.gmodal.appendChild(ui.gcard); game.appendChild(ui.gmodal);
    st.appendChild(game);

    // 내 티켓(다른 시설과 같은 모양)
    ui.tickets = el('p', 'gm-tickets');
    ui.tickets.appendChild(el('span', '', '🎟'));
    ui.tickets.appendChild(document.createTextNode('티켓 '));
    ui.ticketNum = el('b', '', '0'); ui.tickets.appendChild(ui.ticketNum);
    ui.tickets.appendChild(document.createTextNode('장'));
    st.appendChild(ui.tickets);

    window.addEventListener('resize', function () { if (S.open && S.scene === 'game') fitAll(); });
  }

  // ---------- 열기·닫기 ----------
  function open() {
    if (!ui.root) return;
    S.grade = (api() && api().profile().grade) || gsave().lastGrade || 1;
    S.open = true;
    ui.root.hidden = false;
    document.body.classList.add('geulmaru-open');
    showScene('lobby');
    S.me = { x: 836, y: 890, dir: 'up', moving: false };
    S.dest = null; S.keys = {}; closeModal();
    // 입장 인사: 잠깐 뒤 한 번 재생하고 기본 자세로
    S.greetT = -1; ui.hello.hidden = true;
    later(function () { S.greetT = performance.now(); ui.hello.hidden = false; placeHello(); }, 450);
    later(function () { ui.hello.hidden = true; }, 7500);
    S.last = performance.now();
    cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(loop);
    updMute();
  }
  function close() {
    stopGame();
    S.open = false; cancelAnimationFrame(S.raf); clearTimers();
    ui.root.hidden = true;
    document.body.classList.remove('geulmaru-open');
    if (api() && api().exitGeulmaru) api().exitGeulmaru();
  }
  function showScene(name) {
    S.scene = name;
    ui.lobby.hidden = name !== 'lobby';
    ui.game.hidden = name !== 'game';
    ui.root.classList.toggle('is-game', name === 'game');
    showTickets();
  }
  // 게임 화면을 떠날 때: 캐릭터 움직임·예약된 일 정리
  function stopGame() {
    ui.beomi.stop(); ui.sori.stop(); clearTimers();
    ui.gmodal.hidden = true; S.busy = false;
    ui.sign.classList.remove('glow');
  }
  function toLobby() {
    stopGame();
    showScene('lobby');
    S.me = { x: L_PAIR.x + 40, y: L_PAIR.y + 120, dir: 'up', moving: false };   // 범이 앞에 서서 바로 다시 말을 걸 수 있게
    S.dest = null; S.keys = {}; closeModal(); ui.hello.hidden = true;
    S.last = performance.now();
  }
  function showTickets(from) {
    var e = ui.tickets, to = save().tickets || 0;
    e.className = 'gm-tickets at-' + S.scene;
    if (from == null || from >= to) { ui.ticketNum.textContent = String(to); return; }
    e.classList.add('gain');
    var n = from;
    (function up() { n++; ui.ticketNum.textContent = String(n); if (n < to) setTimeout(up, 150); else setTimeout(function () { e.classList.remove('gain'); }, 900); })();
  }
  function toggleMute() {
    var g = gsave(); g.mute = !g.mute;
    if (api()) api().patchSave({ geulmaru: g });
    updMute();
    if (!g.mute) SFX.tap();
  }
  function updMute() {
    var m = !!gsave().mute;
    ui.mute.textContent = m ? '🔇' : '🔊';
    ui.mute.setAttribute('aria-label', m ? '효과음 켜기' : '효과음 끄기');
  }

  // ---------- 로비 창: 시작(학년) → 게임 방법 ----------
  function faceCanvas() {
    var c = el('canvas', 'gm-face-img'); c.width = 182; c.height = 150;
    function draw() { var x = c.getContext('2d'); x.clearRect(0, 0, 182, 150); x.drawImage(IMGS.beomi, 0, 0, 182, 150, 0, 4, 182, 150); }
    if (IMGS.beomi.complete && IMGS.beomi.naturalWidth) draw(); else IMGS.beomi.addEventListener('load', draw, { once: true });
    var f = el('div', 'gm-face'); f.appendChild(c); return f;
  }
  function openStart() {
    if (S.modal) return;
    S.modal = 'start'; S.keys = {}; S.dest = null; S.me.moving = false;
    ui.talk.hidden = true; ui.leave.hidden = true; ui.tip.hidden = true; ui.hello.hidden = true;
    var c = ui.lcard; c.textContent = ''; c.className = 'gm-card gm-start';
    c.setAttribute('aria-label', '우리말 글마루 시작');
    c.appendChild(faceCanvas());
    var body = el('div', 'gm-start-body');
    body.appendChild(el('p', 'gm-start-name', '호랑이 임금님 범이'));
    body.appendChild(el('h2', 'gm-card-title', '우리말 글마루'));
    body.appendChild(el('p', 'gm-start-text', HELLO));
    var gr = el('div', 'gm-grades'); gr.setAttribute('role', 'radiogroup'); gr.setAttribute('aria-label', '학년');
    ui.gradeBtns = [];
    for (var g = 1; g <= 6; g++) (function (g) {
      var b = btn('gm-grade', g + '학년', function () { setGrade(g); });
      b.setAttribute('role', 'radio'); ui.gradeBtns.push(b); gr.appendChild(b);
    })(g);
    body.appendChild(gr);
    ui.gradeNote = el('p', 'gm-grade-note'); body.appendChild(ui.gradeNote);
    ui.ticketNote = el('p', 'gm-ticket-note'); body.appendChild(ui.ticketNote);
    var acts = el('div', 'gm-acts');
    var go = btn('gm-choice', '다음', openHowto);
    acts.appendChild(go);
    acts.appendChild(btn('gm-choice light', '나중에 할래', closeModal));
    body.appendChild(acts);
    c.appendChild(body);
    ui.lmodal.hidden = false;
    setGrade(S.grade);
    setTimeout(function () { go.focus(); }, 30);
  }
  function setGrade(g) {
    S.grade = g;
    ui.gradeBtns.forEach(function (b, i) { b.setAttribute('aria-checked', String(i + 1 === g)); b.classList.toggle('on', i + 1 === g); });
    var park = api() && api().profile().grade;
    ui.gradeNote.textContent = g + '학년 낱말: ' + W.THEMES[g] + ' · 10문제' + (park && park !== g ? ' (공원 학년은 ' + park + '학년이에요)' : '');
    ui.ticketNote.textContent = api() ? api().ticketNote(FID, g) : '';
  }
  function openHowto() {
    S.modal = 'howto';
    var c = ui.lcard; c.textContent = ''; c.className = 'gm-card gm-howto';
    c.setAttribute('aria-label', '게임 방법');
    c.appendChild(el('p', 'gm-howto-grade', S.grade + '학년 · ' + W.THEMES[S.grade]));
    c.appendChild(el('h2', 'gm-card-title', '범이 임금님과 함께 낱말 놀이를 해 볼까요?'));
    var ol = el('ol', 'gm-steps');
    ['문장을 천천히 읽어요.', '알맞은 낱말이나 뜻을 골라요.', '답 확인을 누르고 낱말의 뜻을 배워요.', '열 문제를 풀어 별등을 모두 밝혀요!'].forEach(function (t, i) {
      var li = el('li'); li.appendChild(el('span', 'gm-step-num', String(i + 1))); li.appendChild(el('span', '', t)); ol.appendChild(li);
    });
    c.appendChild(ol);
    var acts = el('div', 'gm-acts');
    var go = btn('gm-choice', '낱말 놀이 시작', function () { closeModal(); startRound('main'); });
    acts.appendChild(go);
    acts.appendChild(btn('gm-choice light', '학년 다시 고르기', function () { S.modal = null; openStart(); }));
    c.appendChild(acts);
    setTimeout(function () { go.focus(); }, 30);
  }
  function closeModal() { S.modal = null; ui.lmodal.hidden = true; if (ui.tip) ui.tip.hidden = false; S.keys = {}; }

  // ---------- 로비 걷기 ----------
  // 걸을 수 있는 마루(그림 좌표 다각형): 벽 아래 걸레받이 앞부터. 서안·방석·반닫이·등불·범이와 소리 발밑은 막음
  var FLOOR = [[0, 700], [120, 640], [1550, 640], [1672, 700], [1672, 935], [0, 935]];
  var BLOCK_RECTS = [
    { x: 130, y: 600, w: 380, h: 70, note: '서안과 방석' },
    { x: 1370, y: 600, w: 250, h: 50, note: '반닫이와 등불' }
  ];
  var NPC = { x: L_PAIR.x + 80, y: L_PAIR.y, rx: 150, ry: 26 };   // 범이와 소리 둘이 서 있는 자리
  var EXIT_Y = 900;
  function inPoly(x, y, p) {
    var c = false;
    for (var i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    }
    return c;
  }
  function walkable(x, y) {
    if (!inPoly(x, y, FLOOR)) return false;
    for (var i = 0; i < BLOCK_RECTS.length; i++) { var r = BLOCK_RECTS[i]; if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return false; }
    var tx = (x - NPC.x) / NPC.rx, ty = (y - NPC.y) / NPC.ry;
    return tx * tx + ty * ty >= 1;
  }
  var LOBBY_SCALE = 1.3, FLOOR_TOP = 640;
  function charH(y) {
    var r = ui.canvas.getBoundingClientRect(), px = api() && api().charScreenH ? api().charScreenH() : 94;
    var base = r.height ? px * IH / r.height : 125;
    var depth = 0.9 + Math.max(0, Math.min(1, (y - FLOOR_TOP) / (IH - FLOOR_TOP))) * 0.25;
    return base * LOBBY_SCALE * depth;
  }
  var KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  function step(dt) {
    if (S.modal || S.scene !== 'lobby') { S.me.moving = false; return; }
    var dx = 0, dy = 0, sp = 330 * dt, me = S.me;
    if (S.keys.left) dx -= 1; if (S.keys.right) dx += 1; if (S.keys.up) dy -= 1; if (S.keys.down) dy += 1;
    if (dx || dy) S.dest = null;
    else if (S.dest) {
      var tx = S.dest.x - me.x, ty = S.dest.y - me.y, d = Math.hypot(tx, ty);
      // 한 걸음보다 가까우면 그 자리에 바로 서기(지나쳤다 돌아오기를 되풀이하지 않게)
      if (d <= Math.max(6, sp)) {
        if (walkable(S.dest.x, S.dest.y)) { me.x = S.dest.x; me.y = S.dest.y; }
        S.dest = null;
        if (S.destTalk) { S.destTalk = false; S.talkNow = true; }
      } else { dx = tx / d; dy = ty / d; }
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
    S.nearNpc = Math.hypot(me.x - NPC.x, (me.y - NPC.y) * 1.4) < 230;
    S.nearExit = !S.nearNpc && me.y > EXIT_Y;
    ui.talk.hidden = !S.nearNpc;
    ui.leave.hidden = !S.nearExit;
    if (S.nearNpc) { ui.talk.style.left = pct(L_PAIR.x, IW); ui.talk.style.top = pct(L_PAIR.y - 330, IH); }
    if (S.nearExit) { ui.leave.style.left = pct(me.x, IW); ui.leave.style.top = pct(me.y - charH(me.y) - 70, IH); }
    if (S.talkNow) { S.talkNow = false; if (S.nearNpc) { me.dir = 'up'; openStart(); } }
  }
  function placeHello() { ui.hello.style.left = pct(L_PAIR.x + 60, IW); ui.hello.style.top = pct(L_PAIR.y - 300, IH); }
  function greetFrame(now) {
    if (S.greetT < 0) return 0;
    var ms = now - S.greetT;
    for (var i = 0; i < 8; i++) { if (ms < GREET_MS[i]) return i; ms -= GREET_MS[i]; }
    return 0;   // 한 번 재생하고 기본 자세로 멈춤
  }
  function shadow(c, x, y, w) {
    var g = c.createRadialGradient(x, y, 0, x, y, w);
    g.addColorStop(0, 'rgba(90,45,10,0.38)'); g.addColorStop(1, 'rgba(90,45,10,0)');
    c.save(); c.translate(x, y); c.scale(1, 0.28); c.translate(-x, -y);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, w, 0, Math.PI * 2); c.fill(); c.restore();
  }
  function drawPair(c, now) {
    var sp = SP.greet, im = IMGS.greet, k = L_PAIR.k, fi = greetFrame(now);
    shadow(c, L_PAIR.x, L_PAIR.y, 70); shadow(c, L_PAIR.x + 160, L_PAIR.y - 4, 44);
    if (!(im.complete && im.naturalWidth)) return;
    c.drawImage(im, fi * sp.cw, 0, sp.cw, sp.ch, L_PAIR.x - sp.fx * k, L_PAIR.y - sp.fy * k, sp.cw * k, sp.ch * k);
  }
  function drawMe(c, t) {
    var me = S.me, h = charH(me.y), sid = api() && api().character ? api().character().sid : 'F1';
    shadow(c, me.x, me.y, h * 0.3);
    if (!window.MPChars) return;
    var opt;
    if (me.moving) {
      var f = Math.floor(t * 7) % 4, side = me.dir === 'left' || me.dir === 'right';
      opt = f % 2 === 0 ? { walk: true, mirror: f === 2 && !side } : { bob: h * 0.02 };
    } else opt = { sy: 1 + Math.sin(t * 2.4) * 0.01 };
    if (!(me.moving && MPChars.drawAnim && MPChars.drawAnim(c, sid, me.x, me.y, me.dir, h, t)) &&
        !MPChars.drawSprite(c, sid, me.x, me.y, me.dir, h, opt)) MPChars.drawSprite(c, sid, me.x, me.y, me.dir, h, { bob: opt.bob });
  }
  var DEBUG = /[?&]debug=1/.test(location.search);
  function drawLobby(now) {
    var c = ui.canvas.getContext('2d'), t = now / 1000;
    c.clearRect(0, 0, IW, IH);
    [{ y: L_PAIR.y, draw: function () { drawPair(c, now); } }, { y: S.me.y, draw: function () { drawMe(c, t); } }]
      .sort(function (a, b) { return a.y - b.y; }).forEach(function (i) { i.draw(); });
    if (DEBUG) {
      c.strokeStyle = 'lime'; c.lineWidth = 3; c.beginPath();
      FLOOR.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); c.stroke();
      c.strokeStyle = 'red'; BLOCK_RECTS.forEach(function (r) { c.strokeRect(r.x, r.y, r.w, r.h); });
      c.beginPath(); c.ellipse(NPC.x, NPC.y, NPC.rx, NPC.ry, 0, 0, Math.PI * 2); c.stroke();
    }
  }
  function loop(now) {
    if (!S.open) return;
    var dt = Math.min(0.05, (now - S.last) / 1000); S.last = now;
    if (S.scene === 'lobby') { step(dt); drawLobby(now); }
    S.raf = requestAnimationFrame(loop);
  }
  function lobbyPoint(e) {
    var r = ui.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * IW, y: (e.clientY - r.top) / r.height * IH };
  }

  // ---------- 낱말 놀이 ----------
  function startRound(mode, items) {
    stopGame();
    S.mode = mode;
    S.items = items || W.makeRound(S.grade);   // 판마다 새로 섞음(진행 중에는 그대로)
    S.idx = 0; S.score = 0; S.wrong = []; S.lit = 0; S.saved = false; S.busy = false;
    if (mode === 'main') S.mainResult = null;
    showScene('game');
    ui.sGrade.textContent = S.grade + '학년' + (mode === 'review' ? ' 복습' : '');
    // 별등: 한 판 문제 수만큼(본 게임 10개, 복습은 틀린 수만큼) 모두 꺼진 채로
    ui.lamps.textContent = '';
    ui.lampEls = S.items.map(function () {
      var l = el('span', 'gm-lamp');
      var off = el('img', 'gm-lamp-off'); off.src = BASE + 'lamp-off.webp'; off.alt = ''; off.draggable = false;
      var on = el('img', 'gm-lamp-on'); on.src = BASE + 'lamp-on.webp'; on.alt = ''; on.draggable = false;
      l.appendChild(off); l.appendChild(on); ui.lamps.appendChild(l); return l;
    });
    ui.lamps.classList.toggle('few', S.items.length < 10);
    updLampLabel();
    loadQ();
  }
  function updLampLabel() { ui.lamps.setAttribute('aria-label', '별등 ' + S.items.length + '개 중 ' + S.lit + '개 밝힘'); }
  // 문장: {굵은 낱말}, ___ 빈칸
  function renderSentence(box, text, fill) {
    box.textContent = '';
    text.split(/(\{[^}]*\}|___)/).forEach(function (part) {
      if (!part) return;
      if (part === '___') {
        var b = el('span', 'gm-blank' + (fill ? ' filled' : ''), fill || ' ');
        b.setAttribute('aria-label', fill ? fill : '빈칸');
        box.appendChild(b);
      } else if (part[0] === '{') box.appendChild(el('b', 'gm-mark', part.slice(1, -1)));
      else box.appendChild(document.createTextNode(part));
    });
  }
  function loadQ() {
    var it = S.items[S.idx], q = it.q;
    S.sel = -1; S.checked = false; S.busy = false;
    ui.sProg.textContent = (S.idx + 1) + '/' + S.items.length;
    renderSentence(ui.sent, q.sentence, null);
    ui.sent.hidden = !q.sentence;
    ui.q.textContent = q.question;
    ui.optBtns.forEach(function (b, i) {
      b.className = 'gm-opt' + (q.type === 'usage' || it.options[i].length > 14 ? ' long' : '');
      b.disabled = false;
      b.setAttribute('aria-checked', 'false');
      b.querySelector('.gm-opt-text').textContent = it.options[i];
      b.querySelector('.gm-opt-tag').textContent = '';
      b.setAttribute('aria-label', (i + 1) + '번 ' + it.options[i]);
    });
    ui.explain.textContent = ''; ui.explain.className = 'gm-explain';
    ui.go.textContent = '답 확인'; ui.go.disabled = true; ui.go.classList.remove('next');
    ui.book.classList.remove('turn'); void ui.book.offsetWidth; ui.book.classList.add('turn');
    sayLine(GUIDE);
    ui.beomi.stop(); ui.sori.stop();
    fitAll();
  }
  function sayLine(t) { ui.say.textContent = t; ui.say.classList.remove('pop'); void ui.say.offsetWidth; ui.say.classList.add('pop'); }
  function showHint() { if (S.scene === 'game' && !S.checked && S.items[S.idx]) sayLine('💡 ' + S.items[S.idx].q.hint); }
  function choose(i) {
    if (S.checked || S.busy) return;
    S.sel = i;
    ui.optBtns.forEach(function (b, k) { b.classList.toggle('sel', k === i); b.setAttribute('aria-checked', String(k === i)); });
    ui.go.disabled = false;
    SFX.tap();
  }
  // 답 확인: 한 문제에 한 번만 판정(연속 클릭으로 점수가 두 번 오르지 않게)
  function check() {
    if (S.checked || S.busy || S.sel < 0) return;
    S.checked = true;
    var it = S.items[S.idx], q = it.q, ok = W.judge(it, S.sel);
    if (ok) S.score++; else S.wrong.push(q.id);
    ui.optBtns.forEach(function (b, k) {
      b.disabled = true;
      var tag = b.querySelector('.gm-opt-tag');
      if (k === it.correct) { b.classList.add('right'); tag.textContent = '정답'; }
      else if (k === S.sel) { b.classList.add('wrong'); tag.textContent = '내 답'; }
      else b.classList.add('dim');
    });
    if (q.type === 'blank') renderSentence(ui.sent, q.sentence, it.options[it.correct]);
    // 뜻 풀이와 새 예문(문제판 크기는 그대로, 정해진 칸 안에)
    var ex = ui.explain; ex.textContent = ''; ex.className = 'gm-explain show ' + (ok ? 'ok' : 'no');
    var l1 = el('p', 'gm-ex-line');
    var ans = it.options[it.correct];   // 문장 고르기처럼 답이 길면 번호로
    l1.appendChild(el('span', 'gm-ex-verdict', ok ? '⭕ 정답!' : ans.length <= 12 ? '정답은 ‘' + ans + '’' : '정답은 ' + '①②③'[it.correct] + '번'));
    l1.appendChild(el('b', 'gm-ex-word', q.word));
    l1.appendChild(document.createTextNode(' ' + q.meaning));
    var l2 = el('p', 'gm-ex-line gm-ex-example');
    l2.appendChild(el('span', 'gm-ex-label', '예문'));
    l2.appendChild(document.createTextNode(q.example));
    ex.appendChild(l1); ex.appendChild(l2);
    ui.go.textContent = S.idx === S.items.length - 1 ? '별등 밝히기' : '다음 낱말';
    ui.go.classList.add('next');
    if (ok) { ui.beomi.play(0, 7); ui.sori.play(0, 7); SFX.right(); sayLine(pick(PRAISE)); }
    else {
      ui.beomi.play(8, 15); ui.sori.play(8, 15); SFX.wrong();
      sayLine(pick(CHEER) + ' ‘' + josa(q.word, '은', '는') + '’ ' + q.meaning.replace(/\.$/, '') + '라는 뜻이란다.');
    }
    fitAll();
    setTimeout(function () { ui.go.focus(); }, 30);
  }
  // 다음 낱말: 이 문제의 별등을 켜고 다음 문제로(정답·오답과 관계없이 마친 문제마다 하나)
  function next() {
    if (!S.checked || S.busy) return;
    S.busy = true; ui.go.disabled = true;
    var lamp = ui.lampEls[S.idx];
    if (lamp && !lamp.classList.contains('on')) { lamp.classList.add('on', 'pop'); S.lit++; updLampLabel(); SFX.lamp(); }
    later(function () {
      if (lamp) lamp.classList.remove('pop');
      S.idx++;
      if (S.idx < S.items.length) loadQ();
      else finale();
    }, 520);
  }
  // 모두 마침: 별등이 왼쪽부터 차례로 빛나고, 범이·소리 축하, 간판에 은은한 금빛 → 결과 창
  function finale() {
    S.busy = true;
    ui.lampEls.forEach(function (l, i) { l.style.animationDelay = (i * 0.09) + 's'; l.classList.add('wave'); });
    ui.sign.classList.add('glow');
    ui.beomi.play(0, 7); ui.sori.play(0, 7); SFX.finale();
    sayLine(S.mode === 'review' ? '복습까지 끝냈구나. 정말 대견하다!' : DONE_SAYS);
    later(function () {
      ui.lampEls.forEach(function (l) { l.classList.remove('wave'); l.style.animationDelay = ''; });
      if (S.mode === 'review') showReviewDone(); else showResult();
    }, 1500 + ui.lampEls.length * 90);
  }

  // ---------- 결과·저장 ----------
  // 본 게임 한 판 기록: 학년·맞힌 수·마친 문제 수·틀린 낱말. 티켓은 판마다 한 번만(game.js 규칙: 학년마다 처음 1장)
  function saveMain() {
    if (S.saved) return S.mainResult;
    S.saved = true;
    var res = { grade: S.grade, score: S.score, total: S.items.length, wrong: S.wrong.slice(), ticket: null, stored: true };
    if (api()) {
      var g = gsave(), k = 'g' + S.grade;
      g.grades = g.grades && typeof g.grades === 'object' ? g.grades : {};
      var r = g.grades[k] && typeof g.grades[k] === 'object' ? g.grades[k] : {};
      r.plays = (r.plays || 0) + 1;
      if (r.firstScore == null) r.firstScore = S.score;   // 처음 해 본 판의 맞힌 수
      r.lastScore = S.score;
      r.best = Math.max(r.best || 0, S.score);
      r.done = S.items.length;
      r.wrong = S.wrong.map(function (id) { var q = W.byId(id); return q ? q.word : id; });
      r.at = Date.now(); delete r.review;
      g.grades[k] = r;
      g.cleared = true; g.rounds = (g.rounds || 0) + 1; g.lastGrade = S.grade;
      api().patchSave({ geulmaru: g });
      res.ticket = api().awardTicket(FID, S.grade);
      res.stored = api().storageOk();
    }
    S.mainResult = res;
    return res;
  }
  function lampRow(n) {
    var row = el('div', 'gm-res-lamps');
    for (var i = 0; i < n; i++) { var im = el('img'); im.src = BASE + 'lamp-on.webp'; im.alt = ''; row.appendChild(im); }
    row.setAttribute('role', 'img'); row.setAttribute('aria-label', '밝혀진 별등 ' + n + '개');
    return row;
  }
  function wordChips(ids) {
    var box = el('div', 'gm-res-words');
    ids.forEach(function (id) { var q = W.byId(id); if (q) { var c = el('span', 'gm-chip', q.word); c.title = q.meaning; box.appendChild(c); } });
    return box;
  }
  function showResult() {
    var res = saveMain(), c = ui.gcard; c.textContent = ''; c.className = 'gm-card gm-result';
    c.appendChild(el('p', 'gm-res-grade', res.grade + '학년 · ' + W.THEMES[res.grade]));
    c.appendChild(el('h2', 'gm-card-title', '우리말 글마루 완료!'));
    var sc = el('p', 'gm-res-score'); sc.innerHTML = '맞힌 문제 <b>' + res.score + '</b> / ' + res.total;
    c.appendChild(sc);
    c.appendChild(lampRow(res.total));
    c.appendChild(el('p', 'gm-res-say', DONE_SAYS));
    if (res.wrong.length) {
      c.appendChild(el('p', 'gm-res-sub', '복습이 필요한 낱말'));
      c.appendChild(wordChips(res.wrong));
    } else c.appendChild(el('p', 'gm-res-sub perfect', '열 개를 모두 맞혔구나! 낱말 박사로구나!'));
    if (res.ticket) c.appendChild(el('p', 'gm-res-ticket', res.ticket.line));
    if (!res.stored) c.appendChild(el('p', 'gm-res-ticket', '이 기기에는 저장할 수 없어서 기록이 남지 않아요.'));
    var acts = el('div', 'gm-acts'), first = null;
    if (res.wrong.length) acts.appendChild(first = btn('gm-choice', '틀린 낱말 다시 풀기', function () { startReview(res.wrong); }));
    var again = btn(res.wrong.length ? 'gm-choice light' : 'gm-choice', '한 번 더', function () { startRound('main'); });
    acts.appendChild(again);
    acts.appendChild(btn('gm-choice light', '로비로 돌아가기', toLobby));
    c.appendChild(acts);
    ui.gmodal.hidden = false;
    if (res.ticket && res.ticket.gain) showTickets(res.ticket.before);
    setTimeout(function () { (first || again).focus(); }, 30);
  }
  function startReview(ids) { startRound('review', W.makeReview(ids)); }
  // 복습 결과는 본 게임 기록과 따로(티켓·맞힌 수는 바뀌지 않음)
  function showReviewDone() {
    var still = S.wrong.slice(), total = S.items.length, score = S.score;
    if (api() && !S.saved) {
      S.saved = true;
      var g = gsave(), k = 'g' + S.grade;
      g.reviews = (g.reviews || 0) + 1;
      if (g.grades && g.grades[k]) g.grades[k].review = { score: score, total: total, at: Date.now() };
      api().patchSave({ geulmaru: g });
    }
    var c = ui.gcard; c.textContent = ''; c.className = 'gm-card gm-result';
    c.appendChild(el('p', 'gm-res-grade', S.grade + '학년 복습'));
    c.appendChild(el('h2', 'gm-card-title', '복습 완료!'));
    var sc = el('p', 'gm-res-score'); sc.innerHTML = '다시 풀어 맞힌 낱말 <b>' + score + '</b> / ' + total;
    c.appendChild(sc);
    c.appendChild(lampRow(total));
    c.appendChild(el('p', 'gm-res-say', score === total
      ? '틀렸던 낱말을 모두 바르게 알게 되었구나. 배운 것을 다시 살피는 마음이 참으로 훌륭하다!'
      : '다시 도전한 용기가 멋지구나. 한 번 더 살펴보면 금세 익숙해질 게다!'));
    if (still.length) { c.appendChild(el('p', 'gm-res-sub', '조금 더 익혀 볼 낱말')); c.appendChild(wordChips(still)); }
    if (S.mainResult) c.appendChild(el('p', 'gm-res-note', '처음 판 결과: ' + S.mainResult.score + ' / ' + S.mainResult.total + ' (복습은 티켓·기록이 따로예요)'));
    var acts = el('div', 'gm-acts'), first = null;
    if (still.length) acts.appendChild(first = btn('gm-choice', '틀린 낱말 다시 풀기', function () { startReview(still); }));
    var again = btn(still.length ? 'gm-choice light' : 'gm-choice', '한 번 더', function () { startRound('main'); });
    acts.appendChild(again);
    acts.appendChild(btn('gm-choice light', '로비로 돌아가기', toLobby));
    c.appendChild(acts);
    ui.gmodal.hidden = false;
    setTimeout(function () { (first || again).focus(); }, 30);
  }

  // ---------- 글씨 맞추기: 정해진 칸 안에 넘치지 않게 글씨 크기를 줄임(문제판 크기는 그대로) ----------
  function cqw() { return ui.stage.getBoundingClientRect().width / 100 || 10; }
  function fit(box, max, min, over) {
    var u = cqw(), s = max;
    box.style.fontSize = (s * u) + 'px';
    while (s > min && over()) { s -= 0.05; box.style.fontSize = (s * u) + 'px'; }
  }
  function overflows(e) { return e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1; }
  function fitAll() {
    if (S.scene !== 'game') return;
    fit(ui.head, 2.05, 1.1, function () { return overflows(ui.head); });
    fit(ui.opts, 1.85, 1.0, function () { return ui.optBtns.some(function (b) { return overflows(b.querySelector('.gm-opt-text')); }); });
    if (ui.explain.childNodes.length) fit(ui.explain, 1.32, 0.85, function () { return overflows(ui.explain); });
  }

  // ---------- 키보드 ----------
  function onKey(e, down) {
    if (!S.open) return;
    if (S.scene === 'lobby' && !S.modal) {
      if (KEYMAP[e.code]) { e.preventDefault(); S.keys[KEYMAP[e.code]] = down; return; }
      if (down && e.code === 'Space' && !e.repeat) { e.preventDefault(); if (S.nearNpc) openStart(); else if (S.nearExit) close(); }
      if (down && e.code === 'Escape') { e.preventDefault(); close(); }
      return;
    }
    if (!down) return;
    if (S.modal && e.code === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (S.scene === 'game' && ui.gmodal.hidden) {
      if (e.code === 'Escape') { e.preventDefault(); toLobby(); return; }
      var n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
      if (n != null && !e.repeat) { e.preventDefault(); choose(n); }
    }
  }

  function init() {
    if (!W || !document.getElementById('geulmaru')) return;
    build();
    window.addEventListener('keydown', function (e) { onKey(e, true); });
    window.addEventListener('keyup', function (e) { onKey(e, false); });
    window.addEventListener('blur', function () { S.keys = {}; });
    ui.canvas.addEventListener('pointerdown', function (e) {
      if (S.modal) return;
      var p = lobbyPoint(e);
      // 범이와 소리를 누르면 그 앞으로 걸어가서 말 걸기
      if (p.x > L_PAIR.x - 90 && p.x < L_PAIR.x + 250 && p.y > L_PAIR.y - 270 && p.y < L_PAIR.y + 20) {
        if (S.nearNpc) { openStart(); return; }
        p = { x: L_PAIR.x + 60, y: L_PAIR.y + 110 }; S.destTalk = true;
      } else S.destTalk = false;
      if (!walkable(p.x, p.y)) {
        var best = null;
        for (var r = 10; r < 260 && !best; r += 10) for (var a = 0; a < 360; a += 20) {
          var x = p.x + Math.cos(a * Math.PI / 180) * r, y = p.y + Math.sin(a * Math.PI / 180) * r;
          if (walkable(x, y)) { best = { x: x, y: y }; break; }
        }
        if (!best) return; p = best;
      }
      S.dest = p;
    });
  }
  window.MPGeulmaru = { open: open, close: close, _state: S, _ui: ui, _walkable: walkable,
    // 검증용
    _debug: { start: function (g) { S.grade = g || S.grade; closeModal(); startRound('main'); }, openStart: openStart, openHowto: openHowto,
      choose: choose, check: check, next: next, fitAll: fitAll,
      // 글씨 넘침 점검: 문제 하나를 화면에 띄우기(저장하지 않음)
      show: function (q) { S.mode = 'review'; S.saved = true; S.items = [W.prepare(q)]; S.idx = 0; showScene('game'); loadQ(); } } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
