#!/usr/bin/env bash
# Bootstrap for a Claude Code cloud environment. Put this one line in the
# environment's "Setup script" field (claude.ai/code → environment → Edit):
#
#   curl -fsSL https://raw.githubusercontent.com/andrezzoid/config/master/agents/cloud-setup.sh | bash
#
# It clones this repo to ~/.agent-config and runs the installer in cloud mode.
# Every later session pulls and relinks through the SessionStart hook, so the
# week-long setup snapshot never serves stale skills.
set -euo pipefail
REF="${HARNESS_REF:-master}"
DIR="$HOME/.agent-config"
if [ -d "$DIR/.git" ] && git -C "$DIR" pull --ff-only -q; then
  :
else
  rm -rf "$DIR"
  git clone -q --depth 1 --branch "$REF" https://github.com/andrezzoid/config "$DIR"
fi
CLAUDE_CODE_REMOTE=true "$DIR/agents/install.sh" --cloud
