---
name: recall
description: Rebuild your recent working context on a topic from past Claude Code sessions, git, GitHub and any .factory notes, then hand back a short current-state brief and the next move. Use for "recall X", "catch me up on X", "where did I leave off", "what was I doing on X", or before resuming work that spans sessions.
argument-hint: "[topic] [days]"
---

# Recall

You're picking up work that lives in sessions you can't see. Rebuild just enough of it to act, and stop. Recall is read-only: it changes nothing, and the brief is the whole output.

## 1. Route first

- The human already gave you a state capsule (branch, PR, what's done): use it and skip the mining.
- Otherwise continue.

## 2. Lock the scope

The topic, a window (default 7 days), and the current project. Read other projects' sessions only when asked. State the scope in one line.

## 3. Mine your sessions

`~/.agents/scripts/transcripts sessions --days 7` lists the window's sessions with their first prompt. `transcripts turns --grep '<topic>'` pulls the human turns about the topic along with the agent text each one answered. For one or two sessions, read them directly. For more, give each subagent a few session ids and have it return, per session: the goal, decisions made, open threads, corrections the human made, and artifacts (branches, PRs, tickets, files), each tagged with its session id. The raw transcripts stay in the subagents.

## 4. Sweep the shared record

When the topic names a feature, file, subsystem or bug, your own sessions are half the story. Ask what the current state is, what was tried and didn't hold, and what is still reported:

- `git log --since=<window> --all -- <paths>` and the branches that touch them.
- `gh pr list --search '<topic>' --state all` for open, merged and reverted PRs.
- The tracker, through `linear-cli` when the repo uses Linear.
- `.factory/*.md` notes left by implement runs.

## 5. Check against live state

Every branch, PR and ticket the mining surfaced gets checked now with `git` and `gh`, because a transcript records what was true then. Uncommitted work in the tree counts too.

## 6. Write the brief

Follow the implement skill's `references/briefing.md` (`~/.agents/skills/implement/references/briefing.md`) for register. Then this shape:

- **Capsule.** Five bullets at most: what this work is and where it stands.
- **Threads.** One line each, starting with exactly one tag: `[merged #N]`, `[open PR #N]`, `[in flight <branch>]`, `[uncommitted]`, `[reverted #N]` or `[planned]`.
- **Problems.** Five at most, the recurring ones: symptoms still reported, fixes that shipped and got reverted, corrections you made more than once. The next attempt starts where the last one failed.
- **Next move.** One concrete action.

Cite session findings by session id and shared-record findings by PR, commit or ticket. When the brief outgrows a screen, cut detail before you cut threads.
