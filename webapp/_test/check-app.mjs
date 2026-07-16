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
for (const f of ["core.js", "subs.js", "price.js", "ai.js"]) {
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

// persist → syncSubs (guarded-связка core→subs) не бросает
App.saved.push({ city: "warszawa", type: "long", notify: true });
App.persist();
ok(JSON.parse(storage.get("kw_saved")).length === 1, "persist пишет kw_saved");
ok(App.isFav("nope") === false, "isFav");
App.toggleFav(l);
ok(App.isFav(l.id) === true, "toggleFav добавляет");

if (fail) process.exit(1);
console.log(`app modules OK: App.* целиком (${API.length} ключей), демо-фолбэк, matches, persist.`);
