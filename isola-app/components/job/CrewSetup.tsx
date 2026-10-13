"use client";
// v5.4 owner-side crew card: who's on it, notes for the crew, and the materials/tools load-out
// (who brings it, where it comes from, loaded or not). Everything here shows in the crew app — no prices.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError, showToast } from "@/components/Toaster";
import { HardHat, X, Plus, Eye, Package, Wrench, Pencil, Check } from "lucide-react";
import { LoadOut, type Need as KitNeed } from "@/components/field/jobkit";
import { cn } from "@/lib/utils";

type Need = KitNeed & { kind: "material" | "tool"; sort: number | null };

export default function CrewSetup({ jobId, crewNotes, onSaved }: { jobId: string; crewNotes: string | null; onSaved?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [workers, setWorkers] = useState<any[]>([]);
  const [onJob, setOnJob] = useState<string[]>([]);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [notes, setNotes] = useState(crewNotes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);
  const [kind, setKind] = useState<"material" | "tool">("material");
  const [editing, setEditing] = useState(false);

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

  async function setGot(id: string, got: boolean) {
    setNeeds((s) => s.map((x) => (x.id === id ? { ...x, got, got_by: got ? "Mike" : null, got_at: got ? new Date().toISOString() : null } : x)));
    const { error } = await supabase.from("job_needs").update({ got }).eq("id", id);
    if (error) showError("Couldn't save: " + error.message);
    load();
  }

  const hasMoney = /\$|\bprice\b|\bcost\b|\btotal\b/i.test(notes);
  const rows = needs.filter((n) => n.kind === kind);
  const mats = needs.filter((n) => n.kind === "material"), tools = needs.filter((n) => n.kind === "tool");
  const people = ["Mike", ...workers.map((w) => w.name)];

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold text-white"><HardHat size={18} /> Crew</h2>
        <a href={`/field/job/${jobId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 min-h-[36px] text-[13px] font-semibold text-neutral-300 hover:text-white"><Eye size={14} /> See what crew see</a>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[13px] font-semibold text-neutral-400">On this job</div>
          <div className="flex flex-wrap gap-2">
            {workers.map((w) => {
              const on = onJob.includes(w.id);
              return (
                <button key={w.id} onClick={() => toggleWorker(w.id)}
                  className={cn("inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 min-h-[36px] text-sm font-semibold",
                    on ? "border-white bg-white text-neutral-900" : "border-neutral-700 text-neutral-300 hover:border-neutral-500")}>
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold", on ? "bg-neutral-900 text-white" : "bg-white/[0.08] text-neutral-300")}>
                    {on ? <Check size={14} strokeWidth={3} /> : w.name[0]}
                  </span>{w.name}
                </button>
              );
            })}
            {workers.length === 0 ? <p className="text-sm text-neutral-500">No crew set up yet (Crew &amp; time).</p> : null}
          </div>
          <p className="mt-2 text-[12px] text-neutral-500">Crew see any job they're scheduled on.</p>
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold text-neutral-400">Notes for the crew</div>
          <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }} rows={5}
            placeholder="Gate code, where to park, what to do first… One thought per line reads best."
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-[15px] leading-relaxed text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500" />
          {hasMoney ? <p className="mt-1 text-[13px] text-amber-300">Heads up: the crew sees this text. Leave prices out.</p> : null}
          {notesDirty ? <button onClick={saveNotes} className="mt-2 rounded-lg bg-white px-4 min-h-[36px] text-sm font-bold text-neutral-900">Save notes</button> : null}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-white/[0.1] bg-neutral-950 p-1">
          {([["material", "Materials", Package, mats], ["tool", "Tools", Wrench, tools]] as const).map(([v, l, Icon, list]) => (
            <button key={v} onClick={() => setKind(v)}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-3.5 min-h-[38px] text-sm font-semibold", kind === v ? "bg-white text-neutral-900" : "text-neutral-400 hover:text-white")}>
              <Icon size={15} />{l}<span className="tabular-nums opacity-60">{list.filter((x) => x.got).length}/{list.length}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setEditing(!editing)}
          className={cn("ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3.5 min-h-[38px] text-sm font-semibold",
            editing ? "border-white bg-white text-neutral-900" : "border-white/[0.12] text-neutral-300 hover:text-white")}>
          {editing ? <><Check size={15} /> Done editing</> : <><Pencil size={14} /> Edit list</>}
        </button>
      </div>

      <div className="mt-3">
        {editing
          ? <NeedEditor kind={kind} jobId={jobId} rows={rows} people={people} onChange={load} />
          : rows.length ? <LoadOut rows={rows} me="Mike" kind={kind} onToggle={setGot} />
          : <div className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-neutral-400">Nothing listed yet. Tap Edit list to add.</div>}
      </div>
    </section>
  );
}

function NeedEditor({ kind, jobId, rows, people, onChange }:
  { kind: "material" | "tool"; jobId: string; rows: Need[]; people: string[]; onChange: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [who, setWho] = useState("");
  const [where, setWhere] = useState("");

  async function add() {
    if (!item.trim()) return;
    const { error } = await supabase.from("job_needs").insert({
      job_id: jobId, kind, item: item.trim(), qty: qty.trim() || null, bring_by: who || null, source: where.trim() || null,
      sort: Math.max(-1, ...rows.map((r) => r.sort ?? 0)) + 1,
    });
    if (error) { showError("Couldn't add: " + error.message); return; }
    setItem(""); setQty(""); setWhere(""); onChange();
  }
  async function patch(id: string, p: Partial<Need>) {
    const { error } = await supabase.from("job_needs").update(p).eq("id", id);
    if (error) showError("Couldn't save: " + error.message);
    onChange();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("job_needs").delete().eq("id", id);
    if (error) showError("Couldn't remove: " + error.message);
    onChange();
  }

  const field = "rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 min-h-[38px] text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500";

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-white/[0.08] bg-neutral-950 p-2.5 sm:grid-cols-[2fr_90px_130px_1.3fr_auto]">
          <input defaultValue={r.item} onBlur={(e) => e.target.value.trim() && e.target.value !== r.item && patch(r.id, { item: e.target.value.trim() })} className={cn(field, "font-semibold")} aria-label="Item" />
          <button onClick={() => remove(r.id)} aria-label="Remove" className="row-span-1 rounded-lg px-2 text-neutral-500 hover:bg-white/[0.06] hover:text-red-400 sm:order-last"><X size={16} /></button>
          <input defaultValue={r.qty ?? ""} placeholder="Qty" onBlur={(e) => e.target.value !== (r.qty ?? "") && patch(r.id, { qty: e.target.value.trim() || null })} className={field} aria-label="Quantity" />
          <select defaultValue={r.bring_by ?? ""} onChange={(e) => patch(r.id, { bring_by: e.target.value || null })} className={field} aria-label="Who brings">
            <option value="">Who brings?</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input defaultValue={r.source ?? ""} placeholder="Where from" onBlur={(e) => e.target.value !== (r.source ?? "") && patch(r.id, { source: e.target.value.trim() || null })} className={cn(field, "col-span-2 sm:col-span-1")} aria-label="Where from" />
          <input defaultValue={r.notes ?? ""} placeholder="Notes for the crew" onBlur={(e) => e.target.value !== (r.notes ?? "") && patch(r.id, { notes: e.target.value.trim() || null })} className={cn(field, "col-span-2 sm:col-span-5")} aria-label="Notes" />
        </div>
      ))}

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-dashed border-white/[0.15] p-2.5 sm:grid-cols-[2fr_90px_130px_1.3fr_auto]">
        <input value={item} onChange={(e) => setItem(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder={kind === "material" ? "Add a material…" : "Add a tool…"} className={cn(field, "col-span-2 sm:col-span-1")} />
        <input value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Qty" className={field} />
        <select value={who} onChange={(e) => setWho(e.target.value)} className={field} aria-label="Who brings">
          <option value="">Who brings?</option>
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input value={where} onChange={(e) => setWhere(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Where from" className={field} />
        <button onClick={add} disabled={!item.trim()} className="inline-flex items-center justify-center gap-1 rounded-lg bg-white px-3 min-h-[38px] text-sm font-bold text-neutral-900 disabled:opacity-40"><Plus size={15} strokeWidth={2.6} />Add</button>
      </div>
    </div>
  );
}
