"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import MyClock from "@/components/MyClock";
import PipelineNumbers from "@/components/PipelineNumbers";
import { daysSince, fmtDate, parsePrice } from "@/lib/format";
import { proposalFollowup, invoiceReminder, reviewRequest, followupStage, invoiceStage, mailto, isThmInvoice, money$ } from "@/lib/emails";

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

  async function load() {
    const [j, t, s, gp, ms, cu, cc, pl, ed, ct, mt, th, nx, rs] = await Promise.all([
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
    ]);
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
    if (!/^https?:\/\//i.test(v)) { alert("Paste the full link — it starts with https://"); return; }
    await supabase.from("app_settings").upsert({ key: "google_review_url", value: v, updated_at: new Date().toISOString() });
    setReviewUrl(v); setReviewDraft("");
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
      <div key={t.id} className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5">
        <button onClick={() => doneTask(t)} aria-label="Done" className="w-5 h-5 shrink-0 rounded-md border border-neutral-600 text-[11px] text-transparent hover:text-emerald-300">✓</button>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white truncate">{t.title}</div>
          <div className="text-[11px] text-neutral-500 truncate">
            {late ? <span className="text-red-400 font-semibold">{daysSince(t.due_date)}d overdue · </span> : null}
            {j ? <Link href={`/?job=${j.id}`} className="underline decoration-neutral-700 underline-offset-2">{j.job_name || j.customer}</Link> : "No job"}
          </div>
        </div>
        {d && d.status === "drafted" ? (
          <a href={GMAIL_DRAFTS} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-emerald-500/40 px-2 py-1 text-[10px] font-bold text-emerald-300">📝 Draft ready</a>
        ) : m ? (
          <a href={m.href} className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-bold ${m.to ? "border-neutral-600 text-white" : "border-amber-500/40 text-amber-300"}`} title={m.to ?? "No email on file for this customer"}>{isReview ? "⭐ " : "✉️ "}{m.to ? (isReview ? "Ask" : "Email") : "No email"}</a>
        ) : null}
      </div>
    );
  }

  // ---------- 3. money ----------
  const paidRefs = new Set(jobs.filter((j) => j.paid_date && j.qbo_invoice_ref).map((j) => String(j.qbo_invoice_ref)));
  const invoices: any[] = ((snap?.invoices ?? []) as any[]).filter((i) => !paidRefs.has(String(i.ref)) && !isThmInvoice(i));
  const lateInv = invoices.filter((i) => i.days_overdue > 0).sort((a, b) => b.days_overdue - a.days_overdue);
  const owed = invoices.reduce((a, i) => a + Number(i.amount), 0);
  const late$ = lateInv.reduce((a, i) => a + Number(i.amount), 0);
  const toInvoice = jobs.filter((j) => j.status === "complete" && !j.invoiced_date && !j.paid_date);
  const draftByInv = (ref: string, stage: number) => drafts.find((d) => d.invoice_ref === String(ref) && d.stage === stage);

  function invoiceMail(i: any) {
    const stage = invoiceStage(i.days_overdue);
    if (!stage) return null;
    const j = jobs.find((x) => String(x.qbo_invoice_ref ?? "") === String(i.ref)) ?? null;
    const who = emailFor(j?.customer_id, i.customer);
    const e = invoiceReminder(stage, { contact: who.name, ref: String(i.ref), amount: Number(i.amount), due: i.due, job: j?.job_name ?? null });
    return { href: mailto(who.to, e), to: who.to, stage };
  }

  const card = "rounded-2xl border border-neutral-800 bg-neutral-900/95 p-4";
  const h2 = "text-sm font-extrabold tracking-widest text-white uppercase";
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = new Date(today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const doCount = overdue.length + dueToday.length + gpOpen.length;

  return (
    <div className="pt-4 space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">{greeting}, Mike</h1>
        <p className="text-sm text-neutral-500">{dateStr}</p>
      </div>

      <MyClock />

      <div className="grid grid-cols-3 gap-2 text-center">
        <a href="#go" className={`rounded-xl border p-3 ${stops.length ? "border-blue-500/40" : "border-neutral-800"} bg-neutral-900`}>
          <div className="text-2xl font-bold tabular-nums text-white">{stops.length}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500">Stops today</div>
        </a>
        <a href="#do" className={`rounded-xl border p-3 ${overdue.length ? "border-red-500/50" : "border-neutral-800"} bg-neutral-900`}>
          <div className={`text-2xl font-bold tabular-nums ${overdue.length ? "text-red-300" : "text-white"}`}>{doCount}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500">To do{overdue.length ? ` · ${overdue.length} late` : ""}</div>
        </a>
        <a href="#money" className={`rounded-xl border p-3 ${late$ ? "border-amber-500/50" : "border-neutral-800"} bg-neutral-900`}>
          <div className={`text-2xl font-bold tabular-nums ${late$ ? "text-amber-300" : "text-white"}`}>{fmt$(late$)}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500">Overdue $</div>
        </a>
      </div>

      {loading ? <p className="text-sm text-neutral-500">Loading…</p> : null}

      {/* 1 — WHERE YOU'RE GOING */}
      <div id="go" className={card}>
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className={h2}>🧭 Where you're going</h2>
          <Link href="/schedule" className="text-xs text-blue-300 font-semibold">Calendar →</Link>
        </div>
        {stops.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing on the calendar today.{nextUp.length ? ` Next up: ${nextUp.map((e) => `${fmtDate(e.entry_date).replace(/,.*/, "")} ${e.job_id ? (jobById[e.job_id]?.job_name || jobById[e.job_id]?.customer || "") : e.label}`).join(" · ")}` : ""}</p>
        ) : (
          <div className="space-y-1.5">
            {stops.map(({ e, j }, i) => (
              <Link key={e.id} href={j ? `/?job=${j.id}` : "/schedule"} className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 hover:border-neutral-600">
                <span className="w-5 h-5 shrink-0 rounded-full bg-blue-500/20 text-blue-200 text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white truncate">{j ? (j.job_name || j.customer) : e.label}</span>
                  <span className="block text-[11px] text-neutral-500 truncate">{[j?.location, e.assignee].filter(Boolean).join(" · ")}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
        {routeUrl ? (
          <a href={routeUrl} target="_blank" rel="noreferrer" className="mt-2.5 flex items-center justify-center rounded-xl bg-white text-neutral-900 py-2 text-xs font-bold">🧭 Start the route — {addrs.length} stop{addrs.length === 1 ? "" : "s"}</a>
        ) : null}
        {unscheduled ? <Link href="/schedule" className="mt-2 block text-[11px] text-amber-300">{unscheduled} booked job{unscheduled === 1 ? "" : "s"} still need a date →</Link> : null}
      </div>

      {/* 2 — DO TODAY */}
      <div id="do" className={card}>
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className={h2}>✅ Do today</h2>
          <Link href="/tasks" className="text-xs text-blue-300 font-semibold">All tasks →</Link>
        </div>
        {!loading && doCount === 0 ? <p className="text-sm text-neutral-500">Nothing due. <Link href="/gameplan" className="text-blue-300">Write the game plan →</Link></p> : null}
        {overdue.length ? (
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1.5">Overdue · {overdue.length}</div>
            <div className="space-y-1.5">{overdue.map((t) => taskRow(t, true))}</div>
          </div>
        ) : null}
        {dueToday.length ? (
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-1.5">Due today · {dueToday.length}</div>
            <div className="space-y-1.5">{dueToday.map((t) => taskRow(t, false))}</div>
          </div>
        ) : null}
        {gpOpen.length ? (
          <div className="mb-1">
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Game plan{plan?.headline ? ` — ${plan.headline}` : ""}</div>
              <Link href="/gameplan" className="text-[10px] text-neutral-500">edit</Link>
            </div>
            <div className="space-y-1.5">
              {gpOpen.map((i) => (
                <div key={i.id} className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
                  <button onClick={() => doneItem(i)} aria-label="Done" className="w-5 h-5 shrink-0 rounded-md border border-neutral-600 text-[11px] text-transparent hover:text-emerald-300">✓</button>
                  <span className="text-sm text-white truncate">{i.body}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {!reviewUrl && tasks.some((t) => t.auto_key === "complete:review") ? (
          <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5">
            <div className="text-[11px] text-amber-200 mb-1.5">⭐ Paste your Google review link once and every review ask includes it. (Google Business Profile → "Ask for reviews" → copy link)</div>
            <div className="flex gap-2">
              <input value={reviewDraft} onChange={(e) => setReviewDraft(e.target.value)} placeholder="https://g.page/r/…/review"
                className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-2.5 py-1.5 text-xs" />
              <button onClick={saveReviewUrl} className="shrink-0 rounded-lg bg-white text-neutral-900 px-3 text-xs font-bold">Save</button>
            </div>
          </div>
        ) : null}
        {mktDue ? <Link href="/marketing/campaign?due=1" className="mt-2 block text-[11px] text-amber-300">{mktDue} marketing follow-up{mktDue === 1 ? "" : "s"} due →</Link> : null}
      </div>

      {/* 3 — MONEY COMING IN */}
      <div id="money" className={card}>
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className={h2}>💵 Money coming in</h2>
          <Link href="/money" className="text-xs text-blue-300 font-semibold">Money →</Link>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3 text-center">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-2.5">
            <div className="text-xl font-extrabold tabular-nums text-white">{fmt$(owed)}</div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mt-0.5">Owed to you</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-2.5">
            <div className={`text-xl font-extrabold tabular-nums ${late$ ? "text-amber-300" : "text-white"}`}>{fmt$(late$)}</div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mt-0.5">Overdue · {lateInv.length}</div>
          </div>
        </div>
        {toInvoice.length ? (
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1.5">Done, not invoiced · {toInvoice.length}</div>
            <div className="space-y-1.5">
              {toInvoice.map((j) => (
                <Link key={j.id} href={`/?job=${j.id}`} className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 hover:border-neutral-600">
                  <span className="min-w-0 flex-1 text-sm text-white truncate">{j.job_name || j.customer}</span>
                  <span className="shrink-0 text-xs tabular-nums text-neutral-400">{parsePrice(j.price) ? fmt$(parsePrice(j.price)) : ""}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        {lateInv.length ? (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-1.5">Overdue invoices</div>
            <div className="space-y-1.5">
              {lateInv.map((i, idx) => {
                const m = invoiceMail(i);
                const d = m ? draftByInv(i.ref, m.stage) : null;
                return (
                  <div key={idx} className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white truncate">{i.customer}</div>
                      <div className="text-[11px] text-neutral-500">#{i.ref} · {money$(Number(i.amount))} · <span className={i.days_overdue > 30 ? "text-red-400" : "text-amber-300"}>{i.days_overdue}d late</span></div>
                    </div>
                    {d && d.status === "drafted" ? (
                      <a href={GMAIL_DRAFTS} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-emerald-500/40 px-2 py-1 text-[10px] font-bold text-emerald-300">📝 Draft ready</a>
                    ) : m ? (
                      <a href={m.href} className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-bold ${m.to ? "border-neutral-600 text-white" : "border-amber-500/40 text-amber-300"}`} title={m.to ?? "No email on file"}>✉️ Remind</a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (!loading && !toInvoice.length ? <p className="text-sm text-neutral-500">Nothing overdue.</p> : null)}
        {thmBal != null ? (
          <Link href="/thm" className="mt-3 flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 hover:border-neutral-600">
            <span className="text-xs font-semibold text-white">🤝 THM tab — Invoice #94</span>
            <span className="text-xs font-bold text-white tabular-nums">{fmt$(thmBal)} →</span>
          </Link>
        ) : null}
        <p className="text-[10px] text-neutral-600 mt-2">QuickBooks snapshot {snapAt ? new Date(snapAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"} · ask Claude to "refresh the money panel" for the latest.</p>
      </div>

      {/* 4 — PIPELINE */}
      <PipelineNumbers jobs={jobs} compact />
    </div>
  );
}
