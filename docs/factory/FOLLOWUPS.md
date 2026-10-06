# Follow-ups

Work we decided to do later, with when and how. Move these to `factory-lab`'s
issues once that repo exists.

## Try wayfinder on one strata effort before building a chart skill

Shaping work bigger than one spec needs a map: break it down top-down, pin the
unknown unknowns, research or prototype the known unknowns, and shape the
known. Matt Pocock's `wayfinder` claims to do this with a map issue, typed
decision tickets and a "not yet specified" list. Try it before building our own
`chart` skill, and build only for the gap.

**When:** once triage has sorted strata's open issues into efforts, and the
factory has taken one real strata ticket from claim to merge, so a cleared map
region hands off to `to-spec` on a path we know works.

**How:**

1. Vendor `wayfinder` from `mattpocock/skills`, pinned in `.skill-lock.json`,
   unedited.
2. In strata, run `/wayfinder` on one effort triage grouped together. The likely
   destination: "strata's findings are trustworthy enough to gate CI", across
   #8, #19, #10, #9, #11 and #4. Tell it those issues exist so it adopts them.
3. Let it resolve two or three tickets, one per session as it prescribes: at
   least one research ticket and one grilling ticket.

**Assess:**

- The map starts from the destination and its decisions, not from a task list.
- Questions it can't yet phrase land under "not yet specified" instead of
  becoming premature tickets.
- Known unknowns become research or prototype tickets, correctly marked as
  needing André or not.
- A cleared region hands off to `to-spec` cleanly.
- It reuses existing issues instead of duplicating them.
- What it needs from the tracker on GitHub (`wayfinder:*` labels, native
  blocking, sub-issues), and what a fork would change for Linear.

If it passes, keep it and fork only its tracker layer when Linear needs it. If
it fails the first four, design `chart` from what it got wrong.
