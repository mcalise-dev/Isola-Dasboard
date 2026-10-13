"use client";
// v5.4 owner plan of action: same phase-grouped view the crew sees, plus remove, templates,
// and adding a step straight into a phase ("PREP: Dig the trench").
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError } from "@/components/Toaster";
import { PlanView, Ring, splitPhase, phaseTitle, DayPicker, dayChipLabel, type DayKey } from "@/components/field/jobkit";
import { ListChecks, Plus, CalendarDays } from "lucide-react";

export default function JobChecklist({ jobId, jobType }: { jobId: string; jobType?: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [adding, setAdding] = useState("");
  const [phase, setPhase] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [dates, setDates] = useState<string[]>([]);
  const [day, setDay] = useState<DayKey>("all");
  const [daysOpen, setDaysOpen] = useState(false);

  async function load() {
    const [{ data: it }, { data: tp }, { data: sc }] = await Promise.all([
      supabase.from("job_checklist").select("*").eq("job_id", jobId).order("sort").order("created_at"),
      supabase.from("scope_templates").select("*").order("name"),
      supabase.from("schedule_entries").select("entry_date").eq("job_id", jobId),
    ]);
    setItems(it ?? []); setTemplates(tp ?? []);
    setDates([...new Set<string>([...(sc ?? []).map((r: any) => r.entry_date), ...(it ?? []).map((r: any) => r.work_date)].filter(Boolean))].sort());
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);

  async function toggle(id: string, done: boolean) {
    setItems((s) => s.map((x) => (x.id === id ? { ...x, done, done_by: done ? "Mike" : null, done_at: done ? new Date().toISOString() : null } : x)));
    const { error } = await supabase.from("job_checklist").update({ done }).eq("id", id);
    if (error) showError("Couldn't save: " + error.message);
    load();
  }

  async function add() {
    const text = adding.trim();
    if (!text) return;
    setBusy(true);
    const label = phase && !/^[A-Z][A-Z ]{1,14}:/.test(text) ? `${phase}: ${text}` : text;
    // insert right after the last step of that phase so phases stay together
    const inPhase = items.filter((x) => splitPhase(x.label).phase === phase);
    const after = inPhase.length ? Math.max(...inPhase.map((x) => x.sort ?? 0)) : Math.max(-1, ...items.map((x) => x.sort ?? 0));
    if (inPhase.length) {
      const bump = items.filter((x) => (x.sort ?? 0) > after);
      await Promise.all(bump.map((x) => supabase.from("job_checklist").update({ sort: (x.sort ?? 0) + 1 }).eq("id", x.id)));
    }
    const phaseDays = inPhase.map((x) => x.work_date).filter(Boolean);
    const work_date = /^\d{4}-/.test(day) ? day : phaseDays[phaseDays.length - 1] ?? null;
    const { error } = await supabase.from("job_checklist").insert({ job_id: jobId, label, sort: after + 1, work_date });
    if (error) showError("Couldn't add: " + error.message);
    setAdding(""); setBusy(false); load();
  }

  async function setPhaseDay(phase: string, work_date: string | null) {
    const ids = items.filter((x) => splitPhase(x.label).phase === phase).map((x) => x.id);
    setItems((s) => s.map((x) => (ids.includes(x.id) ? { ...x, work_date } : x)));
    const { error } = await supabase.from("job_checklist").update({ work_date }).in("id", ids);
    if (error) showError("Couldn't save: " + error.message);
    load();
  }

  async function remove(id: string) {
    setItems((s) => s.filter((x) => x.id !== id));
    const { error } = await supabase.from("job_checklist").delete().eq("id", id);
    if (error) showError("Couldn't remove: " + error.message);
    load();
  }

  async function applyTemplate(t: any) {
    const list: string[] = Array.isArray(t.checklist) ? t.checklist : [];
    if (list.length === 0) { setPickOpen(false); return; }
    setBusy(true);
    const base = Math.max(-1, ...items.map((x) => x.sort ?? 0)) + 1;
    await supabase.from("job_checklist").insert(list.map((label, i) => ({ job_id: jobId, label, sort: base + i })));
    setBusy(false); setPickOpen(false); load();
  }

  const hasBefore = items.some((x) => !x.work_date);
  const useDays = dates.length > 0;
  const stepIn = (k: any, key: DayKey) => key === "all" || (key === "before" ? !k.work_date : k.work_date === key);
  const shown = items.filter((k) => stepIn(k, day));
  const dayProgress = (key: DayKey) => { const l = items.filter((k) => stepIn(k, key)); return { done: l.filter((k) => k.done).length, total: l.length }; };
  const done = items.filter((i) => i.done).length;
  const phases = [...new Set(items.map((x) => splitPhase(x.label).phase))];
  const suggested = templates.filter((t) => jobType && String(t.job_type ?? "").toLowerCase() && String(jobType).toLowerCase().includes(String(t.job_type).toLowerCase()));

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        {items.length ? <Ring value={done / items.length} size={48} stroke={5} /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-neutral-400"><ListChecks size={20} /></span>}
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-white">To do</h2>
          <p className="text-sm text-neutral-400">{items.length ? `${done} of ${items.length} steps done · ${phases.length} phase${phases.length === 1 ? "" : "s"}` : "No steps yet"}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {useDays && items.length ? (
            <button onClick={() => setDaysOpen(!daysOpen)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 min-h-[36px] text-[13px] font-semibold text-neutral-300 hover:text-white">
              <CalendarDays size={14} />{daysOpen ? "Close" : "Set days"}
            </button>
          ) : null}
          <button onClick={() => setPickOpen(!pickOpen)} className="rounded-lg border border-white/[0.12] px-3 min-h-[36px] text-[13px] font-semibold text-neutral-300 hover:text-white">
            {pickOpen ? "Close" : "Use a template"}
          </button>
        </div>
      </div>

      {daysOpen ? (
        <div className="mb-3 rounded-2xl border border-white/[0.08] bg-neutral-950 p-3">
          <p className="mb-2 text-[13px] text-neutral-400">Which day does each phase happen? The crew sees one day at a time.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {phases.map((p) => {
              const ds = items.filter((x) => splitPhase(x.label).phase === p).map((x) => x.work_date ?? "");
              const v = ds.every((x) => x === ds[0]) ? ds[0] : "mixed";
              return (
                <label key={p || "_"} className="flex items-center gap-2 rounded-xl border border-white/[0.06] px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{phaseTitle(p)}</span>
                  <select value={v} onChange={(e) => setPhaseDay(p, e.target.value || null)}
                    className="rounded-lg border border-white/[0.12] bg-neutral-900 px-2 min-h-[36px] text-sm text-white">
                    {v === "mixed" ? <option value="mixed" disabled>Mixed</option> : null}
                    <option value="">Before / no day</option>
                    {dates.map((d) => <option key={d} value={d}>{dayChipLabel(d, dates).top} · {dayChipLabel(d, dates).sub}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
          {dates.length === 0 ? <p className="text-sm text-neutral-500">Put this job on the schedule first to get days.</p> : null}
        </div>
      ) : null}

      {useDays && items.length ? <div className="mb-3"><DayPicker value={day} onChange={setDay} dates={dates} hasBefore={hasBefore} progress={dayProgress} /></div> : null}

      {pickOpen ? (
        <div className="mb-3 grid gap-1.5 sm:grid-cols-2">
          {(suggested.length ? suggested : templates).map((t) => (
            <button key={t.id} onClick={() => applyTemplate(t)} disabled={busy}
              className="rounded-xl border border-white/[0.08] bg-neutral-950 px-3.5 py-2.5 text-left hover:border-white/25 disabled:opacity-50">
              <div className="text-sm font-semibold text-white">{t.name}</div>
              <div className="text-[13px] text-neutral-400">{(t.checklist?.length ?? 0)} steps{t.job_type ? " · " + t.job_type : ""}</div>
            </button>
          ))}
          {templates.length === 0 ? <p className="text-sm text-neutral-500">No templates saved yet.</p> : null}
        </div>
      ) : null}

      {items.length ? (shown.length ? <PlanView list={shown} onToggle={toggle} onRemove={remove} /> : <div className="rounded-2xl border border-dashed border-white/10 px-5 py-6 text-center text-sm text-neutral-400">Nothing set for this day.</div>) : !pickOpen ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-neutral-400">Add the first step below, or start from a template.</div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select value={phase} onChange={(e) => setPhase(e.target.value)} aria-label="Phase"
          className="rounded-xl border border-white/[0.12] bg-neutral-950 px-3 min-h-[44px] text-sm text-white focus:outline-none focus:border-neutral-400 sm:w-48">
          <option value="">No phase</option>
          {phases.filter(Boolean).map((p) => <option key={p} value={p}>{phaseTitle(p)}</option>)}
        </select>
        <div className="flex min-w-0 flex-1 gap-2">
          <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add a step…"
            onKeyDown={(e) => e.key === "Enter" && add()}
            className="min-w-0 flex-1 rounded-xl border border-white/[0.12] bg-neutral-950 px-3.5 min-h-[44px] text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400" />
          <button onClick={add} disabled={busy || !adding.trim()} aria-label="Add step"
            className="shrink-0 inline-flex items-center justify-center rounded-xl bg-white px-4 min-h-[44px] text-sm font-bold text-neutral-900 disabled:opacity-40"><Plus size={16} strokeWidth={2.6} /><span className="ml-1 hidden sm:inline">Add</span></button>
        </div>
      </div>
      <p className="mt-1.5 text-[12px] text-neutral-500">Tip: start a step with a phase like “PREP:” or “POUR:” to make a new phase. New steps land on the day you're viewing, or the phase's day. The crew sees this exact list.</p>
    </div>
  );
}
