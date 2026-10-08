"use client";
// Owner-side "Crew" card on the job record: who's on it, notes for the crew,
// materials and tools. Everything here shows in the crew app (/field) — so no prices.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError, showToast } from "@/components/Toaster";
import { HardHat, X, Plus, Eye } from "lucide-react";

type Need = { id: string; kind: "material" | "tool"; item: string; qty: string | null; notes: string | null; sort: number | null };

export default function CrewSetup({ jobId, crewNotes, onSaved }: { jobId: string; crewNotes: string | null; onSaved?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [workers, setWorkers] = useState<any[]>([]);
  const [onJob, setOnJob] = useState<string[]>([]);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [notes, setNotes] = useState(crewNotes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);

  async function load() {
    const [{ data: w }, { data: jc }, { data: n }] = await Promise.all([
      supabase.from("workers").select("id,name").eq("active", true).eq("is_owner", false).order("name"),
      supabase.from("job_crew").select("worker_id").eq("job_id", jobId),
      supabase.from("job_needs").select("*").eq("job_id", jobId).order("sort", { nullsFirst: false }).order("created_at"),
    ]);
    setWorkers(w ?? []);
    setOnJob((jc ?? []).map((r: any) => r.worker_id));
    setNeeds((n as Need[]) ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);
  useEffect(() => { setNotes(crewNotes ?? ""); setNotesDirty(false); }, [crewNotes]);

  async function toggleWorker(id: string) {
    const on = onJob.includes(id);
    setOnJob((s) => (on ? s.filter((x) => x !== id) : [...s, id]));
    const { error } = on
      ? await supabase.from("job_crew").delete().eq("job_id", jobId).eq("worker_id", id)
      : await supabase.from("job_crew").insert({ job_id: jobId, worker_id: id });
    if (error) { showError("Couldn't save crew: " + error.message); load(); }
  }

  async function saveNotes() {
    const { error } = await supabase.from("jobs").update({ crew_notes: notes.trim() || null }).eq("id", jobId);
    if (error) { showError("Couldn't save: " + error.message); return; }
    setNotesDirty(false); showToast("Crew notes saved"); onSaved?.();
  }

  const hasMoney = /\$|\bprice\b|\bcost\b|\btotal\b/i.test(notes);

  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold text-white"><HardHat size={18} /> Crew</h2>
        <a href={`/field/job/${jobId}`} className="inline-flex items-center gap-1 text-[12px] text-neutral-400 hover:text-neutral-200"><Eye size={14} /> See what crew see</a>
      </div>

      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">On this job</div>
      <div className="flex flex-wrap gap-1.5">
        {workers.map((w) => {
          const on = onJob.includes(w.id);
          return (
            <button key={w.id} onClick={() => toggleWorker(w.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold border ${on ? "bg-white text-neutral-900 border-white" : "border-neutral-700 text-neutral-300 hover:border-neutral-500"}`}>
              {on ? "✓ " : ""}{w.name}
            </button>
          );
        })}
        {workers.length === 0 ? <p className="text-xs text-neutral-500">No crew set up yet (Crew &amp; time).</p> : null}
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-500">Anyone tagged here, or put on this job in the schedule, sees it in their crew app.</p>

      <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">Notes for the crew</div>
      <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }} rows={3}
        placeholder="Gate code, where to park, what to do first…"
        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500" />
      {hasMoney ? <p className="mt-1 text-[11px] text-amber-300">Heads up: the crew sees this text. Leave prices out.</p> : null}
      {notesDirty ? <button onClick={saveNotes} className="mt-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-neutral-900">Save notes</button> : null}

      <NeedEditor title="Materials" kind="material" jobId={jobId} rows={needs.filter((n) => n.kind === "material")} onChange={load} placeholder="e.g. Portland cement" />
      <NeedEditor title="Tools & equipment" kind="tool" jobId={jobId} rows={needs.filter((n) => n.kind === "tool")} onChange={load} placeholder="e.g. Mixer, wheelbarrow" />
    </section>
  );
}

function NeedEditor({ title, kind, jobId, rows, onChange, placeholder }:
  { title: string; kind: "material" | "tool"; jobId: string; rows: Need[]; onChange: () => void; placeholder: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");

  async function add() {
    if (!item.trim()) return;
    const { error } = await supabase.from("job_needs").insert({
      job_id: jobId, kind, item: item.trim(), qty: qty.trim() || null, sort: rows.length,
    });
    if (error) { showError("Couldn't add: " + error.message); return; }
    setItem(""); setQty(""); onChange();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("job_needs").delete().eq("id", id);
    if (error) showError("Couldn't remove: " + error.message);
    onChange();
  }

  return (
    <div className="mt-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-1.5">
            <span className="flex-1 min-w-0 text-sm text-neutral-200 truncate">{r.item}</span>
            {r.qty ? <span className="shrink-0 text-xs text-neutral-400 tabular-nums">{r.qty}</span> : null}
            <button onClick={() => remove(r.id)} aria-label="Remove" className="shrink-0 text-neutral-600 hover:text-red-400"><X size={14} /></button>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <input value={item} onChange={(e) => setItem(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder={placeholder}
          className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500" />
        <input value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Qty"
          className="w-20 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500" />
        <button onClick={add} disabled={!item.trim()} aria-label="Add" className="rounded-lg border border-neutral-700 px-2.5 text-neutral-300 disabled:opacity-40"><Plus size={16} /></button>
      </div>
    </div>
  );
}
