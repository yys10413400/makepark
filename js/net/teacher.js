/*
 * 메이크파크 선생님 화면 (teacher.html)
 * - 반 공원 만들기 → 반 코드(5자리) / 이미 만든 코드로 다시 열기(이 기기에 기억)
 * - 들어온 학생 목록(닉네임·학년·있는 곳)과 공원 지도 위 위치
 * - 모두 모으기(분수 광장) · 학생 내보내기 · 공원 닫기/다시 열기
 * 연결: js/net/net.js (MPNet)
 */
(function () {
  'use strict';
  var NET = window.MPNet, PARK = window.MP_PARK;
  var KEY = 'makepark.teacher';
  var $ = function (id) { return document.getElementById(id); };
  var S = { code: null, meta: null, handle: null, players: {}, seen: {} };
  var WHERE = { park: '공원', coaster: '코스터 익스프레스', ghost: '유령의 집' };

  function remember(code) { try { localStorage.setItem(KEY, JSON.stringify({ code: code })); } catch (e) { /* 무시 */ } }
  function recall() { try { return (JSON.parse(localStorage.getItem(KEY)) || {}).code || null; } catch (e) { return null; } }
  function msg(id, text) { $(id).textContent = text || ''; }

  if (NET.mode === 'local') {
    $('tMode').hidden = false;
    $('tMode').textContent = '시험 모드: Firebase 설정 전이라 이 컴퓨터의 같은 브라우저 탭끼리만 연결돼요. (설정 방법: docs/firebase-setup.md)';
  }

  $('tCreate').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('tName').value.trim() || '선생님';
    msg('tSetupMsg', '공원을 만드는 중…');
    NET.createRoom(name).then(function (code) { open(code); }, function (err) { msg('tSetupMsg', '만들지 못했어요: ' + err.message); });
  });
  $('tOld').addEventListener('input', function () { $('tOld').value = $('tOld').value.replace(/\D/g, '').slice(0, 5); });
  $('tOpen').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = $('tOld').value.trim();
    NET.getRoom(code).then(function (meta) {
      if (!meta) { msg('tSetupMsg', '그런 반 공원이 없어요.'); return; }
      open(code);
    });
  });

  function open(code) {
    if (S.handle) S.handle.leave();
    S.code = code; S.players = {}; remember(code);
    $('tSetup').hidden = true; $('tRoom').hidden = false;
    $('tCode').textContent = code;
    S.handle = NET.watch(code);
    S.handle.onMeta(function (meta) { S.meta = meta; renderState(); });
    S.handle.onPlayer(function (pid, data) {
      if (data) S.players[pid] = data; else delete S.players[pid];
      render();
    });
    buildMap();
    render();
    loadRecords();
  }

  // ---------- 우리 반 학생 기록 ----------
  function loadRecords() {
    if (!S.code) return;
    NET.listStudents(S.code).then(function (all) {
      var keys = Object.keys(all || {}).sort(function (a, b) { return (all[a].nick || '').localeCompare(all[b].nick || '', 'ko'); });
      $('tRecCount').textContent = keys.length + '명';
      $('tRecEmpty').hidden = keys.length > 0;
      var tb = $('tRecList'); tb.textContent = '';
      keys.forEach(function (key) {
        var st = all[key], sv = st.save || {}, tr = document.createElement('tr');
        var when = st.updated ? new Date(st.updated).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
        [st.nick || '?', ((sv.grade || st.grade) || '?') + '학년', (sv.tickets || 0) + '장', when].forEach(function (t) {
          var td = document.createElement('td'); td.textContent = t; tr.appendChild(td);
        });
        var td = document.createElement('td'), b = document.createElement('button');
        b.type = 'button'; b.className = 't-kick'; b.textContent = '비밀번호 다시 정하기';
        b.addEventListener('click', function () {
          var pin = prompt((st.nick || '학생') + ' 학생의 새 비밀번호(숫자 4자리)를 넣어 주세요.', '');
          if (pin == null) return;
          if (!NET.validPin(pin)) { msg('tMsg', '비밀번호는 숫자 4자리예요.'); return; }
          NET.resetPin(S.code, key, pin).then(function () { msg('tMsg', (st.nick || '학생') + ' 학생의 비밀번호를 ' + pin + '(으)로 바꿨어요.'); });
        });
        td.appendChild(b); tr.appendChild(td); tb.appendChild(tr);
      });
    }, function (err) { msg('tMsg', '학생 기록을 불러오지 못했어요: ' + err.message); });
  }
  $('tRecRefresh').addEventListener('click', loadRecords);
  $('tRecClear').addEventListener('click', function () {
    if (!confirm('우리 반 학생들의 캐릭터·티켓·기록이 모두 지워져요. 되돌릴 수 없어요. 지울까요?')) return;
    if (!confirm('정말 지울까요? (학년이 끝났을 때만 권해요)')) return;
    NET.clearStudents(S.code).then(function () { msg('tMsg', '우리 반 학생 기록을 모두 지웠어요.'); loadRecords(); });
  });
  setInterval(function () { if (S.code && !document.hidden) loadRecords(); }, 15000);
  function renderState() {
    var m = S.meta;
    $('tState').textContent = !m ? '이 공원은 없어요' : m.open ? '🟢 열려 있어요 · ' + (m.teacher || '') : '🔴 닫혀 있어요 (학생이 들어올 수 없어요)';
    $('tToggle').textContent = m && m.open ? '공원 닫기' : '공원 다시 열기';
  }

  $('tCopy').addEventListener('click', function () {
    var t = S.code;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { msg('tMsg', '반 코드를 복사했어요.'); }, function () { msg('tMsg', '반 코드: ' + t); });
  });
  $('tGather').addEventListener('click', function () {
    NET.command(S.code, { type: 'gather' }).then(function () { msg('tMsg', '모두 분수 광장으로 불렀어요. 놀이기구 안에 있던 학생도 나와요.'); });
  });
  $('tToggle').addEventListener('click', function () {
    var open = !(S.meta && S.meta.open);
    if (!open && !confirm('공원을 닫을까요? 들어와 있는 학생은 모두 첫 화면으로 돌아가요.')) return;
    NET.setOpen(S.code, open).then(function () { msg('tMsg', open ? '공원을 다시 열었어요.' : '공원을 닫았어요.'); });
  });
  $('tNew').addEventListener('click', function () {
    if (S.handle) S.handle.leave();
    S.handle = null; S.code = null;
    try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
    $('tRoom').hidden = true; $('tSetup').hidden = false; msg('tSetupMsg', '');
  });

  // ---------- 지도·목록 ----------
  var dots = {};
  function buildMap() {
    var m = $('tMap'); m.textContent = ''; dots = {};
    m.style.aspectRatio = PARK.world.width + ' / ' + PARK.world.height;
    m.style.backgroundImage = 'url(' + PARK.seasons[PARK.defaultSeason].map + ')';
  }
  function render() {
    var ids = Object.keys(S.players).sort(function (a, b) { return (S.players[a].n || '').localeCompare(S.players[b].n || '', 'ko'); });
    $('tCount').textContent = ids.length + '명';
    $('tEmpty').hidden = ids.length > 0;
    var tb = $('tList'); tb.textContent = '';
    ids.forEach(function (pid) {
      var d = S.players[pid], tr = document.createElement('tr');
      [d.n || '?', (d.g || '?') + '학년', WHERE[d.w] || d.w || '공원'].forEach(function (t) { var td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
      var td = document.createElement('td'), b = document.createElement('button');
      b.type = 'button'; b.className = 't-kick'; b.textContent = '내보내기';
      b.addEventListener('click', function () {
        if (!confirm((d.n || '이 학생') + ' 학생을 공원에서 내보낼까요?')) return;
        NET.command(S.code, { type: 'kick', target: pid }).then(function () { msg('tMsg', (d.n || '학생') + ' 학생을 내보냈어요.'); });
      });
      td.appendChild(b); tr.appendChild(td); tb.appendChild(tr);
    });
    // 지도 점
    var map = $('tMap');
    Object.keys(dots).forEach(function (pid) { if (!S.players[pid]) { map.removeChild(dots[pid]); delete dots[pid]; } });
    ids.forEach(function (pid) {
      var d = S.players[pid], dot = dots[pid];
      if (!dot) { dot = dots[pid] = document.createElement('span'); dot.className = 't-dot'; map.appendChild(dot); }
      var pos = d.w && d.w !== 'park' ? entranceOf(d.w) : d;
      dot.style.left = (pos.x / PARK.world.width * 100) + '%';
      dot.style.top = (pos.y / PARK.world.height * 100) + '%';
      dot.textContent = d.n || '?';
      dot.classList.toggle('in-ride', d.w && d.w !== 'park');
    });
  }
  function entranceOf(id) {
    var f = PARK.facilities.filter(function (x) { return x.id === id; })[0];
    return f ? f.entrance : { x: 0, y: 0 };
  }

  var saved = recall();
  if (saved) NET.getRoom(saved).then(function (meta) { if (meta) open(saved); });
})();
