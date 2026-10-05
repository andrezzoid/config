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
  # No JSON parser: cut the two string fields out of the payload by hand.
  tool="$(printf '%s' "$input" | grep -oE '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed -n 1p | sed -E 's/^[^:]*:[[:space:]]*"//; s/"$//')"
  cmd="$(printf '%s' "$input" | grep -oE '"command"[[:space:]]*:[[:space:]]*"([^"\\]|\\.)*"' | sed -n 1p | sed -E 's/^"command"[[:space:]]*:[[:space:]]*"//; s/"$//')"
  cmd="$(printf '%b' "$cmd")"
fi

block() { printf 'BLOCKED: %s\n' "$1" >&2; exit 2; }
merge_msg='merging goes through `factory pr merge <PR>`, which checks the forge, the verdict for the head SHA and the autonomy gate. If André told you in words to merge, run `factory pr merge <PR> --human-approved`.'

case "$tool" in
  mcp__github__merge_pull_request|mcp__github__enable_pr_auto_merge) block "$merge_msg" ;;
esac
[ -n "$cmd" ] || exit 0

# Join line continuations and turn each newline outside quotes into the command
# separator it is. With mask=1, whitespace inside quotes becomes "_", so a
# commit message that mentions "gh pr merge" stays one word while a quoted
# command word (`"gh" pr merge`) still reads as gh. Quotes and escapes go last.
normalize() {
  printf '%s' "$cmd" | awk -v mask="$1" -v sq="'" -v dq='"' '
    BEGIN { RS = "\001" }
    {
      out = ""; q = ""; n = length($0)
      for (i = 1; i <= n; i++) {
        c = substr($0, i, 1); nx = substr($0, i + 1, 1)
        if (q == "") {
          if (c == "\\" && nx == "\n") { out = out " "; i++; continue }
          if (c == "\n") { out = out ";"; continue }
          if (c == sq || c == dq) q = c
        } else if (c == q) {
          q = ""
        } else if (c == "\\" && q == dq) {
          out = out c nx; i++; continue
        } else if (c == "\n" || c == " " || c == "\t") {
          out = out (mask ? "_" : " "); continue
        }
        out = out c
      }
      printf "%s", out
    }' | tr -d "\"'\\\\"
}
flat="$(normalize 1)"
# A shell wrapper runs its quoted argument as a command: read it unmasked.
if printf '%s' "$flat" | grep -Eq '(^|[;&|(){}`[:space:]])((ba|z|da)?sh[[:space:]]+-[A-Za-z]*c|eval)([[:space:]]|$)'; then
  flat="$(normalize 0)"
fi
matches() { printf '%s' "$flat" | grep -Eq "$1"; }

sep='[;&|(){}`]'
end='([[:space:];&|(){}`]|$)'
gh="(^|${sep}|[[:space:]/])gh"
repo='([[:space:]]+(-R|--repo)([[:space:]]+|=)[^[:space:];&|]+)*'
# A call to GitHub's API from gh or curl, up to the end of that command.
api_call="(${gh}[[:space:]]([^;&|]*[[:space:]])?api[[:space:]]|curl[[:space:]][^;&|]*api\.github\.com)[^;&|]*"

if matches "${gh}${repo}[[:space:]]+pr${repo}[[:space:]]+merge${end}"; then block "$merge_msg"; fi
if matches "${api_call}pulls/[^[:space:];&|]*/(merge|ccr/auto_merge)([^[:alnum:]_/-]|$)"; then block "$merge_msg"; fi
if matches "${api_call}(mergePullRequest|enablePullRequestAutoMerge)"; then block "$merge_msg"; fi

# A force push in any form but --force-with-lease: --force, -f inside a flag
# cluster (-fu), or a +refspec. Only `push` as git's own subcommand counts, so
# `git commit -m "push -f"` and `git stash push` pass.
git_opts='([[:space:]]+(-C|-c|--git-dir|--work-tree|--namespace)([[:space:]]+|=)[^[:space:];&|]+|[[:space:]]+--?[A-Za-z][A-Za-z-]*)*'
pushes="$(printf '%s' "$flat" | grep -Eo "(^|${sep}|[[:space:]])git${git_opts}[[:space:]]+push([[:space:]][^;&|]*)?" || true)"
if [ -n "$pushes" ] && printf '%s\n' "$pushes" | sed -E "s/^.?git${git_opts}[[:space:]]+push//" |
  grep -Eq '(^|[[:space:]])(--force([[:space:]=]|$)|-[A-Za-z]*f[A-Za-z]*([[:space:]]|$)|\+[^[:space:]]+)'; then
  block 'a plain force-push can destroy commits you have not seen. Use --force-with-lease.'
fi
exit 0
