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
| 🔎 **Мгновенные фильтры** | Город, район (фактические из данных), цена, метраж, комнаты, условия (🐾 животные, 🅿️ парковка, 🌿 балкон) |
| 👥 **Подселение через Facebook** | Живые подборки FB-групп поиска соседей по выбранному городу — на польском, русском и украинском |
| 🔔 **Подписки** | Сохранённые поиски с уведомлениями о новых подходящих объявлениях |
| 📉 **Снижения цен** | Бейдж с суммой скидки по данным OLX (`previous_value`) |
| 🌍 **4 языка** | Единый словарь RU/PL/UA/EN, экран выбора языка при первом входе |
| 📱 **Нативный стиль Telegram** | Тема из tg-theme-переменных, BackButton, haptic feedback |

## Архитектура

```
Telegram ─▶ Mini App (webapp/, статика без сборки)
                 │  fetch data/listings.json
                 ▼
VPS: Caddy ◀── cron (15 мин) ── tools/fetch-olx.py ── публичный API OLX.pl
```

| Каталог     | Роль |
|-------------|------|
| `webapp/`   | **Текущий прод.** Статика без сборки (HTML/CSS/JS), деплоится на VPS и Vercel. |
| `frontend/` | **Будущая основа** (Next.js). Пока шаблон, в прод не деплоится. |
| `tools/`    | Серверные скрипты: сборщик объявлений с OLX. |

Словарь переводов один на оба фронтенда: `webapp/i18n.dict.js` (UMD).
`webapp` подключает его тегом `<script>`, `frontend` импортирует как модуль:
`require("../../webapp/i18n.dict.js")`. Переводы правятся ТОЛЬКО там.

## Структура webapp/

```
index.html     главный экран-хаб (data-home="true" — BackButton скрыт)
search.html    поиск: 3 типа аренды, фильтры, FB-группы подселения, шторка, подписка
saved.html     подписки (тумблеры уведомлений), избранное, настройки источников
about.html     о сервисе
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
- Обновление на VPS — cron раз в 15 минут:

```cron
*/15 * * * * python3 /opt/kwadratpl/tools/fetch-olx.py /opt/kwadratpl/webapp/data/listings.json >> /var/log/kwadratpl-fetch.log 2>&1
```

- Зеркало Vercel отдаёт снапшот `listings.json` из репозитория (обновляется
  при деплое). Свежие данные — только на VPS.

## Подселение: Facebook-группы

Значительная часть комнат и подселений в Польше публикуется только
в Facebook-группах. При типе поиска «Комната» приложение показывает
живые подборки групп по выбранному городу — ссылки на поиск групп FB
с готовыми запросами на польском («pokój do wynajęcia …»), русском
(«подселение аренда …») и украинском («підселення оренда …»).
Ссылки не протухают: это поисковые выдачи, а не конкретные группы.

Тумблер «Facebook-группы» в настройках (демо-источник карточек)
остаётся выключенным по умолчанию; реальный парсинг групп — в дорожной карте.

## Подписки и уведомления

- Подписки и избранное хранятся в `localStorage` (`kw_saved`, `kw_favs`).
  Подписка сохраняет все фильтры, включая условия (pets/parking/balcony).
- Уведомления пока показываются внутри приложения (тосты); отправка
  через бота — следующий этап (бэкенд).
- Кнопка «Симуляция: новое объявление» генерирует объявление под первую
  активную подписку и показывает, как будет выглядеть пуш.

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
./deploy-vps.sh   # scp webapp + tools → root@46.224.220.94:/opt/kwadratpl/
```

Vercel (зеркало):

```bash
cd webapp
npx vercel deploy --prod --yes
```

Кнопка меню бота настроена через Bot API (`setChatMenuButton`).
Будущий бэкенд — раскомментировать `handle /api/*` в блоке kwadratpl
в `/etc/caddy/Caddyfile` на VPS (порт 4200, по образцу issa-bot).

## Дорожная карта

- [x] Реальные объявления: скрапер OLX (публичный API) + listings.json + cron
- [x] Комнаты и подселение: категория «stancje i pokoje» + FB-группы по городам
- [ ] Бэкенд (FastAPI + aiogram или Grammy): /start, реальные подписки, отправка уведомлений
- [ ] Otodom как второй источник + дедупликация между площадками + история цен на своей стороне
- [ ] Валидация `initData` для авторизации пользователей Mini App
- [ ] Перенос UI на `frontend/` (Next.js) с тем же словарём i18n.dict.js

## Лицензия

[MIT](LICENSE) · Автор: [@ipostatos](https://t.me/ipostatos)
