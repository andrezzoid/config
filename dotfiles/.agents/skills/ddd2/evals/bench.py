#!/usr/bin/env python3
"""Aggregate grading.json + timing.json into benchmark.json (skill-creator viewer schema).

Usage: python3 bench.py [workspace]        # default /tmp/ddd2-evals
"""
import glob
import json
import os
import statistics as st
import sys
from datetime import datetime, timezone

ws = os.path.join(sys.argv[1] if len(sys.argv) > 1 else "/tmp/ddd2-evals", "iteration-1")
runs, agg = [], {"with_skill": [], "without_skill": []}

for ed in sorted(glob.glob(os.path.join(ws, "eval-*"))):
    name = os.path.basename(ed)
    for arm in ("with_skill", "without_skill"):
        gp = os.path.join(ed, arm, "grading.json")
        if not os.path.exists(gp):
            print(f"MISSING {gp} — run grade.sh first", file=sys.stderr)
            continue
        exp = json.load(open(gp))["expectations"]
        passed = sum(1 for e in exp if e["passed"])
        t = {}
        tp = os.path.join(ed, arm, "timing.json")
        if os.path.exists(tp):
            try:
                t = json.load(open(tp)) or {}
            except json.JSONDecodeError:
                pass
        runs.append({
            "eval_id": int(name.split("-")[1]),
            "eval_name": name[7:],
            "configuration": arm,
            "run_number": 1,
            "result": {
                "pass_rate": round(passed / len(exp), 3),
                "passed": passed,
                "failed": len(exp) - passed,
                "total": len(exp),
                "time_seconds": round((t.get("duration_ms") or 0) / 1000, 1),
                "tokens": ((t.get("usage") or {}).get("output_tokens")) or 0,
                "tool_calls": t.get("num_turns") or 0,
                "errors": 0,
            },
            "expectations": exp,
            "notes": [],
        })
        agg[arm].append((passed / len(exp), (t.get("duration_ms") or 0) / 1000,
                         ((t.get("usage") or {}).get("output_tokens")) or 0))


def summ(v):
    def s(xs):
        return {"mean": round(st.mean(xs), 3), "stddev": round(st.pstdev(xs), 3),
                "min": round(min(xs), 3), "max": round(max(xs), 3)}
    return {"pass_rate": s([x[0] for x in v]),
            "time_seconds": s([x[1] for x in v]),
            "tokens": s([x[2] for x in v])}


if not agg["with_skill"] or not agg["without_skill"]:
    sys.exit("no graded runs found — run grade.sh first")
ws_s, wo_s = summ(agg["with_skill"]), summ(agg["without_skill"])
bench = {
    "metadata": {
        "skill_name": "ddd2",
        "skill_path": os.path.dirname(os.path.abspath(os.path.dirname(__file__))),
        "executor_model": os.environ.get("MODEL", "opus"),
        "analyzer_model": "bench.py (mechanical aggregate)",
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "evals_run": sorted({r["eval_id"] for r in runs}),
        "runs_per_configuration": 1,
    },
    "runs": runs,
    "run_summary": {
        "with_skill": ws_s,
        "without_skill": wo_s,
        "delta": {
            "pass_rate": f"{ws_s['pass_rate']['mean'] - wo_s['pass_rate']['mean']:+.2f}",
            "time_seconds": f"{ws_s['time_seconds']['mean'] - wo_s['time_seconds']['mean']:+.1f}",
            "tokens": f"{ws_s['tokens']['mean'] - wo_s['tokens']['mean']:+.0f}",
        },
    },
    "notes": [
        "Single run per configuration — deltas are directional, not statistical.",
        "Tokens column = output tokens only.",
        "Process evals only: a passing run proves protocol compliance, not that the protocol beats a review habit on outcomes.",
    ],
}
out = os.path.join(ws, "benchmark.json")
json.dump(bench, open(out, "w"), indent=2)
tw = sum(r["result"]["passed"] for r in runs if r["configuration"] == "with_skill")
to = sum(r["result"]["total"] for r in runs if r["configuration"] == "with_skill")
bw = sum(r["result"]["passed"] for r in runs if r["configuration"] == "without_skill")
print(f"{out}\nwith_skill {tw}/{to} | without_skill {bw}/{to}")
print(f"view: python3 ~/.claude/skills/skill-creator/eval-viewer/generate_review.py {ws} "
      f"--skill-name ddd2 --benchmark {out}")
