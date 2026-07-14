// ===========================================================================
// Генератор промо-лендинга Kwadrat PL — статический, 4 языка, single source.
// Названия городов и иконки берутся из ../../webapp (тот же источник, что бот).
// Запуск: node site/_build/generate.mjs  →  пишет site/index.html, site/pl|ua|en,
// robots.txt, sitemap.xml. Контент правится здесь, потом перегенерировать.
// ===========================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const KW = require("../../webapp/i18n.dict.js");
const Icons = require("../../webapp/icons.js");
const CITY = KW.CITY_NAMES;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..");

// ── конфиг ────────────────────────────────────────────────────────────────
const SITE = {
  domain: "https://kwadratpl.pl",
  bot: "https://t.me/KwadratPLBot",
  name: "Kwadrat PL",
  cities: ["warszawa", "krakow", "wroclaw", "gdansk", "poznan", "lodz"],
};

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
    h1: "Аренда жилья в Польше — без посредников и переплат",
    lead: "Kwadrat PL собирает свежие объявления с OLX, Otodom и Morizon в один Telegram-бот. Подпишитесь на поиск — новые квартиры и комнаты придут прямо в чат, раньше других.",
    ctaPrimary: "Открыть бота в Telegram",
    ctaNote: "Без регистрации · 4 языка · внутри Telegram",
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
    altHome: "Главный экран Kwadrat PL: поиск аренды жилья в 6 городах Польши",
    altCards: "Список квартир на аренду с фото, ценой и бейджем «ниже рынка»",
    altSheet: "Карточка объявления: стоимость входа — аренда и кауция — и источник",
    widgetTitle: "Виджет на домашний экран iPhone",
    widgetLead: "Сколько подходящих квартир и свежие цены — прямо на экране, не открывая Telegram. Через бесплатное приложение Scriptable, без App Store-платежей и аккаунта разработчика.",
    widgetImgAlt: "Виджет Kwadrat PL на домашнем экране iPhone: число подходящих квартир и цены аренды",
    widgetSteps: ["Установите бесплатный Scriptable из App Store", "Напишите боту команду /widget и получите личный код", "Добавьте виджет на экран — новые квартиры всегда на виду"],
    citiesTitle: "Города Польши",
    citiesLead: "Аренда квартир и комнат в шести крупнейших городах:",
    faqTitle: "Частые вопросы",
    faq: [
      { q: "Это бесплатно?", a: "Да, полностью. Поиск, уведомления, гайды и калькулятор — без платы и без регистрации." },
      { q: "Откуда объявления?", a: "Мы собираем публичные объявления с OLX, Otodom и Morizon и обновляем их каждые несколько минут. Одинаковые лоты с разных сайтов объединяются." },
      { q: "Что такое AI-разбор?", a: "Кнопка в карточке объявления: переводит текст на ваш язык, делает короткую выжимку и оценивает риск мошенничества по описанию." },
      { q: "На каких языках работает?", a: "Русский, украинский, польский и английский. Язык переключается прямо в приложении." },
      { q: "Как понять, что цена справедливая?", a: "Бот считает медианную цену за м² по району и типу жилья из своих данных и показывает, насколько объявление дешевле или дороже рынка." },
      { q: "Нужно ли устанавливать приложение?", a: "Нет. Kwadrat PL работает внутри Telegram как Mini App — ничего ставить не нужно." },
    ],
    finalTitle: "Пусть дом найдётся!",
    finalLead: "Откройте Kwadrat PL и подпишитесь на свой поиск — новое жильё придёт само.",
    finalCta: "Открыть бота в Telegram",
    footAbout: "Kwadrat PL — поиск аренды жилья в Польше для русско- и украиноязычных. OLX, Otodom, Morizon в одном боте.",
    footLang: "Язык",
    footRights: "Не является агентством недвижимости. Все объявления принадлежат их источникам.",
  },
  ua: {
    title: "Оренда житла в Польщі без посередників — бот Kwadrat PL",
    desc: "Пошук оренди квартир і кімнат у Польщі: OLX, Otodom і Morizon в одному Telegram-боті. Миттєві сповіщення, справедлива ціна, AI-розбір. Безкоштовно.",
    eyebrow: "Telegram-бот для оренди в Польщі",
    h1: "Оренда житла в Польщі — без посередників і переплат",
    lead: "Kwadrat PL збирає свіжі оголошення з OLX, Otodom і Morizon в один Telegram-бот. Підпишіться на пошук — нові квартири й кімнати надійдуть просто в чат, раніше за інших.",
    ctaPrimary: "Відкрити бота в Telegram",
    ctaNote: "Без реєстрації · 4 мови · всередині Telegram",
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
    altHome: "Головний екран Kwadrat PL: пошук оренди житла в 6 містах Польщі",
    altCards: "Список квартир на оренду з фото, ціною та бейджем «нижче ринку»",
    altSheet: "Картка оголошення: вартість входу — оренда й кауція — і джерело",
    widgetTitle: "Віджет на домашній екран iPhone",
    widgetLead: "Скільки відповідних квартир і свіжі ціни — просто на екрані, не відкриваючи Telegram. Через безкоштовний застосунок Scriptable, без оплат App Store і акаунта розробника.",
    widgetImgAlt: "Віджет Kwadrat PL на домашньому екрані iPhone: число відповідних квартир і ціни оренди",
    widgetSteps: ["Установіть безкоштовний Scriptable з App Store", "Напишіть боту команду /widget і отримайте особистий код", "Додайте віджет на екран — нові квартири завжди на очах"],
    citiesTitle: "Міста Польщі",
    citiesLead: "Оренда квартир і кімнат у шести найбільших містах:",
    faqTitle: "Часті запитання",
    faq: [
      { q: "Це безкоштовно?", a: "Так, повністю. Пошук, сповіщення, гайди та калькулятор — без плати й без реєстрації." },
      { q: "Звідки оголошення?", a: "Ми збираємо публічні оголошення з OLX, Otodom і Morizon та оновлюємо їх кожні кілька хвилин. Однакові лоти з різних сайтів об'єднуються." },
      { q: "Що таке AI-розбір?", a: "Кнопка в картці оголошення: перекладає текст вашою мовою, робить коротку вижимку й оцінює ризик шахрайства за описом." },
      { q: "Якими мовами працює?", a: "Українська, російська, польська та англійська. Мова перемикається просто в застосунку." },
      { q: "Як зрозуміти, що ціна справедлива?", a: "Бот рахує медіанну ціну за м² по району й типу житла зі своїх даних і показує, наскільки оголошення дешевше або дорожче за ринок." },
      { q: "Чи потрібно встановлювати застосунок?", a: "Ні. Kwadrat PL працює всередині Telegram як Mini App — нічого ставити не потрібно." },
    ],
    finalTitle: "Хай дім знайдеться!",
    finalLead: "Відкрийте Kwadrat PL і підпишіться на свій пошук — нове житло надійде саме.",
    finalCta: "Відкрити бота в Telegram",
    footAbout: "Kwadrat PL — пошук оренди житла в Польщі для російсько- та україномовних. OLX, Otodom, Morizon в одному боті.",
    footLang: "Мова",
    footRights: "Не є агентством нерухомості. Усі оголошення належать їхнім джерелам.",
  },
  pl: {
    title: "Wynajem mieszkań w Polsce bez pośredników — bot Kwadrat PL",
    desc: "Szukaj mieszkań i pokoi na wynajem: OLX, Otodom i Morizon w jednym bocie Telegram. Natychmiastowe powiadomienia, uczciwa cena, analiza AI. Za darmo.",
    eyebrow: "Bot Telegram do wynajmu w Polsce",
    h1: "Wynajem mieszkań w Polsce — bez pośredników i przepłacania",
    lead: "Kwadrat PL zbiera świeże ogłoszenia z OLX, Otodom i Morizon w jednym bocie Telegram. Zasubskrybuj wyszukiwanie — nowe mieszkania i pokoje trafią prosto na czat, szybciej niż do innych.",
    ctaPrimary: "Otwórz bota w Telegramie",
    ctaNote: "Bez rejestracji · 4 języki · w Telegramie",
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
    altHome: "Ekran główny Kwadrat PL: wyszukiwanie wynajmu w 6 miastach w Polsce",
    altCards: "Lista mieszkań na wynajem ze zdjęciem, ceną i znacznikiem „poniżej rynku”",
    altSheet: "Ogłoszenie: koszt wejścia — najem i kaucja — oraz źródło",
    widgetTitle: "Widżet na ekran główny iPhone'a",
    widgetLead: "Ile pasujących mieszkań i świeże ceny — prosto na ekranie, bez otwierania Telegrama. Przez darmową aplikację Scriptable, bez opłat App Store i konta developera.",
    widgetImgAlt: "Widżet Kwadrat PL na ekranie iPhone'a: liczba pasujących mieszkań i ceny najmu",
    widgetSteps: ["Zainstaluj darmowy Scriptable z App Store", "Napisz do bota komendę /widget i odbierz osobisty kod", "Dodaj widżet na ekran — nowe mieszkania zawsze na widoku"],
    citiesTitle: "Miasta w Polsce",
    citiesLead: "Wynajem mieszkań i pokoi w sześciu największych miastach:",
    faqTitle: "Najczęstsze pytania",
    faq: [
      { q: "Czy to jest za darmo?", a: "Tak, w pełni. Wyszukiwanie, powiadomienia, poradniki i kalkulator — bez opłat i bez rejestracji." },
      { q: "Skąd pochodzą ogłoszenia?", a: "Zbieramy publiczne ogłoszenia z OLX, Otodom i Morizon i odświeżamy je co kilka minut. Te same oferty z różnych serwisów są łączone." },
      { q: "Czym jest analiza AI?", a: "Przycisk w ogłoszeniu: tłumaczy treść na Twój język, tworzy krótkie streszczenie i ocenia ryzyko oszustwa na podstawie opisu." },
      { q: "W jakich językach działa?", a: "Polski, ukraiński, rosyjski i angielski. Język przełączysz bezpośrednio w aplikacji." },
      { q: "Jak poznać, że cena jest uczciwa?", a: "Bot liczy medianę ceny za m² według dzielnicy i typu lokum z własnych danych i pokazuje, o ile ogłoszenie jest tańsze lub droższe od rynku." },
      { q: "Czy trzeba instalować aplikację?", a: "Nie. Kwadrat PL działa wewnątrz Telegrama jako Mini App — niczego nie instalujesz." },
    ],
    finalTitle: "Niech dom się znajdzie!",
    finalLead: "Otwórz Kwadrat PL i zasubskrybuj swoje wyszukiwanie — nowe lokum przyjdzie samo.",
    finalCta: "Otwórz bota w Telegramie",
    footAbout: "Kwadrat PL — wyszukiwanie mieszkań na wynajem w Polsce. OLX, Otodom i Morizon w jednym bocie Telegram.",
    footLang: "Język",
    footRights: "To nie jest agencja nieruchomości. Wszystkie ogłoszenia należą do ich źródeł.",
  },
  en: {
    title: "Rent a home in Poland without agents — Kwadrat PL bot",
    desc: "Find flats and rooms for rent in Poland: OLX, Otodom and Morizon in one Telegram bot. Instant alerts, fair-price check, AI breakdown. Free to use.",
    eyebrow: "Telegram bot for renting in Poland",
    h1: "Rent a home in Poland — no agents, no overpaying",
    lead: "Kwadrat PL gathers fresh listings from OLX, Otodom and Morizon into one Telegram bot. Subscribe to a search and new flats and rooms land right in your chat, before everyone else.",
    ctaPrimary: "Open the bot in Telegram",
    ctaNote: "No sign-up · 4 languages · inside Telegram",
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
    altHome: "Kwadrat PL home screen: searching rentals across 6 cities in Poland",
    altCards: "List of flats for rent with photo, price and a below-market badge",
    altSheet: "Listing card: move-in cost — rent and deposit — and the source",
    widgetTitle: "iPhone home-screen widget",
    widgetLead: "How many matching flats and the latest prices — right on your screen, without opening Telegram. Via the free Scriptable app, no App Store payments and no developer account.",
    widgetImgAlt: "Kwadrat PL widget on an iPhone home screen: number of matching flats and rental prices",
    widgetSteps: ["Install the free Scriptable app from the App Store", "Message the bot the /widget command and get your personal code", "Add the widget to your screen — new flats always in view"],
    citiesTitle: "Cities in Poland",
    citiesLead: "Flats and rooms for rent in the six largest cities:",
    faqTitle: "FAQ",
    faq: [
      { q: "Is it free?", a: "Yes, fully. Search, alerts, guides and the calculator — no fees and no sign-up." },
      { q: "Where do listings come from?", a: "We gather public listings from OLX, Otodom and Morizon and refresh them every few minutes. The same offer across sites is merged." },
      { q: "What is the AI breakdown?", a: "A button on each listing: it translates the text into your language, writes a short summary and scores the scam risk from the description." },
      { q: "Which languages are supported?", a: "English, Polish, Ukrainian and Russian. You switch the language right inside the app." },
      { q: "How do I know the price is fair?", a: "The bot computes the median price per m² by district and home type from its own data and shows how far a listing sits below or above the market." },
      { q: "Do I need to install an app?", a: "No. Kwadrat PL runs inside Telegram as a Mini App — nothing to install." },
    ],
    finalTitle: "May your home find you!",
    finalLead: "Open Kwadrat PL and subscribe to your search — the right place will come to you.",
    finalCta: "Open the bot in Telegram",
    footAbout: "Kwadrat PL — finding rental homes in Poland. OLX, Otodom and Morizon in one Telegram bot.",
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
      "@type": "WebSite",
      "@id": SITE.domain + "/#website",
      url: SITE.domain + "/",
      name: SITE.name,
      inLanguage: meta.hreflang,
      publisher: { "@id": SITE.domain + "/#org" },
    },
    {
      "@type": "Organization",
      "@id": SITE.domain + "/#org",
      name: SITE.name,
      url: SITE.domain + "/",
      logo: url("icon-512.png"),
      sameAs: [SITE.bot],
    },
    {
      "@type": "SoftwareApplication",
      name: SITE.name,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Telegram",
      url: pageUrl,
      inLanguage: LANGS.map((l) => l.hreflang),
      description: c.desc,
      screenshot: [url("shots/shot-home.png"), url("shots/shot-cards.png"),
                   url("shots/shot-sheet.png"), url("shots/shot-widget.png")],
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
    .map(
      (f, i) => `
      <article class="card">
        <div class="ico-wrap">${icon(FEATURE_ICONS[i])}</div>
        <h3>${esc(f.t)}</h3>
        <p>${esc(f.d)}</p>
      </article>`
    )
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

  const cityChips = cities.map((n) => `<span class="chip">${esc(n)}</span>`).join("");

  const faqItems = c.faq
    .map(
      (f) => `
      <details class="faq">
        <summary>${esc(f.q)}</summary>
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
${altLinks(meta.path)}
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#229ED9">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-512.png">
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
  --bg:#ffffff; --bg2:#f5f8fb; --card:#ffffff; --border:#e4eaf0;
  --text:#0e1621; --muted:#5b6b7b; --accent:#229ED9; --accent2:#1b8ec2;
  --radius:16px; --maxw:1040px; --shadow:0 1px 2px rgba(16,32,48,.04),0 8px 24px rgba(16,32,48,.06);
}
@media (prefers-color-scheme:dark){
  :root{ --bg:#0e1621; --bg2:#131f2b; --card:#17212b; --border:#26313d;
    --text:#e7edf3; --muted:#93a4b4; --accent:#3aaee0; --accent2:#54baea;
    --shadow:0 1px 2px rgba(0,0,0,.2),0 10px 30px rgba(0,0,0,.35); }
}
*,*::before,*::after{ box-sizing:border-box }
html{ scroll-behavior:smooth; -webkit-text-size-adjust:100% }
body{ margin:0; background:var(--bg); color:var(--text); line-height:1.6;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji";
  -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility }
a{ color:inherit; text-decoration:none }
h1,h2,h3{ line-height:1.2; text-wrap:balance; margin:0 }
p{ margin:0 }
.wrap{ max-width:var(--maxw); margin:0 auto; padding:0 20px }
.ico{ width:22px; height:22px; stroke-width:2 }

/* header */
.top{ position:sticky; top:0; z-index:10; background:color-mix(in srgb,var(--bg) 88%,transparent);
  backdrop-filter:saturate(1.4) blur(10px); border-bottom:1px solid var(--border) }
.top .wrap{ display:flex; align-items:center; gap:16px; height:60px }
.brand{ display:flex; align-items:center; gap:9px; font-weight:800; font-size:18px; letter-spacing:-.01em }
.brand .mark{ width:34px; height:34px; border-radius:50%; display:inline-block; object-fit:contain }
.langs{ margin-left:auto; display:flex; gap:2px }
.lang{ font-size:13px; font-weight:700; color:var(--muted); padding:6px 9px; border-radius:8px }
.lang:hover{ color:var(--text); background:var(--bg2) }
.lang.on{ color:var(--accent) }
.top .cta{ display:none }
@media(min-width:720px){ .top .cta{ display:inline-flex } }

/* buttons */
.btn{ display:inline-flex; align-items:center; gap:9px; font-weight:700; font-size:16px;
  padding:13px 22px; border-radius:12px; background:var(--accent); color:#fff;
  transition:transform .12s ease, background .12s ease; white-space:nowrap }
.btn:hover{ background:var(--accent2); transform:translateY(-1px) }
.btn svg{ width:20px; height:20px }
.btn.sm{ font-size:14px; padding:9px 15px }
.btn.ghost{ background:var(--bg2); color:var(--text); border:1px solid var(--border) }
.btn.ghost:hover{ background:var(--card) }

/* hero */
.hero{ text-align:center; padding:56px 0 40px }
.hero-logo{ width:112px; height:112px; display:block; margin:0 auto 22px;
  filter:drop-shadow(0 10px 30px rgba(34,158,217,.25)) }
.eyebrow{ display:inline-block; font-size:13px; font-weight:700; letter-spacing:.02em;
  color:var(--accent); background:color-mix(in srgb,var(--accent) 12%,transparent);
  padding:6px 13px; border-radius:999px; margin-bottom:20px }
.hero h1{ font-size:clamp(30px,5.2vw,50px); font-weight:850; letter-spacing:-.02em }
.hero .lead{ max-width:620px; margin:20px auto 0; font-size:clamp(16px,2.2vw,19px); color:var(--muted) }
.hero .actions{ margin-top:30px; display:flex; flex-direction:column; align-items:center; gap:12px }
.hero .note{ font-size:13px; color:var(--muted) }
.trust{ display:flex; flex-wrap:wrap; justify-content:center; gap:8px 10px; margin-top:34px }
.trust span{ font-size:13px; font-weight:600; color:var(--muted); background:var(--bg2);
  border:1px solid var(--border); padding:7px 13px; border-radius:999px }

/* sections */
section{ padding:52px 0 }
.sec-h{ text-align:center; font-size:clamp(23px,3.4vw,32px); font-weight:820; letter-spacing:-.01em; margin-bottom:8px }
.sec-lead{ text-align:center; color:var(--muted); max-width:560px; margin:0 auto 34px }
.alt{ background:var(--bg2) }

/* features */
.grid{ display:grid; grid-template-columns:1fr; gap:16px }
@media(min-width:600px){ .grid{ grid-template-columns:1fr 1fr } }
@media(min-width:900px){ .grid{ grid-template-columns:1fr 1fr 1fr } }
.card{ background:var(--card); border:1px solid var(--border); border-radius:var(--radius);
  padding:24px; box-shadow:var(--shadow) }
.ico-wrap{ display:inline-flex; width:44px; height:44px; border-radius:11px; align-items:center; justify-content:center;
  color:var(--accent); background:color-mix(in srgb,var(--accent) 12%,transparent); margin-bottom:14px }
.card h3{ font-size:17px; font-weight:750; margin-bottom:6px }
.card p{ font-size:14.5px; color:var(--muted) }

/* steps */
.steps{ list-style:none; padding:0; margin:0; display:grid; gap:16px; max-width:720px; margin:0 auto }
@media(min-width:760px){ .steps{ grid-template-columns:1fr 1fr 1fr } }
.step{ display:flex; gap:14px; align-items:flex-start; background:var(--card);
  border:1px solid var(--border); border-radius:var(--radius); padding:20px }
.step-n{ flex:none; width:32px; height:32px; border-radius:9px; font-weight:800; color:#fff;
  background:linear-gradient(135deg,var(--accent),var(--accent2)); display:flex; align-items:center; justify-content:center }
.step h3{ font-size:16px; font-weight:750; margin-bottom:4px }
.step p{ font-size:14px; color:var(--muted) }

/* cities */
.chips{ display:flex; flex-wrap:wrap; justify-content:center; gap:10px }
.chip{ font-weight:700; font-size:15px; background:var(--card); border:1px solid var(--border);
  padding:10px 18px; border-radius:12px }

/* screenshots */
.shots{ display:flex; gap:18px; justify-content:center; flex-wrap:wrap }
.shot{ margin:0; flex:0 1 240px; max-width:250px }
.shot img{ width:100%; height:auto; display:block; border-radius:20px;
  border:1px solid var(--border); box-shadow:var(--shadow); background:var(--card) }

/* widget */
.widget-sec{ display:flex; gap:32px; align-items:center; flex-wrap:wrap; justify-content:center }
.widget-txt{ flex:1 1 300px; max-width:460px }
.widget-txt .sec-h{ text-align:left }
.widget-lead{ color:var(--muted); margin:12px 0 18px }
.wsteps{ margin:0; padding-left:22px; display:grid; gap:9px; font-size:15px }
.wsteps li{ padding-left:3px }
.widget-img{ flex:0 1 440px; margin:0; max-width:100% }
.widget-img img{ width:100%; height:auto; display:block; border-radius:20px; box-shadow:var(--shadow) }

/* faq */
.faq-list{ max-width:720px; margin:0 auto; display:grid; gap:10px }
.faq{ background:var(--card); border:1px solid var(--border); border-radius:12px; overflow:hidden }
.faq summary{ cursor:pointer; padding:16px 20px; font-weight:700; font-size:16px; list-style:none;
  display:flex; justify-content:space-between; align-items:center; gap:12px }
.faq summary::-webkit-details-marker{ display:none }
.faq summary::after{ content:"+"; color:var(--accent); font-size:22px; font-weight:400; line-height:1 }
.faq[open] summary::after{ content:"\\2013" }
.faq-a{ padding:0 20px 18px; color:var(--muted); font-size:14.5px }

/* final cta */
.final{ text-align:center }
.final .box{ background:linear-gradient(135deg,var(--accent),var(--accent2)); color:#fff;
  border-radius:24px; padding:52px 28px }
.final h2{ font-size:clamp(24px,4vw,36px); font-weight:850; color:#fff }
.final p{ max-width:520px; margin:12px auto 26px; color:rgba(255,255,255,.92) }
.final .btn{ background:#fff; color:var(--accent2) }
.final .btn:hover{ background:#f0f6fa }

/* footer */
footer{ border-top:1px solid var(--border); padding:40px 0; margin-top:20px }
.foot-grid{ display:flex; flex-wrap:wrap; gap:24px; justify-content:space-between; align-items:flex-start }
.foot-about{ max-width:420px; color:var(--muted); font-size:14px }
.foot-about .brand{ margin-bottom:10px; color:var(--text) }
.foot-langs{ display:flex; gap:6px; flex-wrap:wrap }
.foot-langs .lang{ border:1px solid var(--border) }
.foot-legal{ margin-top:26px; color:var(--muted); font-size:12.5px; border-top:1px solid var(--border); padding-top:18px }
</style>
</head>
<body>

<header class="top">
  <div class="wrap">
    <a class="brand" href="${url(meta.path)}" aria-label="${esc(SITE.name)}">
      <img class="mark" src="/logo.png" alt="" width="34" height="34"> ${esc(SITE.name)}
    </a>
    <nav class="langs" aria-label="${esc(c.footLang)}">${langSwitcher(lang)}</nav>
    <a class="btn sm cta" href="${SITE.bot}" rel="noopener">${Icons.svg("send")} Telegram</a>
  </div>
</header>

<main>
  <section class="hero">
    <div class="wrap">
      <img class="hero-logo" src="/logo.png" alt="${esc(SITE.name)}" width="112" height="112">
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
        <figure class="shot"><img src="/shots/shot-home.png" width="400" height="870" loading="lazy" alt="${esc(c.altHome)}"></figure>
        <figure class="shot"><img src="/shots/shot-cards.png" width="400" height="870" loading="lazy" alt="${esc(c.altCards)}"></figure>
        <figure class="shot"><img src="/shots/shot-sheet.png" width="385" height="700" loading="lazy" alt="${esc(c.altSheet)}"></figure>
      </div>
    </div>
  </section>

  <section>
    <div class="wrap">
      <div class="widget-sec">
        <div class="widget-txt">
          <h2 class="sec-h">${esc(c.widgetTitle)}</h2>
          <p class="widget-lead">${esc(c.widgetLead)}</p>
          <ol class="wsteps">${c.widgetSteps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
        </div>
        <figure class="widget-img"><img src="/shots/shot-widget.png" width="520" height="420" loading="lazy" alt="${esc(c.widgetImgAlt)}"></figure>
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
</main>

<footer>
  <div class="wrap">
    <div class="foot-grid">
      <div class="foot-about">
        <div class="brand"><img class="mark" src="/logo.png" alt="" width="34" height="34"> ${esc(SITE.name)}</div>
        <p>${esc(c.footAbout)}</p>
      </div>
      <div>
        <div style="font-weight:700;margin-bottom:10px">${esc(c.footLang)}</div>
        <div class="foot-langs">${langSwitcher(lang)}</div>
      </div>
    </div>
    <div class="foot-legal">© ${esc(SITE.name)} · ${esc(c.footRights)}</div>
  </div>
</footer>

</body>
</html>
`;
}

// ── sitemap + robots ─────────────────────────────────────────────────────────
function sitemap() {
  const items = LANGS.map((meta) => {
    const alts = LANGS.map(
      (l) => `    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${url(l.path)}"/>`
    ).join("\n");
    const xdef = `    <xhtml:link rel="alternate" hreflang="x-default" href="${url("")}"/>`;
    return `  <url>
    <loc>${url(meta.path)}</loc>
${alts}
${xdef}
    <changefreq>daily</changefreq>
    <priority>${meta.code === "ru" ? "1.0" : "0.9"}</priority>
  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${items}
</urlset>
`;
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
  count++;
}
writeFileSync(join(OUT, "sitemap.xml"), sitemap());
writeFileSync(join(OUT, "robots.txt"), robots);

console.log(`OK: ${count} страниц + sitemap.xml + robots.txt → ${OUT}`);
console.log("Языки:", LANGS.map((l) => l.hreflang).join(", "));
console.log("Города:", SITE.cities.map((k) => CITY[k].ru).join(", "));
