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

scp webapp/*.html webapp/*.css webapp/*.js webapp/*.png "$REMOTE:$DEST/webapp/"
scp -r webapp/js "$REMOTE:$DEST/webapp/"
scp webapp/data/commute.json "$REMOTE:$DEST/webapp/data/"
scp -r tools "$REMOTE:$DEST/"
scp backend/*.py backend/requirements.txt "$REMOTE:$DEST/backend/"
scp -r backend/routers "$REMOTE:$DEST/backend/"
ssh "$REMOTE" "systemctl restart kwadratpl-api 2>/dev/null || echo 'kwadratpl-api не установлен (см. README)'"
echo "OK deployed to $REMOTE"
