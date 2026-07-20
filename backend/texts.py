# ===========================================================================
# Все тексты уведомлений бота (5 языков) + форматирование сообщений.
# Матчинг (matching.py) зависит от CITY отсюда; больше в эту сторону
# зависимостей нет — texts.py сам ничего внутреннего не импортирует.
# ===========================================================================
import html
import urllib.parse

CITY = {
    "warszawa": {"ru": "Варшава", "pl": "Warszawa", "ua": "Варшава", "by": "Варшава", "en": "Warsaw"},
    "krakow": {"ru": "Краков", "pl": "Kraków", "ua": "Краків", "by": "Кракаў", "en": "Kraków"},
    "wroclaw": {"ru": "Вроцлав", "pl": "Wrocław", "ua": "Вроцлав", "by": "Уроцлаў", "en": "Wrocław"},
    "gdansk": {"ru": "Гданьск", "pl": "Gdańsk", "ua": "Гданськ", "by": "Гданьск", "en": "Gdańsk"},
    "poznan": {"ru": "Познань", "pl": "Poznań", "ua": "Познань", "by": "Познань", "en": "Poznań"},
    "lodz": {"ru": "Лодзь", "pl": "Łódź", "ua": "Лодзь", "by": "Лодзь", "en": "Łódź"},
    "zakopane": {"ru": "Закопане", "pl": "Zakopane", "ua": "Закопане", "by": "Закапанэ", "en": "Zakopane"},
    "bialystok": {"ru": "Белосток", "pl": "Białystok", "ua": "Білосток", "by": "Беласток", "en": "Białystok"},
}
T = {
    "new": {"ru": "Новое объявление по вашей подписке",
            "pl": "Nowe ogłoszenie z Twojej subskrypcji",
            "ua": "Нове оголошення за вашою підпискою",
            "by": "Новая аб'ява па вашай падпісцы",
            "en": "New listing matching your alert"},
    # паблик-чат-фид находок (community.py) — {pct} без знака, знак минус
    # добавляет заголовок сам, эмодзи-заголовок уже сигналит суть
    "deal": {"ru": "Находка: на {pct}% ниже рынка района",
             "pl": "Okazja: {pct}% poniżej rynku dzielnicy",
             "ua": "Знахідка: на {pct}% нижче ринку району",
             "by": "Знаходка: на {pct}% ніжэй рынку раёна",
             "en": "Deal: {pct}% below district market"},
    "more": {"ru": "…и ещё {n} — смотрите в приложении",
             "pl": "…i jeszcze {n} — zobacz w aplikacji",
             "ua": "…і ще {n} — дивіться в застосунку",
             "by": "…і яшчэ {n} — глядзіце ў праграме",
             "en": "…and {n} more — see the app"},
    "open": {"ru": "Открыть объявление", "pl": "Otwórz ogłoszenie",
             "ua": "Відкрити оголошення", "by": "Адкрыць аб'яву", "en": "Open listing"},
    # кнопки пуша: шторка в Mini App (AI-разбор/избранное/объяснение) и оценка локации
    "in_app": {"ru": "✨ Разбор в приложении", "pl": "✨ Analiza w aplikacji",
               "ua": "✨ Розбір у застосунку", "by": "✨ Разбор у праграме",
               "en": "✨ Analysis in the app"},
    "loc_btn": {"ru": "📍 Локация", "pl": "📍 Lokalizacja",
                "ua": "📍 Локація", "by": "📍 Лакацыя", "en": "📍 Location"},
    # донаты Telegram Stars
    "donate_pick": {
        "ru": "⭐ Поддержать проект звёздами Telegram — выбери сумму:",
        "pl": "⭐ Wesprzyj projekt gwiazdkami Telegrama — wybierz kwotę:",
        "ua": "⭐ Підтримати проєкт зірками Telegram — обери суму:",
        "by": "⭐ Падтрымаць праект зоркамі Telegram — абяры суму:",
        "en": "⭐ Support the project with Telegram Stars — pick an amount:"},
    "donate_title": {"ru": "Поддержка Kwadrat PL", "pl": "Wsparcie Kwadrat PL",
                     "ua": "Підтримка Kwadrat PL", "by": "Падтрымка Kwadrat PL",
                     "en": "Support Kwadrat PL"},
    "donate_desc": {
        "ru": "Бот бесплатный и без рекламы. Звёзды идут на домен, сервер, AI-разбор и Google API.",
        "pl": "Bot jest darmowy i bez reklam. Gwiazdki pokrywają domenę, serwer, analizę AI i Google API.",
        "ua": "Бот безкоштовний і без реклами. Зірки йдуть на домен, сервер, AI-розбір і Google API.",
        "by": "Бот бясплатны і без рэкламы. Зоркі ідуць на дамен, сервер, AI-разбор і Google API.",
        "en": "The bot is free and ad-free. Stars cover the domain, server, AI analysis and Google API."},
    "donate_thanks": {
        "ru": "Спасибо за поддержку! 💛 Пусть дом найдётся!",
        "pl": "Dziękuję za wsparcie! 💛 Niech dom się znajdzie!",
        "ua": "Дякую за підтримку! 💛 Хай дім знайдеться!",
        "by": "Дзякуй за падтрымку! 💛 Хай дом знойдзецца!",
        "en": "Thank you for the support! 💛 May your home find you!"},
    "unit_long": {"ru": "zł/мес", "pl": "zł/mies.", "ua": "zł/міс", "by": "zł/мес", "en": "zł/mo"},
    "unit_short": {"ru": "zł/сутки", "pl": "zł/dobę", "ua": "zł/доба", "by": "zł/суткі", "en": "zł/day"},
    "start": {
        "ru": "👋 Привет! Я Kwadrat PL — новый опыт поиска жилья в Польше.\n\n"
              "🏠 Квартиры, комнаты и посуточное жильё в 8 городах, живые объявления с OLX, Otodom и Morizon.\n"
              "🔔 Подпишитесь на поиск в приложении — новые объявления придут прямо сюда.\n"
              "📚 Внутри — гайды: кауция, договор, готовые фразы по-польски.\n\n"
              "Пусть дом найдётся! 🏠",
        "pl": "👋 Cześć! Jestem Kwadrat PL — nowe doświadczenie szukania mieszkania w Polsce.\n\n"
              "🏠 Mieszkania, pokoje i noclegi w 8 miastach, ogłoszenia na żywo z OLX, Otodom i Morizon.\n"
              "🔔 Subskrybuj wyszukiwanie w aplikacji — nowe ogłoszenia trafią prosto tutaj.\n"
              "📚 W środku przewodniki: kaucja, umowa, gotowe wiadomości.\n\n"
              "Niech dom się znajdzie! 🏠",
        "ua": "👋 Привіт! Я Kwadrat PL — новий досвід пошуку житла в Польщі.\n\n"
              "🏠 Квартири, кімнати й подобове житло у 8 містах, живі оголошення з OLX, Otodom і Morizon.\n"
              "🔔 Підпишіться на пошук у застосунку — нові оголошення надійдуть просто сюди.\n"
              "📚 Усередині — гайди: кауція, договір, готові фрази польською.\n\n"
              "Хай дім знайдеться! 🏠",
        "by": "👋 Прывітанне! Я Kwadrat PL — новы досвед пошуку жылля ў Польшчы.\n\n"
              "🏠 Кватэры, пакоі і пасутачнае жыллё ў 8 гарадах, жывыя аб'явы з OLX, Otodom і Morizon.\n"
              "🔔 Падпішыцеся на пошук у праграме — новыя аб'явы прыйдуць проста сюды.\n"
              "📚 Унутры — гайды: задатак, дамова, гатовыя фразы па-польску.\n\n"
              "Няхай дом знойдзецца! 🏠",
        "en": "👋 Hi! I'm Kwadrat PL — a new way to find a home in Poland.\n\n"
              "🏠 Flats, rooms and short stays in 8 cities, live listings from OLX, Otodom and Morizon.\n"
              "🔔 Subscribe to a search in the app — new listings will arrive right here.\n"
              "📚 Inside: guides on deposits, contracts and ready-made Polish messages.\n\n"
              "May your home find you! 🏠",
    },
    "start_btn": {"ru": "🔎 Открыть поиск", "pl": "🔎 Otwórz wyszukiwarkę",
                  "ua": "🔎 Відкрити пошук", "by": "🔎 Адкрыць пошук", "en": "🔎 Open search"},
    "digest": {"ru": "🌅 Пока уведомления были на паузе, по вашим подпискам появилось новых объявлений: {n}. Загляните в приложение!",
               "pl": "🌅 Podczas ciszy nocnej pojawiło się {n} nowych ogłoszeń z Twoich subskrypcji. Zajrzyj do aplikacji!",
               "ua": "🌅 Поки сповіщення були на паузі, за вашими підписками з'явилося нових оголошень: {n}. Загляньте в застосунок!",
               "by": "🌅 Пакуль апавяшчэнні былі на паўзе, па вашых падпісках з'явілася новых аб'яў: {n}. Зазірніце ў праграму!",
               "en": "🌅 While alerts were paused, {n} new listings matched your searches. Take a look in the app!"},
    "muted": {"ru": "🔕 Уведомления выключены. Включить снова: /on",
              "pl": "🔕 Powiadomienia wyłączone. Włącz ponownie: /on",
              "ua": "🔕 Сповіщення вимкнено. Увімкнути знову: /on",
              "by": "🔕 Апавяшчэнні выключаны. Уключыць зноў: /on",
              "en": "🔕 Notifications paused. Turn back on: /on"},
    "unmuted": {"ru": "🔔 Уведомления включены. Пауза: /off",
                "pl": "🔔 Powiadomienia włączone. Pauza: /off",
                "ua": "🔔 Сповіщення увімкнено. Пауза: /off",
                "by": "🔔 Апавяшчэнні ўключаны. Паўза: /off",
                "en": "🔔 Notifications on. Pause: /off"},
}


def lang_of(code: str | None) -> str:
    code = (code or "").lower()
    if code.startswith("uk"):
        return "ua"
    if code.startswith("pl"):
        return "pl"
    if code.startswith("be"):
        return "by"
    if code.startswith("ru"):
        return "ru"
    return "en"


# ── alert explainability: описание подписки, по которой сработал пуш ──────────
_TYPE_LBL = {
    "long":  {"ru": "долгосрочная", "pl": "długoterminowy", "ua": "довгострокова", "by": "доўгатэрміновая", "en": "long-term"},
    "short": {"ru": "посуточно", "pl": "na doby", "ua": "подобово", "by": "пасутачна", "en": "short-stay"},
    "room":  {"ru": "комната", "pl": "pokój", "ua": "кімната", "by": "пакой", "en": "room"},
}
_OWNER_LBL = {
    "private": {"ru": "частник", "pl": "prywatne", "ua": "приватник", "by": "прыватнік", "en": "private"},
    "agency":  {"ru": "агентство", "pl": "biuro", "ua": "агентство", "by": "агенцтва", "en": "agency"},
}
_FEAT_LBL = {
    "pets":    {"ru": "с животными", "pl": "ze zwierzętami", "ua": "з тваринами", "by": "з жывёламі", "en": "pets"},
    "parking": {"ru": "паркинг", "pl": "parking", "ua": "паркінг", "by": "паркінг", "en": "parking"},
    "balcony": {"ru": "балкон", "pl": "balkon", "ua": "балкон", "by": "балкон", "en": "balcony"},
}
_ROOM_LBL = {"ru": "комн.", "pl": "pok.", "ua": "кімн.", "by": "пак.", "en": "rooms"}
_FLOOR_LBL = {"ru": "эт.", "pl": "p.", "ua": "пов.", "by": "пав.", "en": "fl."}
_ALERT_HDR = {"ru": "по поиску", "pl": "wyszukiwanie", "ua": "за пошуком", "by": "па пошуку", "en": "your search"}


def _num(n: int) -> str:
    return f"{int(n):,}".replace(",", " ")


def sub_label(s: dict, lang: str) -> str:
    """Человекочитаемое описание подписки — «почему сработал этот алерт».
    Символы ≤ ≥ – вместо слов, чтобы не плодить переводы для цены/площади."""
    parts = [CITY.get(s.get("city"), {}).get(lang, str(s.get("city", "")))]
    if s.get("type") in _TYPE_LBL:
        parts.append(_TYPE_LBL[s["type"]][lang])
    if s.get("district"):
        parts.append(str(s["district"]))
    pmin, pmax = s.get("priceMin"), s.get("priceMax")
    if pmin and pmax:
        parts.append(f"{_num(pmin)}–{_num(pmax)} zł")
    elif pmax:
        parts.append(f"≤{_num(pmax)} zł")
    elif pmin:
        parts.append(f"≥{_num(pmin)} zł")
    if s.get("areaMin"):
        parts.append(f"≥{s['areaMin']} m²")
    if s.get("rooms"):
        r = s["rooms"]
        parts.append((f"{r}+ " if r == 4 else f"{r} ") + _ROOM_LBL[lang])
    if s.get("owner") in _OWNER_LBL:
        parts.append(_OWNER_LBL[s["owner"]][lang])
    for f in ("pets", "parking", "balcony"):
        if s.get(f):
            parts.append(_FEAT_LBL[f][lang])
    return " · ".join(html.escape(str(p)) for p in parts)


def fmt_listing(l: dict, lang: str, sub: dict | None = None, deal_pct: float | None = None) -> str:
    # ВСЁ из данных объявления экранируем: parse_mode=HTML, а title/district
    # исходно пишут авторы объявлений на OLX (символ '<' валил бы send_message)
    unit = T["unit_short" if l.get("type") == "short" else "unit_long"][lang]
    try:
        price = int(l.get("price") or 0)
    except (TypeError, ValueError):
        price = 0
    head = "<b>" + f"{price:,}".replace(",", " ") + f" {unit}</b>"
    title = str(l.get("title") or "").strip()
    if title:
        head += " · " + html.escape(title[:90])
    # «таблица» характеристик — набор с эмодзи-метками
    specs = []
    if l.get("rooms"):
        specs.append("🛏 " + html.escape(f"{l['rooms']} {_ROOM_LBL[lang]}"))
    if l.get("area"):
        specs.append("📐 " + html.escape(f"{l['area']} m²"))
    if l.get("floor") is not None:
        specs.append("🏢 " + html.escape(f"{l['floor']} {_FLOOR_LBL[lang]}"))
    city = CITY.get(l.get("city"), {}).get(lang, str(l.get("city", "")))
    place = city + (f", {l['district']}" if l.get("district") else "")
    tags = []
    if l.get("source"):
        tags.append(str(l["source"]))
    if l.get("agency") is True:
        tags.append(_OWNER_LBL["agency"][lang])
    elif l.get("agency") is False:
        tags.append(_OWNER_LBL["private"][lang])
    if deal_pct is not None:
        header = T["deal"][lang].format(pct=round(abs(deal_pct) * 100))
        lines = [f"🔥 <b>{header}</b>", "", head]
    else:
        lines = [f"🔔 <b>{T['new'][lang]}</b>", "", head]
    if specs:
        lines.append(" · ".join(specs))
    lines.append("📍 " + html.escape(place))
    if tags:
        lines.append("🏷 " + html.escape(" · ".join(tags)))
    if sub:
        lines.append(f"🔎 <i>{html.escape(_ALERT_HDR[lang])}: {sub_label(sub, lang)}</i>")
    return "\n".join(lines)


_ALLOWED_HOSTS = ("olx.pl", "otodom.pl", "morizon.pl")


def safe_listing_url(url) -> str | None:
    """Кнопку даём только на https-ссылки наших источников — url из данных."""
    try:
        p = urllib.parse.urlparse(str(url or ""))
        host = (p.netloc or "").lower()
        if p.scheme == "https" and any(
                host == h or host.endswith("." + h) for h in _ALLOWED_HOSTS):
            return str(url)
    except ValueError:
        pass
    return None


# ── AI-разбор: имена языков для промпта + тексты шейрабельного сообщения ──────
AI_LANG_NAME = {"ru": "Russian", "pl": "Polish", "ua": "Ukrainian", "by": "Belarusian", "en": "English"}

_AI_SCAM_LBL = {
    "high":   {"ru": "🚨 Высокий риск мошенничества", "pl": "🚨 Wysokie ryzyko oszustwa",
               "ua": "🚨 Високий ризик шахрайства", "by": "🚨 Высокі рызыка шахрайства", "en": "🚨 High scam risk"},
    "medium": {"ru": "⚠️ Средний риск", "pl": "⚠️ Średnie ryzyko",
               "ua": "⚠️ Середній ризик", "by": "⚠️ Сярэдні рызыка", "en": "⚠️ Medium risk"},
    "low":    {"ru": "✅ Риск низкий", "pl": "✅ Niskie ryzyko",
               "ua": "✅ Ризик низький", "by": "✅ Рызыка нізкі", "en": "✅ Low risk"},
}
_SHARE_HDR = {"ru": "AI-разбор объявления", "pl": "Analiza AI ogłoszenia",
              "ua": "AI-розбір оголошення", "by": "AI-разбор аб'явы", "en": "AI listing breakdown"}
_SHARE_FOOT = {"ru": "Проверено ботом Kwadrat PL — аренда в Польше без посредников",
               "pl": "Sprawdzone przez Kwadrat PL — wynajem w Polsce bez pośredników",
               "ua": "Перевірено ботом Kwadrat PL — оренда в Польщі без посередників",
               "by": "Правера ботам Kwadrat PL — арэнда ў Польшчы без пасярэднікаў",
               "en": "Checked with Kwadrat PL — renting in Poland without agents"}
_SHARE_BTN = {"ru": "Открыть Kwadrat PL", "pl": "Otwórz Kwadrat PL",
              "ua": "Відкрити Kwadrat PL", "by": "Адкрыць Kwadrat PL", "en": "Open Kwadrat PL"}


def fmt_share(l: dict, data: dict, lang: str) -> str:
    unit = T["unit_short" if l.get("type") == "short" else "unit_long"][lang]
    try:
        price = int(l.get("price") or 0)
    except (TypeError, ValueError):
        price = 0
    city = CITY.get(l.get("city"), {}).get(lang, str(l.get("city", "")))
    place = city + (f", {l['district']}" if l.get("district") else "")
    title = html.escape(str(data.get("title") or l.get("title") or "")[:100])
    summary = [html.escape(str(s)) for s in (data.get("summary") or []) if s][:6]
    scam = _AI_SCAM_LBL.get(data.get("scam_level"), _AI_SCAM_LBL["low"])[lang]
    flags = [html.escape(str(f)) for f in (data.get("scam_flags") or []) if f][:4]
    lines = [f"✨ <b>{html.escape(_SHARE_HDR[lang])}</b>", ""]
    if title:
        lines.append(f"<b>{title}</b>")
    lines.append(f"{price:,}".replace(",", " ") + f" {unit} · " + html.escape(place))
    if summary:
        lines.append("")
        lines += ["• " + s for s in summary]
    lines += ["", scam]
    if flags:
        lines.append("• " + "\n• ".join(flags))
    lines += ["", f"<i>{html.escape(_SHARE_FOOT[lang])}</i>"]
    return "\n".join(lines)
