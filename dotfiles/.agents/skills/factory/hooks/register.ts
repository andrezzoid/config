// The factory as a Claude Code mod. It loads from the skill folder, so the same
// files work locally (stowed into ~/.claude/skills) and in cloud sessions
// (linked there by scripts/cloud-setup.sh), with nothing merged into
// settings.json.
//
// - session.start puts bin/ on PATH, so skills and subagents can run `factory`.
// - In cloud sessions it also re-runs cloud-setup.sh: the environment's setup
//   snapshot lives for about a week, and this keeps skills at the latest commit.
// - tool.call denies a merge that skips `factory pr merge`, and a plain force
//   push. The match is coarse on purpose: it is a fence against an agent
//   drifting onto the short path, so a commit message that quotes a merge
//   command trips it too. The wall is the forge's own branch protection.

import type { Register } from "claude-code";

const MERGE = "merging goes through `factory pr merge <PR>`, which checks the pull request first and clears its ticket's labels after.";
const FORCE = "a plain force-push can destroy commits you have not seen. Use --force-with-lease.";
const RAW_MERGE = [/\bgh\s+pr\s+merge\b/, /\bpulls\/\d+\/merge\b/, /\bccr\/auto_merge\b/, /\bmergePullRequest\b/, /\benablePullRequestAutoMerge\b/];
// `git push` (or `git -C dir push`) with --force, a flag cluster holding -f,
// or a +refspec. --force-with-lease and --force-if-includes are the safe forms.
const FORCE_PUSH = /\bgit\s+(?:-[Cc]\s+\S+\s+)*push\b[^;&|\n]*\s(?:--force(?![-\w])|-[A-Za-z]*f[A-Za-z]*\b|\+\S)/;

// Why a tool call must not run, or null when it may. `command` is the shell
// command of any tool that runs one (Bash, Monitor).
export function guard(tool: string, command?: string): string | null {
  if (/^mcp__.+__(merge_pull_request|enable_pr_auto_merge)$/.test(tool)) return MERGE;
  if (command && RAW_MERGE.some((re) => re.test(command))) return MERGE;
  if (command && FORCE_PUSH.test(command)) return FORCE;
  return null;
}

export const register: Register = (on) => {
  on("tool.call", ($, e, next) => {
    const command: unknown = (e as { command?: unknown }).command;
    const reason = guard(e.tool, typeof command === "string" ? command : undefined);
    return reason ? { deny: `BLOCKED: ${reason}` } : next(e);
  });

  on("session.start", async ($, e, next) => {
    const bin = `${$.plugin.root}/bin`;
    const path = (await $.env.get("PATH")) ?? "";
    if (!path.split(":").includes(bin)) await $.env.set("PATH", `${bin}:${path}`);
    if ((await $.env.get("CLAUDE_CODE_REMOTE")) === "true") {
      const home = await $.env.get("HOME");
      // In the background: a stale harness beats a slow or failed start.
      void $.process.run(["bash", `${home}/.agent-config/scripts/cloud-setup.sh`], { timeoutMs: 120_000 }).catch(() => undefined);
    }
    return next(e);
  });
};
