# red-flags

Deterministic candidate-flagger for PoSD-style complexity smells in TypeScript codebases.

## What it is, what it isn't

- **It is** a high-recall, fast pre-scanner. Every finding is `severity: "candidate"`. False positives are accepted; the LLM filters them in audit.
- **It is not** a verdict tool. It does not decide whether a candidate is a real smell — that's the job of `/complexity-red-flags`.

## Detectors (v1)

| Flag | Method | Catches |
| --- | --- | --- |
| `shallowModule` | rg + awk | Files with `exports / body_lines > 0.3` (interface-heavy modules). |
| `wideModule` | rg | Files with > 10 top-level exports. |
| `passThroughMethod` | ast-grep | Methods/functions whose body is one delegating call. |
| `genericNaming` | rg | Class/interface/type names ending in `Manager`, `Helper`, `Utils`, `Wrapper`, `Container`, `Holder`, `Util`, `Misc`, `Common`, `Processor`, `Handler`. |
| `tsEscapeHatch` | rg | `as any`, `@ts-ignore`, `@ts-expect-error`. |
| `emptyCatch` | ast-grep | `catch` clauses with no executable statement (truly empty or comment-only). |
| `catchRethrow` | ast-grep | `catch (e) { throw e }` — pure rethrow with no enrichment. |

## Not yet covered (require manual audit or v1.1)

- Information leakage (cross-module duplication of mappings/formats)
- Temporal decomposition (verb-phase module names)
- Conjoined methods (implicit ordering between calls)
- Special-general mixture (string-equality switches in generic code)
- Pass-through variables (params threaded through unread)

## Dependencies

`bash`, `ast-grep`, `ripgrep`, `jq`, `git`. All are pre-built single binaries — no compilation step at any point.

```bash
brew install bash ast-grep ripgrep jq git
```

## Usage

```bash
red-flags [PATH]                    # Scan PATH (default: cwd)
red-flags [PATH] --diff <git-ref>   # Scan only files changed vs <git-ref>
                                    # (committed + working-tree + untracked)
red-flags [PATH] --format json      # JSON (default)
red-flags [PATH] --format text      # Human digest
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
      "message": "method body is a single delegating call",
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

In `red-flags`:

- `SHALLOW_RATIO_X10` — exports/body threshold * 10 (default 3 = ratio > 0.3)
- `SHALLOW_MIN_BODY` — min body lines to consider (default 3)
- `SHALLOW_MIN_EXPORTS` — min exports to consider (default 2)
- `WIDE_MIN_EXPORTS` — wide-module threshold (default 10)
