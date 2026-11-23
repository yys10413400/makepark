/*
 * 메이크파크 눈 내리기 (눈 오는 계절 지도: park-data.js seasons.<계절>.snow = true)
 * ------------------------------------------------------------
 * 화면 위에 눈송이를 그립니다(지도·캐릭터·이름표 위, 버튼 같은 화면 메뉴 아래).
 * 가볍게: 눈송이 그림은 처음 한 번만 만들어 두고 매 장면 붙이기만 함. 개수는 화면 넓이에 맞추되 최대 MAX 개.
 * 계절을 바꾸면 1초 동안 서서히 나타나고 사라짐. 기기에서 '움직임 줄이기'를 켜면 그리지 않음.
 * js/game.js 의 draw() 끝에서 MPSnow.draw(ctx, 화면폭, 화면높이, 점배율, 지난시간, 눈오는계절?, 카메라x, 카메라y) 를 부름.
 */
(function () {
  'use strict';
  var MAX = 160, PER_PX = 1 / 5500;       // 화면 5500px²마다 하나, 최대 160개
  var flakes = [], amount = 0, last = null, sprite = null;
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function makeSprite() {
    // 하얀 눈송이 + 옅은 푸른 회색 테두리(밝은 분홍 길·흰 눈 위에서도 보이게)
    var s = 32, h = s / 2, cv = document.createElement('canvas'); cv.width = cv.height = s;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(h, h, h * 0.45, h, h, h);
    g.addColorStop(0, 'rgba(120,140,175,0.55)');
    g.addColorStop(1, 'rgba(120,140,175,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    var w = c.createRadialGradient(h, h, 0, h, h, h * 0.62);
    w.addColorStop(0, 'rgba(255,255,255,1)');
    w.addColorStop(0.7, 'rgba(255,255,255,0.95)');
    w.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = w; c.beginPath(); c.arc(h, h, h * 0.62, 0, Math.PI * 2); c.fill();
    return cv;
  }
  function spawn(f, w, h, top) {
    var depth = Math.random();                       // 0 = 멀리(작고 느림) … 1 = 가까이(크고 빠름)
    f.x = Math.random() * w;
    f.y = top ? -10 - Math.random() * 40 : Math.random() * h;
    f.r = 2.2 + depth * 3.6;                         // 반지름(화면 px, 테두리 포함)
    f.vy = 22 + depth * 38;                          // 떨어지는 빠르기(px/초)
    f.sway = 8 + Math.random() * 14;                 // 좌우 흔들림 폭
    f.ph = Math.random() * Math.PI * 2; f.fr = 0.6 + Math.random() * 0.9;
    f.a = 0.7 + depth * 0.3; f.par = 0.15 + depth * 0.35; // 투명도, 카메라 따라 흐르는 정도
    return f;
  }

  function draw(ctx, w, h, dpr, dt, snowing, camX, camY) {
    if (reduce.matches) { amount = 0; return; }
    dt = Math.min(0.05, Math.max(0, dt || 0));
    amount += ((snowing ? 1 : 0) - amount) * Math.min(1, dt * 2.2);
    if (amount < 0.02) { if (!snowing) { flakes.length = 0; last = null; } return; }
    if (!sprite) sprite = makeSprite();
    var want = Math.min(MAX, Math.round(w * h * PER_PX));
    while (flakes.length < want) flakes.push(spawn({}, w, h, false));
    if (flakes.length > want) flakes.length = want;
    // 카메라가 움직인 만큼 눈이 살짝 반대로 흐름(가까운 눈일수록 많이)
    var dx = last ? camX - last.x : 0, dy = last ? camY - last.y : 0;
    if (Math.abs(dx) > w || Math.abs(dy) > h) { dx = 0; dy = 0; }   // 순간이동·지도 열기 때는 무시
    last = { x: camX, y: camY };
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var t = performance.now() / 1000;
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.y += f.vy * dt - dy * f.par;
      f.x += -dx * f.par;
      if (f.y > h + 12) spawn(f, w, h, true);
      if (f.x < -20) f.x += w + 40; else if (f.x > w + 20) f.x -= w + 40;
      var x = f.x + Math.sin(t * f.fr + f.ph) * f.sway, d = f.r * 2;
      ctx.globalAlpha = f.a * amount;
      ctx.drawImage(sprite, x - f.r, f.y - f.r, d, d);
    }
    ctx.restore();
  }

  window.MPSnow = { draw: draw };
})();
