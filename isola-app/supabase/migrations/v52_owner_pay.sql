-- v52: owner pay — Mike's days on each job + the overhead model behind "What you're making per day".
-- Applied 2026-10-10.
alter table public.jobs add column if not exists mike_days numeric;          -- Mike's own days on site (0.5 = half day)
alter table public.jobs add column if not exists mike_days_est boolean default false; -- true = estimated from crew time, not entered by Mike

-- Overhead + target live in app_settings as JSON (lib/pay.ts reads/writes it; editable on Money → My pay).
insert into public.app_settings(key, value, updated_at) values ('pay_model',
  '{"owner_day_target":500,"work_days_per_month":16,"overhead":[{"label":"Truck payment","monthly":700},{"label":"Fuel","monthly":550},{"label":"Dump trailer payment","monthly":200},{"label":"QuickBooks / software / misc","monthly":200},{"label":"Business insurance","monthly":197}]}',
  now())
on conflict (key) do nothing;
