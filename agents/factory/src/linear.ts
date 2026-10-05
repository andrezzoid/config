// Linear adapter: GraphQL over fetch. The key comes from LINEAR_API_KEY (a
// cloud environment variable) or, locally, from the linear CLI's own login.

import { HUMAN_LABEL, READY_LABEL, type Issue } from "./tickets";

const ENDPOINT = process.env.FACTORY_LINEAR_URL ?? "https://api.linear.app/graphql";

export class LinearError extends Error {}

export function linearToken(): string | null {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY;
  try {
    const p = Bun.spawnSync(["linear", "auth", "token"], { stdout: "pipe", stderr: "pipe" });
    const t = p.stdout.toString().trim();
    return p.exitCode === 0 && t ? t : null;
  } catch {
    return null;
  }
}

export async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const key = linearToken();
  if (!key) {
    throw new LinearError("no Linear credentials: set LINEAR_API_KEY (cloud: environment variable; local: `linear auth login`)");
  }
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: key.startsWith("lin_api_") ? key : `Bearer ${key}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) {
    const msg = json.errors?.map((e: any) => e.message).join("; ") ?? `HTTP ${res.status}`;
    throw new LinearError(`Linear: ${msg}`);
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

export type Comment = { id: string; body: string; createdAt: string; user: { name: string } | null };
export type IssueWithComments = Issue & { comments: { nodes: Comment[] } };

export async function readyIssues(): Promise<Issue[]> {
  const d = await linear<{ issues: { nodes: Issue[] } }>(READY_QUERY, { label: READY_LABEL });
  return d.issues.nodes;
}

export async function getIssue(id: string): Promise<IssueWithComments> {
  const d = await linear<{ issue: IssueWithComments | null }>(ISSUE_QUERY, { id });
  if (!d.issue) throw new LinearError(`no Linear issue ${id}`);
  return d.issue;
}

export async function viewerId(): Promise<{ id: string; name: string }> {
  return (await linear<{ viewer: { id: string; name: string } }>(VIEWER_QUERY)).viewer;
}

// The workflow state of a type with the lowest position: "In Progress" for
// started, "Todo" for unstarted, in a default Linear team.
export async function firstState(teamId: string, type: string): Promise<string | null> {
  const d = await linear<{ team: { states: { nodes: { id: string; type: string; position: number }[] } } }>(
    TEAM_STATES_QUERY,
    { id: teamId },
  );
  const states = d.team.states.nodes.filter((s) => s.type === type).sort((a, b) => a.position - b.position);
  return states[0]?.id ?? null;
}

export async function labelId(name: string, teamId: string): Promise<string | null> {
  const d = await linear<{ issueLabels: { nodes: { id: string; team: { id: string } | null }[] } }>(LABEL_QUERY, { name });
  const nodes = d.issueLabels.nodes;
  return (nodes.find((l) => l.team?.id === teamId) ?? nodes.find((l) => !l.team))?.id ?? null;
}

export async function updateIssue(id: string, input: Record<string, unknown>) {
  await linear(UPDATE_ISSUE, { id, input });
}

export async function comment(issueId: string, body: string): Promise<string> {
  const d = await linear<{ commentCreate: { comment: { id: string } } }>(CREATE_COMMENT, { issueId, body });
  return d.commentCreate.comment.id;
}

export async function deleteComment(id: string) {
  await linear(DELETE_COMMENT, { id });
}

export async function swapLabels(issue: Issue, remove: string, add: string) {
  const current = issue.labels.nodes as { id?: string; name: string }[];
  const old = current.find((l) => l.name.toLowerCase() === remove);
  if (old?.id) await linear(REMOVE_LABEL, { id: issue.id, labelId: old.id });
  const addId = await labelId(add, issue.team.id);
  if (addId) await linear(ADD_LABEL, { id: issue.id, labelId: addId });
  return Boolean(addId);
}

export async function briefIssues(): Promise<Issue[]> {
  const d = await linear<{ mine: { nodes: Issue[] }; queued: { nodes: Issue[] } }>(BRIEF_QUERY, {
    since: "-P14D",
    labels: [READY_LABEL, HUMAN_LABEL],
  });
  const byId = new Map<string, Issue>();
  for (const i of [...d.mine.nodes, ...d.queued.nodes]) byId.set(i.id, i);
  return [...byId.values()];
}
