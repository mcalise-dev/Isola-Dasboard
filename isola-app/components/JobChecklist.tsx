"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function JobChecklist({ jobId, jobType }: { jobId: string; jobType?: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [adding, setAdding] = useState("");
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

  async function toggle(it: any) {
    setItems((s) => s.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)));
    await supabase.from("job_checklist").update({ done: !it.done }).eq("id", it.id);
  }

  async function add(label: string) {
    if (!label.trim()) return;
    setBusy(true);
    await supabase.from("job_checklist").insert({ job_id: jobId, label: label.trim(), sort: items.length });
    setAdding(""); setBusy(false); load();
  }

  async function remove(it: any) {
    await supabase.from("job_checklist").delete().eq("id", it.id);
    load();
  }

  async function applyTemplate(t: any) {
    const list: string[] = Array.isArray(t.checklist) ? t.checklist : [];
    if (list.length === 0) { setPickOpen(false); return; }
    setBusy(true);
    const base = items.length;
    await supabase.from("job_checklist").insert(list.map((label, i) => ({ job_id: jobId, label, sort: base + i })));
    setBusy(false); setPickOpen(false); load();
  }

  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const suggested = templates.filter((t) => jobType && String(t.job_type ?? "").toLowerCase() && String(jobType).toLowerCase().includes(String(t.job_type).toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">✅ Checklist</div>
        <button onClick={() => setPickOpen(!pickOpen)} className="text-[11px] font-semibold text-neutral-400 hover:text-neutral-200 underline">
          {pickOpen ? "close" : "use a template"}
        </button>
      </div>

      {pickOpen ? (
        <div className="mb-2 space-y-1">
          {(suggested.length ? suggested : templates).map((t) => (
            <button key={t.id} onClick={() => applyTemplate(t)} disabled={busy}
              className="w-full text-left rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 hover:border-neutral-600 disabled:opacity-50">
              <div className="text-xs font-semibold text-white">{t.name}</div>
              <div className="text-[11px] text-neutral-500">{(t.checklist?.length ?? 0)} steps{t.job_type ? " · " + t.job_type : ""}</div>
            </button>
          ))}
          {templates.length === 0 ? <p className="text-xs text-neutral-600">No templates saved yet.</p> : null}
        </div>
      ) : null}

      {items.length ? (
        <div className="mb-2">
          <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1">
            <span>{done} of {items.length} done</span><span>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
            <div className={`h-full ${pct === 100 ? "bg-emerald-500" : "bg-neutral-400"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-1.5">
            <button onClick={() => toggle(it)}
              className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] ${it.done ? "bg-emerald-500 border-emerald-500 text-black" : "border-neutral-600"}`}>
              {it.done ? "✓" : ""}
            </button>
            <span className={`flex-1 text-xs ${it.done ? "text-neutral-600 line-through" : "text-neutral-200"}`}>{it.label}</span>
            <button onClick={() => remove(it)} className="shrink-0 text-neutral-700 hover:text-red-400 text-xs">✕</button>
          </div>
        ))}
        {items.length === 0 && !pickOpen ? <p className="text-xs text-neutral-600">Nothing on the list yet.</p> : null}
      </div>

      <div className="flex gap-1.5 mt-2">
        <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add a step…"
          onKeyDown={(e) => e.key === "Enter" && add(adding)}
          className="flex-1 rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500" />
        <button onClick={() => add(adding)} disabled={busy || !adding.trim()}
          className="rounded-lg border border-neutral-700 px-3 text-[11px] font-semibold text-neutral-300 disabled:opacity-40">Add</button>
      </div>
    </div>
  );
}
