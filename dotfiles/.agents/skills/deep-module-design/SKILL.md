---
name: deep-module-design
description: Design modules with simple interfaces and rich implementations. Use when creating, extending, or refactoring any module, class, service or API. Trigger on phrases like "simplify the interface", "reduce API surface", "encapsulate", "clean up boundaries", "split this class", "extract a helper", "wrap this", or before writing the first line of a new abstraction.
---

# Deep Module Design

## Overview

> "The best modules are those that provide powerful functionality yet have simple interfaces. I use the term _deep_ to describe such modules."
> — John Ousterhout, _A Philosophy of Software Design_

A module's value is the ratio of functionality it provides to the complexity of its interface. Deep modules give callers a lot of power through a small surface; shallow modules expose almost as much complexity in their interface as they contain in their implementation. Your job is to maximize that ratio — callers outnumber developers, so push the cost onto the developer side of the boundary.

## When to Use

- Designing, extending or refactoring any module, class, service, or API
- Adding a method, parameter, or constructor argument to an existing interface
- Refactoring or simplifying code
- When deciding to split a module, extract a helper, or introduce a new layer

## When NOT to Use

- Throwaway scripts, one-off prototypes, single-callsite leaf utilities
- Auditing existing code for complexity — use the **complexity-red-flags** skill instead

## Workflow

Six steps, each applying a first principle, spanning the design cycle:

- **Step 1** sets the target before you start writing.
- **Steps 2–5** shape the draft as the interface takes form — iterate; revisit any step when a later one surfaces an issue.
- **Step 6** is the final gate before the design lands.

Don't skip — answer each before declaring done.

### 1. Write the ideal call site

1. State the capability the module delivers in one sentence

2. State the line of caller code you _wish_ you could write to invoke it.

Together these are your interface ceiling — design backwards from them. If the call site doesn't match the capability sentence, one of them is wrong.

> "Most modules have more users than developers, so it is better for the developers of a module to suffer than its users."

```typescript
// Capability: register a user from an email and password, returning the User.
const user = await users.register(email, password);
```

### 2. Bury implementation decisions; expose outcomes

1. Enumerate everything the implementation must decide: data formats, retry policy, ordering, defaults, error handling, storage mechanism, validation rules, threading, caching.

2. For each, ask yourself: **would changing this decision force any caller to change?** If yes, it's leaking — pull it inside.

3. **Counter-rule (don't over-hide):** information the caller legitimately needs to make a decision must remain visible. Hide _how_ the work is done, not _what_ outcome it produced. If the caller is reduced to parsing your error messages or inspecting side effects, you've hidden too much.

> "Information leakage is one of the most important red flags in software design. It occurs when a design decision is reflected in multiple modules."

**DON'T — format leaks into every caller:**

```typescript
const config = JSON.parse(fs.readFileSync("config.json", "utf-8"));
const dbUrl = config.database.connections.primary.url;
```

**DO — module owns the format:**

```typescript
// Implementation can switch JSON → YAML → env vars without touching the caller.
const config = AppConfig.load();
const dbUrl = config.dbUrl;
```

### 3. Make every layer earn its abstraction

Every layer in the call stack must change the abstraction by adding real responsibility. Pass-throughs are interface complexity without functionality.

1. List every public method in your design.

2. For each method, name the abstraction it adds in one phrase: validation, authorization, transformation, caching, retry, business rule, cascading cleanup, etc.

3. Collapse the layer if the phrase is "calls X", "wraps X", or "forwards to X" — or if two adjacent layers produce the same phrase. The deeper layer keeps the responsibility; the shallow one disappears.

**DON'T — pure delegation:**

```typescript
class UserController {
  getUser(id: string): User {
    return this.service.getUser(id);
  }
  updateUser(id: string, data: object): User {
    return this.service.updateUser(id, data);
  }
  deleteUser(id: string): void {
    this.service.deleteUser(id);
  }
}
```

**DO — collapse the layer or give it real work:**

```typescript
class Users {
  get(id: string): User { ... }
  update(id: string, changes: object): User { /* validates, persists, audits */ }
  delete(id: string): void { /* cascades cleanup */ }
}
```

### 4. Lean general-purpose; stop at "somewhat"

A general interface is often _simpler_ than a special-purpose one — it replaces many specific methods with fewer flexible ones. Use Ousterhout's three questions to find the right level:

> 1. What is the simplest interface that will cover all my current needs?
> 2. In how many situations will this method be used?
> 3. Is this API easy to use for my current needs?

Procedure:

1. List the concrete operations callers need today (each one a verb on the data — `deleteWord`, `deleteLine`, `deleteSelection` etc.).

2. Find the smallest set of orthogonal primitives that composes to all of them (`delete(start, end)` covers all six `delete*` cases).

3. Express each common case using only the primitives. If something obvious takes >1 primitive call to do, you've gone too low-level — rebalance the boundary or add a convenience method.

4. Stop adding primitives when a new one doesn't eliminate any special case from your list.

**DON'T — build special-purpose methods that each do one thing:**

```typescript
deleteSelection();
deleteNextChar();
deletePrevChar();
deleteWord();
deleteLine();
deleteToEndOfLine();
insertChar(c);
insertString(s);
insertNewline();
insertTab();
```

**DO — general-purpose methods that express any edit:**

```typescript
insert(position, text);
delete(start, end);
selection(): Range;
moveCursor(position);
```

### 5. Combine closely related; resist splitting unrelated

Code that shares knowledge belongs together; code that doesn't, doesn't. The classic failure mode is **temporal decomposition** — splitting by the order things happen, which forces the same knowledge to be encoded in every step.

1. For each piece in your design, write down (a) the knowledge it carries (a format, invariant, schema, workflow, set of business rules), (b) who calls it.

2. **Combine** two pieces if they share knowledge OR callers always invoke them together OR understanding one requires looking at the other.

3. **Separate** two pieces only if they share neither knowledge nor callers AND can be understood independently.

4. Re-read your module names. Verb-phase names (`Reader`, `Validator`, `Sender`, `Loader`) are a temporal-decomposition smell — restructure around what each module _owns_, not _when_ it runs.

**DON'T — five shallow collaborators that always travel together:**

```typescript
new UserRegistrationService(
  new UserValidator(),
  new PasswordHasher(),
  new UserRepository(),
  new WelcomeEmailSender(),
).register(input);
```

**DO — one module owning the domain:**

```typescript
users.register(email, password);
// validates, hashes, stores, sends welcome — internal
```

### 6. Verify depth before finalizing

Three checks, all with concrete evidence.

1. **Call-site match:** does your final API match (or beat) the ideal call site you wrote in step 1? If it grew, justify each extra concept or trim it.

2. **Concept ratio:** count concepts at the interface (public methods + required params + exposed types + thrown errors) vs. in the implementation (decisions, branches, helpers, state). Close to equal → still shallow. Push more responsibility in or cut what's exposed.

3. **Swap test:** imagine replacing the implementation tomorrow with a completely different one (different DB, format, algorithm). How many caller files change? Zero is the target. Anything else means a design decision is still leaking — return to step 2.

## Common Rationalizations

| Rationalization                                         | Reality                                                                                               |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| "Splitting into more classes is cleaner."               | More classes = more interface surface. Cleanliness is fewer concepts at the boundary, not more files. |
| "Each class should have one responsibility."            | SRP doesn't mean one method per class. A deep module owns one responsibility _fully_.                 |
| "I'll need flexibility later."                          | Add the seam when you actually need it. Speculative depth is shallow today, guaranteed.               |
| "We need the layer for testability."                    | If the layer has no logic, there's nothing meaningful to test in isolation. Test the deep module.     |
| "The framework requires controller/service/repository." | The framework requires a request handler. Empty pass-through layers are not a framework requirement.  |
| "It's a pure helper, splitting is harmless."            | A helper used in one place is dead weight. Inline it; extract only when reuse is real.                |
| "I should hide everything I can."                       | Information the caller needs to decide must stay visible. Over-hiding forces callers into guesswork.  |
| "Generalizing now will save us later."                  | Generalize when a second use case is real, not imagined. Premature generality is also shallow.        |

## Red Flags (design-time)

Watch for these as you draft. Each is a signal to return to a workflow step.

- **Constructor with >3 required parameters** → step 2 (push to defaults / hide decisions).
- **Method whose name + params nearly equals the implementation in size** → step 6 (concept ratio).
- **Two methods that must be called in a specific order** → step 3 (collapse into one).
- **Caller code orchestrating ≥3 calls of the same module to do one logical thing** → step 3.
- **Parameter threaded through ≥2 functions untouched** → step 2 (it's leaking; use context or module-level access).
- **Public method that's pure delegation** → step 3 (no abstraction added; remove or enrich).
- **Module name is a verb-phase (`Reader`, `Validator`, `Sender`) rather than a concept** → step 5 (likely temporal decomposition).
- **Caller has to read the implementation to use the module correctly** → step 1 (call site is wrong) or step 2 (over-hidden).

## Verification

Before declaring the design done:

- [ ] Caller can use the module correctly from signature + one-line doc alone — no implementation reading required.
- [ ] Final API is no more complex than the ideal call site from step 1.
- [ ] Concept count at the interface is significantly smaller than at the implementation.
- [ ] Swap test passes: a hypothetical implementation change would touch 0 caller files.
- [ ] Information the caller legitimately needs to decide is exposed; everything else is internal.

## See Also

- **complexity-red-flags** — the audit-time form of the same principles. Use this skill when designing; use that one when reviewing existing code, PRs, or diffs.
- [references/examples.md](references/examples.md) — extended before/after examples for general-purpose interfaces, defaults, and don't-over-decompose.
