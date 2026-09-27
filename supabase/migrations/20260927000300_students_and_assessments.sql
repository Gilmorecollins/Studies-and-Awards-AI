-- Studies and Awards AI: students, their eligibility assessments, and what
-- actually happened afterwards (outcomes), so results can be checked against
-- reality over time.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.student_source as enum ('staff_entered', 'web_form', 'imported');

create type public.assessment_status as enum ('draft', 'in_review', 'completed', 'archived');

create type public.eligibility as enum ('eligible', 'conditional', 'not_eligible', 'unknown');

create type public.outcome_stage as enum (
  'applied',
  'offer_conditional',
  'offer_full',
  'rejected',
  'coe_issued',
  'visa_lodged',
  'visa_granted',
  'visa_refused',
  'enrolled',
  'withdrawn'
);

-- ---------------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------------

create table public.students (
  id                      uuid primary key default gen_random_uuid(),
  full_name               text not null,
  email                   text,
  phone                   text,
  country_of_residence    text not null default 'Kenya',
  date_of_birth           date,

  kcse_year               smallint check (kcse_year between 1989 and 2100),
  kcse_mean_grade         text references public.kcse_grades (grade),
  highest_qualification   text,

  english_test            public.english_test,
  english_overall         numeric(4, 1),
  english_test_date       date,

  preferred_fields        text[] not null default '{}',
  preferred_cities        text[] not null default '{}',
  annual_budget_aud       numeric(10, 2) check (annual_budget_aud >= 0),
  intended_intake         date,

  source                  public.student_source not null default 'staff_entered',
  consent_given_at        timestamptz,
  assigned_to             uuid references public.staff (id) on delete set null,
  created_by              uuid references public.staff (id) on delete set null,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on column public.students.consent_given_at is
  'When the student agreed to their data being stored and processed. Required before an assessment is shared with them.';

create index students_email_idx on public.students (lower(email));
create index students_assigned_to_idx on public.students (assigned_to);
create index students_created_by_idx on public.students (created_by);

-- KCSE subject grades, one row per subject.
create table public.student_subject_grades (
  student_id  uuid not null references public.students (id) on delete cascade,
  subject     text not null,
  grade       text not null references public.kcse_grades (grade),
  primary key (student_id, subject)
);

create index student_subject_grades_grade_idx on public.student_subject_grades (grade);

-- ---------------------------------------------------------------------------
-- Assessments: one eligibility check for one student at one point in time.
-- The inputs and the rule versions used are stored so a result can always be
-- explained later, even after the catalogue or visa rules change.
-- ---------------------------------------------------------------------------

create table public.assessments (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students (id) on delete cascade,
  status            public.assessment_status not null default 'draft',
  inputs_snapshot   jsonb not null default '{}'::jsonb,
  summary           text,
  visa_rule_ids     uuid[] not null default '{}',
  ai_model          text,
  prompt_version    text,
  created_by        uuid references public.staff (id) on delete set null,
  reviewed_by       uuid references public.staff (id) on delete set null,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint assessments_reviewed_pair check ((reviewed_by is null) = (reviewed_at is null))
);

comment on column public.assessments.inputs_snapshot is
  'Copy of the student details the assessment was based on.';
comment on column public.assessments.visa_rule_ids is
  'The visa_rules versions in force when the assessment ran.';

create index assessments_student_id_idx on public.assessments (student_id);
create index assessments_created_by_idx on public.assessments (created_by);
create index assessments_reviewed_by_idx on public.assessments (reviewed_by);
create index assessments_status_idx on public.assessments (status);

-- Per-course result inside an assessment.
create table public.assessment_courses (
  assessment_id    uuid not null references public.assessments (id) on delete cascade,
  course_id        uuid not null references public.courses (id) on delete cascade,
  eligibility      public.eligibility not null,
  reasons          jsonb not null default '[]'::jsonb,
  requirement_ids  uuid[] not null default '{}',
  rank             smallint,
  primary key (assessment_id, course_id)
);

comment on column public.assessment_courses.reasons is
  'Plain-language reasons for the result, each tied to a requirement where possible.';
comment on column public.assessment_courses.requirement_ids is
  'The entry_requirements rows the result was based on.';

create index assessment_courses_course_id_idx on public.assessment_courses (course_id);

-- ---------------------------------------------------------------------------
-- Outcomes: real-world events after an assessment (offers, visas, enrolment).
-- ---------------------------------------------------------------------------

create table public.outcomes (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students (id) on delete cascade,
  assessment_id   uuid references public.assessments (id) on delete set null,
  course_id       uuid references public.courses (id) on delete set null,
  stage           public.outcome_stage not null,
  occurred_on     date not null default current_date,
  notes           text,
  recorded_by     uuid references public.staff (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index outcomes_student_id_idx on public.outcomes (student_id);
create index outcomes_assessment_id_idx on public.outcomes (assessment_id);
create index outcomes_course_id_idx on public.outcomes (course_id);
create index outcomes_recorded_by_idx on public.outcomes (recorded_by);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger students_set_updated_at before update on public.students
  for each row execute function public.set_updated_at();
create trigger assessments_set_updated_at before update on public.assessments
  for each row execute function public.set_updated_at();
create trigger outcomes_set_updated_at before update on public.outcomes
  for each row execute function public.set_updated_at();
