#!/usr/bin/env bash
# ddd2 eval runner.
#   ./run.sh [workspace]           — build fixtures, run 5 evals × 2 arms headlessly
#   MODEL=opus PAR=4 ./run.sh …    — override runner model / parallelism
# with_skill arm = your live config (park old ddd first, see README);
# without_skill arm = same prompt prefixed with "do not use skills".
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MODEL="${MODEL:-opus}"

if [ "${1:-}" = "--one" ]; then
  E="$2"; ARM="$3"; D="$E/$ARM"
  P="$E/prompt.txt"; [ "$ARM" = "without_skill" ] && P="$E/prompt-baseline.txt"
  cd "$D/repo"
  claude -p "$(cat "$P")" --model "$MODEL" --output-format json \
    --max-turns 120 \
    --allowedTools "Read" "Grep" "Glob" "LS" "Edit" "Write" "MultiEdit" "TodoWrite" "Task" "Skill" \
      "Bash(git:*)" "Bash(npm:*)" "Bash(node:*)" "Bash(ls:*)" "Bash(cat:*)" "Bash(mkdir:*)" "Bash(cp:*)" "Bash(mv:*)" "Bash(open:*)" \
    > "$D/outputs/result.json" 2> "$D/outputs/stderr.log" || true
  # result.json is an event array; the final "result" event carries reply + usage
  jq -r 'if type=="array" then ([.[] | select(.type=="result")][0].result // "NO RESULT") else (.result // "NO RESULT") end' \
    "$D/outputs/result.json" > "$D/outputs/reply.md" 2>/dev/null || true
  jq 'if type=="array" then [.[] | select(.type=="result")][0] else . end
      | {duration_ms, num_turns, total_cost_usd, usage: {output_tokens: .usage.output_tokens, input_tokens: .usage.input_tokens}}' \
    "$D/outputs/result.json" > "$D/timing.json" 2>/dev/null || true
  { echo "=== git log ==="; git log --oneline --stat | head -80
    echo "=== status ==="; git status --porcelain
    echo "=== deltas ==="; ls .deltas/ 2>/dev/null && cat .deltas/*.md 2>/dev/null
  } > "$D/outputs/git-report.txt" 2>&1
  echo "[$(date +%H:%M:%S)] done: $(basename "$E")/$ARM"
  exit 0
fi

WS="${1:-/tmp/ddd2-evals}"
PAR="${PAR:-4}"
"$HERE/fixtures.sh" "$WS"
IT="$WS/iteration-1"
for M in "$HERE"/metadata/eval-*.json; do
  cp "$M" "$IT/$(basename "$M" .json)/eval_metadata.json"
done
echo "running 10 sessions (model=$MODEL, parallel=$PAR) — this bills real tokens"
{ for E in "$IT"/eval-*; do for ARM in with_skill without_skill; do echo "$E $ARM"; done; done; } \
  | xargs -P "$PAR" -n 2 "$HERE/run.sh" --one
echo "ALL RUNS COMPLETE — next: ./grade.sh $WS"
