// ===========================================================================
// APP — общие данные и логика Kwadrat PL: города, инвентарь объявлений,
// сохранённые поиски, избранное, матчинг для уведомлений, тосты.
//
// Инвентарь: реальные объявления с OLX (data/listings.json, собирает
// tools/fetch-olx.py на сервере). Если файл недоступен (file://, сбой сети) —
// фолбэк на демо-генератор с фиксированным сидом. App.live говорит, какой
// режим активен. Страницы ждут App.ready перед первым рендером.
// ===========================================================================
(function (global) {
  "use strict";

  // Полные официальные списки районов (dzielnice) — фолбэк для демо-режима;
  // в живом режиме список районов строится из фактических данных (districtsFor).
  var CITIES = {
    warszawa: { districts: [
      "Śródmieście", "Mokotów", "Wola", "Ochota", "Żoliborz",
      "Praga-Północ", "Praga-Południe", "Targówek", "Bemowo", "Bielany",
      "Białołęka", "Ursynów", "Ursus", "Włochy", "Wilanów",
      "Wawer", "Wesoła", "Rembertów"] },
    krakow:   { districts: [
      "Stare Miasto", "Grzegórzki", "Prądnik Czerwony", "Prądnik Biały", "Krowodrza",
      "Bronowice", "Zwierzyniec", "Dębniki", "Łagiewniki-Borek Fałęcki", "Swoszowice",
      "Podgórze Duchackie", "Bieżanów-Prokocim", "Podgórze", "Czyżyny", "Mistrzejowice",
      "Bieńczyce", "Wzgórza Krzesławickie", "Nowa Huta"] },
    wroclaw:  { districts: [
      "Stare Miasto", "Śródmieście", "Krzyki", "Fabryczna", "Psie Pole"] },
    gdansk:   { districts: [
      "Śródmieście", "Aniołki", "Brętowo", "Brzeźno", "Chełm",
      "Jasień", "Kokoszki", "Krakowiec-Górki Zachodnie", "Letnica", "Matarnia",
      "Młyniska", "Nowy Port", "Oliwa", "Olszynka", "Orunia Górna-Gdańsk Południe",
      "Orunia-Św. Wojciech-Lipce", "Osowa", "Piecki-Migowo", "Przeróbka", "Przymorze Małe",
      "Przymorze Wielkie", "Rudniki", "Siedlce", "Stogi", "Strzyża",
      "Suchanino", "Ujeścisko-Łostowice", "VII Dwór", "Wrzeszcz Dolny", "Wrzeszcz Górny",
      "Wyspa Sobieszewska", "Wzgórze Mickiewicza", "Zaspa-Młyniec", "Zaspa-Rozstaje",
      "Żabianka-Wejhera-Jelitkowo-Tysiąclecia"] },
    poznan:   { districts: [
      "Stare Miasto", "Nowe Miasto", "Wilda", "Grunwald", "Jeżyce"] },
    lodz:     { districts: [
      "Śródmieście", "Bałuty", "Górna", "Polesie", "Widzew"] },
    zakopane: { districts: [
      "Centrum", "Krupówki", "Olcza", "Bystre", "Harenda",
      "Chramcówki", "Kasprusie", "Antałówka", "Pardałówka", "Cyrhla"] },
    bialystok: { districts: [
      "Centrum", "Sienkiewicza", "Bojary", "Piaski", "Przydworcowe",
      "Białostoczek", "Antoniuk", "Wygoda", "Skorupy", "Mickiewicza",
      "Dziesięciny", "Zielone Wzgórza", "Leśna Dolina", "Słoneczny Stok",
      "Starosielce", "Dojlidy", "Bacieczki"] }
  };

  var STREETS = ["ul. Marszałkowska", "ul. Puławska", "ul. Grzybowska", "al. Jana Pawła II",
    "ul. Długa", "ul. Karmelicka", "ul. Piotrkowska", "ul. Świdnicka", "ul. Głogowska", "ul. Grunwaldzka"];
  // ведущие порталы-источники (взвешенно: Otodom и OLX — лидеры рынка)
  var SOURCES = ["Otodom", "Otodom", "OLX", "OLX", "Gratka", "Nieruchomości-online"];
  var ICON_NAMES = ["building", "home", "key", "bed"];
  var GRADS = [
    ["#3a6186", "#89253e"], ["#134e5e", "#71b280"], ["#2c3e50", "#4ca1af"],
    ["#41295a", "#2f0743"], ["#4b6cb7", "#182848"], ["#614385", "#516395"],
    ["#5f2c82", "#49a09d"], ["#1e3c72", "#2a5298"]
  ];

  // mulberry32 — фиксированный сид даёт одинаковый демо-инвентарь при каждой загрузке
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // id с префиксом: демо "d…", runtime-симуляция "r…" — не пересекаются
  // ни между собой, ни с реальными "olx-…" (иначе избранное из прошлой
  // сессии могло пометить чужую карточку)
  var _seq = 1;
  function makeListing(rnd, over, idPrefix) {
    over = over || {};
    var cityKeys = Object.keys(CITIES);
    var city = over.city || cityKeys[Math.floor(rnd() * cityKeys.length)];
    var ds = CITIES[city].districts;
    var type = over.type || (rnd() < 0.8 ? "long" : "short");
    var rooms = type === "room" ? 1 : (over.rooms || 1 + Math.floor(rnd() * 4));
    var area = type === "room"
      ? 10 + Math.floor(rnd() * 15)
      : 22 + rooms * 14 + Math.floor(rnd() * 20);
    var base = type === "long"
      ? 1400 + rooms * 800 + Math.floor(rnd() * 1200)
      : type === "room"
        ? 800 + Math.floor(rnd() * 900)
        : 120 + rooms * 80 + Math.floor(rnd() * 150);
    var drop = rnd() < 0.18 ? Math.round(base * 0.08 / 50) * 50 : 0;
    return {
      id: (idPrefix || "d") + _seq++,
      city: city,
      district: over.district || ds[Math.floor(rnd() * ds.length)],
      type: type, rooms: rooms, area: area,
      price: base, oldPrice: drop ? base + drop : null,
      floor: 1 + Math.floor(rnd() * 9),
      street: STREETS[Math.floor(rnd() * STREETS.length)] + " " + (1 + Math.floor(rnd() * 120)),
      icon: ICON_NAMES[Math.floor(rnd() * ICON_NAMES.length)],
      grad: GRADS[Math.floor(rnd() * GRADS.length)],
      source: over.source || SOURCES[Math.floor(rnd() * SOURCES.length)],
      pets: over.pets != null ? over.pets : rnd() < 0.4,
      parking: over.parking != null ? over.parking : rnd() < 0.35,
      balcony: over.balcony != null ? over.balcony : rnd() < 0.6,
      agency: over.agency != null ? over.agency : rnd() < 0.45,
      ts: Date.now() - Math.floor(rnd() * 5 * 24 * 3600 * 1000)
    };
  }

  // демо-инвентарь: в каждом городе гарантированно есть и долгосрок, и краткосрок
  function buildDemo() {
    var rnd = mulberry32(20260713);
    var fbEnabled = localStorage.getItem("kw_src_fb") === "1";
    var arr = [];
    Object.keys(CITIES).forEach(function (city) {
      // объём пропорционален числу районов, чтобы фильтр по району реже был пустым
      var n = Math.max(10, Math.ceil(CITIES[city].districts.length * 0.8));
      for (var i = 0; i < n; i++) arr.push(makeListing(rnd, { city: city, type: "long" }));
      for (var j = 0; j < 4; j++) arr.push(makeListing(rnd, { city: city, type: "short" }));
      for (var m = 0; m < 5; m++) arr.push(makeListing(rnd, { city: city, type: "room" }));
      // Facebook-группы — демо-источник, выключен по умолчанию (настройки);
      // генерируем ВСЕГДА (сид общий), но включаем в выдачу только по флагу
      for (var k = 0; k < 3; k++) {
        var fb = makeListing(rnd, { city: city, type: "long", source: "Facebook" });
        if (fbEnabled) arr.push(fb);
      }
    });
    return arr;
  }

  // ── инвентарь: реальные данные с фолбэком на демо ──
  var listings = [];
  var ready = fetch("data/listings.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (d) {
      if (!d || !d.listings || !d.listings.length) throw new Error("empty");
      // грады/иконки нужны и реальным карточкам: фон под фото и фолбэк без фото
      var rnd = mulberry32(7);
      d.listings.forEach(function (l) {
        l.icon = ICON_NAMES[Math.floor(rnd() * ICON_NAMES.length)];
        l.grad = GRADS[Math.floor(rnd() * GRADS.length)];
      });
      Array.prototype.push.apply(listings, d.listings);
      App.live = true;
      App.generatedAt = d.generated_at || null;
    })
    .catch(function () {
      Array.prototype.push.apply(listings, buildDemo());
      App.live = false;
    });

  // ── хранилище ──
  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }
  var saved = load("kw_saved", []);   // сохранённые поиски [{city,district,type,priceMin,priceMax,areaMin,rooms,pets,parking,balcony,notify}]
  var favs = load("kw_favs", []);     // избранное — полные объекты объявлений
  function persist() {
    try {
      localStorage.setItem("kw_saved", JSON.stringify(saved));
      localStorage.setItem("kw_favs", JSON.stringify(favs));
    } catch (e) { /* приватный режим / квота — работаем из памяти */ }
    syncSubs();
  }

  // ── серверные подписки: синк с бэкендом (/api/subs, авторизация initData).
  // Вне Telegram или на зеркале без /api — тихо остаёмся на localStorage. ──
  function tgInitData() {
    var tg = window.Telegram && window.Telegram.WebApp;
    return tg && tg.initData ? tg.initData : null;
  }
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

  // ── матчинг объявления под сохранённый поиск ──
  // Для реальных данных pets/parking/balcony бывают null (неизвестно):
  // включённый фильтр пропускает только подтверждённые объявления.
  function matches(l, s) {
    return l.city === s.city && l.type === s.type &&
      (!s.owner || (s.owner === "agency" ? l.agency === true : l.agency !== true)) &&
      (!s.district || l.district === s.district) &&
      (s.priceMin == null || l.price >= s.priceMin) &&
      (s.priceMax == null || l.price <= s.priceMax) &&
      (s.areaMin == null || (l.area != null && l.area >= s.areaMin)) &&
      (!s.rooms || (l.rooms != null && (s.rooms === 4 ? l.rooms >= 4 : l.rooms === s.rooms))) &&
      (!s.pets || l.pets === true) &&
      (!s.parking || l.parking === true) &&
      (!s.balcony || l.balcony === true);
  }

  function searchLabel(s) {
    var parts = [I18N.cityName(s.city)];
    if (s.district) parts.push(s.district);
    parts.push(I18N.t(s.type).toLowerCase());
    if (s.owner) parts.push(I18N.t(s.owner === "agency" ? "ownerAgency" : "ownerPrivate").toLowerCase());
    if (s.rooms) parts.push((s.rooms === 4 ? "4+" : s.rooms) + " " + I18N.t("roomsShort"));
    if (s.priceMax) parts.push(I18N.t("upTo") + " " + s.priceMax + " zł");
    var feat = [];
    if (s.pets) feat.push("🐾");
    if (s.parking) feat.push("🅿️");
    if (s.balcony) feat.push("🌿");
    if (feat.length) parts.push(feat.join(""));
    return parts.join(" · ");
  }

  // районы для дропдауна: в живом режиме — фактические из данных города,
  // в демо — официальный список
  function districtsFor(city) {
    if (!App.live) return CITIES[city].districts;
    var seen = {};
    listings.forEach(function (l) {
      if (l.city === city && l.district) seen[l.district] = 1;
    });
    var ds = Object.keys(seen).sort();
    return ds.length ? ds : CITIES[city].districts;
  }

  // ── тост-уведомление (стиль badge-toast из ISSA) ──
  var _toastTimer = null;
  function toast(emoji, title, text) {
    if (typeof haptic === "function") haptic("success");
    var el = document.getElementById("pushToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "pushToast";
      el.className = "push-toast";
      el.onclick = function () { el.classList.remove("show"); };
      document.body.appendChild(el);
    }
    // title/text бывают собраны из данных объявлений (district и т.п.) — экранируем
    el.innerHTML = '<span class="em">' + emoji + '</span><span class="tt"><b>' +
      esc(title) + "</b>" + esc(text) + "</span>";
    requestAnimationFrame(function () { el.classList.add("show"); });
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { el.classList.remove("show"); }, 5500);
  }

  function timeAgo(ts) {
    var m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return I18N.t("justNow");
    if (m < 60) return I18N.t("minAgo", { n: m });
    if (m < 1440) return I18N.t("hAgo", { n: Math.floor(m / 60) });
    return I18N.t("dAgo", { n: Math.floor(m / 1440) });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // URL фото для inline-style: только https + вырезаем всё, чем можно
  // вырваться из url("...") — кавычки, скобку, бэкслеш, пробелы
  function safePhotoUrl(u) {
    if (typeof u !== "string" || !/^https:\/\//.test(u)) return null;
    return u.replace(/["'\\)\s]/g, "");
  }

  // наружу открываем только http(s) — url приходит из данных объявлений
  // домены объявлений — тот же whitelist, что и на бэкенде (safe_listing_url).
  // Даже если listings.json когда-то подменят/ошибутся, фронт не откроет чужой хост.
  var ALLOWED_HOSTS = ["olx.pl", "otodom.pl", "morizon.pl"];
  function openListingUrl(url) {
    var u = String(url || "");
    if (!/^https:\/\//i.test(u)) return;          // только https
    var host;
    try { host = new URL(u).hostname.toLowerCase(); } catch (e) { return; }
    var ok = ALLOWED_HOSTS.some(function (h) { return host === h || host.endsWith("." + h); });
    if (!ok) return;
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.openLink) tg.openLink(u);
    else window.open(u, "_blank", "noopener");
  }

  // ── AI-разбор объявления (перевод + выжимка + скам) ──
  // Доступен только внутри Telegram (нужен initData) и если бэкенд с ключом.
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
      }).catch(function (e) {
        btn.disabled = false;
        box.innerHTML = '<div class="ai-load">' +
          esc(I18N.t(String(e && e.message) === "limit" ? "aiLimit" : "aiError")) + "</div>";
      });
    };
  }

  // ── «справедливая цена» и анти-скам-флаг из собственных данных ──
  // Считаем медиану цены за м² по группам (город+тип+район, с фолбэком на
  // город+тип). Сравниваем объявление с медианой похожих → вердикт.
  // Всё на клиенте: данные уже загружены, внешних сервисов ноль.
  var MIN_GROUP = 6;          // меньше — медиана шумная, не судим
  var _market = null;         // { "city|type|district": medianPPM, "city|type": ... }

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
      (groups[base] = groups[base] || []).push(v);
      if (l.district) {
        var k = base + "|" + l.district;
        (groups[k] = groups[k] || []).push(v);
      }
    });
    _market = {};
    Object.keys(groups).forEach(function (k) {
      if (groups[k].length >= MIN_GROUP) _market[k] = median(groups[k]);
    });
  }

  // вердикт по цене: {level, pct, scope} либо null (мало данных / нет площади)
  //   level: "scam" | "deal" | "fair" | "above"
  //   pct: отклонение от медианы (−0.3 = на 30% дешевле)
  //   scope: "district" | "city" — по какой выборке сравнили
  function priceVerdict(l) {
    if (!App.live) return null;               // на демо-данных смысла нет
    if (_market == null) buildMarket();
    var v = ppm(l);
    if (v == null) return null;
    var base = l.city + "|" + l.type;
    var med, scope;
    if (l.district && _market[base + "|" + l.district] != null) {
      med = _market[base + "|" + l.district]; scope = "district";
    } else if (_market[base] != null) {
      med = _market[base]; scope = "city";
    } else return null;
    if (!med) return null;
    var pct = (v - med) / med;
    var level = pct <= -0.40 ? "scam"
      : pct <= -0.12 ? "deal"
      : pct < 0.15 ? "fair" : "above";
    return { level: level, pct: pct, scope: scope };
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

  // ряд trust-чипов: источник, частник/агентство, снижение цены, анти-скам
  function trustBadges(l) {
    var chips = [];
    if (l.source) chips.push('<span class="tb src">' + esc(String(l.source)) + "</span>");
    if (l.agency === true) chips.push('<span class="tb agency">' + esc(I18N.t("ownerAgency")) + "</span>");
    else if (l.agency === false) chips.push('<span class="tb private">' + esc(I18N.t("ownerPrivate")) + "</span>");
    if (l.oldPrice && l.price && +l.oldPrice > +l.price)
      chips.push('<span class="tb drop">↓ ' + esc(I18N.t("tbDrop")) + "</span>");
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
    if (v && v.level === "scam") {
      out += '<div class="scam-warn"><span class="ic">🚨</span><div><b>' +
        esc(I18N.t("pvScamTitle")) + "</b>" + esc(I18N.t("pvScamText")) + "</div></div>";
    }
    out += moveInCost(l);
    return out;
  }

  var App = {
    CITIES: CITIES,
    listings: listings,
    ready: ready,
    live: false,          // true после успешной загрузки data/listings.json
    generatedAt: null,
    makeListing: function (over) { return makeListing(Math.random, over, "r"); },
    saved: saved, favs: favs, persist: persist,
    getQuiet: getQuiet, setQuiet: setQuiet,
    matches: matches, searchLabel: searchLabel, districtsFor: districtsFor,
    toast: toast, timeAgo: timeAgo, esc: esc,
    safePhotoUrl: safePhotoUrl, openListingUrl: openListingUrl,
    priceVerdict: priceVerdict, priceBadge: priceBadge, priceInsight: priceInsight,
    trustBadges: trustBadges, moveInCost: moveInCost,
    deleteAccount: deleteAccount,
    aiAvailable: aiAvailable, analyzeListing: analyzeListing, mountAiButton: mountAiButton,
    priceUnit: function (type) { return I18N.t(type === "short" ? "perDay" : "perMonth"); },
    cityName: function (key) { return I18N.cityName(key); },
    isFav: function (id) { return favs.some(function (f) { return f.id === id; }); },
    toggleFav: function (l) {
      var i = favs.findIndex(function (f) { return f.id === l.id; });
      if (i >= 0) favs.splice(i, 1); else favs.push(l);
      persist();
      return i < 0;
    }
  };
  global.App = App;
})(window);
