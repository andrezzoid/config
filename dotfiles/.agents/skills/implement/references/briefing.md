# Briefing the human

A brief is the moment the human gets told. It is a separate act of writing from
whatever produced the work, and it fails in its own way: the agent that has
spent two hundred thousand tokens on the problem finds every detail
load-bearing, and writes a summary only it can read.

- Lead with what happened. If the work is blocked, broken or unfinished, that
  goes in the first sentence.
- They have not read the ticket, the notes or the diff. Write for that, and
  never describe the work as a change against something they have not read.
- Never use an id they did not type, except the tracker's own ticket ids.
- Say what it means for the thing they asked for before you say how it works.
- Where the point is a structure or a comparison, show it, using the forms in
  the `pr` skill's Summary section, instead of describing a shape in prose.
- If a decision is needed: the options, a recommendation, the question.
- Name what you could not verify, and why.
- Keep it short. A brief that needs scrolling has buried its own question.

## Hand-back brief

A hand-back brief covers one ticket and needs a decision. It fires on broken
acceptance, a verify failure you cannot resolve, or a review that disputes the
ticket rather than the code. Post it with `factory ticket handback <ID>
--brief-file <file>`, which takes the ticket out of the agent queue and labels
it `ready-for-human`, so the brief is the first thing the human reads there:

```
**Handed back · <what broke, plain language>**

<what we agreed, and what the territory turned out to be, in one or two sentences>

**Evidence:** <command output, file:line, screenshot path>
**Options:** <A, B, each with its cost in one clause>
**Recommendation:** <one of them, and why>
**Question:** <the one thing only the human can answer>
```
