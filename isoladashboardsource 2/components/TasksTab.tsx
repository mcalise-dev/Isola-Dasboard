"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Job, jobLabel } from "@/lib/format";

type Task = {
  id: string;
  title: string;
  job_id: string | null;
  done: boolean;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  timeframe: string | null;
  created_at: string;
  completed_at: string | null;
};

const TIMEFRAMES = ["Short term", "Long term", "Ongoing", "Someday"];
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDue = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const PRIO_CLS: Record<string, string> = {
  high: "bg-red-500/15 text-red-300 border-red-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  low: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30",
};
const PRIO_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function TasksTab() {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState("");
  const [prio, setPrio] = useState("medium");
  const [jobId, setJobId] = useState("");
  const [when, setWhen] = useState("");
  const [due, setDue] = useState("");

  async function load() {
    const [t, j] = await Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("jobs").select("id,job_name,customer,location,job,status").order("customer"),
    ]);
    setTasks((t.data as Task[]) ?? []);
    setJobs((j.data as Job[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);
  const sortKey = (t: Task) => (t.due_date ? "0" + t.due_date : t.timeframe === "Short term" ? "1" : t.timeframe === "Ongoing" ? "2" : t.timeframe === "Long term" ? "3" : t.timeframe === "Someday" ? "4" : "2z");
  const openTasks = tasks.filter((t) => !t.done).sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority]);
  const doneTasks = tasks.filter((t) => t.done);
  const sections = useMemo(() => {
    const today = todayISO();
    const buckets: { key: string; label: string; cls: string; items: Task[] }[] = [
      { key: "overdue", label: "Overdue", cls: "text-red-400", items: [] },
      { key: "today", label: "Today", cls: "text-amber-300", items: [] },
      { key: "upcoming", label: "Upcoming", cls: "text-neutral-400", items: [] },
      { key: "Short term", label: "Short term", cls: "text-neutral-500", items: [] },
      { key: "Ongoing", label: "Ongoing", cls: "text-neutral-500", items: [] },
      { key: "Long term", label: "Long term", cls: "text-neutral-500", items: [] },
      { key: "Someday", label: "Someday", cls: "text-neutral-600", items: [] },
      { key: "nodate", label: "No date", cls: "text-neutral-600", items: [] },
    ];
    const find = (k: string) => buckets.find((b) => b.key === k)!;
    openTasks.forEach((t) => {
      if (t.due_date) {
        if (t.due_date < today) find("overdue").items.push(t);
        else if (t.due_date === today) find("today").items.push(t);
        else find("upcoming").items.push(t);
      } else if (t.timeframe && buckets.some((b) => b.key === t.timeframe)) find(t.timeframe).items.push(t);
      else find("nodate").items.push(t);
    });
    return buckets.filter((b) => b.items.length);
  }, [openTasks]);

  async function add() {
    if (!title.trim()) return;
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(), priority: prio, job_id: jobId || null,
      due_date: when === "date" && due ? due : null,
      timeframe: when && when !== "date" ? when : null,
    });
    if (error) { alert("Add failed: " + error.message); return; }
    setTitle(""); setJobId(""); setWhen(""); setDue("");
    load();
  }

  async function toggle(t: Task) {
    await supabase.from("tasks").update({ done: !t.done, completed_at: !t.done ? new Date().toISOString() : null }).eq("id", t.id);
    load();
  }

  async function remove(t: Task) {
    if (!confirm("Delete this task?")) return;
    await supabase.from("tasks").delete().eq("id", t.id);
    load();
  }

  const input = "rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";

  function row(t: Task) {
    return (
      <div key={t.id} className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-3">
        <button onClick={() => toggle(t)} aria-label="Toggle done" className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center text-[11px] ${t.done ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300" : "border-neutral-600 text-transparent"}`}>
          ✓
        </button>
        <div className="flex-1 min-w-0">
          <div className={`text-sm ${t.done ? "line-through text-neutral-500" : "text-white"}`}>{t.title}</div>
          <div className="text-xs text-neutral-500 truncate">
            {t.due_date ? (
              <span className={!t.done && t.due_date <= todayISO() ? "text-red-400 font-semibold" : t.due_date ? "text-neutral-400" : ""}>
                {!t.done && t.due_date < todayISO() ? "Overdue · " : "Due "}{fmtDue(t.due_date)}
              </span>
            ) : t.timeframe ? <span>{t.timeframe}</span> : null}
            {t.job_id && jobById[t.job_id] ? <span>{(t.due_date || t.timeframe) ? " · " : ""}{jobLabel(jobById[t.job_id])}</span> : null}
          </div>
        </div>
        {!t.done ? (
          <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${PRIO_CLS[t.priority]}`}>{t.priority}</span>
        ) : null}
        <button onClick={() => remove(t)} className="shrink-0 text-neutral-600 hover:text-red-400 text-sm" aria-label="Delete">✕</button>
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3.5 mb-4 space-y-2.5">
        <input className={`${input} w-full`} placeholder="New task…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <div className="flex gap-2">
          <select className={`${input} flex-1 min-w-0`} value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">No job</option>
            {jobs.filter((j) => j.status !== "complete").map((j) => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
          </select>
          <select className={input} value={prio} onChange={(e) => setPrio(e.target.value)}>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </div>
        <div className="flex gap-2">
          <select className={`${input} flex-1 min-w-0`} value={when} onChange={(e) => setWhen(e.target.value)}>
            <option value="">When? (optional)</option>
            <option value="date">Specific date…</option>
            {TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {when === "date" ? <input type="date" className={input} value={due} onChange={(e) => setDue(e.target.value)} /> : null}
          <button onClick={add} className="rounded-lg bg-white text-neutral-900 px-4 text-sm font-semibold">Add</button>
        </div>
      </div>

      {loading ? <p className="text-neutral-500 text-sm">Loading…</p> : null}
      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s.key}>
            <div className={`flex items-baseline gap-2 pb-1.5 text-[11px] font-bold uppercase tracking-widest ${s.cls}`}>
              {s.label}<span className="text-neutral-600 font-semibold">{s.items.length}</span>
            </div>
            <div className="space-y-2">{s.items.map(row)}</div>
          </div>
        ))}
      </div>
      {!loading && openTasks.length === 0 ? <p className="text-neutral-500 text-sm">Nothing open. 🎉</p> : null}

      {doneTasks.length ? (
        <div className="mt-6">
          <button onClick={() => setShowDone(!showDone)} className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
            {showDone ? "Hide" : "Show"} completed ({doneTasks.length})
          </button>
          {showDone ? <div className="space-y-2 mt-2.5">{doneTasks.map(row)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
