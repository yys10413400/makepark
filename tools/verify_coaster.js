// 코스터역(블록으로 선로 만들기) 미션 자동 검증: node tools/verify_coaster.js
// - 학년마다 미션이 하나 이상, 대표 풀이가 모든 판에서 성공하고 블록 상자에 있는 블록만 쓰는지
// - 자주 하는 실수(블록 빠뜨림·반대로 돌기·조건 없이 직진)가 알맞은 이유로 실패하는지
// - 순환 판: 출발하자마자 성공하지 않고, 한 바퀴를 다 이어야 성공하는지
// - 끝나지 않는 반복이 안전하게 멈추는지, 5학년 조건문이 두 판 모두에서 같은 코드로 성공하는지
// - 성공 뒤 선로가 끊기지 않고 이어졌는지(이웃 칸끼리 서로 마주 보는 방향으로 연결)
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ['js/coaster/missions.js', 'js/coaster/logic.js', 'js/coaster/generate.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
const M = ctx.window.MP_COASTER_MISSIONS, LG = ctx.window.MP_COASTER_LOGIC;
let fails = 0;
function ok(cond, msg) { console.log((cond ? '  통과 ' : '  실패 ') + msg); if (!cond) fails++; }
const sig = b => b.type + (b.cond ? ':' + b.cond : '');
function sigs(list, out = new Set()) { (list || []).forEach(b => { out.add(sig(b)); sigs(b.body, out); sigs(b.else, out); }); return out; }
const F = { type: 'fwd', n: 1 }, R = { type: 'right' }, L = { type: 'left' };
function run(L0, prog) { return LG.runAll(L0, LG.withIds(prog)); }
function tracksConnected(st) {
  for (const k in st.track) {
    const [c, r] = k.split(',').map(Number);
    for (const d in st.track[k]) {
      const [dc, dr] = LG.DELTA[d], n = st.track[(c + dc) + ',' + (r + dr)];
      if (!n || !n[LG.OPP[d]]) return false;
    }
  }
  return true;
}

for (let g = 1; g <= 6; g++) ok(M.list.some(m => m.grade === g), `${g}학년 미션 있음`);
for (const m of M.list) {
  console.log(`[${m.id}] ${m.grade}학년 · ${m.title}`);
  const pal = new Set(m.palette.map(sig));
  ok([...sigs(m.answer)].every(s => pal.has(s)), `대표 풀이가 블록 상자 블록만 씀 (${[...sigs(m.answer)].join(', ')})`);
  m.layouts.forEach((Lx, i) => {
    const r = run(Lx, m.answer);
    ok(r.result === 'success', `판 ${i + 1}: 대표 풀이 성공` + (r.result === 'success' ? '' : ` (${r.reason})`));
    ok(tracksConnected(r.state), `판 ${i + 1}: 놓인 선로가 끊김 없이 맞물림`);
    ok(run(Lx, []).reason === 'empty', `판 ${i + 1}: 빈 코드는 '블록 없음'`);
    const k = (c) => LG.key(c[0], c[1]);
    if (Lx.goal) ok(!(Lx.tulip || []).concat(Lx.sunflower || []).some(c => k(c) === k(Lx.goal)), `판 ${i + 1}: 역 칸에 꽃 없음`);
  });
}

const [g1, g2, g3, g4, g5, g6] = M.list;
console.log('[실수와 실패 이유]');
let r = run(g1.layouts[0], [F, F]);
ok(r.reason === 'end', `1학년 앞으로 두 번만: 명령이 끝남 (${r.reason})`);
r = run(g1.layouts[0], [F, L, F]);
ok(r.result === 'fail', `1학년 왼쪽으로 돌면 실패 (${r.reason})`);
r = run(g1.layouts[0], [F, F, F, F]);
ok(r.reason === 'edge', `1학년 계속 앞으로: 잔디 끝에서 멈춤 (${r.reason})`);
r = run(g2.layouts[0], [F, F]);
ok(r.reason === 'flower' && r.last.flower === 'tulip', `2학년 직진: 앞은 튤립 꽃밭 (${r.reason})`);
ok(r.state.c === 2 && r.state.r === 1, '2학년 실패 때 거북이는 멈춘 칸에 그대로');
r = run(g3.layouts[0], [{ type: 'fwd', n: 3 }]);
ok(r.reason === 'notback', `3학년 한 변만: 역으로 못 돌아옴 (${r.reason})`);
r = run(g3.layouts[0], [{ type: 'repeat', n: 3, body: [{ type: 'fwd', n: 3 }, R] }]);
ok(r.reason === 'notback', `3학년 3번 반복: 아직 한 바퀴가 아님 (${r.reason})`);
r = run(g3.layouts[0], [{ type: 'repeat', n: 4, body: [{ type: 'fwd', n: 3 }, L] }]);
ok(r.result === 'fail', `3학년 왼쪽으로 돌면 목표 선로 밖 (${r.reason})`);
r = run(g3.layouts[0], [{ type: 'repeat', n: 4, body: [{ type: 'fwd', n: 1 }, R] }]);
ok(r.reason === 'flower', `3학년 1칸씩: 꽃밭으로 들어가려다 멈춤 (${r.reason})`);
// 출발 직후 성공하지 않는지: 첫 이벤트들에 success 없음, 마지막 이동이 역으로 돌아올 때 성공
{
  const run3 = LG.makeRun(g3.layouts[0], LG.withIds(g3.answer)); let moves = 0, okAt = -1, ev;
  while (!(ev = run3.gen.next()).done) { if (ev.value.type === 'move') moves++; if (ev.value.type === 'success') okAt = moves; }
  ok(okAt === 12, `3학년: 12칸을 다 돌아 역에 돌아왔을 때 성공 (성공 시점 ${okAt}칸)`);
}
r = run(g4.layouts[0], [{ type: 'repeat', n: 2, body: [{ type: 'fwd', n: 4 }, R, { type: 'fwd', n: 1 }, R] }]);
ok(r.result === 'fail', `4학년 짧은 변을 1칸으로: 실패 (${r.reason})`);
r = run(g5.layouts[0], [{ type: 'until', body: [F] }]);
ok(r.reason === 'flower', `5학년 조건 없이 직진: 튤립 앞에서 멈춤 (${r.reason})`);
r = run(g5.layouts[0], [{ type: 'until', body: [{ type: 'if', cond: 'tulip', body: [R, F] }] }]);
ok(r.reason === 'toolong', `5학년 전진을 조건 안에만: 끝나지 않는 반복을 안전하게 멈춤 (${r.reason})`);
r = run(g5.layouts[0], [{ type: 'until', body: [] }]);
ok(r.reason === 'toolong', `빈 반복: 안전하게 멈춤 (${r.reason})`);
{
  const run5 = LG.makeRun(g5.layouts[0], LG.withIds([{ type: 'until', body: [R] }])); let n = 0, ev, last;
  while (!(ev = run5.gen.next()).done) { n++; last = ev.value; }
  ok(last.reason === 'toolong' && n < 40, `돌기만 하는 반복: 몇 번 만에 바로 멈춤 (이벤트 ${n}개, ${last.reason})`);
}
r = run(g5.layouts[1], [F, R, F, F, R, F]);
ok(r.result === 'success', '5학년 두 번째 판은 꽃·역 자리가 다름(직접 쓴 순서 풀이로도 확인)');
ok(run(g5.layouts[0], [F, R, F, F, R, F]).result === 'fail', '5학년: 판 하나에 맞춘 순서 풀이는 다른 판에서 실패 → 조건이 필요함');
r = run(g6.layouts[0], [{ type: 'until', body: [{ type: 'if', cond: 'tulip', body: [R] }, F] }]);
ok(r.reason === 'flower' && r.last.flower === 'sunflower', `6학년 튤립만 보면: 해바라기 앞에서 멈춤 (${r.reason}/${r.last.flower})`);
{
  const run6 = LG.makeRun(g6.layouts[0], LG.withIds(g6.answer)); const seen = { tulip: 0, sunflower: 0 }; let ev, last;
  while (!(ev = run6.gen.next()).done) { if (ev.value.type === 'check' && ev.value.value) last = ev.value; if (ev.value.type === 'turn') seen[run6.state.dir === 'S' ? 'tulip' : 'sunflower']++; }
  ok(seen.tulip >= 1 && seen.sunflower >= 1, `6학년 대표 풀이는 튤립(오른쪽)·해바라기(왼쪽)를 모두 만남 (${JSON.stringify(seen)})`);
}
ok(LG.pieceOf({ E: true, S: true }) === 'se' && LG.pieceOf({ W: true, N: true }) === 'nw' && LG.pieceOf({ E: true, W: true }) === 'h', '레일 조각 이름: 이어진 두 방향');

console.log('[새 꽃밭(무작위 판)]');
const GEN = ctx.window.MP_COASTER_GEN;
for (let g = 1; g <= 6; g++) {
  let fallback = 0, bad = 0; const sigs = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const m = GEN.make(g, seed);
    if (!m.random) { fallback++; continue; }
    sigs.add(m.sig);
    if (!GEN.check(m) || m.layouts.some(L => L.cols > 8 || L.rows > 5)) bad++;
    const pal = new Set(m.palette.map(sig));
    if (![...sigs_(m.answer)].every(x => pal.has(x))) bad++;
  }
  ok(bad === 0 && fallback === 0 && sigs.size >= 150, `${g}학년: 200판 모두 풀이 성공·오답 실패·격자 8×5 안 (서로 다른 판 ${sigs.size}개, 대체 ${fallback})`);
}
function sigs_(list) { return sigs(list); }
{ const a = GEN.make(3, 7), b = GEN.make(3, 7, a.sig); ok(a.sig !== b.sig, '바로 전 판과 같은 판은 다시 나오지 않음'); }

console.log(fails ? `\n실패 ${fails}개` : '\n모두 통과');
process.exit(fails ? 1 : 0);
