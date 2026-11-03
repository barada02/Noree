#!/usr/bin/env bash
# One-time EC2 bootstrap (Ubuntu, arm64). Run on the instance as the deploy user:
#   bash setup-server.sh
# Serves the Vite build from /var/www/noree and proxies /api/ to the Nest app on :3000.
set -euo pipefail

sudo apt-get update -y
sudo apt-get install -y curl nginx unzip
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# AWS CLI v2 (the deploy pulls release bundles from S3)
if ! command -v aws >/dev/null; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip
  unzip -q -o /tmp/awscliv2.zip -d /tmp
  sudo /tmp/aws/install
fi

# Web root for the frontend
sudo mkdir -p /var/www/noree
sudo chown "$USER":"$USER" /var/www/noree

sudo rm -f /etc/nginx/sites-enabled/default
sudo tee /etc/nginx/conf.d/noree.conf >/dev/null <<'EOF'
server {
  listen 80 default_server;
  server_name _;

  root /var/www/noree;
  index index.html;

  # Nest API: /api/foo -> http://127.0.0.1:3000/foo
  location /api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # SPA fallback
  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF

sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

# Restart the app on reboot
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | sudo bash

echo "Done. Node $(node -v), pm2 $(pm2 -v), aws $(aws --version)"
echo "Next: create ~/noree-api/.env with the backend's secrets (if any)."
