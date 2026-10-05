// Structural checks on my own skills. `claude plugin validate` accepts
// malformed YAML frontmatter, and `npx skills` silently skips it, so parse it
// strictly here and check every reference a skill makes.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const AGENTS = join(import.meta.dir, "..");
const SKILLS = join(AGENTS, "skills");
const own = readdirSync(SKILLS).filter((n) => existsSync(join(SKILLS, n, "SKILL.md")));
const thirdParty = readFileSync(join(AGENTS, "skills.txt"), "utf8")
  .split("\n")
  .filter((l) => /^[^\s#]+#[0-9a-f]{40}\s/.test(l))
  .flatMap((l) => l.split(/\s+/).slice(1));
const installed = new Set([...own, ...thirdParty]);
// Third-party frontmatter is only known once installed; HARNESS_HOME points
// at an installed home (default: this machine's).
const installedSkills = join(process.env.HARNESS_HOME ?? homedir(), ".claude", "skills");

// The Skill tool cannot fire a skill marked disable-model-invocation.
function modelInvocable(name: string): boolean | null {
  const path = own.includes(name) ? join(SKILLS, name, "SKILL.md") : join(installedSkills, name, "SKILL.md");
  if (!existsSync(path)) return null;
  return frontmatter(readFileSync(path, "utf8"))["disable-model-invocation"] !== true;
}

function frontmatter(text: string): Record<string, unknown> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error("no frontmatter");
  return Bun.YAML.parse(m[1]) as Record<string, unknown>;
}

// "Call the Skill tool with "x"", "call it with "y"", wrapped across lines or not.
function skillCalls(text: string): string[] {
  const flat = text.replace(/\s+/g, " ");
  return [...flat.matchAll(/call (?:the skill tool|it) (?:with|for|twice, for) ((?:"[\w-]+"(?:,? (?:and |or )?)?)+)/gi)]
    .flatMap((m) => [...m[1].matchAll(/"([\w-]+)"/g)].map((x) => x[1]));
}

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? markdownFiles(join(dir, e.name)) : e.name.endsWith(".md") ? [join(dir, e.name)] : [],
  );
}

describe.each(own)("skill %s", (name) => {
  const dir = join(SKILLS, name);
  const text = readFileSync(join(dir, "SKILL.md"), "utf8");

  test("frontmatter parses strictly, names the folder, and describes when to use it", () => {
    const fm = frontmatter(text);
    expect(fm.name).toBe(name);
    expect(typeof fm.description).toBe("string");
    expect((fm.description as string).length).toBeGreaterThan(20);
    expect((fm.description as string).length).toBeLessThanOrEqual(1024);
  });

  test("every referenced file exists", () => {
    for (const file of markdownFiles(dir)) {
      const body = readFileSync(file, "utf8");
      const refs = [
        ...[...body.matchAll(/`((?:references|playbooks|scripts)\/[\w./-]+\.md)`/g)].map((m) => m[1]),
        ...[...body.matchAll(/\]\(((?!https?:|#)[^)\s]+\.md)\)/g)].map((m) => m[1]),
      ];
      for (const ref of refs) {
        // Paths in backticks are relative to the skill; markdown links to the file.
        const base = ref.startsWith("references/") ? dir : dirname(file);
        expect({ file: file.replace(AGENTS, "agents"), ref, exists: existsSync(resolve(base, ref)) }).toMatchObject({ exists: true });
      }
    }
  });

  test("every skill it calls is installed by the harness", () => {
    const calls = skillCalls(text);
    expect(calls.length > 0 || !/skill tool/i.test(text)).toBe(true);
    for (const called of calls) {
      expect({ called, installed: installed.has(called) }).toEqual({ called, installed: true });
      expect({ called, invocable: modelInvocable(called) ?? "not installed here" }).not.toEqual({ called, invocable: false });
    }
  });

  test("names no retired skill or command", () => {
    for (const retired of ["ddd2", "setup-factory-skills", "check-pr", "find-unknowns", "quiz-me", "visualize", "design-it-twice", "worktrunk", "zellij"]) {
      expect({ retired, mentioned: new RegExp(`[\`/"]${retired}[\`"\\s]`).test(text) }).toEqual({ retired, mentioned: false });
    }
  });
});

test("skills that other skills chain are model-invocable; human entry points are not", () => {
  const invocable = (n: string) => frontmatter(readFileSync(join(SKILLS, n, "SKILL.md"), "utf8"))["disable-model-invocation"] !== true;
  for (const chained of ["implement", "babysit-pr", "poke-holes", "complexity-red-flags"]) expect({ chained, ok: invocable(chained) }).toEqual({ chained, ok: true });
  for (const entry of ["to-spec", "to-tickets", "factory", "setup-factory"]) expect({ entry, ok: !invocable(entry) }).toEqual({ entry, ok: true });
});
