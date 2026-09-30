-- Studies and Awards AI: link the Studies and Awards partner list to CRICOS.
-- scripts/link-partners.mts fills this from data/partner-links.json (the
-- reviewed links) and the website's partner list (cities and courses). Staff
-- read it; only the script changes it, so the reviewed file stays the source.

create table public.partner_institutions (
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  partner_name    text not null,
  cities          text[] not null default '{}',
  listed_courses  text[] not null default '{}',
  source          text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (institution_id, partner_name)
);

comment on table public.partner_institutions is
  'Which CRICOS providers are Studies and Awards partners, under the name the partner list uses. One name can cover several providers, and several names one provider.';
comment on column public.partner_institutions.cities is
  'Cities the partner list gives for this partner.';
comment on column public.partner_institutions.listed_courses is
  'Course names as the partner list gives them. Free text, not linked to CRICOS courses.';
comment on column public.partner_institutions.source is
  'Where the partner list came from, e.g. the file and its date.';

comment on column public.institutions.is_partner is
  'True when the institution has a row in partner_institutions. Set by scripts/link-partners.mts.';

create trigger partner_institutions_set_updated_at before update on public.partner_institutions
  for each row execute function public.set_updated_at();

alter table public.partner_institutions enable row level security;

revoke all on public.partner_institutions from anon;

create policy "Staff can read partner institutions"
  on public.partner_institutions for select
  to authenticated
  using ((select public.is_staff()));
