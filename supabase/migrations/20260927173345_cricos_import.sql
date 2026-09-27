-- Studies and Awards AI: fit the catalogue to the CRICOS register.
-- scripts/import-cricos.mts fills institutions, campuses, courses and
-- course_campuses from CRICOS; this adds the columns and keys it relies on.

-- ---------------------------------------------------------------------------
-- Enum values CRICOS uses. Course levels are placed in AQF order so the enum
-- still sorts from lowest to highest.
-- ---------------------------------------------------------------------------

alter type public.provider_type add value if not exists 'school';

alter type public.course_level add value if not exists 'school' before 'english_language';
alter type public.course_level add value if not exists 'certificate_i' before 'certificate_iii';
alter type public.course_level add value if not exists 'certificate_ii' before 'certificate_iii';
alter type public.course_level add value if not exists 'bachelor_honours' after 'bachelor';
alter type public.course_level add value if not exists 'masters_extended' after 'masters_research';

-- ---------------------------------------------------------------------------
-- Fields of education (ASCED): 2-digit broad, 4-digit narrow and 6-digit
-- detailed codes, e.g. 09 Society and Culture > 0905 Human Welfare Studies
-- and Services > 090501 Social Work. Public reference data, like kcse_grades.
-- ---------------------------------------------------------------------------

create table public.fields_of_education (
  code  text primary key check (code ~ '^[0-9]{2}([0-9]{2}([0-9]{2})?)?$'),
  name  text not null
);

comment on table public.fields_of_education is
  'ASCED fields of education used by CRICOS courses. Filled by the CRICOS import.';

alter table public.fields_of_education enable row level security;

create policy "Anyone can read fields of education"
  on public.fields_of_education for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Institutions
-- ---------------------------------------------------------------------------

alter table public.institutions
  add column trading_names text;

comment on column public.institutions.trading_names is
  'Trading names as listed on CRICOS, when different from the registered name.';

-- ---------------------------------------------------------------------------
-- Campuses. CRICOS gives some providers several sites with the same name in
-- different suburbs, so the name is only unique within a city.
-- ---------------------------------------------------------------------------

alter table public.campuses
  add column address text,
  add column postcode text,
  alter column is_regional drop not null,
  alter column is_regional drop default;

comment on column public.campuses.is_regional is
  'Regional study locations can affect visa and post-study work settings. Null until the campus has been classified.';

alter table public.campuses
  drop constraint campuses_institution_id_name_key,
  add constraint campuses_institution_id_name_city_key unique (institution_id, name, city);

-- ---------------------------------------------------------------------------
-- Courses. A provider can register several CRICOS courses under one name
-- (one lists 36 courses called "Doctor of Philosophy"), so CRICOS courses are
-- keyed on their course code and only courses without a code need a unique
-- name.
-- ---------------------------------------------------------------------------

alter table public.courses
  add column vet_national_code         text,
  add column field_of_education_codes  text[] not null default '{}',
  add column teaching_language         text,
  add column has_work_component        boolean,
  add column total_tuition_aud         numeric(10, 2) check (total_tuition_aud >= 0),
  add column estimated_total_cost_aud  numeric(10, 2) check (estimated_total_cost_aud >= 0);

comment on column public.courses.field_of_education_codes is
  'Every ASCED code the course falls under (broad, narrow and detailed), so a course in 090501 also matches 0905 and 09.';
comment on column public.courses.total_tuition_aud is
  'Tuition for the whole course, as listed on CRICOS.';
comment on column public.courses.estimated_total_cost_aud is
  'Tuition plus non-tuition fees for the whole course, as listed on CRICOS.';

alter table public.courses
  drop constraint courses_institution_id_name_key,
  add constraint courses_cricos_course_code_key unique (cricos_course_code);

create unique index courses_institution_id_name_uncoded_key
  on public.courses (institution_id, name)
  where cricos_course_code is null;

create index courses_field_of_education_codes_idx
  on public.courses using gin (field_of_education_codes);
