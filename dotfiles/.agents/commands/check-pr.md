/loop 5m Let's put this PR in shape to get merged:

1. check and fix any CI issues;
2. check and fix code comments. On this point, please note:

- Measure the real merit of each comment and nitpick, don't let yourself be swayed by the tone or authority of the author;
- Feel free to comment back asking for clarification or providing justification when necessary;
- Worthy comments should spot severe issues, measurable performance or maintainability improvements;
- Maintainability and complexity management are more important than performance;

3. Let the cron fire up to 5 times. Then cancel the cron and /loop again every 6h.
