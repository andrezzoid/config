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

// duplicateSymbol — agents tend to redeclare instead of reusing. Tracking
// declarations (not usages) means signal is concentrated; per-kind thresholds
// dampen coincidence on the noisier kinds (class/interface/type).
const DUP_MIN_FILES_DEFAULT = 2;
const DUP_MIN_FILES_BY_KIND: Record<string, number> = {
  class: 3,
  interface: 3,
  type: 3,
};
// Constants smaller than this aren't worth tracking — too generic.
const DUP_CONST_MIN_STRING_LENGTH = 5;
const DUP_CONST_TRIVIAL_NUMBERS = new Set([-1, 0, 1, 2]);
// Functions outside this size band are coincidence (too small) or business
// logic (too big). Utilities cluster in [1, 12] statements.
const DUP_FN_MAX_PARAMS = 8;
const DUP_FN_MAX_STATEMENTS = 12;
// Skip patterns. Test files and generated code routinely re-declare shapes
// for legitimate reasons; flagging them buries real findings.
const DUP_TEST_FILE_PATTERN = /(^|\/)(__tests__|__mocks__|test|tests)\/|\.(test|spec)\.tsx?$/;
const DUP_GENERATED_PATH = /(^|\/)(generated|__generated__)\/|\.(gen|pb)\.tsx?$|_pb\.tsx?$/;

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

// -------- Cross-file detectors --------

// A symbol that's declared in N+ files. Targets the agent-recreation pattern:
// the agent rebuilds a constant/utility/type that already exists elsewhere
// because it didn't search the codebase first.
//
// Per-kind fingerprint:
//   const  → recursive value fingerprint (only if all leaves are primitives)
//   function/arrow → param count + structurally normalized body
//   class  → super-class name + sorted member fingerprints
//   interface/type → structural shape; bare-primitive type aliases are skipped
//                    (they're nominal types, intentionally distinct)
//   enum   → sorted member-name list
//
// Skips: test files, generated code, re-exports, type aliases to a single
// primitive keyword. Two distinct files is the default threshold; classes,
// interfaces, and types use 3+ to dampen the higher coincidence rate of
// structural shapes (parallel layer types, common DTO shapes).
type SymbolKind = "const" | "function" | "class" | "interface" | "type" | "enum";
type SymbolDecl = {
  kind: SymbolKind;
  name: string;
  fingerprint: string;
  file: string;
  line: number;
  // Source byte range — used to build the preview snippet shown to users/agents.
  start: number;
  end: number;
};

// Trimmed source slice + truncation marker. Indented snippets are easier to
// visually separate from the message line in the text formatter.
const PREVIEW_MAX_CHARS = 240;
function previewSource(source: string, start: number, end: number): string {
  let s = source.slice(start, end);
  if (s.length > PREVIEW_MAX_CHARS) {
    s = s.slice(0, PREVIEW_MAX_CHARS).replace(/\s+\S*$/, "") + " …";
  }
  return s;
}

// djb2 — non-cryptographic, just stable across runs so the agent can group
// findings sharing the same fingerprint without seeing the raw fingerprint.
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Top-level fingerprint for a `const X = <expr>`. Returns null unless the
// initializer is a pure literal expression (so `const X = computeFoo()` is
// ignored — its value is determined at runtime). Trivial bare primitives
// (short strings, common numbers, booleans) are also rejected at the top
// level only — they may still appear as nested elements of an array/object.
function fingerprintConstValue(node: Node): string | null {
  const fp = constValueRaw(node);
  if (!fp) return null;
  if (fp === "b:true" || fp === "b:false") return null;
  if (fp.startsWith("n:")) {
    const n = Number(fp.slice(2));
    if (DUP_CONST_TRIVIAL_NUMBERS.has(n)) return null;
  }
  if (fp.startsWith("s:")) {
    const s = JSON.parse(fp.slice(2));
    if (typeof s !== "string" || s.length < DUP_CONST_MIN_STRING_LENGTH) return null;
  }
  return fp;
}

function constValueRaw(node: Node): string | null {
  if (!node) return null;
  if (node.type === "Literal") {
    if (typeof node.value === "string") return `s:${JSON.stringify(node.value)}`;
    if (typeof node.value === "number") return `n:${node.value}`;
    if (typeof node.value === "boolean") return `b:${node.value}`;
    return null;
  }
  if (node.type === "TemplateLiteral" && (node.expressions?.length ?? 0) === 0) {
    const v = node.quasis?.[0]?.value?.cooked ?? "";
    return `s:${JSON.stringify(v)}`;
  }
  if (node.type === "UnaryExpression" && (node.operator === "-" || node.operator === "+")) {
    const inner = constValueRaw(node.argument);
    if (!inner) return null;
    return `${node.operator}${inner}`;
  }
  if (node.type === "ArrayExpression") {
    const elements: string[] = [];
    for (const el of node.elements ?? []) {
      if (!el) return null;
      const fp = constValueRaw(el);
      if (!fp) return null;
      elements.push(fp);
    }
    return `arr[${elements.join(",")}]`;
  }
  if (node.type === "ObjectExpression") {
    const entries: string[] = [];
    for (const prop of node.properties ?? []) {
      if (prop.type !== "Property") return null;
      let key: string;
      if (prop.key?.type === "Identifier") key = prop.key.name;
      else if (prop.key?.type === "Literal" && typeof prop.key.value === "string") key = prop.key.value;
      else return null;
      const val = constValueRaw(prop.value);
      if (!val) return null;
      entries.push(`${key}=${val}`);
    }
    entries.sort();
    return `obj{${entries.join(",")}}`;
  }
  return null;
}

// Structural fingerprint for any AST sub-tree. Identifiers and literals
// collapse to placeholders so two functions with different param/var names
// match. Type-system nodes are skipped — they don't change runtime semantics.
const NORMALIZE_SKIP_KEYS = new Set([
  "loc", "range", "start", "end",
  "decorators", "typeAnnotation", "typeParameters", "returnType",
  "computed", "optional", "static", "async", "generator",
  "definite", "declare", "abstract", "readonly", "accessibility",
  "implements", "superTypeArguments",
]);

function normalizeAst(node: Node | null): string {
  if (!node || typeof node !== "object") return "";
  const t = node.type;
  if (typeof t !== "string") return "";
  if (t.startsWith("TS") && t !== "TSAsExpression" && t !== "TSNonNullExpression") return "";

  if (t === "Identifier") return "$id";
  if (t === "PrivateIdentifier") return "$pid";
  if (t === "Literal") {
    if (typeof node.value === "string") return "$str";
    if (typeof node.value === "number") return "$num";
    if (typeof node.value === "boolean") return "$bool";
    if (node.value === null) return "$null";
    return "$lit";
  }
  if (t === "TemplateLiteral") return `Tpl(${node.expressions?.length ?? 0})`;
  if (t === "ThisExpression") return "$this";
  if (t === "Super") return "$super";

  const parts: string[] = [t, "("];
  for (const key of Object.keys(node)) {
    if (NORMALIZE_SKIP_KEYS.has(key)) continue;
    if (key === "type") continue;
    const v = node[key];
    if (Array.isArray(v)) {
      parts.push("[", v.map(normalizeAst).filter(Boolean).join(","), "]");
    } else if (v && typeof v === "object") {
      parts.push(normalizeAst(v));
    } else if (v != null && (key === "operator" || key === "kind" || key === "prefix")) {
      // Scalar fields that affect runtime semantics. `operator` covers binary,
      // logical, unary, update, assignment expressions. `kind` distinguishes
      // const/let/var and method/constructor/get/set. `prefix` separates ++x
      // from x++.
      parts.push(`@${key}=${v}`);
    }
  }
  parts.push(")");
  return parts.join("");
}

function fingerprintFunction(fn: Node): string | null {
  const params = fn.params ?? [];
  if (params.length > DUP_FN_MAX_PARAMS) return null;
  const body = fn.body;
  if (!body) return null;
  if (body.type === "BlockStatement") {
    const stmts = body.body ?? [];
    if (stmts.length === 0 || stmts.length > DUP_FN_MAX_STATEMENTS) return null;
    return `fn/${params.length}:${normalizeAst(body)}`;
  }
  // Expression-bodied arrow: `const f = x => x + 1`
  return `fn/${params.length}=>${normalizeAst(body)}`;
}

function fingerprintClass(cls: Node): string | null {
  const members = cls.body?.body ?? [];
  if (members.length === 0) return null;
  const memberFps: string[] = [];
  for (const m of members) {
    const name =
      m.key?.type === "Identifier" ? m.key.name :
      m.key?.type === "Literal" ? String(m.key.value) :
      "?";
    if (m.type === "MethodDefinition") {
      const fp = fingerprintFunction(m.value);
      if (fp) memberFps.push(`m:${name}=${fp}`);
    } else if (m.type === "PropertyDefinition") {
      const initFp = m.value ? (constValueRaw(m.value) ?? `expr:${normalizeAst(m.value)}`) : "uninit";
      memberFps.push(`p:${name}=${initFp}`);
    }
  }
  if (memberFps.length === 0) return null;
  memberFps.sort();
  const superName = cls.superClass?.type === "Identifier" ? cls.superClass.name : "";
  return `cls(super=${superName}):[${memberFps.join("|")}]`;
}

// True iff the type alias right-hand side is a single primitive keyword,
// with or without an intersection brand. These are nominal types and
// duplicates are intentional — `type UserId = string` and `type OrderId = string`
// are not the same design decision.
function isBarePrimitiveType(node: Node): boolean {
  if (!node) return false;
  const primitiveKinds = new Set([
    "TSStringKeyword", "TSNumberKeyword", "TSBooleanKeyword",
    "TSBigIntKeyword", "TSAnyKeyword", "TSUnknownKeyword",
    "TSNeverKeyword", "TSVoidKeyword", "TSUndefinedKeyword", "TSNullKeyword",
  ]);
  if (primitiveKinds.has(node.type)) return true;
  // Covers `type X = string & { __brand: "X" }` — common branded-type pattern;
  // the brand is what makes it nominal, but we still treat it as a primitive.
  if (node.type === "TSIntersectionType" && Array.isArray(node.types)) {
    return node.types.some((t: Node) => primitiveKinds.has(t.type));
  }
  return false;
}

function fingerprintInterface(iface: Node): string | null {
  const members = iface.body?.body ?? [];
  if (members.length === 0) return null;
  const memberFps: string[] = [];
  for (const m of members) {
    const name =
      m.key?.type === "Identifier" ? m.key.name :
      m.key?.type === "Literal" ? String(m.key.value) :
      "?";
    memberFps.push(`${name}:${normalizeAst(m)}`);
  }
  memberFps.sort();
  return `iface:[${memberFps.join("|")}]`;
}

function fingerprintTypeAlias(ta: Node): string | null {
  const rhs = ta.typeAnnotation;
  if (!rhs) return null;
  if (isBarePrimitiveType(rhs)) return null;
  return `type:${normalizeAst(rhs)}`;
}

function fingerprintEnum(enm: Node): string | null {
  const members = enm.members ?? [];
  if (members.length === 0) return null;
  const names: string[] = [];
  for (const m of members) {
    const name =
      m.id?.type === "Identifier" ? m.id.name :
      m.id?.type === "Literal" ? String(m.id.value) :
      "?";
    const value = m.initializer ? (constValueRaw(m.initializer) ?? "expr") : "auto";
    names.push(`${name}=${value}`);
  }
  names.sort();
  return `enum:[${names.join("|")}]`;
}

// Walks top-level statements, extracting a SymbolDecl per declared identifier.
// Re-exports are skipped — those are the *correct* sharing pattern, not duplication.
function extractSymbols(ctx: Ctx): SymbolDecl[] {
  const out: SymbolDecl[] = [];
  for (const stmt of ctx.ast.body ?? []) {
    if (stmt.type === "ExportNamedDeclaration" && stmt.source) continue;
    if (stmt.type === "ExportAllDeclaration") continue;

    let decl: Node | null = stmt;
    if (stmt.type === "ExportNamedDeclaration" || stmt.type === "ExportDefaultDeclaration") {
      decl = stmt.declaration ?? null;
    }
    if (!decl) continue;
    handleDeclaration(decl, ctx, out);
  }
  return out;
}

function handleDeclaration(decl: Node, ctx: Ctx, out: SymbolDecl[]): void {
  const line = ctx.lineOf(decl.start);

  if (decl.type === "VariableDeclaration") {
    for (const d of decl.declarations ?? []) {
      if (d.id?.type !== "Identifier") continue;
      const init = d.init;
      if (!init) continue;
      const declLine = ctx.lineOf(d.start);
      if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") {
        const fp = fingerprintFunction(init);
        if (fp) out.push({ kind: "function", name: d.id.name, fingerprint: fp, file: ctx.file, line: declLine, start: d.start, end: d.end });
      } else {
        const fp = fingerprintConstValue(init);
        if (fp) out.push({ kind: "const", name: d.id.name, fingerprint: fp, file: ctx.file, line: declLine, start: d.start, end: d.end });
      }
    }
    return;
  }
  if (decl.type === "FunctionDeclaration" && decl.id?.name) {
    const fp = fingerprintFunction(decl);
    if (fp) out.push({ kind: "function", name: decl.id.name, fingerprint: fp, file: ctx.file, line, start: decl.start, end: decl.end });
    return;
  }
  if (decl.type === "ClassDeclaration" && decl.id?.name) {
    const fp = fingerprintClass(decl);
    if (fp) out.push({ kind: "class", name: decl.id.name, fingerprint: fp, file: ctx.file, line, start: decl.start, end: decl.end });
    return;
  }
  if (decl.type === "TSInterfaceDeclaration" && decl.id?.name) {
    const fp = fingerprintInterface(decl);
    if (fp) out.push({ kind: "interface", name: decl.id.name, fingerprint: fp, file: ctx.file, line, start: decl.start, end: decl.end });
    return;
  }
  if (decl.type === "TSTypeAliasDeclaration" && decl.id?.name) {
    const fp = fingerprintTypeAlias(decl);
    if (fp) out.push({ kind: "type", name: decl.id.name, fingerprint: fp, file: ctx.file, line, start: decl.start, end: decl.end });
    return;
  }
  if (decl.type === "TSEnumDeclaration" && decl.id?.name) {
    const fp = fingerprintEnum(decl);
    if (fp) out.push({ kind: "enum", name: decl.id.name, fingerprint: fp, file: ctx.file, line, start: decl.start, end: decl.end });
  }
}

function detectDuplicateSymbol(ctxs: Ctx[]): Finding[] {
  const decls: SymbolDecl[] = [];
  // Source lookup keyed by file — needed to slice the preview snippet.
  const sourceByFile = new Map<string, string>();
  for (const ctx of ctxs) {
    if (DUP_TEST_FILE_PATTERN.test(ctx.file)) continue;
    if (DUP_GENERATED_PATH.test(ctx.file)) continue;
    sourceByFile.set(ctx.file, ctx.source);
    decls.push(...extractSymbols(ctx));
  }

  // Group by (kind, fingerprint) — different kinds with coincidentally
  // identical fingerprints shouldn't merge.
  const byKey = new Map<string, SymbolDecl[]>();
  for (const d of decls) {
    const key = `${d.kind}:${d.fingerprint}`;
    const list = byKey.get(key);
    if (list) list.push(d);
    else byKey.set(key, [d]);
  }

  const findings: Finding[] = [];
  for (const group of byKey.values()) {
    const distinct = new Set(group.map(d => d.file));
    const minFiles = DUP_MIN_FILES_BY_KIND[group[0].kind] ?? DUP_MIN_FILES_DEFAULT;
    if (distinct.size < minFiles) continue;

    const kind = group[0].kind;
    const fingerprintHash = shortHash(group[0].fingerprint);

    // Sort occurrences by file then position so the canonical (first) entry
    // is stable across runs. Used both for finding placement and preview.
    const sorted = [...group].sort((a, b) =>
      a.file.localeCompare(b.file) || a.start - b.start
    );
    const canonical = sorted[0];
    const canonicalSource = sourceByFile.get(canonical.file) ?? "";
    const preview = previewSource(canonicalSource, canonical.start, canonical.end);

    const occurrences = sorted.map(d => ({ name: d.name, file: d.file, line: d.line }));
    const names = [...new Set(occurrences.map(o => o.name))].sort();

    // Compact, single-line message that gives the agent enough to triage
    // without opening JSON metadata. Full occurrence list lives in metadata.
    const sampleNames = names.slice(0, 3).join(", ");
    const moreNames = names.length > 3 ? `, +${names.length - 3} more` : "";
    const message =
      `${kind} re-declared ${group.length}× across ${distinct.size} files ` +
      `(e.g. ${sampleNames}${moreNames}) — agent likely re-built an existing one ` +
      `[group ${fingerprintHash}]`;

    // ONE finding per group. The canonical declaration's location is the
    // finding's anchor; the full set lives in `occurrences`. This shifts
    // the unit-of-issue from "occurrence" to "shape" — the right granularity
    // for the agent: each group is one design decision to consolidate.
    findings.push({
      flag: "duplicateSymbol",
      severity: "candidate",
      file: canonical.file,
      line: canonical.line,
      message,
      metadata: {
        symbolKind: kind,
        fingerprintHash,
        distinctFiles: distinct.size,
        totalDeclarations: group.length,
        preview,
        previewFrom: `${canonical.file}:${canonical.line}`,
        occurrences,
      },
    });
  }
  return findings;
}

type SingleDetector = (ctx: Ctx) => Finding[];
type CrossDetector = (ctxs: Ctx[]) => Finding[];

const SINGLE_DETECTORS: SingleDetector[] = [
  detectShallowModule,
  detectPassThroughMethod,
  detectPassThroughVariable,
  detectEmptyCatch,
  detectCatchRethrow,
  detectGenericNaming,
  detectTsEscapeHatches,
  detectWideModule,
];

const CROSS_DETECTORS: CrossDetector[] = [
  detectDuplicateSymbol,
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

  // Two-phase: parse all files first so cross-file detectors (e.g. duplicate-
  // symbol) see the whole tree. Files that fail to parse are dropped from
  // both phases — partial AST trees produce false signals.
  const ctxs: Ctx[] = [];
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
    ctxs.push({
      file,
      source,
      ast: parsed.program,
      comments: parsed.comments ?? [],
      lineOf: buildLineOf(source),
    });
  }

  const allFindings: Finding[] = [];
  for (const ctx of ctxs) {
    for (const detect of SINGLE_DETECTORS) {
      try { allFindings.push(...detect(ctx)); }
      catch (e) {
        process.stderr.write(`detector ${detect.name} failed on ${ctx.file}: ${(e as Error).message}\n`);
      }
    }
  }
  for (const detect of CROSS_DETECTORS) {
    try { allFindings.push(...detect(ctxs)); }
    catch (e) {
      process.stderr.write(`cross-detector ${detect.name} failed: ${(e as Error).message}\n`);
    }
  }

  allFindings.sort((a, b) =>
    a.flag.localeCompare(b.flag) || a.file.localeCompare(b.file) || a.line - b.line
  );

  const byFlag: Record<string, number> = {};
  for (const f of allFindings) byFlag[f.flag] = (byFlag[f.flag] ?? 0) + 1;

  const fileCounts: Record<string, number> = {};
  for (const f of allFindings) {
    // duplicateSymbol findings are one-per-group; expand via occurrences so
    // file ranking still reflects spread (otherwise only the canonical file
    // would show up despite the issue affecting many).
    if (f.flag === "duplicateSymbol" && Array.isArray(f.metadata.occurrences)) {
      for (const occ of f.metadata.occurrences as { file: string }[]) {
        fileCounts[occ.file] = (fileCounts[occ.file] ?? 0) + 1;
      }
    } else {
      fileCounts[f.file] = (fileCounts[f.file] ?? 0) + 1;
    }
  }
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
    for (const f of allFindings) {
      lines.push(`  [${f.flag}] ${f.file}:${f.line} — ${f.message}`);
      if (f.flag === "duplicateSymbol") {
        const preview = String(f.metadata.preview ?? "");
        const from = String(f.metadata.previewFrom ?? "");
        if (preview) {
          lines.push(`      preview (from ${from}):`);
          for (const pl of preview.split("\n")) lines.push(`        ${pl}`);
        }
        const occurrences = (f.metadata.occurrences as Array<{ name: string; file: string; line: number }> | undefined) ?? [];
        if (occurrences.length > 0) {
          lines.push(`      occurrences (${occurrences.length}):`);
          // Show all occurrences — that's the agent's whole reason for being
          // here. If the list is huge, the agent reads the JSON; the text
          // mode user can scroll.
          for (const o of occurrences) lines.push(`        ${o.file}:${o.line}  ${o.name}`);
        }
      }
    }
    process.stdout.write(lines.join("\n") + "\n");
  }
}

main();
