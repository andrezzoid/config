// factory: the deterministic half of the factory. Skills hold the judgment;
// this CLI computes ticket readiness, claims, PR merge-readiness and the merge
// gate, so every session, local or cloud, reaches the same answer the same way.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import * as forge from "./forge.ts";
import { decide, EXIT, fingerprint, mergeGate, renderMarker, type Status } from "./pr.ts";
import { parseProfile, PROFILE_PATH, type Profile } from "./profile.ts";
import { autonomy, claimBody, claimWinner, HUMAN_LABEL, isClaim, nextTickets, READY_LABEL, ticketsOfPr } from "./tickets.ts";
import type { GithubTracker } from "./trackers/github.ts";
import { enabledTrackers, normalizeId, trackerFor } from "./trackers/index.ts";
import type { Ticket } from "./trackers/types.ts";

// The folder holding every skill: this file is skills/factory/scripts/cli.ts.
const SKILLS_DIR = resolve(import.meta.dirname, "..", "..");
const STALL_MS = 3 * 3600_000;

type Args = { _: string[]; flags: Record<string, string | true> };

// Switches never take a value, so `pr merge --human-approved 42` keeps 42 as
// the PR instead of swallowing it.
const SWITCHES = new Set(["json", "here", "human-approved", "help"]);

export function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) out.flags[k] = v;
      else if (!SWITCHES.has(k) && i + 1 < argv.length && !argv[i + 1].startsWith("--")) out.flags[k] = argv[++i];
      else out.flags[k] = true;
    } else out._.push(a);
  }
  return out;
}

const str = (v: string | true | undefined) => (typeof v === "string" ? v : undefined);
const runtime = () => (process.env.CLAUDE_CODE_REMOTE === "true" ? "cloud" : "local");

function sessionUrl(): string | null {
  const id = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
  return id?.startsWith("cse_") ? `https://claude.ai/code/session_${id.slice(4)}` : null;
}

class Exit extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

function print(json: boolean, data: unknown, human: () => string) {
  console.log(json ? JSON.stringify(data, null, 2) : human());
}

// The repository a command is about: --repo, or the clone it runs in.
function repoArg(a: Args): string | null {
  const flag = str(a.flags.repo);
  if (flag) return flag.toLowerCase();
  const here = forge.currentRepo();
  return here ? `${here.owner}/${here.repo}`.toLowerCase() : null;
}

// The profile is read from the base branch, never the PR's working tree: a
// branch must not be able to raise its own autonomy.
function profileOf(repo: string, ref?: string): Profile {
  const r = forge.parseRepo(repo);
  if (!r) return parseProfile(null);
  return parseProfile(forge.readRepoFile(r, ref ? `${PROFILE_PATH}?ref=${encodeURIComponent(ref)}` : PROFILE_PATH));
}

// A named repository whose profile says GitHub joins the GitHub tracker.
function githubFor(repo: string | null): string[] {
  return repo && profileOf(repo).tracker === "github" ? [repo] : [];
}

async function statusOf(ref: forge.Repo & { number: number }): Promise<{ status: Status; profile: Profile; pull: any }> {
  const pull = forge.api<any>(`repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`);
  const profile = profileOf(`${ref.owner}/${ref.repo}`, pull.base.ref);
  let status = decide(forge.prFacts(ref, ref.number, profile.oneWayGlobs));
  if (status.verdict === "COMPUTING") {
    await sleep(3000);
    status = decide(forge.prFacts(ref, ref.number, profile.oneWayGlobs));
  }
  return { status, profile, pull };
}

function statusLine(s: Status): string {
  const lines = [`#${s.pr} ${s.verdict} → ${s.next}  ${s.title}`, `  ${s.url}  head ${s.headSha.slice(0, 7)}`];
  for (const b of s.blockers) lines.push(`  - ${b}`);
  lines.push(`  verification: ${s.verification.status}${s.verification.result ? ` (${s.verification.result})` : ""}`);
  if (s.oneWayTouched.length) lines.push(`  one-way doors touched: ${s.oneWayTouched.join(", ")}`);
  return lines.join("\n");
}

async function prStatus(a: Args) {
  const { status } = await statusOf(forge.resolvePr(a._[2], str(a.flags.repo)));
  print(Boolean(a.flags.json), status, () => statusLine(status));
  return EXIT[status.verdict];
}

// One line per change, nothing while nothing moves: built for the Monitor
// tool, which turns each line into a wake-up.
async function prWatch(a: Args) {
  const ref = forge.resolvePr(a._[2], str(a.flags.repo));
  const interval = Number(str(a.flags.interval) ?? 60) * 1000;
  let last = "";
  let failures = 0;
  for (;;) {
    try {
      const { status } = await statusOf(ref);
      failures = 0;
      const fp = fingerprint(status);
      if (fp !== last) {
        const at = new Date().toISOString().slice(11, 19);
        console.log(`${at} #${status.pr} ${fp} next=${status.next}${status.blockers.length ? ` | ${status.blockers.join("; ")}` : ""}`);
        last = fp;
      }
      if (status.next === "done") return EXIT[status.verdict];
      await sleep(interval);
    } catch (e) {
      failures++;
      console.log(`error (${failures}): ${(e as Error).message}`);
      if (failures >= 5) return 1;
      await sleep(Math.min(interval * 2 ** failures, 300_000));
    }
  }
}

// A verdict belongs to the SHA the reviewers checked. If the head moved since,
// or moves while the diff is read, the verdict is about other code: refuse.
async function prVerdict(a: Args) {
  const result = str(a.flags.result);
  const reviewed = str(a.flags.sha);
  if (result !== "pass" && result !== "fail") throw new Exit(64, "--result pass|fail is required");
  if (!reviewed || !/^[0-9a-f]{7,40}$/.test(reviewed)) throw new Exit(64, "--sha <the commit the reviewers checked> is required");
  const ref = forge.resolvePr(a._[2], str(a.flags.repo));
  const headNow = () => forge.api<any>(`repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`).head.sha as string;
  const head = headNow();
  if (!head.startsWith(reviewed)) throw new Exit(3, `head is ${head.slice(0, 7)}, not the reviewed ${reviewed.slice(0, 7)}: review the new head`);
  const patch = forge.patchId(ref, ref.number);
  if (headNow() !== head) throw new Exit(3, "head moved while the diff was read: review the new head");
  const summaryFile = str(a.flags["summary-file"]);
  // Quoted markers in the summary must not read as verdicts.
  const summary = (summaryFile ? readFileSync(summaryFile, "utf8").trim() : `Verification ${result}.`).replaceAll("<!--", "&lt;!--");
  forge.api(`repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments`, { method: "POST", body: { body: `${summary}\n\n${renderMarker(head, patch, result)}` } });
  console.log(`recorded ${result} for #${ref.number} at ${head.slice(0, 7)}`);
  return 0;
}

async function prMerge(a: Args) {
  const ref = forge.resolvePr(a._[2], str(a.flags.repo));
  const { status, profile, pull } = await statusOf(ref);
  const repo = `${ref.owner}/${ref.repo}`.toLowerCase();
  // Autonomy comes only from a ticket the PR itself names, never from any id
  // passed in.
  const named = ticketsOfPr({ body: pull.body, headRef: status.headRef }, repo);
  const flagged = str(a.flags.ticket);
  const ticketId = flagged ? normalizeId(flagged, repo) : (named[0] ?? null);
  if (ticketId && !named.includes(ticketId)) {
    throw new Exit(3, `refusing to merge #${status.pr}: it does not name ${ticketId} in its branch or a Closes line (it names ${named.join(", ") || "nothing"})`);
  }
  const verifySkill = profile.verifySkill !== null &&
    forge.readRepoFile(ref, `${profile.verifySkill}/SKILL.md?ref=${encodeURIComponent(pull.base.ref)}`) !== null;
  let ticketAutonomy: "merge" | "pr" | null = null;
  if (ticketId) {
    try {
      ticketAutonomy = autonomy((await trackerFor(ticketId).get(ticketId)).ticket);
    } catch {
      ticketAutonomy = null;
    }
  }
  const gate = mergeGate({ status, ticketAutonomy, repoMaxAutonomy: profile.maxAutonomy, verifySkill, humanApproved: a.flags["human-approved"] === true });
  if (!gate.allowed) {
    console.log(`refusing to merge #${status.pr}:\n${gate.reasons.map((r) => `  - ${r}`).join("\n")}`);
    return 3;
  }
  forge.api(`repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/merge`, { method: "PUT", body: { merge_method: profile.mergeMethod, sha: status.headSha } });
  console.log(`merged #${status.pr} (${profile.mergeMethod}) at ${status.headSha.slice(0, 7)}`);
  return 0;
}

function summary(t: Ticket) {
  return {
    id: t.id,
    tracker: t.tracker,
    title: t.title,
    url: t.url,
    // queued, started, done or canceled, whatever the tracker calls it
    status: t.state,
    state: t.stateName,
    repo: t.repo,
    autonomy: autonomy(t),
    branchName: t.branchName,
    closes: t.closes,
    labels: t.labels,
    blockers: t.blockers.map((b) => `${b.id}${b.done ? " (done)" : ""}`),
  };
}

async function ticketsNext(a: Args) {
  const repo = a.flags.here || a.flags.repo ? repoArg(a) : null;
  if ((a.flags.here || a.flags.repo) && !repo) throw new Exit(64, "cannot tell which repository: pass --repo owner/name or run inside a clone");
  const trackers = enabledTrackers(githubFor(repo));
  if (!trackers.length) throw new Exit(1, "no tracker configured: set LINEAR_API_KEY, or FACTORY_GITHUB_REPOS for GitHub Issues");
  const all = (await Promise.all(trackers.map((t) => t.ready()))).flat();
  const { ready, skipped } = nextTickets(all, { repo: repo ?? undefined });
  print(Boolean(a.flags.json), { ready: ready.map(summary), skipped }, () => {
    if (!ready.length) return `no ticket is ready${repo ? ` for ${repo}` : ""} (${skipped.length} labelled but waiting)`;
    return ready.map((t) => `${t.id}  ${t.repo}  autonomy:${autonomy(t)}  ${t.title}`).join("\n");
  });
  return 0;
}

function idArg(a: Args, usage: string): string {
  if (!a._[2]) throw new Exit(64, usage);
  return normalizeId(a._[2], repoArg(a));
}

async function ticketShow(a: Args) {
  const id = idArg(a, "usage: factory ticket show <ID>");
  const { ticket, comments } = await trackerFor(id).get(id);
  print(Boolean(a.flags.json), { ...summary(ticket), body: ticket.body, comments }, () => {
    const s = summary(ticket);
    return [
      `${s.id} ${s.title}`,
      `  ${s.url}`,
      `  state ${s.state} · repo ${s.repo ?? "?"} · autonomy ${s.autonomy} · branch ${s.branchName}`,
      `  labels ${s.labels.join(", ") || "none"}`,
      `  blockers ${s.blockers.join(", ") || "none"}`,
    ].join("\n");
  });
  return 0;
}

// Claim as the first write: assign and start, comment, then read back. The
// oldest claim in the race window wins; a loser withdraws its comment.
async function ticketClaim(a: Args) {
  const id = idArg(a, "usage: factory ticket claim <ID>");
  const tracker = trackerFor(id);
  const { ticket } = await tracker.get(id);
  if (ticket.state !== "queued") throw new Exit(3, `${id} is ${ticket.stateName}: someone already took it`);
  if (!ticket.labels.includes(READY_LABEL)) throw new Exit(3, `${id} has no ${READY_LABEL} label`);
  await tracker.start(id);
  const where = str(a.flags.session) ?? sessionUrl();
  const mine = await tracker.comment(id, claimBody(where, `${runtime()}${where ? "" : ` (${hostname()})`}`));
  const winner = claimWinner((await tracker.get(id)).comments, mine);
  if (winner && winner !== mine) {
    await tracker.deleteComment(id, mine);
    throw new Exit(3, `${id} was claimed by another session first`);
  }
  print(Boolean(a.flags.json), summary(ticket), () => `claimed ${id}: branch ${ticket.branchName} in ${ticket.repo ?? "?"}, autonomy ${autonomy(ticket)}, PR body says "${ticket.closes}"`);
  return 0;
}

async function ticketHandback(a: Args) {
  const id = idArg(a, "usage: factory ticket handback <ID> --brief-file <path>");
  const file = str(a.flags["brief-file"]);
  if (!file) throw new Exit(64, "usage: factory ticket handback <ID> --brief-file <path>");
  const tracker = trackerFor(id);
  const { comments } = await tracker.get(id);
  await tracker.comment(id, readFileSync(file, "utf8").trim());
  // The claim belonged to this attempt; the next attempt claims afresh.
  for (const c of comments.filter(isClaim)) await tracker.deleteComment(id, c.id);
  const { labelled } = await tracker.handBack(id);
  console.log(`handed ${id} back${labelled ? ` (${HUMAN_LABEL})` : `; no ${HUMAN_LABEL} label exists in the tracker, create it`}`);
  return 0;
}

async function brief(a: Args) {
  const trackers = enabledTrackers(githubFor(repoArg(a)));
  if (!trackers.length) throw new Exit(1, "no tracker configured: set LINEAR_API_KEY, or FACTORY_GITHUB_REPOS for GitHub Issues");
  const tickets = (await Promise.all(trackers.map((t) => t.portfolio()))).flat();
  const weekAgo = Date.now() - 7 * 864e5;
  const prStatus = async (url: string) => {
    try {
      return (await statusOf(forge.resolvePr(url, undefined))).status;
    } catch {
      return null;
    }
  };
  const handedBack = tickets.filter((t) => t.labels.includes(HUMAN_LABEL) && (t.state === "queued" || t.state === "started"));
  const running = tickets.filter((t) => t.state === "started" && !handedBack.includes(t));
  // pstack's audit rule: progress is a side effect. Started, no PR and no
  // update for hours means the session died after claiming.
  const stalled = running.filter((t) => t.prs.length === 0 && Date.now() - Date.parse(t.updatedAt) > STALL_MS);
  const { ready, skipped } = nextTickets(tickets.filter((t) => t.labels.includes(READY_LABEL) && t.state === "queued"));
  const landed = tickets.filter((t) => t.completedAt && Date.parse(t.completedAt) > weekAgo);
  const runningWithPrs: (ReturnType<typeof summary> & { prs: { url: string; status: Status | null }[] })[] = [];
  for (const t of running) runningWithPrs.push({ ...summary(t), prs: await Promise.all(t.prs.map(async (u) => ({ url: u, status: await prStatus(u) }))) });
  const data = { handedBack: handedBack.map(summary), stalled: stalled.map(summary), running: runningWithPrs, queued: { ready: ready.map(summary), waiting: skipped }, landed: landed.map(summary) };
  print(Boolean(a.flags.json), data, () => {
    const out: string[] = ["## Needs you"];
    out.push(...handedBack.map((t) => `- ${t.id} ${t.title}: handed back`));
    out.push(...stalled.map((t) => `- ${t.id} ${t.title}: stalled, started with no PR and quiet for over 3h`));
    for (const r of runningWithPrs) {
      for (const p of r.prs) {
        if (p.status && (p.status.next === "human" || (p.status.verdict === "READY" && r.autonomy === "pr"))) {
          out.push(`- ${r.id} ${p.url}: ${p.status.verdict === "READY" ? "ready, waiting on your merge" : "waiting on a review"}`);
        }
      }
    }
    out.push(`## Running (${running.length})`, ...runningWithPrs.map((r) => `- ${r.id} ${r.title}${r.prs[0]?.status ? `: PR ${r.prs[0].status.verdict}` : ": no PR yet"}`));
    out.push(`## Queued (${ready.length} ready, ${skipped.length} waiting)`, ...ready.map((t) => `- ${t.id} ${t.title}`));
    out.push(`## Landed this week (${landed.length})`, ...landed.map((t) => `- ${t.id} ${t.title}`));
    return out.join("\n");
  });
  return 0;
}

type Check = { name: string; level: "ok" | "warn" | "fail"; detail: string };

// Every skill folder next to this one must also be in ~/.claude/skills.
export function expectedSkills(skillsDir = SKILLS_DIR): string[] {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => (d.isDirectory() || d.isSymbolicLink()) && existsSync(join(skillsDir, d.name, "SKILL.md")))
    .map((d) => d.name);
}

async function doctor(a: Args) {
  const checks: Check[] = [];
  const add = (name: string, level: Check["level"], detail: string) => checks.push({ name, level, detail });
  add("runtime", "ok", `${runtime()}, node ${process.version}`);
  const login = forge.viewer();
  add("gh", login ? "ok" : "fail", login ? `gh authenticated as ${login}` : "gh cannot reach GitHub: run `gh auth login` locally; in the cloud, connect GitHub to the session");

  const here = forge.currentRepo();
  const trackers = enabledTrackers(githubFor(here ? `${here.owner}/${here.repo}` : null));
  if (!trackers.length) add("trackers", "fail", "none: set LINEAR_API_KEY for Linear, FACTORY_GITHUB_REPOS=owner/a,owner/b for GitHub Issues");
  for (const t of trackers) {
    try {
      const who = await t.viewer();
      add(t.name, "ok", t.name === "github" ? `issues in ${(t as GithubTracker).repos.join(", ")} as ${who}` : `authenticated as ${who}`);
    } catch (e) {
      add(t.name, "fail", (e as Error).message);
    }
  }

  const skillsHome = join(homedir(), ".claude", "skills");
  const missing = expectedSkills().filter((s) => !existsSync(join(skillsHome, s, "SKILL.md")));
  add("skills", missing.length ? "fail" : "ok", missing.length ? `missing in ${skillsHome}: ${missing.join(", ")}` : `all ${expectedSkills().length} installed`);

  const repo = forge.currentRepo();
  const root = forge.repoRoot();
  if (repo && root) {
    const path = join(root, PROFILE_PATH);
    const profile = parseProfile(existsSync(path) ? readFileSync(path, "utf8") : null);
    add("profile", profile.found ? "ok" : "warn", profile.found
      ? `${PROFILE_PATH}: tracker ${profile.tracker ?? "?"}, max autonomy ${profile.maxAutonomy}, ${profile.gates.length} gate(s), ${profile.oneWayGlobs.length} one-way glob(s)`
      : `${repo.owner}/${repo.repo} has no ${PROFILE_PATH}: run /setup-factory`);
    const verify = profile.verifySkill ?? [".claude/skills", ".agents/skills"]
      .map((d) => join(root, d))
      .filter((d) => existsSync(d))
      .flatMap((d) => readdirSync(d).filter((n) => n.startsWith("verify-")).map((n) => join(d, n)))[0];
    add("verify-skill", verify ? "ok" : "warn", verify ? `${verify}` : "no verification skill: agents cannot see the app run, so autonomy stays at pr (run /create-verification-skill)");
  } else {
    add("repo", "warn", "not inside a GitHub clone: repo checks skipped");
  }

  print(Boolean(a.flags.json), checks, () => checks.map((c) => `${c.level.padEnd(4)}  ${c.name.padEnd(12)}  ${c.detail}`).join("\n"));
  return checks.some((c) => c.level === "fail") ? 1 : 0;
}

const HELP = `factory: deterministic helpers for the ticket → PR → merge factory

Tickets are ENG-123 (Linear), owner/repo#123 (GitHub Issues), or #123 inside a clone.

  factory doctor [--json]                     check gh, trackers, skills, repo profile, verify skill
  factory tickets next [--repo o/r|--here] [--json]
                                              tickets labelled ${READY_LABEL} whose blockers are done
  factory ticket show <ID> [--json]           normalized ticket: repo, autonomy, blockers, branch
  factory ticket claim <ID> [--session URL]   assign, start and comment; exit 3 if someone has it
  factory ticket handback <ID> --brief-file F comment the brief, swap to ${HUMAN_LABEL}, back to the queue
  factory pr status [PR] [--repo o/r] [--json]
                                              merge-readiness verdict; exit code encodes it
  factory pr watch [PR] [--interval 60]       one line per change until merged or closed
  factory pr verdict [PR] --sha SHA --result pass|fail [--summary-file F]
                                              record an independent verdict for the SHA the reviewers
                                              checked; exit 3 if the head has moved
  factory pr merge [PR] [--ticket ID] [--human-approved]
                                              merge only if the gate allows it; exit 3 with reasons if not.
                                              The ticket must be one the PR names (branch or Closes line)
  factory brief [--json]                      portfolio: needs you, running, queued, landed

Trackers: Linear when LINEAR_API_KEY is set (or \`linear auth login\` locally); GitHub Issues
for the repos in FACTORY_GITHUB_REPOS and any repo whose .agents/factory.md names GitHub.

Exit codes for pr status: READY 0, CONFLICT 2, THREADS 3, CI_FAILING 4, CHANGES_REQUESTED 5,
DRAFT 6, BEHIND 7, CI_PENDING 10, COMPUTING 11, AWAITING_REVIEW 12, MERGED 20, CLOSED 21.`;

export async function main(argv: string[]): Promise<number> {
  const a = parseArgs(argv);
  const [group, sub] = a._;
  const routes: Record<string, (a: Args) => Promise<number>> = {
    doctor,
    brief,
    "tickets next": ticketsNext,
    "ticket show": ticketShow,
    "ticket claim": ticketClaim,
    "ticket handback": ticketHandback,
    "pr status": prStatus,
    "pr watch": prWatch,
    "pr verdict": prVerdict,
    "pr merge": prMerge,
  };
  const route = routes[`${group} ${sub}`] ?? routes[group ?? ""];
  if (!route || a.flags.help) {
    console.log(HELP);
    return group && !a.flags.help ? 64 : 0;
  }
  try {
    return await route(a);
  } catch (e) {
    if (e instanceof Exit) {
      console.error(e.message);
      return e.code;
    }
    console.error(`factory: ${(e as Error).message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
