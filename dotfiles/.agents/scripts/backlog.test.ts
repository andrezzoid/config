import { beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Deps, type Plan, type Pr, claim, cycles, frontier, mark, problems, publishPlan, pullPlan, tick } from "./backlog.ts"

const ticket = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  ref: `ENG-${id}`,
  branch: `eng-${id.toLowerCase()}`,
  autonomy: "pr",
  ...extra,
})

function world(tickets: object[]) {
  const dir = mkdtempSync(join(tmpdir(), "backlog-"))
  const store = { plan: join(dir, "plan.json"), ledger: join(dir, "ledger.json") }
  writeFileSync(store.plan, JSON.stringify({ tickets }))
  const prs: Record<string, Pr> = {}
  const branches = new Set<string>()
  const failing = new Set<string>()
  const launches: string[] = []
  const deps: Deps = {
    findPr: (branch) => prs[branch] ?? null,
    branchExists: (branch) => branches.has(branch),
    launch: (branch, prompt) => {
      launches.push(`${branch}|${prompt}`)
      if (failing.has(branch)) throw new Error("exited 1")
      branches.add(branch)
    },
    verdict: () => "PENDING",
    now: () => "2026-10-04T12:00:00",
    print: () => {},
  }
  const run = (max = 3, startWork = true) => tick(store, { max, dryRun: false, startWork }, deps)
  const stateOf = (map: ReturnType<typeof run>, id: string) => map.get(id)![0]
  const ledger = () => JSON.parse(readFileSync(store.ledger, "utf8"))
  return { store, prs, branches, failing, launches, run, stateOf, ledger, deps }
}

describe("problems", () => {
  it("accepts a well-formed plan", () => {
    expect(problems({ tickets: [ticket("A"), ticket("B", { blocked_by: ["A"], serial: "api" })] })).toEqual([])
  })

  it("names every structural problem", () => {
    const errs = problems({
      tickets: [
        ticket("P", { branch: "p q", autonomy: "yolo" }),
        ticket("Q", { branch: "q" }),
        ticket("Q", { branch: "q", serial: 7, ref: `it's "$HOME"` }),
      ],
    })
    expect(errs).toEqual([
      "ticket 1 (P): `p q` is not a valid branch name",
      "ticket 1 (P): `autonomy` must be one of commit, merge, pr",
      "ticket 3 (Q): duplicate id",
      "ticket 3 (Q): branch `q` is used twice",
      "ticket 3 (Q): ref `it's \"$HOME\"` holds characters lfg can't carry (quotes, $, backticks, spaces)",
      "ticket 3 (Q): `serial` must be a non-empty string when present",
    ])
  })

  it("rejects blockers outside the plan and cycles", () => {
    expect(problems({ tickets: [ticket("A", { blocked_by: ["Z"] })] })).toEqual([
      "A: blocker `Z` is not in the plan. Move it to external_blockers or add it.",
    ])
    const loop = [ticket("P", { blocked_by: ["Q"] }), ticket("Q", { blocked_by: ["R"] }), ticket("R", { blocked_by: ["P"] })]
    expect(cycles(loop as Plan["tickets"])).toEqual([["P", "Q", "R", "P"]])
    expect(problems({ tickets: [ticket("S", { blocked_by: ["S"] })] })).toEqual(["blocking cycle: S -> S"])
  })

  it("rejects an empty or missing ticket list", () => {
    expect(problems({ tickets: [] })).toEqual(["plan.json needs a non-empty `tickets` list"])
    expect(problems(null)).toEqual(["plan.json needs a non-empty `tickets` list"])
  })
})

describe("tick", () => {
  let w: ReturnType<typeof world>
  beforeEach(() => {
    w = world([
      ticket("A"),
      ticket("B", { blocked_by: ["A"], serial: "api" }),
      ticket("C", { blocked_by: ["A"], serial: "api" }),
      ticket("D"),
      ticket("E"),
      ticket("F", { external_blockers: ["ENG-99"] }),
      ticket("G", { done: true }),
    ])
  })

  it("launches the frontier up to --max and holds the rest", () => {
    const s = w.run(2)
    expect(w.launches).toEqual(["eng-a|/implement ENG-A", "eng-d|/implement ENG-D"])
    expect([..."ABCDEFG"].map((id) => w.stateOf(s, id))).toEqual([
      "running", "blocked", "blocked", "running", "held", "blocked", "done",
    ])
  })

  it("never launches a running ticket twice", () => {
    w.run(2)
    w.run(2)
    expect(w.launches).toHaveLength(2)
  })

  it("unlocks dependents on merge, one per serial group", () => {
    w.run(5)
    w.prs["eng-a"] = { number: 11, state: "MERGED", url: "u11" }
    const s = w.run(5)
    expect(w.stateOf(s, "A")).toBe("done")
    expect(w.stateOf(s, "B")).toBe("running")
    expect(w.stateOf(s, "C")).toBe("held")
  })

  it("stops a ticket whose PR closed unmerged, and keeps its dependents blocked", () => {
    w.run(5)
    w.prs["eng-a"] = { number: 11, state: "CLOSED", url: "u11" }
    const s = w.run(5)
    expect(w.stateOf(s, "A")).toBe("stopped")
    expect(w.stateOf(s, "B")).toBe("blocked")
  })

  it("records a failed launch as stopped and keeps the others from the same tick", () => {
    w.failing.add("eng-d")
    const s = w.run(3)
    expect(w.stateOf(s, "A")).toBe("running")
    expect(w.stateOf(s, "D")).toBe("stopped")
    expect(w.stateOf(s, "E")).toBe("running")
    expect(w.ledger().D.reason).toBe("launch failed: exited 1")
  })

  it("holds a branch it didn't launch until told who owns it", () => {
    w.branches.add("eng-d")
    expect(w.stateOf(w.run(5), "D")).toBe("held")
    expect(w.launches).not.toContain("eng-d|/implement ENG-D")
    mark(w.store, "D", "running", "now")
    expect(w.stateOf(w.run(5), "D")).toBe("running")
    expect(w.launches).not.toContain("eng-d|/implement ENG-D")
  })

  it("relaunches on reset, even though the branch exists", () => {
    w.failing.add("eng-d")
    w.run(5)
    w.failing.delete("eng-d")
    w.branches.add("eng-d")
    mark(w.store, "D", "reset", "now")
    expect(w.stateOf(w.run(5), "D")).toBe("running")
    expect(w.launches.filter((l) => l.startsWith("eng-d"))).toHaveLength(2)
  })

  it("follows the ledger's branch when a re-plan renames it", () => {
    w.run(5)
    const plan = JSON.parse(readFileSync(w.store.plan, "utf8"))
    plan.tickets[0].branch = "eng-a-renamed"
    writeFileSync(w.store.plan, JSON.stringify(plan))
    w.prs["eng-a"] = { number: 11, state: "MERGED", url: "u11" }
    const s = w.run(5)
    expect(w.stateOf(s, "A")).toBe("done")
    expect(w.stateOf(s, "B")).toBe("running")
  })

  it("status refreshes without launching", () => {
    w.run(5, false)
    expect(w.launches).toEqual([])
  })
})

describe("mark", () => {
  it("rejects an id that isn't in the plan", () => {
    const w = world([ticket("A")])
    expect(() => mark(w.store, "NOPE", "stopped", "now")).toThrow("no ticket `NOPE` in the plan. Ids: A")
  })
})

describe("frontier (cloud mode)", () => {
  const plan = {
    tickets: [
      ticket("A"),
      ticket("B", { blocked_by: ["A"] }),
      ticket("C", { blocked_by: ["A"], serial: "api" }),
      ticket("D", { serial: "api" }),
      ticket("E"),
    ],
  } as Plan

  it("derives state from PRs and tagged sessions, with no ledger", () => {
    const w = world([])
    w.prs["eng-a"] = { number: 1, state: "MERGED", url: "u1" }
    w.prs["eng-d"] = { number: 4, state: "OPEN", url: "u4" }
    const { ready, tickets } = frontier(plan, new Set(["eng-e"]), new Set(), 3, w.deps)
    expect(ready.map((t) => t.id)).toEqual(["B"])
    expect(Object.fromEntries(tickets.map((t) => [t.id, t.state]))).toEqual({
      A: "done", B: "ready", C: "held", D: "running", E: "running",
    })
  })

  it("counts a merged PR as done even after its session is gone", () => {
    const w = world([])
    w.branches.add("eng-a")
    w.prs["eng-a"] = { number: 1, state: "MERGED", url: "u1" }
    expect(frontier(plan, new Set(), new Set(), 3, w.deps).tickets[0].state).toBe("done")
  })

  it("stops a ticket whose session failed before opening a PR, and holds an orphan branch", () => {
    const w = world([])
    w.branches.add("eng-e")
    const { tickets } = frontier(plan, new Set(), new Set(["eng-a"]), 3, w.deps)
    expect(tickets.find((t) => t.id === "A")!.state).toBe("stopped")
    expect(tickets.find((t) => t.id === "E")!.state).toBe("held")
  })
})

describe("frontier cloud rules", () => {
  it("never launches a commit-level ticket in the cloud, and says why", () => {
    const w = world([])
    const p = { tickets: [ticket("A", { autonomy: "commit" }), ticket("B", { blocked_by: ["A"] })] } as Plan
    const { ready, tickets } = frontier(p, new Set(), new Set(), 3, w.deps)
    expect(ready).toEqual([])
    expect(tickets[0].why).toContain("autonomy commit can't run in the cloud")
    expect(tickets[1].state).toBe("blocked")
  })

  it("treats a renamed branch as a fresh attempt", () => {
    const w = world([])
    const p = { tickets: [ticket("A", { branch: "eng-a-2" })] } as Plan
    expect(frontier(p, new Set(), new Set(["eng-a"]), 3, w.deps).ready.map((t) => t.id)).toEqual(["A"])
  })
})

describe("plan branch", () => {
  const sh = (cmd: string, cwd: string) => {
    const out = Bun.spawnSync(["sh", "-c", cmd], { cwd, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } })
    if (out.exitCode !== 0) throw new Error(out.stderr.toString())
    return out.stdout.toString().trim()
  }

  it("publishes as fast-forward commits and pulls into another clone", () => {
    const root = mkdtempSync(join(tmpdir(), "planbranch-"))
    sh("git init -q --bare origin.git && git clone -q origin.git a && git clone -q origin.git b", root)
    const a = join(root, "a")
    const b = join(root, "b")
    const cwd = process.cwd()
    const env = { ...process.env }
    Object.assign(process.env, { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" })
    try {
      process.chdir(a)
      writeFileSync("plan.json", JSON.stringify({ tickets: [ticket("A")] }))
      expect(publishPlan("plan.json")).toMatch(/^published [0-9a-f]{7} to factory\/plan$/)
      expect(publishPlan("plan.json")).toBe("factory/plan already holds this plan")
      writeFileSync("plan.json", JSON.stringify({ tickets: [ticket("A"), ticket("B")] }))
      publishPlan("plan.json")
      expect(sh("git --git-dir=../origin.git rev-list --count factory/plan", a)).toBe("2")

      process.chdir(b)
      expect(pullPlan("plan.json")).toMatch(/^pulled [0-9a-f]{7} from factory\/plan$/)
      expect(JSON.parse(readFileSync("plan.json", "utf8")).tickets.map((t: { id: string }) => t.id)).toEqual(["A", "B"])
    } finally {
      process.chdir(cwd)
      process.env = env
    }
  })

  it("refuses to publish a broken plan", () => {
    const dir = mkdtempSync(join(tmpdir(), "planbad-"))
    const path = join(dir, "plan.json")
    writeFileSync(path, JSON.stringify({ tickets: [ticket("A", { blocked_by: ["Z"] })] }))
    expect(() => publishPlan(path)).toThrow("blocker `Z` is not in the plan")
  })
})

describe("claim and concurrent publishes", () => {
  const ids = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" }
  function clones() {
    const root = mkdtempSync(join(tmpdir(), "claim-"))
    const out = Bun.spawnSync(["sh", "-c", "git init -q --bare origin.git && git clone -q origin.git a && git clone -q origin.git b"], { cwd: root })
    if (out.exitCode !== 0) throw new Error(out.stderr.toString())
    return { a: join(root, "a"), b: join(root, "b") }
  }
  function inDir<T>(dir: string, fn: () => T): T {
    const cwd = process.cwd()
    const env = { ...process.env }
    Object.assign(process.env, ids)
    process.chdir(dir)
    try {
      return fn()
    } finally {
      process.chdir(cwd)
      process.env = env
    }
  }

  it("lets exactly one of two firings claim a ticket", () => {
    const { a, b } = clones()
    expect(inDir(a, () => claim("eng-12"))).toBe(true)
    expect(inDir(b, () => claim("eng-12"))).toBe(false)
    expect(inDir(b, () => claim("eng-12-2"))).toBe(true)
  })

  it("rejects a publish built on a plan someone else has since replaced", () => {
    const { a, b } = clones()
    inDir(a, () => {
      writeFileSync("plan.json", JSON.stringify({ tickets: [ticket("A")] }))
      publishPlan("plan.json")
    })
    inDir(b, () => pullPlan("plan.json"))
    inDir(a, () => {
      writeFileSync("plan.json", JSON.stringify({ tickets: [ticket("A"), ticket("B")] }))
      publishPlan("plan.json")
    })
    inDir(b, () => {
      writeFileSync("plan.json", JSON.stringify({ tickets: [ticket("A"), ticket("C")] }))
      expect(() => publishPlan("plan.json")).toThrow("moved since you pulled it")
      pullPlan("plan.json")
      expect(JSON.parse(readFileSync("plan.json", "utf8")).tickets.map((t: { id: string }) => t.id)).toEqual(["A", "B"])
    })
  })

  it("fails a pull when the branch holds no plan.json", () => {
    const { a, b } = clones()
    inDir(a, () => {
      const tree = Bun.spawnSync(["git", "mktree"], { stdin: new TextEncoder().encode("") }).stdout.toString().trim()
      const commit = Bun.spawnSync(["git", "commit-tree", tree, "-m", "empty"], { env: { ...process.env, ...ids } }).stdout.toString().trim()
      Bun.spawnSync(["git", "push", "-q", "origin", `${commit}:refs/heads/factory/plan`])
    })
    expect(() => inDir(b, () => pullPlan("plan.json"))).toThrow("holds no plan.json")
  })
})

