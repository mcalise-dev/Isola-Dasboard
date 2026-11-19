-- v89 (11/18/26): contact portals — one private link per contact (/portal/<token>).
-- Mike's ask: Paulina (Hennessy property manager) sees every Hennessy job he does;
-- Mike Nolette sees only what's at Courtyard at Metacom. Tapping a job shows the same
-- updates, contract price and next plan its /site/<token> page shows.
-- Additive only: a new table and a new read function. /site, /siteline and public_siteline
-- are untouched.
--
-- Which jobs a portal shows (worked out live, so new jobs appear on their own):
--   (job.customer_id in customer_ids  OR  job.property_id in property_ids  OR  job.id in include_job_ids)
--   AND job.id not in exclude_job_ids
--   AND (job.id in include_job_ids  OR  status not 'lost' and (not 'complete' or finished within recent_days))
-- Access is by the long random token only, like every other SiteLine link. No login.

create table if not exists public.siteline_contact_portals (
  id               uuid primary key default gen_random_uuid(),
  token            text unique not null default encode(extensions.gen_random_bytes(24), 'hex'),
  label            text,                       -- internal: who this is for
  welcome_name     text,                       -- "Hi <welcome_name>,"
  title            text,                       -- page heading; blank = "Your projects"
  customer_ids     uuid[] not null default '{}',
  property_ids     uuid[] not null default '{}',
  include_job_ids  uuid[] not null default '{}',
  exclude_job_ids  uuid[] not null default '{}',
  pending_job_ids  uuid[] not null default '{}',  -- shown as "Pending" on this portal
  recent_days      int not null default 60,    -- completed jobs stay listed this long
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  last_viewed_at   timestamptz,
  view_count       int not null default 0
);
alter table public.siteline_contact_portals enable row level security;
drop policy if exists owner_only on public.siteline_contact_portals;
create policy owner_only on public.siteline_contact_portals for all to authenticated
  using ((select is_owner())) with check ((select is_owner()));
revoke all on public.siteline_contact_portals from anon;

-- the job ids a portal covers
create or replace function public.contact_portal_job_ids(p_portal uuid)
returns setof uuid
language sql stable security definer set search_path to 'public'
as $$
  select j.id
    from siteline_contact_portals cp
    join jobs j on (j.customer_id = any(cp.customer_ids)
                    or j.property_id = any(cp.property_ids)
                    or j.id = any(cp.include_job_ids))
   where cp.id = p_portal
     and not (j.id = any(cp.exclude_job_ids))
     and (j.id = any(cp.include_job_ids)
          or (coalesce(j.status, '') <> 'lost'
              and (coalesce(j.status, '') <> 'complete'
                   or coalesce(j.completed_date, j.created_at::date)
                      >= (now() at time zone 'America/New_York')::date - cp.recent_days)));
$$;
revoke all on function public.contact_portal_job_ids(uuid) from public, anon, authenticated;

-- public read for /portal/<token>: the list only. Each job's detail comes from
-- public_siteline(<that job's share token>), exactly what its /site page shows.
create or replace function public.public_contact_portal(p_token text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare cp public.siteline_contact_portals; d date := (now() at time zone 'America/New_York')::date;
begin
  select * into cp from siteline_contact_portals where token = p_token and active;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  update siteline_contact_portals set last_viewed_at = now(), view_count = view_count + 1 where id = cp.id;
  return jsonb_build_object(
    'ok', true,
    'welcome_name', nullif(btrim(coalesce(cp.welcome_name, '')), ''),
    'title', coalesce(nullif(btrim(coalesce(cp.title, '')), ''), 'Your projects'),
    'jobs', coalesce((select jsonb_agg(x.p order by x.rank, x.sort_date desc nulls last) from (
      select
        case when j.id = any(cp.pending_job_ids) then 3
             else case j.status when 'progress' then 0 when 'booked' then 1 when 'future' then 1 when 'awaiting' then 2
                      when 'complete' then 4 else 3 end end as rank,
        coalesce(j.start_date, j.created_at::date) as sort_date,
        jsonb_build_object(
          'token', s.token,
          'job_name', coalesce(nullif(btrim(j.job_name), ''), j.location, 'Project'),
          'location', j.location,
          'property', coalesce(nullif(btrim(pr.label), ''), ''),
          'pending', j.id = any(cp.pending_job_ids),
          'phase', case j.status when 'complete' then 'Complete' when 'progress' then 'In progress'
                     when 'booked' then 'Scheduled' when 'future' then 'Scheduled' when 'awaiting' then 'Awaiting approval'
                     when 'lost' then 'Closed' else 'Planning' end,
          'start_date', coalesce(j.start_date, (select min(e.entry_date) from schedule_entries e where e.job_id = j.id and coalesce(e.label, '') !~* 'invoice')),
          'completed_date', case when j.status = 'complete' then j.completed_date end,
          'next_day', case when j.status in ('complete', 'lost') then null else
            (select min(e.entry_date) from schedule_entries e where e.job_id = j.id and e.entry_date >= d and coalesce(e.label, '') !~* 'invoice') end,
          'needs_signature', exists (select 1 from proposal_links p where p.job_id = j.id and p.status in ('sent', 'viewed')
                                       and (p.expires_at is null or p.expires_at >= d)),
          'last_update', (select max(u.update_date) from siteline_updates u where u.job_id = j.id)
        ) as p
      from jobs j
      join siteline_shares s on s.job_id = j.id
      left join properties pr on pr.id = j.property_id
      where j.id in (select contact_portal_job_ids(cp.id))
    ) x), '[]'::jsonb)
  );
end $function$;
revoke all on function public.public_contact_portal(text) from public;
grant execute on function public.public_contact_portal(text) to anon, authenticated;
