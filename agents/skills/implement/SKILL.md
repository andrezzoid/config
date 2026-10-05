---
name: implement
description: Build one unit of work end to end, from a Linear ticket (ENG-123), a spec file, or what the conversation just settled. Claims the ticket, builds test-first against its acceptance, proves it on the running app, gets an independent verdict, reports deviations instead of absorbing them, and opens the PR. Use when asked to implement, build or pick up a ticket or spec.
---

# Implement

One unit per run. Dispatching several is the caller's job. Nobody may be
around to answer questions, so anything that needs the human ends the run with
a brief instead of a question.

A ticket's body is agreed state: never edit it. Its comments are the event log
and the only thing you write on the ticket. If the work turns out to need a
different definition, that is the human's to reshape.

## 1. Load the work

- **Ticket:** `factory ticket show <ID> --json` gives the body, repo, autonomy,
  blockers and branch name. Read the parent ticket too when there is one.
- **Claim it, as your first write:** `factory ticket claim <ID>`. Exit 3 means
  another session has it, or it is not labelled `ready-for-agent`: stop and say
  so in one line. Skip the claim when the human handed you the ticket in this
  conversation and it is already yours.
- **Repo profile:** `docs/agents/factory.md` names the gates, the verify skill
  and the one-way doors. Without it, tell the human to run `/setup-factory` and
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
   origin/<base>`, using the ticket's `branchName` so Linear links the PR and
   moves the ticket on its own.
5. Install dependencies the way the README or profile says.

## 3. Build test-first

Call the Skill tool with "test-driven-development". Red before green, at the
seams the ticket or its spec names. When none are named, use the highest
existing seam and record it in the notes.

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

All three layers, in order. A green test run is a gate, not proof.

1. **Gates.** Run every gate the profile lists. If the same check fails three
   times running, stop and brief: grinding at a red check burns the afternoon.
2. **Live proof.** When the repo has a verification skill
   (`.claude/skills/verify-*`, or the profile's verify skill), use it to drive
   each acceptance line through the running app the way a user would, and keep
   the evidence: the command, its output, the screenshot path. When the repo
   has none, say so in the PR's Evidence and in the brief: without live proof
   the PR cannot self-merge.
3. **Independent verdict.** Call the Skill tool with "complexity-red-flags" on
   the diff, then call it with "poke-holes" at the artifact target. Its
   reviewers start fresh and did not write the code. Give every finding a
   disposition per `references/dispositions.md`.

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
and the human's approval. Never carry them away in your head.

## 6. Open the PR and hand over

1. Commit with the repo's conventions. Push.
2. Open the PR ready for review, never as a draft. Call the Skill tool with
   "pr" for the body: Summary, Evidence from step 4, Merge Danger with the door
   and blast radius. Add `Closes <ID>` so Linear closes the ticket on merge.
   A change that touches a profile one-way door is a one-way door, whatever it
   looks like.
3. Record the verdict for the head you pushed, once poke-holes came back with
   no open fix-now finding:
   `factory pr verdict <PR> --result pass --summary-file <file>`, where the file
   says what the reviewers checked and what the live proof showed. A later push
   that changes the patch voids it.
4. Call the Skill tool with "babysit-pr". It takes the PR to merge-ready, and
   merges only when the ticket's autonomy and the gate allow it.

Without a ticket, the conservative reading applies: commit as you go, and never
push, merge or deploy without being told.

## 7. Brief

When the work is done, or the moment you stop, brief the human per
`references/briefing.md`.
