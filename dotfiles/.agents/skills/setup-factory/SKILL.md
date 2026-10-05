---
name: setup-factory
description: "Make a repo factory-ready, or wire the cloud side once: writes .agents/factory.md (tracker, gates, autonomy cap, one-way doors), creates the triage labels in Linear or GitHub Issues, checks the verification skill, and gives the exact cloud environment and routines to create. Usage: /setup-factory [repo|cloud|check]."
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
  allow_merge_commit, allow_rebase_merge, has_issues}'`.
- The commands CI runs for lint, types and tests: CI workflows, package.json
  scripts, Makefile. These become the gates.
- Paths a revert cannot undo: migrations, schema, infrastructure, auth, billing,
  anything that sends email or deletes data.
- Existing `CLAUDE.md` or `AGENTS.md`, `.agents/`, the glossary (`GLOSSARY.md`
  or `CONTEXT.md`) and `docs/adr/`.
- A verification skill under `.claude/skills/verify-*` or `.cursor/skills/verify-*`.
- Where the repo's tickets live: open issues on GitHub, or a Linear team whose
  issues name this repo. Then whether the labels below exist there
  (`linear label list`, or `gh label list --repo <o>/<r>`).

### 2. Decide with André

Ask in one round, each with your recommendation:

- **Tracker.** Linear (which team) or GitHub Issues on this repo. Recommend
  where the work is already tracked.
- **Max autonomy.** Recommend `pr` until a verification skill exists and has
  been seen working. `merge` lets tickets labelled `autonomy:merge` merge
  themselves after an independent verdict. Before agreeing to `merge`, require
  the CI checks in the default branch's protection: the factory mod stops
  drift, the forge is what stops a determined bypass.
- **Gates**, from what CI runs.
- **One-way doors**, as globs.
- **Merge method**, from what the repo allows.

### 3. Write

1. `.agents/factory.md` from `references/profile-template.md`, with every
   example value replaced. Keep the field names and the `## One-way doors`
   heading exactly: the CLI parses them. For GitHub Issues, the tracker line is
   `- **Tracker:** GitHub Issues`, and the Issue tracker section's first
   paragraph becomes: "Issues live in GitHub Issues on this repo. Use `gh
   issue`. Blockers are issue dependencies, or a `## Blocked by` section
   listing `#12`. A ticket being worked carries the `in-progress` label." Add
   `in-progress` to the labels table.
2. An `## Agent skills` block in `CLAUDE.md`, or in `AGENTS.md` when that is the
   one the repo uses; never create the second when the first exists. Update the
   block in place when it exists:

   ```markdown
   ## Agent skills

   ### Issue tracker
   <Linear team `<KEY>` | GitHub Issues>, PRs on GitHub. See `.agents/factory.md`.

   ### Triage labels
   `ready-for-agent`, `ready-for-human`, `autonomy:merge`. See `.agents/factory.md`.

   ### Domain docs
   <single-context or multi-context>. See `.agents/factory.md`.
   ```
3. Commit on a branch and open a PR: the profile is repo policy and the team
   reviews it like code.

### 4. Close the gaps

- Missing labels: offer to create them. Linear: with the linear CLI.
  GitHub: `gh label create <name> --repo <o>/<r> --color <hex>` for
  `ready-for-agent`, `ready-for-human`, `autonomy:merge` and `in-progress`.
- A GitHub Issues repo: tell André to add it to `FACTORY_GITHUB_REPOS` on the
  cloud environment (see `cloud`), so the hourly dispatch sees its tickets.
- No verification skill: tell André to run `/create-verification-skill` and to
  have it write `.claude/skills/verify-<app>/` instead of `.cursor/skills/`,
  because Claude Code loads `.claude/skills`. Until one exists, the repo stays
  at autonomy `pr`.
- Run `factory doctor` and show the result.

## cloud

The skills reach cloud sessions through the environment's setup script, never
by committing them to each repo. The script clones André's config repo and
links its skills into `~/.claude` the way stow does on the Mac; the factory mod
pulls the latest commit at every session start. Give André these steps, with
the values filled in. Routines cannot be created from inside a cloud session:
he creates them at claude.ai/code/routines, or with `/schedule` in the local
CLI.

1. **Environment** (claude.ai/code, environment menu, Edit). One environment
   serves every repo; the Default one works.
   - **Setup script:**
     `curl -fsSL https://raw.githubusercontent.com/andrezzoid/config/master/scripts/cloud-setup.sh | bash`
   - **Environment variables:** `FACTORY_GITHUB_REPOS=<owner/a>,<owner/b>`,
     the repos whose tickets live in GitHub Issues. No token: the cloud's
     GitHub proxy authenticates `gh`.
   - **Linear key**, one of two ways:
     - On Pro and Max, an **API credential**, which sessions use without ever
       seeing the key: name `Linear`, allowed websites `api.linear.app`, custom
       header `Authorization` with the prefix cleared and a personal API key
       as the value. Then add the variable `LINEAR_API_KEY=proxy-injected`,
       which tells the CLI to send no key of its own.
     - Otherwise the variable `LINEAR_API_KEY=<personal API key>`, readable by
       anyone who uses the environment, and network access **Custom** with
       `api.linear.app` and the default list.
2. **Routines**, all in that environment, all with every connector removed
   (the CLI talks to Linear and GitHub itself):

   | Routine | Trigger | Repositories | Prompt |
   |---|---|---|---|
   | Factory dispatch | Schedule, hourly | every repo the factory serves | `/factory dispatch` |
   | Factory brief | Schedule, weekdays at 08:52, notifications on | any one | `/factory brief` |
   | Factory babysit | GitHub event: pull request, action `labeled`; filters: labels include `factory`, is draft `false` | that repo | see below |
   | Factory garden | Schedule, weekly, one routine per repo | that repo | `/factory garden` |

   The babysit prompt: "Babysit the pull request this GitHub event is about:
   `/babysit-pr <its URL>`. If the run names no pull request, list the repo's
   open pull requests labelled `factory` with `gh api
   'repos/<o>/<r>/issues?labels=factory&state=open'` and babysit each one whose
   `factory pr status` is not done." It exists for PRs opened on the Mac: label
   one `factory` and the cloud carries it while the laptop sleeps. PRs opened
   in a cloud session already wake that session through
   `subscribe_pr_activity`.

   Neither Linear nor GitHub issue events can start a routine, so dispatch
   polls hourly. A scheduled time on the hour can start minutes late, which is
   why the brief runs at 08:52.
3. Start a fresh session in the environment and run `/setup-factory check`. The
   skills, `CLAUDE.md` and the `factory` CLI must all be present.
