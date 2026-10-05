import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { merge } from "../factory/src/settings";

const GUARD = join(import.meta.dir, "..", "hooks", "guard-merge.sh");

function guard(payload: unknown, env: Record<string, string> = {}) {
  const p = Bun.spawnSync(["bash", GUARD], {
    stdin: new TextEncoder().encode(JSON.stringify(payload)),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  return { code: p.exitCode, err: p.stderr.toString() };
}
const bash = (command: string) => guard({ tool_name: "Bash", tool_input: { command } });

describe("guard-merge", () => {
  test.each([
    "gh pr merge 12 --squash",
    "cd repo && gh pr merge --auto",
    "gh api repos/o/r/pulls/12/merge -X PUT",
    "gh api --method PUT repos/o/r/pulls/12/ccr/auto_merge",
    "git push --force origin feature",
    "git push -f",
  ])("blocks %s", (command) => {
    const r = bash(command);
    expect(r.code).toBe(2);
    expect(r.err).toContain("BLOCKED");
  });

  test.each([
    "factory pr merge 12",
    "factory pr merge 12 --human-approved",
    "gh pr view 12",
    "gh api repos/o/r/pulls/12/reviews",
    "git push --force-with-lease origin feature",
    "git push -u origin andre/eng-1-merge-thing",
    "echo 'gh pr merges are gated'",
  ])("allows %s", (command) => {
    expect(bash(command).code).toBe(0);
  });

  test("blocks the GitHub MCP merge tools", () => {
    expect(guard({ tool_name: "mcp__github__merge_pull_request", tool_input: { pullNumber: 1 } }).code).toBe(2);
    expect(guard({ tool_name: "mcp__github__enable_pr_auto_merge", tool_input: {} }).code).toBe(2);
    expect(guard({ tool_name: "mcp__github__pull_request_read", tool_input: {} }).code).toBe(0);
  });

  test("works without jq through the python fallback", () => {
    const p = Bun.spawnSync(["bash", "-c", `PATH=/usr/bin:/bin; hash -r; command -v jq >/dev/null && exit 99; bash "${GUARD}"`], {
      stdin: new TextEncoder().encode(JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh pr merge 1" } })),
    });
    // /usr/bin may hold jq on this machine; the fallback is only provable without it.
    if (p.exitCode !== 99) expect(p.exitCode).toBe(2);
  });
});

describe("settings merge", () => {
  test("adds harness hooks once, keeps everything else", () => {
    const base = { model: "x", hooks: { PreToolUse: [{ matcher: "Edit", hooks: [] }] } };
    const once = merge(base, "/root/.local/share/agent-harness");
    const twice = merge(once, "/root/.local/share/agent-harness");
    expect(twice).toEqual(once);
    expect(twice.model).toBe("x");
    expect(twice.hooks.PreToolUse).toHaveLength(2);
    expect(twice.hooks.SessionStart[0].matcher).toBe("startup");
  });
});
