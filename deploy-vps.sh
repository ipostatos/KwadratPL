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
# ⚠️ ГРАБЛЯ (поймана 2026-07-17): rsync -a БЕЗ --chown преserves owner/group
# С ИСТОЧНИКА — деплой-раннер (root или CI-раннер с чужим uid) перезаписывает
# ownership всего дерева на свой uid, включая уже существующие файлы (в
# отличие от scp, который просто перезаписывал контент, не трогая владельца).
# Итог был: PermissionError у сервиса на запись в webapp/data/ (работает под
# user kwadratpl). --chown=kwadratpl:kwadratpl форсирует владельца независимо
# от того, кем реально запущен rsync.
rsync -a --chown=kwadratpl:kwadratpl --delete \
  --exclude='_test/' \
  --exclude='data/listings.json' \
  webapp/ "$REMOTE:$DEST/webapp/"
rsync -a --chown=kwadratpl:kwadratpl --delete tools/ "$REMOTE:$DEST/tools/"
rsync -a --chown=kwadratpl:kwadratpl --delete \
  --exclude='tests/' \
  --exclude='state.db*' \
  --exclude='.venv/' \
  --exclude='__pycache__/' \
  backend/ "$REMOTE:$DEST/backend/"
ssh "$REMOTE" "systemctl restart kwadratpl-api 2>/dev/null || echo 'kwadratpl-api не установлен (см. README)'"
echo "OK deployed to $REMOTE"
