#!/usr/bin/env bash
# One-time HTTPS setup with Let's Encrypt. Run on the instance AFTER:
#   - setup-server.sh has run
#   - the domain's A record points at the instance's Elastic IP
#   - the security group allows inbound 80 and 443
# Usage: EMAIL=you@example.com bash enable-https.sh        (DOMAIN defaults to kanya.alito.tech)
set -euo pipefail

DOMAIN="${DOMAIN:-kanya.alito.tech}"
EMAIL="${EMAIL:?Set EMAIL, e.g. EMAIL=you@example.com bash enable-https.sh}"

command -v certbot >/dev/null || sudo snap install --classic certbot

# certbot --nginx needs a server block with the real domain name
sudo sed -i "s/server_name .*;/server_name $DOMAIN;/" /etc/nginx/conf.d/noree.conf
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d "$DOMAIN" --redirect -m "$EMAIL" --agree-tos --no-eff-email --non-interactive

curl -fsSI "https://$DOMAIN/" | head -1
echo "HTTPS enabled for $DOMAIN. Renewal is automatic (check: sudo certbot renew --dry-run)."
