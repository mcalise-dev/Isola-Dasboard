"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, firstError } from "@/lib/load";
import { fmtDate, revenueOf, todayISO } from "@/lib/format";
import { parsePayModel, overheadMonthly, PAY_KEY } from "@/lib/pay";
import { parseJSON } from "@/lib/settings";
import { PageHeader, SectionTitle, Stat, ListSkeleton, LoadError } from "@/components/ui/bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Field } from "@/components/ui/input";
import { Segmented } from "@/components/ui/tabs";
import { showError, showToast } from "@/components/Toaster";
import { cn } from "@/lib/utils";
import { AlertTriangle, Plus, X } from "lucide-react";

/* ============================================================
   13-WEEK CASH FLOW (v6.9, 10/22/26) — will there be money in the
   bank each week for the next quarter?

   MONEY IN
   - Open QuickBooks invoices, on their due date (overdue → this week).
   - Finished jobs not invoiced yet + approved change orders not billed
     → assumed billed now, paid in ~3 weeks.
   - Booked / in-progress fixed-price work → what's left on the contract,
     ~30 days after the start date. No start date = listed below, NOT guessed.
   - Optional: proposals out, weighted by a % Mike picks (~45 days out).
   MONEY OUT
   - Fixed overhead from the pay model (Money → My pay), monthly × 12 ÷ 52.
   - Crew labor already logged and unpaid → this week.
   - Crew on the calendar (schedule_entries.assignees) × day rate or 8 hrs.
   - Anything else Mike adds by hand (snow, THM settlements, truck repair).
   THM-held jobs count only Mike's cut (revenueOf). Fuel sits in overhead,
   so job-logged fuel isn't counted twice.
   Settings live in app_settings key "cash_flow".
   ============================================================ */

const CF_KEY = "cash_flow";
type CashItem = { id: string; week: string; label: string; amount: number; dir: "in" | "out" };
type CashCfg = { starting_cash: number | null; as_of: string | null; pipeline_pct: number; items: CashItem[] };
const DEFAULT_CFG: CashCfg = { starting_cash: null, as_of: null, pipeline_pct: 0, items: [] };

const f0 = (n: number) => (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseISO = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s: string, n: number) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const mondayOf = (s: string) => { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const short = (s: string) => parseISO(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const nameOf = (j: any) => (j?.job_name && String(j.job_name).trim()) || j?.customer || "Untitled job";
const num = (s: string) => Number(String(s).replace(/[$,\s]/g, ""));

export default function CashFlowTab() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cfg, setCfg] = useState<CashCfg>(DEFAULT_CFG);
  const [bankIn, setBankIn] = useState("");
  const [draft, setDraft] = useState({ label: "", amount: "", week: "", dir: "out" as "in" | "out" });

  async function load() {
    setErr(null);
    try {
      const today = todayISO();
      const r = await withTimeout(Promise.all([
        supabase.from("jobs").select("id,job_name,customer,status,price,price_amount,contract_holder,isola_cut,billing_type,start_date,completed_date,invoiced_date,paid_date,paid_amount,qbo_invoice_ref"),
        supabase.from("payments").select("job_id,amount"),
        supabase.from("change_orders").select("job_id,amount,status,billed"),
        supabase.from("job_costs").select("category,amount,paid"),
        supabase.from("schedule_entries").select("entry_date,assignees,assignee").gt("entry_date", today).lte("entry_date", addDays(today, 95)),
        supabase.from("workers").select("name,rate,rate_type,is_owner,is_thm"),
        supabase.from("money_snapshot").select("data,updated_at").eq("id", 1).maybeSingle(),
        supabase.from("app_settings").select("key,value").in("key", [PAY_KEY, CF_KEY]),
      ]));
      const bad = firstError(...r);
      if (bad) throw new Error(bad);
      const [j, p, co, c, s, w, m, set] = r;
      const settings = Object.fromEntries((set.data ?? []).map((x: any) => [x.key, x.value]));
      const c0 = { ...DEFAULT_CFG, ...parseJSON<CashCfg>(settings[CF_KEY], DEFAULT_CFG) };
      setCfg(c0);
      setBankIn(c0.starting_cash == null ? "" : String(c0.starting_cash));
      setData({ jobs: j.data ?? [], pays: p.data ?? [], cos: co.data ?? [], costs: c.data ?? [], sched: s.data ?? [], workers: w.data ?? [], snap: m.data ?? null, payRaw: settings[PAY_KEY] ?? null });
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function saveCfg(next: CashCfg, note?: string) {
    const prev = cfg;
    setCfg(next);
    const { error } = await supabase.from("app_settings").upsert({ key: CF_KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) { setCfg(prev); showError("Couldn't save: " + error.message); return; }
    if (note) showToast(note);
  }

  const header = <PageHeader title="Cash flow" sub="Next 13 weeks — money in, money out, what's left in the bank" />;
  if (err) return <div className="pb-28">{header}<LoadError message={err} onRetry={load} /></div>;
  if (!data) return <div className="pb-28">{header}<ListSkeleton rows={5} /></div>;

  const today = todayISO();
  const w0 = mondayOf(today);
  const weeks = Array.from({ length: 13 }, (_, i) => addDays(w0, i * 7));
  const idx = (d?: string | null) => {
    if (!d) return -1;
    if (d < w0) return 0;
    const k = Math.floor((parseISO(d).getTime() - parseISO(w0).getTime()) / (7 * 86400000));
    return k >= 0 && k < 13 ? k : -1;
  };
  const blank = () => Array(13).fill(0) as number[];

  const paid = new Map<string, number>();
  for (const p of data.pays) paid.set(p.job_id, (paid.get(p.job_id) ?? 0) + (Number(p.amount) || 0));
  const coOk = new Map<string, number>();
  for (const c of data.cos) if (c.status === "approved") coOk.set(c.job_id, (coOk.get(c.job_id) ?? 0) + (Number(c.amount) || 0));
  const remaining = (j: any) => {
    if (j.contract_holder === "thm") return j.paid_date ? 0 : revenueOf(j);
    return Math.max(0, revenueOf(j) + (coOk.get(j.id) ?? 0) - (paid.get(j.id) ?? 0) - (j.paid_date && !paid.has(j.id) ? Number(j.paid_amount) || revenueOf(j) : 0));
  };

  // IN — QuickBooks invoices (minus anything since marked collected in the app)
  const paidRefs = new Set(data.jobs.filter((j: any) => j.paid_date && j.qbo_invoice_ref).map((j: any) => j.qbo_invoice_ref));
  const invoices: any[] = (data.snap?.data?.invoices ?? []).filter((i: any) => !(i.ref && paidRefs.has(i.ref)));
  const ar = blank();
  for (const i of invoices) { const k = idx(i.due); if (k >= 0) ar[k] += Number(i.amount) || 0; }

  // IN — done but never invoiced, plus approved COs not billed
  const unbilledJobs = data.jobs.filter((j: any) => j.status === "complete" && !j.invoiced_date && !j.qbo_invoice_ref && !j.paid_date);
  const unbilledCOs = data.cos.filter((c: any) => c.status === "approved" && !c.billed);
  const ub = blank();
  const ubWeek = idx(addDays(today, 21));
  for (const j of unbilledJobs) ub[ubWeek] += remaining(j);
  for (const c of unbilledCOs) ub[ubWeek] += Number(c.amount) || 0;

  // IN — booked work
  const undated: { label: string; amount: number; why: string }[] = [];
  const bk = blank();
  for (const j of data.jobs.filter((x: any) => (x.status === "booked" || x.status === "progress") && x.billing_type !== "tm")) {
    const rem = remaining(j); if (rem <= 0) continue;
    if (!j.start_date) { undated.push({ label: nameOf(j), amount: rem, why: "no start date" }); continue; }
    const k = idx(addDays(j.start_date, 30));
    if (k >= 0) bk[k] += rem; else undated.push({ label: nameOf(j), amount: rem, why: "lands past 13 weeks" });
  }

  // IN — proposals out (optional)
  const pp = blank();
  const awaiting = data.jobs.filter((j: any) => j.status === "awaiting");
  if (cfg.pipeline_pct > 0) { const k = idx(addDays(today, 45)); for (const j of awaiting) pp[k] += (revenueOf(j) * cfg.pipeline_pct) / 100; }

  // OUT
  const pm = parsePayModel(data.payRaw);
  const ohMonthly = overheadMonthly(pm);
  const weeklyOH = (ohMonthly * 12) / 52;
  const oh = blank().map(() => weeklyOH);
  const crewOwed = blank();
  crewOwed[0] = data.costs.filter((c: any) => String(c.category ?? "").toLowerCase().startsWith("labor") && c.paid === false).reduce((a: number, c: any) => a + (Number(c.amount) || 0), 0);
  const dayCost = (n: string) => {
    const w = data.workers.find((x: any) => String(x.name ?? "").toLowerCase() === String(n).toLowerCase());
    if (!w || w.is_owner || w.is_thm || !w.rate) return 0;
    return w.rate_type === "daily" ? Number(w.rate) : Number(w.rate) * 8;
  };
  const crewSched = blank();
  for (const s of data.sched) {
    const names: string[] = Array.isArray(s.assignees) && s.assignees.length ? s.assignees : s.assignee ? [s.assignee] : [];
    const k = idx(s.entry_date); if (k < 0) continue;
    for (const n of names) crewSched[k] += dayCost(n);
  }
  const manIn = blank(), manOut = blank();
  for (const it of cfg.items) { const k = idx(it.week); if (k >= 0) (it.dir === "in" ? manIn : manOut)[k] += Number(it.amount) || 0; }

  type Line = { label: string; note?: string; vals: number[] };
  const ins: Line[] = [
    { label: "QuickBooks invoices", note: "on due date · overdue lands this week", vals: ar },
    { label: "Done, not billed", note: "billed now, paid ~3 wks", vals: ub },
    { label: "Booked work", note: "rest of contract ~30 days after start", vals: bk },
    ...(cfg.pipeline_pct > 0 ? [{ label: `Proposals × ${cfg.pipeline_pct}%`, note: "~45 days out", vals: pp }] : []),
    ...(cfg.items.some((i) => i.dir === "in") ? [{ label: "Other in", vals: manIn }] : []),
  ];
  const outs: Line[] = [
    { label: "Fixed overhead", note: `${f0(ohMonthly)}/mo from My pay`, vals: oh },
    { label: "Crew owed", note: "labor logged, not paid", vals: crewOwed },
    { label: "Crew on the calendar", note: "day rate or 8 hrs × hourly", vals: crewSched },
    ...(cfg.items.some((i) => i.dir === "out") ? [{ label: "Other out", vals: manOut }] : []),
  ];
  const sumCol = (ls: Line[]) => weeks.map((_, k) => ls.reduce((a, l) => a + l.vals[k], 0));
  const totIn = sumCol(ins), totOut = sumCol(outs);
  const net = weeks.map((_, k) => totIn[k] - totOut[k]);
  const start = cfg.starting_cash;
  const bal: number[] = [];
  if (start != null) net.forEach((n, k) => bal.push((k ? bal[k - 1] : start) + n));
  const low = bal.length ? Math.min(...bal) : null;
  const lowK = low == null ? -1 : bal.indexOf(low);
  const lowTone: "ok" | "warn" | "bad" | undefined = low == null ? undefined : low < 0 ? "bad" : low < weeklyOH * 4 ? "warn" : "ok";
  const maxBar = Math.max(1, ...totIn, ...totOut);
  const totalIn = totIn.reduce((a, b) => a + b, 0), totalOut = totOut.reduce((a, b) => a + b, 0);
  const stale = cfg.as_of && cfg.as_of < addDays(today, -7);

  return (
    <div className="pb-28 space-y-5">
      {header}

      <Card>
        <CardContent className="grid gap-3 pt-4 md:grid-cols-[1fr_auto] md:items-end">
          <Field label="Cash in the bank today">
            <div className="flex gap-2">
              <Input inputMode="decimal" value={bankIn} onChange={(e) => setBankIn(e.target.value)} placeholder="e.g. 18,500" className="tabular-nums" />
              <Button variant="outline" onClick={() => {
                const v = bankIn.trim() === "" ? null : num(bankIn);
                if (v != null && !isFinite(v)) return showError("That isn't a number.");
                saveCfg({ ...cfg, starting_cash: v, as_of: today }, "Bank balance saved");
              }}>Save</Button>
            </div>
          </Field>
          <Field label="Count proposals out at">
            <Segmented value={String(cfg.pipeline_pct)} onChange={(v) => saveCfg({ ...cfg, pipeline_pct: Number(v) })}
              options={[{ value: "0", label: "0%" }, { value: "25", label: "25%" }, { value: "50", label: "50%" }, { value: "75", label: "75%" }]} />
          </Field>
          {cfg.as_of ? <p className={cn("text-xs md:col-span-2", stale ? "text-amber-300" : "text-neutral-500")}>Bank balance entered {fmtDate(cfg.as_of)}{stale ? " — over a week old, update it." : ""}</p> : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Coming in · 13 wks" value={f0(totalIn)} tone="ok" />
        <Stat label="Going out · 13 wks" value={f0(totalOut)} />
        <Stat label="Net" value={f0(totalIn - totalOut)} tone={totalIn - totalOut < 0 ? "bad" : undefined} />
        <Stat label="Lowest week" value={low == null ? "—" : f0(low)} tone={lowTone} hint={low == null ? "Enter your bank balance" : `week of ${short(weeks[lowK])}`} />
      </div>

      {low != null && lowTone !== "ok" ? (
        <div className={cn("flex items-start gap-3 rounded-xl border p-4", low < 0 ? "border-red-500/40 bg-red-500/10" : "border-amber-500/40 bg-amber-500/10")}>
          <AlertTriangle size={18} className={cn("mt-0.5 shrink-0", low < 0 ? "text-red-300" : "text-amber-300")} />
          <p className="text-sm text-neutral-200">
            {low < 0
              ? <>You'd be <b>{f0(-low)}</b> short the week of {short(weeks[lowK])}. Chase the open invoices, bill the finished work, or push a payment.</>
              : <>The week of {short(weeks[lowK])} drops to {f0(low)} — under a month of overhead ({f0(weeklyOH * 4)}).</>}
          </p>
        </div>
      ) : null}

      <section>
        <SectionTitle>Week by week</SectionTitle>
        <Card>
          <CardContent className="pt-4">
            <div className="flex h-32 items-end gap-1">
              {weeks.map((w, k) => (
                <div key={w} className="flex h-full flex-1 items-end gap-px" title={`${short(w)} · in ${f0(totIn[k])} · out ${f0(totOut[k])}`}>
                  <div className="flex-1 rounded-t bg-emerald-400/80" style={{ height: `${(totIn[k] / maxBar) * 100}%` }} />
                  <div className="flex-1 rounded-t bg-neutral-500/70" style={{ height: `${(totOut[k] / maxBar) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1">{weeks.map((w, k) => <div key={w} className="flex-1 text-center text-[10px] text-neutral-500">{k % 3 === 0 ? short(w) : ""}</div>)}</div>
            <div className="mt-2 flex gap-4 text-xs text-neutral-400">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400/80" />In</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-neutral-500/70" />Out</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-max min-w-full text-xs tabular-nums">
          <thead>
            <tr className="text-neutral-500">
              <th className="sticky left-0 z-10 min-w-[10.5rem] bg-card px-3 py-2 text-left font-semibold">Week of</th>
              {weeks.map((w) => <th key={w} className="whitespace-nowrap px-2.5 py-2 text-right font-semibold">{short(w)}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              ...ins.map((l) => ({ ...l, kind: "row" })), { label: "Total in", vals: totIn, kind: "total" },
              ...outs.map((l) => ({ ...l, kind: "row" })), { label: "Total out", vals: totOut, kind: "total" },
            ].map((l: any) => (
              <tr key={l.label} className={l.kind === "total" ? "border-t border-border font-semibold text-white" : "text-neutral-300"}>
                <td className="sticky left-0 z-10 bg-card px-3 py-1.5">{l.label}{l.note ? <div className="text-[10px] font-normal text-neutral-500">{l.note}</div> : null}</td>
                {l.vals.map((v: number, k: number) => <td key={k} className={cn("px-2.5 py-1.5 text-right", !v && "text-neutral-700")}>{v ? f0(v) : "–"}</td>)}
              </tr>
            ))}
            <tr className="border-t border-border font-semibold">
              <td className="sticky left-0 z-10 bg-card px-3 py-1.5 text-white">Net</td>
              {net.map((v, k) => <td key={k} className={cn("px-2.5 py-1.5 text-right", v < 0 ? "text-red-300" : "text-emerald-300")}>{f0(v)}</td>)}
            </tr>
            {bal.length ? (
              <tr className="font-semibold">
                <td className="sticky left-0 z-10 bg-card px-3 py-1.5 text-white">Bank balance</td>
                {bal.map((v, k) => <td key={k} className={cn("px-2.5 py-1.5 text-right", k === lowK && "bg-white/[0.06]", v < 0 ? "text-red-300" : "text-white")}>{f0(v)}</td>)}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {undated.length ? (
        <section>
          <SectionTitle>Booked work not in the forecast</SectionTitle>
          <Card>
            <CardContent className="space-y-1 pt-3">
              {undated.map((u) => (
                <div key={u.label} className="flex min-h-[40px] items-center justify-between gap-3 text-sm">
                  <span className="truncate text-neutral-300">{u.label} <span className="text-neutral-500">· {u.why}</span></span>
                  <span className="shrink-0 tabular-nums text-neutral-400">{f0(u.amount)}</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-neutral-500">Give these a start date on the job and they'll drop into the right week.</p>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Other money in / out</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {cfg.items.length ? (
            <div className="space-y-1">
              {cfg.items.map((it) => (
                <div key={it.id} className="flex min-h-[40px] items-center gap-2 text-sm">
                  <span className={cn("w-8 text-xs font-semibold", it.dir === "in" ? "text-emerald-300" : "text-neutral-400")}>{it.dir === "in" ? "IN" : "OUT"}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-200">{it.label} <span className="text-xs text-neutral-500">· wk of {short(it.week)}</span></span>
                  <span className="tabular-nums text-white">{f0(it.amount)}</span>
                  <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => saveCfg({ ...cfg, items: cfg.items.filter((x) => x.id !== it.id) }, "Removed")}><X size={15} /></Button>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-neutral-500">Snow money, a THM settlement, a loan payment, a truck repair — anything the app can't see.</p>}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-[2fr_1fr_1fr_auto_auto]">
            <Input className="col-span-2 md:col-span-1" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="What" />
            <Input inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="Amount" />
            <NativeSelect value={draft.week || weeks[0]} onChange={(e) => setDraft({ ...draft, week: e.target.value })}>
              {weeks.map((w) => <option key={w} value={w}>Wk of {short(w)}</option>)}
            </NativeSelect>
            <Segmented value={draft.dir} onChange={(v) => setDraft({ ...draft, dir: v })} options={[{ value: "in", label: "In" }, { value: "out", label: "Out" }]} />
            <Button onClick={() => {
              const amt = num(draft.amount);
              if (!draft.label.trim()) return showError("Say what it is.");
              if (!amt || !isFinite(amt)) return showError("Enter an amount.");
              saveCfg({ ...cfg, items: [...cfg.items, { id: String(Date.now()), label: draft.label.trim(), amount: amt, week: draft.week || weeks[0], dir: draft.dir }] }, "Added");
              setDraft({ label: "", amount: "", week: "", dir: draft.dir });
            }}><Plus size={16} /> Add</Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs leading-relaxed text-neutral-500">
        Fixed overhead comes from Money → My pay. THM-held jobs count only your cut. T&amp;M jobs aren't
        forecast — add the expected invoice under "Other money in" if you want it counted.
      </p>
    </div>
  );
}
