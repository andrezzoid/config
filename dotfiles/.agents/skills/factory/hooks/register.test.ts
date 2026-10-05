// Runs under `claude plugin test`, against the engine's own tool-call path.
// The guard's cases live in test/guard.spec.ts, on Node.

import { expect, mock, test } from "claude-code/testing";

test("a raw merge is denied before the tool runs; other commands run", async ($, on) => {
  const ran: string[] = [];
  on("tool.call", { tool: "Bash" }, (_$, e) => {
    ran.push(e.command);
    return { result: { stdout: "", stderr: "", interrupted: false } };
  });
  const merge = await $.tool.call({ tool: "Bash", command: "gh pr merge 7 --squash" });
  expect(merge.deny).toContain("factory pr merge");
  await $.tool.call({ tool: "Bash", command: "gh pr view 7" });
  expect(ran).toEqual(["gh pr view 7"]);
});

test("the GitHub MCP merge tool is denied", async ($) => {
  const r = await $.tool.call({ tool: "mcp__github__merge_pull_request", owner: "o", repo: "r", pullNumber: 7 });
  expect(r.deny).toContain("factory pr merge");
});

test("session start puts bin on PATH once", async ($, on) => {
  const writes: Record<string, string | undefined>[] = [];
  mock.env(on, { PATH: "/usr/bin", HOME: "/home/x" });
  on("env.set", (_$, e) => {
    writes.push({ [e.name]: e.value });
    return { value: undefined };
  });
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  await $.session.start({ cwd: "/tmp", surface: null, isInteractive: false });
  expect(writes).toHaveLength(1);
  expect(writes[0]?.PATH).toMatch(/\/factory\/bin:\/usr\/bin$/);
});
