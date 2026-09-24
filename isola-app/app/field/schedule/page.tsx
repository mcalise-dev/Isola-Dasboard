"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StopCard, Empty, iso, addDays, dayLabel, type Stop } from "@/components/field/shared";

// Crew schedule: the next two weeks, day by day. Days with the crew member on them are marked "You".
export default function FieldSchedule() {
  const supabase = useMemo(() => createClient(), []);
  const [stops, setStops] = useState<Stop[] | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    const from = iso(new Date()), to = iso(addDays(new Date(), 14));
    supabase.rpc("crew_schedule", { p_from: from, p_to: to }).then(({ data }) => setStops((data as Stop[]) ?? []));
  }, []);

  const shown = (stops ?? []).filter((s) => !onlyMine || s.mine);
  const days = Array.from(new Set(shown.map((s) => s.entry_date)));

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Next two weeks</h1>
        <div className="flex rounded-full border border-neutral-700 p-0.5">
          {[{ v: false, l: "Everyone" }, { v: true, l: "Just me" }].map((o) => (
            <button key={o.l} onClick={() => setOnlyMine(o.v)} className={`rounded-full px-3 min-h-[36px] text-sm font-semibold ${onlyMine === o.v ? "bg-white text-neutral-900" : "text-neutral-300"}`}>{o.l}</button>
          ))}
        </div>
      </div>
      {stops === null ? <div className="mt-4 h-24 rounded-xl bg-neutral-900 animate-pulse" /> : null}
      {stops && !days.length ? <div className="mt-4"><Empty title={onlyMine ? "You're not on anything yet" : "Nothing scheduled"} sub="New days show up here as soon as Mike puts them on the calendar." /></div> : null}
      {days.map((d) => (
        <section key={d} className="mt-5">
          <h2 className="mb-2 text-sm font-bold text-white">{dayLabel(d)}</h2>
          <div className="space-y-2">{shown.filter((s) => s.entry_date === d).map((s) => <StopCard key={s.entry_id} s={s} />)}</div>
        </section>
      ))}
    </div>
  );
}
