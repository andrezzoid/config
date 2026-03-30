# Apply Phase

**Input:** A `.delta.yml` with at least one eligible task + project code and context.
**Output:** Working code committed clean + delta updated (task status, log entry).

The Apply phase implements exactly ONE task. Read `delta-schema.md` if you need to
review the delta schema for updates.

## Procedure

### 1. Orient (MUST NOT skip)

1. Read the `.delta.yml` — goal, task statuses, log, notes.
   If log has >20 entries: read first entry, last 5, scan summaries between.
2. Read the delta's `context` and `refs`.
3. Identify the current state: what's done, what's pending, what was discovered.

### 2. Select the task

Pick the next eligible task. A task is eligible when:
- Its `status` is `pending` or `in_progress` (resuming a partial task).
- All task IDs in its `depends_on` list have `status: done`.
- It does NOT have `options` with `resolution: null`.

If the next eligible task is a decision point (`options` present, `resolution: null`):
**HALT.** Present the options with your analysis to the human. Do not select a different task
to avoid the decision — the dependency graph exists for a reason.

If no tasks are eligible (all remaining tasks are blocked): **HALT.** Report what's blocking.

Set the selected task's `status` to `in_progress`.

### 3. Verify health (when re-entering mid-flight)

If you are picking up work from a previous session (tasks with `done` status exist
and you didn't execute them yourself):

1. Run acceptance criteria for each `done` task. Use the task's `acceptance` field.
2. Run the project's test suite (or the relevant subset) to confirm a healthy baseline.
3. If any `done` task's criteria now fail:
   - Log the failure.
   - Set that task's status to `in_progress`.
   - That task becomes your current task (it needs fixing before downstream work).
4. If the test suite fails on code unrelated to the delta, log it and flag to the human.
   Do not attempt to fix unrelated breakage.

### 4. Read task context

1. Read the task's `context` field.
2. Read the source files you will modify. Read them now, not from memory.
3. Read source files the task depends on — modules you'll call, types you'll use,
   patterns you'll follow.
4. If anything contradicts the task's context or the delta's context:
   **STOP.** Log the contradiction. This is a potential context gap.
   - If you can determine which is correct → update context, continue.
   - If you cannot → flag to the human.

### 5. Implement

Execute the work described in the task's `description`, guided by its `context`.

**During implementation, track what you discover:**

| Discovery | Action |
|-----------|--------|
| A constraint the context didn't mention | Add to delta `notes` |
| This task cannot be done as described | Update task `context` with why. Log it. Implement the corrected version if the correction is minor. If it's a significant deviation, halt and flag for replanning. |
| The broader plan needs to change (e.g., missing task, wrong dependency order) | Complete current task if possible. Log the discovery. The log entry will trigger replanning. |
| Out-of-scope improvement noticed | Add to delta `notes`. MUST NOT expand scope. |
| A question only a human can answer | Log it. If it blocks the current task, set status to `blocked`. If it doesn't block, continue and note the assumption you're making. |

**Scope discipline:** Implement what the task describes. If you notice adjacent code that
could be improved, refactored, or cleaned up, and it is not part of this task's description,
do not touch it. Record it in delta `notes`.

### 6. Verify the task

You MUST verify every acceptance criterion in the task's `acceptance` field.

**How to verify properly:**

- **If the criterion describes a command result** (e.g., "tests pass"): run the command
  and check the output. Record the output in your log entry.
- **If the criterion describes behavior** (e.g., "invalid ranges return typed errors"):
  exercise that behavior directly. Call the function with invalid input. Hit the endpoint.
  Trigger the UI action. Observe the result.
- **If the criterion describes absence** (e.g., "no regressions in existing views"):
  run the relevant test suite. Check that unrelated functionality still works.
- **If you cannot verify a criterion** (need access you don't have, need a running service
  that's unavailable): document what you checked, what you couldn't check, and why.

Superficial verification is the most common agent failure. "Tests pass" is not sufficient
if the acceptance criteria describe behavior beyond what tests cover. Run the tests AND
verify the described behavior.

### 7. Commit

1. Stage and review your changes. Verify you haven't left debug code, console.logs,
   commented-out blocks, or TODO markers that aren't in the original code.
2. Run the project's linter/formatter if one exists.
3. Run the full test suite (or relevant subset). All tests MUST pass.
4. Commit with a message that references the delta goal and task ID.
   Example: `feat(analytics): extend query layer for date ranges [extend-query-params]`

If tests fail on your changes, fix them before committing. If tests fail on code unrelated
to your changes, log it as a discovery and commit your passing work separately.

### 8. Update the delta

1. Set the task's `status` to `done`.
   - Exception: if pausing mid-task (session limit, end of day), leave as `in_progress`.
2. Append a log entry:

```yaml
- id: log-NNN
  timestamp: <ISO 8601>
  command: apply
  task: <task-id>
  summary: >
    [What was implemented. How acceptance criteria were verified — include
    specific evidence like test counts or command output. Any discoveries
    that affect other tasks or the plan.]
```

Good log summaries include evidence: "Acceptance: npm test analytics — 14/14 passing.
Integration test for invalid date range returns 400 with ValidationError type."

Bad log summaries are vague: "Task completed successfully. All tests pass."

3. If you discovered things that affect other tasks, call them out clearly in the summary.
   The next Plan phase (or the next Apply's orient step) will read this.
4. If project context documents need updating, update them now.

### 9. Continue or hand off

| Situation | Action |
|-----------|--------|
| More eligible tasks exist, you have capacity | Select next task, go to Step 2 |
| Next task is a decision point | Halt, present decision to human |
| All tasks are `done` | Transition to Verify phase |
| Reaching context window limits | Save delta with accurate statuses and a log entry noting where you stopped. The next session will re-enter via Mid-Flight Re-Entry in SKILL.md. |
| Genuinely blocked | Set task to `blocked`, log the blocker with specific unblock actions needed |

## Resuming a Partially Complete Task

When a task has `status: in_progress` from a previous session:

1. Read the log entries for this task to understand what was already done.
2. Check the code state — diff against the last known-good commit if helpful.
3. Run any already-met acceptance criteria to confirm they still hold.
4. Continue from where the previous session stopped.
5. MUST NOT restart the task from scratch unless the previous work is unsalvageable.

## Edge Cases

**Delta file is malformed or missing fields:** Log the issue. Do not guess at missing values.
Flag to the human for correction.

**Acceptance criteria are ambiguous:** Log the ambiguity. State the interpretation you are using.
Proceed with that interpretation but flag it so the human can correct if wrong.

**A dependency is marked `done` but its code appears broken:** This is a verification failure
from a previous session. Log it as a `[bug]`, set the dependency back to `in_progress`,
and make it your current task before proceeding to the originally selected task.
