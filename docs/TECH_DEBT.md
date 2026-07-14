# Технический долг KwadratPL — план

Этот файл — «память» проекта по техдолгу: что осталось, **откуда → куда → зачем → как**.
Пиши сюда при изменении статуса. Обновлено: 2026-07-14.

## Контекст: что уже закрыто (чтобы не делать дважды)

| Долг | Статус | Где |
|------|--------|-----|
| AI-кэш и суточные лимиты в памяти процесса | ✅ перенесено в SQLite | `backend/app.py` таблицы `ai_cache` (TTL-eviction), `ai_user_day` |
| Ручной `scp`-деплой, хардкод `root@IP` | ✅ CI/CD-деплой + env-хост | `.github/workflows/ci.yml` (job `deploy`), `deploy-vps.sh` (`KWADRAT_VPS`) |
| Нет тестов / quality-gate | ✅ pytest (22) + i18n-чек + CI | `backend/tests/`, `webapp/_test/check-i18n.mjs` |
| Асимметрия trust в ссылках, privacy/RODO, alert explainability | ✅ | см. `kwadratpl-bot-state` memory |

Инфраструктура деплоя: push в `main` → CI (backend pytest + frontend checks) →
если зелёные, job `deploy` по SSH (ed25519-ключ в секретах `VPS_SSH_KEY`/`VPS_HOST`)
кладёт webapp+backend+tools на VPS и рестартит `kwadratpl-api`.
**Важно:** теперь любой рефакторинг защищён тестами — это снимает главный риск распила.

---

## 1. Распил монолита `backend/app.py` (1169 строк)  ⬅ приоритет №1

### Откуда (сейчас)
Один файл `backend/app.py` держит ВЕСЬ backend-домен. Секции (по `grep '^# ──'`):
- конфиг/env (строки ~50–70), `db()`/`init_db()` (72–154),
- `validate_init_data` (156), `matches()` (179), `_clean_sub()` (в /api/subs),
- тексты уведомлений: `CITY`, `T`, `_*_LBL`, `lang_of`, `sub_label`, `fmt_listing`, `fmt_share` (207–375, 829–873),
- бот: `Bot`/`Dispatcher`, хендлеры `/start /off /on /stats /widget`, `notify_user`, `digest_loop` (402–573),
- FastAPI `lifespan` + эндпоинты: `/api/health`, `/api/ai-stats`, `/api/widget/*`, `/api/analyze`, `/api/analyze/share`, `/api/subs` (GET/PUT/DELETE), `/api/listings` (ingest) (574–1169),
- AI: `_ai_get_client`, `analyze`, кэш/лимит (713–828).

### Куда (цель)
Пакет вместо файла — тонкий `app.py` собирает FastAPI и подключает роутеры:
```
backend/
  app.py           # ТОНКИЙ: FastAPI(), lifespan, include_router(...), запуск бота
  config.py        # env-константы: BOT_TOKEN, INGEST_TOKEN, ANALYZE_MODEL, AI_*, ADMIN_IDS, WEBAPP_URL, TZ
  db.py            # db(), init_db()  (единственное место с DDL)
  auth.py          # validate_init_data(), _auth_user()
  matching.py      # matches(), _clean_sub()
  texts.py         # CITY, T, _TYPE/_OWNER/_ROOM/_FLOOR/_AI_SCAM/_SHARE_*_LBL, lang_of, sub_label, fmt_listing, fmt_share, safe_listing_url
  bot.py           # bot, dp, хендлеры команд, notify_user(), digest_loop(), _preview/_issue_widget_token
  routers/
    health.py      # /api/health
    subs.py        # /api/subs GET/PUT/DELETE
    listings.py    # /api/listings (ingest, _write_listings, _ingest_lock, price-history)
    analyze.py     # /api/analyze, /api/analyze/share, /api/ai-stats, _ai_get_client, _ai_stats
    widget.py      # /api/widget/connect|state|action|disconnect, _widget_*
```

### Зачем
- Сейчас любое изменение = чтение 1169 строк; онбординг, ревью, on-call дороже.
- Тесты уже есть → рефакторинг безопасен, но крупный файл мешает точечным правкам.
- Роутеры FastAPI (`APIRouter`) — идиоматичный способ, минимальный риск.

### Как (пошагово, каждый шаг — отдельный коммит под зелёным CI)
1. Вынести **чистые, беззависимые** куски первыми: `texts.py`, `matching.py`, `auth.py`, `config.py`, `db.py`. Они не импортируют FastAPI/aiogram — низкий риск.
2. `bot.py`: перенести `bot`/`dp`/хендлеры/`notify_user`/`digest_loop`. Осторожно с **циклическими импортами** — `bot.py` тянет `texts`, `db`, `config`; роутеры тянут `bot` (для notify) и `auth`,`db`.
3. Роутеры по одному: начать с `widget.py` (самый изолированный), затем `analyze.py`, `subs.py`, `listings.py`, `health.py`. Каждый — `APIRouter()`, в `app.py` — `app.include_router(...)`.
4. `app.py` оставить тонким: создание `FastAPI(lifespan=...)`, старт polling бота, include всех роутеров.
5. Тесты (`backend/tests/`) импортируют `import app as backend` и обращаются к `backend.matches`, `backend.fmt_listing` и т.п. — после распила эти имена должны **реэкспортироваться** из `app.py` (`from matching import matches` и т.д.), иначе тесты сломаются. Либо поправить импорты в тестах на новые модули.

### Риск / усилие
Средне-высокое усилие, средний риск (циклические импорты, единый `state.db` DDL). **Делать инкрементально**, не одним коммитом. Предусловие выполнено: тесты есть.

---

## 2. Распил `webapp/app.js` (587 строк) — НО сначала реши судьбу Next.js

### Откуда
Один IIFE `webapp/app.js`: `CITIES`+демо-генератор, загрузка данных (`ready`), `localStorage` persist, синк подписок, `matches`, `searchLabel`, ценовой движок (`priceVerdict/priceBadge/priceInsight/trustBadges/moveInCost`), AI (`analyzeListing/mountAiButton/shareAnalysis`), `openListingUrl/safePhotoUrl`, экспорт `App`.

### Куда / Зачем / Важная развилка
**НЕ распиливай `app.js` в лоб.** Есть роадмап-пункт [[#26]] «перенос UI на `frontend/` (Next.js)», где модульность возникает естественно (компоненты + `lib/`). Вкладывать силы в распил vanilla-`app.js` = двойная работа, если всё равно переезжаем на Next.js.
- **Решение, которое нужно принять:** либо (а) продолжаем перенос на `frontend/` (тогда `app.js` доживает как есть и умирает при переключении прода), либо (б) остаёмся на vanilla надолго — тогда есть смысл разнести `app.js` на `webapp/js/{data,price,ai,subs}.js`, подключаемые тегами `<script>` (без сборки).
- Пока прод = `webapp/`, а `frontend/` перенесён только на главную (см. README-роадмап `[~]`).

### Как (если выбран путь «б», без сборки)
Разбить на `webapp/js/core.js` (данные+persist), `price.js`, `ai.js`, `subs.js`; каждый вешает своё в общий `window.App`; подключать в фиксированном порядке в `<head>`. Порядок важен (как i18n.dict.js ПЕРЕД i18n.js).

### Риск / усилие
Низкий риск, среднее усилие — но **сначала развилка Next.js**, иначе выброшенная работа.

---

## 3. Эвристика дедупа в `tools/fetch-olx.py`

### Откуда
`dedup()` схлопывает кросс-портальные дубли по ключу `(city, type, price, area)`. В комментарии кода честно признано: эвристика, «ложные слияния редки». Живёт и в боевом фетчер-репо `ipostatos/kwadratpl-fetcher` (синхронизировать отдельно!).

### Зачем (в чём боль)
- **False merge:** две разные типовые квартиры одной площади/цены в одном городе схлопнутся → пользователь «не видит всё». Бьёт по доверию сильнее, чем по корректности.
- **False split:** та же квартира с чуть разной площадью (48 vs 47.5 m²) на двух порталах не схлопнется → дубль в ленте.

### Как
Смягчить ключ: округлять/допускать площадь ±1–2 m², добавить нормализацию (район, число комнат как вторичный сигнал), логировать `duplicate_confidence`. Осторожно: слишком агрессивно → false merge растёт. Нужен прогон на реальном снапшоте + сравнение до/после (сколько схлопнулось).

### Риск / усилие
Низкое усилие, средний продуктовый риск (легко перемержить). **Обязательно** синхронизировать правку в публичный фетчер-репо (см. как это делалось для Zakopane/Białystok: клон по HTTPS + push).

---

## 4. Одна нода / SQLite → Postgres + горизонтальное масштабирование

### Откуда
`state.db` (SQLite, WAL) на одном VPS. Всё состояние (users, subs, seen, pending, ai_cache, ai_user_day, widget_tokens) — там. Uvicorn один процесс, бот polling в том же процессе.

### Зачем
Потолок: SQLite не любит много параллельных писателей; нет HA/failover; вторая реплика невозможна (файл-БД + polling бота в одном процессе = single-node by design). Сейчас это **не баг, а осознанный предел** — для текущей нагрузки ок.

### Как (когда упрёмся)
1. Триггер: рост юзеров/инжестов, потребность в HA, или переход бота на webhook + несколько воркеров.
2. Заменить `db()` на пул к managed Postgres (schema та же), DDL из `init_db` → миграции (напр. alembic).
3. Бот: polling → webhook (иначе несколько инстансов будут дублировать polling).
4. `listings.json` уже файловый снапшот — вынести в объектное хранилище/CDN при мультиноде.

### Риск / усилие
Высокое усилие. **Не делать пока нет реальной причины** — преждевременная оптимизация.

---

## Как безопасно работать с этим списком

- Любой распил — **маленькими коммитами**, каждый под зелёным CI (тесты гоняются автоматически, деплой — только после них).
- Правки в `tools/fetch-olx.py` дублировать в боевой фетчер-репо `ipostatos/kwadratpl-fetcher` (иначе прод-крон не увидит изменений).
- `matches()` в `backend/app.py` — **зеркало** `webapp/app.js matches` (и наоборот). При правке логики матчинга менять ОБА и держать синхрон (это скрытая связанность).
- Приоритет: **1 (backend split) → 3 (dedup) → 2 (после решения по Next.js) → 4 (только по необходимости)**.
