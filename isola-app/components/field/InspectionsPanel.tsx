"use client";
// v8.1 (10/28/26) Inspections: fill a form on the job (pre-pour, final walk, water test, or your
// own), with yes/no checks, notes, photos and a signature, and export an Isola-branded PDF report.
// An inspection copies its template's fields when it starts, so editing a form later never changes
// a finished report.
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError, showToast } from "@/components/Toaster";
import { ask } from "@/components/Dialogs";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea, NativeSelect, Field } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Empty } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { newReport } from "@/lib/fieldPdf";
import { photoToJpeg, saveFile, fileSafe } from "@/lib/fieldFiles";
import { Plus, FileDown, ClipboardCheck, Trash2, Camera, X, Settings2, ArrowUp, ArrowDown, Eraser } from "lucide-react";

type FieldDef = { id: string; type: "heading" | "text" | "long" | "yesno" | "number" | "date" | "photo" | "signature"; label: string };
const TYPES: { v: FieldDef["type"]; label: string }[] = [
  { v: "yesno", label: "Yes / No / N/A" }, { v: "text", label: "Short answer" }, { v: "long", label: "Notes" },
  { v: "number", label: "Number" }, { v: "date", label: "Date" }, { v: "photo", label: "Photos" },
  { v: "signature", label: "Signature" }, { v: "heading", label: "Section heading" },
];
const uid = () => Math.random().toString(36).slice(2, 9);

export default function InspectionsPanel({ job }: { job: any }) {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<any[] | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [entry, setEntry] = useState<any>(null);
  const [picking, setPicking] = useState(false);
  const [editTpl, setEditTpl] = useState<any>(null);
  const [manage, setManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const jobName = job.job_name || job.customer;

  async function load() {
    const [e, t] = await Promise.all([
      sb.from("form_entries").select("id,title,status,inspector,completed_at,created_at,updated_at").eq("job_id", job.id).order("created_at", { ascending: false }),
      sb.from("form_templates").select("*").eq("archived", false).order("name"),
    ]);
    if (e.error) { showError("Couldn't load inspections: " + e.error.message); setRows([]); return; }
    setRows(e.data ?? []); setTemplates(t.data ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [job.id]);

  async function start(t: any) {
    setPicking(false);
    const { data, error } = await sb.from("form_entries").insert({ job_id: job.id, template_id: t.id, title: t.name, fields: t.fields, answers: {} }).select("*").single();
    if (error) return showError(error.message);
    setEntry(data); load();
  }
  async function openEntry(r: any) {
    const { data, error } = await sb.from("form_entries").select("*").eq("id", r.id).single();
    if (error) return showError(error.message);
    setEntry(data);
  }
  const setAns = (id: string, v: any) => setEntry((e: any) => ({ ...e, answers: { ...e.answers, [id]: v } }));

  async function saveEntry(complete?: boolean) {
    setBusy(true);
    const p: any = { answers: entry.answers, inspector: entry.inspector?.trim() || null, updated_at: new Date().toISOString() };
    if (complete) { p.status = "complete"; p.completed_at = new Date().toISOString(); }
    const { error } = await sb.from("form_entries").update(p).eq("id", entry.id);
    setBusy(false);
    if (error) return showError("Save failed: " + error.message);
    showToast(complete ? "Inspection complete" : "Saved");
    if (complete) setEntry((e: any) => ({ ...e, ...p })); else setEntry(null);
    load();
  }
  async function removeEntry(e: any) {
    if (!(await ask({ title: `Delete this ${e.title}?`, body: "This can't be undone.", confirm: "Delete", danger: true }))) return;
    const { error } = await sb.from("form_entries").delete().eq("id", e.id);
    if (error) return showError(error.message);
    setEntry(null); load();
  }

  async function pdf(e: any) {
    const r = await newReport(e.title, jobName, [job.customer && job.job_name ? job.customer : null, job.location].filter(Boolean).join("  -  "));
    r.kv([["Date", fmtDate((e.completed_at ?? e.created_at ?? "").slice(0, 10))], ["Inspected by", e.inspector], ["Status", e.status === "complete" ? "Complete" : "Draft"]]);
    r.rule();
    for (const f of (e.fields ?? []) as FieldDef[]) {
      const v = e.answers?.[f.id];
      if (f.type === "heading") { r.heading(f.label); continue; }
      if (f.type === "photo") { const list = (v ?? []) as string[]; if (list.length) { r.para(f.label, { bold: true, size: 9.5 }); await r.images(list); } continue; }
      if (f.type === "signature") {
        r.para(f.label, { bold: true, size: 9.5 });
        if (v?.img) await r.image(v.img, 220, 70, [v.name, v.at ? new Date(v.at).toLocaleString("en-US") : null].filter(Boolean).join("  -  "));
        else r.para("______________________________", { size: 10 });
        continue;
      }
      const text = f.type === "yesno" ? (v === "yes" ? "Yes" : v === "no" ? "NO" : v === "na" ? "N/A" : "-") : f.type === "date" && v ? fmtDate(v) : v ? String(v) : "-";
      if (f.type === "long") { r.para(f.label, { bold: true, size: 9.5 }); r.para(text, { indent: 0 }); r.y -= 4; }
      else r.kv([[f.label, text]]);
    }
    saveFile(await r.save(), `${fileSafe(jobName)}_${fileSafe(e.title)}_${(e.completed_at ?? e.created_at ?? "").slice(0, 10)}.pdf`);
  }

  async function saveTemplate() {
    const t = editTpl;
    if (!t.name?.trim()) return showError("Name the form.");
    const fields = (t.fields as FieldDef[]).filter((f) => f.label.trim());
    if (!fields.length) return showError("Add at least one question.");
    setBusy(true);
    const row = { name: t.name.trim(), description: t.description?.trim() || null, fields, updated_at: new Date().toISOString() };
    const res = t.id ? await sb.from("form_templates").update(row).eq("id", t.id) : await sb.from("form_templates").insert(row);
    setBusy(false);
    if (res.error) return showError(res.error.message);
    showToast("Form saved"); setEditTpl(null); load();
  }
  async function archiveTemplate(t: any) {
    if (!(await ask({ title: `Remove “${t.name}”?`, body: "Inspections already filled out keep their answers.", confirm: "Remove", danger: true }))) return;
    await sb.from("form_templates").update({ archived: true }).eq("id", t.id);
    setEditTpl(null); load();
  }
  const moveField = (i: number, d: number) => setEditTpl((t: any) => { const f = [...t.fields]; const j = i + d; if (j < 0 || j >= f.length) return t; [f[i], f[j]] = [f[j], f[i]]; return { ...t, fields: f }; });

  if (rows === null) return <div className="skeleton h-32" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-neutral-400">{rows.length ? `${rows.filter((r) => r.status === "complete").length} complete` : ""}</p>
        <Button variant="ghost" size="sm" className="h-9" onClick={() => setManage(true)}><Settings2 size={15} /> Forms</Button>
        <Button size="sm" className="h-9" onClick={() => setPicking(true)}><Plus size={15} /> New inspection</Button>
      </div>
      {rows.length === 0 ? (
        <Empty icon={<ClipboardCheck size={28} />} title="No inspections on this job."
          body="Pre-pour checks, final walkthroughs, water tests — fill them out on site and hand the property manager a clean PDF." />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {rows.map((r) => (
            <button key={r.id} onClick={() => openEntry(r)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{r.title}</span>
                <span className="block truncate text-xs text-neutral-500">{fmtDate((r.completed_at ?? r.created_at).slice(0, 10))}{r.inspector ? ` · ${r.inspector}` : ""}</span>
              </span>
              <Badge variant={r.status === "complete" ? "success" : "warning"}>{r.status === "complete" ? "Complete" : "In progress"}</Badge>
            </button>
          ))}
        </div>
      )}

      {/* pick a form */}
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent>
          <DialogHeader><DialogTitle>Start an inspection</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {templates.map((t) => (
              <button key={t.id} onClick={() => start(t)} className="block w-full rounded-lg border border-border px-3 py-2.5 text-left hover:border-white/25">
                <div className="text-sm font-semibold text-white">{t.name}</div>
                {t.description ? <div className="text-xs text-neutral-500">{t.description}</div> : null}
              </button>
            ))}
            <Button variant="outline" className="w-full" onClick={() => { setPicking(false); setEditTpl({ name: "", description: "", fields: [{ id: uid(), type: "yesno", label: "" }] }); }}><Plus size={15} /> Build a new form</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* fill an inspection */}
      <Dialog open={!!entry} onOpenChange={(o) => { if (!o && !busy) setEntry(null); }}>
        {entry ? (
          <DialogContent wide>
            <DialogHeader><DialogTitle>{entry.title}</DialogTitle></DialogHeader>
            <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
              {(entry.fields as FieldDef[]).map((f) => <FieldInput key={f.id} f={f} v={entry.answers?.[f.id]} set={(v) => setAns(f.id, v)} />)}
              <Field label="Inspected by"><Input value={entry.inspector ?? ""} placeholder="Mike Calise" onChange={(e) => setEntry({ ...entry, inspector: e.target.value })} /></Field>
            </div>
            <DialogFooter className="flex-wrap gap-2">
              <Button variant="ghost" className="text-neutral-500" onClick={() => removeEntry(entry)}><Trash2 size={15} /></Button>
              <Button variant="outline" onClick={() => pdf(entry)}><FileDown size={15} /> PDF report</Button>
              {entry.status !== "complete" ? <Button variant="outline" onClick={() => saveEntry(false)} disabled={busy}>Save draft</Button> : null}
              <Button onClick={() => saveEntry(true)} disabled={busy}>{entry.status === "complete" ? "Save" : "Mark complete"}</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* manage forms */}
      <Dialog open={manage} onOpenChange={setManage}>
        <DialogContent>
          <DialogHeader><DialogTitle>Your inspection forms</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {templates.map((t) => (
              <button key={t.id} onClick={() => { setManage(false); setEditTpl(JSON.parse(JSON.stringify(t))); }} className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-left hover:border-white/25">
                <span className="text-sm font-semibold text-white">{t.name}</span><span className="text-xs text-neutral-500">{(t.fields ?? []).length} items</span>
              </button>
            ))}
            <Button variant="outline" className="w-full" onClick={() => { setManage(false); setEditTpl({ name: "", description: "", fields: [{ id: uid(), type: "yesno", label: "" }] }); }}><Plus size={15} /> New form</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* edit a form */}
      <Dialog open={!!editTpl} onOpenChange={(o) => { if (!o && !busy) setEditTpl(null); }}>
        {editTpl ? (
          <DialogContent wide>
            <DialogHeader><DialogTitle>{editTpl.id ? "Edit form" : "New form"}</DialogTitle></DialogHeader>
            <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
              <Field label="Form name"><Input value={editTpl.name} placeholder="Paver base inspection" onChange={(e) => setEditTpl({ ...editTpl, name: e.target.value })} /></Field>
              <Field label="What it's for (optional)"><Input value={editTpl.description ?? ""} onChange={(e) => setEditTpl({ ...editTpl, description: e.target.value })} /></Field>
              <div className="space-y-2">
                {(editTpl.fields as FieldDef[]).map((f, i) => (
                  <div key={f.id} className="flex items-center gap-1.5">
                    <Input className="flex-1" value={f.label} placeholder={f.type === "heading" ? "Section name" : "Question"} onChange={(e) => setEditTpl((t: any) => ({ ...t, fields: t.fields.map((x: FieldDef) => (x.id === f.id ? { ...x, label: e.target.value } : x)) }))} />
                    <NativeSelect className="w-36 shrink-0" value={f.type} onChange={(e) => setEditTpl((t: any) => ({ ...t, fields: t.fields.map((x: FieldDef) => (x.id === f.id ? { ...x, type: e.target.value } : x)) }))}>
                      {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                    </NativeSelect>
                    <Button variant="ghost" size="icon-sm" aria-label="Move up" onClick={() => moveField(i, -1)}><ArrowUp size={14} /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Move down" onClick={() => moveField(i, 1)}><ArrowDown size={14} /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setEditTpl((t: any) => ({ ...t, fields: t.fields.filter((x: FieldDef) => x.id !== f.id) }))}><X size={14} /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setEditTpl((t: any) => ({ ...t, fields: [...t.fields, { id: uid(), type: "yesno", label: "" }] }))}><Plus size={14} /> Add question</Button>
              </div>
            </div>
            <DialogFooter className="flex-wrap gap-2">
              {editTpl.id ? <Button variant="ghost" className="text-neutral-500" onClick={() => archiveTemplate(editTpl)}><Trash2 size={15} /></Button> : null}
              <Button variant="outline" onClick={() => setEditTpl(null)}>Cancel</Button>
              <Button onClick={saveTemplate} disabled={busy}>Save form</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function FieldInput({ f, v, set }: { f: FieldDef; v: any; set: (v: any) => void }) {
  if (f.type === "heading") return <h3 className="border-b border-border pb-1 pt-2 text-sm font-semibold uppercase tracking-wide text-neutral-300">{f.label}</h3>;
  if (f.type === "yesno") return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-neutral-200">{f.label}</span>
      <div className="flex shrink-0 gap-1">
        {[["yes", "Yes"], ["no", "No"], ["na", "N/A"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => set(v === k ? null : k)}
            className={cn("h-9 min-w-[48px] rounded-lg border px-2 text-[13px] font-semibold",
              v === k ? (k === "yes" ? "border-emerald-400 bg-emerald-400 text-neutral-950" : k === "no" ? "border-red-400 bg-red-500 text-white" : "border-white bg-white/15 text-white") : "border-border text-neutral-400")}>{l}</button>
        ))}
      </div>
    </div>
  );
  if (f.type === "long") return <Field label={f.label}><Textarea rows={3} value={v ?? ""} onChange={(e) => set(e.target.value)} /></Field>;
  if (f.type === "number") return <Field label={f.label}><Input inputMode="decimal" value={v ?? ""} onChange={(e) => set(e.target.value)} /></Field>;
  if (f.type === "date") return <Field label={f.label}><Input type="date" value={v ?? ""} onChange={(e) => set(e.target.value)} /></Field>;
  if (f.type === "photo") {
    const list: string[] = v ?? [];
    return (
      <div>
        <div className="mb-1.5 text-sm text-neutral-200">{f.label}</div>
        <div className="flex flex-wrap gap-2">
          {list.map((src, i) => (
            <div key={i} className="relative">
              <img src={src} alt="" className="h-20 w-20 rounded-lg border border-border object-cover" />
              <button type="button" onClick={() => set(list.filter((_, k) => k !== i))} aria-label="Remove photo" className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black text-white ring-1 ring-white/30"><X size={12} /></button>
            </div>
          ))}
          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 text-xs text-neutral-400 hover:border-white/40">
            <Camera size={18} /> Add
            <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
              const files = Array.from(e.target.files ?? []); e.currentTarget.value = "";
              const out: string[] = [];
              for (const fl of files) out.push((await photoToJpeg(fl, 1400, 0.72)).dataUrl);
              set([...list, ...out]);
            }} />
          </label>
        </div>
      </div>
    );
  }
  if (f.type === "signature") return <SignaturePad label={f.label} v={v} set={set} />;
  return <Field label={f.label}><Input value={v ?? ""} onChange={(e) => set(e.target.value)} /></Field>;
}

function SignaturePad({ label, v, set }: { label: string; v: any; set: (v: any) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [name, setName] = useState(v?.name ?? "");
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) * (ref.current!.width / r.width), y: (e.clientY - r.top) * (ref.current!.height / r.height) }; };
  const down = (e: React.PointerEvent) => { drawing.current = true; last.current = pos(e); (e.target as Element).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const g = ref.current!.getContext("2d")!, p = pos(e);
    g.strokeStyle = "#111"; g.lineWidth = 3; g.lineCap = "round";
    g.beginPath(); g.moveTo(last.current.x, last.current.y); g.lineTo(p.x, p.y); g.stroke(); last.current = p;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false; last.current = null;
    set({ img: ref.current!.toDataURL("image/png"), name, at: new Date().toISOString() });
  };
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); set(null); };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm text-neutral-200">{label}<Button type="button" variant="ghost" size="sm" onClick={clear}><Eraser size={14} /> Clear</Button></div>
      {v?.img ? <img src={v.img} alt="signature" className="h-28 w-full rounded-lg border border-border bg-white object-contain" />
        : <canvas ref={ref} width={600} height={180} className="h-28 w-full touch-none rounded-lg border border-border bg-white"
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />}
      <Input className="mt-1.5" value={name} placeholder="Printed name" onChange={(e) => { setName(e.target.value); if (v?.img) set({ ...v, name: e.target.value }); }} />
    </div>
  );
}
