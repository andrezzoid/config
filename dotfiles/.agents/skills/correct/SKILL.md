---
name: correct
description: Find the mistakes agents keep repeating, from your past sessions, reverts and review comments, and make each one impossible to repeat. Fixes each class at the highest level that holds (architecture, types, a lint whose error names the fix, a test, agent docs last) and proves every new check fails on a real past instance. Use for /correct, after correcting an agent for something it has done before, or when sampling agent-landed work turns up the same slip twice.
disable-model-invocation: true
argument-hint: "[repo | harness] [days]"
---

# Correct

Every correction you type is a lesson the environment failed to teach. A written rule needs the agent to notice it, remember it and comply. A check fails without anyone's cooperation, at the moment the mistake happens. So the job is to change the repo, or the harness, so the next agent can't make the mistake, and to prove it can't.

Design for the contributor you actually have: an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. A change that looks right from one file has to be right for the whole repo.

## 1. Lock the scope

- **Target.** `repo` (default): the project in the current directory, where fixes are code, types, lints and tests. `harness`: your agent setup (skills, AGENTS.md, settings and hooks in the config repo), where the mistakes are about workflow, like skipping verification, asking instead of trying, or the wrong tool.
- **Window.** Default the last 14 days.
- **Workspace.** The current project's sessions only. Read other projects' transcripts only when the human asked.

State the scope back in one line before mining.

## 2. Collect the evidence

Fan this out to subagents and keep only their classified findings in your context. Raw transcripts stay with them.

- **Your corrections.** `~/.agents/scripts/transcripts turns --corrections --days 14` lists human turns that read like corrections, each with the agent text it answered. The filter is a regex. It over-matches and it misses polite corrections, so when the window holds only a few sessions, also read `transcripts turns` unfiltered. `transcripts sessions` lists what's in the window.
- **Reverts and fixups.** `git log --since=<window> --oneline -i --grep='revert\|fixup\|fix'`, then the diffs of what got reverted.
- **Review comments** on recently merged PRs: `gh pr list --state merged --search "merged:>=<date>"`, then each PR's review comments.
- **Rules that already exist.** CLAUDE.md, AGENTS.md and skill lines that say "never" or "always". Each one is a past correction. If its mistake is in this window's evidence too, the rule failed.
- **Workaround comments** (`HACK`, `TODO`, "do not") and the "Environment gaps" lines from implement briefs.

## 3. Group into classes

A class is one mistake with several instances. It counts once it happened twice. Leave one-offs alone: some mistakes have nothing in the environment to fix, and building a check for each one buries the checks that matter.

For each class write: a name, two or more evidence pointers (session id and time, commit, PR comment URL), and the shortcut the agent took and why it looked right from where the agent stood. The last part tells you where the environment misled it.

## 4. Fix each class at the highest level that holds

For `repo` classes:

1. **Architecture.** Remove the possibility. Give each piece of state one owner and each task one supported way. Hide internals so the wrong import fails. Replace hand-synced lists with one source of truth. Delete the old way and the dead code an agent would copy.
2. **Types.** Make the bad state unrepresentable, so the mistake doesn't compile.
3. **Lint or CI check** whose error message names the fix: the file, type or function to use instead. When the pattern is already common, fail only on new instances, a ratchet, rather than blocking on the backlog.
4. **A test** of the behavior. A test that would still pass if every function it calls returned nothing tests nothing, so fix or delete those while you're there.
5. **Docs or agent rules, last**, and only for judgment calls. Nothing fails when an agent skips them.

For `harness` classes the same idea, different rungs:

1. **A hook** in `settings.json` that blocks or injects at the moment the mistake happens.
2. **A script** the skill calls instead of prose the agent re-derives.
3. **A skill edit** at the step where the agent went wrong, with the failure shown as an example.
4. **An AGENTS.md line**, last.

Say for each class why the rungs above the one you picked didn't work.

## 5. Prove each check bites

One commit per class. For each new check, show it failing on a real past instance (check out the bad commit, or replay the mistake on a scratch branch) and passing on the fixed tree. Paste both outputs. Run the same command locally and in CI. A check you never saw fail is a guess.

Exceptions live on the offending line, with the reason and an expiry date, and need the human's approval.

## 6. Keep the rule table

The repo's agent instruction file (CLAUDE.md or AGENTS.md) keeps one table, `Rule | Enforced by`. When the human corrects you and the rule already sits in the table with nothing enforcing it, that's a repeat: climb the ladder in the same change. Drop a row once its check makes the mistake impossible, because the check is now the documentation.

**Reply:** each class with its evidence, the level you picked and why nothing higher worked, the fail-then-pass output for each check, and the one-offs you left alone.
