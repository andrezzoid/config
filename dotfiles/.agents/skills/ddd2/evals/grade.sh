#!/usr/bin/env bash
# Grades all runs with fresh headless Sonnet graders (artifact-only, one per eval).
#   ./grade.sh [workspace]
set -euo pipefail
IT="${1:-/tmp/ddd2-evals}/iteration-1"

for E in "$IT"/eval-*; do
  (
    claude -p "You are an adversarial eval grader. Grade ONLY from repository observables (files, git log/diffs, delta files, outputs/result.json for tool_use spawn evidence) plus the runner's final reply in outputs/reply.md — a runner claim without corroborating artifacts counts as nothing.

Eval dir: $E

Read $E/eval_metadata.json for the assertions and the grading_context. For EACH arm (with_skill/ and without_skill/): inspect <arm>/repo (git log, git show, working tree, .deltas/ if present), <arm>/outputs/reply.md and <arm>/outputs/git-report.txt. Grade every assertion PASS or FAIL with one line of concrete evidence (commit hash, file path, quote). Write <arm>/grading.json with EXACTLY this shape:
{\"expectations\": [{\"text\": \"<assertion name>: <check text>\", \"passed\": true, \"evidence\": \"<concrete evidence>\"}]}

Grade both arms against the SAME assertions. Return a one-line summary per arm: pass count / total." \
      --model sonnet --max-turns 40 \
      --allowedTools "Read" "Grep" "Glob" "LS" "Write" "Bash(git:*)" "Bash(ls:*)" "Bash(cat:*)" "Bash(node:*)" \
      > "$E/grader-summary.txt" 2> "$E/grader-stderr.log" || true
    echo "graded: $(basename "$E")"
  ) &
done
wait
echo "ALL GRADED — next: python3 $(dirname "$0")/bench.py ${1:-/tmp/ddd2-evals}"
