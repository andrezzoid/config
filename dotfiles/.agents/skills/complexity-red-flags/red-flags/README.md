# red-flags

Deterministic candidate-flagger for PoSD-style complexity smells in TypeScript codebases.

## What it is, what it isn't

- **It is** a high-recall, fast pre-scanner. Every finding is `severity: "candidate"`. False positives are accepted; the LLM filters them in audit.
- **It is not** a verdict tool. It does not decide whether a candidate is a real smell — that's the job of `/complexity-red-flags`.

## Detectors (v1.4)

| Flag | Scope | Catches |
| --- | --- | --- |
| `shallowModule` | per-file | Files with `(top-level exports + public class members) / body_lines > 0.3`. Class-member-aware — catches single-class shallow files (e.g., the temperature converter pattern). |
| `wideModule` | per-file | Files with > 10 top-level exports. |
| `wideSignature` | per-file | Functions/methods/constructors with > 4 required params. Optional, default, and rest params don't count — they're explicit signals the param is incidental to most callers. |
| `passThroughMethod` | per-file | Methods/functions whose body is one delegating call where the inner call's args match the outer params 1:1 by name. |
| `passThroughVariable` | per-file | A param whose every body reference is in argument position of a call. Guarded by ≥3 params + ≥2 body statements to keep noise down. |
| `genericNaming` | per-file | Class/interface/type names ending in generic suffixes (`Manager`, `Helper`, `Utils`, `Wrapper`, `Container`, `Holder`, `Util`, `Misc`, `Common`, `Processor`, `Handler`). `Service` is intentionally excluded — too prevalent in legit code. |
| `tsEscapeHatch` | per-file | `as any` (AST-precise, won't match strings) plus `@ts-ignore` / `@ts-expect-error`. |
| `emptyCatch` | per-file | `catch` clauses with no executable statement (truly empty or comment-only). |
| `catchRethrow` | per-file | `catch (e) { throw e }` — pure rethrow with no enrichment. Enforces same identifier on both sides. |
| `duplicateSymbol` | **cross-file + within-file** | Top-level declarations with identical shape (regardless of location): `const` (by name+value for primitives, structure for objects/arrays), `function`/arrow (by param count + normalized body), `class`/`interface`/`type`/`enum` (by structural shape). Catches both cross-file *and* within-file duplicates (agents reliably duplicate within a single file too — parallel boilerplate, copy-paste, organic type growth). Skips test files, generated paths, re-exports, and bare-primitive type aliases. Threshold ≥2 occurrences for `const`/`function`, ≥3 for `class`/`interface`/`type`. One finding per group with full `occurrences` in metadata. |
| `uniqueImplementation` | **cross-file** | Interface or abstract class with ≤ 1 implementer/subclass. The whole purpose of these constructs is polymorphism; if only one type satisfies them, callers pay the cost (read both abstraction and impl) for zero polymorphism payoff. **Scope-aware**: `implements X` is resolved through the file's imports/re-exports to a specific declaration site, so two same-named interfaces in different modules don't conflate. Re-export chains followed up to 16 hops. Path aliases and namespace imports not yet supported. |
| `orphanFile` | **cross-file** | Files imported by zero other files. Skips test files, `*.d.ts`, generated code, and common entrypoint patterns (`index.ts`/`main.ts`/`app.ts`/`server.ts`/`cli.ts`/`bin.ts`, plus `pages/`, `routes/`, `api/`, `app/`, `bin/` directories). Catches dead code and exploration files the agent forgot to delete. |

## Not yet covered (require manual audit)

- Type-aware leakage (internal types exposed in public APIs) — needs a TypeScript compiler API. Deferred to v2.
- Layer-boundary enforcement (Sheriff-style architectural rules) — needs a config schema. Deferred.
- Multi-representation duplication within one file (e.g., TS type + JSON schema + runtime parser all encoding the same shape) — different AST shapes, hard to detect statically. LLM audit territory.
- Temporal decomposition, conjoined methods, special-general mixture — LLM territory. Adding heuristics here adds noise without precision.
- Structural code-clone detection (same body shape, different bodies) — use `jscpd` as a sibling tool when needed. `duplicateSymbol` already catches the high-signal slice (re-declarations of named symbols).
- Length-based "long function" detection — explicitly NOT included. PoSD Ch. 9 argues against length-based splitting; long deep functions are fine.

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
- `WIDE_SIGNATURE_MAX` — max required params before flagging (default 4)
- `GENERIC_SUFFIXES` — generic-name suffix list
- `DUP_MIN_OCCURRENCES_DEFAULT` / `DUP_MIN_OCCURRENCES_BY_KIND` — total-occurrence thresholds (default 2; class/interface/type at 3). Counts within-file and cross-file occurrences uniformly.
- `DUP_CONST_MIN_STRING_LENGTH` — min string length for `const` value tracking (default 5)
- `DUP_CONST_TRIVIAL_NUMBERS` — bare numbers always skipped (default −1, 0, 1, 2)
- `DUP_FN_MAX_PARAMS` / `DUP_FN_MAX_STATEMENTS` — utility-function size band (defaults 8, 12)
- `DUP_TEST_FILE_PATTERN` / `DUP_GENERATED_PATH` — paths skipped by `duplicateSymbol` (and `orphanFile`)
- `ORPHAN_ENTRYPOINT_PATTERNS` — file patterns excluded from orphan check (entrypoints, file-based routes, type declarations)

## Version history

**v1** (bash + ast-grep + ripgrep + jq) — 7 per-file detectors via ast-grep YAML rules and ripgrep counting.

**v1.1** (Bun + oxc-parser) — rewrote in TS for real AST access. Improvements:
- `passThroughMethod` now checks arg=param matching properly (ast-grep's text-based meta-var equality broke on typed params).
- `shallowModule` now counts public class members in surface, not just `^export` lines — catches the temperature-converter shallow class.
- `as any` is AST-precise — no false positives on string literals.
- `catchRethrow` enforces identifier match between catch param and the rethrown identifier.
- New: `passThroughVariable` — needs parent-context analysis ast-grep couldn't express.

**v1.2** (skipped/reverted) — `duplicateLiteral` shipped briefly but was too noisy. Real-world hit rate was dominated by error messages, library-API arg strings, and schema keys — none of which are PoSD info-leakage. Reverted in favor of v1.3's narrower approach.

**v1.3** — added `duplicateSymbol`, the first cross-file detector that actually targets the agent-recreation pattern. Tracks **declarations**, not usages: a `const`/`function`/`class`/`interface`/`type`/`enum` with identical shape declared in N+ files is the static signal for "agent rebuilt something it didn't know existed." Per-kind fingerprinting + per-kind thresholds keep the noise floor low. Findings consolidated to one per group with full `occurrences[]` in metadata.

**v1.4** — three new detectors aligned with PoSD chapters explicitly:
- `wideSignature` — PoSD Ch. 6 overexposure: > 4 required params (excluding optional/default/rest).
- `uniqueImplementation` — PoSD Ch. 6 cost-benefit: interface or abstract class with ≤ 1 implementer means polymorphism payoff isn't real.
- `orphanFile` — PoSD-adjacent dead-code signal targeting agent-exploration leftovers. Skips entrypoints by file-name pattern.

**v1.5** — `uniqueImplementation` upgraded from name-only matching to scope-aware resolution. For each file we now build a `localName → declarationSite` map from local declarations + named imports + re-exports, then walk re-export chains to resolve `implements X` to a specific `(file, name)` pair. Catches the previously-missed case where two same-named interfaces in different modules each have a single implementer (name-only would conflate them as 2 implementers of one virtual "interface", missing both). Still doesn't handle path aliases (needs tsconfig parsing) or namespace imports (different AST shape).

**v1.6** — six PoSD-alignment fixes from real-world feedback:
- **TS-aware fingerprint for type aliases and interfaces**: `normalizeAst` strips TS-prefixed nodes (correct for function bodies) which made all complex type aliases collapse to identical fingerprints. New `fingerprintTypeNode` walks `TSTypeReference`, `TSUnionType`, `TSIntersectionType`, `TSTypeLiteral`, etc. with structure preservation. Eliminates the "47 unrelated types in one group" bug.
- **Primitive `const` requires exact name + value match**: PoSD info-leakage is "the same DECISION encoded in N places." Same value with different names is coincidence; requiring name+value match makes the flag unambiguous. Object/array consts unchanged (structural fingerprint is enough).
- **`--diff` parses all, filters output**: cross-file detectors need full project context; `--diff` was previously filtering the input set, producing wrong answers (orphan flagged because importer didn't change). Now we always parse the whole tree and filter findings whose related files touch changed files.
- **`passThroughMethod` restricted to `this`-rooted class methods**: PoSD Ch. 7 is specifically about layer methods delegating to instance state. Free functions wrapping library calls (`function f(x) { return arr.includes(x) }`) are naming/type abstractions PoSD favors. Receiver must be `this` or `this.<member>`.
- **`passThroughVariable` requires ≥3 pass-through params**: PoSD's canonical example is 4 forwarded params (`request, config, logger, metrics`); the strict reading is ≥3. One- or two-param forwarding is incidental, not the plumbing-layer pattern. Emit one finding per function listing all pass-through params.
- **`uniqueImplementation` interface flagged at exactly 1 impl**: TS overloads `interface` for both polymorphism contracts and structural type definitions. Zero-implementer interfaces in TS are overwhelmingly structural; flagging them was wrong by default. Abstract classes keep `≤ 1` (the `abstract` keyword is unambiguous polymorphism intent).

**v1.7** — `duplicateSymbol` now catches **within-file duplicates** in addition to cross-file. Two changes:

1. **Threshold counts total occurrences, not distinct files.** Original "≥N distinct files" assumption was flawed — agents reliably duplicate within a single file too (parallel boilerplate, copy-paste, organic type growth). One-line fix; same per-kind thresholds. Message phrasing distinguishes "3× in 1 file" from "3× across 3 files".

2. **Fingerprint preserves callee identifier names + member property names.** Previously every `Identifier` collapsed to `$id`, including callees — so two functions with the same body shape but different inner-function calls would falsely group (real bug surfaced in agent-loop usage on `renderSlackResponseTurn` vs `renderSlackPostMessageResponseTurn`). Now `Member(obj, .foo)` and `Call(id:foo, [args])` keep the meaningful name. Variable/param names still normalize, so `function isEmpty(x)` and `function blank(s)` still match (same logic, different param names).

Performance is comparable across versions (oxc-parser is Rust-backed). No compile step at any point — Bun runs `red-flags.ts` directly.
