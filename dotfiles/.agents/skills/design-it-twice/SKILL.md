---
name: design-it-twice
description: Generate at least two fundamentally different designs and compare them before implementing. Use whenever you're about to design or implement a non-trivial module, class, API, data structure, service, or system component. Also trigger when refactoring, or when the user asks to "redesign", "rethink", or "explore alternatives". Be aggressive — committing to the first design that comes to mind is the single biggest source of mediocre software.
---

# Design It Twice

## Overview

> "Even if you are sure that there is only one reasonable approach, consider a second design anyway, no matter how bad you think it will be. It will be instructive to think about the weaknesses of that design and contrast them with the features of your best design."
> — John Ousterhout, _A Philosophy of Software Design_

Designing twice is cheap. Implementing twice is not. Spending fifteen minutes sketching two interfaces almost always produces a better module than committing to the first idea. The first idea is rarely the best — and the act of designing an alternative reveals the assumptions hidden in the original.

This is most valuable for interfaces, where mistakes are the most expensive to fix later.

## When to Use

Trigger this skill before:

- Designing a new module, class, service, or API
- Choosing a data structure or algorithm for a non-trivial problem
- Restructuring or refactoring an existing component
- Making an architectural decision (sync vs. async, push vs. pull, etc.)
- Responding to "how should we build this?" or "what's the best approach?"

Skip only for truly trivial changes — renaming a variable, fixing a typo, adding a log line. If you're unsure whether it's trivial, it isn't.

## The Workflow

### Step 1: Frame the Problem

Write down, before any solution:

- **What** the module/component must accomplish (not how)
- **Who** uses it (callers, users, neighboring modules)
- **What constraints** apply (performance, compatibility, existing patterns)

Use a comment or interface description. Describing the abstraction in words first forces clarity about what you're actually designing.

> "If users must read the code of a method in order to use it, then there is no abstraction: all of the complexity of the method is exposed."

**Done when:** a colleague could read your framing and tell you what the module is for without seeing any code.

### Step 2: Design Alternative A

Write the interface for your first approach — function signatures, class API, data shapes, the doc comment a caller would read. **Do not implement.**

**Done when:** the interface fits on one screen and a caller could use it without reading the implementation.

### Step 3: Design Alternative B — Fundamentally Different

Alternatives must differ **fundamentally**, not incrementally. If you can describe both designs with the same one-sentence summary, they are the same design.

Pick a dimension below and force a different choice on that axis:

| Dimension         | Example variations                                 |
| ----------------- | -------------------------------------------------- |
| Decomposition     | One module vs. several collaborating modules       |
| Data flow         | Push (events/callbacks) vs. pull (polling/queries) |
| Data structure    | Map vs. list, normalized vs. denormalized          |
| Abstraction level | General-purpose library vs. task-specific helper   |
| Control flow      | Imperative vs. declarative, sync vs. async         |
| State ownership   | Centralized vs. distributed, mutable vs. immutable |

**Done when:** A and B differ on at least one row of this table — not just naming, signatures, or method order.

### Step 4: Compare on Concrete Axes

Evaluate each alternative against these criteria. Be honest — every design has tradeoffs.

- **Interface simplicity** — Which has the simpler, more intuitive API?
- **Information hiding** — Which encapsulates more implementation decisions?
- **Flexibility** — Which adapts better to likely future changes?
- **Error surface** — Which has fewer error conditions to handle?
- **Cognitive load** — Which is easier to use correctly and hard to use incorrectly?

Bias toward the deeper module — simpler interface, richer implementation:

> "The best modules are deep: they have a lot of functionality hidden behind a simple interface. A deep module is a good abstraction because only a small fraction of its internal complexity is visible to its users."

Present the comparison as a brief table or list, not a wall of prose.

**Done when:** at least three axes are evaluated and the table makes the tradeoffs visible.

### Step 5: Choose and Justify

Pick the better design and state _why_ in one or two sentences, naming the axes that drove the decision.

If the choice isn't obvious, that's signal — the design space is richer than expected. Sketch a third alternative, or surface the question to the user.

**Done when:** the decision is written down and a reader can tell which tradeoff was decisive.

## Fundamentally Different vs. Cosmetic Variation

**DON'T: Cosmetic variation** — Same structure, renamed methods.

```typescript
// Alternative A
class EventBus {
  subscribe(eventType: string, handler: EventHandler): void { ... }
  publish(eventType: string, data: unknown): void { ... }
}

// Alternative B (just renamed methods — same design)
class EventBus {
  on(eventType: string, handler: EventHandler): void { ... }
  emit(eventType: string, data: unknown): void { ... }
}
```

**DO: Fundamentally different approach** — Different decomposition, data flow, or abstraction.

```typescript
// Alternative A: Observer pattern — publishers don't know subscribers
class EventBus {
  subscribe(eventType: string, handler: EventHandler): void { ... }
  publish(eventType: string, data: unknown): void { ... }
}

// Alternative B: Direct dependency injection — explicit wiring, no runtime dispatch
class OrderProcessor {
  constructor(
    private inventory: InventoryService,
    private notifications: NotificationService,
  ) {}

  process(order: Order): void {
    this.inventory.reserve(order.items);
    this.notifications.sendConfirmation(order);
  }
}
```

These differ in a real way: decoupled-but-implicit vs. coupled-but-explicit. Each has genuine tradeoffs worth evaluating.

See `references/examples.md` for the full design-it-twice workflow applied to real problems.

## Common Rationalizations

| Rationalization                                           | Reality                                                                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| "The first design is obviously right."                    | The exercise reveals the assumptions baked into the first approach. Even when you keep it, you'll know _why_ it's right.      |
| "This is too simple to need two designs."                 | Simple problems are where this is _easiest_ — the alternatives are quick to evaluate. Five minutes now beats hours of rework. |
| "I don't have a second idea."                             | That's the signal you need this most. Pick a dimension from the table and force a different choice on that axis.              |
| "Alternative B is clearly worse — why bother writing it?" | Writing the worse design teaches you why the first one is good — or surfaces a hybrid that's better than both.                |
| "I'll just pick the one with more features."              | More features means a wider interface, which means a shallower module. The deeper design usually does _less_, but cleanly.    |

## Red Flags

- Code was written before two interfaces existed.
- Both alternatives have the same shape, with renamed methods or reordered arguments.
- The comparison table has only one row, or every row says "A is better."
- Alternative A was picked before Alternative B was written.
- The decision skipped the comparison entirely ("A is simpler" with no axes named).

## Verification

Before implementing, confirm:

- [ ] Two designs written down as interfaces, not just held in mind.
- [ ] The two differ on at least one row of the dimensions table.
- [ ] Compared on at least three axes from Step 4.
- [ ] Choice stated in one or two sentences, naming which axes drove it.
- [ ] If the choice was non-obvious, sketched a third alternative or asked the user.
