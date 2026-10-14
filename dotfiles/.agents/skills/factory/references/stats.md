# Stats

The weekly review: what got done, what went wrong, and why each open ticket is
still open. `factory stats --json` has the facts, seven days back unless
`--since` says otherwise; the judgment is yours.

## Process

### 1. Done

Say how many tickets closed and how many pull requests merged, and the median
time from ready to done. Name the outliers.

### 2. What went wrong

Group the hand-backs, the reports that needed André, the reverts and the
review comments into mistakes that repeat: a mistake counts once it happened
twice, each time with its link. For each, propose the most enforceable fix:
code that makes it impossible, then types or a lint whose error names the fix,
then a test, and last a skill or doc line. Done when every repeated mistake
has a proposal.

### 3. Still open

One line per open ticket: what holds it, and what would move it. Done when
every open ticket has its line.

### 4. Ask

Send it all in one message, ending with the question of which mistakes to fix.
End the turn, so the routine's notification carries it. For each one
André picks, follow [the correct skill](../../correct/SKILL.md) in the repo it
happened in.
