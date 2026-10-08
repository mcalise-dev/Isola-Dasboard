"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { money, fmtDate, jobLabel, parsePrice, todayISO, fmtPrice } from "@/lib/format";
import { showError, showToast } from "@/components/Toaster";
import { withTimeout, firstError } from "@/lib/load";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, SectionTitle, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronRight, FileText, Link2, RotateCcw, Wallet, ArrowRight } from "lucide-react";

type Inv = { customer: string; ref?: string; due: string; amount: number; days_overdue: number };
type Snap = {
  as_of: string;
  total_ar: number;
  overdue: number;
  buckets: { current: number; d1_30: number; d31_60: number; d61_90: number; d91_plus: number };
  invoices: Inv[];
};

const DEFAULT_TERMS = "33% deposit / 33% midpoint / balance on completion";

export default function MoneyTab() {
  const supabase = useMemo(() => createClient(), []);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [snapDate, setSnapDate] = useState<string | null>(null);
  const [thmBal, setThmBal] = useState<number | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState<Inv | null>(null);
  const [busy, setBusy] = useState("");
  const [showCollected, setShowCollected] = useState(false);

  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const [m, t, j, c] = await withTimeout(Promise.all([
        supabase.from("money_snapshot").select("data,updated_at").eq("id", 1),
        supabase.from("thm_ledger").select("side,amount,bucket,is_open"),
        supabase.from("jobs").select("id,job_name,customer,customer_id,location,job,price,status,completed_date,invoiced_date,paid_date,paid_amount,paid_method,qbo_invoice_ref,due_date,terms"),
        supabase.from("customers").select("id,name,qbo_names,payment_terms"),
      ]));
      const e = firstError(m, t, j, c);
      if (e) throw new Error(e);
      const row: any = (m.data ?? [])[0];
      setSnap(row?.data ?? null);
      setSnapDate(row?.updated_at ?? null);
      setThmBal(
        (t.data ?? [])
          .filter((e: any) => e.bucket === "inv94" && !e.is_open)
          .reduce((a: number, e: any) => a + (e.side === "owes_isola" ? 1 : -1) * Number(e.amount), 0)
      );
      setJobs(j.data ?? []);
      setCustomers(c.data ?? []);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const fmt$ = (n: number) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const dot = (d: number) => (d > 90 ? "bg-red-400" : d > 60 ? "bg-amber-400" : d > 30 ? "bg-amber-400" : d > 0 ? "bg-amber-400" : "bg-emerald-400");

  // which customer record does this QuickBooks name belong to?
  const custFor = (qname: string) => {
    const n = String(qname ?? "").toLowerCase();
    return customers.find((c) => c.name.toLowerCase() === n || (c.qbo_names ?? []).some((x: string) => x.toLowerCase() === n));
  };

  // tie an invoice to a job: an explicit link first, then customer + matching amount
  const jobFor = (i: Inv) => {
    if (i.ref) {
      const exact = jobs.find((j) => j.qbo_invoice_ref && String(j.qbo_invoice_ref).split(/[,\s]+/).includes(String(i.ref)));
      if (exact) return exact;
    }
    const c = custFor(i.customer);
    if (!c) return null;
    const mine = jobs.filter((j) => j.customer_id === c.id);
    return mine.find((j) => Math.abs(parsePrice(j.price) - Number(i.amount)) < 1) ?? null;
  };

  const termsFor = (j: any) => {
    if (j?.terms) return j.terms;
    const c = customers.find((c) => c.id === j?.customer_id);
    return c?.payment_terms || DEFAULT_TERMS;
  };

  async function markCollected(j: any, amount: number) {
    setBusy(j.id);
    const { error } = await supabase.from("jobs").update({
      paid_date: todayISO(), paid_amount: amount,
      status: j.status === "complete" ? "complete" : j.status,
      updated_at: new Date().toISOString(),
    }).eq("id", j.id);
    setBusy("");
    if (error) { showError("Update failed: " + error.message); return; }
    showToast("Marked collected");
    load();
  }
  async function unmarkCollected(j: any) {
    setBusy(j.id);
    const { error } = await supabase.from("jobs").update({ paid_date: null, paid_amount: null, updated_at: new Date().toISOString() }).eq("id", j.id);
    setBusy("");
    if (error) { showError("Update failed: " + error.message); return; }
    showToast("Moved back to open");
    load();
  }
  async function linkInvoice(jobId: string, inv: Inv) {
    setBusy(jobId);
    const { error } = await supabase.from("jobs").update({
      qbo_invoice_ref: inv.ref ?? null, due_date: inv.due ?? null,
      invoiced_date: inv.due ? new Date(new Date(inv.due).getTime() - 30 * 86400000).toISOString().slice(0, 10) : null,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    setBusy("");
    if (error) { showError("Link failed: " + error.message); return; }
    showToast("Invoice linked");
    setLinking(null); load();
  }

  const header = (
    <PageHeader title="Money" sub="What's owed to you, what's late, and what's come in"
      actions={<Button variant="outline" asChild><Link href="/thm"><Wallet size={16} /> THM tab</Link></Button>} />
  );
  if (err) return <div>{header}<LoadError message={err} onRetry={() => { setLoading(true); load(); }} /></div>;
  if (loading) return <div>{header}<ListSkeleton /></div>;

  // Once a job is marked collected its invoice drops off the money list entirely —
  // the QuickBooks snapshot is a cache and still carries it until the next refresh.
  const allInvoices = snap?.invoices ?? [];
  // v4.2: invoices written ahead in QuickBooks for jobs that aren't Complete yet are "billed ahead" —
  // not owed yet, so they stay out of the tiles, the aging bar and the overdue list.
  const openInv = allInvoices.filter((i) => { const j = jobFor(i); return !(j && j.paid_date); });
  const billedAhead = openInv.filter((i) => { const j = i.ref ? jobs.find((x) => String(x.qbo_invoice_ref ?? "").split(/[,\s]+/).includes(String(i.ref))) : null; return j && j.status !== "complete"; });
  const invoices = openInv.filter((i) => !billedAhead.includes(i));
  const overdueList = invoices.filter((i) => i.days_overdue > 0).sort((a, b) => b.days_overdue - a.days_overdue);
  const currentList = invoices.filter((i) => i.days_overdue <= 0).sort((a, b) => (a.due < b.due ? -1 : 1));

  // Tiles and the aging bar foot to what is actually still open, not to the stale snapshot.
  const sum = (list: Inv[]) => list.reduce((a, i) => a + Number(i.amount), 0);
  const band = (lo: number, hi: number) => sum(invoices.filter((i) => i.days_overdue > lo && i.days_overdue <= hi));
  const openAR = sum(invoices);
  const openOverdue = sum(overdueList);
  const buckets = { current: sum(currentList), d1_30: band(0, 30), d31_60: band(30, 60), d61_90: band(60, 90), d91_plus: band(90, 1e9) };

  const done = jobs.filter((j) => j.status === "complete");
  const unbilled = done.filter((x) => !x.invoiced_date && !x.paid_date);
  const collected = jobs.filter((j) => j.paid_date).sort((a, b) => (a.paid_date < b.paid_date ? 1 : -1));
  const collectedTotal = collected.reduce((a, j) => a + (Number(j.paid_amount) || parsePrice(j.price)), 0);

  function invoiceRow(i: Inv, idx: number) {
    const j = jobFor(i);
    const late = i.days_overdue > 0;
    const daysUntil = Math.round((new Date(i.due + "T12:00:00").getTime() - Date.now()) / 86400000);
    return (
      <Card key={i.ref ?? idx} className={cn("flex flex-col px-4 py-3", late && "border-red-500/30")}>
        <div className="flex items-start gap-3">
          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot(i.days_overdue))} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-white">{j ? jobLabel(j) : i.customer}</div>
            <div className="truncate text-sm text-neutral-400">{j ? i.customer : "no job linked yet"}</div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="font-semibold tabular-nums text-white">{money(i.amount)}</div>
            <Badge variant={late ? "danger" : "warning"}>{late ? "Not collected" : "Open"}</Badge>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-neutral-400">
          {i.ref ? <span>Invoice <span className="text-neutral-300">#{i.ref}</span></span> : <span />}
          <span className="text-right">
            Due <span className={late ? "font-semibold text-red-300" : "text-neutral-300"}>{fmtDate(i.due)}</span>
            {late ? ` · ${i.days_overdue}d late` : daysUntil >= 0 ? ` · in ${daysUntil}d` : ""}
          </span>
          <span className="col-span-2">Terms: {termsFor(j)}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 md:mt-auto md:pt-3">
          {j ? (
            <>
              <Button variant="outline" size="sm" className="h-10 md:h-8" asChild><Link href={`/?job=${j.id}`}><FileText size={14} /> Open job file</Link></Button>
              <Button variant="outline" size="sm" className="h-10 border-emerald-500/50 text-emerald-300 hover:border-emerald-400 md:h-8"
                onClick={(e) => { e.preventDefault(); markCollected(j, Number(i.amount)); }} disabled={busy === j.id}>
                <Check size={14} /> {busy === j.id ? "Saving…" : "Mark collected"}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={() => setLinking(i)}><Link2 size={14} /> Link to a job</Button>
          )}
        </div>
      </Card>
    );
  }

  const nothingOpen = !overdueList.length && !currentList.length && !billedAhead.length && !unbilled.length;

  return (
    <div className="space-y-6">
      <div>
        {header}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Owed to you" value={snap ? fmt$(openAR) : "—"} hint={`${invoices.length} open`} />
          <Stat label="Overdue" value={snap ? fmt$(openOverdue) : "—"} tone={openOverdue > 0 ? "warn" : undefined} hint={`${overdueList.length} late`} />
          <Stat label="Collected" value={fmt$(collectedTotal)} tone={collectedTotal ? "ok" : undefined} hint={`${collected.length} jobs`} />
        </div>
      </div>

      {snap ? (
        <Card>
          <CardHeader className="items-baseline">
            <CardTitle>Aging</CardTitle>
            <span className="ml-auto text-xs text-neutral-500">QuickBooks · as of {fmtDate(snap.as_of)}</span>
          </CardHeader>
          <CardContent>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.08]">
              {buckets.current > 0 ? <div className="bg-emerald-400" style={{ width: (buckets.current / (openAR || 1)) * 100 + "%" }} /> : null}
              {buckets.d1_30 > 0 ? <div className="bg-amber-400" style={{ width: (buckets.d1_30 / (openAR || 1)) * 100 + "%" }} /> : null}
              {buckets.d31_60 > 0 ? <div className="bg-amber-400" style={{ width: (buckets.d31_60 / (openAR || 1)) * 100 + "%" }} /> : null}
              {buckets.d61_90 > 0 ? <div className="bg-amber-400" style={{ width: (buckets.d61_90 / (openAR || 1)) * 100 + "%" }} /> : null}
              {buckets.d91_plus > 0 ? <div className="bg-red-400" style={{ width: (buckets.d91_plus / (openAR || 1)) * 100 + "%" }} /> : null}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-400 sm:grid-cols-4">
              <span>Current <b className="font-semibold tabular-nums text-neutral-200">{fmt$(buckets.current)}</b></span>
              <span>1–30 <b className="font-semibold tabular-nums text-neutral-200">{fmt$(buckets.d1_30)}</b></span>
              <span>31–90 <b className="font-semibold tabular-nums text-neutral-200">{fmt$(buckets.d31_60 + buckets.d61_90)}</b></span>
              <span>91+ <b className="font-semibold tabular-nums text-neutral-200">{fmt$(buckets.d91_plus)}</b></span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Empty icon={<Wallet size={28} />} title="No QuickBooks snapshot yet" body="Ask Claude to refresh the money panel." />
      )}

      {overdueList.length ? (
        <section>
          <SectionTitle><span className="text-red-300">Overdue — money not collected</span></SectionTitle>
          <div className="grid gap-2 md:grid-cols-2">{overdueList.map(invoiceRow)}</div>
        </section>
      ) : null}

      {currentList.length ? (
        <section>
          <SectionTitle>Not yet due</SectionTitle>
          <div className="grid gap-2 md:grid-cols-2">{currentList.map(invoiceRow)}</div>
        </section>
      ) : null}

      {snap && nothingOpen ? (
        <Empty icon={<Check size={28} />} title="Nothing open" body="Every invoice in the snapshot is collected." />
      ) : null}

      {billedAhead.length ? (
        <Card>
          <CardHeader><CardTitle>In QuickBooks, job not done yet · {billedAhead.length}</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {billedAhead.map((i, idx) => (
              <div key={idx} className="flex justify-between gap-3 text-sm text-neutral-400"><span className="truncate">#{i.ref} · {i.customer}</span><span className="shrink-0 tabular-nums">{fmt$(Number(i.amount))}</span></div>
            ))}
            <p className="pt-1 text-xs text-neutral-500">Not counted as owed or overdue until the job is marked Complete.</p>
          </CardContent>
        </Card>
      ) : null}

      {unbilled.length ? (
        <section>
          <SectionTitle><span className="text-amber-300">Complete but not invoiced</span></SectionTitle>
          <div className="grid gap-2 md:grid-cols-2">
            {unbilled.map((j) => (
              <Link key={j.id} href={`/?job=${j.id}`} className="block rounded-xl border border-amber-500/40 bg-amber-500/[0.05] px-4 py-3 transition-colors hover:border-amber-400">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-white">{jobLabel(j)}</div>
                    <div className="text-sm text-neutral-400">completed {j.completed_date ? fmtDate(j.completed_date) : "—"} — not billed yet</div>
                  </div>
                  {j.price ? <div className="shrink-0 font-semibold tabular-nums text-amber-300">{fmtPrice(j.price)}</div> : null}
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500">Terms: {termsFor(j)} · open job file <ChevronRight size={12} /></div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {collected.length ? (
        <section>
          <button onClick={() => setShowCollected(!showCollected)} aria-expanded={showCollected}
            className="mb-2 flex min-h-[44px] w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-2 transition-colors hover:border-white/20">
            <span className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><Check size={16} /> Collected · {collected.length}</span>
            <span className="flex items-center gap-1.5 text-sm tabular-nums text-neutral-400">{fmt$(collectedTotal)} <ChevronDown size={16} className={cn("transition-transform", showCollected && "rotate-180")} /></span>
          </button>
          <div className={showCollected ? "grid gap-2 md:grid-cols-2" : "hidden"}>
            {collected.map((j) => (
              <div key={j.id} className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/?job=${j.id}`} className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-white">{jobLabel(j)}</div>
                    <div className="truncate text-sm text-neutral-400">
                      paid {fmtDate(j.paid_date)}{j.qbo_invoice_ref ? ` · #${j.qbo_invoice_ref}` : ""}{j.paid_method ? ` · ${j.paid_method}` : ""}
                    </div>
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <div className="font-semibold tabular-nums text-emerald-300">{money(Number(j.paid_amount) || parsePrice(j.price))}</div>
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-neutral-500" onClick={() => unmarkCollected(j)} disabled={busy === j.id}>
                      <RotateCcw size={12} /> Undo
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Link href="/thm" className="flex min-h-[48px] items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-white/20">
        <span className="text-sm font-semibold text-white">THM tab — Invoice #94</span>
        <span className="flex items-center gap-1.5 font-semibold tabular-nums text-white">{thmBal == null ? "…" : money(thmBal)} <ArrowRight size={16} /></span>
      </Link>

      <p className="text-xs text-neutral-500">Snapshot pulled from QuickBooks{snapDate ? " " + new Date(snapDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}. Ask Claude to &quot;refresh the money panel&quot; any time — it also refreshes with the Monday digest.</p>

      <Dialog open={!!linking} onOpenChange={(o) => { if (!o) setLinking(null); }}>
        {linking ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Which job is this?</DialogTitle>
              <DialogDescription>{linking.customer} · {money(linking.amount)}{linking.ref ? ` · #${linking.ref}` : ""}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[55vh] space-y-1.5 overflow-y-auto scroll-thin">
              {jobs
                .filter((j) => { const c = custFor(linking.customer); return c ? j.customer_id === c.id : true; })
                .sort((a, b) => parsePrice(b.price) - parsePrice(a.price))
                .map((j) => (
                  <button key={j.id} onClick={() => linkInvoice(j.id, linking)} disabled={busy === j.id}
                    className="min-h-[44px] w-full rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-white/25 disabled:opacity-50">
                    <div className="truncate text-sm font-semibold text-white">{jobLabel(j)}</div>
                    <div className="text-xs text-neutral-400">{[j.job, j.price, j.status].filter(Boolean).join(" · ")}</div>
                  </button>
                ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLinking(null)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
