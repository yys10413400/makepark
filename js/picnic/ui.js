/*
 * 토리네 도시락 화면 (예전 매표소 자리)
 * ------------------------------------------------------------
 * 장면 1 대기실(assets/picnic/lobby.webp): 공원 캐릭터로 바닥을 걸어 다니다 아기 다람쥐 토리에게 '말 걸기'
 *        → 시작 창(학년 1~6 고르기 → '도시락 만들기')
 * 장면 2 주문(한 화면): 위 뒤로가기·제목·진행도 / 토리와 주문 / 가운데 도시락(1~2개) / 아래 재료 4개·전달하기
 *        주문 3개를 풀면 완료 창(새 주문 받기 · 가게로 돌아가기). 처음 하는 학년은 예시 주문, 그다음부터는 판마다 새 주문
 * 위치는 모두 배경 그림(1672×941) 기준 %라서 창 크기가 바뀌어도 함께 커지고 작아집니다(유령의 집과 같은 방식).
 * 주문·판정은 js/picnic/orders.js, 공원과의 연결은 window.MP_API (game.js)
 */
(function () {
  'use strict';
  var P = window.MP_PICNIC;
  var IW = 1672, IH = 941, BASE = 'assets/picnic/';
  /* 티켓(유령의 집과 같은 방식): 학년마다 처음 끝내면 3장, 그 뒤 한 판 끝낼 때마다 1장 — 하루 최대 DAY_MAX장 */
  var FIRST_TICKETS = 3, DAY_MAX = 5;
  var TIP = '방향키나 바닥을 눌러 걸어가서, 아기 다람쥐 토리에게 말을 걸어 봐요';
  var TORI_SAYS = '어서 오세요! 소풍 손님들 주문이 밀려 있어요. 주문대로 도시락을 같이 만들어 줄래요?';
  var KIND = { 1: '개수 세기', 2: '더 담기와 빼기', 3: '똑같이 나누기', 4: '여러 조건 맞추기', 5: '전체의 분수', 6: '비' };
  // 하는 법 창의 학년별 도움말(학년 놀이에 맞는 생각하는 방법)
  var GRADE_TIP = {
    1: '하나, 둘, 셋… 소리 내어 세면서 하나씩 담아 봐요.',
    2: '처음부터 담겨 있는 재료를 먼저 세어 봐요. 더 담을 때는 재료 버튼, 뺄 때는 도시락 안 재료를 눌러요.',
    3: '두 도시락에 하나씩 번갈아 담으면 똑같이 나눌 수 있어요. 다 담고 나서 두 도시락을 비교해 봐요.',
    4: '조건을 하나씩 확인해요. 조건만 맞으면 다른 재료는 마음대로 골라도 돼요. 정답이 여러 가지예요!',
    5: '전체를 똑같은 묶음으로 나눠 생각해요. 12개의 ⅓ → 12개를 3묶음으로 나눈 것 중 1묶음!',
    6: '2:3은 딸기 2개와 방울토마토 3개가 한 묶음이라는 뜻이에요. 그 묶음을 몇 번 담으면 될까요?'
  };
  var PRAISE = ['고마워요! 주문대로 딱 맞아요!', '와, 맛있겠다! 손님이 좋아할 거예요!', '완벽해요! 다음 손님 주문도 부탁해요!'];

  var S = {
    open: false, scene: 'lobby', grade: 1,
    me: { x: 836, y: 870, dir: 'up', moving: false }, keys: {}, dest: null, nearTori: false, nearExit: false,
    start: false, idx: 0, order: null, boxes: [], sel: 0, busy: false, added: null, done: false,
    raf: 0, last: 0, toriT: 0
  };
  var ui = {};

  // ---------- 작은 도우미 ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function img(src, cls, alt) { var e = el('img', cls); e.src = BASE + src + '.webp'; e.alt = alt || ''; e.draggable = false; return e; }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function pct(v, of) { return (v / of * 100) + '%'; }
  function api() { return window.MP_API; }
  function save() { return (api() && api().readSave()) || {}; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  // 주문 문장: {중괄호} 안은 딸기색 큰 글자
  function richText(box, text) {
    box.textContent = '';
    var node = box.appendChild(el('span'));   // 말풍선은 flex 라서 글을 한 덩어리로 넣어야 숫자 옆 띄어쓰기가 살아 있음
    // 숫자와 바로 뒤 글자('2개씩')는 한 덩어리로 묶어 줄이 바뀔 때 떨어지지 않게
    var parts = text.split(/(\{[^}]*\})/), glue = null;
    parts.forEach(function (part) {
      if (!part) return;
      if (part[0] === '{') { glue = el('span', 'pc-nw'); glue.appendChild(el('b', 'pc-num', part.slice(1, -1))); node.appendChild(glue); return; }
      if (glue) { var m = part.match(/^\S*/)[0]; glue.appendChild(document.createTextNode(m)); part = part.slice(m.length); glue = null; }
      if (part) node.appendChild(document.createTextNode(part));
    });
  }

  // ---------- 토리 인사 움직임(assets/picnic-src/tori-sprites.png, 384×384 고정 캔버스 8프레임) ----------
  var TORI = { ms: [180, 110, 100, 100, 110, 125, 145, 170], size: 384, foot: 353, imgs: [] };
  TORI.total = TORI.ms.reduce(function (a, b) { return a + b; }, 0);
  for (var ti = 0; ti < 8; ti++) { TORI.imgs[ti] = new Image(); TORI.imgs[ti].src = BASE + 'tori-idle-0' + ti + '.webp'; }
  function toriFrame(t) {
    var ms = (t * 1000) % TORI.total;
    for (var i = 0; i < 8; i++) { if (ms < TORI.ms[i]) return i; ms -= TORI.ms[i]; }
    return 0;
  }

  // ---------- 화면 만들기 ----------
  function build() {
    ui.root = document.getElementById('picnic');
    var st = ui.stage = el('div', 'pc-stage');
    ui.root.appendChild(st);

    // 대기실
    var lobby = ui.lobby = el('div', 'pc-scene pc-lobby');
    lobby.style.backgroundImage = 'url(' + BASE + 'lobby.webp)';
    ui.canvas = el('canvas', 'pc-canvas'); ui.canvas.width = IW; ui.canvas.height = IH;
    ui.canvas.setAttribute('aria-label', '토리네 도시락 대기실. 방향키나 화면을 눌러 걸어요');
    lobby.appendChild(ui.canvas);
    ui.talk = btn('pc-prompt', '', function () { openStart(); });
    ui.talk.innerHTML = '말 걸기 <kbd>스페이스</kbd>'; ui.talk.hidden = true;
    ui.leave = btn('pc-prompt pc-prompt-exit', '', function () { close(); });
    ui.leave.innerHTML = '공원으로 나가기 <kbd>스페이스</kbd>'; ui.leave.hidden = true;
    ui.tip = el('p', 'pc-tip', TIP);
    ui.lobbyExit = btn('pc-pill pc-exit', '공원으로', function () { close(); });
    [ui.talk, ui.leave, ui.tip, ui.lobbyExit].forEach(function (n) { lobby.appendChild(n); });
    buildStart(lobby);
    st.appendChild(lobby);

    // 주문 화면
    var game = ui.game = el('div', 'pc-scene pc-game'); game.hidden = true;
    game.appendChild(el('div', 'pc-counter'));
    var back = btn('pc-back', '', function () { toLobby(); });
    back.setAttribute('aria-label', '가게로 돌아가기');
    back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>';
    game.appendChild(back);
    ui.helpBtn = btn('pc-pill pc-help', '? 하는 법', function () { openHelp(false); });
    game.appendChild(ui.helpBtn);
    ui.progress = el('p', 'pc-progress', '1 / 3'); game.appendChild(ui.progress);
    ui.gTori = img('tori-idle-00', 'pc-gtori', '아기 다람쥐 토리'); game.appendChild(ui.gTori);
    ui.order = el('p', 'pc-order'); ui.order.setAttribute('aria-live', 'polite'); game.appendChild(ui.order);
    ui.feedback = el('p', 'pc-feedback'); ui.feedback.setAttribute('role', 'status'); ui.feedback.hidden = true; game.appendChild(ui.feedback);
    ui.boxRow = el('div', 'pc-boxes'); game.appendChild(ui.boxRow);
    var foods = el('div', 'pc-foods');
    ui.foodBtns = P.FOODS.map(function (f) {
      var b = btn('pc-food', '', function () { addFood(f); });
      b.appendChild(img('food-' + f, 'pc-food-img'));
      b.appendChild(el('span', 'pc-food-name', P.NAME[f]));
      b.setAttribute('aria-label', P.NAME[f] + ' 담기');
      foods.appendChild(b); return b;
    });
    game.appendChild(foods);
    ui.deliver = btn('pc-deliver', '전달하기', deliver); game.appendChild(ui.deliver);
    ui.modal = el('div', 'pc-modal'); ui.modal.hidden = true;
    ui.modalCard = el('div', 'pc-card'); ui.modalCard.setAttribute('role', 'dialog'); ui.modalCard.setAttribute('aria-modal', 'true');
    ui.modal.appendChild(ui.modalCard); game.appendChild(ui.modal);
    st.appendChild(game);

    // 내 티켓(유령의 집·코스터와 같은 모양): 대기실은 왼쪽 위, 주문 화면은 오른쪽 위 진행도 옆. 받으면 숫자가 하나씩 올라감
    ui.tickets = el('p', 'pc-tickets');
    ui.tickets.appendChild(el('span', 'pc-tickets-icon', '🎟'));
    ui.tickets.appendChild(document.createTextNode('티켓 '));
    ui.ticketNum = el('b', '', '0');
    ui.tickets.appendChild(ui.ticketNum);
    ui.tickets.appendChild(document.createTextNode('장'));
    ui.tickets.setAttribute('aria-live', 'polite');
    st.appendChild(ui.tickets);

    ['lunchbox', 'food-onigiri', 'food-sandwich', 'food-strawberry', 'food-tomato'].forEach(function (n) { var i = new Image(); i.src = BASE + n + '.webp'; });
  }

  // ---------- 시작 창: 학년 고르기 → 도시락 만들기 ----------
  function buildStart(parent) {
    var m = ui.start = el('div', 'pc-modal pc-start'); m.hidden = true;
    var c = el('div', 'pc-card pc-start-card');
    c.setAttribute('role', 'dialog'); c.setAttribute('aria-modal', 'true'); c.setAttribute('aria-labelledby', 'pcStartTitle');
    var face = el('div', 'pc-start-face'); face.appendChild(img('tori-idle-00', '', '토리'));
    c.appendChild(face);
    var body = el('div', 'pc-start-body');
    var h = el('h2', 'pc-card-title', '토리네 도시락'); h.id = 'pcStartTitle';
    body.appendChild(el('p', 'pc-start-name', '아기 다람쥐 토리'));
    body.appendChild(h);
    body.appendChild(el('p', 'pc-start-text', TORI_SAYS));
    var gr = el('div', 'pc-grades'); gr.setAttribute('role', 'radiogroup'); gr.setAttribute('aria-label', '학년');
    ui.gradeBtns = [];
    for (var g = 1; g <= 6; g++) {
      (function (g) {
        var b = btn('pc-grade', g + '학년', function () { setGrade(g); });
        b.setAttribute('role', 'radio'); ui.gradeBtns.push(b); gr.appendChild(b);
      })(g);
    }
    body.appendChild(gr);
    ui.gradeNote = el('p', 'pc-grade-note'); body.appendChild(ui.gradeNote);
    ui.ticketNote = el('p', 'pc-ticket-note'); body.appendChild(ui.ticketNote);
    var acts = el('div', 'pc-acts');
    ui.goBtn = btn('pc-choice', '도시락 만들기', function () { startGame(); });
    acts.appendChild(ui.goBtn);
    acts.appendChild(btn('pc-choice light', '나중에 할래', function () { closeStart(); }));
    body.appendChild(acts);
    c.appendChild(body);
    m.appendChild(c);
    m.addEventListener('pointerdown', function (e) { if (e.target === m) closeStart(); });
    parent.appendChild(m);
  }
  function setGrade(g) {
    S.grade = g;
    ui.gradeBtns.forEach(function (b, i) { b.setAttribute('aria-checked', String(i + 1 === g)); b.classList.toggle('on', i + 1 === g); });
    var park = api().profile().grade || null, pc = save().picnic || {};
    var day = pc.day && pc.day.date === today() ? pc.day.n : 0;
    ui.ticketNote.textContent = '🎟 주문 3개를 다 풀면 티켓을 받아요! ' + (!(pc.done && pc.done['g' + g])
      ? g + '학년은 처음이라 3장! (그다음부터는 새 주문 한 판에 1장, 하루 ' + DAY_MAX + '장까지)'
      : '판마다 새 주문이 와요! 한 판에 1장씩 (오늘 ' + day + ' / ' + DAY_MAX + '장 받았어요)');
    ui.gradeNote.textContent = g + '학년 주문: ' + KIND[g] + ' · 주문 3개' + (park && park !== g ? ' (공원 학년은 ' + park + '학년이에요)' : '');
  }
  function openStart() {
    if (S.start) return;
    S.start = true; S.keys = {}; S.dest = null; S.me.moving = false;
    ui.start.hidden = false; ui.talk.hidden = true; ui.leave.hidden = true; ui.tip.hidden = true;
    setGrade(S.grade);
    ui.goBtn.focus();
  }
  function closeStart() { S.start = false; ui.start.hidden = true; ui.tip.hidden = false; S.keys = {}; }

  // ---------- 열기·닫기 ----------
  function open() {
    if (!ui.root) return;
    S.grade = api().profile().grade || 1;   // 공원에서 고른 학년이 기본
    S.open = true;
    ui.root.hidden = false;
    document.body.classList.add('picnic-open');
    showScene('lobby');
    S.me = { x: 836, y: 880, dir: 'up', moving: false };   // 아래쪽 입구에서 시작
    S.dest = null; S.keys = {}; closeStart();
    S.last = performance.now();
    cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(loop);
  }
  function close() {
    S.open = false; cancelAnimationFrame(S.raf); clearTimeout(S.timer);
    ui.root.hidden = true;
    document.body.classList.remove('picnic-open');
    if (api().exitPicnic) api().exitPicnic();
  }
  function showScene(name) {
    S.scene = name;
    ui.lobby.hidden = name !== 'lobby';
    ui.game.hidden = name !== 'game';
    ui.root.classList.toggle('is-game', name === 'game');
    showTickets();
  }
  function ticketCount() { return save().tickets || 0; }
  // from 을 주면 from → 지금 장수까지 하나씩 올라가며 '+N' 이 떠오름
  function showTickets(from) {
    var e = ui.tickets, to = ticketCount();
    e.className = 'pc-tickets at-' + S.scene;
    clearTimeout(S.tkTimer);
    if (from == null || from >= to) { ui.ticketNum.textContent = String(to); return; }
    var plus = el('span', 'pc-tickets-plus', '+' + (to - from));
    e.appendChild(plus);
    setTimeout(function () { if (plus.parentNode) plus.parentNode.removeChild(plus); }, 1600);
    e.classList.add('gain');
    var n = from;
    (function up() {
      n++; ui.ticketNum.textContent = String(n);
      if (n < to) S.tkTimer = setTimeout(up, 140);
      else setTimeout(function () { e.classList.remove('gain'); }, 500);
    })();
  }
  function toLobby() {
    clearTimeout(S.timer); S.busy = false; ui.modal.hidden = true; S.help = false;
    showScene('lobby');
    // 토리 앞에 서서 바로 다시 말을 걸 수 있게
    S.me = { x: TORI_POS.x + 40, y: TORI_POS.y + 110, dir: 'up', moving: false };
    S.dest = null; S.keys = {}; closeStart();
    S.last = performance.now();
  }

  // ---------- 대기실 걷기 ----------
  // 걸을 수 있는 바닥(그림 좌표 다각형): 벽 아래 걸레받이 앞부터. 도시락 매대·벤치·화분·토리 발밑은 막음
  var FLOOR = [[0, 712], [236, 566], [1442, 566], [1672, 678], [1672, 935], [0, 935]];
  var BLOCK_RECTS = [
    { x: 236, y: 500, w: 512, h: 96, note: '도시락 매대' },
    { x: 1066, y: 500, w: 300, h: 82, note: '벤치' },
    { x: 1338, y: 500, w: 110, h: 80, note: '화분' }
  ];
  var TORI_POS = { x: 820, y: 640, h: 225 };   // 발 위치와 그릴 몸 키(그림 좌표)
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
    for (var i = 0; i < BLOCK_RECTS.length; i++) { var r = BLOCK_RECTS[i]; if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return false; }
    var tx = (x - TORI_POS.x) / 60, ty = (y - TORI_POS.y) / 24;
    return tx * tx + ty * ty >= 1;
  }
  // 캐릭터 몸 키: 공원에서 보이는 크기의 1.3배 + 원근(안쪽은 조금 작게)
  var LOBBY_SCALE = 1.3, FLOOR_TOP = 566;
  function charH(y) {
    var r = ui.canvas.getBoundingClientRect(), px = api().charScreenH ? api().charScreenH() : 94;
    var base = r.height ? px * IH / r.height : 125;
    var depth = 0.9 + Math.max(0, Math.min(1, (y - FLOOR_TOP) / (IH - FLOOR_TOP))) * 0.25;
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
      if (d < 6) { S.dest = null; if (S.destTalk) { S.destTalk = false; if (S.nearTori) openStart(); } } else { dx = tx / d; dy = ty / d; }
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
    S.nearTori = Math.hypot(me.x - TORI_POS.x, (me.y - TORI_POS.y) * 1.4) < 200;
    S.nearExit = !S.nearTori && me.y > EXIT_Y;
    ui.talk.hidden = !S.nearTori;
    ui.leave.hidden = !S.nearExit;
    if (S.nearTori) { ui.talk.style.left = pct(TORI_POS.x, IW); ui.talk.style.top = pct(TORI_POS.y - TORI_POS.h - 70, IH); }
    if (S.nearExit) { ui.leave.style.left = pct(me.x, IW); ui.leave.style.top = pct(me.y - charH(me.y) - 70, IH); }
  }
  function drawLobby(t) {
    var c = ui.canvas.getContext('2d');
    c.clearRect(0, 0, IW, IH);
    var items = [
      { y: TORI_POS.y, draw: function () { drawTori(c, t); } },
      { y: S.me.y, draw: function () { drawMe(c, t); } }
    ];
    items.sort(function (a, b) { return a.y - b.y; }).forEach(function (i) { i.draw(); });
    if (DEBUG) {
      c.strokeStyle = 'lime'; c.lineWidth = 3; c.beginPath();
      FLOOR.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); c.stroke();
      c.strokeStyle = 'red'; BLOCK_RECTS.forEach(function (r) { c.strokeRect(r.x, r.y, r.w, r.h); });
    }
  }
  var DEBUG = /[?&]debug=1/.test(location.search);
  function shadow(c, x, y, w) {
    var g = c.createRadialGradient(x, y, 0, x, y, w);
    g.addColorStop(0, 'rgba(90,45,10,0.42)'); g.addColorStop(1, 'rgba(90,45,10,0)');
    c.save(); c.translate(x, y); c.scale(1, 0.28); c.translate(-x, -y);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, w, 0, Math.PI * 2); c.fill(); c.restore();
  }
  function drawTori(c, t) {
    var fi = S.start ? 0 : toriFrame(t), im = TORI.imgs[fi];
    // 384 캔버스 안 토리 몸은 약 40~353px(키 313) → 화면 몸 키 TORI_POS.h 에 맞춤
    var k = TORI_POS.h / 313, size = TORI.size * k;
    shadow(c, TORI_POS.x, TORI_POS.y, 62);
    if (im.complete && im.naturalWidth) c.drawImage(im, TORI_POS.x - size / 2, TORI_POS.y - TORI.foot * k, size, size);
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
  function loop(now) {
    if (!S.open) return;
    var dt = Math.min(0.05, (now - S.last) / 1000); S.last = now;
    if (S.scene === 'lobby') { step(dt); drawLobby(now / 1000); }
    else if (S.scene === 'game') {
      // 주문 화면의 토리도 같은 인사 움직임(같은 그림이면 바꾸지 않음)
      var src = BASE + 'tori-idle-0' + toriFrame(now / 1000) + '.webp';
      if (ui.gTori.getAttribute('src') !== src) ui.gTori.setAttribute('src', src);
    }
    S.raf = requestAnimationFrame(loop);
  }
  function lobbyPoint(e) {
    var r = ui.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * IW, y: (e.clientY - r.top) / r.height * IH };
  }

  // ---------- 주문 놀이 ----------
  function startGame() {
    closeStart();
    S.idx = 0; S.done = false;
    // 코스터·유령의 집처럼 판마다 새 주문(유형·숫자 범위는 학년마다 그대로). 처음 하는 학년은 예시 주문,
    // 바로 전 판과 같은 주문은 피함(picnic.last 에 문장 저장)
    var pc0 = save().picnic || {}, key = 'g' + S.grade;
    S.orders = P.makeRound(S.grade, { first: !(pc0.done && pc0.done[key]), avoid: (pc0.last && pc0.last[key]) || [] });
    if (api() && pc0.done && pc0.done[key]) {   // 새 주문 판만 기억(예시 주문은 기억할 필요 없음)
      pc0.last = pc0.last && typeof pc0.last === 'object' ? pc0.last : {};
      pc0.last[key] = S.orders.map(function (o) { return o.text; });
      api().patchSave({ picnic: pc0 });
    }
    showScene('game');
    loadOrder();
    var pc = save().picnic;
    if (!(pc && pc.howto)) openHelp(true);   // 처음 한 번은 하는 법을 먼저 보여 줌
  }
  // ---------- 하는 법 (유령의 집·코스터처럼 처음 한 번 + '? 하는 법' 버튼) ----------
  function howTo() {
    var box = el('div', 'pc-howto');
    function row(num, title, node) {
      var r = el('div', 'pc-howto-row');
      r.appendChild(el('span', 'pc-howto-num', num));
      var t = el('div', 'pc-howto-text');
      t.appendChild(el('p', 'pc-howto-title', title));
      if (node) t.appendChild(node);
      r.appendChild(t); box.appendChild(r);
    }
    function sub(text) { return el('p', 'pc-howto-sub', text); }
    var ex = el('p', 'pc-howto-sub');
    richText(ex, '예) 주먹밥 {2}개랑 딸기 {3}개 → 주먹밥 2번, 딸기 3번 누르기');
    row('1', '토리의 주문을 끝까지 읽어요. 빨간 숫자가 중요해요!', ex);
    var pics = el('div', 'pc-howto-pics');
    P.FOODS.forEach(function (f) { var c = el('span', 'pc-howto-chip'); c.appendChild(img('food-' + f, '')); c.appendChild(document.createTextNode(P.NAME[f])); pics.appendChild(c); });
    row('2', '아래 재료 버튼을 한 번 누르면 도시락에 하나 들어가요', pics);
    row('3', '잘못 담았으면 도시락 안의 재료를 눌러요. 하나만 쏙 빠져요', null);
    row('4', '도시락이 두 개면, 담을 도시락을 먼저 눌러 골라요', sub('금빛 테두리와 ‘여기에 담아요’가 보이는 도시락에 들어가요.'));
    row('5', '다 담았으면 ‘전달하기’! 틀려도 괜찮아요', sub('담은 건 그대로 두고 토리가 힌트를 줘요. 고쳐서 다시 전달하면 돼요.'));
    var tip = el('div', 'pc-howto-tip');
    tip.appendChild(el('b', '', S.grade + '학년 ' + KIND[S.grade] + ' 도움말'));
    tip.appendChild(el('span', '', GRADE_TIP[S.grade]));
    box.appendChild(tip);
    return box;
  }
  function openHelp(first) {
    if (S.scene !== 'game' || S.done) return;
    var c = ui.modalCard; c.textContent = '';
    c.classList.add('pc-help-card');
    c.appendChild(el('h2', 'pc-card-title', first ? '토리랑 도시락을 만들어요!' : '어떻게 해요?'));
    c.appendChild(howTo());
    var row = el('div', 'pc-acts');
    var go = btn('pc-choice', first ? '시작!' : '알겠어!', closeHelp);
    row.appendChild(go); c.appendChild(row);
    ui.modal.hidden = false; S.help = true;
    setTimeout(function () { go.focus(); }, 30);
  }
  function closeHelp() {
    if (!S.help) return;
    S.help = false; ui.modal.hidden = true; ui.modalCard.classList.remove('pc-help-card');
    var pc = save().picnic;
    if (!(pc && pc.howto) && api()) { pc = pc && typeof pc === 'object' ? pc : {}; pc.howto = true; api().patchSave({ picnic: pc }); }
  }
  function loadOrder() {
    var o = S.order = S.orders[S.idx];
    S.boxes = P.startBoxes(o); S.sel = 0; S.busy = false; S.added = null;
    ui.progress.textContent = (S.idx + 1) + ' / ' + S.orders.length;
    richText(ui.order, o.text);
    ui.order.classList.toggle('long', o.text.replace(/[{}]/g, '').length > 40);
    ui.order.classList.remove('pop'); void ui.order.offsetWidth; ui.order.classList.add('pop');
    hideFeedback();
    ui.deliver.disabled = false;
    renderBoxes();
  }
  // 도시락 안 칸 나누기: 안쪽 넓이(가로:세로 ≈ 4:1)에 맞춰 줄 수를 정하고, 적을 때도 너무 크지 않게
  function gridFor(count, ratio) {
    var rows = Math.max(2, Math.ceil(Math.sqrt(count / ratio)));
    var cols = Math.max(Math.ceil(ratio * 1.5), Math.ceil(count / rows));
    return { cols: cols, rows: rows };
  }
  function renderBoxes() {
    var two = S.boxes.length > 1;
    ui.boxRow.textContent = '';
    ui.boxRow.classList.toggle('two', two);
    ui.boxEls = S.boxes.map(function (b, i) {
      var wrap = el('div', 'pc-boxwrap' + (two && S.sel === i ? ' sel' : ''));
      if (two) {
        var tag = btn('pc-boxtag', '도시락 ' + (i + 1), function () { selectBox(i); });
        tag.setAttribute('aria-pressed', String(S.sel === i));
        if (S.sel === i) tag.appendChild(el('span', 'pc-boxtag-on', ' · 여기에 담아요'));
        wrap.appendChild(tag);
      }
      var box = el('div', 'pc-box');
      box.addEventListener('click', function () { if (two) selectBox(i); });
      box.appendChild(img('lunchbox', 'pc-box-img'));
      var inner = el('div', 'pc-items'), list = [];
      P.FOODS.forEach(function (f) { for (var k = 0; k < b[f]; k++) list.push(f); });   // 같은 재료끼리 모아 정렬
      var gdim = gridFor(list.length, two ? 3.6 : 4.2);
      inner.style.setProperty('--cw', (100 / gdim.cols) + '%');
      inner.style.setProperty('--rh', (100 / gdim.rows) + '%');
      list.forEach(function (f, k) {
        var it = btn('pc-item', '', function (e) { e.stopPropagation(); removeFood(i, f); });
        it.appendChild(img('food-' + f, ''));
        it.setAttribute('aria-label', '도시락 ' + (i + 1) + '의 ' + P.NAME[f] + ' 빼기');
        // 방금 넣은 재료(그 재료 무리의 마지막)만 톡 튀어나오게
        if (S.added && S.added.box === i && S.added.food === f && (k === list.length - 1 || list[k + 1] !== f)) it.classList.add('pop');
        inner.appendChild(it);
      });
      box.setAttribute('aria-label', (two ? '도시락 ' + (i + 1) + ': ' : '도시락: ') +
        (list.length ? P.FOODS.filter(function (f) { return b[f]; }).map(function (f) { return P.NAME[f] + ' ' + b[f] + '개'; }).join(', ') : '비어 있음'));
      box.appendChild(inner);
      wrap.appendChild(box);
      ui.boxRow.appendChild(wrap);
      return wrap;
    });
    S.added = null;
  }
  function selectBox(i) {
    if (S.busy || S.sel === i) return;
    S.sel = i; renderBoxes();
  }
  function addFood(f) {
    if (S.busy) return;
    var b = S.boxes[S.sel];
    if (P.total(b) >= P.BOX_MAX) { showFeedback('도시락이 가득 찼어요! 담긴 재료를 눌러 빼 봐.', 'warn'); return; }
    b[f]++; S.added = { box: S.sel, food: f };
    hideFeedback();
    renderBoxes();
  }
  function removeFood(i, f) {
    if (S.busy || !S.boxes[i][f]) return;
    S.boxes[i][f]--;
    if (S.boxes.length > 1) S.sel = i;
    hideFeedback();
    renderBoxes();
  }
  function showFeedback(text, kind) {
    ui.feedback.textContent = text;
    ui.feedback.className = 'pc-feedback ' + (kind || 'warn');
    ui.feedback.hidden = false;
    void ui.feedback.offsetWidth; ui.feedback.classList.add('pop');
  }
  // 힌트·칭찬이 없을 때는 지금 할 일을 짧게 알려 주는 안내 줄
  function hideFeedback() {
    var two = S.boxes.length > 1;
    ui.feedback.textContent = two ? '담을 도시락을 먼저 누르고, 아래 재료를 눌러 담아요' : '재료를 누르면 담기고, 도시락 안 재료를 누르면 빠져요';
    ui.feedback.className = 'pc-feedback guide';
    ui.feedback.hidden = false;
  }
  function deliver() {
    if (S.busy) return;
    var res = P.judge(S.order, S.boxes);
    if (!res.ok) {
      showFeedback(res.hint, 'warn');
      ui.boxRow.classList.remove('shake'); void ui.boxRow.offsetWidth; ui.boxRow.classList.add('shake');
      return;
    }
    S.busy = true; ui.deliver.disabled = true;
    showFeedback(PRAISE[S.idx % PRAISE.length], 'good');
    ui.gTori.classList.add('cheer');
    ui.boxRow.classList.add('sent');
    S.timer = setTimeout(function () {
      ui.gTori.classList.remove('cheer'); ui.boxRow.classList.remove('sent');
      S.idx++;
      if (S.idx < S.orders.length) loadOrder();
      else finish();
    }, 1400);
  }
  function finish() {
    S.done = true;
    var before = save().tickets || 0, got = null, pc = null, saved = true;
    if (api()) {
      var s = save(), p = s.picnic && typeof s.picnic === 'object' ? s.picnic : {};
      if (!p.day || p.day.date !== today()) p.day = { date: today(), n: 0 };
      p.done = p.done && typeof p.done === 'object' ? p.done : {};
      var key = 'g' + S.grade;
      if (!p.done[key]) { p.done[key] = true; got = { kind: 'first', gain: FIRST_TICKETS }; }
      else if (p.day.n < DAY_MAX) { p.day.n++; got = { kind: 'new', gain: 1 }; }
      else got = { kind: 'daymax', gain: 0 };
      p.cleared = true; p.rounds = (p.rounds || 0) + 1;
      pc = p;
      var patch = { picnic: p };
      if (got.gain) patch.tickets = before + got.gain;
      api().patchSave(patch);
      saved = api().storageOk();
    }
    var lines = [S.grade + '학년 ' + KIND[S.grade] + ' 주문 3개를 모두 전달했어요. 손님들이 즐거운 소풍을 떠났어요! 다음 판에는 새 주문이 와요.'];
    if (got) lines.push(got.kind === 'first' ? '🎟 티켓 ' + got.gain + '장을 받았어요! 다음부터는 한 판 끝낼 때마다 1장씩 받아요.'
      : got.kind === 'new' ? '🎟 티켓 1장을 받았어요! (오늘 ' + pc.day.n + ' / ' + DAY_MAX + ')'
      : '오늘 받을 수 있는 티켓(' + DAY_MAX + '장)은 다 받았어요. 내일 또 받아요!');
    if (!saved) lines.push('이 기기에는 저장할 수 없어서 기록이 남지 않아요.');
    var c = ui.modalCard; c.textContent = ''; c.classList.remove('pc-help-card'); S.help = false;
    var face = el('div', 'pc-start-face pc-done-face'); face.appendChild(img('tori-idle-03', '', '기뻐하는 토리')); c.appendChild(face);
    c.appendChild(el('h2', 'pc-card-title', '주문 완료!'));
    lines.forEach(function (l) { c.appendChild(el('p', 'pc-card-line', l)); });
    var row = el('div', 'pc-acts');
    var again = btn('pc-choice', '🎲 새 주문 받기', function () { ui.modal.hidden = true; startGame(); });
    row.appendChild(again);
    row.appendChild(btn('pc-choice light', '가게로 돌아가기', function () { toLobby(); }));
    c.appendChild(row);
    ui.modal.hidden = false;
    if (got && got.gain) showTickets(before);
    setTimeout(function () { again.focus(); }, 30);
  }

  // ---------- 키보드 ----------
  function onKey(e, down) {
    if (!S.open) return;
    if (S.scene === 'lobby' && !S.start) {
      if (KEYMAP[e.code]) { e.preventDefault(); S.keys[KEYMAP[e.code]] = down; return; }
      if (down && e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (S.nearTori) openStart(); else if (S.nearExit) close();
      }
      if (down && e.code === 'Escape') { e.preventDefault(); close(); }
      return;
    }
    if (!down) return;
    if (S.start && e.code === 'Escape') { e.preventDefault(); closeStart(); return; }
    if (S.help && e.code === 'Escape') { e.preventDefault(); closeHelp(); return; }
    if (S.scene === 'game' && e.code === 'Escape' && ui.modal.hidden) { e.preventDefault(); toLobby(); }
  }

  function init() {
    if (!P || !document.getElementById('picnic')) return;
    build();
    window.addEventListener('keydown', function (e) { onKey(e, true); });
    window.addEventListener('keyup', function (e) { onKey(e, false); });
    window.addEventListener('blur', function () { S.keys = {}; });
    ui.canvas.addEventListener('pointerdown', function (e) {
      if (S.start) return;
      var p = lobbyPoint(e);
      // 토리를 누르면 그 앞으로 걸어가서 말 걸기
      if (Math.abs(p.x - TORI_POS.x) < 90 && p.y > TORI_POS.y - TORI_POS.h - 20 && p.y < TORI_POS.y + 20) {
        if (S.nearTori) { openStart(); return; }
        p = { x: TORI_POS.x + 40, y: TORI_POS.y + 100 }; S.destTalk = true;
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
  window.MPPicnic = { open: open, close: close, _state: S, _ui: ui, _walkable: walkable,
    // 검증용: 주문 화면 상태를 바로 만들기
    _debug: { startGame: function (g) { S.grade = g; startGame(); }, goto: function (g, i) { S.grade = g; startGame(); S.idx = i; loadOrder(); }, addFood: addFood, removeFood: removeFood, selectBox: selectBox, deliver: deliver } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
