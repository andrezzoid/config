import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { type Gh, GhError, makeGh, normaliseCcrThreads, parseRepo, resolvePr, snapshot, waitForChange } from "./pr-state.ts"

const REPO = { host: "github.com", owner: "acme", name: "app" }
const GREEN_RUNS = [{ name: "test", status: "completed", conclusion: "success" }]
const RED_RUNS = [
  { name: "test", status: "completed", conclusion: "failure", html_url: "https://x/1" },
  { name: "lint", status: "completed", conclusion: "skipped" },
]
const RUNNING = [{ name: "test", status: "in_progress", conclusion: null }]
const CR = [{ user: { login: "bob" }, state: "CHANGES_REQUESTED", submitted_at: "2026-10-04T10:00:00Z" }]

type World = {
  pull?: Record<string, unknown>
  runs?: unknown[]
  statuses?: unknown[]
  reviews?: unknown[]
  comments?: unknown[]
  commits?: unknown[]
  threads?: unknown[]
  ccr?: unknown
  viewer?: string
  graphqlBlocked?: boolean
}

function graphqlThread(id: string, author: string, lastAuthor: string, count = 2) {
  return {
    id,
    isResolved: false,
    path: "a.ts",
    line: 3,
    first: { totalCount: count, nodes: [{ author: { login: author }, body: "Possible   null deref", url: `https://u/${id}` }] },
    last: { nodes: [{ author: { login: lastAuthor } }] },
  }
}

function fakeGh(w: World, calls: string[][] = []): Gh {
  return (args) => {
    calls.push(args)
    if (args[1] === "graphql") {
      if (w.graphqlBlocked) throw new GhError("HTTP 403: GitHub GraphQL is not available from Claude Code sessions")
      return { data: { repository: { pullRequest: { reviewThreads: { nodes: w.threads ?? [] } } } } }
    }
    const path = args[1]
    const routes: [RegExp, () => unknown][] = [
      [/pulls\?head=/, () => [{ number: 7, state: "open" }]],
      [/pulls\/7\/reviews/, () => w.reviews ?? []],
      [/pulls\/7\/commits/, () => w.commits ?? [{ commit: { committer: { date: "2026-10-04T09:00:00Z" } } }]],
      [/pulls\/7\/ccr\/review_threads/, () => w.ccr ?? []],
      [/pulls\/7$/, () => ({
        number: 7, html_url: "https://github.com/acme/app/pull/7", state: "open", merged: false, draft: false,
        mergeable: true, mergeable_state: "clean", head: { ref: "feat", sha: "abc" }, base: { ref: "main" },
        requested_reviewers: [], requested_teams: [], ...w.pull,
      })],
      [/check-runs/, () => ({ check_runs: w.runs ?? GREEN_RUNS })],
      [/commits\/abc\/status/, () => ({ statuses: w.statuses ?? [] })],
      [/issues\/7\/comments/, () => w.comments ?? []],
      [/^user$/, () => ({ login: w.viewer ?? "andre" })],
    ]
    const hit = routes.find(([re]) => re.test(path))
    if (!hit) throw new Error(`unexpected gh ${args.join(" ")}`)
    return hit[1]()
  }
}

let remote: string | undefined
beforeEach(() => {
  remote = process.env.CLAUDE_CODE_REMOTE
  delete process.env.CLAUDE_CODE_REMOTE
})
afterEach(() => {
  if (remote === undefined) delete process.env.CLAUDE_CODE_REMOTE
  else process.env.CLAUDE_CODE_REMOTE = remote
})

const verdictOf = (w: World) => snapshot(fakeGh(w), "7", REPO).verdict

describe("verdict", () => {
  const cases: [string, World, string][] = [
    ["green and clean", {}, "READY"],
    ["merged", { pull: { state: "closed", merged: true } }, "MERGED"],
    ["closed unmerged", { pull: { state: "closed" } }, "CLOSED"],
    ["conflict beats everything open", { pull: { mergeable: false, mergeable_state: "dirty" }, runs: RED_RUNS, threads: [graphqlThread("T1", "bot", "bot")] }, "CONFLICT"],
    ["threads beat red CI", { pull: { mergeable_state: "blocked" }, runs: RED_RUNS, threads: [graphqlThread("T1", "bot", "bot")] }, "THREADS"],
    ["unanswered change request", { pull: { mergeable_state: "blocked" }, reviews: CR }, "CHANGES_REQUESTED"],
    ["red CI", { pull: { mergeable_state: "unstable" }, runs: RED_RUNS }, "CI_RED"],
    ["red commit status", { pull: { mergeable_state: "unstable" }, statuses: [{ context: "ci/legacy", state: "error" }] }, "CI_RED"],
    ["behind base", { pull: { mergeable_state: "behind" } }, "BEHIND"],
    ["checks running", { pull: { mergeable_state: "unstable" }, runs: RUNNING }, "PENDING"],
    ["mergeability unknown", { pull: { mergeable: null, mergeable_state: "unknown" } }, "PENDING"],
    ["green draft", { pull: { draft: true, mergeable_state: "draft" } }, "DRAFT"],
    ["we spoke last in their thread", { pull: { mergeable_state: "blocked" }, threads: [graphqlThread("T9", "bob", "andre")] }, "WAITING_REPLY"],
    ["our own thread is still work", { pull: { mergeable_state: "blocked" }, threads: [graphqlThread("T8", "andre", "andre", 1)] }, "THREADS"],
    ["change request answered by a push", { pull: { mergeable_state: "blocked" }, reviews: CR, commits: [{ commit: { committer: { date: "2026-10-04T11:00:00Z" } } }] }, "WAITING_REPLY"],
    ["change request answered by our comment", { pull: { mergeable_state: "blocked" }, reviews: CR, comments: [{ user: { login: "andre" }, created_at: "2026-10-04T10:30:00Z" }] }, "WAITING_REPLY"],
    ["someone else's comment doesn't answer it", { pull: { mergeable_state: "blocked" }, reviews: CR, comments: [{ user: { login: "carol" }, created_at: "2026-10-04T10:30:00Z" }] }, "CHANGES_REQUESTED"],
    ["a later approval from the same reviewer clears it", { reviews: [...CR, { user: { login: "bob" }, state: "APPROVED", submitted_at: "2026-10-04T12:00:00Z" }] }, "READY"],
    ["blocked without an approval", { pull: { mergeable_state: "blocked" } }, "WAITING_REVIEW"],
    ["approved but another reviewer is still requested", { pull: { mergeable_state: "blocked", requested_reviewers: [{ login: "carol" }] }, reviews: [{ user: { login: "bob" }, state: "APPROVED" }] }, "WAITING_REVIEW"],
    ["approved but a rule blocks", { pull: { mergeable_state: "blocked" }, reviews: [{ user: { login: "bob" }, state: "APPROVED" }] }, "BLOCKED"],
  ]
  for (const [name, world, expected] of cases) it(name, () => expect(verdictOf(world)).toBe(expected as never))

  it("lists failing checks and the thread a reviewer must answer", () => {
    const s = snapshot(fakeGh({ runs: RED_RUNS, threads: [graphqlThread("T1", "bugbot", "bugbot")] }), "7", REPO)
    expect(s.checks.failing).toEqual([{ name: "test", url: "https://x/1", conclusion: "FAILURE" }])
    expect(s.actionable_threads.map((t) => [t.id, t.author, t.body])).toEqual([["T1", "bugbot", "Possible null deref"]])
  })

  it("warns that READY with no checks may mean CI hasn't registered", () => {
    expect(snapshot(fakeGh({ runs: [] }), "7", REPO).note).toContain("CI has not registered yet")
  })

  it("passes owner and name to GraphQL as strings and the number as a typed field", () => {
    const calls: string[][] = []
    snapshot(fakeGh({}, calls), "7", REPO)
    const q = calls.find((a) => a[1] === "graphql")!
    expect(q[q.indexOf("owner=acme") - 1]).toBe("-f")
    expect(q[q.indexOf("number=7") - 1]).toBe("-F")
  })
})

describe("review threads in the cloud", () => {
  it("reads the ccr route instead of GraphQL when running in a cloud session", () => {
    process.env.CLAUDE_CODE_REMOTE = "true"
    const calls: string[][] = []
    const s = snapshot(fakeGh({ ccr: [graphqlThread("T1", "bot", "bot")] }, calls), "7", REPO)
    expect(calls.some((a) => a[1] === "graphql")).toBe(false)
    expect(s.verdict).toBe("THREADS")
  })

  it("falls back to the ccr route when GraphQL is blocked", () => {
    const s = snapshot(fakeGh({ graphqlBlocked: true, ccr: [graphqlThread("T1", "bot", "bot")] }), "7", REPO)
    expect(s.actionable_threads.map((t) => t.id)).toEqual(["T1"])
  })

  it("normalises snake_case threads with REST-style comments", () => {
    const { nodes, unparsed } = normaliseCcrThreads({
      threads: [{
        node_id: "PRRT_1", is_resolved: false, is_outdated: true,
        comments: [
          { user: { login: "bob" }, body: "why?", html_url: "https://u/1", path: "b.ts", line: 9 },
          { user: { login: "andre" }, body: "because" },
        ],
      }],
    })
    expect(unparsed).toBe(0)
    expect(nodes[0]).toMatchObject({ id: "PRRT_1", isResolved: false, isOutdated: true, path: "b.ts", line: 9 })
    expect(nodes[0].last.nodes[0].author.login).toBe("andre")
  })

  it("counts threads it can't read instead of dropping them, and says so in the note", () => {
    process.env.CLAUDE_CODE_REMOTE = "true"
    const s = snapshot(fakeGh({ ccr: [{ something: "else" }] }), "7", REPO)
    expect(s.unparsed_threads).toBe(1)
    expect(s.note).toContain("can't read")
  })
})

describe("resolvePr", () => {
  it("parses GitHub remotes in every shape", () => {
    for (const url of ["https://github.com/acme/app", "https://github.com/acme/app.git", "git@github.com:acme/app.git", "ssh://git@github.com/acme/app"]) {
      expect(parseRepo(url)).toEqual(REPO)
    }
    expect(parseRepo("https://ghe.corp/acme/app")).toEqual({ host: "ghe.corp", owner: "acme", name: "app" })
    expect(parseRepo("not a url")).toBeNull()
  })

  it("takes a URL, a number, or a branch", () => {
    const gh = fakeGh({})
    expect(resolvePr(gh, "https://github.com/acme/app/pull/12")).toEqual({ repo: REPO, number: 12 })
    expect(resolvePr(gh, "12", REPO)).toEqual({ repo: REPO, number: 12 })
    expect(resolvePr(gh, "feat", REPO)).toEqual({ repo: REPO, number: 7 })
  })
})

describe("waitForChange", () => {
  const noSleep = async () => {}

  it("returns when the verdict changes", async () => {
    let views = 0
    const gh: Gh = (args) => {
      if (/pulls\/7$/.test(args[1])) views += 1
      return fakeGh({ runs: views >= 3 ? RED_RUNS : RUNNING })(args)
    }
    const s = await waitForChange(gh, "7", { intervalMs: 1, timeoutMs: 10_000, sleep: noSleep, repo: REPO })
    expect([s.verdict, s.timed_out]).toEqual(["CI_RED", undefined])
  })

  it("returns when a reply lands, even though the verdict holds", async () => {
    let views = 0
    const gh: Gh = (args) => {
      if (/pulls\/7$/.test(args[1])) views += 1
      return fakeGh({ threads: [graphqlThread("T1", "bob", "bob", views >= 2 ? 3 : 2)] })(args)
    }
    const s = await waitForChange(gh, "7", { intervalMs: 1, timeoutMs: 10_000, sleep: noSleep, repo: REPO })
    expect([s.verdict, s.actionable_threads[0].comments]).toEqual(["THREADS", 3])
  })

  it("times out with the state unchanged", async () => {
    const s = await waitForChange(fakeGh({ runs: RUNNING }), "7", { intervalMs: 5, timeoutMs: 4, sleep: noSleep, repo: REPO })
    expect([s.verdict, s.timed_out]).toEqual(["PENDING", true])
  })

  it("returns at once on a merged PR", async () => {
    const s = await waitForChange(fakeGh({ pull: { state: "closed", merged: true } }), "7", { intervalMs: 60_000, timeoutMs: 1, sleep: noSleep, repo: REPO })
    expect(s.verdict).toBe("MERGED")
  })
})

describe("realGh", () => {
  it("turns a missing gh into a GhError", () => {
    expect(() => makeGh("/nonexistent/gh")(["api", "user"])).toThrow("gh is not installed")
  })
})
