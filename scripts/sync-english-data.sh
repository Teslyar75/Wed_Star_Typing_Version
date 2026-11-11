#!/usr/bin/env bash
# Копирует CEFR-наборы и глаголы из десктопного My_Stamina в веб-репо.
# Веб самодостаточен: Docker/локальный запуск не требуют соседний клон.
#
# Использование:
#   ./scripts/sync-english-data.sh
#   ./scripts/sync-english-data.sh /path/to/My_Stamina
#   DESKTOP_ROOT=~/src/My_Stamina ./scripts/sync-english-data.sh
#
# Эталон: My_Stamina master @ 9622f3e (v3.8.3) — stamina/english/data/{sets,verbs}
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/backend/app/data/english"

DESKTOP="${1:-${DESKTOP_ROOT:-}}"
if [[ -z "$DESKTOP" ]]; then
  for c in \
    "$ROOT/../My_Stamina" \
    "$ROOT/../My_New_Stamina" \
    "$HOME/My_Stamina" \
    "$HOME/src/My_Stamina"
  do
    if [[ -d "$c/stamina/english/data/sets" ]]; then
      DESKTOP="$c"
      break
    fi
  done
fi

if [[ -z "$DESKTOP" || ! -d "$DESKTOP/stamina/english/data/sets" ]]; then
  echo "Не найден десктопный data/sets. Укажите путь: $0 /path/to/My_Stamina" >&2
  exit 1
fi

SRC="$DESKTOP/stamina/english/data"
mkdir -p "$DEST/sets" "$DEST/verbs"
cp -a "$SRC/sets/"cefr_*.json "$DEST/sets/"
if [[ -d "$SRC/verbs" ]]; then
  cp -a "$SRC/verbs/"*.json "$DEST/verbs/"
fi

echo "Синхронизировано из: $SRC"
echo "Куда:               $DEST"
python3 - <<'PY'
import json
from pathlib import Path
sets = Path("backend/app/data/english/sets")
levels = ["A1","A2","B1.1","B1.2","B2.1","B2.2","C1","C2"]
total = 0
for lv in levels:
    p = sets / f"cefr_{lv.lower().replace('.','_')}.json"
    n = len(json.loads(p.read_text(encoding="utf-8")).get("words") or [])
    total += n
    print(f"  {lv:5} {n}")
print(f"  TOTAL {total}")
PY
