# Agent harness

The skills, CLI and routines that let agents take André's work from an idea to
a merged pull request, on the Mac and in Claude Code cloud sessions.

## Stages

**Stage**:
One of four logical groups of factory work: Shape, Iterate, Babysit and Upkeep. A grouping, not a command; each holds several skills.
_Avoid_: Step

**Phase**:
Where one ticket stands: the stage that acts on it next (shape, iterate or babysit), or done. `factory ticket show` works it out from the ticket's labels, its state and its open pull requests.

**Shape**:
The stage where André decides what to build, ending in approved tickets. The only stage that changes what a ticket means.

**Iterate**:
The stage where one agent takes one ticket from claim to an open pull request.

**Babysit**:
The stage where one agent takes one pull request to merged, or to the point where only André can move it.

**Upkeep**:
The stage of jobs that run on a trigger rather than on a ticket, such as the brief and garden.

## Building blocks

**Skill**:
A folder an agent loads to follow a procedure, such as `implement` or `babysit-pr`.
_Avoid_: Workflow, playbook

**Principle**:
A rule of taste that holds in every repo, kept in a skill such as `deep-module-design` or `complexity-red-flags`.
_Avoid_: Guideline, best practice

**Protocol**:
A contract between parties that never talk directly, kept in shared state (tracker, pull request comments, labels) and written and read through the factory CLI, such as the claim or the verdict.
_Avoid_: Convention, handshake

**Standard**:
A rule specific to one repo, kept in that repo's `CLAUDE.md`, `AGENTS.md` or `CODING_STANDARDS.md`. Wins over a principle when the two conflict.
_Avoid_: House rule, repo principle

## Learning

**Failure mode**:
A way agents keep going wrong, backed by at least two occurrences in past sessions.
_Avoid_: Bug, issue, lesson

**Occurrence**:
One moment in one session where a failure mode happened, pinned to the turn before the mistake so it can be replayed as an eval case.

## Work

**Ticket**:
One unit of approved work in the tracker, sized for one agent session, with testable acceptance.
_Avoid_: Issue (except as GitHub's feature name), task, story

**Contract**:
What a ticket asks for: triage's latest agent brief when there is one, otherwise the ticket's body. Agents build against it and never edit it.
_Avoid_: Spec (the document `to-spec` writes)

**Deviation**:
Something an agent did that the contract did not cover. A ticket comment while acceptance holds, and a hand-back when it breaks.

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
The comment that marks which agent session works a ticket. It holds until the ticket is handed back or another session takes it over on purpose, and never changes who the ticket belongs to.
_Avoid_: Assignment, lock

**Verdict**:
A pass or fail recorded for one commit by reviewers who did not write it.
_Avoid_: Approval, sign-off

**Ledger**:
The table a poke-holes review produces: one row per assumption or acceptance criterion, then one per finding, each with its evidence and disposition. A ledger on a solution is recorded on its pull request with the verdict.

**Hand-back**:
Returning a held ticket to André with a brief, when the agent cannot go on without André's decision: acceptance cannot hold, a check stays red, or a review disputes the ticket. `factory ticket handback` posts the brief and labels the ticket `ready-for-human`, which stops the factory from moving it.
_Avoid_: Escalation, block

## Triggers

**Routine**:
A Claude Code trigger (schedule, GitHub event or API call) that starts a cloud session to run one Upkeep job.
_Avoid_: Cron, automation
