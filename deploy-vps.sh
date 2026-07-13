#!/usr/bin/env bash
# Деплой на VPS: https://kwadratpl-46-224-220-94.sslip.io
# - webapp/  → статика (Caddy, /opt/kwadratpl/webapp)
# - tools/   → сборщик OLX (используется CI-фетчером, на VPS лежит для истории)
# - backend/ → FastAPI+aiogram (systemd kwadratpl-api, 127.0.0.1:4200)
# Данные обновляет GitHub Actions (fetch-listings.yml) через POST /api/listings.
set -e
cd "$(dirname "$0")"
# ВАЖНО: webapp/data НЕ копируем — прод-данные обновляет CI через /api/listings,
# локальный снапшот их бы перезатёр устаревшим
scp webapp/*.html webapp/*.css webapp/*.js root@46.224.220.94:/opt/kwadratpl/webapp/
scp -r tools root@46.224.220.94:/opt/kwadratpl/
scp backend/app.py backend/requirements.txt root@46.224.220.94:/opt/kwadratpl/backend/
ssh root@46.224.220.94 "systemctl restart kwadratpl-api 2>/dev/null || echo 'kwadratpl-api не установлен (первичная настройка — см. README)'"
echo "OK: https://kwadratpl-46-224-220-94.sslip.io"
