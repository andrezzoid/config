// Pure ticket policy: which Linear issues are ready for an agent, which repo
// they belong to, and how much autonomy they carry.

export type StateType = "triage" | "backlog" | "unstarted" | "started" | "completed" | "canceled" | string;

export type Label = { id?: string; name: string; parent?: { name: string } | null };
export type IssueRef = { identifier: string; title?: string; state: { type: StateType; name?: string } };

export type Issue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  branchName: string;
  priority: number;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string | null;
  state: { id?: string; name: string; type: StateType };
  team: { id: string; key: string };
  assignee: { id: string; name: string } | null;
  labels: { nodes: Label[] };
  parent: { identifier: string } | null;
  children: { nodes: IssueRef[] };
  inverseRelations: { nodes: { type: string; issue: IssueRef }[] };
  attachments: { nodes: { url: string; title?: string | null }[] };
};

export const READY_LABEL = "ready-for-agent";
export const HUMAN_LABEL = "ready-for-human";
const DONE: StateType[] = ["completed", "canceled"];
const NOT_STARTED: StateType[] = ["triage", "backlog", "unstarted"];

export function labelNames(issue: Pick<Issue, "labels">): string[] {
  return issue.labels.nodes.map((l) => (l.parent?.name ? `${l.parent.name}:${l.name}` : l.name).toLowerCase());
}

// Accepts a flat `autonomy:merge` label or a Linear label group named
// `autonomy` holding `merge`. Anything else means the conservative default.
export function autonomy(issue: Pick<Issue, "labels">): "merge" | "pr" {
  return labelNames(issue).some((n) => n.replace(/\s+/g, "") === "autonomy:merge") ? "merge" : "pr";
}

const REPO_LINE = /^[ \t>*_-]*repo(?:sitory)?[*_]*\s*:[\s*_`]*(?:https:\/\/github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?[`*_]*\s*$/im;
const GITHUB_URL = /github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?(?:\/|$)/;

// to-tickets writes a `Repo: owner/name` line. Linear's GitHub integration
// attaches PR and commit links, which name the repo as well.
export function repoOf(issue: Pick<Issue, "description" | "attachments">): string | null {
  const line = REPO_LINE.exec(issue.description ?? "");
  if (line) return line[1].toLowerCase();
  for (const a of issue.attachments.nodes) {
    const m = GITHUB_URL.exec(a.url);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

export function blockers(issue: Pick<Issue, "inverseRelations">): IssueRef[] {
  return issue.inverseRelations.nodes.filter((r) => r.type === "blocks").map((r) => r.issue);
}

export type Readiness = { ready: true } | { ready: false; reason: string };

export function readiness(issue: Issue, opts: { repo?: string } = {}): Readiness {
  if (!labelNames(issue).includes(READY_LABEL)) return { ready: false, reason: `no ${READY_LABEL} label` };
  if (!NOT_STARTED.includes(issue.state.type)) return { ready: false, reason: `state is ${issue.state.name}` };
  const open = blockers(issue).filter((b) => !DONE.includes(b.state.type));
  if (open.length > 0) return { ready: false, reason: `blocked by ${open.map((b) => b.identifier).join(", ")}` };
  // A parent with open children is a spec, not a slice: building it would
  // build every child at once (Matt Pocock's to-spec hazard).
  const openChildren = issue.children.nodes.filter((c) => !DONE.includes(c.state.type));
  if (openChildren.length > 0) return { ready: false, reason: `parent of ${openChildren.length} open ticket(s)` };
  const repo = repoOf(issue);
  if (!repo) return { ready: false, reason: "no Repo: line or GitHub attachment" };
  if (opts.repo && repo !== opts.repo.toLowerCase()) return { ready: false, reason: `belongs to ${repo}` };
  return { ready: true };
}

// Linear priority: 1 urgent … 4 low, 0 none. None sorts last.
export function byPriority(a: Issue, b: Issue): number {
  const pa = a.priority === 0 ? 5 : a.priority;
  const pb = b.priority === 0 ? 5 : b.priority;
  return pa - pb || a.createdAt.localeCompare(b.createdAt);
}

export function nextTickets(issues: Issue[], opts: { repo?: string } = {}) {
  const ready: Issue[] = [];
  const skipped: { identifier: string; reason: string }[] = [];
  for (const issue of issues) {
    const r = readiness(issue, opts);
    if (r.ready) ready.push(issue);
    else skipped.push({ identifier: issue.identifier, reason: r.reason });
  }
  ready.sort(byPriority);
  return { ready, skipped };
}

export const CLAIM_PREFIX = "factory:claim";

export function claimBody(sessionUrl: string | null, runtime: string): string {
  const where = sessionUrl ? `[${runtime} session](${sessionUrl})` : `a ${runtime} session`;
  return `Claimed by ${where}.\n\n<!-- ${CLAIM_PREFIX} -->`;
}

// Two dispatchers can race. Both write, then both read back: the oldest
// claim comment wins and the loser withdraws.
export function claimWinner(comments: { id: string; body: string; createdAt: string }[]): string | null {
  const claims = comments
    .filter((c) => c.body.includes(`<!-- ${CLAIM_PREFIX} -->`))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return claims[0]?.id ?? null;
}

export function ticketFromBranch(branch: string): string | null {
  const m = /(?:^|[/_-])([a-z][a-z0-9]{1,9}-\d+)(?:[/_-]|$)/i.exec(branch);
  return m ? m[1].toUpperCase() : null;
}
