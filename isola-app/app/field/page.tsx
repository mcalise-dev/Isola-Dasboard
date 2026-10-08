"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Navigation, Timer, MapPin, ChevronRight } from "lucide-react";
import { StopCard, CheckRow, Empty, H, iso, dayLabel, type Stop } from "@/components/field/shared";
import { showError } from "@/components/Toaster";

// Crew Today: your assigned jobs, where we're going, the checklist for jobs they're assigned to (next 7 days), and the punch list / tasks on the jobs they can see.
export default function FieldToday() {
  const supabase = useMemo(() => createClient(), []);
  const [stops, setStops] = useState<Stop[] | null>(null);
  const [mine, setMine] = useState<any[] | null>(null);
  const [todo, setTodo] = useState<{ checklist: any[]; punch: any[]; tasks: any[] }>({ checklist: [], punch: [], tasks: [] });
  const today = iso(new Date());

  async function load() {
    const [s, t, m] = await Promise.all([
      supabase.rpc("crew_schedule", { p_from: today, p_to: today }),
      supabase.rpc("crew_todo"),
      supabase.rpc("crew_my_jobs"),
    ]);
    setMine((m.data as any[]) ?? []);
    const list = ((s.data as Stop[]) ?? []).sort((a, b) => Number(b.mine) - Number(a.mine));
    setStops(list);
    setTodo({ checklist: [], punch: [], tasks: [], ...((t.data as any) ?? {}) });
  }
  useEffect(() => { load(); }, []);

  async function setPunch(id: string, done: boolean) {
    setTodo((x) => ({ ...x, punch: x.punch.map((p) => (p.id === id ? { ...p, done } : p)) }));
    const { error } = await supabase.rpc("crew_set_punch", { p_id: id, p_done: done });
    if (error) { showError("Couldn't save: " + error.message); load(); }
  }
  async function setCheck(id: string, done: boolean) {
    setTodo((x) => ({ ...x, checklist: x.checklist.map((k) => (k.id === id ? { ...k, done } : k)) }));
    const { error } = await supabase.rpc("crew_set_checklist", { p_id: id, p_done: done });
    if (error) { showError("Couldn't save: " + error.message); load(); }
  }
  async function setTask(id: string, done: boolean) {
    setTodo((x) => ({ ...x, tasks: x.tasks.map((p) => (p.id === id ? { ...p, done } : p)) }));
    const { error } = await supabase.rpc("crew_set_task", { p_id: id, p_done: done });
    if (error) { showError("Couldn't save: " + error.message); load(); }
  }

  const addrs = (stops ?? []).filter((s) => s.location).map((s) => s.location as string);
  const route = addrs.length ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addrs[addrs.length - 1])}${addrs.length > 1 ? `&waypoints=${encodeURIComponent(addrs.slice(0, -1).join("|"))}` : ""}` : "";

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">{dayLabel(today)}</h1>

      <div className="grid grid-cols-2 gap-2 mt-4">
        <Link href="/clock" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-neutral-900 min-h-[52px] font-bold"><Timer size={20} /> Clock in / out</Link>
        {route ? (
          <a href={route} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-600 text-white min-h-[52px] font-semibold"><Navigation size={18} /> Start the route</a>
        ) : <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] text-neutral-500 min-h-[52px] font-semibold"><Navigation size={18} /> No stops</span>}
      </div>

      <H>Your jobs</H>
      {mine === null ? <div className="h-20 rounded-xl bg-neutral-900 animate-pulse" />
        : mine.length ? <div className="space-y-2">{mine.map((j) => {
            const done = j.total_items - j.open_items;
            const pct = j.total_items ? Math.round((done / j.total_items) * 100) : 0;
            return (
              <Link key={j.id} href={`/field/job/${j.id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-neutral-950 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white truncate">{j.job_name}</div>
                  {j.location ? <div className="text-sm text-neutral-400 truncate flex items-center gap-1"><MapPin size={13} className="shrink-0" />{j.location}</div> : null}
                  <div className="text-sm text-neutral-400 truncate">{[j.work_type, j.next_day ? `Next: ${dayLabel(j.next_day)}` : null].filter(Boolean).join(" · ")}</div>
                  {j.total_items ? (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-neutral-800 overflow-hidden"><div className={`h-full ${pct === 100 ? "bg-emerald-400" : "bg-neutral-300"}`} style={{ width: `${pct}%` }} /></div>
                      <span className="text-xs text-neutral-400 tabular-nums">{done}/{j.total_items}</span>
                    </div>
                  ) : null}
                </div>
                <ChevronRight size={18} className="shrink-0 text-neutral-500" />
              </Link>
            );
          })}</div>
        : <Empty title="No jobs assigned to you" sub="Mike assigns you on the schedule or on the job." />}

      <H>Where we're going</H>
      {stops === null ? <div className="h-20 rounded-xl bg-neutral-900 animate-pulse" />
        : stops.length ? <div className="space-y-2">{stops.map((s, i) => <StopCard key={s.entry_id} s={s} n={i + 1} />)}</div>
        : <Empty title="Nothing on the schedule today" sub="Check the Schedule tab for what's coming up." />}

      {todo.checklist.length ? (
        <>
          <H>Checklist — your jobs</H>
          <div className="space-y-2">{todo.checklist.map((k) => (
            <CheckRow key={k.id} done={!!k.done} title={k.label} sub={k.job_name} href={`/field/job/${k.job_id}`} onToggle={() => setCheck(k.id, !k.done)} />
          ))}</div>
        </>
      ) : null}

      <H>Punch list</H>
      {todo.punch.length ? (
        <div className="space-y-2">{todo.punch.map((p) => (
          <CheckRow key={p.id} done={!!p.done} title={p.item} sub={p.job_name} href={`/field/job/${p.job_id}`} onToggle={() => setPunch(p.id, !p.done)} />
        ))}</div>
      ) : <Empty title="Punch list is clear" />}

      {todo.tasks.length ? (
        <>
          <H>Tasks from Mike</H>
          <div className="space-y-2">{todo.tasks.map((t) => (
            <CheckRow key={t.id} done={!!t.done} title={t.title} sub={t.job_name} href={`/field/job/${t.job_id}`} onToggle={() => setTask(t.id, !t.done)} />
          ))}</div>
        </>
      ) : null}
    </div>
  );
}
