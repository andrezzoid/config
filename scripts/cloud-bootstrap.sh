#!/bin/bash
# Install the agent harness from this repo into a Claude Code cloud container.
#
# Cloud sessions never see a laptop's ~/.claude, but they do read the container's own
# ~/.claude before Claude Code starts. The cloud environment's setup script runs first, so
# it can put the harness there. Paste this into the environment's Setup script:
#
#   git clone --depth 1 https://github.com/andrezzoid/config /opt/harness
#   bash /opt/harness/scripts/cloud-bootstrap.sh
#
# Setup output is cached for days, so the harness is linked, not copied, and a SessionStart
# hook pulls /opt/harness at the start of every session to keep skill bodies current.
# Rerunning is safe. Local-only pieces (settings.json with macOS paths, zellij, herdr) stay out.
set -euo pipefail

harness="${HARNESS_DIR:-/opt/harness}"
src="$harness/dotfiles"
home="${HOME:-/root}"
[ -d "$src/.agents/skills" ] || { echo "cloud-bootstrap: no harness at $harness" >&2; exit 1; }

mkdir -p "$home/.claude/skills" "$home/.claude/agents" "$home/.claude/commands" "$home/.agents"

# One link per skill, so Claude's own entries in ~/.claude/skills stay untouched.
for skill in "$src/.agents/skills"/*/; do
  ln -sfn "${skill%/}" "$home/.claude/skills/$(basename "$skill")"
done
for agent in "$src/.claude/agents"/*.md; do ln -sfn "$agent" "$home/.claude/agents/"; done
for command in "$src/.agents/commands"/*.md; do ln -sfn "$command" "$home/.claude/commands/"; done
ln -sfn "$src/.agents/scripts" "$home/.agents/scripts"
ln -sfn "$src/.agents/AGENTS.md" "$home/.claude/CLAUDE.md"

# Keep the clone current between cache rebuilds. Only add the hook when there's no user
# settings file yet, so this never rewrites settings someone else wrote.
settings="$home/.claude/settings.json"
if [ ! -e "$settings" ]; then
  cat > "$settings" <<JSON
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "git -C $harness pull --ff-only --quiet || true", "timeout": 30 }] }
    ]
  }
}
JSON
fi

echo "cloud-bootstrap: linked $(ls -d "$src/.agents/skills"/*/ | wc -l | tr -d ' ') skills from $harness"
