# Verifying — refute, then hand the evidence to the human

Authority and conducted skills: see the Core Process table in [SKILL.draft.md](../SKILL.draft.md). Verification runs non-author (SKILL.draft.md §2) — a fresh subagent, never the conductor or any implementer, since either authored what is now under check.

## The work

Three things, in a non-author lineage:

- **Run acceptance** — the delta-level executables the derivers authored (ATDD). This is the spine of verification, independent of any implementer's process.
- **Attempt refutation** — actively try to break the result, not merely confirm it passes.
- **Audit the diff** — read what actually landed against what the theory said would.

The verifier is **read-only on the shared working tree** and **returns findings rather than fixing** (both rules, SKILL.draft.md §2): the conductor records returned findings as delta content.

## Findings route by backflow

Each finding reopens the lowest contradicted layer (SKILL.draft.md §4): verifying → executing reopens plan or implementation, verifying → aligning reopens theory; the owning state fixes, by whatever hands it delegates. After any repair, re-verification is a full fresh pass (§2) — so the route here is *which layer reopened*, never *which findings to confirm*.

## Human ACCEPT

When refutation fails — the result holds — the verifier's evidence goes to the human as **grounds** for ACCEPT, never a substitute for the human's word: ACCEPT is the human's to write, and the agent crosses the gate only on it (human-gate rule, SKILL.draft.md §3). Accepting on the verifier's behalf was the observed forgery (Opus S4).
