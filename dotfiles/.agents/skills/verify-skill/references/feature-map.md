# Feature map shape

The map lives in `.claude/skills/verify-<app>/features/`: a `README.md` index and one file per user-facing feature. It names user paths, stable handles, required state, commands and observable proof. Implementation details stay out, because they rot faster than behavior.

## features/README.md

Holds four things, in this order:

1. **Baseline.** How a verification run starts: the `scripts/verify launch` call, the disposable data dir (`$RUN_ID` in its name so runs never share state), the seed data every recipe assumes, and the `doctor` result to require before driving.
2. **Driving conventions.** Handles to prefer (ARIA role and name, data attributes, prompt strings), that every recipe starts from the baseline unless it says otherwise, and that mutations restore seed data without touching evidence.
3. **Proof rules.** UI proof is an accessibility snapshot plus a screenshot with the app's identity visible. CLI proof is the command, stdout, stderr and exit code. A mutation's proof includes a second, read-only view of the stored value. Every artifact records the feature id and the entry point used. A path you couldn't reach is reported with the attempted command and the unmet precondition, never as verified through a different path.
4. **Index.** One line per feature file: the link and what it covers.

## One file per feature

An H1 title, one paragraph on the user-visible behavior, then exactly these four H2s:

- `Sub-features`: short ids, one line of behavior each.
- `How to get to it (user POV)`: every entry point a user has.
- `Driving it with scripts/verify`: starts with `Preconditions:`, then one bullet per step pairing the user action, the exact command and the observable result.
- `Gotchas`: traps that waste or invalidate a run.

## Example: features/export.md

```markdown
# Export a report

A user exports the current month's ledger as CSV, from the toolbar or the CLI, and gets a file whose rows match what the table shows.

## Sub-features

- `export-toolbar` downloads a CSV from the Export button.
- `export-cli` writes the same CSV from `ledger export`.
- `export-empty` exports a header-only file for a month with no entries.

## How to get to it (user POV)

- Choose `Export` in the ledger toolbar.
- Run `ledger export --month 2026-09` in a terminal.

## Driving it with scripts/verify

Preconditions:

- `scripts/verify doctor` passes against the instance this run launched.
- The seed data holds three September entries and none for October.

- **Toolbar export.** Choose `Export`. Run `scripts/verify browser click --role button --name "Export"`. A file `ledger-2026-09.csv` lands in the run's download dir with a header and three rows.
- **Rows match the table.** Run `scripts/verify browser snapshot --role table --name "Entries"` and compare its three rows to the CSV. Amounts match to the cent.
- **CLI export.** Run `scripts/verify cli -- ledger export --month 2026-09 --out "$RUN_DIR/cli.csv"`. Exit code `0`, and the file is byte-identical to the toolbar export.
- **Empty month.** Run `scripts/verify cli -- ledger export --month 2026-10 --out "$RUN_DIR/empty.csv"`. Exit code `0`, and the file holds only the header line.
- **Proof.** Run `scripts/verify evidence export`. The evidence dir holds both CSVs, the table snapshot and a screenshot showing the app title and the month.

## Gotchas

- The toolbar exports the month in view, not the current month. Navigate before exporting.
- Amounts render with a thousands separator in the table and without one in the CSV. Compare numbers, not strings.
```
