"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, firstError } from "@/lib/load";
import { PageHeader, SectionTitle, Stat, Progress, ListSkeleton, LoadError } from "@/components/ui/bits";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronRight, X, Check, FileDiff } from "lucide-react";
import { LOST_REASONS, revenueOf, fmtDate, todayISO } from "@/lib/format";
import { askText } from "@/components/Dialogs";
import { showError, showToast } from "@/components/Toaster";

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

type Drill = { kind: "tile" | "type"; key: string; label: string } | null;

export default function ReportsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [fin, setFin] = useState<any[]>([]);
  const [ests, setEsts] = useState<any[]>([]);
  const [custs, setCusts] = useState<any[]>([]);
  const [qbo, setQbo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [cos, setCos] = useState<any[]>([]);
  const [busy, setBusy] = useState("");

  async function load() {
    setErr(null);
    try {
      const [f, hj, e, c, m, co] = await withTimeout(Promise.all([
        supabase.from("job_financials").select("*"),
        supabase.from("jobs").select("id,job_name,customer,status,price,price_amount,contract_holder,isola_cut,est_costs,quoted_date,won_date,lost_date,lost_reason"),
        supabase.from("estimates").select("id,status,sell_price,cost_total,customer_id,job_type"),
        supabase.from("customers").select("id,name,client_type"),
        supabase.from("money_snapshot").select("data,updated_at").eq("id", 1).maybeSingle(),
        supabase.from("change_orders").select("id,job_id,co_number,title,amount,status,billed,billed_at,approved_at,created_at").order("created_at", { ascending: false }),
      ]));
      const bad = firstError(f, hj, e, c, m, co);
      if (bad) throw new Error(bad);
      // THM holds the contract -> the price is THM's money. Isola's revenue on it is
      // only Mike's cut (isola_cut, set at closeout); costs are inside that cut.
      const thm = new Map((hj.data ?? []).filter((j: any) => j.contract_holder === "thm").map((j: any) => [j.id, Number(j.isola_cut) || 0]));
      setFin((f.data ?? []).map((r: any) => {
        if (!thm.has(r.job_id)) return r;
        const cut = thm.get(r.job_id)!;
        return { ...r, contract_base: cut, change_orders: 0, contract_total: cut, actual_cost: 0, paid_to_date: cut,
          balance_due: 0, net_profit: cut, margin_pct: null, partner_share: 0, net_to_isola: cut, qbo_invoice_ref: r.qbo_invoice_ref };
      })); setEsts(e.data ?? []); setCusts(c.data ?? []);
      setQbo(m.data ?? null);
      setJobs(hj.data ?? []); setCos(co.data ?? []);
      setLoading(false);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }

  useEffect(() => {
    load();
    /* eslint-disable-next-line */
  }, []);

  if (err) return <div className="pb-28"><PageHeader title="Reports" sub="Tap any number to see the jobs behind it" /><LoadError message={err} onRetry={load} /></div>;
  if (loading) return <div className="pb-28"><PageHeader title="Reports" sub="Tap any number to see the jobs behind it" /><ListSkeleton rows={5} /></div>;

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

  // v6.9: finished work nobody has billed, and approved change orders not on an invoice yet
  const unbilled = priced.filter((f) => f.status === "complete" && !f.invoiced_date && !f.qbo_invoice_ref && Number(f.balance_due) > 0);
  const unbilledCOs = cos.filter((c) => c.status === "approved" && !c.billed);
  const unbilledTotal = unbilled.reduce((s, f) => s + Number(f.balance_due || 0), 0) + unbilledCOs.reduce((s, c) => s + Number(c.amount || 0), 0);

  // v6.9: estimate vs actual — jobs with costs but no estimated cost on file
  const noEstimate = fin.filter((f) => Number(f.actual_cost) > 0 && !(Number(f.estimated_cost) > 0) && Number(f.contract_total) > 0);

  // v6.9: win / loss from the jobs themselves (last 6 months), with the why
  const cut6 = (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10); })();
  const wonJ = jobs.filter((j) => j.won_date && j.won_date >= cut6);
  const lostJ = jobs.filter((j) => j.status === "lost" && (j.lost_date ?? "") >= cut6);
  const wl = wonJ.length + lostJ.length;
  const lostWhy: Record<string, { n: number; v: number }> = {};
  lostJ.forEach((j) => { const k = j.lost_reason || "No reason given"; lostWhy[k] = lostWhy[k] ?? { n: 0, v: 0 }; lostWhy[k].n++; lostWhy[k].v += revenueOf(j); });
  const staleOut = jobs.filter((j) => j.status === "awaiting" && j.quoted_date && j.quoted_date <= new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10));
  const jobName = (id: string) => { const j = jobs.find((x) => x.id === id); return (j?.job_name && String(j.job_name).trim()) || j?.customer || "Job"; };

  async function setEstimate(f: any) {
    const v = await askText({ title: `Estimated cost — ${f.job_name || "job"}`, body: "What you expected this job to cost when you priced it (materials, labor, disposal, rentals).", placeholder: "e.g. 6,950", initial: f.estimated_cost ? String(f.estimated_cost) : "" });
    if (v == null) return;
    const n = Number(v.replace(/[$,\s]/g, ""));
    if (!isFinite(n) || n < 0) return showError("That isn't a number.");
    setBusy(f.job_id);
    const { error } = await supabase.from("jobs").update({ est_costs: n || null, updated_at: new Date().toISOString() }).eq("id", f.job_id);
    setBusy("");
    if (error) return showError("Couldn't save: " + error.message);
    showToast("Estimate saved"); load();
  }
  async function markLost(j: any, reason: string) {
    setBusy(j.id);
    const { error } = await supabase.from("jobs").update({ status: "lost", lost_reason: reason, lost_date: todayISO(), updated_at: new Date().toISOString() }).eq("id", j.id);
    setBusy("");
    if (error) return showError("Couldn't save: " + error.message);
    showToast("Marked lost"); load();
  }
  async function toggleBilled(c: any) {
    setBusy(c.id);
    const { error } = await supabase.from("change_orders").update({ billed: !c.billed, billed_at: c.billed ? null : todayISO(), updated_at: new Date().toISOString() }).eq("id", c.id);
    setBusy("");
    if (error) return showError("Couldn't save: " + error.message);
    showToast(c.billed ? "Marked not billed" : "Marked billed"); load();
  }

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
      case "unbilled":   return unbilled.sort((a, b) => Number(b.balance_due) - Number(a.balance_due));
      case "unlinked":   return [];
      default:           return [];
    }
  }

  const isOpen = (kind: string, key: string) => drill?.kind === kind && drill?.key === key;
  const toggle = (kind: "tile" | "type", key: string, label: string) =>
    setDrill(isOpen(kind, key) ? null : { kind, key, label });

  const tile = (key: string, label: string, value: string, sub: string, tone?: "ok" | "warn" | "bad") => (
    <Stat key={key} label={label} value={value} hint={sub} tone={tone}
      onClick={() => toggle("tile", key, label)}
      className={cn(isOpen("tile", key) && "border-white/60 ring-1 ring-white/30")} />
  );

  /* ---------- the drill-down list ---------- */
  function drillPanel() {
    if (!drill) return null;
    const jobs = drillJobs(drill);
    return (
      <Card className="border-white/25">
        <CardHeader>
          <CardTitle className="min-w-0 flex-1 truncate">
            {drill.label} <span className="font-normal text-neutral-400">— {jobs.length} job{jobs.length === 1 ? "" : "s"}</span>
          </CardTitle>
          <Button variant="ghost" size="icon-sm" onClick={() => setDrill(null)} aria-label="Close"><X size={16} /></Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {jobs.length === 0 ? (
            <p className="text-sm text-neutral-400">
              Nothing here yet — this figure comes from QuickBooks invoices with no job in the app.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {jobs.map((f) => (
                <a key={f.job_id} href={`/billing?job=${f.job_id}`}
                  className="block rounded-lg border border-border bg-neutral-950 px-3 py-2.5 transition-colors hover:border-white/25">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{f.job_name || "—"}</div>
                      <div className="truncate text-xs text-neutral-400">
                        {f.customer}{f.qbo_invoice_ref ? ` · QB ${f.qbo_invoice_ref}` : " · not invoiced"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold tabular-nums text-white">{fmt0(Number(f.contract_total))}</div>
                      <div className="text-xs tabular-nums text-neutral-400">
                        {Number(f.balance_due) > 0 ? `${fmt0(Number(f.balance_due))} owed` : "paid"}
                      </div>
                    </div>
                  </div>
                  {Number(f.actual_cost) > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-500">
                      <span>cost {fmt0(Number(f.actual_cost))}</span>
                      {Number(f.partner_share) > 0 ? <span className="text-amber-300/80">{f.partner} {fmt0(Number(f.partner_share))}</span> : null}
                      <span className="text-emerald-400/80">you keep {fmt0(Number(f.net_to_isola))}</span>
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-amber-300/70">no costs logged — margin not real</div>
                  )}
                </a>
              ))}
            </div>
          )}
          <p className="text-xs text-neutral-500">Tap a job to open it in Billing, where you can edit it.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="pb-28 space-y-5">
      <PageHeader className="mb-0" title="Reports" sub="Tap any number to see the jobs behind it" />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {tile("collected", "Collected", fmt0(totPaid), `${invoiced.length} invoiced jobs`, "ok")}
        {tile("owed", "Invoiced — owed", fmt0(owedReal), "billed, not paid", owedReal > 0 ? "warn" : undefined)}
        {tile("quoted", "Quoted pipeline", fmt0(quotedTotal), `${quoted.length} priced, no invoice`)}
        {tile("contracted", "Contracted", fmt0(totContract), `${priced.length} priced jobs`)}
        {/* ---- what's actually yours ---- */}
        {tile("keep", "You keep", fmt0(totKeep), `${withCosts.length} jobs with costs`, "ok")}
        {tile("partner", "To partners", fmt0(totPartner), "THM profit shares", totPartner > 0 ? "warn" : undefined)}
        {tile("unbilled", "Done, not billed", fmt0(unbilledTotal), `${unbilled.length} job${unbilled.length === 1 ? "" : "s"}${unbilledCOs.length ? ` + ${unbilledCOs.length} change order${unbilledCOs.length === 1 ? "" : "s"}` : ""}`, unbilledTotal > 0 ? "warn" : undefined)}
      </div>

      {drill?.kind === "tile" ? drillPanel() : null}

      <div className="grid gap-3 md:grid-cols-2">
        {withCosts.length ? (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-neutral-300">True margin</span>
                <span className="text-2xl font-semibold tabular-nums text-white">{trueMargin.toFixed(1)}%</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                What you keep, over what you billed, on the {withCosts.length} jobs that have real costs against them —
                after job costs and after the partner's share. Job-level margins read far higher; this is the one that pays you.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {qboAR > 0 ? (
          <Card>
            <CardHeader><CardTitle>Against QuickBooks</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-400">QuickBooks A/R</span>
                <span className="tabular-nums text-neutral-200">{fmt0(qboAR)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-400">Owed on jobs in this app</span>
                <span className="tabular-nums text-neutral-200">{fmt0(owedReal)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 text-sm">
                <span className="text-neutral-400">Invoiced with no job here</span>
                <span className="tabular-nums text-neutral-200">{fmt0(unlinkedAR)}</span>
              </div>
              <p className="text-xs leading-relaxed text-neutral-500">
                That last line is mostly the THM tab, which is a ledger rather than a job. If it grows,
                it means invoices are being raised in QuickBooks without a job here to carry the costs —
                which is exactly the work whose margin nobody can see.
              </p>
              {qbo?.updated_at ? (
                <p className="text-xs text-neutral-600">
                  QuickBooks figures as of {new Date(qbo.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* ---- data-quality reality check ---- */}
      {missing.length ? (
        <button onClick={() => toggle("tile", "missing", "Priced jobs with no costs")}
          className={cn("flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors",
            isOpen("tile", "missing") ? "border-amber-400 bg-amber-500/15" : "border-amber-500/40 bg-amber-500/10 hover:border-amber-400/70")}>
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-amber-300">
              {missing.length} priced job{missing.length === 1 ? "" : "s"} with no costs logged
            </div>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
              Those jobs show 100% margin because nothing has been spent against them in the app.
              Every margin below is computed from the {withCosts.length} job{withCosts.length === 1 ? "" : "s"} that
              do have costs. Tap to see which ones.
            </p>
          </div>
          <ChevronRight size={18} className="mt-0.5 shrink-0 text-amber-300/70" />
        </button>
      ) : null}

      {/* ---- where the money actually is ---- */}
      <section>
        <SectionTitle>Margin by work type</SectionTitle>
        <Card>
          <CardContent className="space-y-1 pt-3">
            {typeRows.length === 0 ? (
              <p className="py-2 text-sm text-neutral-500">Nothing to show until at least one job has costs logged against it.</p>
            ) : typeRows.map((r) => (
              <button key={r.type} onClick={() => toggle("type", r.type, r.type)}
                className={cn("w-full space-y-1.5 rounded-lg px-2 py-2 text-left transition-colors", isOpen("type", r.type) ? "bg-white/[0.07]" : "hover:bg-white/[0.04]")}>
                <div className="flex justify-between text-sm">
                  <span className="truncate text-neutral-200">{r.type} <span className="text-neutral-500">×{r.n}</span></span>
                  <span className={cn("font-semibold tabular-nums", r.margin < 20 ? "text-amber-300" : "text-emerald-400")}>{r.margin.toFixed(0)}%</span>
                </div>
                <Progress value={r.margin} tone={r.margin < 20 ? "warn" : "ok"} />
                <div className="text-xs text-neutral-500">{fmt0(r.rev)} billed · {fmt0(r.cost)} cost · {fmt0(r.rev - r.cost)} net</div>
              </button>
            ))}
          </CardContent>
        </Card>
      </section>

      {drill?.kind === "type" ? drillPanel() : null}

      <div className="grid gap-3 md:grid-cols-2">
        {/* ---- estimate vs actual ---- */}
        <Card>
          <CardHeader><CardTitle>Estimate vs actual</CardTitle></CardHeader>
          <CardContent className="space-y-0.5">
            {variance.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Fills in once a job has an estimated cost (from Build, or set below) and real costs logged.
                This is the one that tells you which work you underprice.
              </p>
            ) : variance.map((f) => {
              const v = Number(f.cost_variance_pct);
              return (
                <a key={f.job_id} href={`/billing?job=${f.job_id}`} className="flex min-h-[40px] items-center justify-between gap-2 rounded-md px-2 text-sm hover:bg-white/[0.04]">
                  <span className="truncate text-neutral-300">{f.job_name}</span>
                  <span className={cn("shrink-0 font-semibold tabular-nums", v > 10 ? "text-red-400" : v < -10 ? "text-emerald-400" : "text-neutral-300")}>
                    {v > 0 ? "+" : ""}{v}% {v > 0 ? "over" : "under"}
                    <span className="ml-1.5 font-normal text-neutral-500">{fmt0(Number(f.actual_cost))} / {fmt0(Number(f.estimated_cost))}</span>
                  </span>
                </a>
              );
            })}
            {noEstimate.length ? (
              <div className="mt-2 border-t border-border pt-2">
                <div className="px-2 pb-1 text-xs text-neutral-500">Costs logged, no estimate on file — add what you priced it at:</div>
                {noEstimate.map((f) => (
                  <div key={f.job_id} className="flex min-h-[40px] items-center justify-between gap-2 px-2 text-sm">
                    <span className="truncate text-neutral-400">{f.job_name} <span className="text-neutral-600">· {fmt0(Number(f.actual_cost))} spent</span></span>
                    <Button size="sm" variant="outline" disabled={busy === f.job_id} onClick={() => setEstimate(f)}>Set estimate</Button>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* ---- win rate ---- */}
        <Card>
          <CardHeader><CardTitle>Win rate by client type</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {Object.keys(byClient).length === 0 ? (
              <p className="text-sm text-neutral-500">Mark builds won or lost on the Build tab and this fills in.</p>
            ) : Object.entries(byClient).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="capitalize text-neutral-300">{k.replace("_", " ")}</span>
                <span className="tabular-nums text-neutral-200">{Math.round((v.won / v.total) * 100)}% <span className="text-neutral-500">({v.won}/{v.total})</span></span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* ---- win / loss, from the jobs (v6.9) ---- */}
        <Card>
          <CardHeader><CardTitle>Win / loss · last 6 months</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {wl === 0 ? (
              <p className="text-sm text-neutral-500">Fills in as proposals get booked or marked lost.</p>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-neutral-400">{wonJ.length} won · {lostJ.length} lost</span>
                  <span className="text-2xl font-semibold tabular-nums text-white">{Math.round((wonJ.length / wl) * 100)}%</span>
                </div>
                <div className="flex justify-between text-xs text-neutral-500">
                  <span>Won {fmt0(wonJ.reduce((s, j) => s + revenueOf(j), 0))}</span>
                  <span>Lost {fmt0(lostJ.reduce((s, j) => s + revenueOf(j), 0))}</span>
                </div>
                {Object.keys(lostWhy).length ? (
                  <div className="space-y-1.5 border-t border-border pt-2">
                    <div className="text-xs font-medium text-neutral-400">Why we lost</div>
                    {Object.entries(lostWhy).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => (
                      <div key={k} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className={k === "No reason given" ? "text-neutral-500" : "text-neutral-200"}>{k}</span>
                          <span className="tabular-nums text-neutral-400">{v.n} · {fmt0(v.v)}</span>
                        </div>
                        <Progress value={(v.n / lostJ.length) * 100} tone="plain" />
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
            {staleOut.length ? (
              <div className="space-y-1.5 border-t border-border pt-2">
                <div className="text-xs font-medium text-amber-300/90">Out 3+ weeks — still alive?</div>
                {staleOut.map((j) => (
                  <div key={j.id} className="flex min-h-[40px] items-center justify-between gap-2 text-sm">
                    <a href={`/jobs/${j.id}`} className="min-w-0 truncate text-neutral-300 hover:underline">{j.job_name || j.customer} <span className="text-neutral-500">· sent {fmtDate(j.quoted_date)}</span></a>
                    <select disabled={busy === j.id} defaultValue="" onChange={(e) => e.target.value && markLost(j, e.target.value)}
                      className="h-9 shrink-0 rounded-md border border-border bg-neutral-950 px-2 text-xs text-neutral-300">
                      <option value="">Still waiting</option>
                      {LOST_REASONS.map((r) => <option key={r} value={r}>Lost — {r}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* ---- change orders (v6.9) ---- */}
        <Card>
          <CardHeader><CardTitle>Change orders</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {cos.length === 0 ? (
              <p className="text-sm text-neutral-500">None yet. Added scope gets a written change order on the job's Billing page — it shows up here so it never slips off the invoice.</p>
            ) : (
              <>
                <div className="flex justify-between pb-1 text-xs text-neutral-500">
                  <span>Approved {fmt0(cos.filter((c) => c.status === "approved").reduce((s, c) => s + Number(c.amount || 0), 0))}</span>
                  <span className={unbilledCOs.length ? "text-amber-300" : ""}>{unbilledCOs.length ? `${fmt0(unbilledCOs.reduce((s, c) => s + Number(c.amount || 0), 0))} not billed` : "all billed"}</span>
                </div>
                {cos.map((c) => (
                  <div key={c.id} className="flex min-h-[44px] items-center justify-between gap-2 rounded-md px-1 text-sm">
                    <a href={`/billing?job=${c.job_id}`} className="min-w-0 hover:underline">
                      <div className="truncate text-neutral-200"><FileDiff size={13} className="mr-1 inline text-neutral-500" />CO #{c.co_number} · {c.title}</div>
                      <div className="truncate text-xs text-neutral-500">{jobName(c.job_id)} · {c.status}</div>
                    </a>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-white">{fmt0(Number(c.amount || 0))}</span>
                      {c.status === "approved" ? (
                        <Button size="sm" variant={c.billed ? "ghost" : "outline"} disabled={busy === c.id} onClick={() => toggleBilled(c)}
                          className={cn(!c.billed && "border-amber-500/50 text-amber-200")}>
                          {c.billed ? <><Check size={14} /> Billed</> : "Mark billed"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        One caveat worth holding onto: even "you keep" is job-level. Truck, insurance, phone, fuel
        between jobs and your own unbilled hours aren't in here. Real business profit is lower.
      </p>
    </div>
  );
}
