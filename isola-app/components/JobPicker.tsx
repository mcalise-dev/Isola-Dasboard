"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { STATUS_META, isLiveJob } from "@/lib/format";

// Type-to-find job picker (pipeline v4, 9/22/26).
// Only live jobs are offered: To Quote, Sent, Booked, In Progress, and Complete-but-unpaid.
// Lost and paid-off jobs stay out unless "show old jobs" is ticked. Jobs you picked
// recently float to the top so the usual ones are one tap away.
const RECENT_KEY = "isola.recentJobs";
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } };
const pushRecent = (id: string) => {
  try { const r = [id, ...readRecent().filter((x) => x !== id)].slice(0, 8); localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch {}
};

export default function JobPicker({ jobs, value, onChange, placeholder = "Tag a job — type to find…", className = "" }: {
  jobs: any[]; value: string; onChange: (id: string) => void; placeholder?: string; className?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { setRecent(readRecent()); }, [open]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const picked = value ? jobs.find((j) => j.id === value) : null;
  const matches = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const pool = jobs.filter((j) => showOld || isLiveJob(j));
    const hit = pool.filter((j) => {
      if (!words.length) return true;
      const hay = `${j.job_name ?? ""} ${j.customer ?? ""} ${j.location ?? ""} ${j.job ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const r = (id: string) => { const i = recent.indexOf(id); return i < 0 ? 99 : i; };
    return hit.sort((a, b) => r(a.id) - r(b.id) || (b.priority ? 1 : 0) - (a.priority ? 1 : 0) || String(a.job_name || a.customer).localeCompare(String(b.job_name || b.customer))).slice(0, words.length ? 12 : 6);
  }, [q, jobs, showOld, recent]);

  function choose(id: string) { onChange(id); if (id) pushRecent(id); setQ(""); setOpen(false); }

  const input = "w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";

  if (picked && !open) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-neutral-600 bg-neutral-950 px-3 py-2 ${className}`}>
        <span className="min-w-0 flex-1 truncate text-sm text-white">🔗 {picked.job_name || picked.customer}<span className="text-neutral-500">{picked.job_name ? " · " + picked.customer : ""}</span></span>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 text-[11px] font-semibold text-neutral-400">change</button>
        <button type="button" onClick={() => choose("")} className="shrink-0 text-neutral-500 hover:text-red-400 text-sm" aria-label="Clear job">✕</button>
      </div>
    );
  }

  return (
    <div ref={box} className={`relative ${className}`}>
      <input className={input} value={q} placeholder={placeholder} autoFocus={!!picked}
        onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { e.preventDefault(); choose(matches[0].id); } if (e.key === "Escape") setOpen(false); }} />
      {open ? (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl">
          {!q ? <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">{recent.length ? "Recent & active" : "Active jobs"} — keep typing to narrow</div> : null}
          {matches.map((j) => (
            <button type="button" key={j.id} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(j.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-neutral-800 active:bg-neutral-800">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white">{j.priority ? "★ " : ""}{j.job_name || j.customer}</span>
                <span className="block truncate text-[11px] text-neutral-500">{[j.job_name ? j.customer : null, j.location].filter(Boolean).join(" · ")}</span>
              </span>
              <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_META[j.status]?.cls ?? ""}`}>{STATUS_META[j.status]?.label ?? j.status}</span>
            </button>
          ))}
          {!matches.length ? <div className="px-3 py-3 text-xs text-neutral-500">No {showOld ? "" : "active "}job matches “{q}”.</div> : null}
          <div className="flex items-center justify-between border-t border-neutral-800 px-3 py-2">
            <label className="flex items-center gap-1.5 text-[11px] text-neutral-400">
              <input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> show old jobs
            </label>
            {value ? <button type="button" onClick={() => choose("")} className="text-[11px] text-neutral-400">No job</button>
              : <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-neutral-400">Close</button>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
