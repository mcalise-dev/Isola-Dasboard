-- v85 (11/3/26): job phase plan — for each phase of a job, who supplies the materials, which subs and
-- which equipment, with what / when / status / estimated cost. Links to material_vendors (suppliers) or
-- vendors (subs) when picked from the lists; a typed-in name is kept as text. Owner only.
create table if not exists public.job_phases (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  start_date date, end_date date,
  status text not null default 'planned',
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists job_phases_job_idx on public.job_phases (job_id, sort);
alter table public.job_phases enable row level security;
create policy owner_all on public.job_phases for all to authenticated using ((select is_owner())) with check ((select is_owner()));

create table if not exists public.job_phase_vendors (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.job_phases(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind text not null default 'material' check (kind in ('material','sub','rental','equipment','other')),
  material_vendor_id uuid references public.material_vendors(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  name text,
  what text,
  needed_date date,
  status text not null default 'todo',
  est_cost numeric,
  notes text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists job_phase_vendors_phase_idx on public.job_phase_vendors (phase_id, sort);
alter table public.job_phase_vendors enable row level security;
create policy owner_all on public.job_phase_vendors for all to authenticated using ((select is_owner())) with check ((select is_owner()));
alter table public.job_phases add column if not exists crew text[] not null default '{}'; -- worker names on each phase
