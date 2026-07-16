// ===========================================================================
// I18N — движок локализации (RU / PL / UA / EN). Сами переводы живут в
// i18n.dict.js (единый словарь) — подключать его ПЕРЕД этим файлом,
// а этот — ПОСЛЕ nav.js и ДО js/core.js. На первом запуске показывает
// экран «Please select your language»; выбор хранится в localStorage kw_lang.
//   I18N.t("key")                    → строка на текущем языке
//   data-i18n="key" + I18N.hydrate() → авто-подстановка текста по атрибуту
//   I18N.picker(true)                → открыть выбор языка повторно
// ===========================================================================
(function (global) {
  "use strict";

  var LANGS = global.KW_I18N.LANGS;
  var CITY_NAMES = global.KW_I18N.CITY_NAMES;
  var D = global.KW_I18N.DICT;

  /* ── текущий язык ── */
  function detectDefault() {
    try {
      var tgLang = window.Telegram && Telegram.WebApp &&
        Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user &&
        Telegram.WebApp.initDataUnsafe.user.language_code;
      var c = (tgLang || navigator.language || "en").slice(0, 2).toLowerCase();
      if (c === "uk") c = "ua";
      if (c === "be") c = "by";
      return D.long[c] ? c : "en";
    } catch (e) { return "en"; }
  }
  var lang = localStorage.getItem("kw_lang");
  var firstRun = !lang;
  if (firstRun) lang = detectDefault();

  function t(key, vars) {
    var row = D[key];
    var s = row ? (row[lang] || row.ru) : key;
    if (vars) for (var k in vars) s = s.split("{" + k + "}").join(vars[k]);
    return s;
  }

  function hydrate(root) {
    (root || document).querySelectorAll("[data-i18n]").forEach(function (el) {
      var s = t(el.getAttribute("data-i18n"));
      // \n в словаре → <br> в вёрстке (подвалы из двух строк)
      if (s.indexOf("\n") >= 0) el.innerHTML = s.split("\n").map(function (p) {
        return p.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; });
      }).join("<br>");
      else el.textContent = s;
    });
    document.documentElement.lang = lang === "ua" ? "uk" : lang === "by" ? "be" : lang;
  }

  /* ── экран выбора языка ── */
  function picker(force) {
    if (!force && !firstRun) return;
    var ov = document.createElement("div");
    ov.className = "lang-overlay";
    ov.innerHTML =
      '<div class="lang-box card">' +
      '<div class="h2" style="text-align:center">Please select your language</div>' +
      '<div class="lang-list">' +
      LANGS.map(function (l) {
        return '<button class="btn' + (l.code === lang ? "" : " ghost") +
          '" data-lang="' + l.code + '">' + l.flag + " " + l.label + "</button>";
      }).join("") +
      "</div></div>";
    document.body.appendChild(ov);
    ov.querySelectorAll("[data-lang]").forEach(function (b) {
      b.onclick = function () {
        localStorage.setItem("kw_lang", b.dataset.lang);
        if (typeof haptic === "function") haptic("select");
        // проще всего перечитать страницу: все динамические списки перерисуются
        location.reload();
      };
    });
  }

  global.I18N = {
    t: t, hydrate: hydrate, picker: picker,
    get lang() { return lang; },
    LANGS: LANGS,
    cityName: function (key) {
      var row = CITY_NAMES[key];
      return row ? (row[lang] || row.ru) : key;
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    hydrate();
    if (firstRun) picker();
  });
})(window);
