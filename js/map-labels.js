/*
 * 메이크파크 지도 이름표
 * ------------------------------------------------------------
 * 지도 그림에는 간판 글자가 없으므로, 시설·광장 이름을 둥근 이름표로 지도 위에 그립니다.
 * 위치: js/data/park-data.js 의 facilities[].label, landmarks[].label (지도 좌표, 이름표 가운데)
 * 계절마다 이름이 다르면 landmarks[].seasonNames 에 적습니다(예: 크리스마스에는 '트리 광장').
 * js/game.js 가 캐릭터와 건물 가림을 그린 뒤 MPMapLabels.draw 를 부릅니다(지도 좌표 변환이 걸린 상태).
 * 가볍게: 이름표마다 작은 그림(캔버스)으로 한 번 그려 두고 매 장면 붙이기만 함.
 *         화면 배율이 크게 바뀌거나(전체 지도 열기 등) 계절·글꼴이 바뀌면 다시 그려 둠.
 */
(function () {
  'use strict';
  var FONT = "Jua, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
  var BASE = 14;        // 글자 크기(지도 좌표). 화면에서 이보다 작아지지 않게 아래 MIN_PX 로 키움
  var MIN_PX = 11;      // 전체 지도처럼 멀리 볼 때도 글자가 이 크기(화면 px) 밑으로 작아지지 않게
  var cache = { key: '', list: [] }, fontOk = false;

  function items(park, season) {
    var out = [];
    (park.facilities || []).forEach(function (f) { if (f.label) out.push({ name: f.name, x: f.label.x, y: f.label.y }); });
    (park.landmarks || []).forEach(function (l) {
      if (!l.label) return;
      var name = (l.seasonNames && l.seasonNames[season]) || l.name;
      out.push({ name: name, x: l.label.x, y: l.label.y });
    });
    return out;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // 이름표 하나를 px 배율(지도 1칸 = px 화면 점)로 작은 캔버스에 그림
  function render(name, fs, px) {
    var m = document.createElement('canvas').getContext('2d');
    m.font = fs + 'px ' + FONT;
    var tw = m.measureText(name).width;
    var padX = fs * 0.62, h = fs * 1.7, w = tw + padX * 2, sh = fs * 0.16, pad = 2;
    var cv = document.createElement('canvas');
    cv.width = Math.ceil((w + pad * 2) * px); cv.height = Math.ceil((h + sh + pad * 2) * px);
    var c = cv.getContext('2d');
    c.scale(px, px); c.translate(pad, pad);
    // 아래쪽 그림자 → 크림색 판 → 갈색 테두리 → 글자
    c.fillStyle = 'rgba(80, 45, 20, 0.28)';
    roundRect(c, 0, sh, w, h, h / 2.2); c.fill();
    c.fillStyle = 'rgba(255, 248, 231, 0.96)';
    roundRect(c, 0, 0, w, h, h / 2.2); c.fill();
    c.lineWidth = Math.max(1.2, fs * 0.1); c.strokeStyle = '#a0682f'; c.stroke();
    c.font = fs + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#3b2a1e';
    c.fillText(name, w / 2, h / 2 + fs * 0.04);
    return { cv: cv, w: w + pad * 2, h: h + sh + pad * 2, ox: w / 2 + pad, oy: h / 2 + pad };
  }

  function draw(ctx, park, season, scale, dpr) {
    scale = Math.max(0.01, scale || 1);
    var fs = Math.max(BASE, MIN_PX / scale);
    // 화면 점 배율을 4단계 정도로 묶어 다시 그리는 횟수를 줄임(확대·축소 움직임 중에도 가볍게)
    var px = Math.max(0.5, Math.round(scale * (dpr || 1) * 4) / 4);
    // 글꼴(Jua)이 준비됐는지는 준비될 때까지만 물어봄(준비되면 이름표를 한 번 다시 그림)
    if (!fontOk) fontOk = !document.fonts || document.fonts.check('14px Jua');
    var fontReady = fontOk;
    var key = season + '|' + fs.toFixed(1) + '|' + px + '|' + fontReady;
    if (cache.key !== key) {
      cache.key = key;
      cache.list = items(park, season).map(function (it) {
        var r = render(it.name, fs, px); r.x = it.x; r.y = it.y; return r;
      });
    }
    for (var i = 0; i < cache.list.length; i++) {
      var r = cache.list[i];
      ctx.drawImage(r.cv, r.x - r.ox, r.y - r.oy, r.w, r.h);
    }
  }

  window.MPMapLabels = { draw: draw };
})();
