-- v56: Build tab — time & material pricing (already applied to xkgfekvgftithakacldr 2026-10-14)
alter table public.estimates add column if not exists pricing_mode text not null default 'fixed' check (pricing_mode in ('fixed','tm'));
alter table public.estimate_lines add column if not exists bill_rate numeric;
