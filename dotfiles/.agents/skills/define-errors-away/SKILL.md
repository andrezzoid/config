---
name: define-errors-away
description: Eliminate error conditions through API redesign instead of handling them. Use this skill whenever you are about to write a try/catch block, throw an exception, return an error code, add a null check, or write a guard clause. Also trigger when the user asks to "simplify error handling", "reduce exceptions", or when you encounter code with dense error-handling logic. The instinct to add error handling is almost always a signal that the API should be redesigned instead — the best error handling is the error handling you didn't have to write.
---

# Define Errors Out of Existence

## Overview

> "The best way to eliminate exception handling complexity is to define your APIs so that there are no exceptions to handle: define errors out of existence."
> — John Ousterhout, _A Philosophy of Software Design_

Exception handling is one of the worst sources of complexity in software. It's hard to test, hard to reason about, and often accounts for more code than the happy path. Instead of asking "how should I handle this error?", ask the more powerful question: **"can I redesign this so the error can't happen?"**

## When to Use

Trigger when about to:

- Write a try/catch or try/except block
- Throw or raise an exception
- Return an error code, error object, or Result type
- Add a null/undefined/nil check
- Write a guard clause for "invalid" input
- Handle a "file not found", "key missing", or "index out of bounds" condition

**Do NOT use** for genuine errors that must remain visible:

- Resource exhaustion (out of memory, disk full, network down)
- Programming errors / invariant violations (these should crash loudly)
- External system failures a caller must react to
- Security violations (unauthorized access should be loud and explicit)

## The Four Strategies (in order of preference)

### Strategy 1: Define out of existence

Redefine the operation so the "error" case becomes a valid, expected outcome. Most "errors" are only errors because the operation was defined too narrowly. Widen the definition, and the error disappears.

> "The exceptions thrown by a class are part of its interface; classes with lots of exceptions have complex interfaces, and they are shallower than classes with fewer exceptions."

| Operation                         | Error to eliminate    | Redefinition                                                |
| --------------------------------- | --------------------- | ----------------------------------------------------------- |
| `delete(file)`                    | FileNotFoundError     | "Ensure file does not exist" — already true, return success |
| `substring(s, start, end)`        | IndexOutOfBoundsError | Clamp to actual bounds — return what's available            |
| `getOrDefault(map, key, default)` | KeyNotFoundError      | Return default — no error case exists                       |
| `mkdir_p(path)`                   | DirectoryExistsError  | "Ensure directory exists" — already true, return success    |
| `addToSet(set, item)`             | DuplicateError        | Sets are idempotent by definition — just return             |

**DON'T: Throw on edge cases the caller can't control**

```typescript
function substring(s: string, start: number, end: number): string {
  if (start < 0 || end > s.length || start > end) {
    throw new RangeError("Invalid range");
  }
  return s.slice(start, end);
}

// Every caller must now guard against RangeError
let result: string;
try {
  result = substring(text, pos, pos + length);
} catch {
  result = ""; // What they wanted in the first place
}
```

**DO: Redefine to handle edge cases naturally**

```typescript
function substring(s: string, start: number, end: number): string {
  start = Math.max(0, start);
  end = Math.min(s.length, end);
  if (start >= end) return "";
  return s.slice(start, end);
}

// Callers just use it. No error handling needed.
const result = substring(text, pos, pos + length);
```

**DON'T: Return errors for predictable conditions**

```typescript
function getUser(id: string): User {
  const user = cache.get(id);
  if (!user) {
    throw new NotFoundError(`User not found: ${id}`);
  }
  return user;
}

// Every single caller:
try {
  const user = getUser(id);
} catch (e) {
  // Handle "not found"... but what does that even mean here?
}
```

**DO: Use the type system to express absence**

```typescript
function findUser(id: string): User | undefined {
  // Returns undefined if not found — callers who need a user
  // that must exist call a different, clearly named method.
  return cache.get(id);
}

function getUser(id: string): User {
  // For contexts where the user must exist (e.g., authenticated routes).
  // Throws if not found — this is a programming error, not a runtime condition.
  const user = cache.get(id);
  if (!user) {
    throw new Error(`invariant: authenticated user must exist: ${id}`);
  }
  return user;
}
```

Two methods with different contracts: `find` for "might not exist" (no error needed — nil is the answer), `get` for "must exist" (violation is a bug, not a user-facing error).

See `references/examples.md` → "HTTP Request Handler", "File Processing Pipeline", "Idempotent State Transitions".

### Strategy 2: Mask the exception

Handle the exception inside the module so callers never see it. Use when the module can recover (retry, default, fallback) or the caller couldn't do anything useful with it.

See `references/examples.md` → "Cache with Transparent Fallback".

### Strategy 3: Aggregate exceptions

Let exceptions propagate to a single top-level handler that deals with many uniformly. Use when individual callers can't meaningfully recover and a crash, restart, or top-level error response is the right answer.

> "Throwing exceptions is easy; handling them is hard. The best way to reduce the complexity associated with exception handling is to reduce the number of places where exceptions must be handled."

### Strategy 4: Crash cleanly

For unrecoverable conditions, fail loudly with enough context to debug — this is the right design, not a fallback. Use for invariant violations, resource exhaustion, and corrupted state. The goal is a clear failure, not partial-state survival.

## The Workflow

When you encounter a potential error condition, walk this in order:

1. **STOP.** Don't write the try/catch yet.
2. **Name the condition** in one sentence. Example: "substring called with `start` past end of string."
3. **Try Strategy 1.** Can the operation's contract be widened so this input is valid? If yes → redesign and stop.
4. **Try Strategy 2.** Can the module recover internally without the caller knowing? If yes → mask and stop.
5. **Try Strategy 3.** Does a higher layer already handle this class of failure? If yes → let it propagate and stop.
6. **Try Strategy 4.** Is this unrecoverable? If yes → crash with context (assert, panic, throw at the boundary).
7. **Only if all four fail**, write a local error path. Add a brief comment noting which strategies were tried and why each was rejected.

## Common Rationalizations

| Rationalization                                | Reality                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| "The caller needs to know it failed."          | Check what callers actually do. Most log and rethrow, or return the empty value the success path would. |
| "This is an edge case the user shouldn't hit." | Then widen the contract so it's not an edge case.                                                       |
| "I need to validate input."                    | Use a parser that returns a Result, not validation that throws. The schema replaces the try/catch.      |
| "Defensive programming is good practice."      | Defensive programming pushes complexity to every caller. Centralize once at a boundary instead.         |
| "Returning null/undefined isn't safe."         | Provide two methods: `find` (returns optional) and `get` (asserts invariant). The types enforce it.     |

## Red Flags

Observable patterns that signal the skill is being violated:

- A try/catch whose catch produces the same value the success path would on empty input
- Sibling exceptions for "missing X", "missing Y", "missing Z" on the same object
- Every caller wraps the same call in the same try/catch
- Guard clauses that throw for inputs the function could handle
- Result/Either types whose error variant is never inspected by callers

## Verification

Before declaring error-handling work complete, confirm:

- [ ] For each error path written, identified which of strategies 1–4 was attempted and why it was rejected
- [ ] For each new throw/return-error, named at least one caller and what they will do with it
- [ ] No try/catch where the catch produces the same result as success-with-empty-input
- [ ] No guard clause throwing for inputs the operation could meaningfully handle
- [ ] Errors that remain are genuine: resource exhaustion, invariant violation, external system, or security

## See Also

- `references/examples.md` — extended before/after transformations: HTTP handlers, file pipelines, cache fallback, state machines
- `/deep-module-design` — exceptions are part of the interface; fewer exceptions = deeper modules
