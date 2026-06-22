# Aligning — build the theory together

Authority and conducted skills: see the Core Process table in [SKILL.md](../SKILL.md). Aligning is collaborative theory-building; its exit gate is the human's. Architecture is aligning's job — module boundaries and interfaces are designed *here* and stated plainly in Theory's structure sketch, the sole place derivers and implementers read them (file shape: [delta-file.md](delta-file.md)).

## The cycle: expand, then converge

Overgenerate, then narrow. Pour questions and forks into `## Open` (cheap to overgenerate, expensive to miss), then investigate **both channels: the system AND the human**, because either alone lies — the system is ground truth for what exists; the human carries rationale, prior failed approaches, and constraints not in the repo. Consolidate each cycle into `## Theory`, then commit.

Ground load-bearing forks with **stanced subagent designs** (each under a distinct design philosophy) and **prototype demos** — the highest-bandwidth channel: *"The hardest single part of building a software system is deciding precisely what to build"* (Brooks, *No Silver Bullet*). Prototypes are throwaway; the system grows through tasks (Brooks: *"plan to throw one away; you will, anyhow"*).

**Reading is not theory-building.** The human's theory forms by *exercising* artifacts, not reviewing prose, so prefer exercised artifacts (prototypes, derivation runs, executed checks) over prose critique — this delta's own history is the incident: prototype rounds surfaced more than prose rounds.

The agent never picks the winner of its own comparison nor judges its own divergences (the optimizer's curse). A *fork* is a decision with more than one defensible option; the agent may recommend, never decide — forks go to the human, grounded by demos when load-bearing.

## Exit: a protocol, not a reflex

Norm-shaped gate rules lose to completion pressure, so the exit is a sequence of bright lines:

1. **`## Open` drained** — every item resolved into Theory or explicitly deferred to `## Followups`.
2. **Derivability converges** — run the convergent-derivation check ([derivability.md](derivability.md)) until two fresh deriver contexts agree; its output becomes `## Tasks` and the acceptance executables.
3. **Every fork decided by the human** — and only *then* may ratification be requested, **standalone, in a later message**. "Pick the fork and RATIFY" in one breath is the observed anti-pattern (S1, every tier); the fork question and the ratification request never share a message.

The human ratifies on judgment, not as a button. (Human-gate rule: SKILL.md §3.)
