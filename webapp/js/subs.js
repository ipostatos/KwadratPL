// ===========================================================================
// APP/subs — серверные подписки: синк с бэкендом (/api/subs, авторизация
// initData), тихие часы, право на удаление (RODO). Вне Telegram или на
// зеркале без /api — тихо остаёмся на localStorage.
// Подключать ПОСЛЕ js/core.js (использует App.saved/favs/tgInitData/_load).
// ===========================================================================
(function (global) {
  "use strict";
  var App = global.App;
  var saved = App.saved, favs = App.favs;
  var tgInitData = App.tgInitData, load = App._load;

  // право на удаление: стереть серверную учётку (DELETE /api/subs) + локальные данные
  function deleteAccount() {
    var init = tgInitData();
    var wipeLocal = function () {
      try {
        ["kw_saved", "kw_favs", "kw_quiet", "kw_src_fb"].forEach(function (k) {
          localStorage.removeItem(k);
        });
      } catch (e) {}
      saved.length = 0; favs.length = 0;
    };
    if (!init) { wipeLocal(); return Promise.resolve({ local: true }); }
    return fetch("/api/subs", {
      method: "DELETE",
      headers: { "Authorization": "tma " + init }
    }).then(
      function (r) { wipeLocal(); return { deleted: r.ok }; },
      function () { wipeLocal(); return { deleted: false }; }
    );
  }
  var _syncTimer = null;
  var _syncDirty = false;
  function doSync() {
    var init = tgInitData();
    if (!init) return;
    _syncDirty = false;
    fetch("/api/subs", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": "tma " + init },
      keepalive: true,   // переживает уход со страницы/закрытие Mini App
      body: JSON.stringify({
        subs: saved,
        lang: (global.I18N && global.I18N.lang) || "ru",
        quiet: load("kw_quiet", null)
      })
    }).catch(function () {});
  }
  function syncSubs() {
    if (!tgInitData()) return;
    _syncDirty = true;
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(doSync, 400);   // дебаунс: тумблеры щёлкают часто
  }
  // уход со страницы раньше дебаунса терял PUT — удалённая подписка
  // «воскресала» с сервера; keepalive-фьюз досылает немедленно
  ["pagehide", "visibilitychange"].forEach(function (ev) {
    document.addEventListener(ev, function () {
      if (_syncDirty && (ev === "pagehide" || document.hidden)) {
        clearTimeout(_syncTimer);
        doSync();
      }
    });
  });
  function getQuiet() { return load("kw_quiet", null); }
  function setQuiet(q) {          // {from,to} либо null = выключить
    if (q) localStorage.setItem("kw_quiet", JSON.stringify(q));
    else localStorage.removeItem("kw_quiet");
    syncSubs();
  }
  // первый вход на новом устройстве: если локально пусто — тянем с сервера
  (function pullSubs() {
    var init = tgInitData();
    if (!init || saved.length) { if (init && saved.length) syncSubs(); return; }
    fetch("/api/subs", { headers: { "Authorization": "tma " + init } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.subs && d.subs.length) {
          Array.prototype.push.apply(saved, d.subs);
          localStorage.setItem("kw_saved", JSON.stringify(saved));
        }
        if (d && d.quiet && !localStorage.getItem("kw_quiet")) {
          localStorage.setItem("kw_quiet", JSON.stringify(d.quiet));
        }
      })
      .catch(function () {});
  })();

  // ── серверное избранное: id на сервере, объекты — локальный кэш ──────────
  var _favTimer = null;
  function doSyncFavs() {
    var init = tgInitData();
    if (!init) return;
    fetch("/api/favs", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": "tma " + init },
      keepalive: true,
      body: JSON.stringify({ ids: favs.map(function (f) { return String(f.id); }) })
    }).catch(function () {});
  }
  function syncFavs() {
    if (!tgInitData()) return;
    clearTimeout(_favTimer);
    _favTimer = setTimeout(doSyncFavs, 400);
  }
  // старт: мердж серверных id (❤️ из пуша / другое устройство) с локальными
  // объектами; id без объекта гидрируем из живого инвентаря
  (function pullFavs() {
    var init = tgInitData();
    if (!init) return;
    fetch("/api/favs", { headers: { "Authorization": "tma " + init } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ids) return;
        App.ready.then(function () {
          var have = {};
          favs.forEach(function (f) { have[String(f.id)] = 1; });
          var added = 0;
          d.ids.forEach(function (id) {
            if (have[id]) return;
            var l = App.listings.find(function (x) { return String(x.id) === id; });
            if (l) { favs.push(l); added++; }
            // объявление умерло и объекта нигде нет — молча пропускаем
          });
          if (added || d.ids.length !== favs.length) {
            try { localStorage.setItem("kw_favs", JSON.stringify(favs)); } catch (e) {}
            syncFavs();   // локальные, которых нет на сервере — дольём
          }
        });
      })
      .catch(function () {});
  })();

  App.syncSubs = syncSubs;
  App.syncFavs = syncFavs;
  App.getQuiet = getQuiet;
  App.setQuiet = setQuiet;
  App.deleteAccount = deleteAccount;
})(window);
