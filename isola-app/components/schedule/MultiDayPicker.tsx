"use client";
// Tap the days someone is working — any mix of days, not just a run in a row.
// Fill-in: pick weekdays (e.g. M W F) + a from/through range and every matching day gets filled.
// Shows one month at a time; days already picked show as filled. Used when adding
// crew days from the job page (phase plan) and from "Add to the schedule".
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };

export default function MultiDayPicker({ value, onChange, start }: { value: string[]; onChange: (v: string[]) => void; start?: string }) {
  const first = start || value[0] || iso(new Date());
  const [month, setMonth] = useState(() => { const d = parse(first); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const today = iso(new Date());
  const lead = month.getDay();
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  const [wd, setWd] = useState<number[]>([]); // 0 = Sun … 6 = Sat
  const [from, setFrom] = useState(first);
  const [thru, setThru] = useState(() => { const t = parse(first); t.setDate(t.getDate() + 13); return iso(t); });
  const fill = () => {
    if (!wd.length || !from || !thru || thru < from) return;
    const out: string[] = [];
    for (let d = parse(from); iso(d) <= thru; d.setDate(d.getDate() + 1)) if (wd.includes(d.getDay())) out.push(iso(d));
    onChange([...new Set([...value, ...out])].sort());
    const m = parse(from); setMonth(new Date(m.getFullYear(), m.getMonth(), 1));
  };
  const toggle = (d: string) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort());
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <div className="rounded-xl border border-border p-2">
      <div className="mb-2 space-y-2 rounded-lg bg-white/[0.03] p-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Fill in days</div>
        <div className="flex gap-1">
          {[[1, "M"], [2, "T"], [3, "W"], [4, "Th"], [5, "F"], [6, "Sa"], [0, "Su"]].map(([n, l]) => {
            const on = wd.includes(n as number);
            return (
              <button key={n} type="button" onClick={() => setWd(on ? wd.filter((x) => x !== n) : [...wd, n as number])}
                className={cn("h-9 flex-1 rounded-lg border text-xs font-semibold", on ? "border-brand bg-brand text-neutral-950" : "border-border text-neutral-300 hover:text-white")}>{l}</button>
            );
          })}
        </div>
        <div className="flex items-end gap-2">
          <label className="flex-1 text-[11px] text-neutral-500">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-0.5 h-9 w-full rounded-lg border border-border bg-transparent px-2 text-sm text-white" /></label>
          <label className="flex-1 text-[11px] text-neutral-500">Through<input type="date" value={thru} onChange={(e) => setThru(e.target.value)} className="mt-0.5 h-9 w-full rounded-lg border border-border bg-transparent px-2 text-sm text-white" /></label>
          <button type="button" onClick={fill} disabled={!wd.length}
            className="h-9 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-40">Fill</button>
        </div>
      </div>
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:text-white" aria-label="Previous month"><ChevronLeft size={16} /></button>
        <div className="text-sm font-semibold text-white">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
        <button type="button" onClick={() => shift(1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:text-white" aria-label="Next month"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-neutral-500">{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => d ? (
          <button key={d} type="button" onClick={() => toggle(d)}
            className={cn("h-9 rounded-lg text-sm tabular-nums",
              value.includes(d) ? "bg-brand font-semibold text-neutral-950" : "text-neutral-300 hover:bg-white/10",
              d === today && !value.includes(d) && "ring-1 ring-white/30")}>
            {Number(d.slice(8))}
          </button>
        ) : <div key={`b${i}`} />)}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="text-neutral-400">{value.length ? `${value.length} day${value.length === 1 ? "" : "s"} picked` : "Tap each day they're working"}</span>
        <span className="flex gap-3">
          {value.length ? <button type="button" onClick={() => onChange([])} className="text-neutral-500 hover:text-white">Clear</button> : null}
        </span>
      </div>
    </div>
  );
}
