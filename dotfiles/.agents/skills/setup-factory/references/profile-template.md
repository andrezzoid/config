# Factory profile

How agents work in this repo. The factory skills read it, and the `factory`
CLI reads the fields that route tickets and gate a merge from the base branch,
so a pull request cannot raise its own autonomy. Written by `/setup-factory`.

- **Tracker:** Linear team `ENG`
- **Max autonomy:** `pr`
- **Merge method:** `squash`
- **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`
- **Verify skill:** `.claude/skills/verify-app`

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

## Triage labels

| Role | Label |
|---|---|
| Ready for an agent to pick up | `ready-for-agent` |
| Handed back, needs André | `ready-for-human` |
| May merge itself once verified | `autonomy:merge` |

## Domain docs

Single context: `GLOSSARY.md` and `docs/adr/` at the root.
