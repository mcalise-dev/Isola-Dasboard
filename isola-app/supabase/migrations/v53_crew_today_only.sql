-- v53: crew Today screen cleanup (Mike, 10/10/26)
-- 1. Completed (and lead) jobs drop off the crew punch list and tasks — only live jobs show.
-- 2. The checklist only shows for the job(s) the crew member is on the schedule for TODAY
--    (named on the day's entry, or on the job's crew with the job on the board today).
--    "Today" is Eastern time, not the database's UTC date.

create or replace function public.crew_today()
returns date language sql stable set search_path to 'public' as $$
  select (now() at time zone 'America/New_York')::date;
$$;

create or replace function public.crew_todo()
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare c record; d date := public.crew_today();
begin
  select * into c from public.crew_ctx();
  if c.role is null then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'checklist', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'label', coalesce(public.crew_strip_money(k.label), 'Item'), 'done', k.done,
                'job_id', k.job_id, 'job_name', coalesce(j.job_name, j.customer)) order by coalesce(j.job_name, j.customer), k.sort nulls last, k.created_at), '[]'::jsonb)
              from public.job_checklist k join public.jobs j on j.id = k.job_id
              where not k.done and j.status not in ('complete','lead') and public.crew_allowed_job(k.job_id)
                and (public.crew_assigned(k.job_id, c.name, d, d)
                     or (exists (select 1 from public.job_crew jc where jc.job_id = k.job_id and jc.worker_id = c.worker_id)
                         and exists (select 1 from public.schedule_entries s where s.job_id = k.job_id and s.entry_date = d)))),
    'punch', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'item', coalesce(public.crew_strip_money(p.item), 'Item'), 'due_date', p.due_date, 'priority', p.priority,
                'job_id', p.job_id, 'job_name', coalesce(j.job_name, j.customer)) order by p.due_date nulls last, p.created_at), '[]'::jsonb)
              from public.punch_list p join public.jobs j on j.id = p.job_id
              where not p.done and j.status not in ('complete','lead') and public.crew_allowed_job(p.job_id)),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', coalesce(public.crew_strip_money(t.title), 'Task'), 'due_date', t.due_date,
                'job_id', t.job_id, 'job_name', coalesce(j.job_name, j.customer)) order by t.due_date nulls last, t.created_at), '[]'::jsonb)
              from public.tasks t join public.jobs j on j.id = t.job_id
              where not t.done and t.crew_visible and j.status not in ('complete','lead') and public.crew_allowed_job(t.job_id))
  );
end $function$;
