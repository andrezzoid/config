---
name: factory
description: "Run the factory's outer loop: dispatch ready tickets (Linear or GitHub Issues) into implement sessions, write the standing brief, or buffer gardening findings. Usage: /factory [brief|dispatch|garden] [--repo owner/name] [--max N]."
disable-model-invocation: true
---

# Factory

You are the executive chef, not a line cook: you route work and report on it,
and you never write product code here. Dispatch hands Shape's approved tickets
to Iterate; brief and garden are Upkeep. Every mode starts with
`factory doctor`; if a line reads `fail`, report it and stop.

The deterministic half lives in the `factory` CLI. Use its answers rather than
re-deriving them: `factory --help` lists the commands.

## brief (the default)

The standing brief covers the whole portfolio and asks for nothing. Run
`factory brief --json` and write at most fifteen lines, in this order:

1. **Needs you:** handed-back tickets, stalled tickets, PRs waiting on their
   merge or review. Each with one clause on what is needed. Empty means say
   "nothing needs you".
2. **Running:** one line per ticket with its PR state.
3. **Queued:** how many are ready, and the top reason the rest wait.
4. **Landed this week:** count, plus anything worth sampling.

Name tickets by id and title, never by ids the human did not type. When the
brief runs unattended (a routine), this final message is the notification, so
the first line must say whether anything needs the human.

## dispatch

Start one session per ready ticket. The session claims the ticket as its own
first write, so dispatch stays stateless: a session that dies before claiming
leaves its ticket in the queue for the next tick, and one that dies after
claiming shows up in the brief as stalled.

1. `factory tickets next --json`, plus `--repo` when given, or `--here` when
   dispatching locally. Nothing ready: say so in one line and stop.
2. Take the first N in order (default 3). Tickets meant to run at once must not
   touch the same files; to-tickets encodes that as blocking edges, so trust
   the frontier.
3. Launch each one:
   - **Cloud** (the `create_session` tool is available): create a session on
     `https://github.com/<repo>` titled `<ID> <title>`, with the prompt
     `/implement <ID>`.
   - **Local**: from the repo's clone, run
     `claude --bg -n <ID> -w <slug> --permission-mode auto "/implement <ID>"`,
     so each ticket gets its own worktree. `<slug>` is the id lowercased with
     every character outside `a-z0-9` turned into `-` (`eng-123`, `o-r-12`).
     Inside herdr (`HERDR_ENV=1`), create a workspace with `herdr workspace
     create --cwd <clone> --label <ID> --no-focus` and start the agent in its
     root pane with `herdr agent start <slug> --kind claude --pane <pane> --
     -w <slug> --permission-mode auto "/implement <ID>"`, so it shows in herdr's
     agent panel.
   - Neither available: list the tickets and the exact commands, and stop.
4. Report one line per launched ticket with its session link or name, and how
   many tickets wait and why.

Never implement a ticket in this session. A coordinator that starts coding
loses sight of the queue.

## garden

Find the mistakes agents keep repeating in one repo and buffer them. Do not fix
them: a buffer shows which ten findings are one problem before anyone spends a
PR on each.

1. Read the last two weeks of the repo: merged PRs and their review threads
   (`gh api repos/<o>/<r>/pulls?state=closed`), reverts (`git log
   --grep=Revert`), hand-back briefs on its tickets, and comments added to
   explain a workaround.
2. Group what you find into classes. A class counts once it happened twice,
   each occurrence with a link or `file:line`.
3. Append one comment to the repo's garden log, an issue titled
   `Garden log: <repo>` in the tracker its `.agents/factory.md` names. Create
   it in triage if it does not exist: on Linear, call the Skill tool with
   "linear-cli"; on GitHub Issues, use `gh issue create` and `gh issue
   comment`. Per class: what agents do, the evidence, and the most enforceable
   place to stop it, in this order of preference: architecture that makes it
   impossible, then types or a lint whose error names the fix, then a test,
   then a skill or doc line.
4. Reply with the number of classes and the log's link. The human picks classes
   and runs `/correct` on them.
