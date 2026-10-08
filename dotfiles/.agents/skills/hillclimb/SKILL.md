---
name: hillclimb
description: "Fix a failure mode in a skill's instructions by measurement: find its occurrences in past sessions, replay each as an eval case, and keep an edit only when it beats the noise on tuning and held-out cases alike. Usage: /hillclimb <what went wrong, or a retro candidate>."
disable-model-invocation: true
---

# Hillclimb

Wording in a skill changes what agents do only on average, so an edit is kept
on evidence: replays of real moments where agents went wrong, run before and
after the edit.

- An **occurrence** is one moment in one session where the failure happened.
- **Headroom** is how often the current wording still fails.
- **Noise** is how far the pass rate moves between two runs of the same wording.
- **Held-out** cases are the ones the edits never saw.

A replay reflects only what loads after its cut point, so the target is the
body of a skill, which loads when the agent calls it. A transcript records the
skill descriptions and `AGENTS.md` itself, so an edit to them never reaches a
replay: tune a description with `bin/triggers` in newsroom-evals, and report an
`AGENTS.md` failure to the human.

Past sessions live only on the Mac, so everything after step 1 runs there. In a
cloud session, stop after step 1 and say so.

`sessions` below is `node --disable-warning=ExperimentalWarning <this skill's
folder>/scripts/sessions.ts`. Its `search`, `show` and `cut` commands name
events as `<file>:<line>`.

## 1. Name the failure

One sentence: what the agent did, what it should have done, and the skill
whose instructions should have steered it.

When the right fix is a check, a lint or a test, build that instead and stop:
a check proves itself. When it is a reviewer rule in `CODING_STANDARDS.md`,
write it the way `retro` does and stop, since a replay carries a skill's body
and not the repo's standards.

Done when the human confirms the sentence.

## 2. Find the occurrences

Search the last 90 days, widening with `--days`, for every trace the failure
leaves in a transcript: the tool call it makes (`sessions search 'tool Edit:
.*\.test\.'`), the words the human uses to correct it, the error it causes, the
skill being loaded (`tool Skill: .*"<name>"`). Search prints the newest
sessions first and says when it hit its limit; then narrow the pattern or raise
`--limit`. Read each hit in context with `sessions show <file>:<line>`.

An occurrence is a hit where the same failure happened. For each, note the
`<file>:<line>` of the prompt the human typed just before the mistake: the
replay starts there. A correction comes after the mistake, so from a correction
read back with `--before` to the mistake, then to the prompt before it. A
session whose working folder changed appears under two project folders: count
it once.

With fewer than two occurrences, stop and report the one you found. It is not a
failure mode yet, and the next hillclimb will find it again.

Otherwise split them now, at random: a third, and at least one, are held-out.
Name the cases `<failure-slug>-tune-<n>` and `<failure-slug>-holdout-<n>`.

Done when every search you can think of has run, every hit is judged, and the
split is written down.

## 3. Build the tuning cases

In a checkout of andrezzoid/newsroom-evals (ask the human where, or clone it),
make one folder per tuning occurrence under `harness/evals/<skill>/`:

1. `sessions cut <file>:<line> <case>/history.jsonl` writes the conversation as
   the agent had it at that prompt, and prints the prompt, the repo's folder,
   the branch and the time.
2. Grep `history.jsonl` for a distinctive line of the target skill. If it is
   there, the skill loaded before the cut and the replay carries its old text:
   cut at an earlier prompt, before it loaded, or drop the occurrence.
3. Pin the commit in the human's checkout: `git -C <folder> rev-list -1
   --before=<time> <branch>`, then `origin/<branch>`, then the default branch,
   whichever exists first. `fixture.sh` runs `git clone --quiet <folder> .`,
   `git checkout --quiet <sha>` and `git remote remove origin`, so the clone
   carries unpushed commits and the replay has nothing to push to. Work that
   was uncommitted then is gone: when the mistake depended on it, say so in the
   case's description.
4. `case.yaml` sets `context.history_file: history.jsonl`,
   `context.scaffold_script: fixture.sh`, and `execution.prompt` to the printed
   prompt. When that prompt is a slash command, check in the first run's trace
   that the skill loaded: nobody has seen the eval expand one yet.
5. Graders state the right move at that moment: an `llm` grader with `focus:
   trace` or `last_message`, plus a `regex` or file grader for anything
   mechanical. Copy the shape from the existing cases.
6. Scan for secrets: `grep -nE
   'ghp_|github_pat_|sk-[A-Za-z0-9]|xox[abp]-|AKIA|BEGIN [A-Z ]*PRIVATE'
   history.jsonl`. Ask the human before committing a case cut from work on
   morgen-so code.

Then dispatch one subagent to build the held-out cases the same way, from their
`<file>:<line>` list and the failure sentence, and to answer only with each
step's pooled pass rate. Their transcripts and graders stay out of your
context.

Before the first run, check once that the replay is contained: a one-case probe
whose prompt asks the agent to run `touch <folder>/.hillclimb-probe` and `gh
api user`. Both must fail. If either works, stop and tell the human.

Done when every tuning case exists and the subagent has confirmed the held-out
ones.

## 4. Measure the baseline

Run the tuning cases twice with the wording as it is, `bin/eval --case
'<failure-slug>-tune-*' --runs 3`, raising `--runs` until each batch has at
least six runs in total. The subagent does the same for the held-out cases.
Report the cost, and estimate the rest of the climb, before going on.

- **Pass rate** is passing runs over all runs, pooled across the cases.
- **Noise** is the gap between the two batches' pass rates, and never less than
  one run's share.
- When the baseline passes four runs in five or more, there is no headroom: the
  failure does not reproduce. Stop and report.

## 5. Climb

Change one thing in the target skill, following the `writing-for-agents`
skill, and run the tuning cases once with the same `--runs`. The edit wins when
its pass rate beats the baseline's mean by more than the noise. Revert an edit
that does not win before trying the next. Stop at the first win, or after five
edits.

## 6. Keep or revert

With a winning edit, have the subagent run the held-out cases with the same
`--runs`. Keep the edit only when the held-out pass rate also beats its
baseline by more than the noise. Otherwise revert the skill.

Either way, commit the cases to newsroom-evals, where they guard against the
failure coming back, and report to the human: the failure sentence, the
occurrences, the baseline and final pass rates for tuning and held-out cases,
the noise, the cost, and the diff of the skill on a branch in the config repo.
