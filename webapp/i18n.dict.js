// ===========================================================================
// I18N DICT — единый словарь переводов Kwadrat PL (RU / PL / UA / EN).
// ЕДИНСТВЕННЫЙ источник переводов для ОБОИХ фронтендов:
//   webapp/   — подключает <script src="i18n.dict.js"> ПЕРЕД i18n.js
//               (словарь появляется как window.KW_I18N)
//   frontend/ — импортирует этот же файл как CommonJS-модуль:
//               const { DICT, CITY_NAMES, LANGS } = require("../../webapp/i18n.dict.js")
// Не редактируйте переводы в другом месте — иначе фронтенды разъедутся.
// ===========================================================================
(function (root, factory) {
  "use strict";
  var dict = factory();
  if (typeof module === "object" && module.exports) module.exports = dict;
  else root.KW_I18N = dict;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var LANGS = [
    { code: "ru", label: "Русский",    flag: "🇷🇺" },
    { code: "pl", label: "Polski",     flag: "🇵🇱" },
    { code: "ua", label: "Українська", flag: "🇺🇦" },
    { code: "en", label: "English",    flag: "🇬🇧" }
  ];

  var CITY_NAMES = {
    warszawa: { ru: "Варшава", pl: "Warszawa", ua: "Варшава", en: "Warsaw" },
    krakow:   { ru: "Краков",  pl: "Kraków",   ua: "Краків",  en: "Kraków" },
    wroclaw:  { ru: "Вроцлав", pl: "Wrocław",  ua: "Вроцлав", en: "Wrocław" },
    gdansk:   { ru: "Гданьск", pl: "Gdańsk",   ua: "Гданськ", en: "Gdańsk" },
    poznan:   { ru: "Познань", pl: "Poznań",   ua: "Познань", en: "Poznań" },
    lodz:     { ru: "Лодзь",   pl: "Łódź",     ua: "Лодзь",   en: "Łódź" }
  };

  var DICT = {
    /* ── общее ── */
    long:       { ru: "Долгосрочная", pl: "Długoterminowy", ua: "Довгострокова", en: "Long-term" },
    short:      { ru: "Краткосрочная", pl: "Krótkoterminowy", ua: "Короткострокова", en: "Short-term" },
    perMonth:   { ru: "zł/мес", pl: "zł/mies.", ua: "zł/міс", en: "zł/mo" },
    perDay:     { ru: "zł/сутки", pl: "zł/dobę", ua: "zł/доба", en: "zł/day" },
    roomsShort: { ru: "комн.", pl: "pok.", ua: "кімн.", en: "rm" },
    backHome:   { ru: "На главную", pl: "Strona główna", ua: "На головну", en: "Home" },
    toSearch:   { ru: "К поиску", pl: "Do wyszukiwania", ua: "До пошуку", en: "To search" },
    write:      { ru: "Написать", pl: "Napisz", ua: "Написати", en: "Message" },
    openSrc:    { ru: "Открыть объявление", pl: "Otwórz ogłoszenie", ua: "Відкрити оголошення", en: "Open listing" },
    roomsLabel: { ru: "Комнаты", pl: "Pokoje", ua: "Кімнати", en: "Rooms" },
    area:       { ru: "Площадь", pl: "Metraż", ua: "Площа", en: "Area" },
    floor:      { ru: "Этаж", pl: "Piętro", ua: "Поверх", en: "Floor" },
    published:  { ru: "Опубликовано", pl: "Opublikowano", ua: "Опубліковано", en: "Published" },
    justNow:    { ru: "только что", pl: "przed chwilą", ua: "щойно", en: "just now" },
    minAgo:     { ru: "{n} мин назад", pl: "{n} min temu", ua: "{n} хв тому", en: "{n} min ago" },
    hAgo:       { ru: "{n} ч назад", pl: "{n} godz. temu", ua: "{n} год тому", en: "{n} h ago" },
    dAgo:       { ru: "{n} дн назад", pl: "{n} dni temu", ua: "{n} дн тому", en: "{n} d ago" },
    upTo:       { ru: "до", pl: "do", ua: "до", en: "up to" },
    descr: {
      ru: "Светлая квартира после ремонта. Полностью меблирована, вся техника. Рядом остановки и магазины. Залог — один месяц. Возможно с животными по договорённости.",
      pl: "Jasne mieszkanie po remoncie. W pełni umeblowane, pełne AGD. Przystanki i sklepy w pobliżu. Kaucja — jeden miesiąc. Zwierzęta do uzgodnienia.",
      ua: "Світла квартира після ремонту. Повністю мебльована, вся техніка. Поруч зупинки й магазини. Застава — один місяць. Можна з тваринами за домовленістю.",
      en: "Bright, freshly renovated apartment. Fully furnished with all appliances. Public transport and shops nearby. One month deposit. Pets negotiable."
    },

    /* ── главная ── */
    homeSub:    { ru: "Аренда жилья в Польше — поиск и мгновенные уведомления", pl: "Wynajem mieszkań w Polsce — wyszukiwanie i natychmiastowe powiadomienia", ua: "Оренда житла в Польщі — пошук і миттєві сповіщення", en: "Rentals in Poland — search and instant alerts" },
    nextLabel:  { ru: "С чего начать", pl: "Od czego zacząć", ua: "З чого почати", en: "Where to start" },
    nextTitle:  { ru: "Найти квартиру", pl: "Znajdź mieszkanie", ua: "Знайти квартиру", en: "Find a flat" },
    nextHint:   { ru: "6 городов · фильтры по цене и комнатам · снижения цен", pl: "6 miast · filtry ceny i pokoi · obniżki cen", ua: "6 міст · фільтри за ціною і кімнатами · зниження цін", en: "6 cities · price & room filters · price drops" },
    btnSearch:  { ru: "Искать", pl: "Szukaj", ua: "Шукати", en: "Search" },
    btnSubs:    { ru: "Подписки", pl: "Subskrypcje", ua: "Підписки", en: "Alerts" },
    statListings: { ru: "Объявлений", pl: "Ogłoszeń", ua: "Оголошень", en: "Listings" },
    statSubs:   { ru: "Подписки", pl: "Subskrypcje", ua: "Підписки", en: "Alerts" },
    statFavs:   { ru: "Избранное", pl: "Ulubione", ua: "Обране", en: "Saved" },
    secSearch:  { ru: "Поиск", pl: "Wyszukiwanie", ua: "Пошук", en: "Search" },
    secCities:  { ru: "Города", pl: "Miasta", ua: "Міста", en: "Cities" },
    cellLongD:  { ru: "Квартиры и комнаты от месяца", pl: "Mieszkania i pokoje od miesiąca", ua: "Квартири й кімнати від місяця", en: "Flats & rooms, monthly+" },
    cellShortD: { ru: "Посуточно · на первое время", pl: "Na doby · na początek", ua: "Подобово · на перший час", en: "Daily · to get started" },
    cellSubsT:  { ru: "Мои подписки", pl: "Moje subskrypcje", ua: "Мої підписки", en: "My alerts" },
    cellSubsD:  { ru: "Уведомления о новых объявлениях", pl: "Powiadomienia o nowych ogłoszeniach", ua: "Сповіщення про нові оголошення", en: "New-listing notifications" },
    cellFavT:   { ru: "Избранное", pl: "Ulubione", ua: "Обране", en: "Favourites" },
    cellFavD:   { ru: "Отложенные варианты", pl: "Zapisane oferty", ua: "Відкладені варіанти", en: "Saved options" },
    aboutT:     { ru: "О сервисе", pl: "O serwisie", ua: "Про сервіс", en: "About" },
    aboutD:     { ru: "Как работают уведомления и откуда данные", pl: "Jak działają powiadomienia i skąd dane", ua: "Як працюють сповіщення і звідки дані", en: "How alerts work and where data comes from" },
    footHome:   { ru: "Kwadrat PL · бета.\nОбъявления загружаются с OLX и обновляются на сервере.", pl: "Kwadrat PL · beta.\nOgłoszenia pochodzą z OLX i są odświeżane na serwerze.", ua: "Kwadrat PL · бета.\nОголошення завантажуються з OLX і оновлюються на сервері.", en: "Kwadrat PL · beta.\nListings come from OLX and refresh on the server." },
    footHomeDemo: { ru: "Kwadrat PL · демо-режим.\nСервер данных недоступен, показаны тестовые объявления.", pl: "Kwadrat PL · tryb demo.\nSerwer danych niedostępny, pokazano ogłoszenia testowe.", ua: "Kwadrat PL · демо-режим.\nСервер даних недоступний, показано тестові оголошення.", en: "Kwadrat PL · demo mode.\nData server unavailable, showing test listings." },
    subsActive: { ru: "Подписки активны", pl: "Subskrypcje aktywne", ua: "Підписки активні", en: "Alerts active" },
    trackedN:   { ru: "Отслеживается поисков: {n}", pl: "Śledzone wyszukiwania: {n}", ua: "Відстежується пошуків: {n}", en: "Tracked searches: {n}" },
    firstIs:    { ru: "Первый: {s}", pl: "Pierwsze: {s}", ua: "Перший: {s}", en: "First: {s}" },

    /* ── поиск ── */
    searchTitle: { ru: "Поиск жилья", pl: "Szukaj mieszkania", ua: "Пошук житла", en: "Find housing" },
    searchSub:  { ru: "Фильтры применяются мгновенно", pl: "Filtry działają natychmiast", ua: "Фільтри застосовуються миттєво", en: "Filters apply instantly" },
    city:       { ru: "Город", pl: "Miasto", ua: "Місто", en: "City" },
    district:   { ru: "Район", pl: "Dzielnica", ua: "Район", en: "District" },
    rentType:   { ru: "Тип аренды", pl: "Typ najmu", ua: "Тип оренди", en: "Rental type" },
    priceFrom:  { ru: "Цена от", pl: "Cena od", ua: "Ціна від", en: "Price from" },
    priceTo:    { ru: "Цена до", pl: "Cena do", ua: "Ціна до", en: "Price to" },
    areaFrom:   { ru: "Метраж от", pl: "Metraż od", ua: "Площа від", en: "Area from" },
    anyRooms:   { ru: "Любые", pl: "Dowolne", ua: "Будь-які", en: "Any" },
    subscribe:  { ru: "Подписаться на поиск", pl: "Subskrybuj wyszukiwanie", ua: "Підписатися на пошук", en: "Subscribe to this search" },
    sortNew:    { ru: "Сначала новые", pl: "Najnowsze", ua: "Спочатку нові", en: "Newest first" },
    sortPriceAsc: { ru: "Дешевле", pl: "Najtańsze", ua: "Дешевші", en: "Cheapest" },
    sortPriceDesc: { ru: "Дороже", pl: "Najdroższe", ua: "Дорожчі", en: "Most expensive" },
    sortArea:   { ru: "По площади", pl: "Wg metrażu", ua: "За площею", en: "By area" },
    found:      { ru: "Найдено: {n}", pl: "Znaleziono: {n}", ua: "Знайдено: {n}", en: "Found: {n}" },
    allDistricts: { ru: "Все районы", pl: "Wszystkie dzielnice", ua: "Усі райони", en: "All districts" },
    emptyList:  { ru: "Ничего не найдено.\nПопробуйте ослабить фильтры.", pl: "Nic nie znaleziono.\nSpróbuj poluzować filtry.", ua: "Нічого не знайдено.\nСпробуйте послабити фільтри.", en: "Nothing found.\nTry relaxing the filters." },
    simulate:   { ru: "Симуляция: новое объявление", pl: "Symulacja: nowe ogłoszenie", ua: "Симуляція: нове оголошення", en: "Simulate a new listing" },
    footSearch: { ru: "Объявления: OLX (публичный API), обновляются на сервере.\nПодписки-уведомления пока демонстрационные, внутри приложения.", pl: "Ogłoszenia: OLX (publiczne API), odświeżane na serwerze.\nPowiadomienia subskrypcji są na razie demonstracyjne, w aplikacji.", ua: "Оголошення: OLX (публічний API), оновлюються на сервері.\nСповіщення підписок поки демонстраційні, всередині застосунку.", en: "Listings: OLX (public API), refreshed on the server.\nSubscription alerts are demo-only for now, inside the app." },
    footSearchDemo: { ru: "Демо-режим: сервер данных недоступен, показаны тестовые объявления.", pl: "Tryb demo: serwer danych niedostępny, pokazano ogłoszenia testowe.", ua: "Демо-режим: сервер даних недоступний, показано тестові оголошення.", en: "Demo mode: data server unavailable, showing test listings." },
    toastSubT:  { ru: "Подписка оформлена", pl: "Subskrypcja aktywna", ua: "Підписку оформлено", en: "Subscription active" },
    toastSubD:  { ru: "{s} — новые объявления придут в чат", pl: "{s} — nowe ogłoszenia trafią na czat", ua: "{s} — нові оголошення надійдуть у чат", en: "{s} — new listings will arrive in chat" },
    toastNewT:  { ru: "Новое объявление по вашему поиску", pl: "Nowe ogłoszenie z Twojego wyszukiwania", ua: "Нове оголошення за вашим пошуком", en: "New listing matching your search" },
    toastDropT: { ru: "Цена снижена", pl: "Cena obniżona", ua: "Ціну знижено", en: "Price dropped" },
    favAdded:   { ru: "Добавлено в избранное", pl: "Dodano do ulubionych", ua: "Додано в обране", en: "Added to favourites" },
    favRemoved: { ru: "Убрано из избранного", pl: "Usunięto z ulubionych", ua: "Прибрано з обраного", en: "Removed from favourites" },

    /* ── подписки ── */
    savedTitle: { ru: "Подписки и избранное", pl: "Subskrypcje i ulubione", ua: "Підписки та обране", en: "Alerts & favourites" },
    savedSub:   { ru: "Уведомления приходят мгновенно при появлении подходящего объявления", pl: "Powiadomienia przychodzą natychmiast, gdy pojawi się pasujące ogłoszenie", ua: "Сповіщення надходять миттєво, щойно з'явиться відповідне оголошення", en: "Alerts arrive the moment a matching listing appears" },
    secSaved:   { ru: "Сохранённые поиски", pl: "Zapisane wyszukiwania", ua: "Збережені пошуки", en: "Saved searches" },
    secFav:     { ru: "Избранное", pl: "Ulubione", ua: "Обране", en: "Favourites" },
    emptySaved: { ru: "Пока нет сохранённых поисков.\nНастройте фильтры на странице поиска и нажмите «Подписаться».", pl: "Brak zapisanych wyszukiwań.\nUstaw filtry na stronie wyszukiwania i kliknij „Subskrybuj”.", ua: "Поки немає збережених пошуків.\nНалаштуйте фільтри на сторінці пошуку й натисніть «Підписатися».", en: "No saved searches yet.\nSet filters on the search page and tap “Subscribe”." },
    emptyFav:   { ru: "Избранное пусто.\nНажмите ♥ на карточке объявления, чтобы отложить его сюда.", pl: "Ulubione są puste.\nKliknij ♥ na karcie ogłoszenia, aby je tu zapisać.", ua: "Обране порожнє.\nНатисніть ♥ на картці оголошення, щоб відкласти його сюди.", en: "Favourites are empty.\nTap ♥ on a listing card to save it here." },
    notifyOn:   { ru: "Уведомления включены", pl: "Powiadomienia włączone", ua: "Сповіщення увімкнено", en: "Notifications on" },
    notifyOff:  { ru: "Уведомления выключены", pl: "Powiadomienia wyłączone", ua: "Сповіщення вимкнено", en: "Notifications off" },
    footSaved:  { ru: "Подписки хранятся на устройстве.\nВ боевой версии — на сервере, уведомления через бота.", pl: "Subskrypcje są zapisane na urządzeniu.\nW wersji produkcyjnej — na serwerze, powiadomienia przez bota.", ua: "Підписки зберігаються на пристрої.\nУ бойовій версії — на сервері, сповіщення через бота.", en: "Alerts are stored on this device.\nIn production — on the server, delivered by the bot." },

    /* ── о сервисе ── */
    aboutSub:   { ru: "Kwadrat PL — поиск аренды жилья в Польше", pl: "Kwadrat PL — wyszukiwarka najmu w Polsce", ua: "Kwadrat PL — пошук оренди житла в Польщі", en: "Kwadrat PL — rental search in Poland" },
    f1t: { ru: "Гибкий поиск", pl: "Elastyczne wyszukiwanie", ua: "Гнучкий пошук", en: "Flexible search" },
    f1d: { ru: "Город, район, тип аренды, цена, комнаты, метраж — результат обновляется мгновенно.", pl: "Miasto, dzielnica, typ najmu, cena, pokoje, metraż — wynik odświeża się natychmiast.", ua: "Місто, район, тип оренди, ціна, кімнати, площа — результат оновлюється миттєво.", en: "City, district, rental type, price, rooms, area — results update instantly." },
    f2t: { ru: "Мгновенные уведомления", pl: "Natychmiastowe powiadomienia", ua: "Миттєві сповіщення", en: "Instant alerts" },
    f2d: { ru: "Подпишитесь на поиск — новые подходящие объявления придут прямо в чат с ботом.", pl: "Subskrybuj wyszukiwanie — nowe pasujące ogłoszenia trafią prosto na czat z botem.", ua: "Підпишіться на пошук — нові відповідні оголошення надійдуть просто в чат із ботом.", en: "Subscribe to a search — new matching listings arrive right in the bot chat." },
    f3t: { ru: "Отслеживание цен", pl: "Śledzenie cen", ua: "Відстеження цін", en: "Price tracking" },
    f3d: { ru: "Сервис помнит историю цены каждого объявления и сообщает о снижениях.", pl: "Serwis pamięta historię ceny każdego ogłoszenia i informuje o obniżkach.", ua: "Сервіс пам'ятає історію ціни кожного оголошення й повідомляє про зниження.", en: "The service tracks each listing's price history and reports drops." },
    f4t: { ru: "Без дублей", pl: "Bez duplikatów", ua: "Без дублів", en: "No duplicates" },
    f4d: { ru: "Одно и то же объявление с разных площадок показывается один раз.", pl: "To samo ogłoszenie z różnych portali pokazuje się raz.", ua: "Те саме оголошення з різних майданчиків показується один раз.", en: "The same listing from different portals is shown once." },
    statusT: { ru: "Статус: бета", pl: "Status: beta", ua: "Статус: бета", en: "Status: beta" },
    statusD: { ru: "Объявления загружаются с OLX через публичный API и регулярно обновляются на сервере. Уведомления о новых объявлениях пока работают в демонстрационном режиме внутри приложения; отправка через бота — в разработке.", pl: "Ogłoszenia pochodzą z OLX (publiczne API) i są regularnie odświeżane na serwerze. Powiadomienia o nowych ogłoszeniach działają na razie w trybie demonstracyjnym w aplikacji; wysyłka przez bota — w przygotowaniu.", ua: "Оголошення завантажуються з OLX через публічний API і регулярно оновлюються на сервері. Сповіщення про нові оголошення поки працюють у демонстраційному режимі всередині застосунку; надсилання через бота — в розробці.", en: "Listings come from OLX via the public API and refresh regularly on the server. New-listing alerts currently run in demo mode inside the app; bot delivery is in the works." },
    authorT: { ru: "Об авторе", pl: "O autorze", ua: "Про автора", en: "About the author" },
    authorP1: { ru: "Kwadrat PL — независимый проект: удобный поиск аренды в Польше прямо в Telegram. Собран и поддерживается одним человеком в свободное время. Если сервис оказался полезным — можно поблагодарить автора. Это не обязательно и ни на что не влияет 🙂", pl: "Kwadrat PL to niezależny projekt: wygodne wyszukiwanie najmu w Polsce prosto w Telegramie. Tworzony i utrzymywany przez jedną osobę w wolnym czasie. Jeśli serwis okazał się pomocny — można podziękować autorowi. To nieobowiązkowe i na nic nie wpływa 🙂", ua: "Kwadrat PL — незалежний проєкт: зручний пошук оренди в Польщі просто в Telegram. Зібраний і підтримується однією людиною у вільний час. Якщо сервіс став у пригоді — можна подякувати автору. Це не обов'язково й ні на що не впливає 🙂", en: "Kwadrat PL is an independent project: convenient rental search in Poland right inside Telegram. Built and maintained by one person in their spare time. If it helped you — you can thank the author. Totally optional 🙂" },
    authorP2: { ru: "Нашли ошибку или хотите такого же бота под свою задачу — пишите", pl: "Znalazłeś błąd albo chcesz podobnego bota do swojego zadania — napisz", ua: "Знайшли помилку або хочете такого ж бота під своє завдання — пишіть", en: "Found a bug or want a similar bot for your own task — message" },
    donateCoffee: { ru: "Угостить кофе", pl: "Postaw kawę", ua: "Пригостити кавою", en: "Buy me a coffee" },
    donateThanks: { ru: "Просто сказать спасибо", pl: "Po prostu podziękować", ua: "Просто подякувати", en: "Just say thanks" },
    langBtn: { ru: "Язык", pl: "Język", ua: "Мова", en: "Language" },

    /* ── условия и источники ── */
    featuresLabel: { ru: "Условия", pl: "Udogodnienia", ua: "Умови", en: "Amenities" },
    fPets:    { ru: "С животными", pl: "Ze zwierzętami", ua: "З тваринами", en: "Pets OK" },
    fParking: { ru: "Парковка", pl: "Parking", ua: "Парковка", en: "Parking" },
    fBalcony: { ru: "Балкон", pl: "Balkon", ua: "Балкон", en: "Balcony" },
    secSettings: { ru: "Настройки", pl: "Ustawienia", ua: "Налаштування", en: "Settings" },
    fbT: { ru: "Facebook-группы (бета)", pl: "Grupy na Facebooku (beta)", ua: "Facebook-групи (бета)", en: "Facebook groups (beta)" },
    fbD: { ru: "Дополнительный источник: объявления из групп аренды. По умолчанию выключен.", pl: "Dodatkowe źródło: ogłoszenia z grup najmu. Domyślnie wyłączone.", ua: "Додаткове джерело: оголошення з груп оренди. Типово вимкнено.", en: "Extra source: listings from rental groups. Off by default." },
    srcOn:  { ru: "Источник включён", pl: "Źródło włączone", ua: "Джерело увімкнено", en: "Source enabled" },
    srcOff: { ru: "Источник выключен", pl: "Źródło wyłączone", ua: "Джерело вимкнено", en: "Source disabled" },
    sourceLabel: { ru: "Источник", pl: "Źródło", ua: "Джерело", en: "Source" },
    footAbout: { ru: "Kwadrat PL · Mini App для Telegram", pl: "Kwadrat PL · Mini App dla Telegrama", ua: "Kwadrat PL · Mini App для Telegram", en: "Kwadrat PL · Telegram Mini App" }
  };

  return { LANGS: LANGS, CITY_NAMES: CITY_NAMES, DICT: DICT };
});
