# Delta Schema Reference

Deltas are YAML files (`.delta.yml`) that describe a unit of work.
Created during Plan. Updated during Apply and Verify. Archived or deleted when complete.

## Top-Level Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `goal` | Yes | string | What this change achieves. 1-3 sentences. |
| `acceptance` | Yes | list of string | Verifiable criteria for the integrated result. Checked during Verify. |
| `tasks` | Yes | list of Task | The task graph. See Task fields below. |
| `log` | Yes | list of LogEntry | Append-only execution narrative. See LogEntry fields below. |
| `context` | No | string | Information specific to THIS change. Scoping decisions, constraints, design choices. 3-7 lines. |
| `refs` | No | list of string | Pointers to relevant files (docs, tests, schemas). Flat list. |
| `notes` | No | list of string | Catch-all: out-of-scope observations, future work, things noticed but not addressed. |

## Task Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | Yes | string | Unique within this delta. Short, kebab-case. Example: `extend-query-params` |
| `description` | Yes | string | What this task does, as an action. 1-3 sentences. |
| `status` | Yes | enum | `pending` &#124; `in_progress` &#124; `done` &#124; `blocked` |
| `acceptance` | Yes | list of string | Verifiable criteria for THIS task. Checked at end of Apply. |
| `depends_on` | Yes | list of string | Task IDs that must be `done` before this task starts. Use `[]` for none. |
| `context` | No | string | Local knowledge for this task. 2-5 lines. What to watch for, patterns to follow, things to avoid. |
| `options` | No | list of Option | Present when this task is a decision point. Blocks until resolved. |
| `resolution` | No | string or null | Chosen option ID after human decides. `null` = unresolved. |

### Option Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | Yes | string | Short identifier for this option. |
| `summary` | Yes | string | What this option does and its key tradeoff. 1-2 sentences. |

### Status Transitions

```
pending ──► in_progress ──► done
                │
                ├──► blocked (external dependency, missing access)
                │
                └──► in_progress (set back by Verify when a bug is found)
```

- Apply: `pending` → `in_progress` → `done`
- Apply: `in_progress` → `blocked` (genuine blocker)
- Verify: `done` → `in_progress` (bug found, needs re-implementation)
- Plan revision MAY add, modify, or remove `pending` tasks. MUST NOT modify `done` tasks.

## LogEntry Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | Yes | string | Sequential: `log-001`, `log-002`, etc. |
| `timestamp` | Yes | ISO 8601 | When this entry was created. |
| `command` | Yes | enum | `explore` &#124; `plan` &#124; `apply` &#124; `verify` |
| `summary` | Yes | string | What happened. Include evidence for apply (test results, command output). Include severity-tagged failures for verify. |
| `task` | No | string | Task ID, when this entry is about a specific task. |

## Example: Feature (mid-flight)

A delta partway through execution. Two tasks done, one in progress, one pending decision.

```yaml
goal: >
  Users can filter the analytics dashboard by arbitrary date
  ranges, replacing the fixed 7/30/90 day toggles.

context: |
  Timezone handling: all dates UTC, display in user's local timezone.
  Current enum approach used in 3 other views. Extend, don't replace.

refs:
  - docs/architecture/query-layer.md
  - tests/integration/dashboard-queries.test.ts

acceptance:
  - End-to-end date filtering returns correct results
  - Existing 7/30/90 day presets still work
  - No regressions in other analytics views

tasks:
  - id: extend-query-params
    description: >
      Extend analytics query layer to accept optional startDate/endDate
      params alongside existing period enum.
    status: done
    context: |
      Existing AnalyticsPeriod enum maps to date ranges in buildDateFilter().
      Add DateRange type, make buildDateFilter() accept either.
      Don't remove enum path — other views depend on it.
    acceptance:
      - Existing enum-based queries unchanged
      - Date range queries return correct data
      - Invalid ranges return typed errors
    depends_on: []

  - id: date-picker-component
    description: >
      Create DateRangePicker using single calendar picker pattern
      from Figma wireframes.
    status: done
    context: |
      Use existing design system Calendar primitive. Emit DateRange
      matching query layer type. Handle: incomplete selection, clearing,
      preset shortcuts for 7/30/90 days.
    acceptance:
      - Renders per Figma wireframes
      - Emits valid DateRange on selection
      - Handles edge cases: incomplete, clearing, keyboard nav
    depends_on: []

  - id: wire-state-management
    description: >
      Connect DateRangePicker to dashboard state, replace period
      toggle with new picker.
    status: in_progress
    context: |
      Dashboard uses MobX store with `period` observable. Add
      `dateRange` observable that takes precedence.
      Keep `period` for backwards compat.
    acceptance:
      - Date range selection triggers dashboard refresh
      - Preset shortcuts still work
      - State persists across tab navigation
    depends_on:
      - extend-query-params
      - date-picker-component

  - id: decide-url-persistence
    description: >
      Should date range selection persist in the URL?
    status: pending
    context: |
      URL persistence enables shareable filtered views and browser
      navigation. Current toggle is NOT in the URL.
    options:
      - id: url-sync
        summary: Sync to URL params. More work now, enables sharing.
      - id: local-only
        summary: Store only. Ships faster, add URL sync later if needed.
    depends_on:
      - wire-state-management
    resolution: null

notes:
  - Cache layer has undocumented date hash in keys, not addressed here
  - Calendar component accessibility needs future work

log:
  - id: log-001
    timestamp: 2025-03-11T10:00Z
    command: explore
    summary: >
      Explored 3 approaches to date filtering: calendar picker,
      dual date inputs, natural language. Picker selected for
      consistency with existing UI patterns. Discovered timezone
      handling assumes UTC throughout — must preserve.

  - id: log-002
    timestamp: 2025-03-11T11:30Z
    command: plan
    summary: >
      Decomposed into 3 implementation tasks + 1 decision.
      URL persistence deferred as decision task after state
      management is wired — needs implementation context to
      evaluate properly.

  - id: log-003
    timestamp: 2025-03-11T14:00Z
    command: apply
    task: extend-query-params
    summary: >
      Query layer extended. DateRange type added.
      buildDateFilter() accepts both enum and DateRange.
      Verified: npm test analytics — 14/14 passing.
      Manual test: buildDateFilter({start: '2025-01-01', end: '2025-02-01'})
      returns correct WHERE clause. Invalid range (start > end)
      throws ValidationError.

  - id: log-004
    timestamp: 2025-03-11T16:00Z
    command: apply
    task: date-picker-component
    summary: >
      Component complete. Verified: renders matching wireframe,
      emits valid DateRange, clearing works, keyboard nav works.
      Preset shortcuts emit equivalent DateRange objects.
```

## Example: Repair Loop

A delta after Verify found a bug and a design gap. Shows the full cycle of verify → fix → replan.

```yaml
goal: >
  Users can filter the analytics dashboard by arbitrary date ranges.

acceptance:
  - End-to-end date filtering returns correct results
  - Existing presets still work
  - No regressions

tasks:
  - id: extend-query-params
    description: Extend query layer for date range params.
    status: in_progress  # <-- set back from done by verify (bug found)
    acceptance:
      - Invalid ranges return typed errors
      - Existing queries unchanged
    depends_on: []

  - id: date-picker-component
    description: Create DateRangePicker component.
    status: done
    acceptance:
      - Renders per wireframes
      - Emits valid DateRange
    depends_on: []

  - id: wire-state-management
    description: Connect picker to dashboard state.
    status: done
    acceptance:
      - Date selection triggers refresh
      - Presets still work
    depends_on:
      - extend-query-params
      - date-picker-component

  - id: debounce-range-updates  # <-- added by replan
    description: >
      Add debounce to date range state updates to prevent
      cascading re-renders during selection.
    status: pending
    context: |
      Verify found that date selection triggers 3 sequential
      re-renders. Debounce the dateRange observable update to
      batch changes within 150ms.
    acceptance:
      - Single re-render per completed date selection
      - No visual flicker during selection
    depends_on:
      - wire-state-management

log:
  # ... earlier entries omitted for brevity ...

  - id: log-006
    timestamp: 2025-03-12T10:00Z
    command: verify
    summary: >
      Task-level: extend-query-params FAIL — invalid ranges
      (start > end) return empty result instead of ValidationError.
      date-picker-component PASS. wire-state-management PASS
      individually.

      Delta-level: FAIL — date selection triggers 3 sequential
      store updates, each causing dashboard re-render.

      Failures:
      - [bug] extend-query-params: Invalid date ranges not
        returning ValidationError. Tested with start=2025-03-01,
        end=2025-02-01.
      - [design_gap] null: Cascading re-renders during date
        selection. No debounce on dateRange observable updates.

  - id: log-007
    timestamp: 2025-03-12T10:30Z
    command: plan
    summary: >
      Revised delta: added debounce-range-updates task between
      wire-state-management and verify. Triggered by log-006
      design_gap finding.

  - id: log-008
    timestamp: 2025-03-12T11:00Z
    command: apply
    task: extend-query-params
    summary: >
      Fixed: added DateRange validation before query construction.
      buildDateFilter() now throws ValidationError for start > end.
      Verified: manual test with invalid range returns 400 +
      ValidationError. npm test analytics — 15/15 (new test added).
      Triggered by log-006 bug finding.
```

## Example: Minimal (small change)

Not every delta is large. A focused fix:

```yaml
goal: >
  Fix timezone offset bug in dashboard date display.

acceptance:
  - Dates display correctly for all timezone offsets
  - Existing date-related tests pass

tasks:
  - id: fix-timezone-offset
    description: >
      Dashboard formatDate() uses local timezone instead of user's
      configured timezone. Fix to use userTimezone from settings store.
    status: pending
    context: |
      Bug is in src/views/Dashboard/utils.ts. User timezone available
      via settingsStore.userTimezone. Follow the pattern used in
      src/views/Reports/utils.ts which already handles this correctly.
    acceptance:
      - formatDate() uses userTimezone, not local timezone
      - Dates correct for UTC+0, UTC+5, UTC-8 users
    depends_on: []

log:
  - id: log-001
    timestamp: 2025-03-12T09:00Z
    command: plan
    summary: >
      Single task. Root cause: formatDate() calls new Date().toLocaleDateString()
      instead of using Intl.DateTimeFormat with user timezone.
```
