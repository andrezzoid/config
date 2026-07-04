---
name: ddd2
description: Run any non-trivial change as a delta — a unit of work where human and agent stay aligned from first idea to merged code. Use when a change spans modules or files, has several plausible approaches, touches a schema or contract, spans sessions, or is a non-trivial bug fix; also whenever a delta file exists under .deltas/ or the human mentions shaping, building, or shipping a delta. Skip only when the change is one sentence with one obvious implementation.
---

# Delta-Driven Development 2

A **delta** is one unit of change run on a simple belief: **alignment is a rate, not a state**. It decays whenever the loop between you and the human goes quiet, and no amount of upfront planning removes the unknowns you'll meet mid-work. So don't front-load discovery — keep the loop live: surface unknowns, let the human react to concrete artifacts, build with deviations reported, verify against the territory, ship.

**The bandwidth ladder.** The human *reading* your prose is the weakest form of alignment. *Reacting* to something concrete — a prototype, a visual — is stronger. *Generating* something — answers, decisions, predictions — is the strongest evidence you actually agree. Whenever an answer could change the architecture, buy the higher rung: render instead of describe, ask instead of assume. A polished document that earns a "looks good" has produced almost no alignment; three ugly prototypes and one hard question have.

## The toolkit

ddd2 is a thin cycle over small skills. Load each with the Skill tool at the moment it applies — they stand alone, inside or outside a delta:

| Moment                                                    | Skill                   |
| --------------------------------------------------------- | ----------------------- |
| No settled plan yet; unfamiliar territory                 | find-unknowns           |
| A fork the human will "know it when they see it"          | prototype               |
| The human must compare, choose, or understand structure   | visualize               |
| A plan or artifact exists and needs adversarial checking  | poke-holes              |
| Risky plan before go; large change before ship            | quiz-me                 |
| Designing a fork's options                                | design-it-twice         |
| Inside every implementation task                          | test-driven-development |

## The delta file

One file per delta — the decision ledger and every subagent's briefing. It records decisions, evidence, and state; it does not pretend to hold the whole theory (that lives in the loop between you and the human — which is why the loop must not go quiet).

**Entering:** create `.deltas/<kebab-name>.md` with the sections below if it doesn't exist; otherwise resume at its `state`. Work one delta at a time — if several files exist under `.deltas/`, ask the human which is active rather than guessing.

```
---
state: shaping | building | wrapping
---
# Delta: <name>
## Intent
## Theory
## Assumptions
## Acceptance
## Unknowns
## Tasks
## Findings
## Deviations
## Followups
```

- **Intent** — what and why, in the human's own words. If this changes, stop and talk.
- **Theory** — the current shared understanding: approach, key decisions each with the rejected alternative, module boundaries. Live — edits during building go through deviation triage, never in silently.
- **Assumptions** — one line each: `<assumption> — evidence: <file:line | doc | test | measurement>`, or `guess — breaks: <what happens if wrong>`.
- **Acceptance** — observable checks. Behavioral ones become failing tests before implementation.
- **Unknowns** — live board: `<unknown> — resolving | assumed (→ Assumptions) | deferred (→ Followups)`.
- **Tasks** — `<id>: <description> — check: <procedure> — needs: <ids>`.
- **Findings** — reviewer findings from poke-holes, each with its disposition: `fix-now | followup | rejected: <reason>`.
- **Deviations** — subagent reports merged here, each graded `ok | theory-updated | stopped`.
- **Followups** — out-of-scope discoveries, dispositioned with the human before close.

## Two words only the human can say

**go** (the plan is agreed — build it) and **ship** (the evidence holds — merge it). Never write either on the human's behalf, and never treat evidence as a substitute for the word. Ask plainly, then wait. Everything else — task order, check intensity, tool choice — is your judgment, exercised out loud in the delta file.

**Risky**, wherever this file says it: the delta touches a schema, an external contract, security-sensitive code, or data you can't restore. Risky deltas earn the extra machinery — quiz-me before go, a different-model reviewer before ship.

## States and transitions

`state` is the routing surface for a cold session: it records what is settled, not what you're doing — any activity can happen in any state. Two transitions are the human's; one is yours:

- **shaping → building** — only on the human's go.
- **building → wrapping** — yours to cross: flip it in the commit that records all tasks passing and all deviations triaged.
- **wrapping → closed** (delta deleted) — only on the human's ship.

## Syncing

A **sync** is a message to the human carrying the delta's changes since the last one — the Theory diff, new deviations with grades, findings with dispositions — plus anything waiting on their word. Commit the delta file with every sync, before sending: the message and the commit are the same checkpoint seen two ways.

Sync at task boundaries, when a `theory-updated` deviation is pending, when a reviewer returns findings, and always before asking for go or ship. When the human is away: a `stopped` grade blocks its task's dependents, and everything independent of it may continue; `theory-updated` never blocks — it queues for the next contact. Never end a session with unmerged reports or uncommitted delta edits.

## The cycle

### shaping — until the human says go

1. Write `## Intent` in the human's words; confirm it back.
2. Run find-unknowns. Ground "know it when I see it" forks with prototype and visualize; design real forks with design-it-twice. The human decides forks — recommend, never decide.
3. Consolidate into Theory / Assumptions / Acceptance / Tasks as understanding firms up.
4. Before asking for go: run poke-holes (theory target). Record its findings and dispositions in `## Findings`; fix-now findings get fixed before the ask.
5. Ask for go with exactly three things: the Theory diff since the last go (or the whole Theory the first time), every assumption still tagged `guess`, and the deferred unknowns. For a risky delta, offer quiz-me first.

**Done when:** the human has said go on the current Theory.

### building — until the work matches the theory

You are the conductor: you edit the delta file and talk to the human; implementation goes to task subagents even when a task looks small — the deviation contract only works across a subagent boundary, and your context is the human's alignment partner, too expensive to spend inside a task.

1. One task per subagent, briefed with the delta file + its task, nothing more. Include this deviation contract verbatim in every brief:

   > End your final message with a report — every heading present, "none" allowed:
   > **Deviations** — where you departed from the theory or brief.
   > **Decisions** — calls you made that the brief didn't cover.
   > **Surprises** — territory that didn't match the theory.
   > Deviating is often right. The only failure is an unreported deviation.

2. When a subagent returns, run its task's acceptance check yourself — your run gates progress; poke-holes' later run is the evidence. Then triage every report line into `## Deviations`:
   - fits intent → grade `ok`, move on.
   - changes the Theory → edit Theory now, grade `theory-updated`, show the human the diff at the next sync — never later than the next go/ship ask.
   - breaks the Intent → grade `stopped`, stop that line of work, talk to the human at the first opportunity.
3. Sync per the rules above.

**Done when:** all tasks pass their checks and every deviation is triaged — flip to wrapping.

### wrapping — until the human says ship, then harvest

1. Run poke-holes (artifact target) — fresh context; a different-model reviewer when the delta is risky. Findings and dispositions go to `## Findings`.
2. Present the evidence for ship: what landed vs. what Theory said, acceptance results, findings with dispositions. Use visualize for anything a diff can't show; offer quiz-me on large changes.
3. On ship: harvest what must outlive the delta —

   | Knowledge                            | Home                |
   | ------------------------------------ | ------------------- |
   | boundary-why, contracts, invariants  | interface comments  |
   | behavior                             | tests               |
   | cross-module knowledge, norm changes | docs / CLAUDE.md    |
   | everything else                      | dies with the delta |

4. Cold-read the harvest (poke-holes, harvest target): a fresh agent briefed with only the repo reconstructs what must remain true in the changed area. Gaps against Theory are knowledge that died in the delta — harvest more and re-run.
5. Disposition every Followup with the human. Delete the delta file and commit — git is the archive.

**Done when:** the delta file is gone and the knowledge isn't.

## Bright lines

- go and ship are the human's words. Asking is yours; saying is theirs.
- A reviewer you didn't spawn produced no findings. Describing what one "would find" is not a check.
- Reviewers return findings; they never fix. A reviewer who fixes becomes an author who needs reviewing.
- An unreported deviation is the only implementation failure. Reported ones are just work.
- The delta file commits at every sync — a stale ledger is worse than none.
