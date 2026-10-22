-- v68 (10/22/26): cash flow, monthly review, estimate-vs-actual, change-order billing
-- Applied to production 10/22/26.

-- per-job estimated cost entered by hand (jobs priced outside the Build tab)
alter table public.jobs add column if not exists est_breakdown jsonb;   -- optional {Labor, Materials, ...}
-- change orders: has it made it onto an invoice yet?
alter table public.change_orders add column if not exists billed boolean not null default false;
alter table public.change_orders add column if not exists billed_at date;
-- 13-week cash flow settings (bank balance, pipeline weighting, manual in/out items)
insert into public.app_settings(key, value) values ('cash_flow', '{"starting_cash":null,"as_of":null,"pipeline_pct":0,"items":[]}')
on conflict (key) do nothing;

-- job_financials.estimated_cost: the Build estimate when there is one, else jobs.est_costs
create or replace view public.job_financials with (security_invoker = true) as
 SELECT j.id AS job_id, j.job_name, j.customer, j.customer_id, j.job AS work_type, j.status, j.completed_date,
    COALESCE(j.price_amount, 0::numeric) AS contract_base,
    COALESCE(co.approved_total, 0::numeric) AS change_orders,
    COALESCE(j.price_amount, 0::numeric) + COALESCE(co.approved_total, 0::numeric) AS contract_total,
    COALESCE(c.cost_total, 0::numeric) AS actual_cost,
    COALESCE(p.paid_total, 0::numeric) AS paid_to_date,
    COALESCE(j.price_amount, 0::numeric) + COALESCE(co.approved_total, 0::numeric) - COALESCE(p.paid_total, 0::numeric) AS balance_due,
    COALESCE(j.price_amount, 0::numeric) + COALESCE(co.approved_total, 0::numeric) - COALESCE(c.cost_total, 0::numeric) AS net_profit,
    CASE WHEN (COALESCE(j.price_amount, 0::numeric) + COALESCE(co.approved_total, 0::numeric)) > 0::numeric
      THEN round((COALESCE(j.price_amount, 0::numeric) + COALESCE(co.approved_total, 0::numeric) - COALESCE(c.cost_total, 0::numeric)) / (COALESCE(j.price_amount, 0::numeric) + COALESCE(co.approved_total, 0::numeric)) * 100::numeric, 1)
      ELSE NULL::numeric END AS margin_pct,
    COALESCE(e.estimated_cost, j.est_costs) AS estimated_cost,
    CASE WHEN COALESCE(e.estimated_cost, j.est_costs) > 0::numeric
      THEN round((COALESCE(c.cost_total, 0::numeric) - COALESCE(e.estimated_cost, j.est_costs)) / COALESCE(e.estimated_cost, j.est_costs) * 100::numeric, 1)
      ELSE NULL::numeric END AS cost_variance_pct,
    co.open_count AS open_change_orders,
    pl.open_punch AS open_punch_items,
    j.qbo_invoice_ref, j.invoiced_date, j.partner,
    COALESCE(j.partner_share, 0::numeric) AS partner_share,
    COALESCE(j.price_amount, 0::numeric) + COALESCE(co.approved_total, 0::numeric) - COALESCE(c.cost_total, 0::numeric) - COALESCE(j.partner_share, 0::numeric) AS net_to_isola
   FROM jobs j
     LEFT JOIN ( SELECT job_id, sum(amount) FILTER (WHERE status = 'approved') AS approved_total,
            count(*) FILTER (WHERE status = ANY (ARRAY['draft','sent'])) AS open_count
           FROM change_orders GROUP BY job_id) co ON co.job_id = j.id
     LEFT JOIN ( SELECT job_id, sum(amount) AS cost_total FROM job_costs GROUP BY job_id) c ON c.job_id = j.id
     LEFT JOIN ( SELECT job_id, sum(amount) AS paid_total FROM payments GROUP BY job_id) p ON p.job_id = j.id
     LEFT JOIN ( SELECT job_id, max(cost_total) AS estimated_cost FROM estimates WHERE job_id IS NOT NULL GROUP BY job_id) e ON e.job_id = j.id
     LEFT JOIN ( SELECT job_id, count(*) AS open_punch FROM punch_list WHERE NOT done GROUP BY job_id) pl ON pl.job_id = j.id;
