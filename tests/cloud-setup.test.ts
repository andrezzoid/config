// scripts/cloud-setup.sh into an empty home, cloned from this repo's committed
// HEAD: the cloud must end up with what stow gives the Mac.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "scripts", "cloud-setup.sh");
const branch = spawnSync("git", ["-C", ROOT, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).stdout.trim();

function setup(home: string) {
  const r = spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, HARNESS_REPO: ROOT, HARNESS_REF: branch },
  });
  assert.equal(r.status, 0, r.stderr);
  return r;
}

test("links every skill, every agent and CLAUDE.md into ~/.claude, and ~/.agents, then prunes", () => {
  const home = mkdtempSync(join(tmpdir(), "cloud-home-"));
  const clone = join(home, ".agent-config", "dotfiles");
  assert.match(setup(home).stdout, /\d+ links into ~\/\.claude from [0-9a-f]{7}/);

  const skills = readdirSync(join(clone, ".claude", "skills"));
  assert.ok(skills.includes("factory") && skills.includes("implement"));
  for (const s of skills) {
    const source = join(clone, ".claude", "skills", s);
    const link = join(home, ".claude", "skills", s);
    // A mod kept in another repo dangles until that repo is cloned beside this one.
    if (!existsSync(source)) {
      assert.throws(() => lstatSync(link), s);
      continue;
    }
    assert.ok(lstatSync(link).isSymbolicLink(), s);
    assert.equal(readlinkSync(link), realpathSync(source));
    // A skill links to its folder in .agents/skills; a Claude Code-only mod is
    // anything else there.
    const skill = existsSync(join(clone, ".agents", "skills", s, "SKILL.md"));
    assert.ok(existsSync(join(link, skill ? "SKILL.md" : ".claude-plugin/plugin.json")), s);
  }
  for (const a of readdirSync(join(clone, ".claude", "agents"))) assert.ok(existsSync(join(home, ".claude", "agents", a)), a);
  assert.equal(readlinkSync(join(home, ".claude", "CLAUDE.md")), realpathSync(join(clone, ".agents", "AGENTS.md")));
  assert.equal(readlinkSync(join(home, ".agents")), join(clone, ".agents"));
  // The factory mod and its CLI come along with the skill.
  assert.ok(existsSync(join(home, ".claude", "skills", "factory", ".claude-plugin", "plugin.json")));
  assert.ok(existsSync(join(home, ".claude", "skills", "factory", "bin", "factory")));
  // Nothing Mac-only.
  assert.ok(!existsSync(join(home, ".claude", "settings.json")));

  // A re-run is what every cloud session start does: it keeps working, and a
  // skill removed upstream loses its link.
  rmSync(join(clone, ".claude", "skills", "grill-me"));
  setup(home);
  assert.ok(!existsSync(join(home, ".claude", "skills", "grill-me")));
  assert.ok(existsSync(join(home, ".claude", "skills", "implement", "SKILL.md")));
  rmSync(home, { recursive: true, force: true });
});

test("skips a link whose target is missing, and says so", () => {
  const home = mkdtempSync(join(tmpdir(), "cloud-home-"));
  setup(home);
  symlinkSync("../../../../elsewhere/mods/ghost", join(home, ".agent-config", "dotfiles", ".claude", "skills", "ghost"));
  const r = setup(home);
  assert.throws(() => lstatSync(join(home, ".claude", "skills", "ghost")));
  assert.match(r.stderr, /skills\/ghost points at \.\.\/\.\.\/\.\.\/\.\.\/elsewhere\/mods\/ghost, which is missing; skipped/);
  assert.ok(existsSync(join(home, ".claude", "skills", "implement", "SKILL.md")));
  rmSync(home, { recursive: true, force: true });
});

test("leaves a real CLAUDE.md or skill folder alone, and says so", () => {
  const home = mkdtempSync(join(tmpdir(), "cloud-home-"));
  mkdirSync(join(home, ".claude", "skills", "implement"), { recursive: true });
  writeFileSync(join(home, ".claude", "CLAUDE.md"), "my notes");
  const r = setup(home);
  assert.equal(readFileSync(join(home, ".claude", "CLAUDE.md"), "utf8"), "my notes");
  assert.ok(!lstatSync(join(home, ".claude", "skills", "implement")).isSymbolicLink());
  assert.ok(!existsSync(join(home, ".claude", "skills", "implement", "implement")));
  assert.match(r.stderr, /CLAUDE\.md is a real file or folder, left alone/);
  assert.match(r.stderr, /skills\/implement is a real file or folder, left alone/);
  rmSync(home, { recursive: true, force: true });
});
