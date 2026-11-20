/*
 * 메이크파크 실시간 연결 (여러 명이 같은 반 공원에)
 * ------------------------------------------------------------
 * 두 가지 방식이 같은 모양(MPNet)으로 동작합니다.
 *  - firebase : js/net/firebase-config.js 에 설정값이 있으면 Firebase 실시간 데이터베이스로 여러 기기가 함께 접속
 *  - local    : 설정값이 없으면 같은 컴퓨터·같은 브라우저의 여러 탭끼리만(BroadcastChannel) — 서버 없이 시험용
 *
 * 데이터 모양 (Firebase 경로 기준)
 *   rooms/{code}/meta           { teacher, open, created }        반 공원(code: 5자리 숫자)
 *   rooms/{code}/cmd            { id, type, target?, at }          선생님 명령: gather(모두 모으기) · kick(내보내기) · close(공원 닫기)
 *   rooms/{code}/players/{pid}  { n, g, s, x, y, d, m, w, t }      닉네임·학년·캐릭터 그림·위치·방향·걷는 중·있는 곳(park|coaster|ghost)·시각
 *
 * 쓰는 법
 *   MPNet.ready().then(...)                    연결 준비
 *   MPNet.createRoom(teacherName) → code       선생님: 새 반 공원
 *   MPNet.getRoom(code) → meta | null          있는지·열려 있는지
 *   MPNet.join(code, pid, data) → handle       학생: 입장. handle.update(data), handle.leave(),
 *                                              handle.onPlayer(fn(pid, data|null)), handle.onCommand(fn(cmd)), handle.onMeta(fn(meta))
 *   MPNet.watch(code) → 같은 on* 를 가진 handle (선생님 화면: 입장하지 않고 지켜보기)
 *   MPNet.command(code, { type, target })      선생님 명령 보내기
 *   MPNet.setOpen(code, open)                  공원 열기/닫기
 */
(function () {
  'use strict';
  var CFG = window.MP_FIREBASE_CONFIG;
  var mode = CFG && CFG.databaseURL ? 'firebase' : 'local';
  var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

  function newId(n) {
    var s = '', abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    for (var i = 0; i < (n || 10); i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }
  function roomCode() { return String(10000 + Math.floor(Math.random() * 90000)); }
  function validCode(c) { return /^\d{5}$/.test(String(c || '')); }

  // ================= Firebase =================
  var fb = null, readyP = null;
  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { fail(new Error('불러오기 실패: ' + src)); };
      document.head.appendChild(s);
    });
  }
  // 학생: 익명 로그인 — 탭마다 고유 번호(uid)가 생기고, 규칙이 '내 캐릭터 정보는 나만' 쓰게 막음
  // 선생님(teacher.html, MP_NET_ROLE='teacher'): 구글 로그인 — 어느 컴퓨터에서든 같은 선생님(공원 관리 권한·내 반 목록)
  var uid = null, app = null, authP = null, teacherUser = null, teacherWaiters = [];
  var ROLE = window.MP_NET_ROLE === 'teacher' ? 'teacher' : 'student';
  function fbInit() {
    if (authP) return authP;
    authP = loadScript(SDK + 'firebase-app-compat.js')
      .then(function () { return loadScript(SDK + 'firebase-auth-compat.js'); })
      .then(function () { return loadScript(SDK + 'firebase-database-compat.js'); })
      .then(function () {
        // 학생은 이름 붙인 따로 된 앱(로그인 저장 칸이 다름)으로 → 같은 브라우저의 선생님 구글 로그인을 건드리지 않음
        var NAME = ROLE === 'teacher' ? '[DEFAULT]' : 'student';
        app = window.firebase.apps.filter(function (a) { return a.name === NAME; })[0]
          || (NAME === '[DEFAULT]' ? window.firebase.initializeApp(CFG) : window.firebase.initializeApp(CFG, NAME));
        fb = app.database();
        var P = window.firebase.auth.Auth.Persistence, auth = app.auth();
        // 일부 브라우저(앱 안 브라우저·저장 막힘)는 로그인 유지 방식을 못 바꿈 → 그래도 계속 진행
        return auth.setPersistence(ROLE === 'teacher' ? P.LOCAL : P.SESSION)
          .then(null, function (err) { console.warn('로그인 유지 방식을 바꾸지 못했어요', err); })
          .then(function () { return auth; });
      });
    // 실패하면(인터넷 끊김 등) 다음에 다시 시도할 수 있게 비움 — 그대로 두면 새로고침 전까지 계속 실패함
    authP.then(null, function () { authP = null; });
    return authP;
  }
  function fbReady() {
    if (readyP) return readyP;
    if (ROLE === 'teacher') {
      // 선생님 로그인이 끝날 때까지 기다림
      readyP = fbInit().then(function () {
        return new Promise(function (ok) { if (teacherUser) ok(mode); else teacherWaiters.push(ok); });
      });
      return readyP;
    }
    readyP = fbInit().then(function (auth) {
      // 학생은 익명 로그인. 같은 브라우저에 선생님(구글)이 로그인돼 있어도 학생은 익명으로 들어감
      var cur = auth.currentUser;
      return (cur && cur.isAnonymous ? Promise.resolve(cur) : auth.signInAnonymously().then(function (c) { return c.user; }))
        .then(function (user) { uid = user.uid; return mode; });
    });
    readyP.then(null, function () { readyP = null; });
    return readyP;
  }
  function fbRef(path) { return fb.ref(path); }

  function fbHandle(code, pid) {
    var base = 'rooms/' + code, listeners = [], me = pid ? fbRef(base + '/players/' + pid) : null;
    function on(ref, ev, fn) { ref.on(ev, fn); listeners.push([ref, ev, fn]); }
    var h = {
      onPlayer: function (fn) {
        var pr = fbRef(base + '/players');
        on(pr, 'child_added', function (s) { if (s.key !== pid) fn(s.key, s.val()); });
        on(pr, 'child_changed', function (s) { if (s.key !== pid) fn(s.key, s.val()); });
        on(pr, 'child_removed', function (s) { if (s.key !== pid) fn(s.key, null); });
      },
      // fn(cmd, initial): 처음 한 번은 '들어오기 전부터 있던 명령'(initial=true) — 학생은 무시함
      onCommand: function (fn) {
        var first = true;
        on(fbRef(base + '/cmd'), 'value', function (s) { var v = s.val(), init = first; first = false; if (v) fn(v, init); });
      },
      onMeta: function (fn) { on(fbRef(base + '/meta'), 'value', function (s) { fn(s.val()); }); },
      update: function (data) {
        if (!me) return;
        data.t = window.firebase.database.ServerValue.TIMESTAMP;
        me.update(data);
      },
      leave: function () {
        listeners.forEach(function (l) { l[0].off(l[1], l[2]); });
        listeners = [];
        if (me) { me.onDisconnect().cancel(); me.remove(); }
      }
    };
    if (me) me.onDisconnect().remove();   // 창을 닫거나 연결이 끊기면 자동으로 공원에서 나감
    return h;
  }

  // ================= 탭끼리(시험용) =================
  var RKEY = 'makepark.net.rooms', bc = null, localSubs = [];
  function rooms() { try { return JSON.parse(localStorage.getItem(RKEY)) || {}; } catch (e) { return {}; } }
  function saveRooms(r) { try { localStorage.setItem(RKEY, JSON.stringify(r)); } catch (e) { /* 저장 안 됨 */ } }
  function bcast(msg) { if (bc) bc.postMessage(msg); }
  // 반 공원 정보가 바뀜: 다른 탭(BroadcastChannel)과 이 탭(자기 자신에게는 안 옴) 모두에 알림
  function roomChanged() { bcast({ k: 'room' }); localSubs.forEach(function (fn) { fn({ k: 'room' }); }); }
  function localReady() {
    if (!bc && 'BroadcastChannel' in window) {
      bc = new BroadcastChannel('makepark-net');
      bc.onmessage = function (e) { localSubs.forEach(function (fn) { fn(e.data); }); };
      window.addEventListener('storage', function (e) { if (e.key === RKEY) localSubs.forEach(function (fn) { fn({ k: 'room' }); }); });
    }
    return Promise.resolve(mode);
  }
  function localHandle(code, pid) {
    var players = {}, seen = {}, fns = { p: [], c: [], m: [] }, lastCmd = null, lastMeta = null, mine = null, beat = 0, prune = 0;
    function room() { return rooms()[code] || null; }
    function emitRoom() {
      var r = room(), meta = r && r.meta, cmd = r && r.cmd;
      var mj = JSON.stringify(meta || null);
      if (mj !== lastMeta) { lastMeta = mj; fns.m.forEach(function (fn) { fn(meta || null); }); }
      if (cmd && (!lastCmd || cmd.id !== lastCmd)) { lastCmd = cmd.id; fns.c.forEach(function (fn) { fn(cmd, false); }); }
    }
    function sub(msg) {
      if (msg.k === 'room') return emitRoom();
      if (msg.code !== code || msg.pid === pid) return;
      if (msg.k === 'who' && mine) return bcast({ k: 'p', code: code, pid: pid, data: mine });
      if (msg.k === 'p') {
        players[msg.pid] = msg.data; seen[msg.pid] = Date.now();
        fns.p.forEach(function (fn) { fn(msg.pid, msg.data); });
      } else if (msg.k === 'bye' && players[msg.pid]) {
        delete players[msg.pid]; delete seen[msg.pid];
        fns.p.forEach(function (fn) { fn(msg.pid, null); });
      }
    }
    localSubs.push(sub);
    // 소식이 끊긴 탭은 6초 뒤 사라짐, 내 정보는 2초마다 다시 알림
    prune = setInterval(function () {
      var now = Date.now();
      Object.keys(seen).forEach(function (k) {
        if (now - seen[k] > 6000) { delete players[k]; delete seen[k]; fns.p.forEach(function (fn) { fn(k, null); }); }
      });
    }, 1500);
    if (pid) beat = setInterval(function () { if (mine) { mine.t = Date.now(); bcast({ k: 'p', code: code, pid: pid, data: mine }); } }, 2000);
    var bye = function () { if (pid) bcast({ k: 'bye', code: code, pid: pid }); };
    window.addEventListener('pagehide', bye);
    setTimeout(function () { bcast({ k: 'who', code: code, pid: pid || 'watch' }); }, 0);
    return {
      onPlayer: function (fn) { fns.p.push(fn); },
      onCommand: function (fn) { fns.c.push(fn); var r = room(); if (r && r.cmd) { lastCmd = r.cmd.id; fn(r.cmd, true); } },
      onMeta: function (fn) { fns.m.push(fn); var r = room(); lastMeta = JSON.stringify((r && r.meta) || null); fn((r && r.meta) || null); },
      update: function (data) {
        mine = Object.assign(mine || {}, data); mine.t = Date.now();
        bcast({ k: 'p', code: code, pid: pid, data: mine });
      },
      leave: function () {
        bye(); clearInterval(prune); clearInterval(beat);
        window.removeEventListener('pagehide', bye);
        localSubs = localSubs.filter(function (f) { return f !== sub; });
      }
    };
  }

  // ================= 공통 =================
  function ready() { return mode === 'firebase' ? fbReady() : localReady(); }

  function createRoom(teacherName, className) {
    return ready().then(function () {
      var name = String(className || '').trim().slice(0, 30) || '우리 반';
      var meta = { teacher: String(teacherName || '선생님').slice(0, 20), name: name, open: true, created: Date.now(), owner: uid };   // owner: 이 공원의 선생님
      if (mode === 'local') {
        var r = rooms(), code;
        do { code = roomCode(); } while (r[code]);
        r[code] = { meta: meta, cmd: null }; saveRooms(r); roomChanged();
        return addMyRoom(code, name).then(function () { return code; });
      }
      // 겹치지 않는 번호를 찾을 때까지(트랜잭션으로 빈 자리에만 씀)
      function tryOne(n) {
        var code = roomCode();
        return fbRef('rooms/' + code + '/meta').transaction(function (cur) { return cur ? undefined : meta; })
          .then(function (res) {
            if (res.committed) return addMyRoom(code, name).then(function () { return code; });
            if (n > 8) throw new Error('반 코드를 만들지 못했어요');
            return tryOne(n + 1);
          });
      }
      return tryOne(0);
    });
  }
  function getRoom(code) {
    if (!validCode(code)) return Promise.resolve(null);
    return ready().then(function () {
      if (mode === 'local') { var r = rooms()[code]; return r ? r.meta : null; }
      return fbRef('rooms/' + code + '/meta').once('value').then(function (s) { return s.val(); });
    });
  }
  function join(code, pid, data) {
    var h = mode === 'firebase' ? fbHandle(code, pid) : localHandle(code, pid);
    h.update(data);
    return h;
  }
  function watch(code) { return mode === 'firebase' ? fbHandle(code, null) : localHandle(code, null); }
  function command(code, cmd) {
    cmd = Object.assign({ id: newId(8), at: Date.now() }, cmd);
    return ready().then(function () {
      if (mode === 'local') { var r = rooms(); if (r[code]) { r[code].cmd = cmd; saveRooms(r); roomChanged(); } return; }
      return fbRef('rooms/' + code + '/cmd').set(cmd);
    });
  }
  function setOpen(code, open) {
    return ready().then(function () {
      if (mode === 'local') { var r = rooms(); if (r[code]) { r[code].meta.open = !!open; saveRooms(r); roomChanged(); } return; }
      return fbRef('rooms/' + code + '/meta/open').set(!!open);
    });
  }

  // ---------- 학생 기록: 반 공원에 저장(어느 기기에서든 이어 하기) ----------
  // rooms/{code}/names/{key}            true                         이 반에 등록된 닉네임(누구나 읽기)
  // rooms/{code}/students/{key}         { nick, grade, pin, created, save, updated }   본인(비밀번호 확인 후)·선생님만 읽기
  // rooms/{code}/claims/{uid}           { key, pin }                 "이 기기는 이 학생" — 규칙이 비밀번호를 확인
  // key: 닉네임(앞뒤 공백 제거, 소문자)을 글자 코드로 바꾼 것(Firebase 경로에 못 쓰는 글자 피하기)
  function studentKey(nick) {
    var t = String(nick || '').trim().toLowerCase(), out = 'k';
    for (var i = 0; i < t.length; i++) out += t.charCodeAt(i).toString(36) + '_';
    return out;
  }
  var SKEY = 'makepark.net.students';
  function localStudents() { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } }
  function saveLocalStudents(v) { try { localStorage.setItem(SKEY, JSON.stringify(v)); } catch (e) { /* 저장 안 됨 */ } }
  function validPin(p) { return /^\d{4}$/.test(String(p || '')); }

  // 이 반에 이미 있는 닉네임인지
  function studentExists(code, nick) {
    var key = studentKey(nick);
    return ready().then(function () {
      if (mode === 'local') return !!((localStudents()[code] || {})[key]);
      return fbRef('rooms/' + code + '/names/' + key).once('value').then(function (s) { return !!s.val(); });
    });
  }
  // 로그인(없으면 새로 등록). → { ok, isNew, key, save } / { ok:false, reason:'pin'|'closed'|'error' }
  function studentLogin(code, nick, grade, pin) {
    var key = studentKey(nick);
    if (!validPin(pin)) return Promise.resolve({ ok: false, reason: 'pin' });
    return ready().then(function () {
      if (mode === 'local') {
        var all = localStudents(), room = all[code] = all[code] || {}, st = room[key];
        if (!st) { room[key] = { nick: nick, grade: grade, pin: pin, created: Date.now(), save: null }; saveLocalStudents(all); return { ok: true, isNew: true, key: key, save: null }; }
        if (st.pin !== pin) return { ok: false, reason: 'pin' };
        return { ok: true, isNew: false, key: key, save: st.save || null };
      }
      var base = 'rooms/' + code;
      return fbRef(base + '/names/' + key).once('value').then(function (s) {
        var exists = !!s.val();
        var make = exists ? Promise.resolve() : fbRef(base + '/students/' + key).set({ nick: nick, grade: grade, pin: pin, created: Date.now() })
          .then(function () { return fbRef(base + '/names/' + key).set(true); });
        return make
          .then(function () { return fbRef(base + '/claims/' + uid).set({ key: key, pin: pin }); })   // 비밀번호가 다르면 규칙이 막음
          .then(function () { return fbRef(base + '/students/' + key + '/save').once('value'); })
          .then(function (sv) { return { ok: true, isNew: !exists, key: key, save: sv.val() }; },
            function (err) { return { ok: false, reason: exists ? 'pin' : 'error', error: err }; });
      });
    });
  }
  function studentSave(code, key, save) {
    return ready().then(function () {
      if (mode === 'local') {
        var all = localStudents(), st = (all[code] || {})[key];
        if (st) { st.save = save; st.updated = Date.now(); saveLocalStudents(all); }
        return;
      }
      return fbRef('rooms/' + code + '/students/' + key).update({ save: save, updated: Date.now() });
    });
  }
  // 선생님: 반 학생 기록 목록 · 비밀번호 다시 정하기 · 반 기록 모두 지우기
  function listStudents(code) {
    return ready().then(function () {
      if (mode === 'local') return localStudents()[code] || {};
      return fbRef('rooms/' + code + '/students').once('value').then(function (s) { return s.val() || {}; });
    });
  }
  function resetPin(code, key, pin) {
    return ready().then(function () {
      if (mode === 'local') { var all = localStudents(), st = (all[code] || {})[key]; if (st) { st.pin = pin; saveLocalStudents(all); } return; }
      return fbRef('rooms/' + code + '/students/' + key + '/pin').set(pin);
    });
  }
  function clearStudents(code) {
    return ready().then(function () {
      if (mode === 'local') { var all = localStudents(); delete all[code]; saveLocalStudents(all); return; }
      var u = {}; u['rooms/' + code + '/students'] = null; u['rooms/' + code + '/names'] = null; u['rooms/' + code + '/claims'] = null;
      return fb.ref().update(u);
    });
  }

  // ---------- 선생님 로그인 ----------
  // MPNet.teacher.watch(fn(user|null)) · signIn(name?) · signOut()  — user = { uid, name, email }
  var TKEY = 'makepark.net.teacher';
  var teacher = {
    watch: function (fn) {
      if (mode === 'local') {
        var t = null; try { t = JSON.parse(localStorage.getItem(TKEY)); } catch (e) { /* 없음 */ }
        teacherUser = t; uid = t && t.uid;
        fn(t);
        teacher._fn = fn;
        return;
      }
      fbInit().then(function (auth) {
        auth.onAuthStateChanged(function (user) {
          teacherUser = user && !user.isAnonymous ? { uid: user.uid, name: user.displayName || '', email: user.email || '' } : null;
          uid = teacherUser ? teacherUser.uid : null;
          if (teacherUser) { var w = teacherWaiters; teacherWaiters = []; w.forEach(function (ok) { ok(mode); }); }
          fn(teacherUser);
        });
      });
    },
    // 시험 모드는 이름만으로(이 컴퓨터 안에서만), Firebase 는 구글 계정 창
    signIn: function (name) {
      if (mode === 'local') {
        var nm = String(name || '').trim() || '선생님';
        var t = { uid: 't_' + studentKey(nm).slice(1), name: nm, email: '' };
        try { localStorage.setItem(TKEY, JSON.stringify(t)); } catch (e) { /* 무시 */ }
        teacherUser = t; uid = t.uid;
        if (teacher._fn) teacher._fn(t);
        return Promise.resolve(t);
      }
      return fbInit().then(function (auth) { return auth.signInWithPopup(new window.firebase.auth.GoogleAuthProvider()); });
    },
    signOut: function () {
      if (mode === 'local') {
        try { localStorage.removeItem(TKEY); } catch (e) { /* 무시 */ }
        teacherUser = null; uid = null;
        if (teacher._fn) teacher._fn(null);
        return Promise.resolve();
      }
      readyP = null;
      return fbInit().then(function (auth) { return auth.signOut(); });
    }
  };

  // ---------- 내 반 목록 (teachers/{uid}/rooms/{code} = { name, created }) ----------
  var MKEY = 'makepark.net.myrooms';
  function localMine() { try { return JSON.parse(localStorage.getItem(MKEY)) || {}; } catch (e) { return {}; } }
  function myRooms() {
    return ready().then(function () {
      if (mode === 'local') return localMine()[uid] || {};
      return fbRef('teachers/' + uid + '/rooms').once('value').then(function (s) { return s.val() || {}; });
    });
  }
  function addMyRoom(code, name) {
    var v = { name: name, created: Date.now() };
    if (mode === 'local') { var all = localMine(); (all[uid] = all[uid] || {})[code] = v; try { localStorage.setItem(MKEY, JSON.stringify(all)); } catch (e) { /* 무시 */ } return Promise.resolve(); }
    return fbRef('teachers/' + uid + '/rooms/' + code).set(v);
  }
  // 반 공원 통째로 지우기(학생 기록 포함) + 내 반 목록에서 빼기
  function deleteRoom(code) {
    return ready().then(function () {
      if (mode === 'local') {
        var r = rooms(); delete r[code]; saveRooms(r); roomChanged();
        var st = localStudents(); delete st[code]; saveLocalStudents(st);
        var all = localMine(); if (all[uid]) delete all[uid][code]; try { localStorage.setItem(MKEY, JSON.stringify(all)); } catch (e) { /* 무시 */ }
        return;
      }
      var u = {}, base = 'rooms/' + code + '/';
      ['players', 'cmd', 'names', 'students', 'claims', 'meta'].forEach(function (k) { u[base + k] = null; });   // meta 는 마지막(권한 확인에 씀)
      return fb.ref().update(u).then(function () { return fbRef('teachers/' + uid + '/rooms/' + code).remove(); });
    });
  }
  // 반 이름 바꾸기
  function renameRoom(code, name) {
    return ready().then(function () {
      if (mode === 'local') {
        var r = rooms(); if (r[code]) { r[code].meta.name = name; saveRooms(r); roomChanged(); }
        var all = localMine(); if (all[uid] && all[uid][code]) { all[uid][code].name = name; try { localStorage.setItem(MKEY, JSON.stringify(all)); } catch (e) { /* 무시 */ } }
        return;
      }
      var u = {}; u['rooms/' + code + '/meta/name'] = name; u['teachers/' + uid + '/rooms/' + code + '/name'] = name;
      return fb.ref().update(u);
    });
  }
  // 반 학생 수(등록된 닉네임 수)
  function countStudents(code) {
    return ready().then(function () {
      if (mode === 'local') return Object.keys(localStudents()[code] || {}).length;
      return fbRef('rooms/' + code + '/names').once('value').then(function (s) { return s.numChildren(); });
    });
  }

  function myId() {
    if (mode === 'firebase') return uid;
    try {
      var p = sessionStorage.getItem('makepark.pid');
      if (!p) { p = newId(10); sessionStorage.setItem('makepark.pid', p); }
      return p;
    } catch (e) { return newId(10); }
  }

  window.MPNet = {
    mode: mode, ready: ready, myId: myId, createRoom: createRoom, getRoom: getRoom, join: join, watch: watch,
    command: command, setOpen: setOpen, newId: newId, validCode: validCode,
    studentKey: studentKey, studentExists: studentExists, studentLogin: studentLogin, studentSave: studentSave,
    listStudents: listStudents, resetPin: resetPin, clearStudents: clearStudents, validPin: validPin,
    teacher: teacher, myRooms: myRooms, deleteRoom: deleteRoom, renameRoom: renameRoom, countStudents: countStudents,
    isOwner: function (meta) { return !!(meta && uid && meta.owner === uid); }
  };
})();
