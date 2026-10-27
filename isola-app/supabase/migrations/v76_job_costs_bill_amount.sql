-- v76 (10/27/26): Isola's own truck/equipment time billed to the customer.
-- When bill_amount is set the line is billable only: amount = 0 (no out-of-pocket cost)
-- and the T&M bill uses bill_amount with no markup.
alter table public.job_costs add column if not exists bill_amount numeric;
comment on column public.job_costs.bill_amount is 'Isola''s own truck/equipment time billed to the customer. When set, the line is billable only: amount = 0 (no out-of-pocket cost) and the T&M bill uses bill_amount with no markup.';
