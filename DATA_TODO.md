# DATA_TODO

Ambiguities, gaps, and assumptions found while scraping/parsing UCR data. Never silently guessed — always flagged here.

<!-- BEGIN scrape-ucr.ts -->
## scrape-ucr.ts

Last run: term 202640, 39 CS courses offered this term (39 offerings), 60 CS courses total had their prerequisites fetched (including 21 not offered this term but still real prereq leaves/electives), 55 of those had a parsed prerequisite tree, 64 total courses.json entries.

**Term used:** Requested term 202640 ("Fall 2026 (View Only)") is the newest term Banner currently publishes.

**Banner session quirk (adaptation):** changing the search subject on a second `searchResults` call within the same session is silently ignored by the server — it returns the first search's cached results. Fixed by re-POSTing `term/search` + `classSearch/resetDataForm` before every subject's search (see `scripts/lib/bannerClient.ts`).

**AND/OR grouping assumption:** prerequisite HTML wraps every single leaf term in its own parentheses, so parens carry no real nesting information. The tree is built by treating "or" as binding adjacent leaf terms (equivalent/alternate courses) and "and" as chaining those groups — this matched every multi-term example seen, but is an inference, not something the HTML states directly. Cross-checked against the catalog's own course-description text with `npm run check-prereqs` (see its DATA_TODO section below for results).

**Scope:** 250 CS section rows were excluded before any processing — grad-level courses (200+) and research/individual-study/internship/colloquium types (190, 193, 197, 198I, 287, 290, 297, 298I, 299, 302). None of these can ever be a degree requirement for the B.S., so they're not in sections.json/courses.json and don't generate warnings (see `scripts/lib/scopeFilter.ts`).

**Variable-unit / grouping / leaf-resolution warnings from this run:**
- CS178A: found a parenthesized group with 2 leaf terms (expected exactly 1) — the flat and/or grouping assumption may not hold here. Group text: "Course or Test: Computer Science 141 
 Minimum Grade of D-
 May not be taken concurrently. 
and
 Course or Test: Engineering 180W 
 Minimum Grade of D-
 May not be taken concurrently."
- CS119L: no "Lecture" type section found; treating each of its 1 section(s) (Laboratory) as a standalone Lecture with no linked activity.
- CS189: no "Lecture" type section found; treating each of its 1 section(s) (Activity) as a standalone Lecture with no linked activity.
- Referenced in a CS prerequisite but no title/units available (not offered in any searched term, or its subject wasn't scraped — only CS/MATH/PHYS/EE/ENGR/STAT/CHEM/ME/PHIL/LING/ECON/ENSC/BIEN were): CS167, MATH09HA, MATH09HB, MATH09HC, STAT155
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

**Course codes referenced by requirements.json with no courses.json entry** (subject never scraped, or not offered in any searched term): CS122B, CS133, CS142, CS167, CS177, ENGR101I, ENSC002, ME002, ME005, PHIL124, PHYS040B, STAT155
<!-- END parse-catalog.ts -->

<!-- BEGIN check-prereqs.ts -->
## check-prereqs.ts

Cross-checked every in-scope CS course's Banner-sourced Prereq tree against the catalog's own "Prerequisite(s):" text (`raw/catalog-text/full-raw.txt`, see the file header comment in `scripts/check-prereqs.ts` for why `-raw` mode specifically). Last run: 50 match, 1 mismatch, 3 not found in catalog text, 0 ambiguous heading(s).

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
