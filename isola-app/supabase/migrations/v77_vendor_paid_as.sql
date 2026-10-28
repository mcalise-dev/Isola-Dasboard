-- v77: link crew payee names to a vendor record so the year-end W-9 list
-- can total what each sub was paid (crew_payments.worker -> vendors.paid_as).
alter table public.vendors add column if not exists paid_as text[] not null default '{}';
