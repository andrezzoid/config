---
name: implement
description: Build a unit of work against its acceptance, with TDD, adversarial verification, and deviations reported rather than absorbed. Use when picking up a shaped ticket, a spec, or a settled conversation to implement it.
disable-model-invocation: true
---

# Implement

Implement the work named in the invocation: a ticket, a spec file, or what the
conversation just settled. If nothing was named, ask. One unit per run:
dispatching several is the caller's job, not yours.

Read it first, and the parent for context when there is one. A published
ticket's body is agreed state: never edit it, and its comments are the event log
and the only thing you write there. Where there is no ticket there is no comment
log, so every deviation, decision and followup reaches the human through the
brief instead. The parent carries the shape, the ticket carries the contract. If
the work turns out to need a different definition, that is the human's call to
shape, not yours here.

Before any code:

1. Quote each acceptance line you are working against. If one is not testable as
   written, meaning you cannot say what observation would falsify it, stop and
   say so. Vague acceptance is a shaping problem, not something to work around.
2. Check the blockers, when the work is a ticket that declares any. If one is
   not done, stop and say which. Nothing here is worth building on an unfinished
   blocker.
3. Create `.factory/<id-or-slug>.md`, untracked, as working notes. Keep it
   current: what you tried, deviations, decisions, open threads. It is yours, it
   is disposable, and it only has to survive until the next writeback.
   - Add `.factory/` to the .gitignore if it is being tracked.
4. Make sure the branch is up to date with the remote base branch
5. Make sure dependencies are installed and the project is ready to be worked on
   according to their README.md.

Build it with TDD. Load the test-driven-development skill. Red before green.

Also load the following skills when appropriate:
- comments-as-design
- deep-module-design
- define-errors-away

When the same mechanical edit repeats across files, write the codemod or script
and run it instead of editing by hand. The script is what a reviewer reruns to
check the work; hand edits can only be checked by redoing them.

If the work turns out to need something that belongs to another ticket, stop,
name it, and wait. It is not yours to build.

Verify before you call it done:

- Run lint, typecheck and the test suite. That proves the code compiles and its
  branches behave, not that the work does what the acceptance says.
- Prove each acceptance line against the real artifact: drive the app through
  the project's `verify-*` skill, run the real command, read back the stored
  value. If the work is user-facing and the project has no verify skill, say so
  in the brief and suggest `/verify-skill`. Inconclusive or wrong-surface
  evidence is not a pass.
- Rewrite or delete any test you wrote that would still pass if the code under
  test returned nothing.
- Follow the complexity-red-flags skill.
- Load and follow the poke-holes skill at the artifact target, spawning
  `verifier` subagents for it.
- Every finding gets a disposition: fix now, followup, or rejected with a
  reason.
- If the same check fails three times running, stop and brief. Grinding at a red
  check is how a session burns an afternoon and arrives with nothing.

Then triage anything you did that departed from the ticket. Deviating is often
right. The only failure is an unreported deviation.

- Acceptance still holds, so record it and keep going: a comment on the ticket,
  or a line in the brief when there is no ticket.
- Acceptance breaks, so stop. That one is the human's. Brief them and wait.

Comment format, for deviations the ticket did not cover:

```
**Deviation · <deviation id> · <5-10 word subject, plain language>**

<what you did instead of the obvious thing, one sentence>

**Forced by:** <what in the code forced it, with file:line or command output>
**Acceptance:** "<the line>" still holds
**Affects elsewhere:** <where this bites, or do not post the comment>
```

If "Affects elsewhere" is empty it is just work. Do not post it.

Out-of-scope discoveries become new tickets in triage, filed after the final
brief and human approval, never carried away in your head. Where there is no
tracker, raise them in the brief and leave them there.

A ticket carries an autonomy level, the furthest you may take the work without
asking:

- `commit`: commit locally as you go, with the end of the work as the
  checkpoint. Never push.
- `pr`: push the branch, open the PR, and drive it to merge-ready with
  `/check-pr`. Never merge.
- `merge`: merge once `pr-state` reads `READY` and a `verifier` passed on that
  same head commit. Only for two-way doors: a change a revert fully undoes, in
  a project whose verify skill covers it.

Read it before the first commit and work within it. Absent, unreadable, or
working without a ticket, take `commit`. No level covers deploys, data
migrations or anything else a revert can't undo. Those wait for the human.

Keep a list of every place the environment let you go wrong: a mistake a lint,
type, test or clearer structure would have caught, or a convention you could
only learn by being corrected. Don't fix them here. They go in the brief under
environment gaps, and `/correct` fixes the ones that repeat.

When the work is done, or the moment you stop, brief the human. Follow
`references/briefing.md`.
