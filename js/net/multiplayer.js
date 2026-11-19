/*
 * 메이크파크 함께하기 — 학생 쪽 (공원에서 다른 친구 보기, 선생님 명령 받기)
 * ------------------------------------------------------------
 * 입장 흐름: 첫 화면(닉네임·학년) → '어디로 갈까요?' 창(반 코드 입장 / 혼자 둘러보기) → (처음이면 캐릭터 고르기) → 공원
 * 공원에서: 같은 반 친구들이 자기 캐릭터로 걸어 다니고 머리 위에 닉네임이 보임. 놀이기구 안에 있는 친구는 공원에서 안 보임.
 * 선생님 명령: 모두 모으기(분수 광장으로 순간 이동, 놀이기구에서도 나옴) · 내보내기 · 공원 닫기
 * 연결: js/net/net.js (MPNet) / 게임과의 창구: window.MP_API (game.js)
 */
(function () {
  'use strict';
  var NET = window.MPNet;
  if (!NET) return;
  var SEND_MS = 200, BEAT_MS = 3000;   // 움직일 때 1초에 5번, 가만히 있으면 3초마다
  var GATHER = { x: 690, y: 600 };      // 모두 모으기: 분수 광장 앞
  var WHERE = { coaster: '코스터 익스프레스', ghost: '유령의 집' };

  var S = { code: null, handle: null, pid: null, others: {}, last: null, lastSend: 0, joinedAt: 0 };
  var ui = {};
  function api() { return window.MP_API; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---------- '어디로 갈까요?' ----------
  function buildDialog() {
    var wrap = ui.dlg = el('section', 'overlay dim join-overlay'); wrap.hidden = true;
    var p = el('form', 'entry-panel profile-panel join-panel'); p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true');
    p.setAttribute('aria-labelledby', 'joinTitle'); p.noValidate = true; p.autocomplete = 'off';
    var h = el('h2', 'profile-title', '어디로 갈까요?'); h.id = 'joinTitle'; p.appendChild(h);
    ui.hello = el('p', 'join-hello'); p.appendChild(ui.hello);
    var box = el('div', 'join-box');
    box.appendChild(el('p', 'join-head', '🏫 우리 반 공원'));
    var lab = el('label', 'join-label', '선생님이 알려 준 반 코드(숫자 5자리)'); lab.htmlFor = 'joinCode'; box.appendChild(lab);
    ui.code = el('input', 'nick-input join-code'); ui.code.id = 'joinCode'; ui.code.type = 'text';
    ui.code.inputMode = 'numeric'; ui.code.maxLength = 5; ui.code.placeholder = '예) 48213'; ui.code.autocomplete = 'off';
    box.appendChild(ui.code);
    ui.err = el('p', 'field-msg join-err'); ui.err.setAttribute('aria-live', 'polite'); box.appendChild(ui.err);
    ui.go = el('button', 'entry-go join-go', '우리 반 공원 입장'); ui.go.type = 'submit'; box.appendChild(ui.go);
    p.appendChild(box);
    p.appendChild(el('p', 'join-or', '또는'));
    ui.solo = el('button', 'profile-cancel join-solo', '혼자 둘러보기'); ui.solo.type = 'button'; p.appendChild(ui.solo);
    var t = el('a', 'join-teacher', '선생님이세요? 우리 반 공원 만들기 →'); t.href = 'teacher.html'; t.target = '_blank'; t.rel = 'noopener';
    p.appendChild(t);
    if (NET.mode === 'local') p.appendChild(el('p', 'join-mode', '지금은 시험 모드예요: 이 컴퓨터의 다른 탭끼리만 함께 보여요.'));
    ui.back = el('button', 'join-back', '← 뒤로'); ui.back.type = 'button'; p.appendChild(ui.back);
    wrap.appendChild(p);
    // 2단계: 비밀번호 4자리 (반 공원에 저장된 내 기록 불러오기)
    var q = ui.pinForm = el('form', 'entry-panel profile-panel join-panel'); q.hidden = true; q.noValidate = true; q.autocomplete = 'off';
    q.setAttribute('role', 'dialog'); q.setAttribute('aria-modal', 'true'); q.setAttribute('aria-labelledby', 'pinTitle');
    var ph = el('h2', 'profile-title', '비밀번호'); ph.id = 'pinTitle'; q.appendChild(ph);
    ui.pinText = el('p', 'join-hello'); q.appendChild(ui.pinText);
    var pbox = el('div', 'join-box');
    var pl = el('label', 'join-label', '숫자 4자리'); pl.htmlFor = 'joinPin'; pbox.appendChild(pl);
    ui.pin = el('input', 'nick-input join-code'); ui.pin.id = 'joinPin'; ui.pin.inputMode = 'numeric'; ui.pin.maxLength = 4; ui.pin.autocomplete = 'off';
    pbox.appendChild(ui.pin);
    ui.pinErr = el('p', 'field-msg join-err'); ui.pinErr.setAttribute('aria-live', 'polite'); pbox.appendChild(ui.pinErr);
    ui.pinGo = el('button', 'entry-go join-go', '확인'); ui.pinGo.type = 'submit'; pbox.appendChild(ui.pinGo);
    q.appendChild(pbox);
    ui.pinBack = el('button', 'join-back', '← 반 코드 다시 넣기'); ui.pinBack.type = 'button'; q.appendChild(ui.pinBack);
    wrap.appendChild(q);
    ui.pin.addEventListener('input', function () { ui.pin.value = ui.pin.value.replace(/\D/g, '').slice(0, 4); ui.pinErr.textContent = ''; });
    document.getElementById('app').appendChild(wrap);
    ui.form = p;
    ui.code.addEventListener('input', function () { ui.code.value = ui.code.value.replace(/\D/g, '').slice(0, 5); ui.err.textContent = ''; });
  }
  var pending = null;
  // 첫 화면에서 '공원으로 출발!'을 누르면 game.js 가 부름. proceed(): 캐릭터 고르기 → 공원 입장
  function askRoom(entry, proceed) {
    if (!ui.dlg) buildDialog();
    pending = { entry: entry, proceed: proceed };
    ui.hello.textContent = entry.name + '님, 오늘은 어디서 놀까요?';
    var s = api().readSave() || {};
    ui.code.value = s.roomCode || '';
    ui.err.textContent = ''; ui.go.disabled = false;
    ui.dlg.hidden = false;
    setTimeout(function () { (ui.code.value ? ui.go : ui.code).focus(); }, 30);
    ui.form.onsubmit = function (e) {
      e.preventDefault();
      var code = ui.code.value.trim();
      if (!NET.validCode(code)) { ui.err.textContent = '반 코드는 숫자 5자리예요.'; ui.code.focus(); return; }
      ui.go.disabled = true; ui.err.textContent = '반 공원을 찾는 중…';
      NET.getRoom(code).then(function (meta) {
        ui.go.disabled = false;
        if (!meta) { ui.err.textContent = '그런 반 공원이 없어요. 코드를 다시 확인해 주세요.'; return; }
        if (!meta.open) { ui.err.textContent = '지금은 닫힌 공원이에요. 선생님께 여쭤보세요.'; return; }
        api().patchSave({ roomCode: code });
        S.code = code; S.teacher = meta.teacher || '선생님';
        return askPin(code, entry);
      }).then(null, function (err) {
        ui.go.disabled = false;
        ui.err.textContent = '연결하지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.';
        console.error(err);
      });
    };
    ui.solo.onclick = function () { S.code = null; S.studentKey = null; api().setSaveSlot(null); ui.dlg.hidden = true; pending.proceed(); };
    ui.back.onclick = function () { ui.dlg.hidden = true; api().cancelEntry && api().cancelEntry(); };
    showStep('code');
  }
  function showStep(step) { ui.form.hidden = step !== 'code'; ui.pinForm.hidden = step !== 'pin'; }

  // 처음 온 닉네임이면 비밀번호를 정하고, 있던 닉네임이면 비밀번호로 내 기록을 불러옴
  function askPin(code, entry) {
    return NET.studentExists(code, entry.name).then(function (exists) {
      showStep('pin');
      ui.pin.value = ''; ui.pinErr.textContent = ''; ui.pinGo.disabled = false;
      ui.pin.type = exists ? 'password' : 'text';
      ui.pinText.textContent = exists
        ? entry.name + '님, 다시 왔군요! 비밀번호 4자리를 넣으면 모은 캐릭터와 기록을 이어서 할 수 있어요.'
        : entry.name + '님은 ' + code + '반 공원에 처음 왔어요! 비밀번호 4자리를 정해 주세요. 다른 기기에서 이어 할 때 써요. 잊지 않게 기억해요!';
      setTimeout(function () { ui.pin.focus(); }, 30);
      ui.pinBack.onclick = function () { showStep('code'); ui.err.textContent = ''; ui.go.disabled = false; ui.code.focus(); };
      ui.pinForm.onsubmit = function (e) {
        e.preventDefault();
        var pin = ui.pin.value;
        if (!NET.validPin(pin)) { ui.pinErr.textContent = '비밀번호는 숫자 4자리예요.'; ui.pin.focus(); return; }
        ui.pinGo.disabled = true; ui.pinErr.textContent = exists ? '내 기록을 불러오는 중…' : '반 공원에 등록하는 중…';
        NET.studentLogin(code, entry.name, entry.grade, pin).then(function (res) {
          ui.pinGo.disabled = false;
          if (!res.ok) {
            ui.pinErr.textContent = res.reason === 'pin' ? '비밀번호가 달라요. 잊어버렸으면 선생님께 말해 주세요.' : '등록하지 못했어요. 다시 눌러 주세요.';
            ui.pin.select(); return;
          }
          useClassSave(code, res.key, res.save, entry);
          ui.dlg.hidden = true;
          pending.proceed();
        }, function () { ui.pinGo.disabled = false; ui.pinErr.textContent = '연결하지 못했어요. 다시 눌러 주세요.'; });
      };
    });
  }

  // ---------- 반 기록: 서버에 저장된 내 기록으로 놀고, 바뀌면 자동으로 저장 ----------
  var push = { timer: 0, data: null };
  function useClassSave(code, key, save, entry) {
    var data = save && typeof save === 'object' ? save : {};
    data.nickname = entry.name; data.grade = entry.grade; data.version = 1;
    delete data.roomCode;
    S.studentKey = key;
    api().setSaveSlot(code + '.' + key, data);
    api().onSave(function (d) {
      push.data = d;
      if (!push.timer) push.timer = setTimeout(flush, 2500);   // 2.5초에 한 번 모아서 저장
    });
  }
  function flush() {
    clearTimeout(push.timer); push.timer = 0;
    if (!push.data || !S.code || !S.studentKey) return;
    var d = JSON.parse(JSON.stringify(push.data)); push.data = null;
    NET.studentSave(S.code, S.studentKey, d).then(null, function (err) { console.error('반 기록 저장 실패', err); });
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });

  // ---------- 공원 입장 / 나가기 ----------
  function onEnter() {
    leave();
    if (!S.code) { setChip(); return; }
    S.pid = NET.myId(); S.others = {}; S.joinedAt = Date.now();   // 같은 컴퓨터라도 탭마다 다른 사람
    S.handle = NET.join(S.code, S.pid, snapshot(true));
    S.last = snapshot(true); S.lastSend = performance.now();
    S.handle.onPlayer(function (pid, data) {
      if (!data) { delete S.others[pid]; setChip(); return; }
      var o = S.others[pid];
      if (!o) {
        o = S.others[pid] = { x: data.x, y: data.y, walker: window.MPChars ? new MPChars.Walker({ id: data.s, gender: data.gd }) : null };
        api().toast && api().toast(data.n + ' 친구가 공원에 왔어요');
      }
      if (o.walker && (o.data && (o.data.s !== data.s || o.data.gd !== data.gd))) o.walker.set(data.s, data.gd);
      o.data = data; o.tx = data.x; o.ty = data.y; o.seen = performance.now();
      setChip();
    });
    S.handle.onCommand(onCommand);
    S.handle.onMeta(function (meta) {
      if (!S.handle) return;
      if (!meta || !meta.open) kickOut('선생님이 공원을 닫았어요. 다음에 또 만나요!');
    });
    setChip();
    api().toast && api().toast(S.code + '반 공원에 들어왔어요!');
  }
  function leave() {
    if (S.handle) { S.handle.leave(); S.handle = null; }
    S.others = {};
    setChip();
  }
  function kickOut(msg) {
    flush();
    leave(); S.code = null; S.studentKey = null;
    if (api().toTitle) api().toTitle(msg);
  }
  function onCommand(cmd, initial) {
    if (initial || !S.handle) return;   // 들어오기 전부터 있던 명령은 무시
    if (cmd.type === 'gather') {
      api().closeRide && api().closeRide();
      var a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 50;
      api().teleport(GATHER.x + Math.cos(a) * r, GATHER.y + Math.sin(a) * r * 0.6);
      api().toast && api().toast('선생님이 분수 광장으로 모두 불렀어요!');
      S.lastSend = 0;
    } else if (cmd.type === 'kick' && cmd.target === S.pid) {
      api().closeRide && api().closeRide();
      kickOut('선생님이 공원에서 내보냈어요.');
    }
  }

  // ---------- 보내기 ----------
  function snapshot(full) {
    var p = api().player();
    var d = { x: Math.round(p.x), y: Math.round(p.y), d: p.dir, m: p.moving ? 1 : 0, w: p.ride || 'park' };
    if (full) { d.n = p.nickname; d.g = p.grade; d.s = p.charId; d.gd = p.gender; }
    return d;
  }
  function tick() {
    if (!S.handle) return;
    var now = performance.now(), cur = snapshot(true), last = S.last || {};
    var changed = ['x', 'y', 'd', 'm', 'w'].some(function (k) { return cur[k] !== last[k]; });
    var who = ['n', 'g', 's', 'gd'].some(function (k) { return cur[k] !== last[k]; });
    if ((changed && now - S.lastSend >= SEND_MS) || who || now - S.lastSend >= BEAT_MS) {
      var send = who || now - S.lastSend >= BEAT_MS ? cur : snapshot(false);
      S.handle.update(send);
      S.last = cur; S.lastSend = now;
    }
  }

  // ---------- 그리기 ----------
  // 내 캐릭터보다 뒤(위쪽)에 있는 친구는 front=false 일 때, 앞(아래쪽)은 front=true 일 때 그림
  function drawOthers(ctx, time, myY, front, dt) {
    Object.keys(S.others).forEach(function (pid) {
      var o = S.others[pid], d = o.data;
      if (!d || d.w !== 'park' || !o.walker) return;
      if ((o.y > myY) !== front) return;
      var dx = o.tx - o.x, dy = o.ty - o.y, dist = Math.hypot(dx, dy);
      if (dist > 160) { o.x = o.tx; o.y = o.ty; }   // 순간 이동(모두 모으기 등)
      else { var k = Math.min(1, (dt || 0.016) * 10); o.x += dx * k; o.y += dy * k; }
      var moving = d.m === 1 || dist > 1.5;
      o.walker.draw(ctx, o.x, o.y, d.d || 'down', moving, time);
    });
  }
  function nameTag(ctx, text, x, y, mine) {
    ctx.save();
    ctx.font = '600 11px Jua, "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    var w = ctx.measureText(text).width + 10;
    ctx.fillStyle = mine ? 'rgba(18,131,122,0.92)' : 'rgba(40,24,70,0.82)';
    var r = 6, bx = x - w / 2, by = y - 15;
    ctx.beginPath(); ctx.moveTo(bx + r, by); ctx.arcTo(bx + w, by, bx + w, by + 15, r); ctx.arcTo(bx + w, by + 15, bx, by + 15, r);
    ctx.arcTo(bx, by + 15, bx, by, r); ctx.arcTo(bx, by, bx + w, by, r); ctx.fill();
    ctx.fillStyle = '#fff8e8'; ctx.fillText(text, x, y - 1.5);
    ctx.restore();
  }
  function drawNames(ctx, me) {
    if (!S.handle) return;
    Object.keys(S.others).forEach(function (pid) {
      var o = S.others[pid], d = o.data;
      if (d && d.w === 'park') nameTag(ctx, d.n || '친구', o.x, o.y - 64, false);
    });
    if (me) nameTag(ctx, me.nickname, me.x, me.y - 64, true);
  }

  // ---------- 위쪽 반 표시 ----------
  function setChip() {
    var chip = document.getElementById('roomChip');
    if (!chip) return;
    if (!S.handle) { chip.hidden = true; return; }
    var all = Object.keys(S.others).map(function (k) { return S.others[k].data; }).filter(Boolean);
    var inRide = all.filter(function (d) { return d.w !== 'park'; }).length;
    chip.hidden = false;
    chip.textContent = '🏫 ' + S.code + '반 · 친구 ' + all.length + '명' + (inRide ? ' (놀이기구 ' + inRide + ')' : '');
    chip.title = all.map(function (d) { return d.n + (d.w !== 'park' ? ' — ' + (WHERE[d.w] || d.w) : ''); }).join('\n');
  }

  window.MPMulti = {
    askRoom: askRoom, onEnter: onEnter, leave: leave, tick: tick, drawOthers: drawOthers, drawNames: drawNames,
    active: function () { return !!S.handle; }, _state: S
  };
})();
