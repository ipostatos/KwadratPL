# Kwadrat PL

Telegram Mini App для поиска аренды жилья в Польше. Бот: [@KwadratPLBot](https://t.me/KwadratPLBot).

Прод: https://kwadratpl.vercel.app

## Структура

```
webapp/          статика Mini App (без сборки, чистый HTML/CSS/JS)
  index.html     главный экран-хаб (data-home="true" — BackButton скрыт)
  search.html    поиск: фильтры, карточки, шторка деталей, подписка на поиск
  saved.html     подписки (тумблеры уведомлений) и избранное
  about.html     о сервисе
  theme.css      дизайн-система (нативный стиль Telegram, тема из tg-theme-переменных)
  nav.js         Telegram BackButton + haptic (подключать на каждой странице)
  icons.js       инлайновые SVG-иконки Lucide (без CDN)
  app.js         данные и логика: города, генератор объявлений, localStorage
```

## Как это работает

- Инвентарь объявлений — демо-данные, генерируются детерминированно (seeded PRNG),
  поэтому избранное переживает перезагрузку. Реального бэкенда пока нет.
- Подписки и избранное хранятся в `localStorage` (`kw_saved`, `kw_favs`).
- Кнопка «Симуляция: новое объявление» показывает, как будет выглядеть
  пуш-уведомление о подходящем объявлении.
- Дизайн-система основана на ISSA Trainer: переменные `--tg-theme-*` с тёмным
  fallback, плитки `.ic-tile`, сетка `.cell`, тосты `.push-toast`.

## Локальный запуск

```bash
cd webapp
python -m http.server 8080
# открыть http://localhost:8080
```

## Деплой

```bash
cd webapp
npx vercel deploy --prod --yes
```

Кнопка меню бота настроена через Bot API (`setChatMenuButton`) на прод-URL.

## Дорожная карта

- [ ] Бэкенд (FastAPI + aiogram или Grammy): /start, реальные подписки, отправка уведомлений
- [ ] Скрапер OLX/Otodom + дедупликация + история цен
- [ ] Валидация `initData` для авторизации пользователей Mini App
