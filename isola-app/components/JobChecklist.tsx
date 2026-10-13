"use client";
// v5.4 owner plan of action: same phase-grouped view the crew sees, plus remove, templates,
// and adding a step straight into a phase ("PREP: Dig the trench").
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError } from "@/components/Toaster";
import { PlanView, Ring, splitPhase, phaseTitle } from "@/components/field/jobkit";
import { ListChecks, Plus } from "lucide-react";

export default function JobChecklist({ jobId, jobType }: { jobId: string; jobType?: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [adding, setAdding] = useState("");
  const [phase, setPhase] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);

  async function load() {
    const [{ data: it }, { data: tp }] = await Promise.all([
      supabase.from("job_checklist").select("*").eq("job_id", jobId).order("sort").order("created_at"),
      supabase.from("scope_templates").select("*").order("name"),
    ]);
    setItems(it ?? []); setTemplates(tp ?? []);
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
    const { error } = await supabase.from("job_checklist").insert({ job_id: jobId, label, sort: after + 1 });
    if (error) showError("Couldn't add: " + error.message);
    setAdding(""); setBusy(false); load();
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

  const done = items.filter((i) => i.done).length;
  const phases = [...new Set(items.map((x) => splitPhase(x.label).phase))];
  const suggested = templates.filter((t) => jobType && String(t.job_type ?? "").toLowerCase() && String(jobType).toLowerCase().includes(String(t.job_type).toLowerCase()));

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        {items.length ? <Ring value={done / items.length} size={48} stroke={5} /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-neutral-400"><ListChecks size={20} /></span>}
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-white">Plan of action</h2>
          <p className="text-sm text-neutral-400">{items.length ? `${done} of ${items.length} steps done · ${phases.length} phase${phases.length === 1 ? "" : "s"}` : "No steps yet"}</p>
        </div>
        <button onClick={() => setPickOpen(!pickOpen)} className="shrink-0 rounded-lg border border-white/[0.12] px-3 min-h-[36px] text-[13px] font-semibold text-neutral-300 hover:text-white">
          {pickOpen ? "Close" : "Use a template"}
        </button>
      </div>

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

      {items.length ? <PlanView list={items} onToggle={toggle} onRemove={remove} /> : !pickOpen ? (
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
      <p className="mt-1.5 text-[12px] text-neutral-500">Tip: start a step with a phase like “PREP:” or “POUR:” to make a new phase. The crew sees this exact list.</p>
    </div>
  );
}
