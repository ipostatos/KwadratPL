// ===========================================================================
// APP — общие данные и логика Kwadrat PL: города, генератор объявлений (демо),
// сохранённые поиски, избранное, матчинг для уведомлений, тосты.
// Инвентарь детерминированный (seeded PRNG), чтобы избранное и ссылки на
// объявления переживали перезагрузку страницы.
// ===========================================================================
(function (global) {
  "use strict";

  // Полные официальные списки районов (dzielnice):
  // Варшава и Краков — по 18, Гданьск — 35, Вроцлав/Познань/Лодзь — по 5.
  var CITIES = {
    warszawa: { name: "Варшава", districts: [
      "Śródmieście", "Mokotów", "Wola", "Ochota", "Żoliborz",
      "Praga-Północ", "Praga-Południe", "Targówek", "Bemowo", "Bielany",
      "Białołęka", "Ursynów", "Ursus", "Włochy", "Wilanów",
      "Wawer", "Wesoła", "Rembertów"] },
    krakow:   { name: "Краков", districts: [
      "Stare Miasto", "Grzegórzki", "Prądnik Czerwony", "Prądnik Biały", "Krowodrza",
      "Bronowice", "Zwierzyniec", "Dębniki", "Łagiewniki-Borek Fałęcki", "Swoszowice",
      "Podgórze Duchackie", "Bieżanów-Prokocim", "Podgórze", "Czyżyny", "Mistrzejowice",
      "Bieńczyce", "Wzgórza Krzesławickie", "Nowa Huta"] },
    wroclaw:  { name: "Вроцлав", districts: [
      "Stare Miasto", "Śródmieście", "Krzyki", "Fabryczna", "Psie Pole"] },
    gdansk:   { name: "Гданьск", districts: [
      "Śródmieście", "Aniołki", "Brętowo", "Brzeźno", "Chełm",
      "Jasień", "Kokoszki", "Krakowiec-Górki Zachodnie", "Letnica", "Matarnia",
      "Młyniska", "Nowy Port", "Oliwa", "Olszynka", "Orunia Górna-Gdańsk Południe",
      "Orunia-Św. Wojciech-Lipce", "Osowa", "Piecki-Migowo", "Przeróbka", "Przymorze Małe",
      "Przymorze Wielkie", "Rudniki", "Siedlce", "Stogi", "Strzyża",
      "Suchanino", "Ujeścisko-Łostowice", "VII Dwór", "Wrzeszcz Dolny", "Wrzeszcz Górny",
      "Wyspa Sobieszewska", "Wzgórze Mickiewicza", "Zaspa-Młyniec", "Zaspa-Rozstaje",
      "Żabianka-Wejhera-Jelitkowo-Tysiąclecia"] },
    poznan:   { name: "Познань", districts: [
      "Stare Miasto", "Nowe Miasto", "Wilda", "Grunwald", "Jeżyce"] },
    lodz:     { name: "Лодзь", districts: [
      "Śródmieście", "Bałuty", "Górna", "Polesie", "Widzew"] }
  };

  var STREETS = ["ul. Marszałkowska", "ul. Puławska", "ul. Grzybowska", "al. Jana Pawła II",
    "ul. Długa", "ul. Karmelicka", "ul. Piotrkowska", "ul. Świdnicka", "ul. Głogowska", "ul. Grunwaldzka"];
  var ICON_NAMES = ["building", "home", "key", "bed"];
  var GRADS = [
    ["#3a6186", "#89253e"], ["#134e5e", "#71b280"], ["#2c3e50", "#4ca1af"],
    ["#41295a", "#2f0743"], ["#4b6cb7", "#182848"], ["#614385", "#516395"],
    ["#5f2c82", "#49a09d"], ["#1e3c72", "#2a5298"]
  ];

  // mulberry32 — фиксированный сид даёт одинаковый инвентарь при каждой загрузке
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var _seq = 1;
  function makeListing(rnd, over) {
    over = over || {};
    var cityKeys = Object.keys(CITIES);
    var city = over.city || cityKeys[Math.floor(rnd() * cityKeys.length)];
    var ds = CITIES[city].districts;
    var rooms = over.rooms || 1 + Math.floor(rnd() * 4);
    var area = 22 + rooms * 14 + Math.floor(rnd() * 20);
    var type = over.type || (rnd() < 0.8 ? "long" : "short");
    var base = type === "long"
      ? 1400 + rooms * 800 + Math.floor(rnd() * 1200)
      : 120 + rooms * 80 + Math.floor(rnd() * 150);
    var drop = rnd() < 0.18 ? Math.round(base * 0.08 / 50) * 50 : 0;
    return {
      id: _seq++,
      city: city,
      district: over.district || ds[Math.floor(rnd() * ds.length)],
      type: type, rooms: rooms, area: area,
      price: base, oldPrice: drop ? base + drop : null,
      floor: 1 + Math.floor(rnd() * 9),
      street: STREETS[Math.floor(rnd() * STREETS.length)] + " " + (1 + Math.floor(rnd() * 120)),
      icon: ICON_NAMES[Math.floor(rnd() * ICON_NAMES.length)],
      grad: GRADS[Math.floor(rnd() * GRADS.length)],
      ts: Date.now() - Math.floor(rnd() * 5 * 24 * 3600 * 1000)
    };
  }

  // базовый инвентарь: в каждом городе гарантированно есть и долгосрок, и краткосрок
  var _rnd = mulberry32(20260713);
  var listings = [];
  Object.keys(CITIES).forEach(function (city) {
    // объём пропорционален числу районов, чтобы фильтр по району реже был пустым
    var n = Math.max(10, Math.ceil(CITIES[city].districts.length * 0.8));
    for (var i = 0; i < n; i++) listings.push(makeListing(_rnd, { city: city, type: "long" }));
    for (var j = 0; j < 4; j++) listings.push(makeListing(_rnd, { city: city, type: "short" }));
  });

  // ── хранилище ──
  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }
  var saved = load("kw_saved", []);   // сохранённые поиски [{city,district,type,priceMin,priceMax,areaMin,rooms,notify}]
  var favs = load("kw_favs", []);     // избранное — полные объекты объявлений
  function persist() {
    localStorage.setItem("kw_saved", JSON.stringify(saved));
    localStorage.setItem("kw_favs", JSON.stringify(favs));
  }

  // ── матчинг объявления под сохранённый поиск ──
  function matches(l, s) {
    return l.city === s.city && l.type === s.type &&
      (!s.district || l.district === s.district) &&
      (s.priceMin == null || l.price >= s.priceMin) &&
      (s.priceMax == null || l.price <= s.priceMax) &&
      (s.areaMin == null || l.area >= s.areaMin) &&
      (!s.rooms || (s.rooms === 4 ? l.rooms >= 4 : l.rooms === s.rooms));
  }

  function searchLabel(s) {
    var parts = [CITIES[s.city].name];
    if (s.district) parts.push(s.district);
    parts.push(s.type === "long" ? "долгосрочная" : "краткосрочная");
    if (s.rooms) parts.push((s.rooms === 4 ? "4+" : s.rooms) + " комн.");
    if (s.priceMax) parts.push("до " + s.priceMax + " zł");
    return parts.join(" · ");
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
    el.innerHTML = '<span class="em">' + emoji + '</span><span class="tt"><b>' +
      title + "</b>" + text + "</span>";
    requestAnimationFrame(function () { el.classList.add("show"); });
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { el.classList.remove("show"); }, 5500);
  }

  function timeAgo(ts) {
    var m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return "только что";
    if (m < 60) return m + " мин назад";
    if (m < 1440) return Math.floor(m / 60) + " ч назад";
    return Math.floor(m / 1440) + " дн назад";
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  global.App = {
    CITIES: CITIES,
    listings: listings,
    makeListing: function (over) { return makeListing(Math.random, over); },
    saved: saved, favs: favs, persist: persist,
    matches: matches, searchLabel: searchLabel,
    toast: toast, timeAgo: timeAgo, esc: esc,
    priceUnit: function (type) { return type === "long" ? "zł/мес" : "zł/сутки"; },
    isFav: function (id) { return favs.some(function (f) { return f.id === id; }); },
    toggleFav: function (l) {
      var i = favs.findIndex(function (f) { return f.id === l.id; });
      if (i >= 0) favs.splice(i, 1); else favs.push(l);
      persist();
      return i < 0;
    }
  };
})(window);
