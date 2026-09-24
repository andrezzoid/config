---
name: implement
description: Build a ticket's work against its acceptance, with TDD, adversarial verification, and deviations reported rather than absorbed. Use when picking up a shaped ticket to implement it.
disable-model-invocation: true
---

# Implement

Implement the ticket named in the invocation. If none was given, ask which. One
ticket per run: dispatching several is the caller's job, not yours.

Read the ticket first, and its parent for context. The ticket's body is agreed
state: never edit it. Comments are the event log and the only thing you write
there. The parent carries the shape, the ticket carries the contract. If the
work turns out to need a different definition, that is the human's call to
shape, not yours here.

Before any code:

1. Quote each acceptance line you are working against. If one is not testable as
   written, meaning you cannot say what observation would falsify it, stop and
   say so. Vague acceptance is a shaping problem, not something to work around.
2. Check this ticket's blockers. If any of them is not done, stop and say which.
   Nothing here is worth building on an unfinished blocker.
3. Create `.factory/<ticket-id>.md`, untracked, as working notes. Keep it
   current: what you tried, deviations, decisions, open threads. It is yours, it
   is disposable, and it only has to survive until the next writeback.
   - Add `./factory` to the .gitignore if it's being tracked.

Build it with TDD. Load the test-driven-development skill. Red before green.

Also load the following skills when appropriate:
- comments-as-design
- deep-module-design
- define-errors-away

If the work turns out to need something that belongs to another ticket, stop,
name it, and wait. It is not yours to build.

Verify before you call it done:

- Run lint, typecheck and the test suite.
- Follow the complexity-red-flags skill.
- Load and follow the poke-holes skills at the artifact target for findings
- Every finding gets a disposition: fix now, followup, or rejected with a
  reason.
- If the same check fails three times running, stop and brief. Grinding at a red
  check is how a session burns an afternoon and arrives with nothing.

Then triage anything you did that departed from the ticket. Deviating is often
right. The only failure is an unreported deviation.

- Acceptance still holds, so post a comment and keep going.
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
brief and human approval, never carried away in your head.

The ticket carries an autonomy level. Read it before the first commit and work
within it. Absent or unreadable, take the most conservative reading: commit as
you go with the end of the ticket as the checkpoint, and never push, merge or
deploy without being told.

When the ticket is done, or the moment you stop, brief the human:

- They have not read the ticket, the notes or the diff. Write for that.
- Never use an id they did not type.
- Lead with what it means for the thing they asked for, not with the mechanism.
- If a decision is needed: the options, a recommendation, the question. Short.
