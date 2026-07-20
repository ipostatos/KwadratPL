// ===========================================================================
// APP/price — «справедливая цена» и анти-скам-флаг из собственных данных,
// trust-слой (источник, частник/агентство, полнота, продавец), стоимость
// въезда. Всё на клиенте: данные уже загружены, внешних сервисов ноль.
// Подключать ПОСЛЕ js/core.js (использует App.listings/esc/live/commuteInfo).
// ===========================================================================
(function (global) {
  "use strict";
  var App = global.App;
  var listings = App.listings, esc = App.esc;

  // Считаем медиану цены за м² по группам (город+тип+район, с фолбэком на
  // город+тип). Сравниваем объявление с медианой похожих → вердикт.
  // v2 (Value Score): к медиане добавлены MAD (робастный разброс), число
  // аналогов без самого объявления, перцентиль «выгоднее N% похожих» и буква
  // уверенности A/B/C — район+выборка+разброс. Пороги scam/deal НЕ менялись.
  var MIN_GROUP = 6;          // меньше — медиана шумная, не судим
  var _market = null;         // { "city|type[|district]": {med, mad, arr:[{v,id}]} }

  function median(arr) {
    if (!arr.length) return null;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function ppm(l) {            // цена за м² (нужна площадь и цена)
    return (l.area && l.area > 0 && l.price > 0) ? l.price / l.area : null;
  }

  function buildMarket() {
    var groups = {};
    listings.forEach(function (l) {
      var v = ppm(l);
      if (v == null) return;
      var base = l.city + "|" + l.type;
      (groups[base] = groups[base] || []).push({ v: v, id: l.id });
      if (l.district) {
        var k = base + "|" + l.district;
        (groups[k] = groups[k] || []).push({ v: v, id: l.id });
      }
    });
    _market = {};
    Object.keys(groups).forEach(function (k) {
      var arr = groups[k];
      if (arr.length < MIN_GROUP) return;
      var vals = arr.map(function (x) { return x.v; });
      var med = median(vals);
      var mad = median(vals.map(function (x) { return Math.abs(x - med); }));
      _market[k] = { med: med, mad: mad, arr: arr };
    });
  }

  // вердикт по цене либо null (мало данных / нет площади):
  //   level: "scam" | "deal" | "fair" | "above"
  //   pct: отклонение от медианы (−0.3 = на 30% дешевле)
  //   scope: "district" | "city" — по какой выборке сравнили
  //   n: аналогов (без самого объявления); betterPct: % аналогов дороже;
  //   conf: "A"|"B"|"C" — район ≥20 и разброс ≤30% = A, район = B,
  //         большой город с малым разбросом = B, иначе C
  function priceVerdict(l) {
    if (!App.live) return null;               // на демо-данных смысла нет
    if (_market == null) buildMarket();
    var v = ppm(l);
    if (v == null) return null;
    var base = l.city + "|" + l.type;
    var g, scope;
    if (l.district && _market[base + "|" + l.district]) {
      g = _market[base + "|" + l.district]; scope = "district";
    } else if (_market[base]) {
      g = _market[base]; scope = "city";
    } else return null;
    var med = g.med;
    if (!med) return null;
    var pct = (v - med) / med;
    var level = pct <= -0.40 ? "scam"
      : pct <= -0.12 ? "deal"
      : pct < 0.15 ? "fair" : "above";
    var others = 0, pricier = 0;
    g.arr.forEach(function (x) {
      if (x.id !== l.id) { others++; if (x.v > v) pricier++; }
    });
    var rel = g.mad / med;                    // относительный разброс группы
    var conf = scope === "district"
      ? (g.arr.length >= 20 && rel <= 0.30 ? "A" : "B")
      : (g.arr.length >= 40 && rel <= 0.30 ? "B" : "C");
    return {
      level: level, pct: pct, scope: scope,
      n: others, betterPct: others ? Math.round(100 * pricier / others) : null,
      mad: g.mad, conf: conf,
    };
  }

  // компактный бейдж рядом с ценой (карточка/шторка)
  function priceBadge(l) {
    var v = priceVerdict(l);
    if (!v || v.level === "fair") return "";
    var pct = Math.round(Math.abs(v.pct) * 100);
    if (v.level === "scam")
      return ' <span class="pv scam">⚠ ' + esc(I18N.t("pvScamBadge")) + "</span>";
    if (v.level === "deal")
      return ' <span class="pv deal">↓ ' + esc(I18N.t("pvDeal", { n: pct })) + "</span>";
    return ' <span class="pv above">↑ ' + esc(I18N.t("pvAbove", { n: pct })) + "</span>";
  }

  // полнота карточки объявления (фото/описание/метраж/…) — сигнал доверия,
  // независимый от цены: пустые объявления чаще низкого качества либо скам
  function dataQuality(l) {
    var score = 0;
    if (l.photo) score += 2;
    if (l.descr && l.descr.trim().length >= 30) score += 1.5;
    if (l.area != null) score += 1;
    if (l.floor != null) score += 0.5;
    if (l.district) score += 0.5;
    if (l.agency !== null && l.agency !== undefined) score += 0.5;
    return score <= 2 ? "thin" : null;
  }

  // landlord trust pack: сколько ещё живых объявлений того же продавца
  // (ownerId) и с какого года его аккаунт на OLX. Есть только у OLX —
  // Otodom/Morizon личность продавца на выдаче поиска не отдают.
  function landlordInfo(l) {
    if (!l.ownerId) return null;
    var count = 0;
    for (var i = 0; i < listings.length; i++) {
      if (listings[i].ownerId === l.ownerId) count++;
    }
    return { count: count, since: l.ownerSince || null };
  }

  // ряд trust-чипов: источник, частник/агентство, снижение цены, полнота, продавец, анти-скам
  function trustBadges(l) {
    var chips = [];
    if (l.source) chips.push('<span class="tb src">' + esc(String(l.source)) + "</span>");
    if (l.agency === true) chips.push('<span class="tb agency">' + esc(I18N.t("ownerAgency")) + "</span>");
    else if (l.agency === false) chips.push('<span class="tb private">' + esc(I18N.t("ownerPrivate")) + "</span>");
    if (l.oldPrice && l.price && +l.oldPrice > +l.price)
      chips.push('<span class="tb drop">↓ ' + esc(I18N.t("tbDrop")) + "</span>");
    if (dataQuality(l) === "thin")
      chips.push('<span class="tb thin">' + esc(I18N.t("tbThin")) + "</span>");
    var owner = landlordInfo(l);
    if (owner && owner.count >= 2)
      chips.push('<span class="tb">' + esc(I18N.t("tbRepeat", { n: owner.count })) + "</span>");
    if (owner && owner.since)
      chips.push('<span class="tb">' + esc(I18N.t("tbSince", { year: owner.since })) + "</span>");
    var v = priceVerdict(l);
    if (v && v.level === "scam")
      chips.push('<span class="tb warn">⚠ ' + esc(I18N.t("pvScamBadge")) + "</span>");
    return chips.length ? '<div class="tb-row">' + chips.join("") + "</div>" : "";
  }

  // «сколько нужно на въезд»: аренда + кауция(≈1мес) + комиссия(если агентство).
  // czynsz/media на объявление обычно неизвестны — помечаем как «уточнить».
  function moveInCost(l) {
    var p = +l.price || 0;
    var calc = ' <a href="koszty.html?czynsz=' + encodeURIComponent(p) +
      '" style="color:var(--accent); white-space:nowrap">' + esc(I18N.t("allInBtn")) + " →</a>";
    if (!p || l.type === "short")
      return '<div class="allin">💡 ' + esc(I18N.t("allInNote")) + calc + "</div>";
    var zl = function (n) { return n.toLocaleString() + " zł"; };
    var deposit = p, commission = l.agency === true ? p : 0, total = p + deposit + commission;
    var rows =
      '<div class="mi-row"><span>' + esc(I18N.t("miFirst")) + "</span><b>" + zl(p) + "</b></div>" +
      '<div class="mi-row"><span>' + esc(I18N.t("miDeposit")) + "</span><b>" + zl(deposit) + "</b></div>" +
      (commission ? '<div class="mi-row"><span>' + esc(I18N.t("miCommission")) + "</span><b>" + zl(commission) + "</b></div>" : "") +
      '<div class="mi-row total"><span>' + esc(I18N.t("miTotal")) + "</span><b>≈ " + zl(total) + "</b></div>";
    return '<div class="movein"><div class="mi-h">💰 ' + esc(I18N.t("miTitle")) + "</div>" + rows +
      '<div class="mi-note">' + esc(I18N.t("miNote")) + calc + "</div></div>";
  }

  // блок в шторке: trust-слой + сравнение с рынком + анти-скам + стоимость входа
  function priceInsight(l) {
    var out = trustBadges(l), v = priceVerdict(l);
    if (v && v.level !== "fair") {
      var pct = Math.round(Math.abs(v.pct) * 100);
      var scope = I18N.t(v.scope === "district" ? "pvVsDistrict" : "pvVsCity");
      var cls = v.level === "scam" ? "scam" : v.level;
      var txt = v.level === "above" ? I18N.t("pvAbove", { n: pct }) : I18N.t("pvDeal", { n: pct });
      out += '<div class="pv-line">📊 <span class="em ' + cls + '">' + esc(txt) +
        "</span> · " + esc(scope) + "</div>";
    }
    // Value Score v2: перцентиль по аналогам + размер выборки + уверенность —
    // показываем и для fair-цен (полезно даже без вердикта «выше/ниже рынка»)
    if (v && v.betterPct != null) {
      var valTxt = v.betterPct >= 50
        ? I18N.t("pvBetter", { p: v.betterPct })
        : I18N.t("pvWorse", { p: 100 - v.betterPct });
      out += '<div class="pv-line">⚖️ ' + esc(valTxt) + " · " +
        esc(I18N.t("pvCompsN", { n: v.n })) + " · " +
        esc(I18N.t("pvConf", { c: v.conf })) + "</div>";
    }
    if (v && v.level === "scam") {
      out += '<div class="scam-warn"><span class="ic">🚨</span><div><b>' +
        esc(I18N.t("pvScamTitle")) + "</b>" + esc(I18N.t("pvScamText")) + "</div></div>";
    }
    out += moveInCost(l);
    return out;
  }

  App.priceVerdict = priceVerdict;
  App.priceBadge = priceBadge;
  App.priceInsight = priceInsight;
  App.trustBadges = trustBadges;
  App.moveInCost = moveInCost;
  App.dataQuality = dataQuality;
  App.landlordInfo = landlordInfo;
})(window);
