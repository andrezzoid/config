# Writing Agent Briefs

An agent brief is a structured comment posted on a GitHub issue or PR when it moves to `ready-for-agent`. It is the authoritative specification that an AFK agent will work from. The original body and discussion are context: the agent brief is the contract.

The brief states **what the agent should do**, which stretches to both surfaces: for an issue, that's building the change from nothing; for a PR, it's what's left to do *to the existing diff*: finish it, close gaps, address review points. Same principles either way; the PR example below shows the difference.

## Principles

### Durability over precision

The issue may sit in `ready-for-agent` for days or weeks. The codebase will change in the meantime. Write the brief so it stays useful even as files are renamed, moved, or refactored.

- **Do** describe interfaces, types, and behavioral contracts
- **Do** name specific types, function signatures, or config shapes that the agent should look for or modify
- **Don't** reference file paths: they go stale
- **Don't** reference line numbers
- **Don't** assume the current implementation structure will remain the same

### Behavioral, not procedural

Describe **what** the system should do, not **how** to implement it. The agent will explore the codebase fresh and make its own implementation decisions.

- **Good:** "The `SkillConfig` type should accept an optional `schedule` field of type `CronExpression`"
- **Bad:** "Open src/types/skill.ts and add a schedule field on line 42"
- **Good:** "When a user runs `/triage` with no arguments, they should see a summary of issues needing attention"
- **Bad:** "Add a switch statement in the main handler function"

### Complete acceptance criteria

The agent needs to know when it's done. Every agent brief must have concrete, testable acceptance criteria. Each criterion should be independently verifiable.

- **Good:** "Running `gh issue list --label needs-triage` returns issues that have been through initial classification"
- **Bad:** "Triage should work correctly"

### Explicit scope boundaries

State what is out of scope. This prevents the agent from gold-plating or making assumptions about adjacent features.

## Template

Post the brief as a comment whose first line is `## Agent Brief`, followed by the sections of [the ticket template](references/ticket-template.md): the same template `to-tickets` writes into ticket bodies, so `implement` reads one shape whichever skill wrote it. Write the acceptance criteria by [the acceptance criteria rules](references/acceptance-criteria.md). The category goes on the issue as a label, not into the brief.

The factory reads blockers from the issue body and from the tracker's own relations, never from comments. When the brief names a blocker, also add it as an issue dependency, or as a "blocked by" relation in Linear.

## Examples

### Good agent brief (bug)

```markdown
## Agent Brief

## Problem Statement

When a skill description exceeds 1024 characters, it is cut at exactly 1024
characters regardless of word boundaries. Descriptions then end mid-word
(e.g. "Use when the user wants to confi").

## What to build

Truncation breaks at the last word boundary before 1024 characters and appends
"..." to show that the text was cut.

## Implementation Decisions

- **Keep `SkillMetadata.description` a plain string**: forced by every reader
  treating it as display text. Not a separate `truncated` flag, because no
  reader needs to know.
- **Truncate where SKILL.md frontmatter is parsed**: forced by that being the
  one place descriptions enter the system. Not at each display site, because
  they would drift apart.

## Testing

The frontmatter parser's unit tests, next to the existing description tests.

## Acceptance criteria

- [ ] Given a description under 1024 characters, when its skill loads, then the description is unchanged.
- [ ] Given a description over 1024 characters, when its skill loads, then it ends at the last word boundary before character 1024, followed by "...".
- [ ] Given a truncated description, when its skill loads, then its length including "..." is at most 1024 characters.

## Out of scope

- Changing the 1024 character limit itself
- Multi-line description support
```

### Good agent brief (enhancement)

```markdown
## Agent Brief

## Problem Statement

When a feature request is rejected, the issue is closed with a `wontfix` label
and a comment. Nothing records the decision or its reasoning, so a later
request for the same feature needs the maintainer to recall or search for the
earlier discussion.

## What to build

Each rejected feature request is recorded in `.out-of-scope/<concept>.md`, with
the decision, the reasoning and links to every issue that asked for it. Triage
checks these files and surfaces a match when a new issue asks for the same
concept.

## Implementation Decisions

- **One file per concept, not per issue**: forced by repeat requests being the
  problem. Not one file per rejected issue, because matching would then need
  every file read and compared.
- **File shape**: a `# Concept Name` heading, a `**Decision:**` line, a
  `**Reason:**` line and a `**Prior requests:**` list of issue links.

## Testing

A triage run on a scratch repo with one existing `.out-of-scope/` file.

## Acceptance criteria

- [ ] Given a feature closed as wontfix, when triage closes it, then a file in `.out-of-scope/` holds the decision, the reasoning and a link to the issue.
- [ ] Given an existing `.out-of-scope/` file for the same concept, when triage closes another request for it, then the new issue is appended to that file's "Prior requests" list and no second file is created.
- [ ] Given a new issue that matches an `.out-of-scope/` file, when triage starts on it, then it shows the matching file to the maintainer.

## Out of scope

- Automated matching (the maintainer confirms the match)
- Reopening previously rejected features
- Bug reports (only enhancement rejections go to `.out-of-scope/`)
```

### Good agent brief (PR)

For a PR, the Problem Statement describes the state of the diff, and What to build asks the agent to finish or fix it rather than build from scratch.

```markdown
## Agent Brief

## Problem Statement

The PR adds a `--json` flag that serializes the issue list to JSON. The happy
path works and the diff matches the project's command structure. Two gaps
remain: errors still print as human text, not JSON, and the new flag has no
test coverage.

## What to build

With `--json`, all output, errors included, is well-formed JSON on stdout, and
the command's exit codes are unchanged. Without the flag, the human-readable
output is untouched.

## Implementation Decisions

- **Errors under `--json` are `{ "error": string }`**: forced by callers
  parsing stdout as JSON. Not plain text on stderr, because a script would then
  need two parsers.
- **Reuse the serializer the PR already added**: forced by the PR's success
  path depending on it. Not a second serializer, because the two would drift.

## Testing

The command's existing CLI tests.

## Acceptance criteria

- [ ] Given `triage list --json`, when the list loads, then stdout is valid JSON.
- [ ] Given `triage list --json`, when the command fails, then stdout is valid JSON with an `error` field.
- [ ] Given the same failure, when run with and without `--json`, then the exit codes match.
- [ ] Given no `--json` flag, when the command runs, then its output is byte-for-byte the same as before the PR.

## Out of scope

- Adding `--json` to any other command
- Changing the JSON shape of the success payload the PR already defined
```

### Bad agent brief

```markdown
## Agent Brief

**Summary:** Fix the triage bug

**What to do:**
The triage thing is broken. Look at the main file and fix it.
The function around line 150 has the issue.

**Files to change:**
- src/triage/handler.ts (line 150)
- src/types.ts (line 42)
```

This is bad because:
- It doesn't follow the ticket template
- Vague description ("the triage thing is broken")
- References file paths and line numbers that will go stale
- No acceptance criteria
- No scope boundaries
- No problem statement and no behaviour to build
