#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

: "${APP_PASSWORD:=change-me}"
: "${SESSION_SECRET:=dev-session-secret-change-me}"
: "${DATA_DIR:=$ROOT_DIR/.runtime-data}"
: "${PORT:=3000}"
: "${HOSTNAME:=0.0.0.0}"

mkdir -p "$DATA_DIR"

export APP_PASSWORD SESSION_SECRET DATA_DIR PORT HOSTNAME

echo "Building PhD Workspace for production"
echo "DATA_DIR: ${DATA_DIR}"
pnpm build

echo "Starting PhD Workspace"
echo "URL: http://localhost:${PORT}"
echo "Host binding: ${HOSTNAME}:${PORT}"
echo "Access password: ${APP_PASSWORD}"

exec pnpm start --hostname "$HOSTNAME" --port "$PORT"
