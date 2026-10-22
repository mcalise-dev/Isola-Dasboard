-- v72 (10/22/26): plan steps can carry a time of day (concrete truck 9:00, inspection 1:30).
-- Applied to production 10/22/26.
alter table public.job_checklist add column if not exists work_time time;

-- crew_job(): checklist rows now include work_time ("HH24:MI")
do $do$
declare def text;
begin
  def := pg_get_functiondef('public.crew_job(uuid)'::regprocedure);
  if position('''work_time''' in def) = 0 then
    def := replace(def, $r$'work_date', k.work_date, 'assignee', k.assignee)$r$,
                        $r$'work_date', k.work_date, 'work_time', to_char(k.work_time, 'HH24:MI'), 'assignee', k.assignee)$r$);
    execute def;
  end if;
end $do$;
