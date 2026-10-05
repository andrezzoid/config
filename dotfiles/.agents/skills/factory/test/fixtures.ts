import type { Issue } from "../src/tickets";

export function issue(over: Partial<Issue> & { labels?: string[] } = {}): Issue {
  const { labels, ...rest } = over;
  return {
    id: "uuid-1",
    identifier: "ENG-1",
    title: "App: do the thing",
    description: "Repo: andrezzoid/app\n\n## What to build",
    url: "https://linear.app/x/issue/ENG-1",
    branchName: "andre/eng-1-do-the-thing",
    priority: 2,
    createdAt: "2026-10-01T00:00:00Z",
    state: { name: "Todo", type: "unstarted" },
    team: { id: "team-1", key: "ENG" },
    assignee: null,
    labels: { nodes: (labels ?? ["ready-for-agent"]).map((name) => ({ name })) },
    parent: null,
    children: { nodes: [] },
    inverseRelations: { nodes: [] },
    attachments: { nodes: [] },
    ...rest,
  };
}
