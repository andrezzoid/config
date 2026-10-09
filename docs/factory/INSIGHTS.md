# Insights behind the factory

Two talks:

- **[T]** poteto (Lauren Tan, Grok Bot at SpaceX AI), "here's how i shipped
  2,500 PRs last month to production", X video, 38 min:
  https://x.com/poteto/status/2102050467505430555
- **[I]** Matt Pocock's live interview with poteto, "Poteto (creator of pstack)
  on shipping 1,000's of PR's a month at SpaceX", YouTube, 66 min, 2026-10-02:
  https://www.youtube.com/live/MN9dGgmLyso

Each insight is crossed with poteto's skills
([pstack](https://github.com/cursor/plugins/tree/main/pstack), at `4e5b1cf`)
and Matt Pocock's ([mattpocock/skills](https://github.com/mattpocock/skills),
at `24fe0ef`). The last line of each entry says what it became here.
Timestamps are mm:ss into the video.

## Trust and verification

**1. Trust is the constraint, not the number of agents.** "If you don't have
trust and you try to spawn a hundred sub-agents ... you're going to quickly find
that you're just going to get a ton of slop pull requests." [T 06:00]
pstack scales trust with playbooks (autopilot-full needs an explicit operator
grant). Matt splits work into HITL and AFK (wayfinder, triage).
**Here:** autonomy is granted per ticket (`autonomy:merge`), capped per repo
(`Max autonomy` in the profile), and enforced by `factory pr merge`.

**2. Verification is the single most important skill; a loop is only a loop if
it verifies.** "The most important part of a loop that allows it to be a loop is
the verification part." [I 17:00] Without it, poteto was "the meat proxy between
my agent and Chrome DevTools". [I 05:00]
pstack: `create-verification-skill`, `prove-it-works`, the live lane that "is the
floor". Matt: `diagnosing-bugs` refuses to theorise before a red-capable loop.
**Here:** `implement` turns each acceptance line into a failing test before its
code, then verifies in four layers: gates, code review, live proof and an
independent verdict. `poke-holes` runs each acceptance test on the base and the
head, and drives an untested criterion through the running app. A repo without
a run skill cannot self-merge.

**3. A verification skill is a CLI inside the skill plus a feature map.**
Without the CLI, "the agent would basically rebuild the world each time and then
every agent did it differently". [I 22:30] The feature map is "a form of
materialized memory", kept current by an automation. [T 10:30–11:00]
pstack's `create-verification-skill` generates exactly this (Launch, Doctor,
Drive, Evidence, Cleanup, plus `features/`), and `maintain-verification-skill`
keeps it honest.
**Here:** the CLI half is Claude Code's built-in `/run-skill-generator`, which
records the repo's `.claude/skills/run-<name>/`, loaded by the built-in `/run`.
André chose the built-ins after comparing both on strata and omnia, and pstack's
two skills were removed. Nothing keeps a feature map yet.

**4. Correctness and quality are separate layers.** Verification answers "does
the checkout button actually check out"; engineering skills answer whether the
code is any good. [T 12:30–14:00]
**Here:** `implement` runs both: acceptance tests and live proof for
correctness, and `complexity-red-flags`, `deep-module-design`,
`define-errors-away` for quality.

**5. Autonomy is bounded by verifiability: one-way and two-way doors.** Matt
asks about one-way doors; poteto: "for domains where the work is verifiable ...
the one-way doors become two-way doors". [I 56:00–57:00]
Matt's `pr` skill makes the door call explicit in every PR body.
**Here:** the profile lists one-way-door globs; the gate refuses to self-merge
anything that touches them.

**6. A verifier swarm per PR, tuned by cost.** Full autopilot "will spawn a bunch
of verifier agents for every pull request and it will fuzz ... instead of like
10 verifier agents you might do like one". [I 52:30–53:30]
pstack's verdict comes from agents that did not write the code, and survives a
rebase only under the `git patch-id` rule.
**Here:** poke-holes scales to the work but never to zero reviewers; the verdict
is recorded on the PR by `factory pr verdict` for the SHA the reviewers checked,
and only the factory's own identity can write one. Unlike pstack, the patch
identity is exact text: `git patch-id` ignores whitespace, which let a
re-indented Python loop keep a verdict in review.

## The environment

**7. When you correct an agent, fix the most enforceable layer.** The order:
codebase (make it impossible), static analysis, rules and skills, and last the
style guide, which only humans enforce. [T 15:00–18:00, 36:00]
pstack's `correct` is this ladder as a skill. Matt's `retro` says a mechanical
rule "gets a deterministic check, full stop".
**Here:** `AGENTS.md` gained "When I correct you"; `correct` and `retro` are
installed; `/factory --garden` ranks fixes in the same order.

**8. Watch how agents fail; turn each repeated failure into a lint rule.**
"How do I turn this into a lint rule? How do I make it so that the code base
makes this impossible?" [I 31:00] Matt: the agent "stumbles into the rules and
bounces off them" instead of carrying them in context. [I 32:30]
**Here:** `/factory --garden` collects repeated mistakes; `/correct` fixes them.

**9. The codebase is the agent's memory, and anti-patterns spread like a
virus.** "One small workaround ... in a matter of a few days ... has spread
everywhere." [T 21:00]
**Here:** `implement` copies a nearby pattern only if André would be happy to
see it copied again, and files the bad example instead of following it.

**10. Make the easy path the right path.** "Agents love taking shortcuts. So what
if we design the framework such that the shortcut ... is the right path." [T 19:00]
**Here:** applied to the harness itself: `factory pr merge` is the only merge
path, the factory mod denies the raw ones, and the profile is read from the
base branch so a branch cannot loosen its own rules.

**11. Ban comments that justify workarounds.** Agents used them "as
justification for why it wasn't going to solve the actual problem". [T 23:00]
pstack ships `no-comments`.
**Here:** a narrower rule in `implement` ("never write a comment that justifies
a workaround"), because André keeps Ousterhout-style interface comments
(`comments-as-design`).

**12. The gardener: delete debt, keep one paved path, lint before cleanup.**
[T 24:30–26:00] Much of the 2,500 PRs was gardening. [I 46:00]
**Here:** a weekly `/factory --garden` routine per repo.

**13. Buffer findings before fixing them.** "I don't actually tell it to fix the
issue first. I tell it to append it to a document ... these are all the same
thing." [I 47:30]
**Here:** garden appends to one issue per repo, its garden log, and fixes nothing.

**14. The engineer's new job is the environment.** [I 26:00]
**Here:** `/setup-factory` makes the environment a per-repo artifact: profile,
gates, doors, run skill.

## The loops

**15. The outer loop feeds the inner loop.** The inner loop works toward "a
snapshot of my intent ... the snapshot can go stale"; triggers bring Slack,
Linear and Sentry in so you stop being the proxy. [I 35:00–36:30] No company
brain needed: "agents are really good at using tools". [T 33:00]
**Here:** routines (dispatch, brief, garden, babysit on GitHub events) and
`subscribe_pr_activity` in the cloud; Monitor on `factory pr watch` on the Mac.

**16. Ask "where am I the bottleneck?" and teach the agent to fetch it.**
[I 37:30] Netflix's "context, not control". [I 41:30]
**Here:** tickets carry their repo, so dispatch needs nobody; `implement` hands
back with a brief instead of waiting on a question; the brief lists only what
needs André.

**17. Coordinators delegate and see the forest.** Coordinator agents "manage and
supervise ... and spawn sub agents"; grouping related reports reveals the real
cause. [I 39:00, 44:00]
pstack's Orchestrate: "You own the program, never the code."
**Here:** `/factory` routes and reports and never writes product code; related
work is grouped by `to-tickets` with blocking edges.

**18. Work backwards from "how does my agent merge its own code?"** [I 39:30]
**Here:** the merge gate is that answer written down: forge ready, threads
readable, independent verdict for this patch, a human grant, a two-way door.

**19. Review by sampling, after landing; fix the kitchen, not the cook.** "You
cannot be tasting every single dish." [I 49:30] A one-off is fine; the same
shortcut in several agents means the environment needs changing. [I 50:30]
**Here:** the brief lists what landed this week for sampling; recurring
failures go to garden and `/correct`.

**20. The dark factory takes nerve and an undo.** [I 54:00]
**Here:** self-merge is opt-in per ticket, one-way doors always wait for André,
and a revert is the undo for everything else.

## Skills themselves

**21. Mine your transcripts for corrections.** Past chats are "a treasure trove
... the process materialized". [I 1:00:30–1:03:00]
pstack's `recall` and `reflect` read Cursor's transcript paths; Matt's `retro`
reads the session's own logs.
**Here:** `retro` installed, and `hillclimb` searches past sessions for other
occurrences of a failure before it tunes a skill; pstack's two left out because
they depend on Cursor's paths.

**22. Skills get smaller: encode the workflow, not the commands.** [I 1:03:30]
**Here:** `implement` and `babysit-pr` were rewritten around workflow; the
mechanics (watch loops, check parsing, merge rules, review replies) moved into
the CLI.

**23. Put determinism in code, judgment in the agent.** "Extract out the
deterministic parts and turn that into code." [I 21:00] Matt: a deterministic
outer loop "is faster, cheaper, and more reliable".
**Here:** the `factory` CLI, zero-dependency TypeScript on Node, with a test
suite of its own.

**24. Carry your own knives.** "Every chef when they go to a different
restaurant, they bring their knives with them." [I 1:01:30]
**Here:** one dotfiles folder, one pinned lock file, the same harness on the
Mac (stow) and in every cloud session (`cloud-setup.sh`). A work repo
commits only what is its own: its profile and its run skill.

**25. Language is the interface.** The bottleneck is "the transfer of your
intent" [I 08:00]; words like "tautological tests" carry intent in one token.
[I 09:00]
**Here:** Matt's vocabulary is kept (frontier, tracer bullet, seam, door), and
the `GLOSSARY.md` rename is handled in the forks rather than silently split.

## From the repos, not the videos

- **Claim as the first write** (Matt's wayfinder) and **oldest claim wins**:
  `factory ticket claim`.
- **A parent spec is not a ticket** (Matt's to-spec docs): readiness skips
  parents with open children.
- **Completion is explicit** (Matt's implement docs admit it never closes
  tickets): `Closes <ID>` plus a check after merge.
- **Invocation discipline** (Matt's `.agents/invocation.md`): skills an agent
  must chain (`implement`, `babysit-pr`, `poke-holes`, `complexity-red-flags`)
  are model-invocable; human entry points (`to-spec`, `to-tickets`, `triage`,
  `factory`, `setup-factory`, `hillclimb`) are not, and a test holds both.
- **Tiered PR state** (pstack's watch-pr): conflicts, then threads, then CI.
- **Liveness by side effects** (pstack's audit tick): the brief flags a ticket
  started three hours ago with no PR and no update as stalled.
- **Classify CI before retrying; lean dismiss from the third bot round, except
  security and data** (pstack's babysit and bugbot triage): in `babysit-pr`.
