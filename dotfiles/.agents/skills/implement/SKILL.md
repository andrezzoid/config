---
name: implement
description: "Build one unit of work end to end, from a ticket (ENG-123 in Linear, owner/repo#12 or #12 in GitHub Issues), a spec file, or what the conversation just settled. Claims the ticket, builds test-first against its acceptance, proves it on the running app, gets an independent verdict, reports deviations instead of absorbing them, and opens the PR. Use when asked to implement, build or pick up a ticket or spec."
---

# Implement

Implement the work named in the invocation: a ticket, a spec file, or what the
conversation just settled. If nothing was named, ask. One unit per run:
dispatching several is the caller's job, not yours. When you run unattended,
nobody answers a question: anything that needs the human ends the run with a
brief.

Read it first, and the parent for context when there is one. Read a ticket with
`factory ticket show <ID> --json`, on either tracker. Its `contract` is what you
build against: triage's latest agent brief when there is one, otherwise the
body. A published ticket's body is agreed state: never edit it, and its comments
are the event log and the only thing you write there. Where there is no ticket
there is no comment log, so every deviation, decision and followup reaches the
human through the brief instead. The parent carries the shape, the ticket
carries the contract. If the work turns out to need a different definition, that
is the human's call to shape, not yours here: hand the ticket back with `factory
ticket handback <ID> --brief-file <brief>`, which posts the brief and labels it
`ready-for-human`.

Claim a ticket as your first write: `factory ticket claim <ID>`. Exit 3 means
another session holds it, or it is not labelled `ready-for-agent`: stop and
say so in one line. Pass `--take-over` only when the human asked you to take
the ticket over.

Before any code:

1. Quote each acceptance line you are working against, and name the
   observation that would falsify it. If you cannot name one, hand the ticket
   back: vague acceptance is a shaping problem, not something to work around.
2. Check the blockers, when the work is a ticket that declares any. If one is
   not done, stop and say which. Nothing here is worth building on an unfinished
   blocker.
3. Create `.factory/<id-or-slug>.md` as working notes, and add `.factory/` to
   `.git/info/exclude`. Keep it current: what you tried, deviations, decisions,
   open threads. It is yours, it is disposable, and it only has to survive until
   the next writeback.
4. Branch from the fresh base: `git fetch origin && git switch -c <branchName>
   origin/<base>`. The ticket's branch name links the PR to the ticket, and
   `factory pr merge` finds the ticket's autonomy through it.
5. Install dependencies and get the project ready the way its README says.
   `.agents/factory.md`, the repo profile, names the gates and the one-way
   doors. Without it, tell the human to run `/setup-factory`, and take the
   gates from the README or CI.

Build it with TDD: call the Skill tool with "tdd". The acceptance lines are its
test list, one vertical slice each, at the seam the ticket's Testing line
names, or the highest existing seam when it names none. For each line:

1. Write the line's test, asserting the observation you named for it. A line
   that keeps existing behaviour gets a characterization test, with the base's
   output as its expected value.
2. Run it, watch it fail for the reason the line describes, and commit the test
   on its own. A characterization test passes from the start, and so does a
   line an earlier slice already made true: break the code once to see it fail,
   and say so in the notes.
3. Write only enough code to make it pass, commit, and take the next line.

On a ticket, push after every slice that passes: CI never runs a failing test,
and the work outlives the session. When the repo's hooks refuse a commit holding
a failing test, commit the test with its code, and put the failing run in the
PR's Evidence.

Call the Skill tool for "comments-as-design", "deep-module-design" or
"define-errors-away" when the change shapes a comment, an interface or an error
surface.

Agents copy what they see. Extend a pattern only when you would be happy to see
it copied again: when the nearest example is a workaround, follow the paved
path and note the bad example as a followup. Never write a comment that
justifies a workaround: fix the cause, or file it.

If the work turns out to need something that belongs to another ticket, stop,
name it, and brief. It is not yours to build.

Verify before you call it done, in this order:

1. Run the gates the profile lists.
2. Call the Skill tool with "code-review" and "complexity-red-flags", each
   on the diff against the base. Both run in their own context, so neither
   shares your reasoning.
3. For each acceptance line whose test stops short of the app's own interface
   (a command, a request, a page), call the Skill tool with "run" and drive the
   line through the running app the way a user would. Keep the command and its
   output, or the screenshot path, for the PR's Evidence. Without a run skill,
   say so in the Evidence and the brief: the PR cannot merge itself.
4. Call the Skill tool with "poke-holes" on the solution, at the commit you will
   record. Its verdict pins that commit, so this goes last.

Give every finding a disposition. Follow `references/dispositions.md`. After a
fix, rerun the gates. If the same check fails three times running, stop and
brief. Grinding at a red check is how a session burns an afternoon and arrives
with nothing.

Then triage anything you did that departed from the ticket. Deviating is often
right. The only failure is an unreported deviation. Acceptance holds while every
acceptance test passes and still asserts what its line says, so weakening an
acceptance test to make it pass breaks acceptance.

- Acceptance still holds, so record it and keep going: a comment on the ticket,
  or a line in the brief when there is no ticket.
- Acceptance breaks, so stop. That one is the human's: hand the ticket back.

Comment format, for deviations the ticket did not cover:

```
**Deviation · <5-10 word subject, plain language>**

<what you did instead of the obvious thing, one sentence>

**Forced by:** <what in the code forced it, with file:line or command output>
**Acceptance:** "<the line>" still holds
**Affects elsewhere:** <where this bites, or do not post the comment>
```

If "Affects elsewhere" is empty it is just work. Do not post it.

Out-of-scope discoveries become new tickets in triage, filed after the final
brief and human approval, never carried away in your head. Where there is no
tracker, raise them in the brief and leave them there.

A ticket carries an autonomy level, `pr` or `merge`. Either way you push and
open the pull request, and only `babysit-pr` merges. Working without a ticket,
take the most conservative reading: commit as you go with the end of the work
as the checkpoint, and never push, merge or deploy without being told.

When the work is done on a ticket:

1. Open the pull request ready for review, never as a draft. Call the Skill tool
   with "pr" for the body: Evidence holds the proof from verify, and Merge
   Danger names the door. A change that touches a one-way door in the profile is
   a one-way door. End the body with the ticket's `closes` line, so the tracker
   closes the ticket on merge.
2. Once poke-holes came back with no open fix-now finding, record its ledger:
   `factory pr verdict <PR> --sha <the commit the reviewers checked> --result
   pass --summary-file <ledger>`. The CLI refuses when the head has moved past
   that commit.
3. Stop. The ticket is in Babysit now, and `/factory <ID>` hands the PR to
   `babysit-pr`.

When the work is done, or the moment you stop, brief the human. Follow
`references/briefing.md`.
