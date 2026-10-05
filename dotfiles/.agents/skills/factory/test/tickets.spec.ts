import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { parseProfile } from "../scripts/profile.ts";
import { autonomy, byPriority, claimBody, claimWinner, nextTickets, readiness, slug, ticketFromBranch, ticketsOfPr } from "../scripts/tickets.ts";
import { blockedByRefs, closedIssue, toTicket as githubTicket } from "../scripts/trackers/github.ts";
import { normalizeId, trackerOf } from "../scripts/trackers/index.ts";
import { repoOf, toTicket as linearTicket } from "../scripts/trackers/linear.ts";
import { expect } from "./expect.ts";
import { githubIssue, linearIssue, ticket } from "./fixtures.ts";

describe("readiness", () => {
  test("labelled, queued, unblocked and with a repo is ready", () => {
    expect(readiness(ticket())).toEqual({ ready: true });
  });

  test("each missing condition names itself", () => {
    expect(readiness(ticket({ labels: [] }))).toEqual({ ready: false, reason: "no ready-for-agent label" });
    expect(readiness(ticket({ state: "started", stateName: "In Progress" }))).toEqual({ ready: false, reason: "state is In Progress" });
    expect(readiness(ticket({ repo: null }))).toEqual({ ready: false, reason: "no repository: add a Repo: owner/name line" });
  });

  test("an open blocker blocks; a done one does not", () => {
    expect(readiness(ticket({ blockers: [{ id: "ENG-0", title: "", done: false }] }))).toEqual({ ready: false, reason: "blocked by ENG-0" });
    expect(readiness(ticket({ blockers: [{ id: "ENG-0", title: "", done: true }] })).ready).toBe(true);
  });

  test("a parent with open children is a spec, not a slice", () => {
    expect(readiness(ticket({ openChildren: 1 }))).toEqual({ ready: false, reason: "parent of 1 open ticket(s)" });
  });

  test("--repo filters to one repository, case-insensitively", () => {
    expect(readiness(ticket(), { repo: "AndreZzoid/App" }).ready).toBe(true);
    expect(readiness(ticket(), { repo: "andrezzoid/other" })).toEqual({ ready: false, reason: "belongs to andrezzoid/app" });
  });
});

describe("autonomy", () => {
  test("flat label, label group, or default", () => {
    expect(autonomy(ticket({ labels: ["autonomy:merge"] }))).toBe("merge");
    const grouped = { ...linearIssue(), labels: { nodes: [{ name: "Merge", parent: { name: "Autonomy" } }] } };
    expect(autonomy(linearTicket(grouped))).toBe("merge");
    expect(autonomy(ticket({ labels: ["autonomy:pr"] }))).toBe("pr");
    expect(autonomy(ticket())).toBe("pr");
  });
});

describe("ordering and claims", () => {
  test("urgent first, no-priority last, then oldest", () => {
    const a = ticket({ id: "A", priority: 0 });
    const b = ticket({ id: "B", priority: 1 });
    const c = ticket({ id: "C", priority: 3, createdAt: "2026-01-01T00:00:00Z" });
    const d = ticket({ id: "D", priority: 3, createdAt: "2026-02-01T00:00:00Z" });
    expect([a, d, c, b].sort(byPriority).map((t) => t.id)).toEqual(["B", "C", "D", "A"]);
    expect(nextTickets([a, ticket({ id: "X", labels: [] })]).skipped).toEqual([{ id: "X", reason: "no ready-for-agent label" }]);
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

  for (const [branch, repo, expected] of [
    ["andre/eng-123-fix-login", "o/r", "ENG-123"],
    ["eng-7", null, "ENG-7"],
    ["feature/ABC2-44_thing", null, "ABC2-44"],
    ["issue-12-fix-login", "o/r", "o/r#12"],
    ["andre/issue-3", "o/r", "o/r#3"],
    ["issue-12-fix-login", null, null],
    ["main", "o/r", null],
  ] as const) {
    test(`ticket from branch ${branch} in ${repo}`, () => {
      expect(ticketFromBranch(branch, repo)).toBe(expected);
    });
  }

  test("a PR names its tickets in its branch and its closing lines", () => {
    expect(ticketsOfPr({ headRef: "andre/eng-1-thing", body: "Closes ENG-2\nfixes #12, resolves o/api#3\nCloses https://github.com/O/Web/issues/9\nSee #99" }, "O/R")).toEqual(["ENG-1", "ENG-2", "o/r#12", "o/api#3", "o/web#9"]);
    expect(ticketsOfPr({ headRef: "main", body: null }, "o/r")).toEqual([]);
  });

  test("slugs are short, ascii and hyphenated", () => {
    expect(slug("Café: fix the  Login flow!")).toBe("cafe-fix-the-login-flow");
    expect(slug("a".repeat(60)).length).toBe(40);
  });
});

describe("ticket ids", () => {
  test("the id says which tracker owns the ticket", () => {
    expect(trackerOf("ENG-12")).toBe("linear");
    expect(trackerOf("andrezzoid/app#12")).toBe("github");
    expect(trackerOf("#12")).toBe("github");
    expect(trackerOf("12")).toBe(null);
  });

  test("#12 needs the repository at hand", () => {
    expect(normalizeId("#12", "AndreZzoid/App")).toBe("andrezzoid/app#12");
    expect(normalizeId("eng-4", null)).toBe("ENG-4");
    expect(() => normalizeId("#12", null)).toThrow(/needs a repository/);
  });
});

describe("Linear adapter", () => {
  for (const [description, expected] of [
    ["Repo: andrezzoid/app", "andrezzoid/app"],
    ["**Repo:** `andrezzoid/app`", "andrezzoid/app"],
    ["repository: https://github.com/Org/Thing.git", "org/thing"],
    ["> Repo: org/my.repo", "org/my.repo"],
  ]) {
    test(`repo from "${description}"`, () => {
      expect(repoOf({ description, attachments: { nodes: [] } })).toBe(expected);
    });
  }

  test("repo falls back to a GitHub attachment", () => {
    expect(repoOf({ description: null, attachments: { nodes: [{ url: "https://github.com/org/app/pull/3" }] } })).toBe("org/app");
  });

  test("normalizes state, blockers, children and linked PRs", () => {
    const t = linearTicket(linearIssue({
      state: { name: "In Review", type: "started" },
      inverseRelations: { nodes: [
        { type: "blocks", issue: { identifier: "ENG-0", title: "First", state: { type: "canceled" } } },
        { type: "related", issue: { identifier: "ENG-9", state: { type: "started" } } },
      ] },
      children: { nodes: [{ identifier: "ENG-2", state: { type: "unstarted" } }, { identifier: "ENG-3", state: { type: "completed" } }] },
      attachments: { nodes: [{ url: "https://github.com/o/r/pull/4" }, { url: "https://figma.com/x" }] },
    }));
    expect(t).toMatchObject({
      id: "ENG-1",
      tracker: "linear",
      state: "started",
      stateName: "In Review",
      repo: "andrezzoid/app",
      blockers: [{ id: "ENG-0", title: "First", done: true }],
      openChildren: 1,
      prs: ["https://github.com/o/r/pull/4"],
      closes: "Closes ENG-1",
    });
  });
});

describe("GitHub adapter", () => {
  test("an open labelled issue is a queued ticket in its repository", () => {
    expect(githubTicket(githubIssue(), "o/r")).toMatchObject({
      id: "o/r#12",
      tracker: "github",
      state: "queued",
      repo: "o/r",
      branchName: "issue-12-app-do-the-thing",
      closes: "Closes #12",
      openChildren: 0,
    });
  });

  test("in-progress means started; closed means done unless not planned", () => {
    expect(githubTicket(githubIssue({ labels: ["ready-for-agent", "In-Progress"] }), "o/r").state).toBe("started");
    expect(githubTicket(githubIssue({ state: "closed", state_reason: "completed", closed_at: "2026-10-02T00:00:00Z" }), "o/r")).toMatchObject({ state: "done", completedAt: "2026-10-02T00:00:00Z" });
    expect(githubTicket(githubIssue({ state: "closed", state_reason: "not_planned" }), "o/r").state).toBe("canceled");
  });

  test("open sub-issues make the issue a parent", () => {
    expect(githubTicket(githubIssue({ sub_issues_summary: { total: 3, completed: 1 } }), "o/r").openChildren).toBe(2);
  });

  test("Blocked by lines name blockers when native dependencies are not used", () => {
    expect(blockedByRefs("Do it.\n\nBlocked by: #3, O/Other#4\n**Blocked by** #4 and #9", "o/r")).toEqual(["o/r#3", "o/other#4", "o/r#4", "o/r#9"]);
    expect(blockedByRefs("Fixes #3\n\n## Testing\n\nSee #5", "o/r")).toEqual([]);
    expect(blockedByRefs("## Blocked by\n\n- https://github.com/O/R/issues/12\n- https://github.com/o/api/issues/3", "o/r")).toEqual(["o/r#12", "o/api#3"]);
  });

  test("the Blocked by section of the to-tickets issue template names blockers", () => {
    const skill = readFileSync(join(import.meta.dirname, "../../to-tickets/SKILL.md"), "utf8");
    const template = /<issue-template>([\s\S]*?)<\/issue-template>/.exec(skill)?.[1] ?? "";
    expect(template).toContain("## Blocked by");
    const body = template.replace(/(## Blocked by\n\n)[^\n]*/, "$1- #12\n- o/api#3").replace(/(## Acceptance criteria\n\n)[^\n]*/, "$1- [ ] see #99");
    expect(blockedByRefs(body, "o/r")).toEqual(["o/r#12", "o/api#3"]);
  });

  test("a PR closes an issue by keyword or by branch name", () => {
    expect(closedIssue({ body: "Small fix.\n\nCloses #12", head: { ref: "x" } })).toBe(12);
    expect(closedIssue({ body: "", head: { ref: "issue-7-thing" } })).toBe(7);
    expect(closedIssue({ body: "See #12", head: { ref: "main" } })).toBe(null);
  });
});

describe("profile", () => {
  // The template /setup-factory copies into each repo: if it drifts from the
  // parser, this fails.
  const template = readFileSync(join(import.meta.dirname, "../../setup-factory/references/profile-template.md"), "utf8");

  test("reads the fields that route tickets and gate a merge from the setup-factory template", () => {
    expect(parseProfile(template)).toEqual({
      found: true,
      tracker: "linear",
      team: "ENG",
      maxAutonomy: "pr",
      mergeMethod: "squash",
      gates: ["pnpm lint", "pnpm typecheck", "pnpm test"],
      verifySkill: ".claude/skills/verify-app",
      oneWayGlobs: [".agents/factory.md", "db/migrations/**", "infra/**"],
    });
  });

  test("a GitHub Issues tracker has no team", () => {
    expect(parseProfile("- **Tracker:** GitHub Issues")).toMatchObject({ tracker: "github", team: null });
  });

  test("an edited profile raises autonomy and changes the method", () => {
    const edited = template.replace("**Max autonomy:** `pr`", "**Max autonomy:** `merge`").replace("`squash`", "`rebase`");
    expect(parseProfile(edited)).toMatchObject({ maxAutonomy: "merge", mergeMethod: "rebase" });
  });

  test("no profile means the conservative defaults", () => {
    expect(parseProfile(null)).toMatchObject({ found: false, tracker: null, maxAutonomy: "pr", mergeMethod: "squash", oneWayGlobs: [".agents/factory.md"] });
  });

  test("bare globs and an unhyphenated heading still count as doors", () => {
    const p = parseProfile("## One way doors\n\n- db/migrations/**: schema\n- infra/** (prod)\n- `auth/**`\n");
    expect(p.oneWayGlobs).toEqual([".agents/factory.md", "db/migrations/**", "infra/**", "auth/**"]);
  });

  test("a backticked word in a bare glob's explanation does not replace the glob", () => {
    const p = parseProfile("## One-way doors\n\n- db/migrations/**: apply with `make migrate`, never by hand\n");
    expect(p.oneWayGlobs).toEqual([".agents/factory.md", "db/migrations/**"]);
  });

  test("anything but an explicit merge caps autonomy at pr", () => {
    expect(parseProfile("- Max autonomy: `yolo`").maxAutonomy).toBe("pr");
  });
});
