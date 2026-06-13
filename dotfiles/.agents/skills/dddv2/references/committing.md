# Committing — harvest the theory, then close

**Authority: agent, closing out.** The result is ACCEPTed; committing moves the durable knowledge out of the dying delta and into homes that outlive it, then closes. Skill loaded at entry (via the Skill tool): **comments-as-design**.

## Harvest via carriers

A delta is not an archive — everything not harvested into a long-term home dies with it (Naur: a program dies when the team holding its theory dissolves, and the delta is about to dissolve). Route each piece of durable knowledge to its carrier:

| Knowledge | Carrier |
|---|---|
| Boundary-why, contracts, module invariants | interface comments |
| Behavioral contracts, regression guards | tests |
| Cross-module theory, norm changes | architecture docs / CLAUDE.md |
| Everything else | dies with the delta |

The harvest selection is agent judgment, declared in the delta (margin rule, [delta-file.md](delta-file.md)).

## Disposition followups

Every `## Followups` entry is dispositioned *with the human* — this is where the deferral valve, live all through the work, is audited. Each entry becomes one of: a new delta stub, a tracker entry per project convention, or dropped explicitly with the human. Nothing carries forward silently.

## The cold-reader check

The close-out boundary check. Spawn a **fresh subagent that reads only the durable artifacts** — code, comments, tests, docs — *not* the delta. From those alone it states what must remain true and why. Its reconstruction is laid beside the frozen `## Theory` for the human at close: the human is the least-correlated judge available and is already present. A gap between the reconstruction and the frozen Theory means the harvest missed something — knowledge that didn't survive outside the delta — and sends you back to harvest more. The cold reader is read-only on the shared tree (rule, SKILL.draft.md §2).

## Close

Close is atomic and blocked until the cold-reader check passes and followups are dispositioned. The delta is **deleted** — git history is the archive. Where a remote exists a PR closes it; without one, the closing commit plus deletion is the whole close.
