import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { cut, isPrompt, said, search, show } from "../scripts/sessions.ts";

const at = { cwd: "/repo/strata", gitBranch: "main", sessionId: "s1", timestamp: "2026-10-01T10:00:00Z" };
const typed = (uuid: string, parentUuid: string | null, content: unknown, extra = {}) =>
  ({ type: "user", uuid, parentUuid, ...at, message: { content }, ...extra });
const answer = (uuid: string, parentUuid: string, block: unknown) =>
  ({ type: "assistant", uuid, parentUuid, ...at, message: { content: [block] } });

// Shaped like real transcripts: bookkeeping lines without a uuid, a meta
// prompt carrying a skill body, an attachment, and a prompt that was
// interrupted and asked again, which leaves an abandoned branch in the file.
const EVENTS = [
  { type: "queue-operation", operation: "enqueue" },                                                             // 1
  typed("u1", null, "fix the touched-since bug"),                                                                 // 2
  typed("m1", "u1", [{ type: "text", text: "skill body" }], { isMeta: true }),                                    // 3
  { type: "attachment", uuid: "t1", parentUuid: "m1", ...at, attachment: { type: "instructions" } },             // 4
  answer("a1", "t1", { type: "text", text: "Looking at the filter." }),                                          // 5
  answer("a2", "a1", { type: "tool_use", name: "Edit", input: { file_path: "test/scan.test.ts" } }),             // 6
  { type: "last-prompt", leafUuid: "a2" },                                                                        // 7
  typed("r1", "a2", [{ type: "tool_result", content: "edited" }]),                                               // 8
  typed("p1", "r1", "now also rename the flag"),                                                                  // 9  abandoned
  answer("a3", "p1", { type: "text", text: "Renaming." }),                                                       // 10 abandoned
  typed("i1", "a3", [{ type: "text", text: "[Request interrupted by user]" }]),                                   // 11 abandoned
  typed("p2", "r1", [{ type: "text", text: "Hold on.\n\nwhy did you edit the test?" }], { timestamp: "2026-10-01T10:05:00Z" }), // 12
  answer("a4", "p2", { type: "text", text: "To make it pass." }),                                                // 13
  typed("n1", "a4", "<task-notification> done </task-notification>", { origin: { kind: "task-notification" } }), // 14
  typed("s1", null, "subagent brief", { isSidechain: true }),                                                     // 15
  typed("c1", "a4", "<command-message>implement</command-message>\n<command-name>/implement</command-name>\n<command-args>#12</command-args>"), // 16
  typed("k1", "a4", "Summary: why did you edit the test?", { isCompactSummary: true }),                          // 17
];

function home(events: object[] = EVENTS): string {
  const root = mkdtempSync(join(tmpdir(), "sessions-"));
  mkdirSync(join(root, "projects", "-repo-strata"), { recursive: true });
  writeFileSync(join(root, "projects", "-repo-strata", "s1.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return join(root, "projects");
}
const file = (root: string) => join(root, "-repo-strata", "s1.jsonl");

describe("reading events", () => {
  test("only typed turns, assistant text, tool calls and results say anything", () => {
    assert.deepEqual(EVENTS.map((e) => said(e).length), [0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
    assert.equal(said(EVENTS[5])[0], 'tool Edit: {"file_path":"test/scan.test.ts"}');
  });

  test("a prompt is a turn André typed: not meta, a summary, a result, an interrupt, a notification or a subagent brief", () => {
    const prompts = EVENTS.map((e, i) => (isPrompt(e) ? i + 1 : 0)).filter(Boolean);
    assert.deepEqual(prompts, [2, 9, 12, 16]);
  });
});

describe("search", () => {
  test("finds a tool call by its input and names it as file:line", () => {
    const [hit, ...rest] = search(home(), /Edit: .*test\//);
    assert.equal(rest.length, 0);
    assert.match(hit.file, /s1\.jsonl$/);
    assert.equal(hit.line, 6);
    assert.equal(hit.cwd, "/repo/strata");
  });

  test("matches across the lines of a multi-line message", () => {
    assert.deepEqual(search(home(), /^user: .*why did you/).map((h) => h.line), [12]);
  });

  test("reads the newest sessions first and skips subagent transcripts", () => {
    const root = home();
    const older = join(root, "-repo-strata", "s0.jsonl");
    writeFileSync(older, JSON.stringify(typed("x", null, "fix the touched-since bug")) + "\n");
    utimesSync(older, new Date(Date.now() - 86_400_000), new Date(Date.now() - 86_400_000));
    mkdirSync(join(root, "-repo-strata", "s1", "subagents"), { recursive: true });
    writeFileSync(join(root, "-repo-strata", "s1", "subagents", "a.jsonl"), JSON.stringify(typed("y", null, "fix the touched-since bug")) + "\n");
    assert.deepEqual(search(root, /touched-since/).map((h) => h.file.split("/").pop()), ["s1.jsonl", "s0.jsonl"]);
    assert.deepEqual(search(root, /touched-since/, { limit: 1 }).map((h) => h.file.split("/").pop()), ["s1.jsonl"]);
  });

  test("skips transcripts older than the window and outside the project filter", () => {
    const root = home();
    const old = new Date("2020-01-01");
    utimesSync(file(root), old, old);
    assert.equal(search(root, /touched/).length, 0);
    assert.equal(search(home(), /touched/, { project: "omnia" }).length, 0);
  });
});

describe("show", () => {
  test("marks the line and counts only events that say something", () => {
    const out = show(file(home()), 8, 2, 1);
    assert.deepEqual(out.split("\n").map((l) => l.slice(0, 4)), ["  5 ", "  6 ", "> 8 ", "  9 "]);
  });
});

describe("cut", () => {
  test("keeps exactly the prompt's ancestors, dropping bookkeeping and the abandoned branch", () => {
    const root = home();
    const out = join(root, "case", "history.jsonl");
    const c = cut(file(root), 12, out);
    assert.equal(c.prompt, "Hold on.\n\nwhy did you edit the test?");
    assert.equal(c.timestamp, "2026-10-01T10:05:00Z");
    const kept = readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l).uuid);
    assert.deepEqual(kept, ["u1", "m1", "t1", "a1", "a2", "r1"]);
  });

  test("turns a slash-command prompt back into the command André typed", () => {
    const root = home();
    assert.equal(cut(file(root), 16, join(root, "h.jsonl")).prompt, "/implement #12");
  });

  test("refuses a line that is not a prompt, and names the prompt before it", () => {
    assert.throws(() => cut(file(home()), 11, "/dev/null"), /prompt before it is line 9/);
    assert.throws(() => cut(file(home()), 14, "/dev/null"), /prompt before it is line 12/);
  });
});

describe("the command line", () => {
  // Stow installs every skill behind symlinks, so the script must run when
  // started through one.
  test("works when started through a symlink, and says when it hit the limit", () => {
    const root = home();
    const link = join(mkdtempSync(join(tmpdir(), "link-")), "sessions.ts");
    symlinkSync(join(import.meta.dirname, "..", "scripts", "sessions.ts"), link);
    const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", link, "search", "touched|why did", "--limit", "1"], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: join(root, "..") },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /s1\.jsonl:2 /);
    assert.match(r.stdout, /limit of 1 reached/);
  });

  test("reports a bad reference with exit code 2", () => {
    const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", join(import.meta.dirname, "..", "scripts", "sessions.ts"), "show", "no-line"], { encoding: "utf8" });
    assert.equal(r.status, 2);
  });
});
