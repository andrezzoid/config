---
name: implement
description: "Implement a ticket (ENG-123 in Linear, owner/repo#12 or #12 in GitHub Issues) through to an open pull request. Use when asked to implement, build or pick up a ticket."
---

# Implement

Turn one ticket into a pull request you'd defend, or hand it back with a report
that says why not.

The ticket's **contract** is triage's latest agent brief, or its body until one
exists, plus every later `Revised ·` report. `factory tickets show <ID> --json`
returns it.

## Process

### 1. Claim

Run `factory tickets claim <ID>`, with `--take-over` only when André asked for
it. Exit 3 means it isn't yours to build: say why in one line and stop.

### 2. Know what done looks like

For each acceptance line in the contract, name the observation that would prove
it false. Done when every line has one. A line with none is a shaping problem,
so hand the ticket back.

### 3. Build

Branch from the fresh base as the ticket's `branchName`, with `-2` added when
an earlier attempt already pushed that name. Build test-first with `/tdd`. The
acceptance lines are the test list, at the seams the ticket's Testing line
names. Add other tests only where an acceptance test can't reach the logic.
With no Testing line, test at the highest seam the code already has. When an
interface's shape is in question, call the Skill tool with "codebase-design".
Done when every acceptance test passes.

### 4. Prove

Run the gates CI runs. For each acceptance line whose test stops short of the
app's own interface, call the Skill tool with "run" and drive the line the way
a user would. When the diff reshapes a module or may break the repo's own
standards, call the Skill tool with "code-review" or "complexity-red-flags" on
it. Then call the Skill tool with "poke-holes" on the solution. Done when every
finding has a decision.

### 5. Ship

Open the pull request with the `pr` skill, its body ending with the ticket's
`closes` line. Then post every report on the work in one comment with `factory
pr report <PR> --body-file <file>`, following `references/report.md`: a
`Deviation ·` per departure from the contract, an `Unverified ·` per claim you
couldn't prove. Done when the pull request is open and every report is up.

## Hand back

Once you hold the claim, every stop before the pull request opens is a
hand-back, or the ticket sits claimed with nobody on it. Hand back when the
contract can't hold, when only André can decide, or when the same check fails
three times running: post a `Handed back ·` report with `factory tickets
handback <ID> --body-file <report>` and stop. When André is in the session, ask
him instead, and post a contract change he agrees with `factory tickets revise
<ID> --body-file <report>` before you go on.

## Rules

- Claim before your first write.
- Write only comments on the ticket: its body and brief are André's.
- Hand back rather than guess at intent.
- An acceptance test holds only while it asserts what its line says: weakening
  one breaks acceptance.
- Extend a pattern only when you'd want it copied again. When the nearest
  example is a workaround, follow the paved path and file the example as a
  follow-up.
- Fix a workaround's cause, or file it, rather than write a comment that
  defends it.
- Show a fix's failing run before calling it fixed.
- Stop at an open pull request: the hourly routine merges what André picks.
