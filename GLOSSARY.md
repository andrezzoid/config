# Agent harness

The skills, CLI and routines that let agents take André's work from an idea to
a merged pull request, on the Mac and in Claude Code cloud sessions.

## Phases

**Phase**:
One of four groups of factory work: Shape, Iterate, Babysit and Upkeep. A ticket's phase is the one that acts on it next, read from its labels and its open pull requests.
_Avoid_: Stage, step

**Shape**:
The phase where André decides what to build, ending in tickets labelled ready for an agent. The only phase that changes what a ticket means.

**Iterate**:
The phase where one agent session takes one ticket from its claim to an open pull request.

**Babysit**:
The phase where that same session keeps the pull request mergeable until it merges or closes.

**Upkeep**:
The phase of work that runs on a schedule rather than on a ticket: the hourly run, which dispatches, merges what André picks, briefs him and triages, and the weekly stats.

## Building blocks

**Skill**:
A folder an agent loads that sets a goal and holds the rules and formats for reaching it, such as `implement` or `babysit-pr`.
_Avoid_: Workflow, playbook

**Principle**:
A rule of taste that holds in every repo, kept in a skill such as `codebase-design` or `complexity-red-flags`.
_Avoid_: Guideline, best practice

**Protocol**:
An agreement between parties that never talk directly, kept in shared state (labels, ticket and pull request comments), such as the claim or a report.
_Avoid_: Convention, handshake

**Standard**:
A rule specific to one repo, kept in that repo's `CLAUDE.md`, `AGENTS.md` or `CODING_STANDARDS.md`. Wins over a principle when the two conflict.
_Avoid_: House rule, repo principle

**Agent skills block**:
The "## Agent skills" section of a repo's `CLAUDE.md` or `AGENTS.md`, which names its tracker, its labels and where its domain docs live.
_Avoid_: Profile, config

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

**Agent brief**:
The comment triage posts on a ticket to say what to build. The latest one replaces the ticket's body as its contract.

**Contract**:
What a ticket asks for: its latest agent brief, or its body until one exists, plus every revision posted after it. Agents build against it and never edit it.
_Avoid_: Spec (the document `to-spec` writes)

**Report**:
A comment that tells André what happened where the work met something its contract didn't settle. Its kind titles it: Handed back or Revised on the ticket, Deviation or Unverified on the pull request.
_Avoid_: Brief, briefing, summary

**Hand-back**:
A report that returns a held ticket to André, relabelled ready-for-human, when the agent cannot go on without his decision.
_Avoid_: Escalation, block

**Revision**:
A report recording a change to the contract that André agreed in a session. It becomes part of the contract.
_Avoid_: Amendment

**Deviation**:
A report on the pull request about work that departs from its contract while acceptance still holds.

**Tracker**:
Where tickets live: Linear or GitHub Issues, named in the repo's Agent skills block.

**One-way door**:
A change a revert cannot undo, such as a migration or deleted data. Its pull request names it, so André sees it before he picks the merge.
_Avoid_: Protected path

**Claim**:
The in-progress label that marks a ticket as held by one agent session, with a comment naming that session. It holds until the ticket is handed back or merged, or another session takes it over on purpose, and never changes who the ticket belongs to.
_Avoid_: Assignment, lock

**Inbox**:
What waits on André, and what an agent can pick up now, each line naming the session behind it.
_Avoid_: Brief, dashboard

## Triggers

**Routine**:
A scheduled Claude Code cloud session that runs Upkeep: the hourly run and the weekly stats.
_Avoid_: Cron, automation
