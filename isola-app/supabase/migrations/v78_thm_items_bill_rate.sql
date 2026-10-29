-- v78 (10/29/26): THM lines on a T&M job can be billed to the customer.
-- thm_job_items.bill_rate (null = cost only). The sync trigger writes qty x bill_rate to
-- job_costs.bill_amount; the T&M bill shows those lines under "Machine & equipment".
alter table public.thm_job_items add column if not exists bill_rate numeric;
-- thm_item_sync_cost() replaced to also upsert bill_amount (applied via MCP as v78_thm_items_bill_rate).
