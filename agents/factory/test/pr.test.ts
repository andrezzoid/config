import { describe, expect, test } from "bun:test";
import {
  classifyChecks,
  classifyReviews,
  decide,
  latestMarker,
  mergeGate,
  renderMarker,
  touchedOneWay,
  verification,
  type PrFacts,
} from "../src/pr";

const SHA = "a".repeat(40);

function facts(over: Partial<PrFacts> = {}): PrFacts {
  return {
    owner: "o",
    repo: "r",
    number: 7,
    url: "https://github.com/o/r/pull/7",
    title: "App: do the thing",
    state: "open",
    merged: false,
    draft: false,
    mergeable: true,
    mergeableState: "clean",
    headSha: SHA,
    headRef: "andre/eng-12-thing",
    baseRef: "main",
    checkRuns: [{ id: 1, name: "test", status: "completed", conclusion: "success" }],
    statuses: [],
    reviews: [],
    unresolvedThreads: 0,
    comments: [],
    viewer: "andrezzoid",
    patchId: null,
    files: ["src/app.ts"],
    oneWayGlobs: [],
    ...over,
  };
}

describe("decide", () => {
  test("a clean PR is READY and goes to the merge gate", () => {
    const s = decide(facts());
    expect(s.verdict).toBe("READY");
    expect(s.next).toBe("merge-gate");
    expect(s.blockers).toEqual([]);
  });

  test("merged and closed are terminal", () => {
    expect(decide(facts({ merged: true, state: "closed" })).verdict).toBe("MERGED");
    expect(decide(facts({ state: "closed" })).verdict).toBe("CLOSED");
    expect(decide(facts({ state: "closed" })).next).toBe("done");
  });

  test("conflicts outrank threads, threads outrank CI", () => {
    const failing = [{ id: 1, name: "test", status: "completed", conclusion: "failure" }];
    expect(decide(facts({ mergeable: false, unresolvedThreads: 2, checkRuns: failing })).verdict).toBe("CONFLICT");
    expect(decide(facts({ mergeableState: "dirty", mergeable: null })).verdict).toBe("CONFLICT");
    expect(decide(facts({ unresolvedThreads: 2, checkRuns: failing })).verdict).toBe("THREADS");
    expect(decide(facts({ checkRuns: failing })).verdict).toBe("CI_FAILING");
  });

  test("changes requested, draft, pending, computing, behind, blocked", () => {
    expect(decide(facts({ reviews: [{ user: { login: "kim" }, state: "CHANGES_REQUESTED" }] })).verdict).toBe("CHANGES_REQUESTED");
    expect(decide(facts({ draft: true })).verdict).toBe("DRAFT");
    expect(decide(facts({ checkRuns: [{ name: "test", status: "in_progress", conclusion: null }] })).next).toBe("wait");
    expect(decide(facts({ mergeable: null, mergeableState: "unknown" })).verdict).toBe("COMPUTING");
    expect(decide(facts({ mergeableState: "behind" })).verdict).toBe("BEHIND");
    const blocked = decide(facts({ mergeableState: "blocked" }));
    expect(blocked.verdict).toBe("AWAITING_REVIEW");
    expect(blocked.next).toBe("human");
  });

  test("unstable (only non-required checks failing at merge level) is still READY when no check fails", () => {
    expect(decide(facts({ mergeableState: "unstable" })).verdict).toBe("READY");
  });

  test("unreadable threads do not block status but are reported", () => {
    const s = decide(facts({ unresolvedThreads: null }));
    expect(s.verdict).toBe("READY");
    expect(s.blockers).toContain("review threads could not be read");
  });
});

describe("classifyChecks", () => {
  test("a rerun replaces the failed run of the same name", () => {
    const c = classifyChecks(
      [
        { id: 1, name: "test", status: "completed", conclusion: "failure" },
        { id: 2, name: "test", status: "completed", conclusion: "success" },
      ],
      [],
    );
    expect(c.failing).toEqual([]);
    expect(c.passing).toBe(1);
  });

  test("statuses and check runs both count; neutral and skipped pass", () => {
    const c = classifyChecks(
      [
        { id: 1, name: "lint", status: "completed", conclusion: "neutral" },
        { id: 2, name: "e2e", status: "completed", conclusion: "skipped" },
        { id: 3, name: "build", status: "completed", conclusion: "timed_out" },
      ],
      [
        { context: "vercel", state: "pending" },
        { context: "ci/legacy", state: "error" },
      ],
    );
    expect(c.failing.sort()).toEqual(["build", "ci/legacy"]);
    expect(c.pending).toEqual(["vercel"]);
  });
});

describe("classifyReviews", () => {
  test("a reviewer's latest decisive review wins", () => {
    const r = classifyReviews([
      { user: { login: "kim" }, state: "CHANGES_REQUESTED" },
      { user: { login: "kim" }, state: "COMMENTED" },
      { user: { login: "kim" }, state: "APPROVED" },
    ]);
    expect(r).toEqual({ approved: true, changesRequested: [] });
  });

  test("one blocking reviewer outweighs an approval", () => {
    const r = classifyReviews([
      { user: { login: "kim" }, state: "APPROVED" },
      { user: { login: "lee" }, state: "CHANGES_REQUESTED" },
    ]);
    expect(r).toEqual({ approved: false, changesRequested: ["lee"] });
  });
});

describe("verdict markers", () => {
  test("only the viewer's markers count, and the latest wins", () => {
    const comments = [
      { body: `ok\n${renderMarker(SHA, "abc1", "fail")}`, user: { login: "andrezzoid" } },
      { body: renderMarker(SHA, "abc1", "pass"), user: { login: "mallory" } },
      { body: renderMarker(SHA, "abc2", "pass"), user: { login: "andrezzoid" } },
    ];
    expect(latestMarker(comments, "andrezzoid")).toEqual({ sha: SHA, patch: "abc2", result: "pass", author: "andrezzoid" });
  });

  test("a forged marker alone is ignored", () => {
    expect(latestMarker([{ body: renderMarker(SHA, null, "pass"), user: { login: "mallory" } }], "andrezzoid")).toBeNull();
  });

  test("verification is current, carried by patch-id, stale, or missing", () => {
    const m = { sha: SHA, patch: "abc1", result: "pass" as const, author: "a" };
    expect(verification(m, SHA, null).status).toBe("current");
    expect(verification(m, "b".repeat(40), "abc1").status).toBe("carried");
    expect(verification(m, "b".repeat(40), "abc2").status).toBe("stale");
    expect(verification(null, SHA, null).status).toBe("missing");
  });
});

describe("one-way doors", () => {
  test("globs match nested paths", () => {
    expect(touchedOneWay(["db/migrations/001.sql", "src/a.ts"], ["db/migrations/**"])).toEqual(["db/migrations/001.sql"]);
    expect(touchedOneWay(["src/a.ts"], [])).toEqual([]);
  });
});

describe("mergeGate", () => {
  const passing = facts({ comments: [{ body: renderMarker(SHA, null, "pass"), user: { login: "andrezzoid" } }] });

  test("autonomy:merge + repo allows + passing verdict + no one-way door = allowed", () => {
    const g = mergeGate({ status: decide(passing), ticketAutonomy: "merge", repoMaxAutonomy: "merge", humanApproved: false });
    expect(g).toEqual({ allowed: true, reasons: [] });
  });

  test("every missing condition is named", () => {
    const g = mergeGate({
      status: decide(facts({ files: ["db/migrations/1.sql"], oneWayGlobs: ["db/migrations/**"] })),
      ticketAutonomy: "pr",
      repoMaxAutonomy: "pr",
      humanApproved: false,
    });
    expect(g.allowed).toBe(false);
    expect(g.reasons).toHaveLength(4);
  });

  test("the human's word replaces the autonomy conditions but never the forge", () => {
    expect(mergeGate({ status: decide(facts()), ticketAutonomy: null, repoMaxAutonomy: "pr", humanApproved: true }).allowed).toBe(true);
    const red = decide(facts({ checkRuns: [{ name: "t", status: "completed", conclusion: "failure" }] }));
    expect(mergeGate({ status: red, ticketAutonomy: "merge", repoMaxAutonomy: "merge", humanApproved: true }).allowed).toBe(false);
  });

  test("unreadable threads block even an approved merge", () => {
    const g = mergeGate({ status: decide(facts({ unresolvedThreads: null })), ticketAutonomy: null, repoMaxAutonomy: "pr", humanApproved: true });
    expect(g.allowed).toBe(false);
  });

  test("a stale verdict does not authorize a new head", () => {
    const moved = facts({ headSha: "b".repeat(40), comments: passing.comments });
    const g = mergeGate({ status: decide(moved), ticketAutonomy: "merge", repoMaxAutonomy: "merge", humanApproved: false });
    expect(g.reasons.join()).toContain("verification stale");
  });
});
