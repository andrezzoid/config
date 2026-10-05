#!/usr/bin/env bash
# Installs the agent harness into $HOME, the same way on a Mac and in a Claude
# Code cloud session. Idempotent: run it after every pull.
#
#   agents/install.sh            local install (default outside the cloud)
#   agents/install.sh --cloud    cloud install (default when CLAUDE_CODE_REMOTE=true)
#   agents/install.sh --quick    skip third-party installs when skills.txt is unchanged
#   agents/install.sh --check    report what is missing, change nothing
#   agents/install.sh --bump     move every pin in skills.txt to its source's HEAD
set -euo pipefail

AGENTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_DIR="$(dirname "$AGENTS_DIR")"
MODE=local
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && MODE=cloud
QUICK=0
CHECK=0
BUMP=0
for arg in "$@"; do
  case "$arg" in
    --cloud) MODE=cloud ;;
    --local) MODE=local ;;
    --quick) QUICK=1 ;;
    --check) CHECK=1 ;;
    --bump) BUMP=1 ;;
    -h|--help) sed -n '2,10p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "install.sh: unknown option $arg" >&2; exit 64 ;;
  esac
done

CLAUDE_HOME="$HOME/.claude"
AGENTS_HOME="$HOME/.agents"
STABLE="$HOME/.local/share/agent-harness"
MANIFEST="$AGENTS_DIR/skills.txt"
SKILLS_CLI="skills@1.7.0"
# Skills that only make sense on the Mac; `factory doctor` reads the same file.
LOCAL_ONLY="$(grep -v '^#' "$AGENTS_DIR/local-only.txt" | tr '\n' ' ')"

say() { printf '%s\n' "$*"; }
warn() { printf 'warn: %s\n' "$*" >&2; }

# Full-line comments start with '#'; a source line is owner/repo#<sha> skill...
manifest_lines() { grep -E '^[^[:space:]#]+#[0-9a-f]{40}[[:space:]]' "$MANIFEST" || true; }

if [ "$BUMP" = 1 ]; then
  tmp="$(mktemp)"
  while IFS= read -r line; do
    if printf '%s' "$line" | grep -qE '^[^[:space:]#]+#[0-9a-f]{40}[[:space:]]'; then
      src="${line%%#*}"
      old="$(printf '%s' "$line" | sed -E 's/^[^#]+#([0-9a-f]{40}).*/\1/')"
      # `|| true` keeps set -e from exiting before the fallback below.
      new="$(git ls-remote "https://github.com/$src" HEAD </dev/null | cut -c1-40 || true)"
      [ -n "$new" ] || { warn "cannot reach $src, keeping $old"; new="$old"; }
      [ "$old" = "$new" ] || say "bump $src ${old:0:7} -> ${new:0:7}"
      printf '%s\n' "${line/$old/$new}" >>"$tmp"
    else
      printf '%s\n' "$line" >>"$tmp"
    fi
  done <"$MANIFEST"
  mv "$tmp" "$MANIFEST"
  say "review with: git -C '$REPO_DIR' diff agents/skills.txt, then rerun install.sh"
  exit 0
fi

is_local_only() { case " $LOCAL_ONLY " in *" $1 "*) return 0 ;; esac; return 1; }

own_skills() {
  for dir in "$AGENTS_DIR"/skills/*/; do
    name="$(basename "$dir")"
    if [ "$MODE" = cloud ] && is_local_only "$name"; then continue; fi
    printf '%s\n' "$name"
  done
}

third_party_skills() { manifest_lines | while read -r _src names; do printf '%s\n' $names; done; }

# A link's target as an absolute path; stow writes relative ones.
target_of() {
  t="$(readlink "$1" 2>/dev/null || true)"
  case "$t" in
    /*) printf '%s' "$t" ;;
    *) printf '%s/%s' "$(dirname "$1")" "$t" ;;
  esac
}

# A link we own points into this checkout, the stable path, or the old stow
# layout (dotfiles/.agents, dotfiles/.claude), whether or not its target exists.
points_home() {
  case "$(target_of "$1")" in
    "$REPO_DIR"|"$REPO_DIR"/*|"$STABLE"|"$STABLE"/*|*/dotfiles/.agents|*/dotfiles/.agents/*|*/dotfiles/.claude/*|*/.agents/skills/*) return 0 ;;
  esac
  return 1
}

if [ "$CHECK" = 1 ]; then
  missing=0
  for name in $(own_skills) $(third_party_skills); do
    [ -f "$CLAUDE_HOME/skills/$name/SKILL.md" ] || { say "missing skill: $name"; missing=1; }
  done
  [ -e "$CLAUDE_HOME/CLAUDE.md" ] || { say "missing: $CLAUDE_HOME/CLAUDE.md"; missing=1; }
  command -v factory >/dev/null 2>&1 || [ -x "$HOME/.local/bin/factory" ] || { say "missing: factory on PATH"; missing=1; }
  [ "$missing" = 0 ] && say "harness complete ($MODE)"
  exit "$missing"
fi

# The old layout stowed ~/.agents and ~/.claude/{skills,agents,commands} as
# symlinks into dotfiles/. Those targets are gone, so turn each into a real
# directory before anything is written through it.
for d in "$AGENTS_HOME" "$AGENTS_HOME/skills" "$AGENTS_HOME/agents" "$CLAUDE_HOME/skills" "$CLAUDE_HOME/agents" "$CLAUDE_HOME/commands"; do
  if [ -L "$d" ]; then
    if [ ! -e "$d" ] || points_home "$d"; then
      rm "$d"
      say "replaced legacy symlink $d"
    else
      warn "$d is a symlink to $(readlink "$d"); leaving it alone"
    fi
  fi
done
# Git leaves untracked files (a Finder .DS_Store) behind when a folder leaves
# the repo; stow then keeps folding ~/.agents into it.
[ -d "$REPO_DIR/dotfiles/.agents" ] && warn "$REPO_DIR/dotfiles/.agents is an untracked leftover; delete it so stow stops folding ~/.agents"
mkdir -p "$CLAUDE_HOME/skills" "$CLAUDE_HOME/agents" "$CLAUDE_HOME/hooks" "$HOME/.local/bin" "$(dirname "$STABLE")"
[ "$MODE" = local ] && mkdir -p "$AGENTS_HOME/skills" "$AGENTS_HOME/agents"
[ -d "$CLAUDE_HOME/commands" ] && [ -z "$(ls -A "$CLAUDE_HOME/commands")" ] && rmdir "$CLAUDE_HOME/commands"

# Links that pointed at skills this repo no longer ships (ddd2, quiz-me, ...).
for d in "$CLAUDE_HOME/skills" "$CLAUDE_HOME/agents" "$AGENTS_HOME/skills" "$AGENTS_HOME/agents"; do
  [ -d "$d" ] || continue
  for entry in "$d"/* "$d"/.[!.]*; do
    if [ -L "$entry" ] && [ ! -e "$entry" ] && points_home "$entry"; then
      rm "$entry"
      say "removed stale link $entry"
    fi
  done
done

# link <target> <link>: replace our own links, never clobber a real file.
link() {
  if [ -L "$2" ]; then
    [ "$(readlink "$2")" = "$1" ] && return 0
    rm "$2"
  elif [ -e "$2" ]; then
    backup="$2.bak-$(date +%Y%m%d%H%M%S)"
    mv "$2" "$backup"
    warn "moved existing $2 to $backup"
  fi
  ln -s "$1" "$2"
}

link "$AGENTS_DIR" "$STABLE"
for name in $(own_skills); do
  link "$STABLE/skills/$name" "$CLAUDE_HOME/skills/$name"
  [ "$MODE" = local ] && link "$STABLE/skills/$name" "$AGENTS_HOME/skills/$name"
done
for f in "$AGENTS_DIR"/subagents/claude/*.md; do link "$STABLE/subagents/claude/$(basename "$f")" "$CLAUDE_HOME/agents/$(basename "$f")"; done
if [ "$MODE" = local ]; then
  for f in "$AGENTS_DIR"/subagents/opencode/*.md; do link "$STABLE/subagents/opencode/$(basename "$f")" "$AGENTS_HOME/agents/$(basename "$f")"; done
  link "$STABLE/AGENTS.md" "$AGENTS_HOME/AGENTS.md"
fi
link "$STABLE/AGENTS.md" "$CLAUDE_HOME/CLAUDE.md"
link "$STABLE/factory/bin/factory" "$HOME/.local/bin/factory"
if [ "$MODE" = cloud ] && [ -w /usr/local/bin ]; then link "$STABLE/factory/bin/factory" /usr/local/bin/factory; fi
say "linked $(own_skills | wc -l | tr -d ' ') own skills, subagents, CLAUDE.md and factory ($MODE)"

# Third-party skills. The stamp records which manifest was last installed, so
# --quick (the cloud SessionStart refresh) costs nothing when it is unchanged.
stamp="$CLAUDE_HOME/skills/.harness-manifest"
want="$(cksum <"$MANIFEST" | cut -d' ' -f1)"
all_present=1
for name in $(third_party_skills); do [ -f "$CLAUDE_HOME/skills/$name/SKILL.md" ] || all_present=0; done
if [ "$QUICK" = 1 ] && [ "$all_present" = 1 ] && [ "$(cat "$stamp" 2>/dev/null)" = "$want" ]; then
  say "third-party skills unchanged"
else
  command -v npx >/dev/null 2>&1 || { warn "npx not found: third-party skills not installed"; exit 1; }
  failed=0
  while read -r src names; do
    set -- $names
    flags=""
    for n in "$@"; do
      # A same-named link left by the old layout would make npx write into it.
      [ -L "$CLAUDE_HOME/skills/$n" ] && rm "$CLAUDE_HOME/skills/$n"
      flags="$flags --skill $n"
    done
    # npx reads stdin; without </dev/null it eats the rest of the manifest.
    if npx -y "$SKILLS_CLI" add "$src" $flags -g -a claude-code -y </dev/null >/dev/null 2>&1; then
      say "installed $src: $*"
    else
      warn "npx skills add $src failed"
      failed=1
    fi
  done < <(manifest_lines)
  [ "$failed" = 0 ] && printf '%s\n' "$want" >"$stamp"
fi

# Cloud sessions get the hooks a Mac gets from dotfiles/.claude/settings.json:
# refresh the harness at session start, and route every merge through the gate.
if [ "$MODE" = cloud ]; then
  command -v bun >/dev/null 2>&1 || [ -x "$HOME/.bun/bin/bun" ] || npm install -g bun >/dev/null 2>&1 || warn "bun missing: factory will not run"
  bun_bin="$(command -v bun || echo "$HOME/.bun/bin/bun")"
  "$bun_bin" "$AGENTS_DIR/factory/src/settings.ts" "$CLAUDE_HOME/settings.json" "$STABLE"
fi

say "done. verify with: factory doctor"
