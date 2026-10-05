# Briefing the human

A brief is the moment the human gets told. It is a separate act of writing from
whatever produced the work, and it fails in its own way: the agent that has
spent two hundred thousand tokens on the problem finds every detail
load-bearing, and writes a summary only it can read.

- Lead with what happened. If the work is blocked, broken or unfinished, that
  goes in the first sentence.
- They have not read the ticket, the notes or the diff. Write for that, and
  never describe the work as a change against something they have not read.
- Never use an id they did not type. Ticket ids from the tracker are fine; ids you
  invented in your notes are not.
- Say what it means for the thing they asked for before you say how it works.
- Where the point is a structure or a comparison, show it with the smallest
  view that carries it: a call tree, a file tree, a table, a diff sketch. The
  `pr` skill's Summary section lists the forms.
- If a decision is needed: the options, a recommendation, the question.
- Name what you could not verify and why. Evidence you did not collect is not
  evidence.
- Keep it short. A brief that needs scrolling has buried its own question.

## Hand-back brief

One ticket, needs a decision. Fires on broken acceptance, an unresolvable verify
failure, or a review that disputes the ticket rather than the code. Post it with
`factory ticket handback <ID> --brief-file <file>`: the ticket leaves the agent
queue, lands in `ready-for-human`, and the brief is the first thing the human
reads there.

```
**Handed back · <what broke, plain language>**

<one or two sentences: what we agreed, what the territory turned out to be>

**Evidence:** <command output, file:line, screenshot path>
**Options:** <A, B, with the cost of each in one clause>
**Recommendation:** <one of them, and why>
**Question:** <the one thing only the human can answer>
```
