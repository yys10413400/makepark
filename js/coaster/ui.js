/*
 * 코스터 익스프레스 화면
 * - 빈 게임 화면(assets/coaster/ui-bg.webp, 1672×941) 위에 실제 글씨·버튼·게임 오브젝트를 올림
 * - 모든 위치는 화면 그림 기준 백분율이라 창 크기가 바뀌어도 어긋나지 않음
 * - 명령 실행은 js/coaster/logic.js, 미션은 js/coaster/missions.js
 * 공원과의 연결: window.MP_API (game.js) — 저장·프로필·공원 복귀
 */
(function () {
  'use strict';
  var M = window.MP_COASTER_MISSIONS, LG = window.MP_COASTER_LOGIC;
  var $ = function (id) { return document.getElementById(id); };
  var BLOCK = {
    fwd: { label: '앞으로 한 칸', icon: '⬆' },
    left: { label: '왼쪽으로 돌기', icon: '↺' },
    right: { label: '오른쪽으로 돌기', icon: '↻' },
    wait: { label: '기다리기', icon: '⏸' },
    repeat: { label: '반복하기', icon: '⟳' },
    'if': { label: '만약 신호가 초록이면', icon: '◆' }
  };
  var CART = { E: 'cart-right', W: 'cart-left', N: 'cart-up', S: 'cart-down' };
  var DIR_KO = { E: '오른쪽', W: '왼쪽', N: '위쪽', S: '아래쪽' };
  // 게임 영역(빈 화면 그림의 잔디 안쪽, 안내 띠 아래) — 그림 좌표
  var BOARD = { x: 30, y: 262, w: 1085, h: 450 };

  var ui = {}, S = { marks: {},
    course: 'low', list: [], idx: 0, mission: null, program: [], target: 'main',
    signals: {}, run: null, mode: 'idle', token: 0, layout: null, cart: { c: 0, r: 0, dir: 'E' }
  };

  // ---------- 저장 ----------
  function save() { return (window.MP_API && window.MP_API.readSave()) || {}; }
  function coasterData() {
    var c = save().coaster;
    return c && typeof c === 'object' ? c : {};
  }
  function patchCoaster(fn) {
    var c = coasterData();
    ['done', 'rewarded', 'programs', 'stamps'].forEach(function (k) { if (!c[k] || typeof c[k] !== 'object') c[k] = {}; });
    var extra = fn(c) || {};
    var patch = { coaster: c };
    for (var k in extra) patch[k] = extra[k];
    window.MP_API.patchSave(patch);
    return window.MP_API.storageOk();
  }
  function bandOf(grade) { return grade <= 2 ? 'low' : grade <= 4 ? 'middle' : 'high'; }

  // ---------- 미션 목록·잠금 ----------
  function sequence() { return M.common.concat(M.courses[S.course].missions); }
  function isDone(id) { return !!(coasterData().done || {})[id]; }
  function unlocked(i) {
    var seq = sequence();
    for (var k = 0; k < i; k++) if (!isDone(seq[k].id)) return false;
    return true;
  }
  function firstOpenIndex() {
    var seq = sequence();
    for (var i = 0; i < seq.length; i++) if (!isDone(seq[i].id)) return i;
    return seq.length - 1;
  }

  // ---------- 열기·닫기 ----------
  function open() {
    var prof = window.MP_API.profile();
    S.course = bandOf(prof.grade || 1);
    S.list = sequence();
    loadMission(firstOpenIndex());
    ui.root.hidden = false;
    document.body.classList.add('coaster-open');
    setTimeout(function () { ui.run.focus(); }, 30);
  }
  function close() {
    cancelRun(); S.mode = 'idle';
    ui.root.hidden = true;
    ui.success.hidden = true;
    document.body.classList.remove('coaster-open');
    if (window.MP_API.exitCoaster) window.MP_API.exitCoaster();
  }

  function loadMission(i) {
    cancelRun();
    S.idx = Math.max(0, Math.min(i, S.list.length - 1));
    S.mission = S.list[S.idx];
    var saved = (coasterData().programs || {})[S.mission.id];
    S.program = validProgram(saved) ? LG.withIds(saved) : LG.withIds(S.mission.start || []);
    S.target = 'main';
    ui.course.textContent = S.mission.id.indexOf('common') === 0 ? '공통 튜토리얼' : M.courses[S.course].label;
    ui.mission.textContent = S.mission.title;
    ui.missionNo.textContent = (S.idx + 1) + ' / ' + S.list.length;
    ui.guide.textContent = S.mission.guide;
    ui.prev.disabled = S.idx === 0;
    ui.next.disabled = S.idx >= S.list.length - 1 || !unlocked(S.idx + 1);
    ui.success.hidden = true;
    buildBoard();
    renderCommands();
    resetTrain(S.mission.start ? '명령 하나가 틀렸어요. 실행해 보고 고쳐 봐요!' : '명령 버튼을 눌러 내 명령을 만들어요.');
    renderList();
    updateTickets();
  }
  function validProgram(p) {
    if (!Array.isArray(p)) return false;
    var allowed = S.mission.blocks;
    return p.every(function ok(b) {
      return b && allowed.indexOf(b.type) >= 0 &&
        (!b.body || (Array.isArray(b.body) && b.body.every(ok))) &&
        (!b.then || (Array.isArray(b.then) && b.then.every(ok))) &&
        (!b.else || (Array.isArray(b.else) && b.else.every(ok)));
    });
  }
  function plain(list) {
    return list.map(function (b) {
      var o = { type: b.type };
      if (b.type === 'repeat') { o.n = b.n; o.body = plain(b.body); }
      if (b.type === 'if') { o.then = plain(b.then); o.else = plain(b.else); }
      return o;
    });
  }
  function rememberProgram() {
    var id = S.mission.id, p = plain(S.program);
    patchCoaster(function (c) { c.programs[id] = p; });
  }

  // ---------- 게임 영역 ----------
  function buildBoard() {
    var m = S.mission, cols = 0, rows = 0;
    m.rails.forEach(function (t) { cols = Math.max(cols, t[0] + 1); rows = Math.max(rows, t[1] + 1); });
    // 역이 출발·도착 칸 위(뒤쪽)에 서므로 위에 1.15칸 여유
    var s = Math.min(BOARD.w / (cols + 0.7), BOARD.h / (rows + 1.35), 190);
    var gw = cols * s, gh = rows * s;
    var ox = (BOARD.w - gw) / 2, oy = BOARD.h - gh - (BOARD.h - gh - 1.15 * s) / 2;
    S.layout = { s: s, ox: ox, oy: oy };
    var b = ui.board; b.innerHTML = '';
    function add(cls, x, y, w, h, html) {
      var e = document.createElement('div'); e.className = cls;
      e.style.left = (x / BOARD.w * 100) + '%'; e.style.top = (y / BOARD.h * 100) + '%';
      e.style.width = (w / BOARD.w * 100) + '%'; e.style.height = (h / BOARD.h * 100) + '%';
      if (html) e.innerHTML = html;
      b.appendChild(e); return e;
    }
    S.layout.add = add;
    // 역: 출발·도착 칸의 뒤쪽(위)에, 레일이 역 앞을 지나가도록
    [['start', m.from], ['goal', m.to]].forEach(function (p) {
      var w = 1.5 * s, h = w * 327 / 420, cx = ox + (p[1][0] + 0.5) * s, cy = oy + (p[1][1] + 0.5) * s;
      var st = add('cs-station', cx - w / 2, cy - 0.08 * s - h, w, h,
        '<img alt="" src="assets/coaster/station-' + p[0] + '.png"><span class="cs-sign">' + (p[0] === 'start' ? '출발' : '도착') + '</span>');
      st.setAttribute('aria-label', p[0] === 'start' ? '출발역' : '도착역');
    });
    m.rails.forEach(function (t) {
      add('cs-rail', ox + (t[0] - 0.125) * s, oy + (t[1] - 0.125) * s, 1.25 * s, 1.25 * s, '<img alt="" src="assets/coaster/rail-' + t[2] + '.png">');
    });
    S.markers = {};
    m.rails.forEach(function (t) {
      var r = 0.17 * s, cx = ox + (t[0] + 0.5) * s, cy = oy + (t[1] + 0.5) * s;
      var isS = t[0] === m.from[0] && t[1] === m.from[1], isG = t[0] === m.to[0] && t[1] === m.to[1];
      S.markers[t[0] + ',' + t[1]] = add('cs-mark' + (isS ? ' is-start' : '') + (isG ? ' is-goal' : ''), cx - r, cy - r, 2 * r, 2 * r);
    });
    S.signalEls = {};
    (m.signals || []).forEach(function (cell) {
      var w = 0.34 * s, h = 0.62 * s, x = ox + cell[0] * s - w * 0.15, y = oy + cell[1] * s - h + 0.12 * s;
      S.signalEls[cell[0] + ',' + cell[1]] = add('cs-signal', x, y, w, h);
    });
    S.cartEl = add('cs-cart', 0, 0, 0, 0, '<img alt="열차">');
  }
  function placeCart(c, r, dir) {
    var s = S.layout.s, ox = S.layout.ox, oy = S.layout.oy;
    var side = dir === 'E' || dir === 'W';
    var w = side ? 0.92 * s : 0.62 * s, h = side ? w * 193 / 300 : w * 244 / 220;
    var cx = ox + (c + 0.5) * s, bottom = oy + (r + 0.5) * s + (side ? 0.16 : 0.3) * s;
    var e = S.cartEl;
    e.style.left = ((cx - w / 2) / BOARD.w * 100) + '%'; e.style.top = ((bottom - h) / BOARD.h * 100) + '%';
    e.style.width = (w / BOARD.w * 100) + '%'; e.style.height = (h / BOARD.h * 100) + '%';
    var img = e.firstChild, src = 'assets/coaster/' + CART[dir] + '.png';
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    e.setAttribute('aria-label', '열차: ' + (c + 1) + '번째 칸, ' + DIR_KO[dir] + ' 방향');
  }
  function markCurrent(c, r) {
    for (var k in S.markers) S.markers[k].classList.toggle('is-here', k === c + ',' + r);
  }
  function drawSignals() {
    for (var k in S.signalEls) {
      var red = S.signals[k] === 'red', e = S.signalEls[k];
      e.className = 'cs-signal ' + (red ? 'red' : 'green');
      e.innerHTML = '<svg viewBox="0 0 34 62" aria-hidden="true"><rect x="13" y="30" width="8" height="32" rx="3" fill="#6b5a4a"/>' +
        '<rect x="3" y="2" width="28" height="34" rx="9" fill="#2f3542" stroke="#e2b357" stroke-width="2.5"/>' +
        '<circle cx="17" cy="12" r="6.5" fill="' + (red ? '#ff4d4d' : '#55333a') + '"/>' +
        '<circle cx="17" cy="27" r="6.5" fill="' + (red ? '#2f4a3a' : '#3ddc84') + '"/></svg>' +
        '<span class="cs-signal-label">' + (red ? '빨강·멈춤' : '초록·통과') + '</span>';
      e.setAttribute('aria-label', '신호 ' + (red ? '빨강, 멈춰야 해요' : '초록, 지나가도 돼요'));
    }
  }

  // ---------- 명령 버튼·목록 ----------
  function renderCommands() {
    ui.cmds.innerHTML = '';
    S.mission.blocks.forEach(function (t) {
      var bt = document.createElement('button');
      bt.type = 'button'; bt.className = 'cs-cmd'; bt.dataset.type = t;
      bt.innerHTML = '<span class="cs-cmd-icon" aria-hidden="true">' + BLOCK[t].icon + '</span>' + BLOCK[t].label;
      bt.setAttribute('aria-label', BLOCK[t].label + ' 명령 넣기');
      bt.addEventListener('click', function () { addBlock(t); });
      ui.cmds.appendChild(bt);
    });
    var lim = document.createElement('span'); lim.className = 'cs-limit'; lim.id = 'csLimit'; ui.cmds.appendChild(lim);
  }
  function container(path) {
    if (path === 'main') return S.program;
    var p = path.split('.'), b = findBlock(S.program, p[0]);
    return b ? b[p[1]] : S.program;
  }
  function findBlock(list, id) {
    for (var i = 0; i < list.length; i++) {
      var b = list[i]; if (b.id === id) return b;
      var f = findBlock(b.body || [], id) || findBlock(b.then || [], id) || findBlock(b.else || [], id);
      if (f) return f;
    }
    return null;
  }
  function parentOf(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list;
      var b = list[i], f = parentOf(b.body || [], id) || parentOf(b.then || [], id) || parentOf(b.else || [], id);
      if (f) return f;
    }
    return null;
  }
  function editable() { return S.mode !== 'running' && !S.animating; }
  function edited() {
    // 한 단계씩 실행한 뒤 고치면 열차·실행 순서를 출발 상태로
    if (S.run || S.mode === 'done') resetTrain('명령을 바꿨어요. 열차를 출발역으로 돌려놨어요.');
    renderList(); rememberProgram();
  }
  function addBlock(t) {
    if (!editable()) return;
    var m = S.mission;
    if (m.limit && LG.countBlocks(S.program) >= m.limit) { setStatus('info', '블록이 가득 찼어요. 반복 블록으로 줄여 볼까요?'); return; }
    var b = LG.withIds([{ type: t, n: 2, body: [], then: [], else: [] }])[0];
    container(S.target).push(b);
    if (t === 'repeat') S.target = b.id + '.body';
    if (t === 'if') S.target = b.id + '.then';
    edited();
    var el = ui.list.querySelector('[data-id="' + b.id + '"]'); if (el) el.scrollIntoView({ block: 'nearest' });
  }
  function moveBlock(id, d) {
    var list = parentOf(S.program, id), i = list.findIndex(function (b) { return b.id === id; }), j = i + d;
    if (j < 0 || j >= list.length) return;
    var t = list[i]; list[i] = list[j]; list[j] = t;
    edited();
    var bt = ui.list.querySelector('[data-id="' + id + '"] .cs-' + (d < 0 ? 'up' : 'down')); if (bt && !bt.disabled) bt.focus();
  }
  function deleteBlock(id) {
    var list = parentOf(S.program, id), i = list.findIndex(function (b) { return b.id === id; });
    list.splice(i, 1);
    if (S.target.indexOf(id) === 0 || !targetExists()) S.target = 'main';
    edited();
  }
  function targetExists() { return S.target === 'main' || !!findBlock(S.program, S.target.split('.')[0]); }
  function renderList() {
    var box = ui.list; box.innerHTML = '';
    var count = LG.countBlocks(S.program), lim = $('csLimit');
    if (lim) lim.textContent = S.mission.limit ? '블록 ' + count + ' / ' + S.mission.limit + '개' : '';
    if (!S.program.length) {
      var e = document.createElement('p'); e.className = 'cs-empty';
      e.textContent = '아직 명령이 없어요. 아래 명령 버튼을 누르면 여기에 차례대로 쌓여요.';
      box.appendChild(e);
    }
    box.appendChild(renderContainer(S.program, 'main', 0));
    Object.keys(S.marks || {}).forEach(applyMark);
    var full = S.mission.limit && count >= S.mission.limit;
    Array.prototype.forEach.call(ui.cmds.querySelectorAll('.cs-cmd'), function (bt) { bt.disabled = !editable() || full; });
    ui.clear.disabled = !S.program.length; // 실행 중에도 눌러서 멈추고 비울 수 있음
  }
  function renderContainer(list, path, depth) {
    var ol = document.createElement('ol'); ol.className = 'cs-blocks' + (depth ? ' nested' : '');
    var nested = path !== 'main';
    if (nested || hasNesting()) {
      var tgt = document.createElement('button');
      tgt.type = 'button'; tgt.className = 'cs-target' + (S.target === path ? ' on' : '');
      tgt.textContent = S.target === path ? '✔ 새 명령이 여기에 들어가요' : '여기에 넣기';
      tgt.setAttribute('aria-pressed', S.target === path ? 'true' : 'false');
      tgt.setAttribute('aria-label', (nested ? '이 블록 안에' : '맨 바깥 목록에') + ' 새 명령 넣기');
      tgt.disabled = !editable();
      tgt.addEventListener('click', function () { S.target = path; renderList(); });
      ol.appendChild(tgt);
    }
    list.forEach(function (b, i) {
      var li = document.createElement('li'); li.className = 'cs-block t-' + b.type; li.dataset.id = b.id;
      var row = document.createElement('div'); row.className = 'cs-row';
      var name = '<span class="cs-no">' + (i + 1) + '</span><span class="cs-icon" aria-hidden="true">' + BLOCK[b.type].icon + '</span>';
      if (b.type === 'repeat') {
        row.innerHTML = name + '<span class="cs-label">반복</span>' +
          '<button type="button" class="cs-mini cs-minus" aria-label="반복 횟수 줄이기">−</button>' +
          '<span class="cs-count" aria-live="polite">' + b.n + '번</span>' +
          '<button type="button" class="cs-mini cs-plus" aria-label="반복 횟수 늘리기">+</button>';
      } else {
        row.innerHTML = name + '<span class="cs-label">' + BLOCK[b.type].label + '</span>';
      }
      row.insertAdjacentHTML('beforeend', '<span class="cs-state"></span><span class="cs-ctrls">' +
        '<button type="button" class="cs-mini cs-up" aria-label="' + (i + 1) + '번째 ' + BLOCK[b.type].label + ' 위로 옮기기"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
        '<button type="button" class="cs-mini cs-down" aria-label="' + (i + 1) + '번째 ' + BLOCK[b.type].label + ' 아래로 옮기기"' + (i === list.length - 1 ? ' disabled' : '') + '>▼</button>' +
        '<button type="button" class="cs-mini cs-del" aria-label="' + (i + 1) + '번째 ' + BLOCK[b.type].label + ' 지우기">✕</button></span>');
      li.appendChild(row);
      if (b.type === 'repeat') li.appendChild(renderContainer(b.body, b.id + '.body', depth + 1));
      if (b.type === 'if') {
        li.appendChild(renderContainer(b.then, b.id + '.then', depth + 1));
        var els = document.createElement('div'); els.className = 'cs-else'; els.textContent = '아니면 (빨강이면)';
        li.appendChild(els);
        li.appendChild(renderContainer(b.else, b.id + '.else', depth + 1));
      }
      row.querySelector('.cs-up').addEventListener('click', function () { if (editable()) moveBlock(b.id, -1); });
      row.querySelector('.cs-down').addEventListener('click', function () { if (editable()) moveBlock(b.id, 1); });
      row.querySelector('.cs-del').addEventListener('click', function () { if (editable()) deleteBlock(b.id); });
      if (b.type === 'repeat') {
        row.querySelector('.cs-minus').addEventListener('click', function () { if (editable() && b.n > 2) { b.n--; edited(); } });
        row.querySelector('.cs-plus').addEventListener('click', function () { if (editable() && b.n < 9) { b.n++; edited(); } });
      }
      Array.prototype.forEach.call(row.querySelectorAll('button'), function (x) { if (!editable()) x.disabled = true; });
      ol.appendChild(li);
    });
    return ol;
  }
  function hasNesting() { return S.mission.blocks.indexOf('repeat') >= 0 || S.mission.blocks.indexOf('if') >= 0; }
  function blockEl(id) { return ui.list.querySelector('[data-id="' + id + '"]'); }
  // 블록 표시 상태(실행 중·완료·멈춤·사용 안 함)는 S.marks에 기억해 목록을 다시 그려도 남게 함
  function applyMark(id) {
    var el = blockEl(id), mk = S.marks[id]; if (!el) return;
    el.classList.remove('running', 'done', 'unused', 'stopped');
    var s = el.querySelector(':scope > .cs-row .cs-state'); if (s) s.textContent = mk ? mk.text : '';
    if (mk) Object.keys(mk.cls).forEach(function (c) { el.classList.add(c); });
  }
  function setBlockState(id, cls, text) {
    var mk = S.marks[id] || (S.marks[id] = { cls: {}, text: '' });
    mk.cls[cls] = true; if (text) mk.text = text;
    applyMark(id);
  }
  function clearBlockStates() {
    S.marks = {};
    Array.prototype.forEach.call(ui.list.querySelectorAll('.cs-block'), function (el) { applyMark(el.dataset.id); });
  }
  function settleRunning(cls, text) {
    Object.keys(S.marks).forEach(function (id) {
      var mk = S.marks[id]; if (!mk.cls.running) return;
      delete mk.cls.running; mk.cls[cls] = true;
      if (text !== undefined) mk.text = text; else if (mk.text === '▶ 실행 중') mk.text = '';
      applyMark(id);
    });
  }
  function markRunning(id) {
    settleRunning('done');
    setBlockState(id, 'running', '▶ 실행 중');
    var el = blockEl(id); if (el) el.scrollIntoView({ block: 'nearest' });
  }

  // ---------- 상태 문구 ----------
  function setStatus(kind, text) {
    ui.status.className = 'cs-status ' + kind;
    var icon = { info: 'ℹ', ok: '★', warn: '!', run: '▶' }[kind] || '';
    ui.status.innerHTML = (icon ? '<span class="cs-sicon" aria-hidden="true">' + icon + '</span>' : '') + '<span></span>';
    ui.status.lastChild.textContent = text;
  }
  function updateTickets() {
    var t = save().tickets || 0;
    ui.tickets.textContent = '티켓 ' + t + '장';
  }

  // ---------- 실행 ----------
  function resetTrain(msg) {
    cancelRun();
    var m = S.mission;
    S.signals = LG.randomSignals(m);
    S.cart = { c: m.from[0], r: m.from[1], dir: m.dir };
    placeCart(S.cart.c, S.cart.r, S.cart.dir); markCurrent(S.cart.c, S.cart.r); drawSignals();
    clearBlockStates();
    S.mode = 'idle';
    if (msg) setStatus('info', msg);
    lockUI(false);
  }
  function cancelRun() {
    S.token++; S.run = null; S.animating = false;
    if (S.raf) cancelAnimationFrame(S.raf);
    clearTimeout(S.timer);
  }
  function lockUI(running) {
    ui.root.classList.toggle('is-running', !!running);
    ui.run.disabled = !!running; ui.step.disabled = !!running;
    ui.prev.disabled = running || S.idx === 0;
    ui.next.disabled = running || S.idx >= S.list.length - 1 || !unlocked(S.idx + 1);
    renderList();
  }
  function ensureRun() {
    if (!S.run || S.mode === 'done') {
      resetTrain();
      S.run = LG.makeRun(S.mission, S.program, S.signals);
    }
  }
  function runAll() {
    if (S.mode === 'running' || S.animating) return;      // 연타 방지
    if (!S.program.length) { setStatus('warn', '아직 명령이 없어요. 아래 명령 버튼을 눌러 명령을 넣어 보세요!'); return; }
    resetTrain();                                           // 출발 상태에서 처음부터
    S.run = LG.makeRun(S.mission, S.program, S.signals);
    S.mode = 'running'; lockUI(true);
    setStatus('run', '실행 중이에요…');
    var tk = S.token;
    (function loop() {
      if (tk !== S.token) return;
      var ev = S.run.gen.next();
      if (ev.done) return;
      play(ev.value, tk).then(function (fin) { if (tk === S.token && !fin) S.timer = setTimeout(loop, 160); });
    })();
  }
  function stepOnce() {
    if (S.mode === 'running' || S.animating) return;
    if (!S.program.length) { setStatus('warn', '아직 명령이 없어요. 아래 명령 버튼을 눌러 명령을 넣어 보세요!'); return; }
    ensureRun();
    S.mode = 'stepping';
    var tk = S.token;
    S.animating = true; lockUI(false); renderList();
    (function next() {
      if (tk !== S.token) return;
      var ev = S.run.gen.next();
      if (ev.done) { S.animating = false; renderList(); return; }
      var t = ev.value.type;
      play(ev.value, tk).then(function (fin) {
        if (tk !== S.token) return;
        // 반복·만약 확인은 따로 멈추지 않고 다음 실제 명령까지 진행
        if (!fin && (t === 'repeat' || t === 'check')) { next(); return; }
        S.animating = false; renderList();
        if (!fin) setStatus('run', '한 단계씩: ' + describe(ev.value) + ' 다음 명령은 [한 단계씩]을 또 눌러요.');
      });
    })();
  }
  function describe(ev) {
    if (ev.type === 'move') return '앞으로 한 칸 갔어요.';
    if (ev.type === 'turn') return DIR_KO[ev.dir] + '을 보도록 돌았어요.';
    if (ev.type === 'wait') return '기다렸더니 신호가 초록으로 바뀌었어요.';
    return '';
  }
  function play(ev, tk) {
    return new Promise(function (resolve) {
      var t = ev.type;
      if (ev.block) markRunning(ev.block);
      if (t === 'move') {
        S.cart.c = ev.to[0]; S.cart.r = ev.to[1];
        animateMove(ev.from, ev.to, ev.dir, 560, tk, function () { markCurrent(ev.to[0], ev.to[1]); resolve(false); });
      } else if (t === 'turn') {
        S.cart.dir = ev.dir; placeCart(S.cart.c, S.cart.r, ev.dir);
        S.cartEl.classList.remove('turning'); void S.cartEl.offsetWidth; S.cartEl.classList.add('turning');
        S.timer = setTimeout(function () { resolve(false); }, 420);
      } else if (t === 'wait') {
        setStatus('run', '빨간 신호에서 기다리는 중…');
        S.timer = setTimeout(function () { if (tk !== S.token) return; S.signals[ev.cell] = 'green'; drawSignals(); resolve(false); }, 700);
      } else if (t === 'check') {
        setBlockState(ev.block, 'running', ev.value ? '신호 초록 → 위쪽' : '신호 빨강 → 아니면');
        S.timer = setTimeout(function () { resolve(false); }, 450);
      } else if (t === 'repeat') {
        setBlockState(ev.block, 'running', ev.round + ' / ' + ev.total + '번째');
        S.timer = setTimeout(function () { resolve(false); }, 220);
      } else {
        finish(ev); resolve(true);
      }
    });
  }
  function animateMove(from, to, dir, ms, tk, done) {
    var t0 = performance.now();
    (function frame(now) {
      if (tk !== S.token) return;
      var k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      placeCart(from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e, dir);
      if (k < 1) S.raf = requestAnimationFrame(frame); else done();
    })(t0);
  }
  function finish(ev) {
    S.mode = 'done'; S.animating = false;
    var st = S.run ? S.run.state : { executed: {} };
    // 실행하지 않은 명령 표시
    (function mark(list) {
      list.forEach(function (b) {
        if (!st.executed[b.id]) setBlockState(b.id, 'unused', '사용하지 않은 명령');
        mark(b.body || []); mark(b.then || []); mark(b.else || []);
      });
    })(S.program);
    settleRunning(ev.type === 'success' ? 'done' : 'stopped', ev.type === 'success' ? '✔ 도착!' : '■ 여기서 멈춤');
    lockUI(false);
    if (ev.type === 'success') return succeed();
    var m = S.mission, dist = LG.distance(m, S.cart.c, S.cart.r);
    if (ev.type === 'blocked' && ev.reason === 'norail') {
      setStatus('warn', DIR_KO[S.cart.dir] + '으로는 레일이 없어서 멈췄어요. 모퉁이에서는 돌기 명령으로 방향을 바꿔요. 명령은 그대로 있으니 고쳐서 다시 해 봐요!');
    } else if (ev.type === 'blocked' && ev.reason === 'red') {
      setStatus('warn', '빨간 신호라서 멈췄어요. 빨강일 때는 기다리기를 한 다음 가요!');
    } else if (ev.type === 'blocked' && ev.reason === 'nowait') {
      setStatus('warn', '지금은 초록 신호라 기다리지 않아도 돼요. 신호 색에 따라 다르게 해 볼까요?');
    } else {
      var msg = dist === 1 ? '한 칸 더 가면 도착해요!' : dist > 1 ? dist + '칸 더 가면 도착해요!' : '도착역까지 가는 길을 다시 살펴봐요.';
      setStatus('warn', msg + ' 명령을 더 넣고 다시 실행해 봐요.');
    }
  }
  function succeed() {
    var m = S.mission, first = false, stamp = false, seq = S.list;
    var saved = patchCoaster(function (c) {
      c.done[m.id] = true;
      var extra = {};
      if (!c.rewarded[m.id]) { c.rewarded[m.id] = true; first = true; extra.tickets = (save().tickets || 0) + (m.reward || 0); }
      var courseIds = M.courses[S.course].missions.map(function (x) { return x.id; });
      if (courseIds.length >= M.stampAfter && courseIds.every(function (id) { return c.done[id]; }) && !c.stamps[S.course]) { c.stamps[S.course] = true; stamp = true; }
      return extra;
    });
    updateTickets();
    setStatus('ok', '도착했어요!');
    var nextIdx = S.idx + 1, hasNext = nextIdx < seq.length;
    ui.successMsg.textContent = first ? '티켓 ' + m.reward + '장을 받았어요!' : '다시 성공했어요! (보상은 처음 한 번만 받아요)';
    ui.successStamp.hidden = !stamp;
    ui.successSave.hidden = saved;
    ui.successNext.hidden = !hasNext;
    if (hasNext) ui.successNext.textContent = m.id.indexOf('common') === 0 ? M.courses[S.course].label + '으로 가요' : '다음 미션';
    ui.success.hidden = false;
    ui.next.disabled = !hasNext;
    (hasNext ? ui.successNext : ui.successAgain).focus();
  }

  // ---------- 시작 ----------
  function init() {
    ui.root = $('coaster'); if (!ui.root) return;
    ['course', 'tickets', 'mission', 'missionNo', 'prev', 'next', 'exit', 'guide', 'board', 'status', 'cmds', 'list', 'clear', 'step', 'reset', 'run',
      'success', 'successMsg', 'successStamp', 'successSave', 'successNext', 'successAgain', 'successPark'].forEach(function (k) {
      ui[k] = $('cs' + k.charAt(0).toUpperCase() + k.slice(1));
    });
    ui.exit.addEventListener('click', close);
    ui.run.addEventListener('click', runAll);
    ui.step.addEventListener('click', stepOnce);
    ui.reset.addEventListener('click', function () { resetTrain('열차를 출발역으로 돌려놨어요. 명령은 그대로 있어요.'); });
    ui.clear.addEventListener('click', function () {
      S.program.length = 0; S.target = 'main';
      resetTrain('명령을 모두 지웠어요.'); renderList(); rememberProgram();
    });
    ui.prev.addEventListener('click', function () { if (S.idx > 0) loadMission(S.idx - 1); });
    ui.next.addEventListener('click', function () { if (unlocked(S.idx + 1)) loadMission(S.idx + 1); });
    ui.successNext.addEventListener('click', function () { loadMission(S.idx + 1); });
    ui.successAgain.addEventListener('click', function () { ui.success.hidden = true; resetTrain('다시 도전! 명령은 그대로 있어요.'); });
    ui.successPark.addEventListener('click', close);
  }
  window.MPCoaster = { open: open, close: close, init: init, _state: S };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
