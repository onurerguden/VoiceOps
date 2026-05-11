#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_ENV="$ROOT_DIR/.env"
LEGACY_BACKEND_ENV="$ROOT_DIR/backend/.env"

echo "VoiceOps doctor"
echo "Repo: $ROOT_DIR"
echo

check_env_file() {
  local file="$1"
  local optional="${2:-false}"
  if [ ! -f "$file" ]; then
    if [ "$optional" = "true" ]; then
      echo "- $file: yok (opsiyonel)"
    else
      echo "- $file: yok"
    fi
    return
  fi

  local length
  length="$(awk -F= '
    /^[[:space:]]*(export[[:space:]]+)?GEMINI_API_KEY[[:space:]]*=/ {
      val=$0
      sub(/^[^=]*=/, "", val)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
      gsub(/^"|"$/, "", val)
      gsub(/^'\''|'\''$/, "", val)
      print length(val)
      found=1
    }
    END { if (!found) print 0 }
  ' "$file")"

  if [ "$length" -gt 0 ]; then
    echo "- $file: GEMINI_API_KEY set, length=$length"
  else
    echo "- $file: GEMINI_API_KEY BOS"
  fi
}

check_env_file "$ROOT_ENV"
if [ -f "$LEGACY_BACKEND_ENV" ]; then
  echo "- $LEGACY_BACKEND_ENV: var ama kullanilmiyor; root .env kullanin"
fi

echo
if [ -x "$ROOT_DIR/.venv/bin/python" ]; then
  echo "- Python venv: OK"
else
  echo "- Python venv: eksik, npm run setup calistirin"
fi

if [ -d "$ROOT_DIR/frontend/node_modules" ]; then
  echo "- Frontend node_modules: OK"
else
  echo "- Frontend node_modules: eksik, npm run setup calistirin"
fi

echo
echo "Tek gerekli env dosyasi root .env dosyasidir."
echo "Key bos ise .env dosyasini acip su satiri doldurun:"
echo "GEMINI_API_KEY=AIza..."
