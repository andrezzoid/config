---
name: setup-factory
description: "Make a repo factory-ready, or wire the cloud side once: writes docs/agents/factory.md (tracker, gates, autonomy cap, one-way doors), checks the Linear labels and the verification skill, and lists the cloud environment and routines to create. Usage: /setup-factory [repo|cloud|check]."
disable-model-invocation: true
---

# Setup factory

Two jobs. `repo` (the default) prepares the repository you are in. `cloud` wires
the account once. `check` runs `factory doctor` and explains each line.

Find facts yourself, put decisions to André. Ask in rounds with your recommended
answer, the way the grilling skill does, and write nothing until he confirms.

## repo

### 1. Explore

- `git remote get-url origin`, the default branch, and branch protection
  (`gh api repos/<o>/<r>/branches/<default>/protection`; a 404 means none).
- Allowed merge methods: `gh api repos/<o>/<r> --jq '{allow_squash_merge,
  allow_merge_commit, allow_rebase_merge}'`.
- The commands CI runs for lint, types and tests: CI workflows, package.json
  scripts, Makefile. These become the gates.
- Paths a revert cannot undo: migrations, schema, infrastructure, auth, billing,
  anything that sends email or deletes data.
- Existing `CLAUDE.md` or `AGENTS.md`, `docs/agents/`, the glossary
  (`GLOSSARY.md` or `CONTEXT.md`) and `docs/adr/`.
- A verification skill under `.claude/skills/verify-*` or `.cursor/skills/verify-*`.
- The Linear team, and whether the labels `ready-for-agent`, `ready-for-human`
  and `autonomy:merge` exist (`linear label list`).

### 2. Decide with André

Ask in one round, each with your recommendation:

- **Max autonomy.** Recommend `pr` until a verification skill exists and has
  been seen working. `merge` lets tickets labelled `autonomy:merge` merge
  themselves after an independent verdict. Before agreeing to `merge`, require
  the CI checks in the default branch's protection: the merge guard hook stops
  drift, the forge is what stops a determined bypass.
- **Gates**, from what CI runs.
- **One-way doors**, as globs.
- **Merge method**, from what the repo allows.

### 3. Write

1. `docs/agents/factory.md` from `references/profile-template.md`, with every
   example value replaced. Keep the field names and the `## One-way doors`
   heading exactly: the CLI parses them.
2. An `## Agent skills` block in `CLAUDE.md`, or in `AGENTS.md` when that is the
   one the repo uses; never create the second when the first exists. Update the
   block in place when it exists:

   ```markdown
   ## Agent skills

   ### Issue tracker
   Linear team `<KEY>`, PRs on GitHub. See `docs/agents/factory.md`.

   ### Triage labels
   `ready-for-agent`, `ready-for-human`, `autonomy:merge`. See `docs/agents/factory.md`.

   ### Domain docs
   <single-context or multi-context>. See `docs/agents/factory.md`.
   ```
3. Commit on a branch and open a PR: the profile is repo policy and the team
   reviews it like code.

### 4. Close the gaps

- Missing Linear labels: offer to create them with the linear CLI.
- No verification skill: tell André to run `/create-verification-skill` and to
  have it write `.claude/skills/verify-<app>/` instead of `.cursor/skills/`,
  because Claude Code loads `.claude/skills`. Until one exists, the repo stays
  at autonomy `pr`.
- Run `factory doctor` and show the result.

## cloud

The skills reach cloud sessions through the environment, never by committing
them to each repo. Give André these steps, with the values filled in:

1. **Environment** (claude.ai/code, environment menu, Edit):
   - Setup script:
     `curl -fsSL https://raw.githubusercontent.com/andrezzoid/config/master/agents/cloud-setup.sh | bash`
   - Environment variable `LINEAR_API_KEY`: a Linear personal API key.
   - Network: when the policy is not open, allow `api.linear.app`,
     `registry.npmjs.org`, `raw.githubusercontent.com` and `github.com`.
2. **Routines**, all in that environment:

   | Routine | Trigger | Prompt |
   |---|---|---|
   | Factory dispatch | hourly, weekdays | `/factory dispatch` |
   | Factory brief | weekdays 08:52, push notification | `/factory brief` |
   | Factory babysit | GitHub: pull request opened or ready for review, label `factory` | `/babysit-pr` with the event's PR |
   | Factory garden | weekly, one per repo, that repo attached | `/factory garden` |

   The babysit routine exists for PRs opened from the Mac: label one `factory`
   and the cloud keeps babysitting it while the laptop sleeps. PRs opened in a
   cloud session already wake that session through `subscribe_pr_activity`.
   When the `create_trigger` tool is available, offer to create the scheduled
   routines yourself; GitHub-event routines are created in the web UI.
3. Start a fresh session in the environment and run `/setup-factory check`. The
   skills, `CLAUDE.md` and the `factory` CLI must all be present.
