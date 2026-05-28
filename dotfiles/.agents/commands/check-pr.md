/loop 5m

Let's put this PR in shape to get merged as a Senior Engineer would:

1. Bring the branch/worktree up to date with the base branch and solve merge conflicts

- Merge the base branch into the current branch and worktree (no need to create a separate branch for the merge)
- Gather all the necessary context to understand the conflict
- When uncertain, ask the user for help
- When all conflicts are resolved, list all solved conflicts (file, and line numbers) and the rationale behind each

2. Check and fix any CI issues

3. Check and fix valuable code comments:

- Measure the real merit of each comment and nitpick, don't let yourself be swayed by the tone or authority of the author
- Comment back asking for clarification or providing justification when necessary. Make sure to @ mention the author.
- Worthy comments should spot severe issues, measurable performance or maintainability improvements
- Maintainability and complexity management are more important than performance

4. Resolve conversation for addressed comments that were either fixed or ignored

5. Let the cron fire up to 5 times. Then cancel the cron and /loop again every 6h.
