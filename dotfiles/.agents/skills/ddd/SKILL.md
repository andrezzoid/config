---
name: ddd
description: "A structured process for AI-assisted development using four phases: explore, plan, apply, verify. Use this skill whenever working on code changes that benefit from structured decomposition — features, refactors, bug fixes, or exploratory work. Also use when the user mentions exploring a problem, planning a change, applying a task, verifying work, or when you encounter a .delta.yml file. Supports both human-guided work (user invokes a phase) and autonomous execution (self-route based on delta state). Do NOT use for trivial one-line fixes, typo corrections, or config tweaks."
---

# Delta-Driven Development

Key words: MUST, MUST NOT, SHOULD, SHOULD NOT, MAY — interpreted per RFC 2119.

## Assess and Route

When this skill triggers, assess the current situation and route to the correct phase.
Read the corresponding reference file BEFORE executing any phase.

### Step 1: Check for an existing delta

Look for a `.delta.yml` file in the project root or `.deltas/` directory.

- **Delta exists** → Read it fully (goal, tasks, statuses, log). Go to Step 3.
- **No delta exists** → Go to Step 2.

### Step 2: No delta — determine starting phase

| Situation | Phase | Reference |
|-----------|-------|-----------|
| Goal is vague, problem space unclear, or user says "explore/investigate/research" | **Explore** | `references/explore.md` |
| Goal is concrete and ready to decompose, or user says "plan/break down/decompose" | **Plan** | `references/plan.md` |
| User provides a goal and asks to start building immediately | **Plan**, then **Apply** | `references/plan.md` → `references/apply.md` |

### Step 3: Delta exists — route by state

Read all task statuses and the log's most recent entries. Then:

| Delta state | Phase | Reference |
|-------------|-------|-----------|
| All tasks `pending`, no apply log entries yet | **Apply** next eligible task | `references/apply.md` |
| Some tasks `done`, eligible `pending` tasks remain (all deps satisfied) | **Apply** next eligible task | `references/apply.md` |
| Next eligible task has `options` with `resolution: null` | **Halt.** Present the decision with your analysis. Wait for human input. | — |
| All tasks `done`, no verification logged yet | **Verify** | `references/verify.md` |
| Latest log shows `[bug]` from verify | **Apply** the failed task (its status MUST be `in_progress`) | `references/apply.md` |
| Latest log shows `[design_gap]` from verify | **Plan** — revise the delta | `references/plan.md` |
| Latest log shows `[context_gap]` from verify | Update context, then **Plan** if delta needs revision | `references/plan.md` |
| State is ambiguous or contradictory | **Halt.** Describe the ambiguity. Ask for direction. | — |

### Step 4: Human override

If the user explicitly requests a phase, execute that phase regardless of delta state.
Human intent always takes precedence over autonomous routing.

## Mid-Flight Re-Entry

When starting with a fresh context window and an existing delta:

1. Read the `.delta.yml` — goal, task statuses, notes.
2. Read the log. If >20 entries: read the first entry, the last 5, and scan summaries between.
3. Run acceptance criteria for every task marked `done`.
4. If any `done` task's criteria now fail → log the failure as `[bug]`, set task to `in_progress`.
5. Route per Step 3.

## Mandatory Behaviors

These apply across ALL phases. They are non-negotiable.

1. **Orient first.** Every phase MUST begin by reading available state — delta, context,
   relevant code — before taking any action.

2. **One task per Apply.** Each Apply invocation MUST implement exactly one task.
   MUST NOT batch, scope-creep, or do work outside the current task's scope.

3. **Clean state after Apply.** After every Apply, the codebase MUST compile, pass existing
   tests, and contain no debug artifacts or uncommitted partial work.

4. **Capture what you learn.** When implementation reveals something the delta or context
   didn't account for, you MUST record it in the delta log, notes, or project context.

5. **Halt on decisions.** Tasks with `options` and `resolution: null` MUST NOT be resolved
   by the agent. Present options with analysis. Wait for human input.

6. **Flag contradictions.** When context contradicts code, or acceptance criteria are
   ambiguous, or anything is unexpected — flag it explicitly. MUST NOT fill gaps silently.

## File Locations

| Artifact | Location |
|----------|----------|
| Delta files | Project root (`*.delta.yml`) or `.deltas/` directory |
| Delta schema + examples | `references/delta-schema.md` |
| Phase instructions | `references/explore.md`, `plan.md`, `apply.md`, `verify.md` |
| Project context | Team-defined: CLAUDE.md, AGENTS.md, JSDoc, architecture docs, etc. |
