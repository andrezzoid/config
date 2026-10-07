import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { cut, isPrompt, main, said, search, show } from "../scripts/sessions.ts";

const at = { cwd: "/repo/strata", gitBranch: "main", sessionId: "s1", timestamp: "2026-10-01T10:00:00Z" };
const EVENTS = [
  { type: "queue-operation", operation: "enqueue" },
  { type: "user", ...at, message: { content: "fix the touched-since bug" } },
  { type: "user", isMeta: true, ...at, message: { content: [{ type: "text", text: "skill body" }] } },
  { type: "user", isCompactSummary: true, ...at, message: { content: "Summary: why did you edit the test?" } },
  { type: "assistant", ...at, message: { content: [{ type: "text", text: "Looking at the filter." }] } },
  { type: "assistant", ...at, message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "test/scan.test.ts" } }] } },
  { type: "user", ...at, message: { content: [{ type: "tool_result", content: "edited" }] } },
  { type: "user", ...at, timestamp: "2026-10-01T10:05:00Z", message: { content: [{ type: "text", text: "Hold on.\n\nwhy did you edit the test?" }] } },
  { type: "assistant", ...at, message: { content: [{ type: "text", text: "To make it pass." }] } },
];

function home(): string {
  const root = mkdtempSync(join(tmpdir(), "sessions-"));
  mkdirSync(join(root, "projects", "-repo-strata"), { recursive: true });
  writeFileSync(join(root, "projects", "-repo-strata", "s1.jsonl"), EVENTS.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return join(root, "projects");
}

describe("reading events", () => {
  test("only typed turns, assistant text, tool calls and results say anything", () => {
    assert.deepEqual(EVENTS.map((e) => said(e).length), [0, 1, 0, 0, 1, 1, 1, 1, 1]);
    assert.deepEqual(said({ type: "attachment" }), []);
    assert.equal(said(EVENTS[5])[0], 'tool Edit: {"file_path":"test/scan.test.ts"}');
  });

  test("a prompt is a turn the human typed, never a meta prompt, a compaction summary or a tool result", () => {
    assert.deepEqual(EVENTS.map(isPrompt), [false, true, false, false, false, false, false, true, false]);
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
    assert.deepEqual(search(home(), /^user: .*why did you/).map((h) => h.line), [8]);
  });

  test("skips transcripts older than the window and outside the project filter", () => {
    const root = home();
    const old = new Date("2020-01-01");
    utimesSync(join(root, "-repo-strata", "s1.jsonl"), old, old);
    assert.equal(search(root, /touched/).length, 0);
    assert.equal(search(home(), /touched/, { project: "omnia" }).length, 0);
  });
});

describe("show", () => {
  test("marks the line and counts only events that say something", () => {
    const out = show(join(home(), "-repo-strata", "s1.jsonl"), 6, 1, 1);
    assert.deepEqual(out.split("\n").map((l) => l.slice(0, 4)), ["  5 ", "> 6 ", "  7 "]);
  });
});

describe("cut", () => {
  test("keeps every event before the prompt and returns the prompt to replay", () => {
    const root = home();
    const out = join(root, "case", "history.jsonl");
    const c = cut(join(root, "-repo-strata", "s1.jsonl"), 8, out);
    assert.equal(c.prompt, "Hold on.\n\nwhy did you edit the test?");
    assert.equal(c.timestamp, "2026-10-01T10:05:00Z");
    assert.equal(readFileSync(out, "utf8").trim().split("\n").length, 7);
  });

  test("refuses a line that is not a prompt, and names the prompt before it", () => {
    assert.throws(() => cut(join(home(), "-repo-strata", "s1.jsonl"), 6, "/dev/null"), /prompt before it is line 2/);
  });

  test("the CLI reports a bad reference with exit code 2", () => {
    const err = console.error;
    console.error = () => {};
    try {
      assert.equal(main(["show", "no-line-number"]), 2);
    } finally {
      console.error = err;
    }
  });
});
