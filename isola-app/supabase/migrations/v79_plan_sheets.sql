-- v79 (10/28/26): plan sheets per job, with revisions and pins (Fieldwire-style). Applied as v79a + v79b.
-- A sheet is (job_id, sheet_key); each upload of the same sheet_key is a new revision.
-- image_b64 is the rendered page (JPEG data URL) pins sit on; pin x/y are 0..1 of the image.
create table if not exists public.plan_sheets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  sheet_key text not null, title text, revision int not null default 0, revision_note text,
  image_b64 text not null, width int, height int, file_name text,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists plan_sheets_job_idx on public.plan_sheets(job_id, sheet_key, revision);
alter table public.plan_sheets enable row level security;
create policy owner_only on public.plan_sheets for all to authenticated
  using ((select is_owner()) or thm_partner_job(job_id)) with check ((select is_owner()) or thm_partner_job(job_id));

create table if not exists public.plan_pins (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  sheet_id uuid not null references public.plan_sheets(id) on delete cascade,
  x numeric not null, y numeric not null,
  kind text not null default 'task' check (kind in ('task','note','photo','rfi')),
  title text not null, body text,
  status text not null default 'open' check (status in ('open','done')),
  photo_b64 text, rfi_id uuid,
  created_at timestamptz not null default now(), done_at timestamptz
);
create index if not exists plan_pins_sheet_idx on public.plan_pins(sheet_id);
alter table public.plan_pins enable row level security;
create policy owner_only on public.plan_pins for all to authenticated
  using ((select is_owner()) or thm_partner_job(job_id)) with check ((select is_owner()) or thm_partner_job(job_id));
