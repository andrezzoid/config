---
name: poke-holes
description: Spawn fresh adversarial agents to find what confident work got wrong. Attack a plan's assumptions against the real codebase and docs, then attack its solution against the plan, the tests and the running app. Use once a plan or a solution exists, before a human agrees to a plan, before anything merges, when work feels suspiciously smooth, or when a claim rests on an untested assumption.
---

# Poke Holes

An author cannot see its own gap-filling. Every unknown it met got a plausible guess, and the result reads right to everyone downstream of the same guesses. The reliable detector is fresh context grounded in the territory: agents who did not make the guesses, checking claims against what is there.

The plan is what the work answers: a spec, a ticket, plan-mode output or an instruction. Every reviewer gets it verbatim, first to attack the plan, then to attack the solution built from it.

## Two targets

### The plan: before the human agrees to it

Spawn fresh subagents, one lens each. A single agent asked for everything regresses to a book report.

- **Territory**: verify every assumption's evidence against the actual code, docs, tests and sources. Extracting the list of assumptions is this lens's first job. Check the cited ones too, since evidence can be stale or misread.
- **Simplicity**: find a smaller design that meets the same intent, which the plan skipped. Each finding names the design it replaces and what it removes.
- **Failure**: how does this break? Edge cases, migrations, rollback, partial failure, the path nobody drew.
- **Cold**: briefed with the plan's Problem Statement and nothing else. From the territory, it states what any solution must respect and the shape it would expect, and replies with that picture instead of ledger rows. This is the only lens the plan's framing cannot contaminate. An instruction has no separate Problem Statement, so it runs without this lens.

### The solution: before it merges

Fresh subagents, briefed with the same plan:

- **Territory**: run the acceptance checks. Their run is the evidence; the author's run was only the gate. For each acceptance criterion, or each outcome an instruction asks for, find the test that claims it and check that it asserts what the criterion says, through the interface the criterion names. A test of new behaviour fails on the base and passes on the solution. It also fails at the commit that added it, unless that commit's message records its failing run; a test that never failed was written after its code. Drive a criterion with no such test through the running app. Then audit the diff against the plan, both directions: what landed that the plan never asked for, and what the plan asked for that never landed.
- **Failure**: attempt refutation. Try to break the running app with edge cases, bad input and partial failure, rather than confirm it works. Run each break on the base too, to tell a new failure from an old one.

## Run a review

1. Spawn one reviewer per lens with the Agent tool, all in one message, each with this brief and nothing else:

       You are the <lens> reviewer for poke-holes. Read <this skill's folder>/SKILL.md
       and follow the Rules and the <lens> lens under "The <plan or solution>".
       Repo: <its path> at <commit>, base <commit>
       The plan, verbatim:
       <the spec, the ticket's contract or the instruction, exactly as written>

   Cold's brief carries the Problem Statement in place of the plan. Your summary, your suspicions and your reading of the plan stay out of every brief, because they carry the guesses this review exists to catch. Done when every reviewer has replied.
2. Merge their rows into one table, the ledger. Above it, name the target, the commit the reviewers checked, the lenses that ran and whether they ran the app. Every assumption or acceptance criterion gets a row, and holds only when no reviewer broke it. Every other finding gets a row after them, and on a plan so does every place where Cold's picture and the plan disagree, since one of them is anchored on the wrong thing. Done when every assumption or criterion has a row.

       | # | Item | Result | Evidence | Disposition |
       |---|---|---|---|---|
       | 1 | "<the assumption or criterion>" | holds | <file:line, or a command and its output> | |
       | 2 | "<…>" | fails | <…> | fix now |
       | F1 | <the finding> (<lens>) | finding | <…> | followup |

3. Give every failing row and every finding a disposition. Follow `references/dispositions.md`. Done when none of them has an empty Disposition.

## Rules

1. **A finding cites evidence**: file:line, a command with the output line that decides it, a doc link, a screenshot path. "This seems risky" is a vibe. An item nobody could show holding fails, and its row says what was tried.
2. **Reviewers return findings; they never fix.** Each reviewer replies with ledger rows and leaves Disposition empty, except Cold, which replies with its picture. A reviewer who fixes becomes an author whose work now needs fresh eyes. The code, the tracker and the pull request stay as the reviewer found them.
3. **Read-only on the shared tree.** Build and run in a worktree of your own, one per commit, in a scratch directory outside the repo (`git worktree add --detach <dir> <commit>`), and remove it when done. To start the app, call the Skill tool with "run" when the repo has a run skill (`.claude/skills/run-*`); without one, say so in the first line of your reply.
4. **Decorrelate when stakes are high.** Same-model reviewers share the author's priors, so they can share its blind spots. Use a different model for the Territory lens on anything expensive to unwind.
5. **A reviewer you didn't spawn produced no findings.** If you can't spawn, report that no review ran and stop. A narrated review is worse than none because it looks like one, and with no ledger there is no verdict to record.
6. **Scale to the work, out loud, never to zero.** A small solution earns a single Territory reviewer. The lenses named above the ledger put the reduction on the record; a silent skip never is.
7. **Await what you spawn.** A session that ends while a reviewer is still running loses the findings yet looks like a completed check. Wait for it, or record the reduction.
