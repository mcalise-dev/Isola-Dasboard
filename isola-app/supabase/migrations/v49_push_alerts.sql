-- v49 — Web push alerts (Isola On The Go)
--
-- Events in the database queue rows in public.notifications (triggers + a daily expiry scan).
-- The Next.js server pulls them with push_outbox(secret) and delivers them with web-push.
-- No pg_net / pg_cron / service-role key needed: the server calls the two SECURITY DEFINER
-- functions below with the anon key and a shared secret whose sha256 lives in push_config.
--
-- push_config holds the sha256 of the PUSH_SERVER_SECRET set in Vercel (a hash, not the secret).
-- If the secret is ever rotated, update this hash to match.
-- Safe to re-run.

-- ───────────────────────── tables ─────────────────────────

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid(),
  endpoint    text unique not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists owner_only on public.push_subscriptions;
create policy owner_only on public.push_subscriptions for all to authenticated
  using ((select is_owner())) with check ((select is_owner()));

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  title       text not null,
  body        text,
  url         text,
  dedupe_key  text unique,
  created_at  timestamptz default now(),
  pushed_at   timestamptz,
  read_at     timestamptz
);
alter table public.notifications enable row level security;
drop policy if exists owner_only on public.notifications;
create policy owner_only on public.notifications for all to authenticated
  using ((select is_owner())) with check ((select is_owner()));
create index if not exists notifications_pending_idx on public.notifications (pushed_at) where pushed_at is null;
create index if not exists notifications_created_idx on public.notifications (created_at desc);

create table if not exists public.push_config (
  id             int primary key default 1 check (id = 1),
  secret_sha256  text not null
);
alter table public.push_config enable row level security;   -- no policies: only definer functions read it
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (id, secret_sha256) values (1, '9908245d12e0b1e47009076eaefd8c94821e8f93846f49e9256acd6b8bd3fd36')
  on conflict (id) do update set secret_sha256 = excluded.secret_sha256;

-- ───────────────────────── helpers ─────────────────────────

create or replace function public.push_job_label(p_job_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(nullif(trim(j.job_name), ''), nullif(trim(j.customer), ''))
                     from jobs j where j.id = p_job_id), 'Job');
$$;

create or replace function public.push_money(p numeric)
returns text language sql immutable set search_path = public as $$
  select case
    when p is null then null
    when p = trunc(p) then '$' || to_char(p, 'FM999,999,999,990')
    else '$' || to_char(p, 'FM999,999,999,990.00')
  end;
$$;

-- ───────────────────────── triggers ─────────────────────────

-- a) client adds a punch item through the public punch link
create or replace function public.trg_notify_punch_client()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.added_via = 'client' then
    insert into notifications (kind, title, body, url, dedupe_key)
    values ('punch_client', 'Punch item added',
            push_job_label(new.job_id) || ': ' || left(coalesce(new.item, ''), 200),
            '/jobs/' || new.job_id || '?tab=tasks',
            'punch_add:' || new.id)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists notify_punch_client on public.punch_list;
create trigger notify_punch_client after insert on public.punch_list
  for each row execute function public.trg_notify_punch_client();

-- b) client signs off the punch list
create or replace function public.trg_notify_punch_signoff()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.signed_off_at is null and new.signed_off_at is not null then
    insert into notifications (kind, title, body, url, dedupe_key)
    values ('punch_signoff', 'Punch list signed off',
            push_job_label(new.job_id) || ' — signed by ' || coalesce(nullif(trim(new.signed_off_by), ''), 'client'),
            '/jobs/' || new.job_id || '?tab=tasks',
            'punch_signoff:' || new.job_id || ':' || new.signed_off_at)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists notify_punch_signoff on public.punch_shares;
create trigger notify_punch_signoff after update on public.punch_shares
  for each row execute function public.trg_notify_punch_signoff();

-- c) client signs a proposal
create or replace function public.trg_notify_proposal_signed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.approved_at is null and new.approved_at is not null then
    insert into notifications (kind, title, body, url, dedupe_key)
    values ('proposal_signed', 'Proposal signed',
            concat_ws(', ',
              push_job_label(new.job_id) || ' — ' || coalesce(nullif(trim(new.approved_by), ''), 'client'),
              push_money(new.price)),
            '/jobs/' || new.job_id || '?tab=proposal',
            'proposal_signed:' || new.id)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists notify_proposal_signed on public.proposal_links;
create trigger notify_proposal_signed after update on public.proposal_links
  for each row execute function public.trg_notify_proposal_signed();

-- d) vendor sends documents through the public vendor form (no logged-in user).
--    vendor_submit inserts a COI row and a W-9 row in the same call; the second one is folded
--    into the first alert ("Acme — COI + W-9") so the phone buzzes once per submission.
create or replace function public.trg_notify_vendor_upload()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_company text;
  v_label   text;
  v_prefix  text;
begin
  if auth.uid() is not null then return new; end if;
  select coalesce(nullif(trim(company), ''), 'A vendor') into v_company from vendors where id = new.vendor_id;
  v_company := coalesce(v_company, 'A vendor');
  v_label := case lower(coalesce(new.doc_type, ''))
               when 'coi' then 'COI' when 'w9' then 'W-9' when 'w-9' then 'W-9' else 'other' end;
  v_prefix := v_company || ' — ';

  update notifications
     set body = body || ' + ' || v_label
   where kind = 'vendor_upload' and pushed_at is null
     and created_at = now()                       -- same transaction (same vendor_submit call)
     and left(body, length(v_prefix)) = v_prefix;
  if found then return new; end if;

  insert into notifications (kind, title, body, url, dedupe_key)
  values ('vendor_upload', 'Vendor sent documents', v_prefix || v_label, '/vendors', 'vendor_doc:' || new.id)
  on conflict (dedupe_key) do nothing;
  return new;
end $$;
drop trigger if exists notify_vendor_upload on public.vendor_documents;
create trigger notify_vendor_upload after insert on public.vendor_documents
  for each row execute function public.trg_notify_vendor_upload();

-- ───────────────────────── expiry scan ─────────────────────────
-- Queues one alert per COI expiry date: within the next 30 days, or expired in the last 7.
create or replace function public.queue_expiry_alerts()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (kind, title, body, url, dedupe_key)
  select 'coi_expiring',
         case when d.expires_at < current_date then 'COI expired' else 'COI expiring' end,
         coalesce(nullif(trim(d.title), ''), nullif(trim(d.issuer), ''), 'Certificate of insurance')
           || case when d.expires_at < current_date then ' expired ' else ' expires ' end
           || to_char(d.expires_at, 'Mon FMDD'),
         '/docs',
         'doc_exp:' || d.id || ':' || d.expires_at
    from documents d
   where d.doc_type = 'coi'
     and d.expires_at between current_date - 7 and current_date + 30
  on conflict (dedupe_key) do nothing;

  insert into notifications (kind, title, body, url, dedupe_key)
  select 'coi_expiring',
         case when v.coi_expires < current_date then 'Vendor COI expired' else 'Vendor COI expiring' end,
         coalesce(nullif(trim(v.company), ''), 'Vendor')
           || case when v.coi_expires < current_date then ' — COI expired ' else ' — COI expires ' end
           || to_char(v.coi_expires, 'Mon FMDD'),
         '/vendors',
         'vendor_exp:' || v.coi_id || ':' || v.coi_expires
    from vendor_overview v
   where v.coi_id is not null
     and coalesce(v.status, '') <> 'inactive'
     and v.coi_expires between current_date - 7 and current_date + 30
  on conflict (dedupe_key) do nothing;
end $$;

-- ───────────────────────── server entry points ─────────────────────────

create or replace function public.push_check_secret(p_secret text)
returns void language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if p_secret is null or length(p_secret) < 16
     or encode(extensions.digest(p_secret, 'sha256'), 'hex')
        is distinct from (select secret_sha256 from push_config where id = 1) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- Claims every pending alert (so two racing flushes never deliver the same one) and returns the
-- enabled, recent ones plus all device subscriptions. Disabled kinds and anything older than
-- 3 days are marked pushed without being delivered. Nothing is claimed while no device is subscribed.
create or replace function public.push_outbox(p_secret text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_prefs jsonb := '{}'::jsonb;
  v_subs  jsonb;
  v_notes jsonb;
begin
  perform push_check_secret(p_secret);
  perform queue_expiry_alerts();

  begin
    select value::jsonb into v_prefs from app_settings where key = 'push_prefs';
  exception when others then v_prefs := '{}'::jsonb;
  end;
  if v_prefs is null or jsonb_typeof(v_prefs) <> 'object' then v_prefs := '{}'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
    into v_subs from push_subscriptions s;
  if jsonb_array_length(v_subs) = 0 then
    return jsonb_build_object('notifications', '[]'::jsonb, 'subscriptions', v_subs);
  end if;

  with pending as (
    select id from notifications
     where pushed_at is null
     order by created_at
     for update skip locked
  ), claimed as (
    update notifications n set pushed_at = now()
      from pending p where n.id = p.id
    returning n.id, n.kind, n.title, n.body, n.url, n.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'title', c.title, 'body', c.body, 'url', c.url)
                            order by c.created_at), '[]'::jsonb)
    into v_notes
    from claimed c
   where c.created_at > now() - interval '3 days'
     and case when jsonb_typeof(v_prefs -> c.kind) = 'boolean' then (v_prefs ->> c.kind)::boolean else true end;

  return jsonb_build_object('notifications', v_notes, 'subscriptions', v_subs);
end $$;

create or replace function public.push_drop_subscription(p_secret text, p_endpoint text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform push_check_secret(p_secret);
  delete from push_subscriptions where endpoint = p_endpoint;
end $$;

-- ───────────────────────── grants ─────────────────────────

revoke all on function public.push_job_label(uuid)                from public, anon, authenticated;
revoke all on function public.push_money(numeric)                 from public, anon, authenticated;
revoke all on function public.trg_notify_punch_client()           from public, anon, authenticated;
revoke all on function public.trg_notify_punch_signoff()          from public, anon, authenticated;
revoke all on function public.trg_notify_proposal_signed()        from public, anon, authenticated;
revoke all on function public.trg_notify_vendor_upload()          from public, anon, authenticated;
revoke all on function public.queue_expiry_alerts()               from public, anon, authenticated;
revoke all on function public.push_check_secret(text)             from public, anon, authenticated;
revoke all on function public.push_outbox(text)                   from public, anon, authenticated;
revoke all on function public.push_drop_subscription(text, text)  from public, anon, authenticated;
grant execute on function public.push_outbox(text)                  to anon, authenticated;
grant execute on function public.push_drop_subscription(text, text) to anon, authenticated;
