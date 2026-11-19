// 코스터 미션 자동 검증: node tools/verify_coaster.js
// - 모든 미션의 정답 예시가 모든 세계(신호 색·손님 위치 조합)에서 도착하고 별 3개를 받는지
// - 정답이 블록 제한·공개 블록 안에 있는지
// - 첫 미션: 0개/2개/3개/5개 명령 결과, 틀린 명령 고치기의 처음 목록이 실패하는지
// - 조건 미션: 조건 없이 만든 답이 어떤 세계에서는 실패하거나 별이 줄어드는지(조건이 꼭 필요한지)
// - 속도 미션: 속도를 바꾸지 않으면 오르막·커브에서 멈추는지
// - 갈림길 미션: 짧은 길은 도착하지만 별 3개는 못 받는지
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ['js/coaster/missions.js', 'js/coaster/logic.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
const M = ctx.window.MP_COASTER_MISSIONS, LG = ctx.window.MP_COASTER_LOGIC;
let fails = 0;
function ok(cond, msg) { console.log((cond ? '  통과 ' : '  실패 ') + msg); if (!cond) fails++; }
function types(list, out = new Set()) { (list || []).forEach(b => { out.add(b.type); types(b.body, out); types(b.then, out); types(b.else, out); }); return out; }
const all = M.common.concat(...Object.values(M.courses).map(c => c.missions));
const ids = new Set();
for (const m of all) {
  console.log(`[${m.id}] ${m.title}`);
  ok(!ids.has(m.id), '미션 id가 겹치지 않음'); ids.add(m.id);
  ok(typeof m.par === 'number', `별 2개 기준 블록 수(par) ${m.par}`);
  const ans = LG.withIds(m.answer);
  const r = LG.solvesAll(m, ans);
  ok(r.ok, `정답 예시가 모든 세계에서 도착 (${r.combos}가지)` + (r.ok ? '' : ' ' + JSON.stringify(r.fails)));
  ok(r.minStars === 3, `정답 예시는 늘 별 3개 (가장 적을 때 ${r.minStars}개)`);
  const used = [...types(m.answer)];
  ok(used.every(t => m.blocks.includes(t)), `정답이 공개 블록만 사용 (${used.join(',')})`);
  ok(LG.countBlocks(m.answer) <= m.par, `정답 블록 ${LG.countBlocks(m.answer)}개 ≤ par ${m.par}`);
  if (m.limit) ok(LG.countBlocks(m.answer) <= m.limit && m.par <= m.limit, `블록 제한 ${m.limit} 안`);
  ok(LG.distance(m, m.from[0], m.from[1]) > 0, `출발에서 도착까지 레일로 이어짐 (${LG.distance(m, m.from[0], m.from[1])}칸)`);
  (m.stars || []).concat(m.climbs || [], m.guests || [], m.guestCells || []).forEach(c => {
    ok(m.rails.some(t => t[0] === c[0] && t[1] === c[1]), `장치 칸 (${c})이 레일 위에 있음`);
  });
  if (m.start) {
    const s = LG.runAll(m, LG.withIds(m.start), {});
    ok(s.result !== 'success', `처음 목록(틀린 명령)은 실패: ${s.result}/${s.reason}`);
  }
  if (m.limit && m.blocks.includes('repeat')) {
    // 반복 없이 앞으로·돌기만 나열한 답은 par를 넘는지
    const flat = []; (function f(list) { list.forEach(b => b.type === 'repeat' ? [...Array(b.n)].forEach(() => f(b.body)) : flat.push(b)); })(m.answer);
    if (!flat.some(b => b.type === 'if')) ok(LG.countBlocks(flat) > m.par, `반복 없이 나열하면 ${LG.countBlocks(flat)}개 > par ${m.par} (반복이 필요함)`);
  }
  if (m.signals || m.guestRandom) {
    // 정답에서 '만약'을 한쪽 가지로만 바꾼 답은 어떤 세계에서는 실패하거나 별이 줄어야 조건이 꼭 필요한 미션
    const strip = (list, side) => list.reduce((a, b) => b.type === 'if' ? a.concat(strip(b[side] || [], side))
      : a.concat([b.type === 'repeat' ? { type: 'repeat', n: b.n, body: strip(b.body, side) } : { type: b.type }]), []);
    for (const side of ['then', 'else']) {
      const rr = LG.solvesAll(m, LG.withIds(strip(m.answer, side)));
      ok(!rr.ok || rr.minStars < 3, `조건 없이 늘 '${side === 'then' ? '예' : '아니오'}' 쪽만 하면 일부 세계에서 실패/별 감소 (실패 ${rr.fails.length}/${rr.combos}, 최소 별 ${rr.minStars})`);
    }
  }
  if (m.speedRules) {
    const noSpeed = LG.withIds(m.answer.filter(b => b.type !== 'fast' && b.type !== 'slow'));
    const rs = LG.runAll(m, noSpeed, {});
    ok(rs.result === 'blocked' && (rs.reason === 'slow' || rs.reason === 'fast'), `속도를 안 바꾸면 멈춤: ${rs.result}/${rs.reason}`);
  }
  if (m.shortcut) {
    const sc = LG.withIds(m.shortcut), rr = LG.runAll(m, sc, {}), s = LG.score(m, sc, rr.result, rr.state);
    ok(rr.result === 'success' && s.stars === 2, `짧은 길은 도착하지만 별 ${s.stars}개 (별 3개는 다른 길)`);
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
ok(LG.score(t, p5, r5.result, r5.state).stars === 1, '명령 5개로 도착하면 블록이 많아 별 1개');
console.log('[회전 규칙]');
const c2 = M.courses.low.missions[1];
const rr = LG.runAll(c2, LG.withIds([{ type: 'fwd' }, { type: 'fwd' }, { type: 'fwd' }]), {});
ok(rr.result === 'blocked' && rr.reason === 'norail' && rr.state.c === 2, '곡선 칸에서 돌지 않고 앞으로 → 움직이기 전에 멈춤');
const rt = LG.runAll(c2, LG.withIds([{ type: 'left' }]), {});
ok(rt.state.c === 0 && rt.state.dir === 'N', '돌기는 제자리에서 방향만 바뀜');
console.log('[손님 규칙]');
const h1 = M.courses.high.missions[0];
const np = LG.runAll(h1, LG.withIds([{ type: 'fwd' }, { type: 'pick' }]), {});
ok(np.result === 'blocked' && np.reason === 'noguest', '손님 없는 칸에서 태우기 → 멈춤');
const skip = LG.withIds([...Array(5)].map(() => ({ type: 'fwd' }))), sk = LG.runAll(h1, skip, {});
ok(sk.result === 'success' && LG.score(h1, skip, sk.result, sk.state).bonus === false, '손님을 안 태우고 도착하면 보너스 별 없음');
console.log(fails ? `\n실패 ${fails}개` : '\n모두 통과');
process.exit(fails ? 1 : 0);
