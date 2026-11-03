#!/usr/bin/env bash
# Runs on the instance (as root, via SSM). Usage: remote-deploy.sh <bucket> <sha> <app-user>
set -euo pipefail

BUCKET="$1"; SHA="$2"; APP_USER="$3"
SRC="s3://$BUCKET/releases/$SHA"
API_DIR="/home/$APP_USER/noree-api"
WEB_DIR="/var/www/noree"
TMP="$(mktemp -d)"

aws s3 cp "$SRC/backend.tgz" "$TMP/backend.tgz" --only-show-errors
aws s3 cp "$SRC/frontend.tgz" "$TMP/frontend.tgz" --only-show-errors

# Frontend
mkdir -p "$WEB_DIR"
find "$WEB_DIR" -mindepth 1 -delete
tar -xzf "$TMP/frontend.tgz" -C "$WEB_DIR"
chown -R "$APP_USER":"$APP_USER" "$WEB_DIR"

# Backend (keep .env and node_modules, replace everything else)
mkdir -p "$API_DIR"
rm -rf "$API_DIR/dist"
tar -xzf "$TMP/backend.tgz" -C "$API_DIR"
chown -R "$APP_USER":"$APP_USER" "$API_DIR"
sudo -iu "$APP_USER" bash -c "cd $API_DIR && npm ci --omit=dev && pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save"

# Health check through nginx
for i in 1 2 3 4 5 6 7 8; do
  if curl -fsS http://127.0.0.1/api/ >/dev/null; then echo "API healthy"; rm -rf "$TMP"; exit 0; fi
  sleep 3
done
echo "API health check failed" >&2
exit 1
