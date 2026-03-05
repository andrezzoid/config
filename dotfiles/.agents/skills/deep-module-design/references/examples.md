# Deep Module Design — Extended Examples

## Example 1: Pass-Through Methods

A pass-through method does nothing except delegate to another method with the same or nearly the same signature. It adds interface complexity without adding functionality — the definition of a shallow module.

### Before (Shallow)

```python
class UserController:
    def __init__(self, service: UserService):
        self.service = service

    def get_user(self, user_id: str) -> User:
        return self.service.get_user(user_id)

    def update_user(self, user_id: str, data: dict) -> User:
        return self.service.update_user(user_id, data)

    def delete_user(self, user_id: str) -> None:
        return self.service.delete_user(user_id)


class UserService:
    def __init__(self, repo: UserRepository):
        self.repo = repo

    def get_user(self, user_id: str) -> User:
        return self.repo.get_user(user_id)

    def update_user(self, user_id: str, data: dict) -> User:
        user = self.repo.get_user(user_id)
        user.update(data)
        self.repo.save(user)
        return user

    def delete_user(self, user_id: str) -> None:
        self.repo.delete(user_id)
```

`UserController` is pure overhead. `get_user` and `delete_user` in `UserService` are nearly pass-throughs to the repository. Three layers, but only one — the `update_user` method — does anything meaningful.

### After (Deep)

```python
class Users:
    """Manages user lifecycle. Handles storage, validation, and business rules."""

    def get(self, user_id: str) -> User: ...

    def update(self, user_id: str, changes: dict) -> User:
        # Validates, applies changes, persists, returns updated user.
        ...

    def delete(self, user_id: str) -> None:
        # Handles cascading cleanup (sessions, related data) internally.
        ...
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

```python
class TextEditor:
    def delete_selection(self) -> None: ...
    def delete_next_char(self) -> None: ...
    def delete_prev_char(self) -> None: ...
    def delete_word(self) -> None: ...
    def delete_line(self) -> None: ...
    def delete_to_end_of_line(self) -> None: ...

    def insert_char(self, c: str) -> None: ...
    def insert_string(self, s: str) -> None: ...
    def insert_newline(self) -> None: ...
    def insert_tab(self) -> None: ...
```

Ten methods, each for a specific editing action. Every new editing operation requires a new method.

### After (General-Purpose)

```python
class TextEditor:
    def insert(self, position: Position, text: str) -> None: ...
    def delete(self, start: Position, end: Position) -> None: ...
    def selection(self) -> Range: ...
    def move_cursor(self, position: Position) -> None: ...
```

Four methods that can express any editing operation. `delete_selection` becomes `delete(selection.start, selection.end)`. `delete_line` becomes `delete(line_start, line_end)`. The interface is both smaller and more powerful.

---

## Example 4: Configuration with Defaults (Pull Complexity Down)

### Before (Complexity Pushed Up to Caller)

```python
# Every caller must know the right configuration
client = HttpClient(
    timeout=30,
    retries=3,
    retry_backoff=ExponentialBackoff(base=1, max=30),
    connection_pool_size=10,
    keep_alive=True,
    ssl_verify=True,
    ssl_ca_bundle="/etc/ssl/certs/ca-certificates.crt",
    follow_redirects=True,
    max_redirects=5,
)
```

The interface exposes every implementation decision. Callers must understand connection pooling, SSL verification, backoff strategies — things they shouldn't need to care about.

### After (Complexity Pulled Down)

```python
# Sensible defaults for everything. Override only what you need.
client = HttpClient()

# Or, for the rare case where you need to customize:
client = HttpClient(timeout=60, retries=5)
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
