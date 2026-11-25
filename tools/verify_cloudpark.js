/*
 * 구름동산 규칙 자동 검증: node tools/verify_cloudpark.js
 * 아이템 15종 배치 · 벤치 4방향 · 돌담 자동 연결(T자 막기) · 산책로 연속 배치 · 겹침 · 이동 · 저장값 고치기
 */
'use strict';
global.window = global;
require('../js/cloudpark/items.js');
require('../js/data/cloudpark-mask.js');
require('../js/cloudpark/logic.js');
const D = window.MP_CLOUD_ITEMS, L = window.MP_CLOUD, M = window.MP_CLOUD_MASK;
let fail = 0, n = 0;
function ok(c, msg) { n++; if (!c) { fail++; console.log('✗ ' + msg); } }
function put(p, t, x, y, d) {
  const s = L.snap(t, x, y), def = D.ITEMS[t], cand = { t, x: s.x, y: s.y, d: d || def.dirOrder[0] };
  const r = L.canPlace(p, cand, M);
  if (r.ok) p.items[L.newId()] = cand;
  return r;
}

// 1. 15종, 모두 무료·무제한, 필수 정보
ok(D.ORDER.length === 15, '아이템 15종');
D.ORDER.forEach(t => {
  const it = D.ITEMS[t];
  ok(it.name && it.cat && it.dirs && it.source === 'free' && it.limit === null, t + ' 기본 정보');
  ok(D.CATS.some(c => c.id === it.cat), t + ' 카테고리');
  it.dirOrder.forEach(d => { const s = D.sprite(it, d); ok(s.w > 0 && s.h > 0 && D.IMG[s.img], t + '/' + d + ' 그림 크기'); });
  ok(it.rotatable === (it.dirOrder.length > 1), t + ' 회전 가능 여부');
});
ok(D.ITEMS.bench.dirOrder.join() === 'front,right,back,left', '벤치 4방향 순서');
ok(D.ITEMS.lantern.dirOrder.length === 2 && D.ITEMS.lantern.dirs.left.mirror, '초롱 좌우(반전)');
ok(!D.ITEMS['tree-pine'].rotatable && !D.ITEMS.hanok.rotatable && !D.ITEMS.pavilion.rotatable && !D.ITEMS.rock.rotatable, '나무·한옥·정자·돌 회전 없음');
ok(D.ITEMS['path-wood'].dirOrder.join() === 'h,v', '나무길 가로/세로');

// 2. 15종 모두 잔디에 놓기
const p = L.emptyPark('시험');
let x = 160, y = 300;
D.ORDER.forEach(t => { const r = put(p, t, x, y); ok(r.ok, t + ' 놓기: ' + (r.why || '')); x += 220; if (x > 1250) { x = 160; y += 220; } });
// 3. 개울·숲·입구에는 못 놓음
ok(!put(L.emptyPark(), 'tree-pine', 30, 30).ok, '외곽 숲에 못 놓음');
ok(!put(L.emptyPark(), 'rock', 705, 960).ok, '입구에 못 놓음');
ok(!put(L.emptyPark(), 'path-brick', 1430, 500).ok, '개울에 길 못 놓음');
ok(!put(L.emptyPark(), 'shrub', 705, 800).ok, '입구 앞 빈터 비워 둠');
// 4. 겹침: 같은 자리 나무 두 그루 X, 나무 잎 아래(줄기 위쪽)에는 다른 것 가능
const q = L.emptyPark();
ok(put(q, 'tree-round', 600, 500).ok, '나무1');
ok(!put(q, 'tree-round', 600, 500).ok, '같은 자리 못 놓음');
ok(put(q, 'flower-pink', 600, 470).ok, '잎 아래(줄기 위쪽)에는 꽃 놓기 가능 — 잎은 충돌 영역이 아님');
// 5. 산책로 연속, 같은 칸 중복 없음, 길 위에 벤치
const r = L.emptyPark();
for (let i = 0; i < 10; i++) ok(put(r, 'path-brick', 300 + i * 32, 600).ok, '벽돌길 ' + i);
ok(!put(r, 'path-brick', 300, 600).ok, '같은 칸 길 중복 없음');
ok(put(r, 'bench', 400, 610).ok, '길 위에 벤치');
ok(L.blockers(r).length === 1, '길은 막지 않음, 벤치만 막음');
// 6. 돌담 자동 연결
const w = L.emptyPark();
function wall(i, j) { const a = { x: i * 64 + 32, y: (j + 1) * 48 }; const c = { t: 'wall', x: a.x, y: a.y, d: 'base' }; const res = L.canPlace(w, c, M); if (res.ok) w.items['w' + i + '_' + j] = c; return res; }
ok(wall(5, 5).ok, '돌담 하나');
ok(L.wallImg(L.index(w).walls, 5 * 64 + 32, 6 * 48) === 'wall', '혼자 = 기본');
wall(6, 5); wall(7, 5);
let ix = L.index(w);
ok(L.wallImg(ix.walls, 5 * 64 + 32, 6 * 48) === 'wall-end-left', '왼쪽 끝');
ok(L.wallImg(ix.walls, 6 * 64 + 32, 6 * 48) === 'wall-h', '가로 직선');
ok(L.wallImg(ix.walls, 7 * 64 + 32, 6 * 48) === 'wall-end-right', '오른쪽 끝');
wall(7, 6); wall(7, 7);
ix = L.index(w);
ok(L.wallImg(ix.walls, 7 * 64 + 32, 6 * 48) === 'wall-corner-tr', '오른쪽 위 모서리');
ok(L.wallImg(ix.walls, 7 * 64 + 32, 7 * 48) === 'wall-v', '세로 직선');
ok(L.wallImg(ix.walls, 7 * 64 + 32, 8 * 48) === 'wall-end-bottom', '아래 끝');
wall(8, 7); ix = L.index(w);
ok(L.wallImg(ix.walls, 7 * 64 + 32, 8 * 48) === 'wall-corner-bl', '왼쪽 아래 모서리');
ok(!wall(8, 6).ok, 'T자(세 갈래) 막음');   // (7,6) 이 N,S,E 가 됨
delete w.items.w7_6; ix = L.index(w);
ok(L.wallImg(ix.walls, 7 * 64 + 32, 6 * 48) === 'wall-end-right' && L.wallImg(ix.walls, 7 * 64 + 32, 8 * 48) === 'wall-end-left', '회수 후 이웃 다시 계산');
ok(L.badWalls(w).length === 0, '불러온 돌담 T자 없음');
// 7. 이동(자기 자신은 무시)
const mv = L.emptyPark(); put(mv, 'hanok', 500, 500); const hid = Object.keys(mv.items)[0];
ok(L.canPlace(mv, { t: 'hanok', x: 508, y: 500, d: 'base' }, M, hid).ok, '조금 옮기기');
ok(!L.canPlace(mv, { t: 'hanok', x: 508, y: 500, d: 'base' }, M).ok, '다른 아이템이면 겹침');
// 8. 벤치 방향별 충돌 영역
ok(L.rectsOf({ t: 'bench', x: 0, y: 100, d: 'front' })[0][2] - L.rectsOf({ t: 'bench', x: 0, y: 100, d: 'front' })[0][0] === 60, '벤치 정면 폭');
ok(L.rectsOf({ t: 'bench', x: 0, y: 100, d: 'left' })[0][3] - L.rectsOf({ t: 'bench', x: 0, y: 100, d: 'left' })[0][1] === 26, '벤치 옆 깊이');
// 9. 저장값 고치기: 모르는 아이템·지도 밖은 빼고, 예전 배열 모양도 읽음
const nz = L.normalize({ name: '  우리 공원  ', items: [{ id: 'a1', t: 'rock', x: 400, y: 400 }, { t: 'ufo', x: 1, y: 1 }, { t: 'rock', x: 99999, y: 3 }] });
ok(nz.park.name === '우리 공원' && Object.keys(nz.park.items).length === 1 && nz.dropped === 2, '예전 배열 저장값 읽기');
ok(L.normalize(null, '기본').park.name === '기본', '빈 저장값');
ok(L.normalize({ items: { a: { t: 'bench', x: 300, y: 300, d: 'weird' } } }).park.items.a.d === 'front', '모르는 방향은 기본 방향');
// 10. 고르기: 앞쪽 아이템 우선
const pk = L.emptyPark(); put(pk, 'tree-round', 600, 500); put(pk, 'rock', 600, 560);
ok(pk.items[L.pick(pk, 600, 540)].t === 'rock', '앞쪽 아이템을 먼저 고름');
console.log((fail ? '실패 ' + fail : '모두 통과') + ' (' + n + '개 확인)');
process.exit(fail ? 1 : 0);
