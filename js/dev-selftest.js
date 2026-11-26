/*
 * 개발용 자동 점검 (?debug=1 일 때만 불러옴). 브라우저 콘솔에서:  await MP_SELFTEST()
 * 실제 포인터/키보드 이벤트를 화면 좌표로 보내서 확대 화면에서의 클릭 위치, 시설 도달, 안내창, 전체 지도를 확인합니다.
 * ※ 점검 중 캐릭터 위치를 옮기므로 저장 위치도 바뀝니다.
 */
window.MP_SELFTEST = async function () {
  var D = window.MP_DEV, st = D.state, cv = document.getElementById('stage');
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var $ = function (id) { return document.getElementById(id); };
  function tap(wx, wy) {
    var s = D.worldToScreen(wx, wy), r = cv.getBoundingClientRect();
    cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + s.x, clientY: r.top + s.y, bubbles: true, pointerType: 'touch' }));
  }
  function key(code, type) { window.dispatchEvent(new KeyboardEvent(type || 'keydown', { code: code, bubbles: true })); }
  function inView(el) {
    if (!el || el.hidden) return true;
    var r = el.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
  }
  var R = { viewport: innerWidth + 'x' + innerHeight, problems: [] };
  function check(ok, msg) { if (!ok) R.problems.push(msg); }

  check(document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight, '페이지 스크롤 생김');
  if (st.phase !== 'play') {
    check(inView($('titleForm')), '첫 화면 카드가 잘림');
    $('nickname').value = $('nickname').value || '점검';
    var g = document.querySelector('input[name=grade]:checked') || document.querySelector('input[name=grade]');
    g.checked = true; $('titleForm').dispatchEvent(new Event('change'));
    $('enterPark').click();
    await sleep(200);
    // '우리 반 공원' 창(js/net/multiplayer.js) → 혼자 둘러보기
    var solo = Array.prototype.filter.call(document.querySelectorAll('.join-btn.light'), function (b) { return b.offsetParent; })[0];
    if (solo) { solo.click(); await sleep(300); }
    // 처음이면 캐릭터 고르기 창 → 첫 캐릭터
    var card = !$('charDlg') || $('charDlg').hidden ? null : document.querySelector('#charDlg .char-card:not(.locked)');
    if (card) { card.click(); await sleep(300); }
    check(st.phase === 'play', '공원 입장 실패(반 코드 창·캐릭터 고르기)');
  }
  await sleep(300);
  check(inView($('hud')) && inView($('miniMap')) && inView($('ticketChip')) && inView($('playerChip')), '상단 UI 잘림');

  // 1) 정문 → 모든 시설
  var speed = D.park.player.speed; D.park.player.speed = 1500;
  R.facilities = {};
  for (var i = 0; i < D.park.facilities.length; i++) {
    var f = D.park.facilities[i];
    st.player.x = D.park.start.x; st.player.y = D.park.start.y; st.path = null; await sleep(700);
    tap(f.entrance.x, f.entrance.y);
    // 입구가 걷는 길 밖이면 가장 가까운 길로 목적지가 잡힘
    var snap = D.grid.nearestWalkable(f.entrance.x, f.entrance.y) || f.entrance;
    var d0 = st.dest ? Math.hypot(st.dest.x - snap.x, st.dest.y - snap.y) : -1;
    for (var t = 0; st.path && t < 80; t++) await sleep(100);
    await sleep(150);
    var ok = d0 >= 0 && d0 < 1 && st.nearby === f && !$('enterFacility').hidden && inView($('enterFacility'));
    var ride = '';
    if (ok) {
      // 들어가기 → 놀이 화면이 열리고, 닫으면 공원으로 돌아옴
      $('enterFacility').click(); await sleep(800);
      if (st.rideOpen !== f.id) ride = ' 놀이 화면 안 열림';
      window.MP_API.closeRide(); await sleep(300);
      if (st.rideOpen) { ride += ' 놀이 화면 안 닫힘'; st.rideOpen = false; }
    }
    R.facilities[f.id] = ok && !ride ? 'OK' : ('실패 dest=' + d0.toFixed(1) + ' nearby=' + (st.nearby && st.nearby.id) + ride);
    check(ok && !ride, f.name + (ok ? ride : ' 도달/입장버튼 실패'));
  }
  D.park.player.speed = speed;

  // 2) 스페이스로 들어가기(모든 시설에 놀이 화면이 있음) · 열린 동안 공원 캐릭터는 멈춤
  var near = D.park.facilities[0], ns = D.grid.nearestWalkable(near.entrance.x, near.entrance.y);
  st.player.x = ns.x; st.player.y = ns.y; st.path = null; await sleep(400);
  key('Space'); await sleep(800);
  check(st.rideOpen === near.id, '스페이스로 놀이 화면 안 열림');
  var p = { x: st.player.x, y: st.player.y };
  key('KeyA'); await sleep(400); key('KeyA', 'keyup');
  check(p.x === st.player.x && p.y === st.player.y && !st.dest, '놀이 화면 열린 동안 캐릭터가 움직임');
  window.MP_API.closeRide(); await sleep(300);
  check(!st.rideOpen, '놀이 화면 닫기 안 됨');

  // 3) 이동 중 목적지 변경
  st.player.x = D.park.start.x; st.player.y = D.park.start.y; await sleep(600);
  var fa = D.park.facilities.filter(function (f) { return f.id === 'arcade'; })[0];
  var fp = D.park.facilities.filter(function (f) { return f.id === 'parade'; })[0];
  tap(fa.entrance.x, fa.entrance.y); await sleep(500); var mid = { x: st.player.x, y: st.player.y };
  // 화면 안에 보이는 지점(캐릭터에서 화면 폭 1/4만큼 왼쪽)으로 목적지 변경
  var tgt = null;
  [[0.25, 0.5], [0.25, 0.35], [0.25, 0.65], [0.35, 0.5], [0.15, 0.5], [0.35, 0.3], [0.35, 0.7]].some(function (f) {
    var tw = D.screenToWorld(innerWidth * f[0], innerHeight * f[1]), n = D.grid.nearestWalkable(tw.x, tw.y);
    if (n && n.dist < 20 && Math.hypot(n.x - mid.x, n.y - mid.y) > 60) { tgt = n; return true; }
    return false;
  });
  if (!tgt) tgt = D.grid.nearestWalkable(mid.x - 100, mid.y);
  tap(tgt.x, tgt.y); await sleep(400);
  check(st.dest && Math.abs(st.dest.x - tgt.x) < 1 && Math.abs(st.dest.y - tgt.y) < 1, '이동 중 목적지 변경 실패');

  // 4) 갈 수 없는 곳
  // 지도가 바뀌어도 되게: 길에서 maxSnapDistance 보다 먼 곳을 찾아 누름
  var far = null;
  for (var fy = 0; fy < D.park.world.height && !far; fy += 20) for (var fx = 0; fx < D.park.world.width && !far; fx += 20) {
    var fn = D.grid.nearestWalkable(fx, fy); if (!fn || fn.dist > D.park.maxSnapDistance) far = { x: fx, y: fy };
  }
  var before = st.dest; if (far) tap(far.x, far.y);
  check(!!far, '갈 수 없는 곳을 찾지 못함');
  check(st.dest === before && !$('toast').hidden, '갈 수 없는 곳 안내 실패');

  // 5) 전체 지도
  st.path = null; st.dest = null;
  $('miniMap').click(); await sleep(1500);
  check(Math.abs(D.cam.s - Math.min(innerWidth / D.park.world.width, innerHeight / D.park.world.height)) < 0.02, '전체 지도 배율 이상');
  check(inView($('mapBar')), '전체 지도 하단 바 잘림');
  var tf = D.park.facilities[2], ps = D.worldToScreen(tf.pin.x, tf.pin.y), r = cv.getBoundingClientRect();
  cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + ps.x, clientY: r.top + ps.y - 18, bubbles: true }));
  check(st.view === 'play' && st.dest && Math.hypot(st.dest.x - tf.entrance.x, st.dest.y - tf.entrance.y) < 1, '지도 핀 누르기 실패');
  st.path = null; st.dest = null;
  $('miniMap').click(); await sleep(200); $('mapBack').click(); await sleep(1500);
  check(st.view === 'play', '플레이 화면 복귀 실패');
  // 카메라가 지도 밖을 보여주지 않는지
  var tl = D.screenToWorld(0, 0), br = D.screenToWorld(innerWidth, innerHeight);
  check(tl.x >= -1 && tl.y >= -1 && br.x <= D.park.world.width + 1 && br.y <= D.park.world.height + 1, '플레이 화면에 지도 바깥이 보임');
  // 6) 계절 전환(반 공원에서 선생님이 바꾼 것처럼): 위치·학년 유지, 전환 후 이동
  var before2 = { x: st.player.x, y: st.player.y, grade: st.grade, season: st.season };
  var other = Object.keys(D.park.seasons).filter(function (k) { return k !== st.season; })[0];
  window.MP_API.setSeason(other); await sleep(800);
  // 지금 쓰는 저장 칸(혼자 둘러보기·반 공원마다 다름)을 읽음
  var sv = (window.MP_API && MP_API.readSave && MP_API.readSave()) || {};
  check(st.season === other, '계절 전환 실패');
  check(st.player.x === before2.x && st.player.y === before2.y && st.grade === before2.grade && sv.grade === before2.grade, '계절 전환 때 위치·학년이 바뀜');
  D.park.player.speed = 1500;
  var fs = D.park.facilities[0];
  tap(fs.entrance.x, fs.entrance.y); for (var t2 = 0; st.path && t2 < 80; t2++) await sleep(100); await sleep(150);
  check(st.nearby === fs, '계절 전환 후 이동 실패');
  D.park.player.speed = speed;
  R.season = st.season;
  window.MP_API.setSeason(before2.season); await sleep(700);

  R.scale = D.cam.s.toFixed(2);
  R.pass = R.problems.length === 0;
  return R;
};
