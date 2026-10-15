-- v63: labor can be logged per day as well as per hour.
-- Day entries: rate_type='daily', days = number of days, hours = null, amount = days x day rate.
alter table public.job_costs
  add column if not exists rate_type text not null default 'hourly' check (rate_type in ('hourly','daily')),
  add column if not exists days numeric;
