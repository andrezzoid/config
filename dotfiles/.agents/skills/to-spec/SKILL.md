---
name: to-spec
description: "Turn the current conversation into a spec for the user to approve: no interview, just synthesis of what you've already discussed."
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user; just synthesize what you already know.

Write a spec for every unit of work the conversation settled. Usually that is one. Where the conversation settled more than one, write each of them. Do not write a spec for a unit that is still open: it takes little time to name a unit and much longer to shape one.

## Process

### 1. Explore the repo

Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

### 2. Sketch the seams

Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

### 3. Draft the spec

Write the draft to `.scratch/<slug>/spec.md`. Nothing reaches the tracker before the user approves it.

An agent builds from the spec and a human approves it. Both need each decision stated once, with the fact that forced it.

Write in ASD-STE100 Simplified Technical English with the ubiquitous language from `CONTEXT.md` (follow `CONTEXT-MAP.md` to the right one if the repo has more than one). This is the register the `wait-what` skill re-pitches into, so a spec written this way needs no re-pitch.

- One idea per sentence. Active voice. Present tense.
- State each fact once. A fact in Problem does not appear again in Solution or in a decision. Repeated facts drift apart: one spec named the same incident in five places and gave it two different dates.
- Leave out what a competent engineer works out unaided. Advice about testing or design applies to every repo and tells the reader nothing about this one.
- Write an ordered algorithm as numbered steps. Write conditions and their outcomes as a table. Follow the `show-me` conventions.
- Titles name the change. Write "Runner: time out unanswered client tool calls". Do not write "Runner: stop stalling on client tool calls nobody will answer".
- Gloss every term, product and service the first time it appears, or link its entry in `CONTEXT.md`. A reader who has never seen this codebase cannot tell whether a name is a product, a service or a person.

<spec-template>

## Decision

One sentence names the design question this settles. One sentence gives the
answer. This goes first because some readers stop here.

## Problem Statement

The problem that the user is facing, from the user's perspective. Cite the
incident once, with its date.

## Solution

The solution to the problem, from the user's perspective. Two or three sentences.

## Implementation Decisions

One entry for each decision someone could get wrong:

- **<the decision, one line>** — forced by <the fact in the territory that made it
  the sensible choice, naming the module or the source>. Not <the rejected
  alternative>, because <one clause>.

Record the rejected alternative so nobody reopens the argument in three weeks. One
clause is enough.

Cover the modules and interfaces that change, schema changes, API contracts, and
the races, deadlocks and ordering constraints. Where this reverses an earlier
decision, say so and give the reason. Name every constant with its units. Nobody
can reconstruct these entries from the code.

Do NOT include specific file paths or code snippets. They may end up being
outdated very quickly. Name modules and components so the work can be found.

Exception: if a prototype produced a snippet that encodes a decision more
precisely than prose can (state machine, reducer, schema, type shape), inline it
within the relevant decision and note briefly that it came from a prototype. Trim
to the decision-rich parts, not a working demo, just the important bits.

## Acceptance Criteria

Written in step 4.

## Testing Decisions

Which modules will be tested, and prior art for the tests (similar types of tests
in the codebase). List a case only where the decisions above leave it in doubt.

## Out of Scope

A description of the things that are out of scope for this spec. Write down the
loose ends the conversation raised and left, so they survive as text even when
nobody makes a ticket for them.

</spec-template>

### 4. Write the acceptance criteria

Follow `references/acceptance-criteria.md`.

### 5. Present for approval

Show the user the draft and take their changes. Stop when they approve it.

Nothing is published here. Approval is the gate, and the user decides what follows: `to-tickets` to cut the work up, or `implement` to build it as it stands.
