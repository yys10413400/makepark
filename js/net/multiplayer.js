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
  // 유령의 집 '비밀 규칙' 안내창처럼: 크림색 카드 하나에 제목·한 줄 안내·입력칸·버튼만
  function buildDialog() {
    var wrap = ui.dlg = el('section', 'overlay dim join-overlay'); wrap.hidden = true;
    function card(titleId, title) {
      var f = el('form', 'join-card'); f.noValidate = true; f.autocomplete = 'off';
      f.setAttribute('role', 'dialog'); f.setAttribute('aria-modal', 'true'); f.setAttribute('aria-labelledby', titleId);
      var h = el('h2', 'join-title', title); h.id = titleId; f.appendChild(h);
      return f;
    }
    // 1단계: 반 코드
    var p = card('joinTitle', '🏫 우리 반 공원');
    ui.hello = el('p', 'join-line'); p.appendChild(ui.hello);
    ui.code = el('input', 'join-input'); ui.code.id = 'joinCode'; ui.code.type = 'text';
    ui.code.inputMode = 'numeric'; ui.code.maxLength = 5; ui.code.placeholder = '반 코드 5자리'; ui.code.autocomplete = 'off';
    ui.code.setAttribute('aria-label', '선생님이 알려 준 반 코드(숫자 5자리)');
    p.appendChild(ui.code);
    ui.err = el('p', 'join-err'); ui.err.setAttribute('aria-live', 'polite'); p.appendChild(ui.err);
    var row = el('div', 'join-btns');
    ui.go = el('button', 'join-btn', '입장하기'); ui.go.type = 'submit'; row.appendChild(ui.go);
    ui.solo = el('button', 'join-btn light', '혼자 둘러보기'); ui.solo.type = 'button'; row.appendChild(ui.solo);
    p.appendChild(row);
    // 선생님 화면은 따로 설치하는 '메이크파크 선생님' 앱(teacher.html) — 학생 앱에는 링크를 두지 않음
    if (NET.mode === 'local') p.appendChild(el('p', 'join-mode', '시험 모드: 이 컴퓨터의 다른 탭끼리만 함께 보여요.'));
    ui.back = el('button', 'join-back', '← 뒤로'); ui.back.type = 'button'; p.appendChild(ui.back);
    wrap.appendChild(p);
    // 2단계: 비밀번호 4자리 (반 공원에 저장된 내 기록 불러오기)
    var q = ui.pinForm = card('pinTitle', '🔒 비밀번호'); q.hidden = true;
    ui.pinText = el('p', 'join-line'); q.appendChild(ui.pinText);
    ui.pin = el('input', 'join-input'); ui.pin.id = 'joinPin'; ui.pin.inputMode = 'numeric'; ui.pin.maxLength = 4; ui.pin.autocomplete = 'off';
    ui.pin.placeholder = '숫자 4자리'; ui.pin.setAttribute('aria-label', '비밀번호 숫자 4자리');
    q.appendChild(ui.pin);
    ui.pinErr = el('p', 'join-err'); ui.pinErr.setAttribute('aria-live', 'polite'); q.appendChild(ui.pinErr);
    var qrow = el('div', 'join-btns');
    ui.pinGo = el('button', 'join-btn', '확인'); ui.pinGo.type = 'submit'; qrow.appendChild(ui.pinGo);
    q.appendChild(qrow);
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
    ui.hello.textContent = entry.name + '님, 선생님이 알려 준 반 코드를 넣어요.';
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
        S.code = code; S.teacher = meta.teacher || '선생님'; S.className = meta.name || (code + '반');
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
        ? entry.name + '님, 다시 왔군요! 비밀번호를 넣으면 기록을 이어서 해요.'
        : '처음 왔어요! 비밀번호 4자리를 정해요. 다른 기기에서 이어 할 때 써요.';
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
        o = S.others[pid] = { x: data.x, y: data.y, walker: makeWalker(data) };
        api().toast && api().toast(data.tc ? '선생님이 공원에 오셨어요!' : data.n + ' 친구가 공원에 왔어요');
      }
      if (o.data && (!!o.data.tc !== !!data.tc)) o.walker = makeWalker(data);
      else if (o.walker && (o.data && (o.data.s !== data.s || o.data.gd !== data.gd))) o.walker.set(data.s, data.gd);
      o.data = data; o.tx = data.x; o.ty = data.y; o.seen = performance.now();
      setChip();
    });
    S.handle.onCommand(onCommand);
    S.handle.onMeta(function (meta) {
      if (!S.handle) return;
      if (!meta || !meta.open) kickOut('선생님이 공원을 닫았어요. 다음에 또 만나요!');
      else if (meta.name && meta.name !== S.className) { S.className = meta.name; setChip(); }   // 선생님이 반 이름을 바꿈
    });
    setChip();
    api().toast && api().toast(S.className + ' 공원에 들어왔어요!');
  }
  function leave() {
    if (S.handle) { S.handle.leave(); S.handle = null; }
    S.others = {};
    setChip();
  }
  // 친구는 학생 캐릭터(js/characters.js), 선생님(tc)은 동물 선생님(js/teacher-chars.js)으로 그림
  function makeWalker(data) {
    if (data.tc && window.MPTeacherChars) return new MPTeacherChars.Walker(data.s);
    return window.MPChars ? new MPChars.Walker({ id: data.s, gender: data.gd }) : null;
  }
  function kickOut(msg) {
    if (S.isTeacher) { leave(); backToTeacher(); return; }
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
    } else if (cmd.type === 'kick' && cmd.target === S.pid && !S.isTeacher) {
      api().closeRide && api().closeRide();
      kickOut('선생님이 공원에서 내보냈어요.');
    }
  }

  // ---------- 보내기 ----------
  function snapshot(full) {
    var p = api().player();
    var d = { x: Math.round(p.x), y: Math.round(p.y), d: p.dir, m: p.moving ? 1 : 0, w: p.ride || 'park' };
    if (full) { d.n = p.nickname; d.g = p.grade; d.s = p.charId; d.gd = p.gender; if (p.teacher) d.tc = 1; }
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
  // 이름표: 모두 같은 모양(흰 바탕 + 얇은 갈색 글씨), 선생님은 이름 앞에 'GM'
  function nameTag(ctx, text, x, y) {
    ctx.save();
    ctx.font = '400 10.5px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    var w = ctx.measureText(text).width + 10, hgt = 15;
    var r = 7, bx = x - w / 2, by = y - hgt;
    ctx.beginPath(); ctx.moveTo(bx + r, by); ctx.arcTo(bx + w, by, bx + w, by + hgt, r); ctx.arcTo(bx + w, by + hgt, bx, by + hgt, r);
    ctx.arcTo(bx, by + hgt, bx, by, r); ctx.arcTo(bx, by, bx + w, by, r); ctx.closePath();
    ctx.shadowColor = 'rgba(60,40,20,0.18)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(120,85,50,0.3)'; ctx.stroke();
    ctx.fillStyle = '#6b4423'; ctx.fillText(text, x, y - 2.5);
    ctx.restore();
  }
  function drawNames(ctx, me) {
    if (!S.handle) return;
    Object.keys(S.others).forEach(function (pid) {
      var o = S.others[pid], d = o.data;
      if (d && d.w === 'park') nameTag(ctx, (d.tc ? 'GM ' : '') + (d.n || '친구'), o.x, o.y - 64);
    });
    if (me) nameTag(ctx, (S.isTeacher ? 'GM ' : '') + me.nickname, me.x, me.y - 64);
  }

  // ---------- 위쪽 반 표시 ----------
  function setChip() {
    var chip = document.getElementById('roomChip');
    if (!chip) return;
    if (!S.handle) { chip.hidden = true; return; }
    var every = Object.keys(S.others).map(function (k) { return S.others[k].data; }).filter(Boolean);
    var all = every.filter(function (d) { return !d.tc; }), teacherIn = every.length > all.length;
    var inRide = all.filter(function (d) { return d.w !== 'park'; }).length;
    chip.hidden = false;
    chip.textContent = '🏫 ' + (S.className || S.code + '반') + ' · ' + (S.isTeacher ? '학생 ' : '친구 ') + all.length + '명' + (inRide ? ' (놀이기구 ' + inRide + ')' : '') + (teacherIn ? ' · GM 선생님' : '');
    chip.title = all.map(function (d) { return d.n + (d.w !== 'park' ? ' — ' + (WHERE[d.w] || d.w) : ''); }).join('\n');
  }

  // ---------- 선생님 모드: 선생님 화면의 '공원에 들어가기' → index.html?teacher=반코드&avatar=동물 ----------
  // 선생님 구글 계정(그 반을 만든 선생님)으로 확인한 뒤, 고른 동물 선생님으로 바로 그 반 공원에 들어감
  function backToTeacher() { location.href = 'teacher.html' + (S.code ? '#room=' + S.code : ''); }
  var TQ = /[?&]teacher=(\d{5})/.exec(location.search), TA = /[?&]avatar=([a-z]+)/.exec(location.search);
  if (TQ && NET.teacher) {
    S.isTeacher = true;
    document.documentElement.classList.add('teacher-mode');
    var started = false;
    NET.teacher.watch(function (user) {
      if (started) return;
      if (!user) { location.href = 'teacher.html'; return; }
      started = true;
      var code = TQ[1];
      NET.getRoom(code).then(function (meta) {
        if (!meta || !NET.isOwner(meta)) { alert('내가 만든 반 공원이 아니에요. 선생님 화면으로 돌아갈게요.'); location.href = 'teacher.html'; return; }
        if (!meta.open) { alert('공원이 닫혀 있어요. 선생님 화면에서 공원을 다시 연 뒤 들어와 주세요.'); location.href = 'teacher.html#room=' + code; return; }
        S.code = code; S.teacher = meta.teacher || user.name; S.className = meta.name || (code + '반');
        var avatar = TA && window.MPTeacherChars && MPTeacherChars.valid(TA[1]) ? TA[1] : (window.MPTeacherChars && MPTeacherChars.first());
        // 위쪽 오른쪽에 '선생님 화면으로' 버튼
        var right = document.querySelector('#hud .hud-right');
        if (right) {
          var b = el('button', 'btn hud-btn teacher-back', '← 선생님 화면'); b.type = 'button';
          b.addEventListener('click', function () { leave(); backToTeacher(); });
          right.insertBefore(b, right.firstChild);
        }
        api().enterAsTeacher(S.teacher, avatar);
      });
    });
  }

  window.MPMulti = {
    askRoom: askRoom, onEnter: onEnter, leave: leave, tick: tick, drawOthers: drawOthers, drawNames: drawNames,
    active: function () { return !!S.handle; }, _state: S
  };
})();
