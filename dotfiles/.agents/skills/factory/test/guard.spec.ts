// The merge guard in hooks/register.ts. Each blocked case is a bypass an
// independent review found against the earlier regex guard.

import { describe, test } from "node:test";
import { commands, guard } from "../hooks/register.ts";
import { expect } from "./expect.ts";

const bash = (command: string) => guard("Bash", command);

describe("guard", () => {
  for (const command of [
    "gh pr merge 12 --squash",
    "cd repo && gh pr merge --auto",
    "gh api repos/o/r/pulls/12/merge -X PUT",
    "gh api --method PUT repos/o/r/pulls/12/ccr/auto_merge",
    "git push --force origin feature",
    "git push -f",
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
    "gh pr -R o/r merge 1",
    "gh pr --repo=o/r merge 3",
    "gh pr merge; git checkout main",
    "out=$(gh pr merge)",
    'echo "merged: $(gh pr merge 1)"',
    "echo `gh pr merge 1`",
    "gh pr merge&&git pull",
    "gh api -X PUT repos/o/r/pulls/3/merge;echo",
    "gh api -X PUT \\\n  repos/o/r/pulls/12/merge \\\n  -f merge_method=squash",
    "git push \\\n  --force origin feat",
    "gh pr \\\nmerge 1",
    "git status\ngh pr merge 1",
    "curl -X PUT -H 'Authorization: token x' https://api.github.com/repos/o/r/pulls/1/merge",
    'bash -c "gh pr merge 1"',
    "sh -lc 'cd x && gh pr merge 1'",
    "eval 'gh pr merge 1'",
    "env GH_TOKEN=x timeout 60 gh pr merge 1",
    "( gh pr merge 1 )",
    "if true; then gh pr merge 1; fi",
    "git push origin feat --force",
    // An apostrophe in a heredoc once switched the guard off for the rest of the line.
    "git commit -am \"$(cat <<'EOF'\nFix\n\nIt's idempotent now.\nEOF\n)\" && git push -f origin feat",
    "gh pr create --title t --body \"$(cat <<'EOF'\nDoesn't touch the schema.\nEOF\n)\" && gh pr merge --auto --squash",
    // An unquoted heredoc expands its substitutions.
    "cat <<EOF\n$(gh pr merge 1)\nEOF",
    "cat <<EOF > x\nnothing\nEOF\ngh pr merge 1",
    "timeout -s KILL 60 gh pr merge 1",
    "nice -n 5 gh pr merge 1",
    "env -u X gh pr merge 1",
    "sudo -u bob gh pr merge 1",
  ]) {
    test(`blocks ${JSON.stringify(command)}`, () => {
      expect(bash(command)).not.toBe(null);
    });
  }

  for (const command of [
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
    'git commit -m "Fix push retries: +1 attempt"',
    'git commit -m "hook: block push -f"',
    'git stash push -m "wip +tests"',
    "rg mergePullRequest src/",
    "git push --follow-tags",
    'git commit -m "first line\n\ngh pr merge happens in factory"',
    'git commit -m "explain why gh pr merge is gated"',
    "gh pr comment 3 --body 'run gh pr merge 3 when ready'",
    "grep -n 'gh pr merge' README.md # gh pr merge",
    "curl https://api.github.com/repos/o/r/pulls/1",
    // Heredoc bodies are text.
    "git commit -m \"$(cat <<'EOF'\nAgents run `factory pr merge`; `gh pr merge` is denied.\nEOF\n)\"",
    "gh pr create --body \"$(cat <<'EOF'\nNever `git push -f` here.\nEOF\n)\"",
    "cat <<'EOF' > notes.md\ngh pr merge is gated\nEOF",
    "cat <<-EOF\n\tgh pr merge 1\n\tEOF",
    "git commit -F - <<\\EOF\nrun $(gh pr merge 1) later\nEOF",
  ]) {
    test(`allows ${JSON.stringify(command)}`, () => {
      expect(bash(command)).toBe(null);
    });
  }

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

describe("commands", () => {
  test("splits on separators, drops quotes, keeps quoted text whole", () => {
    expect(commands(`a "b c" 'd;e'; f|g && h\ni`)).toEqual([["a", "b c", "d;e"], ["f"], ["g"], ["h"], ["i"]]);
  });

  test("returns substitutions and sh -c scripts as commands of their own", () => {
    expect(commands("x=$(a b) c")).toEqual([["a", "b"], ["x=$(a b)", "c"]]);
    expect(commands("bash -c 'a; b'")).toEqual([["bash", "-c", "a; b"], ["a"], ["b"]]);
  });
});
