# Executing — transcription, not discovery

**Authority: agent, within ratified theory.** Everything here happens inside the frozen Theory + Acceptance; nothing here may touch them — editing either reopens aligning (integrity rule, [delta-file.md](delta-file.md)). Skills loaded per implementer (via the Skill tool): **define-errors-away, test-driven-development, comments-as-design**.

## Executing is transcription

Discovery was confined to aligning, where figuring-out is cheap and disposable. What reaches executing is reproducible and verifiable — you are *writing down a solution already figured out*, not still figuring it out. If you find yourself figuring something out, you are in the wrong state.

The conductor authors no product code (the conductor rule, Overview): implementation is delegated to **one implementer subagent per task**, each briefed by the delta + its task alone. Beyond keeping the theory-holder on theory and evidence decorrelated from authorship, this makes every implementer a live self-sufficiency test of the delta — if one needs another's context to proceed, the module boundaries were drawn wrong, which is *observable* and reopens the plan.

## What each implementer does

The implementer **inherits** the derived tasks and per-task checks from aligning's convergent derivation — it never authors the criteria it is graded by. It transcribes its inherited spec test-first by conducted default: **RED → GREEN → REFACTOR**, the failing test committed before the implementation so history stays honest. Pre-registration keeps the record truthful, but it is no longer the verification backbone — that is ATDD's job, the deriver-authored delta-level executables, so verifiability never depends on any implementer's process.

## Mid-task discovery aborts

A discovery mid-task — the theory looks off, a boundary won't hold, an assumption was wrong — **aborts and reports for backflow; it is never resolved silently**. Silent resolution buries exactly the contradiction the protocol exists to surface (a v1 failure mode). The finding reopens the lowest contradicted layer (backflow rule, SKILL.draft.md §4); the layer choice is declared in the recording edit.

## Exit: executing → verifying (agent-crossed, not a human gate)

This transition is the agent's to cross — no human word required. At the transition:

1. The **executor runs every task's acceptance check** and records the results as delta content. This run *gates progress*.
2. `state: verifying`. The verifier then re-runs the same checks independently — **the verifier's run is the evidence, the executor's run only the gate**.

Task completion is never marked in the file — it is derived by running the checks (no-status rule, [delta-file.md](delta-file.md)) and reading history's diffs for what landed.
