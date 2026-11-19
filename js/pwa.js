/*
 * 앱으로 설치하기 (학생 앱·선생님 앱 함께 씀)
 * - 서비스 워커(sw.js) 등록
 * - 브라우저가 설치할 수 있다고 알려 주면(beforeinstallprompt) #installApp 버튼을 보여 주고, 누르면 설치 창
 * - 이미 앱으로 열려 있으면 버튼을 숨김
 */
(function () {
  'use strict';
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* 설치만 못 할 뿐 게임은 그대로 */ }); });
  }
  var standalone = window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches);
  var deferred = null;
  function btn() { return document.getElementById('installApp'); }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    var b = btn(); if (b && !standalone) b.hidden = false;
  });
  window.addEventListener('appinstalled', function () { var b = btn(); if (b) b.hidden = true; deferred = null; });
  document.addEventListener('click', function (e) {
    var b = btn();
    if (!b || e.target !== b || !deferred) return;
    deferred.prompt();
    deferred.userChoice.then(function () { deferred = null; b.hidden = true; });
  });
})();
