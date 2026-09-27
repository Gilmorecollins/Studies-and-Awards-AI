-- Studies and Awards AI: staff accounts, shared helpers and reference data.
-- Run the migrations in this folder in filename order.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared enums
-- ---------------------------------------------------------------------------

create type public.staff_role as enum ('admin', 'counsellor');

-- How sure we are that a stored fact matches its source.
create type public.confidence_level as enum ('high', 'medium', 'low');

-- Where a stored fact came from.
create type public.data_origin as enum ('staff_entered', 'ai_extracted', 'imported');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: one row per Supabase auth user who may use the staff portal.
-- Users are invited from the Supabase dashboard; an admin then adds the row.
-- ---------------------------------------------------------------------------

create table public.staff (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text not null unique,
  role        public.staff_role not null default 'counsellor',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger staff_set_updated_at
  before update on public.staff
  for each row execute function public.set_updated_at();

-- Helpers used by row level security policies. SECURITY DEFINER so they can
-- read public.staff without recursing through its own policies.
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff
    where id = (select auth.uid()) and is_active
  );
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff
    where id = (select auth.uid()) and is_active and role = 'admin'
  );
$$;

revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- KCSE grade scale (Kenya Certificate of Secondary Education).
-- Used for both mean grades and subject grades. The scale is fixed, so it is
-- filled here rather than in a seed file.
-- ---------------------------------------------------------------------------

create table public.kcse_grades (
  grade   text primary key,
  points  smallint not null unique check (points between 1 and 12)
);

comment on table public.kcse_grades is
  'KCSE grade scale: A = 12 points down to E = 1. Compare grades by points.';

insert into public.kcse_grades (grade, points) values
  ('A', 12), ('A-', 11),
  ('B+', 10), ('B', 9), ('B-', 8),
  ('C+', 7), ('C', 6), ('C-', 5),
  ('D+', 4), ('D', 3), ('D-', 2),
  ('E', 1);
