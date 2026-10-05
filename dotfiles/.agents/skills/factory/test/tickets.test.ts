import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProfile } from "../src/profile";
import { autonomy, byPriority, claimBody, claimWinner, nextTickets, readiness, repoOf, ticketFromBranch } from "../src/tickets";
import { issue } from "./fixtures";


describe("readiness", () => {
  test("labelled, unstarted, unblocked and with a repo is ready", () => {
    expect(readiness(issue())).toEqual({ ready: true });
  });

  test("each missing condition names itself", () => {
    expect(readiness(issue({ labels: [] }))).toEqual({ ready: false, reason: "no ready-for-agent label" });
    expect(readiness(issue({ state: { name: "In Progress", type: "started" } })).ready).toBe(false);
    expect(readiness(issue({ description: "no repo here" }))).toEqual({ ready: false, reason: "no Repo: line or GitHub attachment" });
  });

  test("an open blocker blocks; a done or canceled one does not", () => {
    const blocked = issue({
      inverseRelations: {
        nodes: [
          { type: "blocks", issue: { identifier: "ENG-0", state: { type: "started" } } },
          { type: "related", issue: { identifier: "ENG-9", state: { type: "started" } } },
        ],
      },
    });
    expect(readiness(blocked)).toEqual({ ready: false, reason: "blocked by ENG-0" });
    const done = issue({ inverseRelations: { nodes: [{ type: "blocks", issue: { identifier: "ENG-0", state: { type: "completed" } } }] } });
    expect(readiness(done).ready).toBe(true);
  });

  test("a parent with open children is a spec, not a slice", () => {
    const parent = issue({ children: { nodes: [{ identifier: "ENG-2", state: { type: "unstarted" } }] } });
    expect(readiness(parent)).toEqual({ ready: false, reason: "parent of 1 open ticket(s)" });
  });

  test("--repo filters to one repository, case-insensitively", () => {
    expect(readiness(issue(), { repo: "AndreZzoid/App" }).ready).toBe(true);
    expect(readiness(issue(), { repo: "andrezzoid/other" })).toEqual({ ready: false, reason: "belongs to andrezzoid/app" });
  });
});

describe("repoOf", () => {
  test.each([
    ["Repo: andrezzoid/app", "andrezzoid/app"],
    ["**Repo:** `andrezzoid/app`", "andrezzoid/app"],
    ["repository: https://github.com/Org/Thing.git", "org/thing"],
    ["> Repo: org/my.repo", "org/my.repo"],
  ])("%s", (description, expected) => {
    expect(repoOf({ description, attachments: { nodes: [] } })).toBe(expected);
  });

  test("falls back to a GitHub attachment", () => {
    expect(repoOf({ description: null, attachments: { nodes: [{ url: "https://github.com/org/app/pull/3" }] } })).toBe("org/app");
  });
});

describe("autonomy", () => {
  test("flat label, label group, or default", () => {
    expect(autonomy(issue({ labels: ["autonomy:merge"] }))).toBe("merge");
    expect(autonomy({ labels: { nodes: [{ name: "merge", parent: { name: "Autonomy" } }] } })).toBe("merge");
    expect(autonomy(issue({ labels: ["autonomy:pr"] }))).toBe("pr");
    expect(autonomy(issue())).toBe("pr");
  });
});

describe("ordering and claims", () => {
  test("urgent first, no-priority last, then oldest", () => {
    const a = issue({ identifier: "A", priority: 0 });
    const b = issue({ identifier: "B", priority: 1 });
    const c = issue({ identifier: "C", priority: 3, createdAt: "2026-01-01T00:00:00Z" });
    const d = issue({ identifier: "D", priority: 3, createdAt: "2026-02-01T00:00:00Z" });
    expect([a, d, c, b].sort(byPriority).map((i) => i.identifier)).toEqual(["B", "C", "D", "A"]);
    expect(nextTickets([a, issue({ identifier: "X", labels: [] })]).skipped).toEqual([{ identifier: "X", reason: "no ready-for-agent label" }]);
  });

  test("the oldest claim inside the race window wins", () => {
    const comments = [
      { id: "mine", body: claimBody(null, "local"), createdAt: "2026-10-01T10:00:01Z" },
      { id: "theirs", body: claimBody("https://claude.ai/code/session_x", "cloud"), createdAt: "2026-10-01T10:00:00Z" },
      { id: "c0", body: "unrelated", createdAt: "2026-10-01T09:00:00Z" },
    ];
    expect(claimWinner(comments, "mine")).toBe("theirs");
  });

  test("a claim left by an earlier attempt never beats a new one", () => {
    const comments = [
      { id: "stale", body: claimBody(null, "cloud"), createdAt: "2026-09-01T10:00:00Z" },
      { id: "mine", body: claimBody(null, "local"), createdAt: "2026-10-01T10:00:00Z" },
    ];
    expect(claimWinner(comments, "mine")).toBe("mine");
  });

  test.each([
    ["andre/eng-123-fix-login", "ENG-123"],
    ["eng-7", "ENG-7"],
    ["feature/ABC2-44_thing", "ABC2-44"],
    ["main", null],
  ])("ticket from branch %s", (branch, expected) => {
    expect(ticketFromBranch(branch)).toBe(expected);
  });
});

describe("profile", () => {
  // The template /setup-factory copies into each repo: if it drifts from the
  // parser, this fails.
  const template = readFileSync(join(import.meta.dir, "../../skills/setup-factory/references/profile-template.md"), "utf8");

  test("reads the fields that gate a merge from the setup-factory template", () => {
    expect(parseProfile(template)).toEqual({
      found: true,
      maxAutonomy: "pr",
      mergeMethod: "squash",
      gates: ["pnpm lint", "pnpm typecheck", "pnpm test"],
      verifySkill: ".claude/skills/verify-app",
      oneWayGlobs: ["db/migrations/**", "infra/**"],
    });
  });

  test("an edited profile raises autonomy and changes the method", () => {
    const edited = template.replace("**Max autonomy:** `pr`", "**Max autonomy:** `merge`").replace("`squash`", "`rebase`");
    expect(parseProfile(edited)).toMatchObject({ maxAutonomy: "merge", mergeMethod: "rebase" });
  });

  test("no profile means the conservative defaults", () => {
    expect(parseProfile(null)).toMatchObject({ found: false, maxAutonomy: "pr", mergeMethod: "squash", oneWayGlobs: [] });
  });

  test("bare globs and an unhyphenated heading still count as doors", () => {
    const p = parseProfile("## One way doors\n\n- db/migrations/**: schema\n- infra/** (prod)\n- `auth/**`\n");
    expect(p.oneWayGlobs).toEqual(["db/migrations/**", "infra/**", "auth/**"]);
  });

  test("a backticked word in a bare glob's explanation does not replace the glob", () => {
    const p = parseProfile("## One-way doors\n\n- db/migrations/**: apply with `make migrate`, never by hand\n");
    expect(p.oneWayGlobs).toEqual(["db/migrations/**"]);
  });

  test("anything but an explicit merge caps autonomy at pr", () => {
    expect(parseProfile("- Max autonomy: `yolo`").maxAutonomy).toBe("pr");
  });
});
