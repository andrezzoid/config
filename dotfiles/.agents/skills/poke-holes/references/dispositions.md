# Findings triage

Shared by `poke-holes`, `implement` and `babysit-pr`. The real file lives here;
the others symlink to it.

A finding is any claim that something is wrong: from a reviewer you spawned,
from a reviewer on a pull request, or from a check that failed. Every one gets a
disposition, written down where the work's record lives.

- **fix now**: repair it before the work moves on.
- **followup**: real, and out of scope here. It becomes a ticket in triage
  once the human has seen it.
- **rejected**: with the reason. Rejecting is a normal outcome.

The human decides anything that touches intent.

After a fix-now repair, re-check with a fresh pass over the repaired area plus
the acceptance checks, instead of walking the finding list again: confirming a
list is how the list gets gamed.

Done when every finding has a written disposition.
