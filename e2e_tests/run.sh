#!/bin/bash
set -e
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
ERRORS=""

for dir in e2e_tests/*/; do
  [ -f "$dir/verify.ts" ] || continue
  name=$(basename "$dir")
  echo ""
  echo "=== $name ==="
  if (cd "$dir" && npx tsx verify.ts 2>&1); then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    ERRORS="$ERRORS  - $name\n"
  fi
done

echo ""
echo "========================"
echo "$PASS passed, $FAIL failed"
if [ $FAIL -gt 0 ]; then
  echo -e "Failed:\n$ERRORS"
fi
exit $FAIL
