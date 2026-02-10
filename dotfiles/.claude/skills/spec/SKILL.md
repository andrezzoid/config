---
name: spec
description: |
  Create precise, unambiguous specifications through structured dialogue. Use when:
  - User invokes /spec
  - User asks to "write a spec", "create a specification", or "spec out" a feature/process
  - User needs to clarify requirements before implementation
---

# Specification Writing Skill

A collaborative process to produce precise, unambiguous specifications that eliminate guesswork and enable accurate implementation.

## Keywords

The keywords MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in [RFC 2119](https://www.ietf.org/rfc/rfc2119.txt).

## Constraints

- MUST NOT skip Phase 1 (Discover)
- MUST NOT lock a spec without explicit human approval
- MUST follow Keywords, Writing Conventions and Language Rules when drafting
- MUST use `references/template.md` when drafting

## Phase 1: Discover

**Goal:** Surface requirements, constraints, and assumptions through structured dialogue.

1. Human MUST provide initial input (minimum: one sentence describing intent)
2. Apply the Socratic Method to surface ambiguity, implicit assumptions, and missing requirements:
   - MUST ask 1 to 3 tightly related question at a time
   - MUST cover all relevant question categories before concluding (see `references/socratic-questions.md`)
   - Human MAY skip questions; MUST document skipped areas as acknowledged risks under the Open Questions section
3. MUST summarize key decisions when questioning concludes

### Acceptance Criteria

- [ ] All Core question categories MUST be explored
- [ ] WHEN human skips a question THEN the skipped topic MUST be documented
- [ ] WHEN questioning concludes THEN a summary of key decisions MUST be provided
- [ ] Human MUST confirm readiness to proceed

## Phase 2: Draft

**Goal:** Produce a complete spec document.

1. Create `specs/[kebab-case-name]/spec.md` using `references/template.md`
2. MUST populate all MUST sections from the template
3. Present draft to human

### Acceptance Criteria

- [ ] All MUST sections from template MUST be populated
- [ ] Each behavior MUST have at least one example

## Phase 3: Review & Lock

**Goal:** Refine and finalize the spec.

1. Human SHOULD review and provide feedback
2. MUST revise based on feedback (MAY ask clarifying questions)
3. WHEN acceptance criteria are met THEN MUST request human approval
4. WHEN human approves THEN status MUST change to `locked`

### Acceptance Criteria

- [ ] No subjective terms appear without measurable criteria
- [ ] Each behavior MUST follow WHEN/THEN or GIVEN/WHEN/THEN format
- [ ] Open Questions MUST be empty or contain only acknowledged risks
- [ ] Human MUST explicitly approve

## Spec Types

**Feature specs:** Use `## Behaviors` section with WHEN/THEN or GIVEN/WHEN/THEN format.

**Process specs:** Use `## Phase N: [Name]` sections with Goal, Steps, and per-phase Acceptance Criteria.

## Writing Conventions

### Behavior Description Techniques

**EARS (Easy Approach to Requirements Syntax)** - for event-driven behaviors:
```
WHEN [trigger] THEN [outcome]
```
Example: WHEN user clicks "Save" THEN the document persists to database.

**BDD/Gherkin** - for stateful scenarios:
```
GIVEN [precondition]
WHEN [action]
THEN [result]
```
Example: GIVEN user has unsaved changes WHEN user clicks "Close" THEN confirmation dialog appears.

### Language Rules

| Rule | Bad | Good |
|------|-----|------|
| No subjective terms without measurable criteria | "fast response" | "response within 200ms" |
| No ambiguous pronouns | "it should update" | "the cache should update" |
| One requirement per sentence | "must validate and save" | "must validate" + "must save" |
| Active voice | "the file is saved by the system" | "the system saves the file" |
| No weasel words | "usually completes quickly" | "completes within 5 seconds" |
| Define domain terms on first use | "the scheduler runs" | "the **scheduler** (background job processor) runs" |

## Edge Cases

WHEN human says "just build it" but open questions remain
THEN document unresolved items as "Acknowledged risk: [description]" in Open Questions section, then proceed.

WHEN human provides feedback during Phase 3 that reveals missing requirements
THEN MAY return to Phase 1 (Discover) to explore the gap before revising.

## Non-Goals

- This process does not cover implementation
- This process does not cover verification of implementation against spec
- This process does not prescribe project management or prioritization
