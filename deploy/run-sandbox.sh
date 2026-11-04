#!/usr/bin/env bash
# Starts the 3D service (pm2 app: noree-sandbox). It listens on localhost only, so just Nest can reach it.
# Shared keys come from ~/noree-api/.env. ~/noree-sandbox/.env holds what only this service needs: the Modal tokens.
set -euo pipefail
cd "$(dirname "$0")"

set -a
if [ -f ../noree-api/.env ]; then . ../noree-api/.env; fi
if [ -f ./.env ]; then . ./.env; fi
set +a

exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
