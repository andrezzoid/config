# red-flags

Deterministic candidate-flagger for PoSD-style complexity smells in TypeScript codebases.

## What it is, what it isn't

- **It is** a high-recall, fast pre-scanner. Every finding is `severity: "candidate"`. False positives are accepted; the LLM filters them in audit.
- **It is not** a verdict tool. It does not decide whether a candidate is a real smell — that's the job of `/complexity-red-flags`.

## Detectors (v1.1)

| Flag | Catches |
| --- | --- |
| `shallowModule` | Files with `(top-level exports + public class members) / body_lines > 0.3`. Class-member-aware — catches single-class shallow files (e.g., the temperature converter pattern). |
| `wideModule` | Files with > 10 top-level exports. |
| `passThroughMethod` | Methods/functions whose body is one delegating call where the inner call's args match the outer params 1:1 by name. |
| `passThroughVariable` | A param whose every body reference is in argument position of a call. Guarded by ≥3 params + ≥2 body statements to keep noise down. |
| `genericNaming` | Class/interface/type names ending in generic suffixes (`Manager`, `Helper`, `Utils`, `Wrapper`, `Container`, `Holder`, `Util`, `Misc`, `Common`, `Processor`, `Handler`). `Service` is intentionally excluded — too prevalent in legit code. |
| `tsEscapeHatch` | `as any` (AST-precise, won't match strings) plus `@ts-ignore` / `@ts-expect-error`. |
| `emptyCatch` | `catch` clauses with no executable statement (truly empty or comment-only). |
| `catchRethrow` | `catch (e) { throw e }` — pure rethrow with no enrichment. Enforces same identifier on both sides. |

## Not yet covered (require manual audit or v2)

- Information leakage (cross-module duplication of mappings/formats) — needs cross-file analysis.
- Temporal decomposition (verb-phase module names) — heuristic too noisy in v1.
- Conjoined methods (implicit ordering between calls) — needs runtime/protocol knowledge.
- Special-general mixture (string-equality switches in generic code) — heuristic in scope but deferred.
- Type-aware leakage (internal types exposed in public APIs) — needs a type checker (TypeScript compiler API).

## Dependencies

`bun` (runtime) + `oxc-parser` (npm dep). Bun is a single binary; oxc-parser is Rust-backed and ~few MB.

```bash
brew install oven-sh/bun/bun       # or curl -fsSL https://bun.sh/install | bash
cd <skill-dir>/red-flags
bun install                        # one-time, after pulling
```

## Usage

```bash
bun red-flags.ts [PATH]                    # Scan PATH (default: cwd)
bun red-flags.ts [PATH] --diff <git-ref>   # Scan only files changed vs <git-ref>
                                           # (committed + working-tree + untracked)
bun red-flags.ts [PATH] --format json      # JSON (default)
bun red-flags.ts [PATH] --format text      # Human digest
```

## Output schema

```json
{
  "summary": {
    "totalFindings": 19,
    "byFlag": { "shallowModule": 4, "passThroughMethod": 2, "...": 0 },
    "topFiles": [{ "file": "src/foo.ts", "count": 5 }]
  },
  "findings": [
    {
      "flag": "passThroughMethod",
      "severity": "candidate",
      "file": "src/UserService.ts",
      "line": 8,
      "message": "method body delegates with same args (true pass-through)",
      "metadata": {}
    }
  ]
}
```

Findings are sorted by `(flag, file, line)` for deterministic diffing across runs.

## Tests

```bash
./test.sh
```

Each fixture in `fixtures/<flag>/` has a `case.ts` with the smell + an `expected.json` listing the expected `(flag, file, line)` triples. The runner asserts exact matches per flag (other detectors firing on the same fixture are ignored — fixtures contrive cross-firings real code legitimately has).

## Tunables

In `red-flags.ts`:

- `SHALLOW_RATIO` — surface/body threshold (default 0.3)
- `SHALLOW_MIN_BODY` — min body lines to consider (default 3)
- `SHALLOW_MIN_SURFACE` — min surface elements to consider (default 2)
- `WIDE_MIN_EXPORTS` — wide-module threshold (default 10)
- `GENERIC_SUFFIXES` — generic-name suffix list

## v1.1 vs v1

v1 was bash + ast-grep + ripgrep + jq. v1.1 is Bun + oxc-parser. Why we moved:

- **Pass-through method now checks arg=param matching properly** (ast-grep's text-based meta-var equality broke on TypeScript-typed params).
- **Shallow module now counts public class members**, not just top-level `export` lines — catches the canonical shallow class.
- **`as any` is AST-precise** — no false positives on string literals.
- **`catchRethrow` enforces identifier match** between catch param and the rethrown identifier.
- **New detector: `passThroughVariable`** — needs parent-context analysis ast-grep can't easily express.

Performance is comparable (oxc-parser is Rust-backed). No compile step in either version — Bun runs `red-flags.ts` directly.
