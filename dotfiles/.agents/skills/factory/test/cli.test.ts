// End to end: the real CLI as a subprocess, a fake `gh`, and a mock Linear.

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { patchKey, renderMarker } from "../src/pr";
import { claimBody } from "../src/tickets";
import { issue } from "./fixtures";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");
const FAKE_GH = join(import.meta.dir, "fake-gh.ts");
chmodSync(FAKE_GH, 0o755);
const SHA = "c".repeat(40);
const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-export const a = 1;
+export const a = 2;
`;

type LinearCall = { op: string; variables: any };
let linearCalls: LinearCall[] = [];
let linearIssues: any[] = [];
let issueComments: any[] = [];

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const { query, variables } = (await req.json()) as any;
    const op = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "?";
    linearCalls.push({ op, variables });
    const reply = (data: unknown) => Response.json({ data });
    switch (op) {
      case "FactoryReady":
        return reply({ issues: { nodes: linearIssues } });
      case "FactoryIssue": {
        const found = linearIssues.find((i) => i.identifier === variables.id);
        return reply({ issue: found ? { ...found, comments: { nodes: issueComments } } : null });
      }
      case "FactoryViewer":
        return reply({ viewer: { id: "me", name: "André" } });
      case "FactoryTeamStates":
        return reply({ team: { states: { nodes: [
          { id: "s-todo", type: "unstarted", position: 1 },
          { id: "s-review", type: "started", position: 3 },
          { id: "s-doing", type: "started", position: 2 },
        ] } } });
      case "FactoryUpdate":
        return reply({ issueUpdate: { success: true } });
      case "FactoryComment": {
        const id = `mine-${issueComments.length}`;
        issueComments.push({ id, body: variables.body, createdAt: "2026-10-05T12:00:00Z", user: { name: "André" } });
        return reply({ commentCreate: { success: true, comment: { id } } });
      }
      case "FactoryBrief":
        return reply({ mine: { nodes: linearIssues }, queued: { nodes: linearIssues } });
      case "FactoryDeleteComment":
        issueComments = issueComments.filter((c) => c.id !== variables.id);
        return reply({ commentDelete: { success: true } });
      case "FactoryLabel":
        return reply({ issueLabels: { nodes: [{ id: "lbl-human", name: variables.name, team: null }] } });
      case "FactoryRemoveLabel":
        return reply({ issueRemoveLabel: { success: true } });
      case "FactoryAddLabel":
        return reply({ issueAddLabel: { success: true } });
      default:
        return Response.json({ errors: [{ message: `unexpected ${op}` }] }, { status: 400 });
    }
  },
});
afterAll(() => server.stop(true));

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
    "GET repos/o/r/contents/docs/agents/factory.md": { encoding: "base64", content: profile },
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

async function run(args: string[], env: Record<string, string> = {}) {
  const p = Bun.spawn(["bun", CLI, ...args], {
    env: {
      ...process.env,
      FACTORY_GH: FAKE_GH,
      FAKE_GH_DIR: dir,
      FACTORY_LINEAR_URL: `http://localhost:${server.port}/graphql`,
      LINEAR_API_KEY: "lin_api_test",
      CLAUDE_CODE_REMOTE: "",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { out, err, code };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "factory-cli-"));
  linearCalls = [];
  issueComments = [];
  linearIssues = [issue({ identifier: "ENG-1", labels: ["ready-for-agent", "autonomy:merge"] })];
  routes();
});

describe("pr status", () => {
  test("READY with exit 0, profile read from the base branch", async () => {
    const r = await run(["pr", "status", "7", "--repo", "o/r", "--json"]);
    expect(r.code).toBe(0);
    const s = JSON.parse(r.out);
    expect(s.verdict).toBe("READY");
    expect(s.unresolvedThreads).toBe(0);
    expect(ghCalls().some((c) => c.args[1] === "repos/o/r/contents/docs/agents/factory.md?ref=main")).toBe(true);
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
    const put = ghCalls().find((c) => c.args.includes("PUT"))!;
    expect(JSON.parse(put.stdin!)).toEqual({ merge_method: "squash", sha: SHA });
    expect(linearCalls.find((c) => c.op === "FactoryIssue")?.variables).toEqual({ id: "ENG-1" });
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
    const post = ghCalls().find((c) => c.args.includes("POST"))!;
    expect(JSON.parse(post.stdin!).body).toContain(renderMarker(SHA, patchKey(DIFF), "pass"));
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
    const body: string = JSON.parse(ghCalls().find((c) => c.args.includes("POST"))!.stdin!).body;
    expect(body.match(/<!-- factory:verdict/g)).toHaveLength(1);
    expect(body.trimEnd().endsWith("result=fail -->")).toBe(true);
  });

  test("requires --result and --sha", async () => {
    expect((await run(["pr", "verdict", "7", "--repo", "o/r", "--sha", SHA])).code).toBe(64);
    expect((await run(["pr", "verdict", "7", "--repo", "o/r", "--result", "pass"])).code).toBe(64);
  });
});

describe("tickets", () => {
  test("next lists ready tickets and says why the rest wait", async () => {
    linearIssues.push(issue({ identifier: "ENG-2", inverseRelations: { nodes: [{ type: "blocks", issue: { identifier: "ENG-1", state: { type: "unstarted" } } }] } }));
    const r = await run(["tickets", "next", "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out);
    expect(d.ready.map((t: any) => t.identifier)).toEqual(["ENG-1"]);
    expect(d.ready[0]).toMatchObject({ repo: "andrezzoid/app", autonomy: "merge" });
    expect(d.skipped).toEqual([{ identifier: "ENG-2", reason: "blocked by ENG-1" }]);
  });

  test("claim assigns, moves to the first started state, and comments", async () => {
    const r = await run(["ticket", "claim", "ENG-1"]);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(linearCalls.find((c) => c.op === "FactoryUpdate")?.variables.input).toEqual({ assigneeId: "me", stateId: "s-doing" });
    expect(issueComments[0].body).toContain("<!-- factory:claim -->");
  });

  test("a claim that lost the race withdraws its comment", async () => {
    issueComments.push({ id: "theirs", body: claimBody(null, "local"), createdAt: "2026-10-05T11:59:59Z", user: null });
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
    linearIssues = [issue({ identifier: "ENG-1", state: { name: "In Progress", type: "started" } })];
    const r = await run(["ticket", "claim", "ENG-1"]);
    expect(r.code).toBe(3);
    expect(linearCalls.some((c) => c.op === "FactoryUpdate")).toBe(false);
  });
});

describe("brief", () => {
  test("puts handed-back and stalled tickets under Needs you", async () => {
    const old = new Date(Date.now() - 5 * 3600_000).toISOString();
    linearIssues = [
      issue({ identifier: "ENG-1", labels: ["ready-for-agent"] }),
      issue({ id: "u2", identifier: "ENG-2", title: "Stuck", labels: [], state: { name: "In Progress", type: "started" }, updatedAt: old }),
      issue({ id: "u3", identifier: "ENG-3", title: "Bounced", labels: ["ready-for-human"] }),
      issue({ id: "u4", identifier: "ENG-4", title: "Shipped", labels: [], state: { name: "Done", type: "completed" }, completedAt: new Date().toISOString() }),
    ];
    const r = await run(["brief"]);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    const needsYou = r.out.split("## Running")[0];
    expect(needsYou).toContain("ENG-3 Bounced — handed back");
    expect(needsYou).toContain("ENG-2 Stuck — stalled");
    expect(r.out).toContain("## Queued (1 ready");
    expect(r.out).toContain("## Landed this week (1)");
  });
});

test("unknown commands print help and exit 64", async () => {
  const r = await run(["frobnicate"]);
  expect(r.code).toBe(64);
  expect(r.out).toContain("factory doctor");
});

describe("expectedSkills", () => {
  test("cloud leaves out the Mac-only skills, local keeps them", async () => {
    const { expectedSkills } = await import("../src/cli");
    const agents = join(import.meta.dir, "..", "..");
    expect(expectedSkills(agents, "cloud")).not.toContain("rem-cli");
    expect(expectedSkills(agents, "local")).toContain("rem-cli");
    expect(expectedSkills(agents, "cloud")).toContain("implement");
    expect(expectedSkills(agents, "cloud")).toContain("grilling");
    expect(expectedSkills(agents, "cloud")).toContain("correct");
    expect(expectedSkills(agents, "cloud")).toHaveLength(33);
  });
});
