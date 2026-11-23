/*
 * 짜릿 어드벤처 · 토토의 범퍼카 연구소 — 움직임과 판정 (화면과 분리된 순수 로직)
 * ------------------------------------------------------------
 * 좌표: 경기장 그림(1672×941) 픽셀. 위에서 살짝 내려다본 바닥을 평면처럼 다룸
 * - 범퍼카: 원(반지름 CAR.r). 방향키 8방향(대각선은 길이 1로 정규화) → 목표 속도 쪽으로 가속,
 *           키를 놓으면 일정하게 감속해 잠깐 굴러가다 멈춤. 차체 방향(ang)은 입력 방향으로 부드럽게 돌고,
 *           그림은 그 각도를 8방향으로 나눠 고름(그림 프레임과 이동·충돌 판정은 서로 독립)
 * - 벽: 둥근 네모(위 모서리는 원근 때문에 더 둥글게). 닿으면 살짝 튕김(반발 WALL_BOUNCE)
 * - 물체(카트·상자): 원. 차·밀판·벽과 부딪치면 겹치지 않게 밀어내고 접촉 방향으로 속도를 받음
 * - 막힌 곳(가림막·거울 받침·코너 벽): 축에 나란한 네모
 * - 빛: 광선을 쏘아 가림막에 막히고 거울에서 반사(최대 2번)
 * 확인: node tools/verify_thrill.js
 */
(function (root) {
  'use strict';
  var ARENA = { w: 1672, h: 941, x0: 104, x1: 1566, y0: 184, y1: 842, rt: 230, rb: 130 };
  var CAR = { r: 58, vmax: 400, accel: 1500, turnAccel: 2600, decel: 560, turn: 9.5 };
  var WALL_BOUNCE = 0.38;
  var PX_PER_M = 100;   // 거리 단위: 그림 100px = 1m (6학년 기록·화면 숫자·채점이 모두 이 값을 씀)

  function len(x, y) { return Math.sqrt(x * x + y * y); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function angDiff(a, b) { var d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  // 8방향 번호: 그림 시트 순서(0 ↓, 1 ↙, 2 ←, 3 ↖, 4 ↑, 5 ↗, 6 →, 7 ↘)
  var DIR_ANG = [90, 135, 180, 225, 270, 315, 0, 45].map(function (d) { return d * Math.PI / 180; });
  function dirIndex(ang) {
    var k = Math.round(((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (Math.PI / 4)) % 8;   // 0=→, 1=↘, 2=↓ ...
    return [6, 7, 0, 1, 2, 3, 4, 5][k];
  }

  // ---------- 벽(둥근 네모) 안쪽으로 원 넣기 ----------
  // 반지름 r 원의 중심이 있을 수 있는 영역 = 벽 네모를 r 만큼 줄인 둥근 네모. 밖이면 가장 가까운 안쪽 점과 바깥쪽 법선을 돌려줌
  function wallFix(x, y, r) {
    var A = ARENA, x0 = A.x0 + r, x1 = A.x1 - r, y0 = A.y0 + r, y1 = A.y1 - r;
    var top = y < (y0 + y1) / 2, rc = Math.max(4, (top ? A.rt : A.rb) - r);
    var cx = clamp(x, x0 + rc, x1 - rc), cy = clamp(y, y0 + rc, y1 - rc);
    var inCorner = (x < x0 + rc || x > x1 - rc) && (top ? y < y0 + rc : y > y1 - rc);
    if (inCorner) {
      var dx = x - cx, dy = y - cy, d = len(dx, dy);
      if (d <= rc) return null;
      return { x: cx + dx / d * rc, y: cy + dy / d * rc, nx: dx / d, ny: dy / d };
    }
    var nx = 0, ny = 0, px = x, py = y;
    if (x < x0) { px = x0; nx = -1; } else if (x > x1) { px = x1; nx = 1; }
    if (y < y0) { py = y0; ny = -1; } else if (y > y1) { py = y1; ny = 1; }
    if (!nx && !ny) return null;
    var n = len(nx, ny);
    return { x: px, y: py, nx: nx / n, ny: ny / n };
  }
  // 막힌 네모(box: [x0,y0,x1,y1]) 밖으로 원 밀어내기
  function boxFix(x, y, r, b) {
    var cx = clamp(x, b[0], b[2]), cy = clamp(y, b[1], b[3]), dx = x - cx, dy = y - cy, d = len(dx, dy);
    if (d >= r) return null;
    if (d > 0.001) return { x: cx + dx / d * r, y: cy + dy / d * r, nx: dx / d, ny: dy / d };
    // 중심이 네모 안: 가장 가까운 변으로
    var opts = [[x - b[0], -1, 0], [b[2] - x, 1, 0], [y - b[1], 0, -1], [b[3] - y, 0, 1]].sort(function (p, q) { return p[0] - q[0]; })[0];
    return { x: opts[1] ? (opts[1] < 0 ? b[0] - r : b[2] + r) : x, y: opts[2] ? (opts[2] < 0 ? b[1] - r : b[3] + r) : y, nx: opts[1], ny: opts[2] };
  }
  function bounce(o, f, e) {
    var vn = o.vx * f.nx + o.vy * f.ny;
    o.x = f.x; o.y = f.y;
    if (vn > 0) { o.vx -= (1 + e) * vn * f.nx; o.vy -= (1 + e) * vn * f.ny; }
    return vn;
  }

  // ---------- 범퍼카 ----------
  function makeCar(x, y, ang) {
    return { x: x, y: y, vx: 0, vy: 0, ang: ang || 0, want: ang || 0, r: CAR.r, mass: 2.2, input: false, hit: 0, hitT: -9, hitN: null };
  }
  // input: { x: -1..1, y: -1..1 } (방향키·터치 방향 패드). 대각선은 길이 1로 정규화
  function steerCar(car, ix, iy, dt) {
    var n = len(ix, iy);
    car.input = n > 0.01;
    if (car.input) {
      ix /= n; iy /= n;
      car.want = Math.atan2(iy, ix);
      // 목표 속도 쪽으로 가속(방향을 꺾을 때는 조금 더 세게)
      var tx = ix * CAR.vmax - car.vx, ty = iy * CAR.vmax - car.vy, d = len(tx, ty);
      var sp = len(car.vx, car.vy), turning = sp > 30 && (car.vx * ix + car.vy * iy) / sp < 0.7;
      var step = (turning ? CAR.turnAccel : CAR.accel) * dt;
      if (d <= step) { car.vx += tx; car.vy += ty; } else { car.vx += tx / d * step; car.vy += ty / d * step; }
    } else {
      var s = len(car.vx, car.vy), ns = Math.max(0, s - CAR.decel * dt);
      if (s > 0) { car.vx *= ns / s; car.vy *= ns / s; }
    }
    // 차체는 입력 방향으로 부드럽게 회전(밀판·자석이 순간 이동하지 않게)
    var da = angDiff(car.ang, car.want), mx = CAR.turn * dt;
    car.ang += Math.abs(da) <= mx ? da : Math.sign(da) * mx;
  }
  function front(car, extra) {
    var e = car.r + (extra || 0);
    return { x: car.x + Math.cos(car.ang) * e, y: car.y + Math.sin(car.ang) * e };
  }

  // ---------- 물체 ----------
  function makeBody(kind, x, y, r, o) {
    var b = { kind: kind, x: x, y: y, vx: 0, vy: 0, r: r, mass: 1, fric: 420, ang: Math.PI, moved: 0 };
    for (var k in (o || {})) b[k] = o[k];
    return b;
  }

  // 두 원 충돌: 겹치지 않게 질량 비율로 떼어 놓고, 접촉 방향 속도를 나눔(반발 e)
  function circlePair(a, b, e) {
    var dx = b.x - a.x, dy = b.y - a.y, d = len(dx, dy), min = a.r + b.r;
    if (d >= min) return null;
    var nx = d > 0.001 ? dx / d : 1, ny = d > 0.001 ? dy / d : 0, pen = min - d;
    var ia = a.fixed ? 0 : 1 / a.mass, ib = b.fixed ? 0 : 1 / b.mass, s = ia + ib;
    if (!s) return null;
    a.x -= nx * pen * ia / s; a.y -= ny * pen * ia / s;
    b.x += nx * pen * ib / s; b.y += ny * pen * ib / s;
    var rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv < 0) {
      var j = -(1 + e) * rv / s;
      a.vx -= j * ia * nx; a.vy -= j * ia * ny;
      b.vx += j * ib * nx; b.vy += j * ib * ny;
    }
    return { nx: nx, ny: ny, speed: -rv };
  }
  // 원 b 와 선분(p→q, 밀판·자석판)의 충돌: 선분은 차에 붙어 차 속도로 움직임. 미끄러지는 방향은 막지 않음
  function segPush(car, b, p, q) {
    var ex = q.x - p.x, ey = q.y - p.y, L2 = ex * ex + ey * ey;
    var t = clamp(((b.x - p.x) * ex + (b.y - p.y) * ey) / L2, 0, 1);
    var cx = p.x + ex * t, cy = p.y + ey * t, dx = b.x - cx, dy = b.y - cy, d = len(dx, dy);
    if (d >= b.r) return null;
    var nx = d > 0.001 ? dx / d : Math.cos(car.ang), ny = d > 0.001 ? dy / d : Math.sin(car.ang);
    b.x = cx + nx * b.r; b.y = cy + ny * b.r;
    var rv = (b.vx - car.vx) * nx + (b.vy - car.vy) * ny;
    if (rv < 0) { b.vx -= rv * 1.05 * nx; b.vy -= rv * 1.05 * ny; }
    return { nx: nx, ny: ny, t: t };
  }
  // 차에 붙은 선분들(차 기준 좌표: 앞 = +x, 오른쪽 = +y) → 세상 좌표
  function attachSegs(car, segs) {
    var c = Math.cos(car.ang), s = Math.sin(car.ang);
    return segs.map(function (g) {
      return g.map(function (p) { return { x: car.x + p[0] * c - p[1] * s, y: car.y + p[0] * s + p[1] * c }; });
    });
  }
  var PLATES = {
    flat: [[[62, -60], [62, 60]]],
    curve: [[[62, -50], [62, 50]], [[62, -50], [104, -74]], [[62, 50], [104, 74]]]
  };

  // ---------- 한 단계 움직이기 ----------
  // world: { car, bodies: [], boxes: [[x0,y0,x1,y1]], plate: null|'flat'|'curve', extra: fn(world, dt) }
  // 돌려줌: 이번 단계의 사건(벽 충돌, 물체 접촉)
  function stepWorld(w, ix, iy, dt) {
    var ev = { wallHit: 0, touch: {}, plateTouch: {} };
    var n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (var i = 0; i < n; i++) subStep(w, ix, iy, h, ev);
    return ev;
  }
  function subStep(w, ix, iy, dt, ev) {
    var car = w.car;
    steerCar(car, ix, iy, dt);
    car.x += car.vx * dt; car.y += car.vy * dt;
    w.bodies.forEach(function (b) {
      if (b.held) return;
      var s = len(b.vx, b.vy), ns = Math.max(0, s - b.fric * dt);
      if (s > 0) { b.vx *= ns / s; b.vy *= ns / s; }
      var ox = b.x, oy = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b._dx = b.x - ox; b._dy = b.y - oy;
    });
    if (w.extra) w.extra(w, dt, ev);   // 자석 힘·견인 줄(미션이 넣음)
    var plateSegs = w.plate ? attachSegs(car, PLATES[w.plate]) : null;
    for (var it = 0; it < 4; it++) {
      w.bodies.forEach(function (b) {
        var c = circlePair(car, b, 0.15);
        if (c) { ev.touch[b.kind] = true; b.contactT = w.t || 0; }
        if (plateSegs) plateSegs.forEach(function (sg) { if (segPush(car, b, sg[0], sg[1])) { ev.plateTouch[b.kind] = true; b.plateT = w.t || 0; } });
        w.bodies.forEach(function (o) { if (o !== b && o.kind < b.kind) circlePair(o, b, 0.2); });
      });
      w.bodies.forEach(function (b) { solid(b, w, 0.25); });
      var hit = solid(car, w, WALL_BOUNCE);
      if (hit > 60) { ev.wallHit = Math.max(ev.wallHit, hit); car.hitN = ev.lastN; }
    }
    // 물체가 벽에 끼어 차와 겹친 채 남지 않게: 마지막에 차만 물체 밖으로
    w.bodies.forEach(function (b) {
      var dx = car.x - b.x, dy = car.y - b.y, d = len(dx, dy), min = car.r + b.r;
      if (d < min - 0.5) { var nx = d > 0.001 ? dx / d : -1, ny = d > 0.001 ? dy / d : 0; car.x = b.x + nx * min; car.y = b.y + ny * min; var vn = car.vx * nx + car.vy * ny; if (vn < 0) { car.vx -= vn * nx; car.vy -= vn * ny; } }
    });
    solid(car, w, WALL_BOUNCE);
    w.bodies.forEach(function (b) { b.moved += len(b._dx || 0, b._dy || 0); });
    function solid(o, w, e) {
      var worst = 0, f;
      (w.boxes || []).forEach(function (bx) { if ((f = boxFix(o.x, o.y, o.r, bx))) { worst = Math.max(worst, bounce(o, f, e)); ev.lastN = f; } });
      if ((f = wallFix(o.x, o.y, o.r))) { worst = Math.max(worst, bounce(o, f, e)); ev.lastN = f; }
      return worst;
    }
  }
  function overlapping(w) {
    var bad = [];
    function chk(o, name) {
      if (wallFix(o.x, o.y, o.r - 0.5)) bad.push(name + ':wall');
      (w.boxes || []).forEach(function (b) { if (boxFix(o.x, o.y, o.r - 0.5, b)) bad.push(name + ':box'); });
    }
    chk(w.car, 'car');
    w.bodies.forEach(function (b) {
      chk(b, b.kind);
      if (len(b.x - w.car.x, b.y - w.car.y) < b.r + w.car.r - 1) bad.push(b.kind + ':car');
    });
    return bad;
  }

  // ---------- 빛 ----------
  // blockers: [[x0,y0,x1,y1]] 가림막, mirrors: [{ a:{x,y}, b:{x,y} }], targets: [{ id, x, y, r }]
  // 돌려줌: 광선 경로 점들과 맞은 표적(direct/reflected 구분)
  function raySeg(ox, oy, dx, dy, a, b) {
    var ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) return null;
    var t = ((a.x - ox) * ey - (a.y - oy) * ex) / den, u = ((a.x - ox) * dy - (a.y - oy) * dx) / den;
    return t > 0.01 && u >= 0 && u <= 1 ? t : null;
  }
  function rayBox(ox, oy, dx, dy, b) {
    var t0 = -Infinity, t1 = Infinity;
    for (var k = 0; k < 2; k++) {
      var o = k ? oy : ox, d = k ? dy : dx, lo = b[k], hi = b[k + 2];
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
      var a = (lo - o) / d, c = (hi - o) / d;
      if (a > c) { var tmp = a; a = c; c = tmp; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    }
    return t1 >= Math.max(t0, 0.01) ? Math.max(t0, 0.01) : null;
  }
  function rayCircle(ox, oy, dx, dy, c) {
    var fx = ox - c.x, fy = oy - c.y, b = fx * dx + fy * dy, cc = fx * fx + fy * fy - c.r * c.r, disc = b * b - cc;
    if (disc < 0) return null;
    var t = -b - Math.sqrt(disc);
    return t > 0.01 ? t : (cc < 0 ? 0.01 : null);
  }
  function rayWall(ox, oy, dx, dy) {
    // 경기장 벽까지(네모로 충분): 빛은 벽에서 멈춤
    var A = ARENA, t = Infinity;
    if (dx > 0) t = Math.min(t, (A.x1 - ox) / dx); if (dx < 0) t = Math.min(t, (A.x0 - ox) / dx);
    if (dy > 0) t = Math.min(t, (A.y1 - oy) / dy); if (dy < 0) t = Math.min(t, (A.y0 - oy) / dy);
    return Math.max(0, t);
  }
  function castRay(ox, oy, dx, dy, scene, maxLen) {
    var pts = [{ x: ox, y: oy }], hits = [], bounces = 0, left = maxLen || 1400, blockedBy = null, via = null;
    while (left > 0 && bounces <= 2) {
      var best = Math.min(rayWall(ox, oy, dx, dy), left), what = 'wall', obj = null, t;
      (scene.blockers || []).forEach(function (b) { if ((t = rayBox(ox, oy, dx, dy, b)) != null && t < best) { best = t; what = 'block'; obj = b; } });
      (scene.mirrors || []).forEach(function (m) { if ((t = raySeg(ox, oy, dx, dy, m.a, m.b)) != null && t < best) { best = t; what = 'mirror'; obj = m; } });
      (scene.targets || []).forEach(function (c) {
        if ((t = rayCircle(ox, oy, dx, dy, c)) != null && t < best) hits.push({ id: c.id, reflected: bounces > 0, at: t });
      });
      var hx = ox + dx * best, hy = oy + dy * best;
      pts.push({ x: hx, y: hy });
      left -= best;
      if (what === 'mirror') {
        var ex = obj.b.x - obj.a.x, ey = obj.b.y - obj.a.y, el = len(ex, ey), nx = -ey / el, ny = ex / el, dn = dx * nx + dy * ny;
        dx -= 2 * dn * nx; dy -= 2 * dn * ny;
        ox = hx; oy = hy; bounces++; via = via || { x: hx, y: hy };
        continue;
      }
      if (what === 'block') blockedBy = obj;
      break;
    }
    return { pts: pts, hits: hits, blocked: blockedBy, mirror: via };
  }
  // 헤드라이트: 차 앞에서 부채꼴로 광선 n개
  function headlight(car, scene, spread, n) {
    var f = front(car, 2), rays = [];
    for (var i = 0; i < n; i++) {
      var a = car.ang + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
      rays.push(castRay(f.x, f.y, Math.cos(a), Math.sin(a), scene, 1700));
    }
    return rays;
  }

  // ---------- 6학년: 측정 ----------
  // 측정선을 넘는 순간부터 dur 초 동안 실제로 지나간 길(프레임마다 움직인 거리의 합)을 기록. 측정 중에는 선을 다시 밟아도 그대로
  function makeMeter(lineX, dur) { return { lineX: lineX, dur: dur || 3, on: false, t: 0, dist: 0, path: [], last: null, done: null }; }
  function stepMeter(m, car, dt) {
    var p = m.last;
    m.last = { x: car.x, y: car.y };
    if (m.done || !p) return null;
    if (!m.on) {
      if (p.x === car.x || (p.x - m.lineX) * (car.x - m.lineX) > 0) return null;
      // 선을 넘은 자리부터 재기 시작(이번 프레임에서 선을 넘은 뒤 남은 시간만큼 이어서 잼)
      var k = (m.lineX - p.x) / (car.x - p.x);
      p = { x: m.lineX, y: p.y + (car.y - p.y) * k };
      m.on = true; m.t = 0; m.dist = 0; m.path = [p];
      dt *= 1 - k;
    }
    var use = Math.min(dt, m.dur - m.t), frac = dt > 0 ? use / dt : 1;
    var nx = p.x + (car.x - p.x) * frac, ny = p.y + (car.y - p.y) * frac;
    m.dist += len(nx - p.x, ny - p.y);
    m.path.push({ x: nx, y: ny });
    m.t += use;
    if (m.t >= m.dur - 1e-9) { m.done = { dist: m.dist, time: m.dur, path: m.path.slice() }; m.on = false; return m.done; }
    return null;
  }
  function meters(px) { return Math.round(px / PX_PER_M * 10) / 10; }        // 화면에 쓰는 거리(m, 소수 첫째)
  function speedOf(distM, sec) { return Math.round(distM / sec * 10) / 10; } // 평균 속력(m/s, 소수 첫째 반올림)

  var API = {
    ARENA: ARENA, CAR: CAR, PX_PER_M: PX_PER_M, DIR_ANG: DIR_ANG, PLATES: PLATES,
    len: len, clamp: clamp, angDiff: angDiff, dirIndex: dirIndex,
    wallFix: wallFix, boxFix: boxFix, makeCar: makeCar, steerCar: steerCar, front: front,
    makeBody: makeBody, circlePair: circlePair, segPush: segPush, attachSegs: attachSegs,
    stepWorld: stepWorld, overlapping: overlapping,
    castRay: castRay, headlight: headlight,
    makeMeter: makeMeter, stepMeter: stepMeter, meters: meters, speedOf: speedOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.MP_THRILL_PHYS = API;
})(this);
