---
name: deep-module-design
description: |
  Design modules with simple interfaces and rich implementations that hide complexity. Use this skill whenever creating, extending, or refactoring any module, class, API, service, or component. Also trigger when the user asks to "simplify an interface", "reduce API surface", "encapsulate", or "clean up" module boundaries. If you're writing code that other code will call, this skill applies. This is the central principle in software design — a deep module with a simple interface is worth more than ten shallow ones.
---

# Deep Module Design

> "The best modules are those that provide powerful functionality yet have simple interfaces. I use the term _deep_ to describe such modules."
> — John Ousterhout, _A Philosophy of Software Design_

A module's value is measured by the ratio of functionality it provides to the complexity of its interface. Deep modules provide a lot of functionality behind simple interfaces. Shallow modules expose almost as much complexity in their interface as they contain in their implementation — they don't help much in the battle against complexity.

LLMs have a strong bias toward shallow decomposition: many small classes, thin wrappers, pass-through methods, and interfaces that mirror their implementations. This feels organized but actually _increases_ complexity by scattering functionality across many pieces and forcing callers to understand and coordinate them all.

Design in the opposite direction: fewer modules, each doing more, with interfaces that hide the messy details.

## When to Trigger

Use this skill whenever you're:

- Creating a new class, module, service, or API
- Adding methods to an existing interface
- Refactoring code into "cleaner" abstractions (question whether the abstraction adds depth)
- Tempted to split a module into smaller pieces
- Designing function signatures or constructor parameters

## Core Principles

### 1. Maximize Depth: Simple Interface, Rich Implementation

The interface is the cost users pay. The implementation is the value they get. Maximize the ratio.

> "The best modules are deep: they have a lot of functionality hidden behind a simple interface. A deep module is a good abstraction because only a small fraction of its internal complexity is visible to its users."

**The test**: Can someone use your module by reading only the function signatures and a one-line description? If they need to read the implementation to use it correctly, the abstraction is leaking.

### 2. Hide Information Aggressively

Every module should encapsulate design decisions — data formats, algorithms, error handling strategies, caching policies, storage mechanisms. These are implementation details that callers should never need to know.

> "Information leakage is one of the most important red flags in software design. It occurs when a design decision is reflected in multiple modules."

**Ask yourself**: If I change how this module works internally, how many other files need to change? If the answer is more than zero, you're leaking information.

### 3. Pull Complexity Downward

When you have a choice about where to put complexity — in the module or in its callers — put it in the module. It's better for one module to be complex internally than for all of its callers to deal with that complexity.

> "Most modules have more users than developers, so it is better for the developers of a module to suffer than its users."

This means: handle defaults internally, resolve ambiguity inside the module, manage edge cases without exposing them to the caller. Configuration with sensible defaults is deep. Configuration that requires the caller to understand internals is shallow.

### 4. Don't Over-Decompose

Splitting code into many small pieces is not the same as good design. Every new module, class, or function adds interface overhead. If a split doesn't hide information or simplify the caller's life, it's making things worse.

> "Bringing pieces of code together is most beneficial when they are closely related... If the pieces are not closely related, they are probably better off apart."

**The test**: After splitting, can each piece be understood independently? Do callers need to use both pieces together? If the answer to the first is "no" or the second is "yes," the split isn't helping.

## The Workflow

When designing a module:

1. **Start from the caller's perspective.** What does the caller need to accomplish? Write the ideal call site first — the code you _wish_ you could write. That's your interface target.

2. **Hide everything the caller doesn't need.** Any detail about _how_ the work gets done belongs inside the module. Data formats, retry logic, caching, validation, defaults — all internal.

3. **Provide general-purpose capabilities, not task-specific procedures.** A general-purpose interface is often simpler than a special-purpose one, because it replaces many specific methods with fewer, more flexible ones.

4. **Check for depth.** Is the interface significantly simpler than the implementation? If the interface has almost as many methods/parameters as the implementation has lines of logic, the module is too shallow.

5. **Resist premature splitting.** Before extracting a helper, a utility, or a new class, ask: does this extraction hide information, or does it just move code around?

## DO and DON'T

### Shallow vs. Deep: File I/O

**DON'T: Expose every operation as a separate method.**

```typescript
class FileStore {
  checkPathExists(path: string): boolean { ... }
  createDirectory(path: string): void { ... }
  openFile(path: string, mode: string): FileHandle { ... }
  writeBytes(handle: FileHandle, data: Buffer): void { ... }
  closeFile(handle: FileHandle): void { ... }
  setPermissions(path: string, mode: number): void { ... }
}

// Caller must orchestrate 6 calls in the right order
```

**DO: Provide one deep method that handles the common case.**

```typescript
class FileStore {
  /** Save data to path. Creates directories, handles permissions,
      writes atomically. Just works. */
  save(path: string, data: Buffer): void { ... }
}

// Caller writes one line. All orchestration is internal.
```

### Over-Decomposition: User Registration

**DON'T: Split into many shallow collaborators.**

```typescript
class UserValidator {
  validate(input: UserInput): ValidationResult { ... }
}
class PasswordHasher {
  hash(password: string): string { ... }
}
class UserRepository {
  save(user: User): void { ... }
}
class WelcomeEmailSender {
  send(user: User): void { ... }
}
class UserRegistrationService {
  // This class does nothing but call the others in order
  constructor(
    private validator: UserValidator,
    private hasher: PasswordHasher,
    private repo: UserRepository,
    private emailer: WelcomeEmailSender,
  ) {}

  register(input: UserInput): User {
    const result = this.validator.validate(input);
    if (!result.ok) throw new ValidationError(result.errors);
    const user = new User(input.email, this.hasher.hash(input.password));
    this.repo.save(user);
    this.emailer.send(user);
    return user;
  }
}
```

Five classes, each doing almost nothing. The "service" is a pass-through that just orchestrates the others. None of these classes hide meaningful information.

**DO: One deep module that owns the entire domain.**

```typescript
class Users {
  register(email: string, password: string): User {
    // Validates, hashes, stores, and sends welcome email.
    // All internal — callers just get a User back.
    ...
  }

  authenticate(email: string, password: string): Session { ... }
  deactivate(userId: string): void { ... }
}
```

One class, deep interface. Validation rules, hashing strategy, storage mechanism, and email delivery are all hidden. If you later switch from bcrypt to argon2, nothing outside this module changes.

### Information Leakage: Serialization

**DON'T: Expose internal data formats.**

```typescript
// Callers must know the exact JSON structure
const config = JSON.parse(fs.readFileSync("config.json", "utf-8"));
const dbUrl = config.database.connections.primary.url;

// Every caller embeds knowledge of the JSON structure.
// Change the structure → change every caller.
```

**DO: Hide the format behind the module.**

```typescript
const config = AppConfig.load(); // Reads and parses internally
const dbUrl = config.dbUrl; // Typed, flat, format-agnostic

// Callers don't know or care whether it's JSON, YAML, or env vars.
```

See `references/examples.md` for extended before/after examples including pass-through methods, temporal decomposition, and general-purpose vs. special-purpose design.

## Quick Depth Check

Before finalizing any module, run through these questions:

- [ ] Can a caller use this module without reading its implementation?
- [ ] Does the interface have significantly fewer concepts than the implementation?
- [ ] If I change the implementation, do zero callers need to change?
- [ ] Does each piece of the module make sense on its own, or did I split things that belong together?
- [ ] Am I exposing details because the caller "might need them," or because they actually do?

If you answer "no" to any of these, the module needs to be deeper.
