# Reports

A report tells André what happened where the work met something its contract
didn't settle. Every report is one comment in the same shape, so he reads them
all the same way. Anything that changes the contract goes on the ticket;
anything that describes the work goes on the pull request.

| Kind | Write one when | Post it with |
|---|---|---|
| `Handed back` | you stop: the contract can't hold, or only André can decide | `factory tickets handback <ID> --body-file <file>` |
| `Revised` | André agreed in the session to change the contract | `factory tickets revise <ID> --body-file <file>` |
| `Deviation` | the work departs from the contract and acceptance still holds | `factory pr report <PR> --body-file <file>` |
| `Unverified` | a claim that neither a test nor a run could prove | `factory pr report <PR> --body-file <file>` |

## Template

```markdown
## <Kind> · <what happened, in 5 to 10 plain words>

**Expected:** <what the contract or the plan said>
**Happened:** <what you found or did instead>
**Why:** <the evidence: a command and its output line, file:line, a screenshot path>
**Affects:** <what else it touches: callers, other tickets, users>
**Needs you:** <the decision, its options and your recommendation; or the action only André can take>
```

The title line comes first, with the kind spelled as in the table: the CLI
refuses a report without it, and the inbox finds reports by it. Write Needs you
only when André must act: on a pull request, it also turns the pull request
back into a draft. Two or more reports in one comment follow each other, each
with its own title line.

## Writing it

- Put blocked, broken or unfinished in the title.
- André hasn't read the diff or the session: name things the way he would, and
  use only ids he knows.
- Show it: the command and its output, the before and after, the screenshot.
- One or two sentences per field. A report that needs scrolling buries its
  question.
