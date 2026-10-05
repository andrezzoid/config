#!/usr/bin/env bash
# Puts this harness into a Claude Code cloud environment the way `stow
# dotfiles/ -t ~` does on the Mac. Paste one line into the environment's Setup
# script field (claude.ai/code, environment menu, Edit):
#
#   curl -fsSL https://raw.githubusercontent.com/andrezzoid/config/master/scripts/cloud-setup.sh | bash
#
# It clones this repo to ~/.agent-config, links ~/.agents to its
# dotfiles/.agents, and links CLAUDE.md, every skill and every agent from
# dotfiles/.claude into ~/.claude, each resolved to its final target. Links,
# not copies, so a `git pull` updates every skill in place: the factory mod
# re-runs this script at each cloud session start, because the environment
# keeps the setup snapshot for about a week. A re-run pulls, adds new links and
# prunes links whose source is gone. settings.json, keybindings and the herdr
# hook stay Mac-only: the factory mod carries what cloud sessions need.
#
# HARNESS_REF picks a branch other than master; HARNESS_REPO another clone source.
set -euo pipefail
REPO="${HARNESS_REPO:-https://github.com/andrezzoid/config}"
REF="${HARNESS_REF:-master}"
DIR="$HOME/.agent-config"
CLAUDE="$HOME/.claude"

if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only -q || echo "cloud-setup: pull failed, keeping $(git -C "$DIR" rev-parse --short HEAD)" >&2
else
  git clone -q --depth 1 --branch "$REF" "$REPO" "$DIR"
fi
src="$DIR/dotfiles"

# ~/.agents, folded into one link as stow does, for harnesses that read it.
if [ -L "$HOME/.agents" ] || [ ! -e "$HOME/.agents" ]; then
  ln -sfn "$src/.agents" "$HOME/.agents"
else
  echo "cloud-setup: ~/.agents is a real folder, left alone" >&2
fi

# Links $2 to the final target of $1. A real file or folder already at $2 is
# someone's own: it stays, with a warning, as stow would refuse it too.
linked=0
link() {
  if [ -e "$2" ] && [ ! -L "$2" ]; then
    echo "cloud-setup: $2 is a real file or folder, left alone" >&2
    return
  fi
  ln -sfn "$(readlink -f "$1")" "$2"
  linked=$((linked + 1))
}

mkdir -p "$CLAUDE/skills" "$CLAUDE/agents"
link "$src/.claude/CLAUDE.md" "$CLAUDE/CLAUDE.md"
for kind in skills agents; do
  for entry in "$src/.claude/$kind"/*; do
    link "$entry" "$CLAUDE/$kind/$(basename "$entry")"
  done
  for existing in "$CLAUDE/$kind"/*; do
    if [ -L "$existing" ] && [[ "$(readlink "$existing")" == "$DIR"/* ]] && [ ! -e "$src/.claude/$kind/$(basename "$existing")" ]; then
      rm "$existing"
    fi
  done
done

if ! node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 18) ? 0 : 1)' 2>/dev/null; then
  echo "cloud-setup: the factory CLI needs Node 22.18 or later on PATH" >&2
fi
echo "cloud-setup: $linked links into ~/.claude from $(git -C "$DIR" rev-parse --short HEAD)"
