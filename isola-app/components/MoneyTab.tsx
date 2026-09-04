"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { money, fmtDate, jobLabel, parsePrice, todayISO } from "@/lib/format";

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

  async function load() {
    const [m, t, j, c] = await Promise.all([
      supabase.from("money_snapshot").select("data,updated_at").eq("id", 1),
      supabase.from("thm_ledger").select("side,amount,bucket,is_open"),
      supabase.from("jobs").select("id,job_name,customer,customer_id,location,job,price,status,completed_date,invoiced_date,paid_date,paid_amount,paid_method,qbo_invoice_ref,due_date,terms"),
      supabase.from("customers").select("id,name,qbo_names,payment_terms"),
    ]);
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
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const fmt$ = (n: number) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const dot = (d: number) => (d > 90 ? "bg-red-400" : d > 60 ? "bg-orange-400" : d > 30 ? "bg-amber-400" : d > 0 ? "bg-yellow-400" : "bg-emerald-400");

  // which customer record does this QuickBooks name belong to?
  const custFor = (qname: string) => {
    const n = String(qname ?? "").toLowerCase();
    return customers.find((c) => c.name.toLowerCase() === n || (c.qbo_names ?? []).some((x: string) => x.toLowerCase() === n));
  };

  // tie an invoice to a job: an explicit link first, then customer + matching amount
  const jobFor = (i: Inv) => {
    if (i.ref) {
      const exact = jobs.find((j) => j.qbo_invoice_ref && j.qbo_invoice_ref === i.ref);
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
    await supabase.from("jobs").update({
      paid_date: todayISO(), paid_amount: amount,
      status: j.status === "complete" ? "complete" : j.status,
      updated_at: new Date().toISOString(),
    }).eq("id", j.id);
    setBusy(""); load();
  }
  async function unmarkCollected(j: any) {
    setBusy(j.id);
    await supabase.from("jobs").update({ paid_date: null, paid_amount: null, updated_at: new Date().toISOString() }).eq("id", j.id);
    setBusy(""); load();
  }
  async function linkInvoice(jobId: string, inv: Inv) {
    setBusy(jobId);
    await supabase.from("jobs").update({
      qbo_invoice_ref: inv.ref ?? null, due_date: inv.due ?? null,
      invoiced_date: inv.due ? new Date(new Date(inv.due).getTime() - 30 * 86400000).toISOString().slice(0, 10) : null,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    setBusy(""); setLinking(null); load();
  }

  if (loading) return <p className="pt-4 text-sm text-neutral-500">Loading…</p>;

  const invoices = snap?.invoices ?? [];
  const overdueList = invoices.filter((i) => i.days_overdue > 0).sort((a, b) => b.days_overdue - a.days_overdue);
  const currentList = invoices.filter((i) => i.days_overdue <= 0).sort((a, b) => (a.due < b.due ? -1 : 1));

  const done = jobs.filter((j) => j.status === "complete");
  const unbilled = done.filter((x) => !x.invoiced_date && !x.paid_date);
  const collected = jobs.filter((j) => j.paid_date).sort((a, b) => (a.paid_date < b.paid_date ? 1 : -1));
  const collectedTotal = collected.reduce((a, j) => a + (Number(j.paid_amount) || parsePrice(j.price)), 0);

  function invoiceRow(i: Inv, idx: number) {
    const j = jobFor(i);
    const late = i.days_overdue > 0;
    const daysUntil = Math.round((new Date(i.due + "T12:00:00").getTime() - Date.now()) / 86400000);
    const body = (
      <>
        <div className="flex items-start gap-3">
          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot(i.days_overdue)}`} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white truncate">{j ? jobLabel(j) : i.customer}</div>
            <div className="text-xs text-neutral-500 truncate">{j ? i.customer : "no job linked yet"}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-bold tabular-nums text-white">{money(i.amount)}</div>
            <span className={`text-[10px] font-bold px-1.5 py-px rounded-full border ${late ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
              {late ? "NOT COLLECTED" : "OPEN"}
            </span>
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
          {i.ref ? <span>Invoice <span className="text-neutral-300">#{i.ref}</span></span> : <span />}
          <span className="text-right">
            Due <span className={late ? "text-red-300 font-semibold" : "text-neutral-300"}>{fmtDate(i.due)}</span>
            {late ? ` · ${i.days_overdue}d late` : daysUntil >= 0 ? ` · in ${daysUntil}d` : ""}
          </span>
          <span className="col-span-2">Terms: <span className="text-neutral-400">{termsFor(j)}</span></span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {j ? (
            <>
              <Link href={`/?job=${j.id}`} className={btn}>📂 Open job file</Link>
              <button onClick={(e) => { e.preventDefault(); markCollected(j, Number(i.amount)); }} disabled={busy === j.id}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-emerald-500/50 bg-emerald-500/10 text-emerald-300 disabled:opacity-50">
                {busy === j.id ? "…" : "✓ Mark collected"}
              </button>
            </>
          ) : (
            <button onClick={() => setLinking(i)} className={btn}>🔗 Link to a job</button>
          )}
        </div>
      </>
    );
    return (
      <div key={i.ref ?? idx} className={`rounded-xl border px-3.5 py-2.5 ${late ? "border-red-500/30 bg-neutral-950" : "border-neutral-800 bg-neutral-950"}`}>
        {body}
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile l="Owed to you" v={snap ? fmt$(snap.total_ar) : "—"} />
        <Tile l="Overdue" v={snap ? fmt$(snap.overdue) : "—"} tone={snap && snap.overdue > 0 ? "amber" : undefined} />
        <Tile l="Collected" v={fmt$(collectedTotal)} tone={collectedTotal ? "green" : undefined} />
      </div>

      {snap ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/95 p-4">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Aging</div>
            <span className="text-[10px] text-neutral-600">QuickBooks · as of {fmtDate(snap.as_of)}</span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-neutral-800">
            {snap.buckets.current > 0 ? <div className="bg-emerald-400" style={{ width: (snap.buckets.current / snap.total_ar) * 100 + "%" }} /> : null}
            {snap.buckets.d1_30 > 0 ? <div className="bg-yellow-400" style={{ width: (snap.buckets.d1_30 / snap.total_ar) * 100 + "%" }} /> : null}
            {snap.buckets.d31_60 > 0 ? <div className="bg-amber-400" style={{ width: (snap.buckets.d31_60 / snap.total_ar) * 100 + "%" }} /> : null}
            {snap.buckets.d61_90 > 0 ? <div className="bg-orange-400" style={{ width: (snap.buckets.d61_90 / snap.total_ar) * 100 + "%" }} /> : null}
            {snap.buckets.d91_plus > 0 ? <div className="bg-red-400" style={{ width: (snap.buckets.d91_plus / snap.total_ar) * 100 + "%" }} /> : null}
          </div>
          <div className="text-[10px] text-neutral-500 mt-1.5">🟢 current {fmt$(snap.buckets.current)} · 🟡 1–30 {fmt$(snap.buckets.d1_30)} · 🟠 31–90 {fmt$(snap.buckets.d31_60 + snap.buckets.d61_90)} · 🔴 91+ {fmt$(snap.buckets.d91_plus)}</div>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No QuickBooks snapshot yet — ask Claude to refresh the money panel.</p>
      )}

      {overdueList.length ? (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-red-300 mb-1.5">Overdue — money not collected</div>
          <div className="space-y-1.5">{overdueList.map(invoiceRow)}</div>
        </div>
      ) : null}

      {currentList.length ? (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">Not yet due</div>
          <div className="space-y-1.5">{currentList.map(invoiceRow)}</div>
        </div>
      ) : null}

      {unbilled.length ? (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-1.5">⚠️ Complete but not invoiced</div>
          <div className="space-y-1.5">
            {unbilled.map((j) => (
              <Link key={j.id} href={`/?job=${j.id}`} className="block rounded-xl border border-amber-500/40 bg-amber-500/5 px-3.5 py-2.5 hover:border-amber-400">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{jobLabel(j)}</div>
                    <div className="text-xs text-neutral-500">completed {j.completed_date ? fmtDate(j.completed_date) : "—"} — not billed yet</div>
                  </div>
                  {j.price ? <div className="shrink-0 text-sm font-bold tabular-nums text-amber-300">{j.price}</div> : null}
                </div>
                <div className="mt-1 text-[11px] text-neutral-600">Terms: {termsFor(j)} · 📂 open job file</div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {collected.length ? (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-1.5">✓ Collected</div>
          <div className="space-y-1.5">
            {collected.map((j) => (
              <div key={j.id} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/?job=${j.id}`} className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">{jobLabel(j)}</div>
                    <div className="text-[11px] text-neutral-500">
                      paid {fmtDate(j.paid_date)}{j.qbo_invoice_ref ? ` · #${j.qbo_invoice_ref}` : ""}{j.paid_method ? ` · ${j.paid_method}` : ""}
                    </div>
                  </Link>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-bold tabular-nums text-emerald-300">{money(Number(j.paid_amount) || parsePrice(j.price))}</div>
                    <button onClick={() => unmarkCollected(j)} className="text-[10px] text-neutral-600 underline">undo</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Link href="/thm" className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 hover:border-neutral-600">
        <span className="text-sm font-semibold text-white">🤝 THM tab — Invoice #94</span>
        <span className="text-sm font-bold text-white tabular-nums">{thmBal == null ? "…" : money(thmBal)} →</span>
      </Link>

      <p className="text-xs text-neutral-600">Snapshot pulled from QuickBooks{snapDate ? " " + new Date(snapDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}. Ask Claude to &quot;refresh the money panel&quot; any time — it also refreshes with the Monday digest.</p>

      {linking ? (
        <div className="fixed inset-0 z-50 bg-black/85 overflow-y-auto p-3" onClick={() => setLinking(null)}>
          <div className="mx-auto max-w-sm rounded-2xl border border-neutral-800 bg-neutral-950 p-4 my-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-bold text-white">Which job is this?</div>
            <div className="text-[11px] text-neutral-500 mt-0.5 mb-3">
              {linking.customer} · {money(linking.amount)}{linking.ref ? ` · #${linking.ref}` : ""}
            </div>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {jobs
                .filter((j) => { const c = custFor(linking.customer); return c ? j.customer_id === c.id : true; })
                .sort((a, b) => parsePrice(b.price) - parsePrice(a.price))
                .map((j) => (
                  <button key={j.id} onClick={() => linkInvoice(j.id, linking)} disabled={busy === j.id}
                    className="w-full text-left rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 hover:border-neutral-600 disabled:opacity-50">
                    <div className="text-xs font-semibold text-white truncate">{jobLabel(j)}</div>
                    <div className="text-[11px] text-neutral-500">{[j.job, j.price, j.status].filter(Boolean).join(" · ")}</div>
                  </button>
                ))}
            </div>
            <button onClick={() => setLinking(null)} className="mt-3 w-full text-xs text-neutral-500 underline">Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const btn = "px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-neutral-700 text-neutral-300 hover:border-neutral-500";

function Tile({ v, l, tone }: { v: string; l: string; tone?: "amber" | "green" }) {
  const b = tone === "amber" ? "border-amber-500/50" : tone === "green" ? "border-emerald-500/50" : "border-neutral-800";
  const c = tone === "amber" ? "text-amber-300" : tone === "green" ? "text-emerald-300" : "text-white";
  return (
    <div className={`rounded-2xl border ${b} bg-neutral-900/95 p-3 text-center`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{l}</div>
      <div className={`text-xl font-extrabold tabular-nums mt-1 ${c}`}>{v}</div>
    </div>
  );
}
