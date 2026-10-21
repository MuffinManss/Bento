# DATA_TODO

Ambiguities, gaps, and assumptions found while scraping/parsing UCR data. Never silently guessed — always flagged here.

<!-- BEGIN scrape-ucr.ts -->
## scrape-ucr.ts

Last run: term 202640, 68 CS courses, 53 with a parsed prerequisite tree, 68 offerings, 81 total courses.json entries.

**Term used:** Requested term 202640 ("Fall 2026 (View Only)") is the newest term Banner currently publishes.

**Banner session quirk (adaptation):** changing the search subject on a second `searchResults` call within the same session is silently ignored by the server — it returns the first search's cached results. Fixed by re-POSTing `term/search` + `classSearch/resetDataForm` before every subject's search (see `scripts/lib/bannerClient.ts`).

**AND/OR grouping assumption:** prerequisite HTML wraps every single leaf term in its own parentheses, so parens carry no real nesting information. The tree is built by treating "or" as binding adjacent leaf terms (equivalent/alternate courses) and "and" as chaining those groups — this matched every multi-term example seen, but is an inference, not something the HTML states directly. Re-verify against the catalog for any course below whose tree looks wrong.

**Variable-unit / grouping / leaf-resolution warnings from this run:**
- CS178A: found a parenthesized group with 2 leaf terms (expected exactly 1) — the flat and/or grouping assumption may not hold here. Group text: "Course or Test: Computer Science 141 
 Minimum Grade of D-
 May not be taken concurrently. 
and
 Course or Test: Engineering 180W 
 Minimum Grade of D-
 May not be taken concurrently."
- CS210: found a parenthesized group with 2 leaf terms (expected exactly 1) — the flat and/or grouping assumption may not hold here. Group text: "Course or Test: Computer Science 010B 
 Minimum Grade of D-
 May not be taken concurrently. 
and
 Course or Test: Mathematics 010A 
 Minimum Grade of D-
 May not be taken concurrently."
- CS220: found a parenthesized group with 2 leaf terms (expected exactly 1) — the flat and/or grouping assumption may not hold here. Group text: "Course or Test: Computer Science 141 
 May not be taken concurrently. 
and
 Course or Test: Computer Science 161 
 May not be taken concurrently."
- CS252A: found a parenthesized group with 2 leaf terms (expected exactly 1) — the flat and/or grouping assumption may not hold here. Group text: "Course or Test: Computer Science 100 
 Minimum Grade of D-
 May not be taken concurrently. 
and
 Course or Test: Computer Science 141 
 Minimum Grade of D-
 May not be taken concurrently."
- CS119L: no "Lecture" type section found; treating each of its 1 section(s) (Laboratory) as a standalone Lecture with no linked activity.
- CS179G: no "Lecture" type section found; treating each of its 2 section(s) (Discussion, Laboratory) as a standalone Lecture with no linked activity.
- CS179M: no "Lecture" type section found; treating each of its 2 section(s) (Discussion, Laboratory) as a standalone Lecture with no linked activity.
- CS189: no "Lecture" type section found; treating each of its 1 section(s) (Activity) as a standalone Lecture with no linked activity.
- CS190: no "Lecture" type section found; treating each of its 9 section(s) (Individual Study) as a standalone Lecture with no linked activity.
- CS193: no "Lecture" type section found; treating each of its 17 section(s) (Research) as a standalone Lecture with no linked activity.
- CS197: no "Lecture" type section found; treating each of its 1 section(s) (Research) as a standalone Lecture with no linked activity.
- CS198I: no "Lecture" type section found; treating each of its 1 section(s) (Internship) as a standalone Lecture with no linked activity.
- CS287: no "Lecture" type section found; treating each of its 1 section(s) (Colloquium) as a standalone Lecture with no linked activity.
- CS290: no "Lecture" type section found; treating each of its 2 section(s) (Individual Study) as a standalone Lecture with no linked activity.
- CS297: no "Lecture" type section found; treating each of its 72 section(s) (Research) as a standalone Lecture with no linked activity.
- CS298I: no "Lecture" type section found; treating each of its 49 section(s) (Internship) as a standalone Lecture with no linked activity.
- CS299: no "Lecture" type section found; treating each of its 73 section(s) (Research) as a standalone Lecture with no linked activity.
- CS302: no "Lecture" type section found; treating each of its 1 section(s) (Activity) as a standalone Lecture with no linked activity.
- CS235: lecture CRN(s) 24054 fully async/online with no scheduled time — "meetings" is empty, so the solver can never detect a conflict for them. Verify this is intentional.
- CS005: linked activity CRN(s) 33958, 33960 fully async/online with no scheduled time — "meetings" is empty, so the solver can never detect a conflict for them. Verify this is intentional (e.g. an online-only lab/discussion).
- CS006: linked activity CRN(s) 12997 fully async/online with no scheduled time — "meetings" is empty, so the solver can never detect a conflict for them. Verify this is intentional (e.g. an online-only lab/discussion).
- CS008: linked activity CRN(s) 13005, 13004, 13003 fully async/online with no scheduled time — "meetings" is empty, so the solver can never detect a conflict for them. Verify this is intentional (e.g. an online-only lab/discussion).
- CS190: variable-unit course (1-5); Course.units only supports one number — used the high end (5). Verify against the catalog.
- CS193: variable-unit course (1-4); Course.units only supports one number — used the high end (4). Verify against the catalog.
- CS197: variable-unit course (1-4); Course.units only supports one number — used the high end (4). Verify against the catalog.
- CS198I: variable-unit course (1-4); Course.units only supports one number — used the high end (4). Verify against the catalog.
- CS290: variable-unit course (1-6); Course.units only supports one number — used the high end (6). Verify against the catalog.
- CS297: variable-unit course (1-6); Course.units only supports one number — used the high end (6). Verify against the catalog.
- CS298I: variable-unit course (1-12); Course.units only supports one number — used the high end (12). Verify against the catalog.
- CS299: variable-unit course (1-12); Course.units only supports one number — used the high end (12). Verify against the catalog.
- Referenced in a CS prerequisite but no title/units available (not offered this term, or its subject wasn't scraped — only CS/MATH/PHYS were): CS009C, CS167, CS252B, EE016, EE020B, EE114, EE120A, EE251A, EE251B, ENGR180W, MATH005C, MATH09HA, MATH09HB, MATH09HC, STAT107, STAT155, STAT156A, STAT160A, STAT207, STAT208
<!-- END scrape-ucr.ts -->

<!-- BEGIN parse-catalog.ts -->
## parse-catalog.ts

`requirements.json` covers only the **Computer Science Major (B.S.)** — not the Computer Science Applications or Computer Science with Business Applications majors, which share the same catalog pages but are different degrees.

Source: UCR 2026-27 General Catalog (`raw/catalog-cs.pdf`), Department of Computer Science and Engineering > Major Requirements > "Computer Science Major". Hand-transcribed after extracting the full catalog text to `raw/catalog-text/full.txt` (search for "Computer Science Major", around line 12530) — see the file header comment in `scripts/parse-catalog.ts` for why this wasn't auto-parsed from prose.

**Simplifications made to fit the RequirementGroup type (all flagged where they occur above too):**
- `cs-bs-ld-calculus-sequence`: the catalog offers two alternate 3-course calculus tracks (MATH 005A/B/C or MATH 009A/B/C) — modeled as chooseN=3 over the union of both, which would incorrectly accept a mixed combo (e.g. one course from each track) as satisfying the requirement. There is no real UCR path where a student takes a mixed combo, but the type doesn't block it either. Flag if the solver needs to special-case this.
- `cs-bs-ld-engineering-elective`: catalog requires the 8 units to split 4 depth + up to 4 breadth, from two different (overlapping) course lists. Modeled as a single chooseUnits=8 over the combined list — the depth/breadth split is NOT enforced.
- `cs-bs-ud-topics-seminar`: catalog says "CS 179 (E-Z)", any lettered topics variant from E through Z. Only CS179G and CS179M are listed, because those are the only variants confirmed offered in the scraped term — other letters may be real in other terms and aren't enumerable from catalog text alone.
- `cs-bs-ud-tech-electives`: catalog text says "at least half of the **(16)** units" must be CS courses, but the stated total is 32 units (half would be 16 — the numbers are internally consistent, but double check this isn't a stale catalog edit from a smaller unit total). The CS-vs-non-CS half-split is NOT enforced by chooseUnits either.
- Course codes without a hyphen/space guess: `ENGR001I` (catalog: "ENGR 001-I") and `ENGR101I` (catalog: "ENGR 101-I") — format inferred from other hyphenated-suffix codes seen elsewhere, NOT verified live (ENGR subject was never scraped).
- The catalog's engineering-elective depth list has what reads like a literal duplicate: "EE 020A & 30LA" and, later in the same sentence, "EE 20A" — transcribed as EE020A + EE030LA (once) rather than twice.
- "MATH 46" in the catalog (no leading zero) was transcribed as `MATH046` to match this catalog's zero-padding elsewhere — not verified live.

**Course codes referenced by requirements.json with no courses.json entry** (subject never scraped — ENGR, STAT, EE, PHIL, CHEM, ECON, LING, BIEN, ENSC, ME, MATH 100+ series — or not offered this term): BIEN010, CHEM001A, CHEM001B, CHEM001C, CHEM008A, CHEM008HA, CHEM01HA, CHEM01HB, CHEM01HC, CHEM01LA, CHEM01LB, CHEM01LC, CHEM08HLA, CHEM08LA, CHEM1HLA, CHEM1HLB, CHEM1HLC, CS110, CS122A, CS122B, CS131, CS133, CS135, CS142, CS145, CS147, CS162, CS167, CS169, CS172, CS173, CS177, CS178B, CS181, CS183, ECON005, ECON060, EE005, EE016, EE020A, EE020B, EE030LA, EE120A, EE120B, EE168, ENGR001I, ENGR101I, ENGR180W, ENSC001, ENSC002, LING020, LING021, MATH005B, MATH005C, MATH126, MATH135B, ME002, ME005, ME009, ME010, ME018A, ME018B, PHIL124, PHIL125, PHIL126, PHIL127, PHYS040B, STAT004, STAT008, STAT010, STAT155
<!-- END parse-catalog.ts -->
