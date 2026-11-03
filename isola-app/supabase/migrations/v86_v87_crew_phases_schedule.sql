-- v86 (11/3/26): crew_job() returns 'phases' (name, dates, status, crew, mine, items: kind/who/what/date/status,
-- pickup address for material & rental — never costs). crew_visits() returns 'phase' for the phase covering
-- that day. Both were patched in place (pg_get_functiondef + replace) — see Supabase migrations
-- v86_crew_job_phases and v86b_crew_visits_phase for the exact blocks.
--
-- v87 (11/3/26): rentals & equipment from the phase plan land on the Schedule as item_type 'equipment'.
alter table public.schedule_entries add column if not exists phase_item_id uuid references public.job_phase_vendors(id) on delete cascade;
create unique index if not exists schedule_entries_phase_item_uidx on public.schedule_entries (phase_item_id) where phase_item_id is not null;

create or replace function public.sync_phase_item_schedule() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; st text; lbl text;
begin
  if tg_op = 'DELETE' then
    delete from public.schedule_entries where phase_item_id = old.id;
    return old;
  end if;
  if new.kind not in ('rental','equipment') or new.needed_date is null then
    delete from public.schedule_entries where phase_item_id = new.id;
    return new;
  end if;
  select coalesce(mv.name, v.company, new.name) into who
    from (select 1) x left join public.material_vendors mv on mv.id = new.material_vendor_id left join public.vendors v on v.id = new.vendor_id;
  st := case when coalesce(nullif(new.status,'')::text,'0') ~ '^[0-9]+$' then
          case when new.status::int >= 3 then 'done' when new.status::int >= 1 then 'confirmed' else 'scheduled' end
        else 'scheduled' end;
  lbl := coalesce(nullif(new.what,''), case when new.kind = 'rental' then 'Rental' else 'Equipment' end)
         || case when new.kind = 'rental' then ' (rental)' else '' end;
  if exists (select 1 from public.schedule_entries where phase_item_id = new.id) then
    update public.schedule_entries set entry_date = new.needed_date, job_id = new.job_id, item_type = 'equipment', label = lbl,
      company = who, vendor_id = new.vendor_id, status = st, notes = new.notes, updated_at = now()
     where phase_item_id = new.id;
  else
    insert into public.schedule_entries (entry_date, job_id, item_type, label, company, vendor_id, status, notes, phase_item_id)
    values (new.needed_date, new.job_id, 'equipment', lbl, who, new.vendor_id, st, new.notes, new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_phase_item_schedule on public.job_phase_vendors;
create trigger trg_phase_item_schedule after insert or update or delete on public.job_phase_vendors
  for each row execute function public.sync_phase_item_schedule();
