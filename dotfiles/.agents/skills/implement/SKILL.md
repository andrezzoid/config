---
name: implement
description: "Build one unit of work end to end, from a ticket (ENG-123 in Linear, owner/repo#12 or #12 in GitHub Issues), a spec file, or what the conversation just settled. Claims the ticket, builds test-first against its acceptance, proves it on the running app, gets an independent verdict, reports deviations instead of absorbing them, and opens the PR. Use when asked to implement, build or pick up a ticket or spec."
---

# Implement

The factory's Iterate stage: one ticket, from claim to an open PR. One unit per run. Dispatching several is the caller's job. Nobody may be
around to answer questions, so anything that needs the human ends the run with
a brief instead of a question.

A ticket's body is agreed state: never edit it. Its comments are the event log
and the only thing you write on the ticket. If the work turns out to need a
different definition, that is the human's to reshape.

## 1. Load the work

- **Ticket:** `factory ticket show <ID> --json` gives the `contract`, plus the
  body, comments, repo, autonomy, blockers, branch name and the `closes` line,
  whichever tracker holds it. The contract is what you build against: triage's
  latest agent brief when there is one, otherwise the body. Read the parent
  ticket too when there is one.
- **Claim it, as your first write:** `factory ticket claim <ID>`. Exit 3 means
  another session has it, or it is not labelled `ready-for-agent`: stop and say
  so in one line, with the claiming session's link. Add `--take-over` only when
  the human asked you to take the ticket over. Skip the claim when the human
  handed you the ticket in this conversation and it is already yours.
- **Repo profile:** `.agents/factory.md` names the tracker, the gates and the
  one-way doors. Without it, tell the human to run `/setup-factory` and
  continue with the defaults: autonomy `pr`, gates from the README or CI.
- **Domain:** read the glossary (`GLOSSARY.md`, or `CONTEXT.md` in repos set up
  before Matt Pocock's rename) and the ADRs in the area you touch. Use their
  words.

## 2. Before any code

1. Quote each acceptance line. For each one, name the observation that would
   show it false. A line with no such observation is a shaping problem: hand
   back, do not work around it.
2. Check the blockers are done. If one is not, stop and name it.
3. Keep working notes in `.factory/<id>.md`: what you tried, deviations,
   decisions, open threads. Add `.factory/` to `.git/info/exclude` so the
   notes never touch the repo's files.
4. Branch from the fresh base: `git fetch origin && git switch -c <branchName>
   origin/<base>`, using the ticket's `branchName`: it names the ticket, so the
   tracker links the PR and `factory pr merge` finds the ticket's autonomy.
5. Install dependencies the way the README or profile says.

## 3. Build test-first

Call the Skill tool with "tdd". Red before green, at the seams the ticket or
its spec names: those are the seams the human confirmed. When none are named,
use the highest existing seam and record it in the notes.

Call the Skill tool for "deep-module-design", "define-errors-away" or
"comments-as-design" when the change shapes an interface, an error surface or
a comment.

Agents copy what they see, so leave nothing you would not want copied:

- Extend the patterns around you only when you would be happy to see them
  copied again. When the nearest example is a workaround, do not copy it:
  follow the paved path and note the bad example as a followup.
- Never write a comment that justifies a workaround. Fix the cause, or file it.
- Mechanical work across many files (renames, migrations, call-site updates)
  gets a script or codemod, not a hand edit. The script is the reviewable
  artifact.

Push the branch after every verifiable unit. Work that exists only on one
machine when it dies was never done.

If the work needs something that belongs to another ticket, stop, name it and
brief. It is not yours to build.

## 4. Verify

All four layers, in order. A green test run is a gate, not proof.

1. **Gates.** Run every gate the profile lists. If the same check fails three
   times running, stop and brief: grinding at a red check burns the afternoon.
2. **Live proof.** Call the Skill tool with "run" to start the app from the
   repo's recipe (`.claude/skills/run-*`), then drive each acceptance line
   through it the way a user would, and keep the evidence: the command, its
   output, the screenshot path. When the repo has no run skill, say so in the
   PR's Evidence and in the brief: without one the PR cannot self-merge.
3. **Code review.** Call the Skill tool with "code-review" and
   "complexity-red-flags", each on the diff against the base branch. Both run
   in their own context, so neither shares your reasoning: `code-review` hunts
   bugs and checks the CLAUDE.md rules, `complexity-red-flags` checks the design
   and the repo's `CODING_STANDARDS.md`. Give every finding a disposition per
   `references/dispositions.md`, fix the fix-now ones, and rerun the gates.
4. **Independent verdict.** Once the code has settled, call the Skill tool with
   "poke-holes" at the artifact target, on the commit you will record. Its
   reviewers start fresh and did not write the code. The verdict pins that
   commit, so any later change to the code needs a fresh one: review before you
   prove. Give every finding a disposition. Scale the reviewers to the diff,
   never to zero: a ten-line change still gets one fresh reviewer, because the
   author is the one reader who cannot see its own gaps. Small diffs are where
   this layer is cheapest, not where it is optional.

## 5. Triage deviations

Deviating is often right. The only failure is an unreported deviation.

- Acceptance still holds: record it and keep going, as a ticket comment, or a
  line in the brief when there is no ticket.
- Acceptance breaks: stop. That one is the human's. Hand back:
  `factory ticket handback <ID> --brief-file <brief>`.

Comment format, for deviations the ticket did not cover:

```
**Deviation · <5-10 word subject, plain language>**

<what you did instead of the obvious thing, one sentence>

**Forced by:** <what in the code forced it, with file:line or command output>
**Acceptance:** "<the line>" still holds
**Affects elsewhere:** <where this bites, or do not post the comment>
```

If "Affects elsewhere" is empty it is just work. Do not post it.

Out-of-scope discoveries become new tickets in triage, filed after the brief
and the human's approval, the way the profile's Issue tracker section says.
Never carry them away in your head.

## 6. Open the PR and hand over

1. Commit with the repo's conventions. Push.
2. Open the PR ready for review, never as a draft. Call the Skill tool with
   "pr" for the body: Summary, Evidence from step 4, Merge Danger with the door
   and blast radius. End it with the ticket's `closes` line (`Closes ENG-123`
   or `Closes #12`) so the tracker closes the ticket on merge.
   A change that touches a profile one-way door is a one-way door, whatever it
   looks like.
3. Record the verdict once poke-holes came back with no open fix-now finding:
   `factory pr verdict <PR> --sha <SHA> --result pass --summary-file <file>`.
   `<SHA>` is the commit the reviewers checked (`git rev-parse HEAD` when you
   briefed them); the file says what they checked and what the live proof
   showed. The CLI refuses when the PR's head is no longer that commit, and a
   later push that changes the patch voids the verdict.
4. Stop here: the ticket is now in Babysit. `/factory <ID>` hands the PR to
   `babysit-pr`, which takes it to merge-ready and merges only when the
   ticket's autonomy and the gate allow it.

Without a ticket, the conservative reading applies: commit as you go, and never
push, merge or deploy without being told.

## 7. Brief

When the work is done, or the moment you stop, brief the human per
`references/briefing.md`.
