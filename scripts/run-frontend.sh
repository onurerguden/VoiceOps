#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${FRONTEND_PORT:-5173}"

cd "$ROOT_DIR/frontend"

if [ ! -d "node_modules" ]; then
  npm install
fi

exec npm run dev -- --host 127.0.0.1 --port "$PORT"
