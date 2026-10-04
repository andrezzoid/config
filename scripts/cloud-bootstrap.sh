#!/bin/bash
# Install the agent harness from this repo into a Claude Code cloud container.
#
# Cloud sessions never see a laptop's ~/.claude, but they do read the container's own: a
# skill linked into ~/.claude/skills shows up even mid-session. Paste this into the cloud
# environment's Setup script, naming the branch that holds the harness:
#
#   git clone --depth 1 -b master https://github.com/andrezzoid/config /opt/harness
#   bash /opt/harness/scripts/cloud-bootstrap.sh
#
# Setup output is cached for days, so everything is linked, not copied, and a SessionStart
# hook pulls /opt/harness and reruns this script at the start of every session. Unverified:
# whether that user-level hook and ~/.claude/CLAUDE.md load in the very first session, since
# the environment log shows Claude Code preloading while setup still runs. Skills don't
# depend on either. Rerunning is safe. Local-only pieces (the laptop settings.json with
# macOS paths, zellij, herdr) stay out.
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
      { "hooks": [{ "type": "command", "command": "git -C $harness pull --ff-only --quiet && bash $harness/scripts/cloud-bootstrap.sh >/dev/null; true", "timeout": 60 }] }
    ]
  }
}
JSON
fi

echo "cloud-bootstrap: linked $(ls -d "$src/.agents/skills"/*/ | wc -l | tr -d ' ') skills from $harness"
