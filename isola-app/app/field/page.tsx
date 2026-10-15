"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Navigation, Timer, MapPin, ChevronRight, ListChecks, Package, Wrench, Users } from "lucide-react";
import { CheckRow, Empty, H, iso, addDays, dayLabel } from "@/components/field/shared";
import { showError } from "@/components/Toaster";
import { Ring } from "@/components/field/jobkit";
import { cn } from "@/lib/utils";

// v5.6 crew Today, Jobber/ServiceTitan style: each scheduled day on a job is a "visit".
// Today's visits on top (what we're doing, what to load), then what's coming up, then punch list / tasks.
type Visit = {
  date: string; job_id: string; job_name: string; location: string | null; work_type: string | null; crew: string | null; mine: boolean; notes: string | null;
  steps_total: number; steps_done: number; mats_total: number; mats_got: number; tools_total: number; tools_got: number; day_no: number; day_count: number;
};

export default function FieldToday() {
  const supabase = useMemo(() => createClient(), []);
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [mine, setMine] = useState<any[] | null>(null);
  const [todo, setTodo] = useState<{ punch: any[]; tasks: any[] }>({ punch: [], tasks: [] });
  const today = iso(new Date());
  const horizon = iso(addDays(new Date(), 14));

  async function load() {
    const [v, t, m] = await Promise.all([
      supabase.rpc("crew_visits", { p_from: today, p_to: horizon }),
      supabase.rpc("crew_todo"),
      supabase.rpc("crew_my_jobs"),
    ]);
    if (v.error) showError("Couldn't load your visits: " + v.error.message);
    setVisits((v.data as Visit[]) ?? []);
    setMine((m.data as any[]) ?? []);
    const td: any = t.data ?? {};
    setTodo({ punch: td.punch ?? [], tasks: td.tasks ?? [] });
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function setPunch(id: string, done: boolean) {
    setTodo((x) => ({ ...x, punch: x.punch.map((p) => (p.id === id ? { ...p, done } : p)) }));
    const { error } = await supabase.rpc("crew_set_punch", { p_id: id, p_done: done });
    if (error) { showError("Couldn't save: " + error.message); load(); }
  }
  async function setTask(id: string, done: boolean) {
    setTodo((x) => ({ ...x, tasks: x.tasks.map((p) => (p.id === id ? { ...p, done } : p)) }));
    const { error } = await supabase.rpc("crew_set_task", { p_id: id, p_done: done });
    if (error) { showError("Couldn't save: " + error.message); load(); }
  }

  const todays = (visits ?? []).filter((v) => v.date === today);
  const upcoming = (visits ?? []).filter((v) => v.date > today);
  const nextDate = upcoming[0]?.date;
  const nextUp = upcoming.filter((v) => v.date === nextDate);
  const later = upcoming.filter((v) => v.date !== nextDate);

  const addrs = todays.filter((s) => s.location).map((s) => s.location as string);
  const route = addrs.length ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addrs[addrs.length - 1])}${addrs.length > 1 ? `&waypoints=${encodeURIComponent(addrs.slice(0, -1).join("|"))}` : ""}` : "";

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">{dayLabel(today)}</h1>
      <p className="text-sm text-neutral-400">
        {visits === null ? " " : todays.length ? `${todays.length} visit${todays.length > 1 ? "s" : ""} today` : nextDate ? `Nothing today · next visit ${dayLabel(nextDate)}` : "Nothing on the schedule"}
      </p>

      <div className="grid grid-cols-2 gap-2 mt-4">
        <Link href="/clock" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand text-neutral-950 min-h-[52px] font-bold"><Timer size={20} /> Clock in / out</Link>
        {route ? (
          <a href={route} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-600 text-white min-h-[52px] font-semibold"><Navigation size={18} /> Start the route</a>
        ) : <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] text-neutral-500 min-h-[52px] font-semibold"><Navigation size={18} /> No stops today</span>}
      </div>

      <H>Today's visits</H>
      {visits === null ? <div className="h-44 rounded-2xl skeleton" />
        : todays.length ? <div className="space-y-3">{todays.map((v) => <VisitCard key={v.job_id + v.date} v={v} big />)}</div>
        : <Empty title="No visits today" sub={nextDate ? "Your next one is below." : "Check the Schedule tab for what's coming up."} />}

      {nextUp.length ? (
        <>
          <H>Next up · {dayLabel(nextDate!)}</H>
          <div className="space-y-3">{nextUp.map((v) => <VisitCard key={v.job_id + v.date} v={v} big={!todays.length} />)}</div>
        </>
      ) : null}

      {later.length ? (
        <>
          <H>Coming up</H>
          <div className="space-y-2">{later.map((v) => <VisitCard key={v.job_id + v.date} v={v} />)}</div>
        </>
      ) : null}

      {todo.punch.length ? (
        <>
          <H>Punch list</H>
          <div className="space-y-2">{todo.punch.map((p) => (
            <CheckRow key={p.id} done={!!p.done} title={p.item} sub={p.job_name} href={`/field/job/${p.job_id}`} onToggle={() => setPunch(p.id, !p.done)} />
          ))}</div>
        </>
      ) : null}

      {todo.tasks.length ? (
        <>
          <H>Tasks from Mike</H>
          <div className="space-y-2">{todo.tasks.map((t) => (
            <CheckRow key={t.id} done={!!t.done} title={t.title} sub={t.job_name} href={`/field/job/${t.job_id}`} onToggle={() => setTask(t.id, !t.done)} />
          ))}</div>
        </>
      ) : null}

      {mine && mine.length ? (
        <>
          <H>All your jobs</H>
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-neutral-950 divide-y divide-white/[0.05]">
            {mine.map((j) => (
              <Link key={j.id} href={`/field/job/${j.id}`} className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-white">{j.job_name}</div>
                  <div className="truncate text-[13px] text-neutral-400">{[j.work_type, j.next_day ? `Next: ${dayLabel(j.next_day)}` : null].filter(Boolean).join(" · ")}</div>
                </div>
                <ChevronRight size={18} className="shrink-0 text-neutral-500" />
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({ icon: Icon, label, done, total }: { icon: any; label: string; done: number; total: number }) {
  const complete = total > 0 && done === total;
  return (
    <div className={cn("rounded-xl border px-2.5 py-2", complete ? "border-emerald-400/30 bg-emerald-400/[0.06]" : "border-white/[0.08] bg-white/[0.03]")}>
      <div className="flex items-center gap-1 text-[11px] font-semibold text-neutral-400"><Icon size={12} />{label}</div>
      <div className={cn("mt-0.5 text-[17px] font-bold tabular-nums", complete ? "text-emerald-300" : "text-white")}>
        {total ? <>{done}<span className="text-[13px] font-semibold text-neutral-500">/{total}</span></> : <span className="text-neutral-600">—</span>}
      </div>
    </div>
  );
}

function VisitCard({ v, big }: { v: Visit; big?: boolean }) {
  const href = `/field/job/${v.job_id}?day=${v.date}`;
  const pct = v.steps_total ? v.steps_done / v.steps_total : 0;
  if (!big) {
    return (
      <Link href={href} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-neutral-950 px-4 py-3 min-h-[60px]">
        <div className="w-12 shrink-0 text-center">
          <div className="text-[11px] font-bold uppercase text-neutral-500">{new Date(v.date + "T12:00").toLocaleDateString("en-US", { weekday: "short" })}</div>
          <div className="text-[18px] font-bold leading-tight text-white">{Number(v.date.slice(8))}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-white">{v.job_name}</div>
          <div className="truncate text-[13px] text-neutral-400">Day {v.day_no} of {v.day_count}{v.steps_total ? ` · ${v.steps_total} to do` : ""}</div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-neutral-500" />
      </Link>
    );
  }
  return (
    <Link href={href} className="block rounded-2xl border border-white/20 bg-gradient-to-b from-neutral-900 to-neutral-950 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold uppercase tracking-wide text-neutral-400">Day {v.day_no} of {v.day_count}{v.work_type ? ` · ${v.work_type}` : ""}</div>
          <div className="mt-0.5 text-[18px] font-bold leading-tight text-white">{v.job_name}</div>
          {v.location ? <div className="mt-1 flex items-start gap-1 text-[14px] text-neutral-300"><MapPin size={14} className="mt-0.5 shrink-0 text-neutral-500" />{v.location}</div> : null}
          {v.crew ? <div className="mt-1 flex items-center gap-1 text-[13px] text-neutral-400"><Users size={13} className="shrink-0" /><span className="truncate">{v.crew}</span></div> : null}
        </div>
        {v.steps_total ? <Ring value={pct} size={48} stroke={5} /> : null}
      </div>
      {v.notes ? <div className="mt-2 rounded-lg bg-amber-300/[0.07] px-3 py-2 text-[13px] text-amber-100">{v.notes}</div> : null}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat icon={Package} label="Materials" done={v.mats_got} total={v.mats_total} />
        <Stat icon={Wrench} label="Tools" done={v.tools_got} total={v.tools_total} />
        <Stat icon={ListChecks} label="To do" done={v.steps_done} total={v.steps_total} />
      </div>
      <div className="mt-3 flex items-center justify-center gap-1 rounded-xl bg-brand min-h-[46px] text-[15px] font-bold text-neutral-950">Open this visit <ChevronRight size={16} /></div>
    </Link>
  );
}
