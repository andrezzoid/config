# Verify Phase

**Input:** A `.delta.yml` with all tasks `done` + the codebase.
**Output:** A diagnosis: what works, what doesn't, severity of each issue.

The Verify phase diagnoses. It MUST NOT fix anything. Routing the response to the
appropriate phase happens in SKILL.md, not here.

Read `delta-schema.md` if you need to review the delta schema for log entries.

## Procedure

### 1. Orient

1. Read the `.delta.yml` — goal, acceptance criteria, all tasks, full log.
2. Understand what was built: read each task's description and acceptance criteria.
3. Read the delta's `context` for constraints and design decisions.

### 2. Verify task-level acceptance criteria

For EACH task with `status: done`, verify every criterion in its `acceptance` field.

For each criterion, record:
- **Pass:** What you checked and what the result was. Be specific.
  Example: "Ran `npm test -- --grep analytics`. 14/14 passing."
- **Fail:** What you expected, what actually happened, and what evidence you have.
  Example: "Called `buildDateFilter({start: '2025-03-01', end: '2025-02-01'})`.
  Expected: ValidationError. Actual: returned empty result set without error."

MUST NOT skip criteria because they "seem obvious" or because "the tests pass."
Tests cover what they cover. Acceptance criteria may describe behavior beyond test coverage.

### 3. Verify delta-level acceptance criteria

Test the INTEGRATED result against the delta's `acceptance` field. This is different from
task-level verification — it checks that the pieces work together.

**How to test as a user would:**

| Change type | Verification approach |
|-------------|----------------------|
| API change | Make actual API calls. Exercise the full request/response cycle. Test with valid input, invalid input, and edge cases from the acceptance criteria. |
| UI change | Interact with the UI if possible. If not, trace the data flow from user action through state management to render output. Capture screenshots or describe the observed behavior. |
| Data layer change | Query with realistic data. Check results against expected values. Test boundary conditions (empty sets, large sets, null values). |
| Refactor | Run the full test suite. Verify that behavior is identical, not just that tests pass. If the refactor changed interfaces, verify all consumers. |
| Bug fix | Reproduce the original bug using the reproduction steps from the explore/plan log. Confirm it no longer occurs. Then verify the fix doesn't break the surrounding functionality. |

### 4. Check for regressions

1. Run the project's full test suite (or the broadest relevant subset).
2. If tests fail on code unrelated to this delta, note it but classify separately.
3. Check areas adjacent to the change that were NOT modified.
   The most common regressions are in code that consumes modified interfaces.

### 5. Classify each issue

Every issue found MUST be classified into exactly one severity. The severity determines
what happens next (handled by SKILL.md routing, not by this phase).

**`[bug]`** — A task was implemented incorrectly.

A specific task's acceptance criterion fails. The code doesn't match the task's stated intent.
Examples:
- Edge case produces wrong result or crashes.
- A contract (type, test, schema) is violated.
- Behavior doesn't match the task description.

Attribute to the specific task that failed.

**`[design_gap]`** — The plan was incomplete or wrong.

Individual tasks pass their own criteria, but the integrated result doesn't achieve the
delta's goal. Something is missing from the plan or the tasks interact badly.
Examples:
- Feature works in isolation but breaks when components integrate.
- A necessary task was never planned (missing step in the graph).
- Dependencies between tasks were wrong.
- The delta-level acceptance criteria fail, but no single task is responsible.

Attribute to `null` (not a single task's fault).

**`[context_gap]`** — Our understanding of the system was wrong.

The delta was planned and executed correctly against what we *believed* to be true,
but that belief was wrong. The underlying context needs correction.
Examples:
- An undocumented dependency causes unexpected behavior.
- An assumption about an adjacent system turns out to be false.
- A constraint exists that nobody knew about.

Attribute to `null`. Note what the incorrect understanding was and what's actually true.

### 6. Record the diagnosis

Append a log entry:

```yaml
- id: log-NNN
  timestamp: <ISO 8601>
  command: verify
  summary: >
    Verified [N] tasks and [M] delta-level criteria.

    Passed: [list what passed, with evidence summaries]

    Failures:
    - [bug] extend-query-params: Invalid date ranges return empty
      result set instead of ValidationError. Tested with start > end.
    - [design_gap] null: Date selection triggers 3 sequential
      re-renders. No single task responsible — interaction between
      picker, state, and query layer.
    - [context_gap] null: Cache key generation includes undocumented
      date hash. Stale cache entries served for new date ranges.
```

If all criteria pass:

```yaml
- id: log-NNN
  timestamp: <ISO 8601>
  command: verify
  summary: >
    All task-level and delta-level acceptance criteria pass.
    Test suite: [result]. No regressions detected.
    Delta is complete.
```

### 7. Update task statuses for bugs

For each `[bug]` finding: set the attributed task's `status` to `in_progress`.
This prepares it for the next Apply cycle.

For `[design_gap]` and `[context_gap]` findings: do not change task statuses.
These require Plan revision, not task re-execution.

### 8. Close the delta (when everything passes)

When verification finds no issues:

1. Confirm all tasks have `status: done`.
2. Review delta `notes` — anything that should become permanent project context?
   Anything that should become future work?
3. Update project context with durable knowledge gained during this delta.
4. The delta is complete. Archive or delete per team convention.
