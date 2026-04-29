---
name: comments-as-design
description: |
  Use comments as a design tool to capture abstractions, intent, and decisions code can't express. Based on John Ousterhout's A Philosophy of Software Design (Chs. 12–15). Trigger when writing, reviewing, or refactoring any module, interface, class, public function, or data structure — and when the user asks to "add comments", "document this", or "explain this code". Especially critical for LLM-generated code, which consistently parrots code in English, over-comments the obvious, ignores the non-obvious, and treats comments as decoration.
---

# Comments as Design

## Overview

Comments capture what code alone cannot: the abstraction, the intent, the invariants, the reasoning. Ousterhout frames the job as **precision** (units, ranges, nullability the code can't carry) and **intuition** (the mental model behind the code, so readers don't reverse-engineer it).

LLMs default to the opposite: parroting code in English, restating names, ignoring fields, bolting comments on after the design is locked. Every comment must earn its place by adding information that isn't already in the code.

## When to Use

- Writing a new module, class, function, public API, or data structure.
- Reviewing or refactoring code with module boundaries, non-obvious logic, or shared invariants.
- The user asks to "add comments", "document this", or "explain this code".
- About to write any interface that another piece of code will call.

## When NOT to Use

- Trivial getters/setters where a precise name carries the full meaning.
- Throwaway scripts and one-off prototypes.
- Generated code (move the explanation to whatever generates it).
- Cases where a better name would make the comment redundant — rename instead.

## Core Process

A workflow, in order. Each step describes what to do at the corresponding point in the code.

### Step 1 — Write the interface comment first *(during design)*

> "If users must read the code of a method in order to use it, then there is no abstraction." — Ousterhout

Write the interface comment **before** the implementation: what it does, what it guarantees, what it returns, side effects, edge cases. If the comment is hard to write or full of caveats, redesign before writing code. The difficulty of the comment is direct feedback on the abstraction.

**DON'T** — code first, then English transcription:

```typescript
function processOrder(order: Order): Result {
  const validated = validateOrder(order);
  const priced = applyPricing(validated);
  return saveAndConfirm(priced);
}
// Processes an order by validating, pricing, saving, and confirming.
```

**DO** — comment first, let it drive the design:

```typescript
/**
 * Submits an order for fulfillment.
 *
 * Validates line items against current inventory, applies pricing
 * (including promotions), and persists atomically — partial failure
 * rolls everything back. Returns a failed Result on validation
 * errors; inspect Result.errors for user-facing messages. Does not throw.
 */
function submitOrder(order: Order): Result {
```

Writing the comment forced explicit decisions before any implementation — atomicity, failure mode, the caller's surface. The clearer name `submitOrder` emerged from describing the abstraction.

### Step 2 — Categorize each comment by audience *(during interface authoring)*

"Explain why, not what" is too coarse. Each comment type has a different audience and content rule (see **Comment Categories** below). Two axes:

- **Type** — interface (what + contract), implementation (why), field (what it represents), cross-module (relationships).
- **Altitude** — methods, blocks of related lines, and whole files/modules each deserve a comment. Don't only annotate single lines.

**DON'T** — apply "explain why" to an interface:

```typescript
/** We use this function because we need to look up users. */
function findUser(id: string): User | undefined;
```

**DO** — interface describes the abstraction; implementation explains the reasoning:

```typescript
/**
 * Looks up a user by ID. Returns undefined if no user exists — does
 * not throw. For routes where the user must exist, use getUser()
 * which throws on missing.
 */
function findUser(id: string): User | undefined {
  // Process oldest first — newer entries are more likely to be
  // mutated again, so doing them last reduces wasted work.
  queue.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
```

### Step 3 — Sweep the data structures *(during type definition)*

Every field gets a comment covering **units, valid range, invariants, relationships, nullability**. Names carry ~5 words; everything else lives in the comment.

**DON'T** — bare types force the reader to dig:

```typescript
interface CacheEntry {
  key: string;
  value: unknown;
  timestamp: number;  // created? expired? units?
  weight: number;     // bytes? priority?
}
```

**DO** — every field tells its full story:

```typescript
interface CacheEntry {
  /** Lookup key, lowercase and URL-safe. */
  key: string;
  /** Cached value. Never undefined — missing entries aren't stored. */
  value: unknown;
  /** Last access time, Unix milliseconds. Drives LRU eviction. */
  lastAccessedMs: number;
  /** Approximate memory cost in bytes. Heaviest-first eviction
      when the cache exceeds its byte budget. */
  weightBytes: number;
}
```

Renaming `timestamp` → `lastAccessedMs` and `weight` → `weightBytes` halved the comment burden — names now carry the units.

### Step 4 — Sweep the non-obvious logic *(during/after implementation)*

Every magic number, surprising ordering, deliberate tradeoff, or non-obvious algorithm earns a `why` comment. Test: would a reviewer ask "why?" If yes, answer it inline.

```typescript
// GET, not POST — user lists are CDN-cached. POST would bypass
// the cache and hit origin on every call.
const users = await this.http.get("/users");

// 7 retries: 1s, 2s, 4s ... 64s. Total ~2min, matches the upstream
// SLA window before they auto-fail the request anyway.
const MAX_RETRIES = 7;
```

The code says *what*; the comment preserves the reasoning that would otherwise be lost the moment the author moves on.

### Step 5 — Document cross-module relationships *(at module boundaries)*

Cross-module comments describe protocols, ordering requirements, and where the other half of a contract lives. Easiest to forget because no single file feels responsible — place them in the module most likely to be read first.

**DON'T** — leave the dependency chain implicit:

```typescript
// auth-middleware.ts
export function attachUser(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (token) req.user = verifyToken(token);
  next();
}
```

**DO** — make the contract explicit:

```typescript
// auth-middleware.ts
//
// Attaches a verified User to req.user from the Authorization header.
// Downstream handlers read it via req.user — see RequestContext in
// types/request.ts.
//
// IMPORTANT: must run before any handler that calls requireAuth().
// Route registration in routes/index.ts ensures this. If you add
// routes outside that file, apply this middleware explicitly.
export function attachUser(req, res, next) {
```

Three modules participate (middleware, types, routes). Without this comment, anyone adding routes elsewhere has no way to discover the ordering requirement.

### Step 6 — Run the different-words test *(final quality pass)*

A check, not a design move. **If a comment uses the same words as the entity it describes, it adds nothing — delete or rewrite it.** If you can't describe the concept in different vocabulary, either the code is self-explanatory (delete the comment) or you don't understand it well enough yet (fix the design or name).

**DON'T** — name-mirroring:

```typescript
/** The count of items. */            itemCount: number;
/** Returns true if user is active. */ isActive(): boolean;
```

**DO** — different vocabulary, real information:

```typescript
/** Items in the cart, including out-of-stock items not yet removed. */
itemCount: number;
/** True if the user logged in within the last 30 days and isn't suspended. */
isActive(): boolean;
```

## Comment Categories

| Type            | Describes          | Audience      | Must contain                                |
| --------------- | ------------------ | ------------- | ------------------------------------------- |
| Interface       | what + contract    | caller        | behavior, returns, side effects, edge cases |
| Implementation  | why                | maintainer    | reasoning, tradeoffs, non-obvious choices   |
| Field/variable  | what it represents | reader        | units, range, invariants, relationships     |
| Cross-module    | relationships      | system reader | ordering, protocols, shared assumptions     |

## Names as Comments

Names are the smallest comments. A precise name removes the need for a sentence; a generic one forces every reader to dig. A name that's hard to choose is the same signal as a comment that's hard to write — the abstraction isn't clear yet.

- **Precision over generality.** `lastAccessedMs` beats `timestamp`. `submitOrder` beats `processOrder`. `weightBytes` beats `weight`.
- **Consistency.** Same concept, same word. Don't call it `userId` here and `accountId` there.
- **Generic names are a smell.** `data`, `info`, `process`, `manager`, `handle` usually mean the author hadn't decided what the thing is. If a better name removes the comment, rename.

## Common Rationalizations

| Rationalization | Reality |
| --- | --- |
| "The code is self-documenting." | If you can't write the interface comment, the abstraction isn't right yet. |
| "I'll add comments later." | Comments-first is the design tool. Later means after the design is locked in — too late. |
| "The name says it all." | Names carry ~5 words. Units, edge cases, invariants need a comment. |
| "It's obvious." | Obvious to you, now. Not to the next reader, including future-you. |
| "Comments get out of date." | Stale comments are a maintenance failure, not a reason to skip them. |
| "Adding comments would bloat the file." | Bloat is repeating the code in English. Real comments compress understanding. |

## Red Flags

Self-monitoring signals — if any of these appear, stop and fix.

- **A file, module, or PR with zero comments.** Structural smell — comments-as-afterthought thinking, even if every line "looks fine".
- A comment using the same words as the entity it describes (different-words test fails).
- A public method, class, or module with no interface comment.
- A field whose units, range, or meaning aren't documented.
- A `// why?` question a reviewer would ask, with no comment answering it.
- A cross-file ordering or protocol assumption documented nowhere.
- A comment written *after* the code that paraphrases what the code already says.
- A generic name (`data`, `process`, `timestamp`, `manager`) where a precise one would remove the comment.

## Verification

Before considering the work done:

- [ ] Every public interface has a comment a caller could use without reading the implementation.
- [ ] Every field documents units, range, or meaning the type alone can't carry.
- [ ] No comment fails the different-words test.
- [ ] Every non-obvious choice (magic number, ordering, tradeoff) has a `why` comment.
- [ ] Cross-module assumptions are documented in the module most likely to be read first.
- [ ] Comments invalidated by edits in this change are updated, not left stale.
- [ ] Generic names that could be sharpened have been renamed instead of commented around.

## References

[references/examples.md](references/examples.md) — extended TypeScript before/after examples for each step: rate limiter, API client, connection pool, config, order model, event pipeline, auth flow.
