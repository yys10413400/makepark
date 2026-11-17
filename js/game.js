/* 메이크파크 - 공원 이동 / 시설 접근 / 입장 안내 */
(function () {
  'use strict';
  var PARK = window.MP_PARK;
  var W = PARK.world.width, H = PARK.world.height;
  var SAVE_KEY = 'makepark.save.v1';

  var grid = new WalkGrid(window.MP_WALKMASK, PARK);
  var character = createCharacter(window.MP_CHARACTER);

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('stage'), ctx = canvas.getContext('2d');
  var ui = {
    title: $('title'), form: $('titleForm'), nickname: $('nickname'), enterPark: $('enterPark'),
    hint: $('titleHint'), welcome: $('welcomeBack'),
    hud: $('hud'), playerName: $('playerName'), mapToggle: $('mapToggle'),
    seasonToggle: $('seasonToggle'), seasonLabel: $('seasonLabel'),
    mapBar: $('mapBar'), mapBack: $('mapBack'),
    enter: $('enterFacility'), enterName: $('enterName'),
    toast: $('toast'),
    modal: $('modal'), modalTitle: $('modalTitle'), modalDesc: $('modalDesc'), modalClose: $('modalClose'),
    debug: $('debugPanel')
  };

  // ---------- 상태 ----------
  var state = {
    phase: 'title',            // title | play
    view: 'play',              // play | map
    player: { x: PARK.start.x, y: PARK.start.y, dir: 'up', moving: false },
    path: null,                // [{x,y}] 남은 경유점
    dest: null,                // 최종 목적지 표시
    nearby: null,              // 입구 근처 시설
    modalFacility: null,
    keys: {},
    debug: /[?&]debug=1/.test(location.search),
    mouseWorld: null,
    time: 0
  };
  var cam = { cx: W / 2, cy: H / 2, s: 1 };
  var view = { w: 1, h: 1, dpr: 1 };

  // ---------- 배경 이미지 (시즌) ----------
  // 모든 시즌 지도를 미리 불러 두고, 바꿀 때는 부드럽게 겹쳐 전환합니다.
  var seasonImgs = {};
  Object.keys(PARK.seasons).forEach(function (id) {
    var img = new Image();
    img.onload = function () {
      // 비율 유지: 지도 좌표계(W×H) 안에 원본 비율 그대로 맞춤
      var k = Math.min(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
      seasonImgs[id] = { img: img, rect: { x: (W - w) / 2, y: (H - h) / 2, w: w, h: h }, occ: buildOccluders(img) };
    };
    img.onerror = function () { console.error('지도 이미지를 불러오지 못했습니다: ' + PARK.seasons[id].map); };
    img.src = PARK.seasons[id].map;
  });
  var fade = { from: null, t: 1 };

  // ---------- 가림 레이어 (캐릭터가 건물 뒤로 지나갈 때) ----------
  // tools/build_walkmask.py 의 길 판정과 같은 규칙. 길 픽셀은 투명하게 빼고 건물·나무만 남김.
  function isPavingPixel(r, g, b) {
    return r > 215 && r - g >= 20 && r - g <= 48 && g - b >= -4 && g - b <= 26 && b > 160;
  }
  function buildOccluders(img) {
    // 지도 좌표 = 이미지 픽셀 (같은 크기일 때). 크기가 다르면 비율대로 맞춤
    var kx = img.naturalWidth / W, ky = img.naturalHeight / H;
    return (PARK.occluders || []).map(function (o) {
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(o.w * kx)); c.height = Math.max(1, Math.round(o.h * ky));
      var g = c.getContext('2d');
      g.drawImage(img, o.x * kx, o.y * ky, o.w * kx, o.h * ky, 0, 0, c.width, c.height);
      try {
        var d = g.getImageData(0, 0, c.width, c.height), px = d.data;
        for (var i = 0; i < px.length; i += 4) if (isPavingPixel(px[i], px[i + 1], px[i + 2])) px[i + 3] = 0;
        g.putImageData(d, 0, 0);
      } catch (e) { return null; } // 픽셀을 읽을 수 없는 환경이면 가림 없이 진행
      return c;
    });
  }
  // 캐릭터 그림이 차지하는 대략의 영역(발 위치 기준)
  function spriteBox(p) { return { x0: p.x - 16, x1: p.x + 16, y0: p.y - 64, y1: p.y + 6 }; }
  /* 캐릭터보다 앞(남쪽)에 있는 물체를 캐릭터 위에 다시 그림. 가렸으면 true */
  function drawOccluders(p) {
    var cur = seasonImgs[state.season];
    if (!cur || !cur.occ) return false;
    var b = spriteBox(p), hidden = false;
    (PARK.occluders || []).forEach(function (o, i) {
      if (p.y >= o.baseY || !cur.occ[i]) return;
      if (b.x1 < o.x || b.x0 > o.x + o.w || b.y1 < o.y || b.y0 > o.y + o.h) return;
      ctx.drawImage(cur.occ[i], o.x, o.y, o.w, o.h);
      hidden = true;
    });
    return hidden;
  }
  function setSeason(id, animate) {
    if (!PARK.seasons[id]) id = PARK.defaultSeason;
    if (id === state.season) return;
    fade.from = animate ? state.season : null; fade.t = animate ? 0 : 1;
    state.season = id;
    ui.seasonLabel.textContent = PARK.seasons[id].label;
    ui.seasonToggle.setAttribute('aria-label', '계절 바꾸기 (지금: ' + PARK.seasons[id].label + ')');
    // 계절만 저장: 위치·학년·진행 기록은 그대로 둠
    var data = readSave() || {};
    data.season = id;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* 저장 불가 환경 */ }
  }
  function nextSeason() {
    var ids = Object.keys(PARK.seasons);
    return ids[(ids.indexOf(state.season) + 1) % ids.length];
  }

  // ---------- 저장 ----------
  function readSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch (e) { return null; }
  }
  function writeSave() {
    if (state.phase !== 'play') return;
    var p = state.player, data = readSave() || {};
    data.nickname = state.nickname; data.grade = state.grade;
    if (grid.isWalkable(p.x, p.y)) data.pos = { x: Math.round(p.x), y: Math.round(p.y) };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* 저장 불가 환경 */ }
  }
  function validPos(pos) {
    return pos && isFinite(pos.x) && isFinite(pos.y) && grid.isWalkable(pos.x, pos.y);
  }

  // ---------- 첫 화면 ----------
  var saved = readSave();
  setSeason((saved && saved.season) || PARK.defaultSeason, false);
  ui.seasonToggle.addEventListener('click', function () { setSeason(nextSeason(), true); ui.seasonToggle.blur(); });
  if (saved) {
    if (saved.nickname) ui.nickname.value = saved.nickname;
    if (saved.grade) {
      var r = ui.form.querySelector('input[name=grade][value="' + saved.grade + '"]');
      if (r) r.checked = true;
    }
    if (saved.nickname) { ui.welcome.textContent = saved.nickname + '님, 다시 오셨네요!'; ui.welcome.hidden = false; }
  }
  function selectedGrade() {
    var r = ui.form.querySelector('input[name=grade]:checked'); return r ? r.value : null;
  }
  function updateTitle() {
    var name = ui.nickname.value.trim(), g = selectedGrade();
    ui.enterPark.disabled = !(name && g);
    ui.hint.textContent = !name ? '닉네임을 적어 주세요' : !g ? '학년을 골라 주세요' : '준비 완료!';
  }
  ui.form.addEventListener('input', updateTitle);
  ui.form.addEventListener('change', updateTitle);
  updateTitle();
  ui.form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = ui.nickname.value.trim(), g = selectedGrade();
    if (!name || !g) return;
    enterPark(name, g);
  });

  function enterPark(name, grade) {
    state.nickname = name; state.grade = grade;
    var s = readSave();
    var keepPos = s && validPos(s.pos);
    state.player.x = keepPos ? s.pos.x : PARK.start.x;
    state.player.y = keepPos ? s.pos.y : PARK.start.y;
    state.player.dir = 'up';
    state.phase = 'play'; state.view = 'play';
    ui.title.hidden = true; ui.hud.hidden = false;
    ui.playerName.textContent = name;
    ui.nickname.blur();
    snapCamera();
    writeSave();
  }

  // ---------- 카메라 ----------
  function fitScale() { return Math.min(view.w / W, view.h / H); }
  function coverScale() { return Math.max(view.w / W, view.h / H); }
  function playScale() {
    var c = PARK.camera;
    var s = Math.min(view.w / c.playViewWidth, view.h / c.playViewHeight, c.maxScale);
    return Math.max(s, coverScale()); // 지도 밖이 보이지 않게
  }
  function camTarget() {
    if (state.phase !== 'play') return { cx: W / 2, cy: H / 2, s: coverScale() }; // 첫 화면: 지도로 화면 채우기
    if (state.view === 'map') return { cx: W / 2, cy: H / 2, s: fitScale() };
    var s = playScale();
    return clampCenter(state.player.x, state.player.y - 20, s);
  }
  function clampCenter(cx, cy, s) {
    var hw = view.w / (2 * s), hh = view.h / (2 * s);
    cx = hw * 2 >= W ? W / 2 : Math.min(Math.max(cx, hw), W - hw);
    cy = hh * 2 >= H ? H / 2 : Math.min(Math.max(cy, hh), H - hh);
    return { cx: cx, cy: cy, s: s };
  }
  function snapCamera() { var t = camTarget(); cam.cx = t.cx; cam.cy = t.cy; cam.s = t.s; }
  function updateCamera(dt) {
    var t = camTarget(), k = 1 - Math.exp(-PARK.camera.follow * dt);
    cam.s += (t.s - cam.s) * k;
    cam.cx += (t.cx - cam.cx) * k; cam.cy += (t.cy - cam.cy) * k;
    if (state.view === 'play' && state.phase === 'play' && Math.abs(cam.s - t.s) < 0.02) {
      var c = clampCenter(cam.cx, cam.cy, cam.s); cam.cx = c.cx; cam.cy = c.cy;
    }
  }
  // 화면 좌표(CSS px) ↔ 지도 좌표
  function screenToWorld(sx, sy) {
    return { x: (sx - view.w / 2) / cam.s + cam.cx, y: (sy - view.h / 2) / cam.s + cam.cy };
  }
  function worldToScreen(wx, wy) {
    return { x: (wx - cam.cx) * cam.s + view.w / 2, y: (wy - cam.cy) * cam.s + view.h / 2 };
  }

  function resize() {
    var r = canvas.getBoundingClientRect();
    view.w = Math.max(1, r.width); view.h = Math.max(1, r.height);
    view.dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(view.w * view.dpr); canvas.height = Math.round(view.h * view.dpr);
    snapCamera();
  }
  window.addEventListener('resize', resize);

  // ---------- 이동 ----------
  function setDestination(wx, wy) {
    var p = state.player;
    var near = grid.nearestWalkable(wx, wy);
    if (!near || near.dist > PARK.maxSnapDistance) { toast('그곳으로는 갈 수 없어요'); return false; }
    var path = grid.findPath(p.x, p.y, near.x, near.y);
    if (!path) { toast('그곳으로는 갈 수 없어요'); return false; }
    state.path = path; state.dest = { x: near.x, y: near.y };
    return true;
  }
  function stopMoving() { state.path = null; state.dest = null; }

  function stepPlayer(dt) {
    var p = state.player, speed = PARK.player.speed, k = state.keys;
    var ix = (k.right ? 1 : 0) - (k.left ? 1 : 0), iy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
    p.moving = false;
    if (state.modalFacility) return;
    if (ix || iy) {
      stopMoving();
      var len = Math.hypot(ix, iy), dx = ix / len * speed * dt, dy = iy / len * speed * dt;
      // 한 번에 2px 이하로 나눠 움직여 가장자리에서 자연스럽게 미끄러지게
      var steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2));
      for (var k = 0; k < steps; k++) tryMove(dx / steps, dy / steps);
      setDir(ix, iy); p.moving = true;
      return;
    }
    if (state.path && state.path.length) {
      var budget = speed * dt;
      while (budget > 0 && state.path.length) {
        var t = state.path[0], ddx = t.x - p.x, ddy = t.y - p.y, d = Math.hypot(ddx, ddy);
        if (d <= budget) { p.x = t.x; p.y = t.y; budget -= d; state.path.shift(); }
        else { p.x += ddx / d * budget; p.y += ddy / d * budget; budget = 0; setDir(ddx, ddy); }
      }
      p.moving = true;
      if (!state.path.length) stopMoving();
    }
  }
  // 키보드 이동: 막히면 벽을 따라 미끄러지듯 이동 (굽은 길에서도 멈추지 않게)
  // 마지막 ±1.57(90°)은 계단 모양 가장자리에서 옆으로 한 걸음 비켜서는 동작
  var SLIDE_ANGLES = [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.35, -1.35, 1.5708, -1.5708];
  function tryMove(dx, dy) {
    var p = state.player;
    if (grid.isWalkable(p.x + dx, p.y + dy)) { p.x += dx; p.y += dy; return true; }
    if (dx && dy) { // 대각선: 한 축이라도 갈 수 있으면 그쪽으로
      if (grid.isWalkable(p.x + dx, p.y)) { p.x += dx; return true; }
      if (grid.isWalkable(p.x, p.y + dy)) { p.y += dy; return true; }
    }
    for (var i = 0; i < SLIDE_ANGLES.length; i++) {
      var a = SLIDE_ANGLES[i], c = Math.cos(a), s = Math.sin(a), k = 0.85;
      var rx = (dx * c - dy * s) * k, ry = (dx * s + dy * c) * k;
      if (grid.isWalkable(p.x + rx, p.y + ry)) { p.x += rx; p.y += ry; return true; }
    }
    return false;
  }

  function setDir(dx, dy) {
    var p = state.player;
    if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 'right' : 'left'; else p.dir = dy > 0 ? 'down' : 'up';
  }

  // ---------- 시설 ----------
  function findNearby() {
    var p = state.player, best = null, bd = Infinity;
    PARK.facilities.forEach(function (f) {
      var d = Math.hypot(f.entrance.x - p.x, f.entrance.y - p.y);
      if (d <= f.radius && d < bd) { bd = d; best = f; }
    });
    return best;
  }
  function updateNearby() {
    var f = state.phase === 'play' && state.view === 'play' && !state.modalFacility ? findNearby() : null;
    if (f !== state.nearby) {
      state.nearby = f;
      ui.enter.hidden = !f;
      if (f) ui.enterName.textContent = f.name;
    }
  }
  function openFacility(f) {
    if (!f || state.modalFacility) return;
    stopMoving(); state.keys = {};
    state.modalFacility = f;
    ui.modalTitle.textContent = f.name; ui.modalDesc.textContent = f.desc;
    ui.modal.hidden = false; ui.enter.hidden = true; state.nearby = null;
    ui.modalClose.focus();
  }
  function closeFacility() {
    if (!state.modalFacility) return;
    state.modalFacility = null; ui.modal.hidden = true; state.keys = {};
    ui.modalClose.blur();
  }
  ui.enter.addEventListener('click', function () { openFacility(state.nearby); });
  ui.modalClose.addEventListener('click', closeFacility);
  ui.modal.addEventListener('pointerdown', function (e) { if (e.target === ui.modal) closeFacility(); });

  // ---------- 전체 지도 ----------
  function setView(v) {
    state.view = v;
    ui.mapBar.hidden = v !== 'map';
    ui.mapToggle.hidden = v === 'map';
    updateNearby();
  }
  ui.mapToggle.addEventListener('click', function () { setView('map'); });
  ui.mapBack.addEventListener('click', function () { setView('play'); });

  // ---------- 입력 ----------
  var KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  window.addEventListener('keydown', function (e) {
    if (e.code === 'F2') { e.preventDefault(); state.debug = !state.debug; return; }
    if (state.phase !== 'play') return;
    if (state.modalFacility) {
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); closeFacility(); }
      return;
    }
    if (KEYMAP[e.code]) {
      e.preventDefault();
      if (state.view === 'map') setView('play');
      state.keys[KEYMAP[e.code]] = true; return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat && state.nearby) openFacility(state.nearby);
    } else if (e.code === 'KeyM') {
      setView(state.view === 'map' ? 'play' : 'map');
    } else if (e.code === 'Escape' && state.view === 'map') setView('play');
  });
  window.addEventListener('keyup', function (e) { if (KEYMAP[e.code]) state.keys[KEYMAP[e.code]] = false; });
  window.addEventListener('blur', function () { state.keys = {}; });

  function eventPoint(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (state.phase !== 'play' || state.modalFacility) return;
    e.preventDefault();
    var sp = eventPoint(e), w = screenToWorld(sp.x, sp.y);
    if (state.view === 'map') {
      var hit = pinAt(sp.x, sp.y);
      if (hit) {
        if (setDestination(hit.entrance.x, hit.entrance.y)) setView('play');
      } else if ((grid.nearestWalkable(w.x, w.y) || { dist: Infinity }).dist <= PARK.maxSnapDistance) {
        setDestination(w.x, w.y);
      }
      return;
    }
    setDestination(w.x, w.y);
  });
  canvas.addEventListener('pointermove', function (e) {
    var sp = eventPoint(e); state.mouseWorld = screenToWorld(sp.x, sp.y);
  });

  function pinAt(sx, sy) {
    var best = null, bd = 30;
    PARK.facilities.forEach(function (f) {
      var s = worldToScreen(f.pin.x, f.pin.y), d = Math.hypot(s.x - sx, s.y - 14 - sy);
      if (d < bd) { bd = d; best = f; }
    });
    return best;
  }

  var toastTimer = 0;
  function toast(msg) {
    ui.toast.textContent = msg; ui.toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { ui.toast.hidden = true; }, 1600);
  }

  // ---------- 그리기 ----------
  function draw() {
    var d = view.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#9fcf8a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(d * cam.s, 0, 0, d * cam.s, d * (view.w / 2 - cam.cx * cam.s), d * (view.h / 2 - cam.cy * cam.s));
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    var cur = seasonImgs[state.season], prev = fade.from && seasonImgs[fade.from];
    if (prev && fade.t < 1) {
      ctx.drawImage(prev.img, prev.rect.x, prev.rect.y, prev.rect.w, prev.rect.h);
      ctx.globalAlpha = fade.t;
    }
    if (cur) ctx.drawImage(cur.img, cur.rect.x, cur.rect.y, cur.rect.w, cur.rect.h);
    ctx.globalAlpha = 1;
    if (state.phase !== 'play') return;

    if (state.debug) drawDebugWorld();

    // 목적지 표시
    if (state.dest) {
      var pulse = 1 + Math.sin(state.time * 6) * 0.15;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(state.dest.x, state.dest.y, 11 * pulse, 5 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,122,89,0.95)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(state.dest.x, state.dest.y, 6 * pulse, 2.6 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // 가까운 시설 입구 표시
    if (state.nearby && state.view === 'play') {
      var e = state.nearby.entrance, a = 0.45 + Math.sin(state.time * 5) * 0.2;
      ctx.fillStyle = 'rgba(255,230,120,' + a * 0.45 + ')';
      ctx.strokeStyle = 'rgba(255,255,255,' + a + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 26, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    var p = state.player;
    character.draw(ctx, p.x, p.y, p.dir, p.moving, state.time);
    // 앞쪽 건물·나무가 캐릭터를 가리면, 잃어버리지 않게 흐린 윤곽을 한 번 더 그림
    state.hidden = drawOccluders(p);
    if (state.hidden) {
      ctx.globalAlpha = 0.35;
      character.draw(ctx, p.x, p.y, p.dir, p.moving, state.time);
      ctx.globalAlpha = 1;
    }
    if (state.debug) drawDebugOccluders();

    // 전체 지도: 시설 핀 + 내 위치 (이름 글자는 지도에 이미 그려져 있으므로 표시하지 않음)
    var mapAlpha = Math.min(1, Math.max(0, (playScale() - cam.s) / Math.max(0.001, playScale() - fitScale())));
    if (state.view === 'map' && mapAlpha > 0.05) drawMapOverlay(mapAlpha);
  }

  function drawMapOverlay(alpha) {
    var d = view.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = alpha;
    PARK.facilities.forEach(function (f) {
      var s = worldToScreen(f.pin.x, f.pin.y);
      drawPin(s.x, s.y, '#ff7a59');
    });
    var me = worldToScreen(state.player.x, state.player.y), r = 9 + Math.sin(state.time * 5) * 2;
    ctx.fillStyle = 'rgba(255,107,107,0.35)'; ctx.beginPath(); ctx.arc(me.x, me.y, r + 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff6b6b'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(me.x, me.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function drawPin(x, y, color) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 2, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-4, -8, -11, -12, -11, -20);
    ctx.arc(0, -20, 11, Math.PI, 0); ctx.bezierCurveTo(11, -12, 4, -8, 0, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -20, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawDebugOccluders() {
    (PARK.occluders || []).forEach(function (o) {
      var behind = state.player.y < o.baseY;
      ctx.strokeStyle = behind ? 'rgba(255,0,255,0.9)' : 'rgba(0,255,255,0.7)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      ctx.beginPath(); ctx.moveTo(o.x, o.baseY); ctx.lineTo(o.x + o.w, o.baseY); ctx.stroke();
      ctx.fillStyle = '#000'; ctx.font = '11px monospace'; ctx.fillText(o.id, o.x + 3, o.y + 12);
    });
  }

  function drawDebugWorld() {
    var c = grid.cell;
    for (var i = 0; i < grid.walk.length; i++) {
      if (!grid.walk[i] && !grid.raw[i]) continue;
      var x = (i % grid.cols) * c, y = ((i / grid.cols) | 0) * c;
      ctx.fillStyle = grid.walk[i] ? 'rgba(0,200,120,0.28)' : 'rgba(255,60,60,0.30)';
      ctx.fillRect(x, y, c, c);
    }
    PARK.walkEdits.forEach(function (e) {
      ctx.strokeStyle = e.op === 'add' ? '#00e1ff' : '#ff2d55'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath();
      if (e.rect) ctx.rect(e.rect.x, e.rect.y, e.rect.w, e.rect.h);
      else ctx.ellipse(e.ellipse.cx, e.ellipse.cy, e.ellipse.rx, e.ellipse.ry, 0, 0, Math.PI * 2);
      ctx.stroke(); ctx.setLineDash([]);
    });
    PARK.facilities.forEach(function (f) {
      ctx.strokeStyle = '#ffe600'; ctx.fillStyle = 'rgba(255,230,0,0.18)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.entrance.x, f.entrance.y, f.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe600'; ctx.fillRect(f.entrance.x - 3, f.entrance.y - 3, 6, 6);
      ctx.fillStyle = '#000'; ctx.font = '12px monospace'; ctx.fillText(f.id, f.entrance.x + 6, f.entrance.y - 6);
    });
    PARK.landmarks.forEach(function (l) {
      ctx.strokeStyle = '#7df9ff'; ctx.beginPath(); ctx.arc(l.x, l.y, 10, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.fillStyle = '#00f'; ctx.fillRect(PARK.start.x - 4, PARK.start.y - 4, 8, 8);
    if (state.path && state.path.length) {
      ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(state.player.x, state.player.y);
      state.path.forEach(function (q) { ctx.lineTo(q.x, q.y); }); ctx.stroke();
    }
  }

  function updateDebugPanel(fps) {
    ui.debug.hidden = !state.debug;
    if (!state.debug) return;
    var m = state.mouseWorld, p = state.player;
    ui.debug.textContent = '[디버그] F2로 끄기\n' +
      '마우스 지도좌표: ' + (m ? Math.round(m.x) + ', ' + Math.round(m.y) : '-') + '\n' +
      '캐릭터: ' + Math.round(p.x) + ', ' + Math.round(p.y) + (grid.isWalkable(p.x, p.y) ? '' : ' (막힌 칸!)') + '\n' +
      '배율: ' + cam.s.toFixed(2) + '  화면: ' + Math.round(view.w) + '×' + Math.round(view.h) + ' @' + view.dpr + '\n' +
      '배경: ' + PARK.seasons[state.season].map + (seasonImgs[state.season] ? '' : ' (로딩 중)') + '\n' +
      '캐릭터 그림: ' + (character.isPlaceholder ? '임시 캐릭터' : '스프라이트') + '\n' +
      '근처 시설: ' + (state.nearby ? state.nearby.name : '-') + '  fps ' + fps;
  }

  // ---------- 루프 ----------
  var last = performance.now(), saveTimer = 0, fpsCount = 0, fpsTime = 0, fps = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    state.time += dt;
    if (fade.t < 1) fade.t = Math.min(1, fade.t + dt / 0.6);
    if (state.phase === 'play') {
      stepPlayer(dt);
      updateNearby();
      saveTimer += dt;
      if (saveTimer > 1) { saveTimer = 0; writeSave(); }
    }
    updateCamera(dt);
    draw();
    fpsCount++; fpsTime += dt;
    if (fpsTime >= 0.5) { fps = Math.round(fpsCount / fpsTime); fpsCount = 0; fpsTime = 0; }
    updateDebugPanel(fps);
    requestAnimationFrame(frame);
  }
  window.addEventListener('pagehide', writeSave);
  document.addEventListener('visibilitychange', function () { if (document.hidden) writeSave(); });

  resize();
  requestAnimationFrame(frame);

  if (/[?&]debug=1/.test(location.search)) {
    var t = document.createElement('script'); t.src = 'js/dev-selftest.js'; document.body.appendChild(t);
  }

  // 개발·검증용 핸들 (게임 동작에는 쓰이지 않음)
  window.MP_DEV = {
    state: state, cam: cam, grid: grid, park: PARK,
    screenToWorld: screenToWorld, worldToScreen: worldToScreen,
    reachAll: function () {
      return PARK.facilities.map(function (f) {
        var t = grid.nearestWalkable(f.entrance.x, f.entrance.y);
        var path = t && grid.findPath(PARK.start.x, PARK.start.y, t.x, t.y);
        return { id: f.id, entranceWalkable: grid.isWalkable(f.entrance.x, f.entrance.y), snap: t && Math.round(t.dist), reachable: !!path };
      });
    }
  };
})();
