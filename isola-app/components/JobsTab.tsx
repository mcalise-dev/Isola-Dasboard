"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Job, STATUS_META, PIPELINE, LOST_REASONS, stageTag, fmtDate, parsePrice } from "@/lib/format";
import JobChecklist from "@/components/JobChecklist";
import PipelineNumbers from "@/components/PipelineNumbers";
import MyClock from "@/components/MyClock";import PunchList from "@/components/PunchList";
import { useRef } from "react";
import { undoable } from "@/components/Toaster";
import { HardHat } from "lucide-react";
import { Phone, Navigation, Pencil, X, MapPin, Hammer, ThumbsUp, CalendarPlus, Play, CheckCircle2, FileText, Banknote, ArrowRight, Briefcase, Plus } from "lucide-react";
const STATUSES = ["lead", "awaiting", "booked", "progress", "complete", "lost"] as const;const COST_CATEGORIES = ["Materials", "Fuel", "Equipment / Rental", "Dump / Disposal", "Subcontractor", "Permits", "Other"];
const PATH: { key: string; label: string }[] = PIPELINE.map((k) => ({ key: k, label: STATUS_META[k].label }));
// what each stage means, in plain words — shown under the section headers
const STAGE_HINT: Record<string, string> = {
  lead: "Not sent yet — walk it, price it, send it",
  awaiting: "Proposal is with the customer",
  booked: "Approved — needs a start date",
  progress: "Crew is on it",
  complete: "Work done — invoice and collect",
  lost: "Declined or dead — kept for the record",
};
const BAR: Record<string, string> = {
  lead: "border-l-violet-400",
  awaiting: "border-l-sky-400",
  booked: "border-l-blue-400",
  progress: "border-l-amber-400",
  complete: "border-l-emerald-400",
  lost: "border-l-red-500/50",
};
const DOTBG: Record<string, string> = {
  lead: "bg-violet-400",
  awaiting: "bg-sky-400",
  booked: "bg-blue-400",
  progress: "bg-amber-400",
  complete: "bg-emerald-400",
  lost: "bg-red-500/60",
};
const emptyForm = {
  job_name: "", customer: "", customer_id: "", location: "", property_id: "", job: "", status: "lead", price: "",
  contact_name: "", contact_phone: "", notes: "", scope_of_work: "",
};

// Collapsible block inside the job file. Open/closed is remembered per section
// so the job page opens the way you left it; empty sections start collapsed.
function Section({ id, title, summary, defaultOpen, children }: {
  id: string; title: string; summary?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const key = "isola.sec." + id;
  const [open, setOpen] = useState<boolean>(!!defaultOpen);
  useEffect(() => {
    try { const v = localStorage.getItem(key); if (v != null) setOpen(v === "1"); } catch {}
  }, [key]);
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail === id) setOpen(true); };
    window.addEventListener("isola:sec", on);
    return () => window.removeEventListener("isola:sec", on);
  }, [id]);
  function toggle() {
    setOpen((o) => { const n = !o; try { localStorage.setItem(key, n ? "1" : "0"); } catch {} return n; });
  }
  return (
    <div id={"sec-" + id} className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center gap-2 px-3.5 min-h-[48px] text-left active:bg-neutral-900">
        <span className="shrink-0 w-3 text-xs text-neutral-500">{open ? "▾" : "▸"}</span>
        <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">{title}</span>
        <span className="ml-auto pl-2 text-xs text-neutral-400 truncate text-right">{summary}</span>
      </button>
      {open ? <div className="px-3.5 pb-3.5 -mt-1">{children}</div> : null}
    </div>
  );
}

export default function JobsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [newCustomer, setNewCustomer] = useState(false);
  useEffect(() => {
    const sb = createClient();
    sb.from("customers").select("id,name,contact_name,phone,archived").eq("archived", false).order("name")
      .then(({ data }: any) => setCustomers(data ?? []));
    sb.from("properties").select("id,customer_id,label,address").order("address")
      .then(({ data }: any) => setProperties(data ?? []));
  }, []);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [viewing, setViewing] = useState<Job | null>(null);
  // deep link from the Money tab: /?job=<uuid> opens that job file straight away
  useEffect(() => {
    if (!jobs.length || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("job");
    if (!id) return;
    const j = jobs.find((x) => x.id === id);
    if (j) { setViewing(j); window.history.replaceState({}, "", window.location.pathname); }
  }, [jobs]);
  const [editing, setEditing] = useState<Job | "new" | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<any[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [labor, setLabor] = useState<any[]>([]);
  const [lForm, setLForm] = useState<any>({ worker: "", hours: "", rate: "", entry_date: new Date().toISOString().slice(0, 10), paid: true });
  const [lBusy, setLBusy] = useState(false);
  const [jobbook, setJobbook] = useState<any | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [savedFlash, setSavedFlash] = useState(false);
  const [jtasks, setJtasks] = useState<any[]>([]);
  const [tTitle, setTTitle] = useState("");
  const [tBusy, setTBusy] = useState(false);
  const [jcosts, setJcosts] = useState<any[]>([]);
  const [cForm, setCForm] = useState<any>({ vendor: "", category: "Materials", amount: "", entry_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [cReceipt, setCReceipt] = useState<string>("");
  const [cBusy, setCBusy] = useState(false);
  const [receiptView, setReceiptView] = useState<string>("");
  const [jbBusy, setJbBusy] = useState(false);
  const [jcomms, setJcomms] = useState<any[]>([]);
  const [ctx, setCtx] = useState<{ walked: Set<string>; drafting: Set<string>; scheduled: Set<string>; next: Record<string, any> }>({ walked: new Set(), drafting: new Set(), scheduled: new Set(), next: {} });
  const [lostPick, setLostPick] = useState(false);
  // schedule-from-the-job-file
  const [jsched, setJsched] = useState<any[]>([]);
  const [crewList, setCrewList] = useState<string[]>([]);
  const tomorrowISO = () => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const [sForm, setSForm] = useState<{ date: string; days: number; who: string; skipWknd: boolean }>({ date: tomorrowISO(), days: 1, who: "", skipWknd: true });
  const [sBusy, setSBusy] = useState(false);
  const [punchStat, setPunchStat] = useState<{ open: number; overdue: number }>({ open: 0, overdue: 0 });

  async function load() {
    const [{ data }, { data: costRows }, { data: sv }, { data: est }, { data: se }, { data: ot }] = await Promise.all([
      supabase.from("jobs").select("*").order("priority", { ascending: false }).order("updated_at", { ascending: false }),
      supabase.from("job_costs").select("job_id,amount"),
      supabase.from("site_visits").select("job_id"),
      supabase.from("estimates").select("job_id,sent_at"),
      supabase.from("schedule_entries").select("job_id"),
      supabase.from("tasks").select("job_id,title,due_date,created_at").eq("done", false).not("job_id", "is", null),
    ]);
    // next step per job = the open task due soonest (undated ones after dated ones)
    const next: Record<string, any> = {};
    (ot ?? []).forEach((t: any) => {
      const cur = next[t.job_id];
      const k = (x: any) => (x.due_date ? "0" + x.due_date : "1" + x.created_at);
      if (!cur || k(t) < k(cur)) next[t.job_id] = t;
    });
    setCtx({
      walked: new Set((sv ?? []).map((r: any) => r.job_id).filter(Boolean)),
      drafting: new Set((est ?? []).filter((r: any) => r.job_id && !r.sent_at).map((r: any) => r.job_id)),
      scheduled: new Set((se ?? []).map((r: any) => r.job_id).filter(Boolean)),
      next,
    });
    const cm: Record<string, number> = {};
    (costRows ?? []).forEach((c: any) => { if (c.job_id) cm[c.job_id] = (cm[c.job_id] ?? 0) + Number(c.amount ?? 0); });
    setCosts(cm);
    const list = (data as Job[]) ?? [];
    setJobs(list);
    setViewing((v) => (v ? list.find((x) => x.id === v.id) ?? null : null));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // v4.3 deep link: /?job=<id> opens that job file. Today, Money, Tasks, Build and the
  // search box all link this way — before 9/23 the id was ignored and the list just opened.
  const [deepId, setDeepId] = useState<string | null>(null);
  useEffect(() => {
    try { const id = new URLSearchParams(window.location.search).get("job"); if (id) setDeepId(id); } catch {}
    const onOpen = (e: Event) => setDeepId(String((e as CustomEvent).detail));
    const onChanged = () => load();
    window.addEventListener("isola:open-job", onOpen);
    window.addEventListener("isola:changed", onChanged);
    return () => { window.removeEventListener("isola:open-job", onOpen); window.removeEventListener("isola:changed", onChanged); };
  }, []);
  useEffect(() => {
    if (!deepId || loading) return;
    const j = jobs.find((x) => x.id === deepId);
    if (j) setViewing(j);
    setDeepId(null);
    try { window.history.replaceState(null, "", "/"); } catch {}
  }, [deepId, loading, jobs]);

  const panelRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  // jump to a section of the job file: open it, then scroll it just under the sticky header
  function jump(id: string) {
    window.dispatchEvent(new CustomEvent("isola:sec", { detail: id }));
    setTimeout(() => {
      const box = panelRef.current, el = document.getElementById("sec-" + id);
      if (!box) return;
      const top = id === "top" || !el ? 0 : el.offsetTop - (headRef.current?.offsetHeight ?? 0) - 8;
      box.scrollTo({ top, behavior: "smooth" });
    }, 40);
  }
  useEffect(() => { panelRef.current?.scrollTo({ top: 0 }); }, [viewing?.id]);

  // one-tap stage moves from the job header — applied right away, with Undo
  function quick(patch: Record<string, any>, text: string) {
    if (!viewing) return;
    const before = viewing;
    const id = viewing.id;
    undoable({
      text,
      hide: () => setViewing({ ...before, ...patch } as Job),
      restore: () => setViewing((cur) => (cur && cur.id === id ? before : cur)),
      commit: async () => {
        const { error } = await supabase.from("jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) alert("Save failed: " + error.message);
        load();
      },
    });
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { lead: 0, booked: 0, progress: 0, awaiting: 0, complete: 0, lost: 0 };
    jobs.forEach((j) => { c[j.status] = (c[j.status] ?? 0) + 1; });
    return c;
  }, [jobs]);

  const shown = jobs.filter((j) => {
    if (statusFilter === "active" && (j.status === "complete" || j.status === "lost")) return false;
    if (statusFilter === "all" && j.status === "lost") return false;
    if (statusFilter !== "active" && statusFilter !== "all" && j.status !== statusFilter) return false;
    if (q) {
      const hay = `${j.job_name ?? ""} ${j.customer} ${j.location ?? ""} ${j.job ?? ""} ${j.notes ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  function startEdit(j: Job | "new") {
    setEditing(j);
    setForm(j === "new" ? { ...emptyForm } : {
      job_name: j.job_name ?? "", customer: j.customer ?? "", customer_id: (j as any).customer_id ?? "",
      location: j.location ?? "", property_id: (j as any).property_id ?? "", job: j.job ?? "",
      status: j.status, price: j.price ?? "", contact_name: j.contact_name ?? "",
      contact_phone: j.contact_phone ?? "", notes: j.notes ?? "", scope_of_work: j.scope_of_work ?? "",
    });
  }

  async function save() {
    if (!form.customer.trim()) { alert("Pick a customer, or add a new one."); return; }
    setBusy(true);
    const payload: any = { ...form, updated_at: new Date().toISOString() };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    payload.customer = form.customer.trim();

    // Keep the customer database clean: reuse the existing record when there is one,
    // otherwise create it — so a job can never invent a new spelling of a customer.
    let cid = form.customer_id || null;
    if (!cid) {
      const hit = customers.find((c) => String(c.name).toLowerCase() === payload.customer.toLowerCase());
      if (hit) cid = hit.id;
      else {
        const { data: made, error: cerr } = await supabase.from("customers")
          .insert({ name: payload.customer, contact_name: payload.contact_name, phone: payload.contact_phone })
          .select("id").single();
        if (cerr) { setBusy(false); alert("Could not create the customer: " + cerr.message); return; }
        cid = made.id;
        setCustomers((s) => [...s, { id: cid, name: payload.customer }].sort((a, b) => a.name.localeCompare(b.name)));
      }
    }
    payload.customer_id = cid;

    // work happens at a property — reuse the address if this customer already has it
    if (!payload.property_id && payload.location) {
      const ph = properties.find((p) => p.customer_id === cid && String(p.address).toLowerCase() === String(payload.location).toLowerCase());
      if (ph) payload.property_id = ph.id;
      else {
        const { data: mp } = await supabase.from("properties").insert({ customer_id: cid, address: payload.location }).select("id").single();
        if (mp) { payload.property_id = mp.id; setProperties((s) => [...s, { id: mp.id, customer_id: cid, address: payload.location }]); }
      }
    }

    if (payload.status === "complete") payload.completed_date = payload.completed_date ?? new Date().toISOString().slice(0, 10);
    const res = editing === "new" ? await supabase.from("jobs").insert(payload) : await supabase.from("jobs").update(payload).eq("id", (editing as Job).id);
    setBusy(false);
    if (res.error) { alert("Save failed: " + res.error.message); return; }
    setEditing(null);
    load();
  }

  function setStatus(j: Job, status: string) {
    const d: any = { ...draft, status };
    if (status === "complete") d.completed_date = new Date().toISOString().slice(0, 10);
    setDraft(d);
  }

  function setProposal(j: Job, proposal_status: string) {
    const d: any = { ...draft, proposal_status };
    if (proposal_status === "sent" && !j.quoted_date) d.quoted_date = new Date().toISOString().slice(0, 10);
    setDraft(d);
  }

  useEffect(() => {
    setDraft({});
    setLostPick(false);
    if (!viewing) { setPhotos([]); setLabor([]); setJobbook(null); setJtasks([]); setJcosts([]); return; }
    supabase.from("job_photos").select("id,phase,caption,photo_b64,created_at").eq("job_id", viewing.id).order("created_at").then(({ data }) => setPhotos(data ?? []));
    supabase.from("job_costs").select("id,entry_date,worker,hours,rate,amount,paid").eq("job_id", viewing.id).eq("category", "Labor").order("entry_date", { ascending: false }).then(({ data }) => setLabor(data ?? []));
    supabase.from("job_costs").select("id,entry_date,vendor,category,amount,notes,status,receipt_b64").eq("job_id", viewing.id).neq("category", "Labor").order("entry_date", { ascending: false }).then(({ data }) => setJcosts(data ?? []));
    supabase.from("jobbooks").select("job_id,updated_at,summary,file_name").eq("job_id", viewing.id).maybeSingle().then(({ data }) => setJobbook(data ?? null));
    supabase.from("tasks").select("id,title,done,due_date,priority,crew_visible").eq("job_id", viewing.id).order("done").order("created_at", { ascending: false }).then(({ data }) => setJtasks(data ?? []));
    supabase.from("schedule_entries").select("id,entry_date,assignee").eq("job_id", viewing.id).order("entry_date").then(({ data }: any) => setJsched(data ?? []));
    supabase.from("communications").select("id,kind,direction,body,occurred_at").eq("job_id", viewing.id).order("occurred_at").then(({ data }: any) => setJcomms(data ?? []));
    supabase.from("punch_list").select("due_date").eq("job_id", viewing.id).eq("done", false).then(({ data }: any) => {
      const t = new Date().toISOString().slice(0, 10);
      setPunchStat({ open: (data ?? []).length, overdue: (data ?? []).filter((r: any) => r.due_date && r.due_date < t).length });
    });
  }, [viewing?.id]);

  useEffect(() => {
    supabase.from("workers").select("name").eq("active", true).order("name").then(({ data }: any) => setCrewList((data ?? []).map((w: any) => w.name)));
  }, []);

  async function reloadSched() {
    const { data } = await supabase.from("schedule_entries").select("id,entry_date,assignee").eq("job_id", viewing!.id).order("entry_date");
    setJsched(data ?? []);
  }

  // Put this job on the calendar for N working days starting on the picked date.
  // First time a booked job lands on the calendar, that day becomes its start date
  // (the database then closes the "Set a start date" task).
  async function addToSchedule() {
    if (!viewing || !sForm.date) return;
    setSBusy(true);
    const dates: string[] = [];
    const d = new Date(sForm.date + "T12:00:00");
    while (dates.length < Math.max(1, sForm.days)) {
      const dow = d.getDay();
      if (!(sForm.skipWknd && (dow === 0 || dow === 6))) dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      d.setDate(d.getDate() + 1);
    }
    const have = new Set(jsched.map((e: any) => e.entry_date));
    const rows = dates.filter((x) => !have.has(x)).map((x) => ({ entry_date: x, job_id: viewing.id, assignee: sForm.who || null }));
    if (rows.length) {
      const { error } = await supabase.from("schedule_entries").insert(rows);
      if (error) { setSBusy(false); alert("Could not schedule: " + error.message); return; }
    }
    if (!viewing.start_date && ["booked", "progress"].includes(viewing.status)) {
      await supabase.from("jobs").update({ start_date: dates[0], updated_at: new Date().toISOString() }).eq("id", viewing.id);
    }
    setSBusy(false);
    await reloadSched();
    await load();
    reloadTasks();
  }

  async function unschedule(e: any) {
    await supabase.from("schedule_entries").delete().eq("id", e.id);
    reloadSched();
  }

  function setMoney(j: Job, field: "invoiced_date" | "paid_date", value: string | null) {
    setDraft({ ...draft, [field]: value });
  }

  async function saveDraft() {
    if (!viewing || !Object.keys(draft).length) return;
    const { error } = await supabase.from("jobs").update({ ...draft, updated_at: new Date().toISOString() }).eq("id", viewing.id);
    if (error) { alert("Save failed: " + error.message); return; }
    setDraft({});
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
    setLostPick(false);
    await load();
    reloadTasks(); // stage changes create/close next-step tasks in the database
  }

  function closeViewing() {
    if (Object.keys(draft).length && !confirm("You have unsaved changes — discard them?")) return;
    setDraft({});
    setViewing(null);
  }

  async function reloadTasks() {
    const { data } = await supabase.from("tasks").select("id,title,done,due_date,priority,crew_visible").eq("job_id", viewing!.id).order("done").order("created_at", { ascending: false });
    setJtasks(data ?? []);
  }

  async function addTask() {
    if (!tTitle.trim()) return;
    setTBusy(true);
    const { error } = await supabase.from("tasks").insert({ title: tTitle.trim(), job_id: viewing!.id });
    setTBusy(false);
    if (error) { alert("Save failed: " + error.message); return; }
    setTTitle("");
    reloadTasks();
  }

  async function toggleTask(t: any) {
    await supabase.from("tasks").update({ done: !t.done, completed_at: !t.done ? new Date().toISOString() : null }).eq("id", t.id);
    setJtasks(jtasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
  }

  // v4.4: which job tasks show up in the crew app
  async function toggleCrew(t: any) {
    setJtasks(jtasks.map((x) => (x.id === t.id ? { ...x, crew_visible: !x.crew_visible } : x)));
    const { error } = await supabase.from("tasks").update({ crew_visible: !t.crew_visible }).eq("id", t.id);
    if (error) { alert("Save failed: " + error.message); reloadTasks(); }
  }

  function removeTask(t: any) {
    const prev = jtasks;
    undoable({
      text: "Task deleted",
      hide: () => setJtasks(prev.filter((x) => x.id !== t.id)),
      restore: () => setJtasks(prev),
      commit: () => supabase.from("tasks").delete().eq("id", t.id),
    });
  }

  async function addPhoto(file: File, phase: string) {
    setPhotoBusy(true);
    const dataUrl: string = await new Promise((res) => {
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
      img.src = url;
    });
    const { error } = await supabase.from("job_photos").insert({ job_id: viewing!.id, phase, photo_b64: dataUrl });
    setPhotoBusy(false);
    if (error) alert("Photo save failed: " + error.message);
    else {
      const { data } = await supabase.from("job_photos").select("id,phase,caption,photo_b64,created_at").eq("job_id", viewing!.id).order("created_at");
      setPhotos(data ?? []);
    }
  }

  async function addPhotos(files: File[], phase: string) {
    if (!files.length) return;
    setPhotoBusy(true);
    for (const file of files) {
      const dataUrl: string = await new Promise((res) => {
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
        img.src = url;
      });
      const { error } = await supabase.from("job_photos").insert({ job_id: viewing!.id, phase, photo_b64: dataUrl });
      if (error) { alert("Photo save failed: " + error.message); break; }
    }
    const { data } = await supabase.from("job_photos").select("id,phase,caption,photo_b64,created_at").eq("job_id", viewing!.id).order("created_at");
    setPhotos(data ?? []);
    setPhotoBusy(false);
  }

  function removePhoto(id: string) {
    const prev = photos;
    undoable({
      text: "Photo deleted",
      hide: () => setPhotos(prev.filter((p) => p.id !== id)),
      restore: () => setPhotos(prev),
      commit: () => supabase.from("job_photos").delete().eq("id", id),
    });
  }

  async function cyclePhase(p: any) {
    const next = p.phase === "before" ? "during" : p.phase === "during" ? "after" : "before";
    await supabase.from("job_photos").update({ phase: next }).eq("id", p.id);
    setPhotos(photos.map((x) => (x.id === p.id ? { ...x, phase: next } : x)));
  }

  async function reloadLabor() {
    const { data } = await supabase.from("job_costs").select("id,entry_date,worker,hours,rate,amount,paid").eq("job_id", viewing!.id).eq("category", "Labor").order("entry_date", { ascending: false });
    setLabor(data ?? []);
  }

  async function addLabor() {
    const hours = Number(lForm.hours), rate = Number(lForm.rate);
    if (!lForm.worker.trim() || !hours || !rate) { alert("Worker, hours, and rate are required."); return; }
    setLBusy(true);
    const { error } = await supabase.from("job_costs").insert({
      job_id: viewing!.id, entry_date: lForm.entry_date, category: "Labor",
      worker: lForm.worker.trim(), hours, rate, amount: Math.round(hours * rate * 100) / 100,
      paid: lForm.paid, status: "ok",
    });
    setLBusy(false);
    if (error) { alert("Save failed: " + error.message); return; }
    setLForm({ worker: lForm.worker.trim(), hours: "", rate: lForm.rate, entry_date: new Date().toISOString().slice(0, 10), paid: true });
    await reloadLabor();
    load();
  }

  async function toggleLaborPaid(l: any) {
    await supabase.from("job_costs").update({ paid: !l.paid, updated_at: new Date().toISOString() }).eq("id", l.id);
    setLabor(labor.map((x) => (x.id === l.id ? { ...x, paid: !x.paid } : x)));
  }

  function removeLabor(l: any) {
    const prev = labor;
    undoable({
      text: `${l.worker ?? "Labor"} ${Number(l.hours)}h deleted`,
      hide: () => setLabor(prev.filter((x) => x.id !== l.id)),
      restore: () => setLabor(prev),
      commit: async () => { await supabase.from("job_costs").delete().eq("id", l.id); load(); },
    });
  }

  async function reloadJcosts() {
    const { data } = await supabase.from("job_costs").select("id,entry_date,vendor,category,amount,notes,status,receipt_b64").eq("job_id", viewing!.id).neq("category", "Labor").order("entry_date", { ascending: false });
    setJcosts(data ?? []);
  }

  async function pickReceipt(file: File) {
    const dataUrl: string = await new Promise((res) => {
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
      img.src = url;
    });
    setCReceipt(dataUrl);
  }

  // Several photos at once: each becomes its own pending cost row on this job.
  async function pickReceipts(files: File[]) {
    if (files.length === 1) { await pickReceipt(files[0]); return; }
    setCBusy(true);
    const shrinkOne = (file: File): Promise<string> => new Promise((res, rej) => {
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
    let imgs: string[];
    try { imgs = await Promise.all(files.map(shrinkOne)); }
    catch { setCBusy(false); alert("Couldn't read one of those images — try again."); return; }
    const { error } = await supabase.from("job_costs").insert(imgs.map((b64) => ({
      job_id: viewing!.id, entry_date: cForm.entry_date, receipt_b64: b64, status: "pending",
    })));
    setCBusy(false);
    if (error) { alert("Save failed: " + error.message); return; }
    await reloadJcosts();
    load();
    alert(imgs.length + " receipts saved as pending. Ask Claude to read them and it'll fill in vendor, amount and category.");
  }

  async function addJobCost() {
    const amt = Number(cForm.amount);
    if (!cReceipt && (!cForm.vendor.trim() || !amt)) { alert("Add a receipt photo, or fill in vendor and amount."); return; }
    setCBusy(true);
    const pending = !cForm.vendor.trim() || !amt;
    const { error } = await supabase.from("job_costs").insert({
      job_id: viewing!.id, entry_date: cForm.entry_date,
      vendor: cForm.vendor.trim() || null, category: cForm.category || null,
      amount: amt || null, notes: cForm.notes.trim() || null,
      receipt_b64: cReceipt || null, status: pending ? "pending" : "ok",
    });
    setCBusy(false);
    if (error) { alert("Save failed: " + error.message); return; }
    setCForm({ vendor: "", category: cForm.category, amount: "", entry_date: new Date().toISOString().slice(0, 10), notes: "" });
    setCReceipt("");
    await reloadJcosts();
    load();
  }

  function removeJobCost(c: any) {
    const prev = jcosts;
    undoable({
      text: "Cost deleted",
      hide: () => setJcosts(prev.filter((x: any) => x.id !== c.id)),
      restore: () => setJcosts(prev),
      commit: async () => { await supabase.from("job_costs").delete().eq("id", c.id); load(); },
    });
  }

  async function downloadJobbook() {
    const { data } = await supabase.from("jobbooks").select("file_name,file_b64").eq("job_id", viewing!.id).maybeSingle();
    if (!data?.file_b64) { alert("No file stored for this jobbook yet."); return; }
    const a = document.createElement("a");
    a.href = data.file_b64.startsWith("data:") ? data.file_b64 : "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + data.file_b64;
    a.download = data.file_name ?? "jobbook.xlsx";
    a.click();
  }

  async function uploadJobbookFile(file: File) {
    setJbBusy(true);
    const b64: string = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] ?? "");
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
    const { error } = await supabase.from("jobbooks").upsert(
      { job_id: viewing!.id, file_name: file.name, file_b64: b64, updated_at: new Date().toISOString() },
      { onConflict: "job_id" }
    );
    setJbBusy(false);
    if (error) { alert("Upload failed: " + error.message); return; }
    const { data } = await supabase.from("jobbooks").select("job_id,updated_at,summary,file_name").eq("job_id", viewing!.id).maybeSingle();
    setJobbook(data ?? null);
  }

  async function togglePriority(j: Job) {
    await supabase.from("jobs").update({ priority: !j.priority }).eq("id", j.id);
    load();
  }

  async function remove(j: Job) {
    if (!confirm(`Delete ${j.customer}${j.location ? " — " + j.location : ""}? This can't be undone.`)) return;
    const { error } = await supabase.from("jobs").delete().eq("id", j.id);
    if (error) alert("Delete failed: " + error.message);
    else { setViewing(null); load(); }
  }

  const input = "w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
  const label = "block text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1";

  return (
    <div className="lg:grid lg:grid-cols-[minmax(340px,1fr)_minmax(440px,1.1fr)] lg:gap-5 lg:items-start">
      <div className="min-w-0">
      {/* PIPELINE — Selling (not yet won) | Doing (won work) */}
      <div className="grid grid-cols-5 gap-1.5 mb-1 px-0.5">
        <div className="col-span-2 text-xs font-bold uppercase tracking-widest text-violet-300/80">Selling</div>
        <div className="col-span-3 text-xs font-bold uppercase tracking-widest text-blue-300/80 pl-1">Doing</div>
      </div>
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {PIPELINE.map((s, i) => {
          const sub = s === "complete" ? jobs.filter((j) => j.status === "complete" && !(j as any).paid_date).length
            : s === "booked" ? jobs.filter((j) => j.status === "booked" && !j.start_date && !ctx.scheduled.has(j.id)).length
            : s === "awaiting" ? jobs.filter((j) => j.status === "awaiting" && j.quoted_date && (Date.now() - new Date(j.quoted_date + "T12:00:00").getTime()) / 86400000 > 14).length
            : s === "lead" ? jobs.filter((j) => j.status === "lead" && !ctx.walked.has(j.id)).length : 0;
          const subLabel = s === "complete" ? "to collect" : s === "booked" ? "no date" : s === "awaiting" ? "stale" : s === "lead" ? "to walk" : "";
          return (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "active" : s)}
              className={`min-w-0 rounded-xl border border-b-2 px-1 py-2 text-center ${i === 2 ? "ml-1" : ""} ${statusFilter === s ? "border-neutral-400 bg-neutral-800" : "border-neutral-800 bg-neutral-900"}`}
>
              <div className="flex justify-center mb-1"><span className={`w-1.5 h-1.5 rounded-full ${DOTBG[s]}`} /></div>
              <div className="text-xl font-bold text-white leading-none">{counts[s]}</div>
              <div className="mt-1 text-[12px] font-semibold text-neutral-300 leading-tight">{STATUS_META[s].label}</div>
              {sub ? <div className={`mt-0.5 text-[11px] leading-tight ${s === "complete" ? "text-red-300" : "text-amber-300"}`}>{sub} {subLabel}</div> : <div className="mt-0.5 text-[11px] leading-tight text-transparent">·</div>}
            </button>
          );
        })}
      </div>

      <PipelineNumbers jobs={jobs} />

      <div className="flex gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs…" className={input} />
        <button onClick={() => setStatusFilter(statusFilter === "all" ? "active" : "all")} className={`shrink-0 rounded-lg border px-2.5 text-xs font-semibold ${statusFilter === "all" ? "border-neutral-400 text-white" : "border-neutral-700 text-neutral-400"}`}>
          {statusFilter === "all" ? "All" : "Active"}
        </button>
        <button onClick={() => setStatusFilter(statusFilter === "lost" ? "active" : "lost")} className={`shrink-0 rounded-lg border px-2.5 text-xs font-semibold ${statusFilter === "lost" ? "border-red-400/60 text-red-300" : "border-neutral-700 text-neutral-400"}`}>
          Lost{counts.lost ? ` ${counts.lost}` : ""}
        </button>
        <button onClick={() => startEdit("new")} className="shrink-0 rounded-lg bg-white text-neutral-900 px-3 text-sm font-semibold">+ Job</button>
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[72px] rounded-xl bg-neutral-900 border border-neutral-800 animate-pulse" />)}</div>
      ) : null}
      {!loading && shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-700 px-5 py-8 text-center">
          <Briefcase size={28} className="mx-auto text-neutral-400" />
          <p className="mt-2 text-base font-semibold text-white">{statusFilter === "lost" ? "Nothing in the archive" : q ? `No jobs match “${q}”` : "No jobs here"}</p>
          <p className="mt-1 text-sm text-neutral-400">{q ? "Try a customer name, street, or work type." : statusFilter !== "active" ? "Tap the stage again to see all active jobs." : "Add a lead or a job to get started."}</p>
          {q ? <button onClick={() => setQ("")} className="mt-3 rounded-lg border border-neutral-600 px-4 min-h-[40px] text-sm font-semibold text-white">Clear search</button>
            : <button onClick={() => startEdit("new")} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white text-neutral-900 px-4 min-h-[40px] text-sm font-bold"><Plus size={16} /> New job</button>}
        </div>
      ) : null}

      <div className="space-y-5">
        {(() => {
          const jobCard = (j: Job) => {
            const tag = stageTag(j, { walked: ctx.walked.has(j.id), drafting: ctx.drafting.has(j.id), scheduled: ctx.scheduled.has(j.id) });
            const nx = ctx.next[j.id];
            const overdue = nx?.due_date && nx.due_date < new Date().toISOString().slice(0, 10);
            return (
          <button key={j.id} onClick={() => setViewing(j)}
            className={`w-full text-left bg-neutral-900 border border-neutral-800 border-l-4 ${BAR[j.status]} rounded-xl px-4 py-3 hover:border-neutral-600`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-white truncate">
                  {j.priority ? <span className="text-amber-300 mr-1">★</span> : null}
                  {j.job_name || j.customer}
                </div>
                <div className="text-sm text-neutral-400 truncate">
                  {[j.job_name ? j.customer : j.location, j.job].filter(Boolean).join(" · ") || "—"}
                </div>
                {nx && j.status !== "lost" ? (
                  <div className={`mt-1 text-xs truncate ${overdue ? "text-red-400" : "text-neutral-300"}`}>
                    → {nx.title}{nx.due_date ? ` · ${overdue ? "overdue " : ""}${fmtDate(nx.due_date).replace(/^\w+, /, "")}` : ""}
                  </div>
                ) : null}
                {(() => {
                  const priceN = parsePrice(j.price);
                  const spent = costs[j.id] ?? 0;
                  if (!priceN || !spent || (j.status !== "progress" && j.status !== "complete")) return null;
                  const pct = Math.min(100, Math.round((spent / priceN) * 100));
                  return (
                    <div className="mt-1.5 pr-2">
                      <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden"><div className={`h-full ${pct >= 90 ? "bg-red-400" : pct >= 70 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: pct + "%" }} /></div>
                      <div className="text-xs text-neutral-400 mt-0.5">${spent.toLocaleString()} spent · {pct}% of price</div>
                    </div>
                  );
                })()}
              </div>
              <div className="shrink-0 text-right">
                {j.price ? <div className="font-bold text-white tabular-nums text-sm">{j.price}</div> : null}
                {tag ? <div className={`mt-0.5 text-xs font-bold uppercase tracking-wide ${tag.cls}`}>{tag.text}</div> : null}
              </div>
            </div>
          </button>
            );
          };
          const order: string[] = statusFilter === "active" ? ["lead", "awaiting", "booked", "progress"]
            : statusFilter === "all" ? [...PIPELINE] : [statusFilter];
          const rank = (j: Job) => (j.priority ? 0 : 1);
          return order.map((st) => {
            let list = shown.filter((j) => j.status === st);
            if (!list.length) return null;
            list = [...list].sort((a, b) => {
              if (st === "complete") { const pa = (a as any).paid_date ? 1 : 0, pb = (b as any).paid_date ? 1 : 0; if (pa !== pb) return pa - pb; }
              if (st === "awaiting") return rank(a) - rank(b) || String(a.quoted_date ?? "").localeCompare(String(b.quoted_date ?? ""));
              return rank(a) - rank(b) || String(a.customer).localeCompare(String(b.customer));
            });
            const key = "sec-" + st;
            const open = q ? true : !(collapsed[key] ?? (statusFilter === "all" && st === "complete"));
            return (
              <div key={key}>
                <button onClick={() => setCollapsed({ ...collapsed, [key]: open })} className="w-full flex items-baseline gap-2 pb-1.5 text-left">
                  <span className={`w-2 h-2 rounded-full self-center ${DOTBG[st]}`} />
                  <span className="text-[12px] font-extrabold uppercase tracking-widest text-white">{STATUS_META[st].label}</span>
                  <span className="text-xs font-semibold text-neutral-400">{list.length}</span>
                  <span className="ml-1 text-xs text-neutral-400 truncate">{STAGE_HINT[st]}</span>
                  <span className="ml-auto text-xs text-neutral-500">{open ? "▾" : "▸"}</span>
                </button>
                {open ? <div className="space-y-2">{list.map(jobCard)}</div> : null}
              </div>
            );
          });
        })()}
      </div>

      </div>

      {viewing ? (() => {
        const v = { ...viewing, ...draft } as Job;
        const curIdx = PATH.findIndex((p) => p.key === v.status);
        const tel = (v.contact_phone ?? "").replace(/[^0-9+]/g, "");
        return (
          <div className="fixed inset-0 z-40 bg-black/80 flex items-end sm:items-center justify-center lg:sticky lg:inset-auto lg:top-[77px] lg:z-auto lg:bg-transparent lg:block" onClick={(e) => { if (e.target === e.currentTarget) closeViewing(); }}>
            <div ref={panelRef} className="relative w-full max-w-lg max-h-[94vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-t-2xl sm:rounded-2xl lg:max-w-none lg:max-h-[calc(100vh-93px)]">
              <div ref={headRef} className="sticky top-0 bg-neutral-900 border-b border-neutral-800 px-4 pt-3 pb-2.5 z-10">
                {(() => {
                  // v4.3 job header: stage, the money at a glance, and the one thing to do next
                  const priceN = parsePrice(v.price);
                  const spent = costs[v.id] ?? 0;
                  const margin = priceN ? priceN - spent : null;
                  const mPct = priceN ? Math.round(((priceN - spent) / priceN) * 100) : null;
                  const today = new Date().toISOString().slice(0, 10);
                  const vv: any = v;
                  type Step = { label: string; Icon: any; run: () => void } | null;
                  const go = (href: string) => () => { window.location.href = href; };
                  const step: Step =
                    v.status === "lead" ? (!ctx.walked.has(v.id) ? { label: "Log the site visit", Icon: MapPin, run: go("/visits") }
                      : ctx.drafting.has(v.id) ? { label: "Finish the proposal", Icon: Hammer, run: go("/build") }
                      : { label: "Price it — start a build", Icon: Hammer, run: go("/build") })
                    : v.status === "awaiting" ? { label: "They said yes — mark Booked", Icon: ThumbsUp, run: () => quick({ status: "booked" }, "Moved to Booked") }
                    : v.status === "booked" ? (!jsched.length ? { label: "Put it on the schedule", Icon: CalendarPlus, run: () => jump("schedule") }
                      : { label: "Crew started — In Progress", Icon: Play, run: () => quick({ status: "progress" }, "Moved to In Progress") })
                    : v.status === "progress" ? { label: "Work's done — mark Complete", Icon: CheckCircle2, run: () => quick({ status: "complete", completed_date: vv.completed_date ?? today }, "Marked Complete") }
                    : v.status === "complete" ? (!vv.invoiced_date ? { label: "Mark invoiced", Icon: FileText, run: () => quick({ invoiced_date: today }, "Marked invoiced") }
                      : !vv.paid_date ? { label: "Mark paid", Icon: Banknote, run: () => quick({ paid_date: today }, "Marked paid") }
                      : null)
                    : null;
                  const JUMP = [
                    { id: "top", label: "Status" }, { id: "schedule", label: "Schedule" }, { id: "money", label: "Money" },
                    { id: "costs", label: "Costs" }, { id: "labor", label: "Labor" }, { id: "tasks", label: "Tasks" },
                    { id: "photos", label: "Photos" }, { id: "jobbook", label: "Jobbook" },
                  ];
                  const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg border min-h-[44px] text-sm font-semibold";
                  return (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${STATUS_META[v.status].cls}`}>{STATUS_META[v.status].label}</span>
                            {vv.paid_date ? <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-300">Paid</span>
                              : vv.invoiced_date ? <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-300">Invoiced</span> : null}
                          </div>
                          <div className="mt-1 text-lg font-bold text-white leading-tight">{v.priority ? <span className="text-amber-300 mr-1">★</span> : null}{v.job_name || v.customer}</div>
                          <div className="text-sm text-neutral-400 truncate">{[v.customer, v.location, v.job].filter(Boolean).join(" · ") || "—"}</div>
                        </div>
                        <button onClick={closeViewing} aria-label="Close job" className="shrink-0 -mr-2 -mt-1 w-11 h-11 flex items-center justify-center text-neutral-400 hover:text-white"><X size={22} /></button>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 mt-2.5">
                        <div className="rounded-lg bg-neutral-950 border border-neutral-800 px-2.5 py-1.5">
                          <div className="text-xs text-neutral-400">Contract</div>
                          <div className="text-base font-bold tabular-nums text-white truncate">{priceN ? "$" + priceN.toLocaleString() : (v.price || "—")}</div>
                        </div>
                        <div className="rounded-lg bg-neutral-950 border border-neutral-800 px-2.5 py-1.5">
                          <div className="text-xs text-neutral-400">Spent</div>
                          <div className="text-base font-bold tabular-nums text-white">${spent.toLocaleString()}</div>
                        </div>
                        <div className="rounded-lg bg-neutral-950 border border-neutral-800 px-2.5 py-1.5">
                          <div className="text-xs text-neutral-400">Margin</div>
                          <div className={`text-base font-bold tabular-nums ${mPct == null ? "text-neutral-400" : mPct < 10 ? "text-red-400" : mPct < 30 ? "text-amber-300" : "text-emerald-300"}`}>
                            {margin == null ? "—" : `$${Math.round(margin).toLocaleString()}`}{mPct != null ? <span className="text-xs font-semibold"> {mPct}%</span> : null}
                          </div>
                        </div>
                      </div>

                      {step ? (
                        <button onClick={step.run} className="mt-2.5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white text-neutral-900 min-h-[48px] text-base font-bold active:scale-[.99]">
                          <step.Icon size={20} strokeWidth={2.4} /> {step.label} <ArrowRight size={18} className="opacity-60" />
                        </button>
                      ) : null}

                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {tel.length >= 7 ? (
                          <a href={`tel:${tel.slice(0, 11)}`} className={`${btn} border-neutral-600 text-white`}><Phone size={16} /> Call</a>
                        ) : <span className={`${btn} border-neutral-800 text-neutral-500`}><Phone size={16} /> Call</span>}
                        {v.location ? (
                          <a href={`https://maps.google.com/?q=${encodeURIComponent(v.location)}`} target="_blank" rel="noreferrer" className={`${btn} border-neutral-600 text-white`}><Navigation size={16} /> Map</a>
                        ) : <span className={`${btn} border-neutral-800 text-neutral-500`}><Navigation size={16} /> Map</span>}
                        <button onClick={() => { setViewing(null); startEdit(v); }} className={`${btn} border-neutral-600 text-white`}><Pencil size={16} /> Edit</button>
                      </div>

                      {Object.keys(draft).length ? (
                        <div className="flex gap-2 mt-2">
                          <button onClick={saveDraft} className="flex-1 rounded-lg bg-emerald-400 text-neutral-900 min-h-[44px] text-sm font-bold">Save changes</button>
                          <button onClick={() => setDraft({})} className="rounded-lg border border-neutral-700 px-4 min-h-[44px] text-sm text-neutral-300">Discard</button>
                        </div>
                      ) : savedFlash ? (
                        <div className="mt-2 text-center text-sm font-bold text-emerald-300">✓ Saved</div>
                      ) : null}

                      <div className="flex gap-1.5 overflow-x-auto mt-2.5 -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {JUMP.map((j) => (
                          <button key={j.id} onClick={() => jump(j.id)} className="shrink-0 rounded-full border border-neutral-700 px-3 min-h-[34px] text-sm font-semibold text-neutral-300 hover:border-neutral-500 hover:text-white">{j.label}</button>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="px-4 py-4 space-y-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1.5">Job status</div>
                  <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
                    {PATH.map((s, i) => (
                      <button key={s.key} onClick={() => setStatus(v, s.key)}
                        className={`shrink-0 px-3 py-1.5 text-xs font-semibold first:rounded-l-lg last:rounded-r-lg ${i <= curIdx && curIdx >= 0 ? (i === curIdx ? "bg-white text-neutral-900" : "bg-neutral-600 text-white") : "bg-neutral-800 text-neutral-400"}`}>
                        {i < curIdx ? "✓ " : ""}{s.label}
                      </button>
                    ))}
                  </div>
                  {v.status === "lost" ? (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
                      <span className="text-xs text-red-300 font-semibold">Lost{(v as any).lost_reason ? ` — ${(v as any).lost_reason}` : ""}{(v as any).lost_date ? ` · ${fmtDate((v as any).lost_date)}` : ""}</span>
                      <span className="ml-auto text-xs text-neutral-400">Tap a stage above to reopen</span>
                    </div>
                  ) : lostPick ? (
                    <div className="mt-2 rounded-lg border border-neutral-700 p-2">
                      <div className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1.5">Why was it lost?</div>
                      <div className="flex flex-wrap gap-1.5">
                        {LOST_REASONS.map((r) => (
                          <button key={r} onClick={() => { setDraft({ ...draft, status: "lost", lost_reason: r }); }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${(draft as any).lost_reason === r ? "bg-red-400 text-neutral-900 border-red-400" : "border-neutral-700 text-neutral-300"}`}>{r}</button>
                        ))}
                        <button onClick={() => { setLostPick(false); const d: any = { ...draft }; delete d.lost_reason; if (d.status === "lost") delete d.status; setDraft(d); }} className="px-2.5 py-1 text-xs text-neutral-400">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setLostPick(true)} className="mt-1.5 text-xs font-semibold text-neutral-400 hover:text-red-300">✕ Mark lost / declined</button>
                  )}
                </div>
                <Section id="schedule" title="📅 Schedule"
                  summary={<>{jsched.length ? `${jsched.length} day${jsched.length === 1 ? "" : "s"} · next ${fmtDate((jsched.find((e: any) => e.entry_date >= new Date().toISOString().slice(0, 10)) ?? jsched[jsched.length - 1]).entry_date).replace(/^\w+, /, "")}` : (v.status === "booked" ? "not on the calendar" : "none")}</>}
                  defaultOpen={v.status === "booked" || v.status === "progress"}>
                  {jsched.length ? (
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {jsched.map((e: any) => (
                        <span key={e.id} className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200">
                          {fmtDate(e.entry_date)}{e.assignee ? ` · ${e.assignee}` : ""}
                          <button onClick={() => unschedule(e)} className="text-neutral-400 hover:text-red-400" aria-label="Remove day">✕</button>
                        </span>
                      ))}
                    </div>
                  ) : <p className="text-xs text-neutral-400 mb-2">Not on the calendar yet.</p>}
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                    <input type="date" className={input} value={sForm.date} onChange={(e) => setSForm({ ...sForm, date: e.target.value })} />
                    <select className="rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-2 text-sm" value={sForm.days} onChange={(e) => setSForm({ ...sForm, days: Number(e.target.value) })}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} day{n === 1 ? "" : "s"}</option>)}
                    </select>
                    <select className="rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-2 text-sm" value={sForm.who} onChange={(e) => setSForm({ ...sForm, who: e.target.value })}>
                      <option value="">Who?</option>
                      {crewList.map((w) => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <label className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <input type="checkbox" checked={sForm.skipWknd} onChange={(e) => setSForm({ ...sForm, skipWknd: e.target.checked })} /> skip weekends
                    </label>
                    <button disabled={sBusy} onClick={addToSchedule} className="rounded-lg bg-white text-neutral-900 px-4 py-1.5 text-xs font-bold disabled:opacity-50">{sBusy ? "Adding…" : "📅 Add to schedule"}</button>
                  </div>
                  <a href="/schedule" className="block mt-2 text-xs text-blue-300">Open the calendar →</a>
                </Section>
                <Section id="proposal" title="Proposal" summary={<>{(v as any).proposal_status ? String((v as any).proposal_status) : "not sent"}</>} defaultOpen={!!(v as any).proposal_status}>
                  <div className="flex gap-1.5 flex-wrap">
                    {["sent", "signed", "declined"].map((p) => (
                      <button key={p} onClick={() => { if (p === "declined" && (v as any).proposal_status !== "declined") { setLostPick(true); setDraft({ ...draft, proposal_status: "declined", status: "lost" }); return; } setProposal(v, (v as any).proposal_status === p ? "none" : p); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${(v as any).proposal_status === p ? "bg-white text-neutral-900 border-white" : "border-neutral-700 text-neutral-300"}`}>
                        {p === "sent" ? "📤 Sent" : p === "signed" ? "✍️ Signed" : "🚫 Declined"}
                      </button>
                    ))}
                  </div>
                  {(v as any).proposal_status === "sent" && v.quoted_date ? (() => {
                    const days = Math.floor((Date.now() - new Date(v.quoted_date + "T12:00:00").getTime()) / 86400000);
                    return <p className={`text-xs mt-1.5 ${days > 30 ? "text-red-400" : days > 14 ? "text-amber-300" : "text-neutral-400"}`}>Sent {fmtDate(v.quoted_date)} — {days} days out{days > 30 ? " · past 30-day validity" : days > 14 ? " · getting stale, check in" : ""}</p>;
                  })() : null}
                </Section>
                <Section id="money" title="Money" summary={<>{(() => { const p = parsePrice(v.price); const sp = costs[v.id] ?? 0; return p ? `${v.price} · $${sp.toLocaleString()} spent` : (sp ? `$${sp.toLocaleString()} spent` : "no price"); })()}</>} defaultOpen={true}>
                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={() => setMoney(v, "invoiced_date", (v as any).invoiced_date ? null : new Date().toISOString().slice(0, 10))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${(v as any).invoiced_date ? "bg-white text-neutral-900 border-white" : "border-neutral-700 text-neutral-300"}`}>
                      🧾 Invoiced{(v as any).invoiced_date ? " " + fmtDate((v as any).invoiced_date) : ""}
                    </button>
                    <button onClick={() => setMoney(v, "paid_date", (v as any).paid_date ? null : new Date().toISOString().slice(0, 10))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${(v as any).paid_date ? "bg-emerald-400 text-neutral-900 border-emerald-400" : "border-neutral-700 text-neutral-300"}`}>
                      💵 Paid{(v as any).paid_date ? " " + fmtDate((v as any).paid_date) : ""}
                    </button>
                  </div>
                  {(() => {
                    const priceN = parsePrice(v.price);
                    const spent = costs[v.id] ?? 0;
                    if (!priceN && !spent) return null;
                    const pct = priceN ? Math.min(100, Math.round((spent / priceN) * 100)) : 0;
                    return (
                      <div className="mt-2">
                        {priceN ? <div className="h-2 rounded-full bg-neutral-800 overflow-hidden"><div className={`h-full ${pct >= 90 ? "bg-red-400" : pct >= 70 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: pct + "%" }} /></div> : null}
                        <div className="text-xs text-neutral-400 mt-1">${spent.toLocaleString()} in costs{priceN ? ` of ${v.price} — ${pct}% spent` : ""}</div>
                      </div>
                    );
                  })()}
                </Section>
                <Section id="details" title="Details" summary={<>{v.price || "—"}</>} defaultOpen={false}>
                  {v.price ? <p><span className="text-neutral-400">Price: </span><span className="text-white font-semibold">{v.price}</span></p> : null}
                  {v.contact_name || v.contact_phone ? <p><span className="text-neutral-400">Contact: </span><span className="text-neutral-200">{[v.contact_name, v.contact_phone].filter(Boolean).join(" · ")}</span></p> : null}
                  {v.quoted_date ? <p><span className="text-neutral-400">Quoted: </span><span className="text-neutral-200">{fmtDate(v.quoted_date)}</span></p> : null}
                  {v.completed_date ? <p><span className="text-neutral-400">Completed: </span><span className="text-neutral-200">{fmtDate(v.completed_date)}</span></p> : null}
                  {v.scope_of_work ? <p className="whitespace-pre-wrap text-xs leading-relaxed"><span className="text-neutral-400">Scope: </span><span className="text-neutral-300">{v.scope_of_work}</span></p> : null}
                  {v.notes ? <p className="whitespace-pre-wrap text-xs leading-relaxed"><span className="text-neutral-400">Notes: </span><span className="text-neutral-300">{v.notes}</span></p> : null}
                </Section>
                <MyClock jobId={v.id} compact />
                <JobChecklist jobId={v.id} jobType={v.job} />
                <Section id="jobbook" title="Jobbook" summary={<>{jobbook ? "saved" : "none"}</>} defaultOpen={!!jobbook}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      {jobbook?.file_b64 ? <button onClick={downloadJobbook} className="text-xs font-semibold text-white border border-neutral-600 rounded-lg px-2.5 py-1">⬇︎ Download</button> : null}
                      <label className="text-xs font-semibold text-white border border-neutral-600 rounded-lg px-2.5 py-1 cursor-pointer">
                        {jbBusy ? "Uploading…" : jobbook?.file_b64 ? "⬆︎ Replace file" : "⬆︎ Upload xlsx"}
                        <input type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadJobbookFile(f); e.target.value = ""; }} />
                      </label>
                    </div>
                  </div>
                  {jobbook ? (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5">
                      <div className="space-y-1">
                        {(jobbook.summary?.rows ?? []).map((r: any, i: number) => (
                          <div key={i} className="flex justify-between gap-3 text-sm">
                            <span className="text-neutral-400">{r.label}</span>
                            <span className={`font-semibold tabular-nums text-right ${r.highlight ? "text-emerald-300" : "text-white"}`}>{r.value}</span>
                          </div>
                        ))}
                      </div>
                      {jobbook.summary?.note ? <p className="text-xs text-neutral-400 mt-2">{jobbook.summary.note}</p> : null}
                      <p className="text-xs text-neutral-500 mt-2">Updated {new Date(jobbook.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-500">No jobbook yet — ask Claude to build one for this job and its snapshot will show here.</p>
                  )}
                </Section>
                <Section id="costs" title="Materials & costs" summary={<>{jcosts.length ? `$${jcosts.reduce((a: number, c: any) => a + Number(c.amount ?? 0), 0).toLocaleString()} · ${jcosts.length}` : "none"}</>} defaultOpen={jcosts.length > 0}>
                  {jcosts.length ? (
                    <div className="space-y-1.5 mb-2">
                      {jcosts.map((c: any) => (
                        <div key={c.id} className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
                          {c.receipt_b64 ? (
                            <button onClick={() => setReceiptView(c.receipt_b64)} className="shrink-0"><img src={c.receipt_b64} alt="receipt" className="w-9 h-9 object-cover rounded-md border border-neutral-700" /></button>
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-white truncate">{c.vendor ?? "Receipt — needs details"}</div>
                            <div className="text-xs text-neutral-400 truncate">{fmtDate(c.entry_date)} · {c.category ?? "—"}{c.notes ? ` · ${c.notes}` : ""}</div>
                          </div>
                          {c.status === "pending" ? <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300">CLAUDE</span> : null}
                          <div className="shrink-0 text-sm font-bold tabular-nums text-white">${Number(c.amount ?? 0).toLocaleString()}</div>
                          <button onClick={() => removeJobCost(c)} className="shrink-0 text-neutral-500 hover:text-red-400 text-xs">✕</button>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-neutral-500 mb-2">No material or other costs logged yet.</p>}
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input className={input} placeholder="Vendor" value={cForm.vendor} onChange={(e) => setCForm({ ...cForm, vendor: e.target.value })} />
                      <input className={input} type="date" value={cForm.entry_date} onChange={(e) => setCForm({ ...cForm, entry_date: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select className={input} value={cForm.category} onChange={(e) => setCForm({ ...cForm, category: e.target.value })}>
                        {COST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input className={input} type="number" inputMode="decimal" placeholder="$ total (tax in)" value={cForm.amount} onChange={(e) => setCForm({ ...cForm, amount: e.target.value })} />
                    </div>
                    <input className={input} placeholder="Notes (optional)" value={cForm.notes} onChange={(e) => setCForm({ ...cForm, notes: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <label className={`rounded-lg border py-2 text-center text-xs font-semibold cursor-pointer ${cReceipt ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-neutral-600 text-white"}`}>
                        {cReceipt ? "✓ Receipt attached" : "📷 Camera"}
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickReceipt(f); e.target.value = ""; }} />
                      </label>
                      {cReceipt ? (
                        <button onClick={() => setCReceipt("")} className="rounded-lg border border-neutral-700 py-2 text-xs font-semibold text-neutral-400">Remove photo</button>
                      ) : (
                        <label className="rounded-lg border border-neutral-600 py-2 text-center text-xs font-semibold text-white cursor-pointer">
                          🖼 Photos
                          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) pickReceipts(fs); e.target.value = ""; }} />
                        </label>
                      )}
                    </div>
                    <button onClick={addJobCost} disabled={cBusy} className="w-full rounded-lg bg-white text-neutral-900 py-2 text-xs font-bold disabled:opacity-60">{cBusy ? "Saving…" : "+ Log cost"}</button>
                    <p className="text-xs text-neutral-500">Shoot it or pick from your roll, leave vendor/amount blank — it saves as pending and Claude fills it in. Several photos at once each save separately. Tax stays in the total.</p>
                  </div>
                </Section>
                <Section id="labor" title="Labor" summary={<>{labor.length ? `${labor.reduce((a: number, l: any) => a + Number(l.hours ?? 0), 0)} hrs · $${labor.reduce((a: number, l: any) => a + Number(l.amount ?? 0), 0).toLocaleString()}` : "none"}</>} defaultOpen={labor.length > 0}>
                  {labor.length ? (
                    <div className="space-y-1.5 mb-2">
                      {labor.map((l) => (
                        <div key={l.id} className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-white truncate">{l.worker ?? "—"}</div>
                            <div className="text-xs text-neutral-400">{fmtDate(l.entry_date)} · {Number(l.hours)}h @ ${Number(l.rate)}</div>
                          </div>
                          <div className="shrink-0 text-sm font-bold tabular-nums text-white">${Number(l.amount ?? 0).toLocaleString()}</div>
                          <button onClick={() => toggleLaborPaid(l)} className={`shrink-0 text-xs font-bold px-2 py-1 rounded-lg border ${l.paid ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>{l.paid ? "PAID" : "OWED"}</button>
                          <button onClick={() => removeLabor(l)} className="shrink-0 text-neutral-500 hover:text-red-400 text-xs">✕</button>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-neutral-500 mb-2">No labor logged on this job yet.</p>}
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input className={input} placeholder="Worker" value={lForm.worker} onChange={(e) => setLForm({ ...lForm, worker: e.target.value })} />
                      <input className={input} type="date" value={lForm.entry_date} onChange={(e) => setLForm({ ...lForm, entry_date: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <input className={input} type="number" inputMode="decimal" placeholder="Hours" value={lForm.hours} onChange={(e) => setLForm({ ...lForm, hours: e.target.value })} />
                      <input className={input} type="number" inputMode="decimal" placeholder="$/hr" value={lForm.rate} onChange={(e) => setLForm({ ...lForm, rate: e.target.value })} />
                      <button onClick={() => setLForm({ ...lForm, paid: !lForm.paid })} className={`rounded-lg border text-xs font-bold ${lForm.paid ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>{lForm.paid ? "PAID" : "OWED"}</button>
                    </div>
                    <button onClick={addLabor} disabled={lBusy} className="w-full rounded-lg bg-white text-neutral-900 py-2 text-xs font-bold disabled:opacity-60">{lBusy ? "Saving…" : `+ Log labor${lForm.hours && lForm.rate ? ` — $${(Number(lForm.hours) * Number(lForm.rate)).toLocaleString()}` : ""}`}</button>
                  </div>
                </Section>
                <Section id="tasks" title="Tasks" summary={<>{jtasks.filter((t: any) => !t.done).length ? `${jtasks.filter((t: any) => !t.done).length} open` : (jtasks.length ? "all done" : "none")}</>} defaultOpen={jtasks.some((t: any) => !t.done)}>
                  {jtasks.length ? (
                    <div className="space-y-1.5 mb-2">
                      {jtasks.map((t: any) => (
                        <div key={t.id} className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
                          <button onClick={() => toggleTask(t)} className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center text-xs ${t.done ? "bg-emerald-400 border-emerald-400 text-neutral-900" : "border-neutral-600 text-transparent"}`}>✓</button>
                          <div className="min-w-0 flex-1">
                            <div className={`text-sm ${t.done ? "text-neutral-400 line-through" : "text-white font-semibold"}`}>{t.title}</div>
                            {t.due_date ? <div className="text-xs text-neutral-400">due {fmtDate(t.due_date)}</div> : null}
                          </div>
                          <button onClick={() => toggleCrew(t)} aria-label={t.crew_visible ? "Hide from crew" : "Show to crew"} title={t.crew_visible ? "Crew can see this — tap to hide" : "Only you see this — tap to show the crew"}
                            className={`shrink-0 inline-flex items-center gap-1 rounded-lg border px-2 min-h-[32px] text-xs font-semibold ${t.crew_visible ? "border-amber-400/60 bg-amber-400/10 text-amber-200" : "border-neutral-700 text-neutral-500"}`}>
                            <HardHat size={14} /> {t.crew_visible ? "Crew" : "Me"}
                          </button>
                          <button onClick={() => removeTask(t)} className="shrink-0 text-neutral-500 hover:text-red-400 text-xs">✕</button>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-neutral-500 mb-2">No tasks on this job yet.</p>}
                  <div className="flex gap-2">
                    <input className={input} placeholder="Add a task for this job…" value={tTitle} onChange={(e) => setTTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} />
                    <button onClick={addTask} disabled={tBusy} className="shrink-0 rounded-lg bg-white text-neutral-900 px-3 text-xs font-bold disabled:opacity-60">{tBusy ? "…" : "+ Add"}</button>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1.5">Tasks added here also show on the main Tasks tab. Tap “Me” to show a task to the crew; the punch list always shows to crew.</p>
                </Section>
                <Section id="punch" title="Punch list"
                  summary={<>{punchStat.open ? `${punchStat.open} open${punchStat.overdue ? ` · ${punchStat.overdue} overdue` : ""}` : "clear"}</>}
                  defaultOpen={punchStat.open > 0}>
                  <PunchList jobId={v.id} />
                </Section>
                <Section id="comms" title="Correspondence" summary={<>{jcomms.length ? String(jcomms.length) : "none"}</>} defaultOpen={false}>
                  {jcomms.length ? (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {jcomms.map((m: any) => (
                        <div key={m.id} className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-2.5">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${m.direction === "in" ? "bg-emerald-500/20 text-emerald-300" : "bg-blue-500/20 text-blue-300"}`}>{m.direction === "in" ? "FROM CLIENT" : "SENT"}</span>
                            <span className="text-xs uppercase text-neutral-400">{m.kind}</span>
                            <span className="text-xs text-neutral-400 ml-auto">{new Date(m.occurred_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                          </div>
                          <pre className="whitespace-pre-wrap text-xs text-neutral-300 font-sans leading-relaxed m-0">{m.body}</pre>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-neutral-500">No correspondence logged for this job yet.</p>}
                </Section>
                <Section id="photos" title="Photos" summary={<>{photos.length ? String(photos.length) : "none"}</>} defaultOpen={false}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-white border border-neutral-600 rounded-lg px-2.5 py-1 cursor-pointer">
                      {photoBusy ? "Saving…" : "📷 Add"}
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) addPhotos(fs, "during"); e.target.value = ""; }} />
                    </label>
                  </div>
                  {photos.length === 0 ? <p className="text-xs text-neutral-500">No photos yet — tap 📷 Add. Tap a photo's label to cycle before / during / after.</p> : (
                    <div className="grid grid-cols-3 gap-1.5">
                      {photos.map((p) => (
                        <div key={p.id} className="relative">
                          <img src={p.photo_b64} alt={p.phase} className="w-full h-24 object-cover rounded-lg border border-neutral-800" />
                          <button onClick={() => removePhoto(p.id)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-neutral-300 text-xs">✕</button>
                          <button onClick={() => cyclePhase(p)} className="absolute bottom-1 left-1 text-xs font-bold uppercase bg-black/70 rounded px-1 text-neutral-200">{p.phase}</button>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
                <div className="flex gap-2">
                  <button onClick={() => togglePriority(v)} className="flex-1 rounded-lg border border-neutral-700 py-2 text-xs font-semibold text-amber-300">{v.priority ? "Remove ★ priority" : "★ Mark priority"}</button>
                  <button onClick={() => remove(v)} className="rounded-lg border border-red-900 px-4 py-2 text-xs text-red-400">Delete</button>
                </div>
              </div>
            </div>
          </div>
        );
      })() : (
        <div className="hidden lg:flex sticky top-[77px] h-[calc(100vh-93px)] rounded-2xl border border-dashed border-neutral-800 items-center justify-center text-center px-8">
          <div>
            <Briefcase size={32} className="mx-auto text-neutral-500" />
            <p className="mt-3 text-base font-semibold text-neutral-300">Pick a job to open its file here</p>
            <p className="mt-1 text-sm text-neutral-400">The list stays put on the left, so you can click through jobs.</p>
          </div>
        </div>
      )}

      {receiptView ? (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setReceiptView("")}>
          <img src={receiptView} alt="receipt" className="max-h-full max-w-full rounded-lg" />
        </div>
      ) : null}

      {editing ? (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-t-2xl sm:rounded-2xl p-5">
            <h2 className="font-bold text-white mb-4">{editing === "new" ? "Add Job" : "Edit Job"}</h2>
            <div className="space-y-3">
              <div><label className={label}>Job Name</label><input className={input} placeholder="e.g. 59 Cedar St" value={form.job_name} onChange={(e) => setForm({ ...form, job_name: e.target.value })} /></div>
              <div>
                <label className={label}>Customer *</label>
                {newCustomer ? (
                  <div className="flex gap-2">
                    <input className={input} autoFocus placeholder="New customer name"
                      value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value, customer_id: "" })} />
                    <button type="button" onClick={() => { setNewCustomer(false); setForm({ ...form, customer: "", customer_id: "" }); }}
                      className="shrink-0 rounded-lg border border-neutral-700 px-3 text-xs font-semibold text-neutral-400">Cancel</button>
                  </div>
                ) : (
                  <select className={input} value={form.customer_id}
                    onChange={(e) => {
                      if (e.target.value === "__new") { setNewCustomer(true); setForm({ ...form, customer: "", customer_id: "", property_id: "" }); return; }
                      const c = customers.find((x) => x.id === e.target.value);
                      setForm({
                        ...form, customer_id: e.target.value, customer: c?.name ?? "", property_id: "",
                        contact_name: form.contact_name || c?.contact_name || "",
                        contact_phone: form.contact_phone || c?.phone || "",
                      });
                    }}>
                    <option value="">Pick a customer…</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value="__new">＋ New customer…</option>
                  </select>
                )}
                {!newCustomer && form.customer && !form.customer_id ? (
                  <p className="mt-1 text-xs text-amber-300">Saved as &quot;{form.customer}&quot; — pick it from the list to tie it to the customer record.</p>
                ) : null}
              </div>
              {form.customer_id && properties.some((p) => p.customer_id === form.customer_id) ? (
                <div>
                  <label className={label}>Their properties</label>
                  <select className={input} value={form.property_id}
                    onChange={(e) => {
                      const p = properties.find((x) => x.id === e.target.value);
                      setForm({ ...form, property_id: e.target.value, location: p ? p.address : form.location });
                    }}>
                    <option value="">＋ New address — type it below</option>
                    {properties.filter((p) => p.customer_id === form.customer_id).map((p) => (
                      <option key={p.id} value={p.id}>{p.label ? p.label + " — " : ""}{p.address}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Location</label><input className={input} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
                <div><label className={label}>Job Type</label><input className={input} value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Status</label>
                  <select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </select>
                </div>
                <div><label className={label}>Price</label><input className={input} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Contact Name</label><input className={input} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
                <div><label className={label}>Contact Phone</label><input className={input} value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
              </div>
              <div><label className={label}>Scope of Work</label><textarea rows={3} className={input} value={form.scope_of_work} onChange={(e) => setForm({ ...form, scope_of_work: e.target.value })} /></div>
              <div><label className={label}>Notes</label><textarea rows={2} className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setEditing(null)} className="flex-1 rounded-lg border border-neutral-700 py-2.5 text-sm text-neutral-300">Cancel</button>
              <button onClick={save} disabled={busy} className="flex-1 rounded-lg bg-white text-neutral-900 py-2.5 text-sm font-semibold disabled:opacity-60">
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
