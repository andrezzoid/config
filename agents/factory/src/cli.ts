#!/usr/bin/env bun
// factory: the deterministic half of the factory. Skills hold the judgment;
// this CLI computes ticket readiness, PR merge-readiness and the merge gate,
// so every session, local or cloud, reaches the same answer the same way.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import * as gh from "./gh";
import * as L from "./linear";
import { decide, EXIT, fingerprint, mergeGate, renderMarker, type Status } from "./pr";
import { parseProfile, PROFILE_PATH, type Profile } from "./profile";
import {
  autonomy,
  blockers,
  claimBody,
  claimWinner,
  HUMAN_LABEL,
  labelNames,
  nextTickets,
  READY_LABEL,
  repoOf,
  ticketFromBranch,
  type Issue,
} from "./tickets";

const AGENTS_DIR = join(import.meta.dir, "..", "..");
const STALL_MS = 3 * 3600_000;

type Args = { _: string[]; flags: Record<string, string | true> };

export function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) out.flags[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out.flags[k] = argv[++i];
      else out.flags[k] = true;
    } else out._.push(a);
  }
  return out;
}

const str = (v: string | true | undefined) => (typeof v === "string" ? v : undefined);
const runtime = () => (process.env.CLAUDE_CODE_REMOTE === "true" ? "cloud" : "local");

function sessionUrl(): string | null {
  const id = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
  if (id?.startsWith("cse_")) return `https://claude.ai/code/session_${id.slice(4)}`;
  return null;
}

class Exit extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

function print(json: boolean, data: unknown, human: () => string) {
  console.log(json ? JSON.stringify(data, null, 2) : human());
}

// The profile is read from the base branch, never the PR's working tree: a
// branch must not be able to grant itself merge autonomy.
function profileFor(ref: gh.Repo, baseRef?: string): Profile {
  const path = baseRef ? `${PROFILE_PATH}?ref=${encodeURIComponent(baseRef)}` : PROFILE_PATH;
  return parseProfile(gh.readRepoFile(ref, path));
}

function statusOf(ref: gh.Repo & { number: number }): { status: Status; profile: Profile } {
  const pull = gh.api<any>(`repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`);
  const profile = profileFor(ref, pull.base.ref);
  let status = decide(gh.prFacts(ref, ref.number, profile.oneWayGlobs));
  if (status.verdict === "COMPUTING") {
    Bun.sleepSync(3000);
    status = decide(gh.prFacts(ref, ref.number, profile.oneWayGlobs));
  }
  return { status, profile };
}

function statusLine(s: Status): string {
  const lines = [`#${s.pr} ${s.verdict} → ${s.next}  ${s.title}`, `  ${s.url}  head ${s.headSha.slice(0, 7)}`];
  for (const b of s.blockers) lines.push(`  - ${b}`);
  lines.push(`  verification: ${s.verification.status}${s.verification.result ? ` (${s.verification.result})` : ""}`);
  if (s.oneWayTouched.length) lines.push(`  one-way doors touched: ${s.oneWayTouched.join(", ")}`);
  return lines.join("\n");
}

async function prStatus(a: Args) {
  const ref = gh.resolvePr(a._[2], str(a.flags.repo));
  const { status } = statusOf(ref);
  print(Boolean(a.flags.json), status, () => statusLine(status));
  return EXIT[status.verdict];
}

// One line per change, nothing while nothing moves: built for the Monitor
// tool, which turns each line into a wake-up.
async function prWatch(a: Args) {
  const ref = gh.resolvePr(a._[2], str(a.flags.repo));
  const interval = Number(str(a.flags.interval) ?? 60) * 1000;
  let last = "";
  let failures = 0;
  for (;;) {
    try {
      const { status } = statusOf(ref);
      failures = 0;
      const fp = fingerprint(status);
      if (fp !== last) {
        const at = new Date().toISOString().slice(11, 19);
        console.log(`${at} #${status.pr} ${fp} next=${status.next}${status.blockers.length ? ` | ${status.blockers.join("; ")}` : ""}`);
        last = fp;
      }
      if (status.next === "done") return EXIT[status.verdict];
      await Bun.sleep(interval);
    } catch (e) {
      failures++;
      console.log(`error (${failures}): ${(e as Error).message}`);
      if (failures >= 5) return 1;
      await Bun.sleep(Math.min(interval * 2 ** failures, 300_000));
    }
  }
}

async function prVerdict(a: Args) {
  const result = str(a.flags.result);
  if (result !== "pass" && result !== "fail") throw new Exit(64, "--result pass|fail is required");
  const ref = gh.resolvePr(a._[2], str(a.flags.repo));
  const pull = gh.api<any>(`repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`);
  const summaryFile = str(a.flags["summary-file"]);
  const summary = summaryFile ? readFileSync(summaryFile, "utf8").trim() : `Verification ${result}.`;
  const body = `${summary}\n\n${renderMarker(pull.head.sha, gh.patchId(ref, ref.number), result)}`;
  gh.api(`repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments`, { method: "POST", body: { body } });
  console.log(`recorded ${result} for #${ref.number} at ${pull.head.sha.slice(0, 7)}`);
  return 0;
}

async function prMerge(a: Args) {
  const ref = gh.resolvePr(a._[2], str(a.flags.repo));
  const { status, profile } = statusOf(ref);
  const ticketId = str(a.flags.ticket) ?? ticketFromBranch(status.headRef);
  let ticketAutonomy: "merge" | "pr" | null = null;
  if (ticketId) {
    try {
      ticketAutonomy = autonomy(await L.getIssue(ticketId));
    } catch {
      ticketAutonomy = null;
    }
  }
  const gate = mergeGate({
    status,
    ticketAutonomy,
    repoMaxAutonomy: profile.maxAutonomy,
    humanApproved: a.flags["human-approved"] === true,
  });
  if (!gate.allowed) {
    console.log(`refusing to merge #${status.pr}:\n${gate.reasons.map((r) => `  - ${r}`).join("\n")}`);
    return 3;
  }
  gh.api(`repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/merge`, {
    method: "PUT",
    body: { merge_method: profile.mergeMethod, sha: status.headSha },
  });
  console.log(`merged #${status.pr} (${profile.mergeMethod}) at ${status.headSha.slice(0, 7)}`);
  return 0;
}

function issueSummary(i: Issue) {
  return {
    identifier: i.identifier,
    title: i.title,
    url: i.url,
    state: i.state.name,
    repo: repoOf(i),
    autonomy: autonomy(i),
    branchName: i.branchName,
    labels: labelNames(i),
    blockers: blockers(i).map((b) => `${b.identifier} (${b.state.name ?? b.state.type})`),
  };
}

async function ticketsNext(a: Args) {
  const repoFlag = str(a.flags.repo) ?? (a.flags.here ? (() => {
    const r = gh.currentRepo();
    return r ? `${r.owner}/${r.repo}` : undefined;
  })() : undefined);
  const { ready, skipped } = nextTickets(await L.readyIssues(), { repo: repoFlag });
  const data = { ready: ready.map(issueSummary), skipped };
  print(Boolean(a.flags.json), data, () => {
    if (!ready.length) return `no ticket is ready${repoFlag ? ` for ${repoFlag}` : ""} (${skipped.length} labelled but waiting)`;
    return ready.map((i) => `${i.identifier}  ${repoOf(i)}  autonomy:${autonomy(i)}  ${i.title}`).join("\n");
  });
  return 0;
}

async function ticketShow(a: Args) {
  const id = a._[2];
  if (!id) throw new Exit(64, "usage: factory ticket show <ID>");
  const issue = await L.getIssue(id);
  const data = { ...issueSummary(issue), description: issue.description, comments: issue.comments.nodes };
  print(Boolean(a.flags.json), data, () => {
    const s = issueSummary(issue);
    return [
      `${s.identifier} ${s.title}`,
      `  ${s.url}`,
      `  state ${s.state} · repo ${s.repo ?? "?"} · autonomy ${s.autonomy} · branch ${s.branchName}`,
      `  labels ${s.labels.join(", ") || "none"}`,
      `  blockers ${s.blockers.join(", ") || "none"}`,
    ].join("\n");
  });
  return 0;
}

async function ticketClaim(a: Args) {
  const id = a._[2];
  if (!id) throw new Exit(64, "usage: factory ticket claim <ID>");
  const issue = await L.getIssue(id);
  if (!["triage", "backlog", "unstarted"].includes(issue.state.type)) {
    throw new Exit(3, `${issue.identifier} is ${issue.state.name}: someone already took it`);
  }
  if (!labelNames(issue).includes(READY_LABEL)) throw new Exit(3, `${issue.identifier} has no ${READY_LABEL} label`);
  const me = await L.viewerId();
  const started = await L.firstState(issue.team.id, "started");
  await L.updateIssue(issue.id, { assigneeId: me.id, ...(started ? { stateId: started } : {}) });
  const where = str(a.flags.session) ?? sessionUrl();
  const mine = await L.comment(issue.id, claimBody(where, `${runtime()}${where ? "" : ` (${hostname()})`}`));
  const winner = claimWinner((await L.getIssue(id)).comments.nodes);
  if (winner && winner !== mine) {
    await L.deleteComment(mine);
    throw new Exit(3, `${issue.identifier} was claimed by another session first`);
  }
  print(Boolean(a.flags.json), issueSummary(issue), () =>
    `claimed ${issue.identifier}: work on branch ${issue.branchName} in ${repoOf(issue) ?? "?"} (autonomy ${autonomy(issue)})`);
  return 0;
}

async function ticketHandback(a: Args) {
  const id = a._[2];
  const file = str(a.flags["brief-file"]);
  if (!id || !file) throw new Exit(64, "usage: factory ticket handback <ID> --brief-file <path>");
  const issue = await L.getIssue(id);
  await L.comment(issue.id, readFileSync(file, "utf8").trim());
  const labelled = await L.swapLabels(issue, READY_LABEL, HUMAN_LABEL);
  const todo = await L.firstState(issue.team.id, "unstarted");
  if (todo) await L.updateIssue(issue.id, { stateId: todo });
  console.log(`handed ${issue.identifier} back${labelled ? ` (${HUMAN_LABEL})` : `; no ${HUMAN_LABEL} label exists in Linear, create it`}`);
  return 0;
}

async function brief(a: Args) {
  const issues = await L.briefIssues();
  const weekAgo = Date.now() - 7 * 864e5;
  const prsOf = (i: Issue) => i.attachments.nodes.map((n) => n.url).filter((u) => /github\.com\/.+\/pull\/\d+/.test(u));
  const prStatus = (url: string) => {
    try {
      return statusOf(gh.resolvePr(url, undefined)).status;
    } catch {
      return null;
    }
  };
  const handedBack = issues.filter((i) => labelNames(i).includes(HUMAN_LABEL) && !["completed", "canceled"].includes(i.state.type));
  const running = issues.filter((i) => i.state.type === "started" && !handedBack.includes(i));
  const { ready, skipped } = nextTickets(issues.filter((i) => labelNames(i).includes(READY_LABEL)));
  const landed = issues.filter((i) => i.completedAt && Date.parse(i.completedAt) > weekAgo);
  const runningWithPrs = running.map((i) => ({ ...issueSummary(i), prs: prsOf(i).map((u) => ({ url: u, status: prStatus(u) })) }));
  // pstack's audit rule: progress is a side effect. Started, no PR and no
  // update for hours means the session died after claiming.
  const stalled = running.filter((i) => prsOf(i).length === 0 && i.updatedAt && Date.now() - Date.parse(i.updatedAt) > STALL_MS);
  const data = {
    handedBack: handedBack.map(issueSummary),
    stalled: stalled.map(issueSummary),
    running: runningWithPrs,
    queued: { ready: ready.map(issueSummary), waiting: skipped },
    landed: landed.map(issueSummary),
  };
  print(Boolean(a.flags.json), data, () => {
    const out: string[] = [];
    out.push(`## Needs you`, ...handedBack.map((i) => `- ${i.identifier} ${i.title} — handed back`));
    out.push(...stalled.map((i) => `- ${i.identifier} ${i.title} — stalled: started, no PR, quiet for over 3h`));
    for (const r of runningWithPrs) {
      for (const p of r.prs) {
        if (p.status && (p.status.next === "human" || (p.status.verdict === "READY" && r.autonomy === "pr"))) {
          out.push(`- ${r.identifier} ${p.url} — ${p.status.verdict === "READY" ? "ready, waiting on your merge" : "waiting on a review"}`);
        }
      }
    }
    out.push(`## Running (${running.length})`);
    for (const r of runningWithPrs) {
      const pr = r.prs[0]?.status;
      out.push(`- ${r.identifier} ${r.title}${pr ? ` — PR ${pr.verdict}` : " — no PR yet"}`);
    }
    out.push(`## Queued (${ready.length} ready, ${skipped.length} waiting)`, ...ready.map((i) => `- ${i.identifier} ${i.title}`));
    out.push(`## Landed this week (${landed.length})`, ...landed.map((i) => `- ${i.identifier} ${i.title}`));
    return out.join("\n");
  });
  return 0;
}

type Check = { name: string; level: "ok" | "warn" | "fail"; detail: string };

export function expectedSkills(agentsDir = AGENTS_DIR): string[] {
  const own = readdirSync(join(agentsDir, "skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const manifest = readFileSync(join(agentsDir, "skills.txt"), "utf8")
    .split("\n")
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter(Boolean)
    .flatMap((l) => l.split(/\s+/).slice(1));
  return [...own, ...manifest];
}

async function doctor(a: Args) {
  const checks: Check[] = [];
  const add = (name: string, level: Check["level"], detail: string) => checks.push({ name, level, detail });
  add("runtime", "ok", `${runtime()}, bun ${Bun.version}`);

  const login = gh.viewer();
  add("github", login ? "ok" : "fail", login ? `gh authenticated as ${login}` : "gh cannot reach GitHub: run `gh auth login` locally; in the cloud, connect GitHub to the session");

  try {
    const me = await L.viewerId();
    add("linear", "ok", `authenticated as ${me.name}`);
  } catch (e) {
    add("linear", "fail", (e as Error).message);
  }

  const skillsDir = join(homedir(), ".claude", "skills");
  const missing = expectedSkills().filter((s) => !existsSync(join(skillsDir, s, "SKILL.md")));
  add("skills", missing.length ? "fail" : "ok", missing.length ? `missing in ${skillsDir}: ${missing.join(", ")} (run agents/install.sh)` : `all ${expectedSkills().length} installed`);

  const repo = gh.currentRepo();
  const root = gh.repoRoot();
  if (repo && root) {
    const profileText = existsSync(join(root, PROFILE_PATH)) ? readFileSync(join(root, PROFILE_PATH), "utf8") : null;
    const profile = parseProfile(profileText);
    add("profile", profile.found ? "ok" : "warn", profile.found
      ? `${PROFILE_PATH}: max autonomy ${profile.maxAutonomy}, ${profile.gates.length} gate(s), ${profile.oneWayGlobs.length} one-way glob(s)`
      : `${repo.owner}/${repo.repo} has no ${PROFILE_PATH}: run /setup-factory`);
    const verify = profile.verifySkill ?? [".claude/skills", ".cursor/skills"]
      .map((d) => join(root, d))
      .filter((d) => existsSync(d))
      .flatMap((d) => readdirSync(d).filter((n) => n.startsWith("verify-")).map((n) => join(d, n)))[0];
    add("verify-skill", verify ? "ok" : "warn", verify
      ? `${verify}`
      : "no verification skill: agents cannot see the app run, so autonomy stays at pr (run /create-verification-skill)");
  } else {
    add("repo", "warn", "not inside a GitHub clone: repo checks skipped");
  }

  print(Boolean(a.flags.json), checks, () => checks.map((c) => `${c.level.padEnd(4)}  ${c.name.padEnd(12)}  ${c.detail}`).join("\n"));
  return checks.some((c) => c.level === "fail") ? 1 : 0;
}

const HELP = `factory — deterministic helpers for the ticket → PR → merge factory

  factory doctor [--json]                     check gh, Linear, skills, repo profile, verify skill
  factory tickets next [--repo o/r|--here] [--json]
                                              tickets labelled ${READY_LABEL} whose blockers are done
  factory ticket show <ID> [--json]           normalized ticket: repo, autonomy, blockers, branch
  factory ticket claim <ID> [--session URL]   assign, start and comment; exit 3 if someone has it
  factory ticket handback <ID> --brief-file F comment the brief, swap to ${HUMAN_LABEL}, back to Todo
  factory pr status [PR] [--repo o/r] [--json]
                                              merge-readiness verdict; exit code encodes it
  factory pr watch [PR] [--interval 60]       one line per change until merged or closed
  factory pr verdict [PR] --result pass|fail [--summary-file F]
                                              record an independent verdict for the head SHA
  factory pr merge [PR] [--ticket ID] [--human-approved]
                                              merge only if the gate allows it; exit 3 with reasons if not
  factory brief [--json]                      portfolio: needs you, running, queued, landed

Exit codes for pr status: READY 0, CONFLICT 2, THREADS 3, CI_FAILING 4, CHANGES_REQUESTED 5,
DRAFT 6, BEHIND 7, CI_PENDING 10, COMPUTING 11, AWAITING_REVIEW 12, MERGED 20, CLOSED 21.`;

export async function main(argv: string[]): Promise<number> {
  const a = parseArgs(argv);
  const [group, sub] = a._;
  const routes: Record<string, (a: Args) => Promise<number>> = {
    "doctor": doctor,
    "brief": brief,
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

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
