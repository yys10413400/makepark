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
  }
  await sleep(300);
  check(inView($('hud')) && inView($('mapToggle')) && inView($('playerChip')), '상단 UI 잘림');

  // 1) 정문 → 모든 시설
  var speed = D.park.player.speed; D.park.player.speed = 1500;
  R.facilities = {};
  for (var i = 0; i < D.park.facilities.length; i++) {
    var f = D.park.facilities[i];
    st.player.x = D.park.start.x; st.player.y = D.park.start.y; st.path = null; await sleep(700);
    tap(f.entrance.x, f.entrance.y);
    var d0 = st.dest ? Math.hypot(st.dest.x - f.entrance.x, st.dest.y - f.entrance.y) : -1;
    for (var t = 0; st.path && t < 80; t++) await sleep(100);
    await sleep(150);
    var ok = d0 >= 0 && d0 < 1 && st.nearby === f && !$('enterFacility').hidden && inView($('enterFacility'));
    R.facilities[f.id] = ok ? 'OK' : ('실패 dest=' + d0.toFixed(1) + ' nearby=' + (st.nearby && st.nearby.id));
    check(ok, f.name + ' 도달/입장버튼 실패');
  }
  D.park.player.speed = speed;

  // 2) 안내창
  key('Space'); await sleep(100);
  check(!$('modal').hidden && $('modalTitle').textContent === st.modalFacility.name, '스페이스로 안내창 안 열림');
  check(inView(document.querySelector('.modal-card')), '안내창 잘림');
  var p = { x: st.player.x, y: st.player.y };
  key('KeyA'); await sleep(400); key('KeyA', 'keyup'); tap(D.park.start.x, D.park.start.y); await sleep(300);
  check(p.x === st.player.x && p.y === st.player.y && !st.dest, '안내창 열린 동안 캐릭터가 움직임');
  $('modalClose').click(); await sleep(50);
  check($('modal').hidden, '닫기 버튼 동작 안 함');

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
  var before = st.dest; tap(820, 15);
  check(st.dest === before && !$('toast').hidden, '갈 수 없는 곳 안내 실패');

  // 5) 전체 지도
  st.path = null; st.dest = null;
  $('mapToggle').click(); await sleep(1500);
  check(Math.abs(D.cam.s - Math.min(innerWidth / D.park.world.width, innerHeight / D.park.world.height)) < 0.02, '전체 지도 배율 이상');
  check(inView($('mapBar')), '전체 지도 하단 바 잘림');
  var tf = D.park.facilities[2], ps = D.worldToScreen(tf.pin.x, tf.pin.y), r = cv.getBoundingClientRect();
  cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + ps.x, clientY: r.top + ps.y - 18, bubbles: true }));
  check(st.view === 'play' && st.dest && Math.hypot(st.dest.x - tf.entrance.x, st.dest.y - tf.entrance.y) < 1, '지도 핀 누르기 실패');
  st.path = null; st.dest = null;
  $('mapToggle').click(); await sleep(200); $('mapBack').click(); await sleep(1500);
  check(st.view === 'play', '플레이 화면 복귀 실패');
  // 카메라가 지도 밖을 보여주지 않는지
  var tl = D.screenToWorld(0, 0), br = D.screenToWorld(innerWidth, innerHeight);
  check(tl.x >= -1 && tl.y >= -1 && br.x <= D.park.world.width + 1 && br.y <= D.park.world.height + 1, '플레이 화면에 지도 바깥이 보임');
  // 6) 계절 전환: 위치·학년 유지, 저장, 전환 후 이동
  var before2 = { x: st.player.x, y: st.player.y, grade: st.grade, season: st.season };
  $('seasonToggle').click(); await sleep(800);
  var sv = JSON.parse(localStorage.getItem('makepark.save.v1') || '{}');
  check(st.season !== before2.season && sv.season === st.season, '계절 전환/저장 실패');
  check(st.player.x === before2.x && st.player.y === before2.y && st.grade === before2.grade && sv.grade === before2.grade, '계절 전환 때 위치·학년이 바뀜');
  D.park.player.speed = 1500;
  var fs = D.park.facilities[0];
  tap(fs.entrance.x, fs.entrance.y); for (var t2 = 0; st.path && t2 < 80; t2++) await sleep(100); await sleep(150);
  check(st.nearby === fs, '계절 전환 후 이동 실패');
  D.park.player.speed = speed;
  R.season = st.season;
  $('seasonToggle').click(); await sleep(700);

  R.scale = D.cam.s.toFixed(2);
  R.pass = R.problems.length === 0;
  return R;
};
