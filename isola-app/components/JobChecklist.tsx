"use client";
// v5.7 owner "To do" builder: build the whole plan of action from the app —
// phases, steps, which day, who's responsible — with templates, tap-to-edit and Clear this day.
// The crew sees this exact list (one day at a time).
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError, showToast } from "@/components/Toaster";
import { ask, askText } from "@/components/Dialogs";
import { PlanView, Ring, splitPhase, phaseTitle, DayPicker, dayChipLabel, type DayKey, type Step } from "@/components/field/jobkit";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ListChecks, Plus, CalendarDays, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const NEW_PHASE = "__new__";
const field = "rounded-xl border border-white/[0.12] bg-neutral-950 px-3 min-h-[44px] text-sm text-white focus:outline-none focus:border-neutral-400";

export default function JobChecklist({ jobId, jobType }: { jobId: string; jobType?: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [people, setPeople] = useState<string[]>(["Mike"]);
  const [dates, setDates] = useState<string[]>([]);
  const [day, setDay] = useState<DayKey>("all");
  const [daysOpen, setDaysOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // add row
  const [text, setText] = useState("");
  const [phase, setPhase] = useState("");
  const [newDay, setNewDay] = useState<string>("");
  const [who, setWho] = useState("");
  // edit dialog
  const [edit, setEdit] = useState<any | null>(null);

  async function load() {
    const [{ data: it }, { data: tp }, { data: sc }, { data: w }] = await Promise.all([
      supabase.from("job_checklist").select("*").eq("job_id", jobId).order("sort").order("created_at"),
      supabase.from("scope_templates").select("*").order("name"),
      supabase.from("schedule_entries").select("entry_date").eq("job_id", jobId),
      supabase.from("workers").select("name").eq("active", true).eq("is_owner", false).order("name"),
    ]);
    setItems(it ?? []); setTemplates(tp ?? []);
    setPeople(["Mike", ...((w ?? []).map((r: any) => r.name))]);
    setDates([...new Set<string>([...(sc ?? []).map((r: any) => r.entry_date), ...(it ?? []).map((r: any) => r.work_date)].filter(Boolean))].sort());
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);
  // the add row follows the day you're looking at
  useEffect(() => { setNewDay(/^\d{4}-/.test(day) ? day : ""); }, [day]);

  const phases = [...new Set(items.map((x) => splitPhase(x.label).phase))];
  const hasBefore = items.some((x) => !x.work_date);
  const useDays = dates.length > 0;
  const stepIn = (k: any, key: DayKey) => key === "all" || (key === "before" ? !k.work_date : k.work_date === key);
  const shown = items.filter((k) => stepIn(k, day));
  const dayProgress = (key: DayKey) => { const l = items.filter((k) => stepIn(k, key)); return { done: l.filter((k) => k.done).length, total: l.length }; };
  const done = items.filter((i) => i.done).length;

  async function pickPhase(v: string, set: (p: string) => void) {
    if (v !== NEW_PHASE) { set(v); return; }
    const name = await askText({ title: "New phase", placeholder: "e.g. Demo, Pour, Cleanup", confirm: "Add phase" });
    if (name && name.trim()) set(name.trim().toUpperCase().replace(/:/g, "").slice(0, 15));
  }
  const withPhase = (ph: string, t: string) => (ph ? `${ph}: ${t}` : t);

  async function toggle(id: string, d: boolean) {
    setItems((s) => s.map((x) => (x.id === id ? { ...x, done: d, done_by: d ? "Mike" : null, done_at: d ? new Date().toISOString() : null } : x)));
    const { error } = await supabase.from("job_checklist").update({ done: d }).eq("id", id);
    if (error) showError("Couldn't save: " + error.message);
    load();
  }

  async function add() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    const label = /^[A-Z][A-Z ]{1,14}:/.test(t) ? t : withPhase(phase, t);
    const ph = splitPhase(label).phase;
    const inPhase = items.filter((x) => splitPhase(x.label).phase === ph);
    const after = inPhase.length ? Math.max(...inPhase.map((x) => x.sort ?? 0)) : Math.max(-1, ...items.map((x) => x.sort ?? 0));
    if (inPhase.length) {
      const bump = items.filter((x) => (x.sort ?? 0) > after);
      await Promise.all(bump.map((x) => supabase.from("job_checklist").update({ sort: (x.sort ?? 0) + 1 }).eq("id", x.id)));
    }
    const { error } = await supabase.from("job_checklist").insert({ job_id: jobId, label, sort: after + 1, work_date: newDay || null, assignee: who || null });
    if (error) showError("Couldn't add: " + error.message);
    setText(""); setBusy(false); load();
  }

  async function remove(id: string) {
    setItems((s) => s.filter((x) => x.id !== id));
    const { error } = await supabase.from("job_checklist").delete().eq("id", id);
    if (error) showError("Couldn't remove: " + error.message);
    load();
  }

  async function clearDay() {
    const ids = shown.map((x) => x.id);
    if (!ids.length) return;
    const name = day === "before" ? "the Before list" : day === "all" ? "the whole list" : dayChipLabel(day, dates).top;
    if (!(await ask({ title: `Clear ${name}?`, body: `This removes ${ids.length} step${ids.length > 1 ? "s" : ""}. Other days aren't touched.`, confirm: "Clear", danger: true }))) return;
    setItems((s) => s.filter((x) => !ids.includes(x.id)));
    const { error } = await supabase.from("job_checklist").delete().in("id", ids);
    if (error) showError("Couldn't clear: " + error.message); else showToast(`Cleared ${ids.length} step${ids.length > 1 ? "s" : ""}`);
    load();
  }

  async function setPhaseDay(ph: string, work_date: string | null) {
    const ids = items.filter((x) => splitPhase(x.label).phase === ph).map((x) => x.id);
    setItems((s) => s.map((x) => (ids.includes(x.id) ? { ...x, work_date } : x)));
    const { error } = await supabase.from("job_checklist").update({ work_date }).in("id", ids);
    if (error) showError("Couldn't save: " + error.message);
    load();
  }
  async function setPhaseWho(ph: string, assignee: string | null) {
    const ids = items.filter((x) => splitPhase(x.label).phase === ph).map((x) => x.id);
    setItems((s) => s.map((x) => (ids.includes(x.id) ? { ...x, assignee } : x)));
    const { error } = await supabase.from("job_checklist").update({ assignee }).in("id", ids);
    if (error) showError("Couldn't save: " + error.message);
    load();
  }
  async function renamePhase(ph: string) {
    const name = await askText({ title: "Rename phase", initial: ph, confirm: "Rename" });
    if (!name || !name.trim()) return;
    const np = name.trim().toUpperCase().replace(/:/g, "").slice(0, 15);
    const rows = items.filter((x) => splitPhase(x.label).phase === ph);
    await Promise.all(rows.map((x) => supabase.from("job_checklist").update({ label: withPhase(np, splitPhase(x.label).text) }).eq("id", x.id)));
    load();
  }

  async function saveEdit() {
    if (!edit) return;
    const t = String(edit.text ?? "").trim();
    if (!t) { showError("Write what needs doing."); return; }
    const { error } = await supabase.from("job_checklist").update({
      label: withPhase(edit.phase, t), work_date: edit.work_date || null, assignee: edit.assignee || null,
    }).eq("id", edit.id);
    if (error) { showError("Couldn't save: " + error.message); return; }
    setEdit(null); load();
  }

  async function applyTemplate(t: any) {
    const list: string[] = Array.isArray(t.checklist) ? t.checklist : [];
    if (list.length === 0) { setPickOpen(false); return; }
    setBusy(true);
    const base = Math.max(-1, ...items.map((x) => x.sort ?? 0)) + 1;
    await supabase.from("job_checklist").insert(list.map((label, i) => ({ job_id: jobId, label, sort: base + i, work_date: /^\d{4}-/.test(day) ? day : null })));
    setBusy(false); setPickOpen(false); load();
  }

  async function saveAsTemplate() {
    if (!items.length) return;
    const name = await askText({ title: "Save this to-do as a template", placeholder: "e.g. Drainage / channel drain", initial: jobType ?? "", confirm: "Save template" });
    if (!name || !name.trim()) return;
    const { error } = await supabase.from("scope_templates").insert({ name: name.trim(), job_type: jobType ?? null, checklist: items.map((x) => x.label) });
    if (error) showError("Couldn't save template: " + error.message); else { showToast("Template saved"); load(); }
  }

  const suggested = templates.filter((t) => jobType && String(t.job_type ?? "").toLowerCase() && String(jobType).toLowerCase().includes(String(t.job_type).toLowerCase()));
  const dayOpts = (<>
    <option value="">Before / no day</option>
    {dates.map((d) => <option key={d} value={d}>{dayChipLabel(d, dates).top} · {dayChipLabel(d, dates).sub}</option>)}
  </>);
  const whoOpts = (<>
    <option value="">Anyone</option>
    {people.map((p) => <option key={p} value={p}>{p}</option>)}
  </>);
  const phaseOpts = (cur: string) => (<>
    <option value="">No phase</option>
    {[...new Set([...phases.filter(Boolean), ...(cur ? [cur] : [])])].map((p) => <option key={p} value={p}>{phaseTitle(p)}</option>)}
    <option value={NEW_PHASE}>+ New phase…</option>
  </>);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {items.length ? <Ring value={done / items.length} size={48} stroke={5} /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-neutral-400"><ListChecks size={20} /></span>}
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-white">To do</h2>
          <p className="text-sm text-neutral-400">{items.length ? `${done} of ${items.length} steps done · ${phases.filter(Boolean).length} phases` : "No steps yet"}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {items.length ? (
            <button onClick={() => setDaysOpen(!daysOpen)} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 min-h-[36px] text-[13px] font-semibold", daysOpen ? "border-white bg-white text-neutral-900" : "border-white/[0.12] text-neutral-300 hover:text-white")}>
              <CalendarDays size={14} />Phases & days
            </button>
          ) : null}
          <button onClick={() => setPickOpen(!pickOpen)} className="rounded-lg border border-white/[0.12] px-3 min-h-[36px] text-[13px] font-semibold text-neutral-300 hover:text-white">
            {pickOpen ? "Close" : "Templates"}
          </button>
        </div>
      </div>

      {pickOpen ? (
        <div className="mb-3 rounded-2xl border border-white/[0.08] bg-neutral-950 p-3">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(suggested.length ? suggested : templates).map((t) => (
              <button key={t.id} onClick={() => applyTemplate(t)} disabled={busy}
                className="rounded-xl border border-white/[0.08] bg-neutral-900 px-3.5 py-2.5 text-left hover:border-white/25 disabled:opacity-50">
                <div className="text-sm font-semibold text-white">{t.name}</div>
                <div className="text-[13px] text-neutral-400">{(t.checklist?.length ?? 0)} steps{t.job_type ? " · " + t.job_type : ""}</div>
              </button>
            ))}
          </div>
          {templates.length === 0 ? <p className="text-sm text-neutral-500">No templates saved yet.</p> : null}
          {items.length ? <button onClick={saveAsTemplate} className="mt-2 text-[13px] font-semibold text-neutral-300 underline underline-offset-2">Save this job's to-do as a template</button> : null}
        </div>
      ) : null}

      {daysOpen ? (
        <div className="mb-3 rounded-2xl border border-white/[0.08] bg-neutral-950 p-3">
          <p className="mb-2 text-[13px] text-neutral-400">Set the day and who's responsible for each phase at once. Tap a phase name to rename it. Change a single step by tapping it in the list.</p>
          <div className="space-y-2">
            {phases.map((p) => {
              const rows = items.filter((x) => splitPhase(x.label).phase === p);
              const ds = rows.map((x) => x.work_date ?? ""), ws = rows.map((x) => x.assignee ?? "");
              const dv = ds.every((x) => x === ds[0]) ? ds[0] : "mixed", wv = ws.every((x) => x === ws[0]) ? ws[0] : "mixed";
              return (
                <div key={p || "_"} className="grid grid-cols-2 items-center gap-2 rounded-xl border border-white/[0.06] p-2 sm:grid-cols-[1fr_200px_160px]">
                  <button type="button" disabled={!p} onClick={() => renamePhase(p)} className="col-span-2 truncate text-left text-sm font-semibold text-white sm:col-span-1 disabled:cursor-default">
                    {phaseTitle(p)} <span className="font-normal text-neutral-500">· {rows.length}</span>
                  </button>
                  <select value={dv} onChange={(e) => setPhaseDay(p, e.target.value || null)} className={field} aria-label="Day">
                    {dv === "mixed" ? <option value="mixed" disabled>Mixed days</option> : null}{dayOpts}
                  </select>
                  <select value={wv} onChange={(e) => setPhaseWho(p, e.target.value || null)} className={field} aria-label="Who">
                    {wv === "mixed" ? <option value="mixed" disabled>Mixed</option> : null}{whoOpts}
                  </select>
                </div>
              );
            })}
          </div>
          {dates.length === 0 ? <p className="mt-2 text-sm text-neutral-500">Put this job on the schedule to get days.</p> : null}
        </div>
      ) : null}

      {useDays && items.length ? (
        <div className="mb-3 flex items-center gap-2">
          <div className="min-w-0 flex-1"><DayPicker value={day} onChange={setDay} dates={dates} hasBefore={hasBefore} progress={dayProgress} /></div>
        </div>
      ) : null}

      {shown.length ? (
        <div className="mb-2 flex justify-end">
          <button onClick={clearDay} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 min-h-[34px] text-[13px] font-semibold text-neutral-400 hover:bg-red-500/10 hover:text-red-300">
            <Trash2 size={14} /> Clear {day === "all" ? "whole list" : day === "before" ? "Before" : "this day"}
          </button>
        </div>
      ) : null}

      {items.length ? (shown.length
        ? <PlanView list={shown as Step[]} onToggle={toggle} onRemove={remove} onEdit={(s) => { const sp = splitPhase(s.label); setEdit({ id: s.id, text: sp.text, phase: sp.phase, work_date: s.work_date ?? "", assignee: s.assignee ?? "" }); }} />
        : <div className="rounded-2xl border border-dashed border-white/10 px-5 py-6 text-center text-sm text-neutral-400">Nothing set for this day.</div>)
        : !pickOpen ? <div className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-neutral-400">Add the first step below, or start from a template.</div> : null}

      {/* add a step: what, phase, day, who */}
      <div className="mt-3 rounded-2xl border border-dashed border-white/[0.15] p-2.5">
        <div className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a step… e.g. Saw-cut the junction panels"
            onKeyDown={(e) => e.key === "Enter" && add()}
            className={cn(field, "min-w-0 flex-1 px-3.5")} />
          <button onClick={add} disabled={busy || !text.trim()} aria-label="Add step"
            className="shrink-0 inline-flex items-center justify-center gap-1 rounded-xl bg-white px-4 min-h-[44px] text-sm font-bold text-neutral-900 disabled:opacity-40"><Plus size={16} strokeWidth={2.6} /><span className="hidden sm:inline">Add</span></button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <select value={phase} onChange={(e) => pickPhase(e.target.value, setPhase)} className={field} aria-label="Phase">{phaseOpts(phase)}</select>
          <select value={newDay} onChange={(e) => setNewDay(e.target.value)} className={field} aria-label="Day">{dayOpts}</select>
          <select value={who} onChange={(e) => setWho(e.target.value)} className={field} aria-label="Who's responsible">{whoOpts}</select>
        </div>
      </div>
      <p className="mt-1.5 text-[12px] text-neutral-500">The crew sees this exact list, one day at a time. Tap any step to edit it.</p>

      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit step</DialogTitle></DialogHeader>
          {edit ? (
            <div className="space-y-3">
              <textarea value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} rows={3}
                className="w-full rounded-xl border border-white/[0.12] bg-neutral-950 px-3.5 py-2.5 text-[15px] text-white focus:outline-none focus:border-neutral-400" />
              <label className="block text-[13px] font-semibold text-neutral-400">Phase
                <select value={edit.phase} onChange={(e) => pickPhase(e.target.value, (p) => setEdit({ ...edit, phase: p }))} className={cn(field, "mt-1 w-full")}>{phaseOpts(edit.phase)}</select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[13px] font-semibold text-neutral-400">Day
                  <select value={edit.work_date} onChange={(e) => setEdit({ ...edit, work_date: e.target.value })} className={cn(field, "mt-1 w-full")}>{dayOpts}</select>
                </label>
                <label className="block text-[13px] font-semibold text-neutral-400">Who's responsible
                  <select value={edit.assignee} onChange={(e) => setEdit({ ...edit, assignee: e.target.value })} className={cn(field, "mt-1 w-full")}>{whoOpts}</select>
                </label>
              </div>
            </div>
          ) : null}
          <DialogFooter className="flex-row justify-between gap-2">
            <button onClick={() => { const id = edit?.id; setEdit(null); if (id) remove(id); }} className="inline-flex items-center gap-1.5 rounded-xl px-3 min-h-[44px] text-sm font-semibold text-red-300 hover:bg-red-500/10"><Trash2 size={15} /> Delete</button>
            <div className="flex gap-2">
              <button onClick={() => setEdit(null)} className="rounded-xl border border-white/[0.12] px-4 min-h-[44px] text-sm font-semibold text-neutral-300">Cancel</button>
              <button onClick={saveEdit} className="rounded-xl bg-white px-4 min-h-[44px] text-sm font-bold text-neutral-900">Save</button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
