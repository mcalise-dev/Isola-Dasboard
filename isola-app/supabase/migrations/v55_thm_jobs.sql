-- v55: THM on jobs (Mike, 10/14/26)
-- Every job says who holds the contract (Isola or THM), whether THM is on it, and the deal:
--   split     = 50/50 of net profit (THM share settled at closeout, as before)
--   reimburse = no profit split; whoever holds the contract pays the other back for truck,
--               machine and labor time (hours or days x a rate Mike plugs in).
-- Each reimbursement line lives in thm_job_items. Direction comes from the contract holder:
--   Isola holds -> Isola owes THM;  THM holds -> THM owes Isola.
-- On Isola-held jobs each line is mirrored into job_costs (category 'THM') so the job's
-- spent/margin is right. The THM tab reads thm_job_items for the running tab.

alter table public.jobs add column if not exists contract_holder text not null default 'isola';
alter table public.jobs add column if not exists thm_deal text;
alter table public.jobs drop constraint if exists jobs_contract_holder_check;
alter table public.jobs add constraint jobs_contract_holder_check check (contract_holder in ('isola','thm'));
alter table public.jobs drop constraint if exists jobs_thm_deal_check;
alter table public.jobs add constraint jobs_thm_deal_check check (thm_deal is null or thm_deal in ('split','reimburse'));

-- jobs already marked with THM keep the old 50/50 deal
update public.jobs set thm_deal = 'split' where partner = 'THM' and thm_deal is null;

create table if not exists public.thm_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind text not null check (kind in ('truck','machine','labor','other')),
  label text,
  unit text not null default 'hours' check (unit in ('hours','days','flat')),
  qty numeric not null default 1,
  rate numeric not null default 0,
  amount numeric generated always as (round(qty * rate, 2)) stored,
  entry_date date default ((now() at time zone 'America/New_York')::date),
  notes text,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists thm_job_items_job_idx on public.thm_job_items (job_id, sort, created_at);

alter table public.thm_job_items enable row level security;
drop policy if exists owner_only on public.thm_job_items;
create policy owner_only on public.thm_job_items for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

alter table public.job_costs add column if not exists thm_item_id uuid unique references public.thm_job_items(id) on delete cascade;

create or replace function public.thm_item_label(i public.thm_job_items)
returns text language sql immutable as $$
  select 'THM ' || case i.kind when 'truck' then 'truck' when 'machine' then 'machine' when 'labor' then 'labor' else 'other' end
    || coalesce(' (' || nullif(btrim(i.label), '') || ')', '')
    || case when i.unit = 'flat' then '' else ': ' || trim(to_char(i.qty, 'FM999990.##')) || ' ' || i.unit
         || ' @ $' || trim(to_char(i.rate, 'FM999990.00')) end;
$$;

-- keep the job's costs in step with the THM lines on Isola-held jobs
create or replace function public.thm_item_sync_cost()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare holder text;
begin
  if tg_op = 'DELETE' then
    delete from job_costs where thm_item_id = old.id;
    return old;
  end if;
  select contract_holder into holder from jobs where id = new.job_id;
  if holder = 'isola' then
    insert into job_costs (job_id, entry_date, vendor, category, amount, notes, paid, thm_item_id)
    values (new.job_id, coalesce(new.entry_date, current_date), 'THM', 'THM', new.amount,
            public.thm_item_label(new) || coalesce(' · ' || nullif(btrim(new.notes), ''), ''), true, new.id)
    on conflict (thm_item_id) do update set
      job_id = excluded.job_id, entry_date = excluded.entry_date, amount = excluded.amount,
      notes = excluded.notes, updated_at = now();
  else
    delete from job_costs where thm_item_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_thm_item_sync on public.thm_job_items;
create trigger trg_thm_item_sync after insert or update or delete on public.thm_job_items
  for each row execute function public.thm_item_sync_cost();

-- flipping a job's contract holder re-syncs its THM lines
create or replace function public.thm_job_holder_resync()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.contract_holder is distinct from old.contract_holder then
    update thm_job_items set updated_at = now() where job_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_thm_job_holder on public.jobs;
create trigger trg_thm_job_holder after update of contract_holder on public.jobs
  for each row execute function public.thm_job_holder_resync();
