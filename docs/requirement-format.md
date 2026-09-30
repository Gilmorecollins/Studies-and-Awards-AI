# Entry requirement format

Step 4a of the [plan](plan.md). This says what an entry requirement looks like as data, so that plain code can check a student against it.

Status: **agreed** by Gilmore Collins, 30 September 2026.

## What partner websites really say

I read the entry requirement pages of five institutions. They state requirements in six different ways, and the format has to hold all of them.

| Pattern | Example | Source |
| --- | --- | --- |
| **1. One rule for a whole level, with a Kenya line** | Kaplan Business School, diploma and bachelor: "Successful completion of the Kenya Certificate of Secondary Education (KCSE) awarded with C grade average or higher" | [kbs.edu.au](https://www.kbs.edu.au/admissions/entry-requirements/international-entry-requirements) |
| **2. The institution's own conversion from KCSE** | RMIT gives each course an Australian percentage and publishes what that is in KCSE (mean grade C+ for 60%, B for 65%, B+ for 70%, A- for 75%, A for 80% and above). | [rmit.edu.au](https://www.rmit.edu.au/study-with-us/international-students/apply-to-rmit-international-students/entry-requirements/country-equivalency/kenya) |
| **3. Points added up from subjects** | UWA adds the points of the best 7 KCSE subjects (A = 12 down to E = 1) and sets a minimum total per course (its table starts at 60 points). | [uwa.edu.au](https://uwa.edu.au/study/how-to-apply/international-and-overseas-qualifications/kenya-certificate-of-secondary-education) |
| **4. English: several tests, a score per skill, and ways to skip the test** | Kaplan accepts IELTS 6.0 overall (at least 6.0 in speaking and writing, 5.5 in listening and reading), or PTE 50, or Duolingo 110, and others. Tests must be less than two years old. UWA accepts a KCSE English grade of C+ instead of a test. | [kbs.edu.au](https://www.kbs.edu.au/admissions/entry-requirements/english-entry-requirements), uwa.edu.au |
| **5. More than one way in** | Kaplan master's: a bachelor's degree, **or** an advanced diploma plus two years of relevant work experience. | kbs.edu.au |
| **6. Vague, or Kenya not mentioned** | Torrens only says "Australian Year 12 or an equivalent qualification". TAFE Queensland's country table has no line for Kenya. | [torrens.edu.au](https://www.torrens.edu.au/studying-with-us/international-students/studying-in-australia/kenya), [tafeqld.edu.au](https://tafeqld.edu.au/international/how-to-apply/academic-entry-requirements) |

## The format

**Everything is in KCSE terms.** Kenyan students and our counsellors think in KCSE grades, so that is the only scale the site uses. Australian scales such as ATAR or a Year 12 percentage never appear on a screen or in a report (decided by Gilmore Collins, 30 September 2026). Where an institution publishes its own conversion from KCSE, the requirement is stored and shown as the KCSE grade.

Two kinds of record.

### 1. Requirement

One record for one condition a student must meet. Each has five parts.

**What it covers.** One of:

- the whole institution (for example a minimum age),
- one course level at the institution (for example every bachelor's degree),
- one course.

When two records disagree, the narrower one wins: a course's own rule beats the level rule, which beats the institution rule.

**Which route it belongs to.** A route is one way in, and has a name such as "KCSE direct" or "Diploma plus work experience". A student qualifies by meeting every requirement in any one route. English usually applies whichever route is used, so it is stored outside the routes.

**What is required.** One of these types:

| Type | What is stored | Example |
| --- | --- | --- |
| KCSE mean grade | Minimum grade | C or higher |
| KCSE points | How many best subjects are counted, and the minimum total | Best 7 subjects, 60 points |
| KCSE subject | Subject and minimum grade | Mathematics, C+ |
| Earlier qualification | Level, field if it matters, and grade if stated | Diploma (any field) |
| English test | Each accepted test with its overall score and the minimum for listening, reading, writing and speaking; how old the test may be | IELTS 6.0, speaking and writing 6.0, listening and reading 5.5, under 2 years old |
| English without a test | The other ways an institution accepts | KCSE English C+ |
| Work experience | Years, and the field if it matters | 2 years, relevant industry |
| Age | Minimum age | 18 |
| Other | A description only. The code cannot check it, so the counsellor sees it as "also needed". | Portfolio, interview, police check |

**Where it came from.** The link, the exact words on the page, the date it was read, a confidence level, and the staff member who checked it. As agreed, nothing counts until a staff member has checked it.

**House rule: Year 12 means KCSE.** Studies and Awards treats the KCSE as the Kenyan equivalent of Australian Year 12 (decided by Gilmore Collins, 30 September 2026). So when an institution asks for "Year 12 or equivalent" and has no separate line for Kenya (pattern 6), the requirement is stored as "KCSE completed". The record keeps the institution's own words and link, and is marked as using the house rule, so it is clear the wording "KCSE" is ours and not the institution's.

**What the institution does not say.** The house rule covers the qualification, not the grade. When a site asks for an Australian score and gives no KCSE grade for it, the requirement is stored as "KCSE completed" with the grade "not stated", and the counsellor sees "ask the institution for the grade". It is never guessed.

**When the institution uses an Australian score.** Some institutions give each course a score on an Australian scale and publish a table that converts KCSE to it (pattern 2: RMIT says a mean grade of B is 65%). The conversion is done once, when the requirement is recorded: a course asking for 65% is stored as "KCSE mean grade B". The institution's table is kept with its link as the proof, and a staff member checks it like any other requirement. How the institution works out the mean is kept too (RMIT: "best 7 subjects including 3 compulsory subjects (English, Kiswahili and Mathematics)"). UWA's points (pattern 3) are already KCSE: the best 7 subject grades added up.

### 2. Result of a check

For each requirement the checker gives one of three answers, with a reason:

- **Met.** "KCSE mean B; needs C or higher."
- **Not met**, with the gap. "IELTS writing 5.5; needs 6.0."
- **Cannot tell.** The student's record lacks the detail, or the institution does not state the rule. The counsellor sees "ask the institution".

A course is **eligible** when one route is fully met and English is met, **close** when the only things missing are ones the student can fix (for example a higher English score), and **unknown** when it has no checked requirements.

## A worked example

A student with KCSE mean grade B, English B-, and IELTS 6.0 (6.0 in every skill):

| Course | Rule | Result |
| --- | --- | --- |
| Kaplan, any bachelor's | KCSE C average; IELTS 6.0 with speaking and writing 6.0 | Eligible |
| RMIT, a bachelor's needing KCSE B | Mean grade B | Academic requirement met; English depends on the course |
| RMIT, a bachelor's needing KCSE B+ | Mean grade B | Not met: one grade short |
| UWA, a course needing 60 KCSE points | Needs the 7 best subject grades to add up the points | Cannot tell from the mean grade alone |

## What this means for the rest of the build

- **The intake form (step 5) must collect more than the mean grade**: every KCSE subject grade (for points), and the English score for each skill with the test date.
- **The database needs a small change.** The `entry_requirements` table from step 1 holds one grade and one English score per row. It needs the level scope, routes, per-skill English scores and a place for each institution's own KCSE conversion. I make this change as the first task of step 4b.
- **The extractor (step 4b) fills exactly these records**, with the quote for each.

## What was agreed

1. The format above: requirements in KCSE terms, with routes and three possible answers.
2. The site uses KCSE only. "Year 12 or equivalent" is "KCSE completed", and an Australian score with no KCSE grade given becomes "ask the institution for the grade".
3. Requirements are only collected for diplomas, advanced diplomas, bachelor's degrees and master's degrees (5,230 current courses at our 117 partners).
4. Partners only to begin with.
5. Requirements come only from the institution's own website.
6. Any active staff member can approve a requirement, with their name and the date recorded.
