-- v91 (11/20/26): client email logins for SiteLine. PREPARED, NOT APPLIED.
-- Apply only after Mike says yes, and before turning on sign-ups in Supabase Auth.
--
-- How it works
--   * A client account is an ordinary Supabase Auth user whose app_metadata.role = 'client'.
--     app_metadata can't be changed by the user, so a client can never make themselves owner.
--   * A self sign-up is only accepted for an email Mike has put on a contact portal
--     (siteline_contact_portals.contact_emails). Anyone else is refused before the account exists.
--   * A signed-in client can reach exactly one thing: client_portal_token(), which hands back the
--     private portal token for their email. Everything they see after that goes through the same
--     read-only public_* functions the private links already use.
--   * Two walls keep client accounts out of the business data:
--       1. a request guard (PostgREST pre-request) that refuses every table and every function
--          for role 'client' except an allow-list;
--       2. the 44 "any signed-in non-crew user" policies now also exclude 'client'.
--     Neither changes anything for Mike or the crew.

-- 1. Which emails may sign in to which contact portal
alter table public.siteline_contact_portals add column if not exists contact_emails text[] not null default '{}';

-- 2. Self sign-up: only known client emails, and they're stamped role = 'client'.
--    Users Mike creates himself (crew etc.) already carry a role and are left alone.
create or replace function public.client_signup_gate()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(new.raw_app_meta_data->>'role', '') <> '' then
    return new;                                   -- created by Mike / an admin with a role
  end if;
  if not exists (
       select 1 from public.siteline_contact_portals p
        where p.active and lower(new.email) = any (select lower(e) from unnest(p.contact_emails) e)) then
    raise exception 'not_a_client' using errcode = 'P0001';
  end if;
  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'client');
  return new;
end $$;
-- Mike's own account already exists, so every new user with no role is a self sign-up.
drop trigger if exists client_signup_gate on auth.users;
create trigger client_signup_gate before insert on auth.users
  for each row execute function public.client_signup_gate();

-- 3. The one thing a signed-in client can ask for: their portal
create or replace function public.client_portal_token()
returns jsonb language plpgsql security definer stable set search_path to 'public' as $$
declare v_email text := lower(coalesce(auth.jwt()->>'email', ''));
        v_role text := coalesce(auth.jwt()->'app_metadata'->>'role', '');
        v_tok text;
begin
  if v_role <> 'client' or v_email = '' then return jsonb_build_object('ok', false, 'error', 'not_client'); end if;
  if not exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then
    return jsonb_build_object('ok', false, 'error', 'unconfirmed');
  end if;
  select p.token into v_tok from public.siteline_contact_portals p
   where p.active and v_email = any (select lower(e) from unnest(p.contact_emails) e)
   order by p.created_at limit 1;
  if v_tok is null then return jsonb_build_object('ok', false, 'error', 'no_portal'); end if;
  return jsonb_build_object('ok', true, 'token', v_tok);
end $$;
revoke all on function public.client_portal_token() from public;
grant execute on function public.client_portal_token() to authenticated;

-- 4. Wall 1: request guard. Role 'client' may only call client_portal_token and the public_* link functions.
create or replace function public.client_request_guard()
returns void language plpgsql stable as $$
declare v_path text := coalesce(current_setting('request.path', true), '');
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role', '') <> 'client' then
    return;
  end if;
  -- the portal itself, plus the token-checked public_* functions every client link already uses
  -- (proposal signing, punch lists, SiteLine pages) so a signed-in client can still use them
  if v_path = '/rpc/client_portal_token' or starts_with(v_path, '/rpc/public_') then
    return;
  end if;
  raise exception 'not allowed' using errcode = '42501';
end $$;
grant execute on function public.client_request_guard() to anon, authenticated;
alter role authenticator set pgrst.db_pre_request = 'public.client_request_guard';
notify pgrst, 'reload config';

-- 5. Wall 2: the "any signed-in non-crew user" policies also exclude clients.
do $$
declare r record;
begin
  for r in select policyname, tablename, qual, with_check from pg_policies
            where schemaname = 'public' and qual like '%<> ''crew''::text%' loop
    execute format('alter policy %I on public.%I using (%s) with check (%s)', r.policyname, r.tablename,
      replace(r.qual, '<> ''crew''::text', 'not in (''crew''::text, ''client''::text)'),
      replace(coalesce(r.with_check, r.qual), '<> ''crew''::text', 'not in (''crew''::text, ''client''::text)'));
  end loop;
end $$;
