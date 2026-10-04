#!/usr/bin/env bun
/**
 * Dispatch a ticket backlog to agent sessions: work the frontier, one session per ticket.
 *
 *   backlog.ts check  [--dir DIR]
 *   backlog.ts status [--dir DIR]
 *   backlog.ts run    [--dir DIR] [--max N] [--interval S] [--once] [--dry-run]
 *   backlog.ts mark   ID done|stopped|running|reset [--dir DIR]
 *
 * Cloud mode, for the coordinator Routine (no ledger, no lfg):
 *   backlog.ts pull                                  plan branch -> DIR/plan.json
 *   backlog.ts publish                               DIR/plan.json -> plan branch
 *   backlog.ts frontier [--sessions ID,..] [--failed ID,..] [--max N]
 *                                                    JSON: which tickets to launch now
 *
 * /run-backlog writes DIR/plan.json (default DIR: .factory/backlog): which tickets, their
 * blockers, branches and serial groups. This script does the mechanics. It keeps
 * DIR/ledger.json, works out which tickets can start, launches each one in its own worktree
 * and Claude tab through your `lfg` shell function, and watches GitHub for each ticket's PR
 * so a merge unlocks the tickets it blocks.
 *
 * A ticket is:
 *   done      the plan says so, its PR merged, or you marked it
 *   stopped   its PR closed unmerged, its launch failed, or you marked it; whatever it
 *             blocks stays blocked
 *   running   launched (or marked running), and its PR hasn't merged
 *   blocked   a blocker isn't done, or the plan lists an external blocker
 *   held      its serial group is busy, --max sessions are running, or its branch exists
 *             without a session this script launched
 *   ready     launches on the next tick
 *
 * The ledger is the only record of which sessions exist, so the script never guesses. A
 * branch it didn't launch stays held until you say `mark ID running` (a session you started
 * owns it) or `mark ID reset` (launch a fresh session on it). `reset` also relaunches a
 * stopped ticket.
 *
 * Launching runs `lfg <branch> "/implement <ref>"` in an interactive zsh, so `run` must run
 * inside zellij. Its output goes to this terminal, so a worktrunk prompt can be answered.
 * Set BACKLOG_LAUNCH to an executable taking <branch> <prompt> to launch some other way.
 */

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { GhError, type Repo, api, currentRepo, realGh, snapshot } from "./pr-state.ts"

export type Autonomy = "commit" | "pr" | "merge"
export type Ticket = {
  id: string
  title: string
  ref: string
  branch: string
  autonomy: Autonomy
  blocked_by?: string[]
  external_blockers?: string[]
  serial?: string
  done?: boolean
}
export type Plan = { tickets: Ticket[] }
export type Entry = {
  state?: "running" | "done" | "stopped" | "queued"
  branch?: string
  pr?: number
  url?: string
  launched?: string
  updated?: string
  reason?: string
}
export type Ledger = Record<string, Entry>
export type TicketState = "done" | "stopped" | "running" | "blocked" | "held" | "ready"
export type Pr = { number: number; state: "OPEN" | "MERGED" | "CLOSED"; url: string }

/** Everything that touches the outside world, so a test can stand in for it. */
export type Deps = {
  findPr: (branch: string) => Pr | null
  branchExists: (branch: string) => boolean
  launch: (branch: string, prompt: string) => void
  verdict: (pr: number) => string
  now: () => string
  print: (line: string) => void
}

const AUTONOMY = new Set(["commit", "pr", "merge"])
const BRANCH_OK = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/
// lfg pastes the prompt into a zellij layout as `claude ... "$WT_PROMPT"`, so a quote,
// `$`, backtick or space in the ref would break or rewrite that command.
const REF_OK = /^[A-Za-z0-9#._:/@+~-]+$/

export class Fail extends Error {}
/** A gh hiccup: worth retrying next tick, not worth ending an overnight run. */
export class Transient extends Fail {}

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0

/** Everything wrong with the plan, as readable lines. Empty means it's runnable. */
export function problems(plan: unknown): string[] {
  const tickets = (plan as Plan | null)?.tickets
  if (!Array.isArray(tickets) || !tickets.length) return ["plan.json needs a non-empty `tickets` list"]
  const errs: string[] = []
  const ids = new Set<string>()
  const branches = new Set<string>()
  tickets.forEach((t: any, i) => {
    if (!t || typeof t !== "object") return errs.push(`ticket ${i + 1}: must be an object`)
    const where = `ticket ${i + 1} (${t.id ?? "?"})`
    for (const key of ["id", "ref", "branch", "title"]) {
      if (!isStr(t[key])) errs.push(`${where}: \`${key}\` must be a non-empty string`)
    }
    if (ids.has(t.id)) errs.push(`${where}: duplicate id`)
    ids.add(t.id)
    if (isStr(t.branch)) {
      if (!BRANCH_OK.test(t.branch) || t.branch.includes("..") || /(\.lock|\/)$/.test(t.branch)) {
        errs.push(`${where}: \`${t.branch}\` is not a valid branch name`)
      }
      if (branches.has(t.branch)) errs.push(`${where}: branch \`${t.branch}\` is used twice`)
      branches.add(t.branch)
    }
    if (isStr(t.ref) && !REF_OK.test(t.ref)) {
      errs.push(`${where}: ref \`${t.ref}\` holds characters lfg can't carry (quotes, $, backticks, spaces)`)
    }
    if (!AUTONOMY.has(t.autonomy)) errs.push(`${where}: \`autonomy\` must be one of commit, merge, pr`)
    if ("serial" in t && !isStr(t.serial)) errs.push(`${where}: \`serial\` must be a non-empty string when present`)
    for (const key of ["blocked_by", "external_blockers"]) {
      const v = t[key] ?? []
      if (!Array.isArray(v) || !v.every(isStr)) errs.push(`${where}: \`${key}\` must be a list of strings`)
    }
  })
  if (errs.length) return errs
  for (const t of tickets) {
    for (const b of t.blocked_by ?? []) {
      if (!ids.has(b)) errs.push(`${t.id}: blocker \`${b}\` is not in the plan. Move it to external_blockers or add it.`)
    }
  }
  return [...errs, ...cycles(tickets).map((c) => `blocking cycle: ${c.join(" -> ")}`)]
}

export function cycles(tickets: Ticket[]): string[][] {
  const edges = new Map(tickets.map((t) => [t.id, t.blocked_by ?? []]))
  const state = new Map<string, "open" | "closed">()
  const found: string[][] = []
  const visit = (node: string, path: string[]) => {
    state.set(node, "open")
    for (const next of edges.get(node) ?? []) {
      if (state.get(next) === "open") found.push([...path.slice(path.indexOf(next)), next])
      else if (edges.has(next) && !state.has(next)) visit(next, [...path, next])
    }
    state.set(node, "closed")
  }
  for (const node of edges.keys()) if (!state.has(node)) visit(node, [node])
  return found
}

/** Each ticket's state for this tick, with the reason when it can't start. */
export function states(plan: Plan, ledger: Ledger, maxRunning: number, orphans: Set<string>) {
  const entry = (t: Ticket): Entry => ledger[t.id] ?? {}
  const done = new Set(plan.tickets.filter((t) => t.done || entry(t).state === "done").map((t) => t.id))
  const running = plan.tickets.filter((t) => entry(t).state === "running" && !done.has(t.id))
  const busy = new Set(running.map((t) => t.serial).filter(Boolean))
  let slots = maxRunning - running.length
  const result = new Map<string, [TicketState, string]>()
  for (const t of plan.tickets) {
    const e = entry(t)
    const waiting = (t.blocked_by ?? []).filter((b) => !done.has(b))
    if (done.has(t.id)) result.set(t.id, ["done", ""])
    else if (e.state === "stopped") result.set(t.id, ["stopped", e.reason ?? ""])
    else if (e.state === "running") result.set(t.id, ["running", ""])
    else if (t.external_blockers?.length) result.set(t.id, ["blocked", `external: ${t.external_blockers.join(", ")}`])
    else if (waiting.length) result.set(t.id, ["blocked", `waits on ${waiting.join(", ")}`])
    else if (orphans.has(t.id)) {
      result.set(t.id, ["held", "branch exists but no known session owns it"])
    } else if (t.serial && busy.has(t.serial)) result.set(t.id, ["held", `serial group ${t.serial} is busy`])
    else if (slots <= 0) result.set(t.id, ["held", `${maxRunning} sessions already running`])
    else {
      result.set(t.id, ["ready", ""])
      slots -= 1
      if (t.serial) busy.add(t.serial)
    }
  }
  return result
}

/** Fold GitHub's view of each running ticket's PR into the ledger. */
export function refresh(plan: Plan, ledger: Ledger, deps: Deps) {
  for (const t of plan.tickets) {
    const e = ledger[t.id]
    if (e?.state !== "running") continue
    // The ledger's branch, not the plan's: a re-plan may rename a running ticket's branch.
    const pr = deps.findPr(e.branch ?? t.branch)
    if (!pr) continue
    Object.assign(e, { pr: pr.number, url: pr.url, updated: deps.now() })
    if (pr.state === "MERGED") e.state = "done"
    else if (pr.state === "CLOSED") Object.assign(e, { state: "stopped", reason: "PR closed without merging" })
  }
}

export function orphansOf(plan: Plan, ledger: Ledger, deps: Deps): Set<string> {
  return new Set(plan.tickets.filter((t) => !(t.id in ledger) && deps.branchExists(t.branch)).map((t) => t.id))
}

/**
 * Cloud mode: there's no ledger file, because a cloud container doesn't outlive its session.
 * Each ticket's state comes from GitHub (its branch's PR) and from the coordinator's list of
 * cloud sessions tagged with the ticket id. Stateless, so any firing can run it.
 */
export function frontier(plan: Plan, sessions: Set<string>, failed: Set<string>, max: number, deps: Deps) {
  const ledger: Ledger = {}
  for (const t of plan.tickets) {
    const pr = deps.findPr(t.branch)
    if (pr?.state === "MERGED") ledger[t.id] = { state: "done", branch: t.branch, pr: pr.number, url: pr.url }
    else if (pr?.state === "CLOSED") ledger[t.id] = { state: "stopped", branch: t.branch, pr: pr.number, reason: "PR closed without merging" }
    else if (pr) ledger[t.id] = { state: "running", branch: t.branch, pr: pr.number, url: pr.url }
    else if (failed.has(t.id)) ledger[t.id] = { state: "stopped", branch: t.branch, reason: "session failed before opening a PR" }
    else if (sessions.has(t.id)) ledger[t.id] = { state: "running", branch: t.branch }
  }
  const current = states(plan, ledger, max, orphansOf(plan, ledger, deps))
  const tickets = plan.tickets.map((t) => {
    const [state, why] = current.get(t.id)!
    return { id: t.id, state, why, pr: ledger[t.id]?.pr ?? null }
  })
  const ready = plan.tickets
    .filter((t) => current.get(t.id)![0] === "ready")
    .map(({ id, title, ref, branch, autonomy }) => ({ id, title, ref, branch, autonomy }))
  return { ready, tickets }
}

/** The plan lives on its own branch in the cloud, since a container's files die with it. */
export const PLAN_BRANCH = "factory/plan"

function git(args: string[], input?: string) {
  const out = spawnSync("git", args, { encoding: "utf8", input })
  return { ok: out.status === 0, stdout: (out.stdout ?? "").trim(), stderr: (out.stderr ?? "").trim() }
}

function fetchPlanBranch(): string | null {
  git(["fetch", "--quiet", "origin", `+refs/heads/${PLAN_BRANCH}:refs/remotes/origin/${PLAN_BRANCH}`])
  const tip = git(["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${PLAN_BRANCH}`])
  return tip.ok ? tip.stdout : null
}

/** Push plan.json to the plan branch as a fast-forward commit; the cloud proxy refuses deletes and force-pushes. */
export function publishPlan(planPath: string): string {
  const content = readFileSync(planPath, "utf8")
  const errs = problems(JSON.parse(content))
  if (errs.length) throw new Fail(`plan.json has problems:\n  ${errs.join("\n  ")}`)
  const parent = fetchPlanBranch()
  if (parent && git(["show", `${parent}:plan.json`]).stdout === content.trim()) return `${PLAN_BRANCH} already holds this plan`
  const blob = git(["hash-object", "-w", "--stdin"], content).stdout
  const tree = git(["mktree"], `100644 blob ${blob}\tplan.json\n`).stdout
  const commit = git(["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", "Update factory plan"])
  if (!commit.ok) throw new Fail(`git commit-tree failed: ${commit.stderr}`)
  const push = git(["push", "--quiet", "origin", `${commit.stdout}:refs/heads/${PLAN_BRANCH}`])
  if (!push.ok) throw new Fail(`pushing ${PLAN_BRANCH} failed: ${push.stderr}`)
  return `published ${commit.stdout.slice(0, 7)} to ${PLAN_BRANCH}`
}

/** Fetch the plan branch's plan.json into planPath. */
export function pullPlan(planPath: string): string {
  const tip = fetchPlanBranch()
  if (!tip) throw new Fail(`no ${PLAN_BRANCH} branch on origin yet. Run /run-backlog to write and publish a plan.`)
  writeFileSync(planPath, git(["show", `${tip}:plan.json`]).stdout + "\n")
  return `pulled ${tip.slice(0, 7)} from ${PLAN_BRANCH}`
}

type Store = { plan: string; ledger: string }

function load<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (e) {
    throw new Fail(`${path} is not valid JSON: ${(e as Error).message}`)
  }
}

function save(path: string, data: unknown) {
  writeFileSync(`${path}.tmp`, JSON.stringify(data, null, 2) + "\n")
  renameSync(`${path}.tmp`, path)
}

export function loadPlan(store: Store): Plan {
  const plan = load<Plan | null>(store.plan, null)
  if (plan === null) throw new Fail(`no plan at ${store.plan}. Run /run-backlog first.`)
  const errs = problems(plan)
  if (errs.length) throw new Fail(`plan.json has problems:\n  ${errs.join("\n  ")}`)
  return plan
}

export function tick(
  store: Store,
  opts: { max: number; dryRun: boolean; startWork: boolean },
  deps: Deps,
): Map<string, [TicketState, string]> {
  const plan = loadPlan(store)
  const ledger = load<Ledger>(store.ledger, {})
  refresh(plan, ledger, deps)
  save(store.ledger, ledger)
  const orphans = orphansOf(plan, ledger, deps)
  let current = states(plan, ledger, opts.max, orphans)
  const events: string[] = []
  if (opts.startWork) {
    for (const t of plan.tickets) {
      if (current.get(t.id)![0] !== "ready") continue
      if (opts.dryRun) {
        events.push(`would launch: ${t.id}`)
        continue
      }
      try {
        deps.launch(t.branch, `/implement ${t.ref}`)
        ledger[t.id] = { state: "running", branch: t.branch, launched: deps.now(), updated: deps.now() }
        events.push(`launched: ${t.id}`)
      } catch (e) {
        const why = (e as Error).message
        ledger[t.id] = { state: "stopped", branch: t.branch, reason: `launch failed: ${why}`, updated: deps.now() }
        events.push(`launch failed: ${t.id} (${why}). Fix it, then \`backlog.ts mark ${t.id} reset\`.`)
      }
      save(store.ledger, ledger)
    }
    if (!opts.dryRun) current = states(plan, ledger, opts.max, new Set([...orphans].filter((id) => !(id in ledger))))
  }
  report(plan, ledger, current, events, deps)
  return current
}

function report(plan: Plan, ledger: Ledger, current: Map<string, [TicketState, string]>, events: string[], deps: Deps) {
  deps.print(`\n${deps.now()}  backlog`)
  for (const t of plan.tickets) {
    const [state, why] = current.get(t.id)!
    const e = ledger[t.id] ?? {}
    let detail = why
    if (state === "running") detail = e.pr ? `PR #${e.pr} ${deps.verdict(e.pr)}` : `no PR yet, launched ${e.launched ?? "?"}`
    else if (state === "done" && e.pr) detail = `PR #${e.pr} merged`
    deps.print(`  ${state.padEnd(8)} ${t.id.padEnd(12)} ${(e.branch ?? t.branch).padEnd(32)} ${detail}`)
  }
  for (const line of events) deps.print(`  ${line}`)
}

export function mark(store: Store, id: string, to: "done" | "stopped" | "running" | "reset", now: string): string {
  const plan = loadPlan(store)
  const ticket = plan.tickets.find((t) => t.id === id)
  if (!ticket) throw new Fail(`no ticket \`${id}\` in the plan. Ids: ${plan.tickets.map((t) => t.id).join(", ")}`)
  const ledger = load<Ledger>(store.ledger, {})
  const base: Entry = { branch: ticket.branch, updated: now }
  ledger[id] =
    to === "reset" ? { ...base, state: "queued" }
    : to === "running" ? { ...base, state: "running", launched: now, reason: "marked by hand" }
    : { ...base, state: to, reason: "marked by hand" }
  save(store.ledger, ledger)
  return `${id}: ${to === "reset" ? "queued for a fresh launch" : to}`
}

let cachedRepo: Repo | undefined
const repo = () => (cachedRepo ??= currentRepo())

function run(cmd: string, args: string[], capture = true) {
  return spawnSync(cmd, args, { encoding: "utf8", stdio: capture ? "pipe" : "inherit" })
}

export const realDeps: Deps = {
  findPr(branch) {
    // REST, not `gh pr list`: Claude Code cloud sessions block GitHub's GraphQL API.
    let raw: any[]
    try {
      const r = repo()
      raw = api(realGh, r, `repos/${r.owner}/${r.name}/pulls?head=${r.owner}:${encodeURIComponent(branch)}&state=all&per_page=5`)
    } catch (e) {
      throw e instanceof GhError ? new Transient(`gh api pulls failed: ${e.message}`) : e
    }
    const prs: Pr[] = raw.map((p) => ({
      number: p.number,
      url: p.html_url,
      state: p.merged_at ? "MERGED" : p.state === "open" ? "OPEN" : "CLOSED",
    }))
    return prs.find((p) => p.state === "MERGED") ?? prs.find((p) => p.state === "OPEN") ?? prs[0] ?? null
  },
  branchExists(branch) {
    return [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`].some(
      (ref) => run("git", ["show-ref", "--verify", "--quiet", ref]).status === 0,
    )
  },
  launch(branch, prompt) {
    const custom = process.env.BACKLOG_LAUNCH
    if (!custom && !process.env.ZELLIJ) {
      throw new Fail("not inside zellij, and lfg opens a zellij tab. Run this from a zellij pane, or set BACKLOG_LAUNCH.")
    }
    // No capture: a worktrunk prompt shows up in this terminal and waits for an answer.
    const out = custom ? run(custom, [branch, prompt], false) : run("zsh", ["-ic", 'lfg "$1" "$2"', "lfg", branch, prompt], false)
    if (out.status !== 0) throw new Fail(`exited ${out.status ?? out.error?.message}`)
  },
  verdict(pr) {
    try {
      return snapshot(realGh, String(pr)).verdict
    } catch {
      return "?"
    }
  },
  now: () => new Date().toISOString().slice(0, 19),
  print: (line) => console.log(line),
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      dir: { type: "string", default: ".factory/backlog" },
      max: { type: "string", default: "3" },
      interval: { type: "string", default: "300" },
      once: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      sessions: { type: "string" },
      failed: { type: "string" },
    },
  })
  const [cmd, ...rest] = positionals
  const max = Number(values.max)
  if (!Number.isInteger(max) || max < 1) throw new Fail("--max must be a whole number of at least 1")
  mkdirSync(values.dir!, { recursive: true })
  const store = { plan: join(values.dir!, "plan.json"), ledger: join(values.dir!, "ledger.json") }
  const dryRun = values["dry-run"]!
  const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000))

  if (cmd === "check") {
    const plan = loadPlan(store)
    const ledger = load<Ledger>(store.ledger, {})
    const current = states(plan, ledger, max, orphansOf(plan, ledger, realDeps))
    const ready = [...current].filter(([, [s]]) => s === "ready").map(([id]) => id)
    console.log(`plan ok: ${plan.tickets.length} tickets, ready now: ${ready.join(", ") || "none"}`)
  } else if (cmd === "frontier") {
    const list = (v?: string) => new Set((v ?? "").split(",").map((x) => x.trim()).filter(Boolean))
    console.log(JSON.stringify(frontier(loadPlan(store), list(values.sessions), list(values.failed), max, realDeps), null, 2))
  } else if (cmd === "publish") {
    console.log(publishPlan(store.plan))
  } else if (cmd === "pull") {
    console.log(pullPlan(store.plan))
  } else if (cmd === "status") {
    tick(store, { max, dryRun: false, startWork: false }, realDeps)
  } else if (cmd === "mark") {
    const [id, to] = rest
    if (!id || !["done", "stopped", "running", "reset"].includes(to)) {
      throw new Fail("usage: backlog.ts mark ID done|stopped|running|reset")
    }
    console.log(mark(store, id, to as "done", realDeps.now()))
  } else if (cmd === "run") {
    while (true) {
      let current: Map<string, [TicketState, string]>
      try {
        current = tick(store, { max, dryRun, startWork: true }, realDeps)
      } catch (e) {
        if (!(e instanceof Transient) || values.once || dryRun) throw e
        console.error(`backlog: ${e.message}. Retrying next tick.`)
        await sleep(Number(values.interval))
        continue
      }
      const all = [...current.values()].map(([s]) => s)
      if (values.once || dryRun) return
      if (all.every((s) => s === "done")) return console.log("\nAll tickets merged.")
      if (!all.includes("running") && !all.includes("ready")) {
        console.log("\nNothing running and nothing can start. The stopped, held and blocked tickets above need you.")
        process.exit(3)
      }
      await sleep(Number(values.interval))
    }
  } else {
    throw new Fail("usage: backlog.ts check|status|run|mark|frontier|publish|pull  (see the header of this file)")
  }
}

if (import.meta.main) {
  process.on("SIGINT", () => {
    console.log("\nbacklog: stopped. Rerun to resume; the ledger is saved after every launch.")
    process.exit(130)
  })
  try {
    await main()
  } catch (e) {
    if (!(e instanceof Fail)) throw e
    console.error(`backlog: ${e.message}`)
    process.exit(2)
  }
}
