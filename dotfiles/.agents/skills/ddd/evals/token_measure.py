#!/usr/bin/env python3
"""Token-lean acceptance check for the dddv2 (ddd) skill.

Frozen criterion (delta `dddv2`, ## Acceptance → "Token-lean"):

  dddv2-authored process text loaded in any single state (tiktoken cl100k)
  must be <= half of v1's same-state path at commit ef6eb2a.

  v1 same-state paths (frozen by the criterion):
    aligning   <-> SKILL + delta-schema + explore
    executing  <-> SKILL + delta-schema + plan + apply   (does both phases' work)
    verifying  <-> SKILL + delta-schema + verify
    committing <-> SKILL + delta-schema + verify          (v1 close lived in verify step 8)

  Sibling-skill loads are out of scope by design: the criterion measures
  protocol overhead, and conducted sibling loads are the feature v1 lacked.

WHAT "dddv2 text loaded in a state" MEANS (the load model, settled honestly).
SKILL.md is always resident (it is the router; the harness loads it on
trigger and it carries the spine rules that bind every state). On top of it,
each state loads exactly the reference text that state genuinely operates on:

  aligning   = SKILL + aligning + delta-file + derivability
               delta-file: aligning AUTHORS Theory/Acceptance/Tasks; the Theory
                 checklist and acceptance convention live there and are genuinely
                 needed during aligning (it is the dddv2 analog of v1's
                 delta-schema, which v1 loads in every state for the same reason).
               derivability: aligning's exit boundary check, run while still in
                 the aligning state. Both are genuine in-state loads, not
                 peripheral lookups -- counted honestly, not classified
                 "on-demand" to pass.
  executing  = SKILL + executing
               The implementer transcribes inherited specs; it does not author
               the delta's frozen structure, so delta-file's schema detail is
               not resident here (only one-line rules already restated inline).
  verifying  = SKILL + verifying
  committing = SKILL + committing

v1 is read from git (commit ef6eb2a) so the baseline is immutable regardless of
the working tree. dddv2 is read from the working tree (the check runs at HEAD).

Exit code: 0 if every state's dddv2 load <= half its v1 path; non-zero otherwise.
"""

import os
import subprocess
import sys
from pathlib import Path

V1_COMMIT = "ef6eb2a"
V1_DIR = "dotfiles/.agents/skills/ddd"
DDDV2_REL = "dotfiles/.agents/skills/dddv2"

# v1 same-state paths -- FROZEN by the Token-lean criterion. Do not edit to pass.
V1_STATE_PATHS = {
    "aligning":   ["SKILL.md", "references/delta-schema.md", "references/explore.md"],
    "executing":  ["SKILL.md", "references/delta-schema.md", "references/plan.md", "references/apply.md"],
    "verifying":  ["SKILL.md", "references/delta-schema.md", "references/verify.md"],
    "committing": ["SKILL.md", "references/delta-schema.md", "references/verify.md"],
}

# dddv2 text resident in each state -- the honest load model (see module docstring).
DDDV2_STATE_LOADS = {
    "aligning":   ["SKILL.md", "references/aligning.md", "references/delta-file.md", "references/derivability.md"],
    "executing":  ["SKILL.md", "references/executing.md"],
    "verifying":  ["SKILL.md", "references/verifying.md"],
    "committing": ["SKILL.md", "references/committing.md"],
}


def repo_root() -> Path:
    out = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True)
    return Path(out.strip())


def ensure_tiktoken():
    """Import tiktoken, bootstrapping a cached venv if it is not importable.

    Keeps the check runnable as a permanent acceptance gate without assuming a
    pre-provisioned environment. Re-execs into the venv interpreter once.
    """
    try:
        import tiktoken  # noqa: F401
        return
    except ImportError:
        pass

    if os.environ.get("_DDDV2_TOKEN_VENV") == "1":
        sys.exit("error: tiktoken unavailable even after venv bootstrap")

    venv = Path(__file__).resolve().parent / ".venv"
    py = venv / "bin" / "python"
    if not py.exists():
        print("bootstrapping tiktoken into evals/.venv ...", file=sys.stderr)
        subprocess.check_call([sys.executable, "-m", "venv", str(venv)])
        subprocess.check_call([str(py), "-m", "pip", "install", "-q", "--no-cache-dir", "--upgrade", "pip"])
        subprocess.check_call([str(py), "-m", "pip", "install", "-q", "--no-cache-dir", "tiktoken"])
    env = dict(os.environ, _DDDV2_TOKEN_VENV="1")
    os.execve(str(py), [str(py), str(Path(__file__).resolve())] + sys.argv[1:], env)


def main() -> int:
    ensure_tiktoken()
    import tiktoken

    enc = tiktoken.get_encoding("cl100k_base")
    root = repo_root()
    dddv2 = root / DDDV2_REL

    def v1_text(rel: str) -> str:
        return subprocess.check_output(
            ["git", "-C", str(root), "show", f"{V1_COMMIT}:{V1_DIR}/{rel}"], text=True
        )

    def dddv2_text(rel: str) -> str:
        return (dddv2 / rel).read_text()

    def tokens(text: str) -> int:
        return len(enc.encode(text))

    rows = []
    all_pass = True
    for state in V1_STATE_PATHS:
        v1_files = {p: tokens(v1_text(p)) for p in V1_STATE_PATHS[state]}
        d2_files = {p: tokens(dddv2_text(p)) for p in DDDV2_STATE_LOADS[state]}
        v1_total = sum(v1_files.values())
        d2_total = sum(d2_files.values())
        budget = v1_total / 2
        ok = d2_total <= budget
        all_pass &= ok
        rows.append((state, v1_total, budget, d2_total, ok, v1_files, d2_files))

    width = 78
    print("=" * width)
    print("Token-lean check  (tiktoken cl100k_base)  --  dddv2 load vs half of v1 path")
    print(f"v1 baseline: commit {V1_COMMIT}   dddv2: working tree")
    print("=" * width)
    print(f"{'state':<11}{'v1 path':>10}{'half-v1':>10}{'dddv2':>9}{'margin':>9}  {'verdict'}")
    print("-" * width)
    for state, v1_total, budget, d2_total, ok, _v1f, _d2f in rows:
        margin = budget - d2_total
        print(f"{state:<11}{v1_total:>10}{budget:>10.1f}{d2_total:>9}{margin:>+9.1f}  "
              f"{'PASS' if ok else 'FAIL'}")
    print("-" * width)

    print("\nLoaded-file breakdown:")
    for state, _v1_total, _budget, _d2_total, _ok, v1f, d2f in rows:
        print(f"  {state}:")
        print(f"    v1    ({sum(v1f.values())}): " + ", ".join(f"{Path(p).name}={t}" for p, t in v1f.items()))
        print(f"    dddv2 ({sum(d2f.values())}): " + ", ".join(f"{Path(p).name}={t}" for p, t in d2f.items()))

    print()
    if all_pass:
        print("RESULT: all states pass (every dddv2 state load <= half its v1 path).")
        return 0
    failed = [r[0] for r in rows if not r[4]]
    print(f"RESULT: VIOLATION in {', '.join(failed)} "
          f"(dddv2 load exceeds half its v1 same-state path).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
