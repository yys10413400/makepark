/*
 * 플레이 아케이드 · 오른손 인식 (별빛 팡팡)
 * ------------------------------------------------------------
 * - '카메라로 시작'을 누른 뒤에만 start()로 카메라 권한을 요청합니다.
 * - 카메라 영상은 이 기기 브라우저 안에서만 손 위치를 찾는 데 쓰고, 저장하거나 어디로도 보내지 않습니다.
 *   (손 인식 프로그램 MediaPipe Hand Landmarker 와 모델 파일만 처음에 인터넷에서 받아 옴)
 * - 화면에는 기본으로 인식 상태만 알려 주고, '카메라 보기'를 켜면 작은 거울 화면(이 기기 안에서만)을 보여 줍니다.
 * - stop() 하면 카메라를 완전히 끕니다(창 닫기·방향키로 바꾸기).
 *
 * 오른손 구분: MediaPipe 의 왼손/오른손 이름은 '거울처럼 뒤집힌(셀카) 영상'을 기준으로 붙습니다.
 *   이 파일은 카메라 영상을 뒤집지 않고 그대로 넣으므로, 실제 오른손은 'Left' 로 나옵니다(RIGHT_LABEL).
 * 방향: 뒤집지 않은 영상에서 내 오른쪽은 영상의 왼쪽(x 작아짐)이라 x 를 1 - x 로 바꿔
 *   '내가 오른쪽으로 움직이면 화면에서도 오른쪽'이 되게 합니다.
 */
(function () {
  'use strict';
  var VER = '0.10.14';
  var LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VER;
  var MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  var RIGHT_LABEL = 'Left';
  var SPAN = 0.34;          // 손을 이만큼(영상 폭의 34%) 옮기면 화면 왼쪽 끝 ↔ 오른쪽 끝. 팔을 크게 뻗지 않아도 됨
  var DEAD = 0.004;         // 이보다 작은 흔들림은 무시(멈춘 손은 멈춘 채로)

  var H = {
    on: false, video: null, stream: null, marker: null, raf: 0, lastVT: -1,
    raw: null, x: 0.5, center: null, seenAt: 0, everSeen: false, token: 0
  };
  var loading = null;

  function loadMarker() {
    if (H.marker) return Promise.resolve(H.marker);
    if (loading) return loading;
    loading = import(LIB + '/vision_bundle.mjs').then(function (vision) {
      return vision.FilesetResolver.forVisionTasks(LIB + '/wasm').then(function (files) {
        var opts = function (delegate) {
          return { baseOptions: { modelAssetPath: MODEL, delegate: delegate }, runningMode: 'VIDEO', numHands: 2,
            minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 };
        };
        return vision.HandLandmarker.createFromOptions(files, opts('GPU')).catch(function () {
          return vision.HandLandmarker.createFromOptions(files, opts('CPU'));
        });
      });
    }).then(function (m) { H.marker = m; return m; }, function (e) { loading = null; throw e; });
    return loading;
  }

  // 손바닥 가운데(손목·검지/중지/약지/새끼 뿌리 평균)의 가로 위치. 0 = 화면 왼쪽, 1 = 오른쪽(내 기준)
  function palmX(lm) {
    var ids = [0, 5, 9, 13, 17], s = 0;
    ids.forEach(function (i) { s += lm[i].x; });
    return 1 - s / ids.length;
  }

  function detect() {
    if (!H.on) return;
    var v = H.video;
    if (v && v.readyState >= 2 && v.currentTime !== H.lastVT) {
      H.lastVT = v.currentTime;
      var res = null;
      try { res = H.marker.detectForVideo(v, performance.now()); } catch (e) { res = null; }
      var found = null, hands = [];
      if (res && res.landmarks) {
        for (var i = 0; i < res.landmarks.length; i++) {
          var hd = res.handednesses && res.handednesses[i] && res.handednesses[i][0], right = !!(hd && hd.categoryName === RIGHT_LABEL);
          var lm = res.landmarks[i];
          // 미리보기용: 거울처럼 뒤집은 좌표(손바닥 가운데)와 오른손인지
          hands.push({ x: palmX(lm), y: (lm[0].y + lm[9].y) / 2, right: right });
          if (right && !found) found = lm;
        }
      }
      H.hands = hands;
      if (found) {
        var px = palmX(found), now = performance.now();
        // 처음 찾은 자리를 가운데로 삼되, 한쪽 끝에 치우치지 않게 0.35~0.65 사이로
        if (H.center == null) H.center = Math.max(0.35, Math.min(0.65, px));
        var target = Math.max(0, Math.min(1, (px - H.center) / SPAN + 0.5));
        if (H.raw == null) H.raw = target;
        // 부드럽게: 크게 움직일 땐 빨리, 조금 흔들릴 땐 천천히 따라감
        var d = target - H.raw, a = Math.max(0.18, Math.min(0.65, 0.18 + Math.abs(d) * 6));
        H.raw += d * a;
        if (Math.abs(H.raw - H.x) > DEAD) H.x = H.raw;
        H.seenAt = now; H.everSeen = true;
      }
    }
    schedule();
  }
  // 새 카메라 프레임이 왔을 때만 인식(같은 프레임을 여러 번 보지 않아 게임 화면이 덜 끊김)
  function schedule() {
    if (!H.on) return;
    var v = H.video;
    if (v && v.requestVideoFrameCallback) H.raf = -v.requestVideoFrameCallback(function () { detect(); });
    else H.raf = requestAnimationFrame(detect);
  }

  // onStep(text): 진행 상황 안내. 성공하면 resolve, 권한 거부·카메라 없음·인식 프로그램을 못 받으면 reject
  function start(onStep) {
    stop();
    var token = ++H.token;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('nocam'));
    if (onStep) onStep('카메라를 연결하고 있어요…');
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
      .then(function (stream) {
        if (token !== H.token) { stream.getTracks().forEach(function (t) { t.stop(); }); throw new Error('cancel'); }
        H.stream = stream;
        var v = H.video = document.createElement('video');
        v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.srcObject = stream;
        return v.play().then(function () {
          if (onStep) onStep('손 인식을 준비하고 있어요…');
          return loadMarker();
        });
      })
      .then(function () {
        if (token !== H.token) throw new Error('cancel');
        H.on = true; H.raw = null; H.center = null; H.everSeen = false; H.seenAt = 0; H.x = 0.5; H.lastVT = -1;
        schedule();
      })
      .catch(function (e) { if (token === H.token) stop(); throw e; });
  }

  function stop() {
    H.token++;
    H.on = false; if (H.raf > 0) cancelAnimationFrame(H.raf); else if (H.raf < 0 && H.video && H.video.cancelVideoFrameCallback) H.video.cancelVideoFrameCallback(-H.raf);
    if (H.stream) H.stream.getTracks().forEach(function (t) { t.stop(); });
    if (H.video) { try { H.video.pause(); } catch (e) { /* 무시 */ } H.video.srcObject = null; }
    H.stream = null; H.video = null; H.hands = [];
  }

  window.MPHand = {
    start: start, stop: stop,
    // x: 0~1(내 기준 왼쪽→오른쪽), seen: 지금 오른손이 보이는지, lostMs: 마지막으로 본 뒤 지난 시간
    read: function () {
      var lost = H.everSeen ? performance.now() - H.seenAt : Infinity;
      return { x: H.x, seen: H.everSeen && lost < 250, lostMs: lost, everSeen: H.everSeen };
    },
    // 미리보기: 카메라 영상(video)과 지금 보이는 손들, 조작 범위(화면 왼끝·오른끝이 되는 손 위치)
    preview: function () {
      return { video: H.video, hands: H.hands || [], range: H.center == null ? null : [H.center - SPAN / 2, H.center + SPAN / 2] };
    },
    isOn: function () { return H.on || !!H.stream; },
    cameraLive: function () { return !!(H.stream && H.stream.getTracks().some(function (t) { return t.readyState === 'live'; })); }
  };
})();
