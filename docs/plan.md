# Development plan

This is the plan we follow to build Studies and Awards AI. We build one step at a time. A step is finished only when its "Done when" checks pass and you have tried it yourself. Then you commit, and we start the next step.

Last updated: 29 September 2026.

## What we are building

A website for Studies and Awards staff to use during a consultation with a Kenyan student who wants to study in Australia:

1. A counsellor enters the student's details: KCSE results, other qualifications, English test, study and work history, budget, preferred fields and cities.
2. The site checks for **gaps**: time gaps in study or work, missing subjects, low grades, no English test or a score that is too low.
3. The site **matches** the student against Australian institutions and courses, partners first, and sorts the results into:
   - **Eligible now**, ranked.
   - **Close**: what the student is missing, and which schools each fix would open up.
   - **Consider another destination** (later, when more countries are added).
4. The counsellor gets a **report** (on screen and as a PDF) with the student's strengths and weak areas.

## Rules we keep

- **Rules decide, the AI explains.** Plain code and versioned rules decide who is eligible. The AI only reads institution websites into data and writes explanations. It never decides a result on its own.
- **Every fact has a source.** Each entry requirement and visa rule stores the link it came from, the words on that page, a confidence level and the date it was last checked.
- **Staff verify before it counts.** A requirement the AI has read is not used in a result until a staff member has checked it.
- **Ready for more countries.** The student profile is not tied to Kenya or Australia. Each destination's rules live in their own "destination pack".
- **You own git.** I never commit or push. At the end of each step I give you a commit message.

## Steps

### Step 1: Skeleton, staff sign-in and database (done)

Committed. The website, the email sign-in for staff and the database tables are in place.

### Step 2: CRICOS catalogue (almost done)

The catalogue is in the database: 1,543 institutions, 3,901 campuses, 26,063 courses. On 29 September we moved to a new Supabase project, "Studies and Awards AI", because the first one could not be found in your Supabase account.

To finish:

- [x] You add `SUPABASE_SECRET_KEY` to `.env.local`.
- [x] I run the import and check the numbers in the database.
- [x] I check the 44 institutions marked as universities. All are correct: the list includes the new Adelaide University (the University of Adelaide and the University of South Australia merged), and Victoria University and Southern Queensland are each registered twice, once for campuses in other states.
- [ ] You get one admin account for yourself, so you can open the staff pages while we build (one SQL line, already in the README). This is only for testing. Proper staff accounts come in step 8.

**Done when:** the database holds the same numbers as the dry run, and you can sign in to the staff pages.

### Step 3: Link our partner list to CRICOS

The partner list (in the website project, `tools/data/partner-institutions.json`) has 130 Australian names. Some are nicknames, some have typos, and some cover more than one registered provider (for example Holmes Institute has three).

- [ ] A script suggests a CRICOS provider for each partner name and writes the suggestions to a file in this project, `data/partner-links.json`.
- [ ] I go through every suggestion using the CRICOS names, trading names and campus cities. Clear matches are marked as linked. Unclear ones go on a short list of questions for you.
- [ ] You answer the questions. Your git diff of the file is the review record.
- [ ] The script saves the links to the database and marks those institutions as partners. Each partner keeps the cities and course names from the list.
- [ ] I give you a list of typos and duplicate names to fix in the website's partner list.

We do not match the partner course names ("IT", "BSc Nursing") to CRICOS courses yet. They are too loose. They are kept as text for ranking in step 6.

**Done when:** every Australian partner name is either linked to a provider or marked "not on CRICOS", and the database shows the right partners.

### Step 4: Entry requirements (the biggest step)

We need each course's real entry requirements, in a form the code can check.

**4a. The requirement format.** We agree what a requirement looks like as data before building anything:

- KCSE mean grade, and minimum grades in named subjects.
- English test and scores (overall and per band), plus the ways to be let off the test.
- Prior qualifications: some institutions accept KCSE directly for a bachelor's degree, while many ask for a foundation year or diploma first. The format must record these routes, because they decide most Kenyan results.
- Work experience, portfolio or interview, and minimum age.

**4b. The extractor.** For each partner institution, the AI reads its international admissions pages (country pages for Kenya where they exist) and fills in the format. It records the link and the exact words that support each requirement. Everything it finds is saved as unchecked.

**4c. The review screen.** A staff page that shows each extracted requirement next to its source words and link. Staff can approve it, correct it or reject it.

- [ ] Agree the requirement format.
- [ ] Build the extractor and try it on 3 partners.
- [ ] Build the review screen.
- [ ] Run it on all partners; staff review the results.

**Done when:** every partner has checked requirements for the course levels we care about (see decision 1).

### Step 5: Student intake and gap check

- [ ] Add the study and work history to the database (the current tables have no place for it).
- [ ] The intake form: dropdowns for KCSE subjects and grades, English test, qualifications; typed dates for study and work history; budget, fields, cities and intake.
- [ ] The gap check, written as plain code: time gaps, missing or weak subjects, English. Each issue has a severity and a plain-language note.
- [ ] Test cases: a set of made-up students with the issues we expect the check to find.

**Done when:** a counsellor can enter a real past case in about 5 minutes, and the gap check finds the expected issues in every test case.

### Step 6: Matching, ranking and the report

- [ ] Visa rules for the student visa (subclass 500) entered as versioned rules with sources: money the student must show, English, and the Genuine Student requirement.
- [ ] The matching code: filter courses by level, field, city and budget, then check each against its checked requirements. Each course comes out as eligible, close, not eligible or unknown (no checked requirements yet).
- [ ] Ranking: partners first, then how well the student fits, then cost.
- [ ] The "close" list: which improvements (for example a higher English score or a foundation year) would open up which schools.
- [ ] The AI writes the explanation from the results only.
- [ ] The report on screen and as a PDF. Each assessment saves a copy of its inputs and the rules it used.

**Done when:** the results for every test case are correct, and every line of the report can be traced to a checked requirement or rule.

### Step 7: Benchmark and tune

- [ ] You provide anonymised past cases: the student's details, what our consultants suggested and what really happened.
- [ ] We run each case through the site and compare its suggestions with the consultants' and with the real outcomes.
- [ ] We fix what the comparison shows: missing requirements, wrong rules, poor ranking.

**Done when:** the site's suggestions are at least as good as the consultants' on the past cases.

### Step 8: Go live (later)

- [ ] An admin page to give staff their accounts.
- [ ] Hosting (for example Vercel) with its own web address.
- [ ] Switch on the "Studies and Awards AI" button on the website (`AI_CHECKER_URL` in `site/js/main.js`).
- [ ] Privacy: student consent, who can see which records, and how long records are kept.

## What I need from you

| Step | What |
| --- | --- |
| 2 | The Supabase secret key in `.env.local`, and the email for your admin account |
| 3 | Answers to the questions on unclear partners |
| 4 | An Anthropic API key (console.anthropic.com), and your OK on the running cost |
| 4 | A counsellor to check the extracted requirements |
| 5 | A counsellor to try the intake form |
| 7 | Anonymised past cases |

## Decisions to make

Each has my recommendation. We settle each one before the step that needs it.

1. **Which course levels come first?** (step 4) Recommendation: foundation, English language, diplomas and advanced diplomas, bachelor's degrees, and master's by coursework. These are what our students apply for. Schools, research degrees and short courses come later.
2. **Which institutions get requirements first?** (step 4) Recommendation: partners only. Other institutions come after step 7.
3. **Where can requirements come from?** (step 4) Recommendation: the institution's own website only, never agents' or third-party sites.
4. **Who can approve a requirement?** (step 4) Recommendation: any active staff member, with their name and the date recorded. Admins can undo an approval.

## Risks

- **KCSE rules are hard to find.** Many institutions put them in country pages or PDFs. The extractor has to handle both, and some will need a staff member to enter them by hand.
- **Rules change.** Visa rules are versioned, and each requirement has a last-checked date so old ones can be checked again.
- **The AI can misread a page.** That is why nothing is used before a staff member checks it.
- **Running cost.** The extractor sends web pages to the AI. I will give you a cost estimate after the trial on 3 partners, before running it on all of them.
