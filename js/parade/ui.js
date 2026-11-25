/*
 * 무지개 행진길 화면
 * ------------------------------------------------------------
 * 장면 1 대기실(assets/parade/lobby.webp): 공원 캐릭터로 바닥을 걸어 다니다 공작새 리리에게 '말 걸기'
 *        → 시작 창('현수막 꾸미기' · '나중에 할래'). 가까이 가면 리리가 인사하고 꼬리를 펼침
 * 장면 2 현수막 꾸미기(유령의 집·토리네 도시락처럼 단순한 화면)
 *        위: 뒤로가기 · '? 하는 법'   왼쪽: 도구 카드(색연필 8색 · 지우개 · 되돌리기 · 도장 4개)
 *        가운데: 넓은 아이보리 현수막   아래: 지금 도구 · '퍼레이드 출발!'
 *        - 처음 한 번은 '어떻게 놀아요?'(하는 법)를 먼저 보여 줌
 *        - 현수막 천(cloth 캔버스)과 그림(ink 캔버스)을 나눔. 지우개는 그림·도장만 지움
 *        - 한 획 / 지우개 한 획 / 도장 하나 = 작업 하나(되돌리기 단위). 좌표는 현수막 기준 값으로 저장해
 *          창 크기가 바뀌어도 그림·도장 위치가 어긋나지 않음
 * 퍼레이드 팝업: '퍼레이드 출발!' → 꾸미기 화면 위에 팝업 창이 떠서 퍼레이드(js/parade/show.js)를 보여 줌
 *        끝나면 '다시 보기'(같은 작품 처음부터) · '꾸미기로 돌아가기'(그리던 그림·되돌리기 기록 그대로)
 * 위치는 모두 배경 크기(1672×941) 기준 %라서 창 크기가 바뀌어도 함께 커지고 작아집니다(토리네 도시락과 같은 방식).
 * 공원과의 연결은 window.MP_API (game.js)
 */
(function () {
  'use strict';
  var IW = 1672, IH = 941, BASE = 'assets/parade/';
  var TIP = '방향키나 바닥을 눌러 걸어가서, 공작새 리리에게 말을 걸어 봐요';
  var RIRI_SAYS = '어서 와요! 현수막을 예쁘게 꾸며 주면, 모모와 루루가 들고 제가 앞장서서 퍼레이드를 할게요!';
  // 현수막(꾸미기 화면) — 그림 좌표는 이 크기(CW×CH) 기준으로 저장
  var CLOTH = { x: 330, y: 118, w: 1290, h: 637 }, CW = CLOTH.w, CH = CLOTH.h, RES = 1.5;
  var PENCILS = [
    { id: 'red', name: '빨강', c: '#e04848' }, { id: 'orange', name: '주황', c: '#f28a2e' },
    { id: 'yellow', name: '노랑', c: '#f2c230' }, { id: 'green', name: '초록', c: '#62a84a' },
    { id: 'sky', name: '하늘', c: '#45ade3' }, { id: 'blue', name: '파랑', c: '#3c6fd6' },
    { id: 'purple', name: '보라', c: '#9a6bd0' }, { id: 'pink', name: '분홍', c: '#f0849c' }
  ];
  var STAMPS = [{ id: 'star', name: '별' }, { id: 'heart', name: '하트' }, { id: 'rainbow', name: '무지개' }, { id: 'flower', name: '꽃' }];
  var PEN_W = 11, ERASE_W = 46, STAMP_S = 96;

  var S = {
    open: false, scene: 'lobby', tool: { kind: 'pen', id: 'red' },
    me: { x: 836, y: 880, dir: 'up', moving: false }, keys: {}, dest: null, nearRiri: false, nearExit: false,
    start: false, help: false, popup: false, greetAt: 0,
    ops: [], cur: null, raf: 0, last: 0, show: null
  };
  var ui = {};

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function pct(v, of) { return (v / of * 100) + '%'; }
  function place(n, x, y, w, h) { n.style.left = pct(x, IW); n.style.top = pct(y, IH); n.style.width = pct(w, IW); n.style.height = pct(h, IH); }
  function api() { return window.MP_API; }
  function save() { return (api() && api().readSave()) || {}; }
  var SVG = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62A7.95 7.95 0 0 1 12.5 10.5c3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>',
    eraser: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.1 3.6 21 9.5c.8.8.8 2 0 2.8L12.3 21H6.8l-3.6-3.6c-.8-.8-.8-2 0-2.8L12.3 3.6c.8-.8 2-.8 2.8 0z" fill="#f2a0b0"/><path d="M8.6 9.1 15.5 16l-5 5H6.8l-3.6-3.6c-.8-.8-.8-2 0-2.8z" fill="#fff"/><path d="M12 21h9" stroke="#b77" stroke-width="1.6"/></svg>'
  };

  // ---------- 리리 인사(오프닝 8프레임, 640 칸, 발 (370,608) — tools/build_hanok_npcs.py 의 RIRI_FOOT) ----------
  var RIRI_FOOT_X = 370;
  var OPEN_MS = [220, 110, 290, 135, 110, 130, 125, 760];
  var riri = new Image(); riri.src = BASE + 'riri-opening.webp';
  function openingFrame(ms) {
    for (var i = 0, end = 0; i < OPEN_MS.length; i++) { end += OPEN_MS[i]; if (ms < end) return i; }
    return 7;
  }

  // ---------- 화면 만들기 ----------
  function build() {
    ui.root = document.getElementById('parade');
    var st = ui.stage = el('div', 'pr-stage');
    ui.root.appendChild(st);

    // 대기실
    var lobby = ui.lobby = el('div', 'pr-scene pr-lobby');
    lobby.style.backgroundImage = 'url(' + BASE + 'lobby.webp)';
    ui.canvas = el('canvas', 'pr-canvas'); ui.canvas.width = IW; ui.canvas.height = IH;
    ui.canvas.setAttribute('aria-label', '무지개 행진길 대기실. 방향키나 화면을 눌러 걸어요');
    lobby.appendChild(ui.canvas);
    ui.talk = btn('pr-prompt', '', function () { openStart(); });
    ui.talk.innerHTML = '말 걸기 <kbd>스페이스</kbd>'; ui.talk.hidden = true;
    ui.leave = btn('pr-prompt pr-prompt-exit', '', function () { close(); });
    ui.leave.innerHTML = '공원으로 나가기 <kbd>스페이스</kbd>'; ui.leave.hidden = true;
    ui.tip = el('p', 'pr-tip', TIP);
    ui.lobbyExit = btn('pr-pill pr-exit', '공원으로', function () { close(); });
    [ui.talk, ui.leave, ui.tip, ui.lobbyExit].forEach(function (n) { lobby.appendChild(n); });
    buildStart(lobby);
    st.appendChild(lobby);

    // 현수막 꾸미기
    var game = ui.game = el('div', 'pr-scene pr-game'); game.hidden = true;
    var back = btn('pr-back', '', function () { toLobby(); });
    back.setAttribute('aria-label', '대기실로 돌아가기'); back.innerHTML = SVG.back;
    game.appendChild(back);
    game.appendChild(el('p', 'pr-title', '내 현수막 꾸미기'));
    game.appendChild(btn('pr-pill pr-help', '? 하는 법', function () { openHelp(); }));

    var tools = el('div', 'pr-tools');
    tools.appendChild(el('p', 'pr-tools-label', '색연필'));
    var sw = el('div', 'pr-swatches');
    ui.tools = [];
    PENCILS.forEach(function (p) {
      var b = btn('pr-swatch', '', function () { setTool('pen', p.id); });
      b.style.setProperty('--c', p.c); b.setAttribute('aria-label', p.name + ' 색연필');
      b.dataset.kind = 'pen'; b.dataset.id = p.id;
      sw.appendChild(b); ui.tools.push(b);
    });
    tools.appendChild(sw);
    var row = el('div', 'pr-tool-row');
    var er = btn('pr-tool', '', function () { setTool('eraser', 'eraser'); });
    er.innerHTML = SVG.eraser + '<span>지우개</span>'; er.dataset.kind = 'eraser'; er.dataset.id = 'eraser';
    ui.tools.push(er); row.appendChild(er);
    ui.undo = btn('pr-tool pr-undo', '', undo);
    ui.undo.innerHTML = SVG.undo + '<span>되돌리기</span>';
    row.appendChild(ui.undo);
    tools.appendChild(row);
    tools.appendChild(el('p', 'pr-tools-label', '도장'));
    var sg = el('div', 'pr-stamps');
    STAMPS.forEach(function (s) {
      var b = btn('pr-tool pr-stamp', '', function () { setTool('stamp', s.id); });
      var c = el('canvas'); c.width = c.height = 120;
      drawStamp(c.getContext('2d'), s.id, 60, 60, 96);
      b.appendChild(c); b.setAttribute('aria-label', s.name + ' 도장');
      b.dataset.kind = 'stamp'; b.dataset.id = s.id;
      sg.appendChild(b); ui.tools.push(b);
    });
    tools.appendChild(sg);
    place(tools, 34, 118, 262, 637);
    game.appendChild(tools);

    var cloth = ui.clothBox = el('div', 'pr-cloth');
    place(cloth, CLOTH.x, CLOTH.y, CLOTH.w, CLOTH.h);
    ui.cloth = el('canvas', 'pr-layer'); ui.cloth.width = CW * RES; ui.cloth.height = CH * RES;
    ui.ink = el('canvas', 'pr-layer pr-ink'); ui.ink.width = CW * RES; ui.ink.height = CH * RES;
    ui.ink.setAttribute('aria-label', '현수막. 색연필로 그리거나 도장을 찍어요');
    ui.hint = el('p', 'pr-hint', '여기에 그려요!');
    cloth.appendChild(ui.cloth); cloth.appendChild(ui.ink); cloth.appendChild(ui.hint);
    game.appendChild(cloth);
    paintCloth(ui.cloth.getContext('2d'), ui.cloth.width, ui.cloth.height);

    ui.toolTip = el('p', 'pr-now'); game.appendChild(ui.toolTip);
    ui.go = btn('pr-go', '퍼레이드 출발!', launch); game.appendChild(ui.go);
    ui.msg = el('p', 'pr-msg'); ui.msg.setAttribute('role', 'status'); ui.msg.hidden = true; game.appendChild(ui.msg);

    // 하는 법 창
    ui.modal = el('div', 'pr-modal'); ui.modal.hidden = true;
    ui.modalCard = el('div', 'pr-card'); ui.modalCard.setAttribute('role', 'dialog'); ui.modalCard.setAttribute('aria-modal', 'true');
    ui.modal.appendChild(ui.modalCard);
    ui.modal.addEventListener('pointerdown', function (e) { if (e.target === ui.modal) closeHelp(); });
    game.appendChild(ui.modal);

    // 퍼레이드 팝업(꾸미기 화면 위에 뜸)
    ui.pop = el('div', 'pr-modal pr-pop'); ui.pop.hidden = true;
    var frame = el('div', 'pr-pop-frame'); frame.setAttribute('role', 'dialog'); frame.setAttribute('aria-modal', 'true'); frame.setAttribute('aria-label', '무지개 행진길');
    ui.showCanvas = el('canvas', 'pr-pop-canvas'); ui.showCanvas.setAttribute('aria-label', '리리, 모모와 루루가 내 현수막을 들고 행진해요');
    frame.appendChild(ui.showCanvas);
    ui.popClose = btn('pr-pop-x', '✕', function () { backToDraw(); });
    ui.popClose.setAttribute('aria-label', '꾸미기로 돌아가기');
    frame.appendChild(ui.popClose);
    ui.showEnd = el('div', 'pr-end'); ui.showEnd.hidden = true;
    ui.showEnd.appendChild(el('p', 'pr-end-title', '멋진 퍼레이드였어요!'));
    ui.reward = el('p', 'pr-end-reward'); ui.reward.hidden = true; ui.showEnd.appendChild(ui.reward);
    var er2 = el('div', 'pr-end-row');
    ui.replay = btn('pr-choice', '🔁 다시 보기', function () { playParade(); });
    er2.appendChild(ui.replay);
    er2.appendChild(btn('pr-choice light', '🖍️ 꾸미기로 돌아가기', function () { backToDraw(); }));
    ui.showEnd.appendChild(er2);
    frame.appendChild(ui.showEnd);
    ui.pop.appendChild(frame);
    game.appendChild(ui.pop);
    st.appendChild(game);

    setTool('pen', 'red');
    updateUndo();
    ['momo', 'lulu', 'riri'].forEach(function (n) { var i = new Image(); i.src = BASE + n + '.webp'; });
  }

  // ---------- 시작 창 ----------
  function buildStart(parent) {
    var m = ui.start = el('div', 'pr-modal'); m.hidden = true;
    var c = el('div', 'pr-card pr-start-card');
    c.setAttribute('role', 'dialog'); c.setAttribute('aria-modal', 'true'); c.setAttribute('aria-labelledby', 'prStartTitle');
    var face = el('div', 'pr-face'); var fc = el('canvas'); fc.width = fc.height = 320; face.appendChild(fc); ui.face = fc;
    c.appendChild(face);
    var body = el('div', 'pr-start-body');
    body.appendChild(el('p', 'pr-start-name', '공작새 리리'));
    var h = el('h2', 'pr-card-title', '무지개 행진길'); h.id = 'prStartTitle';
    body.appendChild(h);
    body.appendChild(el('p', 'pr-start-text', RIRI_SAYS));
    ui.rewardNote = el('p', 'pr-reward-note'); body.appendChild(ui.rewardNote);
    var acts = el('div', 'pr-acts');
    ui.startGo = btn('pr-choice', '🖍️ 현수막 꾸미기', function () { startGame(); });
    acts.appendChild(ui.startGo);
    acts.appendChild(btn('pr-choice light', '나중에 할래', function () { closeStart(); }));
    body.appendChild(acts);
    c.appendChild(body);
    m.appendChild(c);
    m.addEventListener('pointerdown', function (e) { if (e.target === m) closeStart(); });
    parent.appendChild(m);
  }
  function drawFace() {
    var g = ui.face.getContext('2d');
    g.clearRect(0, 0, 320, 320);
    if (riri.complete && riri.naturalWidth) g.drawImage(riri, RIRI_FOOT_X - 170, 30, 340, 340, 0, 0, 320, 320);   // 프레임 0의 얼굴·가슴
  }
  function openStart() {
    if (S.start) return;
    S.start = true; S.keys = {}; S.dest = null; S.me.moving = false;
    ui.start.hidden = false; ui.talk.hidden = true; ui.leave.hidden = true; ui.tip.hidden = true;
    drawFace();
    var done = cleared();
    ui.rewardNote.textContent = (done ? '★ 퍼레이드 고수 캐릭터를 받았어요! 마음껏 또 꾸며 봐요.' : '★ 처음 퍼레이드를 끝까지 보면 ‘퍼레이드 고수’ 캐릭터를 받아요!') +
      (api() && api().ticketNote ? ' ' + api().ticketNote('parade', api().profile().grade) : '');
    ui.rewardNote.classList.toggle('done', done);
    ui.startGo.focus();
  }
  function closeStart() { S.start = false; ui.start.hidden = true; ui.tip.hidden = false; S.keys = {}; }

  // ---------- 하는 법 ----------
  function howTo() {
    var box = el('div', 'pr-howto');
    function row(num, title, sub, pics) {
      var r = el('div', 'pr-howto-row');
      r.appendChild(el('span', 'pr-howto-num', num));
      var t = el('div', 'pr-howto-text');
      t.appendChild(el('p', 'pr-howto-title', title));
      if (pics) t.appendChild(pics);
      if (sub) t.appendChild(el('p', 'pr-howto-sub', sub));
      r.appendChild(t); box.appendChild(r);
    }
    var dots = el('div', 'pr-howto-pics');
    PENCILS.forEach(function (p) { var d = el('span', 'pr-howto-dot'); d.style.background = p.c; dots.appendChild(d); });
    row('1', '색연필을 골라 현수막에 쓱쓱 그려요', '마우스로 끌거나 손가락으로 문질러요.', dots);
    var st = el('div', 'pr-howto-pics');
    STAMPS.forEach(function (s) { var c = el('canvas', 'pr-howto-stamp'); c.width = c.height = 60; drawStamp(c.getContext('2d'), s.id, 30, 30, 48); st.appendChild(c); });
    row('2', '도장을 고르고 현수막을 콕 누르면 하나씩 찍혀요', null, st);
    row('3', '잘못했으면 지우개나 되돌리기!', '되돌리기는 한 번 누를 때마다 선 한 줄이나 도장 하나가 없어져요.');
    row('4', '다 꾸몄으면 ‘퍼레이드 출발!’', '리리가 앞장서고 모모와 루루가 내 현수막을 들고 행진해요.');
    return box;
  }
  function openHelp() {
    if (S.scene !== 'game' || S.popup) return;
    S.help = true;
    var c = ui.modalCard; c.textContent = ''; c.className = 'pr-card pr-help-card';
    c.appendChild(el('h2', 'pr-card-title', '어떻게 놀아요?'));
    c.appendChild(howTo());
    var acts = el('div', 'pr-acts');
    var ok = btn('pr-choice', '알겠어!', closeHelp);
    acts.appendChild(ok); c.appendChild(acts);
    ui.modal.hidden = false;
    setTimeout(function () { ok.focus(); }, 30);
  }
  function closeHelp() { S.help = false; ui.modal.hidden = true; }

  // ---------- 현수막 천(바탕 레이어) ----------
  function paintCloth(g, w, h) {
    g.fillStyle = '#fbf3e0'; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.05; g.fillStyle = '#b08850';
    for (var y = 0; y < h; y += 7) g.fillRect(0, y, w, 1);
    for (var x = 0; x < w; x += 7) g.fillRect(x, 0, 1, h);
    g.globalAlpha = 1;
    var m = h * 0.03;
    g.strokeStyle = 'rgba(201,112,126,0.55)'; g.lineWidth = Math.max(2, h * 0.005);
    g.setLineDash([h * 0.02, h * 0.014]); g.strokeRect(m, m, w - 2 * m, h - 2 * m); g.setLineDash([]);
  }

  // ---------- 도장 그림(벡터라서 어떤 크기로도 깨끗하게) ----------
  function drawStamp(g, kind, x, y, s) {
    g.save(); g.translate(x, y);
    g.lineJoin = 'round'; g.lineCap = 'round';
    var r = s / 2;
    if (kind === 'star') {
      g.beginPath();
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath(); g.fillStyle = '#f7c548'; g.fill();
      g.lineWidth = s * 0.05; g.strokeStyle = '#d6912c'; g.stroke();
    } else if (kind === 'heart') {
      g.beginPath();
      g.moveTo(0, r * 0.85);
      g.bezierCurveTo(-r * 1.25, -r * 0.05, -r * 0.6, -r * 1.05, 0, -r * 0.42);
      g.bezierCurveTo(r * 0.6, -r * 1.05, r * 1.25, -r * 0.05, 0, r * 0.85);
      g.closePath(); g.fillStyle = '#ee7f96'; g.fill();
      g.lineWidth = s * 0.05; g.strokeStyle = '#c75a72'; g.stroke();
    } else if (kind === 'rainbow') {
      var cols = ['#e8545a', '#f39a3a', '#f4c94a', '#7fbf5a', '#57b4e0', '#a07ad4'], R = r * 1.1, bw = R * 0.13;
      g.translate(0, R * 0.3);
      g.lineCap = 'butt';
      cols.forEach(function (c, i) {
        g.beginPath(); g.arc(0, 0, R - bw * (i + 0.5), Math.PI, 0);
        g.strokeStyle = c; g.lineWidth = bw + 0.6; g.stroke();
      });
      g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(150,150,170,0.6)'; g.lineWidth = s * 0.02;
      [-1, 1].forEach(function (d) {
        [[0.62, 0.05, 0.2], [0.86, 0.1, 0.15], [0.4, 0.12, 0.15]].forEach(function (k) {
          g.beginPath(); g.arc(d * R * k[0], R * k[1], R * k[2], 0, Math.PI * 2); g.fill(); g.stroke();
        });
      });
    } else if (kind === 'flower') {
      for (var p = 0; p < 5; p++) {
        var pa = -Math.PI / 2 + p * Math.PI * 2 / 5;
        g.beginPath(); g.arc(Math.cos(pa) * r * 0.5, Math.sin(pa) * r * 0.5, r * 0.42, 0, Math.PI * 2);
        g.fillStyle = '#f29bb1'; g.fill(); g.lineWidth = s * 0.04; g.strokeStyle = '#d36b86'; g.stroke();
      }
      g.beginPath(); g.arc(0, 0, r * 0.3, 0, Math.PI * 2); g.fillStyle = '#f29bb1'; g.fill();
      g.beginPath(); g.arc(0, 0, r * 0.2, 0, Math.PI * 2); g.fillStyle = '#fff2b8'; g.fill();
      g.fillStyle = '#ffffff';
      for (var d = 0; d < 5; d++) { var da = d * Math.PI * 2 / 5; g.beginPath(); g.arc(Math.cos(da) * r * 0.32, Math.sin(da) * r * 0.32, r * 0.045, 0, Math.PI * 2); g.fill(); }
    }
    g.restore();
  }

  // ---------- 그리기: 작업(op) 목록이 곧 그림. 되돌리기는 마지막 작업을 빼고 다시 그림 ----------
  function penColor(id) { for (var i = 0; i < PENCILS.length; i++) if (PENCILS[i].id === id) return PENCILS[i].c; return '#e04848'; }
  function strokeSeg(g, op, from) {
    var p = op.pts;
    g.save();
    g.globalCompositeOperation = op.t === 'erase' ? 'destination-out' : 'source-over';
    g.strokeStyle = op.t === 'erase' ? '#000' : op.c; g.fillStyle = g.strokeStyle;
    g.lineWidth = op.w * RES; g.lineCap = 'round'; g.lineJoin = 'round';
    if (p.length <= 2) { g.beginPath(); g.arc(p[0] * RES, p[1] * RES, op.w * RES / 2, 0, Math.PI * 2); g.fill(); }
    else {
      g.beginPath();
      var s = Math.max(0, from - 2);
      g.moveTo(p[s] * RES, p[s + 1] * RES);
      for (var i = s + 2; i < p.length; i += 2) g.lineTo(p[i] * RES, p[i + 1] * RES);
      g.stroke();
    }
    g.restore();
  }
  function drawOp(g, op) {
    if (op.t === 'stamp') { g.save(); g.scale(RES, RES); drawStamp(g, op.k, op.x, op.y, op.s); g.restore(); }
    else strokeSeg(g, op, 0);
  }
  function redraw() {
    var g = ui.ink.getContext('2d');
    g.clearRect(0, 0, ui.ink.width, ui.ink.height);
    S.ops.forEach(function (op) { drawOp(g, op); });
  }
  function hasInk() { return S.ops.some(function (o) { return o.t !== 'erase'; }); }
  function updateUndo() {
    ui.undo.disabled = !S.ops.length;
    ui.hint.hidden = hasInk() || !!S.cur;
  }
  function undo() {
    if (S.cur || !S.ops.length) return;
    S.ops.pop(); redraw(); updateUndo();
  }
  function setTool(kind, id) {
    S.tool = { kind: kind, id: id };
    ui.tools.forEach(function (b) {
      var on = b.dataset.kind === kind && b.dataset.id === id;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    });
    ui.clothBox.dataset.tool = kind;
    ui.toolTip.textContent = '';
    if (kind === 'pen') {
      var p = PENCILS.filter(function (x) { return x.id === id; })[0], dot = el('span', 'pr-now-dot');
      dot.style.background = p.c; ui.toolTip.appendChild(dot);
      ui.toolTip.appendChild(document.createTextNode(p.name + ' 색연필 — 끌어서 그려요'));
    } else if (kind === 'eraser') ui.toolTip.textContent = '지우개 — 그림과 도장을 지워요';
    else ui.toolTip.textContent = STAMPS.filter(function (s) { return s.id === id; })[0].name + ' 도장 — 누를 때마다 하나씩 찍혀요';
  }
  // 화면 좌표 → 현수막 좌표(CW×CH). 화면 크기가 바뀌어도 같은 자리를 가리킴
  function clothPoint(e) {
    var r = ui.ink.getBoundingClientRect();
    return { x: Math.max(0, Math.min(CW, (e.clientX - r.left) / r.width * CW)), y: Math.max(0, Math.min(CH, (e.clientY - r.top) / r.height * CH)) };
  }
  function onDown(e) {
    if (S.scene !== 'game' || S.cur || S.help || S.popup) return;
    e.preventDefault();
    var p = clothPoint(e), t = S.tool;
    hideMsg();
    if (t.kind === 'stamp') {
      var op = { t: 'stamp', k: t.id, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, s: STAMP_S };
      S.ops.push(op); drawOp(ui.ink.getContext('2d'), op); updateUndo();
      return;
    }
    S.cur = { t: t.kind === 'eraser' ? 'erase' : 'pen', c: penColor(t.id), w: t.kind === 'eraser' ? ERASE_W : PEN_W, pts: [p.x, p.y] };
    S.pid = e.pointerId;
    try { ui.ink.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    strokeSeg(ui.ink.getContext('2d'), S.cur, 0);
    updateUndo();
  }
  function onMove(e) {
    if (!S.cur || e.pointerId !== S.pid) return;
    e.preventDefault();
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (!evs.length) evs = [e];
    var from = S.cur.pts.length;
    evs.forEach(function (ev) {
      var p = clothPoint(ev), n = S.cur.pts.length;
      if (Math.hypot(p.x - S.cur.pts[n - 2], p.y - S.cur.pts[n - 1]) < 1.2) return;
      S.cur.pts.push(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10);
    });
    if (S.cur.pts.length > from) strokeSeg(ui.ink.getContext('2d'), S.cur, from);
  }
  function onUp(e) {
    if (!S.cur || (e && e.pointerId !== S.pid)) return;
    S.ops.push(S.cur); S.cur = null;
    redraw();   // 이어 그린 조각을 한 획으로 깨끗하게 다시 그림
    updateUndo();
  }

  // 퍼레이드로 보낼 현수막: 천 + 그림을 합친 한 장(비율 그대로)
  function bannerCanvas() {
    var c = document.createElement('canvas'); c.width = ui.ink.width; c.height = ui.ink.height;
    var g = c.getContext('2d');
    g.drawImage(ui.cloth, 0, 0); g.drawImage(ui.ink, 0, 0);
    return c;
  }
  function showMsg(t) { ui.msg.textContent = t; ui.msg.hidden = false; clearTimeout(S.msgT); S.msgT = setTimeout(hideMsg, 2600); }
  function hideMsg() { ui.msg.hidden = true; }

  // ---------- 퍼레이드 팝업 ----------
  function launch() {
    if (S.cur || S.popup) return;
    if (!hasInk()) {
      showMsg('먼저 현수막을 꾸며 봐요! 색연필로 그리거나 도장을 찍어요.');
      ui.go.classList.remove('shake'); void ui.go.offsetWidth; ui.go.classList.add('shake');
      return;
    }
    S.banner = bannerCanvas();
    S.popup = true; ui.pop.hidden = false;
    playParade();
  }
  function playParade() {
    ui.showEnd.hidden = true;
    if (!S.show) S.show = window.MPParadeShow.create({ canvas: ui.showCanvas, base: BASE, banner: S.banner,
      onEnd: function () { onParadeEnd(); } });
    else S.show.setBanner(S.banner);
    S.show.play();
  }
  function cleared() { var p = save().parade; return !!(p && p.cleared); }
  // 퍼레이드를 끝까지 처음 보면 건물 보상 캐릭터 '퍼레이드 고수'(R2, game.js facilityCleared('parade'))
  function onParadeEnd() {
    var fresh = !cleared();
    if (fresh && api()) api().patchSave({ parade: Object.assign({}, save().parade || {}, { cleared: true }) });
    var got = fresh && cleared();
    // 티켓: 모든 건물 같은 규칙(game.js) — 공원 학년마다 처음 끝까지 보면 1장(다시 봐도 더 주지 않음), 모든 건물 합쳐 하루 3장
    var tk = api() && api().awardTicket ? api().awardTicket('parade', api().profile().grade) : null;
    var lines = [];
    if (tk) lines.push(tk.line);
    if (fresh) lines.push(got ? '★ ‘퍼레이드 고수’ 캐릭터를 받았어요! 공원 위쪽 ‘캐릭터’에서 골라 봐요.' : '이 기기에는 저장할 수 없어서 캐릭터 보상이 남지 않아요.');
    ui.reward.hidden = !lines.length;
    ui.reward.textContent = lines.join(' ');
    ui.showEnd.hidden = false;
    setTimeout(function () { ui.replay.focus(); }, 30);
  }
  function backToDraw() {
    if (S.show) S.show.stop();
    S.popup = false; if (ui.pop) ui.pop.hidden = true;
  }

  // ---------- 열기·닫기·장면 ----------
  function open() {
    if (!ui.root) return;
    S.open = true;
    ui.root.hidden = false;
    document.body.classList.add('parade-open');
    showScene('lobby');
    S.me = { x: 836, y: 880, dir: 'up', moving: false };   // 아래쪽 입구에서 시작
    S.dest = null; S.keys = {}; S.nearRiri = false; closeStart();
    S.last = performance.now();
    cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(loop);
  }
  function close() {
    S.open = false; cancelAnimationFrame(S.raf);
    backToDraw(); closeHelp();
    if (S.cur) onUp();
    ui.root.hidden = true;
    document.body.classList.remove('parade-open');
    if (api() && api().exitParade) api().exitParade();
  }
  function showScene(name) {
    if (S.cur) onUp();
    S.scene = name;
    ui.lobby.hidden = name !== 'lobby';
    ui.game.hidden = name !== 'game';
    hideMsg();
  }
  function startGame() {
    closeStart();
    showScene('game');
    var pr = save().parade;
    if (!(pr && pr.howto)) {   // 처음 한 번은 하는 법을 먼저
      if (api()) api().patchSave({ parade: Object.assign({}, pr || {}, { howto: true }) });
      openHelp();
    }
  }
  function toLobby() {
    backToDraw(); closeHelp();
    showScene('lobby');
    // 리리 앞에 서서 바로 다시 말을 걸 수 있게
    S.me = { x: RIRI_POS.x + 40, y: RIRI_POS.y + 110, dir: 'up', moving: false };
    S.dest = null; S.keys = {}; closeStart();
    S.last = performance.now();
  }

  // ---------- 대기실 걷기 ----------
  // 걸을 수 있는 바닥(그림 좌표 다각형): 벽·화분 아래부터. 자동차 받침대 앞은 조금 더 아래부터
  var FLOOR = [[0, 520], [200, 498], [1160, 498], [1170, 514], [1545, 514], [1672, 520], [1672, 935], [0, 935]];
  var RIRI_POS = { x: 836, y: 585, k: 0.39 };   // 발 위치와 오프닝 그림 배율(몸 키 약 225 — 토리네 도시락 토리와 같은 크기)
  var RIRI_H = 580 * RIRI_POS.k;                 // 오프닝 그림 몸 키 580px(28~608)
  var EXIT_Y = 890;
  function inPoly(x, y, p) {
    var c = false;
    for (var i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    }
    return c;
  }
  function walkable(x, y) {
    if (!inPoly(x, y, FLOOR)) return false;
    var tx = (x - RIRI_POS.x) / 65, ty = (y - RIRI_POS.y) / 24;
    return tx * tx + ty * ty >= 1;
  }
  // 캐릭터 몸 키: 공원에서 보이는 크기의 1.3배 + 원근(안쪽은 조금 작게)
  var LOBBY_SCALE = 1.3, FLOOR_TOP = 498;
  function charH(y) {
    var r = ui.canvas.getBoundingClientRect(), px = api().charScreenH ? api().charScreenH() : 94;
    var base = r.height ? px * IH / r.height : 125;
    var depth = 0.85 + Math.max(0, Math.min(1, (y - FLOOR_TOP) / (IH - FLOOR_TOP))) * 0.3;
    return base * LOBBY_SCALE * depth;
  }
  var KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  function step(dt) {
    if (S.start || S.scene !== 'lobby') { S.me.moving = false; return; }
    var dx = 0, dy = 0, sp = 330 * dt, me = S.me;
    if (S.keys.left) dx -= 1; if (S.keys.right) dx += 1; if (S.keys.up) dy -= 1; if (S.keys.down) dy += 1;
    if (dx || dy) S.dest = null;
    else if (S.dest) {
      var tx = S.dest.x - me.x, ty = S.dest.y - me.y, d = Math.hypot(tx, ty);
      if (d < 6) { S.dest = null; if (S.destTalk) { S.destTalk = false; if (S.nearRiri) openStart(); } } else { dx = tx / d; dy = ty / d; }
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
    var near = Math.hypot(me.x - RIRI_POS.x, (me.y - RIRI_POS.y) * 1.4) < 230;
    if (near && !S.nearRiri) S.greetAt = performance.now();   // 다가오면 인사하고 꼬리를 펼침
    S.nearRiri = near;
    S.nearExit = !S.nearRiri && me.y > EXIT_Y;
    ui.talk.hidden = !S.nearRiri;
    ui.leave.hidden = !S.nearExit;
    if (S.nearRiri) { ui.talk.style.left = pct(RIRI_POS.x, IW); ui.talk.style.top = pct(RIRI_POS.y - RIRI_H - 70, IH); }
    if (S.nearExit) { ui.leave.style.left = pct(me.x, IW); ui.leave.style.top = pct(me.y - charH(me.y) - 70, IH); }
  }
  function shadow(c, x, y, w) {
    var g = c.createRadialGradient(x, y, 0, x, y, w);
    g.addColorStop(0, 'rgba(140,60,70,0.34)'); g.addColorStop(1, 'rgba(140,60,70,0)');
    c.save(); c.translate(x, y); c.scale(1, 0.28); c.translate(-x, -y);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, w, 0, Math.PI * 2); c.fill(); c.restore();
  }
  function drawRiri(c, now) {
    var k = RIRI_POS.k, f = S.nearRiri || S.start ? openingFrame(now - S.greetAt) : 0;
    shadow(c, RIRI_POS.x, RIRI_POS.y, 68);
    if (riri.complete && riri.naturalWidth) {
      var bob = f === 0 ? Math.sin(now / 420) * 3 : 0;
      c.drawImage(riri, f % 4 * 640, Math.floor(f / 4) * 640, 640, 640, RIRI_POS.x - RIRI_FOOT_X * k, RIRI_POS.y - 608 * k + bob, 640 * k, 640 * k);
    }
  }
  function drawMe(c, t) {
    var me = S.me, h = charH(me.y), sid = api().character ? api().character().sid : 'F1';
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
    [{ y: RIRI_POS.y, draw: function () { drawRiri(c, now); } }, { y: S.me.y, draw: function () { drawMe(c, t); } }]
      .sort(function (a, b) { return a.y - b.y; }).forEach(function (i) { i.draw(); });
    if (DEBUG) {
      c.strokeStyle = 'lime'; c.lineWidth = 3; c.beginPath();
      FLOOR.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); c.stroke();
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

  // ---------- 키보드 ----------
  function onKey(e, down) {
    if (!S.open) return;
    if (S.scene === 'lobby' && !S.start) {
      if (KEYMAP[e.code]) { e.preventDefault(); S.keys[KEYMAP[e.code]] = down; return; }
      if (down && e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (S.nearRiri) openStart(); else if (S.nearExit) close();
      }
      if (down && e.code === 'Escape') { e.preventDefault(); close(); }
      return;
    }
    if (!down) return;
    if (S.start && e.code === 'Escape') { e.preventDefault(); closeStart(); return; }
    if (S.scene !== 'game') return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !S.popup && !S.help) { e.preventDefault(); undo(); return; }
    if (e.code !== 'Escape') return;
    e.preventDefault();
    if (S.popup) backToDraw(); else if (S.help) closeHelp(); else toLobby();
  }

  function init() {
    if (!document.getElementById('parade') || !window.MPParadeShow) return;
    build();
    window.addEventListener('keydown', function (e) { onKey(e, true); });
    window.addEventListener('keyup', function (e) { onKey(e, false); });
    window.addEventListener('blur', function () { S.keys = {}; });
    ui.canvas.addEventListener('pointerdown', function (e) {
      if (S.start) return;
      var p = lobbyPoint(e);
      // 리리를 누르면 그 앞으로 걸어가서 말 걸기
      if (Math.abs(p.x - RIRI_POS.x) < 90 && p.y > RIRI_POS.y - RIRI_H - 20 && p.y < RIRI_POS.y + 20) {
        if (S.nearRiri) { openStart(); return; }
        p = { x: RIRI_POS.x + 40, y: RIRI_POS.y + 100 }; S.destTalk = true;
      } else S.destTalk = false;
      if (!walkable(p.x, p.y)) {
        var best = null;
        for (var r = 10; r < 300 && !best; r += 10) for (var a = 0; a < 360; a += 20) {
          var x = p.x + Math.cos(a * Math.PI / 180) * r, y = p.y + Math.sin(a * Math.PI / 180) * r;
          if (walkable(x, y)) { best = { x: x, y: y }; break; }
        }
        if (!best) return; p = best;
      }
      S.dest = p;
    });
    ui.ink.addEventListener('pointerdown', onDown);
    ui.ink.addEventListener('pointermove', onMove);
    ui.ink.addEventListener('pointerup', onUp);
    ui.ink.addEventListener('pointercancel', onUp);
    ui.ink.addEventListener('lostpointercapture', function (e) { if (S.cur && e.pointerId === S.pid) onUp(e); });
  }
  window.MPParade = { open: open, close: close, _state: S, _ui: ui, _walkable: walkable,
    _debug: { undo: undo, setTool: setTool, ops: function () { return S.ops; }, banner: bannerCanvas, startGame: startGame, show: function () { return S.show; } } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
