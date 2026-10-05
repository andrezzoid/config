import { describe, expect, test } from "bun:test";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
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
    // Bypasses found by the independent review:
    "/usr/local/bin/gh pr merge 5 --squash",
    '"gh" pr merge 5',
    "gh -R o/r pr merge 5",
    "gh --repo o/r pr merge 5",
    "gh --repo=o/r pr merge 5",
    'N=5; gh api -X PUT "repos/o/r/pulls/$N/merge"',
    "gh api graphql -f query='mutation{mergePullRequest(input:{pullRequestId:\"x\"}){clientMutationId}}'",
    "gh api graphql -f query='mutation{enablePullRequestAutoMerge(input:{}){clientMutationId}}'",
    "git push origin +HEAD:feature",
    "git -C . push --force origin x",
    "git push -fu origin x",
    // Bypasses found by the second review:
    "gh pr -R o/r merge 1",
    "gh pr --repo=o/r merge 3",
    "gh pr merge; git checkout main",
    "out=$(gh pr merge)",
    "gh pr merge&&git pull",
    "gh api -X PUT repos/o/r/pulls/3/merge;echo",
    "gh api -X PUT \\\n  repos/o/r/pulls/12/merge \\\n  -f merge_method=squash",
    "git push \\\n  --force origin feat",
    "gh pr \\\nmerge 1",
    "git status\ngh pr merge 1",
    "curl -X PUT -H 'Authorization: token x' https://api.github.com/repos/o/r/pulls/1/merge",
    'bash -c "gh pr merge 1"',
    "eval 'gh pr merge 1'",
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
    "git push --force-with-lease=feature origin feature",
    "git push --force-if-includes --force-with-lease origin feature",
    "git merge origin/main",
    "gh pr view 5 --json mergeable",
    "git commit -m 'Fix the merge gate' && git push -u origin fix",
    // False positives found by the second review:
    'git commit -m "Fix push retries: +1 attempt"',
    'git commit -m "hook: block push -f"',
    'git stash push -m "wip +tests"',
    "rg mergePullRequest src/",
    "git push --follow-tags",
    'git commit -m "first line\n\ngh pr merge happens in factory"',
    'git commit -m "explain why gh pr merge is gated"',
    "gh pr comment 3 --body 'run gh pr merge 3 when ready'",
  ])("allows %s", (command) => {
    expect(bash(command).code).toBe(0);
  });

  test("blocks the GitHub MCP merge tools", () => {
    expect(guard({ tool_name: "mcp__github__merge_pull_request", tool_input: { pullNumber: 1 } }).code).toBe(2);
    expect(guard({ tool_name: "mcp__github__enable_pr_auto_merge", tool_input: {} }).code).toBe(2);
    expect(guard({ tool_name: "mcp__github__pull_request_read", tool_input: {} }).code).toBe(0);
  });

  test("works without jq through the python fallback", () => {
    // A PATH holding only what the hook needs, minus jq.
    const bin = mkdtempSync(join(tmpdir(), "nojq-"));
    for (const tool of ["bash", "cat", "grep", "sed", "tr", "awk", "python3", "printf"]) {
      const real = Bun.which(tool);
      if (real) symlinkSync(real, join(bin, tool));
    }
    const run = (payload: unknown) =>
      Bun.spawnSync([join(bin, "bash"), GUARD], { stdin: new TextEncoder().encode(JSON.stringify(payload)), env: { PATH: bin }, stderr: "pipe" });
    expect(Bun.spawnSync([join(bin, "bash"), "-c", "command -v jq"], { env: { PATH: bin } }).exitCode).not.toBe(0);
    expect(run({ tool_name: "Bash", tool_input: { command: "gh pr merge 1" } }).exitCode).toBe(2);
    expect(run({ tool_name: "Bash", tool_input: { command: "gh pr view 1" } }).exitCode).toBe(0);
    expect(run({ tool_name: "mcp__github__merge_pull_request", tool_input: {} }).exitCode).toBe(2);
  });

  test("without jq or python it still blocks, matching the raw payload", () => {
    const bin = mkdtempSync(join(tmpdir(), "noparser-"));
    for (const tool of ["bash", "cat", "grep", "sed", "tr", "awk", "printf"]) {
      const real = Bun.which(tool);
      if (real) symlinkSync(real, join(bin, tool));
    }
    // Real payloads carry a description after the command.
    const run = (command: string, description = "Run it, +1 step") =>
      Bun.spawnSync([join(bin, "bash"), GUARD], {
        stdin: new TextEncoder().encode(JSON.stringify({ tool_name: "Bash", tool_input: { command, description } })),
        env: { PATH: bin },
        stderr: "pipe",
      }).exitCode;
    for (const blocked of ["gh pr merge", "git push origin feat --force", "git push origin feat -f", "gh api -X PUT repos/o/r/pulls/7/merge", "git status\ngh pr merge 1"]) {
      expect({ blocked, code: run(blocked) }).toEqual({ blocked, code: 2 });
    }
    for (const allowed of ["gh pr view 1", "git push -u origin feat"]) expect({ allowed, code: run(allowed, "Push feat, +1 commit") }).toEqual({ allowed, code: 0 });
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
