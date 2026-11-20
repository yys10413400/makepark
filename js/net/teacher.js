/*
 * 메이크파크 선생님 화면 (teacher.html)
 * 1) 선생님 로그인: Firebase 는 구글 계정(어느 컴퓨터에서든 같은 선생님), 시험 모드는 이름만(이 컴퓨터 안에서)
 * 2) 내 반 목록: 여러 학교·여러 반을 이름을 붙여 만들고, 눌러서 열기 / 새 반 만들기 / 예전 반 코드로 열기
 * 3) 반 관리: 반 코드, 지금 들어온 학생(목록·지도 위치), 모두 모으기·내보내기·공원 닫기,
 *    우리 반 학생 기록(비밀번호 다시 정하기·기록 모두 지우기)·반 이름 바꾸기·반 없애기
 * 연결: js/net/net.js (MPNet)
 */
(function () {
  'use strict';
  var NET = window.MPNet, PARK = window.MP_PARK;
  var $ = function (id) { return document.getElementById(id); };
  var S = { user: null, code: null, meta: null, handle: null, players: {}, owner: false };
  var WHERE = { park: '공원', coaster: '코스터 익스프레스', ghost: '유령의 집' };
  function msg(id, text) { $(id).textContent = text || ''; }
  function show(view) { $('tLogin').hidden = view !== 'login'; $('tHome').hidden = view !== 'home'; $('tRoom').hidden = view !== 'room'; }

  if (NET.mode === 'local') {
    $('tMode').hidden = false;
    $('tMode').textContent = '시험 모드: Firebase 설정 전이라 이 컴퓨터의 같은 브라우저 탭끼리만 연결되고, 로그인도 이름만으로 해요. (설정 방법: docs/firebase-setup.md)';
    $('tLocalLogin').hidden = false;
  } else {
    $('tGoogle').hidden = false;
  }

  // ---------- 1. 로그인 ----------
  $('tGoogle').addEventListener('click', function () {
    msg('tLoginMsg', 'Google 로그인 창을 여는 중…');
    NET.teacher.signIn().then(null, function (err) {
      msg('tLoginMsg', err && err.code === 'auth/popup-blocked' ? '팝업이 막혔어요. 브라우저에서 팝업을 허용해 주세요.'
        : err && err.code === 'auth/unauthorized-domain' ? '이 주소는 Firebase 로그인 허용 목록에 없어요. 설정 안내의 "승인된 도메인"을 확인해 주세요.'
        : '로그인하지 못했어요. 다시 눌러 주세요.');
    });
  });
  $('tLocalLogin').addEventListener('submit', function (e) { e.preventDefault(); NET.teacher.signIn($('tLocalName').value); });
  $('tLogout').addEventListener('click', function () {
    if (S.handle) S.handle.leave();
    S.handle = null; S.code = null;
    NET.teacher.signOut();
  });
  NET.teacher.watch(function (user) {
    S.user = user;
    $('tWho').hidden = !user;
    if (!user) { show('login'); msg('tLoginMsg', ''); return; }
    $('tWhoName').textContent = '👩‍🏫 ' + (user.name || user.email || '선생님');
    if (!$('tName').value) $('tName').value = user.name || '';
    // 공원에서 '← 선생님 화면'으로 돌아오면(teacher.html#room=반코드) 그 반 관리 화면을 바로 엶
    var back = /#room=(\d{5})/.exec(location.hash);
    if (back) { history.replaceState(null, '', location.pathname + location.search); openRoom(back[1]); }
    else openHome();
  });

  // ---------- 2. 내 반 목록 ----------
  function openHome() {
    if (S.handle) { S.handle.leave(); S.handle = null; }
    S.code = null;
    show('home');
    var box = $('tMyRooms'); box.textContent = '불러오는 중…';
    NET.myRooms().then(function (mine) {
      var codes = Object.keys(mine || {}).sort(function (a, b) { return (mine[b].created || 0) - (mine[a].created || 0); });
      box.textContent = '';
      $('tMyCount').textContent = codes.length + '개';
      $('tMyEmpty').hidden = codes.length > 0;
      codes.forEach(function (code) {
        var card = document.createElement('button'); card.type = 'button'; card.className = 't-roomcard';
        var nm = document.createElement('span'); nm.className = 't-roomcard-name'; nm.textContent = mine[code].name || '우리 반';
        var cd = document.createElement('span'); cd.className = 't-roomcard-code'; cd.textContent = '반 코드 ' + code;
        var st = document.createElement('span'); st.className = 't-roomcard-state'; st.textContent = '…';
        card.appendChild(nm); card.appendChild(cd); card.appendChild(st);
        card.addEventListener('click', function () { openRoom(code); });
        box.appendChild(card);
        Promise.all([NET.getRoom(code), NET.countStudents(code)]).then(function (r) {
          var meta = r[0];
          st.textContent = !meta ? '없어진 반' : (meta.open ? '● 열림' : '● 닫힘') + ' · 학생 ' + r[1] + '명';
          st.className = 't-roomcard-state' + (!meta ? '' : meta.open ? ' on' : ' off');
        });
      });
    }, function (err) { box.textContent = '반 목록을 불러오지 못했어요: ' + err.message; });
  }
  $('tCreate').addEventListener('submit', function (e) {
    e.preventDefault();
    var cls = $('tClass').value.trim(), name = $('tName').value.trim() || (S.user && S.user.name) || '선생님';
    if (!cls) { msg('tSetupMsg', '반 이름을 적어 주세요. (예: 메이크초 4학년 2반)'); $('tClass').focus(); return; }
    msg('tSetupMsg', '반 공원을 만드는 중…');
    NET.createRoom(name, cls).then(function (code) { msg('tSetupMsg', ''); $('tClass').value = ''; openRoom(code); },
      function (err) { msg('tSetupMsg', '만들지 못했어요: ' + err.message); });
  });
  $('tOld').addEventListener('input', function () { $('tOld').value = $('tOld').value.replace(/\D/g, '').slice(0, 5); });
  $('tOpen').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = $('tOld').value.trim();
    NET.getRoom(code).then(function (meta) {
      if (!meta) { msg('tSetupMsg', '그런 반 공원이 없어요.'); return; }
      openRoom(code);
    });
  });

  // ---------- 3. 반 관리 ----------
  function openRoom(code) {
    if (S.handle) S.handle.leave();
    S.code = code; S.players = {}; S.meta = null;
    show('room');
    $('tCode').textContent = code; $('tClassName').textContent = ''; msg('tMsg', '');
    $('tRecList').textContent = ''; $('tRecCount').textContent = ''; $('tRecBadge').textContent = ''; $('tRecModal').hidden = true;
    S.handle = NET.watch(code);
    S.handle.onMeta(function (meta) { S.meta = meta; renderState(); });
    S.handle.onPlayer(function (pid, data) {
      if (data) S.players[pid] = data; else delete S.players[pid];
      render();
    });
    buildMap();
    render();
  }
  function renderState() {
    var m = S.meta;
    S.owner = NET.isOwner(m) || (NET.mode === 'local' && m && !m.owner);   // 예전 시험용 반(주인 기록 없음)은 시험 모드에서 관리 가능
    $('tNotOwner').hidden = !m || S.owner;
    document.querySelectorAll('#tRoom .owner-only').forEach(function (e) { e.hidden = !S.owner; });
    $('tRename').hidden = !S.owner;
    $('tClassName').textContent = m ? (m.name || '이름 없는 반') : '없어진 반';
    $('tState').textContent = !m ? '이 공원은 없어요' : m.open ? '● 열려 있어요 · ' + (m.teacher || '') : '● 닫혀 있어요 · 학생이 들어올 수 없어요';
    $('tState').className = 't-state' + (!m ? '' : m.open ? ' on' : ' off');
    $('tToggle').textContent = m && m.open ? '🔒 공원 닫기' : '🔓 공원 다시 열기';
    $('tToggle').className = 't-btn owner-only' + (m && !m.open ? ' go' : '');
    if (S.owner && !S.recLoaded) { S.recLoaded = true; loadRecords(); }
  }
  $('tBack').addEventListener('click', function () { S.recLoaded = false; openHome(); });
  $('tRename').addEventListener('click', function () {
    var nm = prompt('새 반 이름을 적어 주세요.', (S.meta && S.meta.name) || '');
    if (nm == null || !nm.trim()) return;
    NET.renameRoom(S.code, nm.trim().slice(0, 30)).then(function () { msg('tMsg', '반 이름을 바꿨어요.'); });
  });
  $('tCopy').addEventListener('click', function () {
    var t = S.code;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { msg('tMsg', '반 코드를 복사했어요.'); }, function () { msg('tMsg', '반 코드: ' + t); });
  });
  $('tGather').addEventListener('click', function () {
    NET.command(S.code, { type: 'gather' }).then(function () { msg('tMsg', '모두 분수 광장으로 불렀어요. 놀이기구 안에 있던 학생도 나와요.'); });
  });
  $('tToggle').addEventListener('click', function () {
    var willOpen = !(S.meta && S.meta.open);
    if (!willOpen && !confirm('공원을 닫을까요? 들어와 있는 학생은 모두 첫 화면으로 돌아가요. (학생 기록은 그대로예요)')) return;
    NET.setOpen(S.code, willOpen).then(function () { msg('tMsg', willOpen ? '공원을 다시 열었어요.' : '공원을 닫았어요.'); });
  });
  $('tDelete').addEventListener('click', function () {
    var nm = (S.meta && S.meta.name) || S.code;
    if (!confirm('"' + nm + '" 반을 없앨까요? 반 코드와 학생 기록이 모두 지워지고 되돌릴 수 없어요.')) return;
    if (!confirm('정말 없앨까요?')) return;
    NET.deleteRoom(S.code).then(function () { S.recLoaded = false; openHome(); }, function (err) { msg('tMsg', '없애지 못했어요: ' + err.message); });
  });

  // ---------- 지도·지금 들어온 학생 ----------
  var dots = {};
  function buildMap() {
    var m = $('tMap'); m.textContent = ''; dots = {};
    m.style.aspectRatio = PARK.world.width + ' / ' + PARK.world.height;
    m.style.backgroundImage = 'url(' + PARK.seasons[PARK.defaultSeason].map + ')';
  }
  function entranceOf(id) {
    var f = PARK.facilities.filter(function (x) { return x.id === id; })[0];
    return f ? f.entrance : { x: 0, y: 0 };
  }
  function render() {
    var ids = Object.keys(S.players).sort(function (a, b) { return (S.players[a].n || '').localeCompare(S.players[b].n || '', 'ko'); });
    $('tCount').textContent = ids.filter(function (pid) { return !S.players[pid].tc; }).length + '명';
    $('tEmpty').hidden = ids.length > 0;
    var tb = $('tList'); tb.textContent = '';
    ids.forEach(function (pid) {
      var d = S.players[pid], tr = document.createElement('tr');
      [(d.tc ? 'GM ' : '') + (d.n || '?'), d.tc ? '선생님' : (d.g || '?') + '학년', WHERE[d.w] || d.w || '공원'].forEach(function (t) { var td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
      var td = document.createElement('td');
      if (S.owner && !d.tc) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 't-kick'; b.textContent = '내보내기';
        b.addEventListener('click', function () {
          if (!confirm((d.n || '이 학생') + ' 학생을 공원에서 내보낼까요?')) return;
          // 1) 학생 기기에 '나가요' 명령 2) 공원 목록에서 바로 지움(기기가 잠들었거나 창이 닫혀 남은 기록도 사라짐)
          // 결과는 버튼 자리에 바로 보여 줌(위쪽 안내 줄은 아래로 내려 보면 안 보여서)
          b.disabled = true; b.textContent = '내보내는 중…';
          var step = '명령';
          NET.command(S.code, { type: 'kick', target: pid })
            .then(function () { step = '목록에서 지우기'; return NET.removePlayer(S.code, pid); })
            .then(function () { msg('tMsg', (d.n || '학생') + ' 학생을 내보냈어요.'); b.textContent = '내보냈어요'; },
              function (err) {
                var why = (err && (err.code || err.message)) || '알 수 없음';
                console.error('내보내기 실패', step, err);
                b.disabled = false; b.textContent = '내보내기';
                msg('tMsg', '내보내지 못했어요(' + step + '): ' + why);
                alert('내보내지 못했어요.' + String.fromCharCode(10) + '단계: ' + step + String.fromCharCode(10) + '이유: ' + why);
              });
        });
        td.appendChild(b);
      }
      tr.appendChild(td); tb.appendChild(tr);
    });
    var map = $('tMap');
    Object.keys(dots).forEach(function (pid) { if (!S.players[pid]) { map.removeChild(dots[pid]); delete dots[pid]; } });
    ids.forEach(function (pid) {
      var d = S.players[pid], dot = dots[pid];
      if (!dot) { dot = dots[pid] = document.createElement('span'); dot.className = 't-dot'; map.appendChild(dot); }
      var pos = d.w && d.w !== 'park' ? entranceOf(d.w) : d;
      dot.style.left = (pos.x / PARK.world.width * 100) + '%';
      dot.style.top = (pos.y / PARK.world.height * 100) + '%';
      dot.textContent = d.n || '?';
      dot.classList.toggle('in-ride', !!(d.w && d.w !== 'park'));
      dot.classList.toggle('is-teacher', !!d.tc);
    });
  }

  // ---------- 우리 반 학생 기록 ----------
  function loadRecords() {
    if (!S.code || !S.owner) return;
    NET.listStudents(S.code).then(function (all) {
      var keys = Object.keys(all || {}).sort(function (a, b) { return (all[a].nick || '').localeCompare(all[b].nick || '', 'ko'); });
      $('tRecCount').textContent = keys.length + '명';
      $('tRecBadge').textContent = keys.length + '명';
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
          if (!NET.validPin(pin)) { msg('tRecMsg', '비밀번호는 숫자 4자리예요.'); return; }
          NET.resetPin(S.code, key, pin).then(function () { msg('tRecMsg', (st.nick || '학생') + ' 학생의 비밀번호를 ' + pin + '(으)로 바꿨어요.'); });
        });
        td.appendChild(b); tr.appendChild(td); tb.appendChild(tr);
      });
    }, function (err) { msg('tMsg', '학생 기록을 불러오지 못했어요: ' + err.message); });
  }
  $('tRecRefresh').addEventListener('click', loadRecords);
  // ---------- 공원에 들어가기: 동물 선생님 고르기 → index.html?teacher=반코드&avatar=동물 ----------
  var AKEY = 'makepark.teacher.avatar', avatar = null;
  function pickAvatar(id) {
    avatar = id;
    try { localStorage.setItem(AKEY, id); } catch (e) { /* 저장 안 됨 */ }
    document.querySelectorAll('#tAvatars .t-avatar').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.id === id)); });
  }
  function openWalk() {
    var T = window.MPTeacherChars, box = $('tAvatars');
    if (!T || !T.LIST.length) { msg('tMsg', '동물 선생님 그림을 불러오지 못했어요.'); return; }
    if (!box.childElementCount) {
      T.LIST.forEach(function (c) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 't-avatar'; b.dataset.id = c.id;
        b.setAttribute('role', 'radio');
        var cv = document.createElement('canvas'); cv.width = 132; cv.height = 150;
        var nm = document.createElement('span'); nm.textContent = c.name;
        b.appendChild(cv); b.appendChild(nm);
        b.addEventListener('click', function () { pickAvatar(c.id); });
        b.addEventListener('dblclick', goWalk);
        box.appendChild(b);
        T.drawThumb(cv, c.id);
      });
    }
    var saved = null; try { saved = localStorage.getItem(AKEY); } catch (e) { /* 없음 */ }
    pickAvatar(T.valid(saved) ? saved : T.first());
    $('tWalkModal').hidden = false;
    $('tWalkGo').focus();
  }
  function closeWalk() { $('tWalkModal').hidden = true; $('tWalkOpen').focus(); }
  function goWalk() {
    if (!S.code || !avatar) return;
    if (S.meta && !S.meta.open) { msg('tMsg', '공원이 닫혀 있어요. 먼저 공원을 다시 열어 주세요.'); closeWalk(); return; }
    if (S.handle) S.handle.leave();
    location.href = 'index.html?teacher=' + S.code + '&avatar=' + avatar;
  }
  $('tWalkOpen').addEventListener('click', openWalk);
  $('tWalkClose').addEventListener('click', closeWalk);
  $('tWalkGo').addEventListener('click', goWalk);
  $('tWalkModal').addEventListener('click', function (e) { if (e.target === $('tWalkModal')) closeWalk(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('tWalkModal').hidden) closeWalk(); });

  // 학생 기록 창 열기·닫기 (바깥 어두운 곳을 누르거나 Esc 로도 닫힘)
  function openRecords() { msg('tRecMsg', ''); $('tRecModal').hidden = false; loadRecords(); $('tRecClose').focus(); }
  function closeRecords() { $('tRecModal').hidden = true; $('tRecOpen').focus(); }
  $('tRecOpen').addEventListener('click', openRecords);
  $('tRecClose').addEventListener('click', closeRecords);
  $('tRecModal').addEventListener('click', function (e) { if (e.target === $('tRecModal')) closeRecords(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('tRecModal').hidden) closeRecords(); });
  $('tRecClear').addEventListener('click', function () {
    if (!confirm('이 반 학생들의 캐릭터·티켓·기록이 모두 지워져요. 되돌릴 수 없어요. 지울까요?')) return;
    if (!confirm('정말 지울까요? (학년이 끝났을 때만 권해요)')) return;
    NET.clearStudents(S.code).then(function () { msg('tMsg', '이 반 학생 기록을 모두 지웠어요.'); loadRecords(); });
  });
  setInterval(function () { if (S.code && S.owner && !document.hidden) loadRecords(); }, 15000);
})();
