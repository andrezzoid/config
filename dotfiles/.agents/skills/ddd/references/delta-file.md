# Authoring the delta file

Per-topic detail for the one file per delta, consulted when writing its sections. SKILL.md §1 carries the routing-surface rules (frontmatter `state`, log=git); the two integrity rules below are recalled by each state's reference where they bite.

## Integrity

- **Frozen pair:** after ratification `## Theory` and `## Acceptance` are immutable — frozen by name, not file position. Editing either forces `state: aligning` and re-ratification, because the measure can't shift while the optimizer runs (Goodhart).
- **No status marks:** a checked box is a self-report. Task completion is *derived* by running the task's acceptance check (ground truth) and reading history's diffs for what landed.

## Sections

SK §1 fixes the normative order; per-section detail:

- **`## References`** — each pointer carries a one-line *why*.
- **`## Glossary`** (optional) — definitions for coined terms; a deriver tripping on undefined vocabulary found a gap here. Most deltas skip it.
- **`## Open`** — live questions and forks, drained before any ratification proposal.
- **`## Tasks`** — definitions only: description, inline acceptance check, `needs:` for ordering. Ids short kebab-case, unique within the delta.
- **`## Followups`** — out-of-scope discoveries accepted mid-work, dispositioned with the human at committing.

Every section is readable by a third person with zero conversation context — the *different-words test* (from comments-as-design) applies. Sections outside the frozen Theory/Acceptance pair are live by design.

## Theory: prose, checked by derivation

Mandatory forms get filled to look complete, so completeness is checked by *derivation* — gaps surface as the derivers' invented assumptions. This checklist only *guides* consolidation, never a form to fill: goal · domain entities (class diagram when the domain model changes) · approach with rejected alternatives · structure sketch (module boundaries and interfaces, stated plainly — tasks follow them) · norms deviations · constraints · invariants · assumptions (each with its sensitivity) · non-goals · risks. Operations are excluded on purpose: the plan must be *derivable*, never dictated — a theory you must spell the steps out for hasn't converged.

## Acceptance: falsifiability, not grammar

Each criterion: `criterion — check: <observable procedure>`. Behavioral criteria become **failing executable checks before implementation** (ATDD); invariants become property tests or audits; non-code artifacts get scenario runs. Mock-theater is forbidden: "untestable without heavy mocks" is design feedback first (extract a functional core), a logged exemption only second.

## Margin: declared discretion

Rigid: what counts (the ratified measure), who checks (non-authors), gate authority, artifact integrity. Everything *how* — check intensity, task workspace (add, split, reorder tasks when derivable from ratified theory), parallelism, spikes, harvest selection — is agent judgment, **declared in the delta, never silent**, visible in the file and its diffs. A reduction = running less than the default machinery, declared per check; no named tiers (a label invites cargo-culting the label instead of judging the delta).
