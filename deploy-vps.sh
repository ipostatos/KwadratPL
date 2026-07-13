#!/usr/bin/env bash
# Деплой Mini App на VPS: https://kwadratpl-46-224-220-94.sslip.io
# (Caddy отдаёт статику из /opt/kwadratpl/webapp, конфиг: /etc/caddy/Caddyfile)
set -e
cd "$(dirname "$0")"
scp -r webapp root@46.224.220.94:/opt/kwadratpl/
echo "OK: https://kwadratpl-46-224-220-94.sslip.io"
