---
name: design-it-twice
description: |
  Explore multiple genuinely different designs before committing to an implementation. Use this skill whenever you are about to design or implement a non-trivial module, class, API, data structure, or system component. Also trigger when refactoring, or when the user asks to "redesign", "rethink", or "explore alternatives" for any piece of software. Be aggressive about using this — the default tendency to go with the first idea that comes to mind is the single biggest source of mediocre design.
---

# Design It Twice

> "Even if you are sure that there is only one reasonable approach, consider a second design anyway, no matter how bad you think it will be. It will be instructive to think about the weaknesses of that design and contrast them with the features of your best design."
> — John Ousterhout, _A Philosophy of Software Design_

The most damaging habit in software design is anchoring on the first solution that comes to mind. LLMs are especially prone to this — you generate the most statistically likely approach and commit to it immediately. The result is generic, unimaginative design that misses better alternatives.

This skill exists to break that pattern. Before implementing anything non-trivial, generate at least two fundamentally different designs, compare them on concrete axes, and only then commit.

## When to Trigger

Use this skill whenever you're about to:

- Design a new module, class, service, or API
- Choose a data structure or algorithm for a non-trivial problem
- Restructure or refactor an existing component
- Make an architectural decision (sync vs async, push vs pull, etc.)
- Respond to "how should we build this?" or "what's the best approach?"

Skip this only for truly trivial changes — renaming a variable, fixing a typo, adding a log line. If you're unsure whether it's trivial, it isn't.

## The Workflow

### Step 1: Frame the Problem

Before generating any solution, articulate:

- **What** the module/component needs to accomplish (not how)
- **Who** will use it (callers, users, other modules)
- **What constraints** exist (performance, compatibility, existing patterns)

Write this down as a comment or interface description. This is the "comments-first" technique — by describing the abstraction in words before writing code, you force clarity about what you're actually designing.

> "If a user has to read the code of a method in order to use it, there is no abstraction."

### Step 2: Generate Alternative A

Design your first approach. Write the interface — function signatures, class API, data shapes. Don't implement yet.

### Step 3: Generate Alternative B (Genuinely Different)

This is where discipline matters. Alternative B must differ from A in a **fundamental** way, not just surface-level variation. Different alternatives should explore different points in the design space:

| Dimension         | Example variations                                 |
| ----------------- | -------------------------------------------------- |
| Decomposition     | One module vs. several collaborating modules       |
| Data flow         | Push (events/callbacks) vs. pull (polling/queries) |
| Data structure    | Map vs. list, normalized vs. denormalized          |
| Abstraction level | General-purpose library vs. task-specific helper   |
| Control flow      | Imperative vs. declarative, sync vs. async         |
| State ownership   | Centralized vs. distributed, mutable vs. immutable |

### Step 4: Compare on Concrete Axes

Evaluate each alternative against these specific criteria. Be honest — every design has tradeoffs.

- **Interface simplicity** — Which has the simpler, more intuitive API?
- **Information hiding** — Which encapsulates more implementation decisions?
- **Flexibility** — Which adapts better to likely future changes?
- **Error surface** — Which has fewer error conditions to handle?
- **Cognitive load** — Which is easier to use correctly and hard to use incorrectly?

Present the comparison as a brief table or list, not a wall of prose.

### Step 5: Choose and Justify

Pick the better design and state _why_ in one or two sentences. If the choice isn't obvious, that's valuable information — it means the design space is richer than expected, and you may want to explore a third alternative or ask the user.

## DO and DON'T

**DON'T: Cosmetic variations** — Same structure with different names or minor API tweaks.

```
# These are NOT genuinely different designs:
# Alternative A
class EventBus:
    def subscribe(self, event_type, handler): ...
    def publish(self, event_type, data): ...

# Alternative B (just renamed methods — same design)
class EventBus:
    def on(self, event_type, handler): ...
    def emit(self, event_type, data): ...
```

**DO: Fundamentally different approaches** — Different decomposition, data flow, or abstraction.

```
# Alternative A: Observer pattern — publishers don't know subscribers
class EventBus:
    def subscribe(self, event_type, handler): ...
    def publish(self, event_type, data): ...

# Alternative B: Direct dependency injection — explicit wiring, no runtime dispatch
class OrderProcessor:
    def __init__(self, inventory: InventoryService, notifications: NotificationService):
        ...
    def process(self, order):
        self.inventory.reserve(order.items)
        self.notifications.send_confirmation(order)
```

These differ in a real way: decoupled-but-implicit vs. coupled-but-explicit. Each has genuine tradeoffs worth evaluating.

See `references/examples.md` for extended examples showing the full design-it-twice workflow applied to real problems.

## Common Pitfalls

**"The first design is obviously right."** It almost never is. The exercise of considering an alternative reveals assumptions baked into your first approach. Even if you end up choosing it, you'll understand _why_ it's the right choice.

**"This is too simple to need two designs."** Simple problems are exactly where you learn the most from this exercise, because the alternatives are easier to evaluate. A five-minute detour now can save hours of rework.

**"I'll just pick the one with more features."** More features means a more complex interface. The best design is often the one that does _less_ but does it deeply and cleanly.

> "The most important consideration in designing a module is to be selective about what to expose and what to hide. The best modules are those whose external interface is much simpler than their implementation."
