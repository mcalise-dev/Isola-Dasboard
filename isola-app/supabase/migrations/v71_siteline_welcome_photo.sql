-- v71 (10/22/26): SiteLine top card — "Welcome, <name>" and an optional property photo.
-- Applied to production 10/22/26.
-- Kept in their own table (not siteline_shares) so New link / Turn off never lose them.
create table if not exists public.siteline_settings (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  welcome_name text,          -- blank = first name of jobs.contact_name
  cover_photo_b64 text,
  updated_at timestamptz not null default now()
);
alter table public.siteline_settings enable row level security;
create policy owner_only on public.siteline_settings for all to authenticated
  using ((select is_owner())) with check ((select is_owner()));
create policy thm_partner on public.siteline_settings for all to authenticated
  using ((select thm_partner_job(siteline_settings.job_id))) with check ((select thm_partner_job(siteline_settings.job_id)));

-- public_siteline(token) gains two keys right after 'ok':
do $do$
declare def text;
begin
  def := pg_get_functiondef('public.public_siteline(text)'::regprocedure);
  if position('''welcome_name''' in def) = 0 then
    def := replace(def, $r$'ok', true,$r$,
      $r$'ok', true,
    'welcome_name', coalesce(
        (select nullif(btrim(ss.welcome_name), '') from siteline_settings ss where ss.job_id = j.id),
        nullif(split_part(btrim(coalesce(j.contact_name, '')), ' ', 1), '')),
    'cover_photo', (select ss.cover_photo_b64 from siteline_settings ss where ss.job_id = j.id),$r$);
    execute def;
  end if;
end $do$;
