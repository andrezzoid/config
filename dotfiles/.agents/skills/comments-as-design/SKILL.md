---
name: comments-as-design
description: |
  Use comments as a design tool — not afterthought documentation — to capture abstractions, reveal intent, and reduce cognitive load. Based on John Ousterhout's A Philosophy of Software Design (Chapters 12–15). Use this skill whenever writing, reviewing, or refactoring code that involves module boundaries, public interfaces, data structures, or non-trivial logic. Also trigger when the user asks to "add comments", "document this", "explain this code", or when you're about to write any interface, class, or public function. This is critical for LLM-generated code, which consistently produces the exact comment anti-patterns Ousterhout warns against: repeating code in English, commenting the obvious while ignoring the non-obvious, and treating comments as decoration rather than design.
---

# Comments as Design

> "If you want to use abstractions to hide complexity, comments are essential."
> — John Ousterhout, _A Philosophy of Software Design_

Comments are not documentation you add after the fact. They are a **design tool** — the primary mechanism for capturing abstractions, intentions, and decisions that code alone cannot express. A well-commented interface tells its caller everything they need without reading the implementation. An uncommented one forces every reader to reverse-engineer the designer's intent from the code.

LLMs have specific, consistent bad habits with comments. The default instinct is to parrot code back in English, over-explain the obvious, ignore the non-obvious, and treat all comments as the same category. The result is noise that increases cognitive load — the exact opposite of what comments should do.

This skill exists to break those patterns. Every comment should make code easier to understand by capturing information that **isn't already in the code itself**.

## When to Trigger

Use this skill whenever you're:

- Writing a new module, class, function, or API
- Adding or reviewing comments on existing code
- Implementing an interface or data structure
- Refactoring and need to explain design decisions
- Responding to "document this", "add comments", or "explain this code"

If you're writing code that other code will call, this skill applies.

## Principle 1: Write the Comments First

This is the most important and least followed principle. Write the interface comment **before** the implementation. Not after. Not "when you get around to it." First.

> "If users must read the code of a method in order to use it, then there is no abstraction: all of the complexity of the method is exposed."

Writing the comment forces you to describe the abstraction. If you can't write a clear, concise description of what a module does and how to use it, **the design isn't right yet**. The difficulty of writing the comment is direct feedback about design quality.

This is to module design what TDD is to correctness — a forcing function that catches problems at the cheapest possible moment.

### How it works

1. Write the interface comment (what it does, not how)
2. Examine the comment — is the abstraction clear? Simple? Complete?
3. If the comment is hard to write or full of caveats, reconsider the design
4. Write the implementation
5. Update the comment if the implementation revealed new insights

### DON'T: Write code first, comment later

```typescript
function processOrder(order: Order): Result {
  const validated = validateOrder(order);
  const priced = applyPricing(validated);
  const saved = saveToDatabase(priced);
  return sendConfirmation(saved);
}
// Processes an order by validating, pricing, saving, and sending confirmation.
```

The comment restates the code. It was clearly written after the fact by reading the function body and transcribing it to English. It tells you nothing you couldn't already see.

### DO: Write the comment first, let it guide design decisions

```typescript
/**
 * Submits an order for fulfillment.
 *
 * Validates all line items against current inventory, calculates
 * final pricing (including applicable promotions), and persists
 * the order atomically — a partial failure rolls everything back.
 *
 * Returns a failed Result if validation fails. Callers can inspect
 * Result.errors for user-facing messages. Does not throw.
 */
function submitOrder(order: Order): Result {
```

This comment was written first. It forced design decisions: Should failure throw or return? (Return.) Is it atomic? (Yes.) What does the caller handle? (Result.errors.) These decisions were made explicit before a line of implementation was written — and the cleaner name `submitOrder` emerged naturally from describing the abstraction.

---

## Principle 2: Describe What Isn't Obvious

The common advice "explain the _why_, not the _what_" is an oversimplification that leads LLMs astray. Ousterhout's actual principle is more precise: **comments should describe things that aren't obvious from the code.** What's "not obvious" differs by comment type:

- **Interface comments** → describe **what** (the abstraction). What it does, what it guarantees, what it returns, side effects. The caller should never need to read the implementation.
- **Implementation comments** → describe **why** (the reasoning). Why this algorithm? Why this order of operations? Why this tradeoff?
- **Field/variable comments** → describe **what it represents** (the full meaning). Units, constraints, relationships, invariants — everything the name alone can't convey.

### The interface vs. implementation distinction

This is the distinction LLMs almost never make. Interface comments and implementation comments serve **different audiences** with **different needs**.

**Interface comment** — written for the caller, describes the abstraction:

```typescript
/**
 * Returns shipping cost in cents for the given weight and destination.
 *
 * Uses tiered pricing: under 1lb flat rate ($4.99), 1-5lb regional
 * carriers, over 5lb freight. Returns 0 for unsupported destinations —
 * caller should check canShipTo() first if they need to distinguish
 * "free shipping" from "can't ship here."
 */
function calculateShipping(weightLbs: number, zipCode: string): number;
```

The caller knows everything they need. They'll never read the implementation. That's the point.

**Implementation comment** — written for the maintainer, explains reasoning:

```typescript
// Process oldest items first. Newer items are more likely to be
// modified again, so doing them last reduces wasted work when
// items change mid-batch.
queue.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
```

The code says _what_ happens (sort by created*at). The comment explains \_why* that ordering matters.

### DON'T: Apply "explain why" to interface comments

```typescript
/**
 * We use this function because we need to look up users.
 */
function findUser(id: string): User | undefined;
```

This "explains why" but says nothing useful about the abstraction.

### DO: Match the comment to its purpose

```typescript
/**
 * Looks up a user by ID. Returns undefined if no user exists —
 * does not throw. For contexts where the user must exist (e.g.,
 * authenticated routes), use getUser() which throws on missing users.
 */
function findUser(id: string): User | undefined;
```

Describes the abstraction: return semantics, failure behavior, and when to choose a different method. A caller can use this correctly without reading a line of implementation.

---

## Principle 3: The Different Words Test

A concrete heuristic for catching useless comments: **if your comment uses the same words as the thing it describes, it's probably adding nothing.**

Force yourself to describe the concept at a different level of abstraction. If you can't, either the comment is unnecessary (the code is self-explanatory) or you don't understand the concept well enough yet.

### DON'T: Mirror the code's vocabulary

```typescript
/** The count of items. */
itemCount: number;

/** Returns true if the user is active. */
isActive(): boolean;

/** Sends a notification to the user. */
sendNotification(user: User, message: string): void;
```

Every comment restates the name. Delete all three — they're pure noise.

### DO: Add information the name can't carry

```typescript
/** Items currently in the cart, including out-of-stock items
    that haven't been removed yet. */
itemCount: number;

/** True if the user has logged in within the last 30 days
    and hasn't been suspended by an admin. */
isActive(): boolean;

/** Delivers a message through the user's preferred channel
    (email, push, or SMS). Silently drops the message if the
    user has disabled all channels — does not throw. */
sendNotification(user: User, message: string): void;
```

Each comment uses different words than the name and adds real information: scope, edge cases, failure behavior.

---

## Principle 4: Comment Every Field

The most neglected category, and one of the easiest wins. Every instance variable, every field in a type, every non-obvious local should have a comment describing what it represents.

> "One of the most important elements of software design is determining who needs to know what, and when."

Variable names can only say so much. Comments on fields capture: units, valid ranges, relationships to other fields, nullability semantics, and the invariants they maintain.

### DON'T: Leave fields uncommented

```typescript
interface CacheEntry {
  key: string;
  value: unknown;
  timestamp: number;
  hits: number;
  weight: number;
}
```

What is `timestamp` — creation? Last access? Expiration? What units — seconds? Milliseconds? What is `weight` — byte size? Priority? Recomputation cost? The reader must dig through the implementation to find out.

### DO: Annotate every field

```typescript
interface CacheEntry {
  /** Lookup key, always lowercase and URL-safe. */
  key: string;
  /** Cached value. Never undefined — missing entries aren't stored. */
  value: unknown;
  /** When this entry was last accessed, in Unix milliseconds.
      Drives the LRU eviction policy. */
  lastAccessedMs: number;
  /** Times this entry has been read since creation. */
  hits: number;
  /** Approximate memory cost in bytes. Entries are evicted
      heaviest-first when the cache exceeds its byte budget. */
  weightBytes: number;
}
```

Now every field tells its full story. The reader knows the units, the semantics, and how each field participates in the module's behavior.

---

## Principle 5: Document Cross-Module Relationships

Some of the most important comments describe relationships _between_ modules — what one assumes about another, how data flows through the system, where the "other half" of a protocol lives. These are the hardest to write because there's no natural home for them, and the easiest to forget because no single file feels responsible.

Place the comment in the module most likely to be read by someone who needs the information. Reference the related modules explicitly.

### DON'T: Leave cross-module dependencies implicit

```typescript
// auth-middleware.ts
export function attachUser(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(" ")[1];
  if (token) req.user = verifyToken(token);
  next();
}
```

Nowhere does it say which routes depend on this, what happens if it doesn't run first, or where `req.user` is consumed.

### DO: Make the dependency chain explicit

```typescript
// auth-middleware.ts
//
// Attaches a verified User to req.user from the Authorization header.
// Downstream handlers access it via req.user — see RequestContext in
// types/request.ts for the type.
//
// IMPORTANT: Must run before any handler that calls requireAuth().
// Route registration in routes/index.ts ensures this ordering. If you
// add routes outside that file, apply this middleware explicitly.
export function attachUser(req: Request, res: Response, next: NextFunction) {
```

Three modules participate in this design decision (middleware, types, routes). Without this comment, a developer adding routes in a new file would have no way to discover the ordering requirement.

---

## The Comment-First Workflow

### For new modules or interfaces

- [ ] **Write the interface comment first.** Describe what the module does, what callers need to know, what it hides. If the comment is hard to write or full of caveats, reconsider the design.
- [ ] **Comment every public method.** Describe the abstraction: what it does, return semantics, side effects, edge cases. Use different words than the method name.
- [ ] **Comment every field.** Units, constraints, valid ranges, relationships, nullability semantics.
- [ ] **Write implementation comments for non-obvious logic.** Explain _why_, not _what_. If you chose an approach for a reason that isn't self-evident, say so.
- [ ] **Add cross-module comments where relevant.** If this module participates in a protocol, ordering requirement, or shared convention, document it here and reference the related modules.

### For modifying existing code

- [ ] **Read existing comments first.** Understand the documented intent before changing the code.
- [ ] **Update comments the change invalidates.** A comment describing behavior you just changed is now a lie. Fix it immediately.
- [ ] **Add comments where your change introduces non-obvious behavior.** If someone reviewing your diff would ask "why?", the answer belongs in a comment.

### Quality check before finishing

- [ ] **Different words test.** Does any comment echo the entity name? Rewrite or delete it.
- [ ] **Interface completeness.** Can a caller use each public method without reading its implementation?
- [ ] **Field coverage.** Does every field explain what it represents, not just restate the type?
- [ ] **Uncommented non-obvious code.** Any tricky logic, magic numbers, or surprising behavior without a comment?

---

## LLM Anti-Patterns

These are the specific bad habits to guard against. Check every comment you write against this list.

| Anti-Pattern                         | What It Looks Like                             | What to Do Instead                                                      |
| ------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| **Code-in-English**                  | `// loop through users and check if active`    | Delete it. The code says this.                                          |
| **Same-word echo**                   | `/** Gets the user name */` on `getUserName()` | Different words. What _is_ the user name? Display name? Login?          |
| **Missing interface comments**       | Public methods with no abstraction description | Write what it does, return semantics, edge cases, side effects.         |
| **Uncommented fields**               | `timestamp: number`                            | Always: units, meaning, valid range, who uses it.                       |
| **Over-commenting the obvious**      | Comments on every getter, every trivial line   | Comment only what isn't obvious. Trivial code needs no comment.         |
| **Under-commenting the non-obvious** | Complex algorithm with zero explanation        | Why this approach? What tradeoffs? What assumptions?                    |
| **Comments as afterthought**         | Comment wording mirrors the code structure     | Write the comment first. Let it guide the implementation.               |
| **Flat comment style**               | Every comment treated identically              | Interface: _what_. Implementation: _why_. Fields: _what it represents_. |

See [references/examples.md](references/examples.md) for extended before/after examples in TypeScript showing each principle applied to real-world code.
