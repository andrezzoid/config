// scripts/cloud-setup.sh into an empty home, cloned from this repo's committed
// HEAD: the cloud must end up with what stow gives the Mac.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readdirSync, readlinkSync, realpathSync, rmSync } from "node:fs";
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
  assert.match(setup(home).stdout, /skills linked from [0-9a-f]{7}/);

  const skills = readdirSync(join(clone, ".claude", "skills"));
  assert.ok(skills.includes("factory") && skills.includes("implement"));
  for (const s of skills) {
    const link = join(home, ".claude", "skills", s);
    assert.ok(lstatSync(link).isSymbolicLink(), s);
    assert.equal(readlinkSync(link), realpathSync(join(clone, ".agents", "skills", s)));
    assert.ok(existsSync(join(link, "SKILL.md")), s);
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
