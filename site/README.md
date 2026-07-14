# Kwadrat PL — промо-лендинг (SEO)

Статический промо-сайт бота @KwadratPLBot. Ноль JS, системные шрифты, инлайн-CSS
— мгновенная загрузка и хорошие Core Web Vitals. 4 языковые версии, каждая на своём
URL с корректным hreflang.

## Структура

```
site/
  index.html        RU  (корень, x-default)
  ua/index.html     UK
  pl/index.html     PL
  en/index.html     EN
  robots.txt        (генерится)
  sitemap.xml       (генерится, с hreflang-альтернативами)
  llms.txt          для AI-поисковиков (ChatGPT, Perplexity, AI Overviews)
  favicon.svg  og.png  icon-512.png  site.webmanifest
  vercel.json  .vercelignore
  _build/
    generate.mjs    ← весь контент + шаблон + сборка
    og.html icon.html  ← шаблоны картинок (скриншотятся в og.png / icon-512.png)
```

## Единый источник

Названия городов и SVG-иконки берутся из `../webapp` (тот же источник, что и бот),
чтобы не расходились. Правишь тексты лендинга в `_build/generate.mjs`.

## Регенерация

```bash
node site/_build/generate.mjs      # пересобрать 4 страницы + sitemap + robots
```

Картинки (`og.png`, `icon-512.png`) пересобираются редко — отрисовать `_build/og.html`
и `_build/icon.html` в браузере (1200×630 и 512×512) и сохранить PNG.

## SEO, что уже сделано

- Уникальные title/description на каждый язык, canonical, `robots: index,follow`.
- hreflang на 4 языка + x-default в `<head>` и в sitemap.
- Open Graph + Twitter Card + og.png 1200×630.
- JSON-LD: WebSite, Organization, SoftwareApplication (offers 0 PLN), FAQPage.
- sitemap.xml, robots.txt, llms.txt, PWA-манифест.
- Семантический HTML, `<details>` FAQ (даёт rich-результаты), ноль render-blocking.
- Тексты про доверие: прямые объявления без агентств, анти-скам, бесплатно — без пустых обещаний.

## Деплой на kwadratpl.pl (Vercel)

1. Зарегистрировать домен **kwadratpl.pl**.
2. Vercel → New Project → этот репозиторий, **Root Directory = `site`**, framework = Other,
   без build command (файлы уже статические).
3. Vercel → Domains → добавить `kwadratpl.pl` (+ `www` редиректом), прописать DNS у регистратора.
4. После деплоя: Google Search Console + Bing Webmaster Tools → добавить домен,
   отправить `sitemap.xml`. То же для Яндекс.Вебмастер (много RU/UA-аудитории).

Если домен ещё не куплен — всё уже свёрстано под `https://kwadratpl.pl`; сменить домен
= поправить `SITE.domain` в `_build/generate.mjs` и перегенерировать.
