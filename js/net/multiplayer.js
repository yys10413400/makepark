/*
 * 메이크파크 함께하기 — 학생 쪽 (공원에서 다른 친구 보기, 선생님 명령 받기)
 * ------------------------------------------------------------
 * 입장 흐름: 첫 화면(닉네임·학년) → '어디로 갈까요?' 창(반 코드 입장 / 혼자 둘러보기) → (처음이면 캐릭터 고르기) → 공원
 * 공원에서: 같은 반 친구들이 자기 캐릭터로 걸어 다니고 머리 위에 닉네임이 보임. 놀이기구 안에 있는 친구는 공원에서 안 보임.
 * 건물 안(유령의 집 로비): 같은 건물 로비에 있는 친구도 보임 — 로비 위치는 rx·ry·rd·rm 으로 따로 보냄
 * 선생님 명령: 모두 모으기(분수 광장으로 순간 이동, 놀이기구에서도 나옴) · 내보내기 · 공원 닫기
 * 선생님 설정(반 공원 meta): 계절(season) — 모든 학생 화면이 같은 계절로 · 대화 끄기(chatOff)
 * 대화: 화면 아래에서 정해진 이모지·문장만 골라 말함 → 캐릭터 머리 위 말풍선(4초). 글자를 직접 쓰지 않음
 * 같이 놀기: 공원에서 친구 가까이 가면 '👋 ○○와 같이 놀기' → 초대 → 친구가 '좋아' → 둘이 유령의 집 '친구랑 문지기'를 각자 기기로
 * 연결: js/net/net.js (MPNet) / 게임과의 창구: window.MP_API (game.js)
 */
(function () {
  'use strict';
  var NET = window.MPNet;
  if (!NET) return;
  var SEND_MS = 200, BEAT_MS = 3000;   // 움직일 때 1초에 5번, 가만히 있으면 3초마다
  var GATHER = { x: 690, y: 600 };      // 모두 모으기: 분수 광장 앞
  var WHERE = { coaster: '코스터 익스프레스', ghost: '유령의 집', melody: '멜로디 스테이지', picnic: '피크닉 가게' };

  var S = { code: null, handle: null, pid: null, others: {}, last: null, lastSend: 0, joinedAt: 0, mySay: null, chatOff: false, lastSay: 0 };
  // 보낼 수 있는 말(번호로만 주고받음 — 번호를 바꾸면 예전 기기와 뜻이 달라지므로 끝에만 더하기)
  //   0~9: 이모지 줄, 10~: '💬 말하기' 문장
  var SAYS = {
    0: '😀', 1: '👍', 2: '❤️', 3: '😂', 4: '😮', 5: '👋',
    10: '안녕!', 11: '반가워!', 12: '같이 가자!', 13: '여기로 와!', 14: '잠깐 기다려 줘!',
    15: '고마워!', 16: '잘했어!', 17: '대단해!', 18: '미안해', 19: '또 만나!'
  };
  var EMOJI_IDS = [0, 1, 2, 3, 4, 5], PHRASE_IDS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  var SAY_MS = 4000, SAY_GAP = 2000;   // 말풍선 보이는 시간 · 다음 말까지 기다리는 시간(도배 막기)
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
    // type=password·name 을 쓰지 않음: 브라우저·비밀번호 관리자가 저장했다가 다음 접속 때 자동으로 채우지 못하게(항상 직접 입력)
    ui.pin = el('input', 'join-input'); ui.pin.id = 'joinPin'; ui.pin.type = 'text'; ui.pin.inputMode = 'numeric'; ui.pin.maxLength = 4; ui.pin.autocomplete = 'off';
    ui.pin.setAttribute('autocorrect', 'off'); ui.pin.setAttribute('autocapitalize', 'off'); ui.pin.spellcheck = false;
    ui.pin.setAttribute('data-lpignore', 'true'); ui.pin.setAttribute('data-1p-ignore', 'true'); ui.pin.setAttribute('data-form-type', 'other');
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
        // 무엇 때문인지 알 수 있게 오류 이름을 작게 덧붙임(선생님이 알려 주기 쉽게)
        var why = err && (err.code || err.message) ? ' (' + String(err.code || err.message).slice(0, 60) + ')' : '';
        ui.err.textContent = '연결하지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.' + why;
        console.error('반 공원 입장 실패', err);
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
      ui.pin.classList.toggle('pin-hide', exists);   // 있던 닉네임이면 점으로 가림(저장·자동 채우기 없이)
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
          ui.pin.value = '';   // 확인이 끝나면 입력칸에 남기지 않음
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
  // 뒤로 가기·앱 다시 열기로 예전 화면이 그대로 되살아나면(bfcache) 반 공원에 들어가 있던 상태가 남음 → 새로 불러와 다시 로그인하게
  window.addEventListener('pageshow', function (e) { if (e.persisted && S.studentKey) location.reload(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });

  // ---------- 공원 입장 / 나가기 ----------
  function onEnter() {
    leave();
    if (!S.code) { setChip(); if (api().setSeason) api().setSeason(null); return; }   // 혼자 둘러보기: 기본 계절
    S.pid = NET.myId(); S.others = {}; S.joinedAt = Date.now(); S.lastCmd = null; S.lastMate = ''; S.lastRoom = null; S.lastRoomSend = 0;   // 같은 컴퓨터라도 탭마다 다른 사람
    S.handle = NET.join(S.code, S.pid, snapshot(true));
    S.last = snapshot(true); S.lastSend = performance.now();
    S.handle.onPlayer(function (pid, data) {
      if (!data) { delete S.others[pid]; setChip(); return; }
      var o = S.others[pid];
      if (!o) {
        o = S.others[pid] = { x: data.x, y: data.y, walker: makeWalker(data) };
        api().toast && api().toast(data.tc ? '선생님이 공원에 오셨어요!' : data.n + ' 친구가 공원에 왔어요');
      }
      // 새로 한 말(st 가 바뀜)이면 말풍선. 처음 보이는 친구의 예전 말은 띄우지 않음
      if (o.data && data.st && data.st !== o.data.st && SAYS[data.sy] != null) o.say = { i: data.sy, until: performance.now() + SAY_MS };
      if (o.data && (!!o.data.tc !== !!data.tc)) o.walker = makeWalker(data);
      else if (o.walker && (o.data && (o.data.s !== data.s || o.data.gd !== data.gd))) o.walker.set(data.s, data.gd);
      o.data = data; o.tx = data.x; o.ty = data.y; o.seen = performance.now();
      setChip();
    });
    S.handle.onCommand(onCommand);
    // 선생님이 목록에서 나를 지우면(내보내기) 첫 화면으로
    // (인터넷이 잠깐 끊겨도 서버가 내 기록을 지우므로, 마지막 명령이 '나를 내보내기'일 때만 나감. 아니면 다시 들어감)
    S.handle.onRemovedMe = function () {
      if (!S.handle) return;
      var c = S.lastCmd;
      if (!S.isTeacher && c && c.type === 'kick' && c.target === S.pid) { api().closeRide && api().closeRide(); kickOut('선생님이 공원에서 내보냈어요.'); return; }
      if (S.handle.rejoin) S.handle.rejoin();
      S.last = {}; S.lastSend = 0; S.lastMate = ''; S.lastRoom = null; S.lastRoomSend = 0;   // 다음 tick 에 전체 정보를 다시 보냄
    };
    S.handle.onMeta(function (meta) {
      if (!S.handle) return;
      if (!meta || !meta.open) { kickOut('선생님이 공원을 닫았어요. 다음에 또 만나요!'); return; }
      if (meta.name && meta.name !== S.className) { S.className = meta.name; setChip(); }   // 선생님이 반 이름을 바꿈
      if (api().setSeason) api().setSeason(meta.season);   // 선생님이 고른 계절(없으면 기본)
      setChatOff(!!meta.chatOff);
    });
    setChip();
    showChat(true);
    startInvites();
    api().toast && api().toast(S.className + ' 공원에 들어왔어요!');
  }
  function leave() {
    stopInvites();
    if (S.handle) { S.handle.leave(); S.handle = null; }
    S.others = {}; S.mySay = null;
    setChip();
    showChat(false);
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
    // 들어오기 전부터 있던 명령은 무시(lastCmd 에도 넣지 않음 — 예전 내보내기로 다시 쫓겨나지 않게)
    if (initial || !S.handle) return;
    S.lastCmd = cmd;
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
    var now = performance.now(), cur = snapshot(true), last = S.last || {}, me = api().player();
    var changed = ['x', 'y', 'd', 'm', 'w'].some(function (k) { return cur[k] !== last[k]; });
    var who = ['n', 'g', 's', 'gd'].some(function (k) { return cur[k] !== last[k]; });
    if ((changed && now - S.lastSend >= SEND_MS) || who || now - S.lastSend >= BEAT_MS) {
      var send = who || now - S.lastSend >= BEAT_MS ? cur : snapshot(false);
      S.handle.update(send);
      S.last = cur; S.lastSend = now;
    }
    // 같이 노는 친구(선생님 화면에 '유령의 집 · ○○와 함께')는 위치와 따로 보냄:
    // 서버 규칙이 아직 예전 것(f 없음)이면 위치까지 통째로 막혀 친구들 화면에서 내가 안 보이게 되므로
    var mate = window.MPGate && MPGate.onlinePartner ? MPGate.onlinePartner() || '' : '';
    if (mate !== S.lastMate && (mate || S.lastMate)) { S.handle.update({ f: mate }); }
    S.lastMate = mate;
    // 건물 안(유령의 집 로비) 위치: 위치와 따로(규칙이 예전 것이어도 공원 위치는 막히지 않게)
    var lp = me.ride === 'ghost' && window.MPGate && MPGate.lobbyPos ? MPGate.lobbyPos() : null;
    var rk = lp ? [lp.x, lp.y, lp.dir, lp.moving ? 1 : 0].join(',') : '';
    if (rk !== S.lastRoom && (now - S.lastRoomSend >= SEND_MS || !lp)) {
      S.handle.update(lp ? { rx: lp.x, ry: lp.y, rd: lp.dir, rm: lp.moving ? 1 : 0 } : { rx: null, ry: null, rd: null, rm: null });
      S.lastRoom = rk; S.lastRoomSend = now;
    }
    updatePlayBtn();
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
    var now = performance.now();
    Object.keys(S.others).forEach(function (pid) {
      var o = S.others[pid], d = o.data;
      if (!d || d.w !== 'park') return;
      nameTag(ctx, (d.tc ? 'GM ' : '') + (d.n || '친구'), o.x, o.y - 64);
      if (o.say && o.say.until > now) bubble(ctx, o.say, o.x, o.y - 81, now);
    });
    if (me) {
      nameTag(ctx, (S.isTeacher ? 'GM ' : '') + me.nickname, me.x, me.y - 64);
      if (S.mySay && S.mySay.until > now) bubble(ctx, S.mySay, me.x, me.y - 81, now);
    }
  }
  // 말풍선: 이름표 바로 위. 이모지는 크게, 문장은 둥근 풍선 안에. 사라질 때 살짝 흐려짐
  function bubble(ctx, sayObj, x, y, now) {
    var text = SAYS[sayObj.i], emoji = sayObj.i < 10, left = sayObj.until - now;
    if (text == null) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, left / 400));
    var pop = Math.min(1, (SAY_MS - left) / 160), sc = 0.7 + 0.3 * pop;
    ctx.translate(x, y); ctx.scale(sc, sc);
    // 문장은 이름표처럼 얇은 글꼴(굵은 Jua 대신)
    ctx.font = emoji ? '20px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif'
      : '400 11.5px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var w = Math.max(emoji ? 34 : 30, ctx.measureText(text).width + (emoji ? 12 : 18)), h = emoji ? 30 : 22, r = h / 2;
    var bx = -w / 2, by = -h - 6;
    ctx.beginPath();
    ctx.moveTo(bx + r, by); ctx.arcTo(bx + w, by, bx + w, by + h, r); ctx.arcTo(bx + w, by + h, bx, by + h, r);
    ctx.lineTo(5, by + h); ctx.lineTo(0, by + h + 6); ctx.lineTo(-5, by + h);   // 아래 꼬리
    ctx.arcTo(bx, by + h, bx, by, r); ctx.arcTo(bx, by, bx + w, by, r); ctx.closePath();
    ctx.shadowColor = 'rgba(60,40,20,0.22)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1.5;
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(226,179,87,0.9)'; ctx.stroke();
    ctx.fillStyle = emoji ? '#1f2b5e' : '#3a4470'; ctx.fillText(text, 0, by + h / 2 + 1);
    ctx.restore();
  }

  // ---------- 대화창 (화면 아래) ----------
  var chat = null;
  function buildChat() {
    var bar = document.getElementById('chatBar');
    if (!bar) return null;
    chat = { bar: bar, emojis: document.getElementById('chatEmojis'), phrases: document.getElementById('chatPhrases'),
      more: document.getElementById('chatMore'), off: document.getElementById('chatOff') };
    EMOJI_IDS.forEach(function (i) {
      var b = el('button', 'chat-emoji', SAYS[i]); b.type = 'button'; b.dataset.say = i; b.setAttribute('aria-label', SAYS[i] + ' 보내기');
      chat.emojis.appendChild(b);
    });
    PHRASE_IDS.forEach(function (i) {
      var b = el('button', 'chat-phrase', SAYS[i]); b.type = 'button'; b.dataset.say = i; b.setAttribute('role', 'menuitem');
      chat.phrases.appendChild(b);
    });
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-say]');
      if (b) { say(Number(b.dataset.say)); b.blur(); openPhrases(false); return; }
      if (e.target.closest('#chatMore')) { openPhrases(chat.phrases.hidden); chat.more.blur(); }
    });
    // 문장 목록 밖을 누르거나 Esc 면 닫기
    document.addEventListener('pointerdown', function (e) { if (!chat.phrases.hidden && !chat.bar.contains(e.target)) openPhrases(false); });
    document.addEventListener('keydown', function (e) { if (e.code === 'Escape' && !chat.phrases.hidden) openPhrases(false); }, true);
    return chat;
  }
  function openPhrases(open) {
    if (!chat) return;
    chat.phrases.hidden = !open; chat.more.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function showChat(on) {
    if (!chat && !buildChat()) return;
    chat.bar.hidden = !on; openPhrases(false);
    document.body.classList.toggle('has-chat', !!on);
    if (on) setChatOff(S.chatOff);
  }
  function setChatOff(off) {
    S.chatOff = off;
    if (!chat) return;
    var blocked = off && !S.isTeacher;   // 선생님은 대화를 꺼도 말할 수 있음
    chat.bar.classList.toggle('is-off', blocked);
    chat.off.hidden = !blocked;
    chat.bar.querySelectorAll('button').forEach(function (b) { b.disabled = blocked; });
    if (blocked) openPhrases(false);
  }
  function say(i) {
    if (!S.handle || SAYS[i] == null) return;
    if (S.chatOff && !S.isTeacher) { if (api().toast) api().toast('선생님이 대화를 잠시 껐어요'); return; }
    var now = performance.now();
    if (now - S.lastSay < SAY_GAP) { if (api().toast) api().toast('조금 있다가 다시 말해요'); return; }
    S.lastSay = now;
    S.mySay = { i: i, until: now + SAY_MS };
    // 위치와 따로 보냄: 서버 규칙이 아직 예전 것이어도 위치 보내기는 막히지 않게
    S.handle.update({ sy: i, st: Date.now() });
    if (chat) {
      chat.bar.classList.add('cooling');
      setTimeout(function () { chat.bar.classList.remove('cooling'); }, SAY_GAP);
    }
  }

  // ---------- 같이 놀기: 친구 가까이 → 초대 → '좋아' → 둘이 유령의 집 '친구랑 문지기' ----------
  var NEAR = 60, INVITE_MS = 20000;
  var inv = { off: null, out: null, card: null, cardInv: null, btn: null };
  function josa(w, a, b) { var c = String(w).charCodeAt(String(w).length - 1) - 0xAC00, has = c >= 0 && c <= 11171 && c % 28 !== 0; return w + (has ? a : b); }
  function bandOf(g) { g = Number(g) || 1; return g <= 2 ? 'low' : g <= 4 ? 'middle' : 'high'; }
  function myNick() { return api().player().nickname; }
  function playBtn() {
    if (inv.btn) return inv.btn;
    var b = inv.btn = el('button', 'play-with'); b.type = 'button'; b.hidden = true;
    b.addEventListener('click', function () { if (b.dataset.pid) sendInvite(b.dataset.pid); b.blur(); });
    document.getElementById('app').appendChild(b);
    return b;
  }
  // 가장 가까운 친구(공원에 있는, 선생님 말고)
  function nearestFriend() {
    var me = api().player(), best = null, bd = NEAR;
    Object.keys(S.others).forEach(function (pid) {
      var o = S.others[pid], d = o.data;
      if (!d || d.tc || d.w !== 'park') return;
      var dist = Math.hypot(o.x - me.x, o.y - me.y);
      if (dist < bd) { bd = dist; best = { pid: pid, nick: d.n || '친구' }; }
    });
    return best;
  }
  function updatePlayBtn() {
    var b = playBtn(), me = api().player();
    var busy = !S.handle || S.isTeacher || me.ride || inv.card || document.body.classList.contains('gate-open');
    var f = busy ? null : nearestFriend();
    if (inv.out) { b.hidden = false; b.disabled = true; b.textContent = '💌 ' + josa(inv.out.nick, '에게', '에게') + ' 초대를 보냈어요…'; return; }
    b.disabled = false;
    if (!f) { b.hidden = true; delete b.dataset.pid; return; }
    b.hidden = false; b.dataset.pid = f.pid;
    b.textContent = '👋 ' + josa(f.nick, '과', '와') + ' 같이 놀기';
  }
  function sendInvite(to) {
    var o = S.others[to]; if (!o || !o.data || inv.out) return;
    var id = NET.newId(8), nick = o.data.n || '친구';
    inv.out = { to: to, nick: nick, id: id };
    var me = api().player();
    NET.shared.set(S.code, 'invites/' + to, { from: S.pid, fromNick: me.nickname, fromGrade: me.grade || 1, id: id, at: Date.now() });
    var done = function (msg) {
      if (!inv.out || inv.out.id !== id) return;
      clearTimeout(inv.out.timer); if (inv.out.off) inv.out.off();
      inv.out = null;
      if (msg && api().toast) api().toast(msg);
      updatePlayBtn();
    };
    inv.out.timer = setTimeout(function () { NET.shared.remove(S.code, 'invites/' + to); done(josa(nick, '이', '가') + ' 대답이 없어요. 다음에 다시 불러 봐요.'); }, INVITE_MS);
    inv.out.off = NET.shared.on(S.code, 'invites/' + to, function (v) {
      if (!v || v.id !== id || !v.reply) return;
      NET.shared.remove(S.code, 'invites/' + to);
      if (v.reply === 'yes' && v.gid) { done(null); joinGame(v.gid); }
      else done(v.reply === 'busy' ? josa(nick, '은', '는') + ' 지금 다른 놀이 중이에요.' : josa(nick, '은', '는') + ' 다음에 같이 놀재요.');
    });
    updatePlayBtn();
  }
  function startInvites() {
    stopInvites();
    if (S.isTeacher) return;
    inv.off = NET.shared.on(S.code, 'invites/' + S.pid, onInvite);
  }
  function stopInvites() {
    if (inv.off) { inv.off(); inv.off = null; }
    if (inv.out) { clearTimeout(inv.out.timer); if (inv.out.off) inv.out.off(); NET.shared.remove(S.code, 'invites/' + inv.out.to); inv.out = null; }
    closeCard();
    if (inv.btn) inv.btn.hidden = true;
  }
  function onInvite(v) {
    if (!v || v.reply) { if (!v || (inv.cardInv && inv.cardInv.id === v.id)) closeCard(); return; }
    if (inv.cardInv && inv.cardInv.id === v.id) return;
    var me = api().player();
    var lobbyOk = me.ride === 'ghost' && window.MPGate && MPGate.canInvite && MPGate.canInvite();
    if ((me.ride && !lobbyOk) || inv.out || (!lobbyOk && document.body.classList.contains('gate-open'))) { NET.shared.update(S.code, 'invites/' + S.pid, { reply: 'busy' }); return; }
    showCard(v);
  }
  function showCard(v) {
    closeCard();
    inv.cardInv = v;
    var wrap = inv.card = el('section', 'invite-card'); wrap.setAttribute('role', 'alertdialog'); wrap.setAttribute('aria-label', '같이 놀기 초대');
    wrap.appendChild(el('p', 'invite-title', '👋 ' + josa(v.fromNick, '이', '가') + ' 같이 놀재요!'));
    wrap.appendChild(el('p', 'invite-sub', '유령의 집 ‘친구랑 문지기’ — 한 명은 비밀 규칙을 만들고, 한 명은 문지기가 돼요. 각자 기기로 해요.'));
    var row = el('div', 'invite-btns');
    var yes = el('button', 'invite-yes', '좋아'); yes.type = 'button';
    var no = el('button', 'invite-no', '다음에'); no.type = 'button';
    row.appendChild(yes); row.appendChild(no); wrap.appendChild(row);
    document.getElementById('app').appendChild(wrap);
    setTimeout(function () { yes.focus(); }, 30);
    inv.cardTimer = setTimeout(function () { if (inv.cardInv && inv.cardInv.id === v.id) closeCard(); }, INVITE_MS);
    no.addEventListener('click', function () { NET.shared.update(S.code, 'invites/' + S.pid, { reply: 'no' }); closeCard(); });
    yes.addEventListener('click', function () {
      yes.disabled = no.disabled = true;
      var me = api().player(), gid = NET.newId(10);
      var game = { a: v.from, b: S.pid, aNick: v.fromNick, bNick: me.nickname, band: bandOf(Math.min(Number(v.fromGrade) || 1, Number(me.grade) || 1)),
        maker: v.from, stage: 'build', round: 1, at: Date.now() };   // 초대한 친구가 먼저 규칙을 만듦
      NET.shared.set(S.code, 'games/' + gid, game)
        .then(function () { return NET.shared.update(S.code, 'invites/' + S.pid, { reply: 'yes', gid: gid }); })
        .then(function () { closeCard(); joinGame(gid); }, function (err) {
          console.error('같이 놀기 시작 실패', err); closeCard();
          if (api().toast) api().toast('같이 놀기를 시작하지 못했어요. 다시 해 봐요.');
        });
    });
  }
  function closeCard() {
    clearTimeout(inv.cardTimer);
    if (inv.card && inv.card.parentNode) inv.card.parentNode.removeChild(inv.card);
    inv.card = null; inv.cardInv = null;
  }
  // 둘 다 유령의 집 검문대로(로비를 건너뜀)
  function joinGame(gid) {
    if (!api().openRide) return;
    api().openRide('ghost', { online: { code: S.code, gid: gid, me: S.pid } });
    S.lastSend = 0;
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
    active: function () { return !!S.handle; }, say: say,
    // 건물 안에 같이 있는 친구(유령의 집 로비): 부드럽게 따라가는 위치 + 그릴 캐릭터
    roomOthers: function (where, dt) {
      if (!S.handle) return [];
      var out = [], tnow = performance.now();
      Object.keys(S.others).forEach(function (pid) {
        var o = S.others[pid], d = o.data;
        if (!d || d.w !== where || typeof d.rx !== 'number' || typeof d.ry !== 'number') return;
        if (o.rw !== where || o.rx == null) { o.rx = d.rx; o.ry = d.ry; o.rw = where; }
        var dx = d.rx - o.rx, dy = d.ry - o.ry, dist = Math.hypot(dx, dy);
        if (dist > 300) { o.rx = d.rx; o.ry = d.ry; }
        else { var k = Math.min(1, (dt || 0.016) * 10); o.rx += dx * k; o.ry += dy * k; }
        var say = o.say && o.say.until > tnow && SAYS[o.say.i] != null ? { text: SAYS[o.say.i], emoji: o.say.i < 10, until: o.say.until } : null;
        out.push({ pid: pid, nick: d.n || '친구', tc: !!d.tc, x: o.rx, y: o.ry, dir: d.rd || 'down', moving: d.rm === 1 || dist > 3,
          sid: !d.tc && window.MPChars ? MPChars.spriteId(MPChars.byId(d.s) ? d.s : 'F1', d.gd === 'girl' ? 'girl' : 'boy') : null,
          walker: o.walker, say: say });
      });
      return out;
    },
    // 같이 놀 친구 목록(반 공원에 들어와 있을 때만, 선생님 제외). 혼자 둘러보기·선생님이면 null
    inviteList: function () {
      if (!S.handle || S.isTeacher) return null;
      return Object.keys(S.others).map(function (pid) {
        var d = S.others[pid].data;
        if (!d || d.tc) return null;
        var here = d.w === 'ghost' && typeof d.rx === 'number';
        return { pid: pid, nick: d.n || '친구', here: here, busy: !!d.f || (d.w !== 'park' && !here) };
      }).filter(Boolean).sort(function (a, b) { return (b.here - a.here) || (a.busy - b.busy); });
    },
    invite: function (pid) {
      if (!S.handle || inv.out || !S.others[pid]) { if (inv.out && api().toast) api().toast('초대한 친구의 대답을 기다리는 중이에요'); return false; }
      sendInvite(pid); return true;
    },
    // 미니맵용: 공원에 있는(놀이기구 밖) 친구·선생님 위치
    others: function () {
      return Object.keys(S.others).map(function (k) { return S.others[k]; })
        .filter(function (o) { return o.data && o.data.w === 'park'; })
        .map(function (o) { return { x: o.x, y: o.y, tc: !!o.data.tc }; });
    },
    _state: S
  };
})();
