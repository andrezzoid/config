---
name: run-backlog
description: Turn approved tickets into running agent sessions. Reads the tracker for tickets the human labelled ready-for-agent, writes a dispatch plan (blockers, branches, which tickets must not run at the same time), and hands over the dispatcher that launches one /implement session per ticket, each in its own worktree, as its blockers merge. Use for /run-backlog after to-tickets, once a backlog is approved and the human wants it worked without picking each ticket by hand.
disable-model-invocation: true
argument-hint: "[parent issue | label | project | .scratch/<feature>/issues]"
---

# Run backlog

You write the plan, a script dispatches it, and every ticket gets its own session. Deciding what blocks what and which tickets would collide is judgment, so it happens here. Launching sessions, remembering what's running and noticing merges is mechanics, so `~/.agents/scripts/backlog` does it the same way every tick and picks up where it left off after a restart. You never write product code and never launch a session yourself.

## 1. Find the approved tickets

The scope comes from the argument. A ticket is in the plan only when the human gave it the go:

- **GitHub:** open issues in scope labelled `ready-for-agent`. `gh issue list --label ready-for-agent --state open --json number,title,body,url`, narrowed with `--search` or `--milestone`.
- **Linear:** `linear issue query --label ready-for-agent --json`, narrowed to the project, team or parent (see the linear-cli skill).
- **Local files:** the directory you were given. Invoking on it is the go for every ticket in it.

to-tickets never applies the label, because the label is the human's word. A ticket without it stays out of the plan however ready it looks. Note each ticket in scope you left out, and why.

## 2. Read each ticket's edges

- **Blockers.** Native relations first: `gh api repos/{owner}/{repo}/issues/{n}/dependencies/blocked_by` on GitHub, `linear issue relation list <id>` on Linear. Then the ticket's "Blocked by" section. A closed blocker drops out. An open blocker that's in the plan goes in `blocked_by`. An open blocker outside the plan goes in `external_blockers`, and its ticket waits until the human resolves it.
- **Autonomy.** The ticket's Autonomy section, read by implement. Missing means `commit`.
- **Ref.** What `/implement` receives: `#12` or the issue URL on GitHub, `ENG-12` on Linear, the file path for a local ticket.
- **Branch.** `<id>-<short-slug>`, lowercase, under 40 characters, like `eng-12-ack-answer`.

## 3. Decide what must not run at the same time

Two sessions editing the same module collide at merge time and waste each other's work. to-tickets should have cut along file boundaries, so check that it did. Read each ticket's "What to build" and the modules it names, and grep the code when the names don't settle it. Tickets that will edit the same module share a `serial` value named after that module. The dispatcher never runs two tickets from one group at once.

Never merge, split or rewrite tickets: the human approved them as they are. When several tickets look like the same underlying problem, say so in your reply instead.

## 4. Write and check the plan

Write `.factory/backlog/plan.json` at the repo root, with `.factory/` ignored by git:

```json
{"tickets": [
  {"id": "ENG-12", "title": "App: acknowledge the answer from the chat surface", "ref": "ENG-12",
   "branch": "eng-12-ack-answer", "blocked_by": ["ENG-11"], "external_blockers": [],
   "autonomy": "pr", "serial": "chat-surface"}
]}
```

Order the tickets blockers first. Add `"done": true` for a ticket finished outside the runner. Run `~/.agents/scripts/backlog check` and fix every problem it names; a plan it rejects is not a plan. Then `backlog run --dry-run` shows the first wave.

Running `/run-backlog` again on the same scope rewrites `plan.json`, for example after the human labels more tickets. The ledger beside it remembers what's running, so nothing launches twice.

## 5. Hand over

The dispatcher can't run from inside this session: it opens zellij tabs, and it's a loop that outlives the session. Reply with:

- **The first wave**, what each waiting ticket waits on, and the serial groups.
- **Tickets at `commit`.** Their sessions stop at local commits and never open a PR, so the dispatcher never sees them merge and anything they block waits on the human.
- **Tickets left out**, and why.
- **The command**, run from a zellij pane at the repo root:

  ```
  ~/.agents/scripts/backlog run
  ```

- **What the human does while it runs:**
  - Every ticket is an ordinary `lfg` tab running `/implement`, visible in herdr, and it can be answered like any session.
  - A `pr` ticket ends merge-ready. Merging stays the human's call, and each merge unlocks the next wave on the dispatcher's next tick (five minutes by default).
  - `backlog status` shows every ticket's state and each open PR's `pr-state` verdict, so the `READY` ones are the PRs waiting on a merge.
  - A session that gives up gets `backlog mark <id> stopped`, which keeps the tickets it blocks waiting. `backlog mark <id> reset` relaunches it after a fix.
  - Ctrl-C stops the dispatcher at any time, and `backlog run` resumes.
