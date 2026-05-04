---
name: complexity-red-flags
description: |
  Detect and fix complexity creep — shallow modules, information leakage,
  pass-through methods/variables, temporal decomposition, conjoined methods,
  overexposure, special-general mixture. Use after implementing any feature
  before declaring it done, when reviewing PRs or diffs, when refactoring,
  or when the user says "review", "audit", "simplify", "clean up", or "is
  this code good?", or code "feels complex".
---

# Complexity Red Flags

## Overview

> "Complexity is anything related to the structure of a software system that makes it hard to understand and modify the system."
> — John Ousterhout, _A Philosophy of Software Design_

Complexity creeps in one small decision at a time — a shallow wrapper, a leaked format, a pass-through method. Each looks harmless; together they make a system incomprehensible. This skill is a diagnostic checklist with an audit workflow: detect specific patterns, cite file:line, propose concrete fixes.

## When to Use

- After implementing a feature, before calling it done
- Reviewing a pull request or code diff
- The user asks to review, audit, or simplify code
- Refactoring and you need to decide what to change
- Code "feels complex" but you can't articulate why

## When NOT to Use

- Single-line fixes or typo corrections
- Throwaway scripts and one-off prototypes
- Generated code (fix the generator, not the output)

## The Audit Workflow

For each of the eight flags below, in order:

1. **Read the Signal.** Know the shape you're looking for.
2. **Run the Find.** Execute the flag's specific detector — `grep`, signature listing, parameter trace — to surface candidates.
3. **Apply the Test.** Confirm each candidate; reject false positives.
4. **Write the Fix** using the DON'T → DO pattern. Cite file:line and the concrete edit — "inline `OrderValidator.validate` into `Order.create` (validators/order-validator.ts:18)", not "simplify validators".

Don't stop at the first hit — the same code often violates multiple flags. Report findings grouped by flag.

## The Eight Red Flags

### 1. Shallow Modules

> "A shallow module is one whose interface is complicated relative to the functionality it provides. Shallow modules don't help much in the battle against complexity, because the benefit they provide (not having to learn about how they work internally) is negated by the cost of learning and using their interfaces."

**Signal:** A class/module whose interface is nearly as complex as its body. Files that are mostly boilerplate. Many small classes with one or two methods each.

**Find:** List public classes/modules with ≤2 public methods. List files where >50% of lines are imports, types, and ceremony.

**Test:** Count concepts in the interface (methods + parameters + types + exceptions) vs concepts in the implementation. Close to equal = shallow.

**DON'T:**

```typescript
class TemperatureConverter {
  celsiusToFahrenheit(c: number): number {
    return (c * 9) / 5 + 32;
  }
}
```

A class for a one-line formula. The interface is more complex than the operation.

**DO:** Inline it, make it a plain function if reused, or fold it into the module that needs the conversion.

---

### 2. Information Leakage

> "Information leakage occurs when a design decision is reflected in multiple modules. This creates a dependency between the modules: any change to that design decision will require changes to all of the involved modules."

**Signal:** Same knowledge — format, mapping, constant — encoded in multiple modules. Change one, must change the others.

**Find:** `grep` for duplicated field mappings, format strings, magic constants, parallel hierarchies (`Reader` + `Writer` for the same format).

**Test:** If you changed an internal data format (JSON→YAML, MySQL→Postgres, REST→GraphQL), how many files would need to change? More than one = leakage.

**DON'T:**

```typescript
// api/routes/users.ts
const user = { id: row.id, name: row.first + " " + row.last, email: row.email };

// api/routes/admin.ts
const user = { id: row.id, name: row.first + " " + row.last, email: row.email };
```

Same field mapping repeated. Change the DB schema, break two files.

**DO:**

```typescript
// models/user.ts — single source of truth
class User {
  static fromRow(row: DbRow): User { ... }
}
```

---

### 3. Temporal Decomposition

> "In temporal decomposition, the structure of a system corresponds to the time order in which operations will occur... this results in information leakage: the knowledge required for each operation is split across multiple modules."

**Signal:** Code organized by the order things happen rather than by what each piece encapsulates.

**Find:** List module/class names. Flag verb-phase names: `Reader`, `Parser`, `Validator`, `Saver`, `Loader`, `Sender` (when standalone, not as an internal step within a deeper module).

**Test:** Are modules named after phases (verbs) or concepts (nouns)? Phased pipelines where each step knows the previous step's format = temporal decomposition plus information leakage.

**DON'T:**

```
FileReader → DataParser → DataValidator → DataWriter
```

Each class knows the data format. Change the format, change all four.

**DO:**

```
DataStore.load(path)  → validated data
DataStore.save(path, data)
```

One module owns the concept. Read, parse, validate are internal steps.

---

### 4. Pass-Through Methods

> "A pass-through method is one that does little except invoke another method, whose signature is similar or identical to that of the calling method. This typically indicates that there is not a clean division of responsibility between the classes."

**Signal:** A method body that does nothing except call another method with the same or similar arguments.

**Find:** `grep -rE 'return this\.\w+\.\w+\([^)]*\);?\s*}'` and equivalents — methods whose body is one delegation.

**Test:** Remove the method. Does the caller's code get simpler? If yes, the pass-through was pure overhead.

**DON'T:**

```typescript
class UserService {
  getUser(id: string): User {
    return this.repo.getUser(id); // Just forwarding
  }

  deleteUser(id: string): void {
    this.repo.deleteUser(id); // Just forwarding
  }
}
```

**DO:** Either add real logic to the layer (validation, authorization, business rules, caching) that justifies it, or eliminate the layer entirely and let callers use the underlying module directly.

---

### 5. Pass-Through Variables

> "Pass-through variables add complexity because they force all of the intermediate methods to be aware of their existence, even though the methods have no use for the variables."

**Signal:** A variable threaded through multiple function signatures, untouched until deep in the stack.

**Find:** Pick suspect parameters (`logger`, `config`, `metrics`, `ctx`). Trace each through its call chain — flag any function that accepts but doesn't read it before forwarding.

**Test:** Does this parameter exist in the signature only because something it calls needs it? That's a pass-through variable.

**DON'T:**

```typescript
function handleRequest(request: Request, config: Config, logger: Logger, metrics: Metrics) {
  const user = authenticate(request, config, logger, metrics);
  ...
}

function authenticate(request: Request, config: Config, logger: Logger, metrics: Metrics) {
  const token = extractToken(request, config, logger);
  ...
}
```

**DO:** Use context objects, dependency injection, or module-level access to break the threading:

```typescript
function handleRequest(request: Request) {
  const user = authenticate(request);
  ...
}
```

---

### 6. Conjoined Methods

**Signal:** Two or more methods that can't be understood independently — they share implicit assumptions about call order, internal state, or data formats.

**Find:** Look for `init*`/`begin*`/`open*` paired with `finalize*`/`end*`/`close*`, or methods whose docs say "must be called after". Search for runtime errors of the form "X must be called before Y".

**Test:** Can you read this method's signature and use it correctly without reading any other method? If not, it's conjoined.

**DON'T:**

```typescript
processor.initBatch();         // Must call before process()
processor.process(items);      // Must call after init, before finalize
processor.finalizeBatch();     // Must call after process()
```

Three methods with implicit ordering. Miss one, get a bug.

**DO:**

```typescript
processor.processBatch(items); // Handles init, processing, finalization internally
```

---

### 7. Overexposure (Verbose Interfaces)

> "If the API for a commonly used feature forces users to learn about other features that are rarely used, this increases the cognitive load on users who don't need the rarely used features."

**Signal:** An interface that exposes details the caller rarely needs — every option, every internal state, every intermediate result.

**Find:** List constructor and public-method signatures. Flag any with >3-4 required parameters, or 6+ total parameters with optional flags exposing implementation choices.

**Test:** Could the caller use sensible defaults for most of these? If yes, the interface is overexposing.

**DON'T:**

```typescript
const cache = new Cache({
  backend: "redis",
  host: "localhost",
  port: 6379,
  serializer: "json",
  compression: "gzip",
  maxConnections: 10,
  retryPolicy: "exponential",
  retryMax: 3,
  ssl: false,
  keyPrefix: "app:",
});
```

**DO:**

```typescript
const cache = new Cache("redis://localhost:6379"); // Sensible defaults internally
```

---

### 8. Special-General Mixture

**Signal:** General-purpose mechanism code tangled with special-case business logic in the same module.

**Find:** `grep -rE "if \(\w+\.(table|name|type|kind) === ['\"]"` — string-equality switches inside generic code. Look for hardcoded domain names inside utility/builder modules.

**Test:** Is there code in this module that only applies to one specific use case, mixed with code that applies to all use cases?

**DON'T:**

```typescript
class QueryBuilder {
  build(params: QueryParams): string {
    let query = `SELECT * FROM ${params.table}`;
    if (params.table === "users") {
      query += " WHERE active = true"; // Special case leaked into general builder
    }
    if (params.filters) {
      query += ` WHERE ${this.buildFilters(params.filters)}`;
    }
    return query;
  }
}
```

**DO:** Keep the general mechanism pure. Let callers supply the specialization:

```typescript
class QueryBuilder {
  build(table: string, filters: Filter[]): string { ... }
}

const users = qb.build("users", [new Filter("active", "=", true)]);
```

## Common Rationalizations

| Rationalization | Reality |
| --- | --- |
| "Splitting into more classes is cleaner." | More classes = more interface surface. Cleanliness is fewer concepts, not more files. |
| "Each class should have one responsibility." | SRP doesn't mean one method per class. A deep module owns one responsibility *fully*. |
| "We need the layer for testability." | If the layer has no logic, there's nothing meaningful to test in isolation. |
| "I might need to swap the implementation later." | Add the seam when you actually need it. Speculative abstraction is shallow today, guaranteed. |
| "The framework requires controller/service/repository." | The framework requires a request handler. Empty pass-through layers are not a framework requirement. |
| "Pass-through variables are explicit dependency injection." | Threading four functions of unused parameters isn't DI — it's noise. |
| "It's only one extra parameter." | Each pass-through param adds cognitive load on every reader of every function in the chain. |
| "I'll inline it later if it stays small." | Later doesn't come. The cost of removal grows with each new caller. |

## Verification

Before declaring an audit done:

- [ ] Listed every public class/module — flagged any whose interface concept count ≈ implementation concept count.
- [ ] Grepped for duplicated formats, mappings, constants — none span >1 file unless intentional.
- [ ] Module names are nouns/concepts, not verbs/phases.
- [ ] No method body is just `return other.sameMethod(...args)`.
- [ ] No parameter is forwarded through ≥2 functions without being read.
- [ ] No method requires another to be called first/after — sequencing is internal.
- [ ] No constructor or factory takes >3-4 required parameters.
- [ ] No `if name === ...` / `if type === ...` branches inside general code.
- [ ] For every flag found: file:line cited and a concrete fix proposed.

## References

- [references/examples.md](references/examples.md) — full audit on a real codebase, fixing every red flag found, plus a quick-reference table for common patterns.
- Sibling skill: **deep-module-design** — the positive form of the same principles. Use it when *designing* modules; use this skill when *auditing* them.
