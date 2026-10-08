# Ticket template

Shared by `to-tickets`, for a ticket's body, and `triage`, for its agent brief.
The real file lives here; `triage/references/ticket-template.md` is a symlink to
it. Keep the section names, since `implement` builds from them.

<issue-template>

Repo: <owner/name, the GitHub repository the ticket ships in. Linear only, in the ticket's description: the dispatcher reads it there, or from a GitHub link attached to the ticket, and a Linear ticket with neither never leaves the queue.>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## Problem Statement

The problem that the user is facing, from the user's perspective. Omit this section when a parent carries it.

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective, not layer-by-layer implementation.

## Implementation Decisions

One entry for each decision someone could get wrong, each with the fact that forced it and the rejected alternative. Omit this section when a parent carries them.

## Testing

The seam this slice tests at, and the nearest similar test in the codebase. One line.

## Acceptance criteria

- [ ] Given <state>, when <trigger>, then <single observable outcome>.

## Out of scope

The adjacent changes this ticket must not make. Omit this section when a parent carries them.

## Blocked by

One line per blocking ticket: `ENG-12` in Linear, `#12` or `owner/name#12` in GitHub Issues. The factory reads this section only from a GitHub issue's body; on Linear, and for a triage brief, add each blocker as a relation too. Omit this section when there are none, rather than writing "none".

</issue-template>
