---
name: quiz-me
description: Check that the human actually holds the theory of a change — a short, targeted quiz whose wrong answers reveal misalignment on either side. Use before the human agrees to a risky plan, before a large change merges, after a long session where the agent worked unsupervised, or whenever the human says "quiz me".
---

# Quiz Me

"Looks good" is not evidence of understanding — reading isn't holding. A human who can *answer questions* about a change holds its theory; one who can't is about to approve work they'd object to if they understood it. The quiz makes that visible in five minutes, while it's still cheap.

The twist that keeps it honest: **a wrong answer indicts either side.** Maybe the human missed it — or maybe the theory, doc, or code never actually said it, and the "wrong" answer is exactly what the artifact reasonably implies. Every miss is a finding; the only question is *whose*.

## How

1. **Target decisions with behavioral consequences.** "What happens when X fails?" "Why did we reject Y?" "Which module owns Z, and who may call it?" Never trivia — names, counts, file paths test memory, not theory.
2. **3–7 questions, one at a time.** Wait for each answer. Multiple-choice works for forks; open answers are better for consequences.
3. **On a miss, diagnose before explaining.** Does the theory, doc, or code actually state this clearly? If yes — explain, then re-ask a variant later. If no — the miss is a defect in the artifact: fix the doc, the comment, or the theory, and say so. Count these; they're the valuable ones.
4. **Close with the score and the gaps** — what to re-read, what got fixed because of a miss, and whether you'd bet on the human's mental model now. For big gaps, offer a visualize explainer and a re-quiz.

Works in reverse too: invite the human to ask *you* questions — your wrong answers are theory gaps with exactly the same two possible causes.

**Done when:** every question is answered correctly, or each miss has become a fix or an explicit gap the human accepts. When the quiz gates a merge, the human passes clean or consciously chooses to ship anyway — never a silent shrug.
