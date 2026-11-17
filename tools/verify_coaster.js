// 코스터 미션 자동 검증: node tools/verify_coaster.js
// - 모든 미션의 정답 예시가 (신호가 있으면 모든 신호 조합에서) 성공하는지
// - 정답이 블록 제한·공개 블록 안에 있는지
// - 첫 미션: 0개/2개/3개/4개 명령 결과, 틀린 명령 고치기의 처음 목록이 실패하는지
// - 조건 미션: 조건 없이 만든 답이 어떤 신호 조합에서는 실패하는지(조건이 꼭 필요한지)
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ['js/coaster/missions.js', 'js/coaster/logic.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
const M = ctx.window.MP_COASTER_MISSIONS, LG = ctx.window.MP_COASTER_LOGIC;
let fails = 0;
function ok(cond, msg) { console.log((cond ? '  통과 ' : '  실패 ') + msg); if (!cond) fails++; }
function types(list, out = new Set()) { (list || []).forEach(b => { out.add(b.type); types(b.body, out); types(b.then, out); types(b.else, out); }); return out; }
const all = M.common.concat(...Object.values(M.courses).map(c => c.missions));
for (const m of all) {
  console.log(`[${m.id}] ${m.title}`);
  const ans = LG.withIds(m.answer);
  const r = LG.solvesAll(m, ans);
  ok(r.ok, `정답 예시 성공 (신호 조합 ${r.combos}가지)` + (r.ok ? '' : ' ' + JSON.stringify(r.fails)));
  const used = [...types(m.answer)];
  ok(used.every(t => m.blocks.includes(t)), `정답이 공개 블록만 사용 (${used.join(',')})`);
  if (m.limit) ok(LG.countBlocks(m.answer) <= m.limit, `블록 ${LG.countBlocks(m.answer)}개 ≤ 제한 ${m.limit}`);
  ok(LG.distance(m, m.from[0], m.from[1]) > 0, `출발에서 도착까지 레일로 이어짐 (${LG.distance(m, m.from[0], m.from[1])}칸)`);
  if (m.start) {
    const s = LG.runAll(m, LG.withIds(m.start), {});
    ok(s.result !== 'success', `처음 목록(틀린 명령)은 실패: ${s.result}/${s.reason}`);
  }
  if (m.limit && m.blocks.includes('repeat')) {
    // 반복 없이 앞으로·돌기만 나열한 답은 제한을 넘는지
    const flat = []; (function f(list) { list.forEach(b => b.type === 'repeat' ? [...Array(b.n)].forEach(() => f(b.body)) : flat.push({ type: b.type })); })(m.answer);
    if (!types(m.answer).has('if')) ok(LG.countBlocks(flat) > m.limit, `반복 없이 나열하면 ${LG.countBlocks(flat)}개 > 제한 ${m.limit} (반복이 필요함)`);
  }
  if (m.signals) {
    const n = m.signals.length + (m.to[0] - m.from[0]);
    const onlyFwd = LG.withIds([...Array(m.to[0] - m.from[0])].map(() => ({ type: 'fwd' })));
    const r1 = LG.solvesAll(m, onlyFwd);
    ok(!r1.ok, `앞으로만 쓴 답은 일부 신호 조합에서 실패 (${r1.fails.length}/${r1.combos})`);
    const alwaysWait = LG.withIds([].concat(...[...Array(m.to[0] - m.from[0])].map((_, i) => m.signals.some(s => s[0] === m.from[0] + i + 1) ? [{ type: 'wait' }, { type: 'fwd' }] : [{ type: 'fwd' }])));
    const r2 = LG.solvesAll(m, alwaysWait);
    ok(!r2.ok, `늘 기다리는 답도 일부 신호 조합에서 실패 (${r2.fails.length}/${r2.combos})`);
  }
}
console.log('[첫 출발 세부]');
const t = M.common[0];
const fw = k => LG.withIds([...Array(k)].map(() => ({ type: 'fwd' })));
const r0 = LG.runAll(t, fw(0), {}); ok(r0.result === 'end', '명령 0개 → 끝(안내 필요): ' + r0.result);
const r2 = LG.runAll(t, fw(2), {}); ok(r2.result === 'end' && LG.distance(t, r2.state.c, r2.state.r) === 1, '명령 2개 → 한 칸 부족');
const r3 = LG.runAll(t, fw(3), {}); ok(r3.result === 'success', '명령 3개 → 도착');
const p5 = fw(5); const r5 = LG.runAll(t, p5, {});
ok(r5.result === 'success' && !r5.state.executed[p5[3].id] && !r5.state.executed[p5[4].id], '명령 5개 → 3번째에서 도착하고 4·5번째는 실행 안 함');
console.log('[회전 규칙]');
const c2 = M.courses.low.missions[1];
const rr = LG.runAll(c2, LG.withIds([{ type: 'fwd' }, { type: 'fwd' }, { type: 'fwd' }]), {});
ok(rr.result === 'blocked' && rr.reason === 'norail' && rr.state.c === 2, '곡선 칸에서 돌지 않고 앞으로 → 움직이기 전에 멈춤');
const rt = LG.runAll(c2, LG.withIds([{ type: 'left' }]), {});
ok(rt.state.c === 0 && rt.state.dir === 'N', '돌기는 제자리에서 방향만 바뀜');
console.log(fails ? `\n실패 ${fails}개` : '\n모두 통과');
process.exit(fails ? 1 : 0);
