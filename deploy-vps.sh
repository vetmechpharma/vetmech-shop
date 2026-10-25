#!/usr/bin/env bash
# Existing native VPS installation updater; preserves private .env files.
set -Eeuo pipefail
REFRESH_HOMEPAGE=false
if [ "$#" -gt 0 ]; then
  if [ "$#" -eq 1 ] && [ "$1" = "--refresh-homepage" ]; then
    REFRESH_HOMEPAGE=true
  else
    echo "Usage: sudo bash deploy-vps.sh [--refresh-homepage]" >&2
    exit 1
  fi
fi
APP_DIR="${VETMECH_APP_DIR:-/opt/vetmech-shop}"
SERVICE="${VETMECH_SERVICE:-vetmech-shop-backend}"
HEALTH_URL="${VETMECH_HEALTH_URL:-http://127.0.0.1:8010/api/health}"
BACKUP_DIR="${VETMECH_BACKUP_DIR:-/opt/_backups}"
trap 'echo "Update stopped at line $LINENO. Review the error before retrying." >&2' ERR
[ "$EUID" -eq 0 ] || { echo "Run using sudo bash deploy-vps.sh" >&2; exit 1; }
cd "$APP_DIR"
PYTHON="$APP_DIR/backend/venv/bin/python"
[ -x "$PYTHON" ] || PYTHON="$APP_DIR/.venv/bin/python"
[ -x "$PYTHON" ] || { echo "No application virtual environment was found." >&2; exit 1; }
[ -f backend/.env ] || { echo "Missing backend/.env. See README.md for first-run setup." >&2; exit 1; }
command -v npm >/dev/null
# Refuse to deploy on top of uncommitted source edits.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Commit or stash local source changes before deploying." >&2
  exit 1
fi
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
echo "Backing up database and uploads..."
"$PYTHON" backend/manage.py backup --output "$BACKUP_DIR"
echo "Fetching the latest application code..."
git pull --ff-only
# Generate a per-install cron secret only if no value is configured.
"$PYTHON" - <<'CONFIG'
import secrets
from pathlib import Path
from dotenv import dotenv_values, set_key
p = Path('backend/.env')
settings = dotenv_values(p)
if not settings.get('WEBHOOK_CRON_SECRET'):
    set_key(p, 'WEBHOOK_CRON_SECRET', secrets.token_urlsafe(32))
if not settings.get('APP_ENV'):
    set_key(p, 'APP_ENV', 'production')
CONFIG
echo "Installing backend dependencies..."
"$PYTHON" -m pip install -q -r backend/requirements.txt
echo "Installing frontend dependencies and building the website..."
(
  cd frontend
  npm ci --no-audit --no-fund
  # Build separately; the currently served files remain available while this runs.
  BUILD_PATH=.build-next GENERATE_SOURCEMAP=false npm run build
)
echo "Restarting the backend and checking database health..."
systemctl restart "$SERVICE"
curl --silent --show-error --fail --retry 5 --retry-connrefused --retry-all-errors --retry-delay 2 --max-time 5 "$HEALTH_URL" >/dev/null
nginx -t
FRONTEND_BACKUP=""
if [ -d frontend/build ]; then
  FRONTEND_BACKUP="$BACKUP_DIR/frontend-build-$(date -u +%Y%m%dT%H%M%S%N)"
  mv frontend/build "$FRONTEND_BACKUP"
fi
if ! mv frontend/.build-next frontend/build; then
  if [ -n "$FRONTEND_BACKUP" ]; then mv "$FRONTEND_BACKUP" frontend/build; fi
  echo "Frontend activation failed. The previous build was retained." >&2
  exit 1
fi
if [ "$REFRESH_HOMEPAGE" = true ]; then
  echo "Applying the homepage presentation and saving its rollback snapshot..."
  "$PYTHON" backend/manage.py refresh-homepage --apply --output "$BACKUP_DIR"
fi
systemctl reload nginx
echo "Code, database connectivity and frontend build verified. Update complete."
