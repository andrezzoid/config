// The merge guard in hooks/register.ts: a coarse fence that catches the usual
// ways an agent would merge or force-push, not a parser that rules out every
// spelling of them.

import { describe, test } from "node:test";
import { guard } from "../hooks/register.ts";
import { expect } from "./expect.ts";

const bash = (command: string) => guard("Bash", command);

describe("guard", () => {
  for (const command of [
    "gh pr merge 12 --squash",
    "cd repo && gh pr merge --auto",
    "/usr/local/bin/gh pr merge 5 --squash",
    "gh api repos/o/r/pulls/12/merge -X PUT",
    "gh api --method PUT repos/o/r/pulls/12/ccr/auto_merge",
    "gh api graphql -f query='mutation{mergePullRequest(input:{pullRequestId:\"x\"}){clientMutationId}}'",
    "gh api graphql -f query='mutation{enablePullRequestAutoMerge(input:{}){clientMutationId}}'",
    "curl -X PUT -H 'Authorization: token x' https://api.github.com/repos/o/r/pulls/1/merge",
    'bash -c "gh pr merge 1"',
    "git push --force origin feature",
    "git push origin feat --force",
    "git push -f",
    "git push -fu origin x",
    "git -C . push --force origin x",
    "git push origin +HEAD:feature",
  ]) {
    test(`blocks ${JSON.stringify(command)}`, () => {
      expect(bash(command)).not.toBe(null);
    });
  }

  for (const command of [
    "factory pr merge 12",
    "gh pr view 12",
    "gh pr view 5 --json mergeable",
    "gh api repos/o/r/pulls/12/reviews",
    "git merge origin/main",
    "echo 'gh pr merges are gated'",
    "git push --force-with-lease origin feature",
    "git push --force-with-lease=feature origin feature",
    "git push --force-if-includes --force-with-lease origin feature",
    "git push -u origin andre/eng-1-merge-thing",
    "git push --follow-tags",
    "git commit -m 'Fix the merge gate' && git push -u origin fix",
    'git commit -m "Fix push retries: +1 attempt"',
    'git stash push -m "wip +tests"',
  ]) {
    test(`allows ${JSON.stringify(command)}`, () => {
      expect(bash(command)).toBe(null);
    });
  }

  test("quoting a merge command trips the fence too: it matches text, not commands", () => {
    expect(bash('git commit -m "explain why gh pr merge is gated"')).not.toBe(null);
  });

  test("guards every tool that runs a shell command", () => {
    expect(guard("Monitor", "gh pr checks 7 --watch && gh pr merge 7 --squash")).not.toBe(null);
    expect(guard("Monitor", "factory pr watch 7")).toBe(null);
  });

  test("blocks the GitHub MCP merge tools under any server name", () => {
    expect(guard("mcp__github__merge_pull_request")).not.toBe(null);
    expect(guard("mcp__gh__enable_pr_auto_merge")).not.toBe(null);
    expect(guard("mcp__github__pull_request_read")).toBe(null);
    expect(guard("Edit")).toBe(null);
  });

  test("the reason names the way through", () => {
    expect(bash("gh pr merge 1")).toContain("factory pr merge");
    expect(bash("git push -f")).toContain("--force-with-lease");
  });
});
