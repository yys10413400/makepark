/*
 * 토토의 범퍼카 연구소 — 학년별 과학자 이야기 미션 (화면과 분리된 순수 로직)
 * ------------------------------------------------------------
 * 학년마다 단원과 이어지는 과학자 한 명: 경기장에 흩어진 별 이야기 카드 3장에 범퍼카를 대면
 * 토토가 이야기를 한 장씩 들려주고, 3장을 다 모으면 퀴즈 3문제. 다 맞히면 미션 완료.
 *  1학년 장영실(시계) · 2학년 라이트 형제(도구·비행기) · 3학년 뉴턴(힘) · 4학년 길버트(자석)
 *  5학년 이븐 알하이삼(빛) · 6학년 갈릴레이(물체의 운동)
 * create(grade) → 미션 객체 ms
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

  var GRADES = {
    1: { who: '장영실', emoji: '⏰', subject: '조선의 발명가 · 시간을 알려 주는 시계', night: false,
      cards: [
        { title: '손재주가 뛰어난 장영실', emoji: '🔧', text: '장영실은 조선 시대 사람이에요. 무엇이든 뚝딱 잘 만들어서, 세종대왕이 궁으로 불러 함께 일하게 했어요.' },
        { title: '스스로 소리 내는 물시계', emoji: '💧', text: '장영실은 물이 흐르는 양으로 시간을 재는 물시계 ‘자격루’를 만들었어요. 때가 되면 저절로 종과 북을 쳐서 시간을 알려 줬어요.' },
        { title: '그림자로 보는 해시계', emoji: '☀️', text: '해가 움직이면 그림자도 움직여요. 오목한 그릇 모양 해시계 ‘앙부일구’는 그림자가 가리키는 곳을 보고 시간을 알았어요.' }
      ],
      quiz: [
        { q: '장영실을 궁으로 불러 함께 일한 임금님은 누구일까요?', opts: ['세종대왕', '광개토대왕', '이순신 장군'], hint: 1 },
        { q: '때가 되면 저절로 종을 쳐서 시간을 알려 준 시계는?', opts: ['물시계 자격루', '모래시계', '손목시계'], hint: 2 },
        { q: '해시계 앙부일구는 무엇을 보고 시간을 알았을까요?', opts: ['그림자', '달빛', '바람'], hint: 3 }
      ] },
    2: { who: '라이트 형제', emoji: '✈️', subject: '도구의 모양과 기능 · 처음 하늘을 난 비행기', night: false,
      cards: [
        { title: '자전거 가게 형제', emoji: '🚲', text: '미국의 형 윌버와 동생 오빌은 자전거 가게를 했어요. 바퀴와 체인 같은 도구를 고치며 만드는 솜씨를 키웠어요.' },
        { title: '새의 날개를 따라 해요', emoji: '🐦', text: '형제는 새가 날개 끝을 살짝 비틀어 방향을 바꾸는 모습을 보았어요. 그래서 비행기 날개 모양을 바꿔 방향을 잡는 방법을 생각해 냈어요.' },
        { title: '12초의 첫 비행', emoji: '🛩️', text: '1903년, 형제가 만든 비행기 ‘플라이어호’가 사람을 태우고 엔진 힘으로 하늘을 날았어요. 첫 비행은 12초였어요!' }
      ],
      quiz: [
        { q: '라이트 형제는 어떤 가게를 했을까요?', opts: ['자전거 가게', '빵 가게', '꽃 가게'], hint: 1 },
        { q: '날개 모양을 바꾸는 생각은 무엇을 보고 떠올렸을까요?', opts: ['새', '물고기', '거북이'], hint: 2 },
        { q: '플라이어호의 첫 비행은 몇 초였을까요?', opts: ['12초', '1시간', '하루'], hint: 3 }
      ] },
    3: { who: '아이작 뉴턴', emoji: '🍎', subject: '힘과 우리 생활 · 밀고 당기는 힘', night: false,
      cards: [
        { title: '만들기를 좋아한 아이', emoji: '🛠️', text: '뉴턴은 약 380년 전 영국에서 태어났어요. 어릴 때 작은 풍차와 해시계를 만들며 놀기를 좋아했어요.' },
        { title: '떨어지는 사과', emoji: '🍎', text: '뉴턴은 사과가 땅으로 떨어지는 것을 보고 궁금해했다고 전해져요. 지구가 물체를 끌어당기는 힘, 바로 ‘중력’을 연구했어요.' },
        { title: '밀면 밀리고 당기면 따라와요', emoji: '🛒', text: '물체는 힘을 받아야 움직임이 바뀌어요. 카트를 밀면 미는 쪽으로, 당기면 당기는 쪽으로 움직여요. 뉴턴은 이런 규칙을 정리했어요.' }
      ],
      quiz: [
        { q: '뉴턴이 어릴 때 만들며 놀았던 것은?', opts: ['풍차와 해시계', '로봇', '컴퓨터'], hint: 1 },
        { q: '지구가 사과를 땅으로 끌어당기는 힘의 이름은?', opts: ['중력', '자석의 힘', '바람의 힘'], hint: 2 },
        { q: '멈춰 있는 카트를 오른쪽으로 밀면 카트는 어떻게 될까요?', opts: ['오른쪽으로 움직여요', '왼쪽으로 움직여요', '그대로 있어요'], hint: 3 }
      ] },
    4: { who: '윌리엄 길버트', emoji: '🧲', subject: '자석의 이용 · 지구는 커다란 자석', night: false,
      cards: [
        { title: '자석을 연구한 의사', emoji: '🩺', text: '길버트는 약 420년 전 영국의 의사이자 과학자예요. 자석으로 오랫동안 실험하고, 알아낸 것을 책으로 남겼어요.' },
        { title: '같은 극, 다른 극', emoji: '🧲', text: '자석에는 N극과 S극이 있어요. 같은 극끼리는 서로 밀어내고, 다른 극끼리는 서로 끌어당겨요.' },
        { title: '지구는 커다란 자석', emoji: '🧭', text: '길버트는 동그란 자석 공으로 실험해서 지구가 커다란 자석 같다고 생각했어요. 그래서 나침반 바늘이 늘 북쪽을 가리켜요.' }
      ],
      quiz: [
        { q: '길버트가 오랫동안 실험한 것은 무엇일까요?', opts: ['자석', '물감', '화산'], hint: 1 },
        { q: 'N극과 S극을 가까이 가져가면 어떻게 될까요?', opts: ['서로 끌어당겨요', '서로 밀어내요', '아무 일도 없어요'], hint: 2 },
        { q: '나침반 바늘이 늘 가리키는 쪽은?', opts: ['북쪽', '동쪽', '아래쪽'], hint: 3 }
      ] },
    5: { who: '이븐 알하이삼', emoji: '💡', subject: '빛의 성질 · 빛은 곧게 나아가요', night: true,
      cards: [
        { title: '빛을 연구한 과학자', emoji: '📖', text: '이븐 알하이삼은 약 1000년 전, 지금의 이라크 지역에서 태어난 과학자예요. 빛에 대한 두꺼운 책 ‘광학의 서’를 썼어요.' },
        { title: '빛이 눈에 들어와야 보여요', emoji: '👀', text: '옛날에는 눈에서 빛이 나간다고 생각한 사람도 있었어요. 알하이삼은 물체에서 온 빛이 눈에 들어와서 물체가 보인다고 밝혔어요.' },
        { title: '곧게 가다 거울에서 꺾여요', emoji: '🪞', text: '빛은 곧게 나아가요. 거울에 닿으면 반사되어 방향이 바뀌어요. 알하이삼은 어두운 방에서 실험하며 빛을 연구했어요.' }
      ],
      quiz: [
        { q: '이븐 알하이삼이 쓴 책은 무엇에 대한 책일까요?', opts: ['빛', '공룡', '요리'], hint: 1 },
        { q: '우리가 물체를 볼 수 있는 까닭은?', opts: ['물체에서 온 빛이 눈에 들어와서', '눈에서 빛이 나가서', '귀로 소리를 들어서'], hint: 2 },
        { q: '거울에 닿은 빛은 어떻게 될까요?', opts: ['반사되어 방향이 바뀌어요', '거울 속으로 사라져요', '그 자리에 멈춰요'], hint: 3 }
      ] },
    6: { who: '갈릴레오 갈릴레이', emoji: '⚖️', subject: '물체의 운동 · 빠르기 비교하기', night: false,
      cards: [
        { title: '재 보고 확인한 과학자', emoji: '📏', text: '갈릴레이는 약 400년 전 이탈리아의 과학자예요. 생각만 하지 않고 직접 실험하고 재 보며 확인했어요.' },
        { title: '비탈에 공 굴리기', emoji: '⚽', text: '갈릴레이는 비스듬한 빗면에 공을 굴리고, 걸린 시간과 굴러간 거리를 재서 물체가 어떻게 움직이는지 연구했어요.' },
        { title: '빠르기 비교하기', emoji: '🏁', text: '같은 시간 동안 더 먼 거리를 간 쪽이 더 빨라요. 속력은 ‘이동 거리 ÷ 걸린 시간’으로 구해요. 3초에 6m를 가면 속력은 2m/s예요.' }
      ],
      quiz: [
        { q: '갈릴레이가 공을 굴려 실험한 곳은?', opts: ['비스듬한 빗면', '바닷속', '구름 위'], hint: 2 },
        { q: '같은 3초 동안 6m 간 차와 9m 간 차 중 더 빠른 차는?', opts: ['9m 간 차', '6m 간 차', '둘 다 같아요'], hint: 3 },
        { q: '속력을 구하는 방법은?', opts: ['이동 거리 ÷ 걸린 시간', '이동 거리 + 걸린 시간', '걸린 시간 × 2'], hint: 3 }
      ] }
  };
  Object.keys(GRADES).forEach(function (g) {
    var d = GRADES[g];
    d.title = d.who + ' 이야기';
    d.goal = '별 이야기 카드 3장을 모으고 퀴즈를 풀어요';
    d.howto = {
      goal: '경기장에 흩어진 별 이야기 카드 3장에 범퍼카를 대면 토토가 ' + d.who + ' 이야기를 들려줘요. 3장을 다 모으면 퀴즈 3문제!',
      move: '방향키(또는 화면 방향 패드)를 누르면 달리고, 놓으면 조금 굴러가다 멈춰요.',
      ctrl: ['반짝이는 별 카드에 차를 대요', '오른쪽 위 ‘모은 카드’를 누르면 이야기를 다시 볼 수 있어요']
    };
  });

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

  function Mission(grade, free, seed) {
    this.grade = grade; this.free = !!free; this.def = GRADES[grade] || GRADES[1];
    this.night = this.def.night; this.lights = this.night;
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
    GRADES: GRADES, SPOTS: SPOTS, START: START, GRAB: GRAB,
    create: function (g, grade, seed) { return g === 'free' ? new Mission(grade || 1, true) : new Mission(g, false, seed); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.MP_THRILL_MISSIONS = API;
})(this);
