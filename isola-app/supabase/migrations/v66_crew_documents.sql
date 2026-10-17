-- v66 (10/17/26): Crew documents (W-9 first). Every crew login gets a Docs tab to upload
-- their own W-9 (photo or PDF). A W-9 carries an SSN/EIN, so:
--   * the table is owner-only under RLS (no crew, no THM partner, no anon access);
--   * crew reach it ONLY through the security-definer crew_doc_* functions below, which are
--     scoped to the signed-in login's own worker_id (crew_ctx) - nobody can list or open
--     anyone else's file;
--   * the owner (Mike) sees every file on Crew & time -> "Crew documents".
create table if not exists public.crew_documents (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  kind text not null default 'w9' check (kind in ('w9', 'other')),
  file_name text,
  mime text not null,
  file_b64 text not null,
  size_bytes integer,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);
create index if not exists crew_documents_worker_idx on public.crew_documents (worker_id, uploaded_at desc);

alter table public.crew_documents enable row level security;
drop policy if exists owner_all on public.crew_documents;
create policy owner_all on public.crew_documents for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
revoke all on public.crew_documents from anon;

-- Own documents, metadata only (never the file body in a list).
create or replace function public.crew_doc_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.crew_ctx();
  if c.role is null or c.worker_id is null then raise exception 'not allowed'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'file_name', d.file_name, 'mime', d.mime,
             'size', d.size_bytes, 'uploaded_at', d.uploaded_at) order by d.uploaded_at desc)
      from public.crew_documents d where d.worker_id = c.worker_id), '[]'::jsonb);
end $$;

-- Upload one of your own documents. p_b64 is a data: URL (image/* or application/pdf), max ~10 MB.
create or replace function public.crew_doc_upload(p_kind text, p_name text, p_mime text, p_b64 text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; v_id uuid; v_size int;
begin
  select * into c from public.crew_ctx();
  if c.role is null or c.worker_id is null then raise exception 'not allowed'; end if;
  if coalesce(p_kind, '') not in ('w9', 'other') then return jsonb_build_object('ok', false, 'error', 'Unknown document type.'); end if;
  if p_mime is null or not (p_mime like 'image/%' or p_mime = 'application/pdf') then
    return jsonb_build_object('ok', false, 'error', 'Upload a photo or a PDF.');
  end if;
  if p_b64 is null or length(p_b64) < 100 then return jsonb_build_object('ok', false, 'error', 'That file is empty.'); end if;
  if length(p_b64) > 14000000 then return jsonb_build_object('ok', false, 'error', 'That file is too big (10 MB max). Try a photo instead.'); end if;
  v_size := (length(p_b64) * 3 / 4)::int;
  insert into public.crew_documents (worker_id, kind, file_name, mime, file_b64, size_bytes, uploaded_by)
  values (c.worker_id, p_kind, left(coalesce(nullif(btrim(p_name), ''), 'W-9'), 120), p_mime, p_b64, v_size, c.name)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Open one of your own documents (the owner can open any).
create or replace function public.crew_doc_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c record; d record;
begin
  select * into c from public.crew_ctx();
  if c.role is null then raise exception 'not allowed'; end if;
  select * into d from public.crew_documents where id = p_id;
  if d.id is null or not (d.worker_id = c.worker_id or public.is_owner()) then raise exception 'not allowed'; end if;
  return jsonb_build_object('file_name', d.file_name, 'mime', d.mime, 'b64', d.file_b64);
end $$;

-- Remove one of your own documents (e.g. uploaded the wrong page). Owner can remove any.
create or replace function public.crew_doc_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; n int;
begin
  select * into c from public.crew_ctx();
  if c.role is null then raise exception 'not allowed'; end if;
  delete from public.crew_documents where id = p_id and (worker_id = c.worker_id or public.is_owner());
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end $$;

revoke all on function public.crew_doc_list() from public, anon;
revoke all on function public.crew_doc_upload(text, text, text, text) from public, anon;
revoke all on function public.crew_doc_get(uuid) from public, anon;
revoke all on function public.crew_doc_delete(uuid) from public, anon;
grant execute on function public.crew_doc_list() to authenticated;
grant execute on function public.crew_doc_upload(text, text, text, text) to authenticated;
grant execute on function public.crew_doc_get(uuid) to authenticated;
grant execute on function public.crew_doc_delete(uuid) to authenticated;
