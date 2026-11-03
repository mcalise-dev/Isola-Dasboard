"use client";
// v86 crew view of the job's phase plan (from crew_job → phases). Who's on each phase, and which
// suppliers, subs, rentals and equipment are coming. No costs or prices — crew_job never sends them.
import { useState } from "react";
import { Package, HardHat, Truck, KeyRound, Ellipsis, MapPin, Users, ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const KIND: Record<string, { label: string; icon: LucideIcon; statuses: string[] }> = {
  material: { label: "Materials", icon: Package, statuses: ["to order", "ordered", "confirmed", "delivered"] },
  sub: { label: "Subs", icon: HardHat, statuses: ["to call", "called", "booked", "done"] },
  rental: { label: "Rentals", icon: KeyRound, statuses: ["to reserve", "reserved", "picked up", "returned"] },
  equipment: { label: "Equipment", icon: Truck, statuses: ["needed", "scheduled", "on site", "off site"] },
  other: { label: "Other", icon: Ellipsis, statuses: ["to do", "in progress", "done"] },
};
const st = (k: string, s: string) => { const l = (KIND[k] ?? KIND.other).statuses; const i = Number(s); return l[isNaN(i) ? 0 : Math.min(i, l.length - 1)]; };
const d = (iso?: string | null) => { if (!iso) return ""; const [y, m, dd] = iso.split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); };
const maps = (a: string) => "https://maps.google.com/?q=" + encodeURIComponent(a);

export default function CrewPhases({ phases, me }: { phases: any[]; me?: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    // open the phases this person is on (or the first one not done)
    const o: Record<string, boolean> = {};
    const mine = phases.filter((p) => p.mine && p.status !== "done");
    (mine.length ? mine : phases.filter((p) => p.status !== "done").slice(0, 1)).forEach((p) => (o[p.id] = true));
    return o;
  });
  if (!phases?.length) return null;
  return (
    <section className="mb-4">
      <h3 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-widest text-neutral-400">Job phases</h3>
      <div className="space-y-2">
        {phases.map((p, i) => {
          const on = !!open[p.id];
          const done = p.status === "done";
          return (
            <div key={p.id} className={cn("rounded-2xl border bg-neutral-950", p.mine ? "border-brand/50" : "border-white/[0.08]", done && "opacity-60")}>
              <button onClick={() => setOpen((o) => ({ ...o, [p.id]: !on }))} className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left">
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold", p.status === "in progress" ? "bg-brand text-neutral-950" : done ? "bg-emerald-500/20 text-emerald-300" : "bg-white/[0.08] text-neutral-300")}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-semibold text-white">{p.name}</div>
                  <div className="truncate text-[13px] text-neutral-400">
                    {[p.start_date ? (p.end_date && p.end_date !== p.start_date ? `${d(p.start_date)} – ${d(p.end_date)}` : d(p.start_date)) : null, p.status].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {p.mine ? <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold text-neutral-950">You're on this</span> : null}
                {on ? <ChevronDown size={18} className="shrink-0 text-neutral-500" /> : <ChevronRight size={18} className="shrink-0 text-neutral-500" />}
              </button>
              {on ? (
                <div className="space-y-3 border-t border-white/[0.06] px-4 py-3">
                  {(p.crew ?? []).length ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Users size={15} className="mr-1 text-neutral-500" />
                      {p.crew.map((n: string) => (
                        <span key={n} className={cn("rounded-full border px-3 py-1 text-[13px] font-semibold", n === me ? "border-brand/60 bg-brand/15 text-white" : "border-white/15 text-neutral-200")}>{n}</span>
                      ))}
                    </div>
                  ) : <p className="text-[13px] text-neutral-500">Crew not set yet.</p>}
                  {Object.keys(KIND).map((k) => {
                    const items = (p.items ?? []).filter((x: any) => x.kind === k);
                    if (!items.length) return null;
                    const { label, icon: Icon } = KIND[k];
                    return (
                      <div key={k}>
                        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-500"><Icon size={13} />{label}</div>
                        <div className="divide-y divide-white/[0.05]">
                          {items.map((x: any, j: number) => (
                            <div key={j} className="flex min-h-[48px] items-center gap-2 py-1.5">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[15px] font-semibold text-white">{x.who || "TBD"}</div>
                                <div className="truncate text-[13px] text-neutral-400">{[x.what, x.date ? d(x.date) : null].filter(Boolean).join(" · ")}</div>
                              </div>
                              {x.address ? <a href={maps(x.address)} target="_blank" rel="noreferrer" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-300 hover:bg-white/[0.06]" aria-label="Directions"><MapPin size={18} /></a> : null}
                              <span className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-neutral-300">{st(k, x.status)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
