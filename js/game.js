/* 상상마루 - 공원 이동 / 시설 접근 / 입장 안내 */
(function () {
  'use strict';
  var PARK = window.MP_PARK;
  var W = PARK.world.width, H = PARK.world.height;
  var SAVE_KEY = 'makepark.save.v1';
  // 지금 쓰는 저장 칸: 기본은 이 기기 기록. 반 공원에 들어가면 그 학생의 반 기록 칸(서버와 함께 저장)으로 바뀜
  var saveKey = SAVE_KEY, saveHook = null;

  // 걸을 수 있는 영역: 계절마다 따로(공통 walkEdits + 그 계절 지도에만 있는 물체의 walkEdits). 지금 계절 것을 grid 로 씀
  var grids = {};
  Object.keys(PARK.seasons).forEach(function (id) {
    var edits = (PARK.walkEdits || []).concat(PARK.seasons[id].walkEdits || []);
    grids[id] = new WalkGrid(window.MP_WALKMASK, Object.assign({}, PARK, { walkEdits: edits }));
  });
  var grid = grids[PARK.defaultSeason];
  // 캐릭터: 고른 완성형 캐릭터(js/characters.js)로 그리고, 그림을 불러오기 전에는 임시 캐릭터로 그림
  var placeholder = createCharacter(window.MP_CHARACTER);
  var character = window.MPChars ? new MPChars.Walker(Object.assign({ fallback: placeholder }, charSave(readSave()))) : placeholder;
  var teacherAvatar = null;   // 선생님 모드일 때 동물 선생님 id (js/teacher-chars.js)

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('stage'), ctx = canvas.getContext('2d');
  var ui = {
    title: $('title'), form: $('titleForm'), nickname: $('nickname'), enterPark: $('enterPark'),
    hint: $('titleHint'), welcome: $('welcomeBack'), nickError: $('nickError'), storageNote: $('storageNote'),
    profile: $('profile'), profileForm: $('profileForm'), profileNick: $('profileNick'),
    profileNickError: $('profileNickError'), profileCancel: $('profileCancel'), profileSave: $('profileSave'),
    hud: $('hud'), playerChip: $('playerChip'), playerName: $('playerName'), playerGrade: $('playerGrade'),
    miniMap: $('miniMap'), miniCanvas: $('miniCanvas'), ticketChip: $('ticketChip'), ticketCount: $('ticketCount'),
    mapBar: $('mapBar'), mapBack: $('mapBack'),
    enter: $('enterFacility'), enterName: $('enterName'),
    toast: $('toast'),
    modal: $('modal'), modalTitle: $('modalTitle'), modalDesc: $('modalDesc'), modalClose: $('modalClose'),
    debug: $('debugPanel'),
    charBtn: $('charOpen'), charDlg: $('charDlg'), charTitle: $('charTitle'), charTickets: $('charTickets'),
    charList: $('charList'), charMsg: $('charMsg'), charClose: $('charClose')
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
  // 시작 계절 지도를 가장 먼저(높은 우선순위로) 받고, 다른 계절 지도는 그다음에 받습니다.
  // (느린 학교 인터넷에서 지도가 놀이기구 그림들과 인터넷을 나눠 쓰느라 늦게 뜨지 않게)
  // 계절을 바꿀 때 아직 안 받은 지도면 그때 바로 받고, 다 받으면 부드럽게 겹쳐 전환합니다.
  var seasonImgs = {}, seasonLoading = {};
  function loadSeason(id, urgent) {
    if (!PARK.seasons[id] || seasonLoading[id]) return;
    seasonLoading[id] = true;
    var img = new Image(), ground = null, groundDone = !PARK.seasons[id].ground;
    if (urgent) img.fetchPriority = 'high';
    function ready() { // 지도와 땅 지도(있으면)를 모두 받은 뒤 가림 레이어를 만듦
      if (!img.complete || !img.naturalWidth || !groundDone) return;
      // 비율 유지: 지도 좌표계(W×H) 안에 원본 비율 그대로 맞춤
      var k = Math.min(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
      seasonImgs[id] = { img: img, rect: { x: (W - w) / 2, y: (H - h) / 2, w: w, h: h }, occ: buildOccluders(img, ground, grids[id]) };
      if (id === firstSeason) loadOtherSeasons();
    }
    img.onload = ready;
    img.onerror = function () { console.error('지도 이미지를 불러오지 못했습니다: ' + PARK.seasons[id].map); if (id === firstSeason) loadOtherSeasons(); };
    if (PARK.seasons[id].ground) {
      var gi = new Image();
      gi.onload = function () { ground = gi; groundDone = true; ready(); };
      gi.onerror = function () { console.error('땅 지도를 불러오지 못했습니다: ' + PARK.seasons[id].ground); groundDone = true; ready(); };
      gi.src = PARK.seasons[id].ground;
    }
    img.src = PARK.seasons[id].map;
  }
  var firstSeason = PARK.seasons[PARK.defaultSeason] ? PARK.defaultSeason : Object.keys(PARK.seasons)[0];
  function loadOtherSeasons() { Object.keys(PARK.seasons).forEach(function (id) { loadSeason(id, false); }); }
  loadSeason(firstSeason, true);
  setTimeout(loadOtherSeasons, 8000); // 시작 지도가 아주 늦어도 결국 모두 받음
  var fade = { from: null, t: 1 };
  var ringImg = new Image(); ringImg.src = 'assets/ui/entrance-ring.png';

  // ---------- 가림 레이어 (캐릭터가 건물 뒤로 지나갈 때) ----------
  // 건물·나무만 남기고 길(땅)은 지워야 캐릭터가 '막'에 덮이지 않음.
  // 길이 어디인지는 계절마다 미리 만든 땅 지도(seasons.<계절>.ground, tools/build_ground_mask.py)를 씀:
  // 눈길과 눈 덮인 지붕처럼 색이 같은 경우에도 정확함. 땅 지도가 없으면 가림 레이어를 쓰지 않음(캐릭터가 늘 보임).
  function buildOccluders(img, ground, wgrid) {
    if (!ground) return null;
    // 지도 좌표 = 이미지 픽셀 (같은 크기일 때). 크기가 다르면 비율대로 맞춤
    var kx = img.naturalWidth / W, ky = img.naturalHeight / H;
    var gx = ground.naturalWidth / W, gy = ground.naturalHeight / H;
    return (PARK.occluders || []).map(function (o) {
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(o.w * kx)); c.height = Math.max(1, Math.round(o.h * ky));
      var g = c.getContext('2d');
      g.drawImage(img, o.x * kx, o.y * ky, o.w * kx, o.h * ky, 0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-out'; // 땅 지도의 불투명 부분(길)을 지움
      g.drawImage(ground, o.x * gx, o.y * gy, o.w * gx, o.h * gy, 0, 0, c.width, c.height);
      g.globalCompositeOperation = 'source-over';
      // 세로줄(지도 x 1칸)마다 '물체 조각' 목록 [위 y, 아래 y). 조각의 아래 끝이 캐릭터 발보다 남쪽일 때만 그 조각이 캐릭터를 가림.
      //  - 길(땅)에서 끊김 → 섬 앞 길에 선 캐릭터 위로 섬 뒤 덤불이 그려지지 않음
      //  - 건물에 가려진 숨은 길(걸을 수 있는데 그림은 건물인 칸)의 위 끝에서도 끊김
      //    → 건물 뒤 길에 선 캐릭터 위로 건물보다 더 뒤에 있는 나무·물이 그려지지 않음
      var runs = [];
      var m = document.createElement('canvas'); m.width = o.w; m.height = o.h;
      var mg = m.getContext('2d');
      mg.drawImage(ground, o.x * gx, o.y * gy, o.w * gx, o.h * gy, 0, 0, o.w, o.h);
      try {
        var px = mg.getImageData(0, 0, o.w, o.h).data;
        var hiddenAt = function (x, y) { // 숨은 길: 걸을 수 있는 칸인데 그림은 땅이 아님
          if (y < 0 || !wgrid) return false;
          var i = wgrid.idx(o.x + x + 0.5, o.y + y + 0.5);
          return i >= 0 && wgrid.walk[i] === 1 && px[(y * o.w + x) * 4 + 3] < 128;
        };
        for (var x = 0; x < o.w; x++) {
          var col = [], start = -1;
          for (var y = 0; y < o.h; y++) {
            var solid = px[(y * o.w + x) * 4 + 3] < 128;
            var split = solid && hiddenAt(x, y) && !hiddenAt(x, y - 1);
            if (start >= 0 && (!solid || split)) { col.push(start, y); start = -1; }
            if (solid && start < 0) start = y;
          }
          if (start >= 0) col.push(start, o.h);
          runs.push(col);
        }
      } catch (e) { // 읽을 수 없으면 예전처럼 물체 전체를 baseY 한 줄로
        for (var i = 0; i < o.w; i++) runs.push([0, o.baseY - o.y]);
      }
      return { c: c, runs: runs };
    });
  }
  var occTmp = document.createElement('canvas'), occTmpCtx = occTmp.getContext('2d');
  // 캐릭터 그림이 차지하는 대략의 영역(발 위치 기준)
  function spriteBox(p) { return { x0: p.x - 16, x1: p.x + 16, y0: p.y - 64, y1: p.y + 6 }; }
  /* 캐릭터보다 앞(남쪽)에 있는 물체를 캐릭터 위에 다시 그림. 가렸으면 true */
  function drawOccluders(p) {
    var cur = seasonImgs[state.season];
    if (!cur || !cur.occ) return false;
    var b = spriteBox(p), hidden = false;
    (PARK.occluders || []).forEach(function (o, i) {
      var oc = cur.occ[i];
      if (p.y >= o.baseY || !oc) return;
      if (o.season && o.season !== state.season) return; // 그 계절 지도에만 있는 물체
      if (b.x1 < o.x || b.x0 > o.x + o.w || b.y1 < o.y || b.y0 > o.y + o.h) return;
      // 캐릭터 폭 안의 세로줄마다, 아래 끝이 발보다 앞(남쪽)인 물체 조각만 다시 그림
      var x0 = Math.max(o.x, Math.floor(b.x0)), x1 = Math.min(o.x + o.w, Math.ceil(b.x1));
      if (x1 <= x0) return;
      var sx = oc.c.width / o.w, sy = oc.c.height / o.h;
      // 조각을 작은 임시 캔버스에 원본 해상도로 모은 뒤 한 번에 그림(확대 화면에서 줄 사이 틈이 생기지 않게)
      var tw = Math.ceil((x1 - x0) * sx), th = oc.c.height;
      if (occTmp.width < tw || occTmp.height < th) { occTmp.width = Math.max(occTmp.width, tw); occTmp.height = Math.max(occTmp.height, th); }
      occTmpCtx.clearRect(0, 0, tw, th);
      var any = false;
      for (var x = x0; x < x1; x++) {
        var col = oc.runs[x - o.x];
        for (var k = 0; k < col.length; k += 2) {
          var t = col[k], bt = col[k + 1];
          if (o.y + bt <= p.y) continue;
          occTmpCtx.drawImage(oc.c, Math.round((x - o.x) * sx), Math.round(t * sy), Math.round(sx), Math.round((bt - t) * sy),
            Math.round((x - x0) * sx), Math.round(t * sy), Math.round(sx), Math.round((bt - t) * sy));
          any = true;
          if (o.y + t < b.y1 && o.y + bt > b.y0) hidden = true;
        }
      }
      if (any) ctx.drawImage(occTmp, 0, 0, tw, th, x0, o.y, tw / sx, o.h);
    });
    return hidden;
  }
  function setSeason(id, animate) {
    if (!PARK.seasons[id]) id = PARK.defaultSeason;
    if (id === state.season) return;
    loadSeason(id, true); // 아직 안 받은 계절 지도면 지금 바로 받음
    fade.from = animate ? state.season : null; fade.t = animate ? 0 : 1;
    state.season = id;
    grid = grids[id];
    // 바뀐 계절에서 막힌 자리(예: 트리)에 서 있으면 가장 가까운 길로 옮기고, 예전 경로는 버림
    var p = state.player;
    if (!grid.isWalkable(p.x, p.y)) {
      var t = grid.nearestWalkable(p.x, p.y);
      if (t) { p.x = t.x; p.y = t.y; }
    }
    stopMoving();
  }

  // ---------- 저장 ----------
  // 기존 저장 키(makepark.save.v1) 하나에 모두 담습니다:
  //   { version, nickname, grade(1~6), updatedAt, pos, season, ...앞으로 생길 티켓·스탬프·작품 }
  // 프로필(닉네임·학년)을 바꿀 때도 나머지 값은 그대로 둡니다.
  var storageOk = true;
  function readSave() {
    try {
      var v = JSON.parse(localStorage.getItem(saveKey));
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch (e) { return null; }
  }
  function patchSave(patch) {
    var data = readSave();
    if (!data) {
      // 저장값이 깨져서 읽을 수 없으면 덮어쓰기 전에 원본을 따로 보관(나중에 복구할 수 있게)
      try { var raw = localStorage.getItem(saveKey); if (raw) localStorage.setItem(saveKey + '.broken', raw); } catch (e) { /* 무시 */ }
      data = {};
    }
    for (var k in patch) data[k] = patch[k];
    data.version = 1;
    try { localStorage.setItem(saveKey, JSON.stringify(data)); storageOk = true; }
    catch (e) { storageOk = false; } // 저장이 안 되는 환경: 이번 방문 동안 메모리 상태로 진행
    ui.storageNote.hidden = storageOk;
    if (saveHook) saveHook(data);
    if ('tickets' in patch) showTickets();
  }
  function writeSave() {
    if (state.phase !== 'play') return;
    var p = state.player, patch = {};
    if (grid.isWalkable(p.x, p.y)) patch.pos = { x: Math.round(p.x), y: Math.round(p.y) };
    patchSave(patch);
  }
  function validPos(pos) {
    return pos && isFinite(pos.x) && isFinite(pos.y) && grid.isWalkable(pos.x, pos.y);
  }

  // ---------- 프로필: 닉네임·학년 ----------
  var NICK_MAX = 12;
  // 한글·이모지를 한 글자로 세기 (Intl.Segmenter 가 없으면 코드포인트 단위)
  function nickLength(s) {
    if (window.Intl && Intl.Segmenter) { var n = 0, it = new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(s); for (var x of it) n++; return n; }
    return Array.from(s).length;
  }
  function checkNick(raw) {
    var s = String(raw || '').trim();
    if (!s) return { ok: false, value: s, msg: '' };
    if (nickLength(s) > NICK_MAX) return { ok: false, value: s, msg: '닉네임은 ' + NICK_MAX + '글자까지 쓸 수 있어요.' };
    return { ok: true, value: s, msg: '' };
  }
  function validGrade(g) { g = Number(g); return Number.isInteger(g) && g >= 1 && g <= 6 ? g : null; }
  // 학년군(난이도): 1~2 low, 3~4 middle, 5~6 high. 학년 원본 값과 따로 둡니다.
  function gradeBand(g) { return g <= 2 ? 'low' : g <= 4 ? 'middle' : 'high'; }
  function saveProfile(nickname, grade) {
    patchSave({ nickname: nickname, grade: grade, updatedAt: new Date().toISOString() });
  }
  function setGradeRadios(name, g) {
    document.querySelectorAll('input[name=' + name + ']').forEach(function (r) { r.checked = Number(r.value) === g; });
  }
  function radioGrade(name) {
    var r = document.querySelector('input[name=' + name + ']:checked'); return r ? validGrade(r.value) : null;
  }
  // 한글 입력(IME) 조합 중 Enter 로 제출되지 않게
  function guardIme(input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229)) e.preventDefault();
    });
  }

  // ---------- 첫 입장 화면 ----------
  var saved = readSave();
  // 계절은 선생님이 반 공원마다 고름(js/net/multiplayer.js 가 MP_API.setSeason 으로 바꿈). 혼자 둘러보기는 기본 계절
  setSeason(PARK.defaultSeason, false);
  // 들어올 때마다 새로 로그인: 이 기기에 남은 닉네임·학년을 미리 채우지 않음(같은 기기를 여럿이 써도 남의 기록으로 들어가지 않게)
  ui.nickname.value = '';
  setGradeRadios('grade', null);
  guardIme(ui.nickname);
  var titleTouched = false;
  function updateTitle() {
    var n = checkNick(ui.nickname.value), g = radioGrade('grade');
    ui.enterPark.disabled = !(n.ok && g);
    ui.nickError.textContent = n.msg;
    ui.nickname.setAttribute('aria-invalid', n.msg ? 'true' : 'false');
    ui.hint.textContent = n.ok && g ? '준비 완료! 공원으로 출발해요.'
      : !n.value ? (titleTouched ? '닉네임을 적어 주세요.' : '')
      : !g ? '학년을 골라 주세요.' : '';
  }
  ui.form.addEventListener('input', function () { titleTouched = true; updateTitle(); });
  ui.form.addEventListener('change', function () { titleTouched = true; updateTitle(); });
  updateTitle();
  ui.form.addEventListener('submit', function (e) {
    e.preventDefault();
    var n = checkNick(ui.nickname.value), g = radioGrade('grade');
    if (!n.ok || !g) { titleTouched = true; updateTitle(); return; }
    // 처음 오면 공원에 들어가기 전에 내 캐릭터 고르기
    var proceed = function () {
      if (window.MPChars && !(readSave() || {}).character) openChars('create', { name: n.value, grade: g });
      else enterPark(n.value, g);
    };
    // 함께하기(js/net/multiplayer.js): 반 코드로 우리 반 공원에 들어갈지, 혼자 둘러볼지 먼저 고름
    if (window.MPMulti) MPMulti.askRoom({ name: n.value, grade: g }, proceed);
    else proceed();
  });

  function enterPark(name, grade) {
    if (state.phase === 'play') return; // 중복 클릭 방지
    ui.enterPark.disabled = true;
    state.nickname = name; state.grade = grade; state.gradeBand = gradeBand(grade);
    saveProfile(name, grade);
    var s = readSave() || {};
    var keepPos = validPos(s.pos);
    state.player.x = keepPos ? s.pos.x : PARK.start.x;
    state.player.y = keepPos ? s.pos.y : PARK.start.y;
    state.player.dir = 'up';
    state.keys = {}; state.path = null; state.dest = null;
    state.phase = 'play'; state.view = 'play';
    ui.title.hidden = true; ui.hud.hidden = false;
    showPlayer();
    ui.nickname.blur();
    snapCamera();
    writeSave();
    if (!storageOk) toast('이 기기에는 저장되지 않아요');
    if (window.MPMulti) MPMulti.onEnter();
  }
  // 첫 화면으로 돌아가기(선생님이 내보내거나 공원을 닫았을 때)
  function toTitle(msg) {
    if (window.MPMulti) MPMulti.leave();
    writeSave();
    window.MP_API.setSaveSlot(null);   // 반 기록 → 이 기기 기록
    stopMoving(); state.keys = {};
    if (state.modalFacility) closeFacility();
    if (state.profileOpen) closeProfile();
    if (state.charOpen) closeChars();
    state.phase = 'title'; state.view = 'play';
    ui.mapBar.hidden = true; ui.miniMap.hidden = false;
    ui.title.hidden = false; ui.hud.hidden = true; ui.enter.hidden = true; state.nearby = null;
    ui.enterPark.disabled = false;
    updateTitle();
    if (msg) ui.hint.textContent = msg;
  }
  function showPlayer() {
    ui.playerName.textContent = state.nickname;
    ui.playerGrade.textContent = state.grade + '학년';
    showTickets();
  }
  // 이름 밑 티켓 수(코스터·유령의 집 보상으로 모으고, 캐릭터 가게에서 씀)
  function showTickets() {
    var t = Number((readSave() || {}).tickets) || 0;
    ui.ticketCount.textContent = t;
    ui.ticketChip.setAttribute('aria-label', '내 티켓 ' + t + '장');
  }

  // ---------- 공원 안 프로필 수정 ----------
  guardIme(ui.profileNick);
  function openProfile() {
    if (state.phase !== 'play' || state.modalFacility || state.profileOpen || state.charOpen || state.rideOpen) return;
    stopMoving(); state.keys = {};
    state.profileOpen = true;
    ui.profileNick.value = state.nickname;
    setGradeRadios('profileGrade', state.grade);
    ui.profileNickError.textContent = '';
    ui.profile.hidden = false; ui.enter.hidden = true; state.nearby = null;
    ui.profileNick.focus();
  }
  function closeProfile() { // 취소: 기존 값 유지
    state.profileOpen = false; ui.profile.hidden = true; state.keys = {};
  }
  ui.playerChip.addEventListener('click', openProfile);
  ui.profileCancel.addEventListener('click', closeProfile);
  ui.profile.addEventListener('pointerdown', function (e) { if (e.target === ui.profile) closeProfile(); });
  ui.profileForm.addEventListener('input', function () {
    var n = checkNick(ui.profileNick.value);
    ui.profileNickError.textContent = n.value ? n.msg : '닉네임을 적어 주세요.';
    ui.profileSave.disabled = !(n.ok && radioGrade('profileGrade'));
  });
  ui.profileForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var n = checkNick(ui.profileNick.value), g = radioGrade('profileGrade');
    if (!n.ok || !g) return;
    // 지금은 진행 중인 미션이 없으므로 바로 적용. 미션이 생기면 '다음 미션부터' 새 학년군을 쓰도록 연결
    state.nickname = n.value; state.grade = g; state.gradeBand = gradeBand(g);
    saveProfile(n.value, g); showPlayer(); closeProfile();
    toast(storageOk ? '내 정보를 바꿨어요' : '바꿨지만 이 기기에는 저장되지 않아요');
  });

  // ---------- 캐릭터 고르기 ----------
  // 저장: makepark.save.v1 의 character = { id, gender, owned: [산 캐릭터 id] }, tickets(코스터 미션이 줌)
  // 무료(F1·F2)는 언제나, 건물 보상(R)은 그 건물을 통과하면, 가게(S)는 티켓으로 사면 고를 수 있습니다.
  // 보상 캐릭터는 마지막으로 고른 기본 캐릭터의 성별(gender)에 맞는 그림(남 b / 여 g)을 씁니다.
  function charSave(s) {
    var c = (s && s.character) || {}, M = window.MPChars;
    return {
      id: M && M.byId(c.id) ? c.id : 'F1',
      gender: c.gender === 'girl' ? 'girl' : 'boy',
      owned: Array.isArray(c.owned) ? c.owned.filter(function (x) { return M && M.byId(x); }) : []
    };
  }
  // 건물(스테이지) 통과: 코스터역은 선로 만들기 미션을 하나라도 성공하면(예전 코스터 스탬프도 인정)
  function facilityCleared(fid) {
    var s = readSave() || {};
    if (fid === 'coaster') { var c = s.coaster || {}, st = c.stamps || {}; return !!(c.build && c.build.cleared) || Object.keys(st).some(function (k) { return st[k]; }); }
    if (fid === 'ghost') return !!(s.gate && s.gate.cleared);   // 문지기 게임 혼자 추리하기 본 게임 한 판
    if (fid === 'melody') return !!(s.melody && s.melody.cleared);   // 별소리 음악당 댄스 미션 하나 성공
    if (fid === 'parade') return !!(s.parade && s.parade.cleared);   // 무지개 행진길 현수막을 꾸며 퍼레이드를 끝까지 한 번
    if (fid === 'arcade') return !!(s.arcade && s.arcade.cleared);   // 별줍는 오락실 별빛 팡팡 본게임을 끝까지 한 판
    if (fid === 'thrill') return !!(s.thrill && s.thrill.cleared);   // 콩콩 범퍼카 토토의 범퍼카 연구소: 어느 학년이든 미션 하나 완료
    if (fid === 'picnic') return !!(s.picnic && s.picnic.cleared);   // 토리네 도시락: 어느 학년이든 주문 3개를 모두 전달
    if (fid === 'shop') return charSave(s).owned.length > 0;         // 추억 상점: 티켓 가게 캐릭터를 하나라도 삼
    return false;
  }
  // 받침에 따라 조사 고르기: josa('탐험가', '을', '를') → '탐험가를'
  function josa(w, a, b) {
    var c = w.charCodeAt(w.length - 1) - 0xAC00, has = c >= 0 && c <= 11171 && c % 28 !== 0;
    if (a === '으로') return w + (has && c % 28 !== 8 ? '으로' : '로');
    return w + (has ? a : b);
  }
  function facilityName(fid) { var f = PARK.facilities.filter(function (x) { return x.id === fid; })[0]; return f ? f.name : fid; }
  // 시험 모드(주소 뒤에 ?test=1): 모든 캐릭터를 티켓·건물 통과 없이 골라 볼 수 있음(저장된 티켓·보상은 그대로)
  var CHAR_TEST = /[?&]test=1/.test(location.search);
  // 테스터: 이 닉네임은 어느 반에서든(혼자 둘러보기도) 모든 캐릭터를 쓸 수 있음
  var TESTERS = ['양퐁'];
  function isTester() {
    var s = readSave() || {}, nick = String(s.nickname || (ui.nickname && ui.nickname.value) || '').trim();
    return TESTERS.indexOf(nick) >= 0;
  }
  function charUnlocked(d, cs) {
    return CHAR_TEST || isTester() || d.kind === 'free' || (d.kind === 'reward' && facilityCleared(d.facility)) || (d.kind === 'shop' && cs.owned.indexOf(d.id) >= 0);
  }
  var charMode = 'edit', charEntry = null, pendingBuy = null;
  var CHAR_SECTIONS = [['free', '기본 캐릭터', '처음부터 고를 수 있어요'], ['reward', '건물 보상 캐릭터', '건물을 통과하면 받아요'], ['shop', '티켓 가게', '티켓으로 사요']];
  function renderChars() {
    var s = readSave() || {}, cs = charSave(s), tickets = s.tickets || 0;
    ui.charTickets.textContent = charMode === 'create' ? '건물 보상·티켓 가게 캐릭터는 공원에서 모을 수 있어요.' : '내 티켓 ' + tickets + '장';
    if (CHAR_TEST || isTester()) ui.charTickets.textContent = (CHAR_TEST ? '시험 모드' : '테스터') + ': 모든 캐릭터를 골라 볼 수 있어요 (보상 캐릭터는 기본 남자/여자를 먼저 골라 성별을 바꿔요)';
    ui.charList.textContent = '';
    CHAR_SECTIONS.forEach(function (sec) {
      if (charMode === 'create' && sec[0] !== 'free' && !CHAR_TEST && !isTester()) return;
      var h = document.createElement('h3'); h.className = 'char-sec';
      h.textContent = sec[1] + ' ';
      var sm = document.createElement('small'); sm.textContent = sec[2]; h.appendChild(sm);
      var grid = document.createElement('div'); grid.className = 'char-grid';
      MPChars.ROSTER.filter(function (d) { return d.kind === sec[0]; }).forEach(function (d) {
        var open = charUnlocked(d, cs), cur = charMode !== 'create' && cs.id === d.id;
        var b = document.createElement('button'); b.type = 'button';
        b.className = 'char-card' + (cur ? ' current' : '') + (open ? '' : ' locked') + (pendingBuy === d.id ? ' confirm' : '');
        b.dataset.id = d.id;
        var cv = document.createElement('canvas'); cv.width = 96; cv.height = 112;
        drawCard(cv, MPChars.spriteId(d.id, d.kind === 'free' ? d.gender : cs.gender), !open);
        var nm = document.createElement('span'); nm.className = 'char-name'; nm.textContent = d.name;
        var st = document.createElement('span'); st.className = 'char-state';
        st.textContent = cur ? '지금 캐릭터' : open ? '고르기'
          : d.kind === 'reward' ? '🔒 ' + facilityName(d.facility)
          : pendingBuy === d.id ? '한 번 더 누르면 사요' : '🎟 ' + d.price + '장';
        b.setAttribute('aria-label', d.name + ', ' + st.textContent);
        b.appendChild(cv); b.appendChild(nm); b.appendChild(st); grid.appendChild(b);
      });
      ui.charList.appendChild(h); ui.charList.appendChild(grid);
    });
  }
  function drawCard(cv, sid, locked) {
    var g = cv.getContext('2d');
    function paint() {
      g.clearRect(0, 0, cv.width, cv.height);
      if (locked) g.filter = 'grayscale(1) opacity(0.5)';
      var ok = MPChars.drawSprite(g, sid, cv.width / 2, cv.height - 6, 'down', 84);
      g.filter = 'none';
      return ok;
    }
    // 걷기 GIF 그림이 있으면 그것까지 받아진 뒤 다시 그림(처음엔 예전 그림이 잠깐 보일 수 있음)
    var ae = MPChars.loadAnim ? MPChars.loadAnim(sid) : null;
    if (paint() && (!ae || ae.ok)) return;
    var e = MPChars.load(sid), tries = 0;
    (function wait() { if ((ae ? ae.ok : e.done) || tries++ > 100) paint(); else setTimeout(wait, 60); })();
  }
  function selectChar(d, cs) {
    var gender = d.kind === 'free' ? d.gender : cs.gender;
    patchSave({ character: { id: d.id, gender: gender, owned: cs.owned } });
    character.set(d.id, gender);
    if (charMode === 'create') { var en = charEntry; closeChars(); if (en) enterPark(en.name, en.grade); return; }
    renderChars();
    ui.charMsg.textContent = josa(d.name, '으로') + ' 바꿨어요!';
  }
  function onCharClick(e) {
    var b = e.target.closest && e.target.closest('.char-card');
    if (!b) return;
    var d = MPChars.byId(b.dataset.id), s = readSave() || {}, cs = charSave(s);
    if (charUnlocked(d, cs)) { pendingBuy = null; selectChar(d, cs); return; }
    if (d.kind === 'reward') {
      pendingBuy = null; renderChars();
      ui.charMsg.textContent = d.facility === 'coaster'
        ? facilityName(d.facility) + '에서 거북이 역장과 선로 만들기 미션을 하나 끝내면 받을 수 있어요.'
        : d.facility === 'ghost' ? '유령의 집 문지기와 혼자 추리하기 한 판을 끝내면 받을 수 있어요.'
        : d.facility === 'melody' ? '별소리 음악당에서 유니콘과 댄스 미션을 하나 성공하면 받을 수 있어요.'
        : d.facility === 'parade' ? '무지개 행진길에서 현수막을 꾸며 퍼레이드를 끝까지 한 번 보면 받을 수 있어요.'
        : d.facility === 'arcade' ? '별줍는 오락실에서 별빛 팡팡 30초 본게임을 한 판 끝내면 받을 수 있어요.'
        : d.facility === 'thrill' ? '콩콩 범퍼카에서 토토와 범퍼카 미션을 하나 끝내면 받을 수 있어요.'
        : d.facility === 'picnic' ? '토리네 도시락에서 토리와 도시락 주문 3개를 모두 전달하면 받을 수 있어요.'
        : d.facility === 'shop' ? '추억 상점에서 티켓으로 캐릭터를 하나 사면 받을 수 있어요.'
        : josa(facilityName(d.facility), '이', '가') + ' 문을 열면 받을 수 있어요.';
      return;
    }
    var t = s.tickets || 0;
    if (t < d.price) {
      pendingBuy = null; renderChars();
      ui.charMsg.textContent = '티켓이 ' + (d.price - t) + '장 모자라요. 놀이기구 미션을 하면 티켓을 받아요.';
      return;
    }
    if (pendingBuy !== d.id) {
      pendingBuy = d.id; renderChars();
      ui.charMsg.textContent = '티켓 ' + d.price + '장으로 ' + josa(d.name, '을', '를') + ' 살까요? 한 번 더 누르면 사요.';
      var again = ui.charList.querySelector('.char-card.confirm'); if (again) again.focus();
      return;
    }
    pendingBuy = null;
    cs.owned.push(d.id);
    patchSave({ tickets: t - d.price, character: { id: cs.id, gender: cs.gender, owned: cs.owned } });
    selectChar(d, cs);
    ui.charMsg.textContent = josa(d.name, '을', '를') + ' 샀어요! 남은 티켓 ' + (t - d.price) + '장';
    if (!storageOk) toast('샀지만 이 기기에는 저장되지 않아요');
  }
  function openChars(mode, entry) {
    if (teacherAvatar) return;   // 선생님 모드: 동물 선생님 캐릭터를 그대로 씀
    if (!window.MPChars || state.charOpen) return;
    if (mode === 'edit' && (state.phase !== 'play' || state.modalFacility || state.profileOpen || state.rideOpen)) return;
    if (mode === 'edit') { stopMoving(); ui.enter.hidden = true; state.nearby = null; }
    state.keys = {};
    charMode = mode; charEntry = entry || null; pendingBuy = null;
    ui.charTitle.textContent = mode === 'create' ? '내 캐릭터 고르기' : '내 캐릭터';
    ui.charClose.textContent = mode === 'create' ? '뒤로' : '닫기';
    ui.charMsg.textContent = '';
    renderChars();
    state.charOpen = true; ui.charDlg.hidden = false;
    var f = ui.charList.querySelector('.char-card.current') || ui.charList.querySelector('.char-card');
    if (f) f.focus();
  }
  function closeChars() {
    state.charOpen = false; ui.charDlg.hidden = true; state.keys = {}; pendingBuy = null;
    if (charMode === 'create') ui.enterPark.focus(); else if (ui.charBtn) ui.charBtn.focus();
  }
  if (ui.charBtn) {
    if (!window.MPChars) ui.charBtn.hidden = true;
    ui.charBtn.addEventListener('click', function () { openChars('edit'); });
    ui.charClose.addEventListener('click', closeChars);
    ui.charList.addEventListener('click', onCharClick);
    ui.charDlg.addEventListener('pointerdown', function (e) { if (e.target === ui.charDlg) closeChars(); });
    ui.charDlg.addEventListener('keydown', function (e) { if (e.code === 'Escape') { e.preventDefault(); closeChars(); } });
  }


  // ---------- 카메라 ----------
  function fitScale() { return Math.min(view.w / W, view.h / H); }
  function coverScale() { return Math.max(view.w / W, view.h / H); }
  function playScale() {
    var c = PARK.camera;
    var s = Math.min(Math.min(view.w, view.h) / c.playViewShort, c.maxScale);
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
    // 화면 점 배율은 최대 2: 3배 화면 폰에서 그릴 점 수가 2.25배로 늘지만 눈으로 보이는 차이는 거의 없음(버벅임 방지)
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    if (state.modalFacility || state.profileOpen || state.charOpen || state.rideOpen) return;
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
  var entranceStart = 0;
  var reducedEntranceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function drawEntranceStars(x, y, elapsed) {
    if (elapsed >= 1.1 || reducedEntranceMotion.matches) return;
    ctx.save();
    for (var i = 0; i < 5; i++) {
      var progress = (elapsed - i * 0.065) / 0.84;
      if (progress <= 0 || progress >= 1) continue;
      var angle = Math.PI * (1 + i / 4);
      var sx = x + Math.cos(angle) * (22 + progress * 15);
      var sy = y + Math.sin(angle) * 12 - progress * 22;
      var size = 4.5 * Math.sin(Math.PI * progress);
      ctx.globalAlpha = Math.sin(Math.PI * progress);
      ctx.fillStyle = '#fff4b0';
      ctx.strokeStyle = '#b97a29';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (var j = 0; j < 8; j++) {
        var a = j * Math.PI / 4;
        var r = j % 2 ? size * 0.32 : size;
        var px = sx + Math.cos(a) * r, py = sy + Math.sin(a) * r * 1.35;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function updateNearby() {
    var f = state.phase === 'play' && state.view === 'play' && !state.modalFacility && !state.profileOpen && !state.charOpen && !state.rideOpen ? findNearby() : null;
    if (f !== state.nearby) {
      state.nearby = f;
      ui.enter.hidden = !f;
      if (f) {
        entranceStart = state.time;
        ui.enterName.textContent = f.name;
      }
    }
  }
  function openFacility(f) {
    if (!f || state.modalFacility || state.rideOpen) return;
    stopMoving(); state.keys = {};
    // 놀이기구 화면이 따로 있는 시설: 바람 타는 구름열차(코딩), 유령의 집(문지기의 비밀 규칙), 별소리 음악당(댄스·자유 연주), 토리네 도시락(도시락 주문 수학 놀이), 무지개 행진길(현수막 꾸미기), 별줍는 오락실(별빛 팡팡·캡슐 뽑기), 콩콩 범퍼카(토토의 범퍼카 연구소)
    var ride = f.id === 'coaster' ? window.MPCoaster : f.id === 'ghost' ? window.MPGate : f.id === 'melody' ? window.MPMelody : f.id === 'picnic' ? window.MPPicnic : f.id === 'parade' ? window.MPParade : f.id === 'arcade' ? window.MPArcade : f.id === 'thrill' ? window.MPThrill : null;
    if (ride) {
      state.rideOpen = f.id; state.nearby = null; ui.enter.hidden = true;
      ride.open();
      return;
    }
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

  // ---------- 전체 지도 (미니맵을 누르면 크게 펼쳐짐) ----------
  function setView(v) {
    state.view = v;
    ui.mapBar.hidden = v !== 'map';
    ui.miniMap.hidden = v === 'map';
    document.body.classList.toggle('map-open', v === 'map');
    updateNearby();
  }
  ui.miniMap.addEventListener('click', function () { setView('map'); ui.miniMap.blur(); });
  ui.mapBack.addEventListener('click', function () { setView('play'); });

  // 미니맵: 지도 그림(계절마다 작게 줄여 한 번만 만들어 둠) + 지금 보이는 곳 네모 + 친구 점 + 내 위치
  var mini = { bg: null, key: '' };
  function drawMini() {
    if (ui.miniMap.hidden || ui.hud.hidden) return;
    var cv = ui.miniCanvas, w = cv.clientWidth, h = cv.clientHeight, d = view.dpr;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); mini.key = ''; }
    var cur = seasonImgs[state.season], key = state.season + ':' + cv.width + 'x' + cv.height + (cur ? '' : '-');
    if (mini.key !== key) {
      mini.key = key;
      mini.bg = document.createElement('canvas'); mini.bg.width = cv.width; mini.bg.height = cv.height;
      var b = mini.bg.getContext('2d');
      b.fillStyle = '#9fcf8a'; b.fillRect(0, 0, cv.width, cv.height);
      if (cur) {
        b.imageSmoothingQuality = 'high';
        b.drawImage(cur.img, cur.rect.x / W * cv.width, cur.rect.y / H * cv.height, cur.rect.w / W * cv.width, cur.rect.h / H * cv.height);
      }
    }
    var c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(mini.bg, 0, 0);
    var sx = cv.width / W, sy = cv.height / H;
    // 지금 화면에 보이는 곳
    var hw = view.w / (2 * cam.s), hh = view.h / (2 * cam.s);
    c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 1.5 * d;
    c.strokeRect((cam.cx - hw) * sx, (cam.cy - hh) * sy, hw * 2 * sx, hh * 2 * sy);
    // 친구들(놀이기구 안에 있는 친구는 빼고), 선생님은 노란 점
    var others = window.MPMulti && MPMulti.others ? MPMulti.others() : [];
    others.forEach(function (o) {
      c.fillStyle = o.tc ? '#ffc93c' : '#4f8df5'; c.strokeStyle = '#fff'; c.lineWidth = 1.2 * d;
      c.beginPath(); c.arc(o.x * sx, o.y * sy, 3.2 * d, 0, Math.PI * 2); c.fill(); c.stroke();
    });
    // 나: 깜빡이는 빨간 점
    var px = state.player.x * sx, py = state.player.y * sy, r = (4.5 + Math.sin(state.time * 5) * 1) * d;
    c.fillStyle = 'rgba(255,107,107,0.35)'; c.beginPath(); c.arc(px, py, r + 4 * d, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff4d4d'; c.strokeStyle = '#fff'; c.lineWidth = 2 * d;
    c.beginPath(); c.arc(px, py, 4.5 * d, 0, Math.PI * 2); c.fill(); c.stroke();
  }

  // ---------- 입력 ----------
  var KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  window.addEventListener('keydown', function (e) {
    if (e.code === 'F2') { e.preventDefault(); state.debug = !state.debug; return; }
    if (state.phase !== 'play') return;
    if (state.charOpen) return; // 캐릭터 고르기 창: 창 안에서 따로 처리
    if (state.profileOpen) { // 프로필 수정 중: 글자 입력이 게임 조작으로 가지 않게
      if (e.code === 'Escape') { e.preventDefault(); closeProfile(); }
      return;
    }
    if (state.rideOpen) return; // 코스터 화면이 열려 있는 동안 공원 조작 멈춤
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
    if (state.phase !== 'play' || state.modalFacility || state.profileOpen || state.charOpen || state.rideOpen) return;
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
    // 바꾼 계절 지도를 아직 받는 중이면 그동안은 받아 둔 다른 계절 지도를 보여 줌(빈 초록 화면 대신)
    var cur = seasonImgs[state.season] || seasonImgs[fade.from] || seasonImgs[firstSeason], prev = fade.from && seasonImgs[fade.from];
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
      var e = state.nearby.entrance, elapsed = state.time - entranceStart;
      var shimmer = reducedEntranceMotion.matches ? 0 : Math.sin(elapsed * 4);
      var pulse = 1 + shimmer * 0.06;
      if (ringImg.complete && ringImg.naturalWidth) {
        // 황금빛 입구 링 (assets/ui/entrance-ring.png): 바닥에 깔리도록 입구 좌표 중심에 그림
        var rw = 96 * pulse, rh = rw * ringImg.naturalHeight / ringImg.naturalWidth;
        ctx.globalAlpha = 1;
        ctx.drawImage(ringImg, e.x - rw / 2, e.y - rh / 2, rw, rh);
        // 밝은 분홍 길 위에서도 잘 보이도록 한 번 더 '빛 더하기'로 겹쳐 그림
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 + shimmer * 0.25;
        ctx.drawImage(ringImg, e.x - rw / 2, e.y - rh / 2, rw, rh);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = 'rgba(255,214,90,0.9)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, 26 * pulse, 11 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
      }
      drawEntranceStars(e.x, e.y, elapsed);
    }

    var p = state.player;
    var multi = window.MPMulti && MPMulti.active();
    if (multi) MPMulti.drawOthers(ctx, state.time, p.y, false, frameDt);   // 나보다 뒤(위쪽)에 있는 친구
    character.draw(ctx, p.x, p.y, p.dir, p.moving, state.time);
    // 앞쪽 건물·나무가 캐릭터를 가리면, 잃어버리지 않게 흐린 윤곽을 한 번 더 그림
    state.hidden = drawOccluders(p);
    if (state.hidden) {
      ctx.globalAlpha = 0.35;
      character.draw(ctx, p.x, p.y, p.dir, p.moving, state.time);
      ctx.globalAlpha = 1;
    }
    // 시설 이름표(지도 그림에 간판 글자가 없음): js/map-labels.js
    if (window.MPMapLabels) MPMapLabels.draw(ctx, PARK, state.season, cam.s, view.dpr);
    if (multi) {
      MPMulti.drawOthers(ctx, state.time, p.y, true, frameDt);            // 나보다 앞(아래쪽)에 있는 친구
      MPMulti.drawNames(ctx, { x: p.x, y: p.y, nickname: state.nickname });
    }
    if (state.debug) drawDebugOccluders();
    // 눈 오는 계절이면 화면 위에 눈송이(js/snow.js). 지도·캐릭터 위, 화면 메뉴 아래
    if (window.MPSnow) MPSnow.draw(ctx, view.w, view.h, view.dpr, frameDt, !!(PARK.seasons[state.season] || {}).snow, cam.cx * cam.s, cam.cy * cam.s);

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
      '학년: ' + (state.grade || '-') + ' (' + (state.gradeBand || '-') + ')  저장: ' + (storageOk ? '됨' : '안 됨') + '\n' +
      '근처 시설: ' + (state.nearby ? state.nearby.name : '-') + '  fps ' + fps;
  }

  // ---------- 루프 ----------
  var last = performance.now(), saveTimer = 0, fpsCount = 0, fpsTime = 0, fps = 0;
  var frameDt = 0.016;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now; frameDt = dt;
    state.time += dt;
    if (fade.t < 1) fade.t = Math.min(1, fade.t + dt / 0.6);
    if (state.phase === 'play') {
      stepPlayer(dt);
      updateNearby();
      if (window.MPMulti) MPMulti.tick(dt);
      saveTimer += dt;
      if (saveTimer > 1) { saveTimer = 0; writeSave(); }
    }
    updateCamera(dt);
    draw();
    if (state.phase === 'play') drawMini();
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

  // ---------- 놀이기구 화면과 연결 ----------
  // 놀이기구(js/coaster/ui.js)는 이 창구로만 저장·프로필·공원 복귀를 다룸
  function exitRide(fid) {
    state.rideOpen = false; state.keys = {};
    // 시설 입구에서 입장 범위 밖, 이동할 수 있는 가장 가까운 곳에 세워 바로 다시 들어가지 않게
    var f = PARK.facilities.filter(function (x) { return x.id === fid; })[0], e = f.entrance, best = null;
    for (var dist = f.radius + 12; dist < f.radius + 90 && !best; dist += 6) {
      for (var a = 0; a < 360; a += 15) {
        var rad = (a + 90) * Math.PI / 180, x = e.x + Math.cos(rad) * dist, y = e.y + Math.sin(rad) * dist;
        if (grid.isWalkable(x, y)) { best = { x: x, y: y }; break; }
      }
    }
    if (best) { state.player.x = best.x; state.player.y = best.y; state.player.dir = 'down'; }
    stopMoving(); snapCamera(); writeSave();
    state.nearby = null; ui.enter.hidden = true;
    canvas.focus && canvas.blur();
  }
  // ---------- 티켓 규칙(모든 건물 같음) ----------
  // 건물마다 학년마다 처음 끝낼 때 1장. 같은 건물·같은 학년을 다시 하면 없음.
  // 모든 건물을 합쳐 하루 최대 TICKET_DAY_MAX장. 오늘 한도로 못 받은 학년은 받은 것으로 치지 않아 내일 다시 끝내면 받음.
  // 저장: save.ticketRule = { day: { date, n }, got: { 'coaster:3': true, … } }, 티켓 수는 save.tickets
  var TICKET_DAY_MAX = 3;
  function ticketToday() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function ticketRule(s) {
    var r = s && s.ticketRule && typeof s.ticketRule === 'object' ? JSON.parse(JSON.stringify(s.ticketRule)) : {};
    r.got = r.got && typeof r.got === 'object' ? r.got : {};
    if (!r.day || r.day.date !== ticketToday()) r.day = { date: ticketToday(), n: 0 };
    return r;
  }
  function ticketGrade(g) { g = +g || state.grade || 1; return Math.max(1, Math.min(6, g)); }
  // 받기 전에 미리 보기: { kind: 'first' 받을 수 있음 | 'got' 이미 받음 | 'daymax' 오늘 한도, dayN, max }
  function ticketPreview(fid, g) {
    var r = ticketRule(readSave() || {}), key = fid + ':' + ticketGrade(g);
    return { kind: r.got[key] ? 'got' : r.day.n >= TICKET_DAY_MAX ? 'daymax' : 'first', dayN: r.day.n, max: TICKET_DAY_MAX, grade: ticketGrade(g) };
  }
  // 한 판을 끝냈을 때 부름(판마다 한 번): 받을 수 있으면 1장 주고 저장. → { kind, gain, before, after, dayN, max, line }
  function awardTicket(fid, g) {
    var s = readSave() || {}, r = ticketRule(s), gr = ticketGrade(g), key = fid + ':' + gr, before = s.tickets || 0, kind;
    if (r.got[key]) kind = 'got';
    else if (r.day.n >= TICKET_DAY_MAX) kind = 'daymax';
    else { kind = 'first'; r.got[key] = true; r.day.n++; }
    var gain = kind === 'first' ? 1 : 0;
    var patch = { ticketRule: r };
    if (gain) patch.tickets = before + gain;
    patchSave(patch);
    showTickets();
    var res = { kind: kind, gain: gain, before: before, after: before + gain, dayN: r.day.n, max: TICKET_DAY_MAX, grade: gr };
    res.line = ticketLine(res);
    return res;
  }
  function ticketLine(t) {
    return t.kind === 'first' ? '🎟 ' + t.grade + '학년 티켓 1장을 받았어요! (오늘 ' + t.dayN + ' / ' + t.max + '장)'
      : t.kind === 'got' ? '🎟 ' + t.grade + '학년 티켓은 이미 받았어요. 다른 학년이나 다른 건물에서 받아 봐요!'
      : '🎟 오늘 받을 수 있는 티켓 ' + t.max + '장을 다 받았어요. 내일 다시 끝내면 받을 수 있어요!';
  }
  // 시작 대화창 안내 한 줄
  function ticketNote(fid, g) {
    var p = ticketPreview(fid, g);
    return p.kind === 'first' ? '🎟 ' + p.grade + '학년을 처음 끝내면 티켓 1장! (모든 건물 합쳐 하루 ' + p.max + '장 · 오늘 ' + p.dayN + '장 받았어요)'
      : p.kind === 'got' ? '🎟 ' + p.grade + '학년 티켓은 이미 받았어요. 다른 학년이나 다른 건물에서 받아 봐요!'
      : '🎟 오늘 티켓 ' + p.max + '장을 다 받았어요. 내일 또 받아요!';
  }
  window.MP_API = {
    readSave: readSave,
    // 티켓 규칙(모든 건물 같음): 건물·학년마다 처음 끝낼 때 1장, 하루 모두 합쳐 3장
    ticketPreview: ticketPreview, awardTicket: awardTicket, ticketNote: ticketNote, ticketLine: ticketLine, TICKET_DAY_MAX: TICKET_DAY_MAX,
    patchSave: patchSave,
    openChars: function () { openChars('edit'); },
    storageOk: function () { return storageOk; },
    // 반 공원에서 선생님이 고른 계절로 바꾸기(id 가 없거나 모르는 값이면 기본 계절)
    setSeason: function (id) { setSeason(id || PARK.defaultSeason, state.phase === 'play'); },
    // 대화 말풍선 등 화면에 그리는 배율
    camScale: function () { return cam.s; },
    profile: function () { return { nickname: state.nickname, grade: state.grade, band: state.gradeBand }; },
    character: function () { return { sid: character.sid || 'F1' }; },
    // 함께하기(js/net/multiplayer.js)용
    player: function () {
      var p = state.player, cs = charSave(readSave());
      return { x: p.x, y: p.y, dir: p.dir, moving: !!p.moving, ride: state.rideOpen || null,
        nickname: state.nickname, grade: state.grade,
        charId: teacherAvatar || cs.id, gender: cs.gender, teacher: !!teacherAvatar };
    },
    teleport: function (x, y) {
      var t = grid.nearestWalkable(x, y);
      if (!t) return;
      state.player.x = t.x; state.player.y = t.y; state.player.dir = 'down';
      stopMoving(); snapCamera(); updateNearby(); writeSave();
    },
    // 같이 놀기(js/net/multiplayer.js): 다른 창을 닫고 놀이기구를 바로 엶(유령의 집은 로비 없이 검문대로)
    openRide: function (id, opts) {
      var ride = id === 'coaster' ? window.MPCoaster : id === 'ghost' ? window.MPGate : null;
      if (!ride || state.phase !== 'play') return false;
      window.MP_API.closeRide();
      stopMoving(); state.keys = {};
      state.rideOpen = id; state.nearby = null; ui.enter.hidden = true;
      ride.open(opts);
      return true;
    },
    closeRide: function () {
      if (state.rideOpen === 'coaster' && window.MPCoaster) MPCoaster.close();
      else if (state.rideOpen === 'ghost' && window.MPGate) MPGate.close();
      else if (state.rideOpen === 'melody' && window.MPMelody) MPMelody.close();
      else if (state.rideOpen === 'picnic' && window.MPPicnic) MPPicnic.close();
      else if (state.rideOpen === 'parade' && window.MPParade) MPParade.close();
      else if (state.rideOpen === 'arcade' && window.MPArcade) MPArcade.close();
      else if (state.rideOpen === 'thrill' && window.MPThrill) MPThrill.close();
      if (state.modalFacility) closeFacility();
      if (state.charOpen) closeChars();
      if (state.profileOpen) closeProfile();
      if (state.view === 'map') setView('play');
    },
    toTitle: toTitle,
    // 저장 칸 바꾸기: slot=null 이면 이 기기 기록, 문자열이면 반 기록 칸(data 로 채움). 캐릭터도 그 기록대로
    setSaveSlot: function (slot, data) {
      saveKey = slot ? 'makepark.class.' + slot : SAVE_KEY;
      saveHook = null;
      if (slot && data) { try { localStorage.setItem(saveKey, JSON.stringify(data)); } catch (e) { /* 저장 불가 */ } }
      var cs = charSave(readSave());
      if (character.set && !teacherAvatar) character.set(cs.id, cs.gender);
      showTickets();
    },
    // 선생님 모드(선생님 화면의 '공원에 들어가기'): 동물 선생님 캐릭터로 바로 공원에 들어감
    //  - 저장은 학생 기록과 섞이지 않게 'teacher' 칸에, 캐릭터 고르기·내 정보 바꾸기는 숨김
    enterAsTeacher: function (name, avatarId) {
      if (!window.MPTeacherChars) return;
      teacherAvatar = avatarId;
      character = new MPTeacherChars.Walker(avatarId);
      saveKey = 'makepark.class.teacher'; saveHook = null;
      if (ui.charBtn) ui.charBtn.hidden = true;
      ui.playerChip.disabled = true; ui.playerChip.classList.add('teacher-chip');
      ui.ticketChip.hidden = true;
      enterPark(String(name || '선생님').slice(0, 12), 6);
      ui.playerGrade.textContent = '선생님';
    },
    onSave: function (fn) { saveHook = fn; },
    toast: toast,
    cancelEntry: function () { ui.enterPark.disabled = false; ui.enterPark.focus(); },
    // 공원에서 캐릭터가 화면에 그려지는 몸 키(CSS px). 유령의 집 로비도 같은 크기로 그림
    charScreenH: function () { return ((window.MPChars && MPChars.DRAW_H) || 60) * playScale(); },
    exitCoaster: function () { exitRide('coaster'); },
    exitGate: function () { exitRide('ghost'); },
    exitMelody: function () { exitRide('melody'); },
    exitPicnic: function () { exitRide('picnic'); },
    exitParade: function () { exitRide('parade'); },
    exitArcade: function () { exitRide('arcade'); },
    exitThrill: function () { exitRide('thrill'); }
  };

  // 개발·검증용 핸들 (게임 동작에는 쓰이지 않음)
  window.MP_DEV = {
    state: state, cam: cam, get grid() { return grid; }, grids: grids, park: PARK, character: character,
    screenToWorld: screenToWorld, worldToScreen: worldToScreen,
    drawNow: function () { draw(); }, // 화면이 숨겨져 애니메이션이 멈춘 상태에서도 한 장면을 그려 확인할 때
    reachAll: function () {
      return PARK.facilities.map(function (f) {
        var t = grid.nearestWalkable(f.entrance.x, f.entrance.y);
        var path = t && grid.findPath(PARK.start.x, PARK.start.y, t.x, t.y);
        return { id: f.id, entranceWalkable: grid.isWalkable(f.entrance.x, f.entrance.y), snap: t && Math.round(t.dist), reachable: !!path };
      });
    }
  };
})();
