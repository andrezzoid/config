---
name: poke-holes
description: Spawn fresh adversarial agents to check a plan, and later its solution, against the real code, docs and running app. Use before a human approves a plan, before a solution merges, or when a decision rests on an untested assumption.
---

# Poke Holes

Fresh reviewers check the work against the territory: the code, docs, tests
and running app. They did not write it, so they can see the guesses its author
filled in without noticing. Each reviewer takes one lens. Their results, with
what you decide about each, go in one table: the ledger.

## The plan

The plan is what the work answers: a spec, a ticket or an instruction, passed
to every reviewer verbatim. Poke holes in it before the human approves it,
with four lenses:

- Territory lists the assumptions the plan rests on and checks each against
  the code, docs, tests and sources. Cited evidence can be stale or misread, so
  it checks the cited ones too.
- Simplicity looks for a materially smaller design that meets the same intent:
  one that drops a module, an interface or a step, or reuses what the codebase
  already has.
- Failure asks how the plan breaks: edge cases, partial failure, migrations,
  rollback, the path nobody drew.
- Cold gets the plan's Problem Statement and never the plan. From the territory
  alone, it states what any solution must respect and the design it would
  expect, and replies with that picture in place of ledger rows. An
  instruction has no separate Problem Statement, so it gets no Cold reviewer.

## The solution

The solution is the change that answers the plan. Poke holes in it before it
merges, against the same plan, verbatim, with two lenses:

- Territory takes each acceptance criterion in turn, or each outcome an
  instruction asks for. It finds the test that claims the criterion, checks
  the test asserts what the criterion says through the interface the
  criterion names, and runs it: a criterion about new behaviour must fail on
  the base and pass on the commit. A criterion with no such test gets driven
  through the running app the way a user would. Then Territory reads the whole
  diff against the plan, both ways: what landed that the plan never asked for,
  and what the plan asked for that never landed.
- Failure tries to break the running app: edge cases, partial failure, bad
  input, the path nobody drew. It runs each break on the base too, so the
  ledger tells a new failure from an old one.

## Run a review

1. Spawn one reviewer per lens with the Agent tool, all in one message, each
   with this brief:

       You are the <lens> reviewer for poke-holes. Follow "Reviewing", and
       <lens> under "The <plan or solution>", in <this skill's folder>/SKILL.md.
       Repo: <its path> at <commit>, base <commit>
       The plan, verbatim:
       <the spec, the ticket's contract or the instruction, exactly as written>

   Cold's brief carries the Problem Statement in place of the plan. Nothing
   else goes in any brief. Your summary and your suspicions carry the guesses
   you made without noticing, and a reviewer who reads them takes those
   guesses on as facts.

   A small solution can take Territory alone. When the work touches a one-way
   door, run Territory on a different model from yours. Without the Agent
   tool, report that no review ran, and stop.

   Done when every reviewer has replied.

2. Fill the ledger with the replies. Above the table, name the target, the
   commit the reviewers checked, the lenses that ran and whether they ran the
   app. Give each assumption or acceptance criterion a row, then each other
   finding. A row holds only when no reviewer broke it. On a plan, every place
   where Cold's picture contradicts the plan, or holds a constraint the plan
   misses, is a finding.

       | # | Item | Result | Evidence | Disposition |
       |---|---|---|---|---|
       | 1 | "<the assumption or criterion>" | holds | <file:line, or a command and what it showed> | |
       | 2 | "<…>" | fails | <…> | fix now |
       | F1 | <the finding> (<lens>) | finding | <…> | followup |

   Done when every assumption or criterion has a row.

3. Give every row that fails, and every finding, a disposition per
   `references/dispositions.md`. Done when none of them has an empty
   Disposition.

## Reviewing

You are one fresh reviewer. Read the work only from your brief and the repo.

- Every result cites evidence a reader can open or rerun, in one line:
  file:line, a command with the output line that decides it, a link, a
  screenshot path. An item you could not show holding fails, and its row says
  what you tried.
- To start the app, call the Skill tool with "run" when the repo has a run
  skill (`.claude/skills/run-*`). Without one, say so in your first line.
- Build and run in worktrees of your own, one per commit, in a scratch
  directory outside the repo (`git worktree add --detach <scratch dir>
  <commit>`), and remove them when you finish.
- Leave the code, the tracker and the pull request as you found them: your
  reply is your whole output.
- Reply with ledger rows, and leave Disposition empty.
