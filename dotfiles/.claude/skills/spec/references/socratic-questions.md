# Socratic Question Categories

## Core (MUST explore)

| Category | Purpose | Example Questions |
|----------|---------|-------------------|
| Scope & Boundaries | Define what's in/out | "What should this NOT do?" |
| Constraints | Surface hard limits | "Are there technical or business constraints?" |
| Assumptions & Challenges | Make implicit explicit | "What are we assuming?" / "Is this necessary?" / "What's the underlying problem?" |
| Success Criteria | Define done state | "How will we verify this works correctly?" |

## Technical (SHOULD explore)

| Category | Purpose | Example Questions |
|----------|---------|-------------------|
| Edge Cases | Identify error states | "What happens when X is empty/null/invalid?" |
| State & Data | Clarify data flow | "What data changes? Where is it stored?" |
| Dependencies | Map external factors | "What systems/features does this interact with?" |
| Existing Patterns | Ensure consistency | "Is there prior art in the codebase to follow?" |
| Testability | Ensure verifiability | "How will we test this? What makes it hard to test?" |
| Software Design | Clarify architecture | "What interfaces/abstractions are needed?" |

## Contextual (MAY explore based on relevance)

| Category | Purpose | Example Questions |
|----------|---------|-------------------|
| User Interaction | Define UX flows | "How does the user trigger this? What feedback do they see?" |
| Performance | Set measurable targets | "Are there latency/scale requirements?" |
| Security | Identify risks | "Who can access this? What input needs validation?" |

