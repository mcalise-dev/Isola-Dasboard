"use client";
// v4.6 job record (Attio / HubSpot pattern): stage stepper on top, tabs in the main column,
// key facts in a right rail. Replaces the v4.5 job file sheet; all of its features are here.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STATUS_META, LOST_REASONS, fmtDate, fmtPrice, parsePrice, todayISO, daysSince } from "@/lib/format";
import { undoable, showToast, showError } from "@/components/Toaster";
import { editJob, LEAD_SOURCES } from "@/components/job/JobForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { KV, Progress, Stepper, Empty } from "@/components/ui/bits";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NativeSelect, Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import JobChecklist from "@/components/JobChecklist";
import CrewSetup from "@/components/job/CrewSetup";
import MyClock from "@/components/MyClock";
import { CostsPanel, LaborPanel, TasksPanel, PhotosPanel, SchedulePanel, JobbookCard, ActivityPanel } from "@/components/job/panels";
import { MoneyPanel, ProposalPanel, DocsPanel } from "@/components/job/hub";
import { cn } from "@/lib/utils";
import { ask } from "@/components/Dialogs";
import {
  Phone, Navigation, Pencil, MoreHorizontal, Star, Trash2, XCircle, ChevronLeft, MapPin, Hammer, ThumbsUp,
  CalendarPlus, Play, CheckCircle2, FileText, Banknote, ArrowRight, Briefcase, Building2,
} from "lucide-react";

const STEPS = [
  { key: "lead", label: "To quote" }, { key: "walked", label: "Walked" }, { key: "awaiting", label: "Sent" },
  { key: "booked", label: "Booked" }, { key: "scheduled", label: "Scheduled" }, { key: "progress", label: "In progress" },
  { key: "complete", label: "Complete" }, { key: "invoiced", label: "Invoiced" }, { key: "paid", label: "Paid" },
];
const ORDER = ["lead", "awaiting", "booked", "progress", "complete"];

// Tabs on the job record. Deep link with /jobs/<id>?tab=<key>; aliases map the
// names other screens use (billing, build, punch…) onto the right tab.
const TABS = ["overview", "money", "costs", "schedule", "tasks", "proposal", "docs", "photos", "activity"] as const;
const TAB_ALIAS: Record<string, string> = {
  billing: "money", payments: "money", "change-orders": "money",
  build: "proposal", proposals: "proposal", estimate: "proposal",
  documents: "docs", log: "docs", logs: "docs", "daily-log": "docs",
  punch: "tasks", labor: "costs",
};
export const resolveTab = (t: string | null | undefined) => {
  const k = String(t ?? "").toLowerCase();
  const v = TAB_ALIAS[k] ?? k;
  return (TABS as readonly string[]).includes(v) ? v : null;
};

export function nextStep(j: any, ctx: { walked: boolean; drafting: boolean; scheduled: boolean }) {
  const today = todayISO();
  if (j.status === "lead") return !ctx.walked ? { label: "Log the site visit", icon: MapPin, href: "/visits" }
    : ctx.drafting ? { label: "Finish the proposal", icon: Hammer, href: "/build" } : { label: "Price it, start a build", icon: Hammer, href: "/build" };
  if (j.status === "awaiting") return { label: "They said yes, mark Booked", icon: ThumbsUp, patch: { status: "booked", won_date: j.won_date ?? today }, toast: "Moved to Booked" };
  if (j.status === "booked") return !ctx.scheduled ? { label: "Put it on the schedule", icon: CalendarPlus, tab: "schedule" }
    : { label: "Crew started, mark In progress", icon: Play, patch: { status: "progress" }, toast: "Moved to In progress" };
  if (j.status === "progress") return { label: "Work's done, mark Complete", icon: CheckCircle2, patch: { status: "complete", completed_date: j.completed_date ?? today }, toast: "Marked Complete" };
  if (j.status === "complete") return !j.invoiced_date ? { label: "Mark invoiced", icon: FileText, patch: { invoiced_date: today }, toast: "Marked invoiced" }
    : !j.paid_date ? { label: "Mark paid", icon: Banknote, patch: { paid_date: today }, toast: "Marked paid" } : null;
  return null;
}

export default function JobRecord({ id }: { id: string }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [job, setJob] = useState<any | null | undefined>(undefined);
  const [costs, setCosts] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [sched, setSched] = useState<any[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [crew, setCrew] = useState<string[]>([]);
  const [customer, setCustomer] = useState<any | null>(null);
  const [property, setProperty] = useState<any | null>(null);
  const searchParams = useSearchParams();
  const urlTab = resolveTab(searchParams?.get("tab"));
  const [tab, setTabState] = useState<string>(urlTab ?? "overview");
  // follow ?tab= when it changes (links into this same job from elsewhere)
  useEffect(() => { if (urlTab) setTabState(urlTab); }, [urlTab]);
  // keep ?tab= in the address bar so refresh / share lands on the same tab
  const setTab = useCallback((t: string) => {
    setTabState(t);
    try {
      const u = new URL(window.location.href);
      if (t === "overview") u.searchParams.delete("tab"); else u.searchParams.set("tab", t);
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    } catch { /* ignore */ }
  }, []);
  const [lostPick, setLostPick] = useState(false);

  const load = useCallback(async () => {
    const [j, c, v, s, e] = await Promise.all([
      sb.from("jobs").select("*").eq("id", id).maybeSingle(),
      sb.from("job_costs").select("id,entry_date,category,vendor,worker,amount").eq("job_id", id).order("entry_date", { ascending: false }),
      sb.from("site_visits").select("id,visit_date,met_with,purpose").eq("job_id", id).order("visit_date"),
      sb.from("schedule_entries").select("id,entry_date,assignee").eq("job_id", id).order("entry_date"),
      sb.from("estimates").select("id,sent_at").eq("job_id", id),
    ]);
    setJob(j.data ?? null);
    setCosts(c.data ?? []); setVisits(v.data ?? []); setSched(s.data ?? []);
    setDrafting((e.data ?? []).some((x: any) => !x.sent_at));
    const jd: any = j.data;
    if (jd?.customer_id) sb.from("customers").select("id,name,contact_name,phone,email,client_type,kind").eq("id", jd.customer_id).maybeSingle().then(({ data }) => setCustomer(data ?? null));
    if (jd?.property_id) sb.from("properties").select("id,label,address,city,access_notes").eq("id", jd.property_id).maybeSingle().then(({ data }) => setProperty(data ?? null));
  }, [id, sb]);

  useEffect(() => {
    load();
    sb.from("workers").select("name").eq("active", true).order("name").then(({ data }: any) => setCrew((data ?? []).map((w: any) => w.name)));
    const on = () => load();
    window.addEventListener("isola:changed", on);
    return () => window.removeEventListener("isola:changed", on);
  }, [load, sb]);

  if (job === undefined) return (
    <div className="space-y-4"><div className="skeleton h-8 w-64" /><div className="skeleton h-16" />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]"><div className="skeleton h-80" /><div className="skeleton h-80" /></div></div>
  );
  if (job === null) return <Empty icon={<Briefcase size={28} />} title="Job not found" body="It may have been deleted." action={<Button asChild variant="outline"><Link href="/">Back to jobs</Link></Button>} />;

  const ctx = { walked: visits.length > 0, drafting, scheduled: sched.length > 0 || !!job.start_date };
  const step = nextStep(job, ctx);
  const priceN = Number(job.price_amount) || parsePrice(job.price);
  const spent = costs.reduce((a, c) => a + Number(c.amount ?? 0), 0);
  const margin = priceN ? priceN - spent : null;
  const mPct = priceN ? Math.round(((priceN - spent) / priceN) * 100) : null;
  const usedPct = priceN ? Math.round((spent / priceN) * 100) : 0;
  const tel = String(job.contact_phone || customer?.phone || "").replace(/[^0-9+]/g, "");
  const today = todayISO();

  // where the job sits on the stepper
  const sIdx = ORDER.indexOf(job.status);
  const doneFlags = [
    sIdx >= 0, ctx.walked || sIdx >= 1, sIdx >= 2 || !!job.quoted_date, sIdx >= 2, ctx.scheduled || sIdx >= 3,
    sIdx >= 4, sIdx >= 4, !!job.invoiced_date, !!job.paid_date,
  ];
  const current = job.status === "lost" ? -1 : doneFlags.findIndex((d) => !d) === -1 ? STEPS.length - 1 : doneFlags.findIndex((d) => !d);

  function patch(p: Record<string, any>, text: string) {
    const before = job;
    undoable({
      text, hide: () => setJob({ ...before, ...p }), restore: () => setJob(before),
      commit: async () => {
        const { error } = await sb.from("jobs").update({ ...p, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) showError("Save failed: " + error.message);
        window.dispatchEvent(new Event("isola:changed"));
      },
    });
  }
  function pickStep(key: string) {
    if (key === "walked") { router.push("/visits"); return; }
    if (key === "scheduled") { setTab("schedule"); return; }
    if (key === "invoiced") { patch({ invoiced_date: job.invoiced_date ? null : today }, job.invoiced_date ? "Invoice date cleared" : "Marked invoiced"); return; }
    if (key === "paid") { patch({ paid_date: job.paid_date ? null : today, ...(job.status !== "complete" ? { status: "complete", completed_date: job.completed_date ?? today } : {}) }, job.paid_date ? "Paid date cleared" : "Marked paid"); return; }
    const p: any = { status: key };
    if (key === "complete" && !job.completed_date) p.completed_date = today;
    if (key === "awaiting" && !job.quoted_date) { p.quoted_date = today; p.proposal_status = "sent"; }
    if ((key === "booked" || key === "progress") && !job.won_date) p.won_date = today;
    patch(p, `Moved to ${STATUS_META[key].label}`);
  }
  async function del() {
    if (!(await ask({ title: `Delete ${job.job_name || job.customer}?`, body: "This can't be undone.", confirm: "Delete", danger: true }))) return;
    const { error } = await sb.from("jobs").delete().eq("id", id);
    if (error) { showError("Delete failed: " + error.message); return; }
    window.dispatchEvent(new Event("isola:changed"));
    showToast("Job deleted");
    router.push("/");
  }
  async function setField(field: string, value: any) {
    setJob({ ...job, [field]: value });
    const { error } = await sb.from("jobs").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) showError("Save failed: " + error.message); else showToast("Saved");
  }

  const StepIcon = step?.icon;
  const runStep = () => {
    if (!step) return;
    if ("href" in step && step.href) router.push(step.href);
    else if ("tab" in step && step.tab) setTab(step.tab);
    else if ("patch" in step && step.patch) patch(step.patch, step.toast!);
  };

  return (
    <div>
      {/* header */}
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-1.5 text-[13px] text-neutral-500">
          <Link href="/" className="inline-flex items-center gap-1 hover:text-white"><ChevronLeft size={15} /> Jobs</Link>
          {job.customer ? <><span>/</span>{job.customer_id ? <Link href={`/customers/${job.customer_id}`} className="truncate hover:text-white">{job.customer}</Link> : <span className="truncate">{job.customer}</span>}</> : null}
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATUS_META[job.status]?.cls)}>{STATUS_META[job.status]?.label}</span>
              {job.paid_date ? <Badge variant="success">Paid</Badge> : job.invoiced_date ? <Badge variant="warning">Invoiced</Badge> : null}
              {job.status === "awaiting" && job.quoted_date ? <Badge variant={daysSince(job.quoted_date) > 30 ? "danger" : daysSince(job.quoted_date) > 14 ? "warning" : "muted"}>{daysSince(job.quoted_date)}d out</Badge> : null}
              {job.priority ? <Badge variant="warning"><Star size={11} /> Priority</Badge> : null}
              {job.partner ? <Badge variant="muted">With {job.partner}</Badge> : null}
            </div>
            <h1 className="text-2xl font-semibold leading-tight text-white md:text-[28px]">{job.job_name || job.customer}</h1>
            <p className="mt-1 truncate text-sm text-neutral-400">{[job.customer, job.location, job.job].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {tel.length >= 7 ? <Button asChild variant="outline" size="sm"><a href={`tel:${tel.slice(0, 11)}`}><Phone size={15} /> Call</a></Button> : null}
            {job.location ? <Button asChild variant="outline" size="sm"><a href={`https://maps.google.com/?q=${encodeURIComponent(job.location)}`} target="_blank" rel="noreferrer"><Navigation size={15} /> Map</a></Button> : null}
            <Button variant="outline" size="sm" onClick={() => editJob(job)}><Pencil size={15} /> Edit</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="icon-sm" aria-label="More"><MoreHorizontal size={16} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setField("priority", !job.priority)}><Star size={15} /> {job.priority ? "Remove priority" : "Mark priority"}</DropdownMenuItem>
                {job.status !== "lost" ? <DropdownMenuItem onSelect={() => setLostPick(true)}><XCircle size={15} /> Mark lost / declined</DropdownMenuItem>
                  : <DropdownMenuItem onSelect={() => patch({ status: "lead", lost_reason: null, lost_date: null }, "Reopened")}><ArrowRight size={15} /> Reopen</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={del} className="text-red-300 data-[highlighted]:text-red-200"><Trash2 size={15} /> Delete job</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* stepper */}
      {job.status === "lost" ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3">
          <XCircle size={18} className="text-red-300" />
          <span className="text-sm text-red-200">Lost{job.lost_reason ? `: ${job.lost_reason}` : ""}{job.lost_date ? ` · ${fmtDate(job.lost_date)}` : ""}</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => patch({ status: "lead", lost_reason: null, lost_date: null }, "Reopened")}>Reopen</Button>
        </div>
      ) : <Stepper className="mb-4" steps={STEPS} current={current} done={(i) => doneFlags[i]} onPick={pickStep} />}

      {lostPick ? (
        <Card className="mb-4 p-4">
          <div className="mb-2 text-sm font-semibold text-white">Why was it lost?</div>
          <div className="flex flex-wrap gap-1.5">
            {LOST_REASONS.map((r) => <Button key={r} size="sm" variant="outline" onClick={() => { setLostPick(false); patch({ status: "lost", lost_reason: r, lost_date: today, ...(job.proposal_status === "sent" ? { proposal_status: "declined" } : {}) }, "Marked lost"); }}>{r}</Button>)}
            <Button size="sm" variant="ghost" onClick={() => setLostPick(false)}>Cancel</Button>
          </div>
        </Card>
      ) : null}

      {step && StepIcon ? (
        <button onClick={runStep} className="mb-5 flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3 text-left text-neutral-900 transition-transform active:scale-[.995] lg:hidden">
          <StepIcon size={20} strokeWidth={2.4} /><span className="flex-1 text-base font-semibold">{step.label}</span><ArrowRight size={18} className="opacity-60" />
        </button>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* main */}
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={setTab}>
            {/* 9 tabs: one scrolling row on a phone (no wrap), bleeds to the screen edge */}
            <TabsList className="-mx-4 flex-nowrap gap-4 scroll-px-4 px-4 sm:mx-0 sm:gap-5 sm:px-0 [&>*]:min-h-[40px]">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="money">Money</TabsTrigger>
              <TabsTrigger value="costs">Costs & labor</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="proposal">Proposal</TabsTrigger>
              <TabsTrigger value="docs">Docs</TabsTrigger>
              <TabsTrigger value="photos">Photos</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-6">
              <section>
                <h2 className="mb-2 text-[17px] font-semibold text-white">Scope of work</h2>
                {job.scope_of_work ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">{job.scope_of_work}</p>
                  : <button onClick={() => editJob(job)} className="text-sm text-neutral-500 hover:text-white">No scope written yet. Add one</button>}
              </section>
              {job.notes ? (
                <section>
                  <h2 className="mb-2 text-[17px] font-semibold text-white">Notes</h2>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">{job.notes}</p>
                </section>
              ) : null}
              <section>
                <h2 className="mb-2 text-[17px] font-semibold text-white">Proposal</h2>
                <div className="flex flex-wrap gap-1.5">
                  {["sent", "signed", "declined"].map((p) => (
                    <Button key={p} size="sm" variant={job.proposal_status === p ? "default" : "outline"} onClick={() => {
                      if (p === "declined" && job.proposal_status !== "declined") { setLostPick(true); return; }
                      const off = job.proposal_status === p;
                      const pp: any = { proposal_status: off ? "none" : p };
                      if (p === "sent" && !off && !job.quoted_date) pp.quoted_date = today;
                      patch(pp, off ? "Proposal status cleared" : `Proposal ${p}`);
                    }}>{p === "sent" ? "Sent" : p === "signed" ? "Signed" : "Declined"}</Button>
                  ))}
                </div>
                {job.proposal_status === "sent" && job.quoted_date ? (
                  <p className={cn("mt-2 text-sm", daysSince(job.quoted_date) > 30 ? "text-red-400" : daysSince(job.quoted_date) > 14 ? "text-amber-300" : "text-neutral-400")}>
                    Sent {fmtDate(job.quoted_date)}, {daysSince(job.quoted_date)} days out{daysSince(job.quoted_date) > 30 ? ". Past the 30-day validity" : daysSince(job.quoted_date) > 14 ? ". Getting stale, check in" : ""}
                  </p>
                ) : null}
              </section>
              <section className="grid gap-4 md:grid-cols-2">
                <div><MyClock jobId={job.id} compact /></div>
                <div><JobChecklist jobId={job.id} jobType={job.job} /></div>
              </section>
              <CrewSetup jobId={job.id} crewNotes={job.crew_notes ?? null} onSaved={load} />
            </TabsContent>
            <TabsContent value="money"><MoneyPanel job={job} /></TabsContent>
            <TabsContent value="proposal"><ProposalPanel jobId={job.id} /></TabsContent>
            <TabsContent value="docs"><DocsPanel jobId={job.id} /></TabsContent>
            <TabsContent value="costs" className="space-y-8">
              <CostsPanel jobId={job.id} onChange={load} />
              <LaborPanel jobId={job.id} onChange={load} />
            </TabsContent>
            <TabsContent value="schedule"><SchedulePanel job={job} entries={sched} crew={crew} onChange={load} /></TabsContent>
            <TabsContent value="tasks"><TasksPanel jobId={job.id} /></TabsContent>
            <TabsContent value="photos"><PhotosPanel jobId={job.id} /></TabsContent>
            <TabsContent value="activity"><ActivityPanel job={job} extra={{ costs, visits }} /></TabsContent>
          </Tabs>
        </div>

        {/* right rail */}
        <aside className="space-y-4 lg:sticky lg:top-[76px]">
          {step && StepIcon ? (
            <button onClick={runStep} className="hidden w-full items-center gap-3 rounded-xl bg-white px-4 py-3 text-left text-neutral-900 transition-colors hover:bg-neutral-200 lg:flex">
              <StepIcon size={18} strokeWidth={2.4} /><span className="flex-1 text-sm font-semibold">{step.label}</span><ArrowRight size={16} className="opacity-60" />
            </button>
          ) : null}

          <Card className="p-4">
            <h3 className="mb-2 text-[15px] font-semibold text-white">Money</h3>
            <div className="grid grid-cols-3 gap-2">
              <div><div className="text-xs text-neutral-500">Contract</div><div className="truncate text-lg font-semibold tabular-nums text-white">{fmtPrice(job.price) || "—"}</div></div>
              <div><div className="text-xs text-neutral-500">Spent</div><div className="text-lg font-semibold tabular-nums text-white">${Math.round(spent).toLocaleString()}</div></div>
              <div><div className="text-xs text-neutral-500">Margin</div>
                <div className={cn("text-lg font-semibold tabular-nums", mPct == null ? "text-neutral-500" : mPct < 10 ? "text-red-300" : mPct < 30 ? "text-amber-300" : "text-emerald-300")}>{margin == null ? "—" : `${mPct}%`}</div></div>
            </div>
            {priceN ? <><Progress className="mt-3" value={usedPct} tone={usedPct >= 90 ? "bad" : usedPct >= 70 ? "warn" : "ok"} /><p className="mt-1 text-xs text-neutral-500">{usedPct}% of the price spent{margin != null ? ` · $${Math.round(margin).toLocaleString()} left` : ""}</p></> : null}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant={job.invoiced_date ? "secondary" : "outline"} className="flex-1" onClick={() => pickStep("invoiced")}>{job.invoiced_date ? `Invoiced ${fmtDate(job.invoiced_date).replace(/^\w+, /, "")}` : "Mark invoiced"}</Button>
              <Button size="sm" variant={job.paid_date ? "success" : "outline"} className="flex-1" onClick={() => pickStep("paid")}>{job.paid_date ? `Paid ${fmtDate(job.paid_date).replace(/^\w+, /, "")}` : "Mark paid"}</Button>
            </div>
            <Button size="sm" variant="ghost" className="mt-2 h-10 w-full" onClick={() => setTab("money")}>Payments & change orders <ArrowRight size={14} /></Button>
            {job.qbo_invoice_ref ? <KV k="QuickBooks invoice" className="mt-2">#{job.qbo_invoice_ref}</KV> : null}
            {job.partner ? <KV k={`${job.partner} share`}>{job.partner_share ? `${job.partner_share}%` : "50% of net"}</KV> : null}
          </Card>

          <Card className="p-4">
            <h3 className="mb-1 text-[15px] font-semibold text-white">Customer</h3>
            <KV k="Customer">{job.customer_id ? <Link href={`/customers/${job.customer_id}`} className="inline-flex items-center gap-1 hover:underline"><Building2 size={13} /> {job.customer}</Link> : job.customer}</KV>
            {job.contact_name || customer?.contact_name ? <KV k="Contact">{job.contact_name || customer?.contact_name}</KV> : null}
            {tel ? <KV k="Phone"><a href={`tel:${tel}`} className="hover:underline">{job.contact_phone || customer?.phone}</a></KV> : null}
            {customer?.email ? <KV k="Email"><a href={`mailto:${customer.email}`} className="hover:underline">{customer.email}</a></KV> : null}
            {job.location ? <KV k="Site">{property?.label ? `${property.label} · ` : ""}{job.location}</KV> : null}
            {property?.access_notes ? <KV k="Access">{property.access_notes}</KV> : null}
          </Card>

          <Card className="p-4">
            <h3 className="mb-1 text-[15px] font-semibold text-white">Dates</h3>
            <KV k="Added">{fmtDate(String(job.created_at).slice(0, 10))}</KV>
            <KV k="Quoted">{fmtDate(job.quoted_date)}</KV>
            <KV k="Won">{fmtDate(job.won_date)}</KV>
            <KV k="Start">{fmtDate(job.start_date)}</KV>
            <KV k="On the schedule">{sched.length ? `${sched.length} day${sched.length === 1 ? "" : "s"}` : "—"}</KV>
            <KV k="Completed">{fmtDate(job.completed_date)}</KV>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-[15px] font-semibold text-white">Where it came from</h3>
            <div className="grid grid-cols-2 gap-2">
              <NativeSelect value={job.lead_source ?? ""} onChange={(e) => setField("lead_source", e.target.value || null)} className="h-9 text-[13px]" aria-label="Lead source">
                <option value="">Source not set</option>
                {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
              </NativeSelect>
              <Input key={job.referred_by ?? ""} defaultValue={job.referred_by ?? ""} placeholder="Referred by" className="h-9 text-[13px]" onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (job.referred_by ?? null)) setField("referred_by", v); }} />
            </div>
          </Card>

          <Card className="p-4"><JobbookCard jobId={job.id} /></Card>
        </aside>
      </div>
    </div>
  );
}
