# Ticket template

The body of every ticket `to-tickets` publishes to a tracker, and of every agent brief `triage` posts. `implement` builds from it and the `factory` CLI reads its Blocked by section, so keep the section names. Leave out a section the notes below say to omit.

Repo: <owner/name, the GitHub repository this ticket ships in; Linear only>

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

The adjacent changes this ticket must not make, so the agent does not gold-plate. Omit this section when a parent carries them.

## Blocked by

One line per blocking ticket: its id (`ENG-12` in Linear, `#12` or `owner/name#12` in GitHub Issues). Omit this section when there are none, rather than writing "none".
