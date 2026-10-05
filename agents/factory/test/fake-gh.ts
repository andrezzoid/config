#!/usr/bin/env bun
// Stand-in for `gh` in tests. Routes live in $FAKE_GH_DIR/routes.json keyed by
// "METHOD path" (query string dropped), "DIFF path" or "GRAPHQL". Every call is
// appended to calls.jsonl so tests can assert what was sent.

import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.FAKE_GH_DIR!;
const args = process.argv.slice(2);
const stdin = args.includes("--input") ? await new Response(Bun.stdin.stream()).text() : null;
appendFileSync(join(dir, "calls.jsonl"), JSON.stringify({ args, stdin }) + "\n");

const routes: Record<string, unknown> = JSON.parse(readFileSync(join(dir, "routes.json"), "utf8"));
if (args[0] !== "api") process.exit(2);
const path = args[1];
const method = args.includes("--method") ? args[args.indexOf("--method") + 1] : "GET";
const accept = args.includes("-H") ? args[args.indexOf("-H") + 1] : "";

let key: string;
if (path === "graphql") key = "GRAPHQL";
else if (accept.includes("diff")) key = `DIFF ${path.split("?")[0]}`;
else key = `${method} ${path.split("?")[0]}`;

const page = /[?&]page=(\d+)/.exec(path)?.[1];
if (page && page !== "1") {
  console.log(JSON.stringify(key.includes("check-runs") ? { check_runs: [] } : []));
  process.exit(0);
}
if (!(key in routes)) {
  console.error(`HTTP 404: Not Found (${key})`);
  process.exit(1);
}
const body = routes[key];
console.log(typeof body === "string" ? body : JSON.stringify(body));
