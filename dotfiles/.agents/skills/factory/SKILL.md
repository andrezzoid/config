---
name: factory
description: "Dispatch ready tickets, merge what you pick, brief you and triage, or take one ticket through its phases. Usage: /factory [<ticket> [--take-over] | setup [cloud] | stats]."
argument-hint: "[<ticket> [--take-over] | setup [cloud] | stats]"
disable-model-invocation: true
---

# Factory

Take tickets from approved to merged. The `factory` CLI exposes the facts and
holds the gates, and `factory --help` lists its commands; the skills you call
do the work. Start every run but setup with `factory doctor`, and on a line
that reads `fail`, report it and stop.

## No argument: the hourly run

This run dispatches, merges and asks. The sessions it starts write the code.

### 1. Dispatch

`factory inbox --agent --json` lists what an agent can pick up, claimed work
first. Start a session for each of the first three:

- In the cloud, with the `create_session` tool: a session on
  `https://github.com/<repo>`, from the item's `repo`, titled `<ID> <title>`,
  with the prompt `/factory <ID>`, or `/factory <ID> --take-over` for a pull
  request whose session went quiet.
- Locally, `factory tickets next --dispatch --max 3` in the repo's clone starts
  a background session per ready ticket. Give André the `/factory <ID>
  --take-over` line for each quiet pull request.

Done when each of the three has a session, or a line saying why not.

### 2. Brief André

Write one message, then end the turn, so the routine's notification carries it.
Its first line says whether anything needs him. Then, in this order:

1. The pull requests ready to merge, asking which to merge.
2. Everything else in `factory inbox --human`, one line each with its link and
   the session behind it.
3. The first round of questions on the new tickets, and on `needs-info` tickets
   whose reporter replied since triage asked (`factory tickets show <ID>
   --json` lists the comments). Triage each one by following
   [the triage skill](../triage/SKILL.md) from "Triage a specific issue or PR",
   and ask its questions the way the grilling skill does.

### 3. Act on his answers

Merge each pull request André picked with `factory pr merge <PR>`. Apply the
triage outcomes, and grill on, calling the Skill tool with "grilling", until
every new ticket has a state. Done when the frontier is empty.

## <ticket>: take one ticket through its phases

With `--take-over`, first run `factory tickets claim <ID> --take-over`, so the
claim names this session. Then `factory tickets show <ID> --json` gives the
ticket's `phase`:

| Phase | Labels | Do |
|---|---|---|
| shape | none, `needs-triage`, `needs-info` or `ready-for-human` | say what would move it, and stop |
| iterate | `ready-for-agent`, and no open pull request | call the Skill tool with "implement" for the ticket |
| babysit | an open pull request | call the Skill tool with "babysit-pr" with the pull request |
| done | closed | stop |

When a skill returns, read the phase again and go on while it changes. When
André agrees a change to the contract in this session, the ticket is back in
the Shape phase: post the change as a `Revised ·` report with `factory tickets
revise <ID> --body-file <report>`, following `references/report.md`, then go
on. Done when the phase stops changing. End with one line: the ticket, its
phase and what it waits on.

## setup

Make a repo ready, or with `cloud`, wire the cloud side once: follow
`references/setup.md`.

## stats

The weekly review: follow `references/stats.md`.
