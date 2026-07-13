#!/usr/bin/env bash
# Деплой Mini App на VPS: https://kwadratpl-46-224-220-94.sslip.io
# (Caddy отдаёт статику из /opt/kwadratpl/webapp, конфиг: /etc/caddy/Caddyfile)
# tools/ нужен на VPS для cron-обновления webapp/data/listings.json:
#   */15 * * * * python3 /opt/kwadratpl/tools/fetch-olx.py /opt/kwadratpl/webapp/data/listings.json
set -e
cd "$(dirname "$0")"
scp -r webapp tools root@46.224.220.94:/opt/kwadratpl/
echo "OK: https://kwadratpl-46-224-220-94.sslip.io"
