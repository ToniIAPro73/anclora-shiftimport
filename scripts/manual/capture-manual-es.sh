#!/usr/bin/env bash
# Captura las pantallas del manual en español desde producción con la identidad QA
# qa.shiftimport@anclora.test (ver scripts/manual/capture-manual-es.mjs).
# Uso: bash scripts/manual/capture-manual-es.sh [--only a.png,b.png] [--list] [--no-seed]
set -euo pipefail
cd "$(dirname "$0")/../.."

BRANCH="$(git branch --show-current 2>/dev/null || echo '?')"
if [ "$BRANCH" != "development" ]; then
  echo "⚠ Rama actual '$BRANCH' (se esperaba development). Se continúa igualmente."
fi

if ! command -v node >/dev/null 2>&1; then
  echo "✗ No se encontró node. Instala Node.js 22 o superior."
  exit 1
fi

node scripts/manual/capture-manual-es.mjs "$@"

echo
echo "Siguiente paso: Avísame en el chat para revisar las capturas y regenerar el PDF"
