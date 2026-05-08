# Backlog

Gaps, deferrals, and refinements raised during design but not yet built. Each entry: what it unlocks + rough cost + why deferred.

## Infrastructure

### tsconfig.json parsing for path aliases
- **Unlocks**: `orphanFile` and `uniqueImplementation` correctly resolve `import { X } from '@/util/Logger'` instead of treating it as a package import.
- **Cost**: ~80 lines. Parse `compilerOptions.paths` + `baseUrl`, expand on import resolution.
- **Why deferred**: large codebases without aliases work fine; aliased ones get false-positive orphans + name-conflated unique-impls. Add when it bites.

### Semantic resolution for `passThroughMethod` arg=param matching
- **Unlocks**: distinguish "param `id` is forwarded" from "shadowing local `id` happens to match the param name." Removes a rare false positive.
- **Cost**: depends on whether oxc_semantic is exposed via `oxc-parser` or needs separate package. Probably ~50 lines if exposed.
- **Why deferred**: rare in practice. Current name-match catches the canonical pass-through cleanly.

### Namespace import support in scope resolver
- **Unlocks**: `uniqueImplementation` correctly handles `import * as M from './m'; class X implements M.Logger {}`. Currently the `M.Logger` reference is a `TSQualifiedName` and is skipped silently.
- **Cost**: ~40 lines. Track namespace bindings, walk qualified names through them.
- **Why deferred**: namespace imports are uncommon for type imports; impact is "miss some implementers" not "wrong impl count."

### Default-export-of-type support
- **Unlocks**: completeness. Currently `import Type from './foo'` is marked unresolvable.
- **Cost**: ~20 lines. Track default exports separately.
- **Why deferred**: TS conventionally uses named exports for types; near-zero practical impact.

## Output & CLI ergonomics

### SARIF output format
- **Unlocks**: integration with GitHub code scanning (PR annotations), VS Code SARIF viewer, security/CI pipelines that consume the standard.
- **Cost**: ~80 lines. Map each `Finding` → SARIF `Result` (SARIF 2.1.0). Tool metadata block, rule definitions per flag, `physicalLocation` with file URI + line/column.
- **Why deferred**: JSON works for the agent loop; SARIF only matters when a non-agent consumer (CI surface, IDE extension) needs it. Add `--format sarif` when wired to one.

### Detector subset filtering
- **Unlocks**: `red-flags --only duplicateSymbol,passThroughMethod` to scope an audit pass to specific flags. `red-flags --exclude genericNaming` to drop a temporarily-noisy detector. Also useful for iterating on a single detector during tuning.
- **Cost**: ~30 lines. Comma-separated CLI flag, filter `SINGLE_DETECTORS` and `CROSS_DETECTORS` arrays by detector name (drop the `detect` prefix and lowercase-first to match flag names).
- **Why deferred**: every invocation currently runs all 12 detectors. Cheap enough that it hasn't bitten yet; ship when a real workflow benefits.

### Configuration file (`red-flags.toml`)
- **Unlocks**: per-project tuning of thresholds, suffix lists, skip patterns without editing the script. Auto-discovered from project root (walk up from `target` looking for `red-flags.toml`).
- **Cost**: ~120 lines. Parse TOML (Bun has built-in TOML support via `Bun.TOML.parse` — no dep). Define schema mirroring the current `Tunables` block. Merge with defaults; later flags > config > defaults.
- **Why deferred**: defaults work on every fixture and the few real codebases tested. Per-project config matters when noise floor varies (different projects need different `WIDE_SIGNATURE_MAX`, `GENERIC_SUFFIXES`, etc.). Add when the first project wants to override.

## New detector ideas

### Layer-boundary enforcement (Sheriff-style)
- **Unlocks**: codify "domain can't import infra" rules. Catches the highest-signal architectural drift (single best answer for the agent-codebase-alignment problem).
- **Cost**: ~120 lines + a `red-flags.config.json` schema for layer rules. New config surface.
- **Why deferred**: needs a real codebase to model layers against (premature configuration is its own smell). Pull when there's a project where the layers are well-defined.

### Multi-representation duplication within one file
- **Unlocks**: catches the agent-pathology André hit on `agent.service.ts` — same shape encoded as TS type + JSON schema + runtime parser, all in one file.
- **Cost**: medium. Heuristic: detect "field-name set repeated across N representations within one file." Needs careful tuning to avoid noise on legit Zod-derives-type patterns.
- **Why deferred**: hard to detect without false positives; LLM audit catches it once attention is focused on hotspot files.

### Type-aware leakage (internal types in public APIs)
- **Unlocks**: catches when a type from `**/internal/**` or `_*` paths leaks into a public exported declaration's signature.
- **Cost**: variable. Syntactic version (~150 lines, name-tracking + path-pattern config). Real version needs TypeScript compiler API (~5MB dep, slower startup).
- **Why deferred**: syntactic version is heuristic; real version is a big lift. Worth doing if `uniqueImplementation` finds patterns suggesting layer leak is the deeper issue.

### Generic-type single-instantiation
- **Unlocks**: extends `uniqueImplementation` — flag `Repository<T>` if `T` is only ever instantiated to one concrete type project-wide.
- **Cost**: ~80 lines. Track type-arg usage across all call sites.
- **Why deferred**: less common smell than single-impl interfaces.

### Concrete class used in only one place
- **Unlocks**: agent-pathology catch where the agent wraps one-off logic in a class.
- **Cost**: ~60 lines. Count `new X()` references for each concrete class.
- **Why deferred**: high overlap with `shallowModule`; mostly redundant. Add only if real-world `shallowModule` results show this case is missed.

### Structural code-clone detection (AST shingling)
- **Unlocks**: catches body-shape duplication across files where bodies differ by names/literals — the same logic re-implemented with different identifiers.
- **Cost**: ~250 lines. Walk every "interesting" sub-tree (function bodies, class bodies, etc.), produce structural fingerprint with identifiers/literals normalized, group + flag.
- **Why deferred**: noise-tuning is the hard part. `jscpd` already does this well as a sibling tool. Build only if `duplicateSymbol`'s scope (named declarations only) misses too much.

### Re-export chain following in `orphanFile`
- **Unlocks**: prevents false orphans when files are only used through a barrel that's used elsewhere. (Currently we only count direct imports; barrel resolution would credit the original file.)
- **Cost**: ~30 lines. Re-use `resolveDeclarationSite` chain logic from `uniqueImplementation`.
- **Why deferred**: not yet observed false positives in real use. Add if seen.

## Refinements to existing detectors

### `duplicateSymbol` class fingerprint — name-aware vs name-blind methods
- **Current**: method names are part of the fingerprint, so two classes with same body shape but different method names (e.g. `add` vs `push`) don't match.
- **Trade-off**: name-blind would catch more agent-recreation cases (different naming, same logic) but adds false positives where two unrelated classes happen to share a shape (e.g. `HttpClient.get(url)` vs `FileReader.read(path)`).
- **Why deferred**: current behavior is the conservative choice; flip if real-world misses outweigh false positives.

### `passThroughVariable` closure detection
- **Current**: a function param's "only used as call argument" check walks the function body but doesn't distinguish references inside nested closures from references in the outer scope. A param captured by a closure that uses it later could be misclassified as a forwarded variable.
- **Trade-off**: closure-aware analysis requires walking with scope-tracking instead of bare AST traversal.
- **Why deferred**: noted when shipping v1.1; haven't seen a confirmed false positive from this in real use yet. Address if real-world hits start showing the pattern.

### `uniqueImplementation` minimum method count
- **Current**: any interface/abstract class with ≤ 1 implementer is flagged regardless of method count.
- **Trade-off**: threshold ≥ 2 methods would skip the functional-callback idiom space (`Disposable`, `Logger` single-method interfaces). Current default is stricter; tunable.
- **Why deferred**: trust the LLM audit to filter functional idioms.

## Explicit non-goals

These were considered and *intentionally* rejected:

- **`longFunction`** — PoSD Ch. 9 argues *against* length-based splitting. Long deep functions are fine.
- **`inconsistentErrorPattern`** — weak PoSD link. Generic best-practice smell, not Ousterhout-specific.
- **`duplicateLiteral`** — shipped briefly in v1.2, reverted. Most duplicate strings aren't info-leakage; they're error messages, library API names, schema keys. Real PoSD info-leakage lives in code structure, not literals. `duplicateSymbol` covers the high-signal slice (named declarations).
- **Cyclomatic complexity / CRAP score** — wrong proxy for PoSD complexity. Ousterhout argues in Ch. 4 that interface-implementation imbalance matters, not branch count.
- **Conjoined methods, special-general mixture, temporal decomposition** — LLM-audit territory. Heuristics here add noise without precision.
