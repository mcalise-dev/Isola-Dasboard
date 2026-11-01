"use client";
// v8.4: the field-day card at the top of Home — the job(s) you're on today, who and what is
// coming and when, your clock, and one-tap logging into that job. Money and pipeline sit below.
import Link from "next/link";
import { Camera, Check, HardHat, Navigation, NotebookPen, Receipt } from "lucide-react";
import MyClock from "@/components/MyClock";
import { typeOf, timeWindow, isOutside } from "@/lib/schedule";
import { cn } from "@/lib/utils";

const capture = (mode: string) => window.dispatchEvent(new CustomEvent("isola:quickadd", { detail: mode }));

export default function TodayCard({ today, routeUrl }: { today: any[] | null; routeUrl: string | null }) {
  if (today === null) return <div className="skeleton mb-6 h-40 rounded-2xl" />;
  if (!today.length) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-dashed border-white/10 px-4 py-3.5 text-sm text-neutral-400">
        Nothing on the board today.
        <Link href="/dispatch" className="ml-auto font-semibold text-neutral-300 hover:text-white">Plan the week</Link>
      </div>
    );
  }

  // group today's entries by job; entries with no job sit in their own group
  const groups: { job: any; id: string; items: any[] }[] = [];
  for (const e of today) {
    const id = e.job_id ?? "none";
    const g = groups.find((x) => x.id === id);
    if (g) g.items.push(e); else groups.push({ id, job: e.jobs, items: [e] });
  }
  const main = groups[0];

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-brand/40 bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-brand">Today</span>
        <span className="text-xs text-neutral-500">{today.length} on the schedule</span>
        {routeUrl ? (
          <a href={routeUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-neutral-200 hover:bg-white/[0.06]">
            <Navigation size={15} /> Directions
          </a>
        ) : null}
      </div>

      {groups.map((g) => (
        <div key={g.id} className="border-b border-border px-4 py-3.5 last:border-0">
          {g.job ? (
            <Link href={`/jobs/${g.job.id}`} className="block">
              <div className="text-[17px] font-semibold text-white">{g.job.job_name || g.job.customer}</div>
              {g.job.location ? <div className="truncate text-sm text-neutral-400">{g.job.location}</div> : null}
            </Link>
          ) : <div className="text-[15px] font-semibold text-neutral-300">Not tied to a job</div>}
          <ul className="mt-2.5 space-y-1.5">
            {g.items.map((e: any) => {
              const ty = typeOf(e);
              const Icon = ty.icon;
              const st = e.status ?? "scheduled";
              const who = isOutside(e) ? [e.company || ty.label, e.qty].filter(Boolean).join(" · ")
                : [e.label && e.label !== ty.label ? e.label : null, (e.assignees?.length ? e.assignees.join(", ") : e.assignee)].filter(Boolean).join(" · ");
              return (
                <li key={e.id} className={cn("flex items-center gap-2.5 text-sm", st === "done" && "opacity-60")}>
                  <Icon size={15} className={cn("shrink-0", ty.tint)} />
                  <span className="w-[92px] shrink-0 tabular-nums text-neutral-400">{e.start_time ? timeWindow(e) : "Any time"}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-200">{who || ty.label}</span>
                  {st === "confirmed" ? <Check size={15} className="shrink-0 text-emerald-300" aria-label="Confirmed" />
                    : isOutside(e) && st === "scheduled" ? <span className="shrink-0 text-xs font-semibold text-amber-300">not confirmed</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="grid gap-3 border-t border-border bg-white/[0.02] px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0"><MyClock jobId={main.job?.id} compact /></div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { m: "photo", label: "Photo", icon: Camera },
            { m: "receipt", label: "Receipt", icon: Receipt },
            { m: "labor", label: "Labor", icon: HardHat },
            { m: "note", label: "Note", icon: NotebookPen },
          ].map(({ m, label, icon: I }) => (
            <button key={m} type="button" onClick={() => capture(m)}
              className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border border-white/[0.1] px-2 text-xs font-semibold text-neutral-200 hover:border-white/25 hover:text-white">
              <I size={19} /> {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
