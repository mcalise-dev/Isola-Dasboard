-- v77 (10/28/26): Material vendors phone book (yards, quarries, rental counters, supply houses).
-- Separate from public.vendors (subs + COI/W-9). Owner only. Shown under Projects > Material vendors
-- and from the Vendors tile on each job page.
create table if not exists public.material_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  phone2 text,
  contact text,
  address text,
  carries text,
  hours text,
  notes text,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.material_vendors enable row level security;
create policy owner_only on public.material_vendors for all to authenticated
  using ((select is_owner())) with check ((select is_owner()));
