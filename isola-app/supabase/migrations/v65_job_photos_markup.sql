-- v65 (10/16/26): Photo markup. A marked-up photo is its own job_photos row that keeps the
-- drawing (markup jsonb: {v,w,h,shapes}) and points back at the untouched original.
alter table public.job_photos add column if not exists markup jsonb;
alter table public.job_photos add column if not exists source_photo_id uuid references public.job_photos(id) on delete set null;
