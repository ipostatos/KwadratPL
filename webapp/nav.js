// Единая навигация Mini App: системная кнопка «Назад» Telegram вместо закрытия окна.
// Паттерн из ISSA Trainer: страницы связаны <a href>, для Telegram это одно
// приложение — BackButton показываем на под-страницах и ведём на главную.
//
// Подключение: <script src="nav.js" data-home="false|true"></script>
(function () {
  "use strict";
  var tg = window.Telegram && window.Telegram.WebApp;

  // Безопасный тактильный отклик (методов может не быть на старых клиентах).
  window.haptic = function (type) {
    try {
      var h = tg && tg.HapticFeedback;
      if (!h) return;
      if (type === "success" || type === "warning" || type === "error") {
        h.notificationOccurred && h.notificationOccurred(type);
      } else if (type === "select") {
        h.selectionChanged && h.selectionChanged();
      } else {
        h.impactOccurred && h.impactOccurred(type || "light");
      }
    } catch (e) {}
  };

  if (!tg) return;
  try { tg.ready(); tg.expand(); } catch (e) {}

  var script = document.currentScript;
  var isHome = script && script.getAttribute("data-home") === "true";

  var bb = tg.BackButton;
  if (!bb) return;

  // Гард от двойного срабатывания onClick + onEvent (приходят оба на части клиентов).
  var _navBusy = false;
  function goBack() {
    if (_navBusy) return;
    _navBusy = true;
    setTimeout(function () { _navBusy = false; }, 0);
    if (typeof window.__navBack === "function") {
      try { if (window.__navBack() === true) return; } catch (e) {}
    }
    window.location.replace("index.html");
  }

  if (isHome) {
    bb.hide();
  } else {
    bb.show();
    try { bb.offClick && bb.offClick(goBack); } catch (e) {}
    bb.onClick(goBack);
    try { tg.onEvent && tg.onEvent("backButtonClicked", goBack); } catch (e) {}
  }
})();
