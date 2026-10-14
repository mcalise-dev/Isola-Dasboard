-- v59 (applied 2026-10-14): Tyler's crew login gets a Receipts tab (/field/receipts).
-- workers.is_thm marks the THM partner; crew_thm_* RPCs check it and delegate to the
-- same token-checked thm_submit_jobs / thm_submit used by the texted link.
alter table public.workers add column if not exists is_thm boolean not null default false;
-- crew_is_thm(), crew_thm_token(), crew_thm_jobs(), crew_thm_submit(...), crew_thm_mine():
-- security definer, granted to authenticated — see live definitions (pg_get_functiondef).
update public.workers set is_thm = true where name = 'Tyler';
