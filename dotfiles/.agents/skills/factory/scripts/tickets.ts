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
  // The assignee is the human the ticket belongs to: a colleague's ticket is
  // for their agents, not ours.
  if (t.assignees.length > 0 && !t.assignees.some((a) => a.me)) {
    return { ready: false, reason: `assigned to ${t.assignees.map((a) => a.name).join(", ")}` };
  }
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

export function claimBody(sessionUrl: string | null, runtime: string, replaces?: string): string {
  const where = sessionUrl ? `[${runtime} session](${sessionUrl})` : `a ${runtime} session`;
  const takeover = replaces ? ` Takes over from ${replaces}.` : "";
  return `Claimed by ${where}.${takeover}\n\n<!-- ${CLAIM_PREFIX} -->`;
}

// Who a claim names, for a takeover's message: the session link, or the runtime.
export function claimant(c: Pick<TicketComment, "body">): string {
  return /Claimed by (.*?)\.(?:\s|$)/.exec(c.body)?.[1] ?? "an earlier session";
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

// A claim is a lease between agent sessions, never ownership: the assignee
// stays the human's. It lives while its session shows progress, a comment on
// the ticket or a push to its branch, and lapses after LEASE_MS without any,
// the same quiet spell the brief calls stalled. Any later comment counts, a
// human's too: that only keeps a lease longer, never ends it early.
export const LEASE_MS = 3 * 3600_000;
export type Lease = { claim: TicketComment; lastProgress: string; live: boolean };

export function currentLease(comments: TicketComment[], lastPush: string | null, now = Date.now()): Lease | null {
  const claims = comments.filter(isClaim).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const newest = claims.at(-1);
  if (!newest) return null;
  const claim = claims.find((c) => c.id === claimWinner(comments, newest.id))!;
  const since = Date.parse(claim.createdAt);
  const progress = [claim.createdAt, ...comments.filter((c) => !isClaim(c)).map((c) => c.createdAt), ...(lastPush ? [lastPush] : [])]
    .filter((at) => Date.parse(at) >= since)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const lastProgress = progress.at(-1)!;
  return { claim, lastProgress, live: now - Date.parse(lastProgress) < LEASE_MS };
}

// Where a ticket is in the factory: the stage that acts on it next. Shape is
// André's (or triage's); iterate builds it; babysit lands its pull request.
export type Phase = "shape" | "iterate" | "babysit" | "done";
export function phaseOf(t: Pick<Ticket, "state" | "labels">, openPrs: string[]): Phase {
  if (t.state === "done" || t.state === "canceled") return "done";
  if (openPrs.length > 0) return "babysit";
  if (t.labels.includes(READY_LABEL) && !t.labels.includes(HUMAN_LABEL)) return "iterate";
  return "shape";
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

// The tickets a pull request names itself: in its branch, or on a closing
// line of its body (Closes ENG-123, Fixes #12, Resolves o/r#12 or an issue
// URL). Only these may lend the PR their autonomy.
const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+|[\w.-]+\/[\w.-]+#\d+|#\d+|[a-z][a-z0-9]{1,9}-\d+)\b/gi;
export function ticketsOfPr(pr: { body: string | null; headRef: string }, repo: string): string[] {
  const out = new Set<string>();
  const branch = ticketFromBranch(pr.headRef, repo);
  if (branch) out.add(branch);
  for (const m of (pr.body ?? "").matchAll(CLOSING)) {
    const ref = m[1] ?? "";
    const url = /github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)/.exec(ref);
    if (url) out.add(`${url[1]}#${url[2]}`.toLowerCase());
    else if (ref.startsWith("#")) out.add(`${repo.toLowerCase()}${ref}`);
    else if (ref.includes("#")) out.add(ref.toLowerCase());
    else out.add(ref.toUpperCase());
  }
  return [...out];
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
