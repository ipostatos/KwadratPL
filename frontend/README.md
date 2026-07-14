# Kwadrat PL — frontend (Next.js, static export)

Инкрементальный перенос UI из `../webapp` на Next.js 16 (App Router, TypeScript).
Собирается в **static export** (`out/`) — чистые HTML/CSS/JS, деплой на тот же
Caddy `file_server` и на Vercel **без Node-рантайма**, как текущий `webapp/`.

## Единый источник со webapp (без дублирования)

`frontend/` и `webapp/` делят одни и те же файлы из `../webapp`:

| Что | Файл | Как переиспользуется |
|-----|------|----------------------|
| Словарь RU/PL/UA/EN | `../webapp/i18n.dict.js` | UMD-модуль → `@shared/i18n.dict.js` в `src/lib/i18n.tsx` |
| Иконки (Lucide) | `../webapp/icons.js` | UMD-модуль (`Icons.P`) → `@shared/icons.js` в `src/components/Icon.tsx` |
| Токены/тема | `../webapp/theme.css` | `@import` в `src/app/globals.css` |
| Данные объявлений | `data/listings.json` | тот же снапшот фетчера, `src/lib/data.ts` |
| Состояние | `localStorage` `kw_lang` / `kw_saved` / `kw_favs` | те же ключи — язык и подписки общие |

Правишь переводы/иконки **только** в `../webapp/*` — оба фронтенда синхронны.
`turbopack.root` в `next.config.ts` поднят на корень репозитория, чтобы
кросс-импорт из `../webapp` резолвился при сборке.

## Статус переноса

- [x] Каркас: static export, общий i18n-хук, `<Icon>`, тема, layout
- [x] `/` — главная (порт `webapp/index.html`)
- [ ] `/search`, `/saved`, `/about`, `/kaucja`, `/umowa`, `/checklist`, `/phrases`, `/koszty`

Ссылки на ещё не портированные экраны ведут на будущие Next-маршруты и
наполнятся по мере переноса. Прод пока держит `webapp/` — переключаемся, когда
все страницы перенесены.

## Команды

```bash
npm run dev      # локальная разработка
npm run build    # продакшн-сборка → out/
npm run preview  # отдать собранный out/ статикой
```
