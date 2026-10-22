"use client";
// v7.3 (10/22/26): the job at a glance, day by day — Mike's view of the schedule and phases.
// Built from the crew plan (job_checklist: phase, day, time, who) and the dispatch days
// (schedule_entries). Timed steps (a concrete truck at 9:00) sort first in their day and
// get a yellow time chip. The crew sees the same steps and times in their app.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { splitPhase, phaseTitle, fmtTime } from "@/components/field/jobkit";
import { todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CalendarDays, Check, Clock3, Users, ChevronDown } from "lucide-react";
import { typeOf, timeWindow, needsConfirm, byTime, type SchedItem } from "@/lib/schedule";

type Row = { id: string; label: string; done: boolean; work_date: string | null; work_time: string | null; assignee: string | null; sort: number | null };
type Day = { id: string; entry_date: string; assignee: string | null; assignees: string[] | null; label: string | null; item_type: string | null; company: string | null; start_time: string | null; end_time: string | null; qty: string | null; status: string | null };

const dayHead = (iso: string, t: string) => {
  const d = new Date(iso + "T12:00:00");
  return {
    top: iso === t ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" }),
    sub: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
};

export default function JobTimeline({ jobId, onEditPlan }: { jobId: string; onEditPlan?: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [showPast, setShowPast] = useState(false);
  const t = todayISO();

  useEffect(() => {
    const go = async () => {
      const [a, b] = await Promise.all([
        sb.from("job_checklist").select("id,label,done,work_date,work_time,assignee,sort").eq("job_id", jobId).order("sort").order("created_at"),
        sb.from("schedule_entries").select("id,entry_date,assignee,assignees,label,item_type,company,start_time,end_time,qty,status").eq("job_id", jobId).neq("status", "cancelled").order("entry_date"),
      ]);
      setRows((a.data as Row[]) ?? []);
      setDays((b.data as Day[]) ?? []);
    };
    go();
    window.addEventListener("isola:changed", go);
    return () => window.removeEventListener("isola:changed", go);
  }, [sb, jobId]);

  if (rows === null) return <div className="skeleton h-28 rounded-2xl" />;

  // every date that has crew booked or a step planned
  const dates = [...new Set([...days.map((d) => d.entry_date), ...rows.map((r) => r.work_date).filter(Boolean) as string[]])].sort();
  const past = dates.filter((d) => d < t);
  const upcoming = dates.filter((d) => d >= t);
  const unscheduled = rows.filter((r) => !r.work_date);
  const phasesNoDay = [...new Set(unscheduled.map((r) => splitPhase(r.label).phase))];
  const total = rows.length, done = rows.filter((r) => r.done).length;

  const crewOn = (d: string) => {
    const names = new Set<string>();
    days.filter((x) => x.entry_date === d).forEach((x) => {
      (x.assignees ?? []).forEach((n) => names.add(n));
      if (x.assignee) x.assignee.split(/,\s*/).forEach((n) => n && names.add(n));
    });
    return [...names];
  };

  const dayBlock = (d: string) => {
    const steps = rows.filter((r) => r.work_date === d)
      .sort((a, b) => (a.work_time ? 0 : 1) - (b.work_time ? 0 : 1) || String(a.work_time ?? "").localeCompare(String(b.work_time ?? "")) || (a.sort ?? 0) - (b.sort ?? 0));
    const phases = [...new Set(steps.map((s) => splitPhase(s.label).phase).filter(Boolean))];
    const crew = crewOn(d);
    // v6.9: pours, deliveries, subs, inspections… booked on the schedule for this day
    const items = days.filter((x) => x.entry_date === d && x.item_type && x.item_type !== "crew").sort((a, b) => byTime(a as SchedItem, b as SchedItem));
    const h = dayHead(d, t);
    const isToday = d === t;
    const allDone = steps.length > 0 && steps.every((s) => s.done);
    return (
      <li key={d} className="relative grid grid-cols-[58px_1fr] gap-3 pb-5 last:pb-0">
        <div className="text-right">
          <div className={cn("text-[15px] font-semibold leading-tight", isToday ? "text-brand" : "text-white")}>{h.top}</div>
          <div className="text-xs text-neutral-500">{h.sub}</div>
        </div>
        <div className={cn("relative border-l pl-4", isToday ? "border-brand" : "border-white/10")}>
          <span aria-hidden className={cn("absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full",
            allDone ? "bg-emerald-400" : isToday ? "bg-brand" : "bg-neutral-600")} />
          <div className="flex flex-wrap items-center gap-1.5">
            {phases.length ? phases.map((p) => (
              <span key={p} className="rounded-full bg-white/[0.07] px-2 py-0.5 text-xs font-semibold text-neutral-200">{phaseTitle(p)}</span>
            )) : <span className="text-xs text-neutral-500">{steps.length ? "No phase" : items.length && !crew.length ? "On site" : "Crew booked"}</span>}
            {crew.length ? <span className="inline-flex items-center gap-1 text-xs text-neutral-400"><Users size={12} /> {crew.join(", ")}</span> : null}
          </div>
          {items.length ? (
            <ul className="mt-2 space-y-1.5">
              {items.map((x) => {
                const ty = typeOf(x);
                const Icon = ty.icon;
                const open = needsConfirm(x as SchedItem) && d >= t;
                return (
                  <li key={x.id} className="flex items-start gap-2 text-sm">
                    {x.start_time ? (
                      <span className="mt-px inline-flex shrink-0 items-center gap-1 rounded-md bg-brand/15 px-1.5 py-0.5 text-[12px] font-semibold text-brand"><Clock3 size={11} />{timeWindow(x as SchedItem)}</span>
                    ) : null}
                    <Icon size={15} className={cn("mt-0.5 shrink-0", ty.tint)} />
                    <span className={cn("min-w-0", x.status === "done" ? "text-neutral-500 line-through" : "text-neutral-100")}>
                      {x.company || ty.label}<span className="text-neutral-500">{[x.company ? ty.label : null, x.qty].filter(Boolean).map((v) => " · " + v).join("")}</span>
                      {x.status === "confirmed" ? <span className="ml-1.5 text-xs font-semibold text-emerald-300">Confirmed</span> : open ? <span className="ml-1.5 text-xs font-semibold text-amber-300">Not confirmed</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {steps.length ? (
            <ul className="mt-2 space-y-1.5">
              {steps.map((s) => {
                const { text } = splitPhase(s.label);
                return (
                  <li key={s.id} className="flex items-start gap-2 text-sm">
                    {s.work_time ? (
                      <span className="mt-px inline-flex shrink-0 items-center gap-1 rounded-md bg-brand/15 px-1.5 py-0.5 text-[12px] font-semibold text-brand"><Clock3 size={11} />{fmtTime(s.work_time)}</span>
                    ) : (
                      <span className={cn("mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded border", s.done ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-white/20")}>{s.done ? <Check size={11} /> : null}</span>
                    )}
                    <span className={cn("min-w-0", s.done ? "text-neutral-500 line-through" : "text-neutral-100")}>
                      {text}{s.assignee ? <span className="text-neutral-500"> · {s.assignee}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <CalendarDays size={17} className="text-neutral-400" />
        <h2 className="text-[17px] font-semibold text-white">Job timeline</h2>
        {total ? <span className="text-sm text-neutral-500">{done}/{total} steps done</span> : null}
        {onEditPlan ? <button onClick={onEditPlan} className="ml-auto text-sm font-semibold text-neutral-400 hover:text-white">Edit plan</button> : null}
      </div>

      {!dates.length && !unscheduled.length ? (
        <p className="text-sm text-neutral-500">
          Nothing planned yet. {onEditPlan ? <button onClick={onEditPlan} className="font-semibold text-neutral-300 hover:text-white">Build the plan</button> : null} with phases and days. Give a step a time (like a 9:00 concrete truck) and it shows here and on the crew&apos;s phone.
        </p>
      ) : (
        <>
          {past.length ? (
            <button onClick={() => setShowPast((v) => !v)} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-white">
              <ChevronDown size={13} className={cn("transition-transform", !showPast && "-rotate-90")} />
              {past.length} earlier day{past.length === 1 ? "" : "s"}
            </button>
          ) : null}
          <ol>
            {showPast ? past.map(dayBlock) : null}
            {upcoming.map(dayBlock)}
          </ol>
          {!upcoming.length && !showPast && past.length ? <p className="text-sm text-neutral-500">No days coming up. Earlier days are above.</p> : null}
          {unscheduled.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-white/10 px-3.5 py-3">
              <div className="text-xs font-semibold text-neutral-400">Not on a day yet · {unscheduled.length} step{unscheduled.length === 1 ? "" : "s"}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {phasesNoDay.map((p) => <span key={p || "none"} className="rounded-full bg-white/[0.05] px-2 py-0.5 text-xs text-neutral-300">{p ? phaseTitle(p) : "No phase"}</span>)}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
