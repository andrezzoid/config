// The forge: GitHub pull requests through `gh api`. REST only, because cloud
// sessions block GitHub GraphQL; the one exception is review-thread
// resolution, which REST does not expose: cloud sessions read it from the
// proxy's ccr route, local ones from GraphQL.

import { latestMarker, patchKey, type PrFacts } from "./pr.ts";
import { git, run } from "./proc.ts";

const GH = process.env.FACTORY_GH ?? "gh";

export class GhError extends Error {}

export function gh(args: string[], input?: string): string {
  const r = run(GH, args, input);
  if (r.code !== 0) throw new GhError(`gh ${args.slice(0, 2).join(" ")}: ${r.stderr.trim()}`);
  return r.stdout;
}

type ApiOpts = { method?: string; accept?: string; body?: unknown };

export function api<T>(path: string, opts: ApiOpts = {}): T {
  const args = ["api", path];
  if (opts.method) args.push("--method", opts.method);
  if (opts.accept) args.push("-H", `Accept: ${opts.accept}`);
  let input: string | undefined;
  if (opts.body !== undefined) {
    args.push("--input", "-");
    input = JSON.stringify(opts.body);
  }
  const out = gh(args, input);
  if (opts.accept?.includes("diff")) return out as T;
  return (out.trim() ? JSON.parse(out) : null) as T;
}

export function paginate<T>(path: string, pick: (page: any) => T[] = (p) => p, maxPages = 10): T[] {
  const sep = path.includes("?") ? "&" : "?";
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = pick(api<any>(`${path}${sep}per_page=100&page=${page}`)) ?? [];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

export type Repo = { owner: string; repo: string };

export function parseRepo(spec: string): Repo | null {
  const m = /([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(spec.trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

export function currentRepo(): Repo | null {
  const url = git(["remote", "get-url", "origin"]);
  return url ? parseRepo(url) : null;
}

export function currentBranch(): string | null {
  const b = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  return b && b !== "HEAD" ? b : null;
}

export function repoRoot(): string | null {
  return git(["rev-parse", "--show-toplevel"]);
}

// Accepts a number, a PR URL, or nothing (the PR for the current branch).
export function resolvePr(arg: string | undefined, repoFlag: string | undefined): Repo & { number: number } {
  const url = arg ? /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/.exec(arg) : null;
  if (url) return { owner: url[1], repo: url[2], number: Number(url[3]) };
  const repo = (repoFlag ? parseRepo(repoFlag) : null) ?? currentRepo();
  if (!repo) throw new GhError("cannot tell which repository: pass --repo owner/name or run inside a clone");
  if (arg && /^\d+$/.test(arg)) return { ...repo, number: Number(arg) };
  if (arg) throw new GhError(`not a PR number or URL: ${arg}`);
  const branch = currentBranch();
  if (!branch) throw new GhError("detached HEAD: pass a PR number");
  const pulls = api<any[]>(`repos/${repo.owner}/${repo.repo}/pulls?head=${repo.owner}:${encodeURIComponent(branch)}&state=all&per_page=5`);
  if (!pulls?.length) throw new GhError(`no pull request for branch ${branch}`);
  return { ...repo, number: pulls[0].number };
}

// A failed lookup is not cached: the next call retries, and until one succeeds
// no verdict marker counts.
let viewerCache: string | undefined;
export function viewer(): string | null {
  if (viewerCache === undefined) {
    try {
      viewerCache = api<{ login: string }>("user").login;
    } catch {
      return null;
    }
  }
  return viewerCache;
}

// The ccr route's payload shape is not documented, so accept the plausible
// field names and give up (null) rather than guess when none is present.
export function countUnresolved(payload: unknown): number | null {
  const p = payload as any;
  const list: any[] | null = Array.isArray(p)
    ? p
    : (p?.threads ?? p?.review_threads ?? p?.reviewThreads?.nodes ?? p?.nodes ?? null);
  if (!Array.isArray(list)) return null;
  let open = 0;
  for (const t of list) {
    const resolved = t?.is_resolved ?? t?.isResolved ?? t?.resolved ??
      (typeof t?.state === "string" ? t.state.toLowerCase() === "resolved" : undefined);
    if (typeof resolved !== "boolean") return null;
    if (!resolved) open++;
  }
  return open;
}

const THREADS_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved}}}}}`;

export function unresolvedThreads(r: Repo, number: number): number | null {
  const viaCcr = () => countUnresolved(api(`repos/${r.owner}/${r.repo}/pulls/${number}/ccr/review_threads`));
  const viaGraphql = () => {
    const out = gh(["api", "graphql", "-f", `query=${THREADS_QUERY}`, "-f", `owner=${r.owner}`, "-f", `name=${r.repo}`, "-F", `number=${number}`]);
    return countUnresolved(JSON.parse(out)?.data?.repository?.pullRequest?.reviewThreads?.nodes);
  };
  const order = process.env.CLAUDE_CODE_REMOTE === "true" ? [viaCcr, viaGraphql] : [viaGraphql, viaCcr];
  for (const attempt of order) {
    try {
      const n = attempt();
      if (n !== null) return n;
    } catch {
      // fall through to the other route
    }
  }
  return null;
}

export function patchId(r: Repo, number: number): string | null {
  try {
    return patchKey(api<string>(`repos/${r.owner}/${r.repo}/pulls/${number}`, { accept: "application/vnd.github.diff" }));
  } catch {
    return null;
  }
}

// GitHub lists at most 3000 files per PR. A rename counts at both paths, so
// moving a file out of a one-way door still touches the door.
const MAX_PR_FILES = 3000;
export function prFiles(r: Repo, number: number): { files: string[]; complete: boolean } {
  const raw = paginate<any>(`repos/${r.owner}/${r.repo}/pulls/${number}/files`, (p) => p, MAX_PR_FILES / 100);
  const files = raw.flatMap((f) => (f.previous_filename ? [f.filename, f.previous_filename] : [f.filename]));
  return { files, complete: raw.length < MAX_PR_FILES };
}

export function prFacts(r: Repo, number: number, oneWayGlobs: string[]): PrFacts {
  const base = `repos/${r.owner}/${r.repo}`;
  const pull = api<any>(`${base}/pulls/${number}`);
  const sha: string = pull.head.sha;
  const checkRuns = paginate<any>(`${base}/commits/${sha}/check-runs`, (p) => p.check_runs, 3);
  const status = api<any>(`${base}/commits/${sha}/status`);
  const comments = paginate<any>(`${base}/issues/${number}/comments`);
  const login = viewer();
  const marker = latestMarker(comments, login);
  const files = prFiles(r, number);
  return {
    owner: r.owner,
    repo: r.repo,
    number,
    url: pull.html_url,
    title: pull.title,
    state: pull.state,
    merged: Boolean(pull.merged),
    draft: Boolean(pull.draft),
    mergeable: pull.mergeable,
    mergeableState: pull.mergeable_state ?? "unknown",
    headSha: sha,
    headRef: pull.head.ref,
    baseRef: pull.base.ref,
    checkRuns,
    statuses: status?.statuses ?? [],
    reviews: paginate<any>(`${base}/pulls/${number}/reviews`),
    unresolvedThreads: pull.state === "open" ? unresolvedThreads(r, number) : 0,
    comments,
    viewer: login,
    patchId: marker && !sha.startsWith(marker.sha) ? patchId(r, number) : null,
    files: files.files,
    filesComplete: files.complete,
    oneWayGlobs,
  };
}

// When the branch's head commit was made, or null when there is no branch: a
// session's pushes are progress on its claim.
export function branchPushedAt(repo: string, branch: string): string | null {
  try {
    return api<any>(`repos/${repo}/branches/${branch}`)?.commit?.commit?.committer?.date ?? null;
  } catch {
    return null;
  }
}

// A ticket's open pull requests: those from its branch, plus the ones its
// tracker links while they stay open.
export function openPrs(repo: string, branch: string, linked: string[]): string[] {
  const urls = new Set<string>();
  try {
    for (const p of api<any[]>(`repos/${repo}/pulls?head=${repo.split("/")[0]}:${branch}&state=open`) ?? []) urls.add(p.html_url);
  } catch {
    // no such branch or no access: no open pull request we can see
  }
  for (const url of linked) {
    const m = /github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/.exec(url);
    if (!m || urls.has(url)) continue;
    try {
      if (api<any>(`repos/${m[1]}/pulls/${m[2]}`).state === "open") urls.add(url);
    } catch {
      // unreadable: not counted as open
    }
  }
  return [...urls];
}

// The entry names of a directory in the repo; empty when it does not exist.
export function listRepoDir(r: Repo, path: string): string[] {
  try {
    const entries = api<{ name: string }[]>(`repos/${r.owner}/${r.repo}/contents/${path}`);
    return Array.isArray(entries) ? entries.map((e) => e.name) : [];
  } catch {
    return [];
  }
}

export function readRepoFile(r: Repo, path: string): string | null {
  try {
    const f = api<{ content: string; encoding: string }>(`repos/${r.owner}/${r.repo}/contents/${path}`);
    return f.encoding === "base64" ? Buffer.from(f.content, "base64").toString("utf8") : f.content;
  } catch {
    return null;
  }
}
