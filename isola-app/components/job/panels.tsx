"use client";
// v4.6 job record panels. Same data rules as the old v4.5 job file,
// split into self-loading pieces so the record page can lay them out in tabs and a rail.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, todayISO } from "@/lib/format";
import { undoable, showToast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Empty, SectionTitle } from "@/components/ui/bits";
import PunchList from "@/components/PunchList";
import { cn } from "@/lib/utils";
import { Camera, Images, HardHat, Trash2, Plus, Receipt, CalendarPlus, FileSpreadsheet, Upload, Download, X } from "lucide-react";

export const COST_CATEGORIES = ["Materials", "Fuel", "Equipment / Rental", "Dump / Disposal", "Subcontractor", "Permits", "Other"];
const changed = () => window.dispatchEvent(new Event("isola:changed"));
const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function shrink(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1100 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("unreadable image")); };
    img.src = url;
  });
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2.5", className)}>{children}</div>;
}

// ---------------- Materials & costs ----------------
export function CostsPanel({ jobId, onChange }: { jobId: string; onChange?: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<any[] | null>(null);
  const [f, setF] = useState({ vendor: "", category: "Materials", amount: "", entry_date: todayISO(), notes: "" });
  const [receipt, setReceipt] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("");
  const load = async () => {
    const { data } = await sb.from("job_costs").select("id,entry_date,vendor,category,amount,notes,status,receipt_b64").eq("job_id", jobId).neq("category", "Labor").order("entry_date", { ascending: false });
    // receipts saved without a category are pending rows from the camera
    const { data: pend } = await sb.from("job_costs").select("id,entry_date,vendor,category,amount,notes,status,receipt_b64").eq("job_id", jobId).is("category", null);
    const all = [...(data ?? []), ...(pend ?? []).filter((p: any) => !(data ?? []).some((d: any) => d.id === p.id))];
    setRows(all);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);
  const total = (rows ?? []).reduce((a, c) => a + Number(c.amount ?? 0), 0);

  async function many(files: File[]) {
    if (files.length === 1) { setReceipt(await shrink(files[0])); return; }
    setBusy(true);
    let imgs: string[];
    try { imgs = await Promise.all(files.map(shrink)); } catch { setBusy(false); alert("Couldn't read one of those images. Try again."); return; }
    const { error } = await sb.from("job_costs").insert(imgs.map((b64) => ({ job_id: jobId, entry_date: f.entry_date, receipt_b64: b64, status: "pending" })));
    setBusy(false);
    if (error) { alert("Save failed: " + error.message); return; }
    showToast(`${imgs.length} receipts saved as pending`);
    load(); onChange?.(); changed();
  }
  async function add() {
    const amt = Number(f.amount);
    if (!receipt && (!f.vendor.trim() || !amt)) { alert("Add a receipt photo, or fill in vendor and amount."); return; }
    setBusy(true);
    const pending = !f.vendor.trim() || !amt;
    const { error } = await sb.from("job_costs").insert({ job_id: jobId, entry_date: f.entry_date, vendor: f.vendor.trim() || null, category: f.category || null, amount: amt || null, notes: f.notes.trim() || null, receipt_b64: receipt || null, status: pending ? "pending" : "ok" });
    setBusy(false);
    if (error) { alert("Save failed: " + error.message); return; }
    setF({ vendor: "", category: f.category, amount: "", entry_date: todayISO(), notes: "" }); setReceipt("");
    showToast("Cost logged");
    load(); onChange?.(); changed();
  }
  function remove(c: any) {
    const prev = rows ?? [];
    undoable({ text: "Cost deleted", hide: () => setRows(prev.filter((x) => x.id !== c.id)), restore: () => setRows(prev),
      commit: async () => { const { error } = await sb.from("job_costs").delete().eq("id", c.id); if (error) { load(); throw error; } onChange?.(); changed(); } });
  }

  return (
    <div>
      <SectionTitle right={<span className="text-sm tabular-nums text-neutral-400">{usd(total)} · {(rows ?? []).length}</span>}>Materials & costs</SectionTitle>
      {rows === null ? <div className="space-y-2"><div className="skeleton h-12" /><div className="skeleton h-12" /></div>
        : rows.length ? (
          <div className="mb-3 space-y-1.5">
            {rows.map((c) => (
              <Row key={c.id}>
                {c.receipt_b64 ? <button onClick={() => setView(c.receipt_b64)} className="shrink-0"><img src={c.receipt_b64} alt="receipt" className="h-9 w-9 rounded-md border border-white/10 object-cover" /></button> : <Receipt size={18} className="shrink-0 text-neutral-500" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{c.vendor ?? "Receipt, needs details"}</div>
                  <div className="truncate text-xs text-neutral-400">{fmtDate(c.entry_date)} · {c.category ?? "—"}{c.notes ? ` · ${c.notes}` : ""}</div>
                </div>
                {c.status === "pending" ? <Badge variant="warning">Claude</Badge> : null}
                <div className="shrink-0 text-sm font-semibold tabular-nums text-white">{usd(Number(c.amount ?? 0))}</div>
                <button onClick={() => remove(c)} aria-label="Delete cost" className="shrink-0 rounded p-1 text-neutral-500 hover:text-red-400"><Trash2 size={15} /></button>
              </Row>
            ))}
          </div>
        ) : <p className="mb-3 text-sm text-neutral-500">No material or other costs logged yet.</p>}
      <div className="rounded-xl border border-border p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Input placeholder="Vendor" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} />
          <NativeSelect value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{COST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</NativeSelect>
          <Input type="number" inputMode="decimal" placeholder="$ total (tax in)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} />
        </div>
        <Input className="mt-2" placeholder="Notes (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <div className="mt-2 flex flex-wrap gap-2">
          <label className={cn("inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold", receipt ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-input text-white hover:bg-accent")}>
            <Camera size={15} /> {receipt ? "Receipt attached" : "Camera"}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const x = e.target.files?.[0]; if (x) setReceipt(await shrink(x)); e.target.value = ""; }} />
          </label>
          {receipt ? <Button size="sm" variant="ghost" onClick={() => setReceipt("")}>Remove photo</Button> : (
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-[13px] font-semibold text-white hover:bg-accent">
              <Images size={15} /> Photos
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) many(fs); e.target.value = ""; }} />
            </label>
          )}
          <Button size="sm" className="ml-auto" onClick={add} disabled={busy}><Plus size={15} /> {busy ? "Saving…" : "Log cost"}</Button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Leave vendor and amount blank and it saves as pending for Claude to fill in. Several photos at once each save separately. Tax stays in the total.</p>
      </div>
      {view ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4 anim-fade" onClick={() => setView("")}><img src={view} alt="receipt" className="max-h-full max-w-full rounded-lg" /></div> : null}
    </div>
  );
}

// ---------------- Labor ----------------
export function LaborPanel({ jobId, onChange }: { jobId: string; onChange?: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<any[] | null>(null);
  const [crew, setCrew] = useState<any[]>([]);
  const [f, setF] = useState<any>({ worker: "", hours: "", rate: "", entry_date: todayISO(), paid: true });
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const { data } = await sb.from("job_costs").select("id,entry_date,worker,hours,rate,amount,paid").eq("job_id", jobId).eq("category", "Labor").order("entry_date", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); sb.from("workers").select("name,rate").eq("active", true).order("name").then(({ data }: any) => setCrew(data ?? [])); /* eslint-disable-next-line */ }, [jobId]);
  const hrs = (rows ?? []).reduce((a, l) => a + Number(l.hours ?? 0), 0);
  const total = (rows ?? []).reduce((a, l) => a + Number(l.amount ?? 0), 0);
  async function add() {
    const hours = Number(f.hours), rate = Number(f.rate);
    if (!f.worker.trim() || !hours || !rate) { alert("Worker, hours, and rate are required."); return; }
    setBusy(true);
    const { error } = await sb.from("job_costs").insert({ job_id: jobId, entry_date: f.entry_date, category: "Labor", worker: f.worker.trim(), hours, rate, amount: Math.round(hours * rate * 100) / 100, paid: f.paid, status: "ok" })
    setBusy(false);
    if (error) { alert("Save failed: " + error.message); return; }
    setF({ worker: f.worker.trim(), hours: "", rate: f.rate, entry_date: todayISO(), paid: true });
    showToast("Labor logged");
    load(); onChange?.(); changed();
  }
  async function togglePaid(l: any) {
    setRows((r) => (r ?? []).map((x) => (x.id === l.id ? { ...x, paid: !x.paid } : x)));
    await sb.from("job_costs").update({ paid: !l.paid, updated_at: new Date().toISOString() }).eq("id", l.id);
  }
  function remove(l: any) {
    const prev = rows ?? [];
    undoable({ text: `${l.worker ?? "Labor"} ${Number(l.hours)}h deleted`, hide: () => setRows(prev.filter((x) => x.id !== l.id)), restore: () => setRows(prev),
      commit: async () => { const { error } = await sb.from("job_costs").delete().eq("id", l.id); if (error) { load(); throw error; } onChange?.(); changed(); } });
  }
  return (
    <div>
      <SectionTitle right={<span className="text-sm tabular-nums text-neutral-400">{hrs} hrs · {usd(total)}</span>}>Labor</SectionTitle>
      {rows === null ? <div className="skeleton h-12" /> : rows.length ? (
        <div className="mb-3 space-y-1.5">
          {rows.map((l) => (
            <Row key={l.id}>
              <HardHat size={17} className="shrink-0 text-neutral-500" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{l.worker ?? "—"}</div>
                <div className="text-xs text-neutral-400">{fmtDate(l.entry_date)} · {Number(l.hours)}h @ ${Number(l.rate)}</div>
              </div>
              <div className="shrink-0 text-sm font-semibold tabular-nums text-white">{usd(Number(l.amount ?? 0))}</div>
              <button onClick={() => togglePaid(l)}><Badge variant={l.paid ? "success" : "warning"}>{l.paid ? "Paid" : "Owed"}</Badge></button>
              <button onClick={() => remove(l)} aria-label="Delete labor" className="shrink-0 rounded p-1 text-neutral-500 hover:text-red-400"><Trash2 size={15} /></button>
            </Row>
          ))}
        </div>
      ) : <p className="mb-3 text-sm text-neutral-500">No labor logged on this job yet.</p>}
      <div className="rounded-xl border border-border p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Input list="isola-crew" placeholder="Worker" value={f.worker} className="col-span-2 sm:col-span-1"
            onChange={(e) => { const w = crew.find((c) => c.name === e.target.value); setF({ ...f, worker: e.target.value, rate: w?.rate && !f.rate ? String(w.rate) : f.rate }); }} />
          <datalist id="isola-crew">{crew.map((c) => <option key={c.name} value={c.name} />)}</datalist>
          <Input type="number" inputMode="decimal" placeholder="Hours" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} />
          <Input type="number" inputMode="decimal" placeholder="$/hr" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
          <Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} />
        </div>
        <div className="mt-2 flex items-center justify-end gap-3">
          <span className="text-xs text-neutral-500">New labor saves as Owed. Tap the badge to mark it Paid.</span>
          <Button size="sm" onClick={add} disabled={busy}><Plus size={15} /> {busy ? "Saving…" : `Log labor${f.hours && f.rate ? ` · ${usd(Number(f.hours) * Number(f.rate))}` : ""}`}</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Tasks + punch list ----------------
export function TasksPanel({ jobId }: { jobId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<any[] | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const load = async () => {
    const { data } = await sb.from("tasks").select("id,title,done,due_date,priority,crew_visible").eq("job_id", jobId).order("done").order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);
  async function add() {
    if (!title.trim()) return;
    const { error } = await sb.from("tasks").insert({ title: title.trim(), job_id: jobId, due_date: due || null });
    if (error) { alert("Save failed: " + error.message); return; }
    setTitle(""); setDue(""); load(); changed();
  }
  async function toggle(t: any) {
    setRows((r) => (r ?? []).map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await sb.from("tasks").update({ done: !t.done, completed_at: !t.done ? new Date().toISOString() : null }).eq("id", t.id);
    changed();
  }
  async function crewToggle(t: any) {
    setRows((r) => (r ?? []).map((x) => (x.id === t.id ? { ...x, crew_visible: !x.crew_visible } : x)));
    const { error } = await sb.from("tasks").update({ crew_visible: !t.crew_visible }).eq("id", t.id);
    if (error) { alert("Save failed: " + error.message); load(); }
  }
  function remove(t: any) {
    const prev = rows ?? [];
    undoable({ text: "Task deleted", hide: () => setRows(prev.filter((x) => x.id !== t.id)), restore: () => setRows(prev), commit: async () => { const { error } = await sb.from("tasks").delete().eq("id", t.id); if (error) { load(); throw error; } changed(); } });
  }
  const today = todayISO();
  const open = (rows ?? []).filter((t) => !t.done).length;
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle right={<span className="text-sm text-neutral-400">{open ? `${open} open` : rows?.length ? "all done" : ""}</span>}>Tasks</SectionTitle>
        <div className="mb-3 flex gap-2">
          <Input placeholder="Add a task for this job…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <Input type="date" className="w-[150px] shrink-0" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          <Button onClick={add} className="shrink-0"><Plus size={16} /> Add</Button>
        </div>
        {rows === null ? <div className="skeleton h-12" /> : rows.length ? (
          <div className="space-y-1.5">
            {rows.map((t) => (
              <Row key={t.id}>
                <button onClick={() => toggle(t)} aria-label={t.done ? "Mark not done" : "Mark done"} className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs", t.done ? "border-emerald-400 bg-emerald-400 text-neutral-900" : "border-neutral-600 text-transparent hover:border-white")}>✓</button>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm", t.done ? "text-neutral-500 line-through" : "font-medium text-white")}>{t.title}</div>
                  {t.due_date ? <div className={cn("text-xs", !t.done && t.due_date < today ? "text-red-400" : "text-neutral-400")}>due {fmtDate(t.due_date)}</div> : null}
                </div>
                <button onClick={() => crewToggle(t)} title={t.crew_visible ? "Crew can see this. Tap to hide" : "Only you see this. Tap to show the crew"}
                  className={cn("inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-semibold", t.crew_visible ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-white/10 text-neutral-500")}>
                  <HardHat size={13} /> {t.crew_visible ? "Crew" : "Me"}
                </button>
                <button onClick={() => remove(t)} aria-label="Delete task" className="shrink-0 rounded p-1 text-neutral-500 hover:text-red-400"><Trash2 size={15} /></button>
              </Row>
            ))}
          </div>
        ) : <p className="text-sm text-neutral-500">No tasks on this job yet.</p>}
        <p className="mt-2 text-xs text-neutral-500">Tasks here also show on the main Tasks screen. Tap “Me” to show one to the crew.</p>
      </div>
      <div>
        <SectionTitle>Punch list</SectionTitle>
        <PunchList jobId={jobId} />
      </div>
    </div>
  );
}

// ---------------- Photos ----------------
export function PhotosPanel({ jobId }: { jobId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("during");
  const [big, setBig] = useState<any>(null);
  const load = async () => {
    const { data } = await sb.from("job_photos").select("id,phase,caption,photo_b64,created_at").eq("job_id", jobId).order("created_at");
    setRows(data ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);
  async function add(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    for (const file of files) {
      const b64 = await shrink(file).catch(() => "");
      if (!b64) continue;
      const { error } = await sb.from("job_photos").insert({ job_id: jobId, phase, photo_b64: b64 });
      if (error) { alert("Photo save failed: " + error.message); break; }
    }
    setBusy(false); load();
  }
  async function cycle(p: any) {
    const next = p.phase === "before" ? "during" : p.phase === "during" ? "after" : "before";
    setRows((r) => (r ?? []).map((x) => (x.id === p.id ? { ...x, phase: next } : x)));
    await sb.from("job_photos").update({ phase: next }).eq("id", p.id);
  }
  function remove(p: any) {
    const prev = rows ?? [];
    undoable({ text: "Photo deleted", hide: () => setRows(prev.filter((x) => x.id !== p.id)), restore: () => setRows(prev), commit: async () => { const { error } = await sb.from("job_photos").delete().eq("id", p.id); if (error) { load(); throw error; } } });
  }
  return (
    <div>
      <SectionTitle right={
        <div className="flex items-center gap-2">
          <NativeSelect value={phase} onChange={(e) => setPhase(e.target.value)} className="h-8 w-[110px] text-[13px]"><option value="before">Before</option><option value="during">During</option><option value="after">After</option></NativeSelect>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-white px-3 text-[13px] font-semibold text-neutral-900">
            <Camera size={15} /> {busy ? "Saving…" : "Add photos"}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          </label>
        </div>}>Photos</SectionTitle>
      {rows === null ? <div className="grid grid-cols-3 gap-2"><div className="skeleton h-28" /><div className="skeleton h-28" /><div className="skeleton h-28" /></div>
        : !rows.length ? <Empty icon={<Camera size={26} />} title="No photos yet" body="Add before, during and after shots. Tap a photo's label to change its phase." />
        : (["before", "during", "after"] as const).map((ph) => {
          const list = rows.filter((p) => (p.phase ?? "during") === ph);
          if (!list.length) return null;
          return (
            <div key={ph} className="mb-4">
              <div className="mb-1.5 text-sm font-semibold capitalize text-neutral-300">{ph} <span className="font-normal text-neutral-500">{list.length}</span></div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                {list.map((p) => (
                  <div key={p.id} className="group relative">
                    <button onClick={() => setBig(p)} className="block w-full"><img src={p.photo_b64} alt={p.phase} className="h-28 w-full rounded-lg border border-white/[0.08] object-cover" /></button>
                    <button onClick={() => remove(p)} aria-label="Delete photo" className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-neutral-300"><X size={13} /></button>
                    <button onClick={() => cycle(p)} className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-xs font-semibold capitalize text-neutral-200">{p.phase}</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      {big ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4 anim-fade" onClick={() => setBig(null)}><img src={big.photo_b64} alt={big.phase} className="max-h-full max-w-full rounded-lg" /></div> : null}
    </div>
  );
}

// ---------------- Schedule ----------------
export function SchedulePanel({ job, entries, crew, onChange }: { job: any; entries: any[]; crew: string[]; onChange: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const [f, setF] = useState({ date: tomorrow(), days: 1, who: "", skip: true });
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!f.date) return;
    setBusy(true);
    const dates: string[] = [];
    const d = new Date(f.date + "T12:00:00");
    while (dates.length < Math.max(1, f.days)) {
      const dow = d.getDay();
      if (!(f.skip && (dow === 0 || dow === 6))) dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      d.setDate(d.getDate() + 1);
    }
    const have = new Set(entries.map((e) => e.entry_date));
    const rows = dates.filter((x) => !have.has(x)).map((x) => ({ entry_date: x, job_id: job.id, assignee: f.who || null }));
    if (rows.length) {
      const { error } = await sb.from("schedule_entries").insert(rows);
      if (error) { setBusy(false); alert("Could not schedule: " + error.message); return; }
    }
    // first time a booked job lands on the calendar, that day becomes its start date
    if (!job.start_date && ["booked", "progress"].includes(job.status)) {
      await sb.from("jobs").update({ start_date: dates[0], updated_at: new Date().toISOString() }).eq("id", job.id);
    }
    setBusy(false);
    showToast(`${rows.length} day${rows.length === 1 ? "" : "s"} added`);
    onChange(); changed();
  }
  async function remove(e: any) {
    await sb.from("schedule_entries").delete().eq("id", e.id);
    onChange(); changed();
  }
  const today = todayISO();
  return (
    <div>
      <SectionTitle right={<a href="/dispatch" className="text-sm font-semibold text-neutral-400 hover:text-white">Dispatch board</a>}>Schedule</SectionTitle>
      {entries.length ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {entries.map((e) => (
            <span key={e.id} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px]", e.entry_date < today ? "border-white/[0.06] text-neutral-500" : "border-white/15 text-neutral-200")}>
              {fmtDate(e.entry_date)}{e.assignee ? ` · ${e.assignee}` : ""}
              <button onClick={() => remove(e)} aria-label="Remove day" className="text-neutral-500 hover:text-red-400"><X size={13} /></button>
            </span>
          ))}
        </div>
      ) : <p className="mb-3 text-sm text-neutral-500">Not on the calendar yet.</p>}
      <div className="rounded-xl border border-border p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="col-span-2 sm:col-span-1" />
          <NativeSelect value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} day{n === 1 ? "" : "s"}</option>)}</NativeSelect>
          <NativeSelect value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })}><option value="">Who?</option>{crew.map((w) => <option key={w}>{w}</option>)}<option>THM</option></NativeSelect>
          <Button onClick={add} disabled={busy} className="col-span-2 sm:col-span-1"><CalendarPlus size={16} /> {busy ? "Adding…" : "Add to schedule"}</Button>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-neutral-400"><input type="checkbox" checked={f.skip} onChange={(e) => setF({ ...f, skip: e.target.checked })} /> Skip weekends</label>
      </div>
    </div>
  );
}

// ---------------- Jobbook (rail card) ----------------
export function JobbookCard({ jobId }: { jobId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [jb, setJb] = useState<any | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const load = () => sb.from("jobbooks").select("job_id,updated_at,summary,file_name").eq("job_id", jobId).maybeSingle().then(({ data }) => setJb(data ?? null));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);
  async function download() {
    const { data } = await sb.from("jobbooks").select("file_name,file_b64").eq("job_id", jobId).maybeSingle();
    if (!data?.file_b64) { alert("No file stored for this jobbook yet."); return; }
    const a = document.createElement("a");
    a.href = data.file_b64.startsWith("data:") ? data.file_b64 : "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + data.file_b64;
    a.download = data.file_name ?? "jobbook.xlsx"; a.click();
  }
  async function upload(file: File) {
    setBusy(true);
    const b64: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
    const { error } = await sb.from("jobbooks").upsert({ job_id: jobId, file_name: file.name, file_b64: b64, updated_at: new Date().toISOString() }, { onConflict: "job_id" });
    setBusy(false);
    if (error) { alert("Upload failed: " + error.message); return; }
    load();
  }
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <FileSpreadsheet size={16} className="text-neutral-400" />
        <h3 className="text-[15px] font-semibold text-white">Jobbook</h3>
        <div className="ml-auto flex gap-1">
          {jb?.file_name ? <Button size="icon-sm" variant="ghost" onClick={download} aria-label="Download jobbook"><Download size={15} /></Button> : null}
          <label className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-300 hover:bg-accent" aria-label="Upload jobbook">
            <Upload size={15} />
            <input type="file" accept=".xlsx,.xlsm" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; if (x) upload(x); e.target.value = ""; }} />
          </label>
        </div>
      </div>
      {jb === undefined ? <div className="skeleton h-16" /> : jb ? (
        <div>
          {(jb.summary?.rows ?? []).map((r: any, i: number) => (
            <div key={i} className="flex justify-between gap-3 py-1 text-sm">
              <span className="text-neutral-400">{r.label}</span>
              <span className={cn("text-right font-semibold tabular-nums", r.highlight ? "text-emerald-300" : "text-white")}>{r.value}</span>
            </div>
          ))}
          {jb.summary?.note ? <p className="mt-1 text-xs text-neutral-400">{jb.summary.note}</p> : null}
          <p className="mt-1.5 text-xs text-neutral-500">{busy ? "Uploading…" : `Updated ${new Date(jb.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}</p>
        </div>
      ) : <p className="text-sm text-neutral-500">{busy ? "Uploading…" : "No jobbook yet. Ask Claude to build one and its snapshot shows here."}</p>}
    </div>
  );
}

// ---------------- Activity timeline ----------------
export function ActivityPanel({ job, extra }: { job: any; extra: { costs: any[]; visits: any[] } }) {
  const sb = useMemo(() => createClient(), []);
  const [comms, setComms] = useState<any[] | null>(null);
  useEffect(() => { sb.from("communications").select("id,kind,direction,body,occurred_at").eq("job_id", job.id).order("occurred_at", { ascending: false }).then(({ data }: any) => setComms(data ?? [])); }, [job.id, sb]);
  type Ev = { at: string; title: string; sub?: string; body?: string; tone?: "ok" | "bad" };
  const ev: Ev[] = [];
  if (job.created_at) ev.push({ at: job.created_at, title: "Job created", sub: job.lead_source ? `Source: ${job.lead_source}${job.referred_by ? ` · ${job.referred_by}` : ""}` : undefined });
  extra.visits.forEach((v) => ev.push({ at: v.visit_date, title: "Site walked", sub: [v.met_with ? `Met ${v.met_with}` : null, v.purpose].filter(Boolean).join(" · ") }));
  if (job.quoted_date) ev.push({ at: job.quoted_date, title: "Proposal sent" });
  if (job.won_date) ev.push({ at: job.won_date, title: "Won", tone: "ok" });
  if (job.start_date) ev.push({ at: job.start_date, title: "Start date" });
  if (job.completed_date) ev.push({ at: job.completed_date, title: "Work complete", tone: "ok" });
  if (job.invoiced_date) ev.push({ at: job.invoiced_date, title: "Invoiced", sub: job.qbo_invoice_ref ? `QuickBooks #${job.qbo_invoice_ref}` : undefined });
  if (job.paid_date) ev.push({ at: job.paid_date, title: "Paid", tone: "ok" });
  if (job.lost_date) ev.push({ at: job.lost_date, title: "Lost", sub: job.lost_reason, tone: "bad" });
  extra.costs.slice(0, 30).forEach((c) => ev.push({ at: c.entry_date, title: c.category === "Labor" ? `Labor · ${c.worker ?? ""}` : `Cost · ${c.vendor ?? "receipt"}`, sub: `$${Number(c.amount ?? 0).toLocaleString()}` }));
  (comms ?? []).forEach((m) => ev.push({ at: m.occurred_at, title: `${m.direction === "in" ? "From client" : "Sent"} · ${m.kind}`, body: m.body }));
  ev.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (comms === null) return <div className="space-y-2"><div className="skeleton h-10" /><div className="skeleton h-10" /></div>;
  return (
    <div>
      <SectionTitle>Activity</SectionTitle>
      {!ev.length ? <p className="text-sm text-neutral-500">Nothing logged yet.</p> : (
        <ol className="relative ml-1.5 border-l border-white/10">
          {ev.map((e, i) => (
            <li key={i} className="relative pb-4 pl-5">
              <span className={cn("absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-black", e.tone === "ok" ? "bg-emerald-400" : e.tone === "bad" ? "bg-red-400" : "bg-neutral-400")} />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium text-white">{e.title}</span>
                <span className="text-xs text-neutral-500">{fmtDate(String(e.at).slice(0, 10))}</span>
              </div>
              {e.sub ? <div className="text-xs text-neutral-400">{e.sub}</div> : null}
              {e.body ? <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white/[0.04] p-2.5 font-sans text-xs leading-relaxed text-neutral-300">{e.body}</pre> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export { Textarea };
