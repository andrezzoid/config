#!/usr/bin/env bash
# PreToolUse guard. Every merge goes through `factory pr merge`, which checks
# the forge, the independent verdict and the autonomy gate. A raw merge from
# the shell or the GitHub MCP server would skip all three. Exit 2 blocks the
# tool call and shows stderr to the agent.
#
# This is a fence against an agent drifting onto the short path, not a wall
# against one set on getting through: a script can still call the API. The wall
# is the forge's own branch protection.

input="$(cat)"
if command -v jq >/dev/null 2>&1; then
  tool="$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)"
  cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
elif command -v python3 >/dev/null 2>&1; then
  tool="$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_name", ""))' 2>/dev/null)"
  cmd="$(printf '%s' "$input" | python3 -c 'import json,sys; print((json.load(sys.stdin).get("tool_input") or {}).get("command", ""))' 2>/dev/null)"
else
  # No parser: match the raw payload, which holds the command JSON-escaped.
  tool="$input"
  cmd="$input"
fi

block() { printf 'BLOCKED: %s\n' "$1" >&2; exit 2; }
merge_msg='merging goes through `factory pr merge <PR>`, which checks the forge, the verdict for the head SHA and the autonomy gate. If André told you in words to merge, run `factory pr merge <PR> --human-approved`.'

case "$tool" in
  *mcp__github__merge_pull_request*|*mcp__github__enable_pr_auto_merge*) block "$merge_msg" ;;
esac
[ -n "$cmd" ] || exit 0

# Quotes and escapes only hide words from the patterns: `"gh" pr merge`.
flat="$(printf '%s' "$cmd" | tr -d "\"'\\\\")"
matches() { printf '%s' "$flat" | grep -Eq "$1"; }

# gh, by any path, with -R/--repo before the subcommand.
# The extra ':' and '{' boundaries cover the raw-payload fallback.
gh_word='(^|[;&|({:`[:space:]/])gh'
repo_flags='([[:space:]]+(-R|--repo)([[:space:]]+|=)[^[:space:]]+)*'
if matches "${gh_word}${repo_flags}[[:space:]]+pr[[:space:]]+merge([[:space:]}]|$)"; then block "$merge_msg"; fi
if matches "${gh_word}[[:space:]].*api([[:space:]].*)?pulls/[^[:space:]]*/(merge|ccr/auto_merge)([[:space:]?]|$)"; then block "$merge_msg"; fi
if matches '(mergePullRequest|enablePullRequestAutoMerge)'; then block "$merge_msg"; fi

# A force push in any form but --force-with-lease: --force, -f inside a flag
# cluster (-fu), or a +refspec. git's global options may precede push.
pushes="$(printf '%s' "$flat" | grep -Eo 'git([[:space:]]+[^;&|[:space:]]+)*[[:space:]]+push([[:space:]][^;&|]*)?' || true)"
if [ -n "$pushes" ] && printf '%s\n' "$pushes" | sed -E 's/^.*[[:space:]]push//' |
  grep -Eq '(^|[[:space:]])(--force([[:space:]=]|$)|-[A-Za-z]*f[A-Za-z]*([[:space:]]|$)|\+[^[:space:]]+)'; then
  block 'a plain force-push can destroy commits you have not seen. Use --force-with-lease.'
fi
exit 0
