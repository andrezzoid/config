---
name: complexity-red-flags
description: |
  Detect and fix complexity red flags from A Philosophy of Software Design. Use this skill when reviewing code, refactoring, doing code review, or auditing code quality. Also trigger after implementing any significant feature — run a red flag check before considering the work done. Trigger when the user says "review", "audit", "simplify", "clean up", or asks "is this code good?" This is especially critical for LLM-generated code, which frequently produces the exact anti-patterns these red flags detect: shallow modules, unnecessary wrappers, pass-through methods, and over-decomposed architectures.
---

# Complexity Red Flags

> "Complexity is anything related to the structure of a software system that makes it hard to understand and modify the system."
> — John Ousterhout, _A Philosophy of Software Design_

Complexity rarely arrives all at once. It creeps in one small decision at a time — a shallow wrapper here, a leaked abstraction there, a pass-through method because "separation of concerns." Each one seems harmless. Together, they make a system incomprehensible.

This skill is a diagnostic checklist. Use it to audit code — your own or someone else's — against the specific red flags Ousterhout identifies. LLM-generated code is especially prone to these patterns because LLMs optimize for what _looks_ organized rather than what actually manages complexity.

## When to Trigger

Use this skill:

- After implementing a feature, before calling it done
- When reviewing a pull request or code diff
- When the user asks you to review, audit, or simplify code
- When refactoring and you need to decide what to change
- When code "feels complex" but you can't articulate why

## The Red Flags

### 1. Shallow Modules

**What it looks like**: A class or module whose interface is nearly as complex as its implementation. Many small classes with one or two methods each. Files that are mostly boilerplate.

> "A shallow module is one whose interface is complicated relative to the functionality it provides. Shallow modules don't help much in the battle against complexity, because the benefit they provide (not having to learn about how they work internally) is negated by the cost of learning and using their interfaces."

**The test**: Count the concepts in the interface (methods, parameters, types, exceptions) versus the concepts in the implementation. If they're close to equal, the module is shallow.

**Common LLM pattern**: Generating a `Validator` class with one `validate()` method, a `Formatter` class with one `format()` method, a `Sender` class with one `send()` method — each with more setup than logic.

**DON'T:**

```python
class TemperatureConverter:
    def celsius_to_fahrenheit(self, c: float) -> float:
        return c * 9/5 + 32
```

A class for a one-line formula. The interface (constructor, method name, self parameter) is more complex than the operation.

**DO:** Inline it, or make it a plain function if reused. Better yet, fold it into the module that needs the conversion.

---

### 2. Information Leakage

**What it looks like**: The same knowledge encoded in multiple modules. Change one, and you must change the others. Often manifests as parallel class hierarchies, duplicated validation, or shared format assumptions.

> "Information leakage occurs when a design decision is reflected in multiple modules. This creates a dependency between the modules: any change to that design decision will require changes to all of the involved modules."

**The test**: If you changed an internal data format (e.g., JSON to YAML, MySQL to Postgres, REST to GraphQL), how many files would need to change? More than one means leakage.

**Common LLM pattern**: Generating a `Reader` class and a `Writer` class for the same file format, each independently knowing the format details.

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
// models/user.ts — single source of truth for mapping
class User {
  static fromRow(row: DbRow): User { ... }
}
```

---

### 3. Temporal Decomposition

**What it looks like**: Code organized by the order things happen (read, then parse, then validate, then save) rather than by what information each piece encapsulates.

> "In temporal decomposition, the structure of a system corresponds to the time order in which operations will occur... this results in information leakage: the knowledge required for each operation is split across multiple modules."

**The test**: Are your modules named after verbs/phases (Reader, Parser, Validator, Saver) rather than nouns/concepts (Document, DataSource, User)?

**Common LLM pattern**: Generating pipeline-style architectures where each step is its own class, each needing to know about the data format from the previous step.

**DON'T:**

```
FileReader → DataParser → DataValidator → DataWriter
```

Each class knows about the data format. Change the format, change all four.

**DO:**

```
DataStore.load(path)  → validated data
DataStore.save(path, data)
```

One module owns the concept. Read, parse, validate are internal steps.

---

### 4. Pass-Through Methods

**What it looks like**: A method whose body does nothing except call another method with the same or similar arguments. Adds a layer of abstraction without adding any abstraction.

> "A pass-through method is one that does little except invoke another method, whose signature is similar or identical to that of the calling method. This typically indicates that there is not a clean division of responsibility between the classes."

**The test**: Remove the method. Does the caller's code get simpler or more complex? If it gets simpler (just call the underlying method directly), the pass-through was pure overhead.

**Common LLM pattern**: Controller → Service → Repository layers where the Service just delegates to the Repository with no additional logic.

**DON'T:**

```python
class UserService:
    def get_user(self, id: str) -> User:
        return self.repo.get_user(id)   # Just forwarding

    def delete_user(self, id: str) -> None:
        self.repo.delete_user(id)       # Just forwarding
```

**DO:** Either add real logic to the service layer (validation, authorization, business rules, caching) that justifies its existence, or eliminate the layer entirely and let callers use the repository directly.

---

### 5. Pass-Through Variables

**What it looks like**: A variable passed through multiple layers of methods, most of which don't use it — they just forward it to the next layer.

> "Pass-through variables add complexity because they force all of the intermediate methods to be aware of their existence, even though the methods have no use for the variables."

**The test**: Does this parameter exist in a function signature only because a function it calls needs it? That's a pass-through variable.

**DON'T:**

```python
def handle_request(request, config, logger, metrics):
    user = authenticate(request, config, logger, metrics)
    ...

def authenticate(request, config, logger, metrics):
    token = extract_token(request, config, logger)
    ...
```

`logger` and `metrics` are threaded through every function but only used deep in the stack.

**DO:** Use context objects, dependency injection, or module-level access to break the threading:

```python
def handle_request(request):
    user = authenticate(request)
    ...
```

---

### 6. Conjoined Methods

**What it looks like**: Two or more methods that can't be understood independently — you must read both to understand either. They share implicit assumptions about order of calls, internal state, or data formats.

**The test**: Can you read this method's signature and documentation and understand how to use it, without reading any other method? If not, it's conjoined.

**DON'T:**

```python
processor.init_batch()      # Must call before process()
processor.process(items)    # Must call after init, before finalize
processor.finalize_batch()  # Must call after process()
```

Three methods with implicit ordering requirements. Miss one, get a bug.

**DO:**

```python
processor.process_batch(items)  # Handles init, processing, and finalization
```

---

### 7. Overexposure (Verbose Interfaces)

**What it looks like**: An interface that exposes details the caller rarely or never needs. Every configuration option, every internal state, every intermediate result is available.

> "If the API for a commonly used feature forces users to learn about other features that are rarely used, this increases the cognitive load on users who don't need the rarely used features."

**Common LLM pattern**: Generating constructors with 8+ parameters, or APIs with many optional flags that expose internal implementation choices.

**DON'T:**

```python
cache = Cache(
    backend="redis",
    host="localhost",
    port=6379,
    serializer="json",
    compression="gzip",
    max_connections=10,
    retry_policy="exponential",
    retry_max=3,
    ssl=False,
    key_prefix="app:",
)
```

**DO:**

```python
cache = Cache("redis://localhost:6379")  # Sensible defaults for everything else
```

---

### 8. Special-General Mixture

**What it looks like**: General-purpose mechanism code tangled with special-case business logic in the same module.

**The test**: Is there code in this module that only applies to one specific use case, mixed in with code that applies to all use cases?

**DON'T:**

```python
class QueryBuilder:
    def build(self, params):
        query = "SELECT * FROM " + params.table
        if params.table == "users":
            query += " WHERE active = true"  # Special case leaked in
        if params.filters:
            query += " WHERE " + self._build_filters(params.filters)
        return query
```

**DO:** Keep the general mechanism pure. Let callers supply the special cases:

```python
class QueryBuilder:
    def build(self, table: str, filters: list[Filter]) -> str: ...

# Caller supplies the domain-specific filter
users = qb.build("users", [Filter("active", "=", True)])
```

## The Audit Workflow

When reviewing code, work through each red flag systematically:

1. **Scan module boundaries.** List every class/module and its public interface. Flag any whose interface complexity approaches their implementation complexity (shallow).
2. **Check for duplicated knowledge.** Grep for the same constants, formats, or logic appearing in multiple files (leakage).
3. **Look at module names.** Verb-phase names (Reader, Parser, Validator) suggest temporal decomposition.
4. **Read method bodies.** Methods that just call another method with the same args are pass-throughs.
5. **Trace parameters.** Variables that flow through multiple layers untouched are pass-through variables.
6. **Check method independence.** Methods that require specific call ordering are conjoined.
7. **Count constructor/factory parameters.** More than 3-4 required parameters suggests overexposure.
8. **Look for `if type ==` or `if name ==` patterns.** Special-case checks inside general mechanisms.

Report findings grouped by red flag, with specific file/line references and a suggested fix for each.

See `references/examples.md` for an extended example showing how to run a full audit on a real codebase and fix every red flag found.
