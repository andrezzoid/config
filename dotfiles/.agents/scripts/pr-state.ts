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
 *   WAITING_REVIEW      green and blocked, with a review still requested or no approval yet
 *   BLOCKED             green and approved, but a protection rule still blocks the merge
 *   READY               GitHub says it can merge
 *
 * "You" is the authenticated gh user. When that user also leaves review comments for the
 * agent on its own PR, a thread it opened still counts as THREADS, but its reply inside
 * someone else's thread reads as waiting.
 *
 * Everything goes through gh's REST API, because Claude Code cloud sessions block GraphQL.
 * Review threads are the exception: GraphQL on a laptop, the proxy's
 * /pulls/{n}/ccr/review_threads route in the cloud.
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
export type Gh = (args: string[]) => any
export type Repo = { host: string; owner: string; name: string }

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
  state: "OPEN" | "MERGED" | "CLOSED"
  draft: boolean
  head: string
  base: string
  head_sha: string
  viewer: string | null
  mergeable: boolean | null
  merge_state: string
  review_decision: "APPROVED" | "CHANGES_REQUESTED" | null
  review_requested: boolean
  changes_answered: boolean
  checks: { failing: Json[]; pending: Json[]; passing: number }
  actionable_threads: Thread[]
  waiting_threads: Thread[]
  unparsed_threads: number
  reviews: number
  latest_reviews: { author: string | null; state: string }[]
  comments: number
  verdict: Verdict
  next: string
  note?: string
  timed_out?: boolean
}

const THREADS_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
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

const PASS = new Set(["success", "neutral", "skipped"])
const FAIL = new Set(["failure", "error", "timed_out", "cancelled", "action_required", "startup_failure", "stale"])

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
  WAITING_REVIEW: "Green, blocked, and waiting on a requested review or an approval. REST can't see how many approvals a rule needs, so if the approvals look sufficient, check the branch rules. Nothing for an agent to fix.",
  BLOCKED: "Green and approved, but a protection rule still blocks the merge (a required check that never reported, signed commits, a ruleset). Report it to the human.",
  READY: "Merge-ready. Stop and report, unless the human delegated the merge (a ticket at autonomy `merge`).",
}

export class GhError extends Error {}

export const makeGh = (bin = "gh"): Gh => (args) => {
  const out = spawnSync(bin, args, { encoding: "utf8", timeout: 120_000 })
  if (out.error) {
    const code = (out.error as NodeJS.ErrnoException).code
    throw new GhError(code === "ENOENT" ? "gh is not installed" : `gh ${args.slice(0, 2).join(" ")}: ${out.error.message}`)
  }
  if (out.status !== 0) throw new GhError((out.stderr || out.stdout).trim() || `gh exited ${out.status}`)
  try {
    return JSON.parse(out.stdout)
  } catch {
    throw new GhError(`gh ${args.slice(0, 2).join(" ")} printed non-JSON: ${JSON.stringify(out.stdout.slice(0, 200))}`)
  }
}

export const realGh = makeGh()

/** `gh api <path>`, with --hostname for GitHub Enterprise. */
export function api(gh: Gh, repo: Repo, path: string, extra: string[] = []): any {
  return gh(["api", ...(repo.host === "github.com" ? [] : ["--hostname", repo.host]), path, ...extra])
}

/** Every page of a list endpoint. Reviews, comments and commits come oldest first, so page one alone loses the newest. */
export function apiAll(gh: Gh, repo: Repo, path: string): any[] {
  const pages: any[] = api(gh, repo, path, ["--paginate", "--slurp"])
  return pages.flatMap((page) => (Array.isArray(page) ? page : [page]))
}

export function parseRepo(url: string): Repo | null {
  const m = url.trim().match(/^(?:https?:\/\/|ssh:\/\/git@|git@)([^/:]+)[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  return m ? { host: m[1], owner: m[2], name: m[3] } : null
}

export function currentRepo(): Repo {
  const out = spawnSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" })
  const repo = out.status === 0 ? parseRepo(out.stdout) : null
  if (!repo) throw new GhError("can't tell the GitHub repo: `git remote get-url origin` gave no GitHub URL")
  return repo
}

function currentBranch(): string {
  const out = spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" })
  const branch = out.stdout?.trim()
  if (!branch) throw new GhError("no PR given and HEAD is not on a branch")
  return branch
}

/** The PR a number, URL or branch names, and the repo it lives in. */
export function resolvePr(gh: Gh, arg?: string, repo?: Repo): { repo: Repo; number: number } {
  const url = arg?.match(/^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/pull\/(\d+)/)
  if (url) return { repo: parseRepo(url[1])!, number: Number(url[2]) }
  const r = repo ?? currentRepo()
  if (arg && /^\d+$/.test(arg)) return { repo: r, number: Number(arg) }
  const branch = arg ?? currentBranch()
  const prs: Json[] = api(gh, r, `repos/${r.owner}/${r.name}/pulls?head=${r.owner}:${encodeURIComponent(branch)}&state=all&per_page=10`)
  const pick = prs.find((p) => p.state === "open") ?? prs[0]
  if (!pick) throw new GhError(`no pull request for branch ${branch}`)
  return { repo: r, number: pick.number }
}

function threadsViaGraphql(gh: Gh, repo: Repo, number: number): Json[] {
  const args = ["api", "graphql", "-f", `query=${THREADS_QUERY}`, "-f", `owner=${repo.owner}`, "-f", `name=${repo.name}`, "-F", `number=${number}`]
  if (repo.host !== "github.com") args.splice(1, 0, "--hostname", repo.host)
  return gh(args).data?.repository?.pullRequest?.reviewThreads?.nodes ?? []
}

/**
 * Normalise the cloud proxy's review-thread route. Its shape isn't documented, so this
 * accepts the GraphQL field names and their snake_case REST cousins; a thread it can't
 * read is counted in unparsed_threads instead of silently dropped.
 */
export function normaliseCcrThreads(raw: any): { nodes: Json[]; unparsed: number } {
  const list: any[] = Array.isArray(raw) ? raw : raw?.threads ?? raw?.review_threads ?? raw?.nodes ?? []
  const nodes: Json[] = []
  let unparsed = 0
  for (const t of list) {
    // Already in the GraphQL node shape: take it as it is.
    if (t?.first?.nodes && t?.id !== undefined && t?.isResolved !== undefined) {
      nodes.push(t)
      continue
    }
    const comments: any[] = Array.isArray(t?.comments) ? t.comments : t?.comments?.nodes ?? []
    const id = t?.id ?? t?.node_id ?? t?.thread_id
    const resolved = t?.isResolved ?? t?.is_resolved ?? t?.resolved
    if (id === undefined || resolved === undefined || !comments.length) {
      unparsed += 1
      continue
    }
    const who = (c: any) => c?.author?.login ?? c?.user?.login ?? (typeof c?.author === "string" ? c.author : null)
    nodes.push({
      id: String(id),
      isResolved: Boolean(resolved),
      isOutdated: Boolean(t.isOutdated ?? t.is_outdated ?? t.outdated),
      path: t.path ?? comments[0]?.path ?? null,
      line: t.line ?? comments[0]?.line ?? comments[0]?.original_line ?? null,
      first: {
        totalCount: comments.length,
        nodes: [{ author: { login: who(comments[0]) }, body: comments[0]?.body ?? "", url: comments[0]?.html_url ?? comments[0]?.url ?? null }],
      },
      last: { nodes: [{ author: { login: who(comments.at(-1)) } }] },
    })
  }
  return { nodes, unparsed }
}

function threadsFor(gh: Gh, repo: Repo, number: number): { nodes: Json[]; unparsed: number } {
  const ccr = () => normaliseCcrThreads(api(gh, repo, `repos/${repo.owner}/${repo.name}/pulls/${number}/ccr/review_threads`))
  if (process.env.CLAUDE_CODE_REMOTE === "true") return ccr()
  try {
    return { nodes: threadsViaGraphql(gh, repo, number), unparsed: 0 }
  } catch (e) {
    if (e instanceof GhError && /GraphQL is not available/i.test(e.message)) return ccr()
    throw e
  }
}

const login = (node: Json | undefined): string | null => node?.user?.login ?? node?.author?.login ?? null

/** The latest non-comment review per reviewer decides, the way GitHub's review decision does. */
function reviewDecision(reviews: Json[]): State["review_decision"] {
  const latest = new Map<string, string>()
  for (const r of reviews) {
    if (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED" || r.state === "DISMISSED") latest.set(login(r) ?? "?", r.state)
  }
  const states = [...latest.values()]
  if (states.includes("CHANGES_REQUESTED")) return "CHANGES_REQUESTED"
  if (states.includes("APPROVED")) return "APPROVED"
  return null
}

/** True when the latest changes-requested review has a push or a reply from us after it. */
function changesAnswered(reviews: Json[], comments: Json[], commits: Json[], viewer: string | null): boolean {
  const requested = reviews.filter((r) => r.state === "CHANGES_REQUESTED")
  if (!requested.length) return false
  const since = requested.map((r) => r.submitted_at ?? "").sort().at(-1)!
  const lastCommit = commits.at(-1)?.commit?.committer?.date ?? ""
  if (lastCommit > since) return true
  if (!viewer) return false
  const ours = [
    ...comments.filter((c) => login(c) === viewer).map((c) => c.created_at ?? ""),
    ...reviews.filter((r) => login(r) === viewer).map((r) => r.submitted_at ?? ""),
  ]
  return ours.some((t) => t > since)
}

export function verdict(s: Omit<State, "verdict" | "next">): Verdict {
  const changesRequested = s.review_decision === "CHANGES_REQUESTED"
  if (s.state === "MERGED" || s.state === "CLOSED") return s.state
  if (s.mergeable === false || s.merge_state === "DIRTY") return "CONFLICT"
  if (s.actionable_threads.length) return "THREADS"
  if (changesRequested && !s.changes_answered) return "CHANGES_REQUESTED"
  if (s.checks.failing.length) return "CI_RED"
  if (s.merge_state === "BEHIND") return "BEHIND"
  if (s.checks.pending.length || s.mergeable === null || s.merge_state === "UNKNOWN") return "PENDING"
  if (s.draft) return "DRAFT"
  if (s.waiting_threads.length || changesRequested) return "WAITING_REPLY"
  if (s.merge_state === "BLOCKED") {
    return s.review_decision === "APPROVED" && !s.review_requested ? "BLOCKED" : "WAITING_REVIEW"
  }
  return "READY"
}

export function snapshot(gh: Gh, pr?: string, repoHint?: Repo): State {
  const { repo, number } = resolvePr(gh, pr, repoHint)
  const base = `repos/${repo.owner}/${repo.name}`
  const pull: Json = api(gh, repo, `${base}/pulls/${number}`)
  const sha: string = pull.head?.sha
  const runs: Json[] = apiAll(gh, repo, `${base}/commits/${sha}/check-runs?per_page=100`).flatMap((p) => p.check_runs ?? [])
  const statuses: Json[] = api(gh, repo, `${base}/commits/${sha}/status?per_page=100`).statuses ?? []
  const reviews: Json[] = apiAll(gh, repo, `${base}/pulls/${number}/reviews?per_page=100`)
  const comments: Json[] = apiAll(gh, repo, `${base}/issues/${number}/comments?per_page=100`)
  const commits: Json[] = apiAll(gh, repo, `${base}/pulls/${number}/commits?per_page=100`)
  const viewer: string | null = api(gh, repo, "user").login ?? null

  const checks: State["checks"] = { failing: [], pending: [], passing: 0 }
  const tally = (bucket: "pass" | "fail" | "pending", name: string, url: string, conclusion?: string) => {
    if (bucket === "pass") return void (checks.passing += 1)
    checks[bucket === "fail" ? "failing" : "pending"].push(bucket === "fail" ? { name, url, conclusion } : { name, url })
  }
  for (const r of runs) {
    const c = (r.conclusion ?? "").toLowerCase()
    const bucket = r.status !== "completed" ? "pending" : PASS.has(c) ? "pass" : FAIL.has(c) ? "fail" : "pending"
    tally(bucket, r.name ?? "?", r.html_url ?? r.details_url ?? "", c.toUpperCase())
  }
  for (const s of statuses) {
    const st = (s.state ?? "").toLowerCase()
    tally(st === "success" ? "pass" : FAIL.has(st) ? "fail" : "pending", s.context ?? "?", s.target_url ?? "", st.toUpperCase())
  }

  const { nodes, unparsed } = threadsFor(gh, repo, number)
  const actionable: Thread[] = []
  const waiting: Thread[] = []
  for (const t of nodes) {
    if (t.isResolved) continue
    const first = t.first?.nodes?.[0] ?? {}
    const thread: Thread = {
      id: t.id,
      path: t.path ?? null,
      line: t.line ?? null,
      outdated: Boolean(t.isOutdated),
      author: first.author?.login ?? null,
      last_author: t.last?.nodes?.[0]?.author?.login ?? null,
      comments: t.first?.totalCount ?? 0,
      url: first.url ?? null,
      body: (first.body ?? "").split(/\s+/).filter(Boolean).join(" ").slice(0, 280),
    }
    const oursLast = viewer !== null && thread.last_author === viewer && thread.author !== viewer
    ;(oursLast ? waiting : actionable).push(thread)
  }

  const partial = {
    pr: number,
    url: pull.html_url,
    state: (pull.merged || pull.merged_at ? "MERGED" : pull.state === "closed" ? "CLOSED" : "OPEN") as State["state"],
    draft: Boolean(pull.draft),
    head: pull.head?.ref,
    base: pull.base?.ref,
    head_sha: sha,
    viewer,
    mergeable: pull.mergeable ?? null,
    merge_state: String(pull.mergeable_state ?? "unknown").toUpperCase(),
    review_decision: reviewDecision(reviews),
    review_requested: (pull.requested_reviewers ?? []).length + (pull.requested_teams ?? []).length > 0,
    changes_answered: changesAnswered(reviews, comments, commits, viewer),
    checks,
    actionable_threads: actionable,
    waiting_threads: waiting,
    unparsed_threads: unparsed,
    reviews: reviews.length,
    latest_reviews: reviews.slice(-3).map((r) => ({ author: login(r), state: r.state })),
    comments: comments.length,
  }
  const v = verdict(partial)
  const state: State = { ...partial, verdict: v, next: NEXT[v] }
  if (unparsed) state.note = `${unparsed} review thread(s) came back in a shape this script can't read. Check them with the GitHub tools before trusting the verdict.`
  else if (!runs.length && !statuses.length && v === "READY") {
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
  opts: { intervalMs: number; timeoutMs: number; sleep?: (ms: number) => Promise<void>; repo?: Repo },
): Promise<State> {
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  let state = snapshot(gh, pr, opts.repo)
  if (state.verdict === "MERGED" || state.verdict === "CLOSED") return state
  // Pin the PR number so a branch argument can't drift to another PR mid-wait.
  const pinned = String(state.pr)
  const start = Date.now()
  const seen = fingerprint(state)
  while (fingerprint(state) === seen) {
    if (Date.now() - start + opts.intervalMs > opts.timeoutMs) return { ...state, timed_out: true }
    await sleep(opts.intervalMs)
    state = snapshot(gh, pinned, parseRepo(state.url.replace(/\/pull\/\d+$/, "")) ?? opts.repo)
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
