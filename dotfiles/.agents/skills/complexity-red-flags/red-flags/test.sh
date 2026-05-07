#!/usr/bin/env bash
# Runs each fixture through red-flags, asserts the (flag,file,line) triples in
# fixtures/<name>/expected.json match exactly the findings of that flag in the
# actual output. Other detectors firing on the same fixture are intentionally
# ignored — fixtures contrive cross-firings that real code may legitimately have.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RED_FLAGS=(bun "$SCRIPT_DIR/red-flags.ts")
FIXTURES_DIR="$SCRIPT_DIR/fixtures"

pass=0
fail=0
failed=()

for fixture in "$FIXTURES_DIR"/*/; do
  name=$(basename "$fixture")
  expected_file="$fixture/expected.json"

  [[ -f "$expected_file" ]] || { echo "SKIP $name (no expected.json)"; continue; }

  # Run red-flags. On any error, fall back to empty findings so the test fails
  # with a clear diff rather than an opaque shell error.
  actual=$("${RED_FLAGS[@]}" "$fixture" --format json 2>/dev/null || echo '{"findings":[]}')

  flag=$(jq -r '.findings[0].flag' "$expected_file")
  expected_set=$(jq -r '.findings[] | "\(.flag)\t\(.file)\t\(.line)"' "$expected_file" | sort)
  actual_set=$(echo "$actual" \
    | jq -r --arg flag "$flag" '.findings[] | select(.flag == $flag) | "\(.flag)\t\(.file)\t\(.line)"' \
    | sort)

  if [[ "$expected_set" == "$actual_set" ]]; then
    printf "PASS %s\n" "$name"
    pass=$((pass+1))
  else
    printf "FAIL %s\n" "$name"
    diff <(echo "$expected_set") <(echo "$actual_set") | sed 's/^/    /' || true
    fail=$((fail+1))
    failed+=("$name")
  fi
done

echo ""
echo "Total: $pass passed, $fail failed"
[[ $fail -eq 0 ]]
