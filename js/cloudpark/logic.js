/*
 * 구름동산 규칙 (화면과 분리된 순수 로직 — node tools/verify_cloudpark.js 로 자동 검증)
 * ------------------------------------------------------------
 * 공원 데이터(저장 모양)
 *   { v: 2, name: '공원 이름', bg: 'hanok-sage', updated: 시각(ms),
 *     items: { <인스턴스 ID>: { t: 아이템 ID, x, y: 발 기준점 월드 좌표, d: 방향 } } }
 *   - 좌표는 화면 CSS 픽셀이 아니라 지도 그림(1448×1086) 기준 → 화면 크기가 바뀌어도 그대로
 *   - 돌담 방향(d)은 저장하지 않고 이웃을 보고 매번 다시 계산
 *   - inv: { 아이템 ID: 개수 } — 수량 제한이 있는 아이템(나중의 보상·상점 아이템)만 보관함 개수로 관리
 *
 * 배치 규칙
 *   - 아이템 바닥 점유 영역(footprint)이 '놓을 수 있는 잔디'(MP_CLOUD_MASK.place) 안에 있어야 함
 *   - 산책로는 32px 칸에 하나씩, 산책로끼리는 겹치지 않음(다른 아이템은 산책로 위에 놓을 수 있음)
 *   - 산책로가 아닌 아이템끼리는 바닥 점유 영역이 겹치면 안 됨
 *   - 돌담은 64×48 칸. 세 갈래(T자)·네 갈래(십자) 연결은 그림이 없어 만들 수 없음
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
  // 모르는 아이템·지도 밖 좌표는 빼고(지우지 않고 dropped 로 알려 줌), 예전 버전은 지금 모양으로 바꿈
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
    if (!(raw.v >= 2)) src = migrateWalls(src);
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
  // v1 돌담(가로 64 × 세로 48 칸) → v2(48 × 48 칸). 이어진 돌담 덩어리마다 모양(이웃 연결)을 그대로 두고
  // 덩어리 가운데가 원래 자리에 가장 가깝게 옮김(칸 크기만 바뀌어 틈이 생기지 않게)
  function migrateWalls(src) {
    var out = {}, cells = {}, ids = Object.keys(src);
    ids.forEach(function (id) {
      var it = src[id];
      if (it && item(it.t) && item(it.t).kind === 'wall' && typeof it.x === 'number' && typeof it.y === 'number') {
        cells[Math.floor(it.x / 64) + ',' + (Math.round(it.y / 48) - 1)] = id;
      } else out[id] = it;
    });
    var seen = {};
    Object.keys(cells).forEach(function (k) {
      if (seen[k]) return;
      var comp = [], stack = [k]; seen[k] = true;
      while (stack.length) {
        var c = stack.pop(), ij = c.split(',').map(Number); comp.push(ij);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var n = (ij[0] + d[0]) + ',' + (ij[1] + d[1]);
          if (cells[n] && !seen[n]) { seen[n] = true; stack.push(n); }
        });
      }
      var mx = comp.reduce(function (a, ij) { return a + ij[0] * 64 + 32; }, 0) / comp.length;
      var mi = comp.reduce(function (a, ij) { return a + ij[0]; }, 0) / comp.length;
      var shift = Math.round((mx - D.WALL_CELL.w / 2) / D.WALL_CELL.w - mi);
      comp.forEach(function (ij) {
        var id = cells[ij[0] + ',' + ij[1]], it = src[id], ni = ij[0] + shift;
        out[id] = { t: it.t, x: ni * D.WALL_CELL.w + D.WALL_CELL.w / 2, y: (ij[1] + 1) * D.WALL_CELL.h, d: it.d };
      });
    });
    return out;
  }
  function clone(p) { return JSON.parse(JSON.stringify(p)); }
  function count(p) { return Object.keys(p.items).length; }

  // ---------- 칸 맞추기 ----------
  function wallCell(x, y) { return { i: Math.floor(x / D.WALL_CELL.w), j: Math.floor(y / D.WALL_CELL.h) }; }
  function wallAnchor(i, j) { return { x: i * D.WALL_CELL.w + D.WALL_CELL.w / 2, y: (j + 1) * D.WALL_CELL.h }; }
  // 놓을 자리로 맞춤: 산책로는 32px 칸 가운데, 돌담은 64×48 칸 아래 가운데, 나머지는 8px 단위
  function snap(t, x, y) {
    var it = item(t);
    if (!it) return { x: x, y: y };
    if (it.kind === 'path') {
      var c = D.PATH_CELL;
      return { x: Math.floor(x / c) * c + c / 2, y: Math.floor(y / c) * c + c / 2 };
    }
    if (it.kind === 'wall') {
      // 돌담은 칸 아래쪽 줄이 바닥 — 누른 곳보다 조금 아래 칸 기준으로(그림이 손가락 위에 보이게)
      var w = wallCell(x, y + D.WALL_CELL.h / 2);
      return wallAnchor(w.i, w.j);
    }
    return { x: Math.round(x / D.SNAP) * D.SNAP, y: Math.round(y / D.SNAP) * D.SNAP };
  }
  function pathKey(x, y) { return Math.floor(x / D.PATH_CELL) + ',' + Math.floor(y / D.PATH_CELL); }
  function wallKey(x, y) { var c = wallCell(x, y - 1); return c.i + ',' + c.j; }

  // ---------- 찾기용 색인(공원이 바뀔 때마다 다시 만듦) ----------
  function index(p) {
    var paths = {}, walls = {};
    Object.keys(p.items).forEach(function (id) {
      var it = p.items[id], def = item(it.t);
      if (def.kind === 'path') paths[pathKey(it.x, it.y)] = id;
      else if (def.kind === 'wall') walls[wallKey(it.x, it.y)] = id;
    });
    return { paths: paths, walls: walls };
  }
  // 돌담 이웃 글자(N·S·E·W 를 정해진 순서로): 예) 'ES'
  function wallLinks(walls, i, j) {
    var s = '';
    if (walls[i + ',' + (j - 1)]) s += 'N';
    if (walls[i + ',' + (j + 1)]) s += 'S';
    if (walls[(i + 1) + ',' + j]) s += 'E';
    if (walls[(i - 1) + ',' + j]) s += 'W';
    return s;
  }
  function shapeKey(links) {
    // WALL_SHAPES 키 순서: E/W 앞, N/S 뒤가 섞여 있어 정렬해서 찾음
    var sorted = links.split('').sort().join('');
    var keys = Object.keys(D.WALL_SHAPES);
    for (var k = 0; k < keys.length; k++) if (keys[k].split('').sort().join('') === sorted) return keys[k];
    return null;   // 세 갈래 이상
  }
  function wallImg(walls, x, y) {
    var k = wallShape(walls, x, y);
    return D.WALL_SHAPES[k == null ? '' : k];
  }
  // 돌담 모양 글자: '' · 'E' · 'W' · 'EW' · 'N' · 'S' · 'NS' · 'ES' · 'SW' · 'EN' · 'NW' (세 갈래 이상이면 null)
  function wallShape(walls, x, y) {
    var c = wallCell(x, y - 1);
    return shapeKey(wallLinks(walls, c.i, c.j));
  }
  // 고르기·가림 판정용 돌담 그림 네모(월드): 가로 돌담 높이 + 남쪽으로 이어지면 아래 칸까지
  function wallBox(walls, x, y) {
    var k = wallShape(walls, x, y) || '', hw = D.WALL_CELL.w / 2;
    var top = y - (k.indexOf('N') >= 0 || k.indexOf('S') >= 0 ? 52 : 42);
    var bottom = k.indexOf('S') >= 0 ? y + D.WALL_CELL.h - D.WALL_ART.ridge : y;
    return [x - hw - 4, top, x + hw + 4, bottom];
  }

  // ---------- 바닥 점유 영역(월드 사각형 [x0, y0, x1, y1]) ----------
  function rectsOf(it, idx) {
    var def = item(it.t);
    if (!def) return [];
    if (def.kind === 'path') return [];
    if (def.kind === 'wall') {
      var c = wallCell(it.x, it.y - 1), L = idx ? wallLinks(idx.walls, c.i, c.j) : '', cx = it.x, by = it.y;
      var hw = D.WALL_CELL.w / 2, out = [];
      if (L.indexOf('N') < 0 && L.indexOf('S') < 0) return [[cx - hw, by - 14, cx + hw, by]];
      out.push([cx - 11, by - 14, cx + 11, by]);
      if (L.indexOf('N') >= 0) out.push([cx - 11, by - D.WALL_CELL.h, cx + 11, by]);
      if (L.indexOf('E') >= 0) out.push([cx, by - 14, cx + hw, by]);
      if (L.indexOf('W') >= 0) out.push([cx - hw, by - 14, cx, by]);
      return out;
    }
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
    var rects;
    if (def.kind === 'wall') {
      var c = wallCell(cand.x, cand.y - 1), key = c.i + ',' + c.j;
      var walls = Object.assign({}, idx.walls);
      if (ignore) Object.keys(walls).forEach(function (k) { if (walls[k] === ignore) delete walls[k]; });
      if (walls[key]) return { ok: false, why: '이미 돌담이 있어요' };
      walls[key] = '_new';
      // 새 돌담과 이웃 돌담 모두 두 갈래 이하여야 함
      var cells = [[c.i, c.j], [c.i, c.j - 1], [c.i, c.j + 1], [c.i + 1, c.j], [c.i - 1, c.j]];
      for (var n = 0; n < cells.length; n++) {
        var k2 = cells[n][0] + ',' + cells[n][1];
        if (walls[k2] && shapeKey(wallLinks(walls, cells[n][0], cells[n][1])) == null) return { ok: false, why: '돌담은 세 갈래로 이을 수 없어요' };
      }
      rects = rectsOf(cand, { walls: walls });
    } else rects = rectsOf(cand, idx);
    for (var r = 0; r < rects.length; r++) if (!rectOnMask(mask, place, rects[r])) return { ok: false, why: '개울·숲·입구 쪽에는 놓을 수 없어요' };
    if (!rects.length && !maskOk(mask, place, cand.x, cand.y)) return { ok: false, why: '잔디 위에만 놓을 수 있어요' };
    var ids = Object.keys(p.items);
    for (var q = 0; q < ids.length; q++) {
      if (ids[q] === ignore) continue;
      var o = p.items[ids[q]], od = item(o.t);
      if (od.kind === 'path') continue;
      if (def.kind === 'wall' && od.kind === 'wall') continue;   // 돌담끼리는 칸으로만 판단
      var or = rectsOf(o, idx);
      for (var a = 0; a < rects.length; a++) for (var b = 0; b < or.length; b++) {
        if (hit(rects[a], or[b])) return { ok: false, why: od.name + '와(과) 겹쳐요', with: ids[q] };
      }
    }
    return { ok: true };
  }

  // ---------- 걷기: 막는 사각형 목록 ----------
  function blockers(p) {
    var idx = index(p), out = [];
    Object.keys(p.items).forEach(function (id) {
      rectsOf(p.items[id], idx).forEach(function (r) { out.push(r); });
    });
    return out;
  }
  // 돌담이 지울 때 T자가 되는 일은 없음(이웃이 줄기만 함). 그래도 불러온 데이터에 T자가 있으면 알려 줌
  function badWalls(p) {
    var idx = index(p), bad = [];
    Object.keys(idx.walls).forEach(function (k) {
      var ij = k.split(',').map(Number);
      if (shapeKey(wallLinks(idx.walls, ij[0], ij[1])) == null) bad.push(idx.walls[k]);
    });
    return bad;
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
      if (def.kind === 'wall') {
        var b = wallBox(idx.walls, it.x, it.y);
        if (x >= b[0] + 4 && x <= b[2] - 4 && y >= b[1] && y <= Math.max(b[3], it.y + 4) && it.y > bestY) { best = id; bestY = it.y; }
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
    snap: snap, index: index, wallImg: wallImg, wallShape: wallShape, wallBox: wallBox, wallLinks: wallLinks, wallCell: wallCell, pathKey: pathKey,
    rectsOf: rectsOf, canPlace: canPlace, blockers: blockers, badWalls: badWalls, pick: pick, maskOk: maskOk, hit: hit
  };
})(typeof window !== 'undefined' ? window : globalThis);
