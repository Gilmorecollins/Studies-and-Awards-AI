# Studies and Awards AI

An online consultant, delivered as a website, that helps students check whether they are eligible to study in Australia. Students and staff use it in a normal web browser on phone or computer; there is nothing to download or install. It is built with Next.js (a framework for building websites; TypeScript, Tailwind) with Supabase for the database and staff sign-in.

**Status: step 2.** The website skeleton, staff email sign-in, the database schema and the CRICOS import (every Australian provider, campus and course) are in place. Linking the partner list, the requirement extractor and the student checker come next. The steps are set out in [docs/plan.md](docs/plan.md).

## Requirements

- Node.js 20.9 or newer (built and tested on Node 24)
- A Supabase project (free tier is fine)

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                   # http://localhost:3000
```

Other scripts: `npm run build` (production build), `npm start` (serve the build), `npm run lint`.

## Environment variables

Put these in `.env.local` in the project folder. That file is gitignored; never commit real keys. `.env.example` lists the same names with placeholders.

| Name | Where to find it | Used for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API | Connecting to the project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase > Project Settings > API Keys (publishable, or legacy `anon`) | Sign-in and staff queries (row level security applies) |
| `SUPABASE_SECRET_KEY` | Same page (secret, or legacy `service_role`) | Server-only jobs that must bypass row level security, such as the CRICOS import. Never expose it to the browser |
| `NEXT_PUBLIC_SITE_URL` | Your own address, e.g. `http://localhost:3000` or the live domain | Links in sign-in emails |
| `ANTHROPIC_API_KEY` | console.anthropic.com | AI steps (not used yet) |

## Set up the database

The schema lives in `supabase/migrations/`. Apply the files in filename order, either:

- **Supabase dashboard:** open SQL Editor, paste each file in order and run it, or
- **Supabase CLI:** `npx supabase init` (keep the existing `migrations` folder), `npx supabase link --project-ref <ref>`, then `npx supabase db push`.

| File | What it creates |
| --- | --- |
| `…_staff_and_reference.sql` | `staff`, the `is_staff()` / `is_admin()` helpers, and `kcse_grades` (A = 12 points down to E = 1, filled in) |
| `…_catalogue.sql` | `institutions`, `campuses`, `courses`, `course_campuses`, `entry_requirements`, `visa_rules` |
| `…_students_and_assessments.sql` | `students`, `student_subject_grades`, `assessments`, `assessment_courses`, `outcomes` |
| `…_row_level_security.sql` | Row level security: only active staff can read or change data, only admins can delete; the KCSE scale is public |
| `…_cricos_import.sql` | What the CRICOS import needs: `fields_of_education` (public), extra institution, campus and course columns, and courses keyed on their CRICOS code |

The filename timestamps match the versions recorded in the Supabase project, so `supabase db push` only applies files the project has not seen.

Design notes:

- **Every fact has a source.** `entry_requirements` and `visa_rules` store `source_url`, `confidence` (high / medium / low), `verified_by` (a staff member), `verified_at` and `last_checked`. Unverified rows should never be shown to students as fact.
- **Visa rules are versioned.** Each rule has a stable `rule_key` and numbered versions with `effective_from` / `effective_to` dates. The database refuses two versions of the same rule in force on the same day. To change a rule, close the current version and add a new one; do not edit old versions.
- **Assessments are reproducible.** An assessment stores a snapshot of the student's details, the visa rule versions it used, and per course the requirement rows behind each result.
- **Outcomes** record what really happened (offer, visa, enrolment) so results can be checked against reality.

## Import CRICOS

[CRICOS](https://cricos.education.gov.au/) is the government register of every provider, campus and course allowed to teach international students in Australia. The import downloads it from [data.gov.au](https://data.gov.au/data/dataset/cricos) and saves it into `institutions`, `campuses`, `courses`, `course_campuses` and `fields_of_education`.

```bash
npm run import:cricos -- --dry-run   # download and check; saves nothing
npm run import:cricos                # save (needs SUPABASE_SECRET_KEY in .env.local)
```

Run it again whenever CRICOS updates (roughly monthly). It matches rows on CRICOS codes and updates them in place. Courses that leave the register are marked inactive, not deleted.

- **Institution type** (university, TAFE, private higher education, private VET, English language, school) is worked out from the provider's name and the courses it offers, because CRICOS only says "Government" or "Private".
- **Websites** come from CRICOS only when an institution is first added. After that, staff own the field and later imports leave it alone.
- **Fees** are for the whole course (`total_tuition_aud`, `estimated_total_cost_aud`). `annual_tuition_aud` stays empty until it is taken from the institution's own site.
- **Fields of study** use the ASCED codes CRICOS gives (broad, narrow and detailed). Each course stores all of its codes, so searching "Health" (06) also finds nursing courses (0603).
- **Regional campuses** (`is_regional`) are left empty. They will be classified together with the visa rules.

## Staff sign-in

Staff sign in at `/staff` with a one-time link sent to their email. Nobody can sign themselves up:

1. In Supabase, go to **Authentication > Users > Invite user** and invite the staff member's email.
2. Add them to the `staff` table. For the very first admin, run this in the SQL Editor (it bypasses row level security):

   ```sql
   insert into public.staff (id, full_name, email, role)
   select id, 'Full Name', email, 'admin'
   from auth.users where email = 'person@example.com';
   ```

   After that, admins can add other staff (role `counsellor` or `admin`).
3. In **Authentication > URL Configuration**, set the Site URL to the website address and add `http://localhost:3000/auth/callback` (plus the live `/auth/callback` address) to the Redirect URLs.

Signed-in users who are not in the `staff` table (or are marked inactive) see a "no staff access" message.

## Project layout

```text
src/
  app/
    page.tsx                 Public home page (placeholder)
    staff/login/             Sign-in page and the action that emails the link
    staff/(portal)/          Staff-only pages; the layout checks the staff record
    auth/callback/route.ts   Where the emailed link lands
    auth/signout/route.ts    Sign out
  lib/
    supabase/                Browser, server, admin and proxy Supabase clients
    staff.ts                 requireStaff() helper
  proxy.ts                   Refreshes the session and guards /staff
scripts/
  import-cricos.mts          CRICOS import (npm run import:cricos)
supabase/migrations/         Database schema (SQL)
```
