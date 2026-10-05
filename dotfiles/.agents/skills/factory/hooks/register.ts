// The factory as a Claude Code mod. It loads from the skill folder, so the same
// files work locally (stowed into ~/.claude/skills) and in cloud sessions
// (linked there by scripts/cloud-setup.sh), with nothing merged into
// settings.json.
//
// - session.start puts bin/ on PATH, so skills and subagents can run `factory`.
// - In cloud sessions it also re-runs cloud-setup.sh: the environment's setup
//   snapshot lives for about a week, and this keeps skills at the latest commit.
// - tool.call denies a merge that skips `factory pr merge`, and a plain force
//   push. That is a fence against an agent drifting onto the short path, not a
//   wall against one set on getting through: a script can still call the API.
//   The wall is the forge's own branch protection.

import type { Register } from "claude-code";

const MERGE =
  "merging goes through `factory pr merge <PR>`, which checks the forge, the verdict for the head SHA and the autonomy gate. " +
  "If André told you in words to merge, run `factory pr merge <PR> --human-approved`.";
const FORCE = "a plain force-push can destroy commits you have not seen. Use --force-with-lease.";

// Splits a shell command line into simple commands, each an argv with quotes
// and escapes removed. A command substitution ($(...) or backticks) comes back
// as commands of its own, as does the script `sh -c` or `eval` runs.
export function commands(src: string): string[][] {
  const out: string[][] = [];
  let argv: string[] = [];
  let word = "";
  let inWord = false;
  const endWord = () => {
    if (inWord) argv.push(word);
    word = "";
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (argv.length) out.push(argv);
    argv = [];
  };
  // Runs the substitution starting at i (just past "$(" or "`") and returns
  // the index of its closing character.
  const substitute = (i: number, close: string): number => {
    let depth = 1;
    let j = i;
    let quote = "";
    for (; j < src.length; j++) {
      const c = src.charAt(j);
      if (quote) {
        if (c === "\\" && quote === '"') j++;
        else if (c === quote) quote = "";
      } else if (c === "\\") j++;
      else if (c === "'" || c === '"') quote = c;
      else if (close === ")" && c === "(") depth++;
      else if (c === close && --depth === 0) break;
    }
    out.push(...commands(src.slice(i, j)));
    word += src.slice(i - (close === ")" ? 2 : 1), j + 1);
    inWord = true;
    return j;
  };

  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i);
    if (c === "\\") {
      if (src.charAt(i + 1) !== "\n" && i + 1 < src.length) {
        word += src.charAt(i + 1);
        inWord = true;
      }
      i++;
    } else if (c === "'") {
      const end = src.indexOf("'", i + 1);
      const stop = end === -1 ? src.length : end;
      word += src.slice(i + 1, stop);
      inWord = true;
      i = stop;
    } else if (c === '"') {
      inWord = true;
      for (i++; i < src.length && src.charAt(i) !== '"'; i++) {
        if (src.charAt(i) === "\\" && '"\\$`\n'.includes(src.charAt(i + 1))) {
          if (src.charAt(i + 1) !== "\n") word += src.charAt(i + 1);
          i++;
        } else if (src.charAt(i) === "$" && src.charAt(i + 1) === "(") i = substitute(i + 2, ")");
        else if (src.charAt(i) === "`") i = substitute(i + 1, "`");
        else word += src.charAt(i);
      }
    } else if (c === "$" && src.charAt(i + 1) === "(") i = substitute(i + 2, ")");
    else if (c === "`") i = substitute(i + 1, "`");
    else if (c === "#" && !inWord) {
      while (i + 1 < src.length && src.charAt(i + 1) !== "\n") i++;
    } else if (c === " " || c === "\t") endWord();
    else if ("\n;&|()".includes(c)) endCommand();
    else {
      word += c;
      inWord = true;
    }
  }
  endCommand();

  // What sh -c and eval run is a command line of its own.
  for (const argv of [...out]) {
    const core = effective(argv);
    const name = basename(core[0] ?? "");
    if (/^(ba|z|da|k)?sh$/.test(name)) {
      const flag = core.findIndex((w, i) => i > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(w));
      const script = flag > 0 ? core[flag + 1] : undefined;
      if (script !== undefined) out.push(...commands(script));
    } else if (name === "eval") out.push(...commands(core.slice(1).join(" ")));
  }
  return out;
}

const basename = (w: string) => w.slice(w.lastIndexOf("/") + 1);
const RESERVED = new Set(["!", "{", "}", "if", "then", "else", "elif", "do", "while", "until", "time"]);
const WRAPPERS = new Set(["command", "builtin", "exec", "nohup", "sudo", "env", "nice", "xargs", "timeout", "stdbuf"]);

// The command a simple command runs, past variable assignments, reserved
// words and wrappers such as `env FOO=1 timeout 60 gh ...`.
function effective(argv: string[]): string[] {
  const option = (w: string) => w.startsWith("-") || /^[A-Za-z_]\w*=/.test(w);
  let i = 0;
  for (let w = argv[i]; w !== undefined; w = argv[i]) {
    if (/^[A-Za-z_]\w*=/.test(w) || RESERVED.has(w)) i++;
    else if (WRAPPERS.has(basename(w))) {
      i++;
      while (option(argv[i] ?? "")) i++;
      if (basename(w) === "timeout" && i < argv.length) i++;
    } else break;
  }
  return argv.slice(i);
}

// Positional words, skipping flags and the value of each flag that takes one.
function positionals(args: string[], takesValue: Set<string>): string[] {
  const out: string[] = [];
  let value = false;
  for (const a of args) {
    if (value) value = false;
    else if (takesValue.has(a)) value = true;
    else if (!a.startsWith("-")) out.push(a);
  }
  return out;
}

const MERGE_ROUTE = /pulls\/[^/\s?]+\/(merge|ccr\/auto_merge)(\?|$)/;
const MERGE_MUTATION = /mergePullRequest|enablePullRequestAutoMerge/;
const GH_VALUE_FLAGS = new Set(["-R", "--repo", "--hostname"]);
const GIT_VALUE_FLAGS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);

function denyCommand(argv: string[]): string | null {
  const [cmd, ...args] = effective(argv);
  const name = basename(cmd ?? "");
  if (name === "gh") {
    const [group, sub] = positionals(args, GH_VALUE_FLAGS);
    if (group === "pr" && sub === "merge") return MERGE;
    if (group === "api" && args.some((a) => MERGE_ROUTE.test(a) || MERGE_MUTATION.test(a))) return MERGE;
  }
  if (["curl", "wget", "http", "https", "xh"].includes(name) && args.some((a) => a.includes("api.github.com"))) {
    if (args.some((a) => MERGE_ROUTE.test(a.replace(/^https?:\/\/[^/]+\//, "")) || MERGE_MUTATION.test(a))) return MERGE;
  }
  if (name === "git") {
    if (positionals(args, GIT_VALUE_FLAGS)[0] === "push") {
      // --force, -f in a flag cluster (-fu), or a +refspec. --force-with-lease
      // and --force-if-includes are the safe forms.
      const rest = args.slice(args.indexOf("push") + 1);
      if (rest.some((a) => a === "--force" || /^-[A-Za-z]*f[A-Za-z]*$/.test(a) || /^\+./.test(a))) return FORCE;
    }
  }
  return null;
}

// Why a tool call must not run, or null when it may.
export function guard(tool: string, command?: string): string | null {
  if (/^mcp__.+__(merge_pull_request|enable_pr_auto_merge)$/.test(tool)) return MERGE;
  if (tool !== "Bash" || !command) return null;
  for (const argv of commands(command)) {
    const reason = denyCommand(argv);
    if (reason) return reason;
  }
  return null;
}

export const register: Register = (on) => {
  on("tool.call", ($, e, next) => {
    const reason = guard(e.tool, e.tool === "Bash" ? e.command : undefined);
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
