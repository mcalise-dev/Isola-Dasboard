"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, firstError } from "@/lib/load";
import { revenueOf, todayISO } from "@/lib/format";
import { parsePayModel, overheadMonthly, PAY_KEY } from "@/lib/pay";
import { PageHeader, SectionTitle, Stat, ListSkeleton, LoadError } from "@/components/ui/bits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";

/* ============================================================
   MONTHLY REVIEW (v6.9, 10/22/26) — one page per month.
   Finished work (by completed_date): revenue, job costs, gross profit,
   what Isola keeps after THM's 50% of net on split jobs, and what's
   left after a month of fixed overhead. Plus proposals sent / won /
   lost, cash collected, best and worst job.
   Same rules as Reports and My pay: THM-held jobs count only Mike's
   cut; fuel is overhead, not a job cost; a job with no costs logged
   is shown but kept out of margin so it can't fake 100%.
   ============================================================ */

const f0 = (n: number) => (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (n: number | null) => (n == null || !isFinite(n) ? "—" : `${Math.round(n * 100)}%`);
const nameOf = (j: any) => (j?.job_name && String(j.job_name).trim()) || j?.customer || "Untitled job";
const monthLabel = (m: string, long = true) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-US", long ? { month: "long", year: "numeric" } : { month: "short" });
};
const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function MonthlyReview() {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mo, setMo] = useState(todayISO().slice(0, 7));

  async function load() {
    setErr(null);
    try {
      const r = await withTimeout(Promise.all([
        supabase.from("jobs").select("id,job_name,customer,job,status,price,price_amount,contract_holder,isola_cut,partner,thm_deal,quoted_date,won_date,lost_date,lost_reason,completed_date,paid_date,paid_amount"),
        supabase.from("job_costs").select("job_id,category,amount,entry_date"),
        supabase.from("payments").select("job_id,amount,payment_date"),
        supabase.from("change_orders").select("job_id,amount,status"),
        supabase.from("app_settings").select("value").eq("key", PAY_KEY).maybeSingle(),
      ]));
      const bad = firstError(...r);
      if (bad) throw new Error(bad);
      const [j, c, p, co, pay] = r;
      setD({ jobs: j.data ?? [], costs: c.data ?? [], pays: p.data ?? [], cos: co.data ?? [], payRaw: (pay.data as any)?.value ?? null });
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const header = <PageHeader title="Monthly review" sub="What got finished, what it made, what came in" />;
  if (err) return <div className="pb-28">{header}<LoadError message={err} onRetry={load} /></div>;
  if (!d) return <div className="pb-28">{header}<ListSkeleton rows={5} /></div>;

  const inMo = (s: any, m = mo) => !!s && String(s).slice(0, 7) === m;
  const isFuel = (c: any) => String(c.category ?? "").toLowerCase() === "fuel";
  const costBy = new Map<string, number>();
  for (const c of d.costs) if (c.job_id && !isFuel(c)) costBy.set(c.job_id, (costBy.get(c.job_id) ?? 0) + (Number(c.amount) || 0));
  const coBy = new Map<string, number>();
  for (const c of d.cos) if (c.status === "approved") coBy.set(c.job_id, (coBy.get(c.job_id) ?? 0) + (Number(c.amount) || 0));
  const ohMo = overheadMonthly(parsePayModel(d.payRaw));

  function monthStats(m: string) {
    const rows = d.jobs.filter((j: any) => j.status === "complete" && inMo(j.completed_date, m)).map((j: any) => {
      const thmHeld = j.contract_holder === "thm";
      const rev = thmHeld ? revenueOf(j) : revenueOf(j) + (coBy.get(j.id) ?? 0);
      const cost = thmHeld ? 0 : costBy.get(j.id) ?? 0; // THM-held: Mike's cut is already net
      const net = rev - cost;
      const keep = !thmHeld && j.partner && j.thm_deal === "split" ? net / 2 : net;
      const costed = thmHeld ? rev > 0 : cost > 0;
      return { j, rev, cost, net, keep, costed, margin: rev ? net / rev : null };
    });
    const costed = rows.filter((r: any) => r.costed);
    const rev = rows.reduce((a: number, r: any) => a + r.rev, 0);
    const cRev = costed.reduce((a: number, r: any) => a + r.rev, 0);
    const cNet = costed.reduce((a: number, r: any) => a + r.net, 0);
    const keep = costed.reduce((a: number, r: any) => a + r.keep, 0);
    const paidJobs = new Set(d.pays.map((p: any) => p.job_id));
    const collected = d.pays.filter((p: any) => inMo(p.payment_date, m)).reduce((a: number, p: any) => a + (Number(p.amount) || 0), 0)
      + d.jobs.filter((j: any) => inMo(j.paid_date, m) && !paidJobs.has(j.id)).reduce((a: number, j: any) => a + (Number(j.paid_amount) || revenueOf(j)), 0);
    const sent = d.jobs.filter((j: any) => inMo(j.quoted_date, m));
    const won = d.jobs.filter((j: any) => inMo(j.won_date, m));
    const lost = d.jobs.filter((j: any) => j.status === "lost" && inMo(j.lost_date, m));
    return { rows, costed, rev, cRev, cNet, keep, collected, sent, won, lost, margin: cRev ? cNet / cRev : null };
  }

  const s = monthStats(mo);
  const prev = monthStats(shiftMonth(mo, -1));
  const isCurrent = mo === todayISO().slice(0, 7);
  const sorted = [...s.costed].sort((a: any, b: any) => (b.margin ?? 0) - (a.margin ?? 0));
  const best = sorted[0];
  const worst = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  const delta = (a: number, b: number) => {
    if (!b) return null;
    const up = a >= b;
    const Icon = up ? TrendingUp : TrendingDown;
    return <span className={cn("inline-flex items-center gap-1", up ? "text-emerald-400/80" : "text-red-300/80")}><Icon size={12} />{f0(Math.abs(a - b))} vs {monthLabel(shiftMonth(mo, -1), false)}</span>;
  };
  const afterOH = s.keep - ohMo;

  return (
    <div className="pb-28 space-y-5">
      {header}

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMo(shiftMonth(mo, -1))}><ChevronLeft size={18} /></Button>
        <div className="text-center">
          <div className="text-lg font-semibold text-white">{monthLabel(mo)}</div>
          {isCurrent ? <div className="text-xs text-neutral-500">Month to date</div> : null}
        </div>
        <Button variant="outline" size="icon" aria-label="Next month" disabled={isCurrent} onClick={() => setMo(shiftMonth(mo, 1))}><ChevronRight size={18} /></Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Work finished" value={f0(s.rev)} hint={<>{s.rows.length} job{s.rows.length === 1 ? "" : "s"} {delta(s.rev, prev.rev)}</>} />
        <Stat label="Gross profit" value={s.costed.length ? f0(s.cNet) : "—"} hint={s.costed.length ? `${pct(s.margin)} margin` : "no costs logged"} tone={s.margin != null && s.margin < 0.25 ? "warn" : undefined} />
        <Stat label="Isola keeps" value={s.costed.length ? f0(s.keep) : "—"} hint="after THM's 50% on split jobs" tone="ok" />
        <Stat label="After overhead" value={s.costed.length ? f0(afterOH) : "—"} hint={`${f0(ohMo)} fixed this month`} tone={s.costed.length ? (afterOH < 0 ? "bad" : "ok") : undefined} />
        <Stat label="Cash collected" value={f0(s.collected)} hint={delta(s.collected, prev.collected)} />
        <Stat label="Proposals sent" value={String(s.sent.length)} hint={f0(s.sent.reduce((a: number, j: any) => a + revenueOf(j), 0))} />
        <Stat label="Won" value={String(s.won.length)} hint={f0(s.won.reduce((a: number, j: any) => a + revenueOf(j), 0))} tone={s.won.length ? "ok" : undefined} />
        <Stat label="Lost" value={String(s.lost.length)} hint={s.lost.length ? s.lost.map((j: any) => j.lost_reason || "no reason").join(", ") : "—"} />
      </div>

      {s.rows.length > s.costed.length ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
          {s.rows.length - s.costed.length} finished job{s.rows.length - s.costed.length === 1 ? " has" : "s have"} no costs logged, so {s.rows.length - s.costed.length === 1 ? "it's" : "they're"} left out of profit and margin.
        </p>
      ) : null}

      {best ? (
        <div className="grid gap-2 md:grid-cols-2">
          <Card><CardContent className="pt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Best job</div>
            <Link href={`/jobs/${best.j.id}`} className="mt-1 block truncate text-sm font-semibold text-white hover:underline">{nameOf(best.j)}</Link>
            <div className="text-xs tabular-nums text-neutral-400">{pct(best.margin)} margin · {f0(best.net)} on {f0(best.rev)}</div>
          </CardContent></Card>
          {worst && worst.j.id !== best.j.id ? (
            <Card><CardContent className="pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-red-300">Weakest job</div>
              <Link href={`/jobs/${worst.j.id}`} className="mt-1 block truncate text-sm font-semibold text-white hover:underline">{nameOf(worst.j)}</Link>
              <div className="text-xs tabular-nums text-neutral-400">{pct(worst.margin)} margin · {f0(worst.net)} on {f0(worst.rev)}</div>
            </CardContent></Card>
          ) : null}
        </div>
      ) : null}

      <section>
        <SectionTitle>Jobs finished in {monthLabel(mo, false)}</SectionTitle>
        {s.rows.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {[...s.rows].sort((a: any, b: any) => b.rev - a.rev).map((r: any) => (
              <Link key={r.j.id} href={`/jobs/${r.j.id}`} className="flex min-h-[52px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 hover:border-white/25">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{nameOf(r.j)}</div>
                  <div className="truncate text-xs tabular-nums text-neutral-500">
                    {f0(r.rev)}{r.j.contract_holder === "thm" ? " · your THM cut" : r.costed ? ` − ${f0(r.cost)} cost` : " · no costs logged"}{r.j.partner && r.j.contract_holder !== "thm" ? " · THM" : ""}
                  </div>
                </div>
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", !r.costed ? "text-neutral-500" : (r.margin ?? 0) < 0.25 ? "text-amber-300" : "text-white")}>{r.costed ? pct(r.margin) : "—"}</span>
              </Link>
            ))}
          </div>
        ) : <p className="text-sm text-neutral-500">Nothing marked complete in {monthLabel(mo)}.</p>}
      </section>

      <p className="text-xs leading-relaxed text-neutral-500">
        Months are by the job's completed date. Overhead is the fixed monthly total from Money → My pay; fuel is in it, so fuel receipts aren't counted again as job costs.
      </p>
    </div>
  );
}
