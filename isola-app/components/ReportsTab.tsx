"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* ============================================================
   REPORTS — the view across jobs the app never had. Everything here
   reads public.job_financials, which folds together the contract,
   approved change orders, real costs, real payments, the partner's
   share on a joint job, and — where a job came out of a Build
   estimate — the estimated cost it was priced from.

   Every number on this page is a button. Tapping one lists the jobs
   behind it, and tapping a job opens it in Billing to edit. A figure
   you can't trace back to the jobs that made it is a figure nobody
   trusts.

   The honest bit: margin is only as true as the costs logged against
   the job. A job with no costs shows 100% margin, which is why the
   "missing costs" panel exists rather than being hidden.
   ============================================================ */

const fmt0 = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const card = "rounded-xl border border-neutral-800 bg-neutral-950 p-3.5";

type Drill = { kind: "tile" | "type"; key: string; label: string } | null;

export default function ReportsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [fin, setFin] = useState<any[]>([]);
  const [ests, setEsts] = useState<any[]>([]);
  const [custs, setCusts] = useState<any[]>([]);
  const [qbo, setQbo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<Drill>(null);

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

  const totContract = priced.reduce((s, f) => s + Number(f.contract_total || 0), 0);
  const totPaid = priced.reduce((s, f) => s + Number(f.paid_to_date || 0), 0);

  // A quoted job and an invoiced one are not the same money. Only work that
  // carries a QuickBooks invoice reference is a real receivable; everything
  // else priced is pipeline. Mixing them overstates what Mike is owed.
  const invoiced = priced.filter((f) => f.qbo_invoice_ref);
  const quoted = priced.filter((f) => !f.qbo_invoice_ref);
  const owedReal = invoiced.reduce((s, f) => s + Math.max(0, Number(f.balance_due || 0)), 0);
  const quotedTotal = quoted.reduce((s, f) => s + Number(f.contract_total || 0), 0);

  const qboAR = Number(qbo?.data?.total_ar ?? 0);
  const unlinkedAR = qboAR > 0 ? qboAR - owedReal : 0;

  // what Mike actually keeps, once costs and the partner are out
  const totKeep = withCosts.reduce((s, f) => s + Number(f.net_to_isola || 0), 0);
  const totPartner = priced.reduce((s, f) => s + Number(f.partner_share || 0), 0);
  const trueMargin = withCosts.length
    ? (totKeep / withCosts.reduce((s, f) => s + Number(f.contract_total || 0), 0)) * 100
    : 0;

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

  const variance = fin.filter((f) => Number(f.estimated_cost) > 0 && Number(f.actual_cost) > 0);

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

  /* ---------- what a given drill shows ---------- */
  function drillJobs(d: Drill): any[] {
    if (!d) return [];
    if (d.kind === "type") return withCosts.filter((f) => (f.work_type || "Uncategorized").trim() === d.key);
    switch (d.key) {
      case "collected":  return priced.filter((f) => Number(f.paid_to_date) > 0).sort((a, b) => Number(b.paid_to_date) - Number(a.paid_to_date));
      case "owed":       return invoiced.filter((f) => Number(f.balance_due) > 0).sort((a, b) => Number(b.balance_due) - Number(a.balance_due));
      case "quoted":     return quoted.sort((a, b) => Number(b.contract_total) - Number(a.contract_total));
      case "contracted": return priced.sort((a, b) => Number(b.contract_total) - Number(a.contract_total));
      case "keep":       return withCosts.sort((a, b) => Number(b.net_to_isola) - Number(a.net_to_isola));
      case "partner":    return priced.filter((f) => Number(f.partner_share) > 0).sort((a, b) => Number(b.partner_share) - Number(a.partner_share));
      case "missing":    return missing.sort((a, b) => Number(b.contract_total) - Number(a.contract_total));
      case "unlinked":   return [];
      default:           return [];
    }
  }

  const isOpen = (kind: string, key: string) => drill?.kind === kind && drill?.key === key;
  const toggle = (kind: "tile" | "type", key: string, label: string) =>
    setDrill(isOpen(kind, key) ? null : { kind, key, label });

  const tile = (key: string, label: string, value: string, sub: string, tone?: string) => (
    <button key={key} onClick={() => toggle("tile", key, label)}
      className={`rounded-xl border px-3 py-2.5 text-left ${isOpen("tile", key) ? "border-neutral-300 bg-neutral-900" : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
      <div className={`text-xl font-bold leading-tight tabular-nums ${tone ?? "text-white"}`}>{value}</div>
      <div className="text-[11px] text-neutral-500">{sub}</div>
    </button>
  );

  /* ---------- the drill-down list ---------- */
  function drillPanel() {
    if (!drill) return null;
    const jobs = drillJobs(drill);
    return (
      <div className="rounded-xl border border-neutral-300/30 bg-neutral-900 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-300">
            {drill.label} — {jobs.length} job{jobs.length === 1 ? "" : "s"}
          </div>
          <button onClick={() => setDrill(null)} className="text-xs font-semibold text-neutral-400 underline">Close</button>
        </div>
        {jobs.length === 0 ? (
          <p className="text-[11px] text-neutral-500">
            Nothing here yet — this figure comes from QuickBooks invoices with no job in the app.
          </p>
        ) : jobs.map((f) => (
          <a key={f.job_id} href={`/billing?job=${f.job_id}`}
            className="block rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 hover:border-neutral-600">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">{f.job_name || "—"}</div>
                <div className="text-[11px] text-neutral-500 truncate">
                  {f.customer}{f.qbo_invoice_ref ? ` · QB ${f.qbo_invoice_ref}` : " · not invoiced"}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-white tabular-nums">{fmt0(Number(f.contract_total))}</div>
                <div className="text-[11px] text-neutral-500 tabular-nums">
                  {Number(f.balance_due) > 0 ? `${fmt0(Number(f.balance_due))} owed` : "paid"}
                </div>
              </div>
            </div>
            {Number(f.actual_cost) > 0 ? (
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-neutral-600">
                <span>cost {fmt0(Number(f.actual_cost))}</span>
                {Number(f.partner_share) > 0 ? <span className="text-amber-300/80">{f.partner} {fmt0(Number(f.partner_share))}</span> : null}
                <span className="text-emerald-400/80">you keep {fmt0(Number(f.net_to_isola))}</span>
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-amber-300/70">no costs logged — margin not real</div>
            )}
          </a>
        ))}
        <p className="text-[10px] text-neutral-600">Tap a job to open it in Billing, where you can edit it.</p>
      </div>
    );
  }

  return (
    <div className="pb-28 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-white">Reports</h1>
        <p className="text-xs text-neutral-500">Tap any number to see the jobs behind it</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {tile("collected", "Collected", fmt0(totPaid), `${invoiced.length} invoiced jobs`, "text-emerald-400")}
        {tile("owed", "Invoiced — owed", fmt0(owedReal), "billed, not paid", owedReal > 0 ? "text-amber-300" : "text-white")}
        {tile("quoted", "Quoted pipeline", fmt0(quotedTotal), `${quoted.length} priced, no invoice`)}
        {tile("contracted", "Contracted", fmt0(totContract), `${priced.length} priced jobs`)}
      </div>

      {/* ---- what's actually yours ---- */}
      <div className="grid grid-cols-2 gap-2">
        {tile("keep", "You keep", fmt0(totKeep), `${withCosts.length} jobs with costs`, "text-emerald-400")}
        {tile("partner", "To partners", fmt0(totPartner), "THM profit shares", totPartner > 0 ? "text-amber-300" : "text-white")}
      </div>

      {drill?.kind === "tile" ? drillPanel() : null}

      {withCosts.length ? (
        <div className={card}>
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">True margin</span>
            <span className="text-2xl font-bold text-white tabular-nums">{trueMargin.toFixed(1)}%</span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-600 leading-relaxed">
            What you keep, over what you billed, on the {withCosts.length} jobs that have real costs against them —
            after job costs and after the partner's share. Job-level margins read far higher; this is the one that pays you.
          </p>
        </div>
      ) : null}

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
        <button onClick={() => toggle("tile", "missing", "Priced jobs with no costs")}
          className={`w-full text-left rounded-xl border p-3 ${isOpen("tile", "missing") ? "border-amber-400 bg-amber-500/15" : "border-amber-500/40 bg-amber-500/10"}`}>
          <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
            {missing.length} priced job{missing.length === 1 ? "" : "s"} with no costs logged
          </div>
          <p className="mt-1 text-[11px] text-amber-100/80 leading-relaxed">
            Those jobs show 100% margin because nothing has been spent against them in the app.
            Every margin below is computed from the {withCosts.length} job{withCosts.length === 1 ? "" : "s"} that
            do have costs. Tap to see which ones.
          </p>
        </button>
      ) : null}

      {/* ---- where the money actually is ---- */}
      <div className={card + " space-y-2"}>
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Margin by work type</div>
        {typeRows.length === 0 ? (
          <p className="text-[11px] text-neutral-600">Nothing to show until at least one job has costs logged against it.</p>
        ) : typeRows.map((r) => (
          <button key={r.type} onClick={() => toggle("type", r.type, r.type)}
            className={`w-full text-left space-y-1 rounded-lg px-2 py-1.5 ${isOpen("type", r.type) ? "bg-neutral-900" : "hover:bg-neutral-900/60"}`}>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-300 truncate">{r.type} <span className="text-neutral-600">×{r.n}</span></span>
              <span className={`tabular-nums font-semibold ${r.margin < 20 ? "text-amber-300" : "text-emerald-400"}`}>{r.margin.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
              <div className={`h-full ${r.margin < 20 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(0, Math.min(100, r.margin))}%` }} />
            </div>
            <div className="text-[11px] text-neutral-600">{fmt0(r.rev)} billed · {fmt0(r.cost)} cost · {fmt0(r.rev - r.cost)} net</div>
          </button>
        ))}
      </div>

      {drill?.kind === "type" ? drillPanel() : null}

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
            <a key={f.job_id} href={`/billing?job=${f.job_id}`} className="flex justify-between gap-2 text-sm hover:bg-neutral-900/60 rounded px-1">
              <span className="text-neutral-300 truncate">{f.job_name}</span>
              <span className={`shrink-0 tabular-nums font-semibold ${v > 10 ? "text-red-400" : v < -10 ? "text-emerald-400" : "text-neutral-300"}`}>
                {v > 0 ? "+" : ""}{v}% {v > 0 ? "over" : "under"}
              </span>
            </a>
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
        One caveat worth holding onto: even "you keep" is job-level. Truck, insurance, phone, fuel
        between jobs and your own unbilled hours aren't in here. Real business profit is lower.
      </p>
    </div>
  );
}
