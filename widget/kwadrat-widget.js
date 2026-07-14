// ===========================================================================
// Kwadrat PL — виджет для Scriptable (iOS). Настоящий виджет на домашнем экране
// без App Store и Apple Developer. Данные берёт с нашего сервера по личному
// виджет-токену (команда /widget в @KwadratPLBot).
//
// Установка:
//   1. Поставьте бесплатное приложение Scriptable из App Store.
//   2. Новый скрипт → вставьте весь этот файл.
//   3. Впишите свой токен в TOKEN ниже (получить: /widget в боте).
//   4. Домашний экран → виджет Scriptable (small или medium) → этот скрипт.
// Поддерживает small, medium и экран блокировки. Тап открывает Mini App.
// Примечание: код намеренно без логического "или" — некоторые iOS-вставки в
// Scriptable теряют этот символ и ломают строку с config.widgetFamily.
// ===========================================================================

const TOKEN = "PASTE_TOKEN_HERE";
const STATE_URL = "https://kwadratpl-46-224-220-94.sslip.io/api/widget/state";

// ── брендовые цвета ──
const BG = new Color("#17212b");
const ACCENT = new Color("#3aaee0");
const WHITE = new Color("#e7edf3");
const MUTED = new Color("#93a4b4");

function zl(n) {
  if (!n && n !== 0) return "";
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " zł";
}

async function fetchState() {
  const req = new Request(STATE_URL);
  req.headers = { Authorization: "Bearer " + TOKEN };
  req.timeoutInterval = 12;
  return await req.loadJSON();
}

function header(w, s) {
  const row = w.addStack();
  row.centerAlignContent();
  const t = row.addText("KWADRAT");
  t.textColor = ACCENT;
  t.font = Font.heavySystemFont(13);
  row.addSpacer();
  const c = row.addText(String(s.matchingListings));
  c.textColor = WHITE;
  c.font = Font.heavySystemFont(17);
}

function build(s) {
  const w = new ListWidget();
  w.backgroundColor = BG;
  w.setPadding(14, 14, 14, 14);
  const fam = config.widgetFamily ? config.widgetFamily : "medium";

  if (!s) {
    const t = w.addText("KWADRAT");
    t.textColor = ACCENT; t.font = Font.heavySystemFont(14);
    w.addSpacer(6);
    const e = w.addText("Нет связи или токен неверный. Обновите /widget в боте.");
    e.textColor = MUTED; e.font = Font.systemFont(11);
    e.lineLimit = 3;
    return w;
  }

  header(w, s);
  w.addSpacer(2);
  const sub = w.addText("подходящих · " + s.newMatching + " новых за сутки");
  sub.textColor = MUTED; sub.font = Font.systemFont(10);

  if (fam !== "small") {
    w.addSpacer(9);
    const all = s.topListings ? s.topListings : [];
    const list = all.slice(0, fam === "large" ? 6 : 3);
    if (list.length === 0) {
      const e = w.addText("Нет подходящих объявлений. Настройте подписку в боте.");
      e.textColor = MUTED; e.font = Font.systemFont(11); e.lineLimit = 2;
    }
    list.forEach(function (l) {
      const row = w.addStack();
      row.centerAlignContent();
      const p = row.addText(zl(l.price));
      p.textColor = WHITE; p.font = Font.mediumSystemFont(12);
      row.addSpacer();
      const place = l.district ? l.district : (l.city ? l.city : "");
      const d = row.addText(place);
      d.textColor = MUTED; d.font = Font.systemFont(12);
      w.addSpacer(4);
    });
  }

  w.addSpacer();
  const ts = s.lastUpdatedAt ? s.lastUpdatedAt : "";
  const upd = ts.replace("T", " ").slice(11, 16);
  const foot = w.addText(upd ? "обновлено " + upd : "Kwadrat PL");
  foot.textColor = MUTED; foot.font = Font.systemFont(9);

  let tapUrl = "https://t.me/KwadratPLBot";
  if (s.botUrl) tapUrl = s.botUrl;
  if (s.openUrl) tapUrl = s.openUrl;
  w.url = tapUrl;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

let state = null;
try { state = await fetchState(); } catch (e) { state = null; }
const widget = build(state);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
