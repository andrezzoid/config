// Merges the harness hooks into a Claude settings.json without touching
// anything else in it. Used by install.sh in cloud sessions, where no
// dotfiles/.claude/settings.json is stowed.
//
//   bun settings.ts <settings.json> <harness dir>

import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const MARK = "agent-harness";

export function harnessHooks(harness: string) {
  return {
    SessionStart: { matcher: "startup", hooks: [{ type: "command", command: `"${harness}/hooks/refresh.sh"`, timeout: 120 }] },
    PreToolUse: {
      matcher: "Bash|mcp__github__merge_pull_request|mcp__github__enable_pr_auto_merge",
      hooks: [{ type: "command", command: `"${harness}/hooks/guard-merge.sh"`, timeout: 10 }],
    },
  };
}

export function merge(settings: any, harness: string) {
  const out = { ...settings, hooks: { ...(settings.hooks ?? {}) } };
  for (const [event, entry] of Object.entries(harnessHooks(harness))) {
    const kept = (out.hooks[event] ?? []).filter((e: unknown) => !JSON.stringify(e).includes(MARK));
    out.hooks[event] = [...kept, entry];
  }
  return out;
}

if (import.meta.main) {
  const [path, harness] = process.argv.slice(2);
  if (!path || !harness?.includes(MARK)) {
    console.error("usage: bun settings.ts <settings.json> <.../agent-harness>");
    process.exit(64);
  }
  const current = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  writeFileSync(path, JSON.stringify(merge(current, harness), null, 2) + "\n");
}
