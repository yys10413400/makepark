/*
 * 별소리 음악당 — 바꾸기 쉬운 값을 모두 여기에
 * ------------------------------------------------------------
 * CONFIG   : 리듬 판정 기본값(속도·판정 범위·세트/미션 성공 기준·보상)
 * GRADES   : 학년군별 난이도(속도·동작 길이·안내량)
 * MISSIONS : 학년군별 댄스 미션(동작 묶음)
 * ANIM     : 유니콘 동작 프레임(assets/melody/unicorn/animation.json 과 같은 값)
 * PLAY     : 자유 연주 요소(연주자·악기·소품)와 소리
 * 동작 이름: left(왼쪽 스텝) · right(오른쪽 스텝) · jump(점프) · freeze(멈춤 포즈 — Space를 눌러요) · rest(쉼 — 아무것도 누르지 않는 박)
 */
(function (root) {
  'use strict';
  var CONFIG = {
    bpm: 72,                 // 연습 기본 속도(학년군 bpm 이 없으면 이 값)
    windowMs: 250,           // 성공 판정 범위: 목표 박자 전후 ±250ms (박자 간격의 45%를 넘지 않게 자동으로 줄임)
    perfectRatio: 0.4,       // 판정 범위의 이 비율 안이면 '좋아요', 밖이면 '조금 빨랐어요/늦었어요'(둘 다 성공)
    setPassRatio: 0.75,      // 세트 성공: 박자의 75% 이상 성공(4개 중 3개, 8개 중 6개)
    strayRatio: 0.5,         // 박자가 아닌 때 누르거나 한 박자에 두 번 이상 누른 횟수가 박자 수의 50%를 넘으면 세트 실패(마구 누르기 막기)
    sets: 3,                 // 한 미션의 세트 수
    missionPassSets: 2,      // 미션 성공: 3세트 중 2세트 이상
    countIn: 4,              // 따라 하기 전 카운트다운 박 수
    introBeats: 4,           // 미션 시작 때 음악만 나오는 박 수(시범 준비)
    gapBeats: 2,             // 세트 사이 쉬는 박 수(세트 결과 보여 주기)
    inputOffsetMs: 0         // 기기마다 소리가 늦게 들리면 여기서 보정(+면 입력을 더 늦게 본 것으로)
    // 티켓은 모든 건물 같은 규칙(js/game.js awardTicket): 학년마다 처음 1장, 모든 건물 합쳐 하루 3장
  };

  var GRADES = {
    low:    { label: '1~2학년', bpm: 72, showNext: true,  hide: [0, 0, 0],        guide: '느린 박자 · 다음 동작을 미리 보여 줘요' },
    middle: { label: '3~4학년', bpm: 78, showNext: true,  hide: [0, 0, 0],        guide: '여덟 박자 · 같은 동작 반복과 쉼 · 다음 동작 미리 보기' },
    high:   { label: '5~6학년', bpm: 84, showNext: false, hide: [0, 0.25, 0.5],   guide: '기억 도전 · 2세트부터 카드가 조금씩 숨어요' }
  };

  var L = 'left', R = 'right', J = 'jump', F = 'freeze', _ = 'rest';
  var MISSIONS = {
    low: [
      { id: 'low-1', title: '첫 무대', goal: '왼쪽 · 오른쪽 · 점프 · 멈춤을 박자에 맞춰요', pattern: [L, R, J, F] },
      { id: 'low-2', title: '거꾸로 스텝', goal: '오른쪽부터 시작해요', pattern: [R, L, F, J] },
      { id: 'low-3', title: '깡충 깡충', goal: '스텝 다음에 점프!', pattern: [L, J, R, J] }
    ],
    middle: [
      { id: 'mid-1', title: '두 번씩 스텝', goal: '같은 동작을 두 번, 쉼표에선 가만히', pattern: [L, L, R, R, J, _, F, _] },
      { id: 'mid-2', title: '왔다 갔다', goal: '왼오왼오 다음 점프 두 번', pattern: [L, R, L, R, J, J, F, _] },
      { id: 'mid-3', title: '쉼표 댄스', goal: '한 번 움직이고 한 번 쉬어요', pattern: [R, _, L, _, J, _, F, _] }
    ],
    high: [
      { id: 'high-1', title: '기억 무대', goal: '앞 네 박을 한 번 더 해요', pattern: [L, R, J, F, L, R, J, F] },
      { id: 'high-2', title: '메아리 스텝', goal: '두 번 스텝, 한 번 점프', pattern: [L, L, J, _, R, R, J, _] },
      { id: 'high-3', title: '피날레', goal: '거울처럼: 왼오 다음 오왼, 마지막은 멈춤', pattern: [L, R, J, _, R, L, J, F] }
    ]
  };

  var ACTIONS = {
    left:   { label: '왼쪽', key: '←', color: 'blue' },
    right:  { label: '오른쪽', key: '→', color: 'pink' },
    jump:   { label: '점프', key: '↑', color: 'purple' },
    freeze: { label: '멈춤', key: 'Space', color: 'yellow' },
    rest:   { label: '쉼', key: '', color: 'rest' }
  };

  // assets/melody/unicorn/animation.json 과 같은 값(파일로 열어도 되게 여기에 둠)
  // 좌우 스텝은 animation.json 에서 반복(loop)이지만, 게임에서는 '입력 1회 = 동작 1회'로 한 번만 재생 후 대기 자세
  var ANIM = {
    base: 'assets/melody/unicorn/',
    canvas: [320, 320], anchor: [160, 298],
    idle: 'idle',
    actions: {
      left:   { frames: ['step_left_00', 'step_left_01', 'step_left_02', 'step_left_03'], ms: [120, 120, 140, 120], end: 'idle' },
      right:  { frames: ['step_right_00', 'step_right_01', 'step_right_02', 'step_right_03'], ms: [120, 120, 140, 120], end: 'idle' },
      jump:   { frames: ['jump_00', 'jump_01', 'jump_02', 'jump_03'], ms: [100, 120, 160, 120], end: 'idle' },
      freeze: { frames: ['freeze_00', 'freeze_01', 'freeze_02', 'freeze_03'], ms: [100, 120, 140, 140], end: 'hold' }
    }
  };

  /* 자유 연주: 요소마다 소리 하나. line = rhythm(리듬 줄) | melody(멜로디 줄)
     멜로디는 도·레·미·솔·라·높은 도(5음 음계)라서 어떻게 놓아도 잘 어울려요 */
  var PLAY = {
    steps: 8,
    maxOnStage: 8,
    // 유니콘 밴드(assets/melody/band/<band>/ — tools/build_melody_assets.py 가 받은 PNG 를 WebP 로 바꿈)
    // 준비(idle=frame_00) → 예비 → 연주(frame_02, 가장 센 자세) → 복귀 → 준비. 80·80·140·100ms
    // 소리가 나는 순간에 frame_02 가 보이게 leadMs(=80+80) 먼저 시작. 같은 캐릭터가 다시 연주하면 처음부터
    band: {
      base: 'assets/melody/band/', canvas: 320,
      frames: ['idle', 'frame_01', 'frame_02', 'frame_03'], ms: [80, 80, 140, 100], leadMs: 160,
      // 캐릭터마다 발끝 높이(320 캔버스 안 y) — 무대 위 발 위치를 맞추는 데만 씀(자르기·확대 없음)
      foot: { bass_drum: 313, small_drum: 309, clap: 300, bells: 290, do_keyboard: 308, re_guitar: 319, mi_trumpet: 307, sol_sax: 307, la_violin: 299, high_do: 310 }
    },
    tempos: [{ id: 'slow', label: '느리게', bpm: 84 }, { id: 'mid', label: '보통', bpm: 104 }, { id: 'fast', label: '빠르게', bpm: 126 }],
    // 함께 연주(반주): 8칸 한 바퀴마다 화음이 바뀌어 같은 가락도 다르게 들려요
    backings: [{ id: 'off', label: '내 소리만', short: '반주 끔' }, { id: 'soft', label: '포근한 반주', short: '포근' }, { id: 'pop', label: '신나는 반주', short: '신나게' }],
    defaultBacking: 'soft',
    // 예시 음악: 골라 듣고 바꿔 보기(무대 위 요소는 쓰인 것만, 최대 maxOnStage)
    examples: [
      { id: 'picnic', name: '소풍 가는 길', tempo: 'mid', backing: 'pop', swing: false,
        melody: ['piano', 'horn', 'sax', null, 'violin', 'sax', 'horn', 'piano'],
        rhythm: ['drum', null, 'clap', 'bell', 'drum', null, 'clap', 'bell'] },
      { id: 'cloud', name: '구름 산책', tempo: 'slow', backing: 'soft', swing: false,
        melody: ['violin', null, 'sax', null, 'horn', null, 'piano', null],
        rhythm: ['drum', null, null, null, 'drum', null, null, null] },
      { id: 'dance', name: '톡톡 댄스', tempo: 'fast', backing: 'pop', swing: true,
        melody: ['piano', 'horn', 'sax', 'unicorn', 'sax', 'horn', 'piano', 'horn'],
        rhythm: ['drum', 'snare', 'clap', 'snare', 'drum', 'snare', 'clap', 'clap'] }
    ],
    items: [
      { id: 'drum',   line: 'rhythm', name: '큰북',     icon: '🥁', sound: 'kick', band: 'bass_drum' },
      { id: 'snare',  line: 'rhythm', name: '작은북',   icon: '🪘', sound: 'snare', band: 'small_drum' },
      { id: 'clap',   line: 'rhythm', name: '박수 친구', icon: '👏', sound: 'clap', band: 'clap' },
      { id: 'bell',   line: 'rhythm', name: '방울',     icon: '🔔', sound: 'jingle', band: 'bells' },
      { id: 'piano',  line: 'melody', name: '피아노 도', icon: '🎹', sound: 'piano', note: 60, band: 'do_keyboard' },
      { id: 'guitar', line: 'melody', name: '기타 레',  icon: '🎸', sound: 'pluck', note: 62, band: 're_guitar' },
      { id: 'horn',   line: 'melody', name: '트럼펫 미', icon: '🎺', sound: 'horn',  note: 64, band: 'mi_trumpet' },
      { id: 'sax',    line: 'melody', name: '색소폰 솔', icon: '🎷', sound: 'reed',  note: 67, band: 'sol_sax' },
      { id: 'violin', line: 'melody', name: '바이올린 라', icon: '🎻', sound: 'bow',  note: 69, band: 'la_violin' },
      { id: 'unicorn', line: 'melody', name: '유니콘 높은 도', icon: '🦄', sound: 'chime', note: 72, band: 'high_do' }
    ]
  };

  var api = { CONFIG: CONFIG, GRADES: GRADES, MISSIONS: MISSIONS, ACTIONS: ACTIONS, ANIM: ANIM, PLAY: PLAY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MP_MELODY_DATA = api;
})(this);
