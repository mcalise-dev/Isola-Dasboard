-- v54: Isola SiteLine (Mike, 10/12/26)
-- A no-login page for the property manager: where the job stands, when the crew is
-- on site next, and plain-language daily updates. Never prices, costs, crew pay or
-- internal notes. Schedule days only count real work days (billing reminders on the
-- board are skipped), and only dates are shared, never the entry's label or notes. The page reads everything through public_siteline(token) only.

create table if not exists public.siteline_shares (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0
);

create table if not exists public.siteline_updates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  update_date date not null default ((now() at time zone 'America/New_York')::date),
  body text not null,
  photo_b64 text,
  daily_log_id uuid unique references public.daily_logs(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists siteline_updates_job_idx on public.siteline_updates (job_id, update_date desc);

alter table public.siteline_shares enable row level security;
alter table public.siteline_updates enable row level security;
drop policy if exists owner_only on public.siteline_shares;
drop policy if exists owner_only on public.siteline_updates;
create policy owner_only on public.siteline_shares for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_only on public.siteline_updates for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

create or replace function public.public_siteline(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s public.siteline_shares; j public.jobs; d date := (now() at time zone 'America/New_York')::date;
begin
  select * into s from siteline_shares where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into j from jobs where id = s.job_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  update siteline_shares set viewed_at = coalesce(viewed_at, now()), last_viewed_at = now(), view_count = view_count + 1
   where job_id = s.job_id;
  return jsonb_build_object(
    'ok', true,
    'job_name', coalesce(nullif(btrim(j.job_name), ''), j.location, 'Project'),
    'location', j.location,
    'work_type', j.job,
    'phase', case j.status
               when 'complete' then 'Complete'
               when 'progress' then 'In progress'
               when 'booked' then 'Scheduled'
               when 'future' then 'Scheduled'
               when 'awaiting' then 'Awaiting approval'
               when 'lost' then 'Closed'
               else 'Planning' end,
    'start_date', coalesce(j.start_date, (select min(e.entry_date) from schedule_entries e where e.job_id = j.id and coalesce(e.label, '') !~* 'invoice')),
    'completed_date', case when j.status = 'complete' then j.completed_date end,
    'next_days', case when j.status in ('complete','lost') then '[]'::jsonb else
      coalesce((select jsonb_agg(x.entry_date order by x.entry_date) from (
        select distinct e.entry_date from schedule_entries e
         where e.job_id = j.id and e.entry_date >= d and coalesce(e.label, '') !~* 'invoice' order by e.entry_date limit 5) x), '[]'::jsonb) end,
    'last_on_site', (select max(e.entry_date) from schedule_entries e where e.job_id = j.id and e.entry_date < d and coalesce(e.label, '') !~* 'invoice'),
    'updates', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'date', u.update_date, 'body', public.crew_strip_money(u.body), 'photo', u.photo_b64
      ) order by u.update_date desc, u.created_at desc) from siteline_updates u where u.job_id = j.id), '[]'::jsonb)
  );
end $$;

revoke all on function public.public_siteline(text) from public;
grant execute on function public.public_siteline(text) to anon, authenticated, service_role;
