"use client";
// v4.6 job record panels. Same data rules as the old v4.5 job file,
// split into self-loading pieces so the record page can lay them out in tabs and a rail.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, todayISO } from "@/lib/format";
import { undoable, showToast, showError } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Empty, SectionTitle } from "@/components/ui/bits";
import PunchList from "@/components/PunchList";
import { cn } from "@/lib/utils";
import { Camera, Images, HardHat, Trash2, Plus, Receipt, CalendarPlus, FileSpreadsheet, Upload, Download, X, PenTool, Check } from "lucide-react";
import { stampSafe } from "@/lib/stamp";
import ScheduleItemDialog from "@/components/schedule/ScheduleItemDialog";
import PhotoMarkup from "@/components/markup/PhotoMarkup";
import { ITEM_TYPES, NEXT_STATUS, SCHED_STATUS, byTime, detailLine, isOutside, timeWindow, typeOf, whoOn, type SchedItem } from "@/lib/schedule";

// Isola's own truck/equipment time: billed to the customer, never a cost (job_costs.bill_amount, amount = 0).
export const OWN_TRUCK_LABEL = "Isola's truck: bill it to the customer, not a cost to me";
export const looksOwn = (vendor: string) => /^\s*isola\b/i.test(vendor ?? "");
export const COST_CATEGORIES = ["Materials", "Fuel", "Equipment / Rental", "Dump / Disposal", "Trucking", "Subcontractor", "Permits", "Other"];
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
  const [f, setF] = useState({ vendor: "", category: "Materials", amount: "", entry_date: todayISO(), notes: "", own: false });
  const [receipt, setReceipt] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("");
  const load = async () => {
    const { data } = await sb.from("job_costs").select("id,entry_date,vendor,category,amount,bill_amount,notes,status,receipt_b64").eq("job_id", jobId).neq("category", "Labor").order("entry_date", { ascending: false });
    // receipts saved without a category are pending rows from the camera
    const { data: pend } = await sb.from("job_costs").select("id,entry_date,vendor,category,amount,bill_amount,notes,status,receipt_b64").eq("job_id", jobId).is("category", null);
    const all = [...(data ?? []), ...(pend ?? []).filter((p: any) => !(data ?? []).some((d: any) => d.id === p.id))];
    setRows(all);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);
  const total = (rows ?? []).reduce((a, c) => a + Number(c.amount ?? 0), 0);

  async function many(files: File[]) {
    if (files.length === 1) { setReceipt(await shrink(files[0])); return; }
    setBusy(true);
    let imgs: string[];
    try { imgs = await Promise.all(files.map(shrink)); } catch { setBusy(false); showError("Couldn't read one of those images. Try again."); return; }
    const { error } = await sb.from("job_costs").insert(imgs.map((b64) => ({ job_id: jobId, entry_date: f.entry_date, receipt_b64: b64, status: "pending" })));
    setBusy(false);
    if (error) { showError("Save failed: " + error.message); return; }
    showToast(`${imgs.length} receipts saved as pending`);
    load(); onChange?.(); changed();
  }
  async function add() {
    const amt = Number(f.amount);
    if (!receipt && (!f.vendor.trim() || !amt)) { showError("Add a receipt photo, or fill in vendor and amount."); return; }
    setBusy(true);
    const pending = !f.vendor.trim() || !amt;
    const own = f.own && f.category === "Trucking" && !!amt;
    const { error } = await sb.from("job_costs").insert({ job_id: jobId, entry_date: f.entry_date, vendor: f.vendor.trim() || null, category: f.category || null, amount: own ? 0 : (amt || null), bill_amount: own ? amt : null, notes: f.notes.trim() || null, receipt_b64: receipt || null, status: pending ? "pending" : "ok" });
    setBusy(false);
    if (error) { showError("Save failed: " + error.message); return; }
    setF({ vendor: "", category: f.category, amount: "", entry_date: todayISO(), notes: "", own: f.own }); setReceipt("");
    showToast(own ? "Trucking logged: billed to the customer, not a cost" : "Cost logged");
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
                {c.bill_amount != null
                  ? <div className="shrink-0 text-right"><div className="text-sm font-semibold tabular-nums text-emerald-300">bill {usd(Number(c.bill_amount))}</div><div className="text-[11px] text-neutral-500">no cost</div></div>
                  : <div className="shrink-0 text-sm font-semibold tabular-nums text-white">{usd(Number(c.amount ?? 0))}</div>}
                <button onClick={() => remove(c)} aria-label="Delete cost" className="shrink-0 rounded p-1 text-neutral-500 hover:text-red-400"><Trash2 size={15} /></button>
              </Row>
            ))}
          </div>
        ) : <p className="mb-3 text-sm text-neutral-500">No material or other costs logged yet.</p>}
      <div className="rounded-xl border border-border p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Input placeholder="Vendor" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value, own: f.category === "Trucking" && looksOwn(e.target.value) ? true : f.own })} />
          <NativeSelect value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, own: e.target.value === "Trucking" && looksOwn(f.vendor) ? true : f.own })}>{COST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</NativeSelect>
          <Input type="number" inputMode="decimal" placeholder={f.own && f.category === "Trucking" ? "$ to bill the customer" : "$ total (tax in)"} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} />
        </div>
        {f.category === "Trucking" ? (
          <label className="mt-2 flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" checked={f.own} onChange={(e) => setF({ ...f, own: e.target.checked })} /> {OWN_TRUCK_LABEL}
          </label>
        ) : null}
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
  const [jobRates, setJobRates] = useState<any[]>([]);
  const [f, setF] = useState<any>({ worker: "", hours: "", days: "1", rate: "", rate_type: "hourly", entry_date: todayISO(), paid: true });
  const [busy, setBusy] = useState(false);
  const daily = f.rate_type === "daily";
  const qtyIn = daily ? f.days : f.hours;
  const load = async () => {
    const { data } = await sb.from("job_costs").select("id,entry_date,worker,hours,days,rate,rate_type,amount,paid").eq("job_id", jobId).eq("category", "Labor").order("entry_date", { ascending: false });
    setRows(data ?? []);
    const { data: jr } = await sb.from("job_pay_rates").select("worker_id,rate,rate_type,bill_rate").eq("job_id", jobId);
    setJobRates(jr ?? []);
  };
  useEffect(() => { load(); sb.from("workers").select("id,name,rate,rate_type").eq("active", true).order("name").then(({ data }: any) => setCrew(data ?? [])); /* eslint-disable-next-line */ }, [jobId]);
  // pay rate for this worker on THIS job: job_pay_rates first, then their default
  const rateFor = (name: string) => {
    const w = crew.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    const jr = w ? jobRates.find((r) => r.worker_id === w.id) : null;
    const rate_type: string = (jr?.rate_type ?? w?.rate_type ?? "hourly") === "daily" ? "daily" : "hourly";
    return { w, jr, rate: jr ? Number(jr.rate) : w?.rate != null ? Number(w.rate) : null, rate_type };
  };
  const hrs = (rows ?? []).reduce((a, l) => a + Number(l.hours ?? 0), 0);
  const days = (rows ?? []).reduce((a, l) => a + (l.rate_type === "daily" ? Number(l.days ?? 1) : 0), 0);
  const total = (rows ?? []).reduce((a, l) => a + Number(l.amount ?? 0), 0);
  const qtyLabel = (l: any) => l.rate_type === "daily"
    ? `${Number(l.days ?? 1)} day${Number(l.days ?? 1) === 1 ? "" : "s"} @ $${Number(l.rate)}/day`
    : `${Number(l.hours)}h @ $${Number(l.rate)}/hr`;
  async function add() {
    const qty = Number(qtyIn), rate = Number(f.rate);
    if (!f.worker.trim() || !qty || !rate) { showError(daily ? "Worker, days, and day rate are required." : "Worker, hours, and rate are required."); return; }
    setBusy(true);
    const cur = rateFor(f.worker);
    if (cur.w && (rate !== cur.rate || f.rate_type !== cur.rate_type)) {
      await sb.from("job_pay_rates").upsert({ job_id: jobId, worker_id: cur.w.id, rate, rate_type: f.rate_type, updated_at: new Date().toISOString() }, { onConflict: "job_id,worker_id" });
    }
    const { error } = await sb.from("job_costs").insert({
      job_id: jobId, entry_date: f.entry_date, category: "Labor", worker: f.worker.trim(),
      hours: daily ? null : qty, days: daily ? qty : null, rate, rate_type: f.rate_type,
      amount: Math.round(qty * rate * 100) / 100, paid: f.paid, status: "ok",
    });
    setBusy(false);
    if (error) { showError("Save failed: " + error.message); return; }
    setF({ worker: f.worker.trim(), hours: "", days: "1", rate: f.rate, rate_type: f.rate_type, entry_date: todayISO(), paid: true });
    showToast("Labor logged");
    load(); onChange?.(); changed();
  }
  async function togglePaid(l: any) {
    setRows((r) => (r ?? []).map((x) => (x.id === l.id ? { ...x, paid: !x.paid } : x)));
    await sb.from("job_costs").update({ paid: !l.paid, updated_at: new Date().toISOString() }).eq("id", l.id);
  }
  function remove(l: any) {
    const prev = rows ?? [];
    undoable({ text: `${l.worker ?? "Labor"} ${l.rate_type === "daily" ? `${Number(l.days ?? 1)}d` : `${Number(l.hours)}h`} deleted`, hide: () => setRows(prev.filter((x) => x.id !== l.id)), restore: () => setRows(prev),
      commit: async () => { const { error } = await sb.from("job_costs").delete().eq("id", l.id); if (error) { load(); throw error; } onChange?.(); changed(); } });
  }
  return (
    <div>
      <SectionTitle right={<span className="text-sm tabular-nums text-neutral-400">{[hrs ? `${hrs} hrs` : "", days ? `${days} day${days === 1 ? "" : "s"}` : ""].filter(Boolean).join(" + ") || "0 hrs"} · {usd(total)}</span>}>Labor</SectionTitle>
      {rows === null ? <div className="skeleton h-12" /> : rows.length ? (
        <div className="mb-3 space-y-1.5">
          {rows.map((l) => (
            <Row key={l.id}>
              <HardHat size={17} className="shrink-0 text-neutral-500" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{l.worker ?? "—"}</div>
                <div className="text-xs text-neutral-400">{fmtDate(l.entry_date)} · {qtyLabel(l)}</div>
              </div>
              <div className="shrink-0 text-sm font-semibold tabular-nums text-white">{usd(Number(l.amount ?? 0))}</div>
              <button onClick={() => togglePaid(l)}><Badge variant={l.paid ? "success" : "warning"}>{l.paid ? "Paid" : "Owed"}</Badge></button>
              <button onClick={() => remove(l)} aria-label="Delete labor" className="shrink-0 rounded p-1 text-neutral-500 hover:text-red-400"><Trash2 size={15} /></button>
            </Row>
          ))}
        </div>
      ) : <p className="mb-3 text-sm text-neutral-500">No labor logged on this job yet.</p>}
      <div className="rounded-xl border border-border p-3">
        <div className="mb-2 grid grid-cols-2 gap-2">
          {(["hourly", "daily"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setF({ ...f, rate_type: t })}
              className={`rounded-lg border py-1.5 text-xs font-semibold ${f.rate_type === t ? "border-neutral-300 bg-neutral-800 text-white" : "border-border text-neutral-500"}`}>
              {t === "daily" ? "Per day" : "Per hour"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Input list="isola-crew" placeholder="Worker" value={f.worker} className="col-span-2 sm:col-span-1"
            onChange={(e) => { const r = rateFor(e.target.value); setF({ ...f, worker: e.target.value, ...(r.w ? { rate_type: r.rate_type, rate: r.rate != null ? String(r.rate) : f.rate } : {}) }); }} />
          <datalist id="isola-crew">{crew.map((c) => <option key={c.name} value={c.name} />)}</datalist>
          {daily
            ? <Input type="number" inputMode="decimal" placeholder="Days" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} />
            : <Input type="number" inputMode="decimal" placeholder="Hours" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} />}
          <Input type="number" inputMode="decimal" placeholder={daily ? "$/day" : "$/hr"} value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
          <Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} />
        </div>
        <div className="mt-2 flex items-center justify-end gap-3">
          <span className="text-xs text-neutral-500">
            {jobRates.length ? <>Pay on this job: {jobRates.map((r) => `${crew.find((c) => c.id === r.worker_id)?.name ?? "?"} $${Number(r.rate)}/${r.rate_type === "daily" ? "day" : "hr"}${r.bill_rate ? ` (bill $${Number(r.bill_rate)})` : ""}`).join(" · ")}. </> : null}
            A rate you type sticks for that worker on this job. New labor saves as Owed.
          </span>
          <Button size="sm" onClick={add} disabled={busy}><Plus size={15} /> {busy ? "Saving…" : `Log labor${qtyIn && f.rate ? ` · ${usd(Number(qtyIn) * Number(f.rate))}` : ""}`}</Button>
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
    if (error) { showError("Save failed: " + error.message); return; }
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
    if (error) { showError("Save failed: " + error.message); load(); }
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
  // v7.2: markup runs right here on the job, full screen — { photoId } opens a photo, {} opens the upload picker
  const [mark, setMark] = useState<{ photoId?: string } | null>(null);
  const load = async () => {
    const { data } = await sb.from("job_photos").select("id,phase,caption,photo_b64,source_photo_id,created_at").eq("job_id", jobId).order("created_at");
    setRows(data ?? []);
  };
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("isola:changed", on);
    return () => window.removeEventListener("isola:changed", on);
    /* eslint-disable-next-line */
  }, [jobId]);
  // lock the page behind the full-screen markup so the canvas gets every touch
  useEffect(() => {
    if (!mark) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mark]);
  async function add(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    for (const file of files) {
      const raw = await shrink(file).catch(() => "");
      if (!raw) continue;
      const b64 = await stampSafe(raw);
      const { error } = await sb.from("job_photos").insert({ job_id: jobId, phase, photo_b64: b64 });
      if (error) { showError("Photo save failed: " + error.message); break; }
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
          <Button variant="outline" size="sm" className="h-8" onClick={() => setMark({})}><PenTool size={14} /> Mark up</Button>
          <NativeSelect value={phase} onChange={(e) => setPhase(e.target.value)} className="h-8 w-[110px] text-[13px]"><option value="before">Before</option><option value="during">During</option><option value="after">After</option></NativeSelect>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-brand px-3 text-[13px] font-semibold text-neutral-950">
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
                    <button onClick={() => setMark({ photoId: p.id })} aria-label="Mark up photo" className="absolute bottom-1 right-1 inline-flex min-h-[24px] items-center gap-1 rounded bg-brand px-1.5 text-xs font-bold text-neutral-950"><PenTool size={11} />{p.source_photo_id ? "Edit" : "Mark up"}</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      {big ? (
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-black/90 p-4 anim-fade" onClick={() => setBig(null)}>
          <img src={big.photo_b64} alt={big.phase} className="max-h-[80vh] max-w-full rounded-lg" />
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button onClick={() => { const id = big.id; setBig(null); setMark({ photoId: id }); }}><PenTool size={15} /> {big.source_photo_id ? "Edit markup" : "Mark up"}</Button>
            <Button variant="outline" onClick={() => setBig(null)}><X size={15} /> Close</Button>
          </div>
        </div>
      ) : null}
      {mark ? (
        <div className="fixed inset-0 z-[65] overflow-y-auto bg-background px-3 pb-6 pt-[max(12px,env(safe-area-inset-top))] anim-fade md:px-6">
          <div className="mx-auto max-w-5xl">
            <PhotoMarkup lockJobId={jobId} photoId={mark.photoId} onClose={() => { setMark(null); load(); }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------- Schedule ----------------
export function SchedulePanel({ job, entries, crew, onChange }: { job: any; entries: any[]; crew: string[]; onChange: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const [dlg, setDlg] = useState<{ item?: SchedItem | null; type?: string; date?: string } | null>(null);
  const [showPast, setShowPast] = useState(false);
  const today = todayISO();
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  const list = [...(entries as SchedItem[])].sort((a, b) => (a.entry_date === b.entry_date ? byTime(a, b) : a.entry_date < b.entry_date ? -1 : 1));
  const past = list.filter((e) => e.entry_date < today);
  const upcoming = list.filter((e) => e.entry_date >= today);
  const shown = showPast ? list : upcoming;

  // first time a booked job lands on the calendar, that day becomes its start date
  async function afterSave(first?: string) {
    if (first && !job.start_date && ["booked", "progress"].includes(job.status)) {
      await sb.from("jobs").update({ start_date: first, updated_at: new Date().toISOString() }).eq("id", job.id);
    }
    onChange(); changed();
  }
  async function cycle(e: SchedItem) {
    const next = NEXT_STATUS[e.status ?? "scheduled"] ?? "scheduled";
    const { error } = await sb.from("schedule_entries").update({ status: next, updated_at: new Date().toISOString() }).eq("id", e.id);
    if (error) { showError("Update failed: " + error.message); return; }
    showToast(SCHED_STATUS[next].label);
    onChange(); changed();
  }

  return (
    <div>
      <SectionTitle right={<a href="/dispatch" className="text-sm font-semibold text-neutral-400 hover:text-white">Dispatch board</a>}>Schedule</SectionTitle>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {ITEM_TYPES.filter((t) => t.key !== "other").map((t) => {
          const Icon = t.icon;
          return (
            <Button key={t.key} size="sm" variant={t.key === "crew" ? "default" : "outline"} className="h-10" onClick={() => setDlg({ type: t.key, date: tomorrow })}>
              <Plus size={14} /><Icon size={14} /> {t.key === "crew" ? "Crew days" : t.label}
            </Button>
          );
        })}
      </div>
      {past.length ? (
        <button onClick={() => setShowPast(!showPast)} className="mb-2 text-xs font-semibold text-neutral-500 hover:text-white">
          {showPast ? "Hide earlier days" : `Show ${past.length} earlier item${past.length === 1 ? "" : "s"}`}
        </button>
      ) : null}
      {shown.length ? (
        <div className="space-y-1.5">
          {shown.map((e) => {
            const t = typeOf(e);
            const Icon = t.icon;
            const st = e.status ?? "scheduled";
            const who = whoOn(e);
            const isPast = e.entry_date < today;
            return (
              <div key={e.id} className={cn("flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2", (isPast || st === "done") && "opacity-60", st === "cancelled" && "opacity-40")}>
                <button onClick={() => setDlg({ item: e })} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Edit">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]", t.tint)}><Icon size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm font-semibold text-white", st === "cancelled" && "line-through")}>
                      {fmtDate(e.entry_date)}{timeWindow(e) ? <span className="font-normal text-neutral-300"> · {timeWindow(e)}</span> : null}
                    </span>
                    <span className="block truncate text-xs text-neutral-400">
                      {[e.item_type && e.item_type !== "crew" ? t.label : null, detailLine(e), who.join(", "), e.job_id ? null : e.label].filter(Boolean).join(" · ") || "Crew day · unassigned"}
                    </span>
                  </span>
                </button>
                {isOutside(e) || st !== "scheduled" ? (
                  <button onClick={() => cycle(e)} title="Tap to change status" className="shrink-0">
                    <Badge variant={st === "scheduled" && isOutside(e) && !isPast ? "warning" : SCHED_STATUS[st]?.badge ?? "muted"}>
                      {st === "confirmed" ? <Check size={11} /> : null}{st === "scheduled" && isOutside(e) ? "Confirm?" : SCHED_STATUS[st]?.label ?? st}
                    </Badge>
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : <p className="text-sm text-neutral-500">{list.length ? "Nothing coming up." : "Not on the calendar yet. Add crew days, a pour, a delivery or a sub above."}</p>}
      <ScheduleItemDialog open={!!dlg} onOpenChange={(o) => { if (!o) setDlg(null); }} item={dlg?.item ?? null} date={dlg?.date} type={dlg?.type}
        jobId={job.id} lockJob crew={crew} onSaved={(first) => afterSave(first)} />
    </div>
  );
}

// ---------------- Jobbook (rail card) ----------------
export function JobbookCard({ jobId }: { jobId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [jb, setJb] = useState<any | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const load = () => sb.from("jobbooks").select("job_id,updated_at,summary,file_name").eq("job_id", jobId).maybeSingle().then(({ data }) => setJb(data ?? null));
  // The jobbook summary is recalculated in the database whenever a cost, labor entry or price
  // changes, so the card just has to re-read it: after any change on the page (again a few
  // seconds later, since deletes commit after the undo window), when the tab comes back into
  // view, and once a minute while it's open (covers crew clock-outs from other phones).
  useEffect(() => {
    load();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const onChanged = () => { load(); timers.push(setTimeout(load, 1500), setTimeout(load, 6500)); };
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("isola:changed", onChanged);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);
    return () => {
      window.removeEventListener("isola:changed", onChanged);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(poll); timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line
  }, [jobId]);
  async function download() {
    const { data } = await sb.from("jobbooks").select("file_name,file_b64").eq("job_id", jobId).maybeSingle();
    if (!data?.file_b64) { showError("No file stored for this jobbook yet."); return; }
    const a = document.createElement("a");
    a.href = data.file_b64.startsWith("data:") ? data.file_b64 : "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + data.file_b64;
    a.download = data.file_name ?? "jobbook.xlsx"; a.click();
  }
  async function upload(file: File) {
    setBusy(true);
    const b64: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
    const { error } = await sb.from("jobbooks").upsert({ job_id: jobId, file_name: file.name, file_b64: b64, updated_at: new Date().toISOString() }, { onConflict: "job_id" });
    setBusy(false);
    if (error) { showError("Upload failed: " + error.message); return; }
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
