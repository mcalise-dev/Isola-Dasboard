"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Job, STATUS_META, todayISO } from "@/lib/format";

type Entry = {
  id: string;
  entry_date: string;
  job_id: string | null;
  label: string | null;
  notes: string | null;
  assignee: string | null;
};

const DOT: Record<string, string> = {
  lead: "bg-violet-400",
  awaiting: "bg-neutral-400",
  booked: "bg-blue-400",
  progress: "bg-amber-400",
  complete: "bg-emerald-400",
};

const CHIP: Record<string, string> = {
  lead: "bg-violet-500/25 text-violet-200",
  awaiting: "bg-neutral-500/25 text-neutral-200",
  booked: "bg-blue-500/25 text-blue-200",
  progress: "bg-amber-500/25 text-amber-200",
  complete: "bg-emerald-500/25 text-emerald-200",
};

// stable per-name color so a crew member reads the same everywhere
const CREW_CLS = [
  "bg-sky-500/20 text-sky-200 border-sky-500/40",
  "bg-lime-500/20 text-lime-200 border-lime-500/40",
  "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40",
  "bg-orange-500/20 text-orange-200 border-orange-500/40",
  "bg-cyan-500/20 text-cyan-200 border-cyan-500/40",
];
const crewCls = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CREW_CLS[h % CREW_CLS.length];
};

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function ScheduleTab() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
  const [year, setYear] = useState(ty);
  const [month, setMonth] = useState(tm); // 0-indexed
  const [entries, setEntries] = useState<Entry[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [crew, setCrew] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>(today);
  const [addJobId, setAddJobId] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addWho, setAddWho] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterWho, setFilterWho] = useState("");

  const monthStart = iso(year, month, 1);
  const monthEnd = iso(year, month, new Date(year, month + 1, 0).getDate());

  async function load() {
    const [{ data: es }, { data: js }, { data: ws }] = await Promise.all([
      supabase.from("schedule_entries").select("*").gte("entry_date", monthStart).lte("entry_date", monthEnd).order("sort").order("created_at"),
      supabase.from("jobs").select("*").order("priority", { ascending: false }).order("updated_at", { ascending: false }),
      supabase.from("workers").select("name,active").eq("active", true).order("name"),
    ]);
    setEntries((es as Entry[]) ?? []);
    setJobs((js as Job[]) ?? []);
    setCrew(ws ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year, month]);

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);
  const activeJobs = jobs.filter((j) => j.status !== "complete");
  const visible = useMemo(
    () => (filterWho ? entries.filter((e) => e.assignee === filterWho) : entries),
    [entries, filterWho]
  );
  const byDate = useMemo(() => {
    const m: Record<string, Entry[]> = {};
    visible.forEach((e) => { (m[e.entry_date] = m[e.entry_date] ?? []).push(e); });
    return m;
  }, [visible]);

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  async function addEntry() {
    if (!addJobId && !addLabel.trim()) return;
    setBusy(true);
    const payload: any = { entry_date: selected, assignee: addWho || null };
    if (addJobId) payload.job_id = addJobId;
    else payload.label = addLabel.trim();
    const { error } = await supabase.from("schedule_entries").insert(payload);
    setBusy(false);
    if (error) { alert("Add failed: " + error.message); return; }
    setAddJobId(""); setAddLabel("");
    load();
  }

  async function setAssignee(e: Entry, who: string) {
    await supabase.from("schedule_entries").update({ assignee: who || null, updated_at: new Date().toISOString() }).eq("id", e.id);
    load();
  }

  async function removeEntry(e: Entry) {
    await supabase.from("schedule_entries").delete().eq("id", e.id);
    load();
  }

  async function move(e: Entry, days: number) {
    const d = new Date(e.entry_date + "T12:00:00");
    d.setDate(d.getDate() + days);
    const next = iso(d.getFullYear(), d.getMonth(), d.getDate());
    await supabase.from("schedule_entries").update({ entry_date: next, updated_at: new Date().toISOString() }).eq("id", e.id);
    load();
  }

  // calendar grid
  const firstDow = new Date(year, month, 1).getDay(); // Sun=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const selEntries = byDate[selected] ?? [];
  const selDate = new Date(Number(selected.slice(0, 4)), Number(selected.slice(5, 7)) - 1, Number(selected.slice(8, 10)));
  const selLabel = selDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // route for the selected day, in the order it's scheduled
  const stops = selEntries
    .map((e) => (e.job_id ? jobById[e.job_id]?.location : null))
    .filter((s): s is string => !!s && s.trim().length > 2);
  const routeUrl = (() => {
    if (stops.length === 0) return null;
    if (stops.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stops[0])}`;
    const dest = encodeURIComponent(stops[stops.length - 1]);
    const way = stops.slice(0, -1).map(encodeURIComponent).join("|");
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}&waypoints=${way}&travelmode=driving`;
  })();

  // this week strip (Sun–Sat containing today)
  const now = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    return iso(d.getFullYear(), d.getMonth(), d.getDate());
  });

  const input = "w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";

  function entryRow(e: Entry, compact = false) {
    const j = e.job_id ? jobById[e.job_id] : null;
    return (
      <div key={e.id} className={`flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-950 ${compact ? "px-2.5 py-1.5" : "px-3.5 py-2.5"}`}>
        <span className={`shrink-0 w-2 h-2 rounded-full ${j ? DOT[j.status] ?? "bg-neutral-600" : "bg-neutral-600"}`} />
        <div className="min-w-0 flex-1">
          <div className={`font-semibold text-white truncate ${compact ? "text-xs" : "text-sm"}`}>{j ? (j.job_name || j.customer) : e.label}</div>
          {j && !compact ? <div className="text-xs text-neutral-500 truncate">{[j.customer, j.location, j.job].filter(Boolean).join(" · ")}</div> : null}
          {compact && e.assignee ? (
            <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-px rounded-full border ${crewCls(e.assignee)}`}>{e.assignee}</span>
          ) : null}
        </div>
        {!compact ? (
          <select value={e.assignee ?? ""} onChange={(ev) => setAssignee(e, ev.target.value)}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${e.assignee ? crewCls(e.assignee) : "border-neutral-700 bg-neutral-900 text-neutral-500"}`}>
            <option value="">unassigned</option>
            {crew.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
          </select>
        ) : null}
        {j && !compact ? (
          <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_META[j.status]?.cls ?? ""}`}>{STATUS_META[j.status]?.label}</span>
        ) : null}
        {!compact ? (
          <span className="shrink-0 flex items-center">
            <button onClick={() => move(e, -1)} title="Move back a day" className="text-neutral-600 hover:text-neutral-300 text-sm px-1">‹</button>
            <button onClick={() => move(e, 1)} title="Push a day" className="text-neutral-600 hover:text-neutral-300 text-sm px-1">›</button>
            <button onClick={() => removeEntry(e)} className="text-neutral-600 hover:text-red-400 text-sm px-1" aria-label="Remove">✕</button>
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="pt-1">
      {/* month header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => shift(-1)} className="w-9 h-9 rounded-lg border border-neutral-700 text-neutral-300 text-lg">‹</button>
        <div className="text-center">
          <div className="font-bold text-white">{monthName}</div>
          {(year !== ty || month !== tm) ? (
            <button onClick={() => { setYear(ty); setMonth(tm); setSelected(today); }} className="text-[11px] text-blue-300 font-semibold">Back to today</button>
          ) : null}
        </div>
        <button onClick={() => shift(1)} className="w-9 h-9 rounded-lg border border-neutral-700 text-neutral-300 text-lg">›</button>
      </div>

      {/* crew filter */}
      {crew.length ? (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button onClick={() => setFilterWho("")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${filterWho === "" ? "border-white bg-neutral-800 text-white" : "border-neutral-700 text-neutral-400"}`}>
            Everyone
          </button>
          {crew.map((w) => (
            <button key={w.name} onClick={() => setFilterWho(filterWho === w.name ? "" : w.name)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${filterWho === w.name ? crewCls(w.name) : "border-neutral-700 text-neutral-400"}`}>
              {w.name}
            </button>
          ))}
        </div>
      ) : null}

      {/* weekday header */}
      <div className="grid grid-cols-7 mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold uppercase text-neutral-500 py-1">{d}</div>
        ))}
      </div>

      {/* calendar grid */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const ds = iso(year, month, d);
          const dayEntries = byDate[ds] ?? [];
          const isToday = ds === today;
          const isSel = ds === selected;
          return (
            <button key={i} onClick={() => setSelected(ds)}
              className={`min-h-[66px] rounded-lg border p-1 flex flex-col gap-0.5 ${isSel ? "border-white bg-neutral-800" : isToday ? "border-blue-400/60 bg-neutral-900" : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"}`}>
              <span className={`self-center text-xs font-bold leading-none ${isToday ? "text-blue-300" : isSel ? "text-white" : "text-neutral-300"}`}>{d}</span>
              <span className="w-full flex flex-col gap-0.5 overflow-hidden">
                {dayEntries.slice(0, 3).map((e) => {
                  const j = e.job_id ? jobById[e.job_id] : null;
                  const name = j ? j.customer : (e.label ?? "");
                  return <span key={e.id} className={`w-full truncate rounded px-0.5 py-px text-[8px] font-semibold leading-tight text-left ${j ? CHIP[j.status] ?? "bg-neutral-800 text-neutral-300" : "bg-neutral-800 text-neutral-300"}`}>{name}</span>;
                })}
                {dayEntries.length > 3 ? <span className="text-[8px] text-neutral-400 leading-none pl-0.5">+{dayEntries.length - 3}</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* selected day */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/95 p-4 mb-4">
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className="text-sm font-extrabold text-white">{selLabel}</h2>
          <span className="text-xs text-neutral-500">{selEntries.length} scheduled</span>
        </div>
        {loading ? <p className="text-sm text-neutral-500">Loading…</p> : null}
        {!loading && selEntries.length === 0 ? <p className="text-sm text-neutral-500 mb-2">Nothing scheduled.</p> : null}
        <div className="space-y-1.5 mb-3">{selEntries.map((e) => entryRow(e))}</div>

        {routeUrl ? (
          <a href={routeUrl} target="_blank" rel="noopener noreferrer"
            className="mb-3 flex items-center justify-center gap-2 rounded-xl border border-neutral-700 py-2 text-xs font-bold text-neutral-200 hover:border-neutral-500">
            🧭 Map the day — {stops.length} stop{stops.length === 1 ? "" : "s"} in order
          </a>
        ) : null}

        <div className="space-y-2">
          <select className={input} value={addJobId} onChange={(e) => { setAddJobId(e.target.value); if (e.target.value) setAddLabel(""); }}>
            <option value="">Pick a job from the pipeline…</option>
            {activeJobs.map((j) => (
              <option key={j.id} value={j.id}>{j.priority ? "★ " : ""}{j.job_name || j.customer}{j.location ? " — " + j.location : ""} ({STATUS_META[j.status]?.label})</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input className={input} placeholder="…or type anything (shop day, dump run)" value={addLabel}
              onChange={(e) => { setAddLabel(e.target.value); if (e.target.value) setAddJobId(""); }} />
            <select className="shrink-0 rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-2 text-sm" value={addWho} onChange={(e) => setAddWho(e.target.value)}>
              <option value="">Who?</option>
              {crew.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
            </select>
            <button onClick={addEntry} disabled={busy || (!addJobId && !addLabel.trim())}
              className="shrink-0 rounded-lg bg-white text-neutral-900 px-4 text-sm font-semibold disabled:opacity-50">Add</button>
          </div>
        </div>
      </div>

      {/* this week */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/95 p-4">
        <h2 className="text-sm font-extrabold text-white mb-2.5">This week</h2>
        <div className="space-y-2">
          {weekDays.map((ds) => {
            const list = byDate[ds] ?? [];
            const d = new Date(Number(ds.slice(0, 4)), Number(ds.slice(5, 7)) - 1, Number(ds.slice(8, 10)));
            return (
              <button key={ds} onClick={() => { setSelected(ds); if (d.getMonth() !== month || d.getFullYear() !== year) { setYear(d.getFullYear()); setMonth(d.getMonth()); } window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className={`w-full text-left flex gap-3 rounded-xl border px-3 py-2 ${ds === today ? "border-blue-400/50 bg-neutral-950" : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"}`}>
                <div className="shrink-0 w-10 text-center">
                  <div className="text-[10px] uppercase font-bold text-neutral-500">{d.toLocaleDateString("en-US", { weekday: "short" })}</div>
                  <div className={`text-sm font-bold ${ds === today ? "text-blue-300" : "text-white"}`}>{d.getDate()}</div>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  {list.length === 0 ? <div className="text-xs text-neutral-600 py-1.5">—</div> : list.map((e) => entryRow(e, true))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
