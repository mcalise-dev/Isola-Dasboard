"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Timer } from "lucide-react";
import { Empty, iso, addDays } from "@/components/field/shared";

// A crew member's own clock punches — hours only (no rates or pay).
type Punch = { id: string; job_name: string | null; clock_in: string; clock_out: string | null; hours: number };

function weekStart(d: Date) { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x; } // Monday

export default function FieldHours() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Punch[] | null>(null);
  const thisMon = weekStart(new Date());
  const lastMon = addDays(thisMon, -7);

  useEffect(() => {
    supabase.rpc("crew_hours", { p_from: iso(lastMon), p_to: iso(new Date()) }).then(({ data }) => setRows((data as Punch[]) ?? []));
  }, []);

  const t = (s: string) => new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const d = (s: string) => new Date(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const inWeek = (p: Punch, mon: Date) => { const c = new Date(p.clock_in); return c >= mon && c < addDays(mon, 7); };
  const weeks = [{ label: "This week", mon: thisMon }, { label: "Last week", mon: lastMon }];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">My hours</h1>
      <Link href="/clock" className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-white text-neutral-900 min-h-[52px] font-bold"><Timer size={20} /> Clock in / out</Link>
      {rows === null ? <div className="mt-4 h-24 rounded-xl bg-neutral-900 animate-pulse" /> : null}
      {rows && weeks.map((w) => {
        const list = rows.filter((p) => inWeek(p, w.mon));
        const total = list.reduce((a, p) => a + Number(p.hours || 0), 0);
        return (
          <section key={w.label} className="mt-6">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-sm font-bold text-white">{w.label} <span className="font-normal text-neutral-400">· from {w.mon.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></h2>
              <span className="text-lg font-bold tabular-nums text-white">{total.toFixed(1)} hrs</span>
            </div>
            {list.length ? (
              <div className="divide-y divide-neutral-800 rounded-xl bg-white/[0.05]">
                {list.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white truncate">{p.job_name || "No job"}</div>
                      <div className="text-xs text-neutral-400">{d(p.clock_in)} · {t(p.clock_in)} – {p.clock_out ? t(p.clock_out) : <span className="text-emerald-300 font-semibold">on the clock</span>}</div>
                    </div>
                    <div className="shrink-0 text-sm font-bold tabular-nums text-white">{Number(p.hours).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            ) : <Empty title="No hours logged" />}
          </section>
        );
      })}
      <p className="mt-6 text-sm text-neutral-400">Something look wrong? Tell Mike — he can fix a punch from his side.</p>
    </div>
  );
}
