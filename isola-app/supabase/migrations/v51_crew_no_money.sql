-- v51: crew never sees money other than their own pay.
-- Scope and schedule notes were already filtered (crew_safe_text). This closes the
-- remaining free-text fields the crew app shows: Mike's crew notes, material/tool
-- notes, punch items, crew-visible tasks, checklist labels, photo captions and
-- schedule labels. Dollar amounts and rates are stripped; multi-line notes also
-- drop any line that talks about price/cost/invoice/etc.
-- Crew's own pay (crew_balance_owed / crew_owed / crew_punch_out) is unchanged.

create or replace function public.crew_strip_money(p text)
returns text language sql immutable set search_path to 'public' as $$
  select nullif(btrim(regexp_replace(
    regexp_replace(coalesce(p, ''),
      '\$\s*[0-9][0-9,]*(\.[0-9]+)?\s*[kK]?(\s*(/|per)\s*(hr|hour|day|yd|yard|sf|sq\.? ?ft|ton|ea|each|lf|ft)\.?)?', '', 'gi'),
    '\s{2,}', ' ', 'g')), '');
$$;

-- multi-line notes: drop money lines, then strip any stray amounts
create or replace function public.crew_clean(p text)
returns text language sql immutable set search_path to 'public' as $$
  select public.crew_strip_money(public.crew_safe_text(p));
$$;

create or replace function public.crew_job(p_job uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare c record; r jsonb;
begin
  select * into c from public.crew_ctx();
  if c.role is null or not public.crew_allowed_job(p_job) then raise exception 'not allowed'; end if;
  select jsonb_build_object(
    'job', jsonb_build_object('id', j.id, 'job_name', coalesce(j.job_name, j.customer), 'customer', j.customer,
            'location', j.location, 'work_type', j.job, 'status', j.status, 'contact_name', j.contact_name,
            'contact_phone', j.contact_phone, 'scope', public.crew_clean(j.scope_of_work), 'start_date', j.start_date,
            'crew_notes', public.crew_clean(j.crew_notes)),
    'crew', (select coalesce(jsonb_agg(w.name order by w.name), '[]'::jsonb) from public.job_crew jc join public.workers w on w.id = jc.worker_id where jc.job_id = j.id),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('date', s.entry_date, 'assignee', coalesce(array_to_string(s.assignees, ', '), s.assignee), 'notes', public.crew_clean(s.notes)) order by s.entry_date), '[]'::jsonb)
             from public.schedule_entries s where s.job_id = j.id and s.entry_date >= current_date - 14),
    'materials', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'item', coalesce(public.crew_strip_money(n.item), 'Material'), 'qty', public.crew_strip_money(n.qty::text), 'notes', public.crew_clean(n.notes)) order by n.sort nulls last, n.created_at), '[]'::jsonb)
             from public.job_needs n where n.job_id = j.id and n.kind = 'material'),
    'tools', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'item', coalesce(public.crew_strip_money(n.item), 'Tool'), 'qty', public.crew_strip_money(n.qty::text), 'notes', public.crew_clean(n.notes)) order by n.sort nulls last, n.created_at), '[]'::jsonb)
             from public.job_needs n where n.job_id = j.id and n.kind = 'tool'),
    'checklist', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'label', coalesce(public.crew_strip_money(k.label), 'Item'), 'done', k.done, 'done_by', k.done_by, 'done_at', k.done_at, 'added_by', k.added_by) order by k.sort nulls last, k.created_at), '[]'::jsonb)
              from public.job_checklist k where k.job_id = j.id),
    'punch', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'item', coalesce(public.crew_strip_money(p.item), 'Item'), 'done', p.done, 'due_date', p.due_date, 'priority', p.priority, 'notes', public.crew_clean(p.notes)) order by p.done, p.created_at), '[]'::jsonb)
              from public.punch_list p where p.job_id = j.id),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', coalesce(public.crew_strip_money(t.title), 'Task'), 'done', t.done, 'due_date', t.due_date) order by t.done, t.created_at), '[]'::jsonb)
              from public.tasks t where t.job_id = j.id and t.crew_visible),
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('id', ph.id, 'phase', ph.phase, 'caption', public.crew_clean(ph.caption), 'photo', ph.photo_b64) order by ph.created_at), '[]'::jsonb)
               from public.job_photos ph where ph.job_id = j.id)
  ) into r
  from public.jobs j where j.id = p_job;
  return r;
end $function$;

create or replace function public.crew_todo()
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare c record;
begin
  select * into c from public.crew_ctx();
  if c.role is null then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'checklist', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'label', coalesce(public.crew_strip_money(k.label), 'Item'), 'done', k.done,
                'job_id', k.job_id, 'job_name', coalesce(j.job_name, j.customer)) order by coalesce(j.job_name, j.customer), k.sort nulls last, k.created_at), '[]'::jsonb)
              from public.job_checklist k join public.jobs j on j.id = k.job_id
              where not k.done and j.status not in ('complete','lead') and public.crew_allowed_job(k.job_id)
                and (public.crew_assigned(k.job_id, c.name, current_date, current_date + 7)
                     or exists (select 1 from public.job_crew jc where jc.job_id = k.job_id and jc.worker_id = c.worker_id))),
    'punch', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'item', coalesce(public.crew_strip_money(p.item), 'Item'), 'due_date', p.due_date, 'priority', p.priority,
                'job_id', p.job_id, 'job_name', coalesce(j.job_name, j.customer)) order by p.due_date nulls last, p.created_at), '[]'::jsonb)
              from public.punch_list p join public.jobs j on j.id = p.job_id
              where not p.done and public.crew_allowed_job(p.job_id)),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', coalesce(public.crew_strip_money(t.title), 'Task'), 'due_date', t.due_date,
                'job_id', t.job_id, 'job_name', coalesce(j.job_name, j.customer)) order by t.due_date nulls last, t.created_at), '[]'::jsonb)
              from public.tasks t join public.jobs j on j.id = t.job_id
              where not t.done and t.crew_visible and public.crew_allowed_job(t.job_id))
  );
end $function$;

create or replace function public.crew_schedule(p_from date, p_to date)
 returns table(entry_id uuid, entry_date date, job_id uuid, job_name text, customer text, location text, work_type text, label text, notes text, assignee text, mine boolean)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare c record;
begin
  select * into c from public.crew_ctx();
  if c.role is null then raise exception 'not allowed'; end if;
  if p_to - p_from > 62 then p_to := p_from + 62; end if;
  return query
    select s.id, s.entry_date, s.job_id, coalesce(j.job_name, j.customer), j.customer, j.location, j.job,
           public.crew_strip_money(s.label), public.crew_clean(s.notes), coalesce(array_to_string(s.assignees, ', '), s.assignee),
           (c.name is not null and (c.name = any(coalesce(s.assignees,'{}')) or s.assignee ilike '%' || c.name || '%'
             or exists (select 1 from public.job_crew jc where jc.job_id = s.job_id and jc.worker_id = c.worker_id)))
    from public.schedule_entries s
    left join public.jobs j on j.id = s.job_id
    where s.entry_date between p_from and p_to
    order by s.entry_date, s.sort nulls last, s.created_at;
end $function$;
