import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { parseProfile } from "../scripts/profile.ts";
import { autonomy, byPriority, claimBody, claimWinner, currentLease, nextTickets, phaseOf, readiness, slug, ticketFromBranch, ticketsOfPr } from "../scripts/tickets.ts";
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

  test("a ticket assigned to someone else is theirs; unassigned or mine is ready", () => {
    expect(readiness(ticket({ assignees: [{ name: "Rita", me: false }] }))).toEqual({ ready: false, reason: "assigned to Rita" });
    expect(readiness(ticket({ assignees: [{ name: "Rita", me: false }, { name: "André", me: true }] })).ready).toBe(true);
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

describe("leases", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  const ago = (hours: number) => new Date(now - hours * 3600_000).toISOString();
  const claim = (id: string, hours: number) => ({ id, body: claimBody(null, "cloud"), createdAt: ago(hours) });

  test("no claim, no lease", () => {
    expect(currentLease([], null, now)).toBe(null);
  });

  test("a claim lives while its session shows progress: a comment or a push", () => {
    expect(currentLease([claim("c", 1)], null, now)?.live).toBe(true);
    expect(currentLease([claim("c", 5)], null, now)?.live).toBe(false);
    expect(currentLease([claim("c", 5), { id: "x", body: "Deviation", createdAt: ago(1) }], null, now)?.live).toBe(true);
    expect(currentLease([claim("c", 5)], ago(2), now)?.live).toBe(true);
  });

  test("a push from before the claim is not its progress", () => {
    expect(currentLease([claim("c", 5)], ago(6), now)?.live).toBe(false);
  });

  test("the winner of the newest race holds the ticket", () => {
    expect(currentLease([claim("old", 9), claim("new", 1)], null, now)?.claim.id).toBe("new");
    expect(currentLease([claim("first", 1), { ...claim("second", 1), createdAt: new Date(now - 3600_000 + 60_000).toISOString() }], null, now)?.claim.id).toBe("first");
  });

  test("a takeover names the claim it replaces", () => {
    expect(claimBody(null, "local", "a cloud session, quiet since 2026-10-07 07:00")).toContain("Takes over from a cloud session, quiet since 2026-10-07 07:00.");
  });
});

describe("phase", () => {
  test("a closed ticket is done, an open PR means babysit, the ready label means iterate", () => {
    expect(phaseOf(ticket({ state: "done" }), [])).toBe("done");
    expect(phaseOf(ticket({ state: "canceled" }), ["https://github.com/o/r/pull/7"])).toBe("done");
    expect(phaseOf(ticket({ labels: [], state: "started" }), ["https://github.com/o/r/pull/7"])).toBe("babysit");
    expect(phaseOf(ticket(), [])).toBe("iterate");
    expect(phaseOf(ticket({ state: "started" }), [])).toBe("iterate");
  });

  test("anything else is shape, including a ticket waiting on a human", () => {
    expect(phaseOf(ticket({ labels: ["needs-info"] }), [])).toBe("shape");
    expect(phaseOf(ticket({ labels: ["ready-for-human"] }), [])).toBe("shape");
    expect(phaseOf(ticket({ labels: ["ready-for-agent", "ready-for-human"] }), [])).toBe("shape");
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

  test("the assignee says whether the ticket is the viewer's", () => {
    expect(linearTicket(linearIssue({ assignee: { id: "u9", name: "Rita", isMe: false } })).assignees).toEqual([{ name: "Rita", me: false }]);
    expect(linearTicket(linearIssue()).assignees).toEqual([]);
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

  test("assignees are marked as the viewer's by login", () => {
    const t = githubTicket(githubIssue({ assignees: [{ login: "andrezzoid" }, { login: "rita" }] }), "o/r", [], "andrezzoid");
    expect(t.assignees).toEqual([{ name: "andrezzoid", me: true }, { name: "rita", me: false }]);
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

  test("the Blocked by section of the shared ticket template names blockers", () => {
    const template = readFileSync(join(import.meta.dirname, "../../to-tickets/references/ticket-template.md"), "utf8");
    expect(template).toContain("## Blocked by");
    const body = template.replace(/(## Blocked by\n\n)[^\n]*/, "$1- #12\n- o/api#3")
      .replace(/(## Acceptance criteria\n\n)[^\n]*/, "$1- [ ] see #99")
      .replace(/(## Out of scope\n\n)[^\n]*/, "$1- Changing #7");
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
