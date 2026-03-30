# Plan Phase

**Input:** A concrete goal + project code and context (optionally enriched by prior Explore).
**Output:** A `.delta.yml` file. Read `delta-schema.md` for the schema before writing.

The Plan phase produces a delta — a machine-readable task graph for a specific change.

## Procedure

### 1. Orient

1. Read project context documents (CLAUDE.md, architecture docs, etc.).
2. Read source code in the areas that will change. Read code you will depend on, not just
   code you will modify.
3. If prior exploration exists, read those findings.
4. If replanning (existing `.delta.yml`), read it fully — tasks, statuses, log, notes.

### 2. Contradiction detection

Before planning, you MUST verify that your understanding matches reality.

1. Identify the areas this change will **touch** and the areas it will **depend on**.
2. For each area: read the context, then read the actual code.
3. If context says X and code does Y, you have a contradiction.
   - If you can determine which is correct → update the stale one.
   - If you cannot determine → flag it to the human before proceeding.
4. Run existing tests in the affected areas. They MUST pass before you plan against them.
   If tests fail, you are planning on a broken foundation — stop and resolve first.

### 3. Write the goal and acceptance criteria

**Goal:** 1-3 sentences describing what this change achieves. Be specific.

- Bad: "Improve the dashboard."
- Good: "Users can filter the analytics dashboard by arbitrary date ranges, replacing the
  fixed 7/30/90 day toggles."

**Acceptance criteria:** A list of verifiable statements that define "done" for the entire change.
Write criteria you can check by running commands, calling APIs, or observing behavior.

- Bad: "Dashboard works correctly."
- Good: "Selecting a custom date range returns correctly filtered analytics data."
- Good: "Existing 7/30/90 day preset buttons still function identically."

When a criterion requires human judgment (visual design, UX feel), describe what evidence
to produce: "Screenshot of date picker matches Figma wireframe at [link]."

### 4. Write delta-level context

Record information specific to THIS change that does not belong in permanent project context:
- Scoping decisions: "Extend the enum interface, don't replace it — other views depend on it."
- Known constraints discovered during exploration.
- Design choices already made and their rationale.

Keep this to 3-7 lines. If it's longer, some of it probably belongs in project context instead.

### 5. Decompose into tasks

Each task MUST be:
- **Independently implementable.** An agent in a fresh context window, reading only this task
  and its referenced context, can execute it without seeing other tasks.
- **Single-responsibility.** One clear change. If you describe it with "and" between two
  unrelated actions, split it.
- **Verifiable.** It has acceptance criteria that can be checked after implementation.

**Decomposition strategies:**

- **By layer.** Data layer → business logic → API → UI. Each layer is a task. Use when the
  change cuts vertically through the stack.
- **By boundary.** One task per system boundary crossed. Use when the change involves
  integrating multiple modules or services.
- **By risk.** Isolate the uncertain or complex part into its own task. Implement it first.
  If it fails, you haven't wasted effort on the straightforward parts.
- **By dependency.** If B needs A's output, A is a task, B is a task, B depends on A.
  Make the dependency graph explicit.

**For each task, write:**

- `id`: Short, descriptive, kebab-case. Example: `extend-query-params`.
- `description`: 1-3 sentences. What this task does, stated as an action.
- `status`: `pending` for all new tasks.
- `context`: 2-5 lines of local knowledge. What a senior engineer would tell you before
  starting: "Use the existing buildDateFilter() function. Follow the pattern in
  src/queries/analytics.ts. Don't remove the enum path — other views depend on it."
  If it's relevant to this task and not obvious from the description, put it here.
- `acceptance`: Verifiable criteria for THIS task (not the whole delta).
- `depends_on`: List of task IDs that must be `done` before this task starts.

**Decision tasks:** When the correct approach depends on a judgment call (product direction,
architectural preference, cost/benefit tradeoff), create a task with:
- `options`: List of choices, each with `id` and `summary` including tradeoff.
- `resolution`: Set to `null`. This task blocks dependents until a human resolves it.

### 6. List references

Flat list of files relevant to this change: architecture docs, test files, schemas, related
source files. These are hints for context assembly, not an exhaustive manifest. Include files
the agent SHOULD read, omit files it would find naturally through imports.

### 7. Write the delta file

Create the `.delta.yml` per the schema in `delta-schema.md`. Add an initial log entry:

```yaml
log:
  - id: log-001
    timestamp: <ISO 8601>
    command: plan
    summary: >
      Decomposed into [N] tasks. [Brief rationale for the decomposition.
      Note any significant scoping decisions or deferred questions.]
```

### 8. Review

**If human-guided:** Present the delta. Ask:
- Does the decomposition make sense?
- Are any tasks too large or too small?
- Should any ambiguities become decision tasks?
- Is anything missing?

**If autonomous:** Proceed to Apply with the first eligible task.

## Replanning

When Apply or Verify reveals the plan needs to change:

1. Read the current `.delta.yml` fully, including log.
2. Identify what changed and why (the verify log entry or apply discovery tells you).
3. You MAY: add new tasks, modify `pending` tasks, change dependencies, update delta context.
4. You MUST NOT: modify tasks with status `done` — they are historical record.
5. Append a log entry explaining the revision:

```yaml
- id: log-NNN
  timestamp: <ISO 8601>
  command: plan
  summary: >
    Revised delta: [what changed]. [Why — triggered by log-NNN.]
    Added: [new task IDs]. Modified: [changed task IDs]. Removed: [if any].
```

## Task Sizing

A task is too large if an agent would lose track of what it's doing before finishing.
A task is too small if it adds decomposition overhead without reducing complexity.

Rule of thumb: if you can describe the task's implementation in under 50 lines of pseudocode,
it's roughly the right size. If it would take 200+ lines, split it.
