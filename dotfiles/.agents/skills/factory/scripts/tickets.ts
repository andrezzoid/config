// Pure ticket policy over the normalized Ticket: which tickets an agent may
// pick up, how much autonomy they carry, and who won a claim race. No tracker
// is named here.

import type { Ticket, TicketComment } from "./trackers/types.ts";

export const READY_LABEL = "ready-for-agent";
export const HUMAN_LABEL = "ready-for-human";
// Trackers with no workflow states (GitHub) mark a claimed ticket with it.
export const STARTED_LABEL = "in-progress";
export const CLAIM_PREFIX = "factory:claim";

export function autonomy(t: Pick<Ticket, "labels">): "merge" | "pr" {
  return t.labels.some((l) => l.replace(/\s+/g, "") === "autonomy:merge") ? "merge" : "pr";
}

export type Readiness = { ready: true } | { ready: false; reason: string };

export function readiness(t: Ticket, opts: { repo?: string } = {}): Readiness {
  if (!t.labels.includes(READY_LABEL)) return { ready: false, reason: `no ${READY_LABEL} label` };
  if (t.state !== "queued") return { ready: false, reason: `state is ${t.stateName}` };
  const open = t.blockers.filter((b) => !b.done);
  if (open.length > 0) return { ready: false, reason: `blocked by ${open.map((b) => b.id).join(", ")}` };
  // A parent with open children is a spec, not a slice: building it would
  // build every child at once (Matt Pocock's to-spec hazard).
  if (t.openChildren > 0) return { ready: false, reason: `parent of ${t.openChildren} open ticket(s)` };
  if (!t.repo) return { ready: false, reason: "no repository: add a Repo: owner/name line" };
  if (opts.repo && t.repo !== opts.repo.toLowerCase()) return { ready: false, reason: `belongs to ${t.repo}` };
  return { ready: true };
}

// Priority 1 urgent … 4 low, 0 none; none sorts last, then oldest first.
export function byPriority(a: Ticket, b: Ticket): number {
  const pa = a.priority === 0 ? 5 : a.priority;
  const pb = b.priority === 0 ? 5 : b.priority;
  return pa - pb || a.createdAt.localeCompare(b.createdAt);
}

export function nextTickets(tickets: Ticket[], opts: { repo?: string } = {}) {
  const ready: Ticket[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const t of tickets) {
    const r = readiness(t, opts);
    if (r.ready) ready.push(t);
    else skipped.push({ id: t.id, reason: r.reason });
  }
  ready.sort(byPriority);
  return { ready, skipped };
}

export function claimBody(sessionUrl: string | null, runtime: string): string {
  const where = sessionUrl ? `[${runtime} session](${sessionUrl})` : `a ${runtime} session`;
  return `Claimed by ${where}.\n\n<!-- ${CLAIM_PREFIX} -->`;
}

export function isClaim(c: Pick<TicketComment, "body">): boolean {
  return c.body.includes(`<!-- ${CLAIM_PREFIX} -->`);
}

// Two dispatchers can race. Both write, then both read back: the oldest claim
// inside the race window wins and the loser withdraws. A claim older than the
// window belongs to an earlier attempt (a crash, a handback) and never wins.
export const CLAIM_RACE_MS = 15 * 60_000;
export function claimWinner(comments: TicketComment[], mine: string): string | null {
  const claims = comments.filter(isClaim);
  const own = claims.find((c) => c.id === mine);
  const since = own ? Date.parse(own.createdAt) - CLAIM_RACE_MS : -Infinity;
  const live = claims
    .filter((c) => Date.parse(c.createdAt) >= since)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return live[0]?.id ?? null;
}

// The ticket a branch works on. GitHub branches are issue-<n>-slug (checked
// first, since "issue-12" also looks like a Linear key); Linear's suggested
// branch names carry the key, as in andre/eng-123-fix-login.
export function ticketFromBranch(branch: string, repo: string | null): string | null {
  const gh = /(?:^|\/)issue-(\d+)(?:-|$)/.exec(branch);
  if (gh) return repo ? `${repo}#${gh[1]}` : null;
  const m = /(?:^|[/_-])([a-z][a-z0-9]{1,9}-\d+)(?:[/_-]|$)/i.exec(branch);
  return m ? m[1].toUpperCase() : null;
}

export function slug(title: string, max = 40): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, max)
    .replace(/-+$/, "");
}
