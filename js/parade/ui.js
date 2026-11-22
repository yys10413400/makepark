/*
 * 레인보우 퍼레이드 화면
 * ------------------------------------------------------------
 * 장면 1 대기실(assets/parade/lobby.webp): 리리가 인사하고, 가운데 큰 '현수막 꾸미기' 버튼으로 바로 시작
 * 장면 2 현수막 꾸미기(assets/parade/toolbox.webp 시안 위에 버튼을 겹침)
 *        왼쪽 도구함(색연필 8색 · 지우개 · 되돌리기 · 도장 4개), 가운데 아이보리 현수막, 오른쪽 아래 '퍼레이드 출발!'
 *        - 현수막 천(cloth 캔버스)과 그림(ink 캔버스)을 나눔. 지우개는 그림·도장만 지움
 *        - 한 획 / 지우개 한 획 / 도장 하나 = 작업 하나(되돌리기 단위). 좌표는 현수막 기준 값으로 저장해
 *          창 크기가 바뀌어도 그림·도장 위치가 어긋나지 않음
 * 장면 3 퍼레이드: '퍼레이드 출발!' → 새 창(parade.html)으로 열고 완성한 현수막을 보냄.
 *        새 창이 막히면 이 화면 안에서 같은 퍼레이드(js/parade/show.js)를 보여 줌
 *        끝나면 '다시 보기'(같은 작품 처음부터) · '꾸미기로 돌아가기'(그리던 그림·되돌리기 기록 그대로)
 * 위치는 모두 배경 그림(1672×941) 기준 %라서 창 크기가 바뀌어도 함께 커지고 작아집니다(토리네 도시락과 같은 방식).
 * 공원과의 연결은 window.MP_API (game.js)
 */
(function () {
  'use strict';
  var IW = 1672, IH = 941, BASE = 'assets/parade/';
  // 현수막(시안의 흰 그림판 안쪽) — 그림 좌표는 이 크기(CW×CH) 기준으로 저장
  var CLOTH = { x: 318, y: 165, w: 1264, h: 624 }, CW = CLOTH.w, CH = CLOTH.h, RES = 1.5;
  var PENCILS = [
    { id: 'red', name: '빨강', c: '#e04848', r: [87, 177, 40, 58] },
    { id: 'orange', name: '주황', c: '#f28a2e', r: [134, 177, 40, 58] },
    { id: 'yellow', name: '노랑', c: '#f2c230', r: [181, 177, 40, 58] },
    { id: 'green', name: '초록', c: '#62a84a', r: [227, 177, 40, 58] },
    { id: 'sky', name: '하늘', c: '#45ade3', r: [87, 245, 40, 56] },
    { id: 'blue', name: '파랑', c: '#3c6fd6', r: [134, 245, 40, 56] },
    { id: 'purple', name: '보라', c: '#9a6bd0', r: [181, 245, 40, 56] },
    { id: 'pink', name: '분홍', c: '#f0849c', r: [227, 245, 40, 56] }
  ];
  var STAMPS = [
    { id: 'star', name: '별', r: [91, 425, 80, 67] },
    { id: 'heart', name: '하트', r: [185, 425, 81, 67] },
    { id: 'rainbow', name: '무지개', r: [91, 504, 80, 68] },
    { id: 'flower', name: '꽃', r: [185, 504, 81, 68] }
  ];
  var PEN_W = 11, ERASE_W = 46, STAMP_S = 96;
  var RIRI_SAYS = '어서 와요! 현수막을 예쁘게 꾸며 주면, 모모와 루루가 들고 제가 앞장서서 퍼레이드를 할게요!';

  var S = {
    open: false, scene: 'lobby', tool: { kind: 'pen', id: 'red' },
    ops: [], cur: null, raf: 0, t0: 0, popup: null, show: null
  };
  var ui = {};

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function pct(v, of) { return (v / of * 100) + '%'; }
  function place(n, r) { n.style.left = pct(r[0], IW); n.style.top = pct(r[1], IH); n.style.width = pct(r[2], IW); n.style.height = pct(r[3], IH); }
  function api() { return window.MP_API; }
  var BACK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>';

  // ---------- 리리 인사(대기실) ----------
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

    // 대기실: 리리 + 말풍선 + 큰 시작 버튼
    var lobby = ui.lobby = el('div', 'pr-scene pr-lobby');
    lobby.style.backgroundImage = 'url(' + BASE + 'lobby.webp)';
    ui.lobbyCanvas = el('canvas', 'pr-full'); ui.lobbyCanvas.width = IW; ui.lobbyCanvas.height = IH;
    ui.lobbyCanvas.setAttribute('aria-hidden', 'true');
    lobby.appendChild(ui.lobbyCanvas);
    var bubble = el('div', 'pr-bubble');
    bubble.appendChild(el('p', 'pr-bubble-name', '공작새 리리'));
    bubble.appendChild(el('p', 'pr-bubble-text', RIRI_SAYS));
    lobby.appendChild(bubble);
    ui.go = btn('pr-big', '', function () { showScene('draw'); });
    ui.go.innerHTML = '<span aria-hidden="true">🖍️</span> 현수막 꾸미기';
    lobby.appendChild(ui.go);
    lobby.appendChild(el('p', 'pr-steps', '① 현수막 꾸미기 → ② 퍼레이드 출발!'));
    ui.lobbyExit = btn('pr-pill pr-exit', '공원으로', function () { close(); });
    lobby.appendChild(ui.lobbyExit);
    st.appendChild(lobby);

    // 현수막 꾸미기
    var draw = ui.draw = el('div', 'pr-scene pr-draw'); draw.hidden = true;
    draw.style.backgroundImage = 'url(' + BASE + 'toolbox.webp)';
    var back = btn('pr-hit pr-back', '', function () { showScene('lobby'); });
    back.setAttribute('aria-label', '대기실로 돌아가기'); back.innerHTML = BACK_SVG;
    place(back, [52, 35, 75, 62]); draw.appendChild(back);

    var cloth = ui.clothBox = el('div', 'pr-cloth');
    place(cloth, [CLOTH.x, CLOTH.y, CLOTH.w, CLOTH.h]);
    ui.cloth = el('canvas', 'pr-layer'); ui.cloth.width = CW * RES; ui.cloth.height = CH * RES;
    ui.ink = el('canvas', 'pr-layer pr-ink'); ui.ink.width = CW * RES; ui.ink.height = CH * RES;
    ui.ink.setAttribute('aria-label', '현수막. 색연필로 그리거나 도장을 찍어요');
    ui.hint = el('p', 'pr-hint', '색연필로 그리고, 도장을 골라 현수막을 눌러 찍어 봐요!');
    cloth.appendChild(ui.cloth); cloth.appendChild(ui.ink); cloth.appendChild(ui.hint);
    draw.appendChild(cloth);
    paintCloth(ui.cloth.getContext('2d'), ui.cloth.width, ui.cloth.height);

    ui.tools = [];
    PENCILS.forEach(function (p) {
      var b = btn('pr-hit pr-tool pr-pencil', '', function () { setTool('pen', p.id); });
      b.setAttribute('aria-label', p.name + ' 색연필'); b.style.setProperty('--c', p.c);
      b.dataset.kind = 'pen'; b.dataset.id = p.id;
      place(b, p.r); draw.appendChild(b); ui.tools.push(b);
    });
    var er = btn('pr-hit pr-tool', '', function () { setTool('eraser', 'eraser'); });
    er.setAttribute('aria-label', '지우개'); er.dataset.kind = 'eraser'; er.dataset.id = 'eraser';
    place(er, [95, 320, 72, 59]); draw.appendChild(er); ui.tools.push(er);
    ui.undo = btn('pr-hit pr-undo', '', undo);
    ui.undo.setAttribute('aria-label', '되돌리기');
    place(ui.undo, [189, 320, 72, 59]); draw.appendChild(ui.undo);
    STAMPS.forEach(function (s) {
      var b = btn('pr-hit pr-tool', '', function () { setTool('stamp', s.id); });
      b.setAttribute('aria-label', s.name + ' 도장'); b.dataset.kind = 'stamp'; b.dataset.id = s.id;
      place(b, s.r); draw.appendChild(b); ui.tools.push(b);
    });
    ui.toolTip = el('p', 'pr-tooltip'); draw.appendChild(ui.toolTip);

    ui.start = btn('pr-hit pr-start', '', launch);
    ui.start.setAttribute('aria-label', '퍼레이드 출발!');
    place(ui.start, [1198, 814, 393, 84]); draw.appendChild(ui.start);
    ui.msg = el('p', 'pr-msg'); ui.msg.setAttribute('role', 'status'); ui.msg.hidden = true; draw.appendChild(ui.msg);
    st.appendChild(draw);

    // 퍼레이드(새 창이 막혔을 때 이 화면 안에서)
    var show = ui.showScene = el('div', 'pr-scene pr-show'); show.hidden = true;
    ui.showCanvas = el('canvas', 'pr-full'); ui.showCanvas.setAttribute('aria-label', '리리, 모모와 루루가 내 현수막을 들고 행진해요');
    show.appendChild(ui.showCanvas);
    ui.showEnd = el('div', 'pr-end'); ui.showEnd.hidden = true;
    ui.showEnd.appendChild(el('p', 'pr-end-title', '멋진 퍼레이드였어요!'));
    var row = el('div', 'pr-end-row');
    ui.replay = btn('pr-choice', '🔁 다시 보기', function () { playInline(); });
    row.appendChild(ui.replay);
    row.appendChild(btn('pr-choice light', '🖍️ 꾸미기로 돌아가기', function () { backToDraw(); }));
    ui.showEnd.appendChild(row);
    show.appendChild(ui.showEnd);
    ui.skip = btn('pr-pill pr-exit', '꾸미기로 돌아가기', function () { backToDraw(); });
    show.appendChild(ui.skip);
    st.appendChild(show);

    setTool('pen', 'red');
    updateUndo();
  }

  // ---------- 현수막 천(바탕 레이어) — 새 창으로 보낼 때도 같은 함수로 그림 ----------
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
      var cols = ['#e8545a', '#f39a3a', '#f4c94a', '#7fbf5a', '#57b4e0', '#a07ad4'], R = r * 1.3, bw = R * 0.13;
      g.translate(0, R * 0.35);
      g.lineCap = 'butt';
      cols.forEach(function (c, i) {
        g.beginPath(); g.arc(0, 0, R - bw * (i + 0.5), Math.PI, 0);
        g.strokeStyle = c; g.lineWidth = bw + 0.6; g.stroke();
      });
      g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(150,150,170,0.6)'; g.lineWidth = s * 0.02;
      [-1, 1].forEach(function (d) {
        g.beginPath();
        g.arc(d * R * 0.62, R * 0.05, R * 0.2, 0, Math.PI * 2);
        g.arc(d * R * 0.86, R * 0.1, R * 0.15, 0, Math.PI * 2);
        g.arc(d * R * 0.4, R * 0.12, R * 0.15, 0, Math.PI * 2);
        g.fill(); g.stroke();
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
    ui.ink.style.setProperty('--pen', kind === 'pen' ? penColor(id) : '#999');
    var name = kind === 'pen' ? PENCILS.filter(function (p) { return p.id === id; })[0].name + ' 색연필'
      : kind === 'eraser' ? '지우개' : STAMPS.filter(function (s) { return s.id === id; })[0].name + ' 도장 — 누를 때마다 하나씩 찍혀요';
    ui.toolTip.textContent = '지금 도구: ' + name;
  }
  // 화면 좌표 → 현수막 좌표(CW×CH). 화면 크기가 바뀌어도 같은 자리를 가리킴
  function clothPoint(e) {
    var r = ui.ink.getBoundingClientRect();
    return { x: Math.max(0, Math.min(CW, (e.clientX - r.left) / r.width * CW)), y: Math.max(0, Math.min(CH, (e.clientY - r.top) / r.height * CH)) };
  }
  function onDown(e) {
    if (S.scene !== 'draw' || S.cur) return;
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

  // ---------- 퍼레이드 출발: 새 창 → 막히면 이 화면 안에서 ----------
  var POPUP_NAME = 'makepark-parade';
  function launch() {
    if (S.cur) return;
    if (!hasInk()) { showMsg('먼저 현수막을 꾸며 봐요! 색연필로 그리거나 도장을 찍어요.'); ui.start.classList.remove('shake'); void ui.start.offsetWidth; ui.start.classList.add('shake'); return; }
    S.banner = bannerCanvas();
    S.bannerUrl = S.banner.toDataURL('image/png');
    // 새 창이 메이크파크 창을 못 찾는 환경(앱으로 설치한 화면 등)에서도 작품을 받을 수 있게 같은 주소의 저장소에도 둠
    try { localStorage.setItem('makepark.parade.banner', S.bannerUrl); } catch (err) { /* 저장 불가: postMessage 로만 보냄 */ }
    var forceInline = /[?&]parade=inline/.test(location.search);
    var w = null;
    if (!forceInline) {
      try { w = window.open('parade.html', POPUP_NAME, 'popup=yes,width=1280,height=760'); } catch (err) { w = null; }
    }
    if (!w || w.closed) { playInline(); return; }
    S.popup = w;
    try { w.focus(); } catch (err) { /* 무시 */ }
    showMsg('새 창에서 퍼레이드가 시작돼요! 창을 닫으면 여기서 계속 꾸밀 수 있어요.');
  }
  // 새 창(parade.html)과 주고받기: 준비되면 현수막을 보내고, '꾸미기로 돌아가기'면 이 창을 앞으로
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || typeof d !== 'object' || !S.popup || e.source !== S.popup) return;
    if (d.type === 'parade-ready' && S.bannerUrl) S.popup.postMessage({ type: 'parade-banner', url: S.bannerUrl }, '*');
    else if (d.type === 'parade-back') { try { window.focus(); } catch (err) { /* 무시 */ } }
  });

  function playInline() {
    showScene('show');
    ui.showEnd.hidden = true; ui.skip.hidden = false;
    if (!S.show) S.show = window.MPParadeShow.create({ canvas: ui.showCanvas, base: BASE, banner: S.banner,
      onEnd: function () { ui.showEnd.hidden = false; ui.skip.hidden = true; setTimeout(function () { ui.replay.focus(); }, 30); } });
    else S.show.setBanner(S.banner);
    S.show.play();
  }
  function backToDraw() {
    if (S.show) S.show.stop();
    showScene('draw');
  }

  // ---------- 열기·닫기·장면 ----------
  function open() {
    if (!ui.root) return;
    S.open = true;
    ui.root.hidden = false;
    document.body.classList.add('parade-open');
    showScene('lobby');
  }
  function close() {
    S.open = false; cancelAnimationFrame(S.raf);
    if (S.show) S.show.stop();
    S.cur = null;
    ui.root.hidden = true;
    document.body.classList.remove('parade-open');
    if (api() && api().exitParade) api().exitParade();
  }
  function showScene(name) {
    if (S.cur) onUp();
    if (name !== 'show' && S.show) S.show.stop();
    S.scene = name;
    ui.lobby.hidden = name !== 'lobby';
    ui.draw.hidden = name !== 'draw';
    ui.showScene.hidden = name !== 'show';
    hideMsg();
    cancelAnimationFrame(S.raf);
    if (name === 'lobby') { S.t0 = performance.now(); S.raf = requestAnimationFrame(lobbyLoop); setTimeout(function () { ui.go.focus(); }, 30); }
  }
  function lobbyLoop(now) {
    if (!S.open || S.scene !== 'lobby') return;
    var c = ui.lobbyCanvas.getContext('2d'), ms = now - S.t0;
    c.clearRect(0, 0, IW, IH);
    // 리리: 들어오면 한 번 인사하고 꼬리를 펼친 채로 기다림. 발 기준점 (320, 608)
    var k = 0.74, fx = 520, fy = 900;
    c.save(); c.translate(fx, fy - 4); c.scale(1, 0.22);
    var gr = c.createRadialGradient(0, 0, 0, 0, 0, 150);
    gr.addColorStop(0, 'rgba(140,60,70,0.32)'); gr.addColorStop(1, 'rgba(140,60,70,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(0, 0, 150, 0, Math.PI * 2); c.fill(); c.restore();
    if (riri.complete && riri.naturalWidth) {
      var f = openingFrame(ms % 7000 < 6000 ? ms % 7000 : 0);   // 7초마다 다시 인사
      c.drawImage(riri, f % 4 * 640, Math.floor(f / 4) * 640, 640, 640, fx - 320 * k, fy - 608 * k, 640 * k, 640 * k);
    }
    S.raf = requestAnimationFrame(lobbyLoop);
  }

  // ---------- 키보드 ----------
  function onKey(e) {
    if (!S.open) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && S.scene === 'draw') { e.preventDefault(); undo(); return; }
    if (e.code !== 'Escape') return;
    e.preventDefault();
    if (S.scene === 'show') backToDraw();
    else if (S.scene === 'draw') showScene('lobby');
    else close();
  }

  function init() {
    if (!document.getElementById('parade') || !window.MPParadeShow) return;
    build();
    window.addEventListener('keydown', onKey);
    ui.ink.addEventListener('pointerdown', onDown);
    ui.ink.addEventListener('pointermove', onMove);
    ui.ink.addEventListener('pointerup', onUp);
    ui.ink.addEventListener('pointercancel', onUp);
    ui.ink.addEventListener('lostpointercapture', function (e) { if (S.cur && e.pointerId === S.pid) onUp(e); });
  }
  window.MPParade = { open: open, close: close, _state: S, _ui: ui,
    _debug: { undo: undo, setTool: setTool, ops: function () { return S.ops; }, banner: bannerCanvas, playInline: function () { S.banner = bannerCanvas(); playInline(); }, show: function () { return S.show; } } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
