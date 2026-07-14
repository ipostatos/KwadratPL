// Проверка целостности словаря и иконок (гоняется в CI, frontend-джоб).
// Ловит частую регрессию: добавили ключ/город, но забыли один из языков.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const KW = require("../i18n.dict.js");
const Icons = require("../icons.js");

const LANGS = ["ru", "pl", "ua", "en"];
const errors = [];

for (const [key, row] of Object.entries(KW.DICT)) {
  if (!row || typeof row !== "object") { errors.push(`DICT.${key}: не объект`); continue; }
  for (const l of LANGS) {
    if (typeof row[l] !== "string" || !row[l].trim()) errors.push(`DICT.${key}: нет/пусто "${l}"`);
  }
}
for (const [k, row] of Object.entries(KW.CITY_NAMES)) {
  for (const l of LANGS) {
    if (typeof row[l] !== "string" || !row[l].trim()) errors.push(`CITY_NAMES.${k}: нет "${l}"`);
  }
}
if (KW.LANGS.map((x) => x.code).join(",") !== LANGS.join(",")) {
  errors.push("LANGS: набор/порядок языков изменился");
}
// иконки, реально используемые в webapp (data-icon=...)
const NEED_ICONS = ["building", "search", "home", "key", "bed", "map-pin", "wallet",
  "bell", "heart", "trending-down", "shield-check", "message-circle", "send", "info",
  "file-text", "calculator", "check-square", "book-open", "paw-print", "trash",
  "moon", "sliders", "coffee", "star"];
for (const n of NEED_ICONS) {
  if (!Icons.svg(n)) errors.push(`icon отсутствует: ${n}`);
}

if (errors.length) {
  console.error("i18n/icons check FAILED:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log(`i18n/icons OK: ${Object.keys(KW.DICT).length} ключей × ${LANGS.length} языка, ` +
  `${Object.keys(KW.CITY_NAMES).length} городов, ${NEED_ICONS.length} иконок.`);
