/* 이동 가능 격자 + 경로 탐색 (A*). 좌표는 모두 지도 픽셀 기준. */
(function () {
  function WalkGrid(mask, park) {
    this.cell = mask.cell;
    this.cols = mask.cols;
    this.rows = mask.rows;
    var n = this.cols * this.rows;
    var raw = new Uint8Array(n);
    for (var r = 0; r < this.rows; r++) {
      var line = mask.data[r];
      for (var c = 0; c < this.cols; c++) raw[r * this.cols + c] = line.charCodeAt(c) === 49 ? 1 : 0;
    }
    // 손으로 정한 추가/제외 적용
    var self = this;
    (park.walkEdits || []).forEach(function (e) {
      var v = e.op === 'add' ? 1 : 0;
      for (var r = 0; r < self.rows; r++) for (var c = 0; c < self.cols; c++) {
        var x = (c + 0.5) * self.cell, y = (r + 0.5) * self.cell, hit = false;
        if (e.rect) hit = x >= e.rect.x && x < e.rect.x + e.rect.w && y >= e.rect.y && y < e.rect.y + e.rect.h;
        else if (e.ellipse) {
          var dx = (x - e.ellipse.cx) / e.ellipse.rx, dy = (y - e.ellipse.cy) / e.ellipse.ry;
          hit = dx * dx + dy * dy <= 1;
        }
        if (hit) raw[r * self.cols + c] = v;
      }
    });
    this.raw = raw;
    // 발밑 영역: 캐릭터 발 위치를 중심으로 한 작은 사각형. 네 모서리가 모두 길이어야 설 수 있음
    this.foot = park.foot || { halfWidth: 0, halfHeight: 0 };
    // 설 수 있는 칸(칸 중심에 발을 두었을 때 발밑이 모두 길)
    var stand = new Uint8Array(n);
    for (var i = 0; i < n; i++) if (raw[i]) { var cp = this.center(i); stand[i] = this.footClear(cp.x, cp.y) ? 1 : 0; }
    this.stand = stand;
    // 시작점과 연결된 칸만 이동 가능
    this.walk = new Uint8Array(n);
    var s = this.nearestStand(park.start.x, park.start.y);
    if (s >= 0) {
      var q = [s]; this.walk[s] = 1;
      while (q.length) {
        var i = q.pop(), cc = i % this.cols, rr = (i / this.cols) | 0;
        var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var k = 0; k < 4; k++) {
          var nc = cc + nb[k][0], nr = rr + nb[k][1];
          if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
          var j = nr * this.cols + nc;
          if (stand[j] && !this.walk[j]) { this.walk[j] = 1; q.push(j); }
        }
      }
    }
  }

  WalkGrid.prototype.idx = function (x, y) {
    var c = Math.floor(x / this.cell), r = Math.floor(y / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  };
  WalkGrid.prototype.center = function (i) {
    return { x: (i % this.cols + 0.5) * this.cell, y: (((i / this.cols) | 0) + 0.5) * this.cell };
  };
  WalkGrid.prototype.rawAt = function (x, y) {
    var i = this.idx(x, y); return i >= 0 && this.raw[i] === 1;
  };
  /* 발 위치 (x,y) 의 발밑 사각형이 모두 길 위인지 */
  WalkGrid.prototype.footClear = function (x, y) {
    var hw = this.foot.halfWidth, hh = this.foot.halfHeight;
    return this.rawAt(x, y) && this.rawAt(x - hw, y - hh) && this.rawAt(x + hw, y - hh) &&
      this.rawAt(x - hw, y + hh) && this.rawAt(x + hw, y + hh);
  };
  /* 캐릭터 발이 (x,y) 에 설 수 있는지: 연결된 이동 칸 + 발밑 영역 검사 */
  WalkGrid.prototype.isWalkable = function (x, y) {
    var i = this.idx(x, y); return i >= 0 && this.walk[i] === 1 && this.footClear(x, y);
  };
  WalkGrid.prototype.nearestStand = function (x, y) {
    var best = -1, bd = Infinity;
    for (var i = 0; i < this.stand.length; i++) if (this.stand[i]) {
      var p = this.center(i), d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  /* 가장 가까운 이동 가능 칸. {index, x, y, dist} 또는 null */
  WalkGrid.prototype.nearestWalkable = function (x, y) {
    var i0 = this.idx(x, y);
    if (this.isWalkable(x, y)) return { index: i0, x: x, y: y, dist: 0 };
    var best = -1, bd = Infinity;
    for (var i = 0; i < this.walk.length; i++) if (this.walk[i]) {
      var p = this.center(i), d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return null;
    var c = this.center(best);
    return { index: best, x: c.x, y: c.y, dist: Math.sqrt(bd) };
  };

  /* 두 점 사이 직선이 이동 가능 칸만 지나는지 (경로 다듬기용) */
  WalkGrid.prototype.lineClear = function (ax, ay, bx, by) {
    var d = Math.hypot(bx - ax, by - ay), steps = Math.ceil(d / (this.cell / 3));
    for (var s = 0; s <= steps; s++) {
      var t = steps ? s / steps : 0;
      if (!this.isWalkable(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  };

  /* A* 경로 탐색: 출발/도착 모두 이동 가능한 좌표여야 함. 반환: [{x,y}...] (출발점 제외) 또는 null */
  WalkGrid.prototype.findPath = function (sx, sy, tx, ty) {
    var start = this.idx(sx, sy), goal = this.idx(tx, ty);
    if (start < 0 || goal < 0 || !this.walk[start] || !this.walk[goal]) return null;
    if (start === goal) return [{ x: tx, y: ty }];
    var cols = this.cols, n = this.walk.length;
    var g = new Float32Array(n).fill(Infinity), came = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    var gc = goal % cols, gr = (goal / cols) | 0;
    var heap = [], hf = [];
    function push(i, f) {
      heap.push(i); hf.push(f); var k = heap.length - 1;
      while (k > 0) { var p = (k - 1) >> 1; if (hf[p] <= hf[k]) break;
        var t = heap[p]; heap[p] = heap[k]; heap[k] = t; t = hf[p]; hf[p] = hf[k]; hf[k] = t; k = p; }
    }
    function pop() {
      var top = heap[0], li = heap.pop(), lf = hf.pop();
      if (heap.length) { heap[0] = li; hf[0] = lf; var k = 0;
        for (;;) { var l = 2 * k + 1, r = l + 1, m = k;
          if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r;
          if (m === k) break; var t = heap[m]; heap[m] = heap[k]; heap[k] = t; t = hf[m]; hf[m] = hf[k]; hf[k] = t; k = m; } }
      return top;
    }
    function h(i) { var dx = Math.abs(i % cols - gc), dy = Math.abs(((i / cols) | 0) - gr);
      return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy); }
    var dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    g[start] = 0; push(start, h(start));
    var found = false;
    while (heap.length) {
      var cur = pop();
      if (closed[cur]) continue;
      if (cur === goal) { found = true; break; }
      closed[cur] = 1;
      var cc = cur % cols, cr = (cur / cols) | 0;
      for (var k = 0; k < 8; k++) {
        var nc = cc + dirs[k][0], nr = cr + dirs[k][1];
        if (nc < 0 || nr < 0 || nc >= cols || nr >= this.rows) continue;
        var j = nr * cols + nc;
        if (!this.walk[j] || closed[j]) continue;
        // 대각선은 모서리를 깎지 않게
        if (dirs[k][0] && dirs[k][1] && (!this.walk[cr * cols + nc] || !this.walk[nr * cols + cc])) continue;
        var ng = g[cur] + dirs[k][2];
        if (ng < g[j]) { g[j] = ng; came[j] = cur; push(j, ng + h(j)); }
      }
    }
    if (!found) return null;
    var cellsPath = [];
    for (var i = goal; i !== -1 && i !== start; i = came[i]) cellsPath.push(i);
    cellsPath.reverse();
    var pts = cellsPath.map(this.center, this);
    pts[pts.length - 1] = { x: tx, y: ty };
    // 직선으로 갈 수 있는 중간점은 건너뛰어 자연스럽게
    var out = [], ax = sx, ay = sy, a = 0;
    while (a < pts.length) {
      var b = pts.length - 1;
      while (b > a && !this.lineClear(ax, ay, pts[b].x, pts[b].y)) b--;
      out.push(pts[b]); ax = pts[b].x; ay = pts[b].y; a = b + 1;
    }
    return out;
  };

  window.WalkGrid = WalkGrid;
})();
