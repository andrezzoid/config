---
state: aligning
---

# Delta: ddd-hooks — mechanical enforcement for ddd

## Theory

STUB — deferred from the ddd (dddv2) delta's Followups. ddd's bright lines
bind only through prose until hooks enforce them. Build Claude Code hooks:
- PostToolUse: auto-commit `.deltas/*` edits (log-by-construction).
- SessionStart: inject the active delta name + frontmatter state (structural
  cold-start routing).
- Gate-flip verification: a commit that flips `state` across a human gate
  (aligning→executing, verifying→committing) must follow an actual human
  message granting it — otherwise reject. This is what turns the human-gate
  bright line from prose into a real constraint, and is the prerequisite for
  trusting ddd below the frontier model tier.

## Acceptance

## References

## Open

## Tasks

## Followups
