import { describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CORRECTION, clip, humanText, projectDirs, sessionFiles, turns } from "./transcripts.ts"

const FUTURE = "2099-01-01T10:00:00Z"
const user = (content: unknown, extra: object = {}) => ({ type: "user", message: { content }, timestamp: FUTURE, ...extra })
const agent = (text: string) => ({ type: "assistant", message: { content: [{ type: "text", text }] }, timestamp: FUTURE })

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "transcripts-"))
  const project = join(root, "-tmp-proj")
  mkdirSync(join(project, "sess1", "subagents"), { recursive: true })
  const lines = [
    user("add a retry to the fetcher", { cwd: "/tmp/proj", gitBranch: "feat", origin: { kind: "human" } }),
    agent("I added a nil check around the response so it no longer crashes."),
    user([{ type: "tool_result", content: "ok" }]),
    user("no, don't guard it. find why it's nil<system-reminder>harness text</system-reminder>", { origin: { kind: "human" } }),
    user([{ type: "text", text: "Caveat: meta" }], { isMeta: true }),
    user("<command-message>implement is running</command-message>\n<command-name>/implement</command-name>\n<command-args>ENG-12</command-args>"),
    user("subagent prompt, you're wrong", { isSidechain: true }),
    user("This session is being continued... don't do X", { isCompactSummary: true, isVisibleInTranscriptOnly: true }),
    user("[Request interrupted by user]"),
  ]
  writeFileSync(join(project, "sess1.jsonl"), [...lines.map((l) => JSON.stringify(l)), "not json"].join("\n"))
  writeFileSync(join(project, "sess1", "subagents", "agent-x.jsonl"), JSON.stringify(user("never seen")))
  return { root, project }
}

describe("transcripts", () => {
  it("keeps only the human's words, with the agent text each one answered", () => {
    const { project } = fixture()
    const got = [...turns(sessionFiles([project], 100_000), 100_000)].map((t) => [t.text, t.after])
    expect(got).toEqual([
      ["add a retry to the fetcher", ""],
      ["no, don't guard it. find why it's nil", "I added a nil check around the response so it no longer crashes."],
      ["/implement ENG-12", ""],
      ["[Request interrupted by user]", ""],
    ])
  })

  it("flags corrections and passes ordinary asks", () => {
    expect(CORRECTION.test("no, don't guard it")).toBe(true)
    expect(CORRECTION.test("[Request interrupted by user]")).toBe(true)
    expect(CORRECTION.test("add a retry to the fetcher")).toBe(false)
  })

  it("drops harness records", () => {
    expect(humanText(user("x", { isMeta: true }))).toBeNull()
    expect(humanText(user("x", { origin: { kind: "task-notification" } }))).toBeNull()
    expect(humanText(user([{ type: "tool_result", content: "ok" }]))).toBeNull()
  })

  it("finds the project by slug, then by recorded cwd", () => {
    const { root, project } = fixture()
    expect(projectDirs(root, "all")).toEqual([project])
    expect(() => projectDirs(root, "/definitely/not/here")).toThrow()
  })

  it("clips to a tail, and to nothing at zero", () => {
    expect(clip("a  b\nc", 0)).toBe("")
    expect(clip("one two three", 5, true)).toBe("…three")
    expect(clip("one two three", 5)).toBe("one t…")
  })
})
