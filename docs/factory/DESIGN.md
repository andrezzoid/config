# Factory design

The factory turns an approved Linear ticket into a merged PR with nobody
watching, and stops at the exact point where only André can move it. It
replaces ddd2, whose 33-session assessment is in [NOTES-2026-09.md](NOTES-2026-09.md),
and it rests on the insights in [INSIGHTS.md](INSIGHTS.md).

## What changed from the September notes

The notes' four stages (Shape, Iterate, Babysit, Upkeep) and their artifacts
stand: the ticket body is agreed state, comments are the event log, working
notes are disposable, briefs come in two kinds. Five things are new.

1. **Trust is granted per ticket and per repo, and enforced in code.** The notes
   said autonomy is set per ticket. Now it is a label (`autonomy:merge`), the
   repo caps it in `docs/agents/factory.md`, and the `factory` CLI is the only
   merge path. A hook blocks every other one.
2. **Verification is the trust lever.** A green test run is a gate. A PR may
   merge itself only with live proof from the repo's verification skill and an
   independent verdict recorded for its head SHA. A repo without a verification
   skill stays at autonomy `pr`.
3. **The deterministic half is a CLI.** Readiness, claims, PR state, verdicts,
   the merge gate and the brief's data come from `factory`, tested and identical
   on the Mac and in the cloud. Skills keep only judgment.
4. **The outer loop runs on events.** Routines dispatch, report and garden;
   PR events wake the session that owns the PR. No agent polls in its own
   context.
5. **The harness travels without touching any repo.** One installer links the
   skills into `~/.claude` on the Mac and in every cloud session. Repos carry
   only their own profile and, when they have one, their verification skill.

## Where each decision lives

| Decision | Owner | Mechanism |
|---|---|---|
| What to build | André | grilling, to-spec, to-tickets, his approval |
| Whether to start | André | `ready-for-agent` label |
| Whether it may merge itself | André, then the repo | `autonomy:merge` label, capped by the profile |
| Which ticket is next | CLI | `factory tickets next`: label, state, blockers, not a parent, has a repo |
| Who works it | CLI | `factory ticket claim`: first write wins, the loser withdraws |
| Whether it works | agent, then fresh agents | gates, live proof, poke-holes, `factory pr verdict` |
| Whether GitHub would merge it | CLI | `factory pr status`: conflicts → threads → CI → reviews |
| Whether it merges | CLI | `factory pr merge`: the gate in the README |
| What André must look at | CLI + agent | `factory brief`, then `/factory brief` writes it up |

## Events

| Event | Cloud | Mac |
|---|---|---|
| Ticket queued | hourly `factory dispatch` routine | `/factory dispatch --here` |
| PR activity on a cloud PR | `subscribe_pr_activity` wakes the owner | n/a |
| PR activity on a local PR | GitHub-event routine on label `factory` | Monitor on `factory pr watch` |
| Morning | `factory brief` routine, push notification | `/factory` |
| Weekly | `factory garden` routine per repo | `/factory garden` |

Linear has no routine trigger, so dispatch polls hourly. If an hour is too slow,
the upgrade is a small relay that turns Linear's webhook into a routine API call
(`POST /v1/claude_code/routines/<id>/fire`); it is not built because nothing yet
says an hour is too slow.

## Bright lines

Mechanize the bright lines, never the judgment (from the ddd-hooks note).

- No merge outside `factory pr merge`. The PreToolUse hook enforces that against
  drift, not against intent: an agent set on it can still script the API. The
  wall is the forge's branch protection, so a repo whose profile allows `merge`
  should require its CI checks there.
- A verdict counts only when the identity running the factory wrote it, as the
  last line of its comment, for the SHA the reviewers checked or a byte-identical
  patch. `git patch-id` is not used: it ignores whitespace, and whitespace is
  code in Python and YAML.
- Without a known identity, no verdict counts.
- The repo profile is read from the base branch, so a branch cannot raise its
  own autonomy.
- Review threads that cannot be read block a merge, and so does a file list
  GitHub truncated.
- A ticket that is a parent of open tickets is never dispatched: it is a spec.

## Known gaps

- The cloud review-thread route (`ccr/review_threads`) returned an empty list in
  every probe, so its non-empty shape is a guess. The parser accepts the likely
  field names and returns "unreadable" otherwise, which blocks merges rather
  than guessing.
- The merge guard reads shell text, not intent. Two independent reviews found
  fourteen ways around earlier versions; all are now tests. What it still
  cannot see: a merge from a script file, a heredoc, or a language other than
  shell. A claim older than fifteen minutes loses a race to a newer one, so two
  sessions can only both hold a ticket if the first stalled that long.
- Whether a routine's prompt receives the GitHub event's PR is not documented;
  the babysit routine assumes it does.
- Whether routine sessions can call `create_session` is not documented. When
  they cannot, `/factory dispatch` lists the commands instead of launching.
- `claude --bg -n <ID> -w <id>` ran in a Linux container and did its work in
  its own worktree, but only after the workspace was trusted: run `claude` once
  interactively in each repo before dispatching locally. The herdr branch of
  `lfg` and `/factory dispatch` has run only against a fake `herdr`.
- The Linear queries are validated against Linear's published schema and a mock
  server, never against a live workspace. The first `factory doctor` with a real
  `LINEAR_API_KEY` is the first live call.
