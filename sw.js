/*
 * 메이크파크 서비스 워커 (학생 앱·선생님 앱 함께)
 * - 앱으로 설치할 수 있게 해 줌
 * - 언제나 인터넷에서 최신 파일을 먼저 받고(GitHub 에 올리면 바로 반영), 끊겼을 때만 전에 받아 둔 파일을 씀
 * - 실시간 연결(Firebase)·글꼴 같은 다른 주소의 요청은 건드리지 않음
 */
var CACHE = 'makepark-v2';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    // cache:'no-cache' — 브라우저 캐시(GitHub Pages 는 10분)에 묵은 파일이 있어도 서버에 바뀌었는지 꼭 물어봄
    fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || Response.error(); });
    })
  );
});
