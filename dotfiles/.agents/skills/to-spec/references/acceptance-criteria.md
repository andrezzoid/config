# Acceptance criteria

Shared by `to-spec` and `to-tickets`. The real file lives here;
`to-tickets/references/acceptance-criteria.md` is a symlink to it.

Acceptance criteria are the most important part of a spec or a ticket. Everything
downstream tests against these lines. `to-tickets` distributes them across the
tickets it cuts. Implementation quotes them before it writes code. Deviation
triage asks whether they still hold. If a criterion cannot fail, nothing
downstream can test it.

Write them Given, When, Then, in the domain's language, one assertion each.

```
- [ ] Given <the state>, when <the trigger>, then <the single observable outcome>.
```

## Rules

**One assertion per criterion.** This bullet holds three criteria:

> None sent when the window is unfocused; none when the transcript is not
> mounted; none from the local inactivity rejection.

Write three.

**Name the observation.** "Device check result recorded" gives the reader nothing
to look at. Name the call, the value or the row that a person or a test can read.

**Bound the negative.** You cannot assert the absence of everything, so "nothing
else happens" cannot be tested. Say what must not happen: no retry, no exception
escapes, no error reaches the user.

**Define every noun.** "Never twice for the same render" cannot be tested while
"render" has no definition. "At most one call per message id per present
transition" can.

**A test location is not a criterion.** "Tests at the existing provider seam" is
satisfied by any test at all. Put it in the implementation decisions.

**Assert every rule an implementer could get wrong.** A rule that appears once in
prose and never in a criterion is the rule that gets missed.
