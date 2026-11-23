/*
 * 토토의 범퍼카 연구소 — 학년별 미션 (화면과 분리된 순수 로직)
 * ------------------------------------------------------------
 * 2022 개정 교육과정 연계: 1학년 즐거운 생활(별 칸에 주차) · 2학년 슬기로운 생활 '도구의 모양과 기능'(밀판)
 *  3학년 과학 '힘과 우리 생활'(밀기·당기기) · 4학년 '자석의 이용' · 5학년 '빛의 성질' · 6학년 '물체의 운동'
 * create(grade) → 미션 객체 ms
 *   ms.world            : 물리 세계(js/thrill/physics.js) — 차·카트·상자·막힌 곳
 *   ms.stage / ms.done  : 지금 단계(0부터) / 모두 끝났는지
 *   ms.log              : 같은 미션에서 모은 관찰 기록(다시 시도해도 남음)
 *   ms.step(ix, iy, dt) : 한 프레임 진행 → 사건 목록
 *        { type:'hint', text }   막혔을 때 토토 한 문장(무엇이 일어났는지 + 다음에 해 볼 행동)
 *        { type:'note', text }   관찰 기록·안내
 *        { type:'stage', text }  단계 끝 → 다음 단계 안내
 *        { type:'ask', q }       질문 카드(q.id, q.text, q.options[{id,label}])
 *        { type:'complete' }     미션 완료
 *        { type:'arrow', x, y, ang } / { type:'path', pts } / { type:'crash', n }  화면 효과
 *   ms.answer(qid, optId) → 사건 목록,  ms.action(id) → 사건 목록,  ms.buttons() → 아래 줄 버튼
 *   ms.retry()          : 지금 단계의 차와 소품만 처음 자리로(끝낸 단계·관찰 기록은 그대로)
 * create('free', grade) : 미션 없는 자유 주행(5학년 고르면 밤 경기장)
 */
(function (root) {
  'use strict';
  var P = root.MP_THRILL_PHYS || (typeof require !== 'undefined' ? require('./physics.js') : null);
  var PI = Math.PI;
  var len = P.len;

  var GRADES = {
    1: { title: '별 칸에 주차해요', subject: '즐거운 생활', night: false,
      goal: '별 주차 칸 안에 차를 멈춰요',
      howto: { goal: '경기장을 돌아다니며 별 주차 칸을 찾아 그 안에 차를 멈춰요. (두 번)',
        move: '방향키(또는 화면 방향 패드)를 누르면 달리고, 놓으면 조금 굴러가다 멈춰요.',
        ctrl: ['흰 점 = 방향키를 놓은 곳', '작은 별 = 차가 실제로 멈춘 곳'] } },
    2: { title: '둥근 별 상자를 옮겨요', subject: '슬기로운 생활 · 도구의 모양과 기능', night: false,
      goal: '밀판으로 상자를 밀어 코너를 돌아 배달 칸까지',
      howto: { goal: '평평한 밀판과 양 끝이 굽은 밀판으로 같은 상자를 한 번씩 밀어 보고, 하나를 골라 배달 칸에 상자를 멈춰요.',
        move: '차 앞에 밀판이 달려 있어요. 상자 뒤에서 천천히 밀고, 코너에서는 대각선(↘)으로 부드럽게 돌아요.',
        ctrl: ['[평평한 밀판] [굽은 밀판] 마지막 배달 때 골라요'] } },
    3: { title: '카트를 밀고 당겨요', subject: '과학 · 힘과 우리 생활', night: false,
      goal: '카트를 밀어서, 그다음 당겨서 옮겨요',
      howto: { goal: '① 범퍼카로 카트 뒤를 밀어 밀기 구역까지 ② 카트 앞 고리에 줄을 달고 끌어서 당기기 구역까지.',
        move: '방향키로 카트에 다가가 밀어요. 당길 때는 줄을 단 뒤 카트 반대쪽으로 달려요.',
        ctrl: ['[견인 줄 달기] 고리 가까이에서 눌러요', '[줄 풀기] 줄을 떼어요'] } },
    4: { title: '자석으로 별 카트를 데려와요', subject: '과학 · 자석의 이용', night: false,
      goal: '자석 극을 바꿔 가며 카트가 어떻게 움직이는지 관찰해요',
      howto: { goal: '카트에 닿기 전에 밀어내는 모습과 끌어당기는 모습을 모두 관찰한 뒤, 끌어당기는 극으로 카트를 배달 칸에 데려와요.',
        move: '카트의 자석 쪽(왼쪽)으로 천천히 다가가요. 부딪쳐서 민 것은 관찰로 치지 않아요.',
        ctrl: ['[자석 뒤집기] 내 차 앞 극을 N ↔ S로 바꿔요'] } },
    5: { title: '밤 경기장의 숨은 표지판', subject: '과학 · 빛의 성질', night: true,
      goal: '헤드라이트로 별 표지판 두 개를 찾아요',
      howto: { goal: '헤드라이트를 켜고 첫 표지판을 찾아요. 가림막 뒤 표지판은 거울에 빛을 비춰 반사된 빛으로 밝혀요.',
        move: '빛은 차가 보는 쪽으로 나가요. 차를 돌려 빛의 방향을 바꿔요.',
        ctrl: ['[헤드라이트 켜기] 빛을 켜고 꺼요'] } },
    6: { title: '내 주행 기록을 비교해요', subject: '과학 · 물체의 운동', night: false,
      goal: '측정선을 지나 3초 동안 달린 길이를 두 번 재요',
      howto: { goal: '측정선을 지나면 3초 동안 실제로 달린 길의 길이를 재요. 두 번 달린 뒤 어느 쪽이 더 빨랐는지 고르고 평균 속력을 구해요.',
        move: '코너를 돌거나 멈춰도 괜찮아요. 굽은 길도 달린 만큼 모두 재요.',
        ctrl: ['측정 중에 선을 다시 밟아도 시간은 그대로 흘러요', '거리 100칸(그림 100px) = 1m'] } }
  };

  // ---------- 공통 ----------
  function baseWorld(start) {
    return { car: P.makeCar(start.x, start.y, start.ang || 0), bodies: [], boxes: [], plate: null, t: 0, extra: null };
  }
  function inRect(o, r) { return o.x > r[0] && o.x < r[2] && o.y > r[1] && o.y < r[3]; }
  function padRect(p, hw, hh) { return [p.x - hw, p.y - hh, p.x + hw, p.y + hh]; }
  function speed(o) { return len(o.vx, o.vy); }
  function fmt1(v) { return (Math.round(v * 10) / 10).toFixed(1); }

  function Mission(grade, free) {
    this.grade = grade; this.free = !!free; this.def = GRADES[grade] || GRADES[1];
    this.night = this.def.night;
    this.stage = 0; this.done = false; this.log = []; this.hintT = -9; this.t = 0; this.pending = [];
    this.lights = this.night && this.free;
    this.magnet = 'N'; this.plateChoice = 'curve';
    this.setup();
  }
  var M = Mission.prototype;
  M.ev = function (e) { this.pending.push(e); };
  M.hint = function (text, gap) {
    if (this.t - this.hintT < (gap == null ? 4 : gap)) return;
    this.hintT = this.t; this.ev({ type: 'hint', text: text });
  };
  M.goal = function () {
    if (this.free) return '자유 주행! 마음껏 달려 봐요';
    var f = GOALS[this.grade]; return f ? f.call(this) : this.def.goal;
  };
  M.stageIntro = function () { var f = INTROS[this.grade]; return f ? f.call(this) : ''; };
  M.stages = function () { return [2, 3, 2, 2, 2, 1][this.grade - 1]; };   // 6학년은 한 단계(두 번 달리기 + 질문 두 개)
  M.setup = function () {
    this.t0 = this.t; this.hintT = this.t - 3;
    var f = this.free ? null : SETUP[this.grade];
    if (f) f.call(this); else this.world = baseWorld({ x: 300, y: 600, ang: 0 });
    this.world.t = this.t;
  };
  M.retry = function () { if (this.done) return; this.pending = []; this.setup(); };
  M.nextStage = function (text) {
    this.stage++;
    if (this.stage >= this.stages()) { this.done = true; this.ev({ type: 'complete' }); return; }
    this.setup();
    this.ev({ type: 'stage', text: text });
  };
  M.step = function (ix, iy, dt) {
    this.t += dt; this.world.t = this.t;
    var w = this.world, before = speed(w.car);
    w.bodies.forEach(function (b) { b.px = b.x; b.py = b.y; });
    var ev = P.stepWorld(w, ix, iy, dt);
    w.bodies.forEach(function (b) { b.fdx = b.x - b.px; b.fdy = b.y - b.py; });
    this.lastEv = ev;
    if (ev.wallHit > 90) this.ev({ type: 'crash', n: ev.lastN, power: ev.wallHit });
    if (!this.free && !this.done && STEP[this.grade]) STEP[this.grade].call(this, ix, iy, dt, ev, before);
    var out = this.pending; this.pending = [];
    return out;
  };
  M.answer = function (qid, opt) {
    var f = ANSWER[this.grade]; if (f) f.call(this, qid, opt);
    var out = this.pending; this.pending = []; return out;
  };
  M.action = function (id) {
    var f = ACTION[this.grade]; if (f) f.call(this, id);
    if (id === 'lights') { this.lights = !this.lights; }
    var out = this.pending; this.pending = []; return out;
  };
  M.buttons = function () {
    if (this.free) return this.night ? [{ id: 'lights', label: this.lights ? '💡 헤드라이트 끄기' : '💡 헤드라이트 켜기', on: this.lights }] : [];
    var f = BUTTONS[this.grade]; return f ? f.call(this) : [];
  };

  var SETUP = {}, STEP = {}, GOALS = {}, INTROS = {}, ANSWER = {}, ACTION = {}, BUTTONS = {};

  // ================= 1학년: 별 칸에 주차 =================
  var G1 = [
    { start: { x: 300, y: 330, ang: 0 }, pad: { x: 1150, y: 470 } },
    { start: { x: 1380, y: 700, ang: PI }, pad: { x: 560, y: 640 } }
  ];
  SETUP[1] = function () {
    var s = G1[Math.min(this.stage, 1)];
    this.world = baseWorld(s.start);
    // 흰 점·별 기록은 관찰 기록이라 [다시 시도]해도 남김(새 단계에서만 비움)
    if (this.marksStage !== this.stage) { this.marks = []; this.marksStage = this.stage; }
    this.pad = s.pad; this.hadInput = false; this.rolling = false; this.passed = false; this.still = 0; this.judged = true; this.wasIn = false;
  };
  GOALS[1] = function () { return '별 주차 칸 ' + (this.stage + 1) + ' / 2 · 칸 안에 차를 멈춰요'; };
  INTROS[1] = function () { return this.stage ? '이번 별 칸은 다른 곳에 있어요. 경기장을 둘러보고 찾아봐요!' : '별 주차 칸을 찾아 그 안에서 차를 멈춰 봐요. 방향키를 놓으면 조금 더 굴러가요.'; };
  function g1In(o, pad) { return Math.abs(o.x - pad.x) < 92 && Math.abs(o.y - pad.y) < 50; }
  STEP[1] = function (ix, iy, dt, ev, before) {
    var car = this.world.car, sp = speed(car), input = ix || iy;
    var inPad = g1In(car, this.pad);
    if (!input && this.hadInput && before > 25) {
      this.rolling = true; this.passed = inPad; this.judged = false;
      this.marks.push({ rel: { x: car.x, y: car.y }, stop: null });
      if (this.marks.length > 5) this.marks.shift();
    }
    if (input) {
      this.judged = true;
      if (this.rolling) { var m = this.marks[this.marks.length - 1]; if (m && !m.stop) this.marks.pop(); }
      this.rolling = false;
    }
    this.hadInput = !!input;
    if (this.rolling && inPad) this.passed = true;
    if (this.rolling && sp < 2) {
      this.rolling = false;
      var mk = this.marks[this.marks.length - 1]; if (mk) mk.stop = { x: car.x, y: car.y };
    }
    this.still = sp < 2 ? this.still + dt : 0;
    if (this.still > 0.35 && !this.judged && !input) {
      this.judged = true;
      if (inPad) {
        this.log.push({ stage: this.stage, ok: true });
        this.nextStage('딱 멈췄어! 흰 점(놓은 곳)과 별(멈춘 곳) 사이만큼 차가 더 굴러갔지? 다음 별 칸도 찾아볼까?');
      } else if (this.passed) this.hint('별 칸을 지나갔네. 이번엔 조금 일찍 방향키를 놓아 볼까?', 0);
      else if (len(car.x - this.pad.x, car.y - this.pad.y) < 300) this.hint('별 칸 바로 앞에서 멈췄어. 조금 더 가까이 가서 방향키를 놓아 볼까?', 0);
    }
  };

  // ================= 2학년: 둥근 별 상자 =================
  var G2 = { start: { x: 250, y: 330, ang: 0 }, box: { x: 440, y: 330 }, corner: [0, 486, 1120, 941], pad: { x: 1392, y: 716 } };
  SETUP[2] = function () {
    this.world = baseWorld(G2.start);
    this.world.boxes = [G2.corner];
    this.world.plate = this.stage === 0 ? 'flat' : this.stage === 1 ? 'curve' : this.plateChoice;
    this.box = P.makeBody('box', G2.box.x, G2.box.y, 44, { fric: 240, mass: 0.7 });
    this.world.bodies = [this.box];
    this.pad = G2.pad; this.pushed = 0; this.slips = 0; this.onPlate = 0; this.still = 0; this.restT = 0;
    var me = this;
    this.world.extra = function (w, dt) { boxRoll(me, w, dt); };
  };
  GOALS[2] = function () {
    return this.stage === 0 ? '① 평평한 밀판으로 상자를 밀어 코너를 돌아 봐요'
      : this.stage === 1 ? '② 굽은 밀판으로 같은 상자를 밀어 봐요'
      : '③ 밀판을 골라 상자를 배달 칸 안에 멈춰요';
  };
  INTROS[2] = function () {
    return this.stage === 0 ? '차 앞에 평평한 밀판을 달았어. 상자를 밀어서 코너를 돌아 배달 칸 쪽으로 가 볼까?'
      : this.stage === 1 ? '이번엔 양 끝이 굽은 밀판이야. 같은 자리, 같은 코너에서 다시 밀어 봐!'
      : '어느 밀판으로 할지 아래에서 골라. 상자를 배달 칸 안에 멈추면 성공!';
  };
  var PLATE_NAME = { flat: '평평한 밀판', curve: '굽은 밀판' };
  // 둥근 상자는 밀판 면 위에서 굴러가며 옆으로 비켜나려 함: 차가 돌 때는 바깥쪽으로, 가운데에서 벗어나 있으면 더 벗어나는 쪽으로.
  // 평평한 밀판은 이 움직임을 막지 못해 상자가 밀판 끝으로 빠지고, 굽은 밀판은 양 끝이 막아 줌(막는 것은 physics.js 의 선분 충돌)
  function boxRoll(me, w, dt) {
    var car = w.car, b = me.box, last = me.lastAng == null ? car.ang : me.lastAng;
    var rate = P.angDiff(last, car.ang) / dt;
    me.lastAng = car.ang;
    if (w.t - (b.plateT || -9) > 0.1) return;
    var c = Math.cos(car.ang), s = Math.sin(car.ang), lx = b.x - car.x, ly = b.y - car.y;
    var lat = -lx * s + ly * c, sp = len(car.vx, car.vy);
    if (sp < 60) return;
    var push = -Math.sign(rate) * Math.min(Math.abs(rate), 3) * sp * 0.4 + lat * 4;
    b.vx += -s * push * dt; b.vy += c * push * dt;
  }
  STEP[2] = function (ix, iy, dt, ev) {
    var car = this.world.car, b = this.box;
    var on = this.t - (b.plateT || -9) < 0.12;
    if (on) { this.pushed += len(b.fdx, b.fdy); this.onPlate += dt; }
    // 밀판에서 상자가 옆으로 빠짐: 밀던 상자가 밀판 끝 바깥으로 벗어나고 차는 계속 달림
    var c = Math.cos(car.ang), s = Math.sin(car.ang), lx = b.x - car.x, ly = b.y - car.y;
    var fwd = lx * c + ly * s, lat = -lx * s + ly * c;
    if (!on && this.onPlate > 0.4 && speed(car) > 70 && fwd > 0 && Math.abs(lat) > 52) {
      this.slips++; this.onPlate = 0;
      this.ev({ type: 'note', text: '상자가 ' + PLATE_NAME[this.world.plate] + ' 옆으로 빠졌어요 (' + this.slips + '번)' });
      this.hint('상자가 밀판 옆으로 빠져나갔어. 상자 뒤로 다시 가서 천천히 돌아 볼까?', 3);
    }
    if (!on && len(lx, ly) > 260) this.onPlate = 0;
    var inPad = Math.abs(b.x - this.pad.x) < 108 && Math.abs(b.y - this.pad.y) < 62;
    this.still = inPad && speed(b) < 8 ? this.still + dt : 0;
    if (this.stage < 2) {
      var past = b.x > G2.corner[2] && b.y > G2.corner[1] + 90;   // 상자가 코너를 돌아 아래 길로 들어감
      this.restT = this.slips && speed(b) < 5 && len(lx, ly) > 200 ? this.restT + dt : 0;
      if (inPad || past || this.restT > 1.2) {
        var kind = this.world.plate;
        this.log.push({ plate: kind, slips: this.slips, delivered: inPad });
        var msg = PLATE_NAME[kind] + ' 시험 끝! ' + (this.slips ? '상자가 옆으로 ' + this.slips + '번 빠졌어요.' : '상자가 옆으로 빠지지 않았어요.') + (inPad ? ' 배달 칸까지 왔어요.' : '');
        if (this.stage === 0) { this.nextStage(msg + ' 이번엔 굽은 밀판으로 해 보자!'); return; }
        this.stage = 2; this.setup();
        this.ev({ type: 'note', text: msg });
        this.ev({ type: 'ask', q: { id: 'plate', text: '코너를 돌 때 어느 밀판이 상자를 옮기기 편했어?', options: [{ id: 'flat', label: '평평한 밀판' }, { id: 'curve', label: '굽은 밀판' }] } });
      }
    } else if (this.still > 0.3) {
      this.log.push({ plate: this.world.plate, final: true });
      this.nextStage(PLATE_NAME[this.world.plate] + '으로 배달 성공!');
    }
  };
  ANSWER[2] = function (qid, opt) {
    if (qid !== 'plate') return;
    var f = this.log.filter(function (l) { return l.plate === 'flat' && l.slips != null; })[0] || { slips: 0 };
    var c = this.log.filter(function (l) { return l.plate === 'curve' && l.slips != null; })[0] || { slips: 0 };
    this.plateChoice = opt; this.world.plate = opt;
    this.ev({ type: 'stage', text: (opt === 'curve'
      ? '그렇구나! 굽은 양 끝이 상자를 옆에서 감싸 줘서 코너에서도 덜 빠져.'
      : '평평한 밀판은 상자가 옆으로 미끄러지기 쉬웠을 거야. 그래도 천천히 돌면 옮길 수 있어!') +
      ' (기록: 평평한 밀판 ' + f.slips + '번 · 굽은 밀판 ' + c.slips + '번 빠짐) 이제 마음에 드는 밀판으로 배달해 봐!' });
  };
  ACTION[2] = function (id) {
    if (this.stage !== 2 || (id !== 'flat' && id !== 'curve')) return;
    this.plateChoice = id; this.world.plate = id;
  };
  BUTTONS[2] = function () {
    if (this.stage !== 2) return [{ id: 'plate-now', label: '지금: ' + PLATE_NAME[this.world.plate], disabled: true }];
    var p = this.world.plate;
    return [{ id: 'flat', label: '평평한 밀판', on: p === 'flat' }, { id: 'curve', label: '굽은 밀판', on: p === 'curve' }];
  };

  // ================= 3학년: 밀고 당기기 =================
  var G3 = [
    { start: { x: 260, y: 520, ang: 0 }, cart: { x: 640, y: 520 }, zone: [1020, 370, 1480, 670] },
    { start: { x: 770, y: 520, ang: 0 }, cart: { x: 1010, y: 520 }, zone: [170, 380, 480, 660] }
  ];
  var HOOK = { dx: -96, dy: 8 };   // 카트 가운데에서 견인 고리까지(카트 앞쪽 = 왼쪽)
  SETUP[3] = function () {
    var s = G3[this.stage];
    this.world = baseWorld(s.start);
    this.cart = P.makeBody('cart', s.cart.x, s.cart.y, 62, { fric: 520, mass: 1.6 });
    this.world.bodies = [this.cart];
    this.zone = s.zone; this.rope = null; this.ropeMoved = 0; this.pushMoved = 0; this.was = 0; this.awayT = 0;
    var me = this;
    this.world.extra = function (w, dt) { ropeStep(me, w, dt); };
  };
  function hookPt(c) { return { x: c.x + HOOK.dx, y: c.y + HOOK.dy }; }
  function rearPt(car) { return { x: car.x - Math.cos(car.ang) * (car.r - 6), y: car.y - Math.sin(car.ang) * (car.r - 6) }; }
  function ropeStep(me, w, dt) {
    var r = me.rope; if (!r) return;
    var car = w.car, c = me.cart, a = rearPt(car), h = hookPt(c), dx = a.x - h.x, dy = a.y - h.y, d = len(dx, dy);
    r.taut = d > r.L - 2;
    if (r.taut) r.tautT = w.t;
    if (d <= r.L) return;
    var ux = dx / d, uy = dy / d, corr = d - r.L;
    c.x += ux * corr * 0.86; c.y += uy * corr * 0.86;
    car.x -= ux * corr * 0.14; car.y -= uy * corr * 0.14;
    var cv = car.vx * ux + car.vy * uy, bv = c.vx * ux + c.vy * uy;
    if (cv > bv) { c.vx += (cv - bv) * ux * 0.9; c.vy += (cv - bv) * uy * 0.9; car.vx -= (cv - bv) * ux * 0.12; car.vy -= (cv - bv) * uy * 0.12; }
  }
  GOALS[3] = function () { return this.stage === 0 ? '① 카트 뒤를 밀어 밀기 구역까지 옮겨요' : '② 고리에 견인 줄을 달고 당겨서 당기기 구역까지'; };
  INTROS[3] = function () {
    return this.stage === 0 ? '범퍼카로 카트 뒤쪽(왼쪽)에 닿아서 오른쪽 밀기 구역까지 밀어 봐!'
      : '카트 앞(왼쪽)의 고리에 다가가 [견인 줄 달기]를 누르고, 왼쪽 당기기 구역 쪽으로 달려서 카트를 끌어 봐!';
  };
  STEP[3] = function (ix, iy, dt, ev) {
    var c = this.cart, sp = speed(c);
    // 카트가 움직이기 시작하는 순간 짧은 방향 화살표
    if (sp > 40 && this.was < 15) this.ev({ type: 'arrow', x: c.x, y: c.y - 30, ang: Math.atan2(c.vy, c.vx) });
    if (sp < 15 || sp > 40) this.was = sp;
    if (ev.touch.cart) this.pushMoved += len(c.fdx, c.fdy);
    else if (this.rope && this.t - (this.rope.tautT || -9) < 0.6) this.ropeMoved += len(c.fdx, c.fdy);   // 줄이 팽팽해서 끌려간 거리
    var inZone = inRect(c, this.zone);
    if (this.stage === 0) {
      if (inZone && sp < 30 && this.pushMoved > 150) { this.log.push({ push: Math.round(this.pushMoved) }); this.nextStage('밀었더니 카트가 밀리는 쪽으로 움직였어! 이번엔 당겨 볼까?'); return; }
      if (c.x < G3[0].cart.x - 90) this.hint('카트가 반대쪽으로 밀렸어. 카트 왼쪽 뒤로 돌아가서 오른쪽으로 밀어 볼까?');
    } else {
      if (inZone && this.ropeMoved > 150) { this.log.push({ pull: Math.round(this.ropeMoved) }); this.nextStage('줄을 당기니 카트가 차를 따라왔어! 밀기와 당기기를 모두 해냈어.'); return; }
      if (inZone && !this.rope) this.hint('카트를 밀어서 옮겼네. 이번엔 고리에 줄을 달고 끌어 볼까?');
      if (this.rope && !this.rope.taut && speed(this.world.car) < 5) { this.awayT += dt; if (this.awayT > 3) this.hint('줄이 느슨해. 카트에서 멀어지는 쪽으로 달려서 줄을 팽팽하게 해 볼까?'); } else this.awayT = 0;
    }
  };
  ACTION[3] = function (id) {
    if (id !== 'hitch' || this.stage !== 1) return;
    if (this.rope) { this.rope = null; this.ev({ type: 'note', text: '견인 줄을 풀었어요' }); return; }
    var car = this.world.car, h = hookPt(this.cart), d = len(car.x - h.x, car.y - h.y);
    if (d > car.r + 120) { this.hint('고리에서 너무 멀어. 카트 앞 고리 가까이 가서 눌러 봐!', 0); return; }
    var a = rearPt(car);
    this.rope = { L: Math.max(120, Math.min(240, len(a.x - h.x, a.y - h.y) + 10)), taut: false };
    this.ev({ type: 'note', text: '견인 줄을 달았어요! 카트 반대쪽으로 달려 봐요' });
  };
  BUTTONS[3] = function () {
    if (this.stage !== 1) return [];
    var car = this.world.car, h = hookPt(this.cart), near = len(car.x - h.x, car.y - h.y) <= car.r + 120;
    return [{ id: 'hitch', label: this.rope ? '🪢 줄 풀기' : '🪢 견인 줄 달기', on: !!this.rope, glow: !this.rope && near }];
  };

  // ================= 4학년: 자석 =================
  var G4 = { start: { x: 300, y: 540, ang: 0 }, cart: { x: 900, y: 540 }, pad: { x: 360, y: 290 } };
  var MAG = { range: 175, attach: 10 };
  SETUP[4] = function () {
    this.world = baseWorld(G4.start);
    this.cart = P.makeBody('cart', G4.cart.x, G4.cart.y, 62, { fric: 380, mass: 1.4, ang: PI, pole: 'N' });
    this.world.bodies = [this.cart];
    this.attached = false; this.asked = false; this.magAway = 0; this.magToward = 0; this.resetAt = 0; this.wasTouch = -9; this.active = false;
    var me = this;
    this.world.extra = function (w, dt) { magnetStep(me, w, dt); };
  };
  function magPt(c) { return { x: c.x + Math.cos(c.ang) * (c.r + 6), y: c.y + Math.sin(c.ang) * (c.r + 6) }; }
  function magnetStep(me, w, dt) {
    var car = w.car, c = me.cart, f = P.front(car, 8), m = magPt(c);
    var dx = f.x - m.x, dy = f.y - m.y, gap = len(dx, dy), ux = gap ? dx / gap : 0, uy = gap ? dy / gap : 0;
    var cdx = Math.cos(car.ang), cdy = Math.sin(car.ang);
    var same = me.magnet === c.pole;
    me.active = false;
    if (me.attached) {
      if (same) { me.attached = false; c.held = false; c.vx -= ux * 260; c.vy -= uy * 260; return; }
      var tx = f.x + cdx * (c.r + 4), ty = f.y + cdy * (c.r + 4);
      c.x = tx; c.y = ty; c.vx = car.vx; c.vy = car.vy; c.ang = car.ang + PI;
      me.active = true;
      return;
    }
    var facing = gap > 0.5 && (-ux * cdx - uy * cdy) > 0.55 && (ux * Math.cos(c.ang) + uy * Math.sin(c.ang)) > 0.35;
    if (!facing || gap > MAG.range) return;
    me.active = true;
    var k = 1 - gap / MAG.range, a = 260 + 1100 * k * k;
    if (same) {
      c.vx -= ux * a * dt; c.vy -= uy * a * dt;
      car.vx += ux * a * 0.3 * dt; car.vy += uy * a * 0.3 * dt;
    } else {
      c.vx += ux * a * dt; c.vy += uy * a * dt;
      if (gap < MAG.attach) { me.attached = true; c.held = true; }
    }
  }
  GOALS[4] = function () {
    if (this.stage === 0) {
      var r = obs(this, 'repel'), a = obs(this, 'attract');
      return '① 닿기 전 반응 관찰: 밀어냄 ' + (r ? '✔' : '□') + ' · 끌어당김 ' + (a ? '✔' : '□');
    }
    return '② 끌어당기는 극으로 별 카트를 배달 칸에 데려와요';
  };
  INTROS[4] = function () {
    return this.stage === 0 ? '카트 왼쪽에 N극 자석이 있어. 내 차 앞 극은 지금 ' + this.magnet + '극! 카트에 닿기 전에 어떻게 움직이는지 천천히 다가가 봐. [자석 뒤집기]로 극을 바꿀 수 있어.'
      : '이제 카트를 끌어당기는 극을 골라서, 카트를 붙인 채 왼쪽 위 배달 칸까지 데려와 봐!';
  };
  function obs(me, kind) { return me.log.filter(function (l) { return l.kind === kind; })[0]; }
  STEP[4] = function (ix, iy, dt, ev) {
    var c = this.cart, car = this.world.car;
    if (this.resetAt && this.t >= this.resetAt) { this.resetAt = 0; this.setup(); this.ev({ type: 'note', text: '같은 출발 자리로 돌아왔어요' }); return; }
    var touching = len(c.x - car.x, c.y - car.y) < c.r + car.r + 1.5;
    if (touching && !this.attached) {
      if (this.magAway > 10 || this.magToward > 10 || (ev.touch.cart && speed(c) > 30)) {
        if (this.stage === 0 && ev.touch.cart && !this.resetAt) this.hint('차가 카트에 닿아서 밀었어. 닿기 전에 카트가 어떻게 움직이는지 천천히 다가가 볼까?');
      }
      this.magAway = 0; this.magToward = 0; this.wasTouch = this.t;
    }
    // 자석 힘으로만 움직인 거리(차가 닿은 직후 0.4초 안의 움직임은 접촉으로 봄)
    if (this.active && !this.attached && this.t - this.wasTouch > 0.4) {
      var f = P.front(car, 8), m = magPt(c), gx = f.x - m.x, gy = f.y - m.y, g = len(gx, gy) || 1;
      var along = (c.fdx * gx + c.fdy * gy) / g;
      if (along > 0) this.magToward += along; else this.magAway -= along;
    }
    if (this.stage === 0 && !this.resetAt) {
      var pair = this.magnet + '극–' + c.pole + '극';
      if (this.magAway > 45 && !obs(this, 'repel')) {
        this.log.push({ kind: 'repel', pair: pair });
        this.ev({ type: 'note', text: '관찰 기록: ' + pair + ' → 닿기 전에 카트가 밀려났어요' });
        this.resetAt = this.t + 1.8;
      } else if ((this.magToward > 30 || this.attached) && !obs(this, 'attract')) {
        this.log.push({ kind: 'attract', pair: pair });
        this.ev({ type: 'note', text: '관찰 기록: ' + pair + ' → 닿기 전에 카트가 끌려왔어요' });
        this.resetAt = this.t + 1.8;
      }
      if (obs(this, 'repel') && obs(this, 'attract')) { this.resetAt = 0; this.nextStage('두 반응을 모두 봤어! 같은 극은 밀어내고, 다른 극은 끌어당겼지?'); }
      return;
    }
    if (this.stage === 1) {
      var inPad = Math.abs(c.x - G4.pad.x) < 100 && Math.abs(c.y - G4.pad.y) < 58;
      if (inPad && this.attached && speed(car) < 60) {
        if (!this.asked) { this.asked = true; c.vx = c.vy = 0; this.ev({ type: 'ask', q: { id: 'pole', text: '어떤 두 극이 마주 봤을 때 카트가 따라왔어?', options: [{ id: 'NN', label: 'N극과 N극' }, { id: 'SN', label: 'S극과 N극' }, { id: 'SS', label: 'S극과 S극' }] } }); }
      } else if (inPad && !this.attached) this.hint('카트를 밀어서 넣었네. 자석으로 붙여서 데려와 볼까?');
    }
  };
  ANSWER[4] = function (qid, opt) {
    if (qid !== 'pole') return;
    if (opt === 'SN') { this.log.push({ kind: 'answer', ok: true }); this.nextStage('맞아! 서로 다른 극(S극과 N극)이 마주 보면 끌어당겨.'); }
    else {
      this.ev({ type: 'hint', text: opt === 'NN' ? 'N극과 N극일 때는 카트가 밀려났어. 관찰 기록을 다시 보고 골라 볼까?' : '카트 쪽은 N극이었어. 카트가 따라올 때 내 차 앞 극은 무엇이었는지 떠올려 볼까?' });
      this.ev({ type: 'ask', q: { id: 'pole', text: '어떤 두 극이 마주 봤을 때 카트가 따라왔어?', options: [{ id: 'NN', label: 'N극과 N극' }, { id: 'SN', label: 'S극과 N극' }, { id: 'SS', label: 'S극과 S극' }] } });
    }
  };
  ACTION[4] = function (id) {
    if (id !== 'flip') return;
    this.magnet = this.magnet === 'N' ? 'S' : 'N';
    this.ev({ type: 'note', text: '내 차 앞 극: ' + this.magnet + '극' });
  };
  BUTTONS[4] = function () { return [{ id: 'flip', label: '🧲 자석 뒤집기 (지금 ' + this.magnet + '극)', on: this.magnet === 'S' }]; };

  // ================= 5학년: 빛 =================
  var G5 = {
    starts: [{ x: 300, y: 660, ang: 0 }, { x: 560, y: 660, ang: 0 }],
    screen: [990, 384, 1600, 424],       // 가림막(빛과 차를 막음). 그 위(안쪽) 길에 숨은 표지판
    mirrorBox: [836, 150, 968, 342],     // 거울 전체(차만 막음)
    mirror: { a: { x: 852, y: 312 }, b: { x: 952, y: 212 } },
    sign1: { id: 's1', x: 330, y: 300, r: 56 },
    sign2: { id: 's2', x: 1468, y: 262, r: 58 }
  };
  SETUP[5] = function () {
    this.world = baseWorld(G5.starts[this.stage]);
    this.world.boxes = this.free ? [] : [G5.screen, G5.mirrorBox];
    this.litT = 0; this.blockT = 0; this.mirT = 0; this.darkMove = 0; this.found = this.found || {};
  };
  // 무대(그리기·빛 계산이 같이 씀)
  function scene5(me) {
    if (me.free) return { blockers: [], mirrors: [], targets: [] };
    return { blockers: [G5.screen], mirrors: [G5.mirror], targets: [G5.sign1, G5.sign2] };
  }
  M.scene = function () { return this.grade === 5 ? scene5(this) : null; };
  M.rays = function () { return this.night && this.lights ? P.headlight(this.world.car, scene5(this), 0.38, 41) : []; };
  GOALS[5] = function () { return this.stage === 0 ? '① 헤드라이트를 켜고 첫 별 표지판을 찾아요' : '② 거울에 빛을 비춰 가림막 뒤 표지판을 밝혀요'; };
  INTROS[5] = function () {
    return this.stage === 0 ? '밤이라 깜깜해! [헤드라이트 켜기]를 누르고 경기장을 돌며 별 표지판을 찾아봐.'
      : '오른쪽 위 표지판은 가림막 뒤에 숨어 있어. 차를 돌려 가운데 거울에 빛을 비추면 빛이 어디로 갈까?';
  };
  STEP[5] = function (ix, iy, dt) {
    var car = this.world.car;
    if (!this.lights) {
      this.darkMove += speed(car) * dt;
      if (this.darkMove > 500) { this.darkMove = 0; this.hint('깜깜해서 잘 안 보여. [헤드라이트 켜기]를 눌러 볼까?'); }
      this.litT = 0; return;
    }
    var rays = this.rays(), hit1 = 0, hit2 = 0, blocked = 0, mir = 0, best = null;
    rays.forEach(function (r, i) {
      r.hits.forEach(function (h) {
        if (h.id === 's1') hit1++;
        if (h.id === 's2' && h.reflected) { hit2++; if (!best || Math.abs(i - 20) < best.i) best = { i: Math.abs(i - 20), r: r }; }
      });
      if (r.blocked === G5.screen && !r.mirror) blocked++;
      if (r.mirror) mir++;
    });
    this.rayInfo = { hit1: hit1, hit2: hit2, blocked: blocked, mir: mir };
    if (this.stage === 0) {
      this.litT = hit1 >= 2 ? this.litT + dt : 0;
      if (this.litT > 0.3) { this.found.s1 = true; this.log.push({ sign: 1 }); this.nextStage('첫 표지판을 찾았어! 빛이 닿으니 표지판이 반짝였지? 이제 숨은 표지판을 찾아보자.'); }
      return;
    }
    this.litT = hit2 >= 2 ? this.litT + dt : 0;
    if (this.litT > 0.3) {
      this.found.s2 = true;
      var pts = best.r.pts.slice(0, 3);
      var sx = G5.sign2.x, sy = G5.sign2.y;
      this.ev({ type: 'path', pts: [pts[0], pts[1], { x: sx, y: sy }] });
      this.log.push({ sign: 2, via: 'mirror' });
      this.nextStage('빛이 거울에 닿아 꺾여서 숨은 표지판을 밝혔어!');
      return;
    }
    this.blockT = blocked > 8 ? this.blockT + dt : 0;
    this.mirT = mir > 4 && !hit2 ? this.mirT + dt : 0;
    if (this.blockT > 1.4) { this.blockT = 0; this.hint('빛이 가림막에 막혔어. 가운데 거울 쪽으로 차를 돌려 비춰 볼까?'); }
    if (this.mirT > 2) { this.mirT = 0; this.hint('거울에서 빛이 꺾였어! 차를 조금 옆으로 옮겨 꺾인 빛을 표지판 쪽으로 보내 볼까?'); }
  };
  BUTTONS[5] = function () { return [{ id: 'lights', label: this.lights ? '💡 헤드라이트 끄기' : '💡 헤드라이트 켜기', on: this.lights, glow: !this.lights }]; };
  M.g5 = G5;

  // ================= 6학년: 주행 기록 =================
  var G6 = { start: { x: 250, y: 600, ang: 0 }, lineX: 520, dur: 3 };
  SETUP[6] = function () {
    this.world = baseWorld(G6.start);
    this.meter = P.makeMeter(G6.lineX, G6.dur);
    this.runs = this.runs || [];
  };
  GOALS[6] = function () {
    if (this.meter && this.meter.on) return '측정 중… ' + Math.max(0, G6.dur - this.meter.t).toFixed(1) + '초 남음';
    return this.runs.length < 2 ? '측정선을 지나 3초 동안 달려요 (기록 ' + this.runs.length + ' / 2)' : '두 기록을 비교해요';
  };
  INTROS[6] = function () { return '노란 측정선을 지나면 3초 동안 달린 길이를 재. 곧게 달려도, 빙글 돌아도, 멈춰도 좋아. 두 번 달려 보자!'; };
  STEP[6] = function (ix, iy, dt) {
    if (this.runs.length >= 2 || this.asking) return;
    var r = P.stepMeter(this.meter, this.world.car, dt);
    if (!r) return;
    var m = P.meters(r.dist);
    this.runs.push({ m: m, px: r.dist, time: r.time, path: r.path });
    this.log.push({ run: this.runs.length, m: m });
    this.ev({ type: 'note', text: this.runs.length + '번 주행: 3초 동안 ' + fmt1(m) + 'm 달렸어요' });
    this.meter = P.makeMeter(G6.lineX, G6.dur); this.meter.last = { x: this.world.car.x, y: this.world.car.y };
    if (this.runs.length === 1) this.hint('좋아! 이번엔 다르게 달려 볼까? 측정선을 다시 지나면 2번 주행을 재.', 0);
    if (this.runs.length === 2) { this.asking = true; this.ev({ type: 'ask', q: askFaster(this) }); }
  };
  function askFaster(me) {
    return { id: 'faster', text: '같은 3초 동안 어느 주행이 더 빨랐어?', compare: true,
      options: [{ id: '1', label: '1번 주행' }, { id: '2', label: '2번 주행' }, { id: 'same', label: '같아요' }, { id: 'redo', label: '다시 달리기', light: true }] };
  }
  function speedOptions(me) {
    var d = me.runs[0].m, right = P.speedOf(d, G6.dur);
    var wrong = [Math.round(d * G6.dur * 10) / 10, Math.round((d - G6.dur) * 10) / 10, Math.round((d + G6.dur) * 10) / 10].filter(function (v) { return v > 0 && v !== right; });
    var opts = [right].concat(wrong.slice(0, 2));
    opts.sort(function (a, b) { return a - b; });
    return { id: 'speed', text: '1번 주행의 평균 속력은? ' + fmt1(d) + 'm ÷ 3초 = ? (소수 둘째 자리에서 반올림)', compare: true,
      options: opts.map(function (v) { return { id: fmt1(v), label: fmt1(v) + ' m/s' }; }), right: fmt1(right) };
  }
  ANSWER[6] = function (qid, opt) {
    if (qid === 'faster') {
      if (opt === 'redo') { this.runs = []; this.asking = false; this.setup(); this.ev({ type: 'note', text: '기록을 지우고 다시 달려요' }); return; }
      var a = this.runs[0].m, b = this.runs[1].m, right = a > b ? '1' : b > a ? '2' : 'same';
      if (opt !== right) {
        this.ev({ type: 'hint', text: '같은 3초 동안 더 멀리 간 주행이 더 빨라. 두 거리(' + fmt1(a) + 'm, ' + fmt1(b) + 'm)를 다시 비교해 볼까?' });
        this.ev({ type: 'ask', q: askFaster(this) }); return;
      }
      this.log.push({ faster: opt });
      this.ev({ type: 'note', text: right === 'same' ? '두 주행이 같은 빠르기였어요!' : right + '번 주행이 같은 시간 동안 더 멀리 갔으니 더 빨랐어요!' });
      this.ev({ type: 'ask', q: speedOptions(this) });
      return;
    }
    if (qid === 'speed') {
      var q = speedOptions(this);
      if (opt !== q.right) {
        this.ev({ type: 'hint', text: '평균 속력은 이동 거리를 걸린 시간으로 나눠. ' + fmt1(this.runs[0].m) + ' ÷ 3을 다시 계산해 볼까?' });
        this.ev({ type: 'ask', q: q }); return;
      }
      this.log.push({ speed: q.right });
      this.nextStage('정답! 1번 주행의 평균 속력은 ' + q.right + ' m/s야.');
    }
  };
  M.g6 = G6;

  // 그리기에 쓰는 자리 정보
  M.layout = function () {
    if (this.free) return { night: this.night };
    var g = this.grade, L = { night: this.night };
    if (g === 1) L.pad = this.pad;
    if (g === 2) { L.pad = G2.pad; L.corner = G2.corner; }
    if (g === 3) { L.zone = this.zone; L.zoneLabel = this.stage === 0 ? '밀기 구역' : '당기기 구역'; L.hook = hookPt(this.cart); L.rope = this.rope; L.rear = rearPt(this.world.car); }
    if (g === 4) { L.pad = this.stage === 1 ? G4.pad : null; L.mag = magPt(this.cart); L.attached = this.attached; L.active = this.active; }
    if (g === 5) { L.g5 = G5; L.found = this.found; }
    if (g === 6) { L.lineX = G6.lineX; L.meter = this.meter; L.runs = this.runs; }
    return L;
  };

  var API = {
    GRADES: GRADES,
    create: function (g, grade) { return g === 'free' ? new Mission(grade || 1, true) : new Mission(g, false); },
    // 검증용
    _G: { G1: G1, G2: G2, G3: G3, G4: G4, G5: G5, G6: G6, HOOK: HOOK }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.MP_THRILL_MISSIONS = API;
})(this);
