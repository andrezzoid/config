---
name: find-unknowns
description: Surface the gaps between what the human thinks the work is and what the territory will actually demand — blindspot passes, one-question-at-a-time interviews, and assumption audits. Use at the start of any non-trivial change, when entering unfamiliar territory, or when the human seems unsure what to ask for. This is the move before a settled plan exists; once a plan or artifact exists, poke-holes is the adversarial counterpart.
---

# Find Unknowns

The map (the prompt, the plan, the theory) never matches the territory (the codebase, the domain, the real world). The gap is unknowns, and every one surfaced while it's cheap is one that doesn't surface mid-implementation where it's expensive. The skill here is diagnosing *which kind* of unknown you're facing, because each kind yields to a different move.

## Four kinds, four moves

| Kind             | Symptom                          | Move                                      |
| ---------------- | -------------------------------- | ----------------------------------------- |
| Known knowns     | already in the brief             | restate them back — confirm you both read the same words the same way |
| Known unknowns   | "we haven't decided X yet"       | **interview**                             |
| Unknown knowns   | "I'll know it when I see it"     | **make it reactable** — prototype / visualize |
| Unknown unknowns | silence — nobody knows to ask    | **blindspot pass**                        |

## The moves

### Blindspot pass

Survey the territory the human likely hasn't: the relevant code and its history, prior attempts (old branches, issues, commits), conventions the change must obey, hidden coupling — and how good the result *could* be, since the human may not know what's possible. Report only what would change the human's decisions; a blindspot pass that returns a tour is a failed pass.

### Interview

One question at a time — batches bewilder. Prioritize questions whose answer would change the architecture, and attach your recommended answer to each. If the codebase can answer a question, go read the codebase instead of asking. Stop when the remaining questions no longer change what you'd build.

### Assumption audit

List what the plan is standing on. Tag every assumption with evidence — `file:line`, doc, test, measurement — or the honest tag `guess`, plus what breaks if it's wrong. Untagged assumptions are how confident nonsense gets built; the `guess` tags are also poke-holes' first targets.

### Ask for references

When the human can't articulate what they want, don't push harder on words — ask for a pointer. Source code beats docs beats pictures beats prose ("like the backoff in vendor/rate-limiter, but in our client").

## Output

An unknowns board — each entry: the unknown, its kind, and a disposition: **resolving** (who, how), **assumed** (→ the audit, with its evidence tag), or **deferred** (explicitly, with the human's nod). Inside a delta, merge into `## Unknowns` and `## Assumptions`. Outside one, the board goes wherever the work's record lives — the plan, the issue, the PR description: a tagged assumption only pays off if it lands where a later check (poke-holes) can read it, and a board that lives only in your reply dies with the scroll.

**Done when:** every surfaced unknown has a disposition and no assumption is untagged. Not when the list is empty — it never is. Unknowns found mid-build are normal; this move just shifts the bulk of them to where they're cheap.
