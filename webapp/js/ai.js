// ===========================================================================
// APP/ai — AI-разбор объявления (перевод + выжимка + скам-скоринг) через
// backend /api/analyze. Доступен только внутри Telegram (нужен initData)
// и если бэкенд с ключом (/api/health ai:true).
// Подключать ПОСЛЕ js/core.js (использует App.tgInitData/esc/toast).
// ===========================================================================
(function (global) {
  "use strict";
  var App = global.App;
  var tgInitData = App.tgInitData, esc = App.esc, toast = App.toast;

  var _aiEnabled = false;
  (function checkAi() {
    if (!tgInitData()) return;   // вне Telegram кнопку не показываем
    fetch("/api/health").then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { _aiEnabled = !!(d && d.ai); }).catch(function () {});
  })();
  function aiAvailable() { return _aiEnabled && !!tgInitData(); }
  function analyzeListing(l) {
    var init = tgInitData();
    return fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "tma " + init },
      body: JSON.stringify({ listing: l, lang: (global.I18N && global.I18N.lang) || "ru" })
    }).then(function (r) {
      if (r.status === 429) throw new Error("limit");
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  // отправить готовый разбор rich-сообщением в чат (для пересылки друзьям)
  function shareAnalysis(l) {
    var init = tgInitData();
    return fetch("/api/analyze/share", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "tma " + init },
      body: JSON.stringify({ listing: l, lang: (global.I18N && global.I18N.lang) || "ru" })
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  // кнопка «AI-разбор» + рендер результата в контейнер box (общий для шторок)
  function mountAiButton(container, l) {
    if (!aiAvailable()) return;
    var btn = document.createElement("button");
    btn.className = "btn ghost ai-btn";
    btn.innerHTML = esc(I18N.t("aiBtn"));
    var box = document.createElement("div");
    container.appendChild(btn);
    container.appendChild(box);
    btn.onclick = function () {
      btn.disabled = true;
      box.innerHTML = '<div class="ai-load">' + esc(I18N.t("aiLoading")) + "</div>";
      if (typeof haptic === "function") haptic("light");
      analyzeListing(l).then(function (d) {
        btn.style.display = "none";
        var scamCls = d.scam_level === "high" ? "high" : d.scam_level === "medium" ? "medium" : "low";
        var scamTxt = I18N.t(d.scam_level === "high" ? "aiScamHigh" : d.scam_level === "medium" ? "aiScamMed" : "aiScamLow");
        var flags = (d.scam_flags || []).filter(Boolean);
        box.className = "ai-box";
        box.innerHTML =
          (d.title ? '<div class="ai-h">' + esc(d.title) + "</div>" : "") +
          '<div class="ai-h" style="font-size:var(--fs-xs);color:var(--hint);text-transform:uppercase;letter-spacing:.04em">' +
          esc(I18N.t("aiSummary")) + "</div>" +
          "<ul>" + (d.summary || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>" +
          '<div class="ai-scam ' + scamCls + '">' + esc(scamTxt) +
          (flags.length ? '<div class="flags">• ' + flags.map(esc).join("<br>• ") + "</div>" : "") + "</div>";
        // «Поделиться» — отправить разбор в чат для пересылки друзьям
        var share = document.createElement("button");
        share.className = "btn ghost ai-share";
        share.innerHTML = esc(I18N.t("aiShare"));
        box.appendChild(share);
        share.onclick = function () {
          share.disabled = true;
          if (typeof haptic === "function") haptic("light");
          shareAnalysis(l).then(function () {
            toast("✅", I18N.t("aiShared"));
          }).catch(function () {
            share.disabled = false;
            toast("⚠️", I18N.t("aiError"));
          });
        };
      }).catch(function (e) {
        btn.disabled = false;
        box.innerHTML = '<div class="ai-load">' +
          esc(I18N.t(String(e && e.message) === "limit" ? "aiLimit" : "aiError")) + "</div>";
      });
    };
  }

  App.aiAvailable = aiAvailable;
  App.analyzeListing = analyzeListing;
  App.mountAiButton = mountAiButton;
})(window);
