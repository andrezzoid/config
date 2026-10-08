---
name: setup-factory
description: "Make a repo factory-ready, or wire the cloud side once: writes .agents/factory.md (tracker, gates, autonomy cap, one-way doors), creates the triage labels in Linear or GitHub Issues, checks the run skill, and gives the exact cloud environment and routines to create. Usage: /setup-factory [repo|cloud|check]."
disable-model-invocation: true
---

# Setup factory

Three modes. `repo`, the default, prepares the repository you are in. `cloud`
wires the account once. `check` runs `factory doctor` and explains each line.

Find the facts yourself and put the decisions to the human. Ask in rounds, each
question with your recommended answer, the way the grilling skill does, and
write nothing until they confirm.

## repo

### 1. Explore

- `git remote get-url origin`, the default branch, and its protection
  (`gh api repos/<o>/<r>/branches/<default>/protection`; a 404 means none).
- The merge methods the repo allows: `gh api repos/<o>/<r> --jq
  '{allow_squash_merge, allow_merge_commit, allow_rebase_merge, has_issues}'`.
- The commands CI runs for lint, types and tests, from the CI workflows,
  package.json scripts or Makefile. These become the gates.
- Paths a revert cannot undo: migrations, schema, infrastructure, auth,
  billing, anything that sends email or deletes data. These become the one-way
  doors.
- An existing `CLAUDE.md` or `AGENTS.md`, `.agents/`, the glossary
  (`GLOSSARY.md` or `CONTEXT.md`) and `docs/adr/`.
- A run skill under `.claude/skills/run-*`: the recipe the built-in `/run`
  loads to start the app, recorded by `/run-skill-generator`.
- Where the repo's tickets live, open GitHub issues or a Linear team whose
  issues name this repo, and whether the labels in
  `references/profile-template.md` exist there (`linear label list`, or `gh
  label list --repo <o>/<r>`).

### 2. Decide with the human

Ask in one round, each with your recommendation:

- Which tracker: Linear, and which team, or GitHub Issues on this repo?
  Recommend where the work is already tracked.
- What max autonomy? Recommend `pr` until a run skill exists and has been seen
  working. `merge` lets a ticket labelled `autonomy:merge` merge itself after
  an independent verdict, and `factory pr merge` allows it only while a run
  skill exists on the pull request's base branch. Before agreeing to `merge`, require the
  CI checks in the default branch's protection: the factory mod stops an agent
  drifting onto a raw merge, and only the forge stops a determined one.
- Which gates? Propose what CI runs.
- Which one-way doors, as globs?
- Which merge method, of those the repo allows?

### 3. Write

1. `.agents/factory.md` from `references/profile-template.md`, with every
   example value replaced. Keep the field names and the `## One-way doors`
   heading exactly: the CLI parses them. For GitHub Issues, the tracker line is
   `- **Tracker:** GitHub Issues`, the Issue tracker section's first paragraph
   becomes "Issues live in GitHub Issues on this repo. Use `gh issue`. Blockers
   are issue dependencies, or a `## Blocked by` section listing `#12`. A ticket
   being worked carries the `in-progress` label.", and the labels table gains
   `in-progress`.
2. An `## Agent skills` block in `CLAUDE.md`, or in `AGENTS.md` when that is
   the file the repo uses. Never create the second file when the first exists,
   and update the block in place when it exists:

   ```markdown
   ## Agent skills

   ### Issue tracker
   <Linear team `<KEY>` | GitHub Issues>, PRs on GitHub. See `.agents/factory.md`.

   ### Triage labels
   Matt Pocock's triage roles under their own names, plus `autonomy:merge`. See `.agents/factory.md`.

   ### Domain docs
   <single-context or multi-context>. See `.agents/factory.md`.
   ```
3. Commit on a branch and open a pull request: the profile is repo policy, and
   the team reviews it like code.

### 4. Close the gaps

- Missing labels: offer to create them, with the linear CLI on Linear, or with
  `gh label create <name> --repo <o>/<r> --color <hex>` for each label in the
  profile's table.
- A GitHub Issues repo: tell the human to add it to `FACTORY_GITHUB_REPOS` on
  the cloud environment (see `cloud`), so the hourly dispatch sees its tickets.
- No run skill: tell the human to run `/run-skill-generator` in the repo and
  commit the `.claude/skills/run-<name>/` it records. Agents start the app
  through it with `/run`, and until it exists the repo stays at autonomy `pr`.
  `/verify` is theirs to run by hand: agents cannot start it.
- Run `factory doctor` and show the result.

## cloud

Cloud sessions get the skills from the environment's setup script, never from
the repos. The script clones the config repo and links its skills into
`~/.claude` the way stow does on the Mac, and the factory mod pulls the latest
commit at every session start. Give the human these steps with the values
filled in:

1. **Environment** (claude.ai/code, environment menu, Edit). One environment
   serves every repo, and the Default one works.
   - Setup script:
     `curl -fsSL https://raw.githubusercontent.com/andrezzoid/config/master/scripts/cloud-setup.sh | bash`
   - Environment variables: `FACTORY_GITHUB_REPOS=<owner/a>,<owner/b>`, the
     repos whose tickets live in GitHub Issues. No token: the cloud's GitHub
     proxy authenticates `gh`.
   - The Linear key, one of two ways:
     - On Pro and Max, an API credential, which sessions use without ever
       seeing the key: name `Linear`, allowed websites `api.linear.app`, custom
       header `Authorization` with the prefix cleared and a personal API key as
       the value. Then add the variable `LINEAR_API_KEY=proxy-injected`, which
       tells the CLI to send no key of its own.
     - Otherwise the variable `LINEAR_API_KEY=<personal API key>`, which anyone
       who uses the environment can read, and network access **Custom** with
       `api.linear.app` added to the default list.
2. **Routines**, all in that environment and all with every connector removed,
   since the CLI talks to Linear and GitHub itself. Create them at
   claude.ai/code/routines, or with `/schedule` in the local CLI: a cloud
   session's `create_trigger` tool sets neither a routine's repositories nor a
   GitHub event trigger.

   | Routine | Trigger | Repositories | Prompt |
   |---|---|---|---|
   | Factory dispatch | Schedule, hourly | every repo the factory serves | `/factory --dispatch` |
   | Factory brief | Schedule, weekdays at 08:52, notifications on | any one | `/factory --brief` |
   | Factory babysit | GitHub event: pull request, action `labeled`; filters: labels include `factory`, is draft `false` | that repo | see below |
   | Factory garden | Schedule, weekly, one routine per repo | that repo | `/factory --garden` |

   The babysit prompt: "Babysit the pull request this GitHub event is about:
   `/babysit-pr <its URL>`. If the run names no pull request, list the repo's
   open pull requests labelled `factory` with `gh api
   'repos/<o>/<r>/issues?labels=factory&state=open'` and babysit each one whose
   `factory pr status` is not done." It covers pull requests opened on the Mac:
   label one `factory` and the cloud carries it while the laptop sleeps. A pull
   request opened in a cloud session already wakes that session through
   `subscribe_pr_activity`.

   Neither Linear nor GitHub issue events can start a routine, so dispatch
   polls hourly. A schedule on the hour can start minutes late, so the brief
   runs at 08:52.
3. Start a fresh session in the environment and run `/setup-factory check`. The
   skills, `CLAUDE.md` and the `factory` CLI must all be there.
