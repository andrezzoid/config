# Spec Template

```markdown
---
id: SPEC-XXX-NNN
status: draft
supersedes: SPEC-XXX-NNN # optional
---

# [Spec Title]

## Intent

<!-- MUST: 1-3 sentences. What problem are we solving? -->

## Keywords

The keywords MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in [RFC 2119](https://www.ietf.org/rfc/rfc2119.txt).

## Constraints

<!-- MUST: Hard boundaries using RFC 2119 keywords -->
<!-- Format: "The [component] MUST/MUST NOT/SHOULD/MAY [behavior]" -->

-

## [Type-Specific Content]

<!-- For Feature specs: ## Behaviors -->
<!-- For Process specs: ## Phase 1: [Name], ## Phase 2: [Name], etc. -->

## Non-Goals

<!-- SHOULD: Explicit scope exclusions -->

-

## Open Questions

<!-- MUST: Empty or acknowledged risks before locking -->
<!-- Format: "Acknowledged risk: [description]" for skipped items -->

None.

## Acceptance Criteria

<!-- MUST: Verifiable checkboxes -->

- [ ] WHEN [trigger] THEN [observable outcome]
- [ ] GIVEN [precondition] WHEN [action] THEN [result]
- [ ] [Component] MUST [measurable behavior]
```

## Section Requirements

| Section | Requirement | Purpose |
|---------|-------------|---------|
| Frontmatter | MUST | ID, status, supersedes (if applicable) |
| Intent | MUST | Problem being solved |
| Keywords | MUST | RFC 2119 reference |
| Constraints | MUST | Hard boundaries |
| [Type-Specific] | MUST | Behaviors or Phases |
| Non-Goals | SHOULD | Scope exclusions |
| Open Questions | MUST | Unresolved items or acknowledged risks |
| Acceptance Criteria | MUST | Verifiable checkboxes |

## Behavior Formats

**EARS (event-driven):**
```
WHEN [trigger] THEN [outcome]
```

**BDD/Gherkin (stateful):**
```
GIVEN [precondition]
WHEN [action]
THEN [result]
```
