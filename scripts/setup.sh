#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "VoiceOps setup basliyor..."

if [ ! -f ".env" ]; then
  cp ".env.example" ".env"
  echo ".env olusturuldu. GEMINI_API_KEY degerini bu dosyaya ekleyin."
else
  echo ".env zaten var, dokunulmadı."
fi

if [ ! -d ".venv" ]; then
  python3 -m venv ".venv"
  echo "Python virtualenv olusturuldu: .venv"
fi

".venv/bin/pip" install -r requirements.txt

cd "$ROOT_DIR/frontend"
npm install

echo
echo "Setup tamam."
echo "Key ekli degilse: .env dosyasinda GEMINI_API_KEY alanini doldurun."
echo "Uygulamayi baslatmak icin repo kokunde: npm run dev"
echo "Kontrol icin: npm run doctor"
