# Acceptance criteria

Shared by `to-spec`, `to-tickets` and `triage`. The real file lives here;
`to-tickets/references/acceptance-criteria.md` and
`triage/references/acceptance-criteria.md` are symlinks to it.

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

**Write what the consumer observes.** The consumer is whoever uses the change: a
user for a feature, a developer or a calling module for an internal one. State
what they observe at the seam the ticket tests at, which for an internal change
is a module's interface, not the whole app. "Scan core and SARIF output contain
no detector ids (check with grep)" describes how the code is arranged. The
outcome it stands for is "Given a new detector registered with its definition
and docs page, when strata scans, then the text report, the SARIF output and
`--touched-since` cover it with no edit elsewhere."

**Bound the negative.** You cannot assert the absence of everything, so "nothing
else happens" cannot be tested. Say what must not happen: no retry, no exception
escapes, no error reaches the user.

**Define every noun.** "Never twice for the same render" cannot be tested while
"render" has no definition. "At most one call per message id per present
transition" can.

**A check is not a criterion.** "Tests at the existing provider seam" names where
to test and "a test asserts every flag is registered" names a test, and any test
at all satisfies either. Write the outcome the test would observe, and put the
seam in the implementation decisions. Leave out the gates and the changelog:
every change runs the gates, and the repo's own rules ask for its changelog.

**Assert every rule an implementer could get wrong.** A rule that appears once in
prose and never in a criterion is the rule that gets missed.
