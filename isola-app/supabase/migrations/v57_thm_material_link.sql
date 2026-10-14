-- v57 (applied 2026-10-14 as v57_thm_material_link, v57b_thm_submit_functions, v57c_thm_pending_not_a_cost)
-- Tyler's private materials link: /thm-submit/<token>. He picks an Isola-held job THM is on,
-- enters what he paid (+ receipt). Lands as status 'submitted' (kind 'other', category 'material');
-- not a job cost and not on the running tab until Mike approves it.

alter table public.thm_job_items add column if not exists category text;
alter table public.thm_job_items add column if not exists status text not null default 'approved' check (status in ('submitted','approved'));
alter table public.thm_job_items add column if not exists vendor text;
alter table public.thm_job_items add column if not exists receipt_b64 text;
alter table public.thm_job_items add column if not exists receipt_mime text;
alter table public.thm_job_items add column if not exists submitted_by text;

create table if not exists public.thm_submit_links (
  token text primary key, label text default 'Tyler', active boolean not null default true,
  created_at timestamptz default now(), last_used_at timestamptz
);
alter table public.thm_submit_links enable row level security;
create policy owner_only on public.thm_submit_links for all to authenticated
  using ((select is_owner())) with check ((select is_owner()));

-- thm_submit_jobs(p_token) and thm_submit(p_token, p_job_id, p_amount, p_date, p_vendor, p_what,
-- p_receipt_b64, p_receipt_mime, p_name): security definer, token-checked, granted to anon.
-- See the live definitions in the database (pg_get_functiondef).

-- submitted lines never sit in job_costs (fires after trg_thm_item_sync)
create function public.thm_item_pending_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' then delete from job_costs where thm_item_id = new.id; end if;
  return new;
end $$;
create trigger trg_thm_item_sync_zz_pending after insert or update on public.thm_job_items
  for each row execute function public.thm_item_pending_guard();
