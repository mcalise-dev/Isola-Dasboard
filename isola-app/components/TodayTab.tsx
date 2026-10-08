"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import MyClock from "@/components/MyClock";
import PipelineNumbers from "@/components/PipelineNumbers";
import { daysSince, fmtDate, parsePrice } from "@/lib/format";
import { proposalFollowup, invoiceReminder, reviewRequest, followupStage, invoiceStage, mailto, isThmInvoice, money$ } from "@/lib/emails";
import { withTimeout, firstError } from "@/lib/load";
import { showError, showToast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionTitle, Stat, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { Check, Navigation, ChevronRight, Mail, MailCheck, Star, CalendarDays, Pencil } from "lucide-react";

// TODAY (v4.1, 9/22/26) — one screen for the day, replacing the old Home.
//   1. Where you're going   (today's calendar, in order, with the route)
//   2. Do today              (overdue + today's tasks and game-plan lines, check off here)
//   3. Money coming in       (to invoice, overdue invoices with a reminder email)
//   4. Pipeline              (compact numbers)
const etToday = () => {
  const n = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};
const fmt$ = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const GMAIL_DRAFTS = "https://mail.google.com/mail/u/0/#drafts";

export default function TodayTab() {
  const supabase = useMemo(() => createClient(), []);
  const today = etToday();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [sched, setSched] = useState<any[]>([]);
  const [plan, setPlan] = useState<any | null>(null);
  const [snap, setSnap] = useState<any | null>(null);
  const [snapAt, setSnapAt] = useState<string | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [mktDue, setMktDue] = useState(0);
  const [thmBal, setThmBal] = useState<number | null>(null);
  const [nextUp, setNextUp] = useState<any[]>([]);
  const [reviewUrl, setReviewUrl] = useState<string>("");
  const [reviewDraft, setReviewDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
    const [j, t, s, gp, ms, cu, cc, pl, ed, ct, mt, th, nx, rs] = await withTimeout(Promise.all([
      supabase.from("jobs").select("*"),
      supabase.from("tasks").select("id,title,job_id,due_date,priority,auto_key,done").eq("done", false).lte("due_date", today).order("due_date"),
      supabase.from("schedule_entries").select("id,label,job_id,assignee,sort").eq("entry_date", today).order("sort").order("created_at"),
      supabase.from("game_plans").select("id,headline,game_plan_items(id,body,done,sort_order,job_id)").eq("plan_date", today),
      supabase.from("money_snapshot").select("data,updated_at").eq("id", 1),
      supabase.from("customers").select("id,name,contact_name,email,qbo_names"),
      supabase.from("customer_contacts").select("customer_id,name,email,is_billing,sort"),
      supabase.from("proposal_links").select("job_id,token,status,sent_at").order("created_at", { ascending: false }),
      supabase.from("email_drafts").select("task_id,invoice_ref,stage,status,created_at"),
      supabase.from("contacts").select("id,next_date,stage").lte("next_date", today),
      supabase.from("mkt_tasks").select("id").eq("done", false).lte("due_date", today),
      supabase.from("thm_ledger").select("side,amount,bucket,is_open"),
      supabase.from("schedule_entries").select("id,entry_date,job_id,label").gt("entry_date", today).order("entry_date").limit(3),
      supabase.from("app_settings").select("value").eq("key", "google_review_url").maybeSingle(),
    ]));
    // the day itself (jobs, tasks, calendar, game plan) must load; the side panels stay best-effort like before
    const e = firstError(j, t, s, gp);
    if (e) throw new Error(e);
    setReviewUrl((rs.data as any)?.value ?? "");
    setJobs(j.data ?? []);
    setTasks(t.data ?? []);
    setSched(s.data ?? []);
    setPlan((gp.data ?? [])[0] ?? null);
    setSnap((ms.data ?? [])[0]?.data ?? null);
    setSnapAt((ms.data ?? [])[0]?.updated_at ?? null);
    setCustomers(cu.data ?? []);
    setContacts(cc.data ?? []);
    setLinks(pl.data ?? []);
    setDrafts(ed.data ?? []);
    setMktDue((ct.data ?? []).filter((c: any) => !["Won", "Dead", "Client"].includes(c.stage)).length + (mt.data ?? []).length);
    setThmBal((th.data ?? []).filter((e: any) => e.bucket === "inv94" && !e.is_open).reduce((a: number, e: any) => a + (e.side === "owes_isola" ? 1 : -1) * Number(e.amount), 0));
    setNextUp(nx.data ?? []);
    setLoading(false);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? "Couldn't load the day sheet.");
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);
  const custById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);

  // who to email: the customer's billing contact, else the customer record, else any contact with an email
  function emailFor(customerId?: string | null, customerName?: string | null) {
    let c = customerId ? custById[customerId] : null;
    if (!c && customerName) {
      const n = customerName.toLowerCase().trim();
      c = customers.find((x) => x.name?.toLowerCase() === n || (x.qbo_names ?? []).some((q: string) => q.toLowerCase() === n)) ?? null;
    }
    if (!c) return { to: null as string | null, name: null as string | null };
    const cs = contacts.filter((x) => x.customer_id === c.id && x.email);
    const billing = cs.find((x) => x.is_billing) ?? null;
    if (billing) return { to: billing.email, name: billing.name };
    if (c.email) return { to: c.email, name: c.contact_name };
    if (cs[0]) return { to: cs[0].email, name: cs[0].name };
    return { to: null, name: c.contact_name };
  }

  async function doneTask(t: any) {
    setTasks((x) => x.filter((y) => y.id !== t.id));
    await supabase.from("tasks").update({ done: true, completed_at: new Date().toISOString() }).eq("id", t.id);
  }
  async function doneItem(i: any) {
    setPlan((p: any) => p ? { ...p, game_plan_items: p.game_plan_items.map((x: any) => (x.id === i.id ? { ...x, done: true } : x)) } : p);
    await supabase.from("game_plan_items").update({ done: true, completed_at: new Date().toISOString() }).eq("id", i.id);
  }

  // ---------- 1. where you're going ----------
  const stops = sched.map((e) => ({ e, j: e.job_id ? jobById[e.job_id] : null }));
  const addrs = stops.map((s) => s.j?.location).filter((x): x is string => !!x && x.trim().length > 2);
  const routeUrl = addrs.length === 0 ? null : addrs.length === 1
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrs[0])}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addrs[addrs.length - 1])}&waypoints=${addrs.slice(0, -1).map(encodeURIComponent).join("|")}&travelmode=driving`;
  const unscheduled = jobs.filter((j) => j.status === "booked" && !j.start_date).length;

  // ---------- 2. do today ----------
  const overdue = tasks.filter((t) => t.due_date < today);
  const dueToday = tasks.filter((t) => t.due_date === today);
  const gpOpen = ((plan?.game_plan_items ?? []) as any[]).filter((i) => !i.done).sort((a, b) => a.sort_order - b.sort_order);
  const draftByTask = useMemo(() => Object.fromEntries(drafts.filter((d) => d.task_id).map((d) => [d.task_id, d])), [drafts]);

  function followupMail(t: any) {
    const j = t.job_id ? jobById[t.job_id] : null;
    if (!j) return null;
    const who = emailFor(j.customer_id, j.customer);
    const link = links.find((l) => l.job_id === j.id && ["sent", "viewed"].includes(l.status));
    const e = proposalFollowup(followupStage(t.auto_key), { contact: who.name ?? j.contact_name, job: j.job_name || j.customer, location: j.location, sentDate: j.quoted_date, token: link?.token });
    return { href: mailto(who.to, e), to: who.to };
  }

  async function saveReviewUrl() {
    const v = reviewDraft.trim();
    if (!/^https?:\/\//i.test(v)) { showError("Paste the full link — it starts with https://"); return; }
    const { error } = await supabase.from("app_settings").upsert({ key: "google_review_url", value: v, updated_at: new Date().toISOString() });
    if (error) { showError("Save failed: " + error.message); return; }
    setReviewUrl(v); setReviewDraft("");
    showToast("Review link saved");
  }

  function reviewMail(t: any) {
    const j = t.job_id ? jobById[t.job_id] : null;
    if (!j) return null;
    const who = emailFor(j.customer_id, j.customer);
    const e = reviewRequest({ contact: who.name ?? j.contact_name, job: j.job_name || j.customer, url: reviewUrl || null });
    return { href: mailto(who.to, e), to: who.to };
  }

  function taskRow(t: any, late: boolean) {
    const j = t.job_id ? jobById[t.job_id] : null;
    const isFollow = (t.auto_key ?? "").startsWith("awaiting:followup");
    const isReview = t.auto_key === "complete:review";
    const m = isFollow ? followupMail(t) : isReview ? reviewMail(t) : null;
    const d = draftByTask[t.id];
    return (
      <Card key={t.id} className="flex items-center gap-2 px-1.5 py-1.5">
        <button onClick={() => doneTask(t)} aria-label="Done" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-accent">
          <span className="flex h-5 w-5 items-center justify-center rounded-md border border-neutral-600 text-transparent hover:text-emerald-300"><Check size={13} strokeWidth={3} /></span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-white">{t.title}</div>
          <div className="truncate text-xs text-neutral-400">
            {late ? <span className="font-semibold text-red-300">{daysSince(t.due_date)}d overdue · </span> : null}
            {j ? <Link href={`/?job=${j.id}`} className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-200">{j.job_name || j.customer}</Link> : "No job"}
          </div>
        </div>
        {d && d.status === "drafted" ? (
          <Button asChild size="sm" variant="outline" className="h-10 shrink-0 border-emerald-500/40 text-emerald-300">
            <a href={GMAIL_DRAFTS} target="_blank" rel="noreferrer"><MailCheck size={14} /> Draft ready</a>
          </Button>
        ) : m ? (
          <Button asChild size="sm" variant="outline" className={cn("h-10 shrink-0", !m.to && "border-amber-500/40 text-amber-300")}>
            <a href={m.href} title={m.to ?? "No email on file for this customer"}>{isReview ? <Star size={14} /> : <Mail size={14} />}{m.to ? (isReview ? "Ask" : "Email") : "No email"}</a>
          </Button>
        ) : null}
      </Card>
    );
  }

  // ---------- 3. money ----------
  // qbo_invoice_ref can hold several refs ("113, 119")
  const jobForRef = (ref: any) => jobs.find((j) => String(j.qbo_invoice_ref ?? "").split(/[,\s]+/).includes(String(ref))) ?? null;
  const allOpen: any[] = ((snap?.invoices ?? []) as any[]).filter((i) => !isThmInvoice(i) && !jobForRef(i.ref)?.paid_date);
  // Mike writes some invoices in QuickBooks ahead of time and sends them once the job is done.
  // An invoice on a job that isn't Complete yet is "billed ahead" — never chased, not counted as overdue.
  const billedAhead = allOpen.filter((i) => { const j = jobForRef(i.ref); return j && j.status !== "complete"; });
  const invoices = allOpen.filter((i) => !billedAhead.includes(i));
  const lateInv = invoices.filter((i) => i.days_overdue > 0).sort((a, b) => b.days_overdue - a.days_overdue);
  const owed = invoices.reduce((a, i) => a + Number(i.amount), 0);
  const late$ = lateInv.reduce((a, i) => a + Number(i.amount), 0);
  const toInvoice = jobs.filter((j) => j.status === "complete" && !j.invoiced_date && !j.paid_date);
  const draftByInv = (ref: string, stage: number) => drafts.find((d) => d.invoice_ref === String(ref) && d.stage === stage);

  function invoiceMail(i: any) {
    const stage = invoiceStage(i.days_overdue);
    if (!stage) return null;
    const j = jobForRef(i.ref);
    const who = emailFor(j?.customer_id, i.customer);
    const e = invoiceReminder(stage, { contact: who.name, ref: String(i.ref), amount: Number(i.amount), due: i.due, job: j?.job_name ?? null });
    return { href: mailto(who.to, e), to: who.to, stage };
  }

  const hour = Number(new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = new Date(today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const doCount = overdue.length + dueToday.length + gpOpen.length;
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const header = (
    <PageHeader
      crumb={dateStr}
      title={`${greeting}, Mike`}
      sub="Day sheet — where you're going, what's due, and money coming in."
      actions={routeUrl ? (
        <Button asChild><a href={routeUrl} target="_blank" rel="noreferrer"><Navigation size={16} /> Start the route — {addrs.length} stop{addrs.length === 1 ? "" : "s"}</a></Button>
      ) : (
        <Button asChild variant="outline"><Link href="/schedule"><CalendarDays size={16} /> Calendar</Link></Button>
      )}
    />
  );

  if (err) return <div>{header}<LoadError message={err} onRetry={load} /></div>;

  return (
    <div>
      {header}

      <div className="mb-5"><MyClock /></div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Stops today" value={loading ? "–" : stops.length} onClick={() => jump("go")} />
        <Stat label="To do" value={loading ? "–" : doCount} tone={overdue.length ? "bad" : undefined} hint={overdue.length ? `${overdue.length} late` : undefined} onClick={() => jump("do")} />
        <Stat label="Overdue $" value={loading ? "–" : fmt$(late$)} tone={late$ ? "warn" : undefined} onClick={() => jump("money")} />
      </div>

      {loading ? <ListSkeleton /> : (
      <div className="grid items-start gap-x-6 gap-y-8 lg:grid-cols-2">
      <div className="min-w-0 space-y-8">
      {/* 1 — WHERE YOU'RE GOING */}
      <section id="go" className="scroll-mt-20">
        <SectionTitle right={<Link href="/schedule" className="inline-flex items-center gap-0.5 text-sm font-semibold text-neutral-400 hover:text-white">Calendar <ChevronRight size={15} /></Link>}>Where you're going</SectionTitle>
        {stops.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-neutral-500">Nothing on the calendar today.{nextUp.length ? ` Next up: ${nextUp.map((e) => `${fmtDate(e.entry_date).replace(/,.*/, "")} ${e.job_id ? (jobById[e.job_id]?.job_name || jobById[e.job_id]?.customer || "") : e.label}`).join(" · ")}` : ""}</p>
        ) : (
          <div className="space-y-2">
            {stops.map(({ e, j }, i) => (
              <Link key={e.id} href={j ? `/?job=${j.id}` : "/schedule"} className="flex min-h-[56px] items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 hover:border-white/20">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-neutral-200">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{j ? (j.job_name || j.customer) : e.label}</span>
                  <span className="block truncate text-xs text-neutral-400">{[j?.location, e.assignee].filter(Boolean).join(" · ")}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-neutral-600" />
              </Link>
            ))}
          </div>
        )}
        {routeUrl ? (
          <Button asChild variant="outline" className="mt-2.5 w-full lg:hidden">
            <a href={routeUrl} target="_blank" rel="noreferrer"><Navigation size={15} /> Start the route — {addrs.length} stop{addrs.length === 1 ? "" : "s"}</a>
          </Button>
        ) : null}
        {unscheduled ? <Link href="/schedule" className="mt-2 inline-flex min-h-[40px] items-center gap-0.5 text-sm text-amber-300">{unscheduled} booked job{unscheduled === 1 ? "" : "s"} still need a date <ChevronRight size={15} /></Link> : null}
      </section>

      {/* 2 — DO TODAY */}
      <section id="do" className="scroll-mt-20">
        <SectionTitle right={<Link href="/tasks" className="inline-flex items-center gap-0.5 text-sm font-semibold text-neutral-400 hover:text-white">All tasks <ChevronRight size={15} /></Link>}>Do today</SectionTitle>
        {doCount === 0 ? <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-neutral-500">Nothing due. <Link href="/gameplan" className="font-semibold text-neutral-300 hover:text-white">Write the game plan</Link></p> : null}
        {overdue.length ? (
          <div className="mb-4">
            <div className="mb-1.5 text-sm font-semibold text-red-300">Overdue · {overdue.length}</div>
            <div className="space-y-2">{overdue.map((t) => taskRow(t, true))}</div>
          </div>
        ) : null}
        {dueToday.length ? (
          <div className="mb-4">
            <div className="mb-1.5 text-sm font-semibold text-amber-300">Due today · {dueToday.length}</div>
            <div className="space-y-2">{dueToday.map((t) => taskRow(t, false))}</div>
          </div>
        ) : null}
        {gpOpen.length ? (
          <div className="mb-1">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <div className="min-w-0 truncate text-sm font-semibold text-neutral-300">Game plan{plan?.headline ? ` — ${plan.headline}` : ""}</div>
              <Button asChild variant="ghost" size="sm" className="shrink-0"><Link href="/gameplan"><Pencil size={13} /> Edit</Link></Button>
            </div>
            <div className="space-y-2">
              {gpOpen.map((i) => (
                <Card key={i.id} className="flex items-center gap-2 px-1.5 py-1">
                  <button onClick={() => doneItem(i)} aria-label="Done" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-accent">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md border border-neutral-600 text-transparent hover:text-emerald-300"><Check size={13} strokeWidth={3} /></span>
                  </button>
                  <span className="truncate text-sm text-white">{i.body}</span>
                </Card>
              ))}
            </div>
          </div>
        ) : null}
        {!reviewUrl && tasks.some((t) => t.auto_key === "complete:review") ? (
          <Card className="mt-3 border-amber-500/30 bg-amber-500/[0.05] p-3">
            <div className="mb-2 text-xs text-amber-200">Paste your Google review link once and every review ask includes it. (Google Business Profile → "Ask for reviews" → copy link)</div>
            <div className="flex gap-2">
              <Input value={reviewDraft} onChange={(e) => setReviewDraft(e.target.value)} placeholder="https://g.page/r/…/review" className="min-w-0 flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") saveReviewUrl(); }} />
              <Button variant="outline" onClick={saveReviewUrl} className="shrink-0">Save</Button>
            </div>
          </Card>
        ) : null}
        {mktDue ? <Link href="/marketing/campaign?due=1" className="mt-2 inline-flex min-h-[40px] items-center gap-0.5 text-sm text-amber-300">{mktDue} marketing follow-up{mktDue === 1 ? "" : "s"} due <ChevronRight size={15} /></Link> : null}
      </section>
      </div>

      <div className="min-w-0 space-y-8">
      {/* 3 — MONEY COMING IN */}
      <section id="money" className="scroll-mt-20">
        <SectionTitle right={<Link href="/money" className="inline-flex items-center gap-0.5 text-sm font-semibold text-neutral-400 hover:text-white">Money <ChevronRight size={15} /></Link>}>Money coming in</SectionTitle>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Stat label="Owed to you" value={fmt$(owed)} />
          <Stat label="Overdue" value={fmt$(late$)} tone={late$ ? "warn" : undefined} hint={`${lateInv.length} invoice${lateInv.length === 1 ? "" : "s"}`} />
        </div>
        {toInvoice.length ? (
          <div className="mb-4">
            <div className="mb-1.5 text-sm font-semibold text-red-300">Done, not invoiced · {toInvoice.length}</div>
            <div className="space-y-2">
              {toInvoice.map((j) => (
                <Link key={j.id} href={`/?job=${j.id}`} className="flex min-h-[48px] items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 hover:border-white/20">
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{j.job_name || j.customer}</span>
                  <span className="shrink-0 text-sm tabular-nums text-neutral-300">{parsePrice(j.price) ? fmt$(parsePrice(j.price)) : ""}</span>
                  <ChevronRight size={16} className="shrink-0 text-neutral-600" />
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        {lateInv.length ? (
          <div>
            <div className="mb-1.5 text-sm font-semibold text-amber-300">Overdue invoices</div>
            <div className="space-y-2">
              {lateInv.map((i, idx) => {
                const m = invoiceMail(i);
                const d = m ? draftByInv(i.ref, m.stage) : null;
                return (
                  <Card key={idx} className="flex items-center gap-2 px-3.5 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-white">{i.customer}</div>
                      <div className="text-xs text-neutral-400">#{i.ref} · {money$(Number(i.amount))} · <span className={i.days_overdue > 30 ? "text-red-300" : "text-amber-300"}>{i.days_overdue}d late</span></div>
                    </div>
                    {d && d.status === "drafted" ? (
                      <Button asChild size="sm" variant="outline" className="h-10 shrink-0 border-emerald-500/40 text-emerald-300">
                        <a href={GMAIL_DRAFTS} target="_blank" rel="noreferrer"><MailCheck size={14} /> Draft ready</a>
                      </Button>
                    ) : m ? (
                      <Button asChild size="sm" variant="outline" className={cn("h-10 shrink-0", !m.to && "border-amber-500/40 text-amber-300")}>
                        <a href={m.href} title={m.to ?? "No email on file"}><Mail size={14} /> Remind</a>
                      </Button>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (!toInvoice.length ? <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-neutral-500">Nothing overdue.</p> : null)}
        {billedAhead.length ? (
          <Card className="mt-4 p-3.5">
            <div className="mb-1.5 flex items-center gap-2">
              <div className="text-sm font-semibold text-neutral-300">In QuickBooks, job not done yet</div>
              <Badge variant="muted" className="ml-auto">{billedAhead.length}</Badge>
            </div>
            <div className="space-y-0.5">
              {billedAhead.map((i, idx) => { const j = jobForRef(i.ref); return (
                <Link key={idx} href={j ? `/?job=${j.id}` : "/money"} className="flex min-h-[32px] items-center justify-between gap-2 text-xs text-neutral-400 hover:text-neutral-200">
                  <span className="truncate">#{i.ref} · {j?.job_name || i.customer}</span>
                  <span className="shrink-0 tabular-nums">{money$(Number(i.amount))}</span>
                </Link>
              ); })}
            </div>
            <p className="mt-1.5 text-xs text-neutral-500">Not chased and not counted as overdue. When the job's marked Complete it moves up to "Send the invoice" — update the invoice date in QuickBooks before sending.</p>
          </Card>
        ) : null}
        {thmBal != null ? (
          <Link href="/thm" className="mt-4 flex min-h-[48px] items-center justify-between rounded-xl border border-border bg-card px-3.5 py-2 hover:border-white/20">
            <span className="text-sm font-semibold text-white">THM tab — Invoice #94</span>
            <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums text-white">{fmt$(thmBal)} <ChevronRight size={15} className="text-neutral-500" /></span>
          </Link>
        ) : null}
        <p className="mt-2 text-xs text-neutral-500">QuickBooks snapshot {snapAt ? new Date(snapAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"} · ask Claude to "refresh the money panel" for the latest.</p>
      </section>

      {/* 4 — PIPELINE */}
      <PipelineNumbers jobs={jobs} compact />
      </div>
      </div>
      )}
    </div>
  );
}
