// ===========================================================================
// Генератор промо-лендинга Kwadrat PL — статический, 4 языка, single source.
// Названия городов и иконки берутся из ../../webapp (тот же источник, что бот).
// Запуск: node site/_build/generate.mjs  →  пишет site/index.html, site/pl|ua|en,
// robots.txt, sitemap.xml. Контент правится здесь, потом перегенерировать.
// ===========================================================================
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const KW = require("../../webapp/i18n.dict.js");
const Icons = require("../../webapp/icons.js");
const CITY = KW.CITY_NAMES;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..");
// код виджета берём из единого источника — repo/widget/kwadrat-widget.js
const WIDGET_CODE = readFileSync(join(__dirname, "..", "..", "widget", "kwadrat-widget.js"), "utf8");
const BUILD_DATE = new Date().toISOString().slice(0, 10); // дата генерации = дата деплоя

// локализация юзер-видимых строк виджет-кода (исходник widget/ остаётся RU)
const WIDGET_STR = {
  ru: null, // как в исходнике
  ua: {
    "Нет связи или токен неверный. Обновите /widget в боте.": "Немає зв'язку або токен невірний. Оновіть /widget у боті.",
    "подходящих": "відповідних",
    " новых за сутки": " нових за добу",
    "обновлено ": "оновлено ",
  },
  pl: {
    "Нет связи или токен неверный. Обновите /widget в боте.": "Brak połączenia lub błędny token. Odśwież /widget w bocie.",
    "подходящих": "pasujących",
    " новых за сутки": " nowych dzisiaj",
    "обновлено ": "zaktualizowano ",
  },
  en: {
    "Нет связи или токен неверный. Обновите /widget в боте.": "No connection or invalid token. Refresh /widget in the bot.",
    "подходящих": "matching",
    " новых за сутки": " new today",
    "обновлено ": "updated ",
  },
};
// «кто за этим стоит» — трест-строка в футере (E-E-A-T)
const OWNER_LINE = {
  ru: "Независимый проект одного разработчика, не агентство. Вопросы и баги — в чат бота.",
  ua: "Незалежний проєкт одного розробника, не агентство. Питання й баги — у чат бота.",
  pl: "Niezależny projekt jednego dewelopera, nie agencja. Pytania i błędy — na czacie bota.",
  en: "An independent one-developer project, not an agency. Questions and bugs — in the bot chat.",
};
const PRIVACY_LABEL = KW.DICT.privacyLink; // { ru, pl, ua, by, en }

const FRAME = "// " + "=".repeat(75);
const WIDGET_COMMENT = {
  ru: null,
  ua: `${FRAME}
// Kwadrat PL — віджет для Scriptable (iOS). Справжній віджет на домашньому екрані
// без App Store та Apple Developer. Дані бере з нашого сервера за особистим
// віджет-токеном (команда /widget у @KwadratPLBot).
//
// Встановлення:
//   1. Поставте безкоштовний застосунок Scriptable з App Store.
//   2. Новий скрипт → вставте весь цей файл.
//   3. Впишіть свій токен у TOKEN нижче (отримати: /widget у боті).
//   4. Домашній екран → віджет Scriptable (small або medium) → цей скрипт.
// Підтримує small, medium та екран блокування. Тап відкриває Mini App.
${FRAME}`,
  pl: `${FRAME}
// Kwadrat PL — widżet dla Scriptable (iOS). Prawdziwy widżet na ekranie głównym
// bez App Store i Apple Developer. Dane pobiera z naszego serwera przez osobisty
// token widżetu (komenda /widget w @KwadratPLBot).
//
// Instalacja:
//   1. Zainstaluj darmową aplikację Scriptable z App Store.
//   2. Nowy skrypt → wklej cały ten plik.
//   3. Wpisz swój token w TOKEN poniżej (uzyskasz go komendą /widget w bocie).
//   4. Ekran główny → widżet Scriptable (small lub medium) → ten skrypt.
// Obsługuje small, medium i ekran blokady. Dotknięcie otwiera Mini App.
${FRAME}`,
  en: `${FRAME}
// Kwadrat PL — widget for Scriptable (iOS). A real home-screen widget without
// the App Store or an Apple Developer account. Fetches data from our server with
// your personal widget token (the /widget command in @KwadratPLBot).
//
// Install:
//   1. Get the free Scriptable app from the App Store.
//   2. New script → paste this whole file.
//   3. Put your token into TOKEN below (get it with /widget in the bot).
//   4. Home screen → Scriptable widget (small or medium) → this script.
// Supports small, medium and the lock screen. Tap opens the Mini App.
${FRAME}`,
};

function widgetCodeFor(lang) {
  let code = WIDGET_CODE;
  const strs = WIDGET_STR[lang];
  if (strs) for (const [from, to] of Object.entries(strs)) code = code.split(from).join(to);
  const comment = WIDGET_COMMENT[lang];
  if (comment) {
    // заменяем шапку-комментарий (первые подряд идущие //-строки) на локализованную
    code = code.replace(/^(\/\/[^\n]*\n)+/, comment + "\n");
  }
  return code;
}

// ── конфиг ────────────────────────────────────────────────────────────────
const SITE = {
  domain: "https://kwadratpl.pl",
  bot: "https://t.me/KwadratPLBot",
  donate: "https://buymeacoffee.com/ipostatos",
  name: "Kwadrat PL",
  cities: ["warszawa", "krakow", "wroclaw", "gdansk", "poznan", "lodz", "zakopane", "bialystok"],
  // кросс-промо: другие боты автора (описание — в C[lang].botDesc[id])
  bots: [
    { id: "issa", name: "ISSA Trainer", url: "https://t.me/issa_test_bot", emoji: "⛵" },
  ],
};

// стаканчик Buy Me a Coffee для донат-кнопки (инлайн, без внешних ассетов)
const BMC_CUP = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M5.4 4.6h13.2l-.5 2.3H5.9l-.5-2.3Z" fill="#0D0C22"/><path d="M6.4 7.5h11.2l-1.4 11a2.4 2.4 0 0 1-2.38 2.1h-3.64a2.4 2.4 0 0 1-2.38-2.1l-1.4-11Z" fill="#fff" stroke="#0D0C22" stroke-width="1.3" stroke-linejoin="round"/><path d="M7.2 11c1.6.9 3.2-.6 4.8-.1 1.4.4 2.7.4 4.4-.3" stroke="#0D0C22" stroke-width="1.2" stroke-linecap="round"/><path d="M7.6 13.6c1.5.8 3-.5 4.5-.1 1.3.4 2.5.4 4-.2" stroke="#0D0C22" stroke-width="1.2" stroke-linecap="round"/></svg>`;

// порядок = порядок в sitemap; ru — корень и x-default
const LANGS = [
  { code: "ru", path: "", hreflang: "ru", locale: "ru_RU", htmlLang: "ru" },
  { code: "ua", path: "ua/", hreflang: "uk", locale: "uk_UA", htmlLang: "uk" },
  { code: "pl", path: "pl/", hreflang: "pl", locale: "pl_PL", htmlLang: "pl" },
  { code: "en", path: "en/", hreflang: "en", locale: "en_US", htmlLang: "en" },
];

const FEATURE_ICONS = ["search", "bell", "shield-check", "zap", "calculator", "book-open"];

// ── контент по языкам ───────────────────────────────────────────────────────
const C = {
  ru: {
    title: "Аренда жилья в Польше без посредников — бот Kwadrat PL",
    desc: "Поиск аренды квартир и комнат в Польше: OLX, Otodom и Morizon в одном Telegram-боте. Мгновенные уведомления, справедливая цена, AI-разбор. Бесплатно.",
    eyebrow: "Telegram-бот для аренды в Польше",
    h1: "Аренда жилья в Польше: пусть дом найдётся сам",
    lead: "Kwadrat PL собирает свежие объявления с OLX, Otodom и Morizon в один Telegram-бот. Подпишитесь на поиск — новые квартиры и комнаты придут прямо в чат, раньше других.",
    ctaPrimary: "Открыть бота в Telegram",
    ctaNote: "Без регистрации · 5 языков · внутри Telegram",
    donateText: "Kwadrat PL бесплатный и без рекламы. Донаты идут на оплату домена и сервера.",
    donateCta: "Поддержать проект ☕",
    trust: ["Бесплатно", "Прямые объявления, без агентств", "Обновление ~5 минут", "AI-разбор + анти-скам"],
    featuresTitle: "Почему Kwadrat PL",
    features: [
      { t: "Поиск по 3 площадкам сразу", d: "Квартиры, комнаты и посуточно с OLX, Otodom и Morizon. Одинаковые объявления с разных сайтов объединяются — без дублей в ленте." },
      { t: "Мгновенные уведомления", d: "Подпишитесь на свой поиск — новое подходящее жильё приходит в чат за минуты. Тихие часы ночью и пауза командой /off." },
      { t: "Справедливая цена и анти-скам", d: "Бейдж «ниже/выше рынка района» по нашим данным и предупреждение о подозрительно дешёвых объявлениях — типичная приманка мошенников." },
      { t: "AI-разбор объявления", d: "Одна кнопка: перевод объявления на ваш язык, выжимка главного и оценка риска мошенничества по тексту." },
      { t: "Калькулятор заезда", d: "Сколько денег нужно на старте: аренда, czynsz, media, кауция и комиссия — считаем всё сразу, без сюрпризов." },
      { t: "Гайды для арендатора", d: "Как вернуть кауцию (с готовым шаблоном претензии), договор без ловушек, чек-лист осмотра и готовые фразы владельцу по-польски." },
    ],
    stepsTitle: "Как это работает",
    steps: [
      { t: "Откройте бота", d: "Нажмите кнопку и запустите Kwadrat PL в Telegram — приложение откроется прямо в чате." },
      { t: "Настройте поиск", d: "Выберите город, тип аренды, цену и фильтры. Результат обновляется мгновенно." },
      { t: "Получайте новое первыми", d: "Подпишитесь — и свежие объявления будут приходить в чат раньше, чем их разберут." },
    ],
    shotsTitle: "Как это выглядит",
    shotsLead: "Поиск, справедливая цена и полная стоимость входа — всё внутри Telegram.",
    altHome: "Главный экран Kwadrat PL: поиск аренды жилья в 8 городах Польши",
    altCards: "Список квартир на аренду с фото, ценой и бейджем «ниже рынка»",
    altSheet: "Карточка объявления: стоимость входа — аренда и кауция — и источник",
    widgetTitle: "Виджет на домашний экран iPhone",
    widgetLead: "Сколько подходящих квартир и свежие цены — прямо на экране, не открывая Telegram. Через бесплатное приложение Scriptable, без App Store-платежей и аккаунта разработчика.",
    widgetImgAlt: "Виджет Kwadrat PL на домашнем экране iPhone: число подходящих квартир и цены аренды",
    widgetStepsTitle: "Как установить",
    widgetSteps: [
      "Установите бесплатное приложение Scriptable из App Store.",
      "Напишите нашему боту команду /widget — он пришлёт ваш личный токен.",
      "В Scriptable нажмите «+», удалите содержимое и вставьте код виджета (кнопка ниже).",
      "Впишите свой токен в строку TOKEN вместо PASTE_TOKEN_HERE.",
      "Нажмите ▶ внизу — появится превью виджета.",
      "На домашнем экране: долгий тап → «+» → Scriptable → выберите размер → добавьте. Затем долгий тап по виджету → «Изменить виджет» → в поле Script выберите этот скрипт.",
    ],
    widgetCodeShow: "Показать код виджета",
    widgetCopy: "Скопировать код",
    widgetUseTitle: "Как пользоваться",
    widgetUse: [
      "Тап по виджету открывает приложение.",
      "Виджет обновляется по расписанию iOS (примерно раз в 15–30 минут) — это ограничение всех виджетов, не только нашего.",
      "Свежие квартиры всё равно приходят мгновенно обычным уведомлением бота.",
    ],
    citiesTitle: "Города Польши",
    citiesLead: "Аренда квартир и комнат в 8 городах Польши:",
    faqTitle: "Частые вопросы",
    faq: [
      { q: "Это бесплатно?", a: "Да, полностью. Поиск, уведомления, гайды и калькулятор — без платы и без регистрации." },
      { q: "Откуда объявления?", a: "Мы собираем публичные объявления с OLX, Otodom и Morizon и обновляем их каждые несколько минут. Одинаковые лоты с разных сайтов объединяются." },
      { q: "Что такое AI-разбор?", a: "Кнопка в карточке объявления: переводит текст на ваш язык, делает короткую выжимку и оценивает риск мошенничества по описанию." },
      { q: "На каких языках работает?", a: "Русский, украинский, белорусский, польский и английский. Язык переключается прямо в приложении." },
      { q: "Как понять, что цена справедливая?", a: "Бот считает медианную цену за м² по району и типу жилья из своих данных и показывает, насколько объявление дешевле или дороже рынка. Медиана берётся по выборке минимум из 6 объявлений; если по району данных мало, используется медиана по городу. Данные обновляются с каждым обновлением базы." },
      { q: "Нужно ли устанавливать приложение?", a: "Нет. Kwadrat PL работает внутри Telegram как Mini App — ничего ставить не нужно." },
      { q: "Есть ли виджет для iPhone?", a: "Да. Через бесплатное приложение Scriptable можно поставить на домашний экран виджет с числом подходящих квартир и свежими ценами — без App Store-платежей. Пошаговая инструкция выше." },
    ],
    finalTitle: "Пусть дом найдётся!",
    finalLead: "Откройте Kwadrat PL и подпишитесь на свой поиск — новое жильё придёт само.",
    finalCta: "Открыть бота в Telegram",
    otherBotsTitle: "Другие боты автора",
    botDesc: { issa: "Подготовка к лицензии шкипера (ISSA Inshore Skipper), SRC-радио и польским правам — тренажёр с интервальным повторением." },
    footAbout: "Kwadrat PL — поиск аренды жилья в Польше на 5 языках: русский, украинский, белорусский, польский, английский. OLX, Otodom, Morizon в одном боте.",
    footLang: "Язык",
    footRights: "Не является агентством недвижимости. Все объявления принадлежат их источникам.",
  },
  ua: {
    title: "Оренда житла в Польщі без посередників — бот Kwadrat PL",
    desc: "Пошук оренди квартир і кімнат у Польщі: OLX, Otodom і Morizon в одному Telegram-боті. Миттєві сповіщення, справедлива ціна, AI-розбір. Безкоштовно.",
    eyebrow: "Telegram-бот для оренди в Польщі",
    h1: "Оренда житла в Польщі: хай дім знайдеться сам",
    lead: "Kwadrat PL збирає свіжі оголошення з OLX, Otodom і Morizon в один Telegram-бот. Підпишіться на пошук — нові квартири й кімнати надійдуть просто в чат, раніше за інших.",
    ctaPrimary: "Відкрити бота в Telegram",
    ctaNote: "Без реєстрації · 5 мов · всередині Telegram",
    donateText: "Kwadrat PL безкоштовний і без реклами. Донати йдуть на оплату домену та сервера.",
    donateCta: "Підтримати проєкт ☕",
    trust: ["Безкоштовно", "Прямі оголошення, без агентств", "Оновлення ~5 хвилин", "AI-розбір + анти-скам"],
    featuresTitle: "Чому Kwadrat PL",
    features: [
      { t: "Пошук по 3 майданчиках одразу", d: "Квартири, кімнати й подобово з OLX, Otodom і Morizon. Однакові оголошення з різних сайтів об'єднуються — без дублів у стрічці." },
      { t: "Миттєві сповіщення", d: "Підпишіться на свій пошук — нове відповідне житло надходить у чат за хвилини. Тихі години вночі та пауза командою /off." },
      { t: "Справедлива ціна й анти-скам", d: "Бейдж «нижче/вище ринку району» за нашими даними та попередження про підозріло дешеві оголошення — типову приманку шахраїв." },
      { t: "AI-розбір оголошення", d: "Одна кнопка: переклад оголошення вашою мовою, вижимка головного й оцінка ризику шахрайства за текстом." },
      { t: "Калькулятор заїзду", d: "Скільки грошей потрібно на старті: оренда, czynsz, media, кауція та комісія — рахуємо все одразу, без сюрпризів." },
      { t: "Гайди для орендаря", d: "Як повернути кауцію (з готовим шаблоном претензії), договір без пасток, чек-лист огляду та готові фрази власнику польською." },
    ],
    stepsTitle: "Як це працює",
    steps: [
      { t: "Відкрийте бота", d: "Натисніть кнопку й запустіть Kwadrat PL у Telegram — застосунок відкриється просто в чаті." },
      { t: "Налаштуйте пошук", d: "Виберіть місто, тип оренди, ціну та фільтри. Результат оновлюється миттєво." },
      { t: "Отримуйте нове першими", d: "Підпишіться — і свіжі оголошення надходитимуть у чат раніше, ніж їх розберуть." },
    ],
    shotsTitle: "Як це виглядає",
    shotsLead: "Пошук, справедлива ціна й повна вартість входу — усе всередині Telegram.",
    altHome: "Головний екран Kwadrat PL: пошук оренди житла в 8 містах Польщі",
    altCards: "Список квартир на оренду з фото, ціною та бейджем «нижче ринку»",
    altSheet: "Картка оголошення: вартість входу — оренда й кауція — і джерело",
    widgetTitle: "Віджет на домашній екран iPhone",
    widgetLead: "Скільки відповідних квартир і свіжі ціни — просто на екрані, не відкриваючи Telegram. Через безкоштовний застосунок Scriptable, без оплат App Store і акаунта розробника.",
    widgetImgAlt: "Віджет Kwadrat PL на домашньому екрані iPhone: число відповідних квартир і ціни оренди",
    widgetStepsTitle: "Як встановити",
    widgetSteps: [
      "Установіть безкоштовний застосунок Scriptable з App Store.",
      "Напишіть нашому боту команду /widget — він надішле ваш особистий токен.",
      "У Scriptable натисніть «+», видаліть вміст і вставте код віджета (кнопка нижче).",
      "Впишіть свій токен у рядок TOKEN замість PASTE_TOKEN_HERE.",
      "Натисніть ▶ унизу — з'явиться превʼю віджета.",
      "На домашньому екрані: довгий тап → «+» → Scriptable → виберіть розмір → додайте. Потім довгий тап по віджету → «Змінити віджет» → у полі Script виберіть цей скрипт.",
    ],
    widgetCodeShow: "Показати код віджета",
    widgetCopy: "Скопіювати код",
    widgetUseTitle: "Як користуватися",
    widgetUse: [
      "Тап по віджету відкриває застосунок.",
      "Віджет оновлюється за розкладом iOS (приблизно раз на 15–30 хвилин) — це обмеження всіх віджетів, не тільки нашого.",
      "Свіжі квартири все одно приходять миттєво звичайним сповіщенням бота.",
    ],
    citiesTitle: "Міста Польщі",
    citiesLead: "Оренда квартир і кімнат у 8 містах Польщі:",
    faqTitle: "Часті запитання",
    faq: [
      { q: "Це безкоштовно?", a: "Так, повністю. Пошук, сповіщення, гайди та калькулятор — без плати й без реєстрації." },
      { q: "Звідки оголошення?", a: "Ми збираємо публічні оголошення з OLX, Otodom і Morizon та оновлюємо їх кожні кілька хвилин. Однакові лоти з різних сайтів об'єднуються." },
      { q: "Що таке AI-розбір?", a: "Кнопка в картці оголошення: перекладає текст вашою мовою, робить коротку вижимку й оцінює ризик шахрайства за описом." },
      { q: "Якими мовами працює?", a: "Українська, російська, білоруська, польська та англійська. Мова перемикається просто в застосунку." },
      { q: "Як зрозуміти, що ціна справедлива?", a: "Бот рахує медіанну ціну за м² по району й типу житла зі своїх даних і показує, наскільки оголошення дешевше або дорожче за ринок. Медіана береться з вибірки щонайменше з 6 оголошень; якщо по району даних мало, використовується медіана по місту. Дані оновлюються з кожним оновленням бази." },
      { q: "Чи потрібно встановлювати застосунок?", a: "Ні. Kwadrat PL працює всередині Telegram як Mini App — нічого ставити не потрібно." },
      { q: "Чи є віджет для iPhone?", a: "Так. Через безкоштовний застосунок Scriptable можна поставити на домашній екран віджет із числом відповідних квартир і свіжими цінами — без оплат App Store. Покрокова інструкція вище." },
    ],
    finalTitle: "Хай дім знайдеться!",
    finalLead: "Відкрийте Kwadrat PL і підпишіться на свій пошук — нове житло надійде саме.",
    finalCta: "Відкрити бота в Telegram",
    otherBotsTitle: "Інші боти автора",
    botDesc: { issa: "Підготовка до ліцензії шкіпера (ISSA Inshore Skipper), SRC-радіо та польських прав — тренажер з інтервальним повторенням." },
    footAbout: "Kwadrat PL — пошук оренди житла в Польщі 5 мовами: українська, російська, білоруська, польська, англійська. OLX, Otodom, Morizon в одному боті.",
    footLang: "Мова",
    footRights: "Не є агентством нерухомості. Усі оголошення належать їхнім джерелам.",
  },
  pl: {
    title: "Wynajem mieszkań w Polsce bez pośredników — bot Kwadrat PL",
    desc: "Szukaj mieszkań i pokoi na wynajem: OLX, Otodom i Morizon w jednym bocie Telegram. Natychmiastowe powiadomienia, uczciwa cena, analiza AI. Za darmo.",
    eyebrow: "Bot Telegram do wynajmu w Polsce",
    h1: "Wynajem mieszkania w Polsce — niech dom znajdzie się sam",
    lead: "Kwadrat PL zbiera świeże ogłoszenia z OLX, Otodom i Morizon w jednym bocie Telegram. Zasubskrybuj wyszukiwanie — nowe mieszkania i pokoje trafią prosto na czat, szybciej niż do innych.",
    ctaPrimary: "Otwórz bota w Telegramie",
    ctaNote: "Bez rejestracji · 5 języków · w Telegramie",
    donateText: "Kwadrat PL jest darmowy i bez reklam. Wpłaty pokrywają koszty domeny i serwera.",
    donateCta: "Wesprzyj projekt ☕",
    trust: ["Za darmo", "Ogłoszenia wprost, bez agencji", "Odświeżanie ~5 minut", "Analiza AI + anti-scam"],
    featuresTitle: "Dlaczego Kwadrat PL",
    features: [
      { t: "Wyszukiwanie na 3 portalach naraz", d: "Mieszkania, pokoje i noclegi z OLX, Otodom i Morizon. Te same ogłoszenia z różnych serwisów są łączone — bez duplikatów na liście." },
      { t: "Natychmiastowe powiadomienia", d: "Zasubskrybuj swoje wyszukiwanie — nowe pasujące lokum trafia na czat w kilka minut. Cisza nocna i pauza komendą /off." },
      { t: "Uczciwa cena i anti-scam", d: "Znacznik „poniżej/powyżej rynku dzielnicy” z naszych danych i ostrzeżenie o podejrzanie tanich ogłoszeniach — typowej przynęcie oszustów." },
      { t: "Analiza AI ogłoszenia", d: "Jeden przycisk: tłumaczenie ogłoszenia na Twój język, streszczenie najważniejszego i ocena ryzyka oszustwa na podstawie treści." },
      { t: "Kalkulator wprowadzki", d: "Ile pieniędzy potrzeba na start: najem, czynsz, media, kaucja i prowizja — liczymy wszystko naraz, bez niespodzianek." },
      { t: "Poradniki dla najemcy", d: "Jak odzyskać kaucję (z gotowym wzorem wezwania), umowa bez pułapek, checklista oględzin i gotowe wiadomości do właściciela." },
    ],
    stepsTitle: "Jak to działa",
    steps: [
      { t: "Otwórz bota", d: "Kliknij przycisk i uruchom Kwadrat PL w Telegramie — aplikacja otworzy się prosto na czacie." },
      { t: "Ustaw wyszukiwanie", d: "Wybierz miasto, typ najmu, cenę i filtry. Wynik odświeża się natychmiast." },
      { t: "Miej nowe jako pierwszy", d: "Zasubskrybuj — świeże ogłoszenia będą trafiać na czat, zanim inni je rozchwytają." },
    ],
    shotsTitle: "Jak to wygląda",
    shotsLead: "Wyszukiwanie, uczciwa cena i pełny koszt wejścia — wszystko w Telegramie.",
    altHome: "Ekran główny Kwadrat PL: wyszukiwanie wynajmu w 8 miastach w Polsce",
    altCards: "Lista mieszkań na wynajem ze zdjęciem, ceną i znacznikiem „poniżej rynku”",
    altSheet: "Ogłoszenie: koszt wejścia — najem i kaucja — oraz źródło",
    widgetTitle: "Widżet na ekran główny iPhone'a",
    widgetLead: "Ile pasujących mieszkań i świeże ceny — prosto na ekranie, bez otwierania Telegrama. Przez darmową aplikację Scriptable, bez opłat App Store i konta developera.",
    widgetImgAlt: "Widżet Kwadrat PL na ekranie iPhone'a: liczba pasujących mieszkań i ceny najmu",
    widgetStepsTitle: "Jak zainstalować",
    widgetSteps: [
      "Zainstaluj darmową aplikację Scriptable z App Store.",
      "Napisz do naszego bota komendę /widget — odeśle Twój osobisty token.",
      "W Scriptable naciśnij „+”, usuń zawartość i wklej kod widżetu (przycisk poniżej).",
      "Wpisz swój token w linii TOKEN zamiast PASTE_TOKEN_HERE.",
      "Naciśnij ▶ na dole — pojawi się podgląd widżetu.",
      "Na ekranie głównym: przytrzymaj → „+” → Scriptable → wybierz rozmiar → dodaj. Potem przytrzymaj widżet → „Edytuj widżet” → w polu Script wybierz ten skrypt.",
    ],
    widgetCodeShow: "Pokaż kod widżetu",
    widgetCopy: "Skopiuj kod",
    widgetUseTitle: "Jak korzystać",
    widgetUse: [
      "Dotknięcie widżetu otwiera aplikację.",
      "Widżet odświeża się według harmonogramu iOS (mniej więcej co 15–30 minut) — to ograniczenie wszystkich widżetów, nie tylko naszego.",
      "Świeże mieszkania i tak przychodzą natychmiast zwykłym powiadomieniem bota.",
    ],
    citiesTitle: "Miasta w Polsce",
    citiesLead: "Wynajem mieszkań i pokoi w 8 miastach w Polsce:",
    faqTitle: "Najczęstsze pytania",
    faq: [
      { q: "Czy to jest za darmo?", a: "Tak, w pełni. Wyszukiwanie, powiadomienia, poradniki i kalkulator — bez opłat i bez rejestracji." },
      { q: "Skąd pochodzą ogłoszenia?", a: "Zbieramy publiczne ogłoszenia z OLX, Otodom i Morizon i odświeżamy je co kilka minut. Te same oferty z różnych serwisów są łączone." },
      { q: "Czym jest analiza AI?", a: "Przycisk w ogłoszeniu: tłumaczy treść na Twój język, tworzy krótkie streszczenie i ocenia ryzyko oszustwa na podstawie opisu." },
      { q: "W jakich językach działa?", a: "Polski, ukraiński, rosyjski, białoruski i angielski. Język przełączysz bezpośrednio w aplikacji." },
      { q: "Jak poznać, że cena jest uczciwa?", a: "Bot liczy medianę ceny za m² według dzielnicy i typu lokum z własnych danych i pokazuje, o ile ogłoszenie jest tańsze lub droższe od rynku. Mediana liczona jest z próby co najmniej 6 ogłoszeń; gdy danych dla dzielnicy jest mało, używana jest mediana dla miasta. Dane odświeżają się z każdą aktualizacją bazy." },
      { q: "Czy trzeba instalować aplikację?", a: "Nie. Kwadrat PL działa wewnątrz Telegrama jako Mini App — niczego nie instalujesz." },
      { q: "Czy jest widżet na iPhone'a?", a: "Tak. Przez darmową aplikację Scriptable można dodać na ekran główny widżet z liczbą pasujących mieszkań i świeżymi cenami — bez opłat App Store. Instrukcja krok po kroku powyżej." },
    ],
    finalTitle: "Niech dom się znajdzie!",
    finalLead: "Otwórz Kwadrat PL i zasubskrybuj swoje wyszukiwanie — nowe lokum przyjdzie samo.",
    finalCta: "Otwórz bota w Telegramie",
    otherBotsTitle: "Inne boty autora",
    botDesc: { issa: "Przygotowanie do licencji sternika (ISSA Inshore Skipper), radia SRC i polskich patentów — trenażer z powtórkami interwałowymi." },
    footAbout: "Kwadrat PL — wyszukiwanie mieszkań na wynajem w Polsce, 5 języków interfejsu. OLX, Otodom i Morizon w jednym bocie Telegram.",
    footLang: "Język",
    footRights: "To nie jest agencja nieruchomości. Wszystkie ogłoszenia należą do ich źródeł.",
  },
  en: {
    title: "Rent a home in Poland without agents — Kwadrat PL bot",
    desc: "Find flats and rooms for rent in Poland: OLX, Otodom and Morizon in one Telegram bot. Instant alerts, fair-price check, AI breakdown. Free to use.",
    eyebrow: "Telegram bot for renting in Poland",
    h1: "Rent an apartment in Poland — let your home find you",
    lead: "Kwadrat PL gathers fresh listings from OLX, Otodom and Morizon into one Telegram bot. Subscribe to a search and new flats and rooms land right in your chat, before everyone else.",
    ctaPrimary: "Open the bot in Telegram",
    ctaNote: "No sign-up · 5 languages · inside Telegram",
    donateText: "Kwadrat PL is free and ad-free. Donations cover the domain and server costs.",
    donateCta: "Support the project ☕",
    trust: ["Free", "Listings direct, no agencies", "Refreshed ~5 min", "AI breakdown + anti-scam"],
    featuresTitle: "Why Kwadrat PL",
    features: [
      { t: "Search 3 portals at once", d: "Flats, rooms and short stays from OLX, Otodom and Morizon. The same listing across sites is merged — no duplicates in your feed." },
      { t: "Instant alerts", d: "Subscribe to your search and matching homes reach your chat within minutes. Quiet hours at night and pause with /off." },
      { t: "Fair price & anti-scam", d: "A below/above district-market badge from our own data, plus a warning on suspiciously cheap listings — a classic scam bait." },
      { t: "AI listing breakdown", d: "One button: translate the listing into your language, summarise the essentials and score the scam risk from the text." },
      { t: "Move-in calculator", d: "How much cash you need upfront: rent, czynsz, utilities, deposit and agent fee — all counted at once, no surprises." },
      { t: "Renter guides", d: "How to get your deposit back (with a ready demand letter), contract red flags, a viewing checklist and ready Polish messages to the owner." },
    ],
    stepsTitle: "How it works",
    steps: [
      { t: "Open the bot", d: "Tap the button and launch Kwadrat PL in Telegram — the app opens right inside your chat." },
      { t: "Set up a search", d: "Pick a city, rental type, price and filters. Results update instantly." },
      { t: "Get new ones first", d: "Subscribe and fresh listings arrive in your chat before others snap them up." },
    ],
    shotsTitle: "How it looks",
    shotsLead: "Search, fair-price check and the full move-in cost — all inside Telegram.",
    altHome: "Kwadrat PL home screen: searching rentals across 8 cities in Poland",
    altCards: "List of flats for rent with photo, price and a below-market badge",
    altSheet: "Listing card: move-in cost — rent and deposit — and the source",
    widgetTitle: "iPhone home-screen widget",
    widgetLead: "How many matching flats and the latest prices — right on your screen, without opening Telegram. Via the free Scriptable app, no App Store payments and no developer account.",
    widgetImgAlt: "Kwadrat PL widget on an iPhone home screen: number of matching flats and rental prices",
    widgetStepsTitle: "How to install",
    widgetSteps: [
      "Install the free Scriptable app from the App Store.",
      "Message our bot the /widget command — it sends your personal token.",
      "In Scriptable tap “+”, clear the contents and paste the widget code (button below).",
      "Put your token on the TOKEN line, replacing PASTE_TOKEN_HERE.",
      "Tap ▶ at the bottom — a widget preview appears.",
      "On the home screen: long-press → “+” → Scriptable → pick a size → add. Then long-press the widget → “Edit Widget” → in the Script field choose this script.",
    ],
    widgetCodeShow: "Show widget code",
    widgetCopy: "Copy code",
    widgetUseTitle: "How to use it",
    widgetUse: [
      "Tapping the widget opens the app.",
      "The widget refreshes on iOS's schedule (roughly every 15–30 minutes) — a limit of all widgets, not just ours.",
      "Fresh flats still arrive instantly as a normal bot notification.",
    ],
    citiesTitle: "Cities in Poland",
    citiesLead: "Flats and rooms for rent in 8 cities across Poland:",
    faqTitle: "FAQ",
    faq: [
      { q: "Is it free?", a: "Yes, fully. Search, alerts, guides and the calculator — no fees and no sign-up." },
      { q: "Where do listings come from?", a: "We gather public listings from OLX, Otodom and Morizon and refresh them every few minutes. The same offer across sites is merged." },
      { q: "What is the AI breakdown?", a: "A button on each listing: it translates the text into your language, writes a short summary and scores the scam risk from the description." },
      { q: "Which languages are supported?", a: "English, Polish, Ukrainian, Belarusian and Russian. You switch the language right inside the app." },
      { q: "How do I know the price is fair?", a: "The bot computes the median price per m² by district and home type from its own data and shows how far a listing sits below or above the market. The median needs a sample of at least 6 listings; when a district has too little data, the city-wide median is used. Figures refresh with every database update." },
      { q: "Do I need to install an app?", a: "No. Kwadrat PL runs inside Telegram as a Mini App — nothing to install." },
      { q: "Is there an iPhone widget?", a: "Yes. Via the free Scriptable app you can add a home-screen widget showing the number of matching flats and the latest prices — no App Store payments. Step-by-step guide above." },
    ],
    finalTitle: "May your home find you!",
    finalLead: "Open Kwadrat PL and subscribe to your search — the right place will come to you.",
    finalCta: "Open the bot in Telegram",
    otherBotsTitle: "More bots by the author",
    botDesc: { issa: "Prep for the skipper licence (ISSA Inshore Skipper), SRC radio and Polish patents — a spaced-repetition trainer." },
    footAbout: "Kwadrat PL — finding rental homes in Poland, with a 5-language interface. OLX, Otodom and Morizon in one Telegram bot.",
    footLang: "Language",
    footRights: "Not a real-estate agency. All listings belong to their sources.",
  },
};

// ── helpers ────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const url = (path) => SITE.domain + "/" + path;

function altLinks(currentPath) {
  const links = LANGS.map(
    (l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${url(l.path)}">`
  );
  links.push(`<link rel="alternate" hreflang="x-default" href="${url("")}">`);
  return links.join("\n");
}

function jsonLd(lang, meta) {
  const c = C[lang];
  const pageUrl = url(meta.path);
  const graph = [
    {
      // общий @id на 4 языках — без per-page свойств (язык живёт в WebPage)
      "@type": "WebSite",
      "@id": SITE.domain + "/#website",
      url: SITE.domain + "/",
      name: SITE.name,
      publisher: { "@id": SITE.domain + "/#org" },
    },
    {
      "@type": "Organization",
      "@id": SITE.domain + "/#org",
      name: SITE.name,
      url: SITE.domain + "/",
      logo: { "@type": "ImageObject", url: url("icon-512.png"), width: 512, height: 512 },
      sameAs: [SITE.bot],
    },
    {
      "@type": "WebPage",
      "@id": pageUrl + "#webpage",
      url: pageUrl,
      name: c.title,
      description: c.desc,
      inLanguage: meta.hreflang,
      dateModified: BUILD_DATE,
      isPartOf: { "@id": SITE.domain + "/#website" },
    },
    {
      // Mini App = веб-софт в WebView, не нативный бинарь → WebApplication
      "@type": "WebApplication",
      "@id": pageUrl + "#app",
      name: SITE.name,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires the Telegram app (iOS, Android, Desktop or Web)",
      url: pageUrl,
      installUrl: SITE.bot,
      inLanguage: LANGS.map((l) => l.hreflang),
      description: c.desc,
      screenshot: [url("shots/shot-home.webp"), url("shots/shot-cards.webp"),
                   url("shots/shot-sheet.webp"), url("shots/shot-widget.webp")],
      offers: { "@type": "Offer", price: "0", priceCurrency: "PLN" },
    },
    {
      "@type": "FAQPage",
      "@id": pageUrl + "#faq",
      inLanguage: meta.hreflang,
      mainEntity: c.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

function langSwitcher(currentCode) {
  return LANGS.map((l) => {
    const on = l.code === currentCode;
    const label = l.code.toUpperCase();
    return on
      ? `<span class="lang on" aria-current="true">${label}</span>`
      : `<a class="lang" href="${url(l.path)}" hreflang="${l.hreflang}">${label}</a>`;
  }).join("");
}

function icon(name) {
  // svg из общего icons.js, с классом для размера
  return Icons.svg(name).replace("<svg ", '<svg class="ico" aria-hidden="true" ');
}

// ── шаблон страницы ─────────────────────────────────────────────────────────
function page(meta) {
  const lang = meta.code;
  const c = C[lang];
  const canonical = url(meta.path);
  const cities = SITE.cities.map((k) => CITY[k][lang]);

  const featureCards = c.features
    .map((f, i) => {
      // фича "Гайды для арендатора" (индекс 5) ведёт на хаб /guides/ — единственная кликабельная карточка
      const tag = i === 5 ? "a" : "article";
      const href = i === 5 ? ` href="${url(meta.path + "guides/")}"` : "";
      return `
      <${tag} class="card"${href}>
        <div class="ico-wrap">${icon(FEATURE_ICONS[i])}</div>
        <h3>${esc(f.t)}</h3>
        <p>${esc(f.d)}</p>
      </${tag}>`;
    })
    .join("");

  const stepItems = c.steps
    .map(
      (s, i) => `
      <li class="step">
        <div class="step-n">${i + 1}</div>
        <div><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></div>
      </li>`
    )
    .join("");

  const cityChips = SITE.cities
    .map((k) => `<a class="chip" href="${url(meta.path + "cities/" + k + "/")}">${esc(CITY[k][lang])}</a>`)
    .join("");

  const faqItems = c.faq
    .map(
      (f, i) => `
      <details class="faq" id="faq-${i + 1}">
        <summary><span role="heading" aria-level="3">${esc(f.q)}</span></summary>
        <div class="faq-a">${esc(f.a)}</div>
      </details>`
    )
    .join("");

  const trustItems = c.trust.map((tI) => `<span>${esc(tI)}</span>`).join("");

  const ogAlt = LANGS.filter((l) => l.code !== lang)
    .map((l) => `<meta property="og:locale:alternate" content="${l.locale}">`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="${meta.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.desc)}">
<link rel="canonical" href="${canonical}">
<link rel="preload" as="image" href="/logo.webp" fetchpriority="high">
${altLinks(meta.path)}
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#229ED9">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(c.title)}">
<meta property="og:description" content="${esc(c.desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${url("og.png")}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${meta.locale}">
${ogAlt}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(c.title)}">
<meta name="twitter:description" content="${esc(c.desc)}">
<meta name="twitter:image" content="${url("og.png")}">
<script type="application/ld+json">${jsonLd(lang, meta)}</script>
<style>
:root{
  color-scheme:light dark;
  --bg:#F2F2F7; --bg2:#ffffff; --card:#ffffff; --border:rgba(60,60,67,.29);
  --text:#000000; --muted:#6c6c70; --accent:#007AFF; --accent2:#0060df;
  --radius:20px; --radius-sm:14px; --maxw:1040px; --shadow:none;
  --nav-bg:rgba(242,242,247,.78);
}
@media (prefers-color-scheme:dark){
  :root{ --bg:#000000; --bg2:#1c1c1e; --card:#1c1c1e; --border:rgba(84,84,88,.65);
    --text:#ffffff; --muted:#8e8e93; --accent:#0A84FF; --accent2:#409cff;
    --nav-bg:rgba(0,0,0,.72); }
}
*,*::before,*::after{ box-sizing:border-box; -webkit-tap-highlight-color:transparent }
html{ scroll-behavior:smooth; -webkit-text-size-adjust:100% }
body{ margin:0; background:var(--bg); color:var(--text); line-height:1.5;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji";
  -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility }
a{ color:inherit; text-decoration:none }
h1,h2,h3{ line-height:1.14; text-wrap:balance; margin:0; letter-spacing:-.022em }
p{ margin:0 }
.wrap{ max-width:var(--maxw); margin:0 auto; padding:0 20px }
.ico{ width:22px; height:22px; stroke-width:1.75 }

/* header — переведён под iOS nav bar: сильный blur + системная подложка */
.top{ position:sticky; top:0; z-index:10; background:var(--nav-bg);
  backdrop-filter:saturate(180%) blur(20px); -webkit-backdrop-filter:saturate(180%) blur(20px);
  border-bottom:.5px solid var(--border) }
.top .wrap{ display:flex; align-items:center; gap:16px; height:56px }
.brand{ display:flex; align-items:center; gap:9px; font-weight:700; font-size:17px; letter-spacing:-.01em }
.brand .mark{ width:32px; height:32px; border-radius:9px; display:inline-block; object-fit:contain }
.langs{ margin-left:auto; display:flex; gap:2px; background:var(--bg); padding:2px; border-radius:9px }
.lang{ font-size:13px; font-weight:600; color:var(--muted); padding:5px 9px; border-radius:7px;
  display:inline-flex; align-items:center; justify-content:center; min-height:30px; min-width:34px; transition:background .15s ease,color .15s ease }
.lang:hover{ color:var(--text) }
.lang.on{ color:var(--text); background:var(--card); box-shadow:0 1px 2.5px rgba(0,0,0,.13), 0 0 0 .5px rgba(0,0,0,.03) }
@media (prefers-color-scheme:dark){ .lang.on{ box-shadow:0 1px 2.5px rgba(0,0,0,.45) } }
.top .cta{ display:none }
@media(min-width:720px){ .top .cta{ display:inline-flex } }

/* buttons — капсулой, как в App Store/iOS-CTA; :active вместо hover-lift */
.btn{ display:inline-flex; align-items:center; gap:8px; font-weight:590; font-size:17px;
  padding:13px 24px; border-radius:999px; background:var(--accent); color:#fff;
  transition:transform .12s ease, opacity .12s ease; white-space:nowrap; -webkit-tap-highlight-color:transparent }
.btn:hover{ background:var(--accent2) }
.btn:active{ transform:scale(.96); opacity:.85 }
.btn svg{ width:19px; height:19px }
.btn.sm{ font-size:14px; padding:9px 16px }
.btn.ghost{ background:var(--bg2); color:var(--accent); border:.5px solid var(--border) }
.btn.ghost:hover{ background:var(--card) }

/* hero */
.hero{ text-align:center; padding:56px 0 40px }
.hero-logo{ width:112px; height:112px; display:block; margin:0 auto 22px;
  filter:drop-shadow(0 10px 30px rgba(0,122,255,.25)) }
.eyebrow{ display:inline-block; font-size:13px; font-weight:600; letter-spacing:.02em;
  color:var(--accent); background:color-mix(in srgb,var(--accent) 12%,transparent);
  padding:6px 13px; border-radius:999px; margin-bottom:20px }
.hero h1{ font-size:clamp(30px,5.2vw,48px); font-weight:800; letter-spacing:-.025em }
.hero .lead{ max-width:620px; margin:20px auto 0; font-size:clamp(16px,2.2vw,19px); color:var(--muted) }
.hero .actions{ margin-top:30px; display:flex; flex-direction:column; align-items:center; gap:12px }
.hero .note{ font-size:13px; color:var(--muted) }
.trust{ display:flex; flex-wrap:wrap; justify-content:center; gap:8px 10px; margin-top:34px }
.trust span{ font-size:13px; font-weight:590; color:var(--muted); background:var(--bg2);
  border:.5px solid var(--border); padding:7px 13px; border-radius:999px }

/* sections */
section{ padding:52px 0 }
.sec-h{ text-align:center; font-size:clamp(22px,3.2vw,30px); font-weight:750; letter-spacing:-.018em; margin-bottom:8px }
.sec-lead{ text-align:center; color:var(--muted); max-width:560px; margin:0 auto 34px }
.alt{ background:var(--bg2) }

/* features — карточки в стиле iOS-виджета: плоские, radius-sm, hairline-бордер */
.grid{ display:grid; grid-template-columns:1fr; gap:12px }
@media(min-width:600px){ .grid{ grid-template-columns:1fr 1fr } }
@media(min-width:900px){ .grid{ grid-template-columns:1fr 1fr 1fr } }
.card{ display:block; background:var(--card); border:.5px solid var(--border); border-radius:var(--radius-sm);
  padding:20px; box-shadow:var(--shadow); transition:transform .12s ease, opacity .12s ease }
a.card:active{ transform:scale(.98); opacity:.8 }
.ico-wrap{ display:inline-flex; width:40px; height:40px; border-radius:10px; align-items:center; justify-content:center;
  color:var(--accent); background:color-mix(in srgb,var(--accent) 12%,transparent); margin-bottom:14px }
.card h3{ font-size:16px; font-weight:600; margin-bottom:5px; letter-spacing:-.012em }
.card p{ font-size:14px; color:var(--muted); line-height:1.45 }

/* steps */
.steps{ list-style:none; padding:0; margin:0; display:grid; gap:12px; max-width:720px; margin:0 auto }
@media(min-width:760px){ .steps{ grid-template-columns:1fr 1fr 1fr } }
.step{ display:flex; gap:14px; align-items:flex-start; background:var(--card);
  border:.5px solid var(--border); border-radius:var(--radius-sm); padding:18px }
.step-n{ flex:none; width:30px; height:30px; border-radius:9px; font-weight:700; color:#fff;
  background:linear-gradient(135deg,var(--accent),var(--accent2)); display:flex; align-items:center; justify-content:center }
.step h3{ font-size:16px; font-weight:600; margin-bottom:4px }
.step p{ font-size:14px; color:var(--muted) }

/* cities — чипы-капсулы, как теги в iOS */
.chips{ display:flex; flex-wrap:wrap; justify-content:center; gap:9px }
.chip{ display:inline-flex; font-weight:590; font-size:15px; background:var(--card); border:.5px solid var(--border);
  padding:9px 17px; border-radius:999px; transition:transform .12s ease, opacity .12s ease }
a.chip:active{ transform:scale(.96); opacity:.75 }

/* screenshots */
.shots{ display:flex; gap:18px; justify-content:center; flex-wrap:wrap }
.shot{ margin:0; flex:0 1 240px; max-width:250px }
.shot img{ width:100%; height:auto; display:block; border-radius:20px;
  border:.5px solid var(--border); box-shadow:var(--shadow); background:var(--card) }

/* widget */
.widget-sec{ display:flex; gap:32px; align-items:center; flex-wrap:wrap; justify-content:center }
.widget-txt{ flex:1 1 300px; max-width:460px }
.widget-txt .sec-h{ text-align:left }
.widget-lead{ color:var(--muted); margin:12px 0 18px }
.wsteps{ margin:0; padding-left:22px; display:grid; gap:9px; font-size:15px }
.wsteps li{ padding-left:3px }
.widget-img{ flex:0 1 440px; margin:0; max-width:100% }
.widget-img img{ width:100%; height:auto; display:block; border-radius:20px; box-shadow:var(--shadow) }
.widget-guide{ max-width:720px; margin:28px auto 0 }
.wg-h{ font-size:18px; font-weight:750; margin:22px 0 10px }
.wuse{ margin:0; padding-left:20px; display:grid; gap:8px; color:var(--muted); font-size:15px }
.wcode{ margin-top:6px; background:var(--card); border:.5px solid var(--border); border-radius:var(--radius-sm); overflow:hidden }
.wcode summary{ cursor:pointer; padding:14px 18px; font-weight:590; color:var(--accent); list-style:none }
.wcode summary::-webkit-details-marker{ display:none }
.wcode-inner{ position:relative; border-top:.5px solid var(--border) }
.wcopy{ position:absolute; top:10px; right:10px; z-index:1; font-size:12px; font-weight:600;
  padding:6px 12px; border-radius:8px; border:.5px solid var(--border); background:var(--bg2);
  color:var(--text); cursor:pointer }
.wcode pre{ margin:0; padding:16px; overflow-x:auto; background:transparent }
.wcode code{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12.5px;
  line-height:1.5; color:var(--text); white-space:pre }

/* faq — грид-список Settings-стиля: единый контейнер, разделители, шеврон вместо +/– */
.faq-list{ max-width:720px; margin:0 auto; background:var(--card); border:.5px solid var(--border);
  border-radius:var(--radius-sm); overflow:hidden }
.faq{ border-bottom:.5px solid var(--border) }
.faq:last-child{ border-bottom:0 }
.faq summary{ cursor:pointer; padding:15px 18px; font-weight:590; font-size:15.5px; list-style:none;
  display:flex; justify-content:space-between; align-items:center; gap:12px }
.faq summary::-webkit-details-marker{ display:none }
.faq summary::after{ content:""; flex:none; width:9px; height:9px; margin-right:2px;
  border-right:1.6px solid var(--muted); border-bottom:1.6px solid var(--muted);
  transform:rotate(-45deg); transition:transform .18s ease }
.faq[open] summary::after{ transform:rotate(45deg) }
.faq-a{ padding:0 18px 16px; color:var(--muted); font-size:14.5px }

/* final cta */
.final{ text-align:center }
.final .box{ background:linear-gradient(135deg,var(--accent),var(--accent2)); color:#fff;
  border-radius:var(--radius); padding:48px 28px }
.final h2{ font-size:clamp(24px,4vw,34px); font-weight:750; color:#fff }
.final p{ max-width:520px; margin:12px auto 26px; color:rgba(255,255,255,.92) }
.final .btn{ background:#fff; color:var(--accent2) }
.final .btn:hover{ background:#f0f6fa }

/* other bots */
.bots{ display:grid; gap:10px; max-width:720px; margin:0 auto }
.bot-card{ display:flex; align-items:center; gap:16px; background:var(--card);
  border:.5px solid var(--border); border-radius:var(--radius-sm); padding:16px 18px;
  box-shadow:var(--shadow); transition:transform .12s ease, opacity .12s ease; color:inherit }
.bot-card:active{ transform:scale(.98); opacity:.8 }
.bot-emoji{ font-size:30px; flex:0 0 auto; line-height:1 }
.bot-body{ flex:1; display:flex; flex-direction:column; gap:3px; min-width:0 }
.bot-name{ font-weight:600; font-size:16px }
.bot-desc{ color:var(--muted); font-size:13.5px }
.bot-arrow{ color:var(--muted); font-size:18px; flex:0 0 auto }

/* donate */
.donate .d-box{ max-width:720px; margin:0 auto; background:var(--card); border:.5px solid var(--border);
  border-radius:var(--radius-sm); padding:20px 24px; display:flex; flex-wrap:wrap; align-items:center;
  justify-content:center; text-align:center; gap:10px 18px }
.donate p{ color:var(--muted); font-size:14.5px; margin:0 }
.donate .d-h{ flex-basis:100%; font-size:16px; font-weight:600 }
.btn.bmc{ background:#FFDD00; color:#0D0C22 }
.btn.bmc:hover{ background:#ffd400 }

/* footer */
footer{ border-top:.5px solid var(--border); padding:40px 0; margin-top:20px }
.foot-grid{ display:flex; flex-wrap:wrap; gap:24px; justify-content:space-between; align-items:flex-start }
.foot-about{ max-width:420px; color:var(--muted); font-size:13.5px }
.foot-about .brand{ margin-bottom:10px; color:var(--text) }
.foot-langs{ display:flex; gap:2px; flex-wrap:wrap; background:var(--bg); padding:2px; border-radius:9px; width:fit-content }
.foot-langs .lang{ border:0 }
.foot-legal{ margin-top:26px; color:var(--muted); font-size:12.5px; border-top:.5px solid var(--border); padding-top:18px }
</style>
</head>
<body>

<header class="top">
  <div class="wrap">
    <a class="brand" href="${url(meta.path)}" aria-label="${esc(SITE.name)}">
      <img class="mark" src="/logo.webp" alt="" width="34" height="34"> ${esc(SITE.name)}
    </a>
    <nav class="langs" aria-label="${esc(c.footLang)}">${langSwitcher(lang)}</nav>
    <a class="btn sm cta" href="${SITE.bot}" rel="noopener">${Icons.svg("send")} Telegram</a>
  </div>
</header>

<main>
  <section class="hero">
    <div class="wrap">
      <img class="hero-logo" src="/logo.webp" alt="${esc(SITE.name)}" width="112" height="112" fetchpriority="high">
      <span class="eyebrow">${esc(c.eyebrow)}</span>
      <h1>${esc(c.h1)}</h1>
      <p class="lead">${esc(c.lead)}</p>
      <div class="actions">
        <a class="btn" href="${SITE.bot}" rel="noopener">${Icons.svg("send")} ${esc(c.ctaPrimary)}</a>
        <span class="note">${esc(c.ctaNote)}</span>
      </div>
      <div class="trust">${trustItems}</div>
    </div>
  </section>

  <section class="alt">
    <div class="wrap">
      <h2 class="sec-h">${esc(c.featuresTitle)}</h2>
      <div class="grid">${featureCards}</div>
    </div>
  </section>

  <section>
    <div class="wrap">
      <h2 class="sec-h">${esc(c.stepsTitle)}</h2>
      <ol class="steps">${stepItems}</ol>
    </div>
  </section>

  <section class="alt">
    <div class="wrap">
      <h2 class="sec-h">${esc(c.shotsTitle)}</h2>
      <p class="sec-lead">${esc(c.shotsLead)}</p>
      <div class="shots">
        <figure class="shot"><img src="/shots/shot-home.webp" width="400" height="870" loading="lazy" alt="${esc(c.altHome)}"></figure>
        <figure class="shot"><img src="/shots/shot-cards.webp" width="400" height="870" loading="lazy" alt="${esc(c.altCards)}"></figure>
        <figure class="shot"><img src="/shots/shot-sheet.webp" width="385" height="700" loading="lazy" alt="${esc(c.altSheet)}"></figure>
      </div>
    </div>
  </section>

  <section>
    <div class="wrap">
      <div class="widget-sec">
        <div class="widget-txt">
          <h2 class="sec-h">${esc(c.widgetTitle)}</h2>
          <p class="widget-lead">${esc(c.widgetLead)}</p>
        </div>
        <figure class="widget-img"><img src="/shots/shot-widget.webp" width="520" height="420" loading="lazy" alt="${esc(c.widgetImgAlt)}"></figure>
      </div>
      <div class="widget-guide">
        <h3 class="wg-h">${esc(c.widgetStepsTitle)}</h3>
        <ol class="wsteps">${c.widgetSteps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
        <details class="wcode">
          <summary>${esc(c.widgetCodeShow)}</summary>
          <div class="wcode-inner">
            <button type="button" class="wcopy" onclick="navigator.clipboard.writeText(this.nextElementSibling.innerText); this.textContent='✓'">${esc(c.widgetCopy)}</button>
            <pre><code>${esc(widgetCodeFor(lang))}</code></pre>
          </div>
        </details>
        <h3 class="wg-h">${esc(c.widgetUseTitle)}</h3>
        <ul class="wuse">${c.widgetUse.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>
      </div>
    </div>
  </section>

  <section class="alt">
    <div class="wrap">
      <h2 class="sec-h">${esc(c.citiesTitle)}</h2>
      <p class="sec-lead">${esc(c.citiesLead)}</p>
      <div class="chips">${cityChips}</div>
    </div>
  </section>

  <section>
    <div class="wrap">
      <h2 class="sec-h">${esc(c.faqTitle)}</h2>
      <div class="faq-list">${faqItems}</div>
    </div>
  </section>

  <section class="final">
    <div class="wrap">
      <div class="box">
        <h2>${esc(c.finalTitle)}</h2>
        <p>${esc(c.finalLead)}</p>
        <a class="btn" href="${SITE.bot}" rel="noopener">${Icons.svg("send")} ${esc(c.finalCta)}</a>
      </div>
    </div>
  </section>
${SITE.bots && SITE.bots.length ? `
  <section class="alt">
    <div class="wrap">
      <h2 class="sec-h">${esc(c.otherBotsTitle)}</h2>
      <div class="bots">
${SITE.bots.map((b) => `        <a class="bot-card" href="${b.url}" target="_blank" rel="noopener">
          <span class="bot-emoji">${b.emoji}</span>
          <span class="bot-body">
            <span class="bot-name">${esc(b.name)}</span>
            <span class="bot-desc">${esc((c.botDesc && c.botDesc[b.id]) || "")}</span>
          </span>
          <span class="bot-arrow" aria-hidden="true">→</span>
        </a>`).join("\n")}
      </div>
    </div>
  </section>` : ""}
${SITE.donate ? `
  <section class="donate">
    <div class="wrap">
      <div class="d-box">
        <h2 class="d-h">${esc(c.donateCta.replace("☕", "").trim())}</h2>
        <p>${esc(c.donateText)}</p>
        <a class="btn sm bmc" href="${SITE.donate}" target="_blank" rel="noopener">${BMC_CUP} ${esc(c.donateCta.replace("☕", "").trim())}</a>
      </div>
    </div>
  </section>` : ""}
</main>

<footer>
  <div class="wrap">
    <div class="foot-grid">
      <div class="foot-about">
        <div class="brand"><img class="mark" src="/logo.webp" alt="" width="34" height="34"> ${esc(SITE.name)}</div>
        <p>${esc(c.footAbout)}</p>
        <p style="margin-top:8px">${esc(OWNER_LINE[lang])}</p>
      </div>
      <div>
        <div style="font-weight:700;margin-bottom:10px">${esc(c.footLang)}</div>
        <div class="foot-langs">${langSwitcher(lang)}</div>
      </div>
    </div>
    <div class="foot-legal">© ${esc(SITE.name)} · ${esc(c.footRights)} · <a href="${url(meta.path + "privacy/")}" style="color:var(--accent)">${esc(PRIVACY_LABEL[lang])}</a>${SITE.donate ? ` · <a href="${SITE.donate}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(c.donateCta)}</a>` : ""}</div>
  </div>
</footer>

</body>
</html>
`;
}

// ── sitemap + robots ─────────────────────────────────────────────────────────
function sitemap() {
  // (suffix, priority, changefreq) — главная и privacy, каждая своей hreflang-группой
  const groups = [
    { suffix: "", priority: (m) => (m.code === "ru" ? "1.0" : "0.9"), changefreq: "daily" },
    { suffix: "privacy/", priority: () => "0.3", changefreq: "monthly" },
    { suffix: "guides/", priority: () => "0.6", changefreq: "monthly" },
    ...GUIDES.map((g) => ({ suffix: `guides/${g.slug}/`, priority: () => "0.7", changefreq: "monthly" })),
    ...SITE.cities.map((c) => ({ suffix: `cities/${c}/`, priority: () => "0.7", changefreq: "weekly" })),
  ];
  const items = groups.flatMap((g) =>
    LANGS.map((meta) => {
      const alts = LANGS.map(
        (l) => `    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${url(l.path + g.suffix)}"/>`
      ).join("\n");
      const xdef = `    <xhtml:link rel="alternate" hreflang="x-default" href="${url(g.suffix)}"/>`;
      return `  <url>
    <loc>${url(meta.path + g.suffix)}</loc>
    <lastmod>${BUILD_DATE}</lastmod>
${alts}
${xdef}
    <changefreq>${g.changefreq}</changefreq>
    <priority>${g.priority(meta)}</priority>
  </url>`;
    })
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${items}
</urlset>
`;
}

// ── privacy-страница (тексты — single source из webapp/privacy.html) ─────────
const PRIV = (() => {
  const html = readFileSync(join(__dirname, "..", "..", "webapp", "privacy.html"), "utf8");
  const m = html.match(/var P = (\{[\s\S]*?\n\});/);
  if (!m) throw new Error("PRIV: не нашёл объект P в webapp/privacy.html");
  return new Function("return " + m[1])();
})();

function privacyPage(meta) {
  const lang = meta.code;
  const p = PRIV[lang];
  const c = C[lang];
  const title = `${PRIVACY_LABEL[lang]} — ${SITE.name}`;
  const canonical = url(meta.path + "privacy/");
  const alts = LANGS.map(
    (l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${url(l.path + "privacy/")}">`
  ).join("\n") + `\n<link rel="alternate" hreflang="x-default" href="${url("privacy/")}">`;
  const sections = p.sections.map((s) => `
    <h2>${esc(s.h)}</h2>
    ${s.p ? s.p.map((t) => `<p>${t}</p>`).join("\n    ") : ""}
    ${s.list ? `<ul>${s.list.map((t) => `<li>${t}</li>`).join("")}</ul>` : ""}`).join("\n");
  const ld = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": canonical + "#webpage",
    url: canonical,
    name: title,
    inLanguage: meta.hreflang,
    dateModified: BUILD_DATE,
    isPartOf: { "@id": SITE.domain + "/#website" },
  });
  return `<!DOCTYPE html>
<html lang="${meta.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(p.sub)}">
<link rel="canonical" href="${canonical}">
${alts}
<meta name="robots" content="index, follow">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<script type="application/ld+json">${ld}</script>
<style>
:root{ color-scheme:light dark; --bg:#F2F2F7; --card:#ffffff; --text:#000000; --muted:#6c6c70; --accent:#007AFF; --border:rgba(60,60,67,.29) }
@media (prefers-color-scheme:dark){ :root{ --bg:#000000; --card:#1c1c1e; --text:#ffffff; --muted:#8e8e93; --accent:#0A84FF; --border:rgba(84,84,88,.65) } }
*{ box-sizing:border-box; -webkit-tap-highlight-color:transparent }
body{ margin:0; background:var(--bg); color:var(--text); line-height:1.55;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif }
main{ max-width:720px; margin:0 auto; padding:40px 20px 60px }
h1{ font-size:clamp(26px,4.5vw,34px); line-height:1.14; letter-spacing:-.022em; margin:0 0 10px; font-weight:750 }
.sub{ color:var(--muted); margin:0 0 28px }
h2{ font-size:19px; font-weight:600; letter-spacing:-.015em; margin:28px 0 8px }
ul{ margin:0; padding-left:22px }
li{ margin:6px 0 }
p{ margin:8px 0 }
a{ color:var(--accent); text-decoration:none }
.back{ display:inline-block; margin-top:32px; font-weight:590 }
.upd{ color:var(--muted); font-size:13px; margin-top:24px }
</style>
</head>
<body>
<main>
  <h1>${esc(PRIVACY_LABEL[lang])}</h1>
  <p class="sub">${esc(p.sub)}</p>
${sections}
  <p>${esc(p.contact)}<a href="${SITE.bot}" rel="noopener">@KwadratPLBot</a></p>
  <p class="upd">${esc(p.updated)}</p>
  <a class="back" href="${url(meta.path)}">← ${esc(SITE.name)}</a>
</main>
</body>
</html>
`;
}

// ── гайды (single source: webapp/*.html, var GUIDE / GROUPS / PHRASES / L10N) ──
// Извлекаем инлайн-<script> каждой страницы «Полезное» и выполняем в песочнице
// vm — так тексты живут только в webapp/, а сайт их просто зеркалит (как P выше).
function runPageScript(file) {
  const html = readFileSync(join(__dirname, "..", "..", "webapp", file), "utf8");
  const m = html.match(/<script>\n"use strict";\n([\s\S]*?)\n<\/script>/);
  if (!m) throw new Error(`guide: не нашёл инлайн <script> в webapp/${file}`);
  const sandbox = {
    console,
    URLSearchParams,
    location: { search: "" },
    navigator: {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: {
      title: "",
      getElementById() { return { style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} } }; },
      querySelectorAll() { return []; },
      querySelector() { return { classList: { add() {}, toggle() {}, remove() {} } }; },
    },
    I18N: { lang: "ru", t: () => "", hydrate() {} },
    Icons: { svg: () => "", hydrate() {} },
    Guide: { renderArticle() {}, copyText() {}, esc: (s) => String(s), pick: (d) => d.ru },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox);
  return sandbox;
}

const GSRC = {
  kaucja: runPageScript("kaucja.html"),
  umowa: runPageScript("umowa.html"),
  najem: runPageScript("najem.html"),
  checklist: runPageScript("checklist.html"),
  phrases: runPageScript("phrases.html"),
  koszty: runPageScript("koszty.html"),
};

// сайт поддерживает 4 языка (без 'by' — см. LANGS); pick() берёт то, что есть
function pickLang(data, lang) { return (data && (data[lang] || data.ru)) || {}; }

const GUIDES = [
  { slug: "kaucja", icon: "wallet", type: "article", dictKey: "cellKaucjaT",
    seo: {
      ru: { title: "Как вернуть кауцию за квартиру в Польше — гайд и шаблон претензии",
        desc: "Что говорит закон о kaucja, как задокументировать состояние квартиры, что считается нормальным износом и как составить wezwanie do zapłaty, если депозит не возвращают." },
      pl: { title: "Jak odzyskać kaucję za mieszkanie — poradnik i wzór wezwania",
        desc: "Co mówi ustawa o kaucji, jak udokumentować stan mieszkania, co to normalne zużycie i jak napisać wezwanie do zapłaty, gdy właściciel nie oddaje kaucji." },
      ua: { title: "Як повернути кауцію за квартиру в Польщі — гайд і шаблон претензії",
        desc: "Що каже закон про kaucja, як задокументувати стан квартири, що вважається нормальним зносом і як скласти wezwanie do zapłaty, якщо депозит не повертають." },
      en: { title: "How to get your deposit back in Poland — guide + demand letter template",
        desc: "Poland's kaucja law: documenting the flat's condition, what counts as normal wear, and how to write a wezwanie do zapłaty if the deposit isn't returned." },
    } },
  { slug: "umowa", icon: "file-text", type: "article", dictKey: "cellUmowaT",
    seo: {
      ru: { title: "Договор аренды в Польше: на что смотреть, red flags",
        desc: "Разбор договора найма: обязательные пункты, за что реально отвечает арендатор, типичные ловушки владельцев и что проверить перед подписью." },
      pl: { title: "Umowa najmu mieszkania — na co zwrócić uwagę, czerwone flagi",
        desc: "Przewodnik po umowie najmu: obowiązkowe zapisy, za co faktycznie odpowiada najemca, typowe pułapki wynajmujących i co sprawdzić przed podpisem." },
      ua: { title: "Договір оренди квартири в Польщі: на що дивитися, red flags",
        desc: "Розбір договору найму: обов'язкові пункти, за що реально відповідає орендар, типові пастки власників і що перевірити перед підписом." },
      en: { title: "Poland rental contract guide: what to check, red flags",
        desc: "A walkthrough of a Polish lease: mandatory clauses, what tenants are actually liable for, common landlord traps, and what to check before signing." },
    } },
  { slug: "najem", icon: "shield-check", type: "article", dictKey: "cellNajemT",
    seo: {
      ru: { title: "Najem okazjonalny и meldunek: что нужно знать арендатору в Польше",
        desc: "Чем najem okazjonalny отличается от обычного договора, зачем нужен meldunek и karta pobytu, какие вопросы задать владельцу перед арендой." },
      pl: { title: "Najem okazjonalny i meldunek — co musi wiedzieć najemca",
        desc: "Czym różni się najem okazjonalny od zwykłego, po co jest zameldowanie i karta pobytu, jakie pytania zadać wynajmującemu przed najmem." },
      ua: { title: "Najem okazjonalny і meldunek: що треба знати орендарю в Польщі",
        desc: "Чим najem okazjonalny відрізняється від звичайного договору, навіщо потрібен meldunek і karta pobytu, які питання поставити власнику." },
      en: { title: "Najem okazjonalny & meldunek in Poland: a tenant's guide",
        desc: "How najem okazjonalny differs from a standard lease, why meldunek and karta pobytu matter, and what to ask the landlord before renting." },
    } },
  { slug: "checklist", icon: "check-square", type: "checklist", dictKey: "cellCheckT",
    seo: {
      ru: { title: "Чек-лист осмотра квартиры перед арендой в Польше (29 пунктов)",
        desc: "Интерактивный чек-лист: что проверить на просмотре — документы, стены и сантехника, электрика, отопление, район. Прогресс сохраняется в браузере." },
      pl: { title: "Checklista oględzin mieszkania przed najmem (29 punktów)",
        desc: "Interaktywna checklista: co sprawdzić podczas oglądania — dokumenty, ściany i hydraulika, elektryka, ogrzewanie, okolica. Postęp zapisuje się w przeglądarce." },
      ua: { title: "Чек-лист огляду квартири перед орендою в Польщі (29 пунктів)",
        desc: "Інтерактивний чек-лист: що перевірити на огляді — документи, стіни й сантехніка, електрика, опалення, район. Прогрес зберігається в браузері." },
      en: { title: "Poland flat-viewing checklist (29 points)",
        desc: "An interactive checklist for viewings: documents, walls and plumbing, electrics, heating, the neighbourhood. Progress is saved in your browser." },
    } },
  { slug: "phrases", icon: "message-circle", type: "phrases", dictKey: "cellPhrasesT",
    seo: {
      ru: { title: "Фразы по-польски для переписки с владельцем квартиры",
        desc: "8 готовых сообщений на польском: отклик на объявление, вопросы перед просмотром, торг, жалоба на поломку, уведомление о выезде. Копируйте и отправляйте." },
      pl: { title: "Gotowe wiadomości do właściciela mieszkania",
        desc: "8 gotowych wiadomości: odpowiedź na ogłoszenie, pytania przed oglądaniem, negocjacja ceny, zgłoszenie usterki, wypowiedzenie umowy. Skopiuj i wyślij." },
      ua: { title: "Фрази польською для листування з власником квартири",
        desc: "8 готових повідомлень польською: відгук на оголошення, питання перед оглядом, торг, скарга на поломку, повідомлення про виїзд. Копіюйте й надсилайте." },
      en: { title: "Ready-made Polish messages to a landlord",
        desc: "8 ready messages in Polish: replying to a listing, questions before a viewing, price negotiation, reporting a fault, a move-out notice. Copy and send." },
    } },
  { slug: "koszty", icon: "calculator", type: "koszty", dictKey: "cellKosztyT",
    seo: {
      ru: { title: "Калькулятор аренды: сколько нужно денег на заезд в Польше",
        desc: "Реальная стоимость аренды: czynsz, administracyjny, media, кауция и комиссия агента — сколько нужно при заезде и сколько выходит в месяц." },
      pl: { title: "Kalkulator wprowadzki — ile pieniędzy potrzeba na start",
        desc: "Realny koszt najmu: czynsz, czynsz administracyjny, media, kaucja i prowizja pośrednika — ile potrzeba na wprowadzkę i ile wychodzi miesięcznie." },
      ua: { title: "Калькулятор оренди: скільки грошей треба на заїзд у Польщі",
        desc: "Реальна вартість оренди: czynsz, administracyjny, media, кауція та комісія агента — скільки треба при заїзді і скільки виходить на місяць." },
      en: { title: "Poland move-in cost calculator",
        desc: "The real cost of renting: rent, building fee, utilities, deposit and agent's fee — how much cash you need up front and the true monthly cost." },
    } },
];

const GUIDES_HUB = {
  ru: { title: "Гайды для арендатора жилья в Польше — Kwadrat PL",
    desc: "Бесплатные гайды: кауция, договор аренды, najem okazjonalny, чек-лист осмотра, фразы для владельца, калькулятор заезда.",
    h1: "Гайды для арендатора", lead: "6 бесплатных гайдов от Kwadrat PL — то, что реально пригождается при съёме жилья в Польше." },
  pl: { title: "Poradniki dla najemcy w Polsce — Kwadrat PL",
    desc: "Darmowe poradniki: kaucja, umowa najmu, najem okazjonalny, checklista oględzin, gotowe wiadomości, kalkulator wprowadzki.",
    h1: "Poradniki dla najemcy", lead: "6 darmowych poradników od Kwadrat PL — to, co naprawdę przydaje się przy wynajmie mieszkania w Polsce." },
  ua: { title: "Гайди для орендаря житла в Польщі — Kwadrat PL",
    desc: "Безкоштовні гайди: кауція, договір оренди, najem okazjonalny, чек-лист огляду, фрази для власника, калькулятор заїзду.",
    h1: "Гайди для орендаря", lead: "6 безкоштовних гайдів від Kwadrat PL — те, що реально стає в пригоді при оренді житла в Польщі." },
  en: { title: "Renter's guides for Poland — Kwadrat PL",
    desc: "Free guides: deposit, rental contract, najem okazjonalny, viewing checklist, landlord messages, move-in calculator.",
    h1: "Renter's guides", lead: "6 free guides from Kwadrat PL — the stuff that actually helps when renting a flat in Poland." },
};

// ── города: локатив ("в Варшаве"/"w Warszawie") + маркетинговый лид + FAQ ────
const CITY_IN = {
  warszawa:  { ru: "в Варшаве",    pl: "w Warszawie",   ua: "у Варшаві",   en: "in Warsaw" },
  krakow:    { ru: "в Кракове",    pl: "w Krakowie",    ua: "у Кракові",   en: "in Kraków" },
  wroclaw:   { ru: "во Вроцлаве",  pl: "we Wrocławiu",  ua: "у Вроцлаві",  en: "in Wrocław" },
  gdansk:    { ru: "в Гданьске",   pl: "w Gdańsku",     ua: "у Гданську",  en: "in Gdańsk" },
  poznan:    { ru: "в Познани",    pl: "w Poznaniu",    ua: "у Познані",   en: "in Poznań" },
  lodz:      { ru: "в Лодзи",      pl: "w Łodzi",       ua: "у Лодзі",     en: "in Łódź" },
  zakopane:  { ru: "в Закопане",   pl: "w Zakopanem",   ua: "у Закопане",  en: "in Zakopane" },
  bialystok: { ru: "в Белостоке",  pl: "w Białymstoku", ua: "у Білостоку", en: "in Białystok" },
};

const CITY_LEAD = {
  warszawa: {
    ru: "Варшава — столица и крупнейший рынок аренды в Польше: сюда едут работать в корпорациях, IT и на международных проектах, а Мокотув и Воля забиты офисами. Здесь самый широкий выбор квартир и комнат, но и самые высокие цены — особенно в Śródmieście. Правобережная Прага и спальные районы вроде Bemowo и Ursynów дешевле при похожих 20–30 минутах до центра метро или трамваем.",
    pl: "Warszawa to stolica i największy rynek najmu w Polsce: przyciąga pracą w korporacjach, IT i projektach międzynarodowych, a Mokotów i Wola są pełne biur. Tu największy wybór mieszkań i pokoi, ale i najwyższe ceny — zwłaszcza w Śródmieściu. Prawobrzeżna Praga i dzielnice sypialniane jak Bemowo czy Ursynów są tańsze przy podobnym, 20–30-minutowym dojeździe metrem lub tramwajem.",
    ua: "Варшава — столиця і найбільший ринок оренди в Польщі: сюди їдуть працювати в корпораціях, IT та міжнародних проєктах, а Мокотув і Воля забиті офісами. Тут найширший вибір квартир і кімнат, але й найвищі ціни — особливо в Śródmieście. Правобережна Прага та спальні райони на кшталт Bemowo й Ursynów дешевші за схожих 20–30 хвилин до центру метро чи трамваєм.",
    en: "Warsaw is Poland's capital and its biggest rental market: people move here for corporate, IT and international jobs, and Mokotów and Wola are packed with offices. It has the widest choice of flats and rooms — and the highest prices, especially in Śródmieście. Praga across the river and residential districts like Bemowo or Ursynów cost less for a similar 20–30-minute commute by metro or tram." },
  krakow: {
    ru: "Краков — историческая столица Малопольши и крупнейший студенческий город страны: Ягеллонский университет и десятки вузов держат спрос на комнаты и небольшие квартиры круглый год. Старый город и Казимеж — туристический центр с высокими ценами, зато Nowa Huta и Podgórze Duchackie дают нормальную квартиру заметно дешевле при удобном трамвайном сообщении.",
    pl: "Kraków to historyczna stolica Małopolski i największe miasto studenckie w kraju: Uniwersytet Jagielloński i dziesiątki uczelni utrzymują popyt na pokoje i małe mieszkania cały rok. Stare Miasto i Kazimierz to centrum turystyczne z wysokimi cenami, za to Nowa Huta i Podgórze Duchackie dają normalne mieszkanie wyraźnie taniej przy dobrym połączeniu tramwajowym.",
    ua: "Краків — історична столиця Малопольщі і найбільше студентське місто країни: Ягеллонський університет і десятки вишів тримають попит на кімнати й невеликі квартири цілий рік. Старе місто і Казімеж — туристичний центр із високими цінами, натомість Nowa Huta й Podgórze Duchackie дають нормальну квартиру помітно дешевше при зручному трамвайному сполученні.",
    en: "Kraków is Małopolska's historic capital and Poland's biggest student city: the Jagiellonian University and dozens of other schools keep demand for rooms and small flats high year-round. The Old Town and Kazimierz are the touristy, pricey core, while Nowa Huta and Podgórze Duchackie offer a normal flat for noticeably less with an easy tram ride in." },
  wroclaw: {
    ru: "Вроцлав — один из главных IT- и аутсорс-хабов Польши: здесь офисы Nokia, HP, Google и десятков других компаний, плюс сильный студенческий сектор. Город на Одре быстро растёт, международное сообщество большое, а рынок аренды подвижный — новые объявления появляются каждый день в Krzyki, Fabryczna и Śródmieście.",
    pl: "Wrocław to jeden z głównych hubów IT i outsourcingu w Polsce: biura Nokii, HP, Google i dziesiątek innych firm, plus silny sektor studencki. Miasto nad Odrą szybko się rozwija, społeczność międzynarodowa jest duża, a rynek najmu żywy — nowe ogłoszenia pojawiają się codziennie w Krzykach, na Fabrycznej i w Śródmieściu.",
    ua: "Вроцлав — один із головних IT- та аутсорс-хабів Польщі: тут офіси Nokia, HP, Google і десятків інших компаній, плюс сильний студентський сектор. Місто на Одрі швидко росте, міжнародна спільнота велика, а ринок оренди рухливий — нові оголошення з'являються щодня в Krzyki, на Fabryczna і в Śródmieście.",
    en: "Wrocław is one of Poland's main IT and outsourcing hubs, home to Nokia, HP, Google and dozens of other offices, plus a strong student scene. The city on the Oder is growing fast, its international community is large, and the rental market moves quickly — new listings appear daily in Krzyki, Fabryczna and Śródmieście." },
  gdansk: {
    ru: "Гданьск — часть Труймяста вместе с Сопотом и Гдыней, побережье Балтики, судостроение и растущий IT-сектор. Летом спрос подскакивает из-за туристов и посуточной аренды, зимой рынок спокойнее и выгоднее. Śródmieście и Wrzeszcz ближе к морю и дороже, спальные районы вроде Chełm и Przymorze — доступнее.",
    pl: "Gdańsk to część Trójmiasta razem z Sopotem i Gdynią, wybrzeże Bałtyku, przemysł stoczniowy i rosnący sektor IT. Latem popyt skacze przez turystów i najem krótkoterminowy, zimą rynek jest spokojniejszy i korzystniejszy. Śródmieście i Wrzeszcz są bliżej morza i droższe, dzielnice sypialniane jak Chełm czy Przymorze — tańsze.",
    ua: "Гданськ — частина Труймяста разом із Сопотом і Гдинею, узбережжя Балтики, суднобудування та зростаючий IT-сектор. Влітку попит підскакує через туристів і подобову оренду, взимку ринок спокійніший і вигідніший. Śródmieście і Wrzeszcz ближче до моря й дорожчі, спальні райони на кшталт Chełm і Przymorze — доступніші.",
    en: "Gdańsk is part of the Tri-City alongside Sopot and Gdynia, on the Baltic coast, with shipbuilding and a growing IT sector. Demand spikes in summer with tourists and short-term rentals, while winter is calmer and cheaper. Śródmieście and Wrzeszcz sit closer to the sea and cost more; residential areas like Chełm or Przymorze are more affordable." },
  poznan: {
    ru: "Познань — деловой и логистический центр Великопольши, город международных ярмарок MTP и крупный студенческий центр с ганзейской архитектурой в центре. Рынок аренды спокойнее, чем в Варшаве или Кракове, без резких сезонных скачков цен — комнату или квартиру можно снять быстро в любое время года.",
    pl: "Poznań to centrum biznesowe i logistyczne Wielkopolski, miasto targów międzynarodowych MTP i duży ośrodek akademicki z hanzeatycką architekturą w centrum. Rynek najmu jest spokojniejszy niż w Warszawie czy Krakowie, bez gwałtownych sezonowych skoków cen — pokój lub mieszkanie można wynająć szybko o każdej porze roku.",
    ua: "Познань — діловий і логістичний центр Великопольщі, місто міжнародних ярмарків MTP і великий студентський центр із ганзейською архітектурою в центрі. Ринок оренди спокійніший, ніж у Варшаві чи Кракові, без різких сезонних стрибків цін — кімнату або квартиру можна зняти швидко в будь-яку пору року.",
    en: "Poznań is Wielkopolska's business and logistics hub, home to the international MTP trade fairs and a large student population, with Hanseatic-style architecture downtown. Its rental market is calmer than Warsaw's or Kraków's, without sharp seasonal price swings — a room or flat can usually be rented quickly any time of year." },
  lodz: {
    ru: "Лодзь — город киношколы (её закончили Полански и Кесьлёвский) и бывшая текстильная столица Польши, которая последние годы активно перестраивается: Manufaktura и центр обновляются, растёт IT-сектор. Аренда здесь заметно дешевле, чем в Варшаве и Кракове, при хорошем железнодорожном сообщении с обеими столицами.",
    pl: "Łódź to miasto Szkoły Filmowej (jej absolwentami są Polański i Kieślowski) i była stolica włókiennictwa w Polsce, która ostatnie lata mocno się przebudowuje: Manufaktura i centrum się odnawiają, rośnie sektor IT. Najem jest tu wyraźnie tańszy niż w Warszawie czy Krakowie, przy dobrym połączeniu kolejowym z obiema stolicami.",
    ua: "Лодзь — місто кіношколи (її закінчили Полянскі й Кесльовський) і колишня текстильна столиця Польщі, яка останніми роками активно перебудовується: Manufaktura і центр оновлюються, зростає IT-сектор. Оренда тут помітно дешевша, ніж у Варшаві й Кракові, при хорошому залізничному сполученні з обома столицями.",
    en: "Łódź is home to the famous Film School (alumni include Polanski and Kieślowski) and was once Poland's textile capital — it's been rebuilding fast in recent years, with Manufaktura and the city centre renewed and a growing IT sector. Rents here are noticeably lower than in Warsaw or Kraków, with good rail links to both capitals." },
  zakopane: {
    ru: "Закопане — туристическая столица у подножия Татр: горнолыжный сезон зимой и трекинг летом держат спрос на короткую и посуточную аренду весь год. Центр и Krupówki — самые дорогие и туристические, а Olcza, Bystre и Harenda дают более спокойное и доступное жильё в двух шагах от гор.",
    pl: "Zakopane to turystyczna stolica u podnóża Tatr: sezon narciarski zimą i trekking latem utrzymują popyt na najem krótkoterminowy przez cały rok. Centrum i Krupówki są najdroższe i najbardziej turystyczne, a Olcza, Bystre czy Harenda dają spokojniejsze i tańsze lokum o krok od gór.",
    ua: "Закопане — туристична столиця біля підніжжя Татр: гірськолижний сезон узимку і трекінг улітку тримають попит на коротку й подобову оренду цілий рік. Центр і Krupówki — найдорожчі й найтуристичніші, а Olcza, Bystre й Harenda дають спокійніше і доступніше житло за крок від гір.",
    en: "Zakopane is the tourist capital at the foot of the Tatra mountains: the winter ski season and summer hiking keep demand for short and daily rentals high all year. The centre and Krupówki are the priciest, most touristy spots, while Olcza, Bystre or Harenda offer quieter, more affordable places a step from the mountains." },
  bialystok: {
    ru: "Белосток — крупнейший город Подляского воеводства у восточной границы, спокойный и заметно доступнее по цене, чем крупные польские мегаполисы. Университеты и медколледж держат стабильный студенческий спрос, а близость к Беларуси и Литве делает город удобной базой для тех, кто ищет тихий и бюджетный вариант.",
    pl: "Białystok to największe miasto województwa podlaskiego przy wschodniej granicy, spokojne i wyraźnie tańsze niż duże polskie metropolie. Uczelnie i uniwersytet medyczny utrzymują stabilny popyt studencki, a bliskość Białorusi i Litwy czyni miasto wygodną bazą dla tych, którzy szukają cichej i budżetowej opcji.",
    ua: "Білосток — найбільше місто Підляського воєводства біля східного кордону, спокійне і помітно доступніше за ціною, ніж великі польські мегаполіси. Університети й медколедж тримають стабільний студентський попит, а близькість до Білорусі й Литви робить місто зручною базою для тих, хто шукає тихий і бюджетний варіант.",
    en: "Białystok is the largest city in Podlaskie voivodeship on Poland's eastern border — calm and noticeably cheaper than the big Polish metros. Its universities and medical college keep steady student demand, and its closeness to Belarus and Lithuania makes it a convenient base for anyone after a quiet, budget-friendly option." },
};

const CITY_SEO = {
  ru: { title: (inCity) => `Аренда квартир и комнат ${inCity} — Kwadrat PL`,
    desc: (inCity) => `Ищите квартиру или комнату ${inCity}: OLX, Otodom и Morizon в одном Telegram-боте. Мгновенные уведомления о новых объявлениях, справедливая цена, бесплатно.`,
    h1: (inCity) => `Аренда жилья ${inCity}`, districts: "Районы", faqTitle: "Частые вопросы" },
  pl: { title: (inCity) => `Wynajem mieszkań i pokoi ${inCity} — Kwadrat PL`,
    desc: (inCity) => `Szukaj mieszkania lub pokoju ${inCity}: OLX, Otodom i Morizon w jednym bocie Telegram. Natychmiastowe powiadomienia o nowych ogłoszeniach, uczciwa cena, za darmo.`,
    h1: (inCity) => `Wynajem mieszkań ${inCity}`, districts: "Dzielnice", faqTitle: "Najczęstsze pytania" },
  ua: { title: (inCity) => `Оренда квартир і кімнат ${inCity} — Kwadrat PL`,
    desc: (inCity) => `Шукайте квартиру чи кімнату ${inCity}: OLX, Otodom і Morizon в одному Telegram-боті. Миттєві сповіщення про нові оголошення, справедлива ціна, безкоштовно.`,
    h1: (inCity) => `Оренда житла ${inCity}`, districts: "Райони", faqTitle: "Часті запитання" },
  en: { title: (inCity) => `Flats and rooms for rent ${inCity} — Kwadrat PL`,
    desc: (inCity) => `Find a flat or room ${inCity}: OLX, Otodom and Morizon in one Telegram bot. Instant alerts on new listings, fair-price check, free to use.`,
    h1: (inCity) => `Renting a home ${inCity}`, districts: "Districts", faqTitle: "FAQ" },
};

function cityFaq(lang, inCity) {
  const T = {
    ru: [
      ["Сколько стоит аренда квартиры {c}?", "Цены зависят от района, площади и типа жилья — комната стоит меньше квартиры, а центр дороже окраин. Бот показывает у каждого объявления бейдж «ниже/выше рынка района» на основе собранных данных, так что справедливую цену видно сразу, без ручного сравнения."],
      ["Как быстро появляются новые объявления {c}?", "Данные с OLX, Otodom и Morizon обновляются каждые несколько минут. Подпишитесь на свой поиск в боте — и новые квартиры и комнаты придут в чат раньше, чем их разберут."],
      ["Можно ли снять комнату {c}, а не всю квартиру?", "Да, бот собирает отдельно квартиры, комнаты и посуточную аренду по всем 8 городам. В настройках поиска можно выбрать нужный тип жилья."],
    ],
    pl: [
      ["Ile kosztuje wynajem mieszkania {c}?", "Ceny zależą od dzielnicy, metrażu i typu lokum — pokój kosztuje mniej niż mieszkanie, a centrum drożej niż peryferie. Bot pokazuje przy każdym ogłoszeniu znacznik „poniżej/powyżej rynku dzielnicy” na podstawie zebranych danych, więc uczciwą cenę widać od razu, bez ręcznego porównywania."],
      ["Jak szybko pojawiają się nowe ogłoszenia {c}?", "Dane z OLX, Otodom i Morizon odświeżają się co kilka minut. Zasubskrybuj swoje wyszukiwanie w bocie — nowe mieszkania i pokoje trafią na czat, zanim inni je rozchwytają."],
      ["Czy można wynająć pokój {c}, a nie całe mieszkanie?", "Tak, bot zbiera osobno mieszkania, pokoje i noclegi krótkoterminowe we wszystkich 8 miastach. W ustawieniach wyszukiwania wybierzesz odpowiedni typ lokum."],
    ],
    ua: [
      ["Скільки коштує оренда квартири {c}?", "Ціни залежать від району, площі й типу житла — кімната коштує менше за квартиру, а центр дорожче за околиці. Бот показує біля кожного оголошення бейдж «нижче/вище ринку району» на основі зібраних даних, тож справедливу ціну видно одразу, без ручного порівняння."],
      ["Як швидко з'являються нові оголошення {c}?", "Дані з OLX, Otodom і Morizon оновлюються кожні кілька хвилин. Підпишіться на свій пошук у боті — і нові квартири та кімнати прийдуть у чат раніше, ніж їх розберуть."],
      ["Чи можна орендувати кімнату {c}, а не всю квартиру?", "Так, бот збирає окремо квартири, кімнати й подобову оренду в усіх 8 містах. У налаштуваннях пошуку можна вибрати потрібний тип житла."],
    ],
    en: [
      ["How much does renting a flat cost {c}?", "Prices depend on the district, size and type of home — a room costs less than a flat, and the centre costs more than the outskirts. The bot shows a below/above district-market badge on every listing based on its own data, so you can spot a fair price instantly."],
      ["How fast do new listings appear {c}?", "Data from OLX, Otodom and Morizon refreshes every few minutes. Subscribe to your search in the bot and new flats and rooms will reach your chat before anyone else snaps them up."],
      ["Can I rent a room {c} instead of a whole flat?", "Yes — the bot tracks flats, rooms and short stays separately across all 8 cities. Pick the type you want in the search filters."],
    ],
  };
  return (T[lang] || T.ru).map(([q, a]) => ({ q: q.replace("{c}", inCity), a: a.replace("{c}", inCity) }));
}

// CITIES (районы) — единый источник webapp/js/core.js, как CITY_NAMES выше
const CITY_DISTRICTS = (() => {
  const core = readFileSync(join(__dirname, "..", "..", "webapp", "js", "core.js"), "utf8");
  const m = core.match(/var CITIES = (\{[\s\S]*?\n  \});/);
  if (!m) throw new Error("CITY_DISTRICTS: не нашёл CITIES в webapp/js/core.js");
  return new Function("return " + m[1])();
})();

// ── общий «каркас» для гайдов и городских страниц ───────────────────────────
function altLinksAt(pathSuffix) {
  const links = LANGS.map((l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${url(l.path + pathSuffix)}">`);
  links.push(`<link rel="alternate" hreflang="x-default" href="${url(pathSuffix)}">`);
  return links.join("\n");
}

function langSwitcherAt(currentCode, pathSuffix) {
  return LANGS.map((l) => {
    const on = l.code === currentCode;
    const label = l.code.toUpperCase();
    return on
      ? `<span class="lang on" aria-current="true">${label}</span>`
      : `<a class="lang" href="${url(l.path + pathSuffix)}" hreflang="${l.hreflang}">${label}</a>`;
  }).join("");
}

const CHROME_CSS = `
:root{
  color-scheme:light dark;
  --bg:#F2F2F7; --bg2:#ffffff; --card:#ffffff; --border:rgba(60,60,67,.29);
  --text:#000000; --muted:#6c6c70; --accent:#007AFF; --accent2:#0060df;
  --radius:20px; --radius-sm:14px; --maxw:820px; --shadow:none;
  --nav-bg:rgba(242,242,247,.78);
}
@media (prefers-color-scheme:dark){
  :root{ --bg:#000000; --bg2:#1c1c1e; --card:#1c1c1e; --border:rgba(84,84,88,.65);
    --text:#ffffff; --muted:#8e8e93; --accent:#0A84FF; --accent2:#409cff;
    --nav-bg:rgba(0,0,0,.72); }
}
*,*::before,*::after{ box-sizing:border-box; -webkit-tap-highlight-color:transparent }
html{ scroll-behavior:smooth; -webkit-text-size-adjust:100% }
body{ margin:0; background:var(--bg); color:var(--text); line-height:1.5;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji";
  -webkit-font-smoothing:antialiased }
a{ color:inherit; text-decoration:none }
h1,h2,h3{ line-height:1.16; text-wrap:balance; margin:0; letter-spacing:-.02em }
p{ margin:0 }
.wrap{ max-width:var(--maxw); margin:0 auto; padding:0 20px }
.ico{ width:22px; height:22px; stroke-width:1.75 }
.top{ position:sticky; top:0; z-index:10; background:var(--nav-bg);
  backdrop-filter:saturate(180%) blur(20px); -webkit-backdrop-filter:saturate(180%) blur(20px);
  border-bottom:.5px solid var(--border) }
.top .wrap{ display:flex; align-items:center; gap:16px; height:56px; max-width:1040px }
.brand{ display:flex; align-items:center; gap:9px; font-weight:700; font-size:17px; letter-spacing:-.01em }
.brand .mark{ width:32px; height:32px; border-radius:9px; display:inline-block; object-fit:contain }
.langs{ margin-left:auto; display:flex; gap:2px; background:var(--bg); padding:2px; border-radius:9px }
.lang{ font-size:13px; font-weight:600; color:var(--muted); padding:5px 9px; border-radius:7px;
  display:inline-flex; align-items:center; justify-content:center; min-height:30px; min-width:34px; transition:background .15s ease,color .15s ease }
.lang:hover{ color:var(--text) }
.lang.on{ color:var(--text); background:var(--card); box-shadow:0 1px 2.5px rgba(0,0,0,.13), 0 0 0 .5px rgba(0,0,0,.03) }
@media (prefers-color-scheme:dark){ .lang.on{ box-shadow:0 1px 2.5px rgba(0,0,0,.45) } }
.top .cta{ display:none }
@media(min-width:720px){ .top .cta{ display:inline-flex } }
.btn{ display:inline-flex; align-items:center; gap:8px; font-weight:590; font-size:17px;
  padding:13px 24px; border-radius:999px; background:var(--accent); color:#fff;
  transition:transform .12s ease, opacity .12s ease; white-space:nowrap; border:0; cursor:pointer;
  font-family:inherit }
.btn:hover{ background:var(--accent2) }
.btn:active{ transform:scale(.96); opacity:.85 }
.btn svg{ width:19px; height:19px }
.btn.sm{ font-size:14px; padding:9px 16px }
.btn.ghost{ background:var(--bg2); color:var(--accent); border:.5px solid var(--border) }
.btn.ghost:hover{ background:var(--card) }
main{ padding:32px 0 60px }
.crumb{ font-size:13px; color:var(--muted); margin-bottom:18px; display:flex; gap:6px; flex-wrap:wrap }
.crumb a{ color:var(--accent) }
.art-h1{ font-size:clamp(26px,4.6vw,36px); font-weight:750; letter-spacing:-.025em; margin-bottom:10px }
.art-lead{ color:var(--muted); font-size:16px; margin-bottom:8px }
.art-cta{ margin:22px 0 28px; display:flex; flex-wrap:wrap; gap:12px; align-items:center }
/* гайды — Settings-стиль: плоские сгруппированные блоки, hairline-бордер, без тени */
.gsec{ background:var(--card); border:.5px solid var(--border); border-radius:var(--radius-sm);
  padding:20px 22px; box-shadow:var(--shadow); margin-bottom:12px }
.gsec .h2{ font-size:18px; font-weight:650; letter-spacing:-.015em; margin-bottom:10px }
.gp{ font-size:15px; line-height:1.6; margin:0 0 10px; color:var(--text) }
.gp:last-child{ margin-bottom:0 }
.gl{ font-size:15px; line-height:1.6; margin:0 0 10px; padding-left:22px; color:var(--text) }
.gl li{ margin-bottom:7px }
.gwarn{ background:color-mix(in srgb, #ff9f0a 14%, transparent); border:.5px solid color-mix(in srgb, #ff9f0a 40%, transparent);
  border-radius:var(--radius-sm); padding:12px 16px; font-size:14px; margin-top:10px }
.gtpl{ margin-top:12px }
.gtpl-label{ font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; font-weight:600 }
.gtpl-box{ position:relative; background:var(--bg); border:.5px solid var(--border); border-radius:var(--radius-sm); overflow:hidden }
.gtpl pre{ margin:0; padding:16px; white-space:pre-wrap; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:13px; line-height:1.55 }
.gtpl .btn{ margin:0 16px 16px }
.foot-note{ color:var(--muted); font-size:13px; text-align:center; margin:26px 0 0 }
/* checklist — рядок Reminders-стиля: круглый чекбокс с галочкой вместо системного */
.prog{ display:flex; align-items:center; gap:12px; margin-bottom:16px }
.prog .meter{ flex:1; height:6px; border-radius:99px; background:var(--bg); overflow:hidden }
.prog .meter i{ display:block; height:100%; background:var(--accent); width:0; transition:width .25s ease }
.prog .pct{ font-weight:650; font-size:14px; min-width:40px; text-align:right; color:var(--muted); font-variant-numeric:tabular-nums }
.chk{ display:flex; align-items:flex-start; gap:12px; padding:11px 0; border-bottom:.5px solid var(--border);
  cursor:pointer; font-size:15px; line-height:1.45 }
.chk:last-child{ border-bottom:0 }
.chk input{ appearance:none; -webkit-appearance:none; margin-top:1px; width:22px; height:22px; border-radius:50%;
  border:1.5px solid var(--border); background:var(--card); flex:0 0 auto; position:relative; cursor:pointer;
  transition:background .15s ease, border-color .15s ease }
.chk input:checked{ background:var(--accent); border-color:var(--accent) }
.chk input:checked::after{ content:""; position:absolute; left:50%; top:45%; width:5px; height:9px;
  border-right:2px solid #fff; border-bottom:2px solid #fff; transform:translate(-50%,-50%) rotate(45deg) }
.chk.on span{ color:var(--muted); text-decoration:line-through }
/* koszty — истинный сегмент-контрол и поля ввода в стиле iOS-форм */
.frow3{ display:flex; gap:12px; margin-bottom:14px; flex-wrap:wrap }
.frow3 .fcol{ flex:1 1 140px }
.flabel{ display:block; font-size:12.5px; font-weight:600; color:var(--muted); margin-bottom:6px }
.finput{ width:100%; padding:11px 13px; border-radius:10px; border:.5px solid var(--border);
  background:var(--bg); color:var(--text); font-size:16px; font-family:inherit }
.seg{ display:flex; gap:2px; background:var(--bg); padding:2px; border-radius:10px }
.seg button{ flex:1; padding:9px 6px; border-radius:8px; border:0; background:transparent;
  color:var(--text); font-weight:590; font-size:13.5px; cursor:pointer; font-family:inherit;
  transition:background .15s ease, box-shadow .15s ease }
.seg button.active{ background:var(--card); box-shadow:0 1px 2.5px rgba(0,0,0,.13), 0 0 0 .5px rgba(0,0,0,.03) }
@media (prefers-color-scheme:dark){ .seg button.active{ box-shadow:0 1px 2.5px rgba(0,0,0,.45) } }
.res{ text-align:center; padding:16px 0 }
.res .big{ font-size:30px; font-weight:700; color:var(--accent); font-variant-numeric:tabular-nums }
.res .lbl{ font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; margin-bottom:4px }
.breakdown .row{ display:flex; justify-content:space-between; padding:9px 0; border-bottom:.5px solid var(--border); font-size:14.5px }
.breakdown .row:last-child{ border-bottom:0; font-weight:650 }
/* phrases */
.tr-label{ font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.03em; margin:10px 0 4px; font-weight:600 }
.tr-text{ font-style:italic; color:var(--muted) }
/* guides hub + city chips/faq */
.grid2{ display:grid; grid-template-columns:1fr; gap:10px }
@media(min-width:640px){ .grid2{ grid-template-columns:1fr 1fr } }
.hcard{ display:flex; gap:14px; align-items:flex-start; background:var(--card); border:.5px solid var(--border);
  border-radius:var(--radius-sm); padding:18px; box-shadow:var(--shadow); transition:transform .12s ease, opacity .12s ease; color:inherit }
.hcard:active{ transform:scale(.98); opacity:.8 }
.hcard .ico-wrap{ flex:0 0 auto; display:inline-flex; width:38px; height:38px; border-radius:10px; align-items:center; justify-content:center;
  color:var(--accent); background:color-mix(in srgb,var(--accent) 12%,transparent) }
.hcard h3{ font-size:15.5px; font-weight:600; margin-bottom:4px; letter-spacing:-.01em }
.hcard p{ font-size:13.5px; color:var(--muted); line-height:1.4 }
.chips{ display:flex; flex-wrap:wrap; gap:9px; margin:18px 0 30px }
.chip{ font-weight:590; font-size:14px; background:var(--card); border:.5px solid var(--border); padding:9px 16px; border-radius:999px }
.sec-h{ font-size:clamp(19px,2.8vw,23px); font-weight:700; letter-spacing:-.017em; margin:32px 0 12px }
.faq-list{ background:var(--card); border:.5px solid var(--border); border-radius:var(--radius-sm); overflow:hidden }
.faq{ border-bottom:.5px solid var(--border) }
.faq:last-child{ border-bottom:0 }
.faq summary{ cursor:pointer; padding:14px 18px; font-weight:590; font-size:15px; list-style:none;
  display:flex; justify-content:space-between; align-items:center; gap:12px }
.faq summary::-webkit-details-marker{ display:none }
.faq summary::after{ content:""; flex:none; width:8px; height:8px; margin-right:2px;
  border-right:1.6px solid var(--muted); border-bottom:1.6px solid var(--muted);
  transform:rotate(-45deg); transition:transform .18s ease }
.faq[open] summary::after{ transform:rotate(45deg) }
.faq-a{ padding:0 18px 15px; color:var(--muted); font-size:14px }
footer{ border-top:.5px solid var(--border); padding:36px 0; margin-top:20px }
.foot-grid{ display:flex; flex-wrap:wrap; gap:24px; justify-content:space-between; align-items:flex-start; max-width:1040px; margin:0 auto; padding:0 20px }
.foot-about{ max-width:420px; color:var(--muted); font-size:13.5px }
.foot-about .brand{ margin-bottom:10px; color:var(--text) }
.foot-langs{ display:flex; gap:2px; flex-wrap:wrap; background:var(--bg); padding:2px; border-radius:9px; width:fit-content }
.foot-langs .lang{ border:0 }
.foot-legal{ margin-top:26px; color:var(--muted); font-size:12.5px; border-top:.5px solid var(--border); padding-top:18px; max-width:1040px; margin-left:auto; margin-right:auto; padding-left:20px; padding-right:20px }
`;

function chromeOpen(meta, { title, desc, canonical, altHtml, jsonLd }) {
  const ogAlt = LANGS.filter((l) => l.code !== meta.code)
    .map((l) => `<meta property="og:locale:alternate" content="${l.locale}">`).join("\n");
  const c = C[meta.code];
  return `<!DOCTYPE html>
<html lang="${meta.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
${altHtml}
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#229ED9">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${url("og.png")}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${meta.locale}">
${ogAlt}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${url("og.png")}">
<script type="application/ld+json">${jsonLd}</script>
<style>${CHROME_CSS}</style>
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="brand" href="${url(meta.path)}" aria-label="${esc(SITE.name)}">
      <img class="mark" src="/logo.webp" alt="" width="34" height="34"> ${esc(SITE.name)}
    </a>
    <nav class="langs" aria-label="${esc(c.footLang)}">${langSwitcherAt(meta.code, meta._suffix || "")}</nav>
    <a class="btn sm cta" href="${SITE.bot}" rel="noopener">${Icons.svg("send")} Telegram</a>
  </div>
</header>
<main><div class="wrap">`;
}

function chromeClose(meta) {
  const c = C[meta.code];
  return `</div></main>
<footer>
  <div class="foot-grid">
    <div class="foot-about">
      <div class="brand"><img class="mark" src="/logo.webp" alt="" width="34" height="34"> ${esc(SITE.name)}</div>
      <p>${esc(c.footAbout)}</p>
      <p style="margin-top:8px">${esc(OWNER_LINE[meta.code])}</p>
    </div>
    <div>
      <div style="font-weight:700;margin-bottom:10px">${esc(c.footLang)}</div>
      <div class="foot-langs">${langSwitcherAt(meta.code, meta._suffix || "")}</div>
    </div>
  </div>
  <div class="foot-legal">© ${esc(SITE.name)} · ${esc(c.footRights)} · <a href="${url(meta.path + "privacy/")}" style="color:var(--accent)">${esc(PRIVACY_LABEL[meta.code])}</a>${SITE.donate ? ` · <a href="${SITE.donate}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(c.donateCta)}</a>` : ""}</div>
</footer>
</body>
</html>
`;
}

// ── рендер контента гайдов ───────────────────────────────────────────────────
function pick2(obj, lang) { return (obj && (obj[lang] ?? obj.ru)) ?? ""; }

function renderGuideSections(sections, lang) {
  return (sections || []).map((sec) => {
    let out = '<div class="gsec">';
    if (sec.h) out += `<div class="h2">${sec.h}</div>`;
    (sec.p || []).forEach((t) => { out += `<p class="gp">${t}</p>`; });
    if (sec.list) {
      const tag = sec.num ? "ol" : "ul";
      out += `<${tag} class="gl">${sec.list.map((i) => `<li>${i}</li>`).join("")}</${tag}>`;
    }
    if (sec.warn) out += `<div class="gwarn">⚠️ ${sec.warn}</div>`;
    if (sec.tpl) {
      out += `<div class="gtpl"><div class="gtpl-label">${esc(sec.tpl.label)}</div>
        <div class="gtpl-box"><pre>${esc(sec.tpl.text)}</pre>
        <button type="button" class="btn sm ghost" onclick="navigator.clipboard.writeText(this.previousElementSibling.innerText); this.textContent='✓'">${esc(pick2(KW.DICT.copyBtn, lang))}</button></div></div>`;
    }
    return out + "</div>";
  }).join("");
}

function renderChecklist(lang) {
  const { SUB, FOOT, GROUPS } = GSRC.checklist;
  const sub = pick2(SUB, lang);
  const foot = pick2(FOOT, lang);
  const groups = GROUPS.map((g, gi) => {
    const items = g.items.map((it, ii) => {
      const id = `${gi}.${ii}`;
      return `<label class="chk" data-id="${id}"><input type="checkbox" data-id="${id}"><span>${esc(pick2(it, lang))}</span></label>`;
    }).join("");
    return `<div class="gsec"><div class="h2">${esc(pick2(g.h, lang))}</div>${items}</div>`;
  }).join("");
  const resetLabel = esc(pick2(KW.DICT.resetBtn, lang));
  const script = `
<script>
(function () {
  "use strict";
  var KEY = "kw_check";
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  var boxes = document.querySelectorAll(".chk input");
  function total() { return boxes.length; }
  function done() { return Object.keys(state).filter(function (k) { return state[k]; }).length; }
  function progress() {
    var pct = total() ? Math.round(done() / total() * 100) : 0;
    document.getElementById("bar").style.width = pct + "%";
    document.getElementById("pct").textContent = pct + "%";
  }
  boxes.forEach(function (cb) {
    var id = cb.dataset.id;
    cb.checked = !!state[id];
    if (cb.checked) cb.closest(".chk").classList.add("on");
    cb.addEventListener("change", function () {
      state[id] = cb.checked;
      localStorage.setItem(KEY, JSON.stringify(state));
      cb.closest(".chk").classList.toggle("on", cb.checked);
      progress();
    });
  });
  document.getElementById("chkReset").addEventListener("click", function () {
    state = {};
    localStorage.removeItem(KEY);
    boxes.forEach(function (cb) { cb.checked = false; cb.closest(".chk").classList.remove("on"); });
    progress();
  });
  progress();
})();
</script>`;
  return `<p class="art-lead">${esc(sub)}</p>
<div class="prog"><div class="meter"><i id="bar"></i></div><div class="pct" id="pct">0%</div></div>
${groups}
<button type="button" class="btn ghost" id="chkReset">${resetLabel}</button>
<p class="foot-note">${esc(foot)}</p>${script}`;
}

function renderPhrases(lang) {
  const { SUB, FOOT, PHRASES, TR_LABEL } = GSRC.phrases;
  const sub = pick2(SUB, lang);
  const foot = pick2(FOOT, lang);
  const cards = PHRASES.map((p) => {
    const note = pick2(p.n, lang);
    const tr = lang !== "pl" && p.tr ? pick2(p.tr, lang) : "";
    return `<div class="gsec">
      <div class="h2">${esc(pick2(p.t, lang))}</div>
      ${note ? `<p class="gp" style="color:var(--muted)">${esc(note)}</p>` : ""}
      ${tr ? `<div class="tr-label">${esc(pick2(TR_LABEL, lang))}</div><p class="gp tr-text">${esc(tr)}</p>` : ""}
      <div class="gtpl-box"><pre>${esc(p.pl)}</pre>
      <button type="button" class="btn sm ghost" onclick="navigator.clipboard.writeText(this.previousElementSibling.innerText); this.textContent='✓'">${esc(pick2(KW.DICT.copyBtn, lang))}</button></div>
    </div>`;
  }).join("");
  return `<p class="art-lead">${esc(sub)}</p>${cards}<p class="foot-note">${esc(foot)}</p>`;
}

function renderKoszty(lang) {
  const L10N = GSRC.koszty.L10N;
  const t = (k) => esc(pick2(L10N[k], lang));
  const script = `
<script>
(function () {
  "use strict";
  var kMult = 1, pMult = 0;
  function val(id) { return +document.getElementById(id).value || 0; }
  function zl(n) { return n.toLocaleString("pl-PL") + " zł"; }
  function calc() {
    var czynsz = val("k_czynsz"), admin = val("k_admin"), media = val("k_media");
    var month = czynsz + admin + media;
    var kaucja = czynsz * kMult;
    var prow = Math.round(czynsz * pMult);
    var start = month + kaucja + prow;
    document.getElementById("k_startSum").textContent = month ? zl(start) : "—";
    document.getElementById("k_monthSum").textContent = month ? zl(month) : "—";
    document.getElementById("k_bd").innerHTML = month ?
      '<div class="row"><span>${t("firstMonth")}</span><b>' + zl(month) + "</b></div>" +
      '<div class="row"><span>${t("kaucjaRow")} (' + kMult + "×)</span><b>" + zl(kaucja) + "</b></div>" +
      (prow ? '<div class="row"><span>${t("prowRow")}</span><b>' + zl(prow) + "</b></div>" : "") +
      '<div class="row"><span>${t("totalRow")}</span><b>' + zl(start) + "</b></div>" : "";
  }
  ["k_czynsz", "k_admin", "k_media"].forEach(function (id) { document.getElementById(id).oninput = calc; });
  document.querySelectorAll("#k_segK button").forEach(function (b) {
    b.onclick = function () { kMult = +b.dataset.k; document.querySelectorAll("#k_segK button").forEach(function (x) { x.classList.toggle("active", x === b); }); calc(); };
  });
  document.querySelectorAll("#k_segP button").forEach(function (b) {
    b.onclick = function () { pMult = +b.dataset.p; document.querySelectorAll("#k_segP button").forEach(function (x) { x.classList.toggle("active", x === b); }); calc(); };
  });
  document.querySelector('#k_segK [data-k="1"]').classList.add("active");
  document.querySelector('#k_segP [data-p="0"]').classList.add("active");
  var q = +new URLSearchParams(location.search).get("czynsz");
  if (q > 0) document.getElementById("k_czynsz").value = Math.round(q);
  calc();
})();
</script>`;
  return `<p class="art-lead">${t("sub")}</p>
<div class="gsec">
  <div class="frow3">
    <div class="fcol"><label class="flabel">${t("czynsz")}</label><input class="finput" type="number" id="k_czynsz" placeholder="3000" min="0" step="100"></div>
    <div class="fcol"><label class="flabel">${t("admin")}</label><input class="finput" type="number" id="k_admin" placeholder="700" min="0" step="50"></div>
  </div>
  <div class="frow3">
    <div class="fcol"><label class="flabel">${t("media")}</label><input class="finput" type="number" id="k_media" placeholder="350" min="0" step="50"></div>
    <div class="fcol"><label class="flabel">${t("kaucja")}</label><div class="seg" id="k_segK"><button type="button" data-k="1">1×</button><button type="button" data-k="2">2×</button><button type="button" data-k="3">3×</button></div></div>
  </div>
  <div class="frow3">
    <div class="fcol"><label class="flabel">${t("prow")}</label><div class="seg" id="k_segP"><button type="button" data-p="0">${t("none")}</button><button type="button" data-p="0.5">50%</button><button type="button" data-p="1">100%</button></div></div>
  </div>
</div>
<div class="gsec">
  <div class="res"><div class="lbl">${t("start")}</div><div class="big" id="k_startSum">—</div></div>
  <div class="breakdown" id="k_bd"></div>
</div>
<div class="gsec">
  <div class="res" style="padding:8px 0"><div class="lbl">${t("monthly")}</div><div class="big" style="font-size:22px" id="k_monthSum">—</div></div>
</div>
<p class="foot-note">${t("foot")}</p>${script}`;
}

// ── страница гайда ───────────────────────────────────────────────────────────
function guidePage(meta, guide) {
  const lang = meta.code;
  const suffix = `guides/${guide.slug}/`;
  const seo = guide.seo[lang] || guide.seo.ru;
  const canonical = url(meta.path + suffix);
  const src = GSRC[guide.slug];
  const h1 = pick2(KW.DICT[guide.dictKey], lang);
  let lead = "";
  let bodyInner = "";
  if (guide.type === "article") {
    const g = pickLang(src.GUIDE, lang);
    lead = g.sub || "";
    bodyInner = renderGuideSections(g.sections, lang);
  } else if (guide.type === "checklist") {
    bodyInner = renderChecklist(lang);
  } else if (guide.type === "phrases") {
    bodyInner = renderPhrases(lang);
  } else if (guide.type === "koszty") {
    bodyInner = renderKoszty(lang);
  }
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", "@id": canonical + "#article", headline: h1, description: seo.desc,
        inLanguage: meta.hreflang, dateModified: BUILD_DATE, url: canonical, mainEntityOfPage: canonical,
        publisher: { "@id": SITE.domain + "/#org" } },
      { "@type": "BreadcrumbList", "@id": canonical + "#breadcrumb", itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE.name, item: url(meta.path) },
        { "@type": "ListItem", position: 2, name: GUIDES_HUB[lang].h1, item: url(meta.path + "guides/") },
        { "@type": "ListItem", position: 3, name: h1, item: canonical },
      ] },
    ],
  });
  const chromeMeta = { ...meta, _suffix: suffix };
  return chromeOpen(chromeMeta, { title: seo.title, desc: seo.desc, canonical, altHtml: altLinksAt(suffix), jsonLd }) +
    `<div class="crumb"><a href="${url(meta.path)}">${esc(SITE.name)}</a> / <a href="${url(meta.path + "guides/")}">${esc(GUIDES_HUB[lang].h1)}</a> / <span>${esc(h1)}</span></div>
    <h1 class="art-h1">${esc(h1)}</h1>
    ${lead ? `<p class="art-lead">${esc(lead)}</p>` : ""}
    <div class="art-cta"><a class="btn" href="${SITE.bot}" rel="noopener">${Icons.svg("send")} ${esc(C[lang].ctaPrimary)}</a></div>
    ${bodyInner}` +
    chromeClose(chromeMeta);
}

function guidesHubPage(meta) {
  const lang = meta.code;
  const hub = GUIDES_HUB[lang];
  const suffix = "guides/";
  const canonical = url(meta.path + suffix);
  const cards = GUIDES.map((g) => {
    const src = GSRC[g.slug];
    let teaser = (g.seo[lang] || g.seo.ru).desc;
    if (g.type === "article") teaser = pickLang(src.GUIDE, lang).sub || teaser;
    else if (g.type === "checklist" || g.type === "phrases") teaser = pick2(src.SUB, lang) || teaser;
    else if (g.type === "koszty") teaser = pick2(src.L10N.sub, lang) || teaser;
    return `<a class="hcard" href="${url(meta.path + "guides/" + g.slug + "/")}">
      <span class="ico-wrap">${icon(g.icon)}</span>
      <span><h3>${esc(pick2(KW.DICT[g.dictKey], lang))}</h3><p>${esc(teaser)}</p></span>
    </a>`;
  }).join("");
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": canonical + "#page", url: canonical, name: hub.title, description: hub.desc, inLanguage: meta.hreflang, dateModified: BUILD_DATE },
      { "@type": "BreadcrumbList", "@id": canonical + "#breadcrumb", itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE.name, item: url(meta.path) },
        { "@type": "ListItem", position: 2, name: hub.h1, item: canonical },
      ] },
    ],
  });
  const chromeMeta = { ...meta, _suffix: suffix };
  return chromeOpen(chromeMeta, { title: hub.title, desc: hub.desc, canonical, altHtml: altLinksAt(suffix), jsonLd }) +
    `<div class="crumb"><a href="${url(meta.path)}">${esc(SITE.name)}</a> / <span>${esc(hub.h1)}</span></div>
    <h1 class="art-h1">${esc(hub.h1)}</h1>
    <p class="art-lead">${esc(hub.lead)}</p>
    <div class="grid2" style="margin-top:22px">${cards}</div>` +
    chromeClose(chromeMeta);
}

// ── городская страница ───────────────────────────────────────────────────────
function cityPage(meta, slug) {
  const lang = meta.code;
  const suffix = `cities/${slug}/`;
  const canonical = url(meta.path + suffix);
  const inCity = CITY_IN[slug][lang];
  const name = CITY[slug][lang];
  const seo = CITY_SEO[lang];
  const title = seo.title(inCity);
  const desc = seo.desc(inCity);
  const h1 = seo.h1(inCity);
  const lead = CITY_LEAD[slug][lang];
  const districts = CITY_DISTRICTS[slug].districts;
  const chips = districts.map((d) => `<span class="chip">${esc(d)}</span>`).join("");
  const faq = cityFaq(lang, inCity);
  const faqHtml = faq.map((f, i) => `
    <details class="faq" id="faq-${i + 1}">
      <summary><span role="heading" aria-level="3">${esc(f.q)}</span></summary>
      <div class="faq-a">${esc(f.a)}</div>
    </details>`).join("");
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": canonical + "#webpage", url: canonical, name: title, description: desc,
        inLanguage: meta.hreflang, dateModified: BUILD_DATE, about: { "@type": "City", name } },
      { "@type": "FAQPage", "@id": canonical + "#faq", inLanguage: meta.hreflang,
        mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
      { "@type": "BreadcrumbList", "@id": canonical + "#breadcrumb", itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE.name, item: url(meta.path) },
        { "@type": "ListItem", position: 2, name, item: canonical },
      ] },
    ],
  });
  const chromeMeta = { ...meta, _suffix: suffix };
  return chromeOpen(chromeMeta, { title, desc, canonical, altHtml: altLinksAt(suffix), jsonLd }) +
    `<div class="crumb"><a href="${url(meta.path)}">${esc(SITE.name)}</a> / <span>${esc(name)}</span></div>
    <h1 class="art-h1">${esc(h1)}</h1>
    <p class="art-lead">${esc(lead)}</p>
    <div class="art-cta"><a class="btn" href="${SITE.bot}" rel="noopener">${Icons.svg("send")} ${esc(C[lang].ctaPrimary)}</a></div>
    <h2 class="sec-h">${esc(seo.districts)}</h2>
    <div class="chips">${chips}</div>
    <h2 class="sec-h">${esc(seo.faqTitle)}</h2>
    <div class="faq-list">${faqHtml}</div>` +
    chromeClose(chromeMeta);
}

const robots = `User-agent: *
Allow: /

Sitemap: ${url("sitemap.xml")}
`;

// ── запись ───────────────────────────────────────────────────────────────────
let count = 0;
for (const meta of LANGS) {
  const dir = meta.path ? join(OUT, meta.path) : OUT;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), page(meta));
  const privDir = join(dir, "privacy");
  mkdirSync(privDir, { recursive: true });
  writeFileSync(join(privDir, "index.html"), privacyPage(meta));
  count += 2;

  const guidesDir = join(dir, "guides");
  mkdirSync(guidesDir, { recursive: true });
  writeFileSync(join(guidesDir, "index.html"), guidesHubPage(meta));
  count += 1;
  for (const g of GUIDES) {
    const gDir = join(guidesDir, g.slug);
    mkdirSync(gDir, { recursive: true });
    writeFileSync(join(gDir, "index.html"), guidePage(meta, g));
    count += 1;
  }

  for (const slug of SITE.cities) {
    const cDir = join(dir, "cities", slug);
    mkdirSync(cDir, { recursive: true });
    writeFileSync(join(cDir, "index.html"), cityPage(meta, slug));
    count += 1;
  }
}
writeFileSync(join(OUT, "sitemap.xml"), sitemap());
writeFileSync(join(OUT, "robots.txt"), robots);

console.log(`OK: ${count} страниц + sitemap.xml + robots.txt → ${OUT}`);
console.log("Языки:", LANGS.map((l) => l.hreflang).join(", "));
console.log("Города:", SITE.cities.map((k) => CITY[k].ru).join(", "));
