# Kwadrat PL

**Поиск аренды жилья в Польше — прямо в Telegram.**

[![Telegram Bot](https://img.shields.io/badge/Telegram-@KwadratPLBot-26A5E4?logo=telegram&logoColor=white)](https://t.me/KwadratPLBot)
[![Mirror](https://img.shields.io/badge/Mirror-Vercel-000000?logo=vercel&logoColor=white)](https://kwadratpl.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Stack](https://img.shields.io/badge/Stack-Vanilla%20JS%20%2B%20Python%20stdlib-blue)

Telegram Mini App с живыми объявлениями OLX: квартиры (долгосрок), **комнаты и подселение**, посуточное жильё. 6 городов, фильтры по району/цене/метражу/условиям, подписки на новые объявления, отслеживание снижений цен. Интерфейс на 4 языках: RU / PL / UA / EN.

- **Прод** (кнопка меню бота): https://kwadratpl-46-224-220-94.sslip.io (VPS, Caddy)
- **Зеркало**: https://kwadratpl.vercel.app

## Возможности

| | |
|---|---|
| 🏠 **Три типа аренды** | Долгосрочная, комнаты/подселение, посуточная — реальные объявления OLX по 6 городам |
| 🔎 **Мгновенные фильтры** | Город, район (фактические из данных), цена, метраж, комнаты, **частник/агентство**, условия (🐾 животные, 🅿️ парковка, 🌿 балкон) |
| 👥 **Группы Facebook** | Крупнейшие группы аренды и подселения по выбранному городу (кураторский список, PL/RU/UA) + живой поиск групп |
| 🐾 **Можно с животными** | Отдельный раздел на главной: объявления с подтверждённым «pets OK» |
| 🔔 **Реальные уведомления** | Подписки хранятся на сервере (авторизация по Telegram initData); новые подходящие объявления бот присылает прямо в чат |
| 📉 **Снижения цен** | Бейдж с суммой скидки по данным OLX (`previous_value`) |
| 📚 **Полезное** | Гайд по возврату кауции (с шаблоном wezwanie), разбор договора, чек-лист осмотра, готовые фразы владельцу по-польски, калькулятор заезда |
| 🌍 **4 языка** | Единый словарь RU/PL/UA/EN, экран выбора языка при первом входе |
| 📱 **Нативный стиль Telegram** | Тема из tg-theme-переменных, BackButton, haptic feedback |

## Архитектура

```
ПУБЛИЧНЫЙ репо kwadratpl-fetcher            Telegram
  GitHub Actions cron */5 мин                  │ /start, /off, /on,
  fetch_olx.py ── OLX API                      │ уведомления
        │ POST /api/listings                   │
        ▼        (X-Ingest-Token)              ▼
VPS: Caddy ──▶ /api/* ──▶ backend (FastAPI + aiogram, :4200)
        │                    │ атомарно пишет listings.json,
        │                    │ диффит, матчит подписки, шлёт пуши
        └──▶ статика webapp/ ◀┘
              ▲ fetch data/listings.json + /api/subs (initData)
        Mini App (webapp/, статика без сборки)
```

Почему фетчер снаружи: OLX API отдаёт **403 с IP датацентра VPS**,
а с раннеров GitHub Actions доступен (проверено). Почему отдельный
публичный репо ([ipostatos/kwadratpl-fetcher](https://github.com/ipostatos/kwadratpl-fetcher)):
у публичных репозиториев минуты Actions бесплатны без лимита — это
позволяет крон каждые 5 минут (в приватном лимит 2000 мин/мес хватало
только на 30-минутный шаг). Секретов в публичном репо нет; keepalive-workflow
раз в месяц делает пустой коммит, чтобы GitHub не отключил крон за
неактивность. В приватном репо остался ручной fallback (workflow_dispatch).

| Каталог     | Роль |
|-------------|------|
| `webapp/`   | **Прод-фронтенд.** Статика без сборки (HTML/CSS/JS), деплоится на VPS и Vercel. |
| `backend/`  | **Прод-бэкенд.** FastAPI + aiogram: приём данных, серверные подписки, уведомления, /start. |
| `frontend/` | **Будущая основа** (Next.js). Пока шаблон, в прод не деплоится. |
| `tools/`    | Сборщик объявлений с OLX (запускается в CI). |

Словарь переводов один на оба фронтенда: `webapp/i18n.dict.js` (UMD).
`webapp` подключает его тегом `<script>`, `frontend` импортирует как модуль:
`require("../../webapp/i18n.dict.js")`. Переводы правятся ТОЛЬКО там.

## Структура webapp/

```
index.html     главный экран-хаб (data-home="true" — BackButton скрыт)
search.html    поиск: 3 типа аренды, фильтры, FB-группы, шторка, подписка
saved.html     подписки (тумблеры уведомлений), избранное, настройки источников
about.html     о сервисе
kaucja.html    гайд «Как вернуть кауцию» + шаблон wezwanie do zapłaty
umowa.html     разбор договора аренды: red flags, meldunek, словарик
checklist.html интерактивный чек-лист осмотра (localStorage kw_check)
phrases.html   готовые сообщения владельцу на польском (копирование)
koszty.html    калькулятор стоимости заезда
guide.js       рендерер гайдов (секции, warn-плашки, копируемые шаблоны)
theme.css      дизайн-система (нативный стиль Telegram, тема из tg-theme-переменных)
nav.js         Telegram BackButton + haptic (подключать на каждой странице)
i18n.dict.js   ЕДИНЫЙ словарь переводов RU/PL/UA/EN (см. выше)
i18n.js        движок локализации (t, hydrate, экран выбора языка, kw_lang)
icons.js       инлайновые SVG-иконки Lucide (без CDN)
app.js         инвентарь (реальные данные + демо-фолбэк), матчинг, localStorage
data/          listings.json — реальные объявления (генерирует tools/fetch-olx.py)
```

## Реальные данные

- `tools/fetch-olx.py` (python3, только stdlib) собирает объявления
  с публичного API OLX.pl: 6 городов × 3 категории (долгосрок cat 15,
  посуточно cat 1816, **комнаты cat 11 — stancje i pokoje**),
  нормализует в схему приложения и атомарно пишет `webapp/data/listings.json`.
- `app.js` грузит `data/listings.json` (`App.ready` — Promise). Если файл
  недоступен (file://, сбой) — демо-генератор с фиксированным сидом,
  `App.live=false`, подвалы страниц честно сообщают про демо-режим.
- Поля объявления: id `olx-*`, city, district, type long|short|room, rooms, area,
  price, oldPrice (снижение цены с OLX `previous_value`), floor, pets, parking,
  balcony (эвристика по описанию), photo, url, title, descr, source, ts.
- Обновление: публичный репо `kwadratpl-fetcher` каждые ~5 минут запускает
  `fetch_olx.py` на раннере GitHub и POST-ит результат на
  `/api/listings` (заголовок `X-Ingest-Token`, секрет `INGEST_TOKEN`
  в Actions = значению в `/opt/kwadratpl/.env`). Бэкенд пишет файл атомарно.
- Поле `agency` (offer.business): фильтр «частник/агентство» в поиске
  и подписках, бейдж в карточке.
- Команды бота: `/off` — глобальная пауза уведомлений, `/on` — включить.
- Зеркало Vercel отдаёт снапшот `listings.json` из репозитория (обновляется
  при деплое) и не имеет `/api`. Свежие данные и подписки — на VPS,
  кнопка меню бота указывает туда.

## Facebook-группы: аренда и подселение

Значительная часть объявлений (особенно комнаты и подселение) в Польше
публикуется только в Facebook-группах. На странице поиска приложение
показывает карточку с крупнейшими группами по выбранному городу —
кураторский список из 24 групп (по 4 на город: 2 польские + русская +
украинская, у варшавских 183k и 120k участников; проверен 2026-07,
данные в `search.html` → `FB_GROUPS`). Ниже — строка «Найти ещё группы»
со ссылками на живой поиск групп FB с готовыми запросами на трёх языках
(запрос подстраивается под тип аренды: «pokój…» для комнат,
«mieszkanie…» для квартир).

Тумблер «Facebook-группы» в настройках (демо-источник карточек)
остаётся выключенным по умолчанию; реальный парсинг групп — в дорожной карте.

## Подписки и уведомления

- Внутри Telegram подписки синхронизируются с бэкендом: `app.js` шлёт
  `PUT /api/subs` с заголовком `Authorization: tma <initData>` (подпись
  проверяется HMAC-ом с токеном бота, initData не старше суток).
  При первом входе на новом устройстве список тянется с сервера.
- На каждом инжесте бэкенд диффит объявления по таблице `seen`, матчит
  новые против активных подписок (матчинг зеркалит `app.js matches()`)
  и шлёт в чат до 5 карточек с кнопкой «Открыть на OLX» (+ «…и ещё N»).
  Первый инжест после чистой БД — bootstrap, без уведомлений.
- Вне Telegram (браузер, зеркало Vercel) — graceful fallback на
  `localStorage` (`kw_saved`, `kw_favs`), как раньше.
- Кнопка «Симуляция: новое объявление» осталась как демо внешнего вида пуша.

## Локальный запуск

```bash
cd webapp
python -m http.server 8080
# открыть http://localhost:8080 (file:// не подходит: fetch data/listings.json)
```

Обновить данные локально: `python tools/fetch-olx.py`.

## Деплой

VPS (прод, кнопка меню бота смотрит сюда):

```bash
./deploy-vps.sh   # webapp (без data/!) + tools + backend, рестарт сервиса
```

Vercel (зеркало):

```bash
cd webapp
npx vercel deploy --prod --yes
```

Бэкенд на VPS (однократная настройка уже выполнена):

- `/opt/kwadratpl/.env` — `BOT_TOKEN`, `INGEST_TOKEN` (= секрет Actions),
  `WEBAPP_URL`; права 600, владелец kwadratpl.
- venv `/opt/kwadratpl/.venv`, сервис `kwadratpl-api` (systemd, hardening
  по образцу issa-api), uvicorn на 127.0.0.1:4200.
- Caddy: `handle /api/* → reverse_proxy 127.0.0.1:4200` в блоке kwadratpl.
- SQLite `/opt/kwadratpl/backend/state.db` (users / subs / seen).

Кнопка меню бота настроена через Bot API (`setChatMenuButton`) на VPS-URL.

## Дорожная карта

- [x] Реальные объявления: скрапер OLX (публичный API) + listings.json
- [x] Комнаты и подселение: категория «stancje i pokoje» + FB-группы по городам
- [x] Автообновление данных: GitHub Actions cron 30 мин → POST /api/listings
- [x] Бэкенд (FastAPI + aiogram): /start, серверные подписки, уведомления в чат
- [x] Валидация `initData` для авторизации пользователей Mini App
- [ ] Otodom как второй источник + дедупликация между площадками + история цен на своей стороне
- [ ] Перенос UI на `frontend/` (Next.js) с тем же словарём i18n.dict.js

## Лицензия

[MIT](LICENSE) · Автор: [@ipostatos](https://t.me/ipostatos)
