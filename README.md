# Kwadrat PL

Telegram Mini App для поиска аренды жилья в Польше. Бот: [@KwadratPLBot](https://t.me/KwadratPLBot).

Прод (кнопка меню бота): https://kwadratpl-46-224-220-94.sslip.io (VPS, Caddy)
Зеркало: https://kwadratpl.vercel.app

## Роли каталогов

| Каталог     | Роль |
|-------------|------|
| `webapp/`   | **Текущий прод.** Статика без сборки (HTML/CSS/JS), деплоится на VPS и Vercel. |
| `frontend/` | **Будущая основа** (Next.js). Пока пустой шаблон, в прод не деплоится. |
| `tools/`    | Серверные скрипты: сборщик объявлений с OLX. |

Словарь переводов один на оба фронтенда: `webapp/i18n.dict.js` (UMD).
`webapp` подключает его тегом `<script>`, `frontend` импортирует как модуль:
`require("../../webapp/i18n.dict.js")`. Переводы правятся ТОЛЬКО там.

## Структура webapp/

```
index.html     главный экран-хаб (data-home="true" — BackButton скрыт)
search.html    поиск: фильтры (вкл. условия 🐾🅿️🌿), карточки, шторка, подписка
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
  с публичного API OLX.pl: 6 городов × (долгосрок cat 15 + посуточно cat 1816),
  нормализует в схему приложения и атомарно пишет `webapp/data/listings.json`.
- `app.js` грузит `data/listings.json` (`App.ready` — Promise). Если файл
  недоступен (file://, сбой) — демо-генератор с фиксированным сидом,
  `App.live=false`, подвалы страниц честно сообщают про демо-режим.
- Поля объявления: id `olx-*`, city, district, type long|short, rooms, area,
  price, oldPrice (снижение цены с OLX `previous_value`), floor, pets, parking,
  balcony (эвристика по описанию), photo, url, title, descr, source, ts.
- Обновление на VPS — cron раз в 15 минут:

```cron
*/15 * * * * python3 /opt/kwadratpl/tools/fetch-olx.py /opt/kwadratpl/webapp/data/listings.json >> /var/log/kwadratpl-fetch.log 2>&1
```

- Зеркало Vercel отдаёт снапшот `listings.json` из репозитория (обновляется
  при деплое). Свежие данные — только на VPS.
- Источник «Facebook-группы» (тумблер в настройках) пока работает только
  в демо-режиме; реальный парсинг групп — в дорожной карте.

## Подписки и уведомления

- Подписки и избранное хранятся в `localStorage` (`kw_saved`, `kw_favs`).
  Подписка сохраняет все фильтры, включая условия (pets/parking/balcony).
- Уведомления пока демонстрационные (тосты внутри приложения); отправка
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
- [ ] Бэкенд (FastAPI + aiogram или Grammy): /start, реальные подписки, отправка уведомлений
- [ ] Otodom как второй источник + дедупликация между площадками + история цен на своей стороне
- [ ] Валидация `initData` для авторизации пользователей Mini App
- [ ] Перенос UI на `frontend/` (Next.js) с тем же словарём i18n.dict.js
