---
name: to-tickets
description: Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker (edges as text in one file per ticket locally, or native blocking links on a real tracker).
disable-model-invocation: true
---

# To Tickets

Break a plan, spec, or conversation into a set of **tickets**: tracer-bullet vertical slices, each declaring the tickets that **block** it.

The issue tracker and triage label vocabulary should have been provided to you. If not, tell the user to run `/setup-factory-skills`.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Decide the structure

Decide how many tickets there are and how they relate, before you cut anything. Of all the steps here, this one has the largest effect on the work that follows.

One source can produce several top-level tickets. Where the work covers separate responsibilities, it becomes separate tickets, even when one acceptance list could have covered them all. A ticket with twenty criteria is usually three tickets that nobody separated.

Two relationships are available, and the test is whether each piece delivers value on its own.

**Peers with blocking edges.** Each piece is worth having by itself, even when one must land before another. This is the common case.

**A parent with children.** The pieces together produce one outcome and no piece delivers value alone. Two situations produce this shape most often: the work crosses repositories or packages that deploy separately, such as a backend and a frontend that must ship together; and one vertical is too large for a single context window and has to be split.

What drives the breakdown, in rough order of force:

- **Responsibility.** Two responsibilities are two tickets. This overrides the rest.
- **Deploy boundaries.** Count the independent deploys standing between the work and a demoable outcome, not the repositories.
- **Repo layout.** A monorepo can carry backend and frontend in one vertical. Separate repos need a ticket each, under a parent when they ship together.
- **Feature flags.** Behind a flag a larger vertical can land safely, because nothing is visible until it flips. Without one, slice to demoable increments. Ask whether a flag exists before cutting.
- **Reviewers.** Work crossing codebases with different reviewers becomes separate pull requests, so give it separate tickets.
- **Parallelism.** Tickets meant to run at the same time need boundaries that follow the files they touch, or the sessions collide in the working tree.
- **Verification cost.** Do not bundle a ticket whose acceptance takes forty minutes of evals with three cheap ones. The wait then dominates all four.
- **Irreversibility.** Schema and wide-refactor work keeps its own sequence, which overrides vertical slicing.

The conversation often uncovers work that nobody has shaped yet. It does not get a ticket here. File it in triage with a title and one line of what and why, so it survives without being costed.

### 4. Cut the slices

Break each unit into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests): vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges**: the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket; green is promised only there.

### 5. Write each ticket

Use the same register as the spec: ASD-STE100 Simplified Technical English with the ubiquitous language from `CONTEXT.md` (follow `CONTEXT-MAP.md` to the right one if the repo has more than one). One idea per sentence, active voice, present tense.

Titles name the change. Write "App: acknowledge Kai's answer from the chat surface". Do not write "Runner: stop stalling on client tool calls nobody will answer".

**What to build.** The end-to-end behaviour this ticket makes work, from the user's perspective, not a layer-by-layer implementation list. Define the terms the ticket turns on in the first lines. Name the modules and components the work touches, so the reader does not spend an hour finding out which module "the chat surface" is. Use the shape that carries the content: write triggers and their outcomes as a table, an ordered interaction as numbered steps or a two-actor sequence diagram, a structural change as a file tree or a component list. Follow the `show-me` conventions.

**Problem Statement** and **Implementation Decisions.** Include these only when no parent spec carries them. A ticket without a parent is a small spec, so it holds its own context: the problem from the user's perspective, and one entry for each decision someone could get wrong with the fact that forced it and the rejected alternative in one clause. A ticket with a parent inherits both by reference, because whoever implements it reads the parent first.

**Acceptance criteria.** Follow `references/acceptance-criteria.md`. Where a parent spec already has them, distribute them to the tickets they belong to and add whatever each slice needs on its own.

**Testing.** One line naming the seam this slice tests at and the nearest similar test in the codebase. The parent's testing decisions are written before the slicing, so they may not describe this slice.

### 6. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Ask the user:

- Is this one vertical or several? Should any of these be peers rather than children?
- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct: does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown. Ask the shape question first, because the answer changes every other answer.

### 7. Publish the tickets to the configured tracker

Publish the approved tickets. **How** depends on the tracker `/setup-factory-skills` configured; the tickets are the same either way, only the shape of the blocking edges changes:

- **Local files** → write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below: one ticket per file, never a single combined file.
- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking / sub-issue relationship where it has one; otherwise set each ticket's "Blocked by" to the blocking issues. Do NOT apply the `ready-for-agent` label: approval is the user's.

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

Do NOT close or modify any parent issue.

<local-ticket-template>

# <NN>: <Ticket title>

**Problem:** the problem from the user's perspective. Include only when no parent carries it.

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective, not a layer-by-layer implementation list.

**Implementation decisions:** include only when no parent carries them.

**Testing:** the seam this slice tests at, and the nearest similar test.

**Blocked by:** the numbers/titles of the tickets that gate this one, or "None (can start immediately)".

- [ ] Given <state>, when <trigger>, then <single observable outcome>.

</local-ticket-template>

<issue-template>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## Problem Statement

The problem that the user is facing, from the user's perspective. Omit this section when a parent carries it.

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective, not layer-by-layer implementation.

## Implementation Decisions

One entry for each decision someone could get wrong, each with the fact that forced it and the rejected alternative. Omit this section when a parent carries them.

## Testing

The seam this slice tests at, and the nearest similar test in the codebase. One line.

## Acceptance criteria

- [ ] Given <state>, when <trigger>, then <single observable outcome>.

## Blocked by

A reference to each blocking ticket. Omit this section when there are none, rather than writing "none".

</issue-template>

In either form, avoid specific file paths or code snippets: they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.
