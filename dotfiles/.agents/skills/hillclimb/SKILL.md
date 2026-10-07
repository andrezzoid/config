---
name: hillclimb
description: "Fix a failure mode in a skill or AGENTS.md by measurement: find its occurrences in past sessions, replay each as an eval case, and keep a wording change only when it beats the noise on tuning and held-out cases alike. Usage: /hillclimb <what went wrong, or a retro candidate>."
disable-model-invocation: true
---

# Hillclimb

Wording in a skill changes what agents do only on average, so a change is kept
on evidence: replays of real moments where agents went wrong, run before and
after. The leading words: an **occurrence** is one moment in one session where
the failure happened; **headroom** is how often the current wording still
fails; **noise** is how much the pass rate moves between identical runs;
**held-out** cases are ones the edits never saw.

Everything below runs on André's Mac: past sessions live only there. In a
cloud session, stop at step 2 and say so.

`sessions` below is `node --disable-warning=ExperimentalWarning <this skill's
folder>/scripts/sessions.ts`. Its `search`, `show` and `cut` commands name
events as `<file>:<line>`.

## 1. Name the failure

One sentence: what the agent did, what it should have done, and the document
that should have steered it, a skill in `~/.agents/skills` or `AGENTS.md`.

When the right fix is a check, a lint, a test or a `CODING_STANDARDS.md` rule,
build that instead and stop here: a check proves itself, and hillclimbing is
for wording.

Done when André confirms the sentence.

## 2. Find the occurrences

Search the last 90 days, widening with `--days`, by every trace the failure
leaves in a transcript: the tool call it makes (`sessions search 'tool Edit:
.*\.test\.'`), the words André uses when he corrects it, the error it causes,
the name of the skill that was loaded. Read each hit in context with `sessions
show <file>:<line>`.

An occurrence is a hit where the same failure happened. For each, note the
`<file>:<line>` of the prompt André typed just before the mistake: the replay
starts there. A correction comes after the mistake, so from a correction read
back with `--before` to the mistake, then to the prompt before it. A session
whose working folder changed appears under two project folders; count it once.

Done when every search you can think of has run and every hit is judged. With
fewer than two occurrences, stop and report the one you found: it is not a
failure mode yet, and the next hillclimb will find it again.

## 3. Build one case per occurrence

In a checkout of andrezzoid/newsroom-evals (ask André where, or clone it),
under `harness/evals/<skill>/<failure-slug>-<n>/`:

1. `sessions cut <file>:<line> <case>/history.jsonl` writes the session up to
   that prompt and prints the prompt, the repo's folder, the branch and the
   time. Then grep `history.jsonl` for a distinctive line of the target
   document. When it is there, the skill or `AGENTS.md` was loaded before the
   cut, the replay carries its old text, and no edit can reach the agent: cut
   at an earlier prompt, before it loaded, or drop the occurrence.
2. `fixture.sh` rebuilds the repo as it was: clone its `origin`, then check out
   `git rev-list -1 --before=<time> <branch>`. Work that was uncommitted then is
   gone; when the mistake depended on it, say so in the case's description.
3. `case.yaml` sets `context.history_file: history.jsonl`,
   `context.scaffold_script: fixture.sh` and `execution.prompt` to the printed
   prompt. The eval replays the history and sends the prompt as the next turn,
   so the agent meets the same moment.
4. Graders state the right move at that moment: an `llm` grader with `focus:
   trace` or `last_message`, plus a `regex` or file grader for anything
   mechanical. Copy the shape from the existing cases there.

A transcript carries whatever the session read. Before committing a case, read
its `history.jsonl` for secrets, and ask André before committing one cut from
work on morgen-so code.

Done when every occurrence has a case.

## 4. Hold some out

Pick a third of the cases, at least one, as held-out, before reading any case
closely. Keep their transcripts and grader verdicts out of your context while
you edit.

## 5. Measure

Run every case three times with the wording as it is: `bin/eval --case
'<failure-slug>-*' --runs 3`. Report the cost and estimate the rest of the
climb before going on.

- **Headroom:** when the current wording passes four runs in five or more, the
  failure does not reproduce. Stop and report.
- **Noise:** the spread of each case's pass rate across its runs. An edit has
  to beat it.

## 6. Climb

Change one thing in the target document, following the `writing-for-agents`
skill, and rerun the tuning cases only. Repeat, at most five edits, until the
tuning pass rate beats the baseline by more than the noise. Then run the
held-out cases once.

## 7. Keep or revert

Keep the change only when the tuning and held-out pass rates both beat the
baseline by more than the noise. Otherwise revert the document.

Either way, commit the cases to newsroom-evals, where they guard against the
failure coming back, and report to André: the failure sentence, the
occurrences, baseline and final pass rates for tuning and held-out cases, the
cost, and the diff of the document on a branch in the config repo.
