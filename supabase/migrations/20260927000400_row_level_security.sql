-- Studies and Awards AI: row level security.
--
-- Only active staff (public.staff) can read or change data through the
-- publishable key. Deleting rows is limited to admins. The KCSE grade scale is
-- public. Student-facing features will run on the server with the secret key
-- and only return verified facts; they do not get direct table access.

-- ---------------------------------------------------------------------------
-- Turn on RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.staff                  enable row level security;
alter table public.kcse_grades            enable row level security;
alter table public.institutions           enable row level security;
alter table public.campuses               enable row level security;
alter table public.courses                enable row level security;
alter table public.course_campuses        enable row level security;
alter table public.entry_requirements     enable row level security;
alter table public.visa_rules             enable row level security;
alter table public.students               enable row level security;
alter table public.student_subject_grades enable row level security;
alter table public.assessments            enable row level security;
alter table public.assessment_courses     enable row level security;
alter table public.outcomes               enable row level security;

-- Signed-out visitors never touch these tables directly.
revoke all on
  public.staff,
  public.institutions,
  public.campuses,
  public.courses,
  public.course_campuses,
  public.entry_requirements,
  public.visa_rules,
  public.students,
  public.student_subject_grades,
  public.assessments,
  public.assessment_courses,
  public.outcomes
from anon;

-- ---------------------------------------------------------------------------
-- KCSE grades: readable by everyone, changed only by migrations.
-- ---------------------------------------------------------------------------

create policy "Anyone can read the KCSE grade scale"
  on public.kcse_grades for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Staff table: staff can see the team; only admins manage it.
-- ---------------------------------------------------------------------------

create policy "Staff can read staff"
  on public.staff for select
  to authenticated
  using ((select public.is_staff()));

create policy "Admins can add staff"
  on public.staff for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins can update staff"
  on public.staff for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins can remove staff"
  on public.staff for delete
  to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Everything else: staff read, add and update; admins delete.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'institutions',
    'campuses',
    'courses',
    'course_campuses',
    'entry_requirements',
    'visa_rules',
    'students',
    'student_subject_grades',
    'assessments',
    'assessment_courses',
    'outcomes'
  ]
  loop
    execute format(
      'create policy "Staff can read %1$s" on public.%1$I for select to authenticated
         using ((select public.is_staff()))', t);
    execute format(
      'create policy "Staff can add %1$s" on public.%1$I for insert to authenticated
         with check ((select public.is_staff()))', t);
    execute format(
      'create policy "Staff can update %1$s" on public.%1$I for update to authenticated
         using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format(
      'create policy "Admins can delete %1$s" on public.%1$I for delete to authenticated
         using ((select public.is_admin()))', t);
  end loop;
end;
$$;
