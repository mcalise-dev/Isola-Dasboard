-- v94 (11/24/26): photos shown right on the client's SiteLine / portal page, under each
-- proposal or change order, not only inside the PDF. Bearer access is the proposal token,
-- the same secret that already opens /p/<token> and its PDF. The table itself is closed
-- (RLS on, no policies): the dashboard writes with the service role, clients read only
-- through public_proposal_photos.
create table if not exists public.proposal_photos (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposal_links(id) on delete cascade,
  sort int not null default 0,
  caption text,
  src_b64 text not null,
  created_at timestamptz not null default now()
);
create index if not exists proposal_photos_proposal_idx on public.proposal_photos (proposal_id, sort);
alter table public.proposal_photos enable row level security;
revoke all on public.proposal_photos from anon, authenticated;

create or replace function public.public_proposal_photos(p_token text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('caption', ph.caption, 'src', ph.src_b64)
                            order by ph.sort, ph.created_at), '[]'::jsonb)
    from proposal_links pl
    join proposal_photos ph on ph.proposal_id = pl.id
   where pl.token = p_token
     and coalesce(pl.status, '') <> 'draft';
$$;
grant execute on function public.public_proposal_photos(text) to anon, authenticated;
