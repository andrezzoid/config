// What the factory needs from an issue tracker. Every tracker is adapted to
// this shape, so the policy in tickets.ts and the commands in cli.ts never
// know which one they talk to. Adding a tracker means adding one adapter.

export type TrackerName = "linear" | "github";

export type TicketState = "queued" | "started" | "done" | "canceled";

export type TicketRef = { id: string; title: string; done: boolean };

export type Ticket = {
  // ENG-123 on Linear, owner/repo#123 on GitHub.
  id: string;
  tracker: TrackerName;
  title: string;
  body: string;
  url: string;
  state: TicketState;
  stateName: string;
  // Lowercased; a label inside a Linear label group reads "group:name".
  labels: string[];
  // owner/name of the GitHub repository the work ships in.
  repo: string | null;
  branchName: string;
  // 1 urgent … 4 low, 0 none.
  priority: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  blockers: TicketRef[];
  openChildren: number;
  // Pull requests the tracker links to this ticket.
  prs: string[];
  // What a PR body says so the tracker closes the ticket on merge.
  closes: string;
};

export type TicketComment = { id: string; body: string; createdAt: string };

export interface Tracker {
  readonly name: TrackerName;
  // Labelled ready-for-agent and not started.
  ready(): Promise<Ticket[]>;
  get(id: string): Promise<{ ticket: Ticket; comments: TicketComment[] }>;
  // Assign to the viewer and mark started.
  start(id: string): Promise<void>;
  comment(id: string, body: string): Promise<string>;
  deleteComment(id: string, commentId: string): Promise<void>;
  // Back to the queue for a human: ready-for-human instead of ready-for-agent.
  handBack(id: string): Promise<{ labelled: boolean }>;
  // Recent and open factory work, for the brief.
  portfolio(): Promise<Ticket[]>;
  viewer(): Promise<string>;
}
