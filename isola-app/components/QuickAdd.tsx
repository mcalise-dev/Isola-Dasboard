"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { todayISO } from "@/lib/format";
import JobPicker from "@/components/JobPicker";
import { showToast } from "@/components/Toaster";
import {
  Camera, Search, ListChecks, ChevronLeft, X, ClipboardList, Hammer, NotebookPen, CreditCard,
  Receipt, CalendarDays, Contact, MapPin, Building2, ChevronRight, type LucideIcon,
} from "lucide-react";

// v4.3: ＋ opens the form right here instead of sending you to another screen.
// The three things done most in the field (receipt, lead, task) are real forms;
// the rest are shortcuts to the screen that owns them.
type Mode = "menu" | "receipt" | "lead" | "task";
const OVERHEAD = "__overhead__";

function shrink(file: File): Promise<string> {
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

const SHORTCUTS: { href: string; label: string; sub: string; icon: LucideIcon }[] = [
  { href: "/costs", label: "Labor or a cost", sub: "Hours, rental, fuel, dump", icon: Receipt },
  { href: "/billing", label: "Record a payment", sub: "Deposit, midpoint, balance", icon: CreditCard },
  { href: "/log", label: "Log the day", sub: "What got done on site", icon: NotebookPen },
  { href: "/visits", label: "Site visit", sub: "Observed conditions", icon: MapPin },
  { href: "/build", label: "Start a build", sub: "Walk → Price → Send", icon: Hammer },
  { href: "/schedule", label: "Schedule a job", sub: "Put it on the calendar", icon: CalendarDays },
  { href: "/gameplan", label: "Game plan", sub: "Everything for today", icon: ClipboardList },
  { href: "/customers", label: "Customer", sub: "Contact + client type", icon: Building2 },
  { href: "/marketing", label: "Prospect", sub: "New CRM contact", icon: Contact },
];

export default function QuickAdd() {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const [jobs, setJobs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const cam = useRef<HTMLInputElement>(null);

  // receipt
  const [shots, setShots] = useState<string[]>([]);
  const [rJob, setRJob] = useState("");
  const [rAmt, setRAmt] = useState("");
  const [rVendor, setRVendor] = useState("");
  // lead
  const [lead, setLead] = useState({ job_name: "", customer: "", location: "", job: "", contact_phone: "", notes: "" });
  // task
  const [tTitle, setTTitle] = useState("");
  const [tJob, setTJob] = useState("");
  const [tDue, setTDue] = useState("");

  function reset() {
    setMode("menu"); setShots([]); setRJob(""); setRAmt(""); setRVendor("");
    setLead({ job_name: "", customer: "", location: "", job: "", contact_phone: "", notes: "" });
    setTTitle(""); setTJob(""); setTDue(""); setBusy(false);
  }
  function close() { setOpen(false); reset(); }

  useEffect(() => {
    const on = () => { reset(); setOpen(true); };
    window.addEventListener("isola:quickadd", on);
    return () => window.removeEventListener("isola:quickadd", on);
  }, []);

  useEffect(() => {
    if (!open) return;
    supabase.from("jobs").select("id,job_name,customer,location,job,status,priority,paid_date").then(({ data }) => setJobs(data ?? []));
    supabase.from("customers").select("id,name").order("name").then(({ data }) => setCustomers(data ?? []));
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  async function onShots(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    try {
      const imgs = await Promise.all(files.map(shrink));
      setShots((s) => [...s, ...imgs]);
      setMode("receipt");
    } catch { alert("Couldn't read that photo — try again."); }
    setBusy(false);
  }

  async function saveReceipt() {
    if (!shots.length) return;
    if (!rJob) { alert("Which job is it for? Pick one, or Overhead."); return; }
    const amt = Number(rAmt.replace(/[$,\s]/g, ""));
    setBusy(true);
    const one = shots.length === 1;
    const rows = shots.map((b64) => {
      const complete = one && !!amt && !!rVendor.trim();
      return {
        job_id: rJob === OVERHEAD ? null : rJob, entry_date: todayISO(), receipt_b64: b64, paid: true,
        vendor: one ? rVendor.trim() || null : null, amount: one && amt ? amt : null,
        category: complete ? "Materials" : null, status: complete ? "ok" : "pending",
        updated_at: new Date().toISOString(),
      };
    });
    const { error } = await supabase.from("job_costs").insert(rows);
    setBusy(false);
    if (error) { alert("Save failed: " + error.message); return; }
    close();
    showToast(rows.length === 1 ? (rows[0].status === "ok" ? "Receipt saved" : "Receipt saved — Claude can read the rest") : `${rows.length} receipts saved`);
    window.dispatchEvent(new Event("isola:changed"));
  }

  async function saveLead() {
    const name = lead.customer.trim();
    if (!lead.job_name.trim() && !name) { alert("Give it a job name or a customer."); return; }
    setBusy(true);
    let customer_id: string | null = null;
    if (name) {
      const hit = customers.find((c) => String(c.name).toLowerCase() === name.toLowerCase());
      if (hit) customer_id = hit.id;
      else {
        const { data: made, error } = await supabase.from("customers").insert({ name, phone: lead.contact_phone.trim() || null }).select("id").single();
        if (error) { setBusy(false); alert("Could not create the customer: " + error.message); return; }
        customer_id = made.id;
      }
    }
    const payload: any = {
      job_name: lead.job_name.trim() || name, customer: (customers.find((c) => c.id === customer_id)?.name) || name || lead.job_name.trim(),
      customer_id, location: lead.location.trim() || null, job: lead.job.trim() || null,
      contact_phone: lead.contact_phone.trim() || null, notes: lead.notes.trim() || null,
      status: "lead", updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("jobs").insert(payload);
    setBusy(false);
    if (error) { alert("Save failed: " + error.message); return; }
    close();
    showToast("Lead added to To quote");
    window.dispatchEvent(new Event("isola:changed"));
  }

  async function saveTask() {
    if (!tTitle.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("tasks").insert({ title: tTitle.trim(), job_id: tJob || null, due_date: tDue || null });
    setBusy(false);
    if (error) { alert("Add failed: " + error.message); return; }
    close();
    showToast("Task added");
    window.dispatchEvent(new Event("isola:changed"));
  }

  const input = "w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 min-h-[44px] text-base focus:outline-none focus:ring-2 focus:ring-neutral-400";
  const label = "block text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1";
  const primary = "w-full rounded-xl bg-white text-neutral-900 min-h-[48px] text-base font-bold disabled:opacity-50";
  const plus1 = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

  if (!open) return (
    <input ref={cam} type="file" accept="image/*" capture="environment" multiple className="hidden"
      onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; onShots(f); }} />
  );

  const title = mode === "receipt" ? "Receipt" : mode === "lead" ? "New lead" : mode === "task" ? "New task" : "Add";

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 flex items-end md:items-center justify-center" onClick={close}>
      <input ref={cam} type="file" accept="image/*" capture="environment" multiple className="hidden"
        onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; onShots(f); }} />
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-neutral-900 border border-neutral-700 rounded-t-2xl md:rounded-2xl pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <div className="sticky top-0 bg-neutral-900 flex items-center gap-2 px-4 pt-3 pb-2 border-b border-neutral-800">
          {mode !== "menu" ? (
            <button onClick={() => setMode("menu")} aria-label="Back" className="p-2 -ml-2 text-neutral-300"><ChevronLeft size={22} /></button>
          ) : null}
          <div className="font-bold text-white text-lg">{title}</div>
          <button onClick={close} aria-label="Close" className="ml-auto p-2 -mr-2 text-neutral-400"><X size={22} /></button>
        </div>

        <div className="px-4 pt-3">
          {mode === "menu" ? (
            <div className="space-y-2">
              <button onClick={() => cam.current?.click()} disabled={busy}
                className="w-full flex items-center gap-3 rounded-xl bg-white text-neutral-900 px-4 min-h-[64px] text-left">
                <Camera size={26} strokeWidth={2.2} />
                <span><span className="block text-base font-bold">{busy ? "Reading photo…" : "Snap a receipt"}</span><span className="block text-sm text-neutral-500">Camera → pick the job → save</span></span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setMode("lead")} className="flex items-center gap-2.5 rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 min-h-[56px] text-left">
                  <Search size={20} /><span className="text-sm font-semibold text-white">New lead</span>
                </button>
                <button onClick={() => setMode("task")} className="flex items-center gap-2.5 rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 min-h-[56px] text-left">
                  <ListChecks size={20} /><span className="text-sm font-semibold text-white">New task</span>
                </button>
              </div>
              <div className="pt-2 text-xs font-bold uppercase tracking-wider text-neutral-400">Go to</div>
              <div className="divide-y divide-neutral-800 rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
                {SHORTCUTS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <Link key={s.href} href={s.href} onClick={close} className="flex items-center gap-3 px-3.5 min-h-[52px] hover:bg-neutral-900">
                      <Icon size={18} className="text-neutral-300 shrink-0" />
                      <span className="min-w-0"><span className="block text-sm font-semibold text-white">{s.label}</span><span className="block text-xs text-neutral-400 truncate">{s.sub}</span></span>
                      <ChevronRight size={16} className="ml-auto text-neutral-400 shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}

          {mode === "receipt" ? (
            <div className="space-y-3">
              <div className="flex gap-2 overflow-x-auto">
                {shots.map((s, i) => (
                  <div key={i} className="relative shrink-0">
                    <img src={s} alt="" className="h-28 w-auto rounded-lg border border-neutral-700" />
                    <button onClick={() => setShots(shots.filter((_, k) => k !== i))} aria-label="Remove photo" className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-neutral-800 border border-neutral-600 flex items-center justify-center"><X size={14} /></button>
                  </div>
                ))}
                <button onClick={() => cam.current?.click()} className="shrink-0 h-28 w-20 rounded-lg border border-dashed border-neutral-600 flex flex-col items-center justify-center gap-1 text-xs text-neutral-300"><Camera size={20} />Another</button>
              </div>
              <div>
                <span className={label}>Job</span>
                <JobPicker jobs={jobs} value={rJob === OVERHEAD ? "" : rJob} onChange={setRJob} placeholder="Type to find the job…" />
                <button onClick={() => setRJob(rJob === OVERHEAD ? "" : OVERHEAD)} className={`mt-2 rounded-full px-3 min-h-[36px] text-sm font-semibold border ${rJob === OVERHEAD ? "bg-white text-neutral-900 border-white" : "border-neutral-700 text-neutral-300"}`}>Overhead — no job</button>
              </div>
              {shots.length === 1 ? (
                <div className="grid grid-cols-2 gap-2">
                  <div><span className={label}>Amount (optional)</span><input inputMode="decimal" className={input} value={rAmt} onChange={(e) => setRAmt(e.target.value)} placeholder="$0.00" /></div>
                  <div><span className={label}>Store (optional)</span><input className={input} value={rVendor} onChange={(e) => setRVendor(e.target.value)} placeholder="Home Depot" /></div>
                </div>
              ) : null}
              <p className="text-xs text-neutral-400">Skip the amount if you're in a hurry — it saves as pending and Claude fills it in from the photo.</p>
              <button onClick={saveReceipt} disabled={busy || !rJob} className={primary}>{busy ? "Saving…" : shots.length > 1 ? `Save ${shots.length} receipts` : "Save receipt"}</button>
            </div>
          ) : null}

          {mode === "lead" ? (
            <div className="space-y-3">
              <div><span className={label}>Customer</span>
                <input className={input} list="qa-customers" value={lead.customer} onChange={(e) => setLead({ ...lead, customer: e.target.value })} placeholder="Pick or type a new one" autoFocus />
                <datalist id="qa-customers">{customers.map((c) => <option key={c.id} value={c.name} />)}</datalist>
              </div>
              <div><span className={label}>Job name</span><input className={input} value={lead.job_name} onChange={(e) => setLead({ ...lead, job_name: e.target.value })} placeholder="e.g. 30 Kenney — Sidewalk" /></div>
              <div><span className={label}>Address</span><input className={input} value={lead.location} onChange={(e) => setLead({ ...lead, location: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className={label}>Work type</span><input className={input} value={lead.job} onChange={(e) => setLead({ ...lead, job: e.target.value })} placeholder="Concrete pad" /></div>
                <div><span className={label}>Phone</span><input inputMode="tel" className={input} value={lead.contact_phone} onChange={(e) => setLead({ ...lead, contact_phone: e.target.value })} /></div>
              </div>
              <div><span className={label}>Notes</span><textarea rows={2} className={input + " py-2"} value={lead.notes} onChange={(e) => setLead({ ...lead, notes: e.target.value })} /></div>
              <button onClick={saveLead} disabled={busy} className={primary}>{busy ? "Saving…" : "Add lead"}</button>
            </div>
          ) : null}

          {mode === "task" ? (
            <div className="space-y-3">
              <div><span className={label}>What needs doing</span><input className={input} value={tTitle} onChange={(e) => setTTitle(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveTask(); }} /></div>
              <div><span className={label}>Job (optional)</span><JobPicker jobs={jobs} value={tJob} onChange={setTJob} /></div>
              <div>
                <span className={label}>When</span>
                <div className="flex flex-wrap gap-1.5">
                  {[{ l: "No date", v: "" }, { l: "Today", v: todayISO() }, { l: "Tomorrow", v: plus1(1) }, { l: "Next week", v: plus1(7) }].map((o) => (
                    <button key={o.l} onClick={() => setTDue(o.v)} className={`rounded-full px-3 min-h-[36px] text-sm font-semibold border ${tDue === o.v ? "bg-white text-neutral-900 border-white" : "border-neutral-700 text-neutral-300"}`}>{o.l}</button>
                  ))}
                  <input type="date" value={tDue} onChange={(e) => setTDue(e.target.value)} className="rounded-full border border-neutral-700 bg-neutral-950 text-neutral-200 px-3 min-h-[36px] text-sm" />
                </div>
              </div>
              <button onClick={saveTask} disabled={busy || !tTitle.trim()} className={primary}>{busy ? "Saving…" : "Add task"}</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
