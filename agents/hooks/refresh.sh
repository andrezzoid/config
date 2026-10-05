#!/usr/bin/env bash
# Cloud SessionStart hook. The environment's setup script runs only when its
# cached snapshot expires (about a week), so pull the harness here instead and
# relink. Never fails the session: a stale harness beats no session.
here="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd -P)"
agents="$(dirname "$here")"
repo="$(dirname "$agents")"
if command -v timeout >/dev/null 2>&1; then t="timeout 60"; else t=""; fi
$t git -C "$repo" pull --ff-only -q >/dev/null 2>&1 || true
$t "$agents/install.sh" --quick >/dev/null 2>&1 || true
exit 0
