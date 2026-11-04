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
# nginx: WebSocket upgrade for /api/ (Socket.IO). The site conf is certbot-managed,
# so patch it in place; idempotent, and reverted if nginx rejects the result.
NGINX_CONF=/etc/nginx/conf.d/noree.conf
cat > /etc/nginx/conf.d/noree-ws-map.conf <<'EOF'
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}
EOF
if ! grep -q 'connection_upgrade' "$NGINX_CONF"; then
  cp "$NGINX_CONF" "$NGINX_CONF.bak"
  sed -i '/location \/api\/ {/,/}/ s|proxy_http_version 1.1;|&\n    proxy_set_header Upgrade $http_upgrade;\n    proxy_set_header Connection $connection_upgrade;\n    proxy_read_timeout 3600s;\n    proxy_send_timeout 3600s;|' "$NGINX_CONF"
  if nginx -t; then
    systemctl reload nginx
  else
    mv "$NGINX_CONF.bak" "$NGINX_CONF"
    echo "nginx WebSocket patch rejected; reverted" >&2
  fi
fi

# nginx allows only 1 MB by default. A separate file, because certbot manages noree.conf.
# Slightly above the app's 10 MB upload limit, so the app is what reports oversized files.
echo 'client_max_body_size 12m;' > /etc/nginx/conf.d/noree-upload.conf
if nginx -t; then
  systemctl reload nginx
else
  rm -f /etc/nginx/conf.d/noree-upload.conf
  echo "nginx upload limit rejected; removed" >&2
fi

sudo -iu "$APP_USER" bash -c "cd $API_DIR && npm ci --omit=dev && pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save"

# Health check against the app itself (and its Socket.IO endpoint). Not via nginx on :80:
# after enable-https.sh that server block answers 404 to any Host but the domain.
for i in 1 2 3 4 5 6 7 8; do
  if curl -fsS http://127.0.0.1:3000/ >/dev/null \
    && curl -fsS "http://127.0.0.1:3000/socket.io/?EIO=4&transport=polling" >/dev/null; then
    echo "API healthy"; rm -rf "$TMP"; exit 0
  fi
  sleep 3
done
echo "API health check failed" >&2
exit 1
