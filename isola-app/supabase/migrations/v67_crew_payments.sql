-- v67: crew payment history.
--   crew_payments: one row per payout (check, cash, Venmo...) to a crew member / sub.
--   record_crew_payment(): owner records a payout; it marks that person's oldest unpaid
--     job_costs lines paid, splitting a line when the payment lands part-way through it.
--   crew_my_payments(): crew login sees their own payouts, paid work, and balance owed.

create table if not exists public.crew_payments (
  id uuid primary key default gen_random_uuid(),
  worker text not null,                 -- matches job_costs.worker / workers.name
  worker_id uuid references public.workers(id) on delete set null,
  paid_on date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  method text,                          -- Check, Cash, Venmo, Zelle...
  reference text,                       -- check # etc.
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists crew_payments_worker_idx on public.crew_payments (lower(worker), paid_on desc);

alter table public.crew_payments enable row level security;
drop policy if exists owner_all_crew_payments on public.crew_payments;
create policy owner_all_crew_payments on public.crew_payments
  for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

create or replace function public.record_crew_payment(
  p_worker text, p_amount numeric, p_paid_on date default current_date,
  p_method text default null, p_reference text default null, p_notes text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  left_amt numeric := round(p_amount, 2);
  r record; pid uuid; tag text; applied numeric := 0;
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  if coalesce(p_amount, 0) <= 0 or coalesce(btrim(p_worker), '') = '' then raise exception 'worker and amount required'; end if;
  insert into public.crew_payments (worker, worker_id, paid_on, amount, method, reference, notes)
  values (btrim(p_worker), (select id from public.workers where lower(btrim(name)) = lower(btrim(p_worker)) limit 1),
          coalesce(p_paid_on, current_date), round(p_amount, 2), nullif(btrim(p_method), ''), nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''))
  returning id into pid;
  tag := ' · PAID ' || to_char(coalesce(p_paid_on, current_date), 'MM/DD/YY')
         || coalesce(' ' || nullif(btrim(p_method), ''), '') || coalesce(' #' || nullif(btrim(p_reference), ''), '');
  for r in
    select id, amount from public.job_costs
     where paid = false and coalesce(amount, 0) > 0
       and lower(btrim(coalesce(worker, vendor, ''))) = lower(btrim(p_worker))
     order by entry_date nulls last, created_at
  loop
    exit when left_amt <= 0;
    if r.amount <= left_amt then
      update public.job_costs set paid = true, updated_at = now(), notes = coalesce(notes, '') || tag where id = r.id;
      left_amt := left_amt - r.amount; applied := applied + r.amount;
    else
      -- split: the unpaid remainder becomes its own line, this line is paid for what the payment covers
      insert into public.job_costs (job_id, entry_date, vendor, category, worker, hours, rate, rate_type, days, status, amount, notes, paid, by_claude)
      select job_id, entry_date, vendor, category, worker, null, null, rate_type, null, status, amount - left_amt,
             coalesce(notes, '') || ' · split: remainder still owed', false, by_claude
        from public.job_costs where id = r.id;
      update public.job_costs set amount = left_amt, paid = true, updated_at = now(),
             notes = coalesce(notes, '') || tag || ' (split)' where id = r.id;
      applied := applied + left_amt; left_amt := 0;
    end if;
  end loop;
  return jsonb_build_object('payment_id', pid, 'applied', applied, 'unapplied', left_amt);
end $$;

create or replace function public.crew_my_payments()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c record; wname text;
begin
  select * into c from public.crew_ctx();
  if c.role is null or c.worker_id is null then raise exception 'not allowed'; end if;
  select name into wname from public.workers where id = c.worker_id;
  return jsonb_build_object(
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
        'date', to_char(p.paid_on, 'Mon DD, YYYY'), 'amount', p.amount,
        'method', p.method, 'reference', p.reference) order by p.paid_on desc, p.created_at desc)
      from public.crew_payments p where lower(btrim(p.worker)) = lower(btrim(wname))), '[]'::jsonb),
    'paid_total', coalesce((select sum(amount) from public.crew_payments p where lower(btrim(p.worker)) = lower(btrim(wname))), 0),
    'paid_work', coalesce((select jsonb_agg(jsonb_build_object(
        'job', coalesce(nullif(btrim(j.job_name), ''), nullif(btrim(j.location), ''), 'NA'),
        'date', to_char(x.entry_date, 'Mon DD, YYYY'), 'amount', x.amount) order by x.entry_date desc)
      from public.job_costs x left join public.jobs j on j.id = x.job_id
      where x.paid and coalesce(x.amount, 0) > 0 and lower(btrim(coalesce(x.worker, ''))) = lower(btrim(wname))), '[]'::jsonb),
    'owed_total', coalesce((select sum(amount) from public.job_costs x
      where not x.paid and coalesce(x.amount, 0) > 0 and lower(btrim(coalesce(x.worker, ''))) = lower(btrim(wname))), 0)
  );
end $$;
revoke all on function public.crew_my_payments() from public, anon;
grant execute on function public.crew_my_payments() to authenticated;
revoke all on function public.record_crew_payment(text, numeric, date, text, text, text) from public, anon;
grant execute on function public.record_crew_payment(text, numeric, date, text, text, text) to authenticated;

-- backfill: Adam, check #321 to Clear Path Construction, 10/19/26 (lines were already marked paid by hand)
insert into public.crew_payments (worker, worker_id, paid_on, amount, method, reference, notes)
select 'Adam', (select id from public.workers where name = 'Adam' limit 1), '2026-10-19', 1000, 'Check', '321',
       'Payable to Clear Path Construction — partial on ~$4,525 owed'
where not exists (select 1 from public.crew_payments where worker = 'Adam' and reference = '321');
