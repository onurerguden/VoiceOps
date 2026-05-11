#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

cleanup() {
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Backend baslatiliyor: http://127.0.0.1:${BACKEND_PORT}"
BACKEND_PORT="$BACKEND_PORT" bash "$ROOT_DIR/scripts/run-backend.sh" &
BACKEND_PID=$!

echo "Backend hazir olana kadar bekleniyor..."
backend_ready=false
for _ in {1..30}; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "Backend baslamadan kapandi. Yukaridaki hatayi kontrol edin."
    exit 1
  fi
  if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
    backend_ready=true
    break
  fi
  sleep 1
done

if [ "$backend_ready" != "true" ]; then
  echo "Backend 30 saniye icinde hazir olmadi."
  exit 1
fi

echo "Frontend baslatiliyor: http://127.0.0.1:${FRONTEND_PORT}"
FRONTEND_PORT="$FRONTEND_PORT" bash "$ROOT_DIR/scripts/run-frontend.sh"
