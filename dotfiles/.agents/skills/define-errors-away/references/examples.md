# Define Errors Out of Existence — Extended Examples

## Example 1: HTTP Request Handler

### Before (Exception Soup)

```python
def handle_update_profile(request):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return Response(400, "Invalid JSON")

    if "email" not in body:
        return Response(400, "Missing email field")

    try:
        email = validate_email(body["email"])
    except InvalidEmailError:
        return Response(400, "Invalid email format")

    if "name" not in body:
        return Response(400, "Missing name field")

    if len(body["name"]) > 100:
        return Response(400, "Name too long")

    try:
        user = db.get_user(request.user_id)
    except UserNotFoundError:
        return Response(404, "User not found")

    try:
        user.update(email=email, name=body["name"])
        db.save(user)
    except DuplicateEmailError:
        return Response(409, "Email already taken")
    except DatabaseError:
        return Response(500, "Internal error")

    return Response(200, user.to_dict())
```

Seven error handling branches. More error code than business logic. Each branch is a separate path that needs testing.

### After (Errors Defined Away)

```python
# A schema that parses and validates in one step — no exceptions for bad input
ProfileUpdate = Schema({
    "email": Email(required=True),
    "name": String(max_length=100, required=True),
})

def handle_update_profile(request):
    # Schema.parse returns (parsed, errors) — no exceptions
    data, errors = ProfileUpdate.parse(request.body)
    if errors:
        return Response(400, errors)

    # update_profile handles "user must exist" internally (this is an
    # authenticated route — missing user is a bug, not a user error).
    # Email uniqueness is enforced at the DB level and surfaced as a
    # validation error, not an exception.
    user, errors = users.update_profile(request.user_id, data)
    if errors:
        return Response(errors.status, errors.detail)

    return Response(200, user.to_dict())
```

The JSON parsing, field validation, and type checking are all defined away by the schema. The database layer handles uniqueness constraints as validation errors rather than exceptions. The handler has two paths: success and validation error.

---

## Example 2: File Processing Pipeline

### Before (Defensive Everywhere)

```typescript
async function processUpload(filePath: string): Promise<Result> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    throw new Error("File is empty");
  }
  if (stats.size > MAX_SIZE) {
    throw new Error("File too large");
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    throw new Error(`Could not read file: ${e.message}`);
  }

  let parsed: Data;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }

  if (!Array.isArray(parsed.records)) {
    throw new Error("Expected records array");
  }

  const results: ProcessedRecord[] = [];
  for (const record of parsed.records) {
    try {
      results.push(processRecord(record));
    } catch (e) {
      // Skip bad records? Fail entirely? Nobody knows.
      console.error(`Skipping bad record: ${e.message}`);
    }
  }

  return { processed: results.length, total: parsed.records.length };
}
```

### After (Errors Defined Away or Aggregated)

```typescript
// A loader that handles all the file-level concerns internally
const loader = new JsonFileLoader<{ records: unknown[] }>({
  maxSize: MAX_SIZE,
  schema: z.object({ records: z.array(z.unknown()) }),
});

async function processUpload(filePath: string): Promise<ProcessingResult> {
  // load() returns the data or a structured error — never throws.
  // Handles: not found, empty, too large, not UTF-8, not JSON, wrong shape.
  const file = await loader.load(filePath);
  if (!file.ok) return ProcessingResult.failed(file.error);

  // processAll handles individual record failures internally.
  // Bad records are collected, not thrown.
  return RecordProcessor.processAll(file.data.records);
}

// RecordProcessor defines record errors out of existence:
class RecordProcessor {
  static processAll(records: unknown[]): ProcessingResult {
    const processed: ProcessedRecord[] = [];
    const skipped: SkippedRecord[] = [];

    for (const raw of records) {
      const record = RecordSchema.safeParse(raw);
      if (!record.ok) {
        skipped.push({ raw, reason: record.error });
        continue;
      }
      processed.push(this.process(record.data));
    }

    return new ProcessingResult(processed, skipped);
  }
}
```

The file loader defines away all file-related errors by handling them internally and returning a result type. The record processor defines away individual record failures by treating them as skipped records — not exceptions. The caller has two clear paths: file failed to load, or here are your results (with skip details included).

---

## Example 3: Cache with Transparent Fallback

### Before (Callers Handle Cache Misses)

```python
def get_user_profile(user_id: str) -> UserProfile:
    try:
        cached = cache.get(f"profile:{user_id}")
        if cached is not None:
            try:
                return UserProfile.from_json(cached)
            except DeserializationError:
                cache.delete(f"profile:{user_id}")  # Stale/corrupt entry
    except CacheConnectionError:
        pass  # Cache is down, fall through

    try:
        profile = db.query_user_profile(user_id)
    except DatabaseError as e:
        raise ServiceError(f"Could not fetch profile: {e}")

    try:
        cache.set(f"profile:{user_id}", profile.to_json(), ttl=300)
    except CacheConnectionError:
        pass  # Best effort caching

    return profile
```

The caller is managing cache hits, cache misses, cache corruption, cache connection failures, serialization errors, and database errors. Caching is supposed to be an optimization, but it's tripled the code complexity.

### After (Cache Masks Its Own Errors)

```python
class ProfileCache:
    """Cache with transparent fallback. Never throws — worst case, it's a no-op."""

    def get_or_load(self, user_id: str, loader: Callable) -> UserProfile:
        cached = self._try_get(f"profile:{user_id}")
        if cached is not None:
            return cached

        profile = loader()
        self._try_set(f"profile:{user_id}", profile, ttl=300)
        return profile

    def _try_get(self, key: str):
        """Returns deserialized value or None. Never throws."""
        try:
            raw = self.client.get(key)
            return UserProfile.from_json(raw) if raw else None
        except Exception:
            return None  # Cache miss, corruption, connection error — all the same

    def _try_set(self, key: str, value, ttl: int):
        """Best-effort write. Never throws."""
        try:
            self.client.set(key, value.to_json(), ttl=ttl)
        except Exception:
            pass  # Cache is an optimization, not a requirement


# Caller code:
def get_user_profile(user_id: str) -> UserProfile:
    return profile_cache.get_or_load(
        user_id,
        loader=lambda: db.query_user_profile(user_id),
    )
```

The cache masks all of its own errors. Connection failures, corruption, serialization bugs — all handled internally. The caller's code went from 15 lines with 5 exception handlers to 1 line with zero.

---

## Example 4: Idempotent State Transitions

### Before (Guard Against "Invalid" Transitions)

```python
class Order:
    def ship(self):
        if self.status == "shipped":
            raise AlreadyShippedError()
        if self.status == "cancelled":
            raise OrderCancelledError()
        if self.status != "paid":
            raise InvalidStateError(f"Cannot ship from {self.status}")
        self.status = "shipped"
        self.shipped_at = now()

    def cancel(self):
        if self.status == "cancelled":
            raise AlreadyCancelledError()
        if self.status == "shipped":
            raise CannotCancelShippedError()
        self.status = "cancelled"
```

Every state transition throws for "invalid" previous states, forcing every caller to handle multiple error cases.

### After (Idempotent Transitions)

```python
class Order:
    def ship(self) -> bool:
        """Mark as shipped. Returns True if state changed, False if already shipped
        or not in a shippable state. Never throws for state reasons."""
        if self.status != "paid":
            return False
        self.status = "shipped"
        self.shipped_at = now()
        return True

    def cancel(self) -> bool:
        """Cancel the order if possible. Returns True if state changed."""
        if self.status in ("cancelled", "shipped"):
            return False
        self.status = "cancelled"
        return True
```

"Ship an already-shipped order" isn't an error — it's a no-op. "Cancel a shipped order" isn't an error — it's a request that can't be fulfilled. The caller gets a boolean signal and decides what to do with it, no exception handling required.
