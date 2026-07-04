---
name: prototype
description: Build throwaway code that answers one named design question — logic harnesses to feel out a state model, or side-by-side variants the human reacts to. Use when a decision is stuck on "I'll know it when I see it", when a fork needs grounding before anyone commits to it, or when the human is choosing between approaches they haven't seen.
---

# Prototype

A prototype is **throwaway code that answers one named question**. Write the question down first — literally, at the top of the file. If you can't name the question, you're not prototyping; you're starting the implementation early.

Prototypes exist because reacting beats reading: a human staring at three running variants makes a better call in five minutes than one reading three pages of tradeoffs in thirty. And they de-risk unknown knowns — the criteria the human can only state after seeing something violate them.

## Shape follows question

- **"Does this logic / state model / algorithm hold up?"** → the smallest runnable harness: a script or tiny CLI that pushes the model through the cases that are hard to reason about on paper. Print the full state after every step — the human aligns by watching it move.
- **"Which of these should it be?"** (design fork, look-and-feel, interaction) → one variant per defensible stance, side by side. For anything visual or interactive, a single HTML file with a variant switcher (load visualize). Variants must be *genuinely* different — same shape with renamed parts wastes the human's reaction (design-it-twice's cosmetic-variation test applies).

## Rules

1. **Marked throwaway from the first line.** Name and header comment say PROTOTYPE. It lives in the scratchpad unless it must import project code — then in-repo, still PROTOTYPE-named, never committed.
2. **One command to run.** The human must be able to start it without thinking.
3. **No polish.** No tests, no error handling beyond runnable, no abstractions. Polish spends time and — worse — makes the human polite about it.
4. **Fake everything you're not testing.** In-memory state, hardcoded data. Persistence, auth, wiring: faked unless one of them *is* the question.
5. **The answer is the only deliverable.** Capture it where it outlives the prototype — the delta's Theory (decision plus rejected alternative), a commit message, a comment — then delete the prototype.

**Done when:** the named question has a written answer in a durable home, and the prototype is deleted (or explicitly parked with the human's nod).
