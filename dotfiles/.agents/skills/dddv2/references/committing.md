# Committing — harvest the theory, then close

**Authority: agent, closing out.** The result is ACCEPTed; committing moves durable knowledge out of the dying delta into homes that outlive it, then closes. Skill loaded at entry (via the Skill tool): **comments-as-design**.

## Harvest via carriers

A delta is not an archive — everything not harvested into a long-term home dies with it (Naur: a program dies when its theory-holders dissolve, and the delta is about to). Route each piece of durable knowledge to its carrier:

| Knowledge | Carrier |
|---|---|
| Boundary-why, contracts, module invariants | interface comments |
| Behavioral contracts, regression guards | tests |
| Cross-module theory, norm changes | architecture docs / CLAUDE.md |
| Everything else | dies with the delta |

The harvest selection is agent judgment, declared in the delta (margin rule, [delta-file.md](delta-file.md)).

## Disposition followups

Every `## Followups` entry is dispositioned *with the human* — this is where the deferral valve, live all through the work, is audited. Each becomes a new delta stub, a tracker entry per project convention, or is dropped explicitly. Nothing carries forward silently.

## The cold-reader check

The close-out boundary check. Spawn a **fresh subagent that reads only the durable artifacts** — code, comments, tests, docs — *not* the delta. From those alone it states what must remain true and why. Its reconstruction is laid beside the frozen `## Theory` for the human at close (the least-correlated judge, already present). A gap between the two means the harvest missed knowledge that didn't survive outside the delta — harvest more. The cold reader is read-only on the shared tree (SKILL.draft.md §2).

## Close

Close is atomic, blocked until the cold-reader check passes and followups are dispositioned. The delta is **deleted** — git history is the archive. With a remote, a PR closes it; without one, the closing commit plus deletion is the whole close.
