/*
 * 구름동산 화면 (지도 위 '구름동산' 건물 = 시설 id mypark)
 * ------------------------------------------------------------
 * 내 공원: 산책 모드(기본) ↔ 꾸미기 모드(격자·아이템 패널·이동·회전·회수·실행 취소/다시 실행), 보관함, 친구 공원 목록
 * 친구 공원: 친구가 마지막으로 저장한 공원을 읽기 전용으로 산책 · 별 남기기(한 번, 다시 누르면 취소) · 감정 표현
 *
 * 그리기 순서: 1 고정 배경(지도) → 2 바닥 산책로 → (꾸미기: 격자) → 3·4 Y축 정렬 아이템과 캐릭터 → 5 한옥 입구 전경 → 6 UI(HTML)
 *   지도와 산책로는 화면 밖 캔버스(2배 해상도)에 한 번만 그려 두고, 공원이 바뀔 때만 다시 그림
 * 좌표: 모두 공원 월드 좌표(1448×1086). 화면 크기·확대와 상관없이 같은 값으로 저장
 *
 * 저장
 *   - 혼자 둘러보기: 이 기기 기록(makepark.save.v1 / 연습 칸)의 cloudpark
 *   - 반 공원: 반 기록(save.cloudpark — 선생님 화면 학생 기록과 함께) + 친구가 읽는 rooms/{반}/parks/{나}·parkinfo/{나}
 *   바꿀 때마다(놓기·옮기기·회수·회전) 0.7초 뒤 자동 저장, '꾸미기 완료'에서 바로 저장하고 결과 확인. 실패하면 알리고 '다시 저장'
 * 데이터 규칙은 js/cloudpark/logic.js, 아이템은 js/cloudpark/items.js, 서버 연결은 js/net/net.js(MPNet.shared)
 */
(function () {
  'use strict';
  var D = window.MP_CLOUD_ITEMS, L = window.MP_CLOUD, M = window.MP_CLOUD_MASK;
  if (!D || !L || !M) return;
  var W = D.WORLD.w, H = D.WORLD.h, BASE = D.BASE, RES = 2;   // 바닥 캐시 해상도(월드 1px = 2px)
  var INTRO = '나만의 구름동산을 꾸며 보세요!\n꾸미기 버튼을 눌러 나무와 꽃, 한옥을 배치하고\n친구들의 공원에도 놀러 갈 수 있어요.';
  var EMOTES = [{ i: 5, e: '👋', n: '손 흔들기' }, { i: 1, e: '👍', n: '최고' }, { i: 2, e: '❤️', n: '하트' }, { i: 0, e: '😀', n: '웃음' }, { i: 3, e: '😂', n: '깔깔' }, { i: 4, e: '😮', n: '놀람' }];
  // 앉기: 지금 캐릭터 그림에는 앉은 모습이 없음 → 벤치 옆 '앉기' 버튼은 앉은 그림이 생기면 켬(걷기 그림을 비틀어 만들지 않음)
  var SIT_READY = false;

  var S = {
    open: false, mode: 'walk', visit: null, park: L.emptyPark(''), idx: null, sorted: [], blockers: [],
    me: { x: D.SPAWN.x, y: D.SPAWN.y, dir: 'down', moving: false }, keys: {}, route: null,
    cam: { cx: W / 2, cy: H / 2, s: 1 }, zoom: 1, panned: false, view: { w: 0, h: 0, dpr: 1 },
    tool: null, sel: null, drag: null, hover: null, history: [], future: [], stroke: null,
    save: { state: 'saved', timer: 0, tries: 0 }, emote: null, raf: 0, last: 0, floorDirty: true, nearExit: false, nearBench: null,
    pointers: {}, pinch: null
  };
  var ui = {}, imgs = {}, floor = null, gridCv = null, walker = null, walkerKey = '';
  function api() { return window.MP_API; }
  function net() { return window.MPNet; }
  function cls() { return window.MPMulti && MPMulti.me ? MPMulti.me() : null; }   // 반 공원 { code, key, teacher } | null
  function el(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }
  function btn(c, html, fn, label) {
    var b = el('button', c); b.type = 'button'; b.innerHTML = html;
    if (label) b.setAttribute('aria-label', label);
    if (fn) b.addEventListener('click', function (e) { e.stopPropagation(); fn(e); });
    return b;
  }
  function toast(t) { if (api() && api().toast) api().toast(t); }
  function save() { return (api() && api().readSave()) || {}; }
  function profile() { return api() ? api().profile() : { nickname: '나', grade: 1 }; }
  function myChar() { var p = api() && api().player ? api().player() : {}; return { id: p.charId || 'F1', gender: p.gender || 'boy', teacher: !!p.teacher }; }
  function defaultName(nick) { return (nick || '나') + '의 구름동산'; }

  // ---------- 그림 불러오기(한 번만, 캐시) ----------
  function image(name) {
    var e = imgs[name];
    if (e) return e;
    e = imgs[name] = new Image();
    e.decoding = 'async';
    e.onload = function () { S.floorDirty = true; };
    e.src = BASE + name + '.webp';
    return e;
  }
  function ready(im) { return im && im.complete && im.naturalWidth > 0; }
  function preload() {
    image('map'); image(D.GATE.img);
    Object.keys(D.IMG).forEach(image);
  }

  // ---------- 화면 만들기 ----------
  function build() {
    ui.root = document.getElementById('cloudpark');
    ui.canvas = el('canvas', 'cp-canvas');
    ui.canvas.setAttribute('aria-label', '구름동산. 방향키나 화면을 눌러 걸어요');
    ui.canvas.tabIndex = -1;
    ui.root.appendChild(ui.canvas);

    // 왼쪽 위: 구름동산 · 내 캐릭터 · 공원 이름
    var head = ui.head = el('div', 'cp-head');
    head.appendChild(el('p', 'cp-brand', '구름동산'));
    var who = el('div', 'cp-who');
    ui.face = el('canvas', 'cp-face'); ui.face.width = 96; ui.face.height = 96; who.appendChild(ui.face);
    var txt = el('div', 'cp-who-text');
    ui.nick = el('p', 'cp-nick'); txt.appendChild(ui.nick);
    ui.parkName = btn('cp-parkname', '', function () { if (!S.visit) openRename(); }, '공원 이름 바꾸기');
    txt.appendChild(ui.parkName);
    who.appendChild(txt); head.appendChild(who);
    ui.root.appendChild(head);

    // 오른쪽 위: 별마당 돌아가기 / 내 공원 돌아가기
    ui.home = btn('cp-home', '', function () { if (S.visit) backToMine(); else close(); });
    ui.root.appendChild(ui.home);

    // 확대·축소
    var zoom = ui.zoomBar = el('div', 'cp-zoom');
    zoom.appendChild(btn('cp-zbtn', '＋', function () { zoomBy(1.25); }, '확대'));
    zoom.appendChild(btn('cp-zbtn', '－', function () { zoomBy(0.8); }, '축소'));
    zoom.appendChild(btn('cp-zbtn cp-zfit', '전체', function () { S.zoom = fitZoom(); S.panned = S.mode === 'edit'; }, '공원 전체 보기'));
    ui.root.appendChild(zoom);

    // 저장 상태
    ui.saveChip = btn('cp-save', '', function () { if (S.save.state === 'error') flushSave(true); });
    ui.saveChip.hidden = true; ui.root.appendChild(ui.saveChip);

    // 아래 메뉴(산책 모드)
    var menu = ui.menu = el('nav', 'cp-menu');
    ui.mDeco = btn('cp-mbtn', '<span class="cp-ico">🪴</span><span>꾸미기</span>', function () { setMode('edit'); });
    ui.mBox = btn('cp-mbtn', '<span class="cp-ico">🧺</span><span>보관함</span>', function () { openStorage(); });
    ui.mFriends = btn('cp-mbtn', '<span class="cp-ico">🏡</span><span>친구 공원</span>', function () { openFriends(); });
    ui.mVisitors = btn('cp-mbtn cp-mbtn-small', '<span class="cp-ico">📜</span><span>방문 기록</span>', function () { openVisitors(); });
    [ui.mDeco, ui.mBox, ui.mFriends, ui.mVisitors].forEach(function (b) { menu.appendChild(b); });
    ui.root.appendChild(menu);

    // 친구 공원: 별 남기기 + 감정 표현
    var vbar = ui.visitBar = el('nav', 'cp-visitbar'); vbar.hidden = true;
    ui.star = btn('cp-star', '', function () { toggleStar(); });
    vbar.appendChild(ui.star);
    var emo = el('div', 'cp-emotes'); emo.setAttribute('role', 'group'); emo.setAttribute('aria-label', '감정 표현');
    EMOTES.forEach(function (m) { emo.appendChild(btn('cp-emote', m.e, function () { showEmote(m.e); }, m.n)); });
    vbar.appendChild(emo);
    ui.root.appendChild(vbar);
    // 내 공원 산책 중에도 감정 표현(작게)
    ui.myEmotes = el('div', 'cp-emotes cp-emotes-mine');
    EMOTES.slice(0, 3).forEach(function (m) { ui.myEmotes.appendChild(btn('cp-emote', m.e, function () { showEmote(m.e); }, m.n)); });
    ui.root.appendChild(ui.myEmotes);

    // 꾸미기 모드: 위 도구 줄 + 아래 아이템 패널 + 고른 아이템 작은 줄
    var tools = ui.tools = el('div', 'cp-tools'); tools.hidden = true;
    ui.undo = btn('cp-tbtn', '<span class="cp-ico">↶</span><span>실행 취소</span>', undo);
    ui.redo = btn('cp-tbtn', '<span class="cp-ico">↷</span><span>다시 실행</span>', redo);
    ui.done = btn('cp-tbtn cp-done', '<span class="cp-ico">✓</span><span>꾸미기 완료</span>', function () { finishEdit(); });
    [ui.undo, ui.redo, ui.done].forEach(function (b) { tools.appendChild(b); });
    ui.root.appendChild(tools);

    ui.hint = el('p', 'cp-hint'); ui.hint.hidden = true; ui.root.appendChild(ui.hint);

    var panel = ui.panel = el('div', 'cp-panel'); panel.hidden = true;
    ui.tabs = el('div', 'cp-tabs'); ui.tabs.setAttribute('role', 'tablist');
    ui.tabBtns = {};
    D.CATS.forEach(function (c) {
      var b = btn('cp-tab', c.name, function () { showCat(c.id); });
      b.setAttribute('role', 'tab'); ui.tabBtns[c.id] = b; ui.tabs.appendChild(b);
    });
    panel.appendChild(ui.tabs);
    ui.cards = el('div', 'cp-cards'); panel.appendChild(ui.cards);
    ui.root.appendChild(panel);

    var sb = ui.selBar = el('div', 'cp-selbar'); sb.hidden = true;
    ui.selName = el('p', 'cp-selname'); sb.appendChild(ui.selName);
    ui.sRotate = btn('cp-sbtn', '<span class="cp-ico">⟳</span><span>방향 바꾸기</span>', function () { rotateSel(); });
    ui.sMove = btn('cp-sbtn', '<span class="cp-ico">✥</span><span>옮기기</span>', function () { setHint('아이템을 꾹 누른 채 끌어서 옮겨요'); });
    ui.sStore = btn('cp-sbtn', '<span class="cp-ico">🧺</span><span>보관함으로</span>', function () { recallSel(); });
    ui.sClose = btn('cp-sbtn cp-sbtn-x', '<span class="cp-ico">✕</span><span>닫기</span>', function () { select(null); });
    [ui.sRotate, ui.sMove, ui.sStore, ui.sClose].forEach(function (b) { sb.appendChild(b); });
    ui.root.appendChild(sb);

    // 산책: 입구에서 나가기 · 벤치(앉기 준비 중)
    ui.leave = btn('cp-prompt', '별마당으로 나가기 <kbd>스페이스</kbd>', function () { exitByGate(); });
    ui.leave.hidden = true; ui.root.appendChild(ui.leave);

    // 창
    ui.modal = el('div', 'cp-modal'); ui.modal.hidden = true;
    ui.card = el('div', 'cp-card'); ui.card.setAttribute('role', 'dialog'); ui.card.setAttribute('aria-modal', 'true');
    ui.modal.appendChild(ui.card);
    ui.modal.addEventListener('pointerdown', function (e) { if (e.target === ui.modal && !S.modalLocked) closeModal(); });
    ui.root.appendChild(ui.modal);

    ui.loading = el('p', 'cp-loading', '공원을 불러오는 중…'); ui.loading.hidden = true; ui.root.appendChild(ui.loading);
  }

  // ---------- 열기·닫기 ----------
  function open() {
    if (!ui.root) return;
    S.open = true; ui.root.hidden = false;
    document.body.classList.add('cloudpark-open');
    preload();
    var c = cls();
    S.visit = null; S.mode = 'walk'; S.tool = null; S.sel = null; S.history = []; S.future = [];
    resize();
    S.last = performance.now();
    cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(loop);
    if (c && c.teacher) {   // 선생님: 내 공원 없이 학생 공원 목록부터
      S.park = L.emptyPark('학생 공원 둘러보기'); onParkChanged(true); spawn(); render(); openFriends(); return;
    }
    loadMine().then(function () {
      spawn(); render();
      var ux = save().cloudparkUi || {};
      if (!ux.intro) openIntro();
    });
  }
  function close() {
    if (!S.open) return;
    flushSave(false);
    S.open = false; cancelAnimationFrame(S.raf);
    closeModal(true);
    ui.root.hidden = true;
    document.body.classList.remove('cloudpark-open');
    if (api() && api().exitCloudPark) api().exitCloudPark();
  }
  function exitByGate() { close(); }

  // ---------- 내 공원 불러오기 ----------
  // 반 공원이면 서버(rooms/{반}/parks/{나})와 반 기록(save.cloudpark) 중 더 최근 것. 기존 데이터는 지우지 않음
  function loadMine() {
    var nick = profile().nickname, local = L.normalize(save().cloudpark, defaultName(nick)), c = cls();
    S.park = local.park;
    if (!S.park.name) S.park.name = defaultName(nick);
    onParkChanged(true);
    if (!(c && c.key && net())) return Promise.resolve();
    ui.loading.hidden = false;
    return net().shared.get(c.code, 'parks/' + c.key).then(function (srv) {
      ui.loading.hidden = true;
      if (srv && (srv.updated || 0) > (S.park.updated || 0)) {
        var n = L.normalize(srv, defaultName(nick));
        S.park = n.park; onParkChanged(true);
        api().patchSave({ cloudpark: L.clone(S.park) });
      } else if ((S.park.updated || 0) > ((srv && srv.updated) || 0) && L.count(S.park)) {
        scheduleSave(10);   // 이 기기에만 있던 최근 공원 → 친구들이 볼 수 있게 올림
      } else if (!srv) publishShare(L.clone(S.park));   // 친구 목록에 보이게(못 올려도 내 공원과는 상관없음)
    }, function (err) {
      ui.loading.hidden = true;
      // 내 공원은 반 기록(save.cloudpark)으로 이미 불러왔음. 친구 공개 칸을 못 읽은 것뿐이라 알리지 않음
      if (isDenied(err)) { S.shareOff = true; console.warn('구름동산 친구 공개 칸을 읽지 못했어요(규칙 게시 전)', err); return; }
      console.warn('구름동산 불러오기 실패', err);
      if (navigator.onLine === false) toast('인터넷이 끊겨 있어요. 이 기기에 저장된 공원을 보여 줘요.');
    });
  }

  function spawn() {
    S.me = { x: D.SPAWN.x, y: D.SPAWN.y, dir: 'up', moving: false };
    S.route = null; S.keys = {};
    S.zoom = 1; S.panned = false;
    snapCam();
  }

  // ---------- 공원이 바뀜: 색인·정렬 목록·막는 곳 다시 만들기 ----------
  function onParkChanged(full) {
    S.idx = L.index(S.park);
    S.blockers = L.blockers(S.park);
    var list = [];
    Object.keys(S.park.items).forEach(function (id) {
      var it = S.park.items[id], def = D.ITEMS[it.t];
      if (def.kind === 'path') return;
      list.push({ id: id, y: it.y, x: it.x, spr: D.sprite(def, it.d) });
    });
    list.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    S.sorted = list;
    S.floorDirty = true;
    buildWalkGrid();
    if (full) { S.sel = null; }
    updateHead();
    updateUndo();
  }

  // ---------- 걷기 칸(8px): 잔디이고 막는 사각형에 걸리지 않는 칸 ----------
  var GC = M.cell, GW = M.cols, GH = M.rows, FOOT = { hw: 6, hh: 3 };
  var walkGrid = new Uint8Array(GW * GH);
  function buildWalkGrid() {
    for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) walkGrid[y * GW + x] = M.walk[y].charCodeAt(x) === 49 ? 1 : 0;
    S.blockers.forEach(function (r) {
      var x0 = Math.max(0, Math.floor((r[0] - FOOT.hw) / GC)), x1 = Math.min(GW - 1, Math.floor((r[2] + FOOT.hw) / GC));
      var y0 = Math.max(0, Math.floor((r[1] - FOOT.hh) / GC)), y1 = Math.min(GH - 1, Math.floor((r[3] + FOOT.hh) / GC));
      for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) walkGrid[yy * GW + xx] = 0;
    });
  }
  // 발 사각형의 네 모서리가 걸을 수 있는 잔디이고, 어떤 아이템의 바닥 영역과도 겹치지 않으면 설 수 있음
  function standOk(x, y) {
    var c = [[x - FOOT.hw, y - FOOT.hh], [x + FOOT.hw, y - FOOT.hh], [x - FOOT.hw, y + FOOT.hh], [x + FOOT.hw, y + FOOT.hh]];
    for (var i = 0; i < 4; i++) if (!L.maskOk(M, M.walk, c[i][0], c[i][1])) return false;
    var f = [x - FOOT.hw, y - FOOT.hh, x + FOOT.hw, y + FOOT.hh];
    for (var b = 0; b < S.blockers.length; b++) if (L.hit(f, S.blockers[b])) return false;
    return true;
  }
  // A* 길 찾기(8방향, 걷기 칸 기준) → 월드 좌표 경유점 목록
  function findRoute(sx, sy, tx, ty) {
    var s = Math.floor(sy / GC) * GW + Math.floor(sx / GC), t = nearestCell(tx, ty);
    if (t < 0) return null;
    if (s === t) return [{ x: tx, y: ty }];
    var g = new Float32Array(GW * GH).fill(Infinity), from = new Int32Array(GW * GH).fill(-1), closed = new Uint8Array(GW * GH);
    var open = [s]; g[s] = 0;
    var tx0 = t % GW, ty0 = (t / GW) | 0;
    function h(i) { var dx = Math.abs(i % GW - tx0), dy = Math.abs(((i / GW) | 0) - ty0); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); }
    var fs = new Float32Array(GW * GH).fill(Infinity); fs[s] = h(s);
    var steps = 0;
    while (open.length && steps++ < 40000) {
      var bi = 0;
      for (var k = 1; k < open.length; k++) if (fs[open[k]] < fs[open[bi]]) bi = k;
      var cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (cur === t) break;
      closed[cur] = 1;
      var cx = cur % GW, cy = (cur / GW) | 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        var ni = ny * GW + nx;
        if (closed[ni] || !walkGrid[ni]) continue;
        if (dx && dy && (!walkGrid[cy * GW + nx] || !walkGrid[ny * GW + cx])) continue;   // 모서리 끼지 않기
        var ng = g[cur] + (dx && dy ? 1.414 : 1);
        if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; fs[ni] = ng + h(ni); if (open.indexOf(ni) < 0) open.push(ni); }
      }
    }
    if (from[t] < 0) return null;
    var pts = [], i2 = t;
    while (i2 !== s && i2 >= 0) { pts.push({ x: (i2 % GW) * GC + GC / 2, y: ((i2 / GW) | 0) * GC + GC / 2 }); i2 = from[i2]; }
    pts.reverse();
    if (walkGrid[nearestCell(tx, ty)] && standOk(tx, ty)) pts[pts.length - 1] = { x: tx, y: ty };
    return simplify(pts);
  }
  function nearestCell(x, y) {
    var cx = Math.floor(x / GC), cy = Math.floor(y / GC);
    for (var r = 0; r < 14; r++) {
      var best = -1, bd = 1e9;
      for (var yy = cy - r; yy <= cy + r; yy++) for (var xx = cx - r; xx <= cx + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= GW || yy >= GH || !walkGrid[yy * GW + xx]) continue;
        var d = (xx - cx) * (xx - cx) + (yy - cy) * (yy - cy);
        if (d < bd) { bd = d; best = yy * GW + xx; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  function simplify(p) {
    if (p.length < 3) return p;
    var out = [p[0]];
    for (var i = 1; i < p.length - 1; i++) {
      var a = out[out.length - 1], b = p[i + 1];
      if (!lineOk(a.x, a.y, b.x, b.y)) out.push(p[i]);
    }
    out.push(p[p.length - 1]);
    return out;
  }
  function lineOk(x0, y0, x1, y1) {
    var d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 4);
    for (var i = 1; i <= n; i++) { if (!standOk(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false; }
    return true;
  }

  // ---------- 걷기 ----------
  var KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  function step(dt) {
    var me = S.me, sp = ((api() && api().walkSpeed && api().walkSpeed()) || 170) * dt, dx = 0, dy = 0;
    if (S.mode === 'walk' && !S.modal) {
      if (S.keys.left) dx -= 1; if (S.keys.right) dx += 1; if (S.keys.up) dy -= 1; if (S.keys.down) dy += 1;
    }
    if (dx || dy) S.route = null;
    else if (S.route && S.route.length) {
      var tg = S.route[0], tx = tg.x - me.x, ty = tg.y - me.y, d = Math.hypot(tx, ty);
      if (d < 2.5) { S.route.shift(); if (!S.route.length) S.route = null; }
      else { dx = tx / d; dy = ty / d; if (d < sp) sp = d; }
    }
    var moved = false;
    if (dx || dy) {
      var n = Math.hypot(dx, dy); dx /= n; dy /= n;
      // 2px 씩 나눠 움직이고, 막히면 옆으로 미끄러짐
      var steps = Math.max(1, Math.ceil(sp / 2)), st = sp / steps;
      // 혹시 아이템 바닥 영역 안에 서 있게 됐으면(예전 저장값 등) 빠져나올 수 있게 잔디만 확인
      var ok = standOk(me.x, me.y) ? standOk : function (x, y) { return L.maskOk(M, M.walk, x, y); };
      for (var i = 0; i < steps; i++) {
        if (ok(me.x + dx * st, me.y + dy * st)) { me.x += dx * st; me.y += dy * st; moved = true; }
        else if (dx && ok(me.x + Math.sign(dx) * st, me.y)) { me.x += Math.sign(dx) * st; moved = true; }
        else if (dy && ok(me.x, me.y + Math.sign(dy) * st)) { me.y += Math.sign(dy) * st; moved = true; }
        else { if (S.route) S.route = null; break; }
      }
      me.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    }
    me.moving = moved;
    // 입구 앞에서 아래로 → 별마당으로 나가기(내 공원·친구 공원 모두. 친구 공원에서는 '내 공원 돌아가기')
    var nearExit = S.mode === 'walk' && Math.hypot(me.x - D.EXIT.x, me.y - D.EXIT.y) < D.EXIT.r;
    if (nearExit !== S.nearExit) {
      S.nearExit = nearExit; ui.leave.hidden = !nearExit;
      ui.leave.innerHTML = (S.visit ? '내 공원으로 돌아가기' : '별마당으로 나가기') + ' <kbd>스페이스</kbd>';
    }
    // 벤치 가까이(앉기 그림이 생기면 버튼을 보여 줄 자리)
    S.nearBench = SIT_READY && S.mode === 'walk' ? nearBench() : null;
  }
  function nearBench() {
    var best = null, bd = 46;
    Object.keys(S.park.items).forEach(function (id) {
      var it = S.park.items[id];
      if (!D.ITEMS[it.t].sit) return;
      var d = Math.hypot(it.x - S.me.x, it.y - S.me.y);
      if (d < bd) { bd = d; best = id; }
    });
    return best;
  }

  // ---------- 카메라 ----------
  function resize() {
    var r = ui.root.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
    S.view = { w: r.width || window.innerWidth, h: r.height || window.innerHeight, dpr: dpr };
    ui.canvas.width = Math.round(S.view.w * dpr); ui.canvas.height = Math.round(S.view.h * dpr);
    ui.canvas.style.width = S.view.w + 'px'; ui.canvas.style.height = S.view.h + 'px';
  }
  function fitScale() { return Math.min(S.view.w / W, S.view.h / H); }
  // 산책: 별마당 공원과 같은 배율(캐릭터가 같은 크기로 보임). 꾸미기: 공원 전체가 보이는 배율에서 시작
  function walkScale() { return (api() && api().playScale) ? api().playScale() : Math.max(fitScale(), Math.min(S.view.w, S.view.h) / 540); }
  function fitZoom() { return fitScale() / walkScale(); }
  function curScale() { return walkScale() * S.zoom; }
  function zoomBy(k, sx, sy) {
    var z = Math.max(fitZoom() * 0.98, Math.min(2.2, S.zoom * k));
    if (sx != null && S.mode === 'edit') {
      var w = toWorld(sx, sy);
      S.zoom = z;
      var s1 = curScale();
      S.cam.cx = w.x - (sx - S.view.w / 2) / s1; S.cam.cy = w.y - (sy - S.view.h / 2) / s1;
      S.panned = true;
    } else S.zoom = z;
  }
  function clampCam(c, s) {
    var hw = S.view.w / (2 * s), hh = S.view.h / (2 * s);
    c.cx = hw * 2 >= W ? W / 2 : Math.min(Math.max(c.cx, hw), W - hw);
    c.cy = hh * 2 >= H ? H / 2 : Math.min(Math.max(c.cy, hh), H - hh);
    return c;
  }
  function camTarget() {
    var s = curScale();
    if (S.mode === 'edit' || S.panned) return clampCam({ cx: S.cam.cx, cy: S.cam.cy }, s);
    return clampCam({ cx: S.me.x, cy: S.me.y - 24 }, s);
  }
  function snapCam() { var t = camTarget(); S.cam.cx = t.cx; S.cam.cy = t.cy; S.cam.s = curScale(); }
  function updateCam(dt) {
    var t = camTarget(), k = Math.min(1, dt * 6);
    S.cam.s = curScale();
    if (S.mode === 'edit' || S.panned) { S.cam.cx = t.cx; S.cam.cy = t.cy; return; }
    S.cam.cx += (t.cx - S.cam.cx) * k; S.cam.cy += (t.cy - S.cam.cy) * k;
  }
  function toWorld(sx, sy) { var s = S.cam.s; return { x: S.cam.cx + (sx - S.view.w / 2) / s, y: S.cam.cy + (sy - S.view.h / 2) / s }; }
  function toScreen(x, y) { var s = S.cam.s; return { x: (x - S.cam.cx) * s + S.view.w / 2, y: (y - S.cam.cy) * s + S.view.h / 2 }; }

  // ---------- 바닥 캐시(지도 + 산책로) ----------
  function buildFloor() {
    if (!ready(imgs.map)) return false;
    if (!floor) { floor = document.createElement('canvas'); floor.width = W * RES; floor.height = H * RES; }
    var c = floor.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(imgs.map, 0, 0, W * RES, H * RES);
    c.setTransform(RES, 0, 0, RES, 0, 0);
    var P = D.PATH_CELL;
    Object.keys(S.park.items).forEach(function (id) {
      var it = S.park.items[id], def = D.ITEMS[it.t];
      if (def.kind !== 'path') return;
      var im = image(def.dirs[it.d] ? def.dirs[it.d].img : def.dirs[def.dirOrder[0]].img);
      // 이웃 타일과 0.5px 겹쳐 그려 틈이 보이지 않게
      if (ready(im)) c.drawImage(im, it.x - P / 2 - 0.25, it.y - P / 2 - 0.25, P + 0.5, P + 0.5);
    });
    S.floorDirty = false;
    return true;
  }
  // 격자(꾸미기 모드에서만): 놓을 수 있는 잔디 위 32px 칸, 얇고 반투명
  function buildGrid() {
    gridCv = document.createElement('canvas'); gridCv.width = W * RES; gridCv.height = H * RES;
    var c = gridCv.getContext('2d'), P = D.PATH_CELL;
    c.setTransform(RES, 0, 0, RES, 0, 0);
    c.strokeStyle = 'rgba(255,255,255,0.24)'; c.lineWidth = 0.5;
    c.beginPath();
    for (var y = 0; y < H; y += P) for (var x = 0; x < W; x += P) {
      if (!L.maskOk(M, M.place, x + P / 2, y + P / 2)) continue;
      c.rect(x + 0.3, y + 0.3, P - 0.6, P - 0.6);
    }
    c.stroke();
  }

  // ---------- 그리기 ----------
  function draw(t) {
    var cv = ui.canvas, c = cv.getContext('2d'), s = S.cam.s, dpr = S.view.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#2f6b55'; c.fillRect(0, 0, cv.width, cv.height);
    if (S.floorDirty) buildFloor();
    c.setTransform(s * dpr, 0, 0, s * dpr, (S.view.w / 2 - S.cam.cx * s) * dpr, (S.view.h / 2 - S.cam.cy * s) * dpr);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    // 1·2 배경 + 바닥 산책로
    if (floor) c.drawImage(floor, 0, 0, W, H);
    else if (ready(imgs.map)) c.drawImage(imgs.map, 0, 0, W, H);
    // 꾸미기: 격자
    if (S.mode === 'edit') { if (!gridCv) buildGrid(); c.drawImage(gridCv, 0, 0, W, H); }
    // 고른 산책로 표시
    if (S.mode === 'edit' && S.sel && S.park.items[S.sel] && D.ITEMS[S.park.items[S.sel].t].kind === 'path') {
      var sp = S.park.items[S.sel], h = D.PATH_CELL / 2;
      c.strokeStyle = '#ffe27a'; c.lineWidth = 2 / s * 1.5; c.strokeRect(sp.x - h, sp.y - h, h * 2, h * 2);
    }
    // 3·4 Y축 정렬: 아이템과 캐릭터(발 y 가 작을수록 먼저 = 뒤)
    var me = S.me, drawnMe = false, dragId = S.drag && S.drag.moving ? S.drag.id : null, hidden = false;
    var CH = (window.MPChars && MPChars.DRAW_H) || 60, box = [me.x - 14, me.y - CH, me.x + 14, me.y];
    for (var i = 0; i < S.sorted.length; i++) {
      var o = S.sorted[i];
      if (!drawnMe && o.y > me.y) { drawMe(c, t); drawnMe = true; }
      if (o.id === dragId) continue;
      var it0 = S.park.items[o.id];
      drawItem(c, it0, o.spr, o.id === S.sel ? 'sel' : null);
      // 캐릭터 앞에 그려져 캐릭터를 덮는 아이템이 있는지(그림 네모의 가운데 부분으로 대강)
      if (drawnMe && !hidden) {
        var x0 = it0.x - o.spr.ax, y0 = it0.y - o.spr.ay;
        hidden = L.hit(box, [x0 + o.spr.w * 0.15, y0 + o.spr.h * 0.1, x0 + o.spr.w * 0.85, it0.y]);
      }
    }
    if (!drawnMe) drawMe(c, t);
    // 나무·건물 뒤에 가려졌을 때: 별마당 공원처럼 흐린 윤곽을 한 번 더 그려 내 위치를 알 수 있게
    if (hidden) { c.save(); c.globalAlpha = 0.32; drawMe(c, t); c.restore(); }
    // 5 한옥 입구 전경: 캐릭터가 입구 바닥선보다 위에 있으면 지붕·기둥이 캐릭터를 가림
    var g = imgs[D.GATE.img];
    if (ready(g)) c.drawImage(g, D.GATE.x, D.GATE.y, D.GATE.w, D.GATE.h);
    // 꾸미기: 놓기 미리보기 · 옮기는 중
    if (S.mode === 'edit') drawGhost(c, s);
    if (S.emote && S.emote.until > performance.now()) drawEmote(c, s);
  }
  function drawItem(c, it, spr, mark) {
    var im = image(spr.img);
    if (!ready(im)) return;
    var x0 = it.x - spr.ax, y0 = it.y - spr.ay;
    if (mark === 'sel') {
      c.save(); c.shadowColor = 'rgba(255, 226, 122, 0.95)'; c.shadowBlur = 14;
    }
    if (spr.mirror) {
      c.save(); c.translate(x0 + spr.w, y0); c.scale(-1, 1); c.drawImage(im, 0, 0, spr.w, spr.h); c.restore();
    } else c.drawImage(im, x0, y0, spr.w, spr.h);
    if (mark === 'sel') c.restore();
  }
  function ensureWalker() {
    var ch = myChar(), key = ch.id + ':' + ch.gender + ':' + ch.teacher;
    if (walker && walkerKey === key) return walker;
    walkerKey = key;
    if (ch.teacher && window.MPTeacherChars) walker = new MPTeacherChars.Walker(ch.id);
    else if (window.MPChars) walker = new MPChars.Walker({ id: ch.id, gender: ch.gender });
    return walker;
  }
  function drawMe(c, t) {
    var w = ensureWalker();
    if (w) w.draw(c, S.me.x, S.me.y, S.me.dir, S.me.moving, t);
  }
  function drawEmote(c, s) {
    var x = S.me.x, y = S.me.y - ((window.MPChars && MPChars.DRAW_H) || 60) - 16;
    var r = 15;
    c.save();
    c.fillStyle = 'rgba(255, 250, 238, 0.96)'; c.strokeStyle = '#a0682f'; c.lineWidth = 1.4;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 4, y + r - 1); c.lineTo(x, y + r + 6); c.lineTo(x + 4, y + r - 1); c.fill();
    c.font = '18px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#000'; c.fillText(S.emote.e, x, y + 1);
    c.restore();
  }
  // 미리보기: 반투명 그림 + 바닥 영역(놓을 수 있으면 초록, 없으면 빨강)
  function drawGhost(c, s) {
    var gh = S.hover;
    if (!gh) return;
    var def = D.ITEMS[gh.t], ok = gh.ok;
    var col = ok ? 'rgba(120, 230, 160, 0.38)' : 'rgba(235, 60, 60, 0.45)', line = ok ? 'rgba(40, 140, 80, 0.9)' : 'rgba(190, 20, 20, 0.95)';
    c.save();
    if (def.kind === 'path') {
      var h = D.PATH_CELL / 2, im = image(def.dirs[gh.d].img);
      c.globalAlpha = 0.7; if (ready(im)) c.drawImage(im, gh.x - h, gh.y - h, h * 2, h * 2);
      c.globalAlpha = 1; c.fillStyle = col; c.fillRect(gh.x - h, gh.y - h, h * 2, h * 2);
      c.strokeStyle = line; c.lineWidth = 1.5 / s * 1.4; c.strokeRect(gh.x - h, gh.y - h, h * 2, h * 2);
    } else {
      var spr = D.sprite(def, gh.d);
      L.rectsOf(gh).forEach(function (r) {
        c.fillStyle = col; c.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
        c.strokeStyle = line; c.lineWidth = 1.2 / s * 1.4; c.strokeRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
      });
      c.globalAlpha = ok ? 0.72 : 0.5;
      drawItem(c, gh, spr);
    }
    c.restore();
  }

  function loop(now) {
    if (!S.open) return;
    var dt = Math.min(0.05, (now - S.last) / 1000); S.last = now;
    step(dt); updateCam(dt);
    draw(now / 1000);
    placeLeave();
    S.raf = requestAnimationFrame(loop);
  }
  function placeLeave() {
    if (ui.leave.hidden) return;
    var p = toScreen(S.me.x, S.me.y - 80);
    ui.leave.style.left = p.x + 'px'; ui.leave.style.top = Math.max(70, p.y - 40) + 'px';
  }
  function render() { draw(performance.now() / 1000); }

  // ---------- 모드 ----------
  function setMode(m) {
    if (S.visit && m === 'edit') return;   // 친구 공원은 꾸미기 불가
    S.mode = m;
    S.tool = null; S.hover = null; S.drag = null; S.route = null; S.keys = {};
    select(null);
    ui.root.classList.toggle('is-edit', m === 'edit');
    ui.panel.hidden = m !== 'edit'; ui.tools.hidden = m !== 'edit';
    ui.menu.hidden = m === 'edit' || !!S.visit;
    ui.myEmotes.hidden = m === 'edit' || !!S.visit;
    ui.leave.hidden = true; S.nearExit = false;
    if (m === 'edit') {
      S.zoom = fitZoom();   // 꾸미기는 공원 전체가 보이게 시작(확대·이동 가능)
      S.cam.cx = W / 2; S.cam.cy = H / 2; S.panned = true;
      showCat(S.cat || 'path');
      setHint('아래에서 아이템을 고르고 잔디를 눌러 놓아요. 놓은 아이템을 누르면 옮기거나 돌릴 수 있어요.');
    } else {
      S.zoom = 1; S.panned = false; setHint(null);
    }
    updateUndo();
  }
  function setHint(t) {
    clearTimeout(S.hintT);
    ui.hint.hidden = !t; if (t) ui.hint.textContent = t;
  }
  function flashHint(t, bad) {
    setHint(t); ui.hint.classList.toggle('bad', !!bad);
    S.hintT = setTimeout(function () { ui.hint.classList.remove('bad'); if (S.mode === 'edit') setHint(S.tool ? toolHint() : '아이템을 고르거나, 놓은 아이템을 눌러 옮겨요.'); }, 2200);
  }
  function toolHint() {
    var def = D.ITEMS[S.tool.t];
    if (def.kind === 'path') return def.name + ': 누르거나 끌어서 길을 이어 놓아요';
    return def.name + ': 놓을 곳을 눌러요' + (def.rotatable ? ' · 방향 바꾸기는 R' : '');
  }

  // ---------- 아이템 패널 ----------
  function showCat(id) {
    S.cat = id;
    Object.keys(ui.tabBtns).forEach(function (k) { ui.tabBtns[k].classList.toggle('on', k === id); ui.tabBtns[k].setAttribute('aria-selected', String(k === id)); });
    ui.cards.textContent = '';
    D.ORDER.filter(function (t) { return D.ITEMS[t].cat === id; }).forEach(function (t) {
      var def = D.ITEMS[t];
      var b = btn('cp-itemcard', '', function () { chooseTool(t); });
      var im = el('img', 'cp-itemimg'); im.src = BASE + def.icon + '.webp'; im.alt = ''; im.draggable = false;
      b.appendChild(im);
      b.appendChild(el('span', 'cp-itemname', def.name));
      b.appendChild(el('span', 'cp-itemtag', def.limit == null ? '무료 · 무제한' : '남은 ' + invLeft(t) + '개'));
      b.dataset.t = t;
      b.setAttribute('aria-pressed', String(!!(S.tool && S.tool.t === t)));
      ui.cards.appendChild(b);
    });
    // 고른 아이템의 방향 바꾸기(놓기 전에)
    ui.toolRot = btn('cp-itemcard cp-toolrot', '<span class="cp-ico">⟳</span><span class="cp-itemname">방향</span>', function () { rotateTool(); }, '놓을 아이템 방향 바꾸기');
    ui.toolRot.hidden = !(S.tool && D.ITEMS[S.tool.t].rotatable);
    ui.cards.appendChild(ui.toolRot);
  }
  function chooseTool(t) {
    if (S.tool && S.tool.t === t) { S.tool = null; S.hover = null; }
    else {
      var def = D.ITEMS[t];
      if (def.limit != null && invLeft(t) <= 0) { flashHint('보관함에 남은 ' + def.name + '이(가) 없어요', true); return; }
      S.tool = { t: t, d: def.dirOrder[0] };
      select(null);
      if (S.cat !== def.cat) showCat(def.cat);
    }
    Array.prototype.forEach.call(ui.cards.querySelectorAll('.cp-itemcard[data-t]'), function (b) { b.setAttribute('aria-pressed', String(!!(S.tool && S.tool.t === b.dataset.t))); });
    if (ui.toolRot) ui.toolRot.hidden = !(S.tool && D.ITEMS[S.tool.t].rotatable);
    setHint(S.tool ? toolHint() : '아이템을 고르거나, 놓은 아이템을 눌러 옮겨요.');
  }
  function rotateTool() {
    if (!S.tool) return;
    var def = D.ITEMS[S.tool.t], o = def.dirOrder;
    S.tool.d = o[(o.indexOf(S.tool.d) + 1) % o.length];
    if (S.hover) { S.hover.d = S.tool.d; S.hover.ok = L.canPlace(S.park, S.hover, M, null, S.idx).ok; }
    flashHint(def.name + ' 방향: ' + (def.dirs[S.tool.d].label || S.tool.d));
  }
  // 보관함: 수량 제한이 있는 아이템만 개수로 관리(지금 15종은 모두 무제한)
  function invLeft(t) { var inv = S.park.inv || {}; return inv[t] || 0; }

  // ---------- 고르기·옮기기·회전·회수 ----------
  function select(id) {
    S.sel = id;
    var it = id && S.park.items[id];
    ui.selBar.hidden = !it || S.mode !== 'edit';
    ui.root.classList.toggle('has-sel', !ui.selBar.hidden);
    if (S.mode === 'edit') { clearTimeout(S.hintT); ui.hint.classList.remove('bad'); ui.hint.hidden = !!it; if (!it) ui.hint.textContent = S.tool ? toolHint() : '아이템을 고르거나, 놓은 아이템을 눌러 옮겨요.'; }
    if (!it) return;
    var def = D.ITEMS[it.t];
    ui.selName.textContent = def.name + (def.rotatable ? ' · ' + (def.dirs[it.d].label || '') : '');
    ui.sRotate.hidden = !def.rotatable;   // 회전할 수 없는 아이템은 회전 버튼 숨김
  }
  function rotateSel() {
    var it = S.sel && S.park.items[S.sel];
    if (!it) return;
    var def = D.ITEMS[it.t];
    if (!def.rotatable) return;
    var o = def.dirOrder, nd = o[(o.indexOf(it.d) + 1) % o.length];
    var cand = { t: it.t, x: it.x, y: it.y, d: nd }, chk = L.canPlace(S.park, cand, M, S.sel, S.idx);
    if (!chk.ok) { flashHint('그 방향으로는 돌릴 수 없어요: ' + chk.why, true); return; }
    commit(function (p) { p.items[S.sel].d = nd; });
    select(S.sel);
  }
  function recallSel() {
    var id = S.sel, it = id && S.park.items[id];
    if (!it) return;
    var def = D.ITEMS[it.t];
    commit(function (p) {
      delete p.items[id];
      if (def.limit != null) { p.inv = p.inv || {}; p.inv[it.t] = (p.inv[it.t] || 0) + 1; }
    });
    select(null);
    flashHint(def.name + '을(를) 보관함에 넣었어요');
  }
  // 바꾸기: 지금 공원을 실행 취소 목록에 넣고 → 바꾸고 → 다시 계산 → 자동 저장
  function commit(fn, noHistory) {
    if (!noHistory) { S.history.push(JSON.stringify(S.park.items) + '\u0000' + JSON.stringify(S.park.inv || {})); if (S.history.length > 60) S.history.shift(); S.future = []; }
    fn(S.park);
    onParkChanged(false);
    scheduleSave();
  }
  function snapshot() { return JSON.stringify(S.park.items) + '\u0000' + JSON.stringify(S.park.inv || {}); }
  function restore(snap) {
    var parts = snap.split('\u0000');
    S.park.items = JSON.parse(parts[0]); var inv = JSON.parse(parts[1] || '{}');
    if (Object.keys(inv).length) S.park.inv = inv; else delete S.park.inv;
    if (S.sel && !S.park.items[S.sel]) select(null);
    onParkChanged(false); scheduleSave();
    if (S.sel) select(S.sel);
  }
  function undo() { if (!S.history.length) return; S.future.push(snapshot()); restore(S.history.pop()); flashHint('되돌렸어요'); }
  function redo() { if (!S.future.length) return; S.history.push(snapshot()); restore(S.future.pop()); flashHint('다시 했어요'); }
  function updateUndo() {
    if (!ui.undo) return;
    ui.undo.disabled = !S.history.length; ui.redo.disabled = !S.future.length;
  }

  // 놓기(산책로는 끌면서 여러 칸)
  function candAt(w) {
    var p = L.snap(S.tool.t, w.x, w.y);
    return { t: S.tool.t, x: p.x, y: p.y, d: S.tool.d };
  }
  function placeAt(cand, inStroke) {
    var chk = L.canPlace(S.park, cand, M, null, S.idx);
    if (!chk.ok) {
      // 산책로를 다른 산책로 위에 칠하면 바꿔 놓기(같은 종류면 그냥 지나감)
      var def = D.ITEMS[cand.t];
      if (def.kind === 'path' && chk.why === '이미 길이 있어요') {
        var at = S.idx.paths[L.pathKey(cand.x, cand.y)], old = S.park.items[at];
        if (old.t === cand.t && old.d === cand.d) return true;
        commit(function (p) { p.items[at].t = cand.t; p.items[at].d = cand.d; }, inStroke);
        return true;
      }
      if (!inStroke) flashHint(chk.why, true);
      return false;
    }
    var def2 = D.ITEMS[cand.t];
    commit(function (p) {
      p.items[L.newId()] = { t: cand.t, x: cand.x, y: cand.y, d: cand.d };
      if (def2.limit != null) { p.inv[cand.t] = Math.max(0, (p.inv[cand.t] || 0) - 1); }
    }, inStroke);
    return true;
  }

  // ---------- 화면 누르기 ----------
  function localPt(e) { var r = ui.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function onDown(e) {
    if (!S.open || S.modal) return;
    ui.canvas.setPointerCapture && ui.canvas.setPointerCapture(e.pointerId);
    var p = localPt(e);
    S.pointers[e.pointerId] = p;
    var ids = Object.keys(S.pointers);
    if (ids.length === 2) {   // 두 손가락: 확대·축소 + 이동
      var a = S.pointers[ids[0]], b = S.pointers[ids[1]];
      S.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: S.zoom, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      cancelStroke(); S.drag = null;
      return;
    }
    var w = toWorld(p.x, p.y);
    if (S.mode === 'walk') {
      S.panned = false;
      var r = findRoute(S.me.x, S.me.y, w.x, w.y);
      S.route = r;
      return;
    }
    // 꾸미기
    if (S.tool) {
      var cand = candAt(w), def = D.ITEMS[S.tool.t];
      if (def.kind === 'path') {
        S.history.push(snapshot()); if (S.history.length > 60) S.history.shift(); S.future = [];
        S.stroke = { n: 0, last: null, lastW: w };
        if (placeAt(cand, true)) S.stroke.n++;
        else { var why0 = L.canPlace(S.park, cand, M, null, S.idx).why; if (!/^이미/.test(why0)) flashHint(why0, true); }   // 이어 그리기를 놓인 칸에서 시작하는 건 괜찮음
        S.stroke.last = cand.x + ',' + cand.y;
        S.hover = Object.assign(cand, { ok: L.canPlace(S.park, cand, M, null, S.idx).ok });
        updateUndo();
      } else {
        S.drag = { aim: true, start: p };
        S.hover = Object.assign(cand, { ok: L.canPlace(S.park, cand, M, null, S.idx).ok });
      }
      return;
    }
    var id = L.pick(S.park, w.x, w.y, S.idx);
    if (id) {
      select(id);
      var it = S.park.items[id];
      S.drag = { id: id, start: p, ox: w.x - it.x, oy: w.y - it.y, moving: false };
    } else {
      select(null);
      S.drag = { pan: true, start: p, cx: S.cam.cx, cy: S.cam.cy };
    }
  }
  function onMove(e) {
    if (!S.open) return;
    var p = localPt(e);
    if (S.pointers[e.pointerId]) S.pointers[e.pointerId] = p;
    if (S.pinch) {
      var ids = Object.keys(S.pointers);
      if (ids.length >= 2) {
        var a = S.pointers[ids[0]], b = S.pointers[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
        var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        zoomBy((S.pinch.z * d / S.pinch.d) / S.zoom, mid.x, mid.y);
        if (S.mode === 'edit') { S.cam.cx -= (mid.x - S.pinch.mid.x) / S.cam.s; S.cam.cy -= (mid.y - S.pinch.mid.y) / S.cam.s; }
        S.pinch.mid = mid;
      }
      return;
    }
    if (S.mode !== 'edit') return;
    var w = toWorld(p.x, p.y);
    if (S.tool) {
      var cand = candAt(w), key = cand.x + ',' + cand.y;
      if (S.stroke && S.stroke.last !== key && e.buttons !== 0) {
        // 손가락·마우스가 빨리 움직여도 지나간 칸을 빠짐없이: 지난 점에서 지금 점까지 반 칸 간격으로 채움
        var from = S.stroke.lastW || w, dist2 = Math.hypot(w.x - from.x, w.y - from.y), stepN = Math.max(1, Math.ceil(dist2 / (D.PATH_CELL / 3)));
        for (var si = 1; si <= stepN; si++) {
          var c3 = candAt({ x: from.x + (w.x - from.x) * si / stepN, y: from.y + (w.y - from.y) * si / stepN }), k3 = c3.x + ',' + c3.y;
          if (k3 === S.stroke.last) continue;
          if (placeAt(c3, true)) S.stroke.n++;
          S.stroke.last = k3;
        }
      }
      if (S.stroke) S.stroke.lastW = w;
      if (!S.hover || S.hover.x !== cand.x || S.hover.y !== cand.y || S.hover.d !== cand.d || S.stroke) {
        S.hover = Object.assign(cand, { ok: L.canPlace(S.park, cand, M, null, S.idx).ok || !!S.stroke });
        if (S.stroke) S.hover.ok = true;
      }
      return;
    }
    if (!S.drag) return;
    var dist = Math.hypot(p.x - S.drag.start.x, p.y - S.drag.start.y);
    if (S.drag.pan) {
      if (dist > 3) { S.cam.cx = S.drag.cx - (p.x - S.drag.start.x) / S.cam.s; S.cam.cy = S.drag.cy - (p.y - S.drag.start.y) / S.cam.s; }
      return;
    }
    if (S.drag.id) {
      if (!S.drag.moving && dist < 6) return;
      S.drag.moving = true;
      var it = S.park.items[S.drag.id], sp = L.snap(it.t, w.x - S.drag.ox, w.y - S.drag.oy);
      var c2 = { t: it.t, x: sp.x, y: sp.y, d: it.d, ignore: S.drag.id };
      c2.ok = L.canPlace(S.park, c2, M, S.drag.id, S.idx).ok;
      S.hover = c2;
    }
  }
  function onUp(e) {
    delete S.pointers[e.pointerId];
    if (S.pinch) { if (Object.keys(S.pointers).length < 2) S.pinch = null; S.drag = null; return; }
    if (!S.open || S.mode !== 'edit') return;
    if (S.stroke) {
      var n = S.stroke.n; S.stroke = null;
      if (!n) S.history.pop();   // 아무것도 안 놓았으면 실행 취소 목록에서 빼기
      updateUndo();
      if (e.pointerType !== 'mouse') S.hover = null;
      return;
    }
    var dr = S.drag; S.drag = null;
    if (!dr) return;
    if (dr.aim && S.tool) {
      var p = localPt(e), cand = candAt(toWorld(p.x, p.y));
      placeAt(cand, false);
      S.hover = e.pointerType === 'mouse' ? Object.assign(cand, { ok: L.canPlace(S.park, cand, M, null, S.idx).ok }) : null;
      return;
    }
    if (dr.id && dr.moving) {
      var gh = S.hover; S.hover = null;
      if (gh && gh.ok) {
        var id = dr.id;
        commit(function (pk) { pk.items[id].x = gh.x; pk.items[id].y = gh.y; });
        select(id);
      } else if (gh) flashHint('거기에는 놓을 수 없어서 제자리로 돌아갔어요: ' + L.canPlace(S.park, gh, M, dr.id, S.idx).why, true);
    }
  }
  function cancelStroke() {
    if (S.stroke) { var n = S.stroke.n; S.stroke = null; if (!n) S.history.pop(); }
  }
  function onHoverLeave() { if (S.mode === 'edit' && !S.stroke) S.hover = null; }
  function onWheel(e) {
    if (!S.open) return;
    e.preventDefault();
    var p = localPt(e);
    zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, S.mode === 'edit' ? p.x : null, p.y);
  }

  // ---------- 키보드 ----------
  function onKey(e, down) {
    if (!S.open) return;
    if (S.modal) {
      if (down && e.code === 'Escape' && !S.modalLocked) { e.preventDefault(); closeModal(); }
      return;
    }
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (S.mode === 'walk') {
      if (KEYMAP[e.code]) { e.preventDefault(); S.keys[KEYMAP[e.code]] = down; if (down) S.panned = false; return; }
      if (down && e.code === 'Space' && !e.repeat) { e.preventDefault(); if (S.nearExit) { if (S.visit) backToMine(); else exitByGate(); } return; }
      if (down && e.code === 'Escape') { e.preventDefault(); if (S.visit) backToMine(); else close(); }
      return;
    }
    if (!down) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
    if (e.code === 'KeyR') { e.preventDefault(); if (S.tool) rotateTool(); else rotateSel(); return; }
    if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); recallSel(); return; }
    if (e.code === 'Escape') {
      e.preventDefault();
      if (S.tool) chooseTool(S.tool.t); else if (S.sel) select(null); else finishEdit();
    }
  }

  // ---------- 저장 ----------
  function setSaveChip(state, text) {
    S.save.state = state;
    if (S.visit) { ui.saveChip.hidden = true; return; }
    ui.saveChip.hidden = false;
    ui.saveChip.className = 'cp-save is-' + state;
    ui.saveChip.textContent = text;
    ui.saveChip.disabled = state !== 'error';
  }
  function scheduleSave(ms) {
    if (S.visit) return;
    clearTimeout(S.save.timer);
    S.save.dirty = true;
    setSaveChip('dirty', '저장 중…');
    S.save.timer = setTimeout(function () { flushSave(false); }, ms == null ? 700 : ms);
  }
  // → Promise(true 저장됨 | false 실패)
  function flushSave(manual) {
    clearTimeout(S.save.timer); S.save.timer = 0;
    if (S.visit || (cls() && cls().teacher)) return Promise.resolve(true);
    if (!manual && !S.save.dirty && S.save.state !== 'error') return Promise.resolve(true);   // 바뀐 게 없으면 그대로
    S.save.dirty = false;
    var a = api();
    if (!a) return Promise.resolve(false);
    S.park.updated = Date.now();
    var data = L.clone(S.park);
    a.patchSave({ cloudpark: data });   // 이 기기 / 반 기록(선생님 화면 학생 기록과 함께 저장됨)
    var localOk = a.storageOk ? a.storageOk() : true;
    var c = cls();
    if (!(c && c.key && net())) {
      if (!localOk) { setSaveChip('error', '⚠ 이 기기에 저장할 수 없어요'); return Promise.resolve(false); }
      setSaveChip('saved', '✓ 저장됨');
      return Promise.resolve(true);
    }
    setSaveChip('saving', '저장 중…');
    var my = S.saveSeq = (S.saveSeq || 0) + 1;
    // ① 내 공원은 내 반 기록(students/{나}/save — 원래 있던 서버 칸)에 바로 저장: 다른 기기에서도 이걸로 복원
    // ② 친구가 볼 사본(parks·parkinfo)은 따로 올림. 이 칸 규칙이 아직 Firebase 에 게시되지 않았으면(PERMISSION_DENIED)
    //    내 공원 저장은 성공으로 보고, 친구 공개만 '준비 중'으로 둠(인터넷 문제가 아님)
    return net().studentSave(c.code, c.key, JSON.parse(JSON.stringify(a.readSave() || {})))
      .then(function () {
        return publishShare(data).then(function (shared) {
          if (my !== S.saveSeq) return true;
          S.save.tries = 0;
          setSaveChip('saved', shared ? '✓ 저장됨' : '✓ 저장됨 · 친구 공개 준비 중');
          return true;
        });
      }, function (err) {
        console.error('구름동산 저장 실패', err);
        if (my !== S.saveSeq) return false;
        S.save.tries++;
        S.save.dirty = true;
        var why = saveWhy(err);
        setSaveChip('error', '⚠ 저장 실패 · 다시 저장');
        if (manual || S.save.tries === 1) toast(why);
        // 인터넷이 끊긴 거면 다시 연결될 때 저절로 한 번 더
        if (navigator.onLine === false) window.addEventListener('online', function retry() { window.removeEventListener('online', retry); if (S.save.state === 'error') flushSave(false); });
        return false;
      });
  }
  function isDenied(err) { return !!err && (/permission/i.test(String(err.code || '')) || /permission/i.test(String(err.message || ''))); }
  function saveWhy(err) {
    if (navigator.onLine === false) return '인터넷이 끊겨서 서버에 저장하지 못했어요. 이 기기에는 저장해 두었고, 다시 연결되면 저절로 저장해요.';
    if (isDenied(err)) return '서버가 저장을 막았어요(권한). 반 공원에서 나갔다가 다시 들어와 주세요. 계속되면 선생님께 알려 주세요.';
    return '서버에 저장하지 못했어요. 이 기기에는 저장해 두었어요. ‘다시 저장’을 눌러 주세요.';
  }
  // 친구에게 보일 사본 올리기 → Promise(true 올림 | false 못 올림 — 내 공원 저장 결과와는 상관없음)
  function publishShare(data) {
    var c = cls();
    if (!(c && c.key && net())) return Promise.resolve(false);
    return net().shared.set(c.code, 'parks/' + c.key, data)
      .then(function () { return publishInfo(); })
      .then(function () { S.shareOff = false; return true; }, function (err) {
        if (isDenied(err)) {
          if (!S.shareOff) console.warn('구름동산 친구 공개 칸(rooms/{반}/parks·parkinfo) 규칙이 Firebase 에 아직 게시되지 않았어요. database.rules.json 을 게시해 주세요.', err);
          S.shareOff = true;
        } else console.warn('구름동산 친구 공개 실패(다음 저장 때 다시 올림)', err);
        return false;
      });
  }
  // 친구 목록에 보일 짧은 정보
  function publishInfo() {
    var c = cls();
    if (!(c && c.key && net()) || S.visit) return Promise.resolve();
    var ch = myChar(), info = { n: String(profile().nickname || '친구').slice(0, 12), pn: S.park.name.slice(0, D.NAME_MAX), s: String(ch.id).slice(0, 8), gd: ch.gender, u: S.park.updated || Date.now(), c: L.count(S.park) };
    return net().shared.set(c.code, 'parkinfo/' + c.key, info);
  }
  function finishEdit() {
    var p = flushSave(true);
    setMode('walk');
    p.then(function (ok) { toast(ok ? '공원을 저장했어요!' : '저장하지 못했어요. 위의 ‘다시 저장’을 눌러 주세요.'); });
  }

  // ---------- 위쪽 표시 ----------
  function updateHead() {
    if (!ui.nick) return;
    var v = S.visit;
    ui.root.classList.toggle('is-visit', !!v);
    ui.nick.textContent = v ? v.nick + '의 공원에 놀러 왔어요' : (profile().nickname || '나');
    ui.parkName.innerHTML = '';
    ui.parkName.appendChild(el('span', '', S.park.name || defaultName(v ? v.nick : profile().nickname)));
    if (!v) ui.parkName.appendChild(el('span', 'cp-edit', '✎'));
    ui.parkName.disabled = !!v;
    ui.home.innerHTML = v ? '<span class="cp-ico">🏠</span> 내 공원 돌아가기' : '<span class="cp-ico">⭐</span> 별마당 돌아가기';
    if (v && cls() && cls().teacher) ui.home.innerHTML = '<span class="cp-ico">⭐</span> 별마당 돌아가기';
    drawFace(v ? { id: v.s || 'F1', gender: v.gd || 'boy' } : myChar());
    ui.visitBar.hidden = !v || S.mode === 'edit';
    ui.menu.hidden = !!v || S.mode === 'edit';
    ui.myEmotes.hidden = !!v || S.mode === 'edit';
    var c = cls();
    ui.mVisitors.hidden = !(c && c.key);
    ui.mDeco.hidden = ui.mBox.hidden = !!(c && c.teacher);
    if (v) updateStar();
  }
  function drawFace(ch, tries) {
    tries = tries || 0;
    var c = ui.face.getContext('2d');
    c.clearRect(0, 0, 96, 96);
    if (!window.MPChars) return;
    var sid = MPChars.spriteId(MPChars.byId(ch.id) ? ch.id : 'F1', ch.gender);
    if (MPChars.drawThumb && MPChars.drawThumb(c, sid, 48, 94, 84)) return;
    if (tries < 20) setTimeout(function () { if (S.open) drawFace(ch, tries + 1); }, 300);   // 그림을 다 받으면 다시
  }

  // ---------- 창 ----------
  function openModal(build, locked) {
    S.modal = true; S.modalLocked = !!locked; S.keys = {}; S.route = null;
    ui.card.textContent = ''; ui.card.className = 'cp-card';
    build(ui.card);
    ui.modal.hidden = false;
    var f = ui.card.querySelector('input, button.cp-primary, button');
    if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function closeModal(force) {
    if (S.modalLocked && !force) return;
    S.modal = false; S.modalLocked = false; ui.modal.hidden = true;
    if (S.open) ui.canvas.focus && ui.canvas.focus({ preventScroll: true });
  }
  function acts(card, list) {
    var row = el('div', 'cp-acts');
    list.forEach(function (a) { row.appendChild(btn('cp-btn' + (a.primary ? ' cp-primary' : ''), a.text, a.fn)); });
    card.appendChild(row);
    return row;
  }
  function openIntro() {
    openModal(function (c) {
      c.classList.add('cp-intro');
      c.appendChild(el('p', 'cp-card-kicker', '처음 왔어요'));
      c.appendChild(el('h2', 'cp-card-title', '구름동산'));
      INTRO.split('\n').forEach(function (l) { c.appendChild(el('p', 'cp-card-line', l)); });
      acts(c, [{ text: '좋아요!', primary: true, fn: function () {
        var ux = save().cloudparkUi || {}; ux.intro = true; api().patchSave({ cloudparkUi: ux });
        closeModal(true);
      } }]);
    }, true);
  }
  function openRename() {
    openModal(function (c) {
      c.appendChild(el('h2', 'cp-card-title', '공원 이름 바꾸기'));
      var f = el('form', 'cp-form'); f.noValidate = true; f.autocomplete = 'off';
      var inp = el('input', 'cp-input'); inp.type = 'text'; inp.maxLength = D.NAME_MAX; inp.value = S.park.name; inp.spellcheck = false;
      inp.setAttribute('aria-label', '공원 이름(' + D.NAME_MAX + '글자까지)');
      var msg = el('p', 'cp-err'); msg.setAttribute('aria-live', 'polite');
      f.appendChild(inp); f.appendChild(el('p', 'cp-note', D.NAME_MAX + '글자까지 쓸 수 있어요')); f.appendChild(msg);
      f.onsubmit = function (e) {
        e.preventDefault();
        var v = inp.value.replace(/\s+/g, ' ').trim();
        if (!v) { msg.textContent = '이름을 한 글자 이상 써 주세요.'; inp.focus(); return; }
        S.park.name = v.slice(0, D.NAME_MAX);
        updateHead(); scheduleSave(0); closeModal();
        toast('공원 이름을 ‘' + S.park.name + '’(으)로 바꿨어요');
      };
      c.appendChild(f);
      var row = acts(c, [{ text: '취소', fn: function () { closeModal(); } }, { text: '바꾸기', primary: true, fn: function () { f.requestSubmit ? f.requestSubmit() : f.onsubmit(new Event('submit')); } }]);
      row.lastChild.type = 'button';
      setTimeout(function () { inp.select(); }, 40);
    });
  }
  // 보관함: 가진 아이템(지금은 기본 무료 15종, 수량 제한 없음)과 공원에 놓은 개수. 누르면 꾸미기에서 바로 고름
  function openStorage() {
    var placed = {};
    Object.keys(S.park.items).forEach(function (id) { var t = S.park.items[id].t; placed[t] = (placed[t] || 0) + 1; });
    openModal(function (c) {
      c.classList.add('cp-wide');
      c.appendChild(el('h2', 'cp-card-title', '🧺 보관함'));
      c.appendChild(el('p', 'cp-card-line', '기본 아이템은 모두 무료이고 몇 개든 놓을 수 있어요. 누르면 바로 꾸미기를 시작해요.'));
      D.CATS.forEach(function (cat) {
        var items = D.ORDER.filter(function (t) { return D.ITEMS[t].cat === cat.id; });
        if (!items.length) return;
        c.appendChild(el('p', 'cp-group', cat.name));
        var grid = el('div', 'cp-boxgrid');
        items.forEach(function (t) {
          var def = D.ITEMS[t];
          var b = btn('cp-boxitem', '', function () { closeModal(); setMode('edit'); showCat(def.cat); chooseTool(t); });
          var im = el('img', ''); im.src = BASE + def.icon + '.webp'; im.alt = ''; b.appendChild(im);
          b.appendChild(el('span', 'cp-itemname', def.name));
          b.appendChild(el('span', 'cp-itemtag', (def.limit == null ? '∞ 무제한' : '보관 ' + invLeft(t) + '개') + (placed[t] ? ' · 공원에 ' + placed[t] + '개' : '')));
          grid.appendChild(b);
        });
        c.appendChild(grid);
      });
      acts(c, [{ text: '닫기', fn: function () { closeModal(); } }]);
    });
  }

  // ---------- 친구 공원 ----------
  function openFriends() {
    var c = cls();
    if (!(c && net())) {
      openModal(function (card) {
        card.appendChild(el('h2', 'cp-card-title', '🏡 친구 공원'));
        card.appendChild(el('p', 'cp-card-line', '친구 공원은 반 공원(반 코드로 입장)에서 놀러 갈 수 있어요.'));
        card.appendChild(el('p', 'cp-card-line', '지금은 혼자 둘러보기라서 내 공원만 꾸밀 수 있어요.'));
        acts(card, [{ text: '닫기', primary: true, fn: function () { closeModal(); } }]);
      });
      return;
    }
    openModal(function (card) {
      card.classList.add('cp-wide');
      card.appendChild(el('h2', 'cp-card-title', c.teacher ? '🏡 학생 공원' : '🏡 친구 공원'));
      var list = el('div', 'cp-friends'); list.appendChild(el('p', 'cp-card-line', '친구 목록을 불러오는 중…'));
      card.appendChild(list);
      acts(card, [{ text: '닫기', fn: function () { closeModal(); if (c.teacher && !S.visit) close(); } }]);
      Promise.all([net().listNames(c.code), net().shared.get(c.code, 'parkinfo')]).then(function (r) {
        var keys = r[0] || [], info = r[1] || {};
        Object.keys(info).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
        keys = keys.filter(function (k) { return k !== c.key; });
        list.textContent = '';
        if (!keys.length) { list.appendChild(el('p', 'cp-card-line', '아직 우리 반에 다른 친구가 없어요.')); return; }
        keys.map(function (k) {
          var i = info[k] || {};
          return { key: k, nick: i.n || net().keyNick(k) || '친구', pn: i.pn || '', s: i.s, gd: i.gd, c: i.c || 0, u: i.u || 0 };
        }).sort(function (a, b) { return (b.u > 0) - (a.u > 0) || a.nick.localeCompare(b.nick, 'ko'); }).forEach(function (f) {
          var row = el('div', 'cp-friend');
          var face = el('canvas', 'cp-face cp-face-sm'); face.width = 72; face.height = 72; row.appendChild(face);
          drawFaceTo(face, f.s, f.gd);
          var t = el('div', 'cp-friend-text');
          t.appendChild(el('p', 'cp-friend-nick', f.nick));
          t.appendChild(el('p', 'cp-friend-park', f.pn || (f.u ? defaultName(f.nick) : '아직 꾸미기 전이에요')));
          row.appendChild(t);
          row.appendChild(btn('cp-btn cp-primary cp-go', '놀러 가기', function () { closeModal(true); visit(f); }));
          list.appendChild(row);
        });
      }, function (err) {
        console.error('친구 목록 실패', err);
        list.textContent = '';
        list.appendChild(el('p', 'cp-err', isDenied(err)
          ? '친구 공원은 아직 준비 중이에요. 선생님이 서버 설정(Firebase 규칙)을 한 번 게시하면 열려요. 내 공원은 그대로 저장돼요.'
          : navigator.onLine === false ? '인터넷이 끊겨 있어요. 연결되면 다시 열어 주세요.' : '친구 목록을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'));
      });
    });
  }
  function drawFaceTo(cv, id, gd) {
    var c = cv.getContext('2d');
    if (!window.MPChars) return;
    var sid = MPChars.spriteId(MPChars.byId(id) ? id : 'F1', gd === 'girl' ? 'girl' : 'boy');
    var tries = 0;
    (function go() {
      c.clearRect(0, 0, cv.width, cv.height);
      if (MPChars.drawThumb(c, sid, cv.width / 2, cv.height * 0.98, cv.height * 0.88)) return;
      if (++tries < 15) setTimeout(go, 200);
    })();
  }
  function visit(f) {
    var c = cls();
    if (!(c && net())) return;
    flushSave(false);
    ui.loading.hidden = false; ui.loading.textContent = f.nick + '의 공원으로 가는 중…';
    net().shared.get(c.code, 'parks/' + f.key).then(function (raw) {
      ui.loading.hidden = true;
      var n = L.normalize(raw, f.pn || defaultName(f.nick));
      S.mine = S.mine || (S.visit ? S.mine : S.park);
      S.visit = { key: f.key, nick: f.nick, s: f.s, gd: f.gd, stars: 0, starred: false };
      S.park = n.park; if (!S.park.name) S.park.name = defaultName(f.nick);
      S.history = []; S.future = [];
      setMode('walk');
      onParkChanged(true); spawn();
      ui.saveChip.hidden = true;
      updateHead();
      toast(f.nick + '의 ‘' + S.park.name + '’에 놀러 왔어요!');
      if (!c.teacher) recordVisit(f.key);
      loadStars();
    }, function (err) {
      ui.loading.hidden = true;
      console.error('친구 공원 불러오기 실패', err);
      toast('친구 공원을 불러오지 못했어요. 다시 해 볼까요?');
    });
  }
  function backToMine() {
    var c = cls();
    if (c && c.teacher) { S.visit = null; close(); return; }
    S.visit = null;
    S.park = S.mine || L.emptyPark(defaultName(profile().nickname)); S.mine = null;
    setMode('walk');
    onParkChanged(true); spawn();
    setSaveChip(S.save.state === 'error' ? 'error' : 'saved', S.save.state === 'error' ? '⚠ 저장 실패 · 다시 저장' : '✓ 저장됨');
    updateHead();
    toast('내 공원으로 돌아왔어요');
  }
  // 방문 기록: rooms/{반}/parkvisits/{주인}/{나} = { n 닉네임, at 마지막 방문, c 방문 횟수 } — 주인이 '방문 기록'에서 봄
  function recordVisit(owner) {
    var c = cls(), path = 'parkvisits/' + owner + '/' + c.key;
    net().shared.get(c.code, path).then(null, function () { return null; }).then(function (prev) {
      var v = { n: String(profile().nickname || '친구').slice(0, 12), at: Date.now(), c: ((prev && prev.c) || 0) + 1 };
      return net().shared.set(c.code, path, v);
    }).then(null, function (err) { console.warn('방문 기록 실패', err); });
  }
  // 별 남기기: rooms/{반}/parkstars/{주인}/{나} = true. 한 사람이 공원마다 하나, 다시 누르면 취소
  function loadStars() {
    var c = cls(), v = S.visit;
    if (!v) return;
    net().shared.get(c.code, 'parkstars/' + v.key).then(function (all) {
      if (S.visit !== v) return;
      all = all || {};
      v.stars = Object.keys(all).length; v.starred = !!(c.key && all[c.key]);
      updateStar();
    }, function () { updateStar(); });
  }
  function updateStar() {
    var v = S.visit;
    if (!v) return;
    var c = cls();
    ui.star.innerHTML = '<span class="cp-ico">' + (v.starred ? '★' : '☆') + '</span><span>' + (v.starred ? '별 남겼어요' : '별 남기기') + '</span><b>' + v.stars + '</b>';
    ui.star.classList.toggle('on', v.starred);
    ui.star.setAttribute('aria-pressed', String(v.starred));
    ui.star.disabled = !(c && c.key) || !!v.busy;
  }
  function toggleStar() {
    var c = cls(), v = S.visit;
    if (!v || !c || !c.key || v.busy) return;
    v.busy = true; updateStar();
    var on = !v.starred, path = 'parkstars/' + v.key + '/' + c.key;
    (on ? net().shared.set(c.code, path, true) : net().shared.remove(c.code, path)).then(function () {
      v.busy = false; v.starred = on; v.stars = Math.max(0, v.stars + (on ? 1 : -1)); updateStar();
      toast(on ? v.nick + '의 공원에 별을 남겼어요 ★' : '별 남기기를 취소했어요');
      loadStars();
    }, function (err) {
      v.busy = false; updateStar();
      console.error('별 남기기 실패', err);
      toast('별을 남기지 못했어요. 다시 눌러 주세요.');
    });
  }
  function openVisitors() {
    var c = cls();
    if (!(c && c.key && net())) return;
    openModal(function (card) {
      card.classList.add('cp-wide');
      card.appendChild(el('h2', 'cp-card-title', '📜 내 공원 방문 기록'));
      var box = el('div', 'cp-friends'); box.appendChild(el('p', 'cp-card-line', '불러오는 중…')); card.appendChild(box);
      acts(card, [{ text: '닫기', fn: function () { closeModal(); } }]);
      Promise.all([net().shared.get(c.code, 'parkvisits/' + c.key), net().shared.get(c.code, 'parkstars/' + c.key)]).then(function (r) {
        var vis = r[0] || {}, stars = r[1] || {};
        box.textContent = '';
        box.appendChild(el('p', 'cp-starsum', '★ 받은 별 ' + Object.keys(stars).length + '개'));
        var keys = Object.keys(vis).sort(function (a, b) { return (vis[b].at || 0) - (vis[a].at || 0); });
        if (!keys.length) { box.appendChild(el('p', 'cp-card-line', '아직 놀러 온 친구가 없어요. 친구들에게 공원을 자랑해 봐요!')); return; }
        keys.forEach(function (k) {
          var v = vis[k], row = el('div', 'cp-friend cp-visit');
          var t = el('div', 'cp-friend-text');
          t.appendChild(el('p', 'cp-friend-nick', (v.n || net().keyNick(k)) + (stars[k] ? ' ★' : '')));
          t.appendChild(el('p', 'cp-friend-park', whenText(v.at) + ' · ' + (v.c || 1) + '번 놀러 왔어요'));
          row.appendChild(t); box.appendChild(row);
        });
      }, function (err) {
        console.error('방문 기록 실패', err);
        box.textContent = ''; box.appendChild(el('p', 'cp-err', '방문 기록을 불러오지 못했어요.'));
      });
    });
  }
  function whenText(t) {
    if (!t) return '';
    var d = new Date(t), now = new Date();
    var same = d.toDateString() === now.toDateString();
    var hm = d.getHours() + '시 ' + String(d.getMinutes()).padStart(2, '0') + '분';
    return same ? '오늘 ' + hm : (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + hm;
  }
  function showEmote(e) { S.emote = { e: e, until: performance.now() + 2600 }; }

  // ---------- 시작 ----------
  function init() {
    if (!document.getElementById('cloudpark')) return;
    build();
    window.addEventListener('keydown', function (e) { onKey(e, true); });
    window.addEventListener('keyup', function (e) { onKey(e, false); });
    window.addEventListener('blur', function () { S.keys = {}; });
    window.addEventListener('resize', function () { if (S.open) { resize(); if (S.mode === 'walk') snapCam(); } });
    ui.canvas.addEventListener('pointerdown', onDown);
    ui.canvas.addEventListener('pointermove', onMove);
    ui.canvas.addEventListener('pointerup', onUp);
    ui.canvas.addEventListener('pointercancel', onUp);
    ui.canvas.addEventListener('pointerleave', onHoverLeave);
    ui.canvas.addEventListener('wheel', onWheel, { passive: false });
    ui.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && S.open && S.save.timer) flushSave(false); });
    window.addEventListener('pagehide', function () { if (S.open && S.save.timer) flushSave(false); });
  }
  window.MPCloudPark = {
    open: open, close: close, _state: S, _ui: ui,
    // 검증용
    _debug: {
      setMode: setMode, chooseTool: chooseTool, placeAt: function (t, x, y, d) { var p = L.snap(t, x, y); var def = D.ITEMS[t]; return placeAt({ t: t, x: p.x, y: p.y, d: d || def.dirOrder[0] }, false); },
      select: select, rotateSel: rotateSel, recallSel: recallSel, undo: undo, redo: redo, flushSave: flushSave, visit: visit, backToMine: backToMine,
      toggleStar: toggleStar, standOk: standOk,
      tick: function (n, dt) { for (var i = 0; i < (n || 1); i++) { step(dt || 1 / 60); updateCam(dt || 1 / 60); } render(); return S.me; }, findRoute: findRoute, toWorld: toWorld, toScreen: toScreen, render: render,
      moveItem: function (id, x, y) { var it = S.park.items[id], sp = L.snap(it.t, x, y), cand = { t: it.t, x: sp.x, y: sp.y, d: it.d }; var ok = L.canPlace(S.park, cand, M, id, S.idx); if (ok.ok) commit(function (p) { p.items[id].x = sp.x; p.items[id].y = sp.y; }); return ok; }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
