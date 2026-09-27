-- Studies and Awards AI: institutions, campuses, courses, entry requirements
-- and visa rules. Every fact a student's result depends on carries its source,
-- a confidence level, who verified it and when it was last checked.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.provider_type as enum (
  'university',
  'tafe',
  'private_vet',
  'private_higher_education',
  'english_language',
  'other'
);

create type public.au_state as enum ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA');

create type public.course_level as enum (
  'english_language',
  'foundation',
  'certificate_iii',
  'certificate_iv',
  'diploma',
  'advanced_diploma',
  'associate_degree',
  'bachelor',
  'graduate_certificate',
  'graduate_diploma',
  'masters_coursework',
  'masters_research',
  'doctorate',
  'other'
);

create type public.requirement_type as enum (
  'academic',          -- e.g. KCSE mean grade
  'subject',           -- a minimum grade in one subject
  'english',           -- IELTS / PTE / TOEFL etc.
  'prior_qualification',
  'work_experience',
  'portfolio_or_interview',
  'age',
  'other'
);

create type public.english_test as enum (
  'ielts_academic',
  'pte_academic',
  'toefl_ibt',
  'cambridge_c1_advanced',
  'duolingo',
  'other'
);

-- ---------------------------------------------------------------------------
-- Institutions and campuses
-- ---------------------------------------------------------------------------

create table public.institutions (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text not null unique,
  country               text not null default 'Australia',
  provider_type         public.provider_type,
  cricos_provider_code  text unique,
  website_url           text,
  is_partner            boolean not null default false,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on column public.institutions.is_partner is
  'True for institutions on the Studies and Awards partner list.';

create table public.campuses (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  name            text not null,
  city            text not null,
  state           public.au_state,
  is_regional     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (institution_id, name)
);

comment on column public.campuses.is_regional is
  'Regional study locations can affect visa and post-study work settings.';

create index campuses_institution_id_idx on public.campuses (institution_id);

-- ---------------------------------------------------------------------------
-- Courses
-- ---------------------------------------------------------------------------

create table public.courses (
  id                  uuid primary key default gen_random_uuid(),
  institution_id      uuid not null references public.institutions (id) on delete cascade,
  name                text not null,
  level               public.course_level,
  field_of_study      text,
  cricos_course_code  text,
  duration_weeks      smallint check (duration_weeks > 0),
  annual_tuition_aud  numeric(10, 2) check (annual_tuition_aud >= 0),
  intake_months       smallint[] check (intake_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  course_url          text,
  is_active           boolean not null default true,
  -- Provenance for the course details above.
  source_url          text,
  last_checked        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (institution_id, name),
  -- Lets entry_requirements check a course belongs to its institution.
  unique (id, institution_id)
);

create index courses_institution_id_idx on public.courses (institution_id);
create index courses_level_idx on public.courses (level);

-- Which campuses teach a course.
create table public.course_campuses (
  course_id   uuid not null references public.courses (id) on delete cascade,
  campus_id   uuid not null references public.campuses (id) on delete cascade,
  primary key (course_id, campus_id)
);

create index course_campuses_campus_id_idx on public.course_campuses (campus_id);

-- ---------------------------------------------------------------------------
-- Entry requirements
-- A requirement belongs to one course, or to a whole institution when
-- course_id is null (e.g. an institution-wide English minimum).
-- ---------------------------------------------------------------------------

create table public.entry_requirements (
  id                    uuid primary key default gen_random_uuid(),
  institution_id        uuid not null references public.institutions (id) on delete cascade,
  course_id             uuid,
  requirement_type      public.requirement_type not null,
  description           text not null,

  -- Structured values used by the eligibility check. Fill the ones that apply.
  min_kcse_mean_grade   text references public.kcse_grades (grade),
  kcse_subject          text,
  min_kcse_subject_grade text references public.kcse_grades (grade),
  english_test          public.english_test,
  min_english_overall   numeric(4, 1),
  min_english_band      numeric(4, 1),
  details               jsonb not null default '{}'::jsonb,

  -- Provenance.
  source_url            text not null,
  source_excerpt        text,
  origin                public.data_origin not null default 'staff_entered',
  confidence            public.confidence_level not null default 'low',
  verified_by           uuid references public.staff (id) on delete set null,
  verified_at           timestamptz,
  last_checked          timestamptz not null default now(),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint entry_requirements_course_fk foreign key (course_id, institution_id)
    references public.courses (id, institution_id) on delete cascade,
  constraint entry_requirements_subject_pair check (
    (kcse_subject is null) = (min_kcse_subject_grade is null)
  ),
  constraint entry_requirements_verified_pair check (
    (verified_by is null) = (verified_at is null)
  )
);

comment on column public.entry_requirements.course_id is
  'Null means the requirement applies to every course at the institution.';
comment on column public.entry_requirements.source_excerpt is
  'The words on the source page that support this requirement.';
comment on column public.entry_requirements.verified_by is
  'Staff member who checked the requirement against its source. Unverified rows must not be shown to students as fact.';

create index entry_requirements_institution_id_idx on public.entry_requirements (institution_id);
create index entry_requirements_course_id_idx on public.entry_requirements (course_id);
create index entry_requirements_verified_by_idx on public.entry_requirements (verified_by);
create index entry_requirements_last_checked_idx on public.entry_requirements (last_checked);

-- ---------------------------------------------------------------------------
-- Visa rules, versioned by effective date.
-- To change a rule, close the current version (set effective_to) and insert a
-- new version; never edit an old version in place. Assessments record which
-- versions they used.
-- ---------------------------------------------------------------------------

create table public.visa_rules (
  id              uuid primary key default gen_random_uuid(),
  rule_key        text not null,
  visa_subclass   text not null default '500',
  version         integer not null check (version > 0),
  title           text not null,
  description     text not null,
  value           jsonb not null default '{}'::jsonb,
  effective_from  date not null,
  effective_to    date,

  -- Provenance.
  source_url      text not null,
  confidence      public.confidence_level not null default 'low',
  verified_by     uuid references public.staff (id) on delete set null,
  verified_at     timestamptz,
  last_checked    timestamptz not null default now(),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (rule_key, version),
  constraint visa_rules_dates check (effective_to is null or effective_to > effective_from),
  constraint visa_rules_verified_pair check ((verified_by is null) = (verified_at is null)),
  -- Two versions of the same rule can never be in force on the same day.
  constraint visa_rules_no_overlap exclude using gist (
    rule_key with =,
    daterange(effective_from, effective_to, '[)') with &&
  )
);

comment on column public.visa_rules.rule_key is
  'Stable name for the rule across versions, e.g. subclass_500.financial_capacity.';
comment on column public.visa_rules.value is
  'Machine-readable parameters, e.g. {"annual_living_cost_aud": 29710}.';
comment on column public.visa_rules.effective_to is
  'Exclusive end date. Null means the version is still in force.';

create index visa_rules_verified_by_idx on public.visa_rules (verified_by);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger institutions_set_updated_at before update on public.institutions
  for each row execute function public.set_updated_at();
create trigger campuses_set_updated_at before update on public.campuses
  for each row execute function public.set_updated_at();
create trigger courses_set_updated_at before update on public.courses
  for each row execute function public.set_updated_at();
create trigger entry_requirements_set_updated_at before update on public.entry_requirements
  for each row execute function public.set_updated_at();
create trigger visa_rules_set_updated_at before update on public.visa_rules
  for each row execute function public.set_updated_at();
