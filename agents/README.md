# Agent harness

Everything an agent loads, installed the same way on the Mac and in Claude Code
cloud sessions: global instructions, skills, subagents, two hooks, and the
`factory` CLI that runs the ticket → PR → merge loop.

```text
agents/
├── AGENTS.md          global instructions → ~/.claude/CLAUDE.md
├── skills/            my skills → ~/.claude/skills/<name> (symlinks)
├── skills.txt         third-party skills, pinned, installed with `npx skills add`
├── subagents/         Claude and opencode subagents
├── hooks/             merge guard (everywhere), harness refresh (cloud)
├── factory/           the factory CLI, its tests, and the design docs
├── install.sh         idempotent installer, local and cloud
└── cloud-setup.sh     one-liner for a cloud environment's setup script
```

## The factory

| Stage | Who | How |
|---|---|---|
| Shape | André + agent | `/grill-with-docs` → `/to-spec` → `/poke-holes` → `/to-tickets` |
| Queue | André | label a ticket `ready-for-agent`; add `autonomy:merge` to let it merge itself |
| Dispatch | routine or André | `/factory dispatch`: one `implement` session per ready ticket |
| Build | agent | `implement`: claim, test-first, gates, live proof, independent verdict, PR |
| Babysit | agent | `babysit-pr`: conflicts → threads → CI, sleeps on events, merge gate |
| Report | routine | `/factory brief`: what needs André, what runs, what landed |
| Garden | routine + André | `/factory garden` buffers repeated mistakes; André runs `/correct` |

Only two words belong to André: the labels that queue a ticket, and "merge" for
anything the gate refuses. Everything else runs unattended. See
[factory/DESIGN.md](factory/DESIGN.md) for why it is shaped this way and
[factory/INSIGHTS.md](factory/INSIGHTS.md) for the sources.

### The merge gate

`factory pr merge` is the only way a PR merges; a PreToolUse hook blocks
`gh pr merge`, the merge API and the GitHub MCP merge tools. It merges when the
forge says READY, the review threads are readable, and either André said
"merge" (`--human-approved`), or all of these hold:

- the ticket carries `autonomy:merge`;
- the repo profile's `Max autonomy` is `merge`, read from the base branch;
- an independent passing verdict exists for the head SHA, or for the same
  `git patch-id` after a rebase;
- the diff touches no one-way door from the profile.

## Install

**Mac.** `setup.sh` runs `agents/install.sh`. After pulling this repo, run
`stow -R dotfiles -t ~` and `agents/install.sh`. The installer replaces the old
stow-folded `~/.agents` and `~/.claude/skills` links with real directories and
removes links to skills this repo no longer ships.

**Cloud.** Once per environment, run `/setup-factory cloud`, or by hand:

1. Setup script: `curl -fsSL https://raw.githubusercontent.com/andrezzoid/config/master/agents/cloud-setup.sh | bash`
2. Environment variable `LINEAR_API_KEY`.
3. The routines listed by `/setup-factory cloud`.

A SessionStart hook pulls this repo in every new cloud session, so skills stay
current although the setup snapshot is cached for about a week.

**Each repo.** Run `/setup-factory` inside it. It writes `docs/agents/factory.md`
(tracker, gates, autonomy cap, one-way doors) in a PR, and points at
`/create-verification-skill` when the repo has no way to run and observe itself.

## Day to day

- `/factory` prints the brief. `factory brief`, `factory tickets next` and
  `factory pr status` give the same facts in a terminal.
- `lfg <name> [prompt]` starts Claude on its own worktree, in a herdr workspace
  when inside herdr. Background sessions only start in a workspace Claude
  already trusts, so run `claude` once in a new repo first.
- `factory doctor` says what is missing: GitHub, Linear, skills, the repo
  profile, the verification skill.

## Third-party skills

`skills.txt` pins each source to a commit, because an upstream rename broke the
vocabulary once already (Matt Pocock's `CONTEXT.md` → `GLOSSARY.md`).
`agents/install.sh --bump` moves every pin to its source's HEAD; review the diff,
then rerun the installer.

## Tests

```bash
cd agents && bun test
```

They cover the merge-readiness policy, the merge gate, ticket readiness, the
profile parser against the template `/setup-factory` writes, the CLI end to end
against a fake `gh` and a mock Linear, the installer against throwaway homes
(including the old stow layout), and the merge guard hook.
