-- v84 (11/3/26): Document Studio — invoices, proposals and change orders built on the job page in the
-- Isola v3 look. One row per document; the whole editable document lives in `data` (jsonb).
-- Studio-wide defaults (company block, colors, terms, position names…) live in app_settings key 'doc_studio'.
create table if not exists public.studio_docs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete cascade,
  kind text not null check (kind in ('invoice','proposal','change_order')),
  number text,
  title text,
  status text not null default 'draft',
  total numeric,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_docs_job_idx on public.studio_docs (job_id, updated_at desc);
alter table public.studio_docs enable row level security;
create policy owner_all on public.studio_docs for all to authenticated
  using ((select is_owner())) with check ((select is_owner()));
