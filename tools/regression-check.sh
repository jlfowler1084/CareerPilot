#!/bin/bash
# Regression Check — reads feature-manifest.json and verifies all entries
set -e

MANIFEST="feature-manifest.json"
if [ ! -f "$MANIFEST" ]; then
  MANIFEST="dashboard/feature-manifest.json"
fi
if [ ! -f "$MANIFEST" ]; then
  echo "No feature-manifest.json found. Skipping."
  exit 0
fi

BASE=$(python3 -c "import json; print(json.load(open('$MANIFEST')).get('base_path','.'))")
PASS=0
FAIL=0
FAILURES=""

while IFS= read -r feature; do
  NAME=$(echo "$feature" | python3 -c "import sys,json; f=json.load(sys.stdin); print(f['name'])")
  FILE=$(echo "$feature" | python3 -c "import sys,json; f=json.load(sys.stdin); print(f['file'])")
  TICKET=$(echo "$feature" | python3 -c "import sys,json; f=json.load(sys.stdin); print(f.get('ticket',''))")
  EXPORTS=$(echo "$feature" | python3 -c "import sys,json; f=json.load(sys.stdin); print('|'.join(f.get('exports',[])))")
  PATTERNS=$(echo "$feature" | python3 -c "import sys,json; f=json.load(sys.stdin); print('|||'.join(f.get('patterns',[])))")

  FULL_PATH="$BASE/$FILE"
  FAILED=0
  FAIL_REASONS=""

  # File check
  if [ ! -f "$FULL_PATH" ]; then
    FAILED=1
    FAIL_REASONS="$FAIL_REASONS\n     └─ FILE NOT FOUND: $FULL_PATH"
  else
    # Export checks
    if [ -n "$EXPORTS" ]; then
      IFS='|' read -ra EXP_ARR <<< "$EXPORTS"
      for exp in "${EXP_ARR[@]}"; do
        if [ -n "$exp" ] && ! grep -q "$exp" "$FULL_PATH"; then
          FAILED=1
          FAIL_REASONS="$FAIL_REASONS\n     └─ MISSING EXPORT: $exp"
        fi
      done
    fi
    # Pattern checks
    if [ -n "$PATTERNS" ]; then
      IFS='|||' read -ra PAT_ARR <<< "$PATTERNS"
      for pat in "${PAT_ARR[@]}"; do
        if [ -n "$pat" ] && ! grep -q "$pat" "$FULL_PATH"; then
          FAILED=1
          FAIL_REASONS="$FAIL_REASONS\n     └─ MISSING PATTERN: $pat"
        fi
      done
    fi
  fi

  if [ "$FAILED" -eq 0 ]; then
    echo "  ✅ PASS  $TICKET  $NAME"
    PASS=$((PASS + 1))
  else
    echo "  ❌ FAIL  $TICKET  $NAME"
    echo -e "$FAIL_REASONS"
    FAIL=$((FAIL + 1))
    FAILURES="$FAILURES\n$NAME ($FILE)"
  fi
done < <(python3 -c "import json; [print(json.dumps(f)) for f in json.load(open('$MANIFEST'))['features']]")

TOTAL=$((PASS + FAIL))
echo ""
echo "────────────────────────────────────────────────────────"
echo "TOTAL: $PASS/$TOTAL PASS | $FAIL FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo "STATUS: ❌ REGRESSION DETECTED"
  exit 1
else
  echo "STATUS: ✅ ALL CLEAR"
  exit 0
fi
