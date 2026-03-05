# Design It Twice — Extended Examples

## Example 1: Undo System for a Text Editor

### Problem

Design an undo/redo system for a collaborative text editor. Users need to undo their own operations without affecting other users' changes.

### Alternative A: Command Pattern

Store each user action as a command object with `execute()` and `undo()` methods. Keep a stack per user.

```typescript
class InsertCommand implements Command {
  constructor(
    private document: Document,
    private position: number,
    private text: string,
    readonly userId: string,
  ) {}

  execute(): void {
    this.document.insert(this.position, this.text);
  }

  undo(): void {
    this.document.delete(this.position, this.text.length);
  }
}

class UndoManager {
  private stacks = new Map<string, Command[]>();

  execute(command: Command): void {
    command.execute();
    const stack = this.stacks.get(command.userId) ?? [];
    stack.push(command);
    this.stacks.set(command.userId, stack);
  }

  undo(userId: string): void {
    const stack = this.stacks.get(userId);
    stack?.pop()?.undo();
  }
}
```

### Alternative B: Operation Transform on Immutable Snapshots

Store document state as immutable snapshots. Undo = compute the inverse transform and apply it to the current document state, not the previous one.

```typescript
interface DocumentState {
  readonly content: string;
  readonly version: number;
}

class Document {
  private state: DocumentState = { content: "", version: 0 };
  private history: Operation[] = [];

  apply(op: Operation): DocumentState {
    const newContent = op.transform(this.state.content);
    this.state = { content: newContent, version: this.state.version + 1 };
    this.history.push(op);
    return this.state;
  }

  undo(userId: string): DocumentState {
    // Find last op by this user, compute inverse, transform against
    // all subsequent operations, then apply
    const inverse = this.computeContextualInverse(userId);
    return this.apply(inverse);
  }
}
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

```typescript
// Caller must configure each route
const rateLimits: Record<string, RateLimit> = {
  "/api/search": new RateLimit({ requests: 100, window: 60 }),
  "/api/upload": new RateLimit({ requests: 10, window: 60 }),
};

async function rateLimitMiddleware(req: Request, next: NextFunction) {
  const limit = rateLimits[req.path];
  if (limit && !limiter.allow(req.clientIp, limit)) {
    return new Response(null, {
      status: 429,
      headers: { "Retry-After": limit.retryAfter() },
    });
  }
  return next(req);
}
```

### Alternative B: Token Bucket as a Transparent Layer

```typescript
// Rate limiting is a property of the route definition — no separate config
app.get(
  "/api/search",
  throttle({ burst: 20, sustained: 100, per: 60 }),
  async (req, res) => {
    ...
  },
);

app.post(
  "/api/upload",
  throttle({ burst: 2, sustained: 10, per: 60 }),
  async (req, res) => {
    ...
  },
);

// The middleware handles everything: tracking, headers, 429 responses,
// retry-after calculation, and burst allowance via token bucket.
// The route handler never sees rate limiting logic.
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
