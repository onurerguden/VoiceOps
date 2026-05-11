#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -x "$ROOT_DIR/.venv/bin/pytest" ]; then
  echo "Python test bagimliliklari eksik. Once setup calistirin:"
  echo "npm run setup"
  exit 1
fi

cd "$ROOT_DIR/backend"
"$ROOT_DIR/.venv/bin/pytest"

cd "$ROOT_DIR/frontend"
npm run lint
npm run build
