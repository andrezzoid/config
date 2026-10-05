// GitHub Issues adapter, through `gh api` REST on repository-scoped routes so
// it works in cloud sessions, which block GraphQL and cross-repo search.
// GitHub has no workflow states: an open issue labelled in-progress is
// started, any other open issue is queued.

import { api, paginate, viewer as forgeViewer } from "../forge.ts";
import { HUMAN_LABEL, READY_LABEL, STARTED_LABEL, slug } from "../tickets.ts";
import type { Ticket, TicketComment, TicketRef, Tracker } from "./types.ts";

export class GithubError extends Error {}

export function parseId(id: string): { repo: string; number: number } {
  const m = /^([\w.-]+\/[\w.-]+)#(\d+)$/.exec(id);
  if (!m) throw new GithubError(`not a GitHub issue id (owner/repo#123): ${id}`);
  return { repo: m[1].toLowerCase(), number: Number(m[2]) };
}

const FACTORY_LABELS = [READY_LABEL, HUMAN_LABEL, STARTED_LABEL];
const BLOCKED_BY_LINE = /^[ \t>*_-]*blocked[ -]by\b[*_]*\s*:?(.*)$/i;
const ISSUE_REF = /(?:https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/|(?<![\w/])(?:([\w.-]+\/[\w.-]+))?#)(\d+)\b/g;

function repoOfUrl(url: string | undefined, fallback: string): string {
  const m = /repos\/([\w.-]+\/[\w.-]+)$/.exec(url ?? "");
  return (m?.[1] ?? fallback).toLowerCase();
}

export function toTicket(issue: any, repo: string, blockers: TicketRef[] = []): Ticket {
  const labels: string[] = (issue.labels ?? []).map((l: any) => String(typeof l === "string" ? l : l.name).toLowerCase());
  const closed = issue.state === "closed";
  const started = !closed && labels.includes(STARTED_LABEL);
  const subs = issue.sub_issues_summary;
  return {
    id: `${repo}#${issue.number}`,
    tracker: "github",
    title: issue.title,
    body: issue.body ?? "",
    url: issue.html_url,
    state: closed ? (issue.state_reason === "not_planned" ? "canceled" : "done") : started ? "started" : "queued",
    stateName: closed ? "closed" : started ? STARTED_LABEL : "open",
    labels,
    repo,
    branchName: `issue-${issue.number}-${slug(issue.title)}`,
    priority: 0,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at ?? issue.created_at,
    completedAt: closed ? (issue.closed_at ?? null) : null,
    blockers,
    openChildren: subs ? Math.max(0, (subs.total ?? 0) - (subs.completed ?? 0)) : 0,
    prs: [],
    closes: `Closes #${issue.number}`,
  };
}

// Native issue dependencies first; the body covers repositories that do not
// use them, as a "Blocked by: #12, o/r#13" line or a "## Blocked by" section
// (the to-tickets template), with issue URLs too. Returns full ids.
export function blockedByRefs(body: string, repo: string): string[] {
  const out = new Set<string>();
  let section = false;
  for (const line of body.split("\n")) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line.trim());
    if (heading) {
      section = /^blocked[ -]by\b/i.test(heading[1] ?? "");
      continue;
    }
    const text = section ? line : BLOCKED_BY_LINE.exec(line)?.[1];
    for (const m of text?.matchAll(ISSUE_REF) ?? []) out.add(`${(m[1] ?? m[2] ?? repo).toLowerCase()}#${m[3]}`);
  }
  return [...out];
}

// Which open issue a pull request closes: a closing keyword in its body, or an
// issue-<n>- branch.
export function closedIssue(pr: any): number | null {
  const kw = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/i.exec(pr.body ?? "");
  if (kw) return Number(kw[1]);
  const br = /(?:^|\/)issue-(\d+)(?:-|$)/.exec(pr.head?.ref ?? "");
  return br ? Number(br[1]) : null;
}

export class GithubTracker implements Tracker {
  readonly name = "github" as const;
  readonly repos: string[];

  constructor(repos: string[]) {
    this.repos = [...new Set(repos.map((r) => r.toLowerCase()))];
  }

  private blockers(repo: string, issue: any): TicketRef[] {
    const refs = new Map<string, TicketRef>();
    try {
      for (const b of api<any[]>(`repos/${repo}/issues/${issue.number}/dependencies/blocked_by`) ?? []) {
        const r = repoOfUrl(b.repository_url, repo);
        refs.set(`${r}#${b.number}`, { id: `${r}#${b.number}`, title: b.title, done: b.state === "closed" });
      }
    } catch {
      // repositories without issue dependencies fall back to the body
    }
    for (const id of blockedByRefs(issue.body ?? "", repo)) {
      if (refs.has(id)) continue;
      try {
        const ref = parseId(id);
        const b = api<any>(`repos/${ref.repo}/issues/${ref.number}`);
        refs.set(id, { id, title: b.title, done: b.state === "closed" });
      } catch {
        refs.set(id, { id, title: "(unreadable)", done: false });
      }
    }
    return [...refs.values()];
  }

  // The issue payload carries a sub-issue summary on most hosts; ask the
  // sub-issues route when it does not, since a parent must never read as a slice.
  private full(repo: string, issue: any): Ticket {
    const t = toTicket(issue, repo, this.blockers(repo, issue));
    if (!issue.sub_issues_summary) {
      try {
        t.openChildren = (api<any[]>(`repos/${repo}/issues/${issue.number}/sub_issues`) ?? []).filter((s) => s.state === "open").length;
      } catch {
        // no sub-issues on this host
      }
    }
    return t;
  }

  private issues(repo: string, query: string): any[] {
    return paginate<any>(`repos/${repo}/issues?${query}`).filter((i) => !i.pull_request);
  }

  async ready(): Promise<Ticket[]> {
    const out: Ticket[] = [];
    for (const repo of this.repos) {
      for (const i of this.issues(repo, `state=open&labels=${READY_LABEL}`)) out.push(this.full(repo, i));
    }
    return out;
  }

  async get(id: string): Promise<{ ticket: Ticket; comments: TicketComment[] }> {
    const { repo, number } = parseId(id);
    const issue = api<any>(`repos/${repo}/issues/${number}`);
    if (issue.pull_request) throw new GithubError(`${id} is a pull request, not an issue`);
    const comments = paginate<any>(`repos/${repo}/issues/${number}/comments`).map((c) => ({
      id: String(c.id),
      body: c.body ?? "",
      createdAt: c.created_at,
    }));
    return { ticket: this.full(repo, issue), comments };
  }

  async start(id: string): Promise<void> {
    const { repo, number } = parseId(id);
    const me = await this.viewer();
    api(`repos/${repo}/issues/${number}/assignees`, { method: "POST", body: { assignees: [me] } });
    api(`repos/${repo}/issues/${number}/labels`, { method: "POST", body: { labels: [STARTED_LABEL] } });
  }

  async comment(id: string, body: string): Promise<string> {
    const { repo, number } = parseId(id);
    return String(api<any>(`repos/${repo}/issues/${number}/comments`, { method: "POST", body: { body } }).id);
  }

  async deleteComment(id: string, commentId: string): Promise<void> {
    api(`repos/${parseId(id).repo}/issues/comments/${commentId}`, { method: "DELETE" });
  }

  async handBack(id: string): Promise<{ labelled: boolean }> {
    const { repo, number } = parseId(id);
    for (const label of [READY_LABEL, STARTED_LABEL]) {
      try {
        api(`repos/${repo}/issues/${number}/labels/${label}`, { method: "DELETE" });
      } catch {
        // not on the issue
      }
    }
    api(`repos/${repo}/issues/${number}/labels`, { method: "POST", body: { labels: [HUMAN_LABEL] } });
    return { labelled: true };
  }

  async portfolio(): Promise<Ticket[]> {
    const since = new Date(Date.now() - 14 * 864e5).toISOString();
    const out: Ticket[] = [];
    for (const repo of this.repos) {
      const prs = paginate<any>(`repos/${repo}/pulls?state=open`);
      const touched = [...this.issues(repo, "state=open"), ...this.issues(repo, `state=closed&since=${since}`)];
      for (const i of touched) {
        let t = toTicket(i, repo);
        if (!t.labels.some((l) => FACTORY_LABELS.includes(l))) continue;
        // The brief counts ready tickets the way `tickets next` does.
        if (t.state === "queued" && t.labels.includes(READY_LABEL)) t = this.full(repo, i);
        t.prs = prs.filter((p) => closedIssue(p) === i.number).map((p) => p.html_url);
        out.push(t);
      }
    }
    return out;
  }

  async viewer(): Promise<string> {
    const login = forgeViewer();
    if (!login) throw new GithubError("gh cannot tell who is signed in: run `gh auth login`");
    return login;
  }
}
