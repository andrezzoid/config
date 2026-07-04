---
name: poke-holes
description: Spawn fresh adversarial agents to find what confident work got wrong — attack a plan's assumptions against the real codebase and docs, attack a finished change against its stated theory, or cold-read a landed change to check its knowledge survived. Use once a plan or artifact exists — before a human agrees to a plan, before anything merges, when work feels suspiciously smooth, or when a claim rests on an untested assumption.
---

# Poke Holes

The enemy isn't dishonesty — it's confident gap-filling. An author's context cannot see its own fills: every unknown it met got silently papered with a plausible guess, and the result *reads* right to everyone downstream of the same guesses. The only reliable detector is fresh context grounded in the territory: agents who didn't make the guesses, checking claims against what's actually there.

Any claim-bearing artifact is a target — a delta's Theory, a PRD, plan-mode output, a design doc, a PR and its diff.

## Three targets

### The theory — before the human agrees to a plan

Spawn fresh subagents, one lens each — a single agent asked for everything regresses to a book report:

- **Territory** — briefed with the plan: verify every assumption's evidence against the actual code, docs, tests, and sources. Attack the ones tagged `guess` first; then spot-check the tagged ones — evidence can be stale or misread. When the plan never tagged its assumptions, extracting that list is this lens's first job.
- **Simplicity** — briefed with the plan: is there a materially simpler approach it skipped? Not a style opinion — a genuinely smaller design that meets the same intent.
- **Failure** — briefed with the plan: how does this break? Edge cases, migrations, rollback, partial failure, the path nobody drew. Load complexity-red-flags for this lens.
- **Cold** — briefed with the *intent only*, never the plan: from the territory, it states what any solution must respect and the shape it would expect. Where its picture and the plan disagree, one of them is anchored on the wrong thing — find out which. This is the only lens the plan's framing cannot contaminate.

### The artifact — before anything merges

Fresh subagent(s), briefed with the theory plus the diff:

- **Run the acceptance checks.** Their run is the evidence; the author's run was only the gate.
- **Attempt refutation.** Actively try to break it — don't confirm it passes.
- **Audit the diff against the theory.** What landed that the theory never said; what the theory said that never landed. Both directions.

### The harvest — after knowledge moves to its long-term homes

One fresh agent, briefed with only the repo — never the plan, delta, or conversation. From the code, comments, tests, and docs of the changed area alone, it states what must remain true and why. Lay its reconstruction beside the plan: gaps are knowledge that exists only in the plan or conversation, which is about to be lost — move it into the repo, then re-run. This is the only check on whether the change's *why* survives once the conversation is gone.

## Rules

1. **A finding cites evidence** — file:line, command output, doc link — or it isn't a finding. "This seems risky" is a vibe.
2. **Reviewers return findings; they never fix.** A reviewer who fixes becomes an author whose work now needs fresh eyes.
3. **Read-only on the shared tree.** A reviewer that must build or run gets its own copy — spawn it with worktree isolation, or have it `git worktree add` a scratch checkout it removes when done.
4. **Decorrelate when stakes are high.** Same-model reviewers share the author's priors, so they can share its blind spots — use a different model for the territory lens on anything expensive to unwind.
5. **A reviewer you didn't spawn produced no findings.** If you can't spawn, say so plainly — a narrated review is worse than none, because it looks like one.
6. **Scale to the work, out loud.** A small change earns a single territory-lens agent; that reduction is fine when it's on the record (in the delta file, or stated to the human) — and a silent skip never is.

## Findings triage

Every finding gets a disposition, on the record — in the delta's `## Findings` when inside a delta, stated to the human otherwise: **fix now**, **followup**, or **rejected** with the reason. Anything touching intent is the human's call. After a fix-now repair, the re-check is a fresh pass over the repaired area plus the acceptance checks — never a walk through the finding list, because confirming a list is how the list gets gamed.

**Done when:** every finding has a disposition and none was silently dropped.
