# Design It Twice — Extended Examples

## Example 1: Undo System for a Text Editor

### Problem

Design an undo/redo system for a collaborative text editor. Users need to undo their own operations without affecting other users' changes.

### Alternative A: Command Pattern

Store each user action as a command object with `execute()` and `undo()` methods. Keep a stack per user.

```python
class InsertCommand:
    def __init__(self, document, position, text, user_id):
        self.document = document
        self.position = position
        self.text = text
        self.user_id = user_id

    def execute(self):
        self.document.insert(self.position, self.text)

    def undo(self):
        self.document.delete(self.position, len(self.text))

class UndoManager:
    def __init__(self):
        self.stacks: dict[str, list[Command]] = {}

    def execute(self, command: Command):
        command.execute()
        self.stacks.setdefault(command.user_id, []).append(command)

    def undo(self, user_id: str):
        stack = self.stacks.get(user_id, [])
        if stack:
            stack.pop().undo()
```

### Alternative B: Operation Transform on Immutable Snapshots

Store document state as immutable snapshots. Undo = compute the inverse transform and apply it to the current document state, not the previous one.

```python
@dataclass(frozen=True)
class DocumentState:
    content: str
    version: int

class Document:
    def __init__(self):
        self.state = DocumentState("", 0)
        self.history: list[Operation] = []

    def apply(self, op: Operation) -> DocumentState:
        new_content = op.transform(self.state.content)
        self.state = DocumentState(new_content, self.state.version + 1)
        self.history.append(op)
        return self.state

    def undo(self, user_id: str) -> DocumentState:
        # Find last op by this user, compute inverse, transform against
        # all subsequent operations, then apply
        inverse = self._compute_contextual_inverse(user_id)
        return self.apply(inverse)
```

### Comparison

| Axis                      | Command Pattern                                | Operation Transform                                 |
| ------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| Interface simplicity      | Simpler — execute/undo is intuitive            | More complex — transforms require understanding     |
| Collaborative correctness | Broken — undo positions shift when others edit | Correct — inverse is computed against current state |
| Information hiding        | Low — each command knows document internals    | Higher — operations are self-contained transforms   |
| Cognitive load            | Easy to implement initially                    | Harder upfront, but handles edge cases correctly    |

### Decision

For a collaborative editor, Alternative B wins despite higher initial complexity. Alternative A silently corrupts document state when multiple users edit simultaneously — the "simpler" design creates bugs that are hard to diagnose.

---

## Example 2: Configuration System

### Problem

Design a configuration system for a web application that needs to read from multiple sources (env vars, config files, CLI args) with type safety.

### Alternative A: Layered Reader

Each source is a separate reader. A resolver walks them in priority order.

```typescript
interface ConfigReader {
  get(key: string): string | undefined;
}

class EnvReader implements ConfigReader { ... }
class FileReader implements ConfigReader { ... }
class CliReader implements ConfigReader { ... }

class Config {
  constructor(private readers: ConfigReader[]) {}

  get(key: string): string | undefined {
    for (const reader of this.readers) {
      const value = reader.get(key);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  getRequired(key: string): string {
    const value = this.get(key);
    if (value === undefined) throw new Error(`Missing config: ${key}`);
    return value;
  }
}
```

### Alternative B: Eager Resolution to Typed Schema

Resolve all configuration once at startup into a typed, immutable object. No runtime lookups.

```typescript
const AppConfigSchema = {
  port: { type: "number", default: 3000 },
  dbUrl: { type: "string", required: true },
  debug: { type: "boolean", default: false },
} as const;

type AppConfig = ResolveSchema<typeof AppConfigSchema>;
// { port: number; dbUrl: string; debug: boolean }

function loadConfig(schema: typeof AppConfigSchema): AppConfig {
  // Reads all sources once, validates, returns frozen typed object.
  // Throws at startup if required values are missing.
}

// Usage — no optionals, no runtime errors, no string keys
const config = loadConfig(AppConfigSchema);
app.listen(config.port);
```

### Comparison

| Axis                 | Layered Reader                     | Eager Typed Schema                               |
| -------------------- | ---------------------------------- | ------------------------------------------------ |
| Interface simplicity | Simple but stringly-typed          | Slightly more setup, but typed access            |
| Error surface        | Runtime errors on missing keys     | Fails fast at startup — no runtime config errors |
| Information hiding   | Exposes source layering to callers | Sources are hidden; callers see typed object     |
| Flexibility          | Easy to add sources                | Easy to add sources (just add to loader)         |

### Decision

Alternative B defines configuration errors out of existence — if the app starts, all config is valid. Alternative A scatters potential failures throughout the codebase wherever `getRequired()` is called. The typed schema also makes the configuration self-documenting.

---

## Example 3: API Rate Limiter

### Problem

Implement rate limiting for an API. Different endpoints have different limits. Need to handle bursts gracefully.

### Alternative A: Middleware with Per-Route Config

```python
# Caller must configure each route
rate_limits = {
    "/api/search": RateLimit(requests=100, window=60),
    "/api/upload": RateLimit(requests=10, window=60),
}

@app.middleware
def rate_limit_middleware(request, next):
    limit = rate_limits.get(request.path)
    if limit and not limiter.allow(request.client_ip, limit):
        return Response(429, retry_after=limit.retry_after())
    return next(request)
```

### Alternative B: Token Bucket as a Transparent Layer

```python
# Rate limiting is a property of the route decorator — no separate config
@app.route("/api/search")
@throttle(burst=20, sustained=100, per=60)
def search(request):
    ...

@app.route("/api/upload")
@throttle(burst=2, sustained=10, per=60)
def upload(request):
    ...

# The decorator handles everything: tracking, headers, 429 responses,
# retry-after calculation, and burst allowance via token bucket.
# The route handler never sees rate limiting logic.
```

### Comparison

| Axis                 | Middleware + Config Map                             | Decorator with Token Bucket            |
| -------------------- | --------------------------------------------------- | -------------------------------------- |
| Interface simplicity | Requires separate config dict                       | Co-located with route — one line       |
| Information hiding   | Rate limit logic spread across middleware + config  | Fully encapsulated in decorator        |
| Error surface        | Config map can drift from actual routes             | Can't misconfigure — it's on the route |
| Cognitive load       | Must understand middleware chain + config structure | Just read the decorator args           |

### Decision

Alternative B is deeper — it hides the token bucket algorithm, retry-after calculation, and response handling behind a simple decorator. Configuration is co-located with the thing it configures, making it impossible for them to drift apart.
