#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${BACKEND_PORT:-8000}"
ROOT_ENV="$ROOT_DIR/.env"

cd "$ROOT_DIR"

if [ ! -f "$ROOT_ENV" ]; then
  cp ".env.example" "$ROOT_ENV"
  echo ".env olusturuldu. Once GEMINI_API_KEY degerini doldurun:"
  echo "$ROOT_ENV"
  exit 1
fi

has_key=false
if [ -f "$ROOT_ENV" ] && grep -Eq '^[[:space:]]*(export[[:space:]]+)?GEMINI_API_KEY[[:space:]]*=[[:space:]]*[^[:space:]#]+' "$ROOT_ENV"; then
  has_key=true
fi

if [ "$has_key" != "true" ]; then
  echo "GEMINI_API_KEY bos gorunuyor. Lutfen key'i root .env dosyasina ekleyin:"
  echo "$ROOT_ENV"
  exit 1
fi

if [ ! -x ".venv/bin/python" ]; then
  echo ".venv bulunamadi. Once setup calistirin:"
  echo "npm run setup"
  exit 1
fi

cd "$ROOT_DIR/backend"
"$ROOT_DIR/.venv/bin/python" -m app.seed
exec "$ROOT_DIR/.venv/bin/uvicorn" app.main:app --reload --host 127.0.0.1 --port "$PORT"
