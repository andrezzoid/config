# Explore Phase

**Input:** A goal (vague or specific) + project code and context.
**Output:** Options with tradeoffs, discovered constraints, open questions, updated context.

The Explore phase produces understanding, not code.
Read `delta-schema.md` if you need to write or update a delta log entry.

## Procedure

### 1. Orient

1. Read project context documents (CLAUDE.md, architecture docs, domain docs — whatever exists).
2. Read source code in the area you are exploring. Do not rely on context alone.
3. If a `.delta.yml` exists, read its log for prior exploration findings.

### 2. State your assumptions

Before investigating, write down:
- Your understanding of the current behavior in the relevant area.
- What you believe to be true about the system's constraints.
- What you need to learn before a concrete plan is possible.

These assumptions are your verification targets in the next step.

### 3. Verify assumptions against reality

You MUST verify — not assume — the current state of the system.

- Run existing tests in the affected area. Note results.
- Read the actual code paths involved. Trace execution, don't guess.
- If exploring a bug: reproduce it. Capture the exact reproduction steps and output.
- If exploring a feature area: confirm the current behavior you would build on.
- For each assumption from Step 2, record: **confirmed**, **wrong** (with what's actually true),
  or **unverifiable** (with what you'd need to verify it).

Any assumption marked **wrong** is a context gap. Update project context immediately.

### 4. Diverge — generate at least 3 approaches

This step exists to prevent premature convergence. You MUST generate multiple approaches
before evaluating any of them.

**Strategies for meaningful divergence:**

- **Vary the abstraction level.** A quick targeted fix vs. a proper refactor vs. an
  architectural change. These are genuinely different approaches, not levels of polish.
- **Vary the boundary.** Where do you draw the line of what changes? Minimal surface area
  vs. broader cleanup. Each boundary choice creates different tradeoffs.
- **Vary the dependency.** Could you solve this with existing code, a new internal abstraction,
  or an external library? Each has different maintenance implications.
- **Invert the assumption.** Take the strongest assumption ("we need X") and ask what happens
  if it's wrong. This often reveals a non-obvious approach.

For each approach, produce:
- **Description:** 2-3 sentences on what this approach does.
- **Enables:** What becomes possible or easier.
- **Trades off:** What becomes harder, riskier, or more complex.
- **Unknowns:** What you can't determine without building it.
- **Rough scope:** Relative to the other approaches (smaller / comparable / larger).

### 5. Evaluate and recommend

Compare the approaches:
- Which unknowns are blocking vs. manageable?
- Which tradeoffs align with the project's priorities (speed, quality, flexibility)?
- Are there hybrid approaches that take the best elements of multiple options?

State your recommendation and why. List open questions that require human input to resolve.

### 6. Record findings

**If a `.delta.yml` exists**, append a log entry:

```yaml
- id: log-NNN
  timestamp: <ISO 8601>
  command: explore
  summary: >
    Explored [problem area]. Verified: [confirmed assumptions].
    Corrected: [wrong assumptions]. Generated [N] approaches:
    [1-line summary of each]. Recommend [approach] because [reason].
    Open questions: [list].
```

**If no delta exists**, present your findings to the human. Your output MUST include:
1. Verified vs. corrected assumptions
2. The approaches with tradeoffs (structured, not prose)
3. Your recommendation
4. Open questions that block planning

**Always** update project context with any corrected assumptions or discovered constraints.

## Throwaway Prototypes

You MAY write code during exploration to test feasibility. If you do:
- State explicitly that the code is exploratory and disposable.
- Capture what you learned from it in your findings.
- MUST NOT leave prototype code in the working tree when exploration is complete.

## When Explore Is Sufficient

Exploration has produced enough information to move to Plan when:
- An approach has been selected (by you or the human).
- Blocking unknowns are resolved or explicitly deferred as decision tasks.
- You can describe the current state of the system accurately (verified, not assumed).

If human-guided, the human decides when to transition.
If autonomous, transition when all three conditions above are met.
If in doubt, present findings and ask.
