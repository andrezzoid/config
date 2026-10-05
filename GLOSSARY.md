# Agent harness

The skills, CLI and routines that let agents take André's work from an idea to
a merged pull request, on the Mac and in Claude Code cloud sessions.

## Stages

**Stage**:
One of four logical groups of factory work: Shape, Iterate, Babysit and Upkeep. A grouping, not a command; each holds several skills.
_Avoid_: Phase, step

**Shape**:
The stage where André decides what to build, ending in approved tickets. The only stage that changes what a ticket means.

**Iterate**:
The stage where one agent takes one ticket from claim to an open pull request.

**Babysit**:
The stage where one agent takes one pull request to merged, or to the point where only André can move it.

**Upkeep**:
The stage of jobs that run on a trigger rather than on a ticket, such as the brief and garden.

## Work

**Ticket**:
One unit of approved work in the tracker, sized for one agent session, with testable acceptance.
_Avoid_: Issue (except as GitHub's feature name), task, story

**Tracker**:
Where tickets live: Linear or GitHub Issues, named in the repo's profile.

**Profile**:
A repo's `.agents/factory.md`: its tracker, gates, autonomy cap and one-way doors.
_Avoid_: Config, settings

**Autonomy**:
How far a ticket may go without André: `pr` stops at a ready pull request, `merge` may merge itself through the gate.

**One-way door**:
A path whose changes a revert cannot undo, so they never merge without André.
_Avoid_: Protected path

**Claim**:
The first write a session makes on a ticket, marking it as taken.

**Verdict**:
A pass or fail recorded for one commit by reviewers who did not write it.
_Avoid_: Approval, sign-off

**Hand-back**:
Returning a ticket to André with a brief, because its acceptance cannot hold as written.
_Avoid_: Escalation, block

## Triggers

**Routine**:
A Claude Code trigger (schedule, GitHub event or API call) that starts a cloud session to run one Upkeep job.
_Avoid_: Cron, automation
