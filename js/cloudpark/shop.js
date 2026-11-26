/*
 * 추억 상점 (지도 위 '추억 상점' 건물 = 시설 id shop)
 * ------------------------------------------------------------
 * 건물 미션에서 모은 티켓으로 구름동산 꾸미기 아이템을 사는 가게.
 *  - 아이템·값·계절: js/cloudpark/items.js 의 SHOP 목록(그림은 assets/cloudpark/shop/)
 *  - 계절 장식은 그 계절에만 살 수 있음(3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울). 산 것은 계절이 지나도 언제든 배치
 *  - 한 번 사면 1개가 구름동산 보관함에 들어감(여러 번 사면 여러 개). 같은 아이템을 공원에 산 개수만큼 놓을 수 있음
 *  - 저장: makepark.save.v1(반 공원은 반 기록)의 tickets(남은 티켓)·cloudShop = { own: { 아이템: 산 개수 }, log: [{ t, p, at }] }
 * 공원과의 연결: window.MP_API (readSave · patchSave · toast · exitShop)
 */
(function () {
  'use strict';
  var D = window.MP_CLOUD_ITEMS;
  if (!D) return;
  var TABS = [
    { id: 'season', name: '계절 장식', test: function (t) { return /^(sp|su|au|wi)-/.test(t); } },
    { id: 'ride', name: '놀이기구', test: function (t) { return /^ride-/.test(t); } },
    { id: 'deco', name: '별마당 장식', test: function (t) { return /^fx-/.test(t); } },
    { id: 'village', name: '마을 소품', test: function (t) { return /^vl-/.test(t); } },
    { id: 'tree', name: '나무와 한옥', test: function (t) { return /^(tr|hs)-/.test(t); } }
  ];
  var SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
  var S = { open: false, tab: 'season', busy: false };
  var ui = {};
  function api() { return window.MP_API; }
  function save() { return (api() && api().readSave()) || {}; }
  function tickets() { return Number(save().tickets) || 0; }
  function shopSave() { var s = save().cloudShop; return s && typeof s === 'object' ? s : {}; }
  function owned(t) { var o = shopSave().own; return (o && +o[t]) || 0; }
  function el(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }
  function btn(c, html, fn) { var b = el('button', c); b.type = 'button'; b.innerHTML = html; if (fn) b.addEventListener('click', fn); return b; }
  function josa(w, a, b) { var c = w.charCodeAt(w.length - 1) - 0xAC00; return w + (c >= 0 && c <= 11171 && c % 28 !== 0 ? a : b); }
  function items(tab) {
    var T = TABS.filter(function (x) { return x.id === tab; })[0];
    return D.ORDER.filter(function (t) { return D.ITEMS[t].source === 'shop' && T.test(t); });
  }

  function build() {
    ui.root = document.getElementById('shop');
    var head = el('header', 'sh-head');
    var title = el('div', 'sh-title');
    title.appendChild(el('p', 'sh-kicker', '구름동산 꾸미기 가게'));
    title.appendChild(el('h2', 'sh-name', '추억 상점'));
    head.appendChild(title);
    ui.tickets = el('p', 'sh-tickets'); ui.tickets.setAttribute('aria-live', 'polite');
    head.appendChild(ui.tickets);
    head.appendChild(btn('sh-exit', '공원으로', function () { close(); }));
    ui.root.appendChild(head);

    ui.tabs = el('nav', 'sh-tabs'); ui.tabs.setAttribute('role', 'tablist');
    ui.tabBtns = {};
    TABS.forEach(function (t) {
      var b = btn('sh-tab', t.name, function () { showTab(t.id); });
      b.setAttribute('role', 'tab'); ui.tabBtns[t.id] = b; ui.tabs.appendChild(b);
    });
    ui.root.appendChild(ui.tabs);
    ui.note = el('p', 'sh-note'); ui.root.appendChild(ui.note);
    ui.grid = el('div', 'sh-grid'); ui.root.appendChild(ui.grid);

    ui.modal = el('div', 'sh-modal'); ui.modal.hidden = true;
    ui.card = el('div', 'sh-card'); ui.card.setAttribute('role', 'dialog'); ui.card.setAttribute('aria-modal', 'true');
    ui.modal.appendChild(ui.card);
    ui.modal.addEventListener('pointerdown', function (e) { if (e.target === ui.modal) closeConfirm(); });
    ui.root.appendChild(ui.modal);
  }

  function open() {
    if (!ui.root) return;
    S.open = true; ui.root.hidden = false;
    document.body.classList.add('shop-open');
    showTab(S.tab);
  }
  function close() {
    S.open = false; closeConfirm();
    ui.root.hidden = true;
    document.body.classList.remove('shop-open');
    if (api() && api().exitShop) api().exitShop();
  }

  function showTickets() { ui.tickets.innerHTML = '🎟 내 티켓 <b>' + tickets() + '</b>장'; }
  function showTab(id) {
    S.tab = id;
    Object.keys(ui.tabBtns).forEach(function (k) { ui.tabBtns[k].classList.toggle('on', k === id); ui.tabBtns[k].setAttribute('aria-selected', String(k === id)); });
    showTickets();
    var now = D.seasonNow();
    ui.note.textContent = id === 'season'
      ? '지금은 ' + D.SEASONS[now] + '이에요! 계절 장식은 그 계절에만 살 수 있어요. 산 장식은 계절이 지나도 언제든 놓을 수 있어요.'
      : '티켓은 건물 미션을 처음 끝내면 받아요. 산 아이템은 구름동산 보관함에 들어가요.';
    ui.grid.textContent = '';
    var list = items(id);
    if (id === 'season') {   // 지금 계절부터
      var start = SEASON_ORDER.indexOf(now);
      list.sort(function (a, b) {
        var sa = (SEASON_ORDER.indexOf(D.ITEMS[a].season) - start + 4) % 4, sb = (SEASON_ORDER.indexOf(D.ITEMS[b].season) - start + 4) % 4;
        return sa - sb;
      });
    }
    var lastSeason = null;
    list.forEach(function (t) {
      var def = D.ITEMS[t];
      if (id === 'season' && def.season !== lastSeason) {
        lastSeason = def.season;
        ui.grid.appendChild(el('p', 'sh-group' + (def.season === now ? ' now' : ''), D.SEASONS[def.season] + (def.season === now ? ' · 지금 살 수 있어요' : '에만 살 수 있어요')));
      }
      ui.grid.appendChild(card(t));
    });
  }
  // 살 수 있는지 → { ok, why }
  function canBuy(t) {
    var def = D.ITEMS[t];
    if (def.season && def.season !== D.seasonNow()) return { ok: false, why: D.SEASONS[def.season] + '에만 살 수 있어요' };
    if (tickets() < def.price) return { ok: false, why: '티켓이 ' + (def.price - tickets()) + '장 모자라요' };
    return { ok: true };
  }
  function card(t) {
    var def = D.ITEMS[t], c = el('div', 'sh-item'), chk = canBuy(t), n = owned(t);
    if (def.season && def.season !== D.seasonNow()) c.classList.add('off-season');
    var pic = el('div', 'sh-pic');
    var im = el('img', ''); im.src = D.BASE + def.icon + '.webp'; im.alt = ''; im.loading = 'lazy'; im.draggable = false;
    pic.appendChild(im); c.appendChild(pic);
    c.appendChild(el('p', 'sh-iname', def.name));
    c.appendChild(el('p', 'sh-price', '🎟 ' + def.price + '장'));
    c.appendChild(el('p', 'sh-own', n ? '가진 것 ' + n + '개' : ' '));
    var b = btn('sh-buy', chk.ok ? '사기' : chk.why, function () { confirmBuy(t); });
    b.disabled = !chk.ok;
    c.appendChild(b);
    return c;
  }
  function confirmBuy(t) {
    var def = D.ITEMS[t], chk = canBuy(t);
    if (!chk.ok || S.busy) return;
    var c = ui.card; c.textContent = '';
    var im = el('img', 'sh-cimg'); im.src = D.BASE + def.icon + '.webp'; im.alt = ''; c.appendChild(im);
    c.appendChild(el('h3', 'sh-ctitle', josa(def.name, '을', '를') + ' 살까요?'));
    c.appendChild(el('p', 'sh-cline', '티켓 ' + def.price + '장을 써요. (남는 티켓 ' + (tickets() - def.price) + '장)'));
    c.appendChild(el('p', 'sh-cline small', '산 아이템은 구름동산 보관함에 들어가요.'));
    var row = el('div', 'sh-acts');
    row.appendChild(btn('sh-btn', '그만둘래', function () { closeConfirm(); }));
    var go = btn('sh-btn primary', '🎟 살게요', function () { buy(t); });
    row.appendChild(go); c.appendChild(row);
    ui.modal.hidden = false;
    setTimeout(function () { go.focus(); }, 30);
  }
  function closeConfirm() { ui.modal.hidden = true; }
  function buy(t) {
    var def = D.ITEMS[t], chk = canBuy(t);
    if (!chk.ok || S.busy) { closeConfirm(); return; }
    S.busy = true;
    var sh = shopSave(), own = Object.assign({}, sh.own || {}), log = Array.isArray(sh.log) ? sh.log.slice(-49) : [];
    own[t] = (+own[t] || 0) + 1;
    log.push({ t: t, p: def.price, at: Date.now() });
    api().patchSave({ tickets: tickets() - def.price, cloudShop: { own: own, log: log } });   // 반 공원이면 반 기록으로 자동 저장
    S.busy = false;
    closeConfirm();
    showTab(S.tab);
    if (api().toast) api().toast(josa(def.name, '을', '를') + ' 샀어요! 구름동산 보관함에 들어갔어요.');
  }
  function onKey(e) {
    if (!S.open || e.code !== 'Escape') return;
    e.preventDefault();
    if (!ui.modal.hidden) closeConfirm(); else close();
  }
  function init() {
    if (!document.getElementById('shop')) return;
    build();
    window.addEventListener('keydown', onKey);
  }
  window.MPShop = { open: open, close: close, _state: S, _debug: { buy: buy, canBuy: canBuy, owned: owned } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
