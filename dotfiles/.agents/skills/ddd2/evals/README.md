# ddd2 evals

Five scenarios, each run twice — `with_skill` (your live config) and `without_skill`
(same prompt, told not to use skills) — on headless Opus sessions in throwaway
fixture repos. Assertions are graded by fresh headless Sonnet graders from
artifacts only, then aggregated for the skill-creator viewer.

| # | Scenario | Guards |
|---|---|---|
| 1 | feature-ask-shaping-discipline | enters ddd2, shapes, asks — doesn't just build |
| 2 | trivial-change-skips-protocol  | no over-triggering on a typo |
| 3 | mid-build-contradiction-surfaced | the silent-patch trap: Theory contradicts the territory |
| 4 | react-not-read-on-fuzzy-fork   | reactable variants, not prose or one guessed build |
| 5 | verify-before-ship             | real spawned review; ship stays the human's word |

## Prerequisites

- `claude` CLI, logged in; `node` ≥ 20, `jq`, `python3`.
- **Park old ddd first** or triggering races contaminate every with_skill run:
  `mv ~/.claude/skills/ddd /tmp/ddd-parked` — restore afterwards with the reverse `mv`.
  (Moot once ddd is retired.)

## Run

```sh
./run.sh /tmp/ddd2-evals        # ~10–20 min, 10 Opus sessions, bills real tokens (~$5–10)
./grade.sh /tmp/ddd2-evals      # 5 parallel Sonnet graders, artifact-only
python3 bench.py /tmp/ddd2-evals
python3 ~/.claude/skills/skill-creator/eval-viewer/generate_review.py \
  /tmp/ddd2-evals/iteration-1 --skill-name ddd2 \
  --benchmark /tmp/ddd2-evals/iteration-1/benchmark.json
```

`MODEL=sonnet PAR=2 ./run.sh …` overrides the runner model / parallelism.

## Reading results

- Assertions live in `metadata/*.json`; prompts live in `fixtures.sh`. Change either, re-run.
- Every artifact survives under the workspace: fixture repos post-run (with full git
  history), `outputs/reply.md`, `outputs/result.json` (the full session event log —
  `tool_use` entries are spawn evidence), per-arm `grading.json`.
- Single run per arm: treat deltas as directional. Re-run for variance.

## Known limits

- Headless `-p` ends when the main agent's turn ends — reviewers spawned in the
  background and not awaited are lost (bit eval-5 in iteration 1). The delta file, not
  the final reply, is the reliable artifact for late-stage evals.
- These are **process evals**: they prove bright-line compliance and durable-record
  quality, not that ddd2 beats a plain session + review habit on outcomes. The outcome
  question needs paired trials on real work — see the note in `evals.json`.

Iteration-1 headline (2026-07-04, Opus 4.8): with_skill 14/23 vs without_skill 9/23.
Triggering was the systemic weakness (ddd2 explicitly loaded in 1 of 5 with_skill runs);
where it fired, it won on durable-record coherence and the ship gate — baseline forged
`state: merged` and its self-review missed 3 real bugs that spawned reviewers caught.
