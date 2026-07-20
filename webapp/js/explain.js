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

  // ── Personal Fit v1: профиль пользователя (kw_profile, только это устройство,
  // на сервер не уходит). {work:{label,lat,lon}, maxCommute: мин|0, imp:[4]} ──
  function profile() {
    var p = App._load("kw_profile", null);
    return p && typeof p === "object" ? p : null;
  }

  function _hav(lat1, lon1, lat2, lon2) {
    var R = 6371000, toR = Math.PI / 180;
    var dp = (lat2 - lat1) * toR, dl = (lon2 - lon1) * toR;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) +
      Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // честная эвристика (НЕ роутинг): прямая × коэффициент кривизны маршрута
  // 1.35, эффективная скорость ОТ по Варшаве ~16 км/ч + 8 мин на выход/ожидание.
  // Только Варшава (профиль и геоохват инструмента), null = посчитать нельзя.
  function commuteMin(l) {
    var p = profile();
    if (!p || !p.work || p.work.lat == null || l.lat == null || l.lon == null ||
        l.city !== "warszawa") return null;
    var km = _hav(l.lat, l.lon, p.work.lat, p.work.lon) / 1000;
    return Math.round(8 + (km * 1.35) / 16 * 60);
  }

  // персональный балл локации: веса важности пользователя (0/1/2) на разбивку
  // locCats = [transport, infra, schools, green] из geo_enrich (§16 мат-модели:
  // w = r / Σr). null = профиль пуст или разбивки нет.
  function personalLoc(l) {
    var p = profile();
    if (!p || !p.imp || !l.locCats || l.locCats.length !== 4) return null;
    var sw = 0, sum = 0;
    for (var i = 0; i < 4; i++) {
      var w = +p.imp[i] || 0;
      sw += w; sum += w * (+l.locCats[i] || 0);
    }
    return sw ? Math.round(sum / sw) : null;
  }

  // → { status: "good"|"check"|"critical"|null, strengths: [], risks: [], neutral: [] }
  function explainData(l) {
    var s = [], r = [], neutral = [];
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
        neutral.push("⚖️ " + (v.betterPct >= 50
          ? t("pvBetter", { p: v.betterPct })
          : t("pvWorse", { p: 100 - v.betterPct })) + tail);
      }
    } else if (l.type !== "short" && (l.area == null || !(l.area > 0))) {
      r.push(t("exNoArea"));   // пропуск данных показываем явно
    }

    // локация: персональный балл (веса профиля), иначе общий locScore
    // (оба есть только у точных координат — см. geo_enrich)
    var pf = personalLoc(l);
    var locShown = pf != null ? pf : l.locScore;
    if (locShown != null) {
      if (locShown >= 75) s.push(t(pf != null ? "exFitGood" : "exLocGood", { n: locShown }));
      else if (locShown <= 40) r.push(t(pf != null ? "exFitWeak" : "exLocWeak", { n: locShown }));
    }

    // до работы (профиль): хорошо в плюсы, за лимитом — в риски, иначе инфо
    var cm = commuteMin(l);
    if (cm != null) {
      var lim = (profile() && +profile().maxCommute) || 0;
      if (lim && cm > lim) r.push(t("exCommuteFar", { n: cm, m: lim }));
      else if (cm <= (lim ? Math.round(lim * 0.6) : 30)) s.push(t("exCommuteOk", { n: cm }));
      else neutral.push("🚌 " + t("exCommuteOk", { n: cm }));
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
    if (!d.strengths.length && !d.risks.length && !d.neutral.length) return "";
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
    d.neutral.forEach(function (x) {
      out += '<div class="pv-line">' + esc(x) + "</div>";
    });
    return out + "</div>";
  }

  App.explain = explain;
  App.explainData = explainData;   // для тестов
  App.profile = profile;
  App.commuteMin = commuteMin;
  App.personalLoc = personalLoc;
})(window);
