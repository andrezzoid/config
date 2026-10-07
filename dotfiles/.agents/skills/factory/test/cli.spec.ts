// End to end: the real CLI as a subprocess, a fake `gh`, and a mock Linear.

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import { expectedSkills } from "../scripts/cli.ts";
import { patchKey, renderMarker } from "../scripts/pr.ts";
import { claimBody } from "../scripts/tickets.ts";
import { expect } from "./expect.ts";
import { githubIssue, linearIssue } from "./fixtures.ts";

const CLI = join(import.meta.dirname, "..", "scripts", "cli.ts");
const FAKE_GH = join(import.meta.dirname, "fake-gh.ts");
const SHA = "c".repeat(40);
const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-export const a = 1;
+export const a = 2;
`;

type LinearCall = { op: string; variables: any; auth: string | undefined };
let linearCalls: LinearCall[] = [];
let linearIssues: any[] = [];
let issueComments: any[] = [];

function answer(op: string, variables: any): { status: number; body: unknown } {
  const data = (d: unknown) => ({ status: 200, body: { data: d } });
  switch (op) {
    case "FactoryReady":
      return data({ issues: { nodes: linearIssues } });
    case "FactoryIssue": {
      const found = linearIssues.find((i) => i.identifier === variables.id);
      return data({ issue: found ? { ...found, comments: { nodes: issueComments } } : null });
    }
    case "FactoryViewer":
      return data({ viewer: { id: "me", name: "André" } });
    case "FactoryTeamStates":
      return data({ team: { states: { nodes: [
        { id: "s-todo", type: "unstarted", position: 1 },
        { id: "s-review", type: "started", position: 3 },
        { id: "s-doing", type: "started", position: 2 },
      ] } } });
    case "FactoryUpdate":
      return data({ issueUpdate: { success: true } });
    case "FactoryComment": {
      const id = `mine-${issueComments.length}`;
      issueComments.push({ id, body: variables.body, createdAt: new Date().toISOString(), user: { name: "André" } });
      return data({ commentCreate: { success: true, comment: { id } } });
    }
    case "FactoryBrief":
      return data({ mine: { nodes: linearIssues }, queued: { nodes: linearIssues } });
    case "FactoryDeleteComment":
      issueComments = issueComments.filter((c) => c.id !== variables.id);
      return data({ commentDelete: { success: true } });
    case "FactoryLabel":
      return data({ issueLabels: { nodes: [{ id: "lbl-human", name: variables.name, team: null }] } });
    case "FactoryRemoveLabel":
      return data({ issueRemoveLabel: { success: true } });
    case "FactoryAddLabel":
      return data({ issueAddLabel: { success: true } });
    default:
      return { status: 400, body: { errors: [{ message: `unexpected ${op}` }] } };
  }
}

const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const { query, variables } = JSON.parse(raw);
    const op = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "?";
    linearCalls.push({ op, variables, auth: req.headers.authorization });
    const { status, body } = answer(op, variables);
    res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  });
});
let linearUrl = "";
before(async () => {
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  linearUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/graphql`;
});
after(() => server.close());

let dir: string;
function routes(over: Record<string, unknown> = {}) {
  const profile = Buffer.from("- **Max autonomy:** `merge`\n\n## One-way doors\n\n- `db/**`\n").toString("base64");
  const all = {
    "GET repos/o/r/pulls/7": {
      number: 7, html_url: "https://github.com/o/r/pull/7", title: "App: thing", state: "open", merged: false,
      draft: false, mergeable: true, mergeable_state: "clean",
      head: { sha: SHA, ref: "andre/eng-1-thing" }, base: { ref: "main" },
    },
    [`GET repos/o/r/commits/${SHA}/check-runs`]: { check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success" }] },
    [`GET repos/o/r/commits/${SHA}/status`]: { state: "success", statuses: [] },
    "GET repos/o/r/pulls/7/reviews": [],
    "GET repos/o/r/issues/7/comments": [],
    "GET repos/o/r/pulls/7/files": [{ filename: "src/a.ts" }],
    "GET repos/o/r/contents/.agents/factory.md": { encoding: "base64", content: profile },
    "GET repos/o/r/contents/.claude/skills": [{ name: "verify", type: "dir" }, { name: "run-app", type: "dir" }],
    "GET repos/o/r/contents/.claude/skills/run-app/SKILL.md": { encoding: "base64", content: Buffer.from("# run").toString("base64") },
    "GET user": { login: "andrezzoid" },
    "GRAPHQL": { data: { repository: { pullRequest: { reviewThreads: { nodes: [{ isResolved: true }] } } } } },
    "DIFF repos/o/r/pulls/7": DIFF,
    "PUT repos/o/r/pulls/7/merge": { merged: true },
    "POST repos/o/r/issues/7/comments": { id: 1 },
    ...over,
  };
  writeFileSync(join(dir, "routes.json"), JSON.stringify(all));
}

function ghCalls(): { args: string[]; stdin: string | null }[] {
  try {
    return readFileSync(join(dir, "calls.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

const sent = (method: string, path: string) =>
  ghCalls().filter((c) => c.args[1] === path && c.args.includes(method)).map((c) => JSON.parse(c.stdin ?? "null"));

// Async on purpose: the mock Linear answers from this same process. Runs in
// a scratch folder unless told otherwise, so no real clone leaks in.
function run(args: string[], env: Record<string, string> = {}, cwd = dir): Promise<{ out: string; err: string; code: number }> {
  const p = spawn(process.execPath, [CLI, ...args], {
    cwd,
    env: {
      ...process.env,
      FACTORY_GH: FAKE_GH,
      FAKE_GH_DIR: dir,
      FACTORY_LINEAR_URL: linearUrl,
      LINEAR_API_KEY: "lin_api_test",
      FACTORY_GITHUB_REPOS: "",
      CLAUDE_CODE_REMOTE: "",
      ...env,
    },
  });
  let out = "";
  let err = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (err += d));
  return new Promise((ok) => p.on("close", (code) => ok({ out, err, code: code ?? 1 })));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "factory-cli-"));
  linearCalls = [];
  issueComments = [];
  linearIssues = [linearIssue({ identifier: "ENG-1", labels: ["ready-for-agent", "autonomy:merge"] })];
  routes();
});

// Stow installs the skill behind symlinks; bin/factory resolves them, but
// anything that starts cli.ts directly must not silently do nothing.
test("cli.ts runs when started through a symlink", () => {
  const link = join(mkdtempSync(join(tmpdir(), "factory-link-")), "cli.ts");
  symlinkSync(CLI, link);
  const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", link, "--help"], { encoding: "utf8" });
  expect(r.stdout).toContain("factory:");
});

describe("pr status", () => {
  test("READY with exit 0, profile read from the base branch", async () => {
    const r = await run(["pr", "status", "7", "--repo", "o/r", "--json"]);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    const s = JSON.parse(r.out);
    expect(s.verdict).toBe("READY");
    expect(s.unresolvedThreads).toBe(0);
    expect(ghCalls().some((c) => c.args[1] === "repos/o/r/contents/.agents/factory.md?ref=main")).toBe(true);
  });

  test("cloud sessions read review threads from the ccr route", async () => {
    routes({ "GET repos/o/r/pulls/7/ccr/review_threads": [{ is_resolved: false }], GRAPHQL: undefined });
    const r = await run(["pr", "status", "7", "--repo", "o/r", "--json"], { CLAUDE_CODE_REMOTE: "true" });
    expect(r.code).toBe(3);
    expect(JSON.parse(r.out).verdict).toBe("THREADS");
  });

  test("a failing check exits 4 and names the check", async () => {
    routes({ [`GET repos/o/r/commits/${SHA}/check-runs`]: { check_runs: [{ id: 1, name: "lint", status: "completed", conclusion: "failure" }] } });
    const r = await run(["pr", "status", "7", "--repo", "o/r"]);
    expect(r.code).toBe(4);
    expect(r.out).toContain("failing: lint");
  });
});

describe("pr merge", () => {
  test("refuses without a verdict and never calls the merge endpoint", async () => {
    const r = await run(["pr", "merge", "7", "--repo", "o/r"]);
    expect(r.code).toBe(3);
    expect(r.out).toContain("no passing verdict");
    expect(ghCalls().some((c) => c.args.includes("PUT"))).toBe(false);
  });

  test("a forged marker from another login does not unlock the merge", async () => {
    routes({ "GET repos/o/r/issues/7/comments": [{ body: renderMarker(SHA, null, "pass"), user: { login: "mallory" } }] });
    const r = await run(["pr", "merge", "7", "--repo", "o/r"]);
    expect(r.code).toBe(3);
  });

  test("merges with the head SHA pinned when every condition holds", async () => {
    routes({ "GET repos/o/r/issues/7/comments": [{ body: renderMarker(SHA, null, "pass"), user: { login: "andrezzoid" } }] });
    const r = await run(["pr", "merge", "7", "--repo", "o/r"]);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(sent("PUT", "repos/o/r/pulls/7/merge")).toEqual([{ merge_method: "squash", sha: SHA }]);
    expect(linearCalls.find((c) => c.op === "FactoryIssue")?.variables).toEqual({ id: "ENG-1" });
  });

  test("a GitHub issue's autonomy label comes from the issue the branch names", async () => {
    routes({
      "GET repos/o/r/pulls/7": {
        number: 7, html_url: "https://github.com/o/r/pull/7", title: "Thing", state: "open", merged: false,
        draft: false, mergeable: true, mergeable_state: "clean", head: { sha: SHA, ref: "issue-12-thing" }, base: { ref: "main" },
      },
      "GET repos/o/r/issues/7/comments": [{ body: renderMarker(SHA, null, "pass"), user: { login: "andrezzoid" } }],
      "GET repos/o/r/issues/12": githubIssue({ labels: ["in-progress", "autonomy:merge"] }),
      "GET repos/o/r/issues/12/comments": [],
    });
    const r = await run(["pr", "merge", "7", "--repo", "o/r"]);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(linearCalls).toEqual([]);
  });

  test("a ticket the PR does not name lends it no autonomy", async () => {
    routes({ "GET repos/o/r/issues/7/comments": [{ body: renderMarker(SHA, null, "pass"), user: { login: "andrezzoid" } }] });
    linearIssues.push(linearIssue({ id: "u9", identifier: "ENG-9", labels: ["autonomy:merge"] }));
    const r = await run(["pr", "merge", "7", "--repo", "o/r", "--ticket", "ENG-9"]);
    expect(r.code).toBe(3);
    expect(r.err).toContain("does not name ENG-9");
    expect(ghCalls().some((c) => c.args.includes("PUT"))).toBe(false);
  });

  test("a Closes line in the PR body names its ticket", async () => {
    routes({
      "GET repos/o/r/pulls/7": {
        number: 7, html_url: "https://github.com/o/r/pull/7", title: "Thing", state: "open", merged: false, body: "Does it.\n\nCloses ENG-1",
        draft: false, mergeable: true, mergeable_state: "clean", head: { sha: SHA, ref: "feature-x" }, base: { ref: "main" },
      },
      "GET repos/o/r/issues/7/comments": [{ body: renderMarker(SHA, null, "pass"), user: { login: "andrezzoid" } }],
    });
    expect((await run(["pr", "merge", "7", "--repo", "o/r"])).code).toBe(0);
  });

  test("without a run skill on the base branch, no self-merge", async () => {
    // A recorded /verify skill is not enough: agents cannot start /verify.
    routes({
      "GET repos/o/r/issues/7/comments": [{ body: renderMarker(SHA, null, "pass"), user: { login: "andrezzoid" } }],
      "GET repos/o/r/contents/.claude/skills": [{ name: "verify", type: "dir" }],
    });
    const r = await run(["pr", "merge", "7", "--repo", "o/r"]);
    expect(r.code).toBe(3);
    expect(r.out).toContain("no run skill");
    expect(ghCalls().some((c) => c.args[1] === "repos/o/r/contents/.claude/skills?ref=main")).toBe(true);
  });

  test("a run-* folder without a SKILL.md does not count", async () => {
    routes({
      "GET repos/o/r/issues/7/comments": [{ body: renderMarker(SHA, null, "pass"), user: { login: "andrezzoid" } }],
      "GET repos/o/r/contents/.claude/skills/run-app/SKILL.md": undefined,
    });
    const r = await run(["pr", "merge", "7", "--repo", "o/r"]);
    expect(r.code).toBe(3);
    expect(r.out).toContain("no run skill");
  });

  test("a switch before the PR number does not swallow it", async () => {
    routes({ "GET repos/o/r/pulls/7/files": [{ filename: "db/schema.sql" }] });
    const r = await run(["pr", "merge", "--human-approved", "7", "--repo", "o/r"]);
    expect(r.code).toBe(0);
    expect(ghCalls().some((c) => c.args.includes("repos/o/r/pulls/7/merge"))).toBe(true);
  });

  test("moving a file out of a one-way door still touches the door", async () => {
    routes({
      "GET repos/o/r/issues/7/comments": [{ body: renderMarker(SHA, null, "pass"), user: { login: "andrezzoid" } }],
      "GET repos/o/r/pulls/7/files": [{ filename: "archive/0042.sql", previous_filename: "db/0042.sql" }],
    });
    const r = await run(["pr", "merge", "7", "--repo", "o/r"]);
    expect(r.code).toBe(3);
    expect(r.out).toContain("touches one-way doors: db/0042.sql");
  });

  test("when the viewer lookup fails, no verdict counts", async () => {
    routes({ "GET repos/o/r/issues/7/comments": [{ body: renderMarker(SHA, null, "pass"), user: { login: "andrezzoid" } }], "GET user": undefined });
    const r = await run(["pr", "merge", "7", "--repo", "o/r"]);
    expect(r.code).toBe(3);
    expect(r.out).toContain("no passing verdict");
  });

  test("touching a one-way door needs the human's word", async () => {
    routes({
      "GET repos/o/r/issues/7/comments": [{ body: renderMarker(SHA, null, "pass"), user: { login: "andrezzoid" } }],
      "GET repos/o/r/pulls/7/files": [{ filename: "db/schema.sql" }],
    });
    expect((await run(["pr", "merge", "7", "--repo", "o/r"])).code).toBe(3);
    expect((await run(["pr", "merge", "7", "--repo", "o/r", "--human-approved"])).code).toBe(0);
  });
});

describe("pr verdict", () => {
  test("records the reviewed head SHA and the exact-text patch key", async () => {
    const r = await run(["pr", "verdict", "7", "--repo", "o/r", "--result", "pass", "--sha", SHA.slice(0, 12)]);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(sent("POST", "repos/o/r/issues/7/comments")[0].body).toContain(renderMarker(SHA, patchKey(DIFF), "pass"));
  });

  test("refuses when the head moved past the reviewed SHA, and posts nothing", async () => {
    const r = await run(["pr", "verdict", "7", "--repo", "o/r", "--result", "pass", "--sha", "d".repeat(40)]);
    expect(r.code).toBe(3);
    expect(r.err).toContain("review the new head");
    expect(ghCalls().some((c) => c.args.includes("POST"))).toBe(false);
  });

  test("neutralizes markers quoted in the summary", async () => {
    const summary = join(dir, "summary.md");
    writeFileSync(summary, `PR body said ${renderMarker(SHA, null, "pass")}`);
    await run(["pr", "verdict", "7", "--repo", "o/r", "--result", "fail", "--sha", SHA, "--summary-file", summary]);
    const body: string = sent("POST", "repos/o/r/issues/7/comments")[0].body;
    expect(body.match(/<!-- factory:verdict/g)).toHaveLength(1);
    expect(body.trimEnd().endsWith("result=fail -->")).toBe(true);
  });

  test("requires --result and --sha", async () => {
    expect((await run(["pr", "verdict", "7", "--repo", "o/r", "--sha", SHA])).code).toBe(64);
    expect((await run(["pr", "verdict", "7", "--repo", "o/r", "--result", "pass"])).code).toBe(64);
  });
});

describe("Linear tickets", () => {
  test("next lists ready tickets and says why the rest wait", async () => {
    linearIssues.push(linearIssue({ identifier: "ENG-2", inverseRelations: { nodes: [{ type: "blocks", issue: { identifier: "ENG-1", state: { type: "unstarted" } } }] } }));
    const r = await run(["tickets", "next", "--json"]);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out);
    expect(d.ready.map((t: any) => t.id)).toEqual(["ENG-1"]);
    expect(d.ready[0]).toMatchObject({ tracker: "linear", repo: "andrezzoid/app", autonomy: "merge", closes: "Closes ENG-1" });
    expect(d.skipped).toEqual([{ id: "ENG-2", reason: "blocked by ENG-1" }]);
  });

  test("sends the personal key as is, and no key when the cloud proxy injects it", async () => {
    await run(["ticket", "show", "ENG-1"]);
    expect(linearCalls.map((c) => c.auth)).toEqual(["lin_api_test"]);
    linearCalls = [];
    const r = await run(["ticket", "show", "ENG-1"], { LINEAR_API_KEY: "proxy-injected" });
    expect(r.code).toBe(0);
    expect(linearCalls.map((c) => c.auth)).toEqual([undefined]);
  });

  test("claim assigns, moves to the first started state, and comments", async () => {
    const r = await run(["ticket", "claim", "eng-1"]);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(linearCalls.find((c) => c.op === "FactoryUpdate")?.variables.input).toEqual({ assigneeId: "me", stateId: "s-doing" });
    expect(issueComments[0].body).toContain("<!-- factory:claim -->");
  });

  test("a claim that lost the race withdraws its comment", async () => {
    issueComments.push({ id: "theirs", body: claimBody(null, "local"), createdAt: new Date(Date.now() - 1000).toISOString(), user: null });
    const r = await run(["ticket", "claim", "ENG-1"]);
    expect(r.code).toBe(3);
    expect(linearCalls.find((c) => c.op === "FactoryDeleteComment")?.variables).toEqual({ id: "mine-1" });
  });

  test("after a handback, the old claim is gone and a new claim wins", async () => {
    issueComments.push({ id: "old-claim", body: claimBody(null, "cloud"), createdAt: "2026-09-01T10:00:00Z", user: null });
    const brief = join(dir, "brief.md");
    writeFileSync(brief, "**Handed back · acceptance line 2 cannot hold**");
    const h = await run(["ticket", "handback", "ENG-1", "--brief-file", brief]);
    expect(h.err).toBe("");
    expect(h.code).toBe(0);
    expect(issueComments.some((c) => c.id === "old-claim")).toBe(false);
    expect(linearCalls.find((c) => c.op === "FactoryAddLabel")?.variables).toEqual({ id: "uuid-1", labelId: "lbl-human" });
    expect(linearCalls.find((c) => c.op === "FactoryUpdate")?.variables.input).toEqual({ stateId: "s-todo" });
    expect((await run(["ticket", "claim", "ENG-1"])).code).toBe(0);
  });

  test("a stale claim from an earlier attempt does not block a new one", async () => {
    issueComments.push({ id: "stale", body: claimBody(null, "cloud"), createdAt: "2026-09-01T10:00:00Z", user: null });
    expect((await run(["ticket", "claim", "ENG-1"])).code).toBe(0);
  });

  test("claim refuses a ticket already in progress", async () => {
    linearIssues = [linearIssue({ identifier: "ENG-1", state: { name: "In Progress", type: "started" } })];
    const r = await run(["ticket", "claim", "ENG-1"]);
    expect(r.code).toBe(3);
    expect(linearCalls.some((c) => c.op === "FactoryUpdate")).toBe(false);
  });
});

describe("GitHub Issues tickets", () => {
  const gh = { FACTORY_GITHUB_REPOS: "O/R", LINEAR_API_KEY: "" };

  beforeEach(() => {
    linearIssues = [];
    routes({
      "GET repos/o/r/issues?state=open&labels=ready-for-agent": [
        githubIssue({ number: 12, labels: ["ready-for-agent", "autonomy:merge"] }),
        githubIssue({ number: 13, title: "Second", body: "Blocked by: #12" }),
        { ...githubIssue({ number: 14 }), pull_request: { url: "x" } },
        githubIssue({ number: 15, title: "Parent" }),
      ],
      "GET repos/o/r/issues/12/dependencies/blocked_by": [],
      "GET repos/o/r/issues/12/sub_issues": [],
      "GET repos/o/r/issues/13/sub_issues": [{ number: 20, state: "closed" }],
      "GET repos/o/r/issues/15/sub_issues": [{ number: 21, state: "open" }, { number: 22, state: "closed" }],
      "GET repos/o/r/issues/12": githubIssue({ number: 12, labels: ["ready-for-agent", "autonomy:merge"] }),
      "GET repos/o/r/issues/12/comments": [],
      "POST repos/o/r/issues/12/comments": "$append",
      "DELETE repos/o/r/issues/comments/:id": "$delete",
      "POST repos/o/r/issues/12/assignees": {},
      "POST repos/o/r/issues/12/labels": [],
      "DELETE repos/o/r/issues/12/labels/ready-for-agent": [],
    });
  });

  test("next reads the repos in FACTORY_GITHUB_REPOS and honours Blocked by lines", async () => {
    const r = await run(["tickets", "next", "--json"], gh);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out);
    expect(d.ready.map((t: any) => t.id)).toEqual(["o/r#12"]);
    expect(d.ready[0]).toMatchObject({ tracker: "github", repo: "o/r", status: "queued", autonomy: "merge", branchName: "issue-12-app-do-the-thing", closes: "Closes #12" });
    expect(d.skipped).toEqual([
      { id: "o/r#13", reason: "blocked by o/r#12" },
      { id: "o/r#15", reason: "parent of 1 open ticket(s)" },
    ]);
  });

  test("a repo whose profile names GitHub joins without FACTORY_GITHUB_REPOS", async () => {
    const profile = Buffer.from("- **Tracker:** GitHub Issues\n").toString("base64");
    routes({
      "GET repos/o/r/contents/.agents/factory.md": { encoding: "base64", content: profile },
      "GET repos/o/r/issues?state=open&labels=ready-for-agent": [githubIssue({ number: 12 })],
      "GET repos/o/r/issues/12/dependencies/blocked_by": [],
    });
    const r = await run(["tickets", "next", "--repo", "o/r", "--json"], { LINEAR_API_KEY: "" });
    expect(r.err).toBe("");
    expect(JSON.parse(r.out).ready.map((t: any) => t.id)).toEqual(["o/r#12"]);
  });

  test("inside a clone whose profile names GitHub, doctor and brief use its issues", async () => {
    const clone = join(dir, "clone");
    spawnSync("git", ["init", "-q", clone]);
    spawnSync("git", ["-C", clone, "remote", "add", "origin", "https://github.com/o/r.git"]);
    routes({
      ...JSON.parse(readFileSync(join(dir, "routes.json"), "utf8")),
      "GET repos/o/r/contents/.agents/factory.md": { encoding: "base64", content: Buffer.from("- **Tracker:** GitHub Issues\n").toString("base64") },
      "GET repos/o/r/issues?state=open": [githubIssue({ number: 12 })],
      "GET repos/o/r/issues": [],
      "GET repos/o/r/pulls": [],
    });
    const env = { LINEAR_API_KEY: "", FACTORY_GITHUB_REPOS: "" };
    const doctor = await run(["doctor"], env, clone);
    expect(doctor.out).toContain("issues in o/r as andrezzoid");
    expect(doctor.out).not.toContain("trackers");
    const brief = await run(["brief", "--json"], env, clone);
    expect(brief.err).toBe("");
    expect(JSON.parse(brief.out).queued.ready.map((t: any) => t.id)).toEqual(["o/r#12"]);
  });

  test("the brief counts a blocked GitHub ticket as waiting, as tickets next does", async () => {
    routes({
      ...JSON.parse(readFileSync(join(dir, "routes.json"), "utf8")),
      "GET repos/o/r/issues?state=open": [githubIssue({ number: 12 }), githubIssue({ number: 13, body: "Blocked by: #12" })],
      "GET repos/o/r/issues": [],
      "GET repos/o/r/pulls": [],
    });
    const d = JSON.parse((await run(["brief", "--json"], gh)).out);
    expect(d.queued.ready.map((t: any) => t.id)).toEqual(["o/r#12"]);
    expect(d.queued.waiting).toEqual([{ id: "o/r#13", reason: "blocked by o/r#12" }]);
  });

  test("claim assigns the viewer, labels in-progress and comments", async () => {
    const r = await run(["ticket", "claim", "#12", "--repo", "o/r"], gh);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(sent("POST", "repos/o/r/issues/12/assignees")).toEqual([{ assignees: ["andrezzoid"] }]);
    expect(sent("POST", "repos/o/r/issues/12/labels")).toEqual([{ labels: ["in-progress"] }]);
    expect(sent("POST", "repos/o/r/issues/12/comments")[0].body).toContain("<!-- factory:claim -->");
  });

  test("a claim that lost the race deletes its own comment", async () => {
    routes({
      ...JSON.parse(readFileSync(join(dir, "routes.json"), "utf8")),
      "GET repos/o/r/issues/12/comments": [{ id: 1, body: claimBody(null, "cloud"), created_at: new Date(Date.now() - 1000).toISOString() }],
    });
    const r = await run(["ticket", "claim", "o/r#12"], gh);
    expect(r.code).toBe(3);
    expect(ghCalls().filter((c) => c.args.includes("DELETE")).map((c) => c.args[1])).toEqual(["repos/o/r/issues/comments/9001"]);
  });

  test("handback comments the brief, drops the claim and relabels for a human", async () => {
    routes({
      ...JSON.parse(readFileSync(join(dir, "routes.json"), "utf8")),
      "GET repos/o/r/issues/12/comments": [{ id: 1, body: claimBody(null, "cloud"), created_at: "2026-10-01T00:00:00Z" }],
    });
    const brief = join(dir, "brief.md");
    writeFileSync(brief, "Handed back: acceptance line 2 cannot hold");
    const r = await run(["ticket", "handback", "#12", "--repo", "o/r", "--brief-file", brief], gh);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    const deleted = ghCalls().filter((c) => c.args.includes("DELETE")).map((c) => c.args[1]);
    expect(deleted).toContain("repos/o/r/issues/comments/1");
    expect(deleted).toContain("repos/o/r/issues/12/labels/ready-for-agent");
    expect(sent("POST", "repos/o/r/issues/12/labels")).toEqual([{ labels: ["ready-for-human"] }]);
    expect(sent("POST", "repos/o/r/issues/12/comments")[0].body).toBe("Handed back: acceptance line 2 cannot hold");
  });

  test("brief maps open PRs to the issues they close", async () => {
    const old = new Date(Date.now() - 5 * 3600_000).toISOString();
    routes({
      "GET user": { login: "andrezzoid" },
      "GET repos/o/r/pulls": [{ html_url: "https://github.com/o/r/pull/7", body: "Closes #12", head: { ref: "x" } }],
      "GET repos/o/r/issues?state=open": [
        githubIssue({ number: 12, title: "Running", labels: ["in-progress"] }),
        githubIssue({ number: 13, title: "Stuck", labels: ["in-progress"], updated_at: old }),
        githubIssue({ number: 15, title: "Untracked", labels: ["bug"] }),
      ],
      "GET repos/o/r/issues": [githubIssue({ number: 11, title: "Shipped", state: "closed", labels: ["in-progress"], closed_at: new Date().toISOString() })],
    });
    const r = await run(["brief", "--json"], gh);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out);
    expect(d.running.map((t: any) => [t.id, t.prs.map((p: any) => p.url)])).toEqual([
      ["o/r#12", ["https://github.com/o/r/pull/7"]],
      ["o/r#13", []],
    ]);
    expect(d.stalled.map((t: any) => t.id)).toEqual(["o/r#13"]);
    expect(d.landed.map((t: any) => t.id)).toEqual(["o/r#11"]);
  });
});

describe("brief", () => {
  test("puts handed-back and stalled tickets under Needs you", async () => {
    const old = new Date(Date.now() - 5 * 3600_000).toISOString();
    linearIssues = [
      linearIssue({ identifier: "ENG-1", labels: ["ready-for-agent"] }),
      linearIssue({ id: "u2", identifier: "ENG-2", title: "Stuck", labels: [], state: { name: "In Progress", type: "started" }, updatedAt: old }),
      linearIssue({ id: "u3", identifier: "ENG-3", title: "Bounced", labels: ["ready-for-human"] }),
      linearIssue({ id: "u4", identifier: "ENG-4", title: "Shipped", labels: [], state: { name: "Done", type: "completed" }, completedAt: new Date().toISOString() }),
    ];
    const r = await run(["brief"]);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    const needsYou = r.out.split("## Running")[0];
    expect(needsYou).toContain("ENG-3 Bounced: handed back");
    expect(needsYou).toContain("ENG-2 Stuck: stalled");
    expect(r.out).toContain("## Queued (1 ready");
    expect(r.out).toContain("## Landed this week (1)");
  });

  test("with no tracker configured, says how to configure one", async () => {
    const r = await run(["brief"], { LINEAR_API_KEY: "", PATH: "/nonexistent" });
    expect(r.code).toBe(1);
    expect(r.err).toContain("FACTORY_GITHUB_REPOS");
  });
});

test("unknown commands print help and exit 64", async () => {
  const r = await run(["frobnicate"]);
  expect(r.code).toBe(64);
  expect(r.out).toContain("factory doctor");
});

test("doctor expects every skill folder next to factory", () => {
  const skills = expectedSkills(join(import.meta.dirname, "..", ".."));
  for (const s of ["factory", "implement", "grilling", "correct", "setup-factory"]) expect(skills).toContain(s);
  expect(skills).not.toContain("rem-cli");
});
