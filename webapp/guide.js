// ===========================================================================
// GUIDE — рендерер страниц раздела «Полезное».
// Статья = объект по языкам: { ru: {sub, sections:[…]}, pl: …, ua: …, en: … }
// Секция: { h:"заголовок", p:["абзацы (можно html)"], list:["пункты"],
//           num:true (нумерованный список), warn:"плашка-предупреждение",
//           tpl:{label, text} — копируемый блок (шаблон письма) }
// Подключать ПОСЛЕ i18n.js (нужен I18N.lang/t) и icons.js (иконка copy).
// ===========================================================================
(function (global) {
  "use strict";

  function pick(data) { return data[I18N.lang] || data.ru || data.en; }

  function copyText(text, btn) {
    function done() {
      var old = btn.innerHTML;
      btn.innerHTML = "✓ " + I18N.t("copiedT");
      if (typeof haptic === "function") haptic("success");
      setTimeout(function () { btn.innerHTML = old; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacy(); });
    } else { legacy(); }
    function legacy() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  var _tpls = [];
  function renderArticle(boxSel, data) {
    var art = pick(data);
    var box = document.querySelector(boxSel);
    _tpls = [];
    box.innerHTML = art.sections.map(function (sec) {
      var out = '<div class="card gsec">';
      if (sec.h) out += '<div class="h2">' + sec.h + "</div>";
      (sec.p || []).forEach(function (t) { out += '<p class="gp">' + t + "</p>"; });
      if (sec.list) {
        out += "<" + (sec.num ? "ol" : "ul") + ' class="gl">' +
          sec.list.map(function (i) { return "<li>" + i + "</li>"; }).join("") +
          "</" + (sec.num ? "ol" : "ul") + ">";
      }
      if (sec.warn) out += '<div class="gwarn">⚠️ ' + sec.warn + "</div>";
      if (sec.tpl) {
        var idx = _tpls.push(sec.tpl.text) - 1;
        out += '<div class="gtpl"><div class="gtpl-label">' + sec.tpl.label + "</div>" +
          "<pre>" + esc(sec.tpl.text) + "</pre>" +
          '<button class="btn sm" data-copy="' + idx + '"><span class="emi">' +
          Icons.svg("copy") + "</span> " + I18N.t("copyBtn") + "</button></div>";
      }
      return out + "</div>";
    }).join("");
    if (art.sub) {
      var sub = document.querySelector(".sub");
      if (sub) sub.textContent = art.sub;
    }
    box.insertAdjacentHTML("beforeend",
      '<p class="foot">' + I18N.t("disclaimer") + "</p>");
    box.querySelectorAll("[data-copy]").forEach(function (b) {
      b.onclick = function () { copyText(_tpls[+b.dataset.copy], b); };
    });
  }

  global.Guide = { renderArticle: renderArticle, copyText: copyText, pick: pick, esc: esc };
})(window);
