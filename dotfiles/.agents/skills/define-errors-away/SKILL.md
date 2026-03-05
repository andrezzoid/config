---
name: define-errors-away
description: |
  Eliminate error conditions through API redesign instead of handling them. Use this skill whenever you are about to write a try/catch block, throw an exception, return an error code, add a null check, or handle any failure case. Also trigger when the user asks to "simplify error handling", "reduce exceptions", or when you encounter code with dense error-handling logic. The instinct to add error handling is almost always a signal that the API should be redesigned instead — the best error handling is the error handling you didn't have to write.
---

# Define Errors Out of Existence

> "The best way to eliminate exception handling complexity is to define your APIs so that there are no exceptions to handle: define errors out of existence."
> — John Ousterhout, _A Philosophy of Software Design_

Exception handling is one of the worst sources of complexity in software. It's hard to test, hard to reason about, and often accounts for more code than the happy path. Worse, most exception handling is wrong — studies consistently show that over 90% of catastrophic system failures could have been prevented by trivially simple error handling.

LLMs make this worse. When faced with a potential failure, the default instinct is to wrap it in a try/catch, add a null check, or return an error. This is backwards. Instead of asking "how should I handle this error?", ask the more powerful question: **"can I redesign this so the error can't happen?"**

## When to Trigger

Use this skill whenever you're about to:

- Write a try/catch or try/except block
- Throw or raise an exception
- Return an error code, error object, or Result type
- Add a null/undefined/nil check
- Write a guard clause for "invalid" input
- Handle a "file not found", "key missing", or "index out of bounds" condition

Every single one of these is a signal to stop and ask: can the API be redefined so this condition doesn't exist?

## The Core Technique

There are three strategies for defining errors out of existence, in order of preference:

### Strategy 1: Redefine the Operation

Change what the operation does so the "error" case becomes a valid, expected outcome.

> "The overall simplification from defining away exceptions is significant: servers with this behavior require no special crash-recovery code."

**The key insight**: Most "errors" are only errors because we defined the operation too narrowly. Widen the definition, and the error disappears.

| Operation                         | Error to eliminate    | Redefinition                                                |
| --------------------------------- | --------------------- | ----------------------------------------------------------- |
| `delete(file)`                    | FileNotFoundError     | "Ensure file does not exist" — already true, return success |
| `substring(s, start, end)`        | IndexOutOfBoundsError | Clamp to actual bounds — return what's available            |
| `getOrDefault(map, key, default)` | KeyNotFoundError      | Return default — no error case exists                       |
| `mkdir_p(path)`                   | DirectoryExistsError  | "Ensure directory exists" — already true, return success    |
| `addToSet(set, item)`             | DuplicateError        | Sets are idempotent by definition — just return             |

### Strategy 2: Mask the Exception

Handle the exception inside the module so callers never see it. The module detects and recovers from the problem without involving the caller.

This works when:

- The module can take corrective action (retry, use a default, fall back)
- The caller wouldn't do anything useful with the error anyway
- The exception represents a transient condition

### Strategy 3: Aggregate Exceptions

Instead of handling exceptions at every level of the stack, let them propagate to a single top-level handler that deals with all of them uniformly.

This works when:

- Individual callers can't meaningfully recover
- A crash, restart, or top-level error page is the right response
- You have many operations that can fail in similar ways

## The Workflow

When you encounter a potential error condition:

1. **Stop.** Don't write the try/catch yet.
2. **Ask: Why is this an error?** What assumption about the operation makes this input or state "wrong"?
3. **Ask: Can I redefine the operation?** Can the operation's contract be broadened so this case is simply... handled?
4. **Ask: Can the module mask it?** Can recovery happen inside the module without the caller knowing?
5. **Ask: Can I aggregate it?** Can this error propagate to a top-level handler instead of being caught here?
6. **Only then**, if none of those work, write the error handling — but question whether the caller truly needs to know about this specific error, or if a more general signal suffices.

## DO and DON'T

### DON'T: Throw on edge cases the caller can't control

```python
def substring(s: str, start: int, end: int) -> str:
    if start < 0 or end > len(s) or start > end:
        raise IndexError("Invalid range")
    return s[start:end]

# Every caller must now guard against IndexError
try:
    result = substring(text, pos, pos + length)
except IndexError:
    result = ""  # What they wanted in the first place
```

### DO: Redefine to handle edge cases naturally

```python
def substring(s: str, start: int, end: int) -> str:
    start = max(0, start)
    end = min(len(s), end)
    if start >= end:
        return ""
    return s[start:end]

# Callers just use it. No error handling needed.
result = substring(text, pos, pos + length)
```

### DON'T: Force callers to check before acting

```typescript
async function sendNotification(userId: string, message: string) {
  const prefs = await getNotificationPrefs(userId);
  if (!prefs) throw new Error("User has no notification preferences");
  if (!prefs.enabled) throw new Error("Notifications disabled");
  if (!prefs.channels.length) throw new Error("No channels configured");
  // ... finally send
}

// Caller must catch three different "errors" that aren't really errors
```

### DO: Make the operation idempotent and self-resolving

```typescript
async function sendNotification(userId: string, message: string) {
  const prefs = await getNotificationPrefs(userId);
  if (!prefs?.enabled || !prefs.channels.length) return; // Nothing to do — not an error
  // ... send to configured channels
}

// A user with no notifications configured isn't an error.
// It's a valid state where the correct action is "do nothing."
```

### DON'T: Return errors for predictable conditions

```go
func GetUser(id string) (*User, error) {
    user, ok := cache[id]
    if !ok {
        return nil, ErrNotFound
    }
    return user, nil
}

// Every single caller:
user, err := GetUser(id)
if err != nil {
    // Handle "not found"... but what does that even mean here?
}
```

### DO: Use the type system to express absence

```go
func FindUser(id string) *User {
    // Returns nil if not found — callers who need a user
    // that must exist call a different, clearly named method.
    return cache[id]
}

func GetUser(id string) *User {
    // For contexts where the user must exist (e.g., authenticated routes).
    // Panics if not found — this is a programming error, not a runtime condition.
    user := cache[id]
    if user == nil {
        panic("invariant: authenticated user must exist: " + id)
    }
    return user
}
```

Two methods with different contracts: `Find` for "might not exist" (no error needed — nil is the answer), `Get` for "must exist" (violation is a bug, not a user-facing error).

See `references/examples.md` for extended before/after transformations across common domains: HTTP handlers, database operations, file systems, and state machines.

## When This Doesn't Apply

Not every error can be defined away. Genuine errors to keep:

- **Resource exhaustion** — out of memory, disk full, network down. These are real failures.
- **Programming errors** — violated invariants that indicate bugs. Panic/assert, don't recover.
- **External system failures** — a third-party API is down. You may need to surface this.
- **Security violations** — unauthorized access should be loud and explicit.

The goal isn't zero exceptions. It's to eliminate the _unnecessary_ ones — the ones that exist because the API was defined too narrowly, not because something genuinely went wrong.

> "Throwing exceptions is easy; handling them is hard. The best way to reduce the complexity associated with exception handling is to reduce the number of places where exceptions must be handled."
