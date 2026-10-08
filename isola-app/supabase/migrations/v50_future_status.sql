-- v50 (10/8/26): "Future" job status — warm work that got pushed back or isn't ready yet.
-- Applied to production xkgfekvgftithakacldr on 2026-10-08.
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status = any (array['lead','awaiting','booked','progress','future','complete','lost']));
