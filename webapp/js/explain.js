// ===========================================================================
// APP/explain — карточка-объяснение «почему это объявление подходит тебе и
// что с ним не так»: собирает ✅ сильные стороны и ⚠️ что проверить из УЖЕ
// существующих сигналов (Value Score v2, оценка локации, до центра, свежесть,
// снижение цены, частник/агентство, полнота карточки). Ничего не считает
// заново и не ходит в сеть. Принципы из мат-модели: риски не растворяются в
// балле, критический риск (скам) даёт отдельный статус, пропуск данных
// показывается явно, а не молча считается нулём.
// Подключать ПОСЛЕ js/price.js (использует App.priceVerdict/commuteInfo/…).
// ===========================================================================
(function (global) {
  "use strict";
  var App = global.App;
  var esc = App.esc;

  function t(k, vars) { return I18N.t(k, vars); }

  // → { status: "good"|"check"|"critical"|null, strengths: [], risks: [], neutral: str|null }
  function explainData(l) {
    var s = [], r = [], neutral = null;
    var v = App.priceVerdict(l);

    // цена: одна строка, в сильные / в проверить / нейтрально — без дублей
    if (v) {
      var pct = Math.round(Math.abs(v.pct) * 100);
      var tail = v.betterPct != null
        ? " · " + t("pvCompsN", { n: v.n }) + " · " + t("pvConf", { c: v.conf })
        : "";
      if (v.level === "deal" || (v.betterPct != null && v.betterPct >= 60)) {
        s.push((v.level === "deal" ? t("pvDeal", { n: pct }) + " · " : "") +
          (v.betterPct != null ? t("pvBetter", { p: v.betterPct }) : "") + tail);
      } else if (v.level === "above" || (v.betterPct != null && v.betterPct <= 40)) {
        r.push((v.level === "above" ? t("pvAbove", { n: pct }) + " · " : "") +
          (v.betterPct != null ? t("pvWorse", { p: 100 - v.betterPct }) : "") + tail);
      } else if (v.betterPct != null) {
        neutral = "⚖️ " + (v.betterPct >= 50
          ? t("pvBetter", { p: v.betterPct })
          : t("pvWorse", { p: 100 - v.betterPct })) + tail;
      }
    } else if (l.type !== "short" && (l.area == null || !(l.area > 0))) {
      r.push(t("exNoArea"));   // пропуск данных показываем явно
    }

    // локация (locScore есть только у точных координат — см. geo_enrich)
    if (l.locScore != null) {
      if (l.locScore >= 75) s.push(t("exLocGood", { n: l.locScore }));
      else if (l.locScore <= 40) r.push(t("exLocWeak", { n: l.locScore }));
    }

    var c = App.commuteInfo(l);
    if (c && c.min != null && c.min <= 20) s.push(t("exCenter", { n: c.min }));

    if (l.oldPrice && l.price && +l.oldPrice > +l.price) s.push(t("exDrop"));

    if (l.agency === false) s.push(t("exPrivate"));
    else if (l.agency === true) r.push(t("exAgency"));

    if (App.dataQuality(l) === "thin") r.push(t("exThin"));

    var ageDays = l.ts ? Math.floor((Date.now() - l.ts) / 86400000) : null;
    if (ageDays != null && ageDays <= 1) s.push(t("exFresh"));
    else if (ageDays != null && ageDays >= 14) r.push(t("exOld", { n: ageDays }));

    var status = null;
    if (v && v.level === "scam") status = "critical";     // плашка рисует price.js
    else if (r.length === 0 && s.length >= 2) status = "good";
    else if (r.length >= 2) status = "check";
    return { status: status, strengths: s, risks: r, neutral: neutral };
  }

  // HTML-блок для шторки (обе шторки получают через App.priceInsight)
  function explain(l) {
    var d = explainData(l);
    if (!d.strengths.length && !d.risks.length && !d.neutral) return "";
    var out = '<div class="ex-box">';
    if (d.status === "good")
      out += '<div class="ex-status ok">🟢 ' + esc(t("exGoodT")) + "</div>";
    else if (d.status === "check")
      out += '<div class="ex-status warn">🟡 ' + esc(t("exCheckT")) + "</div>";
    if (d.strengths.length) {
      out += '<div class="ex-h ok">✅ ' + esc(t("exStrengthsT")) + "</div><ul class='ex-l'>" +
        d.strengths.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    }
    if (d.risks.length) {
      out += '<div class="ex-h warn">⚠️ ' + esc(t("exRisksT")) + "</div><ul class='ex-l'>" +
        d.risks.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    }
    if (d.neutral) out += '<div class="pv-line">' + esc(d.neutral) + "</div>";
    return out + "</div>";
  }

  App.explain = explain;
  App.explainData = explainData;   // для тестов и будущего Personal Fit
})(window);
