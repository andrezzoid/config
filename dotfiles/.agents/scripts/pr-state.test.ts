import { describe, expect, it } from "bun:test"
import { type Gh, GhError, realGh, snapshot, waitForChange } from "./pr-state.ts"

const GREEN = [
  { __typename: "CheckRun", name: "test", status: "COMPLETED", conclusion: "SUCCESS" },
  { __typename: "StatusContext", context: "ci/legacy", state: "SUCCESS" },
]
const RED = [
  { __typename: "CheckRun", name: "test", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: "https://x/1" },
  { __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "SKIPPED" },
]
const RUNNING = [
  { __typename: "CheckRun", name: "test", status: "IN_PROGRESS", conclusion: null },
  { __typename: "StatusContext", context: "deploy", state: "PENDING" },
]

function thread(id: string, author: string, lastAuthor: string, count = 2) {
  return {
    id,
    isResolved: false,
    path: "a.ts",
    line: 3,
    first: { totalCount: count, nodes: [{ author: { login: author }, body: "Possible   null deref", url: `https://u/${id}` }] },
    last: { nodes: [{ author: { login: lastAuthor } }] },
  }
}

function fakeGh(view: Record<string, unknown>, threads: unknown[] = [], viewer = "andre"): Gh {
  return (args) => {
    if (args[0] === "pr" && args[1] === "view") {
      return {
        number: 7,
        url: "https://github.com/acme/app/pull/7",
        state: "OPEN",
        isDraft: false,
        headRefName: "feat",
        headRefOid: "abc",
        baseRefName: "main",
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
        reviewDecision: "",
        statusCheckRollup: GREEN,
        reviews: [],
        comments: [],
        commits: [{ committedDate: "2026-10-04T09:00:00Z" }],
        ...view,
      }
    }
    if (args[0] === "api" && args[1] === "graphql") {
      return { data: { viewer: { login: viewer }, repository: { pullRequest: { reviewThreads: { nodes: threads } } } } }
    }
    throw new Error(`unexpected gh ${args.join(" ")}`)
  }
}

const CR = [{ author: { login: "bob" }, state: "CHANGES_REQUESTED", submittedAt: "2026-10-04T10:00:00Z" }]

describe("verdict", () => {
  const cases: [string, Record<string, unknown>, unknown[], string][] = [
    ["green and approved", { reviewDecision: "APPROVED" }, [], "READY"],
    ["merged", { state: "MERGED" }, [], "MERGED"],
    ["conflict beats everything open", { mergeable: "CONFLICTING", mergeStateStatus: "DIRTY", statusCheckRollup: RED }, [thread("T1", "bot", "bot")], "CONFLICT"],
    ["threads beat red CI", { mergeStateStatus: "BLOCKED", statusCheckRollup: RED }, [thread("T1", "bot", "bot")], "THREADS"],
    ["unanswered change request", { mergeStateStatus: "BLOCKED", reviewDecision: "CHANGES_REQUESTED", reviews: CR }, [], "CHANGES_REQUESTED"],
    ["red CI", { mergeStateStatus: "UNSTABLE", statusCheckRollup: RED }, [], "CI_RED"],
    ["behind base", { mergeStateStatus: "BEHIND", reviewDecision: "APPROVED" }, [], "BEHIND"],
    ["checks running", { mergeStateStatus: "UNSTABLE", statusCheckRollup: RUNNING }, [], "PENDING"],
    ["mergeability unknown", { mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }, [], "PENDING"],
    ["green draft", { isDraft: true, mergeStateStatus: "DRAFT" }, [], "DRAFT"],
    ["we spoke last in their thread", { mergeStateStatus: "BLOCKED" }, [thread("T9", "bob", "andre")], "WAITING_REPLY"],
    ["our own thread is still work", { mergeStateStatus: "BLOCKED" }, [thread("T8", "andre", "andre", 1)], "THREADS"],
    ["change request answered by a push", { mergeStateStatus: "BLOCKED", reviewDecision: "CHANGES_REQUESTED", reviews: CR, commits: [{ committedDate: "2026-10-04T11:00:00Z" }] }, [], "WAITING_REPLY"],
    ["change request answered by our comment", { mergeStateStatus: "BLOCKED", reviewDecision: "CHANGES_REQUESTED", reviews: CR, comments: [{ author: { login: "andre" }, createdAt: "2026-10-04T10:30:00Z" }] }, [], "WAITING_REPLY"],
    ["someone else's comment doesn't answer it", { mergeStateStatus: "BLOCKED", reviewDecision: "CHANGES_REQUESTED", reviews: CR, comments: [{ author: { login: "carol" }, createdAt: "2026-10-04T10:30:00Z" }] }, [], "CHANGES_REQUESTED"],
    ["missing approval", { mergeStateStatus: "BLOCKED", reviewDecision: "REVIEW_REQUIRED" }, [], "WAITING_REVIEW"],
    ["approved but a rule blocks", { mergeStateStatus: "BLOCKED", reviewDecision: "APPROVED" }, [], "BLOCKED"],
  ]
  for (const [name, view, threads, expected] of cases) {
    it(name, () => expect(snapshot(fakeGh(view, threads)).verdict).toBe(expected as never))
  }

  it("lists failing checks and the thread a reviewer must answer", () => {
    const s = snapshot(fakeGh({ statusCheckRollup: RED }, [thread("T1", "bugbot", "bugbot")]))
    expect(s.checks.failing).toEqual([{ name: "test", url: "https://x/1", conclusion: "FAILURE" }])
    expect(s.actionable_threads.map((t) => [t.id, t.author, t.body])).toEqual([["T1", "bugbot", "Possible null deref"]])
  })

  it("warns that READY with no checks may mean CI hasn't registered", () => {
    expect(snapshot(fakeGh({ statusCheckRollup: [] })).note).toContain("CI has not registered yet")
  })

  it("passes owner and name as strings and the number as a typed field", () => {
    const calls: string[][] = []
    const gh = fakeGh({})
    snapshot((args) => (calls.push(args), gh(args)))
    expect(calls[1]).toContain("owner=acme")
    expect(calls[1][calls[1].indexOf("owner=acme") - 1]).toBe("-f")
    expect(calls[1][calls[1].indexOf("number=7") - 1]).toBe("-F")
  })
})

describe("waitForChange", () => {
  const noSleep = async () => {}

  it("returns when the verdict changes", async () => {
    let calls = 0
    const gh: Gh = (args) => {
      if (args[1] === "view") calls += 1
      return fakeGh({ statusCheckRollup: calls >= 3 ? RED : RUNNING })(args)
    }
    const s = await waitForChange(gh, "7", { intervalMs: 1, timeoutMs: 10_000, sleep: noSleep })
    expect(s.verdict).toBe("CI_RED")
    expect(s.timed_out).toBeUndefined()
  })

  it("returns when a reply lands, even though the verdict holds", async () => {
    let calls = 0
    const gh: Gh = (args) => {
      if (args[1] === "view") calls += 1
      return fakeGh({}, [thread("T1", "bob", "bob", calls >= 2 ? 3 : 2)])(args)
    }
    const s = await waitForChange(gh, "7", { intervalMs: 1, timeoutMs: 10_000, sleep: noSleep })
    expect([s.verdict, s.actionable_threads[0].comments]).toEqual(["THREADS", 3])
  })

  it("times out with the state unchanged", async () => {
    const s = await waitForChange(fakeGh({ statusCheckRollup: RUNNING }), "7", { intervalMs: 5, timeoutMs: 4, sleep: noSleep })
    expect([s.verdict, s.timed_out]).toEqual(["PENDING", true])
  })

  it("returns at once on a merged PR", async () => {
    const s = await waitForChange(fakeGh({ state: "MERGED" }), "7", { intervalMs: 60_000, timeoutMs: 1, sleep: noSleep })
    expect(s.verdict).toBe("MERGED")
  })
})

describe("realGh", () => {
  it("turns a missing or failing gh into a GhError", () => {
    const path = process.env.PATH
    process.env.PATH = "/nonexistent"
    try {
      expect(() => realGh(["pr", "view"])).toThrow(GhError)
    } finally {
      process.env.PATH = path
    }
  })
})
