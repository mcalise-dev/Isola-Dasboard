-- v58 (applied 2026-10-14): THM-held jobs count only Mike's cut as Isola revenue.
alter table public.jobs add column if not exists isola_cut numeric;
comment on column public.jobs.isola_cut is 'THM-held jobs only: what Isola keeps (set at closeout). This, not the contract price, is Isola revenue.';
