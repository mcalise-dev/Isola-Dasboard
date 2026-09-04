"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* ============================================================
   REPORTS — the view across jobs the app never had. Everything here
   reads public.job_financials, which folds together the contract,
   approved change orders, real costs, real payments and, where a job
   came out of a Build estimate, the estimated cost it was priced from.

   The honest bit: margin is only as true as the costs logged against
   the job. A job with no costs shows 100% margin, which is why the
   "missing costs" panel exists rather than being hidden.
   ============================================================ */

const fmt0 = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const card = "rounded-xl border border-neutral-800 bg-neutral-950 p-3.5";
const btn = "rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-500";

export default function ReportsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [fin, setFin] = useState<any[]>([]);
  const [ests, setEsts] = useState<any[]>([]);
  const [custs, setCusts] = useState<any[]>([]);
  const [qbo, setQbo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [f, e, c, m] = await Promise.all([
        supabase.from("job_financials").select("*"),
        supabase.from("estimates").select("id,status,sell_price,cost_total,customer_id,job_type"),
        supabase.from("customers").select("id,name,client_type"),
        supabase.from("money_snapshot").select("data,updated_at").eq("id", 1).maybeSingle(),
      ]);
      setFin(f.data ?? []); setEsts(e.data ?? []); setCusts(c.data ?? []);
      setQbo(m.data ?? null);
      setLoading(false);
    })();
    /* eslint-disable-next-line */
  }, []);

  if (loading) return <div className="p-4 text-sm text-neutral-500">Loading…</div>;

  const priced = fin.filter((f) => Number(f.contract_total) > 0);
  const withCosts = priced.filter((f) => Number(f.actual_cost) > 0);
  const complete = priced.filter((f) => f.status === "complete");

  const totContract = priced.reduce((s, f) => s + Number(f.contract_total || 0), 0);
  const totCost = priced.reduce((s, f) => s + Number(f.actual_cost || 0), 0);
  const totPaid = priced.reduce((s, f) => s + Number(f.paid_to_date || 0), 0);
  const totOwed = priced.reduce((s, f) => s + Number(f.balance_due || 0), 0);

  // A quoted job and an invoiced one are not the same money. Only work that
  // carries a QuickBooks invoice reference is a real receivable; everything
  // else priced is pipeline. Mixing them overstates what Mike is owed.
  const invoiced = priced.filter((f) => f.qbo_invoice_ref);
  const quoted = priced.filter((f) => !f.qbo_invoice_ref);
  const owedReal = invoiced.reduce((s, f) => s + Math.max(0, Number(f.balance_due || 0)), 0);
  const quotedTotal = quoted.reduce((s, f) => s + Number(f.contract_total || 0), 0);

  // Everything QuickBooks is owed that has no job behind it in the app —
  // the THM tab, and any invoice raised outside a job record.
  const qboAR = Number(qbo?.data?.total_ar ?? 0);
  const unlinkedAR = qboAR > 0 ? qboAR - owedReal : 0;

  // margin by work type — only jobs with real costs, else it's fiction
  const byType: Record<string, { rev: number; cost: number; n: number }> = {};
  withCosts.forEach((f) => {
    const k = (f.work_type || "Uncategorized").trim();
    byType[k] = byType[k] ?? { rev: 0, cost: 0, n: 0 };
    byType[k].rev += Number(f.contract_total || 0);
    byType[k].cost += Number(f.actual_cost || 0);
    byType[k].n += 1;
  });
  const typeRows = Object.entries(byType)
    .map(([k, v]) => ({ type: k, ...v, margin: v.rev > 0 ? ((v.rev - v.cost) / v.rev) * 100 : 0 }))
    .sort((a, b) => b.rev - a.rev);

  // estimate vs actual — the payoff of the Build tab, once jobs run through it
  const variance = fin.filter((f) => Number(f.estimated_cost) > 0 && Number(f.actual_cost) > 0);

  // win rate by client type
  const custType = Object.fromEntries(custs.map((c) => [c.id, c.client_type]));
  const decided = ests.filter((e) => e.status === "won" || e.status === "lost");
  const byClient: Record<string, { won: number; total: number }> = {};
  decided.forEach((e) => {
    const k = custType[e.customer_id] ?? "unknown";
    byClient[k] = byClient[k] ?? { won: 0, total: 0 };
    byClient[k].total += 1;
    if (e.status === "won") byClient[k].won += 1;
  });

  const missing = priced.filter((f) => Number(f.actual_cost) === 0);

  const tile = (label: string, value: string, sub?: string, tone?: string) => (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
      <div className={`text-xl font-bold leading-tight tabular-nums ${tone ?? "text-white"}`}>{value}</div>
      {sub ? <div className="text-[11px] text-neutral-500">{sub}</div> : null}
    </div>
  );

  return (
    <div className="pb-28 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-white">Reports</h1>
        <p className="text-xs text-neutral-500">Across every job, not one at a time</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {tile("Collected", fmt0(totPaid), `${invoiced.length} invoiced jobs`, "text-emerald-400")}
        {tile("Invoiced — owed", fmt0(owedReal), "billed, not paid", owedReal > 0 ? "text-amber-300" : "text-white")}
        {tile("Quoted pipeline", fmt0(quotedTotal), `${quoted.length} priced, no invoice`)}
        {tile("Contracted", fmt0(totContract), `${priced.length} priced jobs`)}
      </div>

      {qboAR > 0 ? (
        <div className={card + " space-y-1.5"}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Against QuickBooks</div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-400">QuickBooks A/R</span>
            <span className="text-neutral-200 tabular-nums">{fmt0(qboAR)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-400">Owed on jobs in this app</span>
            <span className="text-neutral-200 tabular-nums">{fmt0(owedReal)}</span>
          </div>
          <div className="flex justify-between border-t border-neutral-800 pt-1.5 text-sm">
            <span className="text-neutral-400">Invoiced with no job here</span>
            <span className="text-neutral-200 tabular-nums">{fmt0(unlinkedAR)}</span>
          </div>
          <p className="text-[11px] text-neutral-600 leading-relaxed">
            That last line is mostly the THM tab, which is a ledger rather than a job. If it grows,
            it means invoices are being raised in QuickBooks without a job here to carry the costs —
            which is exactly the work whose margin nobody can see.
          </p>
          {qbo?.updated_at ? (
            <p className="text-[10px] text-neutral-700">
              QuickBooks figures as of {new Date(qbo.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ---- data-quality reality check ---- */}
      {missing.length ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
            {missing.length} priced job{missing.length === 1 ? "" : "s"} with no costs logged
          </div>
          <p className="mt-1 text-[11px] text-amber-100/80 leading-relaxed">
            Those jobs show 100% margin because nothing has been spent against them in the app.
            Every number below is computed from the {withCosts.length} job{withCosts.length === 1 ? "" : "s"} that
            do have costs. Log receipts and hours and this whole page becomes real.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {missing.slice(0, 6).map((f) => (
              <a key={f.job_id} href={`/?job=${f.job_id}`} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200">
                {f.job_name || f.customer}
              </a>
            ))}
            {missing.length > 6 ? <span className="text-[11px] text-amber-200/70 self-center">+{missing.length - 6} more</span> : null}
          </div>
        </div>
      ) : null}

      {/* ---- where the money actually is ---- */}
      <div className={card + " space-y-2"}>
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Margin by work type</div>
        {typeRows.length === 0 ? (
          <p className="text-[11px] text-neutral-600">Nothing to show until at least one job has costs logged against it.</p>
        ) : typeRows.map((r) => (
          <div key={r.type} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-300 truncate">{r.type} <span className="text-neutral-600">×{r.n}</span></span>
              <span className={`tabular-nums font-semibold ${r.margin < 20 ? "text-amber-300" : "text-emerald-400"}`}>{r.margin.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
              <div className={`h-full ${r.margin < 20 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(0, Math.min(100, r.margin))}%` }} />
            </div>
            <div className="text-[11px] text-neutral-600">{fmt0(r.rev)} billed · {fmt0(r.cost)} cost · {fmt0(r.rev - r.cost)} net</div>
          </div>
        ))}
      </div>

      {/* ---- estimate vs actual ---- */}
      <div className={card + " space-y-2"}>
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Estimate vs actual</div>
        {variance.length === 0 ? (
          <p className="text-[11px] text-neutral-600">
            Fills in once a job priced in the Build tab is finished with its costs logged. This is the
            one that tells you which work you underprice — worth the wait.
          </p>
        ) : variance.map((f) => {
          const v = Number(f.cost_variance_pct);
          return (
            <div key={f.job_id} className="flex justify-between gap-2 text-sm">
              <span className="text-neutral-300 truncate">{f.job_name}</span>
              <span className={`shrink-0 tabular-nums font-semibold ${v > 10 ? "text-red-400" : v < -10 ? "text-emerald-400" : "text-neutral-300"}`}>
                {v > 0 ? "+" : ""}{v}% {v > 0 ? "over" : "under"}
              </span>
            </div>
          );
        })}
      </div>

      {/* ---- win rate ---- */}
      <div className={card + " space-y-2"}>
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Win rate by client type</div>
        {Object.keys(byClient).length === 0 ? (
          <p className="text-[11px] text-neutral-600">Mark builds won or lost on the Build tab and this fills in.</p>
        ) : Object.entries(byClient).map(([k, v]) => (
          <div key={k} className="flex justify-between text-sm">
            <span className="text-neutral-300">{k.replace("_", " ")}</span>
            <span className="tabular-nums text-neutral-200">{Math.round((v.won / v.total) * 100)}% <span className="text-neutral-600">({v.won}/{v.total})</span></span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-neutral-600 leading-relaxed">
        One caveat worth holding onto: these are job margins, not business profit. Truck, insurance,
        phone, fuel between jobs and your own unbilled hours aren't in here. Real net is lower than
        what this page shows.
      </p>
    </div>
  );
}
