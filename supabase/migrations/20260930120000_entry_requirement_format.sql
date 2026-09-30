-- Studies and Awards AI: entry requirements in the agreed format
-- (docs/requirement-format.md). Every academic requirement is in KCSE terms.
-- entry_requirements was still empty, so it is rebuilt rather than altered
-- column by column.

drop table public.entry_requirements;
drop type public.requirement_type;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.requirement_kind as enum (
  'kcse_completed',       -- "Year 12 or equivalent": any KCSE result
  'kcse_mean_grade',      -- a minimum mean grade
  'kcse_points',          -- a minimum total from the best N subjects
  'kcse_subject',         -- a minimum grade in one subject
  'prior_qualification',  -- e.g. a diploma or a bachelor's degree
  'english_test',         -- accepted tests are in entry_requirement_english_tests
  'english_waiver',       -- a way to meet English without a test
  'work_experience',
  'age',
  'other'                 -- description only; shown to the counsellor as "also needed"
);

create type public.review_status as enum ('unreviewed', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Entry requirements: one row per condition a student must meet.
--
-- Scope: a row covers one course (course_id), one course level at the
-- institution (course_level), or the whole institution (both null). The
-- narrowest row wins.
--
-- Routes: rows that share a route name are one way in, and a student
-- qualifies by meeting every row of any one route. Rows with no route apply
-- whichever route is used. English rows are alternatives to each other:
-- English is met when any one english_test or english_waiver row is met.
-- ---------------------------------------------------------------------------

create table public.entry_requirements (
  id                          uuid primary key default gen_random_uuid(),
  institution_id              uuid not null references public.institutions (id) on delete cascade,
  course_level                public.course_level,
  course_id                   uuid,
  applicant_country           text,
  route                       text,
  kind                        public.requirement_kind not null,
  description                 text not null,
  value_not_stated            boolean not null default false,
  uses_house_rule             boolean not null default false,

  -- Values used by the eligibility check. Fill the ones the kind needs.
  min_kcse_mean_grade         text references public.kcse_grades (grade),
  kcse_mean_basis             text,
  kcse_points_subject_count   smallint check (kcse_points_subject_count between 1 and 12),
  min_kcse_points             smallint check (min_kcse_points > 0),
  kcse_subject                text,
  min_kcse_subject_grade      text references public.kcse_grades (grade),
  prior_qualification_level   public.course_level,
  prior_qualification_field   text,
  prior_qualification_grade   text,
  english_max_age_months      smallint check (english_max_age_months > 0),
  english_waiver_type         text check (english_waiver_type in ('kcse_english_grade', 'study_in_english', 'other')),
  min_years_study_in_english  numeric(3, 1) check (min_years_study_in_english >= 0),
  min_work_experience_years   numeric(3, 1) check (min_work_experience_years >= 0),
  work_experience_field       text,
  min_age                     smallint check (min_age between 10 and 100),
  institution_score           text,
  details                     jsonb not null default '{}'::jsonb,

  -- Provenance.
  source_url                  text not null,
  source_excerpt              text,
  origin                      public.data_origin not null default 'staff_entered',
  confidence                  public.confidence_level not null default 'low',
  review_status               public.review_status not null default 'unreviewed',
  verified_by                 uuid references public.staff (id) on delete set null,
  verified_at                 timestamptz,
  last_checked                timestamptz not null default now(),

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint entry_requirements_course_fk foreign key (course_id, institution_id)
    references public.courses (id, institution_id) on delete cascade,
  constraint entry_requirements_one_scope check (course_id is null or course_level is null),
  constraint entry_requirements_verified_pair check ((verified_by is null) = (verified_at is null)),
  constraint entry_requirements_approved_by_staff check (review_status <> 'approved' or verified_by is not null),
  constraint entry_requirements_values_for_kind check (
    value_not_stated
    or case kind
      when 'kcse_mean_grade' then min_kcse_mean_grade is not null
      when 'kcse_points' then kcse_points_subject_count is not null and min_kcse_points is not null
      when 'kcse_subject' then kcse_subject is not null and min_kcse_subject_grade is not null
      when 'prior_qualification' then prior_qualification_level is not null
      when 'english_waiver' then english_waiver_type is not null
      when 'work_experience' then min_work_experience_years is not null
      when 'age' then min_age is not null
      else true
    end
  )
);

comment on column public.entry_requirements.course_level is
  'Set when the row covers every course of this level at the institution. Null with course_id null means the whole institution.';
comment on column public.entry_requirements.applicant_country is
  'Country the row is written for, e.g. Kenya. Null means any international student.';
comment on column public.entry_requirements.route is
  'Name of the way in this row belongs to, e.g. "KCSE direct". Null means it applies whichever route is used.';
comment on column public.entry_requirements.description is
  'The requirement in plain language and in KCSE terms. Never an Australian scale such as ATAR.';
comment on column public.entry_requirements.value_not_stated is
  'True when the institution does not give the value for Kenyan students. The check then answers "ask the institution"; it never guesses.';
comment on column public.entry_requirements.uses_house_rule is
  'True when the row relies on the Studies and Awards rule that Year 12 means KCSE, rather than on the institution naming the KCSE.';
comment on column public.entry_requirements.kcse_mean_basis is
  'How the institution works out the mean grade, e.g. "best 7 subjects including English, Kiswahili and Mathematics".';
comment on column public.entry_requirements.institution_score is
  'The institution''s own figure behind a KCSE value, e.g. "65%". Kept as proof only; never shown as the requirement.';
comment on column public.entry_requirements.source_excerpt is
  'The words on the source page that support this requirement.';
comment on column public.entry_requirements.review_status is
  'Only approved rows are used in a result. Rejected rows are kept so the same finding is not proposed again.';
comment on column public.entry_requirements.verified_by is
  'Staff member who checked the requirement against its source.';

create index entry_requirements_institution_id_idx on public.entry_requirements (institution_id);
create index entry_requirements_course_id_idx on public.entry_requirements (course_id);
create index entry_requirements_verified_by_idx on public.entry_requirements (verified_by);
create index entry_requirements_review_status_idx on public.entry_requirements (review_status);
create index entry_requirements_last_checked_idx on public.entry_requirements (last_checked);

-- The tests an english_test requirement accepts. Any one of them is enough.
create table public.entry_requirement_english_tests (
  id              uuid primary key default gen_random_uuid(),
  requirement_id  uuid not null references public.entry_requirements (id) on delete cascade,
  test            public.english_test not null,
  test_name       text,
  min_overall     numeric(5, 1) not null,
  min_listening   numeric(5, 1),
  min_reading     numeric(5, 1),
  min_writing     numeric(5, 1),
  min_speaking    numeric(5, 1),
  unique nulls not distinct (requirement_id, test, test_name)
);

comment on column public.entry_requirement_english_tests.test_name is
  'Name of the test when test is "other", e.g. "Kaplan Test of English".';

-- ---------------------------------------------------------------------------
-- An institution's own conversion from its entry score to the KCSE, e.g.
-- RMIT: 65% = mean grade B. Used once, when a course requirement is recorded,
-- to turn the course's score into a KCSE value. Never shown to counsellors.
-- ---------------------------------------------------------------------------

create table public.kcse_conversions (
  id                          uuid primary key default gen_random_uuid(),
  institution_id              uuid not null references public.institutions (id) on delete cascade,
  course_level                public.course_level,
  institution_score           text not null,
  min_kcse_mean_grade         text references public.kcse_grades (grade),
  kcse_points_subject_count   smallint check (kcse_points_subject_count between 1 and 12),
  min_kcse_points             smallint check (min_kcse_points > 0),
  kcse_mean_basis             text,

  -- Provenance.
  source_url                  text not null,
  source_excerpt              text,
  origin                      public.data_origin not null default 'staff_entered',
  confidence                  public.confidence_level not null default 'low',
  review_status               public.review_status not null default 'unreviewed',
  verified_by                 uuid references public.staff (id) on delete set null,
  verified_at                 timestamptz,
  last_checked                timestamptz not null default now(),

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  unique nulls not distinct (institution_id, course_level, institution_score),
  constraint kcse_conversions_has_value check (
    min_kcse_mean_grade is not null
    or (kcse_points_subject_count is not null and min_kcse_points is not null)
  ),
  constraint kcse_conversions_verified_pair check ((verified_by is null) = (verified_at is null)),
  constraint kcse_conversions_approved_by_staff check (review_status <> 'approved' or verified_by is not null)
);

comment on column public.kcse_conversions.institution_score is
  'The score as the institution writes it, e.g. "65%".';

create index kcse_conversions_verified_by_idx on public.kcse_conversions (verified_by);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger entry_requirements_set_updated_at before update on public.entry_requirements
  for each row execute function public.set_updated_at();
create trigger kcse_conversions_set_updated_at before update on public.kcse_conversions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: staff read, add and update; admins delete.
-- ---------------------------------------------------------------------------

alter table public.entry_requirements              enable row level security;
alter table public.entry_requirement_english_tests enable row level security;
alter table public.kcse_conversions                enable row level security;

revoke all on
  public.entry_requirements,
  public.entry_requirement_english_tests,
  public.kcse_conversions
from anon;

do $$
declare
  t text;
begin
  foreach t in array array[
    'entry_requirements',
    'entry_requirement_english_tests',
    'kcse_conversions'
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
