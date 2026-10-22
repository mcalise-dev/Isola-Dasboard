-- v69 (10/22/26): e-signature on proposal + change-order links
-- Applied to production 10/22/26.
--
-- Client signing page (/p/[token]) now: shows the attached proposal PDF, takes a drawn
-- signature + an ESIGN consent checkbox + optional email, and records an audit trail
-- (IP, user agent, time, SHA-256 fingerprint of exactly what was signed). Signed links
-- lock. A change-order link is tied to change_orders; signing it approves that CO.
-- The old 3-arg public_approve_proposal (typed signature) is kept so older clients
-- still work; the app now calls the 5-arg version.

alter table public.proposal_links
  add column if not exists kind text not null default 'proposal',
  add column if not exists document_id uuid references public.documents(id) on delete set null,
  add column if not exists change_order_id uuid references public.change_orders(id) on delete set null,
  add column if not exists signer_email text,
  add column if not exists signature_png text,
  add column if not exists signer_ip text,
  add column if not exists signer_ua text,
  add column if not exists consent_at timestamptz,
  add column if not exists doc_hash text,
  add column if not exists audit jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.proposal_links add constraint proposal_links_kind_chk check (kind in ('proposal','change_order'));
exception when duplicate_object then null; end $$;
create index if not exists proposal_links_change_order_id_idx on public.proposal_links(change_order_id);

-- request metadata from PostgREST headers
create or replace function public.req_ip() returns text language sql stable as $$
  select nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for',''), ',', 1)), '')
$$;
create or replace function public.req_ua() returns text language sql stable as $$
  select left(current_setting('request.headers', true)::json ->> 'user-agent', 400)
$$;

-- fingerprint of exactly what the client is agreeing to
create or replace function public.proposal_fingerprint(p_id uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select encode(extensions.digest(
    coalesce(pl.kind,'') || '|' || coalesce(pl.title,'') || '|' || coalesce(pl.scope,'') || '|' ||
    coalesce(pl.price::text,'') || '|' || coalesce(pl.terms,'') || '|' || coalesce(pl.deposit_pct::text,'') || '|' ||
    coalesce(d.file_b64,''), 'sha256'), 'hex')
  from public.proposal_links pl left join public.documents d on d.id = pl.document_id
  where pl.id = p_id
$$;
revoke execute on function public.proposal_fingerprint(uuid) from anon;

-- once signed, the content is locked
create or replace function public.proposal_links_lock() returns trigger language plpgsql as $$
begin
  if old.status = 'approved' and (
       new.title is distinct from old.title or new.scope is distinct from old.scope or
       new.price is distinct from old.price or new.terms is distinct from old.terms or
       new.deposit_pct is distinct from old.deposit_pct or new.document_id is distinct from old.document_id or
       new.kind is distinct from old.kind or new.intro is distinct from old.intro or
       new.change_order_id is distinct from old.change_order_id or
       new.signature_png is distinct from old.signature_png or new.approved_by is distinct from old.approved_by) then
    raise exception 'This document has been signed and is locked. Create a change order instead.';
  end if;
  return new;
end $$;
drop trigger if exists trg_proposal_links_lock on public.proposal_links;
create trigger trg_proposal_links_lock before update on public.proposal_links
  for each row execute function public.proposal_links_lock();

create or replace function public.public_proposal(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare pl public.proposal_links; j public.jobs; eff text; d public.documents;
begin
  select * into pl from public.proposal_links where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into j from public.jobs where id = pl.job_id;
  if pl.document_id is not null then select * into d from public.documents where id = pl.document_id; end if;

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
    'ok', true, 'token', pl.token, 'kind', pl.kind, 'status', eff,
    'title', coalesce(pl.title, j.job_name, 'Proposal'), 'intro', pl.intro,
    'scope', coalesce(pl.scope, j.scope_of_work), 'price', pl.price, 'terms', pl.terms,
    'deposit_pct', pl.deposit_pct, 'deposit_amount', pl.deposit_amount, 'pay_url', pl.pay_url,
    'sent_at', coalesce(pl.sent_at, pl.created_at), 'expires_at', pl.expires_at,
    'approved_at', pl.approved_at, 'approved_by', pl.approved_by, 'signature', pl.signature,
    'signature_png', pl.signature_png, 'signer_email', pl.signer_email, 'signer_ip', pl.signer_ip,
    'consent_at', pl.consent_at, 'doc_hash', pl.doc_hash,
    'has_pdf', d.id is not null, 'pdf_title', d.title,
    'job_name', j.job_name, 'location', j.location, 'job_type', j.job, 'customer', j.customer
  );
end $function$;

create or replace function public.public_proposal_pdf(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare pl public.proposal_links; d public.documents;
begin
  select * into pl from public.proposal_links where token = p_token;
  if not found or pl.document_id is null then return jsonb_build_object('ok', false); end if;
  select * into d from public.documents where id = pl.document_id;
  if not found or d.file_b64 is null then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'file_b64', d.file_b64, 'mime_type', coalesce(d.mime_type,'application/pdf'), 'title', d.title);
end $$;

-- drawn-signature approval (what the app calls now)
create or replace function public.public_approve_proposal(
  p_token text, p_name text, p_signature_png text, p_email text, p_consent boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare pl public.proposal_links; jb public.jobs; h text; label text;
begin
  if coalesce(btrim(p_name),'') = '' then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;
  if coalesce(p_consent,false) is not true then return jsonb_build_object('ok', false, 'error', 'consent_required'); end if;
  if p_signature_png is null or p_signature_png not like 'data:image/png;base64,%'
     or length(p_signature_png) < 300 or length(p_signature_png) > 500000 then
    return jsonb_build_object('ok', false, 'error', 'signature_required');
  end if;
  if p_email is not null and btrim(p_email) <> '' and btrim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'bad_email');
  end if;

  select * into pl from public.proposal_links where token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if pl.status = 'approved' then return jsonb_build_object('ok', true, 'already', true); end if;
  if pl.status not in ('sent','viewed') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if pl.expires_at is not null and pl.expires_at < current_date then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  h := public.proposal_fingerprint(pl.id);

  update public.proposal_links
     set status = 'approved', approved_at = now(),
         approved_by = btrim(p_name), signature = btrim(p_name),
         signature_png = p_signature_png,
         signer_email = nullif(btrim(p_email),''),
         signer_ip = public.req_ip(), signer_ua = public.req_ua(),
         consent_at = now(), doc_hash = h,
         audit = audit || jsonb_build_array(jsonb_build_object(
           'event','signed','at',now(),'name',btrim(p_name),'email',nullif(btrim(p_email),''),
           'ip',public.req_ip(),'ua',public.req_ua(),'hash',h))
   where id = pl.id;

  select * into jb from public.jobs where id = pl.job_id;
  label := case when pl.kind = 'change_order' then 'Change order' else 'Proposal' end;

  if pl.kind = 'proposal' then
    update public.jobs set proposal_status = 'signed', updated_at = now() where id = pl.job_id;
  end if;
  if pl.change_order_id is not null then
    update public.change_orders
       set status = 'approved', approved_at = now(), approved_by = btrim(p_name),
           signature = btrim(p_name), token = pl.token, updated_at = now()
     where id = pl.change_order_id;
  end if;

  insert into public.communications (customer_id, job_id, kind, direction, body)
  values (jb.customer_id, pl.job_id, 'proposal', 'in',
          label || ' SIGNED online by ' || btrim(p_name) ||
          coalesce(' <' || nullif(btrim(p_email),'') || '>', '') ||
          ' — "' || coalesce(pl.title, jb.job_name, '') || '"' ||
          coalesce(' · $' || to_char(pl.price, 'FM999,999,990.00'), ''));

  return jsonb_build_object('ok', true);
end $function$;

-- legacy typed-signature approval, kept for clients still on the old page
create or replace function public.public_approve_proposal(p_token text, p_name text, p_signature text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare pl public.proposal_links; jb public.jobs; h text;
begin
  if coalesce(btrim(p_name),'') = '' or coalesce(btrim(p_signature),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'name_and_signature_required');
  end if;
  select * into pl from public.proposal_links where token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if pl.status = 'approved' then return jsonb_build_object('ok', true, 'already', true); end if;
  if pl.status not in ('sent','viewed') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if pl.expires_at is not null and pl.expires_at < current_date then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  h := public.proposal_fingerprint(pl.id);
  update public.proposal_links
     set status = 'approved', approved_at = now(), approved_by = btrim(p_name), signature = btrim(p_signature),
         signer_ip = public.req_ip(), signer_ua = public.req_ua(), doc_hash = h,
         audit = audit || jsonb_build_array(jsonb_build_object('event','signed_typed','at',now(),'name',btrim(p_name),'ip',public.req_ip(),'ua',public.req_ua(),'hash',h))
   where id = pl.id;
  select * into jb from public.jobs where id = pl.job_id;
  if pl.kind = 'proposal' then
    update public.jobs set proposal_status = 'signed', updated_at = now() where id = pl.job_id;
  end if;
  insert into public.communications (customer_id, job_id, kind, direction, body)
  values (jb.customer_id, pl.job_id, 'proposal', 'in',
          'Proposal APPROVED online by ' || btrim(p_name) || ' — signed "' || btrim(p_signature) || '"');
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.public_decline_proposal(p_token text, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare pl public.proposal_links; jb public.jobs;
begin
  select * into pl from public.proposal_links where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if pl.status not in ('sent','viewed') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;

  update public.proposal_links
     set status = 'declined', declined_at = now(), decline_reason = nullif(btrim(p_reason), ''),
         audit = audit || jsonb_build_array(jsonb_build_object('event','declined','at',now(),'ip',public.req_ip(),'ua',public.req_ua()))
   where id = pl.id;

  select * into jb from public.jobs where id = pl.job_id;
  if pl.kind = 'proposal' then
    update public.jobs set proposal_status = 'declined', updated_at = now() where id = pl.job_id;
  end if;
  if pl.change_order_id is not null then
    update public.change_orders set status = 'declined', declined_at = now(), updated_at = now()
     where id = pl.change_order_id and status <> 'approved';
  end if;

  insert into public.communications (customer_id, job_id, kind, direction, body)
  values (jb.customer_id, pl.job_id, 'proposal', 'in',
          case when pl.kind = 'change_order' then 'Change order' else 'Proposal' end ||
          ' DECLINED online' || coalesce(' — ' || nullif(btrim(p_reason), ''), ''));

  return jsonb_build_object('ok', true);
end $function$;

-- push alert says what was signed
create or replace function public.trg_notify_proposal_signed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.approved_at is null and new.approved_at is not null then
    insert into notifications (kind, title, body, url, dedupe_key)
    values ('proposal_signed',
            case when new.kind = 'change_order' then 'Change order signed' else 'Proposal signed' end,
            concat_ws(', ',
              push_job_label(new.job_id) || ' — ' || coalesce(nullif(trim(new.approved_by), ''), 'client'),
              push_money(new.price)),
            '/jobs/' || new.job_id || '?tab=proposal',
            'proposal_signed:' || new.id)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.trg_notify_proposal_signed() from public, anon, authenticated;

grant execute on function public.public_proposal(text) to anon, authenticated;
grant execute on function public.public_proposal_pdf(text) to anon, authenticated;
grant execute on function public.public_approve_proposal(text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.public_approve_proposal(text, text, text) to anon, authenticated;
grant execute on function public.public_decline_proposal(text, text) to anon, authenticated;
