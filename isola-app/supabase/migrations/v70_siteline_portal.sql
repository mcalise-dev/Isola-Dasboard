-- v70 (10/22/26): SiteLine becomes the one client page for every job.
-- Every job gets a SiteLine link automatically. The page now also lists the job's
-- proposal and change-order signature links (status, total, sign button), the scope
-- of work and the upcoming site days. Signing still happens on /p/<token> (e-sign, v69);
-- that page links back to the project page. Still never: costs, crew pay, internal notes.

-- Applied 10/22/26 (as v70a, v70b, v70c — trigger via CREATE OR REPLACE TRIGGER).
-- 1. a SiteLine share for every job, now and on every new job
insert into public.siteline_shares (job_id)
select j.id from public.jobs j
where not exists (select 1 from public.siteline_shares s where s.job_id = j.id);

create or replace function public.jobs_make_siteline() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.siteline_shares (job_id) values (new.id) on conflict (job_id) do nothing;
  return new;
end $$;

create or replace trigger trg_jobs_make_siteline after insert on public.jobs
  for each row execute function public.jobs_make_siteline();

-- 2. the client page payload
create or replace function public.public_siteline(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s public.siteline_shares; j public.jobs; d date := (now() at time zone 'America/New_York')::date;
  main_pl public.proposal_links;
begin
  select * into s from siteline_shares where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into j from jobs where id = s.job_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  update siteline_shares set viewed_at = coalesce(viewed_at, now()), last_viewed_at = now(), view_count = view_count + 1
   where job_id = s.job_id;

  -- the proposal whose scope the client sees: latest approved, else latest open one
  select * into main_pl from proposal_links pl
   where pl.job_id = j.id and coalesce(pl.kind, 'proposal') = 'proposal' and pl.status <> 'declined'
   order by (pl.status = 'approved') desc, pl.created_at desc limit 1;

  return jsonb_build_object(
    'ok', true,
    'job_name', coalesce(nullif(btrim(j.job_name), ''), j.location, 'Project'),
    'customer', j.customer,
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
    'scope', coalesce(main_pl.scope, j.scope_of_work),
    'price', case when j.status = 'lost' then null else coalesce(main_pl.price, j.price_amount) end,
    'co_total', (select sum(c.amount) from change_orders c where c.job_id = j.id and c.status = 'approved'),
    'start_date', coalesce(j.start_date, (select min(e.entry_date) from schedule_entries e where e.job_id = j.id and coalesce(e.label, '') !~* 'invoice')),
    'completed_date', case when j.status = 'complete' then j.completed_date end,
    'next_days', case when j.status in ('complete','lost') then '[]'::jsonb else
      coalesce((select jsonb_agg(x.entry_date order by x.entry_date) from (
        select distinct e.entry_date from schedule_entries e
         where e.job_id = j.id and e.entry_date >= d and coalesce(e.label, '') !~* 'invoice' order by e.entry_date limit 20) x), '[]'::jsonb) end,
    'last_on_site', (select max(e.entry_date) from schedule_entries e where e.job_id = j.id and e.entry_date < d and coalesce(e.label, '') !~* 'invoice'),
    'docs', coalesce((select jsonb_agg(jsonb_build_object(
        'token', pl.token,
        'kind', coalesce(pl.kind, 'proposal'),
        'title', coalesce(pl.title, j.job_name, 'Proposal'),
        'status', case when pl.status in ('sent','viewed') and pl.expires_at is not null and pl.expires_at < d then 'expired' else pl.status end,
        'price', pl.price,
        'deposit_amount', pl.deposit_amount,
        'sent_at', coalesce(pl.sent_at, pl.created_at),
        'expires_at', pl.expires_at,
        'approved_at', pl.approved_at,
        'approved_by', pl.approved_by
      ) order by (coalesce(pl.kind, 'proposal') = 'proposal') desc, pl.created_at)
      from proposal_links pl where pl.job_id = j.id), '[]'::jsonb),
    'updates', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'date', u.update_date, 'body', public.crew_strip_money(u.body), 'photo', u.photo_b64
      ) order by u.update_date desc, u.created_at desc) from siteline_updates u where u.job_id = j.id), '[]'::jsonb)
  );
end $$;
revoke all on function public.public_siteline(text) from public;
grant execute on function public.public_siteline(text) to anon, authenticated, service_role;

-- 3. the signing page (/p/<token>) learns the job's SiteLine token so it can link back
create or replace function public.public_proposal(p_token text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare pl public.proposal_links; j public.jobs; eff text; d public.documents; st text;
begin
  select * into pl from public.proposal_links where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into j from public.jobs where id = pl.job_id;
  if pl.document_id is not null then select * into d from public.documents where id = pl.document_id; end if;
  select token into st from public.siteline_shares where job_id = pl.job_id;

  eff := pl.status;
  if pl.status in ('sent','viewed') and pl.expires_at is not null and pl.expires_at < current_date then
    eff := 'expired';
  end if;

  if pl.status = 'sent' then
    update public.proposal_links
       set status = 'viewed', viewed_at = coalesce(viewed_at, now()), view_count = view_count + 1,
           audit = (audit || jsonb_build_array(jsonb_build_object('event','opened','at',now(),'ip',public.req_ip(),'ua',public.req_ua())))
     where id = pl.id;
    if eff = 'sent' then eff := 'viewed'; end if;
  else
    update public.proposal_links
       set view_count = view_count + 1,
           audit = case when jsonb_array_length(audit) < 60
                   then audit || jsonb_build_array(jsonb_build_object('event','opened','at',now(),'ip',public.req_ip(),'ua',public.req_ua()))
                   else audit end
     where id = pl.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'token', pl.token,
    'kind', pl.kind,
    'status', eff,
    'title', coalesce(pl.title, j.job_name, 'Proposal'),
    'intro', pl.intro,
    'scope', coalesce(pl.scope, j.scope_of_work),
    'price', pl.price,
    'terms', pl.terms,
    'deposit_pct', pl.deposit_pct,
    'deposit_amount', pl.deposit_amount,
    'pay_url', pl.pay_url,
    'sent_at', coalesce(pl.sent_at, pl.created_at),
    'expires_at', pl.expires_at,
    'approved_at', pl.approved_at,
    'approved_by', pl.approved_by,
    'signature', pl.signature,
    'signature_png', pl.signature_png,
    'signer_email', pl.signer_email,
    'signer_ip', pl.signer_ip,
    'consent_at', pl.consent_at,
    'doc_hash', pl.doc_hash,
    'has_pdf', d.id is not null,
    'pdf_title', d.title,
    'job_name', j.job_name,
    'location', j.location,
    'job_type', j.job,
    'customer', j.customer,
    'siteline_token', st
  );
end $function$;
