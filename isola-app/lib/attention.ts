"use client";
// v4.6: one shared read of "what needs me" — used by Home, the alerts bell and the
// sidebar badges, so the three never disagree and the database is read once a minute.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { daysSince, fmtDate, parsePrice, todayISO } from "@/lib/format";

export type Level = "high" | "mid" | "low";
export type AttnItem = { id: string; level: Level; kind: string; title: string; sub: string; href: string; amount?: number };
export type HorizonEvent = { id: string; date: string; kind: "work" | "visit" | "task" | "start" | "invoice"; title: string; sub: string; href: string };

export type Attention = {
  items: AttnItem[];
  horizon: HorizonEvent[];
  badges: Record<string, number>;
  money: { totalAr: number; overdue: number; asOf: string | null; pipeline: number; booked: number; toInvoice: number };
  counts: Record<string, number>;
  jobs: any[];
  loadedAt: number;
};

const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

let cache: Attention | null = null;
let inflight: Promise<Attention> | null = null;
const subs = new Set<(a: Attention) => void>();

async function compute(): Promise<Attention> {
  const sb = createClient();
  const today = todayISO();
  const in7 = addDays(today, 7);
  const [j, t, se, sv, ms, ct, mt, jc] = await Promise.all([
    sb.from("jobs").select("id,job_name,customer,location,job,status,price,price_amount,quoted_date,start_date,completed_date,invoiced_date,paid_date,created_at,review_requested_at,priority,due_date"),
    sb.from("tasks").select("id,title,job_id,due_date,priority").eq("done", false),
    sb.from("schedule_entries").select("id,entry_date,job_id,label,assignee").gte("entry_date", addDays(today, -60)),
    sb.from("site_visits").select("id,job_id,visit_date,property_address,client_company"),
    sb.from("money_snapshot").select("data,updated_at").eq("id", 1).maybeSingle(),
    sb.from("contacts").select("id,name,company,next_date,next_action,stage,tier"),
    sb.from("mkt_tasks").select("id,title,due_date").eq("done", false),
    sb.from("job_costs").select("id").eq("status", "pending"),
  ]);
  const jobs: any[] = j.data ?? [];
  const tasks: any[] = t.data ?? [];
  const sched: any[] = se.data ?? [];
  const visits: any[] = sv.data ?? [];
  const snap: any = (ms.data as any)?.data ?? null;
  const contacts: any[] = ct.data ?? [];
  const mtasks: any[] = mt.data ?? [];
  const pendingCosts = (jc.data ?? []).length;
  const byId: Record<string, any> = Object.fromEntries(jobs.map((x) => [x.id, x]));
  const name = (x: any) => x?.job_name || x?.customer || "Job";
  const walked = new Set(visits.map((v) => v.job_id).filter(Boolean));
  const scheduled = new Set(sched.map((s) => s.job_id).filter(Boolean));
  const price = (x: any) => Number(x.price_amount) || parsePrice(x.price);

  const items: AttnItem[] = [];
  // money first
  (snap?.invoices ?? []).filter((i: any) => i.days_overdue > 0).forEach((i: any) => items.push({
    id: "inv-" + i.ref, level: i.days_overdue > 30 ? "high" : "mid", kind: "Overdue invoice",
    title: `${i.customer} owes ${usd(Number(i.amount))}`,
    sub: `Invoice ${i.ref} · ${i.days_overdue} days late`, href: "/money", amount: Number(i.amount),
  }));
  jobs.filter((x) => x.status === "complete" && !x.invoiced_date && !x.paid_date).forEach((x) => items.push({
    id: "toinv-" + x.id, level: "high", kind: "To invoice", title: `Invoice ${name(x)}`,
    sub: `Done ${x.completed_date ? fmtDate(x.completed_date) : ""}${price(x) ? ` · $${price(x).toLocaleString()}` : ""}`, href: `/jobs/${x.id}`, amount: price(x),
  }));
  jobs.filter((x) => x.status === "awaiting" && x.quoted_date && daysSince(x.quoted_date) > 14).forEach((x) => {
    const d = daysSince(x.quoted_date);
    items.push({
      id: "stale-" + x.id, level: d > 30 ? "high" : "mid", kind: d > 30 ? "Proposal expired" : "Proposal going stale",
      title: `${d > 30 ? "Re-send or close out" : "Check in on"} ${name(x)}`, sub: `Sent ${d} days ago${price(x) ? ` · $${price(x).toLocaleString()}` : ""}`, href: `/jobs/${x.id}`, amount: price(x),
    });
  });
  jobs.filter((x) => x.status === "booked" && !x.start_date && !scheduled.has(x.id)).forEach((x) => items.push({
    id: "unsched-" + x.id, level: "mid", kind: "Not scheduled", title: `Put ${name(x)} on the board`,
    sub: `Booked${price(x) ? ` · $${price(x).toLocaleString()}` : ""} · no start date`, href: `/dispatch`,
  }));
  tasks.filter((x) => x.due_date && x.due_date < today).forEach((x) => items.push({
    id: "task-" + x.id, level: x.priority === "high" ? "high" : "mid", kind: "Overdue task", title: x.title,
    sub: `${byId[x.job_id] ? name(byId[x.job_id]) + " · " : ""}due ${fmtDate(x.due_date)}`, href: x.job_id ? `/jobs/${x.job_id}` : "/tasks",
  }));
  const fu = contacts.filter((c) => c.next_date && c.next_date <= today && !["Won", "Dead", "Client"].includes(c.stage));
  fu.forEach((c) => items.push({
    id: "fu-" + c.id, level: c.tier === "A" ? "mid" : "low", kind: "Follow-up due", title: `${c.next_action || "Follow up"}: ${c.name}`,
    sub: `${c.company ?? ""}${c.company ? " · " : ""}due ${fmtDate(c.next_date)}`, href: `/marketing/targets?c=${c.id}`,
  }));
  jobs.filter((x) => x.status === "lead" && !walked.has(x.id) && daysSince(String(x.created_at).slice(0, 10)) > 7).forEach((x) => items.push({
    id: "walk-" + x.id, level: "low", kind: "Not walked", title: `Walk ${name(x)}`,
    sub: `Lead for ${daysSince(String(x.created_at).slice(0, 10))} days`, href: `/jobs/${x.id}`,
  }));
  if (pendingCosts) items.push({ id: "pending-costs", level: "low", kind: "Receipts", title: `${pendingCosts} receipt${pendingCosts === 1 ? "" : "s"} need details`, sub: "Ask Claude to read them, or fill them in", href: "/costs" });
  const reviewable = jobs.filter((x) => x.status === "complete" && x.paid_date && !x.review_requested_at && daysSince(x.paid_date) <= 45);
  reviewable.forEach((x) => items.push({ id: "rev-" + x.id, level: "low", kind: "Ask for a review", title: `Ask ${x.customer} for a review`, sub: `${name(x)} · paid ${fmtDate(x.paid_date)}`, href: "/marketing/reviews" }));

  const rank: Record<Level, number> = { high: 0, mid: 1, low: 2 };
  items.sort((a, b) => rank[a.level] - rank[b.level] || (b.amount ?? 0) - (a.amount ?? 0));

  // next 7 days
  const horizon: HorizonEvent[] = [];
  sched.filter((s) => s.entry_date >= today && s.entry_date <= in7).forEach((s) => horizon.push({
    id: "se-" + s.id, date: s.entry_date, kind: "work", title: s.job_id ? name(byId[s.job_id]) : (s.label || "Work"),
    sub: [s.assignee, byId[s.job_id]?.location].filter(Boolean).join(" · "), href: s.job_id ? `/jobs/${s.job_id}` : "/schedule",
  }));
  visits.filter((v) => v.visit_date && v.visit_date >= today && v.visit_date <= in7).forEach((v) => horizon.push({
    id: "sv-" + v.id, date: v.visit_date, kind: "visit", title: `Site visit · ${v.client_company || v.property_address || ""}`, sub: v.property_address ?? "", href: "/visits",
  }));
  jobs.filter((x) => x.start_date && x.start_date >= today && x.start_date <= in7 && !sched.some((s) => s.job_id === x.id && s.entry_date === x.start_date)).forEach((x) => horizon.push({
    id: "st-" + x.id, date: x.start_date, kind: "start", title: `Start ${name(x)}`, sub: x.location ?? "", href: `/jobs/${x.id}`,
  }));
  tasks.filter((x) => x.due_date && x.due_date >= today && x.due_date <= in7).forEach((x) => horizon.push({
    id: "td-" + x.id, date: x.due_date, kind: "task", title: x.title, sub: byId[x.job_id] ? name(byId[x.job_id]) : "Task", href: x.job_id ? `/jobs/${x.job_id}` : "/tasks",
  }));
  (snap?.invoices ?? []).filter((i: any) => i.due >= today && i.due <= in7).forEach((i: any) => horizon.push({
    id: "due-" + i.ref, date: i.due, kind: "invoice", title: `Invoice ${i.ref} due`, sub: `${i.customer} · ${usd(Number(i.amount))}`, href: "/money",
  }));
  horizon.sort((a, b) => a.date.localeCompare(b.date));

  const counts: Record<string, number> = {};
  jobs.forEach((x) => { counts[x.status] = (counts[x.status] ?? 0) + 1; });

  const badges: Record<string, number> = {
    home: items.filter((i) => i.level === "high").length,
    leads: jobs.filter((x) => x.status === "lead" && !walked.has(x.id)).length,
    proposals: jobs.filter((x) => x.status === "awaiting" && x.quoted_date && daysSince(x.quoted_date) > 14).length,
    dispatch: jobs.filter((x) => x.status === "booked" && !x.start_date && !scheduled.has(x.id)).length,
    money: (snap?.invoices ?? []).filter((i: any) => i.days_overdue > 0).length,
    costs: pendingCosts,
    tasks: tasks.filter((x) => x.due_date && x.due_date <= today).length,
    targets: fu.length,
    mkttasks: mtasks.filter((x) => x.due_date && x.due_date <= today).length,
    reviews: reviewable.length,
    jobs: jobs.filter((x) => x.status === "complete" && !x.invoiced_date && !x.paid_date).length,
  };

  const sum = (f: (x: any) => boolean) => jobs.filter(f).reduce((a, x) => a + price(x), 0);
  return {
    items, horizon, badges, counts, jobs,
    money: {
      totalAr: Number(snap?.total_ar ?? 0), overdue: Number(snap?.overdue ?? 0), asOf: snap?.as_of ?? null,
      pipeline: sum((x) => x.status === "awaiting"), booked: sum((x) => x.status === "booked" || x.status === "progress"),
      toInvoice: sum((x) => x.status === "complete" && !x.invoiced_date && !x.paid_date),
    },
    loadedAt: Date.now(),
  };
}

export function refreshAttention(): Promise<Attention> {
  if (inflight) return inflight;
  inflight = compute().then((a) => { cache = a; subs.forEach((f) => f(a)); return a; }).finally(() => { inflight = null; });
  return inflight;
}

export function useAttention(): Attention | null {
  const [a, setA] = useState<Attention | null>(cache);
  useEffect(() => {
    subs.add(setA);
    if (!cache || Date.now() - cache.loadedAt > 60_000) refreshAttention().catch(() => {});
    const onChanged = () => refreshAttention().catch(() => {});
    window.addEventListener("isola:changed", onChanged);
    const iv = setInterval(onChanged, 120_000);
    return () => { subs.delete(setA); window.removeEventListener("isola:changed", onChanged); clearInterval(iv); };
  }, []);
  return a;
}
