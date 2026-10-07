// Search, read and cut Claude Code session transcripts, so a failure seen in
// one session can be found in others and replayed as an eval case.
//
//   sessions search <regex> [--days N] [--project <substr>] [--limit N]
//   sessions show <file>:<line> [--before N] [--after N]
//   sessions cut <file>:<line> <out.jsonl>
//
// Transcripts live under ${CLAUDE_CONFIG_DIR:-~/.claude}/projects, one JSONL
// file per session, one event per line. They are append-only, so
// <file>:<line> names one event for good: search prints it, show and cut take
// it.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

type Event = {
  type?: string;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  sessionId?: string;
  message?: { content?: string | Block[] };
};
type Block = { type?: string; text?: string; name?: string; input?: unknown; content?: string | Block[] };

// What one event said, as the lines a human would read: "user: …",
// "assistant: …", "tool Bash: {…}", "result: …". Events that carry no
// conversation (attachments, queue bookkeeping, meta prompts, compaction
// summaries) say nothing.
export function said(e: Event): string[] {
  const c = e.message?.content;
  if (e.type === "user" && !e.isMeta && !e.isCompactSummary) {
    if (typeof c === "string") return [`user: ${c}`];
    return (c ?? []).flatMap((b) =>
      b.type === "text" ? [`user: ${b.text ?? ""}`] : b.type === "tool_result" ? [`result: ${flatten(b.content)}`] : [],
    );
  }
  if (e.type === "assistant") {
    return (Array.isArray(c) ? c : []).flatMap((b) =>
      b.type === "text" ? [`assistant: ${b.text ?? ""}`] : b.type === "tool_use" ? [`tool ${b.name}: ${JSON.stringify(b.input)}`] : [],
    );
  }
  return [];
}

function flatten(c: string | Block[] | undefined): string {
  return typeof c === "string" ? c : (c ?? []).map((b) => b.text ?? "").join("\n");
}

// A prompt is a turn the human typed: the only place a replay can resume,
// because the eval sends its own prompt as the next user turn.
export function isPrompt(e: Event): boolean {
  if (e.type !== "user" || e.isMeta || e.isCompactSummary) return false;
  const c = e.message?.content;
  return typeof c === "string" || (Array.isArray(c) && c.some((b) => b.type === "text") && !c.some((b) => b.type === "tool_result"));
}

function parse(line: string): Event {
  try {
    return JSON.parse(line) as Event;
  } catch {
    return {};
  }
}

function lines(file: string): string[] {
  return readFileSync(file, "utf8").split("\n").filter((l, i, all) => l !== "" || i < all.length - 1);
}

function transcripts(root: string, days: number, project?: string): string[] {
  const since = Date.now() - days * 86_400_000;
  let names: string[];
  try {
    names = readdirSync(root, { recursive: true }) as string[];
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith(".jsonl") && (!project || n.toLowerCase().includes(project.toLowerCase())))
    .map((n) => join(root, n))
    .filter((f) => statSync(f).mtimeMs >= since)
    .sort();
}

export type Hit = { file: string; line: number; timestamp: string; cwd: string; text: string };

export function search(root: string, pattern: RegExp, opts: { days?: number; project?: string; limit?: number } = {}): Hit[] {
  const hits: Hit[] = [];
  const limit = opts.limit ?? 50;
  for (const file of transcripts(root, opts.days ?? 90, opts.project)) {
    const all = lines(file);
    for (let i = 0; i < all.length && hits.length < limit; i++) {
      const e = parse(all[i]);
      // One line per event, so a pattern written as "user: .*phrase" matches
      // a message that spans several lines.
      for (const text of said(e).map((t) => t.replace(/\s+/g, " "))) {
        const m = pattern.exec(text);
        if (!m) continue;
        const from = Math.max(0, m.index - 80);
        hits.push({ file, line: i + 1, timestamp: e.timestamp ?? "", cwd: e.cwd ?? "", text: text.slice(from, from + 240) });
        break;
      }
    }
    if (hits.length >= limit) break;
  }
  return hits;
}

export function show(file: string, line: number, before = 3, after = 3): string {
  const all = lines(file);
  const out: string[] = [];
  // Count conversation events, not raw lines: most lines are bookkeeping.
  let i = line - 1;
  for (let n = 0; i > 0 && n < before; ) if (said(parse(all[--i])).length) n++;
  for (let n = 0; i < all.length && (i < line || n <= after); i++) {
    const text = said(parse(all[i]));
    if (!text.length) continue;
    if (i >= line - 1) n++;
    out.push(`${i + 1 === line ? ">" : " "} ${i + 1}  ${text.map((t) => t.slice(0, 600)).join("\n      ")}`);
  }
  return out.join("\n");
}

export type Cut = { prompt: string; cwd: string; gitBranch: string; timestamp: string; sessionId: string; events: number };

// Keeps every event before the prompt at <line>, the turn that led to the
// mistake. The eval replays that history and sends the prompt again as the
// next user turn, so the agent faces the same moment.
export function cut(file: string, line: number, out: string): Cut {
  const all = lines(file);
  const e = parse(all[line - 1] ?? "");
  if (!isPrompt(e)) {
    let p = line - 1;
    while (p > 0 && !isPrompt(parse(all[p - 1]))) p--;
    throw new Error(`line ${line} is not a prompt the human typed; the prompt before it is line ${p || "none"}`);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, all.slice(0, line - 1).join("\n") + "\n");
  const c = e.message?.content;
  return {
    prompt: typeof c === "string" ? c : (c ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n"),
    cwd: e.cwd ?? "",
    gitBranch: e.gitBranch ?? "",
    timestamp: e.timestamp ?? "",
    sessionId: e.sessionId ?? "",
    events: line - 1,
  };
}

function ref(arg: string | undefined): [string, number] {
  const m = /^(.*):(\d+)$/.exec(arg ?? "");
  if (!m) throw new Error(`expected <file>:<line>, got ${arg ?? "nothing"}`);
  return [m[1], Number(m[2])];
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

export function main(args: string[]): number {
  const root = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
  const [cmd, a, b] = args;
  try {
    if (cmd === "search" && a) {
      const hits = search(root, new RegExp(a, "i"), {
        days: Number(flag(args, "days") ?? 90),
        project: flag(args, "project"),
        limit: Number(flag(args, "limit") ?? 50),
      });
      for (const h of hits) console.log(`${h.file}:${h.line}  ${h.timestamp.slice(0, 10)}  ${h.cwd}\n    ${h.text}`);
      console.log(`${hits.length} hit(s) in ${root}`);
      return 0;
    }
    if (cmd === "show" && a) {
      console.log(show(...ref(a), Number(flag(args, "before") ?? 3), Number(flag(args, "after") ?? 3)));
      return 0;
    }
    if (cmd === "cut" && a && b) {
      console.log(JSON.stringify(cut(...ref(a), b), null, 2));
      return 0;
    }
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  console.error("usage: sessions search <regex> [--days N] [--project S] [--limit N] | show <file>:<line> [--before N] [--after N] | cut <file>:<line> <out.jsonl>");
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
