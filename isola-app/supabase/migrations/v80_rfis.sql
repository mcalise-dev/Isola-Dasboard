-- v80 (10/28/26): RFI log per job.
create table if not exists public.rfis (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  number int not null, subject text not null, question text,
  to_name text, to_email text, due_date date,
  status text not null default 'open' check (status in ('draft','open','answered','closed')),
  answer text, answered_on date,
  pin_id uuid references public.plan_pins(id) on delete set null,
  photo_b64 text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (job_id, number)
);
alter table public.rfis enable row level security;
create policy owner_only on public.rfis for all to authenticated
  using ((select is_owner()) or thm_partner_job(job_id)) with check ((select is_owner()) or thm_partner_job(job_id));
