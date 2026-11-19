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
  // 익명 로그인: 사람마다(탭마다) 고유 번호(uid)가 생기고, 데이터베이스 규칙이 이 번호로
  // '내 캐릭터 정보는 나만', '명령·공원 열고 닫기는 공원을 만든 선생님만' 쓰게 막음
  var uid = null;
  function fbReady() {
    if (readyP) return readyP;
    readyP = loadScript(SDK + 'firebase-app-compat.js')
      .then(function () { return loadScript(SDK + 'firebase-auth-compat.js'); })
      .then(function () { return loadScript(SDK + 'firebase-database-compat.js'); })
      .then(function () {
        var app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(CFG);
        var auth = app.auth();
        // 학생 게임: 탭마다 다른 사람(SESSION) / 선생님 화면: 창을 닫았다 열어도 같은 선생님(LOCAL) — 공원 관리 권한 유지
        var P = window.firebase.auth.Auth.Persistence;
        return auth.setPersistence(window.MP_NET_PERSIST === 'local' ? P.LOCAL : P.SESSION)
          .then(function () { return auth.currentUser || auth.signInAnonymously().then(function (c) { return c.user; }); })
          .then(function (user) { uid = user.uid; fb = app.database(); return mode; });
      });
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

  function createRoom(teacher) {
    return ready().then(function () {
      var meta = { teacher: String(teacher || '선생님').slice(0, 20), open: true, created: Date.now() };
      if (mode === 'firebase') meta.owner = uid;   // 이 공원의 선생님(명령·열고 닫기 권한)
      if (mode === 'local') {
        var r = rooms(), code;
        do { code = roomCode(); } while (r[code]);
        r[code] = { meta: meta, cmd: null }; saveRooms(r); roomChanged();
        return code;
      }
      // 겹치지 않는 번호를 찾을 때까지(트랜잭션으로 빈 자리에만 씀)
      function tryOne(n) {
        var code = roomCode();
        return fbRef('rooms/' + code + '/meta').transaction(function (cur) { return cur ? undefined : meta; })
          .then(function (res) {
            if (res.committed) return code;
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
    listStudents: listStudents, resetPin: resetPin, clearStudents: clearStudents, validPin: validPin
  };
})();
