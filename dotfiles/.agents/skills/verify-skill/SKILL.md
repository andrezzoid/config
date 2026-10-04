---
name: verify-skill
description: Create or maintain a project-local verify-<app> skill that gives agents hands and eyes on the running app, with a bundled CLI for launch, health check, drive, evidence and cleanup, plus a feature map saying what observation proves each feature works. Use for /verify-skill, when a project has no scripted way to prove UI, CLI or service behavior, when implement or poke-holes could only offer unit tests as evidence, or when an existing verify skill has drifted from the app.
argument-hint: "[create | maintain]"
---

# Verify skill

An agent that can't see its own result can't iterate on it, and you end up as the proxy between the agent and the app: running it, clicking through, pasting back what you saw. Lint, types and unit tests prove the code compiles and its branches behave. They don't prove the feature works. A verify skill closes that loop once per project, so "verify it in the app" becomes a step any agent runs cold.

Two modes. **create** when the project has no `.claude/skills/verify-*/`. **maintain** when one exists and the app has moved since.

## create

### 1. Interview the repo, not the human

Answer these from the code and ask the human only what you can't observe:

- **Surface.** What does a user touch: a web UI, a CLI or TUI, a desktop app, an HTTP API, a library? Pick the primary one and note the rest.
- **Run.** How does it start locally? Prefer the repo's own dev command (package scripts, Makefile, README). Note ports, env vars, seed data and auth.
- **Drive.** What can drive it from code? Existing harnesses first (Playwright or Cypress specs, expect scripts, a debug port). Then the generic tools in this harness: `agent-browser` for web and Electron, `tmux` for CLIs and TUIs, `curl` for HTTP. A cloud session has Playwright with Chromium preinstalled (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`) and no `agent-browser`, so a skill that must also run in the cloud drives the browser through Playwright.
- **Observe.** What evidence exists: screenshots, accessibility snapshots, terminal transcripts, response bodies, logs, exit codes, rows in a database.
- **Isolate.** Can two instances run side by side (ports, data dirs, profiles)? If not, the skill says so and refuses to drive an instance it didn't start.

If the checkout doesn't build or start as-is, fix that first or report the exact failure. A skill written against a broken base teaches wrong steps.

### 2. Build the CLI before the prose

Every deterministic step goes into one executable, `scripts/verify`, with subcommands: `launch` (start an isolated instance, block until ready, print its URL or session handle), `doctor` (read-only: process up, our port, right build, auth valid), the drive helpers this surface needs, `evidence <name>` (capture into the evidence dir), and `cleanup` (kill only what `launch` started). Without it every agent rebuilds the same glue its own way and throws it away after one run. With it the SKILL.md shrinks to a thin layer of instructions around a tool the next agent reruns. Judgment stays in the skill and mechanics go in the script.

Run each subcommand once as you write it. A helper you never ran is a guess.

### 3. Write the skill

`.claude/skills/verify-<app>/SKILL.md`, with frontmatter (`name: verify-<app>` and a `description` naming the app, the surface and when to reach for it) and these sections, grounded in what the interview found, no placeholders:

- **Launch.** The exact `scripts/verify launch` call, how readiness is detected, and the teardown.
- **Doctor.** Run it first, and again after anything surprising. Never drive an instance you haven't health-checked since it last surprised you.
- **Drive.** The recipe with real selectors and commands from this repo. Prefer stable handles (ARIA roles and names, data attributes, prompt strings, routes) over coordinates or tab order.
- **Evidence.** What a proof captures and where it lands. Exercise the real user path, not internal setters or test-only endpoints. Capture the action and the resulting state, not just the final screen. Check side effects (files, rows, messages) alongside what's visible. When the safe path is a dry run, observe what it skips instead of trusting its name.
- **Cleanup.** Kill what you started, never by process name. Cleanup removes instances and scratch state and never the evidence.

### 4. Seed the feature map

`features/README.md` plus one file per user-facing feature, the top three to five to start, found from routes, commands, menus or docs. Follow `references/feature-map.md`. Each feature file answers from the user's side: what it is, every way to reach it, how to drive it, what observable end state proves it works, and the traps. The map is the definition of "verified" for this app: a proof through one convenient entry point is incomplete when the map lists others.

### 5. Prove it once, end to end

Run the skill's own instructions cold: launch, doctor, drive one mapped feature, capture evidence, clean up. Then confirm the evidence still exists where the skill says it lands. Fix whatever fails and run cleanup after every failed attempt, so broken runs don't strand processes and ports. A verify skill that was never executed is a draft.

**Reply:** the surface, the commands, the feature you proved with its evidence path, and what the map doesn't cover yet.

## maintain

A feature map rots the moment the app changes. This pass keeps it honest. Edit only the verify skill's own directory and never product code: a behavior the map describes that the app no longer has is either drift (fix the map) or a regression (report it, don't paper over it in docs).

1. **Index hygiene.** Read `features/README.md` and list its siblings. Fix missing, extra, duplicate and dead entries.
2. **Source wave.** One read-only subagent per feature file, launched together. Each explains from source how the feature works now, flags suspected drift with `file:line`, and returns one live recipe. They never drive the app and never edit.
3. **Reconcile.** Merge recipes into as few app states as practical. Spot-check cited drift. Sweep recent churn (`git log` since the skill last changed) for user-facing surfaces the map lacks, and require a source path before calling one missing.
4. **Live pass.** Required even when the source wave came back clean. You own all driving, one drive at a time, on instances you launched. Exercise every feature at least once. Doctor before the first drive and after any failed one. Evidence survives every cleanup. A feature you can't reach is `unreachable` only with the prerequisite you lacked and the route you tried.
5. **Triage.** Wrong or missing description: drift, fix it. Working behavior the CLI can't drive: harness gap, fix the CLI and re-drive it live before it ships. Broken behavior: product gap, report it and keep it out of this change.
6. **Outcome.** Exactly one: **clean** (full coverage, nothing to change), **changed** (one commit or PR of proven corrections), or **blocked** (the exact thing that stopped coverage).

**Reply:** the outcome, features covered, drift fixed, product gaps found.
