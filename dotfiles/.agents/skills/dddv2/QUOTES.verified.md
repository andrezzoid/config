# Quote pool — verified verbatim

Output of task `verify-quote-pool` (delta `dddv2`). Each quote below was fetched
from its source at verification time and string-matched — none reproduced from
memory. The `author-skill` task consumes this record; use the verbatim text and
locator exactly as recorded here.

Verified: 2026-06-13.

---

## Goodhart's law (Strathern's phrasing) — VERIFIED

> "When a measure becomes a target, it ceases to be a good measure."

- **Source locator:** Wikipedia, *Goodhart's law*
  (https://en.wikipedia.org/wiki/Goodhart%27s_law), attributing the phrasing to
  Marilyn Strathern, "'Improving ratings': audit in the British University
  system," *European Review* 5 (1997).
- **Status:** VERIFIED — byte-match against the Wikipedia article.

---

## Conway (1968) — VERIFIED

> "…organizations which design systems (in the broad sense used here) are
> constrained to produce designs which are copies of the communication
> structures of these organizations."

Full sentence as it appears in the source (the quote above is the mid-sentence
fragment the delta cites):

> "The basic thesis of this article is that organizations which design systems
> (in the broad sense used here) are constrained to produce designs which are
> copies of the communication structures of these organizations."

- **Source locator:** Melvin E. Conway, "How Do Committees Invent?",
  https://www.melconway.com/Home/Committees_Paper.html (Conclusion section).
- **Status:** VERIFIED — byte-match against melconway.com.

---

## Brooks, *No Silver Bullet* (1986) — VERIFIED

> "The hardest single part of building a software system is deciding precisely
> what to build."

Following sentence (context):

> "No other part of the conceptual work is as difficult as establishing the
> detailed technical requirements, including all the interfaces to people, to
> machines, and to other software systems."

- **Source locator:** Frederick P. Brooks, "No Silver Bullet — Essence and
  Accidents of Software Engineering" (1986), full text hosted at
  https://www.cin.ufpe.br/~phmb/ip/MaterialDeEnsino/BrooksNoSilverBullet.html
- **Status:** VERIFIED — byte-match against the hosted full text.

---

## Brooks, *The Mythical Man-Month* p.116 — VERIFIED (quote); amendment = sourced note

> "Hence plan to throw one away; you will, anyhow."

Surrounding context as sourced (Wikiquote reproduces the passage; emphasis
markers are Wikiquote's italics):

> "The management question, therefore, is not *whether* to build a pilot system
> and throw it away. You *will* do that. […] Hence *plan to throw one away; you
> will, anyhow.*"

- **Source locator:** Wikiquote, *Fred Brooks*
  (https://en.wikiquote.org/wiki/Fred_Brooks), sourcing p.116 of *The Mythical
  Man-Month, Anniversary Edition* (1995). Original 1975 chapter 11, "Plan to
  Throw One Away."
- **Status:** VERIFIED — byte-match against Wikiquote's sourced reproduction.

**Anniversary-edition amendment (contextual note, not a verbatim quote):** In
the 1995 retrospective chapter 19, "The Mythical Man-Month after 20 Years,"
Brooks recants the sequential/waterfall model implicit in "plan to throw one
away" and advocates an *incremental-build* model — phrased as "grow, don't
build, software." The chapter section carries the heading to the effect of
"Plan to Throw One Away: The Waterfall Model Is Wrong! An Incremental-Build
Model Is Better."

- **Source locator:** anniversary-edition ch.19 retrospective; corroborated via
  the SuperSummary study guide (https://www.supersummary.com/the-mythical-man/summary/)
  and the Wikipedia *The Mythical Man-Month* article.
- **Status of amendment:** the *substance* (waterfall recanted, incremental-build
  preferred, "grow, don't build, software") is VERIFIED across secondary
  sources; the exact byte-for-byte chapter-section heading was NOT confirmable
  from a primary scan (O'Reilly/Pearson copies are paywalled or unparseable
  binary PDFs). Treat the amendment as a paraphrased note, not a verbatim quote.
  The verbatim p.116 quote above is the one to anchor on.

---

## Ousterhout (three lines) — VERIFIED against sibling skill files

All three lines string-matched byte-for-byte against the sibling SKILL.md files
(not from memory, not from the book — the delta requires matching the sibling
files specifically).

> "The best modules are those that provide powerful functionality yet have
> simple interfaces."

- **Source locator:** `dotfiles/.agents/skills/deep-module-design/SKILL.md:10`
  (Overview blockquote; full line there continues "I use the term _deep_ to
  describe such modules.").
- **Status:** VERIFIED — byte-match against the sibling file.

> "Complexity is anything related to the structure of a software system that
> makes it hard to understand and modify the system."

- **Source locator:** `dotfiles/.agents/skills/complexity-red-flags/SKILL.md:16`
  (Overview blockquote).
- **Status:** VERIFIED — byte-match against the sibling file.

> "define errors out of existence."

- **Source locator:** `dotfiles/.agents/skills/define-errors-away/SKILL.md:11`
  (Overview blockquote; appears as the tail of "…define your APIs so that there
  are no exceptions to handle: define errors out of existence.").
- **Status:** VERIFIED — byte-match against the sibling file.

---

## Naur, *Programming as Theory Building* — three load-bearing claims VERIFIED

The canonical-looking PDF scan (gwern.net/doc/cs/algorithm/1985-naur.pdf) is an
image-based scan and could not be text-extracted (no `pdftotext`/OCR available).
Verified instead against full-text reproductions; claims (2) and (3) corroborated
across two independent reproductions.

**(1) The program is the theory the team holds.**

> "One way of stating the main point I want to make is that programming in this
> sense primarily must be the programmers' building up knowledge of a certain
> kind, knowledge taken to be basically the programmers' immediate possession,
> any documentation being an auxiliary, secondary product."

- **Source locator:** full-text reproduction at
  https://gist.github.com/onlurking/fc5c81d18cfce9ff81bc968a7f342fb1
- **Status:** VERIFIED — quoted from the full-text reproduction (single source).

**(2) The text alone cannot carry the theory.**

> "A main claim of the Theory Building View of programming is that an essential
> part of any program, the theory of it, is something that could not conceivably
> be expressed, but is inextricably bound to human beings."

- **Source locator:** full-text reproduction
  https://gist.github.com/onlurking/fc5c81d18cfce9ff81bc968a7f342fb1 — and
  independently corroborated at
  https://erictsiliacos.medium.com/programming-as-theory-building-by-peter-naur-an-excerpt-482d9171651c
- **Status:** VERIFIED — byte-match across two independent reproductions.

**(3) A program dies when the team holding its theory dissolves.**

> "The death of a program happens when the programmer team possessing its theory
> is dissolved. A dead program may continue to be used for execution in a
> computer and to produce useful results. The actual state of death becomes
> visible when demands for modifications of the program cannot be intelligently
> answered."

- **Source locator:** full-text reproduction
  https://gist.github.com/onlurking/fc5c81d18cfce9ff81bc968a7f342fb1 — and
  independently corroborated at
  https://erictsiliacos.medium.com/programming-as-theory-building-by-peter-naur-an-excerpt-482d9171651c
- **Status:** VERIFIED — byte-match across two independent reproductions.

**Naur provenance caveat:** the primary scan (Naur 1985; repr. in *Computing: A
Human Activity*, 1992) was not directly text-extractable. The wording above comes
from faithful full-text web reproductions, two of which agree for claims (2) and
(3). If the skill needs a primary-scan citation, the locator is
gwern.net/doc/cs/algorithm/1985-naur.pdf (scan) — but its text was machine-read
here only via the reproductions above.
