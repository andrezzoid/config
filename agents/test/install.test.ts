// install.sh against throwaway HOMEs, with a fake npx so no network is used.

import { beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const AGENTS = realpathSync(join(import.meta.dir, ".."));
const INSTALL = join(AGENTS, "install.sh");
const manifest = readFileSync(join(AGENTS, "skills.txt"), "utf8")
  .split("\n")
  .filter((l) => /^[^\s#]+#[0-9a-f]{40}\s/.test(l));
const thirdParty = manifest.flatMap((l) => l.split(/\s+/).slice(1));
const own = readdirSync(join(AGENTS, "skills")).filter((n) => existsSync(join(AGENTS, "skills", n, "SKILL.md")));

let home: string;
let bin: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "harness-home-"));
  bin = join(home, "fakebin");
  mkdirSync(bin);
  // Fake npx: install each --skill as a directory with a SKILL.md, log the call.
  writeFileSync(join(bin, "npx"), `#!/usr/bin/env bash
echo "$*" >> "$HOME/npx.log"
args=("$@")
for ((i=0; i<\${#args[@]}; i++)); do
  if [ "\${args[$i]}" = "--skill" ]; then n="\${args[$((i+1))]}"; mkdir -p "$HOME/.claude/skills/$n"; echo "---
name: $n
---" > "$HOME/.claude/skills/$n/SKILL.md"; fi
done
`);
  chmodSync(join(bin, "npx"), 0o755);
});

function run(args: string[] = [], env: Record<string, string> = {}) {
  const p = Bun.spawnSync(["bash", INSTALL, ...args], {
    env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, CLAUDE_CODE_REMOTE: "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

const npxCalls = () => (existsSync(join(home, "npx.log")) ? readFileSync(join(home, "npx.log"), "utf8").trim().split("\n") : []);
const isLink = (p: string) => existsSync(p) && lstatSync(p).isSymbolicLink();

describe("local install", () => {
  test("links every own skill, CLAUDE.md, subagents and factory; installs pinned third-party skills", () => {
    const r = run();
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    for (const name of own) {
      expect(existsSync(join(home, ".claude/skills", name, "SKILL.md"))).toBe(true);
      expect(isLink(join(home, ".agents/skills", name))).toBe(true);
    }
    for (const name of thirdParty) expect(existsSync(join(home, ".claude/skills", name, "SKILL.md"))).toBe(true);
    expect(readFileSync(join(home, ".claude/CLAUDE.md"), "utf8")).toContain("Call me André");
    expect(existsSync(join(home, ".claude/agents/codebase-locator.md"))).toBe(true);
    expect(isLink(join(home, ".local/bin/factory"))).toBe(true);
    expect(npxCalls()).toHaveLength(manifest.length);
    expect(npxCalls()[0]).toMatch(/^-y skills@[\d.]+ add mattpocock\/skills#[0-9a-f]{40} --skill grilling .* -g -a claude-code -y$/);
    expect(run(["--check"]).code).toBe(0);
  });

  test("own and third-party skill names never collide", () => {
    expect(own.filter((n) => thirdParty.includes(n))).toEqual([]);
  });

  test("migrates the old stow layout: dangling folded dirs become real, stale links go, foreign files stay", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    symlinkSync("Projects/config/dotfiles/.agents", join(home, ".agents"));
    symlinkSync("../Projects/config/dotfiles/.claude/CLAUDE.md", join(home, ".claude/CLAUDE.md"));
    symlinkSync("../Projects/config/dotfiles/.claude/commands", join(home, ".claude/commands"));
    mkdirSync(join(home, ".claude/skills"));
    symlinkSync("../../Projects/config/dotfiles/.claude/skills/ddd2", join(home, ".claude/skills/ddd2"));
    mkdirSync(join(home, ".claude/skills/my-own"));
    writeFileSync(join(home, ".claude/skills/my-own/SKILL.md"), "mine");
    symlinkSync("/somewhere/else", join(home, ".claude/skills/foreign"));

    const r = run();
    expect(r.code).toBe(0);
    expect(lstatSync(join(home, ".agents")).isDirectory()).toBe(true);
    expect(existsSync(join(home, ".claude/skills/ddd2"))).toBe(false);
    expect(isLink(join(home, ".claude/skills/ddd2"))).toBe(false);
    expect(existsSync(join(home, ".claude/commands"))).toBe(false);
    expect(readFileSync(join(home, ".claude/skills/my-own/SKILL.md"), "utf8")).toBe("mine");
    expect(readlinkSync(join(home, ".claude/skills/foreign"))).toBe("/somewhere/else");
    expect(readFileSync(join(home, ".claude/CLAUDE.md"), "utf8")).toContain("Call me André");
  });

  test("a real CLAUDE.md is backed up, never overwritten", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude/CLAUDE.md"), "precious");
    expect(run().code).toBe(0);
    const backup = readdirSync(join(home, ".claude")).find((f) => f.startsWith("CLAUDE.md.bak-"))!;
    expect(readFileSync(join(home, ".claude", backup), "utf8")).toBe("precious");
  });

  test("--quick skips npx when the manifest is unchanged and nothing is missing", () => {
    run();
    const before = npxCalls().length;
    expect(run(["--quick"]).out).toContain("third-party skills unchanged");
    expect(npxCalls()).toHaveLength(before);
  });

  test("--check fails and names what is missing", () => {
    run();
    Bun.spawnSync(["rm", "-rf", join(home, ".claude/skills/grilling")]);
    const r = run(["--check"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("missing skill: grilling");
  });
});

describe("cloud install", () => {
  test("skips Mac-only skills and merges hooks into existing settings, idempotently", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude/settings.json"), JSON.stringify({ theme: "dark", hooks: { Stop: [{ hooks: [] }] } }));
    expect(run(["--cloud"]).code).toBe(0);
    expect(run(["--cloud"]).code).toBe(0);
    expect(existsSync(join(home, ".claude/skills/rem-cli"))).toBe(false);
    expect(existsSync(join(home, ".agents/skills"))).toBe(false);
    const s = JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"));
    expect(s.theme).toBe("dark");
    expect(s.hooks.Stop).toHaveLength(1);
    expect(s.hooks.SessionStart).toHaveLength(1);
    expect(s.hooks.PreToolUse).toHaveLength(1);
    expect(s.hooks.PreToolUse[0].hooks[0].command).toContain("agent-harness/hooks/guard-merge.sh");
  });
});

describe("--bump", () => {
  test("moves each pin to the source's HEAD and leaves comments alone", () => {
    const copy = mkdtempSync(join(tmpdir(), "harness-agents-"));
    Bun.spawnSync(["cp", "-R", `${AGENTS}/.`, copy]);
    writeFileSync(join(bin, "git"), `#!/usr/bin/env bash
if [ "$1" = ls-remote ]; then echo "${"d".repeat(40)}	HEAD"; else exec /usr/bin/git "$@"; fi
`);
    chmodSync(join(bin, "git"), 0o755);
    const p = Bun.spawnSync(["bash", join(copy, "install.sh"), "--bump"], {
      env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` },
      stdout: "pipe",
    });
    expect(p.exitCode).toBe(0);
    const bumped = readFileSync(join(copy, "skills.txt"), "utf8");
    expect(bumped.match(/#d{40} /g)).toHaveLength(manifest.length);
    expect(bumped).toContain("# Third-party skills");
  });
});
