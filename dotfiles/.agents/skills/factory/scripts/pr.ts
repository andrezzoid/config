// Pure merge-readiness policy. No I/O here: the adapters in gh.ts gather
// PrFacts and every decision about them lives in this file, so it is tested
// without a network.

export type CheckRun = {
  id?: number;
  name: string;
  check_suite?: { id: number } | null;
  status: string;
  conclusion: string | null;
  html_url?: string | null;
};
export type CommitStatus = { context: string; state: string; target_url?: string | null };
export type Review = { user: { login: string } | null; state: string };
export type IssueComment = { body: string; user: { login: string } | null };

export type PrFacts = {
  owner: string;
  repo: string;
  number: number;
  url: string;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  mergeable: boolean | null;
  mergeableState: string;
  headSha: string;
  headRef: string;
  baseRef: string;
  checkRuns: CheckRun[];
  statuses: CommitStatus[];
  reviews: Review[];
  // null when the forge would not tell us; merges treat that as a blocker.
  unresolvedThreads: number | null;
  comments: IssueComment[];
  viewer: string | null;
  patchId: string | null;
  // Every path the PR touches, including the old path of a rename.
  files: string[];
  // False when GitHub's file list was cut off, so doors cannot be checked.
  filesComplete: boolean;
  oneWayGlobs: string[];
};

export type Verdict =
  | "READY"
  | "CONFLICT"
  | "THREADS"
  | "CI_FAILING"
  | "CHANGES_REQUESTED"
  | "DRAFT"
  | "BEHIND"
  | "CI_PENDING"
  | "COMPUTING"
  | "AWAITING_REVIEW"
  | "MERGED"
  | "CLOSED";

// What the babysitter does next. "merge-gate" means the forge would accept a
// merge; whether anyone may merge is decided by mergeGate().
export type Next = "fix" | "wait" | "human" | "merge-gate" | "done";

export const EXIT: Record<Verdict, number> = {
  READY: 0,
  CONFLICT: 2,
  THREADS: 3,
  CI_FAILING: 4,
  CHANGES_REQUESTED: 5,
  DRAFT: 6,
  BEHIND: 7,
  CI_PENDING: 10,
  COMPUTING: 11,
  AWAITING_REVIEW: 12,
  MERGED: 20,
  CLOSED: 21,
};

const NEXT: Record<Verdict, Next> = {
  READY: "merge-gate",
  CONFLICT: "fix",
  THREADS: "fix",
  CI_FAILING: "fix",
  CHANGES_REQUESTED: "fix",
  DRAFT: "fix",
  BEHIND: "fix",
  CI_PENDING: "wait",
  COMPUTING: "wait",
  AWAITING_REVIEW: "human",
  MERGED: "done",
  CLOSED: "done",
};

const FAILING_CONCLUSIONS = new Set([
  "failure",
  "timed_out",
  "cancelled",
  "action_required",
  "startup_failure",
  "stale",
]);

export type Checks = { failing: string[]; pending: string[]; passing: number };

// A rerun adds a newer run to the same check suite, so only the newest run per
// suite and name counts. Two workflows with a job of the same name are two
// suites, and both count.
export function classifyChecks(runs: CheckRun[], statuses: CommitStatus[]): Checks {
  const latest = new Map<string, CheckRun>();
  for (const run of runs) {
    const key = `${run.check_suite?.id ?? ""}:${run.name}`;
    const prev = latest.get(key);
    if (!prev || (run.id ?? 0) >= (prev.id ?? 0)) latest.set(key, run);
  }
  const out: Checks = { failing: [], pending: [], passing: 0 };
  for (const run of latest.values()) {
    if (run.status !== "completed") out.pending.push(run.name);
    else if (FAILING_CONCLUSIONS.has(run.conclusion ?? "")) out.failing.push(run.name);
    else out.passing++;
  }
  for (const s of statuses) {
    if (s.state === "pending") out.pending.push(s.context);
    else if (s.state === "failure" || s.state === "error") out.failing.push(s.context);
    else out.passing++;
  }
  return out;
}

export type ReviewState = { approved: boolean; changesRequested: string[] };

// Reviews arrive oldest first; a reviewer's latest decisive review wins.
export function classifyReviews(reviews: Review[]): ReviewState {
  const latest = new Map<string, string>();
  for (const r of reviews) {
    const login = r.user?.login;
    if (!login) continue;
    if (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED" || r.state === "DISMISSED") {
      latest.set(login, r.state);
    }
  }
  const changesRequested = [...latest].filter(([, s]) => s === "CHANGES_REQUESTED").map(([l]) => l);
  const approved = changesRequested.length === 0 && [...latest.values()].includes("APPROVED");
  return { approved, changesRequested };
}

export type VerdictMarker = { sha: string; patch: string | null; result: "pass" | "fail"; author: string | null };

// The marker must end the comment: a summary that quotes a marker cannot
// speak for the verdict that follows it.
const MARKER = /<!--\s*factory:verdict\s+sha=([0-9a-f]{7,40})(?:\s+patch=([0-9a-f]+))?\s+result=(pass|fail)\s*-->\s*$/;

export function renderMarker(sha: string, patch: string | null, result: "pass" | "fail"): string {
  return `<!-- factory:verdict sha=${sha}${patch ? ` patch=${patch}` : ""} result=${result} -->`;
}

// Anyone who can comment can type a marker, so only markers written by the
// identity running the factory count. Without a known identity, none do.
export function latestMarker(comments: IssueComment[], viewer: string | null): VerdictMarker | null {
  if (!viewer) return null;
  let found: VerdictMarker | null = null;
  for (const c of comments) {
    const m = MARKER.exec(c.body ?? "");
    if (!m) continue;
    const author = c.user?.login ?? null;
    if (author !== viewer) continue;
    found = { sha: m[1], patch: m[2] ?? null, result: m[3] as "pass" | "fail", author };
  }
  return found;
}

export type Verification = {
  status: "current" | "carried" | "stale" | "missing";
  result: "pass" | "fail" | null;
  sha: string | null;
};

// A rebase changes the SHA but not the patch. pstack's patch-id rule keeps a
// verdict alive across it; any other new head voids the verdict. The patch key
// is exact text (see patchKey), so a whitespace change is a new patch.
export function verification(marker: VerdictMarker | null, headSha: string, patchId: string | null): Verification {
  if (!marker) return { status: "missing", result: null, sha: null };
  const sameSha = headSha.startsWith(marker.sha) || marker.sha.startsWith(headSha);
  if (sameSha) return { status: "current", result: marker.result, sha: marker.sha };
  if (marker.patch && patchId && marker.patch === patchId) {
    return { status: "carried", result: marker.result, sha: marker.sha };
  }
  return { status: "stale", result: marker.result, sha: marker.sha };
}

export function touchedOneWay(files: string[], globs: string[]): string[] {
  if (globs.length === 0) return [];
  const matchers = globs.map((g) => new Bun.Glob(g));
  return files.filter((f) => matchers.some((m) => m.match(f)));
}

export type Status = {
  pr: number;
  url: string;
  title: string;
  headSha: string;
  headRef: string;
  verdict: Verdict;
  next: Next;
  blockers: string[];
  checks: Checks;
  reviews: ReviewState;
  unresolvedThreads: number | null;
  verification: Verification;
  oneWayTouched: string[];
  filesComplete: boolean;
};

// Tiers follow pstack's watch-pr: conflicts outrank threads, threads outrank
// CI, because fixing a lower tier first gets undone by the higher one.
export function decide(f: PrFacts): Status {
  const checks = classifyChecks(f.checkRuns, f.statuses);
  const reviews = classifyReviews(f.reviews);
  const marker = latestMarker(f.comments, f.viewer);
  const ver = verification(marker, f.headSha, f.patchId);
  const oneWayTouched = touchedOneWay(f.files, f.oneWayGlobs);
  const blockers: string[] = [];

  let verdict: Verdict;
  if (f.merged) verdict = "MERGED";
  else if (f.state === "closed") verdict = "CLOSED";
  else if (f.mergeable === false || f.mergeableState === "dirty") {
    verdict = "CONFLICT";
    blockers.push(`merge conflicts with ${f.baseRef}`);
  } else if ((f.unresolvedThreads ?? 0) > 0) {
    verdict = "THREADS";
    blockers.push(`${f.unresolvedThreads} unresolved review thread(s)`);
  } else if (checks.failing.length > 0) {
    verdict = "CI_FAILING";
    blockers.push(`failing: ${checks.failing.join(", ")}`);
  } else if (reviews.changesRequested.length > 0) {
    verdict = "CHANGES_REQUESTED";
    blockers.push(`changes requested by ${reviews.changesRequested.join(", ")}`);
  } else if (f.draft) {
    verdict = "DRAFT";
    blockers.push("pull request is a draft");
  } else if (checks.pending.length > 0) {
    verdict = "CI_PENDING";
    blockers.push(`pending: ${checks.pending.join(", ")}`);
  } else if (f.mergeable === null || f.mergeableState === "unknown") {
    verdict = "COMPUTING";
    blockers.push("GitHub is still computing mergeability");
  } else if (f.mergeableState === "behind") {
    verdict = "BEHIND";
    blockers.push(`branch is behind ${f.baseRef}`);
  } else if (f.mergeableState === "blocked") {
    verdict = "AWAITING_REVIEW";
    blockers.push("branch protection is waiting on a required review");
  } else verdict = "READY";

  if (f.unresolvedThreads === null && verdict === "READY") {
    blockers.push("review threads could not be read");
  }

  return {
    pr: f.number,
    url: f.url,
    title: f.title,
    headSha: f.headSha,
    headRef: f.headRef,
    verdict,
    next: NEXT[verdict],
    blockers,
    checks,
    reviews,
    unresolvedThreads: f.unresolvedThreads,
    verification: ver,
    oneWayTouched,
    filesComplete: f.filesComplete,
  };
}

export type MergeGateInput = {
  status: Status;
  ticketAutonomy: "merge" | "pr" | null;
  repoMaxAutonomy: "merge" | "pr";
  humanApproved: boolean;
};

// The bright line that makes self-merge safe: the forge must be ready, and
// either the human said "merge" in words, or every autonomy condition holds.
export function mergeGate(input: MergeGateInput): { allowed: boolean; reasons: string[] } {
  const { status: s } = input;
  const reasons: string[] = [];
  if (s.verdict !== "READY") reasons.push(`forge verdict is ${s.verdict}, not READY`);
  if (s.unresolvedThreads === null) reasons.push("review threads could not be read");
  if (!input.humanApproved) {
    if (input.ticketAutonomy !== "merge") reasons.push("ticket does not carry autonomy:merge");
    if (input.repoMaxAutonomy !== "merge") reasons.push("repo profile caps autonomy at pr");
    if (s.verification.result !== "pass" || !["current", "carried"].includes(s.verification.status)) {
      reasons.push(`no passing verdict for head ${s.headSha.slice(0, 7)} (verification ${s.verification.status})`);
    }
    if (s.oneWayTouched.length > 0) reasons.push(`touches one-way doors: ${s.oneWayTouched.join(", ")}`);
    if (!s.filesComplete) reasons.push("GitHub truncated the file list, so one-way doors cannot be checked");
  }
  return { allowed: reasons.length === 0, reasons };
}

export function fingerprint(s: Status): string {
  return [
    s.verdict,
    s.headSha.slice(0, 7),
    `threads=${s.unresolvedThreads ?? "?"}`,
    `failing=${s.checks.failing.length}`,
    `pending=${s.checks.pending.length}`,
    `verify=${s.verification.status}/${s.verification.result ?? "-"}`,
  ].join(" ");
}

// git patch-id ignores whitespace, so a re-indent in Python or YAML would keep
// a verdict for code nobody reviewed. This key keeps every byte of the diff
// except what a rebase changes on its own: hunk line numbers, and blob ids of
// text files. A binary file's blob ids are its only content, so they stay.
export function patchKey(diff: string): string {
  const kept: string[] = [];
  for (const file of diff.replace(/\n+$/, "").split(/^(?=diff --git )/m)) {
    const binary = /^(Binary files |GIT binary patch)/m.test(file);
    for (const line of file.split("\n")) {
      if (line.startsWith("@@")) continue;
      if (line.startsWith("index ") && !binary) continue;
      kept.push(line);
    }
  }
  return new Bun.CryptoHasher("sha256").update(kept.join("\n")).digest("hex").slice(0, 40);
}
