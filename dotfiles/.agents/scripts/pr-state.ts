#!/usr/bin/env bun
/**
 * Print one JSON verdict for a pull request, so a babysitting agent reads state instead of
 * re-deriving it from a dozen gh calls every round.
 *
 *   pr-state.ts [PR] [--wait] [--interval S] [--timeout S] [--pretty]
 *
 * PR is a number, URL or branch; default is the current branch's PR. Verdicts, in the order
 * an agent should clear them:
 *
 *   MERGED | CLOSED     nothing left to do
 *   CONFLICT            merge the base branch in
 *   THREADS             unresolved review threads where someone else spoke last
 *   CHANGES_REQUESTED   a changes-requested review with no push or reply from you since
 *   CI_RED              failing checks on the head commit
 *   BEHIND              base moved and branch protection wants it merged in
 *   PENDING             checks running or GitHub still computing mergeability
 *   DRAFT               green, but still a draft
 *   WAITING_REPLY       green, and every open thread or review is waiting on its reviewer
 *   WAITING_REVIEW      green, and a required approval is missing
 *   BLOCKED             green and approved, but a protection rule still blocks the merge
 *   READY               GitHub says it can merge
 *
 * "You" is the authenticated gh user. When that user also leaves review comments for the
 * agent on its own PR, a thread it opened still counts as THREADS, but its reply inside
 * someone else's thread reads as waiting.
 *
 * --wait blocks until the verdict changes, the head commit moves, or review activity lands
 * (new thread, reply, review or comment), then prints the new state. It polls gh every
 * --interval seconds (default 60) and gives up after --timeout seconds (default 540). Give
 * the Bash tool a 600000 ms timeout for it: the tool's default of two minutes kills it.
 * A timeout prints the unchanged state with "timed_out".
 * Exit codes: 0 state printed, 2 gh failed (not installed, not authenticated, no PR).
 */

import { spawnSync } from "node:child_process"
import { parseArgs } from "node:util"

type Json = Record<string, any>
export type Gh = (args: string[]) => Json

export type Verdict =
  | "MERGED" | "CLOSED" | "CONFLICT" | "THREADS" | "CHANGES_REQUESTED" | "CI_RED" | "BEHIND"
  | "PENDING" | "DRAFT" | "WAITING_REPLY" | "WAITING_REVIEW" | "BLOCKED" | "READY"

export type Thread = {
  id: string
  path: string | null
  line: number | null
  outdated: boolean
  author: string | null
  last_author: string | null
  comments: number
  url: string | null
  body: string
}

export type State = {
  pr: number
  url: string
  state: string
  draft: boolean
  head: string
  base: string
  head_sha: string
  viewer: string | null
  mergeable: string | null
  merge_state: string | null
  review_decision: string | null
  changes_answered: boolean
  checks: { failing: Json[]; pending: Json[]; passing: number }
  actionable_threads: Thread[]
  waiting_threads: Thread[]
  reviews: number
  latest_reviews: { author: string | null; state: string }[]
  comments: number
  verdict: Verdict
  next: string
  note?: string
  timed_out?: boolean
}

const FIELDS =
  "number,url,state,isDraft,headRefName,headRefOid,baseRefName,mergeable," +
  "mergeStateStatus,reviewDecision,statusCheckRollup,reviews,comments,commits"

const THREADS_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id isResolved isOutdated path line
          first: comments(first: 1) { totalCount nodes { author { login } body url } }
          last: comments(last: 1) { nodes { author { login } } }
        }
      }
    }
  }
}`

const PASS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"])
const FAIL = new Set(["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE", "STALE"])

export const NEXT: Record<Verdict, string> = {
  MERGED: "Nothing to do.",
  CLOSED: "Nothing to do. The PR was closed without merging.",
  CONFLICT: "Merge the base branch into the head branch and resolve the conflicts. No rebase or force-push.",
  THREADS: "Triage each thread in actionable_threads on its merit: fix and reply with the commit, or reply with the disproof and resolve.",
  CHANGES_REQUESTED: "Read the latest changes-requested review and answer it.",
  CI_RED: "Classify each failing check before touching code: stale base, infrastructure, or the diff's own code.",
  BEHIND: "Merge the base branch in so the head is up to date.",
  PENDING: "Wait. Run pr-state.ts --wait.",
  DRAFT: "Green but draft. Marking it ready is the human's call unless they delegated it.",
  WAITING_REPLY: "Every open thread or review is waiting on its reviewer. Wait.",
  WAITING_REVIEW: "Green and missing a required approval. Nothing for an agent to fix.",
  BLOCKED: "Green and approved, but a protection rule still blocks the merge (a required check that never reported, signed commits, a ruleset). Report it to the human.",
  READY: "Merge-ready. Stop and report, unless the human delegated the merge (a ticket at autonomy `merge`).",
}

export class GhError extends Error {}

export const realGh: Gh = (args) => {
  const out = spawnSync("gh", args, { encoding: "utf8", timeout: 120_000 })
  if (out.error) {
    const code = (out.error as NodeJS.ErrnoException).code
    throw new GhError(code === "ENOENT" ? "gh is not installed" : `gh ${args.slice(0, 2).join(" ")}: ${out.error.message}`)
  }
  if (out.status !== 0) {
    throw new GhError((out.stderr || out.stdout).trim() || `gh exited ${out.status}`)
  }
  try {
    return JSON.parse(out.stdout)
  } catch {
    throw new GhError(`gh ${args.slice(0, 2).join(" ")} printed non-JSON: ${JSON.stringify(out.stdout.slice(0, 200))}`)
  }
}

function bucket(check: Json): "pass" | "fail" | "pending" {
  if (check.__typename === "StatusContext") {
    const state = check.state ?? ""
    return PASS.has(state) ? "pass" : FAIL.has(state) ? "fail" : "pending"
  }
  if ((check.status ?? "") !== "COMPLETED") return "pending"
  const conclusion = check.conclusion ?? ""
  return PASS.has(conclusion) ? "pass" : FAIL.has(conclusion) ? "fail" : "pending"
}

function threadsFor(gh: Gh, url: string, number: number): { viewer: string | null; nodes: Json[] } {
  const m = (url ?? "").match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)\/pull\/\d+/)
  if (!m) throw new GhError(`cannot parse PR url ${JSON.stringify(url)}`)
  const [, host, owner, name] = m
  const args = ["api", "graphql", "-f", `query=${THREADS_QUERY}`, "-f", `owner=${owner}`, "-f", `name=${name}`, "-F", `number=${number}`]
  if (host !== "github.com") args.splice(1, 0, "--hostname", host)
  const data = gh(args).data ?? {}
  return {
    viewer: data.viewer?.login ?? null,
    nodes: data.repository?.pullRequest?.reviewThreads?.nodes ?? [],
  }
}

const login = (node: Json | undefined): string | null => node?.author?.login ?? null

/** True when the latest changes-requested review has a push or a reply from us after it. */
function changesAnswered(view: Json, viewer: string | null): boolean {
  const reviews: Json[] = view.reviews ?? []
  const requested = reviews.filter((r) => r.state === "CHANGES_REQUESTED")
  if (!requested.length) return false
  const since = requested.map((r) => r.submittedAt ?? "").sort().at(-1)!
  const commits: Json[] = view.commits ?? []
  if (commits.length && (commits.at(-1)!.committedDate ?? "") > since) return true
  if (!viewer) return false
  const ours = [
    ...(view.comments ?? []).filter((c: Json) => login(c) === viewer).map((c: Json) => c.createdAt ?? ""),
    ...reviews.filter((r) => login(r) === viewer).map((r) => r.submittedAt ?? ""),
  ]
  return ours.some((t) => t > since)
}

export function verdict(s: Omit<State, "verdict" | "next">): Verdict {
  const changesRequested = s.review_decision === "CHANGES_REQUESTED"
  if (s.state === "MERGED" || s.state === "CLOSED") return s.state
  if (s.mergeable === "CONFLICTING" || s.merge_state === "DIRTY") return "CONFLICT"
  if (s.actionable_threads.length) return "THREADS"
  if (changesRequested && !s.changes_answered) return "CHANGES_REQUESTED"
  if (s.checks.failing.length) return "CI_RED"
  if (s.merge_state === "BEHIND") return "BEHIND"
  if (s.checks.pending.length || s.mergeable === null || s.mergeable === "UNKNOWN" || s.merge_state === "UNKNOWN") {
    return "PENDING"
  }
  if (s.draft) return "DRAFT"
  if (s.waiting_threads.length || changesRequested) return "WAITING_REPLY"
  if (s.review_decision === "REVIEW_REQUIRED") return "WAITING_REVIEW"
  if (s.merge_state === "BLOCKED") return "BLOCKED"
  return "READY"
}

export function snapshot(gh: Gh, pr?: string): State {
  const view = gh(["pr", "view", ...(pr ? [pr] : []), "--json", FIELDS])
  const checks: State["checks"] = { failing: [], pending: [], passing: 0 }
  for (const c of view.statusCheckRollup ?? []) {
    const b = bucket(c)
    if (b === "pass") {
      checks.passing += 1
      continue
    }
    const entry: Json = { name: c.name ?? c.context ?? "?", url: c.detailsUrl ?? c.targetUrl ?? "" }
    if (b === "fail") entry.conclusion = c.conclusion ?? c.state
    checks[b === "fail" ? "failing" : "pending"].push(entry)
  }

  const { viewer, nodes } = threadsFor(gh, view.url, view.number)
  const actionable: Thread[] = []
  const waiting: Thread[] = []
  for (const t of nodes) {
    if (t.isResolved) continue
    const first = t.first?.nodes?.[0] ?? {}
    const last = t.last?.nodes?.[0] ?? {}
    const thread: Thread = {
      id: t.id,
      path: t.path ?? null,
      line: t.line ?? null,
      outdated: Boolean(t.isOutdated),
      author: login(first),
      last_author: login(last),
      comments: t.first?.totalCount ?? 0,
      url: first.url ?? null,
      body: (first.body ?? "").split(/\s+/).filter(Boolean).join(" ").slice(0, 280),
    }
    const oursLast = viewer !== null && thread.last_author === viewer && thread.author !== viewer
    ;(oursLast ? waiting : actionable).push(thread)
  }

  const reviews: Json[] = view.reviews ?? []
  const partial = {
    pr: view.number,
    url: view.url,
    state: view.state,
    draft: Boolean(view.isDraft),
    head: view.headRefName,
    base: view.baseRefName,
    head_sha: view.headRefOid,
    viewer,
    mergeable: view.mergeable ?? null,
    merge_state: view.mergeStateStatus ?? null,
    review_decision: view.reviewDecision || null,
    changes_answered: changesAnswered(view, viewer),
    checks,
    actionable_threads: actionable,
    waiting_threads: waiting,
    reviews: reviews.length,
    latest_reviews: reviews.slice(-3).map((r) => ({ author: login(r), state: r.state })),
    comments: (view.comments ?? []).length,
  }
  const v = verdict(partial)
  const state: State = { ...partial, verdict: v, next: NEXT[v] }
  if (!(view.statusCheckRollup ?? []).length && v === "READY") {
    state.note = "No checks reported on the head commit. Right after a push this means CI has not registered yet."
  }
  return state
}

export function fingerprint(s: State): string {
  const threads = [...s.actionable_threads, ...s.waiting_threads].map((t) => `${t.id}:${t.comments}`).sort()
  return JSON.stringify([s.verdict, s.head_sha, threads, s.reviews, s.comments])
}

/** Poll until something on the PR changes or the timeout passes. */
export async function waitForChange(
  gh: Gh,
  pr: string | undefined,
  opts: { intervalMs: number; timeoutMs: number; sleep?: (ms: number) => Promise<void> },
): Promise<State> {
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  let state = snapshot(gh, pr)
  if (state.verdict === "MERGED" || state.verdict === "CLOSED") return state
  const start = Date.now()
  const seen = fingerprint(state)
  while (fingerprint(state) === seen) {
    if (Date.now() - start + opts.intervalMs > opts.timeoutMs) return { ...state, timed_out: true }
    await sleep(opts.intervalMs)
    state = snapshot(gh, pr)
  }
  return state
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      wait: { type: "boolean", default: false },
      interval: { type: "string", default: "60" },
      timeout: { type: "string", default: "540" },
      pretty: { type: "boolean", default: false },
    },
  })
  const emit = (obj: unknown, code = 0) => {
    console.log(JSON.stringify(obj, null, values.pretty ? 2 : undefined))
    process.exit(code)
  }
  try {
    const pr = positionals[0]
    const state = values.wait
      ? await waitForChange(realGh, pr, { intervalMs: Number(values.interval) * 1000, timeoutMs: Number(values.timeout) * 1000 })
      : snapshot(realGh, pr)
    emit(state)
  } catch (e) {
    if (e instanceof GhError) emit({ error: e.message }, 2)
    throw e
  }
}

if (import.meta.main) await main()
