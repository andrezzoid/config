---
name: factory
description: "Move a ticket through the factory, or run one of its routines. Usage: /factory [<ticket> [--take-over] | --brief | --dispatch | --garden] [--repo owner/name] [--max N]."
disable-model-invocation: true
---

# Factory

Route work and report on it. The skills you call write the code.

The deterministic half lives in the `factory` CLI. Use its answers rather than
re-deriving them, and `factory --help` lists its commands. Every mode starts
with `factory doctor`. If a line reads `fail`, report it and stop.

## <ticket>: move one ticket on

`factory ticket show <ID> --json` gives the ticket's `phase`, worked out from
its labels, its state and its open pull requests:

| Phase | Means | Do |
|---|---|---|
| shape | not labelled `ready-for-agent`, or labelled `ready-for-human` | stop |
| iterate | ready for an agent, no open pull request | call the Skill tool with "implement", passing the id |
| babysit | a pull request for it is open | call the Skill tool with "babysit-pr", passing the pull request |
| done | merged or closed | stop |

1. Read the phase and run its skill. With `--take-over`, tell `implement` that
   the human asked to take the ticket over from the session that claimed it.
2. When the skill returns, read the phase again. While it changes, go on with
   the new phase. When it stays the same, the ticket waits on a reviewer, CI or
   the human, and the skill's brief says which.
3. End with one line: the ticket, its phase, and what it waits on. For shape,
   say what would move it: `/triage <ID>` for a new ticket, answers for
   `needs-info`, a decision for `ready-for-human`.

## No argument: what needs you

Run `factory brief --json` and write only what needs the human, one line each
with what is needed: its `needsHuman` and `stalled` tickets, and its
`needsHumanPrs`. With none, say "nothing needs you".

## --brief

The standing brief covers the whole portfolio and asks for nothing. Run
`factory brief --json` and write at most fifteen lines, in this order:

1. Needs you, as above.
2. Running: one line per ticket with its pull request's state.
3. Queued: how many are ready, and the top reason the rest wait.
4. Landed this week: the count, and anything worth sampling.

Name tickets by id and title. When a routine runs the brief, its final message
is the notification, so the first line says whether anything needs the human.

## --dispatch

Start one session per ready ticket. Each session claims its ticket as its first
write, so dispatch keeps no state. A session that dies before claiming leaves
its ticket queued for the next run, and one that dies after claiming shows in
the brief as stalled.

1. Run `factory tickets next --json`, with `--repo` when given, or `--here` when
   dispatching locally. With nothing ready, say so in one line and stop.
2. Take the first N in order, three by default. `to-tickets` cuts tickets meant
   to run at once along the files they touch, so trust the order.
3. Launch each one:
   - In the cloud, with the `create_session` tool: a session on
     `https://github.com/<repo>` titled `<ID> <title>`, with the prompt
     `/factory <ID>`.
   - Locally, from the repo's clone: `claude --bg -n <ID> -w <slug>
     --permission-mode auto "/factory <ID>"`, so each ticket gets its own
     worktree. `<slug>` is the id lowercased, with every character outside
     `a-z0-9` turned into `-` (`eng-123`, `o-r-12`). Inside herdr
     (`HERDR_ENV=1`), give it a workspace of its own instead, so it shows in
     herdr's agent panel: `herdr workspace create --cwd <clone> --label <ID>
     --no-focus` prints the root pane as `.result.root_pane.pane_id`, then
     `herdr agent start <slug> --kind claude --pane <pane> -- -w <slug>
     --permission-mode auto "/factory <ID>"`.
   - With neither, list the tickets and the exact commands, and stop.
4. Report one line per launched ticket with its session link or name, and how
   many tickets wait and why.

The dispatching session only dispatches: a coordinator that starts coding loses
sight of the queue.

## --garden

Find the mistakes agents keep repeating in one repo, and buffer them instead of
fixing them, because the buffer shows which ten findings are one problem before
anyone spends a pull request on each.

1. Read the repo's last two weeks: merged pull requests and their review
   threads (`gh api repos/<o>/<r>/pulls?state=closed`), reverts (`git log
   --grep=Revert`), hand-back briefs on its tickets, and comments added to
   explain a workaround.
2. Group what you find into classes. A class counts once it happened twice,
   each occurrence with a link or `file:line`.
3. Append one comment to the repo's garden log, an issue titled `Garden log:
   <repo>` in the tracker `.agents/factory.md` names, created in triage when it
   does not exist. Per class: what agents do, the evidence, and the most
   enforceable place to stop it, in this order: architecture that makes it
   impossible, types or a lint whose error names the fix, a test, and last a
   skill or doc line.
4. Reply with the number of classes and the log's link. The human picks
   classes and runs `/correct` on them.
