# Factory profile

How agents work in this repo. The factory skills read it, and the `factory`
CLI reads the fields that route tickets and gate a merge from the base branch,
so a pull request cannot raise its own autonomy. Written by `/setup-factory`.

- **Tracker:** Linear team `ENG`
- **Max autonomy:** `pr`
- **Merge method:** `squash`
- **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`

## One-way doors

A revert cannot undo a change here, so it never merges without André.

- `db/migrations/**`: schema changes
- `infra/**`: production infrastructure

## Issue tracker

Issues live in Linear, team `ENG`; code and pull requests live on GitHub. Use
the `linear` CLI (skill `linear-cli`). Every ticket body starts with
`Repo: <owner/name>`. Blockers are Linear "blocked by" relations.

`factory ticket show <ID>` gives the branch to work on and the `Closes` line
the PR body ends with, so the tracker links the PR and closes the ticket on
merge.

**PRs as a request surface: yes.** `/triage` also lists open PRs from people
outside the repo (GitHub author association `CONTRIBUTOR`,
`FIRST_TIME_CONTRIBUTOR` or `NONE`) and triages them like issues, with `gh pr
view`, `gh pr diff` and `gh pr edit`. A PR named explicitly is triaged whoever
wrote it.

## Triage labels

Matt Pocock's `triage` roles under their own names, plus the factory's.

| Role | Label |
|---|---|
| Something is broken | `bug` |
| New feature or improvement | `enhancement` |
| Needs André to evaluate it | `needs-triage` |
| Waiting on the reporter for more information | `needs-info` |
| Fully specified, ready for an agent | `ready-for-agent` |
| Needs André: to build it, or handed back by the factory | `ready-for-human` |
| Will not be actioned | `wontfix` |
| May merge itself once verified | `autonomy:merge` |

## Domain docs

Single context: `GLOSSARY.md` and `docs/adr/` at the root.
