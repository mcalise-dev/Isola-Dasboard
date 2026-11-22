-- v93 (11/22/26): SiteLine updates go live at 6 PM, and the portal's contacts get an email.
-- Mike's ask: whatever he posts during the day goes out at 6 PM Eastern; when a portal's job
-- got an update that day, that portal's contacts get a "your project page was updated" email
-- with the update's text in it and a button to open the page. No update that day, no email.
--
-- Both parts start OFF (app_settings 'siteline_6pm' = {"schedule":false,"email":false}).
-- With schedule off, posting works exactly as before (publish_at stays null = live now).
-- Existing updates are never emailed: only updates with a publish_at are, and only once.

alter table public.siteline_updates
  add column if not exists publish_at  timestamptz,   -- null = live as soon as posted
  add column if not exists notified_at timestamptz;   -- set once the 6 PM run handled it

alter table public.siteline_contact_portals
  add column if not exists notify_emails text[] not null default '{}';   -- who gets the update email

insert into public.app_settings (key, value, updated_at)
values ('siteline_6pm', '{"schedule":false,"email":false}', now())
on conflict (key) do nothing;

-- the server's key for the 6 PM run (only its sha256 lives here; the key is a Vercel env var)
create table if not exists public.siteline_mail_config (
  id int primary key default 1 check (id = 1),
  secret_sha256 text not null
);
alter table public.siteline_mail_config enable row level security;   -- no policies: definer functions only
revoke all on public.siteline_mail_config from anon, authenticated;

create or replace function public.siteline_mail_check(p_secret text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_secret is null or length(p_secret) < 16
     or encode(extensions.digest(p_secret, 'sha256'), 'hex')
        is distinct from (select secret_sha256 from siteline_mail_config where id = 1) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;
revoke all on function public.siteline_mail_check(text) from public, anon, authenticated;

-- next 6 PM Eastern: today's if it's before 6, otherwise tomorrow's
create or replace function public.siteline_next_publish_at()
returns timestamptz language sql stable set search_path = public as $$
  select ((now() at time zone 'America/New_York')::date
          + case when (now() at time zone 'America/New_York')::time < time '18:00' then 0 else 1 end
          + time '18:00') at time zone 'America/New_York';
$$;
revoke all on function public.siteline_next_publish_at() from public, anon;
grant execute on function public.siteline_next_publish_at() to authenticated;

-- Client pages only show updates that are live. Patched in place so nothing else in them changes.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.public_siteline(text)'::regprocedure);
  n := replace(d, 'from siteline_updates u where u.job_id = j.id), ''[]''::jsonb)',
                  'from siteline_updates u where u.job_id = j.id and (u.publish_at is null or u.publish_at <= now())), ''[]''::jsonb)');
  if n = d then raise exception 'public_siteline: update list not found'; end if;
  execute n;

  d := pg_get_functiondef('public.public_contact_portal(text)'::regprocedure);
  n := replace(d, '(select max(u.update_date) from siteline_updates u where u.job_id = j.id)',
                  '(select max(u.update_date) from siteline_updates u where u.job_id = j.id and (u.publish_at is null or u.publish_at <= now()))');
  if n = d then raise exception 'public_contact_portal: last_update not found'; end if;
  execute n;

  d := pg_get_functiondef('public.siteline_tm(uuid)'::regprocedure);
  n := replace(d, 'from siteline_updates u where u.job_id = any(ids) and u.update_date = x.d',
                  'from siteline_updates u where u.job_id = any(ids) and u.update_date = x.d and (u.publish_at is null or u.publish_at <= now())');
  if n = d then raise exception 'siteline_tm: update fallback not found'; end if;
  execute n;
end $$;

-- What the 6 PM email says, per portal. One portal = one email to each of its notify_emails.
-- p_update_ids null = every update that went live in the last 36 hours and hasn't been handled.
create or replace function public.siteline_mail_batch(p_update_ids uuid[], p_portal uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with ups as (
    select u.* from siteline_updates u
     where case when p_update_ids is null
                then u.publish_at is not null and u.publish_at <= now()
                     and u.publish_at > now() - interval '36 hours' and u.notified_at is null
                else u.id = any(p_update_ids) end
  )
  select jsonb_build_object(
    'update_ids', coalesce((select jsonb_agg(id) from ups), '[]'::jsonb),
    'portals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'portal_id', cp.id, 'token', cp.token,
               'welcome_name', nullif(btrim(coalesce(cp.welcome_name, '')), ''),
               'emails', to_jsonb(cp.notify_emails), 'jobs', jx.jobs))
        from siteline_contact_portals cp
        cross join lateral (
          select jsonb_agg(jsonb_build_object(
                   'share_token', s.token,
                   'job_name', coalesce(nullif(btrim(j.job_name), ''), j.location, 'Project'),
                   'location', j.location,
                   'updates', (select jsonb_agg(jsonb_build_object(
                                 'date', u.update_date,
                                 'body', public.crew_strip_money(u.body),
                                 'photos', greatest(coalesce(jsonb_array_length(u.photos), 0), case when u.photo_b64 is not null then 1 else 0 end))
                               order by u.update_date, u.created_at)
                               from ups u where u.job_id = j.id))
                 order by j.job_name) as jobs
            from jobs j join siteline_shares s on s.job_id = j.id
           where j.id in (select contact_portal_job_ids(cp.id))
             and exists (select 1 from ups u where u.job_id = j.id)
        ) jx
       where cp.active and jx.jobs is not null
         and (p_portal is null or cp.id = p_portal)), '[]'::jsonb)
  );
$$;
revoke all on function public.siteline_mail_batch(uuid[], uuid) from public, anon, authenticated;

-- The 6 PM run: what to send, then mark it handled. Both need the server key.
create or replace function public.siteline_6pm_outbox(p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cfg jsonb;
begin
  perform siteline_mail_check(p_secret);
  begin select value::jsonb into cfg from app_settings where key = 'siteline_6pm';
  exception when others then cfg := '{}'::jsonb; end;
  return siteline_mail_batch(null) || jsonb_build_object('email', coalesce((cfg->>'email')::boolean, false));
end $$;

create or replace function public.siteline_6pm_mark(p_secret text, p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform siteline_mail_check(p_secret);
  update siteline_updates set notified_at = now() where id = any(p_ids) and notified_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- A test: the email one portal would get for one update, to send to Mike only. Marks nothing.
create or replace function public.siteline_mail_preview(p_secret text, p_portal_token text, p_update_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  perform siteline_mail_check(p_secret);
  select id into pid from siteline_contact_portals where token = p_portal_token;
  if pid is null then return jsonb_build_object('portals', '[]'::jsonb); end if;
  return siteline_mail_batch(array[p_update_id], pid);
end $$;

revoke all on function public.siteline_6pm_outbox(text) from public;
revoke all on function public.siteline_6pm_mark(text, uuid[]) from public;
revoke all on function public.siteline_mail_preview(text, text, uuid) from public;
grant execute on function public.siteline_6pm_outbox(text) to anon, authenticated;
grant execute on function public.siteline_6pm_mark(text, uuid[]) to anon, authenticated;
grant execute on function public.siteline_mail_preview(text, text, uuid) to anon, authenticated;

-- Every new update waits for 6 PM while the schedule is on, however it was posted
-- (dashboard, daily log, or posted for Mike). An update given its own publish_at keeps it.
create or replace function public.trg_siteline_schedule()
returns trigger language plpgsql security definer set search_path = public as $$
declare cfg jsonb;
begin
  if new.publish_at is null then
    begin select value::jsonb into cfg from app_settings where key = 'siteline_6pm';
    exception when others then cfg := '{}'::jsonb; end;
    if coalesce((cfg->>'schedule')::boolean, false) then
      new.publish_at := siteline_next_publish_at();
    end if;
  end if;
  return new;
end $$;
revoke all on function public.trg_siteline_schedule() from public, anon, authenticated;
drop trigger if exists siteline_schedule on public.siteline_updates;
create trigger siteline_schedule before insert on public.siteline_updates
  for each row execute function public.trg_siteline_schedule();
