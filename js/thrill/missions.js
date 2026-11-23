/*
 * 토토의 범퍼카 연구소 — 학년별 과학자 이야기 미션 (화면과 분리된 순수 로직)
 * ------------------------------------------------------------
 * 학년마다 단원과 이어지는 인물 여러 명(js/thrill/people.js) 중 한 명: 경기장에 흩어진 별 이야기 카드 3장에
 * 범퍼카를 대면 토토가 이야기를 한 장씩 들려주고, 3장을 다 모으면 퀴즈 3문제. 다 맞히면 미션 완료.
 * pick(학년, 만난 인물 번호들, 바로 전 인물) → 이번 판 인물 번호(아직 안 만난 인물부터)
 * create(grade, null, seed, who) → 미션 객체 ms (who = 인물 번호)
 *   ms.world            : 물리 세계(js/thrill/physics.js) — 범퍼카
 *   ms.cards            : 이야기 카드 자리와 모았는지 { x, y, got, i }
 *   ms.step(ix, iy, dt) : 한 프레임 진행 → 사건 목록
 *        { type:'story', card, n }  카드를 모음 → 이야기 카드 보여 주기
 *        { type:'ask', q }          퀴즈(q.id, q.text, q.options[{id,label}])
 *        { type:'hint', text }      틀렸을 때 토토 한 문장(무엇이 일어났는지 + 다음에 해 볼 행동)
 *        { type:'note', text }      짧은 알림
 *        { type:'complete' }        미션 완료
 *        { type:'crash', n }        벽 충돌(화면 효과)
 *   ms.storyDone()      : 이야기 카드를 닫은 뒤 → 3장을 다 모았으면 첫 퀴즈
 *   ms.answer(qid, optId) → 사건 목록 (틀리면 힌트 후 같은 문제를 다시)
 *   ms.retry()          : 차만 처음 자리로(모은 카드·푼 문제는 그대로)
 * create('free', grade) : 미션 없는 자유 주행(5학년 고르면 밤 경기장, 헤드라이트 켬)
 */
(function (root) {
  'use strict';
  var P = root.MP_THRILL_PHYS || (typeof require !== 'undefined' ? require('./physics.js') : null);
  var len = P.len;

  // 카드 세 자리(경기장 그림 좌표). 학년마다 조금씩 다르게
  var SPOTS = [
    [[560, 330], [1250, 330], [1120, 700]],
    [[1260, 320], [520, 700], [900, 420]],
    [[620, 300], [1350, 560], [760, 720]],
    [[1180, 300], [460, 380], [1240, 720]],
    [[480, 300], [1300, 340], [880, 700]],
    [[700, 300], [1380, 700], [560, 700]]
  ];
  var START = { x: 300, y: 600, ang: 0 };
  var GRAB = 80;   // 차 가운데에서 카드 가운데까지 이만큼 가까우면 모음

  // 학년별 인물(이야기 카드·퀴즈)은 js/thrill/people.js
  var GRADES = root.MP_THRILL_PEOPLE || (typeof require !== 'undefined' ? require('./people.js') : null);
  Object.keys(GRADES).forEach(function (g) {
    var G = GRADES[g];
    G.people.forEach(function (d) {
      d.title = d.who + ' 이야기';
      d.subject = G.unit + ' · ' + d.topic;
      d.night = G.night;
      d.howto = {
        goal: '경기장에 흩어진 별 이야기 카드 3장에 범퍼카를 대면 토토가 ' + d.who + ' 이야기를 들려줘요. 3장을 다 모으면 퀴즈 3문제!',
        move: '방향키(또는 화면 방향 패드)를 누르면 달리고, 놓으면 조금 굴러가다 멈춰요.',
        ctrl: ['반짝이는 별 카드에 차를 대요', '오른쪽 위 ‘모은 카드’를 누르면 이야기를 다시 볼 수 있어요']
      };
    });
  });
  function person(g, i) { var P = (GRADES[g] || GRADES[1]).people; return P[((i | 0) % P.length + P.length) % P.length]; }
  // 이번 판 인물 고르기: 아직 안 만난 인물 중에서(다 만났으면 바로 전 판과 다른 인물), rnd 는 0~1
  function pick(g, met, last, rnd) {
    var n = (GRADES[g] || GRADES[1]).people.length, all = [], i;
    for (i = 0; i < n; i++) all.push(i);
    met = met || [];
    var pool = all.filter(function (k) { return met.indexOf(k) < 0; });
    if (!pool.length) pool = all.filter(function (k) { return k !== last || n === 1; });
    return pool[Math.floor((rnd == null ? Math.random() : rnd) * pool.length) % pool.length];
  }

  // 받침에 따라 조사 고르기: josa('세종대왕', '은', '는') → '은'. 숫자는 읽는 소리로(1·3·6·7·8·0 받침 있음)
  function josa(w, a, b) {
    var ch = String(w).trim().slice(-1), code = ch.charCodeAt(0) - 0xAC00;
    var has = code >= 0 && code <= 11171 ? code % 28 !== 0 : '013678'.indexOf(ch) >= 0;
    return has ? a : b;
  }
  // 보기 순서 섞기(정답은 원래 0번). 같은 판에서는 늘 같은 순서
  function shuffle(a, seed) {
    var r = seed;
    for (var i = a.length - 1; i > 0; i--) { r = (r * 9301 + 49297) % 233280; var j = Math.floor(r / 233280 * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function Mission(grade, free, seed, who) {
    this.grade = grade; this.free = !!free; this.who = who | 0; this.def = person(grade, this.who);
    this.night = !!(GRADES[grade] || GRADES[1]).night; this.lights = this.night;
    this.done = false; this.t = 0; this.pending = []; this.qi = 0; this.quizOn = false;
    this.seed = seed == null ? Math.floor(Math.random() * 1000) : seed;
    var sp = SPOTS[(grade - 1) % SPOTS.length];
    this.cards = this.free ? [] : this.def.cards.map(function (c, i) { return { x: sp[i][0], y: sp[i][1], got: false, i: i }; });
    this.world = { car: P.makeCar(START.x, START.y, START.ang), bodies: [], boxes: [], plate: null, t: 0 };
  }
  var M = Mission.prototype;
  M.ev = function (e) { this.pending.push(e); };
  M.flush = function () { var o = this.pending; this.pending = []; return o; };
  M.got = function () { return this.cards.filter(function (c) { return c.got; }).length; };
  M.goal = function () {
    if (this.free) return '자유 주행! 마음껏 달려 봐요';
    if (this.got() < 3) return '별 이야기 카드 모으기 ' + this.got() + ' / 3';
    return this.done ? '미션 완료!' : '퀴즈 ' + Math.min(3, this.qi + 1) + ' / 3';
  };
  M.stageIntro = function () { return '반짝이는 별 카드 3장에 차를 대 봐! 카드마다 ' + this.def.who + ' 이야기가 하나씩 들어 있어.'; };
  M.retry = function () {
    if (this.done) return;
    var car = this.world.car;
    car.x = START.x; car.y = START.y; car.vx = car.vy = 0; car.ang = car.want = START.ang;
  };
  M.step = function (ix, iy, dt) {
    this.t += dt; this.world.t = this.t;
    var ev = P.stepWorld(this.world, ix, iy, dt);
    if (ev.wallHit > 90) this.ev({ type: 'crash', n: ev.lastN, power: ev.wallHit });
    if (!this.free && !this.done) {
      var car = this.world.car, me = this;
      this.cards.forEach(function (c) {
        if (c.got || len(car.x - c.x, car.y - c.y) > GRAB) return;
        c.got = true;
        me.ev({ type: 'story', card: me.def.cards[c.i], n: me.got() });
      });
    }
    return this.flush();
  };
  M.storyDone = function () {
    if (!this.free && !this.done && this.got() === 3 && !this.quizOn) { this.quizOn = true; this.ev({ type: 'ask', q: this.question() }); }
    return this.flush();
  };
  M.question = function () {
    var z = this.def.quiz[this.qi], ids = z.opts.map(function (_, i) { return i; });
    shuffle(ids, this.seed + this.qi * 7 + 3);
    return { id: 'q' + this.qi, text: '퀴즈 ' + (this.qi + 1) + ' / 3 · ' + z.q, options: ids.map(function (i) { return { id: String(i), label: z.opts[i] }; }) };
  };
  M.answer = function (qid, opt) {
    if (this.done || qid !== 'q' + this.qi) return this.flush();
    var z = this.def.quiz[this.qi];
    if (opt === '0') {
      this.qi++;
      if (this.qi >= this.def.quiz.length) { this.done = true; this.ev({ type: 'note', text: '퀴즈 3문제를 모두 맞혔어요!' }); this.ev({ type: 'complete' }); }
      else { this.ev({ type: 'note', text: '정답! ' + z.opts[0] }); this.ev({ type: 'ask', q: this.question() }); }
    } else {
      var c = this.def.cards[z.hint - 1];
      var w = z.opts[+opt];
      this.ev({ type: 'hint', text: '‘' + w + '’' + josa(w, '은', '는') + ' 아니야. ' + z.hint + '번 카드 ‘' + c.title + '’' + josa(c.title, '을', '를') + ' 떠올려 보고 다시 골라 볼까?' });
      this.ev({ type: 'ask', q: this.question() });
    }
    return this.flush();
  };
  M.action = function (id) { if (id === 'lights') this.lights = !this.lights; return this.flush(); };
  M.buttons = function () { return this.night ? [{ id: 'lights', label: this.lights ? '💡 헤드라이트 끄기' : '💡 헤드라이트 켜기', on: this.lights }] : []; };
  M.rays = function () { return this.night && this.lights ? P.headlight(this.world.car, { blockers: [], mirrors: [], targets: [] }, 0.42, 25) : []; };

  var API = {
    GRADES: GRADES, SPOTS: SPOTS, START: START, GRAB: GRAB, person: person, pick: pick,
    // create(학년, null, seed, 인물 번호) / create('free', 학년)
    create: function (g, grade, seed, who) { return g === 'free' ? new Mission(grade || 1, true) : new Mission(g, false, seed, who); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.MP_THRILL_MISSIONS = API;
})(this);
