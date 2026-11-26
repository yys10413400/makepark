/*
 * 구름동산 규칙 (화면과 분리된 순수 로직 — node tools/verify_cloudpark.js 로 자동 검증)
 * ------------------------------------------------------------
 * 공원 데이터(저장 모양)
 *   { v: 2, name: '공원 이름', bg: 'hanok-sage', updated: 시각(ms),
 *     items: { <인스턴스 ID>: { t: 아이템 ID, x, y: 발 기준점 월드 좌표, d: 방향 } } }
 *   - 좌표는 화면 CSS 픽셀이 아니라 지도 그림(1448×1086) 기준 → 화면 크기가 바뀌어도 그대로
 *   - inv: { 아이템 ID: 개수 } — 수량 제한이 있는 아이템(나중의 보상·상점 아이템)만 보관함 개수로 관리
 *
 * 배치 규칙
 *   - 아이템 바닥 점유 영역(footprint)이 '놓을 수 있는 잔디'(MP_CLOUD_MASK.place) 안에 있어야 함
 *   - 산책로는 32px 칸에 하나씩, 산책로끼리는 겹치지 않음(다른 아이템은 산책로 위에 놓을 수 있음)
 *   - 산책로가 아닌 아이템끼리는 바닥 점유 영역이 겹치면 안 됨
 *   - (기와 돌담은 2026-11-25 사용자 요청으로 뺌 — 예전 저장값의 돌담은 불러올 때 빠짐)
 */
(function (root) {
  'use strict';
  var D = root.MP_CLOUD_ITEMS;

  function item(t) { return D.ITEMS[t] || null; }
  function newId() {
    var s = 'i', abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    for (var i = 0; i < 9; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }
  function emptyPark(name) { return { v: D.VERSION, name: name || '', bg: 'hanok-sage', updated: 0, items: {} }; }

  // ---------- 저장값 읽기·고치기(마이그레이션) ----------
  // 모르는 아이템(뺀 돌담 포함)·지도 밖 좌표는 빼고(dropped 로 알려 줌), 예전 버전은 지금 모양으로 바꿈
  function normalize(raw, fallbackName) {
    var p = emptyPark(fallbackName), dropped = 0;
    if (!raw || typeof raw !== 'object') return { park: p, dropped: 0 };
    p.name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, D.NAME_MAX) : p.name;
    p.updated = typeof raw.updated === 'number' ? raw.updated : 0;
    // v0(예전 배열 모양 [{t,x,y,d,id}]) → v1(객체)
    var src = raw.items;
    if (Array.isArray(src)) {
      var o = {};
      src.forEach(function (it) { if (it) o[it.id || newId()] = it; });
      src = o;
    }
    src = src && typeof src === 'object' ? src : {};
    Object.keys(src).forEach(function (id) {
      var it = src[id], def = it && item(it.t);
      if (!def || typeof it.x !== 'number' || typeof it.y !== 'number' || !isFinite(it.x) || !isFinite(it.y) ||
          it.x < 0 || it.y < 0 || it.x > D.WORLD.w || it.y > D.WORLD.h || !/^[A-Za-z0-9_-]{1,24}$/.test(id)) { dropped++; return; }
      var d = def.dirs[it.d] ? it.d : def.dirOrder[0];
      p.items[id] = { t: it.t, x: Math.round(it.x), y: Math.round(it.y), d: d };
    });
    if (raw.inv && typeof raw.inv === 'object') {
      p.inv = {};
      Object.keys(raw.inv).forEach(function (k) { if (item(k) && +raw.inv[k] > 0) p.inv[k] = Math.floor(+raw.inv[k]); });
    }
    return { park: p, dropped: dropped };
  }
  function clone(p) { return JSON.parse(JSON.stringify(p)); }
  function count(p) { return Object.keys(p.items).length; }

  // 놓을 자리로 맞춤: 산책로는 32px 칸 가운데, 나머지는 8px 단위
  function snap(t, x, y) {
    var it = item(t);
    if (!it) return { x: x, y: y };
    if (it.kind === 'path') {
      var c = D.PATH_CELL;
      return { x: Math.floor(x / c) * c + c / 2, y: Math.floor(y / c) * c + c / 2 };
    }
    return { x: Math.round(x / D.SNAP) * D.SNAP, y: Math.round(y / D.SNAP) * D.SNAP };
  }
  // ---------- 칸 맞추기 ----------
  function pathKey(x, y) { return Math.floor(x / D.PATH_CELL) + ',' + Math.floor(y / D.PATH_CELL); }

  // ---------- 찾기용 색인(공원이 바뀔 때마다 다시 만듦) ----------
  function index(p) {
    var paths = {};
    Object.keys(p.items).forEach(function (id) {
      var it = p.items[id], def = item(it.t);
      if (def.kind === 'path') paths[pathKey(it.x, it.y)] = id;
    });
    return { paths: paths };
  }

  // ---------- 바닥 점유 영역(월드 사각형 [x0, y0, x1, y1]) ----------
  function rectsOf(it) {
    var def = item(it.t);
    if (!def) return [];
    if (def.kind === 'path') return [];
    var f = D.footOf(def, it.d);
    if (!f) return [];
    return [[it.x + f.dx - f.w / 2, it.y - f.d, it.x + f.dx + f.w / 2, it.y]];
  }
  function hit(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }

  // ---------- 지도 칸(MP_CLOUD_MASK) ----------
  function maskOk(mask, rows, x, y) {
    var c = mask.cell, cx = Math.floor(x / c), cy = Math.floor(y / c);
    if (cy < 0 || cy >= mask.rows || cx < 0 || cx >= mask.cols) return false;
    return rows[cy].charCodeAt(cx) === 49;
  }
  // 사각형 전체가 칸 안인지(4px 간격으로 확인)
  function rectOnMask(mask, rows, r) {
    for (var y = r[1]; y <= r[3]; y += 4) for (var x = r[0]; x <= r[2]; x += 4) {
      if (!maskOk(mask, rows, Math.min(x, r[2]), Math.min(y, r[3]))) return false;
    }
    return maskOk(mask, rows, r[2], r[3]);
  }

  // ---------- 놓을 수 있는지 ----------
  // cand: { t, x, y, d } (이미 snap 된 좌표). ignore: 옮기는 중인 자기 자신 ID
  // → { ok: true } | { ok: false, why: '…' }
  function canPlace(p, cand, mask, ignore, idx) {
    var def = item(cand.t);
    if (!def) return { ok: false, why: '모르는 아이템이에요' };
    idx = idx || index(p);
    if (!ignore && count(p) >= D.MAX_ITEMS) return { ok: false, why: '공원에 아이템이 너무 많아요(최대 ' + D.MAX_ITEMS + '개)' };
    var place = mask.place;
    if (def.kind === 'path') {
      var h = D.PATH_CELL / 2;
      if (!rectOnMask(mask, place, [cand.x - h, cand.y - h, cand.x + h - 1, cand.y + h - 1])) return { ok: false, why: '잔디 위에만 길을 놓을 수 있어요' };
      var at = idx.paths[pathKey(cand.x, cand.y)];
      if (at && at !== ignore) return { ok: false, why: '이미 길이 있어요', same: p.items[at].t === cand.t };
      return { ok: true };
    }
    var rects = rectsOf(cand);
    for (var r = 0; r < rects.length; r++) if (!rectOnMask(mask, place, rects[r])) return { ok: false, why: '개울·숲·입구 쪽에는 놓을 수 없어요' };
    if (!rects.length && !maskOk(mask, place, cand.x, cand.y)) return { ok: false, why: '잔디 위에만 놓을 수 있어요' };
    var ids = Object.keys(p.items);
    for (var q = 0; q < ids.length; q++) {
      if (ids[q] === ignore) continue;
      var o = p.items[ids[q]], od = item(o.t);
      if (od.kind === 'path') continue;
      var or = rectsOf(o);
      for (var a = 0; a < rects.length; a++) for (var b = 0; b < or.length; b++) {
        if (hit(rects[a], or[b])) return { ok: false, why: od.name + '와(과) 겹쳐요', with: ids[q] };
      }
    }
    return { ok: true };
  }

  // ---------- 걷기: 막는 사각형 목록 ----------
  function blockers(p) {
    var out = [];
    Object.keys(p.items).forEach(function (id) {
      rectsOf(p.items[id]).forEach(function (r) { out.push(r); });
    });
    return out;
  }

  // ---------- 고르기: 화면에서 누른 곳에 있는 아이템(앞쪽 = y 가 큰 것 먼저) ----------
  function pick(p, x, y, idx) {
    idx = idx || index(p);
    var best = null, bestY = -1, floorHit = null;
    Object.keys(p.items).forEach(function (id) {
      var it = p.items[id], def = item(it.t);
      if (def.kind === 'path') {
        if (Math.abs(x - it.x) <= D.PATH_CELL / 2 && Math.abs(y - it.y) <= D.PATH_CELL / 2) floorHit = id;
        return;
      }
      var s = D.sprite(def, it.d);
      var x0 = it.x - s.ax, y0 = it.y - s.ay;
      if (x >= x0 + s.w * 0.12 && x <= x0 + s.w * 0.88 && y >= y0 + s.h * 0.08 && y <= it.y + 4 && it.y > bestY) { best = id; bestY = it.y; }
    });
    return best || floorHit;
  }

  root.MP_CLOUD = {
    emptyPark: emptyPark, normalize: normalize, clone: clone, count: count, newId: newId,
    snap: snap, index: index, pathKey: pathKey,
    rectsOf: rectsOf, canPlace: canPlace, blockers: blockers, pick: pick, maskOk: maskOk, hit: hit
  };
})(typeof window !== 'undefined' ? window : globalThis);
