"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Navigation, Timer } from "lucide-react";
import { StopCard, CheckRow, Empty, H, iso, dayLabel, type Stop } from "@/components/field/shared";

// Crew Today: where we're going, and the punch list / tasks on the jobs they can see.
export default function FieldToday() {
  const supabase = useMemo(() => createClient(), []);
  const [stops, setStops] = useState<Stop[] | null>(null);
  const [todo, setTodo] = useState<{ punch: any[]; tasks: any[] }>({ punch: [], tasks: [] });
  const today = iso(new Date());

  async function load() {
    const [s, t] = await Promise.all([
      supabase.rpc("crew_schedule", { p_from: today, p_to: today }),
      supabase.rpc("crew_todo"),
    ]);
    const list = ((s.data as Stop[]) ?? []).sort((a, b) => Number(b.mine) - Number(a.mine));
    setStops(list);
    setTodo((t.data as any) ?? { punch: [], tasks: [] });
  }
  useEffect(() => { load(); }, []);

  async function setPunch(id: string, done: boolean) {
    setTodo((x) => ({ ...x, punch: x.punch.map((p) => (p.id === id ? { ...p, done } : p)) }));
    const { error } = await supabase.rpc("crew_set_punch", { p_id: id, p_done: done });
    if (error) { alert("Couldn't save: " + error.message); load(); }
  }
  async function setTask(id: string, done: boolean) {
    setTodo((x) => ({ ...x, tasks: x.tasks.map((p) => (p.id === id ? { ...p, done } : p)) }));
    const { error } = await supabase.rpc("crew_set_task", { p_id: id, p_done: done });
    if (error) { alert("Couldn't save: " + error.message); load(); }
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

      <H>Where we're going</H>
      {stops === null ? <div className="h-20 rounded-xl bg-neutral-900 animate-pulse" />
        : stops.length ? <div className="space-y-2">{stops.map((s, i) => <StopCard key={s.entry_id} s={s} n={i + 1} />)}</div>
        : <Empty title="Nothing on the schedule today" sub="Check the Schedule tab for what's coming up." />}

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
