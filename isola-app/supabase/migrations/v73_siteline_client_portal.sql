-- v73 (10/23/26): SiteLine client portal — "Find my projects".
-- A client types their email on /siteline; if it matches a customer's email (or the email
-- someone used to sign one of our proposals), the server emails them ONE link to a page
-- listing all of their projects, each opening its normal SiteLine page (/site/<token>).
-- No passwords. The page never says whether an email matched.
--
-- Security: issuing a link needs PUSH_SERVER_SECRET (same shared secret + sha256 in
-- push_config as v49), so only the Next.js server can mint one — never the browser.
-- Reading a portal needs its long random token, like every other SiteLine link.
-- Rate limits: 3 requests per email per hour, 10 per IP per hour.
-- Shows only what SiteLine already shows: never costs, crew pay or notes.

create table if not exists public.siteline_portal_links (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  token          text unique not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '30 days',
  last_viewed_at timestamptz,
  view_count     int not null default 0
);
alter table public.siteline_portal_links enable row level security;
drop policy if exists owner_only on public.siteline_portal_links;
create policy owner_only on public.siteline_portal_links for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create index if not exists siteline_portal_links_email_idx on public.siteline_portal_links (lower(email));

create table if not exists public.siteline_portal_requests (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  ip         text,
  matched    boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.siteline_portal_requests enable row level security;
drop policy if exists owner_only on public.siteline_portal_requests;
create policy owner_only on public.siteline_portal_requests for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create index if not exists siteline_portal_requests_recent_idx on public.siteline_portal_requests (created_at desc);

-- jobs that belong to an email: the customer's email, or a proposal signer's email
create or replace function public.siteline_portal_job_ids(p_email text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct j.id from jobs j
   where j.status not in ('lost', 'lead')
     and (
       exists (select 1 from customers c
                where c.id = j.customer_id and lower(btrim(c.email)) = lower(btrim(p_email)))
       or exists (select 1 from proposal_links pl
                   where pl.job_id = j.id and lower(btrim(pl.signer_email)) = lower(btrim(p_email)))
     );
$$;
revoke all on function public.siteline_portal_job_ids(text) from public, anon, authenticated;

-- server only: mint a portal link for an email (or say nothing matched)
create or replace function public.siteline_portal_issue(p_secret text, p_email text, p_ip text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(p_email, ''))); n int; tok text; who text; first text;
begin
  if p_secret is null
     or encode(extensions.digest(p_secret, 'sha256'), 'hex')
        is distinct from (select secret_sha256 from push_config where id = 1) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'bad_email');
  end if;
  if (select count(*) from siteline_portal_requests where lower(email) = e and created_at > now() - interval '1 hour') >= 3
     or (p_ip is not null and (select count(*) from siteline_portal_requests where ip = p_ip and created_at > now() - interval '1 hour') >= 10) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select count(*) into n from siteline_portal_job_ids(e);
  insert into siteline_portal_requests (email, ip, matched) values (e, p_ip, n > 0);
  if n = 0 then return jsonb_build_object('ok', true, 'matched', false); end if;

  insert into siteline_portal_links (email) values (e) returning token into tok;

  select coalesce(nullif(btrim(c.contact_name), ''), c.name), c.name into first, who
    from customers c where lower(btrim(c.email)) = e order by c.updated_at desc nulls last limit 1;
  if who is null then
    select pl.approved_by, j.customer into first, who
      from proposal_links pl join jobs j on j.id = pl.job_id
     where lower(btrim(pl.signer_email)) = e order by pl.approved_at desc nulls last limit 1;
  end if;

  insert into notifications (kind, title, body, url, dedupe_key)
  values ('siteline_portal', 'SiteLine link requested',
          coalesce(who, e) || ' asked for their project link (' || e || ')',
          '/siteline/' || tok, 'siteline_portal:' || tok);

  return jsonb_build_object('ok', true, 'matched', true, 'token', tok, 'count', n,
                            'name', split_part(coalesce(first, ''), ' ', 1), 'customer', who);
end $$;
revoke all on function public.siteline_portal_issue(text, text, text) from public;
grant execute on function public.siteline_portal_issue(text, text, text) to anon, authenticated, service_role;

-- the portal page: every project for that email, newest activity first
create or replace function public.public_siteline_portal(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pl public.siteline_portal_links; d date := (now() at time zone 'America/New_York')::date; who text;
begin
  select * into pl from siteline_portal_links where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if pl.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  update siteline_portal_links set last_viewed_at = now(), view_count = view_count + 1 where id = pl.id;

  select coalesce(nullif(btrim(c.contact_name), ''), c.name) into who
    from customers c where lower(btrim(c.email)) = lower(pl.email) order by c.updated_at desc nulls last limit 1;

  return jsonb_build_object(
    'ok', true,
    'name', split_part(coalesce(who, ''), ' ', 1),
    'expires_at', pl.expires_at,
    'projects', coalesce((select jsonb_agg(x.p order by x.rank, x.sort_date desc nulls last) from (
      select
        case j.status when 'progress' then 0 when 'booked' then 1 when 'future' then 1 when 'awaiting' then 2 else 3 end as rank,
        coalesce(j.start_date, j.created_at::date) as sort_date,
        jsonb_build_object(
          'token', s.token,
          'job_name', coalesce(nullif(btrim(j.job_name), ''), j.location, 'Project'),
          'location', j.location,
          'phase', case j.status
                     when 'complete' then 'Complete'
                     when 'progress' then 'In progress'
                     when 'booked' then 'Scheduled'
                     when 'future' then 'Scheduled'
                     when 'awaiting' then 'Proposal'
                     else 'Planning' end,
          'start_date', coalesce(j.start_date, (select min(e.entry_date) from schedule_entries e where e.job_id = j.id and coalesce(e.label, '') !~* 'invoice')),
          'completed_date', case when j.status = 'complete' then j.completed_date end,
          'next_day', case when j.status in ('complete', 'lost') then null else
            (select min(e.entry_date) from schedule_entries e where e.job_id = j.id and e.entry_date >= d and coalesce(e.label, '') !~* 'invoice') end,
          'needs_signature', exists (select 1 from proposal_links p where p.job_id = j.id and p.status in ('sent', 'viewed')
                                       and (p.expires_at is null or p.expires_at >= d))
        ) as p
      from jobs j join siteline_shares s on s.job_id = j.id
      where j.id in (select siteline_portal_job_ids(pl.email))
    ) x), '[]'::jsonb)
  );
end $$;
revoke all on function public.public_siteline_portal(text) from public;
grant execute on function public.public_siteline_portal(text) to anon, authenticated, service_role;
