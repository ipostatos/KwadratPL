// Смоук-тест модулей webapp/js/{core,subs,price,ai}.js: грузим их в порядке
// подключения на страницах с минимальными шимами браузера и проверяем, что
// window.App собирается целиком (API-поверхность как у старого app.js) и
// базовая логика жива (демо-фолбэк, matches, persist→syncSubs).
// Гоняется в CI (frontend-джоб) и pre-commit хуком. Запуск: node webapp/_test/check-app.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const js = (f) => readFileSync(join(__dirname, "..", "js", f), "utf-8");

// ── шимы браузера ──
const storage = new Map();
const noopEl = () => ({
  classList: { add() {}, remove() {} }, style: {},
  appendChild() {}, addEventListener() {},
  set innerHTML(v) {}, set onclick(v) {},
});
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  document: {
    addEventListener() {}, getElementById: () => null,
    createElement: noopEl, body: { appendChild() {} },
    hidden: false,
  },
  fetch: () => Promise.reject(new Error("offline")),   // демо-фолбэк везде
  requestAnimationFrame: (fn) => fn(),
  setTimeout, clearTimeout,
  URL,
  I18N: { lang: "ru", t: (k) => k, cityName: (k) => k },
  Date, Math, JSON, Promise, Array, Object, String, Number, Error,
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

let fail = 0;
const ok = (cond, msg) => {
  if (!cond) { console.error("FAIL:", msg); fail = 1; }
};

// ── порядок подключения как в HTML ──
for (const f of ["core.js", "subs.js", "price.js", "explain.js", "ai.js"]) {
  try {
    vm.runInContext(js(f), sandbox, { filename: "js/" + f });
  } catch (e) {
    console.error(`FAIL: js/${f} упал при загрузке:`, e.message);
    process.exit(1);
  }
}
const App = sandbox.App;
ok(App, "window.App создан");

// API-поверхность = экспорт старого app.js (+ tgInitData/_load)
const API = [
  "CITIES", "listings", "ready", "live", "makeListing",
  "saved", "favs", "persist", "getQuiet", "setQuiet",
  "matches", "searchLabel", "districtsFor",
  "toast", "timeAgo", "esc", "safePhotoUrl", "openListingUrl",
  "priceVerdict", "priceBadge", "priceInsight",
  "trustBadges", "moveInCost", "dataQuality", "landlordInfo",
  "explain", "explainData", "profile", "commuteMin", "personalLoc", "fitScore",
  "commuteInfo", "deleteAccount",
  "aiAvailable", "analyzeListing", "mountAiButton",
  "priceUnit", "cityName", "isFav", "toggleFav",
  "tgInitData", "_load",
];
for (const k of API) ok(k in App, `App.${k} отсутствует`);

// демо-фолбэк: fetch недоступен → buildDemo, live=false
await App.ready;
ok(App.live === false, "App.live должен быть false без сети");
ok(App.listings.length > 0, "демо-инвентарь пуст");

// чистая логика
const l = App.listings.find((x) => x.city === "warszawa" && x.type === "long");
ok(App.matches(l, { city: "warszawa", type: "long" }), "matches: базовый случай");
ok(!App.matches(l, { city: "krakow", type: "long" }), "matches: чужой город");
ok(App.matches(l, { city: "warszawa", type: "long", priceMax: l.price }), "matches: priceMax включительно");
ok(typeof App.searchLabel({ city: "warszawa", type: "long", priceMax: 3000 }) === "string", "searchLabel строка");
ok(App.esc("<b>&'") === "&lt;b&gt;&amp;&#39;", "esc экранирует");
ok(App.safePhotoUrl("http://x/") === null, "safePhotoUrl режет http");
ok(App.priceVerdict(l) === null, "priceVerdict null на демо-данных (live=false)");
ok(App.dataQuality({ price: 100 }) === "thin", "dataQuality: пустая карточка = thin");
ok(App.aiAvailable() === false, "AI недоступен вне Telegram");

// Value Score v2 на синтетическом рынке (live=true, свои листинги; до этого
// priceVerdict не звался с live=true — кэш _market ещё не построен)
{
  App.live = true;
  const synth = [];
  for (let i = 0; i < 9; i++) {
    synth.push({ id: "s" + i, city: "warszawa", district: "Wola",
      type: "long", area: 50, price: 3000 + i * 100 });
  }
  const cheap = { id: "cheap", city: "warszawa", district: "Wola",
    type: "long", area: 50, price: 2400 };
  App.listings.length = 0;
  App.listings.push(...synth, cheap);
  const vv = App.priceVerdict(cheap);
  ok(vv && vv.level === "deal", "v2: дешёвое объявление = deal");
  ok(vv.scope === "district", "v2: сравнение по району");
  ok(vv.n === 9, "v2: аналоги считаются без самого объявления");
  ok(vv.betterPct === 100, "v2: все аналоги дороже → выгоднее 100%");
  ok(vv.conf === "B", "v2: район с выборкой 10 и малым разбросом = B");
  ok(typeof vv.mad === "number" && vv.mad > 0, "v2: MAD посчитан");

  // карточка-объяснение (I18N-шим возвращает ключи — проверяем по ключам)
  const ed = App.explainData(cheap);
  ok(ed.strengths.some((x) => x.includes("pvDeal")), "explain: дешёвое → ценовой плюс");
  ok(ed.risks.some((x) => x.includes("exThin")), "explain: пустая карточка → риск thin");
  const bad = { id: "bad", city: "warszawa", district: "Wola", type: "long",
    area: 50, price: 4500, agency: true, ts: Date.now() - 20 * 86400000 };
  const ed2 = App.explainData(bad);
  ok(ed2.status === "check", "explain: дорогое+агентство+старое = статус «проверь»");
  ok(ed2.risks.length >= 3, "explain: дорогое объявление собирает риски");
  ok(App.explain(bad).includes("ex-box"), "explain: рендерит блок");
  ok(App.priceInsight(bad).includes("ex-box"), "explain: встроен в priceInsight");

  // Personal Fit v1: профиль → коммьют и персональная локация
  storage.set("kw_profile", JSON.stringify(
    { work: { label: "W", lat: 52.22, lon: 21.01 }, maxCommute: 30, imp: [2, 1, 0, 0] }));
  ok(App.profile().maxCommute === 30, "profile: читается из kw_profile");
  const near = { id: "near", city: "warszawa", district: "Wola", type: "long",
    area: 50, price: 3300, lat: 52.225, lon: 21.015, locCats: [90, 50, 10, 70] };
  const cmNear = App.commuteMin(near);
  ok(cmNear != null && cmNear <= 15, "commute: рядом с работой ≈ короткий");
  ok(App.personalLoc(near) === 77, "personalLoc: (2·90+1·50)/3 = 77");
  const edN = App.explainData(near);
  ok(edN.strengths.some((x) => x.includes("exCommuteOk")), "explain: близкая работа в плюсах");
  ok(edN.strengths.some((x) => x.includes("exFitGood")), "explain: персональная локация в плюсах");
  const far = { ...near, id: "far", lat: 52.35, lon: 21.2 };
  ok(App.explainData(far).risks.some((x) => x.includes("exCommuteFar")),
    "explain: дальше лимита — в рисках");
  storage.delete("kw_profile");
  ok(App.profile() === null, "profile: null без kw_profile");
  // fitScore: дешёвое с хорошей локацией выше дорогого без неё
  ok(App.fitScore({ ...cheap, locCats: null, locScore: 90 }) >
     App.fitScore(bad), "fitScore: выгодное+локация ранжируется выше");
  App.live = false;   // дальше тесты App.listings не используют
}

// persist → syncSubs (guarded-связка core→subs) не бросает
App.saved.push({ city: "warszawa", type: "long", notify: true });
App.persist();
ok(JSON.parse(storage.get("kw_saved")).length === 1, "persist пишет kw_saved");
ok(App.isFav("nope") === false, "isFav");
App.toggleFav(l);
ok(App.isFav(l.id) === true, "toggleFav добавляет");

if (fail) process.exit(1);
console.log(`app modules OK: App.* целиком (${API.length} ключей), демо-фолбэк, matches, persist.`);
