# DATA_TODO

Ambiguities, gaps, and assumptions found while scraping/parsing UCR data. Never silently guessed — always flagged here.

<!-- BEGIN scrape-ucr.ts -->
## scrape-ucr.ts

Last run: term 202640, 39 CS courses offered this term, 60 CS courses total had their prerequisites fetched (including 21 not offered this term but still real prereq leaves/electives), 55 of those had a parsed prerequisite tree. Plus 40 MATH/PHYS/ENGR/EE/STAT courses that appear in requirements.json or a CS prereq (35 with sections this term), 39 with a parsed prerequisite tree. 74 offerings, 86 total courses.json entries.

**Term used:** Requested term 202640 ("Fall 2026 (View Only)") is the newest term Banner currently publishes.

**Banner session quirk (adaptation):** changing the search subject on a second `searchResults` call within the same session is silently ignored by the server — it returns the first search's cached results. Fixed by re-POSTing `term/search` + `classSearch/resetDataForm` before every subject's search (see `scripts/lib/bannerClient.ts`).

**AND/OR grouping assumption:** prerequisite HTML wraps every single leaf term in its own parentheses, so parens carry no real nesting information. The tree is built by treating "or" as binding adjacent leaf terms (equivalent/alternate courses) and "and" as chaining those groups — this matched every multi-term example seen, but is an inference, not something the HTML states directly. Cross-checked against the catalog's own course-description text with `npm run check-prereqs` (see its DATA_TODO section below for results).

**Scope:** 250 CS section rows were excluded before any processing — grad-level courses (200+), research/individual-study/internship/colloquium numbers (190, 193, 197, 198I, 287, 290, 297, 298I, 299, 302), and research/thesis/internship/individual-study schedule types. MATH/PHYS/ENGR/EE/STAT use the same rule (200+ and 190-199 excluded) and are further limited to courses in requirements.json or a CS prereq. None of the excluded rows can ever be a degree requirement for the B.S., so they're not in sections.json/courses.json and don't generate warnings (see `scripts/lib/scopeFilter.ts`).

**Linked sections:** Banner's `fetchLinkedSections` returns every valid lecture+activities combination. These are grouped by activity type into `Lecture.linked` (one `ActivityGroup` per type); the solver takes one activity from EACH group. Every lecture's combinations are checked to be the exact cross product of its groups — any that aren't are listed in the warnings below.

**Placement exams:** prereq lines like "Math: Score for Prereq 612 to 613" are OR-alternatives to a course (Banner's "Course or Test:"). Each course that accepts one gets a checklist-only `PLACE:<course>` item. The score codes are Banner's own and their meaning isn't published; which codes unlock which course: PLACE:MATH004 (622-623, 630-631, 624-625, 626-627); PLACE:MATH005A (626-627, 624-625, 620-621); PLACE:MATH006A (614-615, 628-629); PLACE:MATH007A (616-617); PLACE:MATH009A (612-613); PLACE:MATH022 (610-611).

**Term dates:** 2026-09-24 to 2026-12-04 (most common meeting startDate/endDate in Banner), scraped 2026-10-20 — written to src/data/meta.json for the term badge, footer, and .ics export.

**Variable-unit / grouping / leaf-resolution warnings from this run:**
- CS178A: found a parenthesized group with 2 leaf terms (expected exactly 1) — the flat and/or grouping assumption may not hold here. Group text: "Course or Test: Computer Science 141 
 Minimum Grade of D-
 May not be taken concurrently. 
and
 Course or Test: Engineering 180W 
 Minimum Grade of D-
 May not be taken concurrently."
- MATH006B: found a parenthesized group with 2 leaf terms (expected exactly 1) — the flat and/or grouping assumption may not hold here. Group text: "Course or Test: Mathematics 006A 
 Minimum Grade of C-
 May not be taken concurrently. 
and
 Course or Test: Mathematics 06LB 
 May be taken concurrently."
- CS119L: no "Lecture" type section found; treating each of its 1 section(s) (Laboratory) as a standalone Lecture with no linked activity.
- CS189: no "Lecture" type section found; treating each of its 1 section(s) (Activity) as a standalone Lecture with no linked activity.
- ENGR001I: no "Lecture" type section found; treating each of its 1 section(s) (Activity) as a standalone Lecture with no linked activity.
- EE030LA: no "Lecture" type section found; treating each of its 4 section(s) (Laboratory) as a standalone Lecture with no linked activity.
- Referenced in a CS prerequisite but no Banner title/units (not offered in any searched term, or its subject wasn't scraped — only CS/MATH/PHYS/EE/ENGR/STAT/CHEM/ME/PHIL/LING/ECON/ENSC/BIEN/WRIT were); parse-catalog.ts fills these from the catalog text where it can — see its section: CS167, MATH09HA, MATH09HB, MATH09HC, STAT155
<!-- END scrape-ucr.ts -->

<!-- BEGIN parse-catalog.ts -->
## parse-catalog.ts

`requirements.json` covers only the **Computer Science Major (B.S.)** — not the Computer Science Applications or Computer Science with Business Applications majors, which share the same catalog pages but are different degrees.

Source: UCR 2026-27 General Catalog (`raw/catalog-cs.pdf`), Department of Computer Science and Engineering > Major Requirements > "Computer Science Major". Hand-transcribed after extracting the full catalog text to `raw/catalog-text/full.txt` (search for "Computer Science Major", around line 12530) — see the file header comment in `scripts/parse-catalog.ts` for why this wasn't auto-parsed from prose.

**Simplifications made to fit the RequirementGroup type (all flagged where they occur above too):**
- `cs-bs-ld-calculus-sequence`: now uses `oneOfTracks` — the catalog's two alternate 3-course calculus tracks (MATH 005A/B/C or MATH 009A/B/C) are modeled as exactly that, so a solver respecting this rule can't mix courses across tracks.
- `cs-bs-ld-engineering-elective`: catalog requires the 8 units to split 4 depth + up to 4 breadth, from two different (overlapping) course lists. The suggested `courses` list is restricted to depth-only electives (dropping the breadth-only CHEM/ECON/LING/PHIL/STAT options) — any chooseUnits=8 pick from this list is guaranteed to satisfy the real "4 depth units minimum" sub-rule, at the cost of not offering the breadth-only alternative.
- `cs-bs-ud-topics-seminar`: catalog says "CS 179 (E-Z)", any lettered topics variant from E through Z. Only CS179G and CS179M are listed, because those are the only variants confirmed offered in the scraped term — other letters may be real in other terms and aren't enumerable from catalog text alone.
- `cs-bs-ud-tech-electives`: catalog text says "at least half of the **(16)** units" must be CS courses, but the stated total is 32 units (half would be 16 — the numbers are internally consistent, but double check this isn't a stale catalog edit from a smaller unit total). Added `preferSubjects: ["CS"]` so a solver can bias its picks toward CS courses, but the "at least half" split itself still isn't enforced by chooseUnits.
- `ENGR001I`, `ENGR101I`, and `MATH046` (catalog: "ENGR 001-I", "ENGR 101-I", "MATH 46") were originally guessed code formats, not verified live. Now confirmed correct against live Banner data once ENGR/MATH were added to the metadata scrape: ENGR001I = "Computer Science" (there's also an ENGR001G for Computer Engineering and ENGR001M for CS+Business — 001I is the right one), ENGR101I likewise, and MATH046 = "Introduction to Ordinary Differential Equations" (distinct from MATH045, the physical-sciences/engineering variant).
- The catalog's engineering-elective depth list has what reads like a literal duplicate: "EE 020A & 30LA" and, later in the same sentence, "EE 20A" — transcribed as EE020A + EE030LA (once) rather than twice.

**Courses with no live Banner section in any scraped term** (`scripts/lib/catalogOnlyCourses.ts`): CS133, CS142, CS167, CS177, ENSC002, ME002, ME005, PHIL124, STAT155, and ENGR101I were all hand-transcribed from this catalog's own course-description text instead, each marked `offered: false` since there's no evidence any of them ran in Fall/Winter/Spring 2025-26. Dropped non-course restrictions that can't be a Prereq leaf: CS167's online-section enrollment restriction, CS177's "C++ programming proficiency", PHIL124's "consent of instructor", STAT155's university-GE-style "or equivalent" disclaimers, and ENGR101I's class-standing/major restriction (confirmed via "ENGR 001 (E-Z)"'s letter key that I = Computer Science, matching live ENGR001I data).

**CS122B could not be resolved at all** — no live Banner section in term 202640 or its CS fallback terms (202620, 202610), AND no standalone course-description entry anywhere in the catalog text (only appears inside other courses' technical-elective lists, e.g. "CS 110, CS 122A, CS 122B, CS 130..."). It's likely only described under a cross-listed pair in a different catalog section (CS122A's own catalog entry couldn't be found either, for the same reason — see check-prereqs.ts's "not found" list). Left out of courses.json rather than guessed; still listed in `cs-bs-ud-tech-electives`'s `courses` array as a known elective option.

**Course codes referenced by requirements.json with no courses.json entry** (subject never scraped, or not offered in any searched term, and no catalog description found): CS122B
<!-- END parse-catalog.ts -->

<!-- BEGIN check-prereqs.ts -->
## check-prereqs.ts

Cross-checked every in-scope CS course's Banner-sourced Prereq tree against the catalog's own "Prerequisite(s):" text (`raw/catalog-text/full-raw.txt`, see the file header comment in `scripts/check-prereqs.ts` for why `-raw` mode specifically). Last run: 54 match, 1 mismatch, 3 not found in catalog text, 0 ambiguous heading(s).

**CS178A was previously flagged as a grouping anomaly (see scrape-ucr.ts section) but is confirmed CORRECT**: the catalog says "Prerequisite(s): CS 141, ENGR 180W" (comma = AND), matching the parsed tree `{and: [CS141, ENGR180W]}` exactly. No fix needed.

**Remaining genuine mismatches** (Banner's own registration-system prerequisite differs from the printed catalog — a real UCR data discrepancy, not a parsing bug; left as Banner-sourced since that's what actually gates registration):
MISMATCH CS009B
  catalog text: "CS 009A with a grade of C- or better, CS 09HA
with a grade of C- or better; or equivalent"
  catalog leaves: [CS009A, CS09HA]
  parsed leaves:  [CS009A]
  catalog has, parsed is missing: CS09HA

**Not found in catalog text** (known script limitations, not data problems — verified by hand): CS009C, CS042, CS122A. CS042's title is literally the word "A" ("A Hitchhiker's Guide to...") and CS009C's title starts with "C++" — both defeat the heading-detection heuristic (which requires an uppercase letter then a lowercase one right after the course number) since neither looks like the start of an ordinary word. CS122A has no standalone course-description entry in the catalog at all — it's likely only described under its cross-listed pair EE128.
<!-- END check-prereqs.ts -->

<!-- BEGIN solver -->
## solver

**Resolved — non-CS section data, linked activity groups** (see the scrape-ucr.ts section for how each works).

**Resolved — pick-N prereqs.** `Prereq` has a `{ pick: n, of: [...] }` node; the parser turns Banner's one-line "Rule: PICKn ... End of Rule PICKn" blocks into it. EE030LA is now "pick 2 of {EE020, EE020A, EE020B, MATH045, MATH046} AND (PHYS040C or PHYS040HC)". EE030LA is the only course in the scraped data with a PICK rule.

**Resolved — placement exams.** "Math: Score for Prereq X to Y" lines become checklist-only `PLACE:<course>` items (0 units, `placement: true`, `offered: false`) — e.g. "Math placement: ready for MATH 009A" — OR-ed with the course alternatives, so an incoming freshman who ticks it is offered MATH009A. Side effect: MATH005A previously had *no* parsed prereq (anyone could take it); it now correctly requires `PLACE:MATH005A`. The score codes' meaning isn't published — the code -> course mapping is in the scrape-ucr.ts section.

**Resolved — checklist-only prereq alternates.** WRIT020/WRIT020S (from live Banner) and MATH09HA/HB/HC, PHYS040HA/HB/HC (from the catalog's own course entries) are in courses.json as `offered: false`, so ENGR180W unlocks via WRIT020/WRIT020S. See `CHECKLIST_ONLY_CODES` in `scripts/lib/catalogOnlyCourses.ts`.

**Not added — ENGL001B.** It has no Banner row in any searched term and no course entry in the 2026-27 catalog (whose ENGL listings start at ENGL 012); it only appears inside other departments' prereq text, so it's apparently a retired code. Left out rather than invented — ENGR180W is still unlockable via WRIT020/WRIT020S.

**Resolved — requirement group names.** Catalog 1.d lists "MATH 010A; and either MATH 031 or EE 020B" without names. Renamed to match course titles: `cs-bs-ld-multivariable-calculus` "Multivariable Calculus" (MATH010A) and `cs-bs-ld-linear-algebra` "Linear Algebra (MATH 031 or EE 020B)". Also relabeled ENGR101I's group "Professional Development and Mentoring (ENGR 101-I)" (its Banner/catalog title) and CS179's "CS 179 Project in Computer Science" (catalog: "CS 179 (E-Z) Project in Computer Science").
<!-- END solver -->
