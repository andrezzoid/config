# The derivability check (convergent derivation)

Aligning's boundary check, run at the exit gate: the empirical test that the theory determines the plan. Operations are excluded from Theory precisely so this check can prove they're derivable rather than dictated.

Spawn **two independent deriver subagents** — each briefed with the delta + its References and nothing more (the standard non-author briefing). Each produces, from Theory + Acceptance + References alone:

- the **task list** (becomes `## Tasks`),
- the **delta-level acceptance executables** (the ATDD checks the verifier will run),
- the **per-task check specs**.

Then judge convergence yourself:

- **Any divergence or invented assumption is a theory gap, not a fork** — self-correct the Theory, commit, and rerun the derivation. Loop until the two runs converge.
- **Only genuine forks** — decisions with more than one defensible answer the theory legitimately leaves open — surface to the human.

On convergence the merged output becomes `## Tasks` and the acceptance executables. The implementer later *inherits* these and never authors the criteria it is graded by — that decorrelation is the whole point. Derivers are read-only on the shared working tree (SKILL.draft.md §2).

Prediction test: the human states their predicted task list *before* seeing the derived one; a sound theory makes the two materially match.
