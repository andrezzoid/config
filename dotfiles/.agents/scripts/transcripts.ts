#!/usr/bin/env bun
/**
 * Read your own Claude Code session transcripts so agents stop re-writing jq for it.
 *
 *   transcripts.ts sessions [--days N] [--project PATH] [--json]
 *   transcripts.ts turns    [--days N] [--project PATH] [--session ID] [--grep RE]
 *                           [--corrections] [--context CHARS] [--json]
 *
 * Scope defaults to the project of the current directory. `--project all` reads every
 * project, which you only do when the human asked for it.
 *
 * The JSONL layout is Claude Code's internal format and shifts between versions, so every
 * field read here is optional: a line this script can't parse is skipped, never fatal.
 */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import { parseArgs } from "node:util"

type Rec = Record<string, any>

export type Turn = { session: string; time: string; branch: string; text: string; after: string }

// Harness noise that rides in user-role messages but was never typed by the human.
const NOISE_BLOCK =
  /<(system-reminder|local-command-stdout|local-command-stderr|local-command-caveat|command-message)>[\s\S]*?<\/\1>/g
const COMMAND_NAME = /<command-name>([\s\S]*?)<\/command-name>/
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/

// Heuristic, not a classifier: it over-matches ("no problem") and misses polite
// corrections. It narrows the read, the reader still judges every hit.
export const CORRECTION = new RegExp(
  String.raw`(\b(no|nope|stop|don'?t|do not|never|wrong|incorrect|instead|actually|undo|revert|` +
    String.raw`again|rather|why did you|why are you|i said|i told you|i asked|not what|` +
    String.raw`that'?s not|you forgot|you missed|you didn'?t|should have|shouldn'?t)\b` +
    String.raw`|\[Request interrupted by user)`,
  "i",
)

export function projectsRoot(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects")
}

export function projectDirs(root: string, project?: string): string[] {
  if (!existsSync(root)) throw new Error(`no ${root}`)
  const dirs = readdirSync(root)
    .map((d) => join(root, d))
    .filter((d) => statSync(d).isDirectory())
  if (project === "all") return dirs.sort()
  const path = realpathSync(project ?? process.cwd())
  const slug = join(root, path.replace(/[^A-Za-z0-9]/g, "-"))
  if (existsSync(slug)) return [slug]
  // Long paths get truncated and hashed, so fall back to matching the recorded cwd.
  for (const d of dirs) {
    for (const f of jsonlFiles(d).sort().slice(0, 3)) {
      if (records(f, 20).some((r) => r.cwd === path)) return [d]
    }
  }
  throw new Error(`no transcripts for ${path} under ${root}`)
}

function jsonlFiles(dir: string): string[] {
  // Top-level files only: subagent transcripts live under <session>/subagents/ and never
  // hold the human's words.
  return readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => join(dir, f))
}

export function sessionFiles(dirs: string[], days: number, session?: string): string[] {
  const cutoff = Date.now() - days * 86_400_000
  return dirs
    .flatMap(jsonlFiles)
    .filter((f) => !session || basename(f, ".jsonl").startsWith(session))
    .filter((f) => statSync(f).mtimeMs >= cutoff)
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs)
}

export function records(path: string, limit?: number): Rec[] {
  const out: Rec[] = []
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (limit !== undefined && out.length >= limit) break
    try {
      const rec = JSON.parse(line)
      if (rec && typeof rec === "object" && !Array.isArray(rec)) out.push(rec)
    } catch {
      // A line Claude Code wrote in a shape we don't know: skip it.
    }
  }
  return out
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && typeof b === "object" && b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
  }
  return ""
}

/** The human's own words in a user record, or null for tool results and harness noise. */
export function humanText(rec: Rec): string | null {
  if (rec.type !== "user" || rec.isMeta || rec.isSidechain) return null
  if (rec.isCompactSummary || rec.isVisibleInTranscriptOnly) return null
  const origin = rec.origin?.kind
  if (origin !== undefined && origin !== "human") return null
  let raw = textOf(rec.message?.content)
  const name = raw.match(COMMAND_NAME)
  const args = raw.match(COMMAND_ARGS)
  raw = raw.replace(NOISE_BLOCK, "")
  if (name) raw = `${name[1].trim()} ${args ? args[1].trim() : ""}`
  raw = raw.trim()
  return raw || null
}

function assistantText(rec: Rec): string | null {
  if (rec.type !== "assistant" || rec.isSidechain) return null
  return textOf(rec.message?.content).trim() || null
}

export function* turns(files: string[], days: number): Generator<Turn> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
  for (const f of files) {
    let lastReply = ""
    for (const rec of records(f)) {
      const reply = assistantText(rec)
      if (reply) {
        lastReply = reply
        continue
      }
      const text = humanText(rec)
      if (text === null) continue
      if ((rec.timestamp ?? "9") < cutoff) {
        lastReply = ""
        continue
      }
      yield {
        session: basename(f, ".jsonl"),
        time: rec.timestamp ?? "",
        branch: rec.gitBranch ?? "",
        text,
        after: lastReply,
      }
      lastReply = ""
    }
  }
}

export function clip(s: string, n: number, tail = false): string {
  if (n <= 0) return ""
  const flat = s.split(/\s+/).filter(Boolean).join(" ")
  if (flat.length <= n) return flat
  return tail ? "…" + flat.slice(-n) : flat.slice(0, n) + "…"
}

function localStamp(ms: number): string {
  const d = new Date(ms)
  const p = (x: number) => String(x).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      days: { type: "string", default: "7" },
      project: { type: "string" },
      json: { type: "boolean", default: false },
      session: { type: "string" },
      grep: { type: "string" },
      corrections: { type: "boolean", default: false },
      context: { type: "string", default: "300" },
    },
  })
  const cmd = positionals[0]
  if (cmd !== "sessions" && cmd !== "turns") {
    console.error("usage: transcripts.ts sessions|turns [options]  (see the header of this file)")
    process.exit(2)
  }
  const days = Number(values.days)
  const dirs = projectDirs(projectsRoot(), values.project)

  if (cmd === "sessions") {
    for (const f of sessionFiles(dirs, days)) {
      let first = ""
      let count = 0
      let branch = ""
      for (const rec of records(f)) {
        const text = humanText(rec)
        if (!text) continue
        count += 1
        first ||= text
        branch ||= rec.gitBranch ?? ""
      }
      if (!count) continue
      const row = {
        session: basename(f, ".jsonl"),
        project: basename(join(f, "..")),
        modified: localStamp(statSync(f).mtimeMs),
        branch,
        human_turns: count,
        first_prompt: clip(first, 160),
      }
      console.log(
        values.json
          ? JSON.stringify(row)
          : `${row.modified}  ${row.session}  [${row.branch}] ${row.human_turns} turns  ${row.first_prompt}`,
      )
    }
    return
  }

  const grep = values.grep ? new RegExp(values.grep, "i") : null
  const context = Number(values.context)
  for (const t of turns(sessionFiles(dirs, days, values.session), days)) {
    if (grep && !(grep.test(t.text) || grep.test(t.after))) continue
    if (values.corrections && !CORRECTION.test(t.text)) continue
    if (values.json) {
      console.log(JSON.stringify({ ...t, after: clip(t.after, context, true) }))
      continue
    }
    console.log(`## ${t.session.slice(0, 8)} ${t.time.slice(0, 16)} [${t.branch}]`)
    if (context && t.after) console.log(`   agent: ${clip(t.after, context, true)}`)
    console.log(`   human: ${t.text}\n`)
  }
}

if (import.meta.main) {
  try {
    main()
  } catch (e) {
    console.error(`transcripts: ${(e as Error).message}`)
    process.exit(1)
  }
}
