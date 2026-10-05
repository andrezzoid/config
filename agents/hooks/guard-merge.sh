#!/usr/bin/env bash
# PreToolUse guard. Every merge goes through `factory pr merge`, which checks
# the forge, the independent verdict and the autonomy gate. A raw merge from
# the shell or the GitHub MCP server would skip all three. Exit 2 blocks the
# tool call and shows stderr to the agent.

input="$(cat)"
if command -v jq >/dev/null 2>&1; then
  tool="$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)"
  cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
else
  tool="$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_name", ""))' 2>/dev/null)"
  cmd="$(printf '%s' "$input" | python3 -c 'import json,sys; print((json.load(sys.stdin).get("tool_input") or {}).get("command", ""))' 2>/dev/null)"
fi

block() { printf 'BLOCKED: %s\n' "$1" >&2; exit 2; }
merge_msg='merging goes through `factory pr merge <PR>`, which checks the forge, the verdict for the head SHA and the autonomy gate. If André told you in words to merge, run `factory pr merge <PR> --human-approved`.'

case "$tool" in
  mcp__github__merge_pull_request|mcp__github__enable_pr_auto_merge) block "$merge_msg" ;;
esac
[ -n "$cmd" ] || exit 0

if printf '%s' "$cmd" | grep -Eq '(^|[;&|(`[:space:]])gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|$)'; then block "$merge_msg"; fi
if printf '%s' "$cmd" | grep -Eq 'gh[[:space:]]+api([[:space:]].*)?pulls/[0-9]+/(merge|ccr/auto_merge)([[:space:]?"'"'"']|$)'; then block "$merge_msg"; fi
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push([[:space:]].*)?[[:space:]](--force|-f)([[:space:]]|$)'; then
  block 'a plain force-push can destroy commits you have not seen. Use --force-with-lease.'
fi
exit 0
