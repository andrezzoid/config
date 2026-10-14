---
name: poke-holes
description: Spawn fresh adversarial agents to find what confident work got wrong. Attack a plan's assumptions against the real codebase and docs, then attack its solution against the plan, the tests and the running app. Use once a plan or a solution exists, before a human agrees to a plan, before anything merges, when work feels suspiciously smooth, or when a claim rests on an untested assumption.
---

# Poke Holes

An author cannot see its own gap-filling. Every unknown it met got a plausible
guess, and the result reads right to everyone downstream of the same guesses.
The reliable detector is fresh context checking the map against the
**territory**: the plan is a map, and the territory is what is there, the code,
docs, tests and the running app.

The **plan** is what the work answers: a spec, a ticket's contract, plan-mode
output or an instruction. Review a plan while André shapes it, before he agrees
to it, and its solution while an agent builds it, before it merges. Each
reviewer runs one **angle** of attack, since a single agent asked for
everything regresses to a book report.

## A plan

- **Territory**: list every assumption the plan makes, then check each one's
  evidence against the territory. Check the cited ones too, since evidence can
  be stale or misread.
- **Simplicity**: find a smaller design that meets the same intent, which the
  plan skipped. Each finding names the design it replaces and what it removes.
- **Failure**: how does this break? Edge cases, migrations, rollback, partial
  failure, the path nobody drew.
- **Problem only**: sees the plan's problem statement and nothing else. From
  the territory, it states what any solution must respect and the shape it
  would expect, and replies with that picture instead of table rows. The plan's
  framing reaches every angle but this one. An instruction has no
  separate problem statement, so it runs without this angle.

## A solution

- **Territory**: run the acceptance checks. Your run is the evidence; the
  author's run was only the gate. For each acceptance line, or each outcome an
  instruction asks for, find the test that claims it and check that it asserts
  what the line says, through the interface the line names. A test of new
  behaviour fails on the base and passes on the solution. Drive a line with no
  such test through the running app.
- **Failure**: attempt refutation. Try to break the running app with edge
  cases, bad input and partial failure, rather than confirm it works. Run each
  break on the base too, to tell a new failure from an old one.
- **Scope**: audit the diff against the plan, both ways: what landed that the
  plan never asked for, and what the plan asked for that never landed.

## Run a review

### 1. Spawn

Spawn one reviewer per angle with the Agent tool, all in one message, each with
this prompt and nothing else:

    You are the <angle> reviewer for poke-holes. Read <this skill's folder>/SKILL.md
    and follow the Rules and the <angle> angle under "A <plan or solution>".
    Repo: <its path> at <commit>, base <commit>
    The plan, verbatim:
    <the spec, the ticket's contract or the instruction, exactly as written>

The problem-only prompt carries the problem statement in place of the plan.
Your summary, your suspicions and your reading of the plan stay out of every
prompt,
because they carry the guesses this review exists to catch. Done when every
reviewer has replied.

### 2. Tabulate

Merge their rows into one review table. Above it, name the target, the commit
the reviewers checked, the angles that ran and whether they ran the app. Every
assumption or acceptance line gets a row, and holds only when no reviewer broke
it. Every other finding gets a row after them, and on a plan so does every
place where the problem-only picture and the plan disagree, since one of them
anchors on the wrong thing. Done when every assumption or line has a row.

    | # | Item | Result | Evidence | Decision |
    |---|---|---|---|---|
    | 1 | "<the assumption or line>" | holds | <file:line, or a command and its output> | |
    | 2 | "<…>" | fails | <…> | fix now |
    | F1 | <the finding> (<angle>) | finding | <…> | follow up |

### 3. Decide

Give every failing row and every finding a decision:

- **Fix now**: repair it before the work moves on. Then re-check with a fresh
  pass over the repaired area plus the acceptance checks, rather than walking
  the table again: confirming a list is how the list gets gamed.
- **Follow up**: real, and out of scope here. List it with a title and what
  the reviewer found, for whoever runs the work to file.
- **Reject**: with the reason. Rejecting is a normal outcome.

Anything that touches intent is André's to decide. The table stays in this
session; the pull request only ever gets reports. Done when every failing row
and every finding has a decision.

## Rules

1. **A finding cites evidence**: file:line, a command with the output line that
   decides it, a doc link, a screenshot path. "This seems risky" is a vibe. An
   item nobody could show holding fails, and its row says what the reviewer
   tried.
2. **Reviewers return findings; they never fix.** Each reviewer replies with
   table rows and leaves Decision empty, except the problem-only reviewer,
   which replies with its picture. A reviewer who fixes becomes an author whose
   work now needs fresh eyes. The code, the tracker and the pull request stay
   as the reviewer found them.
3. **Read-only on the shared tree.** Build and run in a worktree of your own,
   one per commit, in a scratch directory outside the repo (`git worktree add
   --detach <dir> <commit>`), and remove it when done. To start the app, call
   the Skill tool with "run" when the repo has a run skill
   (`.claude/skills/run-*`); without one, say so in the first line of your
   reply.
4. **Decorrelate when stakes are high.** Same-model reviewers share the
   author's priors, so they can share its blind spots. Use a different model
   for the Territory angle on anything expensive to unwind.
5. **A reviewer you didn't spawn produced no findings.** If you can't spawn,
   report that no review ran and stop. A narrated review is worse than none,
   because it looks like one.
6. **Scale to the work, out loud, never to zero.** A small solution earns a
   single reviewer running the Territory and Scope angles. The angles named
   above the table put the reduction on the record; a silent skip never is.
7. **Await what you spawn.** A session that ends while a reviewer is still
   running loses the findings yet looks like a completed check. Wait for it,
   or record the reduction.
