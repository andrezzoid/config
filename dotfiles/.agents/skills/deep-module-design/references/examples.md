# Deep Module Design — Extended Examples

## Example 1: Pass-Through Methods

A pass-through method does nothing except delegate to another method with the same or nearly the same signature. It adds interface complexity without adding functionality — the definition of a shallow module.

### Before (Shallow)

```typescript
class UserController {
  constructor(private service: UserService) {}

  getUser(userId: string): User {
    return this.service.getUser(userId);
  }

  updateUser(userId: string, data: Record<string, unknown>): User {
    return this.service.updateUser(userId, data);
  }

  deleteUser(userId: string): void {
    this.service.deleteUser(userId);
  }
}

class UserService {
  constructor(private repo: UserRepository) {}

  getUser(userId: string): User {
    return this.repo.getUser(userId);
  }

  updateUser(userId: string, data: Record<string, unknown>): User {
    const user = this.repo.getUser(userId);
    user.update(data);
    this.repo.save(user);
    return user;
  }

  deleteUser(userId: string): void {
    this.repo.delete(userId);
  }
}
```

`UserController` is pure overhead. `get_user` and `delete_user` in `UserService` are nearly pass-throughs to the repository. Three layers, but only one — the `update_user` method — does anything meaningful.

### After (Deep)

```typescript
/** Manages user lifecycle. Handles storage, validation, and business rules. */
class Users {
  get(userId: string): User { ... }

  update(userId: string, changes: Record<string, unknown>): User {
    // Validates, applies changes, persists, returns updated user.
    ...
  }

  delete(userId: string): void {
    // Handles cascading cleanup (sessions, related data) internally.
    ...
  }
}
```

One module. No pass-throughs. Each method does something meaningful. Storage is an internal detail, not a separate layer.

---

## Example 2: Temporal Decomposition

Temporal decomposition means organizing code by the order in which things happen, rather than by what information they encapsulate. This often produces modules that each handle one step but share the same underlying knowledge.

> "In temporal decomposition, execution order is reflected in the code structure: operations that happen at different times are in different methods or classes. If the same knowledge is used at different points in execution, it gets encoded in multiple places."

### Before (Temporal)

```typescript
// Step 1: Read the file
class FileReader {
  read(path: string): RawData {
    const buffer = fs.readFileSync(path);
    return { buffer, format: detectFormat(path) };
  }
}

// Step 2: Parse based on format
class DataParser {
  parse(raw: RawData): ParsedData {
    if (raw.format === 'csv') return parseCsv(raw.buffer);
    if (raw.format === 'json') return parseJson(raw.buffer);
    if (raw.format === 'xml') return parseXml(raw.buffer);
    throw new Error(`Unknown format: ${raw.format}`);
  }
}

// Step 3: Validate the parsed data
class DataValidator {
  validate(data: ParsedData): ValidatedData {
    // Must understand the structure that each parser produces
    ...
  }
}
```

Three classes organized by _when_ things happen (read, parse, validate). The format knowledge leaks across all three — `FileReader` detects it, `DataParser` switches on it, `DataValidator` must understand each parser's output shape.

### After (Information-Hiding)

```typescript
class DataLoader {
  /**
   * Load structured data from a file. Handles format detection,
   * parsing, and validation internally. Supports CSV, JSON, and XML.
   */
  load(path: string): ValidatedData {
    // All format knowledge is encapsulated here.
    // Adding a new format means changing one module.
    ...
  }
}
```

One module that owns the entire concept of "loading data from a file." Format detection, parsing, and validation are implementation details — they happen to occur in sequence, but that's not the caller's concern.

---

## Example 3: General-Purpose vs. Special-Purpose

A general-purpose interface is often _simpler_ than a special-purpose one, because it replaces many specific methods with fewer, more flexible ones.

> "The most important (and perhaps surprising) benefit of the general-purpose approach is that it results in simpler and deeper interfaces than a special-purpose approach."

### Before (Special-Purpose)

```typescript
class TextEditor {
  deleteSelection(): void { ... }
  deleteNextChar(): void { ... }
  deletePrevChar(): void { ... }
  deleteWord(): void { ... }
  deleteLine(): void { ... }
  deleteToEndOfLine(): void { ... }

  insertChar(c: string): void { ... }
  insertString(s: string): void { ... }
  insertNewline(): void { ... }
  insertTab(): void { ... }
}
```

Ten methods, each for a specific editing action. Every new editing operation requires a new method.

### After (General-Purpose)

```typescript
class TextEditor {
  insert(position: Position, text: string): void { ... }
  delete(start: Position, end: Position): void { ... }
  selection(): Range { ... }
  moveCursor(position: Position): void { ... }
}
```

Four methods that can express any editing operation. `delete_selection` becomes `delete(selection.start, selection.end)`. `delete_line` becomes `delete(line_start, line_end)`. The interface is both smaller and more powerful.

---

## Example 4: Configuration with Defaults (Pull Complexity Down)

### Before (Complexity Pushed Up to Caller)

```typescript
// Every caller must know the right configuration
const client = new HttpClient({
  timeout: 30,
  retries: 3,
  retryBackoff: new ExponentialBackoff({ base: 1, max: 30 }),
  connectionPoolSize: 10,
  keepAlive: true,
  sslVerify: true,
  sslCaBundle: "/etc/ssl/certs/ca-certificates.crt",
  followRedirects: true,
  maxRedirects: 5,
});
```

The interface exposes every implementation decision. Callers must understand connection pooling, SSL verification, backoff strategies — things they shouldn't need to care about.

### After (Complexity Pulled Down)

```typescript
// Sensible defaults for everything. Override only what you need.
const client = new HttpClient();

// Or, for the rare case where you need to customize:
const client = new HttpClient({ timeout: 60, retries: 5 });
```

The constructor still accepts all those options, but it defaults every single one to a sensible value. 95% of callers write one line. The module absorbed the complexity of knowing what good defaults look like.

---

## Example 5: Don't Over-Decompose Utilities

### Before (Premature Abstraction)

```typescript
// utils/string.ts — used in exactly one place
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// utils/array.ts — used in exactly one place
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

// utils/date.ts — used in exactly one place
export function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}
```

Three files, three functions, each used once. The "utility" abstraction isn't hiding information — it's just moving code to a different file. Callers must now find and understand the utility instead of seeing the logic inline.

### After (Inline Until Reuse is Real)

```typescript
// Just write it where you use it
const displayName = name.charAt(0).toUpperCase() + name.slice(1);
const uniqueTags = [...new Set(tags)];
const dateStr = date.toISOString().split("T")[0];
```

Three lines, no indirection. Extract into a shared utility only when you have three or more call sites, and even then, only if the utility can provide a genuinely simpler interface than the raw operation.
