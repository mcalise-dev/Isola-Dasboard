-- v81 (10/28/26): submittals log per job.
create table if not exists public.submittals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  number int not null, title text not null, spec_section text, product text, manufacturer text,
  reviewer text, submitted_on date, due_date date,
  status text not null default 'draft' check (status in ('draft','submitted','approved','approved_as_noted','revise_resubmit','rejected')),
  response_notes text, file_b64 text, file_name text, mime_type text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (job_id, number)
);
alter table public.submittals enable row level security;
create policy owner_only on public.submittals for all to authenticated
  using ((select is_owner()) or thm_partner_job(job_id)) with check ((select is_owner()) or thm_partner_job(job_id));
