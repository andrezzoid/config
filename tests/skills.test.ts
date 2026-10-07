// Structural checks on the skills. `claude plugin validate` accepts malformed
// YAML frontmatter, and `npx skills` silently skips it, so my own skills'
// frontmatter is parsed strictly here, and every reference a skill makes and
// every symlink the harness relies on is checked.

import assert from "node:assert/strict";
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, test } from "node:test";

const DOTFILES = join(import.meta.dirname, "..", "dotfiles");
const AGENTS = join(DOTFILES, ".agents");
const SKILLS = join(AGENTS, "skills");
const CLAUDE = join(DOTFILES, ".claude");
const all = readdirSync(SKILLS).filter((n) => existsSync(join(SKILLS, n, "SKILL.md")));
const vendored = Object.keys(JSON.parse(readFileSync(join(AGENTS, ".skill-lock.json"), "utf8")).skills);
// Pinned upstream so an update can be diffed, but edited here: they get the
// same checks as my own skills.
const FORKS = ["to-spec", "to-tickets", "triage"];
// Bundled with Claude Code, so every session has them without a folder here.
const BUILTINS = ["run"];
const own = all.filter((n) => !vendored.includes(n) || FORKS.includes(n));

// The YAML subset skill frontmatter needs: `key: value` scalars, quoted
// strings and block scalars. Anything else throws, so a description with a
// stray ": " fails here instead of silently disabling the skill.
export function frontmatter(text: string): Record<string, unknown> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error("no frontmatter");
  const lines = m[1].split("\n");
  const out: Record<string, unknown> = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([\w-]+):(?: (.*))?$/.exec(lines[i]);
    if (!kv) throw new Error(`line ${i + 2} is not a top-level key: ${lines[i]}`);
    const [, key, raw = ""] = kv;
    const value = raw.trim();
    if (/^[|>][-+]?$/.test(value)) {
      const block: string[] = [];
      while (i + 1 < lines.length && /^(\s+\S|\s*$)/.test(lines[i + 1])) block.push(lines[++i].trim());
      out[key] = block.join(value.startsWith("|") ? "\n" : " ").trim();
    } else if (value.startsWith('"')) {
      out[key] = JSON.parse(value);
    } else if (value.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(value)) throw new Error(`${key}: unterminated single-quoted string`);
      out[key] = value.slice(1, -1).replaceAll("''", "'");
    } else if (/: | #|^[[{&*!%@`]/.test(value)) {
      throw new Error(`${key}: plain value needs quoting: ${value}`);
    } else {
      out[key] = value === "true" ? true : value === "false" ? false : value;
    }
  }
  return out;
}

// Third-party frontmatter can use any YAML; only this one flag matters here.
function modelInvocable(name: string): boolean {
  const head = /^---\n([\s\S]*?)\n---\n/.exec(readFileSync(join(SKILLS, name, "SKILL.md"), "utf8"))?.[1] ?? "";
  return !/^disable-model-invocation:\s*true\s*$/m.test(head);
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

test("the frontmatter checker rejects what YAML rejects", () => {
  assert.throws(() => frontmatter("---\nname: x\ndescription: Do this: then that\n---\n"), /needs quoting/);
  assert.throws(() => frontmatter("---\nname: x\ndescription: \"unterminated\n---\n"));
  assert.deepEqual(frontmatter("---\nname: x\ndescription: |\n  two\n  lines\nflag: true\n---\n"), { name: "x", description: "two\nlines", flag: true });
});

for (const name of own) {
  describe(`skill ${name}`, () => {
    const dir = join(SKILLS, name);
    const text = readFileSync(join(dir, "SKILL.md"), "utf8");

    test("frontmatter parses strictly, names the folder, and describes when to use it", () => {
      const fm = frontmatter(text);
      assert.equal(fm.name, name);
      assert.equal(typeof fm.description, "string");
      const length = (fm.description as string).length;
      assert.ok(length > 20 && length <= 1024, `description is ${length} characters`);
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
          assert.ok(existsSync(resolve(base, ref)), `${file.replace(AGENTS, ".agents")} references missing ${ref}`);
        }
      }
    });

    test("every skill it calls is installed and model-invocable", () => {
      const calls = skillCalls(text);
      assert.ok(calls.length > 0 || !/skill tool/i.test(text), "mentions the Skill tool but no call parses");
      for (const called of calls.filter((c) => !BUILTINS.includes(c))) {
        assert.ok(all.includes(called), `calls ${called}, which is not in .agents/skills`);
        assert.ok(modelInvocable(called), `calls ${called}, which sets disable-model-invocation`);
      }
    });

    test("names no retired skill or command", () => {
      for (const retired of ["ddd2", "setup-factory-skills", "check-pr", "find-unknowns", "quiz-me", "visualize", "design-it-twice", "worktrunk", "zellij", "docs/agents/factory.md", "create-verification-skill"]) {
        assert.ok(!new RegExp(`[\`/"]${retired}[\`"\\s]`).test(text), `mentions ${retired}`);
      }
    });
  });
}

test("skills that other skills chain are model-invocable; human entry points are not", () => {
  for (const chained of ["implement", "babysit-pr", "poke-holes", "complexity-red-flags"]) assert.ok(modelInvocable(chained), chained);
  for (const entry of ["to-spec", "to-tickets", "triage", "factory", "setup-factory", "hillclimb"]) assert.ok(!modelInvocable(entry), entry);
});

describe("layout", () => {
  // Claude Code reads ~/.claude/skills; other harnesses read ~/.agents/skills.
  // Stow links both, and cloud-setup.sh copies the same links into a cloud
  // home, so one edit in .agents/skills reaches every harness.
  test("every skill has a relative link in .claude/skills and no link dangles", () => {
    const links = readdirSync(join(CLAUDE, "skills"));
    assert.deepEqual(links.sort(), [...all].sort());
    for (const n of links) {
      const path = join(CLAUDE, "skills", n);
      assert.ok(lstatSync(path).isSymbolicLink(), `${n} is not a symlink`);
      assert.equal(readlinkSync(path), `../../.agents/skills/${n}`);
    }
  });

  test("CLAUDE.md is AGENTS.md", () => {
    assert.equal(readlinkSync(join(CLAUDE, "CLAUDE.md")), "../.agents/AGENTS.md");
  });

  test("every vendored skill in the lock is committed", () => {
    for (const n of vendored) assert.ok(all.includes(n), `${n} is in .skill-lock.json but not in .agents/skills`);
  });
});
