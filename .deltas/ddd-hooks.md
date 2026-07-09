---
state: shaping
---
<!-- ddd2 delta — load the ddd2 skill before working on this file -->
# Delta: ddd-hooks — mechanical enforcement for ddd2

## Intent

STUB — deferred from the ddd2 work. ddd2's bright lines bind only through
prose; mechanize the ones a hook can hold. Principle agreed with André:
mechanize the bright lines, never the judgment. (André)

## Theory

Sketch from discussion (2026-07-04), to be shaped properly before go:

- **Token gate** (the one that matters): UserPromptSubmit mints a grant when
  André's message is/starts with "go", "ship", or "abandon" (start-of-message,
  whole word — prose mentions don't mint). PreToolUse on Edit/Write to
  `.deltas/*.md` blocks a `state:` flip across a human gate unless a fresh
  token exists; tokens are consumed on use. Ship/abandon token also gates
  delta deletion (best-effort Bash rm matcher — fences, not walls; the threat
  is completion-pressure drift, not malice). Iteration-1 eval evidence:
  baseline Opus forged `state: merged` unprompted.
- **SessionStart injection**: active delta name + state + pending
  theory-updated deviations + undispositioned findings; flags multiple deltas.
- **Stop dirty-check**: complain when a session ends with uncommitted
  `.deltas/` edits (enforces the sync invariant without changing what a
  commit means — rejected: PostToolUse auto-commit, which would decouple
  commits from syncs).
- **Spawn audit log**: PostToolUse on Agent appends spawn records so "was
  there a spawn behind this finding?" is a five-second check.

Rejected: SubagentStop deviation-contract enforcement (can't distinguish task
subagents from reviewers without fragile heuristics).

## Assumptions

## Acceptance

## Unknowns

- Hook config location: user-level settings vs dotfiles-managed?
- Token store location (.git/? project state dir?) and staleness window.

## Tasks

## Findings

## Deviations

## Followups
