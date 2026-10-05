// Linear adapter: GraphQL over fetch. The key comes from LINEAR_API_KEY (a
// cloud environment variable) or, locally, from the linear CLI's own login.
// The query documents are validated against Linear's published schema.

import { run } from "../proc.ts";
import { HUMAN_LABEL, READY_LABEL } from "../tickets.ts";
import type { Ticket, TicketComment, TicketState, Tracker } from "./types.ts";

const ENDPOINT = process.env.FACTORY_LINEAR_URL ?? "https://api.linear.app/graphql";

export class LinearError extends Error {}

export function linearToken(): string | null {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY;
  const r = run("linear", ["auth", "token"]);
  return r.code === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

export async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const key = linearToken();
  if (!key) throw new LinearError("no Linear credentials: set LINEAR_API_KEY (cloud: environment variable; local: `linear auth login`)");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: key.startsWith("lin_api_") ? key : `Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) {
    throw new LinearError(`Linear: ${json.errors?.map((e: any) => e.message).join("; ") ?? `HTTP ${res.status}`}`);
  }
  return json.data as T;
}

export const ISSUE_FIELDS = `
fragment IssueFields on Issue {
  id identifier title description url branchName priority createdAt updatedAt completedAt
  state { id name type }
  team { id key }
  assignee { id name }
  labels { nodes { id name parent { name } } }
  parent { identifier }
  children { nodes { identifier title state { type name } } }
  inverseRelations { nodes { type issue { identifier title state { type name } } } }
  attachments { nodes { url title } }
}`;

export const READY_QUERY = `
query FactoryReady($label: String!) {
  issues(first: 100, filter: {
    labels: { some: { name: { eqIgnoreCase: $label } } }
    state: { type: { in: ["triage", "backlog", "unstarted"] } }
  }) { nodes { ...IssueFields } }
}
${ISSUE_FIELDS}`;

export const ISSUE_QUERY = `
query FactoryIssue($id: String!) {
  issue(id: $id) {
    ...IssueFields
    comments(last: 50) { nodes { id body createdAt user { name } } }
  }
}
${ISSUE_FIELDS}`;

export const BRIEF_QUERY = `
query FactoryBrief($since: DateTimeOrDuration!, $labels: [String!]) {
  mine: issues(first: 100, filter: {
    assignee: { isMe: { eq: true } }
    updatedAt: { gt: $since }
  }) { nodes { ...IssueFields } }
  queued: issues(first: 100, filter: {
    labels: { some: { name: { in: $labels } } }
    state: { type: { nin: ["completed", "canceled"] } }
  }) { nodes { ...IssueFields } }
}
${ISSUE_FIELDS}`;

export const VIEWER_QUERY = `query FactoryViewer { viewer { id name } }`;

export const TEAM_STATES_QUERY = `
query FactoryTeamStates($id: String!) {
  team(id: $id) { states { nodes { id name type position } } }
}`;

export const LABEL_QUERY = `
query FactoryLabel($name: String!) {
  issueLabels(first: 20, filter: { name: { eqIgnoreCase: $name } }) { nodes { id name team { id } } }
}`;

export const UPDATE_ISSUE = `
mutation FactoryUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success }
}`;

export const ADD_LABEL = `
mutation FactoryAddLabel($id: String!, $labelId: String!) {
  issueAddLabel(id: $id, labelId: $labelId) { success }
}`;

export const REMOVE_LABEL = `
mutation FactoryRemoveLabel($id: String!, $labelId: String!) {
  issueRemoveLabel(id: $id, labelId: $labelId) { success }
}`;

export const CREATE_COMMENT = `
mutation FactoryComment($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) { success comment { id } }
}`;

export const DELETE_COMMENT = `
mutation FactoryDeleteComment($id: String!) {
  commentDelete(id: $id) { success }
}`;

type Ref = { identifier: string; title?: string; state: { type: string; name?: string } };
export type LinearIssue = {
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
  state: { id?: string; name: string; type: string };
  team: { id: string; key: string };
  assignee: { id: string; name: string } | null;
  labels: { nodes: { id?: string; name: string; parent?: { name: string } | null }[] };
  parent: { identifier: string } | null;
  children: { nodes: Ref[] };
  inverseRelations: { nodes: { type: string; issue: Ref }[] };
  attachments: { nodes: { url: string; title?: string | null }[] };
};
type WithComments = LinearIssue & { comments: { nodes: { id: string; body: string; createdAt: string }[] } };

const DONE = ["completed", "canceled"];
const STATE: Record<string, TicketState> = { triage: "queued", backlog: "queued", unstarted: "queued", started: "started", completed: "done", canceled: "canceled" };

const REPO_LINE = /^[ \t>*_-]*repo(?:sitory)?[*_]*\s*:[\s*_`]*(?:https:\/\/github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?[`*_]*\s*$/im;
const GITHUB_URL = /github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?(?:\/|$)/;

// to-tickets writes a `Repo: owner/name` line. Linear's GitHub integration
// attaches PR and commit links, which name the repo as well.
export function repoOf(issue: Pick<LinearIssue, "description" | "attachments">): string | null {
  const line = REPO_LINE.exec(issue.description ?? "");
  if (line) return line[1].toLowerCase();
  for (const a of issue.attachments.nodes) {
    const m = GITHUB_URL.exec(a.url);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

export function toTicket(i: LinearIssue): Ticket {
  return {
    id: i.identifier,
    tracker: "linear",
    title: i.title,
    body: i.description ?? "",
    url: i.url,
    state: STATE[i.state.type] ?? "queued",
    stateName: i.state.name,
    labels: i.labels.nodes.map((l) => (l.parent?.name ? `${l.parent.name}:${l.name}` : l.name).toLowerCase()),
    repo: repoOf(i),
    branchName: i.branchName,
    priority: i.priority,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt ?? i.createdAt,
    completedAt: i.completedAt ?? null,
    blockers: i.inverseRelations.nodes
      .filter((r) => r.type === "blocks")
      .map((r) => ({ id: r.issue.identifier, title: r.issue.title ?? "", done: DONE.includes(r.issue.state.type) })),
    openChildren: i.children.nodes.filter((c) => !DONE.includes(c.state.type)).length,
    prs: i.attachments.nodes.map((a) => a.url).filter((u) => /github\.com\/.+\/pull\/\d+/.test(u)),
    closes: `Closes ${i.identifier}`,
  };
}

export class LinearTracker implements Tracker {
  readonly name = "linear" as const;
  private raw = new Map<string, WithComments>();

  private async issue(id: string): Promise<WithComments> {
    const d = await linear<{ issue: WithComments | null }>(ISSUE_QUERY, { id });
    if (!d.issue) throw new LinearError(`no Linear issue ${id}`);
    this.raw.set(id, d.issue);
    return d.issue;
  }

  private async firstState(teamId: string, type: string): Promise<string | null> {
    const d = await linear<{ team: { states: { nodes: { id: string; type: string; position: number }[] } } }>(TEAM_STATES_QUERY, { id: teamId });
    return d.team.states.nodes.filter((s) => s.type === type).sort((a, b) => a.position - b.position)[0]?.id ?? null;
  }

  private async labelId(name: string, teamId: string): Promise<string | null> {
    const d = await linear<{ issueLabels: { nodes: { id: string; team: { id: string } | null }[] } }>(LABEL_QUERY, { name });
    const nodes = d.issueLabels.nodes;
    return (nodes.find((l) => l.team?.id === teamId) ?? nodes.find((l) => !l.team))?.id ?? null;
  }

  async ready(): Promise<Ticket[]> {
    const d = await linear<{ issues: { nodes: LinearIssue[] } }>(READY_QUERY, { label: READY_LABEL });
    return d.issues.nodes.map(toTicket);
  }

  async get(id: string): Promise<{ ticket: Ticket; comments: TicketComment[] }> {
    const i = await this.issue(id);
    return { ticket: toTicket(i), comments: i.comments.nodes.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt })) };
  }

  async start(id: string): Promise<void> {
    const i = this.raw.get(id) ?? (await this.issue(id));
    const me = (await linear<{ viewer: { id: string } }>(VIEWER_QUERY)).viewer;
    const started = await this.firstState(i.team.id, "started");
    await linear(UPDATE_ISSUE, { id: i.id, input: { assigneeId: me.id, ...(started ? { stateId: started } : {}) } });
  }

  async comment(id: string, body: string): Promise<string> {
    const i = this.raw.get(id) ?? (await this.issue(id));
    const d = await linear<{ commentCreate: { comment: { id: string } } }>(CREATE_COMMENT, { issueId: i.id, body });
    return d.commentCreate.comment.id;
  }

  async deleteComment(_id: string, commentId: string): Promise<void> {
    await linear(DELETE_COMMENT, { id: commentId });
  }

  async handBack(id: string): Promise<{ labelled: boolean }> {
    const i = this.raw.get(id) ?? (await this.issue(id));
    const old = i.labels.nodes.find((l) => l.name.toLowerCase() === READY_LABEL);
    if (old?.id) await linear(REMOVE_LABEL, { id: i.id, labelId: old.id });
    const human = await this.labelId(HUMAN_LABEL, i.team.id);
    if (human) await linear(ADD_LABEL, { id: i.id, labelId: human });
    const todo = await this.firstState(i.team.id, "unstarted");
    if (todo) await linear(UPDATE_ISSUE, { id: i.id, input: { stateId: todo } });
    return { labelled: Boolean(human) };
  }

  async portfolio(): Promise<Ticket[]> {
    const d = await linear<{ mine: { nodes: LinearIssue[] }; queued: { nodes: LinearIssue[] } }>(BRIEF_QUERY, {
      since: "-P14D",
      labels: [READY_LABEL, HUMAN_LABEL],
    });
    const byId = new Map<string, LinearIssue>();
    for (const i of [...d.mine.nodes, ...d.queued.nodes]) byId.set(i.id, i);
    return [...byId.values()].map(toTicket);
  }

  async viewer(): Promise<string> {
    return (await linear<{ viewer: { name: string } }>(VIEWER_QUERY)).viewer.name;
  }
}
