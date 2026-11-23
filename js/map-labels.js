/*
 * 메이크파크 지도 이름표
 * ------------------------------------------------------------
 * 지도 그림에는 간판 글자가 없으므로, 시설·광장 이름을 둥근 이름표로 지도 위에 그립니다.
 * 위치: js/data/park-data.js 의 facilities[].label, landmarks[].label (지도 좌표, 이름표 가운데)
 * 계절마다 이름이 다르면 landmarks[].seasonNames 에 적습니다(예: 크리스마스에는 '트리 광장').
 * js/game.js 가 캐릭터와 건물 가림을 그린 뒤 MPMapLabels.draw 를 부릅니다(지도 좌표 변환이 걸린 상태).
 */
(function () {
  'use strict';
  var FONT = "Jua, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
  var BASE = 14;        // 글자 크기(지도 좌표). 화면에서 이보다 작아지지 않게 아래 MIN_PX 로 키움
  var MIN_PX = 11;      // 전체 지도처럼 멀리 볼 때도 글자가 이 크기(화면 px) 밑으로 작아지지 않게
  var widths = {};      // 글자 폭 재기 결과 기억(매 장면 다시 재지 않게)

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

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(ctx, park, season, scale) {
    var fs = Math.max(BASE, MIN_PX / Math.max(0.01, scale || 1));
    ctx.save();
    ctx.font = fs + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    items(park, season).forEach(function (it) {
      var key = it.name + '|' + fs + '|' + ctx.font;
      var tw = widths[key] || (widths[key] = ctx.measureText(it.name).width);
      var padX = fs * 0.62, h = fs * 1.7, w = tw + padX * 2;
      var x = it.x - w / 2, y = it.y - h / 2;
      // 아래쪽 그림자 → 크림색 판 → 갈색 테두리 → 글자
      ctx.fillStyle = 'rgba(80, 45, 20, 0.28)';
      roundRect(ctx, x, y + fs * 0.16, w, h, h / 2.2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 248, 231, 0.96)';
      roundRect(ctx, x, y, w, h, h / 2.2); ctx.fill();
      ctx.lineWidth = Math.max(1.2, fs * 0.1);
      ctx.strokeStyle = '#a0682f';
      ctx.stroke();
      ctx.fillStyle = '#3b2a1e';
      ctx.fillText(it.name, it.x, it.y + fs * 0.04);
    });
    ctx.restore();
  }

  window.MPMapLabels = { draw: draw };
})();
