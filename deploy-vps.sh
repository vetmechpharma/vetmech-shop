#!/bin/bash
# ============================================================================
# VETMECH Shop - VPS Update Script
# Pulls latest code from GitHub, installs deps, rebuilds, restarts.
# Preserves backend/.env & frontend/.env (they are git-ignored).
# Usage:  cd /opt/vetmech-shop && git pull && sudo bash deploy-vps.sh
# ============================================================================
set -e
APP_DIR="/opt/vetmech-shop"
SERVICE="vetmech-shop-backend"
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; C='\033[0;36m'; N='\033[0m'
ok(){ echo -e "${G}[OK]${N} $1"; }
info(){ echo -e "${C}[..]${N} $1"; }
warn(){ echo -e "${Y}[!!]${N} $1"; }

[ "$EUID" -ne 0 ] && { echo "Run with sudo: sudo bash deploy-vps.sh"; exit 1; }
cd "$APP_DIR"

# --- 0. Backup DB (safety) ---
info "Backing up database VETMECH_SHOP"
mkdir -p /opt/_backups
mongodump --db VETMECH_SHOP --out "/opt/_backups/shop_db_$(date +%F_%H%M)" >/dev/null 2>&1 && ok "DB backed up" || warn "mongodump skipped"

# --- 1. Pull latest code ---
info "Pulling latest code from GitHub"
git pull
ok "Code updated"

# --- 2. Ensure required env vars exist (idempotent, never overwrites values) ---
ENVF="$APP_DIR/backend/.env"
touch "$ENVF"
grep -q "^WEBHOOK_CRON_SECRET=" "$ENVF" || echo 'WEBHOOK_CRON_SECRET="vm_cron_9f3a2b7c8e1d4a6f0b5c9d2e7a1f8c3b"' >> "$ENVF" && ok "WEBHOOK_CRON_SECRET present"
grep -q "^APP_BASE_URL=" "$ENVF" || echo 'APP_BASE_URL="https://vetmechpharma.in"' >> "$ENVF" && ok "APP_BASE_URL present"

# --- 3. Backend deps ---
info "Installing backend dependencies"
cd "$APP_DIR/backend"
source venv/bin/activate
pip install -q -r requirements.txt
deactivate
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
ok "Backend deps installed"

# --- 4. Frontend build ---
info "Rebuilding frontend (this can take a couple of minutes)"
cd "$APP_DIR/frontend"
rm -rf build node_modules/.cache 2>/dev/null || true
yarn install --silent
yarn build
ok "Frontend rebuilt"

# --- 5. Restart backend ---
info "Restarting backend service"
systemctl restart "$SERVICE"
sleep 6

# --- 6. Verify ---
if curl -s http://127.0.0.1:8010/api/ | grep -q "VETMECH"; then
  ok "Backend healthy on :8010"
else
  warn "Backend not responding — check: journalctl -u $SERVICE -n 40"
fi
systemctl reload nginx 2>/dev/null && ok "Nginx reloaded" || true
echo -e "\n${G}==== Update complete. Visit https://vetmechpharma.in ====${N}\n"
