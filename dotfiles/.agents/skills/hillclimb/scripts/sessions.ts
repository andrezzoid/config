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

import { mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { pathToFileURL } from "node:url";

type Event = {
  type?: string;
  uuid?: string;
  parentUuid?: string | null;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  isSidechain?: boolean;
  origin?: { kind?: string };
  turnOrigin?: string;
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

function typedText(e: Event): string {
  const c = e.message?.content;
  return typeof c === "string" ? c : (c ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
}

// A prompt is a turn André typed in the main conversation: the only place a
// replay can resume, because the eval sends its own prompt as the next user
// turn. Task notifications, interrupt markers and the briefs that start a
// subagent are user events too, but nobody typed them. Interactive sessions
// mark typed turns with origin "human"; cloud and `claude -p` sessions leave
// origin out and set turnOrigin "sdk".
export function isPrompt(e: Event): boolean {
  if (e.type !== "user" || e.isMeta || e.isCompactSummary || e.isSidechain) return false;
  if (e.origin?.kind && e.origin.kind !== "human") return false;
  if (e.turnOrigin && !["human", "sdk"].includes(e.turnOrigin)) return false;
  const c = e.message?.content;
  if (Array.isArray(c) && (c.some((b) => b.type === "tool_result") || !c.some((b) => b.type === "text"))) return false;
  const text = typedText(e);
  return !text.startsWith("[Request interrupted by user") && !text.includes("<task-notification>");
}

// A slash command is stored expanded into tags; the replay needs it as typed.
function asTyped(text: string): string {
  const name = /<command-name>([^<]*)<\/command-name>/.exec(text)?.[1];
  if (!name) return text;
  const args = /<command-args>([^<]*)<\/command-args>/.exec(text)?.[1]?.trim();
  return args ? `${name} ${args}` : name;
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

// Main-conversation transcripts, newest first. A subagent's transcript sits in
// <session>/subagents/ and cannot be replayed on its own.
function transcripts(root: string, days: number, project?: string): string[] {
  const since = Date.now() - days * 86_400_000;
  let names: string[];
  try {
    names = readdirSync(root, { recursive: true }) as string[];
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith(".jsonl") && !n.split(sep).includes("subagents") && (!project || n.toLowerCase().includes(project.toLowerCase())))
    .map((n) => ({ file: join(root, n), mtime: statSync(join(root, n)).mtimeMs }))
    .filter((t) => t.mtime >= since)
    .sort((a, b) => b.mtime - a.mtime)
    .map((t) => t.file);
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

// Writes the conversation as the agent had it when the prompt at <line>
// arrived: the prompt's ancestors, following parentUuid from the event before
// it to the first event. A file also holds branches the agent never saw then,
// such as a prompt that was interrupted and asked again, and bookkeeping lines
// with no uuid; both stay out. The eval replays this history and sends the
// prompt as the next user turn, so the agent faces the same moment.
export function cut(file: string, line: number, out: string): Cut {
  const all = lines(file);
  const events = all.map(parse);
  const e = events[line - 1] ?? {};
  if (!isPrompt(e)) {
    let p = line - 1;
    while (p > 0 && !isPrompt(events[p - 1])) p--;
    throw new Error(`line ${line} is not a prompt the human typed; the prompt before it is line ${p || "none"}`);
  }
  const index = new Map(events.slice(0, line - 1).flatMap((ev, i) => (ev.uuid ? [[ev.uuid, i] as const] : [])));
  const chain: number[] = [];
  for (let id = e.parentUuid; id && index.has(id); id = events[index.get(id)!].parentUuid) chain.push(index.get(id)!);
  chain.sort((a, b) => a - b);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, chain.map((i) => all[i]).join("\n") + "\n");
  return {
    prompt: asTyped(typedText(e)),
    cwd: e.cwd ?? "",
    gitBranch: e.gitBranch ?? "",
    timestamp: e.timestamp ?? "",
    sessionId: e.sessionId ?? "",
    events: chain.length,
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
      const limit = Number(flag(args, "limit") ?? 50);
      const hits = search(root, new RegExp(a, "i"), { days: Number(flag(args, "days") ?? 90), project: flag(args, "project"), limit });
      for (const h of hits) console.log(`${h.file}:${h.line}  ${h.timestamp.slice(0, 10)}  ${h.cwd}\n    ${h.text}`);
      console.log(hits.length >= limit
        ? `limit of ${limit} reached: older hits were not read. Narrow the pattern, or raise --limit.`
        : `${hits.length} hit(s) in ${root}`);
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

// Compare real paths: Node resolves symlinks for import.meta.url but not for
// argv[1], and stow installs every skill behind a symlink.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
