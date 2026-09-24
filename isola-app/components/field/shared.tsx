"use client";
import Link from "next/link";
import { MapPin, ChevronRight, Check } from "lucide-react";

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const dayLabel = (s: string) => {
  const today = iso(new Date()), tmr = iso(addDays(new Date(), 1));
  const [y, m, d] = s.split("-").map(Number);
  const nice = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return s === today ? `Today · ${nice}` : s === tmr ? `Tomorrow · ${nice}` : nice;
};

export type Stop = {
  entry_id: string; entry_date: string; job_id: string | null; job_name: string | null; customer: string | null;
  location: string | null; work_type: string | null; label: string | null; notes: string | null; assignee: string | null; mine: boolean;
};

export function StopCard({ s, n }: { s: Stop; n?: number }) {
  const body = (
    <div className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${s.mine ? "border-white/60 bg-neutral-900" : "border-neutral-800 bg-neutral-950"}`}>
      {n ? <span className="shrink-0 w-7 h-7 rounded-full bg-neutral-800 text-white text-sm font-bold flex items-center justify-center">{n}</span> : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white truncate">{s.job_name || s.label || "—"}</span>
          {s.mine ? <span className="shrink-0 rounded-full bg-white text-neutral-900 px-2 py-0.5 text-xs font-bold">You</span> : null}
        </div>
        {s.location ? <div className="text-sm text-neutral-400 truncate flex items-center gap-1"><MapPin size={13} className="shrink-0" />{s.location}</div> : null}
        <div className="text-sm text-neutral-400 truncate">{[s.work_type, s.assignee ? `Crew: ${s.assignee}` : null].filter(Boolean).join(" · ")}</div>
        {s.notes ? <div className="mt-1 text-sm text-amber-200/90">{s.notes}</div> : null}
      </div>
      {s.job_id ? <ChevronRight size={18} className="shrink-0 text-neutral-500" /> : null}
    </div>
  );
  return s.job_id ? <Link href={`/field/job/${s.job_id}`} className="block">{body}</Link> : body;
}

export function CheckRow({ done, title, sub, onToggle, href }: { done: boolean; title: string; sub?: string; onToggle: () => void; href?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3 min-h-[56px]">
      <button onClick={onToggle} aria-label={done ? "Mark not done" : "Mark done"}
        className={`shrink-0 w-8 h-8 rounded-lg border-2 flex items-center justify-center ${done ? "bg-emerald-400 border-emerald-400 text-neutral-900" : "border-neutral-500 text-transparent"}`}>
        <Check size={18} strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1 py-2">
        <div className={`text-sm ${done ? "text-neutral-500 line-through" : "text-white font-semibold"}`}>{title}</div>
        {sub ? (href ? <Link href={href} className="text-xs text-neutral-400 underline decoration-neutral-700 underline-offset-2">{sub}</Link> : <div className="text-xs text-neutral-400">{sub}</div>) : null}
      </div>
    </div>
  );
}

export function Empty({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-700 px-5 py-6 text-center">
      <p className="text-base font-semibold text-white">{title}</p>
      {sub ? <p className="mt-1 text-sm text-neutral-400">{sub}</p> : null}
    </div>
  );
}

export const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-6 mb-2 text-xs font-bold uppercase tracking-wider text-neutral-400">{children}</h2>
);
