---
name: visualize
description: Render decisions, plans, structures, and evidence as single-file HTML artifacts the human opens and reacts to — option comparisons, implementation plans, module maps, annotated diffs, explainers. Use whenever the human must compare more than two of anything, understand a structure (modules, flows, pipelines), review a substantial change, or whenever a wall of prose is about to be the interface.
---

# Visualize

Prose flattens spatial information. Options end up sequential when they should sit side by side; module graphs become nested bullets; diffs scroll past the shape of the change. An HTML file restores the geometry — and a human pointing at a rendered thing ("that one, but with the left layout") transmits more alignment per minute than any document. When the choice is "write three paragraphs" vs. "render three boxes": render.

## Patterns

Pick by what the human must *do*:

- **Choose** → options side by side, tradeoffs inline at the point they bite, your recommendation visibly marked. Fake-but-realistic data everywhere — plausible names and values help the human react truthfully; visual polish only makes them polite.
- **Approve a plan** → lead with what they're most likely to tweak: data models, interfaces, UX flows, anything user-facing. Bury the mechanical refactors at the bottom. A plan artifact is a *decision surface*, not documentation.
- **Understand structure** → boxes and arrows: modules, data flow, pipelines, the hot path highlighted. Inline SVG — it's a real pen.
- **Review a change** → annotated diff: margin notes on the *why*, severity tags, jump links, a file-by-file tour ordered by where review attention matters most.
- **Absorb and verify** → explainer: context, intuition, what changed and why — ended with a short quiz (hand off to quiz-me for the interactive version).

## Rules

1. **One self-contained file.** Inline CSS/JS, no build step, no server. Write it to the scratchpad (or next to the delta when it's ship evidence) and `open` it for the human — or, with no display, hand them the path.
2. **Lead with the changeable.** Order everything by likelihood-the-human-tweaks-it, not by logical completeness.
3. **A reaction is the goal.** The artifact succeeds when the human points, disagrees, picks, or asks. "Looks good" with no decision made means the artifact asked no question — put the question *in* the artifact.
4. **Feed the reaction back.** The render matters only for what it changes: record the pick or tweak where it belongs (delta Theory, the plan, the code). Artifacts are disposable; decisions aren't.
