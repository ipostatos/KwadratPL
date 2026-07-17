#!/usr/bin/env bash
# Деплой на VPS. Хост задаётся через env KWADRAT_VPS (напр. user@host), чтобы не
# хардкодить прод-адрес и root-доступ в репозитории.
#   KWADRAT_VPS=deploy@example.com ./deploy-vps.sh
# - webapp/  → статика (Caddy)
# - tools/   → сборщик OLX (боевой в CI-фетчере, тут для истории)
# - backend/ → FastAPI+aiogram (systemd kwadratpl-api, 127.0.0.1:4200)
# Данные обновляет GitHub Actions через POST /api/listings — webapp/data/listings.json
# НЕ копируем; commute.json (районный контекст) — статика, копируем отдельно.
set -e
cd "$(dirname "$0")"
: "${KWADRAT_VPS:?задайте KWADRAT_VPS=user@host (напр. export KWADRAT_VPS=deploy@host)}"
REMOTE="$KWADRAT_VPS"
DEST="${KWADRAT_DEST:-/opt/kwadratpl}"

# rsync --delete вместо scp: scp никогда не удаляет файлы на VPS, поэтому
# переименование/удаление файла в репо (напр. webapp/app.js при распиле на js/*)
# оставляло осиротевший файл, который Caddy продолжал отдавать — уже дважды
# ловили это руками. --exclude защищает рантайм-данные (listings.json на VPS
# живёт своей жизнью, обновляется отдельно GitHub Actions; state.db/.venv —
# бэкендный рантайм; _test/tests — дев-заглушки, в деплой не нужны).
rsync -a --delete \
  --exclude='_test/' \
  --exclude='data/listings.json' \
  webapp/ "$REMOTE:$DEST/webapp/"
rsync -a --delete tools/ "$REMOTE:$DEST/tools/"
rsync -a --delete \
  --exclude='tests/' \
  --exclude='state.db*' \
  --exclude='.venv/' \
  --exclude='__pycache__/' \
  backend/ "$REMOTE:$DEST/backend/"
ssh "$REMOTE" "systemctl restart kwadratpl-api 2>/dev/null || echo 'kwadratpl-api не установлен (см. README)'"
echo "OK deployed to $REMOTE"
