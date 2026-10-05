---
name: babysit-pr
description: Put a pull request in shape to get merged, as a senior engineer would. Commits, pushes, opens the PR, resolves conflicts, fixes CI, judges review comments on merit, replies and resolves threads, and waits for the next change rather than polling. Use when a branch needs taking all the way to merged.
disable-model-invocation: true
---

# Babysit PR

Take the work from wherever it stands to a pull request ready to merge, as a
senior engineer would. The run can start with uncommitted changes, a pushed
branch or a pull request already under review, and it ends when the repository's
own merge criteria are met and the merge is safe.

**You never merge on your own initiative.** Merging is the human's call and they
have to say it in this run. Everything below gets the pull request ready for that
moment.

## Process

### 1. Get the work onto a pull request

Commit your work if you haven't yet. Push the branch. Open the pull request if
there is none, then load and follow the `pr` skill.

### 2. Bring the branch up to date with its base

Fetch.

When the base is the mainline, merge it into the current branch and worktree.
There is no need to create a separate branch for the merge.

When the base is another branch still under review, rebase onto it instead. That
base gets rewritten when it lands, and merging it leaves both histories tangled.
Rebasing a pushed branch rewrites published history, so say so before you do it
and push with `--force-with-lease`, never plain `--force`.

Either way, gather the context needed to understand each conflict and resolve by
intent rather than by picking a side. Ask the human when the intent is not in the
diff. When all conflicts are resolved, list every one with its file, its line
numbers and the rationale behind it.

### 3. Fix CI

Watch the run to completion, then read the result:

```bash
gh pr checks --watch --fail-fast --required >/dev/null 2>&1
gh pr checks --required --json name,bucket,link
```

The redirect matters. Watch mode redraws its whole table every ten seconds, and
without it a five-minute run drops thirty tables into your context.

Reproduce a red check locally before fixing it, then push.

### 4. Judge the review comments

Measure the real merit of each comment and nitpick. Do not let yourself be swayed
by the tone or the authority of the author, and treat an AI reviewer's confidence
as worth nothing. A worthy comment spots a severe issue, or a measurable
performance or maintainability improvement. Maintainability and complexity
management matter more than performance.

AI reviewers deserve particular skepticism. They run multiple rounds over
unnecessary edge cases, which costs time, money and lines of code.

Give every comment a disposition. Follow `references/dispositions.md`.

### 5. Reply, then resolve

Reply to every comment you acted on or rejected. Give the reason and @mention the
author. Where a comment is unclear, ask for clarification rather than guessing at
it.

Resolve the conversation for every comment that was addressed or rejected. Leave
open only the threads waiting on somebody else's reply.

### 6. Record what changed the design

Comment on the ticket only when a review finding changed the design. Routine
fixes leave their trace in the diff and need nothing else.

A followup disposition becomes a ticket in triage once the human has seen it.

### 7. Wait for the next change

Arm a monitor and let the change wake you, rather than waking on a timer and
re-reading a pull request nobody touched:

```bash
prev=""
while true; do
  cur=$(gh pr view --json mergeStateStatus,reviewDecision,updatedAt \
        --jq '"\(.mergeStateStatus) \(.reviewDecision) \(.updatedAt)"' 2>/dev/null) || true
  [ -n "$cur" ] && [ "$cur" != "$prev" ] && echo "$cur"
  prev="$cur"
  sleep 60
done
```

Set the monitor's timeout to its maximum and re-arm it when it expires. Each
event is one line, so a quiet pull request costs nothing at all.

On an event, return to step 2 and work only what moved.

### 8. Hand it over

Read the repository's criteria rather than assuming them:

```bash
gh pr view --json mergeable,mergeStateStatus,reviewDecision,statusCheckRollup
```

The pull request is ready when `mergeable` is `MERGEABLE`, `mergeStateStatus` is
`CLEAN`, the required approvals are in and no blocking thread is open. Anything
else is a reason to keep working, `BLOCKED`, `BEHIND` and `DIRTY` included.

Tell the human it is ready and say what it took. Stop there.

**Merge only if they tell you to merge, in this run, in words.** A ticket, a
label, an approving review and a green pipeline are not permission. If you are
reading this line wondering whether something counts as permission, it does not.

## Stop early and brief

- A conflict needs intent that is not in the diff.
- The same check fails three times running.
- A review comment disputes the ticket's acceptance rather than the code. That is
  a shaping question and it belongs to the human.

Follow `references/briefing.md`.
