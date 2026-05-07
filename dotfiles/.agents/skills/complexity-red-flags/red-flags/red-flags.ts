#!/usr/bin/env bun
// red-flags v1.1 — deterministic candidate-flagger for PoSD-style complexity smells.
// High recall, no verdicts. The /complexity-red-flags audit skill is the judge.
//
// Usage:
//   red-flags [PATH]                    Scan PATH (default: cwd) for .ts/.tsx
//   red-flags [PATH] --diff <git-ref>   Scan only files changed since <git-ref>
//   red-flags [PATH] --format json      JSON output (default)
//   red-flags [PATH] --format text      Human-readable digest
//
// Output schema (json):
//   { summary: { totalFindings, byFlag, topFiles[] }, findings: [{flag,file,line,message,metadata}] }
//
// Each finding's `severity` is always "candidate" — the script does not decide.

import { parseSync } from "oxc-parser";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { execSync } from "node:child_process";

// -------- Tunables --------
// Thresholds chosen for "noise floor under 1 finding per ~50 LOC on real code"
// during initial calibration; revisit after a week of agent-loop usage.
const SHALLOW_RATIO = 0.3;        // surface / body_lines; > this is shallow
const SHALLOW_MIN_BODY = 3;       // skip trivially small files
const SHALLOW_MIN_SURFACE = 2;    // skip single-export files
const WIDE_MIN_EXPORTS = 10;      // > this exports = wide barrel
const GENERIC_SUFFIXES = [
  "Manager", "Helper", "Wrapper", "Container", "Holder",
  "Utils", "Util", "Misc", "Common", "Processor", "Handler",
];
// `Service` is intentionally excluded — too prevalent in legitimate code.

// -------- Types --------
type Severity = "candidate";
type Finding = {
  flag: string;
  severity: Severity;
  file: string;
  line: number;
  message: string;
  metadata: Record<string, unknown>;
};
type LineOf = (offset: number) => number;
// AST nodes from oxc-parser are loosely typed; we walk them structurally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

// -------- AST utilities --------

// Build a 1-based line lookup from byte offsets. O(log n) per query after
// O(source_length) build. Cached per file.
function buildLineOf(source: string): LineOf {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return (offset: number) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

// Depth-first AST traversal; visits every typed node with parent context.
// Skips primitives and arrays-of-primitives so detectors don't see noise.
function walk(node: Node, visit: (n: Node, parent: Node | null) => void, parent: Node | null = null): void {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "range") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) walk(item, visit, node);
    } else if (value && typeof value === "object") {
      walk(value, visit, node);
    }
  }
}

// -------- Detectors --------
// Each takes (file, source, ast, comments, lineOf) and returns Finding[].
// File path is the value placed in `finding.file` — already relative to scan root.

type Ctx = {
  file: string;
  source: string;
  ast: Node;
  comments: Array<{ type: "Line" | "Block"; value: string; start: number; end: number }>;
  lineOf: LineOf;
};

// Counts API surface (top-level exports + public members of exported classes)
// against non-blank/non-comment/non-import body lines. Wider net than v1's
// raw export-line counting — catches single-class shallow files.
function detectShallowModule({ file, source, ast }: Ctx): Finding[] {
  let surface = 0;
  for (const stmt of ast.body) {
    if (stmt.type === "ExportNamedDeclaration") {
      if (stmt.declaration) {
        const d = stmt.declaration;
        if (d.type === "ClassDeclaration") {
          surface += 1;
          for (const member of d.body?.body ?? []) {
            if (member.type !== "MethodDefinition" && member.type !== "PropertyDefinition") continue;
            const isPrivate =
              member.accessibility === "private" ||
              (typeof member.key?.name === "string" && member.key.name.startsWith("_"));
            if (!isPrivate) surface += 1;
          }
        } else if (d.type === "VariableDeclaration") {
          surface += d.declarations?.length ?? 0;
        } else {
          surface += 1; // function, type alias, interface, enum
        }
      }
      if (stmt.specifiers) surface += stmt.specifiers.length;
    } else if (stmt.type === "ExportDefaultDeclaration") {
      surface += 1;
    } else if (stmt.type === "ExportAllDeclaration") {
      surface += 1;
    }
  }

  let body = 0;
  for (const line of source.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;
    if (/^import[\s{*]/.test(t)) continue;
    body += 1;
  }

  if (body < SHALLOW_MIN_BODY || surface < SHALLOW_MIN_SURFACE) return [];
  if (surface / body <= SHALLOW_RATIO) return [];

  return [{
    flag: "shallowModule",
    severity: "candidate",
    file,
    line: 1,
    message: `${surface} surface elements / ${body} body lines — interface heavy relative to implementation`,
    metadata: { surface, bodyLines: body },
  }];
}

// Method/function whose body is exactly one delegating call where the inner
// call's arguments match the outer params 1:1 by identifier name. v1.1 fix:
// proper AST-shape comparison instead of ast-grep's text-based meta-var check.
function detectPassThroughMethod({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    let fn: Node | null = null;
    let lineAnchor = node.start;
    if (node.type === "FunctionDeclaration") {
      fn = node;
    } else if (node.type === "MethodDefinition") {
      fn = node.value;
    } else {
      return;
    }
    if (!fn?.body?.body || fn.body.body.length !== 1) return;

    const paramNames: string[] = [];
    for (const p of fn.params ?? []) {
      if (p.type === "Identifier") paramNames.push(p.name);
      else if (p.type === "TSParameterProperty" && p.parameter?.type === "Identifier") paramNames.push(p.parameter.name);
      else return; // Rest/destructure/default — too complex for v1.1
    }

    const stmt = fn.body.body[0];
    let call: Node | null = null;
    if (stmt.type === "ReturnStatement" && stmt.argument?.type === "CallExpression") {
      call = stmt.argument;
    } else if (stmt.type === "ExpressionStatement" && stmt.expression?.type === "CallExpression") {
      call = stmt.expression;
    }
    if (!call || call.callee?.type !== "MemberExpression") return;
    if ((call.arguments?.length ?? 0) !== paramNames.length) return;

    for (let i = 0; i < paramNames.length; i++) {
      const arg = call.arguments[i];
      if (arg.type !== "Identifier" || arg.name !== paramNames[i]) return;
    }

    findings.push({
      flag: "passThroughMethod",
      severity: "candidate",
      file,
      line: lineOf(lineAnchor),
      message: "method body delegates with same args (true pass-through)",
      metadata: {},
    });
  });
  return findings;
}

// Param whose every body reference is in argument position of a call —
// it's threaded through but never read. PoSD's example is the classic
// `(req, res, ctx, logger, metrics)` plumbing layer.
//
// Two guards keep the false-positive rate sane:
// (1) Function has ≥3 params — the PoSD smell is about *threading multiple*
//     intermediate methods, and single-param "pass-throughs" are already
//     covered by passThroughMethod when the body is one call.
// (2) Body has >1 statement — single-statement bodies are pass-through-method's
//     territory; flagging here just doubles the noise.
//
// Without these, the detector fires on legit cases like `cache.get(id)` where
// `id` is meaningfully consumed but syntactically just a call arg.
function detectPassThroughVariable({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    let fn: Node | null = null;
    if (node.type === "FunctionDeclaration") fn = node;
    else if (node.type === "MethodDefinition") fn = node.value;
    else return;
    if (!fn?.body?.body) return;
    if ((fn.params?.length ?? 0) < 3) return;
    if (fn.body.body.length < 2) return;

    for (const param of fn.params ?? []) {
      if (param.type !== "Identifier") continue;
      const name: string = param.name;

      let usageCount = 0;
      let nonForwardingFound = false;
      walk(fn.body, (id, parent) => {
        if (id.type !== "Identifier" || id.name !== name) return;
        usageCount += 1;
        const isForwarding =
          parent?.type === "CallExpression" &&
          Array.isArray(parent.arguments) &&
          parent.arguments.includes(id);
        if (!isForwarding) nonForwardingFound = true;
      });

      if (usageCount > 0 && !nonForwardingFound) {
        findings.push({
          flag: "passThroughVariable",
          severity: "candidate",
          file,
          line: lineOf(param.start),
          message: `param '${name}' is only forwarded as a call argument — never read`,
          metadata: { paramName: name },
        });
      }
    }
  });
  return findings;
}

// Catch with no executable statement (truly empty or comment-only). Comments
// aren't AST statements, so checking body[].length === 0 catches both.
function detectEmptyCatch({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    if (node.type !== "CatchClause") return;
    if (!node.body || (node.body.body?.length ?? 0) > 0) return;
    findings.push({
      flag: "emptyCatch",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: "catch body has no executable statement",
      metadata: {},
    });
  });
  return findings;
}

// `catch (e) { throw e }` — pure rethrow with no enrichment. v1.1 fix:
// enforces that the rethrown identifier matches the catch parameter, so
// `catch (e) { throw other }` (rare but legal) is correctly excluded.
function detectCatchRethrow({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    if (node.type !== "CatchClause") return;
    if (!node.body || node.body.body?.length !== 1) return;
    const stmt = node.body.body[0];
    if (stmt.type !== "ThrowStatement" || stmt.argument?.type !== "Identifier") return;
    if (node.param?.type === "Identifier" && node.param.name !== stmt.argument.name) return;
    findings.push({
      flag: "catchRethrow",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: "catch body is a pure rethrow",
      metadata: {},
    });
  });
  return findings;
}

// Class/interface/type names ending in generic suffixes (PoSD ch.14).
function detectGenericNaming({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  const re = new RegExp(`(${GENERIC_SUFFIXES.join("|")})$`);
  walk(ast, (node) => {
    let id: Node | null = null;
    if ((node.type === "ClassDeclaration" || node.type === "TSInterfaceDeclaration" || node.type === "TSTypeAliasDeclaration") && node.id) {
      id = node.id;
    }
    if (!id?.name) return;
    if (!re.test(id.name)) return;
    findings.push({
      flag: "genericNaming",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: `name '${id.name}' uses a generic suffix (Manager/Helper/Utils/...)`,
      metadata: { name: id.name },
    });
  });
  return findings;
}

// `as any` (AST-precise — won't match strings) and @ts-ignore / @ts-expect-error
// (comment-based). Each is a tactical-programming smell.
function detectTsEscapeHatches({ file, ast, comments, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    if (node.type !== "TSAsExpression") return;
    if (node.typeAnnotation?.type !== "TSAnyKeyword") return;
    findings.push({
      flag: "tsEscapeHatch",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: "TS escape hatch (`as any`)",
      metadata: { kind: "asAny" },
    });
  });
  for (const c of comments) {
    const v = c.value.trim();
    if (!/^@ts-(ignore|expect-error)\b/.test(v)) continue;
    findings.push({
      flag: "tsEscapeHatch",
      severity: "candidate",
      file,
      line: lineOf(c.start),
      message: "TS escape hatch (`@ts-ignore` / `@ts-expect-error`)",
      metadata: { kind: v.split(/\s/)[0] },
    });
  }
  return findings;
}

// Files exporting more than WIDE_MIN_EXPORTS top-level symbols.
function detectWideModule({ file, ast }: Ctx): Finding[] {
  let exports = 0;
  for (const stmt of ast.body) {
    if (stmt.type === "ExportNamedDeclaration") {
      if (stmt.declaration?.declarations) exports += stmt.declaration.declarations.length;
      else if (stmt.declaration) exports += 1;
      if (stmt.specifiers) exports += stmt.specifiers.length;
    } else if (stmt.type === "ExportDefaultDeclaration") {
      exports += 1;
    } else if (stmt.type === "ExportAllDeclaration") {
      exports += 1;
    }
  }
  if (exports <= WIDE_MIN_EXPORTS) return [];
  return [{
    flag: "wideModule",
    severity: "candidate",
    file,
    line: 1,
    message: `${exports} top-level exports — wide module surface`,
    metadata: { exports },
  }];
}

const DETECTORS = [
  detectShallowModule,
  detectPassThroughMethod,
  detectPassThroughVariable,
  detectEmptyCatch,
  detectCatchRethrow,
  detectGenericNaming,
  detectTsEscapeHatches,
  detectWideModule,
];

// -------- File collection --------

function collectFiles(target: string, diffRef: string | null): string[] {
  if (diffRef) {
    // In agent loops most changes are uncommitted, so we union three sets:
    // (1) committed diff vs ref, (2) working-tree modified, (3) untracked.
    const lines = new Set<string>();
    try {
      const a = execSync(`git diff --name-only --diff-filter=ACMR ${shellQuote(diffRef)} -- '*.ts' '*.tsx'`, {
        cwd: target, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
      });
      for (const l of a.split("\n")) if (l) lines.add(l);
    } catch { /* ref doesn't exist or not a git repo — ignore */ }
    try {
      const b = execSync(`git ls-files --modified --others --exclude-standard -- '*.ts' '*.tsx'`, {
        cwd: target, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
      });
      for (const l of b.split("\n")) if (l) lines.add(l);
    } catch { /* not a git repo — ignore */ }
    return [...lines].filter(f => existsSync(join(target, f))).sort();
  }
  // Whole-tree scan via `find` — no rg dep, fewer surprises with hidden dirs.
  const out = execSync(
    `find . -type f \\( -name '*.ts' -o -name '*.tsx' \\) -not -path '*/node_modules/*' -not -path '*/.git/*'`,
    { cwd: target, encoding: "utf8" }
  );
  return out.split("\n").filter(Boolean).map(f => f.replace(/^\.\//, "")).sort();
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// -------- Main --------

function usage(): never {
  process.stderr.write(
    `red-flags [PATH] [--diff <git-ref>] [--format json|text]\n` +
    `  Scan TypeScript files for PoSD-style complexity smell candidates.\n`
  );
  process.exit(2);
}

function main(): void {
  let target = "";
  let diffRef: string | null = null;
  let format: "json" | "text" = "json";

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--diff") diffRef = args[++i] ?? usage();
    else if (a === "--format") {
      const v = args[++i];
      if (v !== "json" && v !== "text") usage();
      format = v;
    } else if (a === "-h" || a === "--help") usage();
    else if (a.startsWith("-")) {
      process.stderr.write(`unknown flag: ${a}\n`);
      process.exit(2);
    } else {
      target = a;
    }
  }
  target = target || ".";
  if (!existsSync(target)) {
    process.stderr.write(`no such path: ${target}\n`);
    process.exit(2);
  }
  const root = statSync(target).isDirectory() ? resolve(target) : resolve(target, "..");
  const targetAbs = resolve(target);

  let files: string[];
  if (statSync(targetAbs).isFile()) {
    files = [relative(root, targetAbs)];
  } else {
    files = collectFiles(targetAbs, diffRef);
  }

  const allFindings: Finding[] = [];
  for (const file of files) {
    const abs = join(root, file);
    let source: string;
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const parsed = parseSync(file, source);
    if (parsed.errors?.length && parsed.program?.body?.length === 0) continue;
    const lineOf = buildLineOf(source);
    const ctx: Ctx = { file, source, ast: parsed.program, comments: parsed.comments ?? [], lineOf };
    for (const detect of DETECTORS) {
      try { allFindings.push(...detect(ctx)); }
      catch (e) {
        process.stderr.write(`detector ${detect.name} failed on ${file}: ${(e as Error).message}\n`);
      }
    }
  }

  allFindings.sort((a, b) =>
    a.flag.localeCompare(b.flag) || a.file.localeCompare(b.file) || a.line - b.line
  );

  const byFlag: Record<string, number> = {};
  for (const f of allFindings) byFlag[f.flag] = (byFlag[f.flag] ?? 0) + 1;

  const fileCounts: Record<string, number> = {};
  for (const f of allFindings) fileCounts[f.file] = (fileCounts[f.file] ?? 0) + 1;
  const topFiles = Object.entries(fileCounts)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const result = {
    summary: { totalFindings: allFindings.length, byFlag, topFiles },
    findings: allFindings,
  };

  if (format === "json") {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    const lines: string[] = [];
    lines.push(`Total: ${result.summary.totalFindings} findings\n`);
    for (const [flag, count] of Object.entries(byFlag)) lines.push(`  ${flag}: ${count}`);
    lines.push("\nTop files:");
    for (const { file, count } of topFiles) lines.push(`  ${count}  ${file}`);
    lines.push("\nFindings:");
    for (const f of allFindings) lines.push(`  [${f.flag}] ${f.file}:${f.line} — ${f.message}`);
    process.stdout.write(lines.join("\n") + "\n");
  }
}

main();
