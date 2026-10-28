-- v83 (10/28/26): cost codes + per-job budget lines. job_costs / change_orders get an optional
-- cost_code; budget vs actual = budget lines (+ approved COs coded to the line) vs coded costs.
create table if not exists public.cost_codes (
  code text primary key, name text not null, sort int not null default 0, archived boolean not null default false
);
alter table public.cost_codes enable row level security;
create policy owner_all on public.cost_codes for all to authenticated using ((select is_owner())) with check ((select is_owner()));
create policy any_read on public.cost_codes for select to authenticated using (true);
insert into public.cost_codes (code, name, sort) values
 ('01','General conditions',10),('02','Demo & removal',20),('03','Concrete',30),('04','Masonry',40),
 ('07','Waterproofing & sealants',70),('31','Excavation & earthwork',310),('32','Paving & hardscape',320),
 ('33','Drainage & utilities',330),('LAB','Labor',900),('EQ','Equipment & rental',910),('DSP','Disposal & dump',920),('SUB','Subcontractors',930)
on conflict (code) do nothing;

create table if not exists public.job_budget_lines (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  cost_code text not null references public.cost_codes(code),
  description text, amount numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (job_id, cost_code)
);
alter table public.job_budget_lines enable row level security;
create policy owner_only on public.job_budget_lines for all to authenticated
  using ((select is_owner()) or thm_partner_job(job_id)) with check ((select is_owner()) or thm_partner_job(job_id));
alter table public.job_costs add column if not exists cost_code text references public.cost_codes(code);
alter table public.change_orders add column if not exists cost_code text references public.cost_codes(code);
