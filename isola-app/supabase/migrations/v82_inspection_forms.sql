-- v82 (10/28/26): custom inspection forms. Templates hold the field list; an entry copies the
-- fields at start (so editing a template never changes a finished report) and stores answers.
-- field types: heading | text | long | yesno | number | date | photo | signature
create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text,
  fields jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.form_templates enable row level security;
create policy owner_all on public.form_templates for all to authenticated using ((select is_owner())) with check ((select is_owner()));
create policy partner_read on public.form_templates for select to authenticated using (true);

create table if not exists public.form_entries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  template_id uuid references public.form_templates(id) on delete set null,
  title text not null,
  fields jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','complete')),
  inspector text, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists form_entries_job_idx on public.form_entries(job_id);
alter table public.form_entries enable row level security;
create policy owner_only on public.form_entries for all to authenticated
  using ((select is_owner()) or thm_partner_job(job_id)) with check ((select is_owner()) or thm_partner_job(job_id));
-- seeded: Pre-pour inspection, Final walkthrough, Water test (see Supabase)
