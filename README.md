# Studies and Awards AI

An online consultant, delivered as a website, that helps students check whether they are eligible to study in Australia. Students and staff use it in a normal web browser on phone or computer; there is nothing to download or install. It is built with Next.js (a framework for building websites; TypeScript, Tailwind) with Supabase for the database and staff sign-in.

**Status: step 1.** The website skeleton, staff email sign-in and the database schema are in place. The student-facing checker and AI steps come next.

## Requirements

- Node.js 20.9 or newer (built and tested on Node 24)
- A Supabase project (free tier is fine)

## Run it locally

```bash
cd Ai
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                   # http://localhost:3000
```

Other scripts: `npm run build` (production build), `npm start` (serve the build), `npm run lint`.

## Environment variables

Put these in `Ai/.env.local`. That file is gitignored; never commit real keys. `.env.example` lists the same names with placeholders.

| Name | Where to find it | Used for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API | Connecting to the project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase > Project Settings > API Keys (publishable, or legacy `anon`) | Sign-in and staff queries (row level security applies) |
| `SUPABASE_SECRET_KEY` | Same page (secret, or legacy `service_role`) | Server-only jobs that must bypass row level security. Never expose it to the browser |
| `NEXT_PUBLIC_SITE_URL` | Your own address, e.g. `http://localhost:3000` or the live domain | Links in sign-in emails |
| `ANTHROPIC_API_KEY` | console.anthropic.com | AI steps (not used yet) |

## Set up the database

The schema lives in `supabase/migrations/`. Apply the files in filename order, either:

- **Supabase dashboard:** open SQL Editor, paste each file in order and run it, or
- **Supabase CLI:** `npx supabase init` (keep the existing `migrations` folder), `npx supabase link --project-ref <ref>`, then `npx supabase db push`.

| File | What it creates |
| --- | --- |
| `…0100_staff_and_reference.sql` | `staff`, the `is_staff()` / `is_admin()` helpers, and `kcse_grades` (A = 12 points down to E = 1, filled in) |
| `…0200_catalogue.sql` | `institutions`, `campuses`, `courses`, `course_campuses`, `entry_requirements`, `visa_rules` |
| `…0300_students_and_assessments.sql` | `students`, `student_subject_grades`, `assessments`, `assessment_courses`, `outcomes` |
| `…0400_row_level_security.sql` | Row level security: only active staff can read or change data, only admins can delete; the KCSE scale is public |

Design notes:

- **Every fact has a source.** `entry_requirements` and `visa_rules` store `source_url`, `confidence` (high / medium / low), `verified_by` (a staff member), `verified_at` and `last_checked`. Unverified rows should never be shown to students as fact.
- **Visa rules are versioned.** Each rule has a stable `rule_key` and numbered versions with `effective_from` / `effective_to` dates. The database refuses two versions of the same rule in force on the same day. To change a rule, close the current version and add a new one; do not edit old versions.
- **Assessments are reproducible.** An assessment stores a snapshot of the student's details, the visa rule versions it used, and per course the requirement rows behind each result.
- **Outcomes** record what really happened (offer, visa, enrolment) so results can be checked against reality.

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

```
Ai/
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
  supabase/migrations/         Database schema (SQL)
```
