#!/usr/bin/env bash
# Runs on the instance as root, from remote-deploy.sh. Usage: setup-sandbox.sh <sandbox.tgz> <app-user>
# Installs the 3D service into ~/noree-sandbox. Keeps its .env, .venv, registry and artifacts.
set -euo pipefail

TGZ="$1"; APP_USER="$2"
DIR="/home/$APP_USER/noree-sandbox"

if ! python3 -c 'import ensurepip' 2>/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get -o DPkg::Lock::Timeout=120 update -y
  apt-get -o DPkg::Lock::Timeout=120 install -y python3-venv
fi

mkdir -p "$DIR"
# Replace the code, so files deleted from the repo don't linger.
rm -rf "$DIR/app" "$DIR/probes"
tar -xzf "$TGZ" -C "$DIR"
chmod +x "$DIR/run-sandbox.sh"
if [ -f "$DIR/.env" ]; then chmod 600 "$DIR/.env"; fi
chown -R "$APP_USER":"$APP_USER" "$DIR"

# Runs as the app user. Only installs packages when requirements.txt has changed.
# Not "sudo -i": it escapes newlines, which joins this script into one broken line.
sudo -u "$APP_USER" -H bash -euo pipefail -c "
  cd '$DIR'
  python3 --version
  if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi
  want=\$(sha256sum requirements.txt | cut -d' ' -f1)
  have=\$(cat .venv/.requirements.sha 2>/dev/null || true)
  if [ \"\$want\" != \"\$have\" ]; then
    .venv/bin/pip install --quiet --disable-pip-version-check -r requirements.txt
    echo \"\$want\" > .venv/.requirements.sha
  fi
  test -x .venv/bin/uvicorn
"

if [ ! -f "$DIR/.env" ]; then
  echo "NOTE: $DIR/.env is missing. Add MODAL_TOKEN_ID and MODAL_TOKEN_SECRET there, then: pm2 restart noree-sandbox --update-env"
fi
echo "Sandbox installed in $DIR"
