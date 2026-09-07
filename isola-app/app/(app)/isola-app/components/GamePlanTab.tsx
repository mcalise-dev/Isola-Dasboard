"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Job, jobLabel, todayISO } from "@/lib/format";

type Plan = {
  id: string;
  plan_date: string;
  headline: string | null;
  notes: string | null;
};
type Item = {
  id: string;
  plan_id: string;
  body: string;
  job_id: string | null;
  done: boolean;
  completed_at: string | null;
  sort_order: number;
};
type Sched = { id: string; label: string | null; job_id: string | null; jobs: { job_name: string | null; customer: string | null; location: string | null } | null };

const shiftDate = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};
const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
};
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

export default function GamePlanTab() {
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState(todayISO());
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sched, setSched] = useState<Sched[]>([]);
  const [recent, setRecent] = useState<{ plan_date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [headline, setHeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState("");
  const [draftJob, setDraftJob] = useState("");

  const loadPlan = useCallback(async (d: string) => {
    setLoading(true);
    const [p, s] = await Promise.all([
      supabase.from("game_plans").select("id,plan_date,headline,notes").eq("plan_date", d).maybeSingle(),
      supabase.from("schedule_entries").select("id,label,job_id,jobs(job_name,customer,location)").eq("entry_date", d).order("sort"),
    ]);
    const row = (p.data as Plan | null) ?? null;
    setPlan(row);
    setHeadline(row?.headline ?? "");
    setNotes(row?.notes ?? "");
    setSched(((s.data as unknown) as Sched[]) ?? []);
    if (row) {
      const it = await supabase.from("game_plan_items").select("*").eq("plan_id", row.id).order("sort_order").order("created_at");
      setItems((it.data as Item[]) ?? []);
    } else {
      setItems([]);
    }
    setLoading(false);
  }, [supabase]);

  const loadSide = useCallback(async () => {
    const [j, r] = await Promise.all([
      supabase.from("jobs").select("id,job_name,customer,location,job,status").order("customer"),
      supabase.from("game_plans").select("plan_date").order("plan_date", { ascending: false }).limit(14),
    ]);
    setJobs((j.data as Job[]) ?? []);
    setRecent((r.data as { plan_date: string }[]) ?? []);
  }, [supabase]);

  useEffect(() => { loadSide(); }, [loadSide]);
  useEffect(() => { loadPlan(date); }, [date, loadPlan]);

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);
  const openJobs = useMemo(() => jobs.filter((j) => j.status !== "complete"), [jobs]);
  const doneCount = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  async function ensurePlan(): Promise<Plan | null> {
    if (plan) return plan;
    const { data, error } = await supabase
      .from("game_plans")
      .insert({ plan_date: date, headline: headline.trim() || null })
      .select("id,plan_date,headline,notes")
      .single();
    if (error) { alert("Could not start the game plan: " + error.message); return null; }
    const row = data as Plan;
    setPlan(row);
    loadSide();
    return row;
  }

  async function addItems() {
    const lines = draft.split("\n").map((l) => l.replace(/^\s*[-•*\d.)]+\s*/, "").trim()).filter(Boolean);
    if (!lines.length) return;
    const p = await ensurePlan();
    if (!p) return;
    const base = items.length ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
    const rows = lines.map((body, idx) => ({ plan_id: p.id, body, job_id: draftJob || null, sort_order: base + idx }));
    const { error } = await supabase.from("game_plan_items").insert(rows);
    if (error) { alert("Add failed: " + error.message); return; }
    setDraft(""); setDraftJob("");
    loadPlan(date);
  }

  async function toggle(it: Item) {
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)));
    await supabase.from("game_plan_items")
      .update({ done: !it.done, completed_at: !it.done ? new Date().toISOString() : null })
      .eq("id", it.id);
    loadPlan(date);
  }

  async function remove(it: Item) {
    if (!confirm("Delete this line?")) return;
    await supabase.from("game_plan_items").delete().eq("id", it.id);
    loadPlan(date);
  }

  async function saveHeader() {
    if (!plan) {
      if (!headline.trim() && !notes.trim()) return;
      const p = await ensurePlan();
      if (!p) return;
      await supabase.from("game_plans").update({ headline: headline.trim() || null, notes: notes.trim() || null, updated_at: new Date().toISOString() }).eq("id", p.id);
      return;
    }
    setSaving(true);
    await supabase.from("game_plans")
      .update({ headline: headline.trim() || null, notes: notes.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", plan.id);
    setSaving(false);
  }

  // Pull anything left unchecked on the most recent earlier plan into this one.
  async function carryOver() {
    const prev = await supabase.from("game_plans").select("id,plan_date").lt("plan_date", date).order("plan_date", { ascending: false }).limit(1).maybeSingle();
    const prevPlan = prev.data as { id: string; plan_date: string } | null;
    if (!prevPlan) { alert("No earlier game plan to pull from."); return; }
    const left = await supabase.from("game_plan_items").select("body,job_id,sort_order").eq("plan_id", prevPlan.id).eq("done", false).order("sort_order");
    const rows = (left.data as { body: string; job_id: string | null; sort_order: number }[]) ?? [];
    if (!rows.length) { alert(`Nothing was left open on ${shortDate(prevPlan.plan_date)}.`); return; }
    if (!confirm(`Bring over ${rows.length} unfinished line${rows.length === 1 ? "" : "s"} from ${shortDate(prevPlan.plan_date)}?`)) return;
    const p = await ensurePlan();
    if (!p) return;
    const base = items.length ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
    const { error } = await supabase.from("game_plan_items").insert(rows.map((r, idx) => ({ plan_id: p.id, body: r.body, job_id: r.job_id, sort_order: base + idx })));
    if (error) { alert("Carry-over failed: " + error.message); return; }
    loadPlan(date);
  }

  async function addSchedLine(s: Sched) {
    const label = s.jobs ? jobLabel(s.jobs) : (s.label ?? "");
    if (!label) return;
    const p = await ensurePlan();
    if (!p) return;
    const base = items.length ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
    await supabase.from("game_plan_items").insert({ plan_id: p.id, body: label, job_id: s.job_id, sort_order: base });
    loadPlan(date);
  }

  async function deletePlan() {
    if (!plan) return;
    if (!confirm(`Delete the whole game plan for ${shortDate(date)}? Every line goes with it.`)) return;
    await supabase.from("game_plans").delete().eq("id", plan.id);
    setPlan(null); setItems([]); setHeadline(""); setNotes("");
    loadSide();
  }

  const input = "rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
  const isToday = date === todayISO();

  return (
    <div className="space-y-4">
      {/* Date bar */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3.5">
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day"
            className="w-9 h-9 shrink-0 rounded-lg border border-neutral-700 text-neutral-300 text-sm font-bold">‹</button>
          <div className="flex-1 min-w-0 text-center">
            <div className="text-sm font-extrabold text-white truncate">{longDate(date)}</div>
            <div className="text-[11px] text-neutral-500">{isToday ? "Today" : plan ? "Saved plan" : "No plan yet"}</div>
          </div>
          <button onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day"
            className="w-9 h-9 shrink-0 rounded-lg border border-neutral-700 text-neutral-300 text-sm font-bold">›</button>
        </div>
        <div className="flex gap-2 mt-2.5">
          <input type="date" className={`${input} flex-1 min-w-0`} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          {!isToday ? <button onClick={() => setDate(todayISO())} className="rounded-lg border border-neutral-700 px-3 text-sm font-semibold text-neutral-200">Today</button> : null}
        </div>
      </div>

      {/* Headline + progress */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3.5 space-y-2.5">
        <input className={`${input} w-full font-semibold`} placeholder="Game plan for the day — one line (optional)"
          value={headline} onChange={(e) => setHeadline(e.target.value)} onBlur={saveHeader} />
        {items.length ? (
          <div>
            <div className="flex items-baseline justify-between text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
              <span>{doneCount} of {items.length} done</span><span className="tabular-nums">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: pct + "%" }} />
            </div>
          </div>
        ) : null}
      </div>

      {/* Add lines */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3.5 space-y-2.5">
        <textarea className={`${input} w-full h-24 resize-y`} placeholder={"Everything that needs to get done…\nOne per line — paste a whole list and each line becomes its own item."}
          value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addItems(); }} />
        <div className="flex gap-2">
          <select className={`${input} flex-1 min-w-0`} value={draftJob} onChange={(e) => setDraftJob(e.target.value)}>
            <option value="">No job</option>
            {openJobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
          </select>
          <button onClick={addItems} className="rounded-lg bg-white text-neutral-900 px-4 text-sm font-semibold">Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={carryOver} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-semibold text-neutral-300">↩︎ Carry over unfinished</button>
          {plan ? <button onClick={deletePlan} className="rounded-lg border border-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:text-red-400">Delete this plan</button> : null}
          {saving ? <span className="text-xs text-neutral-600 self-center">Saving…</span> : null}
        </div>
      </div>

      {/* On the schedule that day */}
      {sched.length ? (
        <div>
          <div className="pb-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-500">On the schedule</div>
          <div className="space-y-2">
            {sched.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <span className="flex-1 min-w-0 truncate text-sm text-neutral-300">{s.jobs ? jobLabel(s.jobs) : s.label}</span>
                <button onClick={() => addSchedLine(s)} className="shrink-0 text-xs font-semibold text-blue-300">+ Add</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* The plan */}
      {loading ? <p className="text-neutral-500 text-sm">Loading…</p> : null}
      {!loading && !items.length ? (
        <p className="text-neutral-500 text-sm">Nothing written down for {shortDate(date)} yet — type the day out above.</p>
      ) : null}
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-3">
            <button onClick={() => toggle(it)} aria-label="Toggle done"
              className={`w-5 h-5 mt-0.5 shrink-0 rounded-md border flex items-center justify-center text-[11px] ${it.done ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300" : "border-neutral-600 text-transparent"}`}>✓</button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm whitespace-pre-wrap break-words ${it.done ? "line-through text-neutral-500" : "text-white"}`}>{it.body}</div>
              {it.job_id && jobById[it.job_id] ? <div className="text-xs text-neutral-500 truncate">{jobLabel(jobById[it.job_id])}</div> : null}
            </div>
            <button onClick={() => remove(it)} className="shrink-0 text-neutral-600 hover:text-red-400 text-sm" aria-label="Delete">✕</button>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3.5">
        <div className="pb-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-500">Notes for the day</div>
        <textarea className={`${input} w-full h-24 resize-y`} placeholder="Anything that isn't a checkbox — who's on what, what to watch, what to order."
          value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveHeader} />
      </div>

      {/* Recent plans */}
      {recent.length ? (
        <div>
          <div className="pb-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-500">Recent game plans</div>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <button key={r.plan_date} onClick={() => setDate(r.plan_date)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${r.plan_date === date ? "border-neutral-400 bg-neutral-800 text-white" : "border-neutral-800 bg-neutral-950 text-neutral-400"}`}>
                {shortDate(r.plan_date)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
