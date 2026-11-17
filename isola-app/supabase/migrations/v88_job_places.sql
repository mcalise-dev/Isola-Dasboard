-- v88 (11/17/26): Places on a job — the job site, dump/disposal, material pickup, etc.
-- Shown to the crew on /field/job/<id> with tap-for-directions. Owner edits them on the job's Crew card.
create table if not exists public.job_places (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind text not null default 'other' check (kind in ('site','disposal','pickup','supply','parking','other')),
  label text,              -- e.g. "Disposal + material pickup"
  name text,               -- e.g. "J&J Materials"
  address text not null,
  phone text,
  notes text,              -- e.g. "They take asphalt"
  material_vendor_id uuid references public.material_vendors(id) on delete set null,
  sort int default 0,
  created_at timestamptz default now()
);
create index if not exists job_places_job_idx on public.job_places (job_id, sort);
alter table public.job_places enable row level security;
drop policy if exists owner_only on public.job_places;
create policy owner_only on public.job_places for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy if exists thm_partner on public.job_places;
create policy thm_partner on public.job_places for all to authenticated
  using ((select public.thm_partner_job(job_places.job_id))) with check ((select public.thm_partner_job(job_places.job_id)));

-- crew_job(): adds 'places' (patched in place before 'phases' — never prices).
do $$
declare def text;
begin
  def := pg_get_functiondef('public.crew_job(uuid)'::regprocedure);
  if position('''places''' in def) = 0 then
    def := replace(def, $r$    'phases', (select$r$,
      $r$    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', pl.id, 'kind', pl.kind, 'label', public.crew_strip_money(pl.label), 'name', public.crew_strip_money(pl.name),
                     'address', pl.address, 'phone', pl.phone, 'notes', public.crew_clean(pl.notes)) order by pl.sort, pl.created_at), '[]'::jsonb)
               from public.job_places pl where pl.job_id = j.id),
    'phases', (select$r$);
    execute def;
  end if;
end $$;
