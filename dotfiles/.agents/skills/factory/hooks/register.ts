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
// and escapes removed. A command substitution ($(...) or backticks), including
// one inside an unquoted heredoc, comes back as commands of its own, as does
// the script `sh -c` or `eval` runs. Heredoc bodies are skipped otherwise:
// they are text, so an apostrophe or a quoted command in a commit message
// changes nothing.
export function commands(src: string): string[][] {
  const out = scan(src, 0, "").commands;
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

type Heredoc = { delimiter: string; strip: boolean; expands: boolean };

// Scans from `start` to the unquoted `close` (")" or "`" for a substitution,
// "" for the end of the line) and returns the commands found and where it
// stopped.
function scan(src: string, start: number, close: "" | ")" | "`"): { commands: string[][]; end: number } {
  const found: string[][] = [];
  let argv: string[] = [];
  let word = "";
  let inWord = false;
  let depth = 0;
  let heredocs: Heredoc[] = [];
  const endWord = () => {
    if (inWord) argv.push(word);
    word = "";
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (argv.length) found.push(argv);
    argv = [];
  };
  // Runs the substitution whose body starts at i and returns the index of its
  // closing character.
  const substitute = (i: number, closer: ")" | "`"): number => {
    const inner = scan(src, i, closer);
    found.push(...inner.commands);
    word += `${closer === ")" ? "$(" : "`"}${src.slice(i, inner.end)}${closer}`;
    inWord = true;
    return inner.end;
  };
  // Skips the bodies of the heredocs opened on the line that ends at i, and
  // returns the index of the newline after the last delimiter line.
  const skipHeredocs = (i: number): number => {
    for (const doc of heredocs) {
      for (;;) {
        const lineEnd = src.indexOf("\n", i + 1) === -1 ? src.length : src.indexOf("\n", i + 1);
        const line = src.slice(i + 1, lineEnd);
        if ((doc.strip ? line.replace(/^\t+/, "") : line) === doc.delimiter || lineEnd === src.length) {
          i = lineEnd;
          break;
        }
        if (doc.expands) {
          for (let k = i + 1; k < lineEnd; k++) {
            if (src.charAt(k) === "$" && src.charAt(k + 1) === "(") {
              const inner = scan(src, k + 2, ")");
              found.push(...inner.commands);
              k = inner.end;
            } else if (src.charAt(k) === "`") {
              const inner = scan(src, k + 1, "`");
              found.push(...inner.commands);
              k = inner.end;
            }
          }
        }
        i = lineEnd;
      }
    }
    heredocs = [];
    return i;
  };

  let i = start;
  for (; i < src.length; i++) {
    const c = src.charAt(i);
    if (close && c === close && (close === "`" || depth === 0)) {
      endCommand();
      return { commands: found, end: i };
    }
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
    else if (c === "<" && src.startsWith("<<<", i)) {
      endWord();
      i += 2;
    } else if (c === "<" && src.charAt(i + 1) === "<") {
      endWord();
      let j = i + 2;
      const strip = src.charAt(j) === "-";
      if (strip) j++;
      while (src.charAt(j) === " " || src.charAt(j) === "\t") j++;
      const quote = src.charAt(j);
      let delimiter = "";
      if (quote === "'" || quote === '"') {
        const end = src.indexOf(quote, j + 1);
        delimiter = src.slice(j + 1, end === -1 ? src.length : end);
        j = end === -1 ? src.length : end + 1;
      } else {
        while (j < src.length && !/[\s;&|()<>]/.test(src.charAt(j))) delimiter += src.charAt(j++);
      }
      const literal = quote === "'" || quote === '"' || delimiter.includes("\\");
      heredocs.push({ delimiter: delimiter.replaceAll("\\", ""), strip, expands: !literal });
      i = j - 1;
    } else if (c === "#" && !inWord) {
      while (i + 1 < src.length && src.charAt(i + 1) !== "\n") i++;
    } else if (c === " " || c === "\t") endWord();
    else if (c === "\n") {
      endCommand();
      if (heredocs.length) i = skipHeredocs(i);
    } else if (c === "(") {
      endCommand();
      depth++;
    } else if (c === ")") {
      endCommand();
      if (depth > 0) depth--;
    } else if (";&|".includes(c)) endCommand();
    else {
      word += c;
      inWord = true;
    }
  }
  endCommand();
  return { commands: found, end: i };
}

const basename = (w: string) => w.slice(w.lastIndexOf("/") + 1);
const RESERVED = new Set(["!", "{", "}", "if", "then", "else", "elif", "do", "while", "until", "time"]);
// Wrappers that run the command after them, each with the options that take
// a value, so `timeout -s KILL 60 gh ...` still reads as gh.
const WRAPPERS = new Map<string, Set<string>>([
  ["command", new Set()],
  ["builtin", new Set()],
  ["exec", new Set(["-a"])],
  ["nohup", new Set()],
  ["sudo", new Set(["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U", "-T"])],
  ["env", new Set(["-u", "--unset", "-C", "--chdir"])],
  ["nice", new Set(["-n", "--adjustment"])],
  ["xargs", new Set(["-I", "-n", "-P", "-L", "-d", "-E", "-s", "-a"])],
  ["timeout", new Set(["-s", "--signal", "-k", "--kill-after"])],
  ["stdbuf", new Set(["-i", "-o", "-e"])],
]);

// The command a simple command runs, past variable assignments, reserved
// words and wrappers such as `env FOO=1 timeout 60 gh ...`.
function effective(argv: string[]): string[] {
  const option = (w: string) => w.startsWith("-") || /^[A-Za-z_]\w*=/.test(w);
  let i = 0;
  for (let w = argv[i]; w !== undefined; w = argv[i]) {
    const takesValue = WRAPPERS.get(basename(w));
    if (/^[A-Za-z_]\w*=/.test(w) || RESERVED.has(w)) i++;
    else if (takesValue) {
      i++;
      while (option(argv[i] ?? "")) i += takesValue.has(argv[i] ?? "") ? 2 : 1;
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

// Why a tool call must not run, or null when it may. `command` is the shell
// command of any tool that runs one (Bash, Monitor).
export function guard(tool: string, command?: string): string | null {
  if (/^mcp__.+__(merge_pull_request|enable_pr_auto_merge)$/.test(tool)) return MERGE;
  if (!command) return null;
  for (const argv of commands(command)) {
    const reason = denyCommand(argv);
    if (reason) return reason;
  }
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
