#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT_DIR/.env.example" "$ENV_FILE"
fi

printf "Gemini API key girin (ekranda gorunmez): "
IFS= read -r -s GEMINI_KEY
printf "\n"

if [ -z "$GEMINI_KEY" ]; then
  echo "Key bos olamaz."
  exit 1
fi

TMP_FILE="$(mktemp)"
found=false

while IFS= read -r line || [ -n "$line" ]; do
  if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?GEMINI_API_KEY[[:space:]]*= ]]; then
    printf 'GEMINI_API_KEY=%s\n' "$GEMINI_KEY" >> "$TMP_FILE"
    found=true
  else
    printf '%s\n' "$line" >> "$TMP_FILE"
  fi
done < "$ENV_FILE"

if [ "$found" != "true" ]; then
  printf 'GEMINI_API_KEY=%s\n' "$GEMINI_KEY" >> "$TMP_FILE"
fi

mv "$TMP_FILE" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Key .env dosyasina yazildi."
echo "Kontrol: npm run doctor"
