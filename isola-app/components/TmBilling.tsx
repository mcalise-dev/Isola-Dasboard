"use client";
// Time & Materials billing.
//   Labor bill  = hours × bill rate (job_pay_rates.bill_rate for that person on that job,
//                 else the job's default jobs.tm_bill_rate). Lines with no hours bill at cost.
//   Materials   = every non-labor cost × (1 + jobs.materials_markup%). Markup is 5/10/15/20/25.
//   Cost side   = what's actually paid out (job_costs.amount), so margin is real.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { money, jobLabel } from "@/lib/format";
import { showError, showToast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader, Stat, Empty, ListSkeleton } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";

export const MARKUPS = [5, 10, 15, 20, 25];
const num = (v: any) => (v == null || v === "" ? null : Number(v));

type Data = { job: any; costs: any[]; rates: any[]; workers: any[] };

export function computeBill({ job, costs, rates, workers }: Data) {
  const wByName = (n: string | null) => workers.find((w) => w.name.toLowerCase() === String(n ?? "").trim().toLowerCase());
  const defBill = num(job.tm_bill_rate);
  const markup = num(job.materials_markup);
  const labor = costs.filter((c) => c.category === "Labor");
  const other = costs.filter((c) => c.category !== "Labor");
  const people = new Map<string, { name: string; worker: any; hours: number; cost: number; bill: number; billRate: number | null; payRate: number | null; lump: number }>();
  let missingRate = false;
  for (const c of labor) {
    const name = (c.worker || c.vendor || "Unnamed").trim();
    const w = wByName(name);
    const jr = w ? rates.find((r) => r.worker_id === w.id) : null;
    const br = num(jr?.bill_rate) ?? defBill;
    const hrs = num(c.hours);
    const p = people.get(name) ?? { name, worker: w, hours: 0, cost: 0, bill: 0, billRate: br, payRate: jr ? num(jr.rate) : num(w?.rate), lump: 0 };
    p.cost += Number(c.amount || 0);
    if (hrs != null && hrs > 0) {
      p.hours += hrs;
      if (br == null) missingRate = true; else p.bill += Math.round(hrs * br * 100) / 100;
    } else { p.lump += Number(c.amount || 0); p.bill += Number(c.amount || 0); } // no hours: billed at cost
    people.set(name, p);
  }
  const laborCost = labor.reduce((a, c) => a + Number(c.amount || 0), 0);
  const laborBill = [...people.values()].reduce((a, p) => a + p.bill, 0);
  const matCost = other.reduce((a, c) => a + Number(c.amount || 0), 0);
  const matBill = Math.round(matCost * (1 + (markup ?? 0) / 100) * 100) / 100;
  const total = laborBill + matBill;
  const cost = laborCost + matCost;
  return { people: [...people.values()], laborCost, laborBill, matCost, matBill, markup, total, cost, margin: total - cost, missingRate, other };
}

// One job's T&M bill. Used on the job page Money tab and inside the T&M Billing tab.
export function TmJobBill({ jobId, compact, onChanged }: { jobId: string; compact?: boolean; onChanged?: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const [d, setD] = useState<Data | null>(null);
  const [rateIn, setRateIn] = useState<Record<string, string>>({});
  const [defIn, setDefIn] = useState<string | null>(null);

  async function load() {
    const [j, c, r, w] = await Promise.all([
      sb.from("jobs").select("id,job_name,customer,location,job,status,billing_type,tm_bill_rate,materials_markup").eq("id", jobId).single(),
      sb.from("job_costs").select("id,entry_date,category,worker,vendor,hours,rate,amount,notes").eq("job_id", jobId).order("entry_date"),
      sb.from("job_pay_rates").select("*").eq("job_id", jobId),
      sb.from("workers").select("id,name,rate,rate_type,is_owner"),
    ]);
    if (j.error) { showError("Couldn't load job: " + j.error.message); return; }
    setD({ job: j.data, costs: c.data ?? [], rates: r.data ?? [], workers: w.data ?? [] });
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);

  async function setJob(patch: Record<string, any>) {
    const { error } = await sb.from("jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);
    if (error) { showError("Save failed: " + error.message); return; }
    await load(); onChanged?.();
  }
  async function saveBillRate(p: any, raw: string) {
    const v = num(String(raw).replace(/[^0-9.]/g, ""));
    if (!p.worker) { showError(`${p.name} isn't on the crew list, so a bill rate can't be saved for them.`); return; }
    const existing = d!.rates.find((r) => r.worker_id === p.worker.id);
    const row = existing
      ? { ...existing, bill_rate: v, updated_at: new Date().toISOString() }
      : { job_id: jobId, worker_id: p.worker.id, rate: num(p.worker.rate) ?? 0, rate_type: p.worker.rate_type ?? "hourly", bill_rate: v };
    const { error } = await sb.from("job_pay_rates").upsert(row, { onConflict: "job_id,worker_id" });
    if (error) { showError("Save failed: " + error.message); return; }
    showToast(`${p.name} billed at ${v == null ? "the job rate" : "$" + v + "/hr"}`);
    setRateIn((s) => { const n = { ...s }; delete n[p.name]; return n; });
    await load(); onChanged?.();
  }

  if (!d) return <ListSkeleton rows={2} />;
  const { job } = d;

  if (job.billing_type !== "tm") {
    return compact ? null : (
      <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm">
        <span className="text-neutral-400">Fixed-price job.</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setJob({ billing_type: "tm" })}>Bill as T&amp;M</Button>
      </div>
    );
  }

  const b = computeBill(d);
  return (
    <div className="rounded-xl border border-border bg-card">
      {!compact ? (
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Clock size={16} className="text-neutral-500" />
          <span className="text-[15px] font-semibold text-white">Time &amp; materials bill</span>
          <button onClick={() => setJob({ billing_type: "fixed" })} className="ml-auto text-[11px] text-neutral-500 underline">switch to fixed price</button>
        </div>
      ) : null}

      <div className="space-y-4 px-4 py-3">
        {/* settings */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            Bill rate
            <Input inputMode="decimal" className="h-8 w-20" placeholder="$/hr"
              value={defIn ?? String(job.tm_bill_rate ?? "")}
              onChange={(e) => setDefIn(e.target.value)}
              onBlur={() => { if (defIn != null) { const v = num(defIn.replace(/[^0-9.]/g, "")); setDefIn(null); if (v !== num(job.tm_bill_rate)) setJob({ tm_bill_rate: v }); } }} />
            /hr
          </label>
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            Materials markup
            {MARKUPS.map((m) => (
              <button key={m} onClick={() => setJob({ materials_markup: m })}
                className={cn("rounded-md border px-2 py-1 text-xs font-semibold tabular-nums",
                  b.markup === m ? "border-white bg-white text-neutral-900" : "border-white/15 text-neutral-300 hover:border-white/30")}>{m}%</button>
            ))}
            {b.markup == null ? <Badge variant="warning">pick one</Badge> : null}
          </div>
        </div>

        {/* labor */}
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-neutral-500">Labor</div>
          {b.people.length === 0 ? <p className="text-xs text-neutral-500">No labor logged yet.</p> : (
            <div className="space-y-1">
              {b.people.map((p) => (
                <div key={p.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="w-20 truncate font-medium text-white">{p.name}</span>
                  <span className="text-xs text-neutral-400 tabular-nums">{p.hours ? `${p.hours}h` : ""}{p.lump ? `${p.hours ? " + " : ""}${money(p.lump)} lump at cost` : ""}</span>
                  <span className="text-xs text-neutral-500">pay {p.payRate != null ? `$${p.payRate}` : "—"} · bill</span>
                  <Input inputMode="decimal" className="h-7 w-16 text-xs" placeholder="$/hr"
                    value={rateIn[p.name] ?? String(p.billRate ?? "")}
                    onChange={(e) => setRateIn((s) => ({ ...s, [p.name]: e.target.value }))}
                    onBlur={() => { if (rateIn[p.name] != null && num(rateIn[p.name]) !== p.billRate) saveBillRate(p, rateIn[p.name]); }} />
                  <span className="ml-auto tabular-nums text-neutral-200">{money(p.bill)}</span>
                </div>
              ))}
              {b.missingRate ? <p className="text-xs text-amber-300">Some hours have no bill rate. Set the job's bill rate above.</p> : null}
            </div>
          )}
        </div>

        {/* materials */}
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-neutral-500">Materials &amp; other costs</div>
          {b.other.length === 0 ? <p className="text-xs text-neutral-500">None logged yet.</p> : (
            <div className="flex items-center text-sm">
              <span className="text-neutral-400">{b.other.length} item{b.other.length === 1 ? "" : "s"} · cost {money(b.matCost)}{b.markup ? ` + ${b.markup}%` : ""}</span>
              <span className="ml-auto tabular-nums text-neutral-200">{money(b.matBill)}</span>
            </div>
          )}
        </div>

        {/* totals */}
        <div className="border-t border-border pt-3">
          <div className="flex items-baseline">
            <span className="text-sm font-semibold text-white">Bill so far</span>
            <span className="ml-auto text-xl font-semibold tabular-nums text-white">{money(b.total)}</span>
          </div>
          <div className="mt-0.5 flex text-xs text-neutral-500">
            <span>Your cost {money(b.cost)}</span>
            <span className={cn("ml-auto tabular-nums", b.margin >= 0 ? "text-emerald-300" : "text-red-300")}>margin {money(b.margin)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Money > T&M billing: every T&M job and what it will bill.
export default function TmBillingTab() {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<{ job: any; bill: ReturnType<typeof computeBill> }[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [others, setOthers] = useState<any[]>([]);
  const [addId, setAddId] = useState("");

  async function load() {
    const [j, w] = await Promise.all([
      sb.from("jobs").select("id,job_name,customer,location,job,status,billing_type,tm_bill_rate,materials_markup,invoiced_date,paid_date").order("job_name"),
      sb.from("workers").select("id,name,rate,rate_type,is_owner"),
    ]);
    if (j.error) { showError("Couldn't load: " + j.error.message); setRows([]); return; }
    const tm = (j.data ?? []).filter((x: any) => x.billing_type === "tm");
    setOthers((j.data ?? []).filter((x: any) => x.billing_type !== "tm" && ["progress", "booked", "awaiting", "complete"].includes(x.status)));
    const ids = tm.map((x: any) => x.id);
    const [c, r] = ids.length ? await Promise.all([
      sb.from("job_costs").select("id,job_id,entry_date,category,worker,vendor,hours,rate,amount,notes").in("job_id", ids),
      sb.from("job_pay_rates").select("*").in("job_id", ids),
    ]) : [{ data: [] }, { data: [] }] as any;
    setRows(tm.map((job: any) => ({
      job,
      bill: computeBill({ job, costs: (c.data ?? []).filter((x: any) => x.job_id === job.id), rates: (r.data ?? []).filter((x: any) => x.job_id === job.id), workers: w.data ?? [] }),
    })));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function markupAll(m: number) {
    if (!rows?.length) return;
    if (!confirm(`Set materials markup to ${m}% on all ${rows.length} T&M job${rows.length === 1 ? "" : "s"}?`)) return;
    const { error } = await sb.from("jobs").update({ materials_markup: m, updated_at: new Date().toISOString() }).in("id", rows.map((x) => x.job.id));
    if (error) { showError("Save failed: " + error.message); return; }
    showToast(`Markup ${m}% on every T&M job`); load();
  }
  async function addJob() {
    if (!addId) return;
    const { error } = await sb.from("jobs").update({ billing_type: "tm", updated_at: new Date().toISOString() }).eq("id", addId);
    if (error) { showError("Save failed: " + error.message); return; }
    setAddId(""); load();
  }

  const open_ = (rows ?? []).filter((x) => !x.job.invoiced_date && !x.job.paid_date);
  const toBill = open_.reduce((a, x) => a + x.bill.total, 0);
  const margin = open_.reduce((a, x) => a + x.bill.margin, 0);

  return (
    <div>
      <PageHeader title="T&M billing" sub="Hours at your bill rate plus materials with markup, for every time-and-materials job" />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="To bill (not invoiced)" value={rows ? money(toBill) : "—"} hint={`${open_.length} job${open_.length === 1 ? "" : "s"}`} />
        <Stat label="Margin on that" value={rows ? money(margin) : "—"} tone={margin >= 0 ? "ok" : "bad"} />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
        Set markup on every T&amp;M job:
        {MARKUPS.map((m) => <button key={m} onClick={() => markupAll(m)} className="rounded-md border border-white/15 px-2 py-1 font-semibold text-neutral-300 hover:border-white/30">{m}%</button>)}
      </div>

      {rows === null ? <ListSkeleton /> : rows.length === 0 ? (
        <Empty icon={<Clock size={28} />} title="No T&M jobs yet" body="Add a job below, or open any job's Money tab and tap Bill as T&M." />
      ) : (
        <div className="space-y-2.5">
          {rows.map(({ job, bill }) => {
            const isOpen = open[job.id] ?? rows.length <= 3;
            return (
              <div key={job.id} className="rounded-xl border border-border">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => setOpen((s) => ({ ...s, [job.id]: !isOpen }))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {isOpen ? <ChevronDown size={16} className="text-neutral-500" /> : <ChevronRight size={16} className="text-neutral-500" />}
                    <span className="truncate font-semibold text-white">{jobLabel(job)}</span>
                    {job.invoiced_date ? <Badge variant="muted">invoiced</Badge> : null}
                    {bill.markup == null ? <Badge variant="warning">pick markup</Badge> : null}
                  </button>
                  <Link href={`/jobs/${job.id}`} className="text-xs text-neutral-500 underline">job</Link>
                  <span className="text-lg font-semibold tabular-nums text-white">{money(bill.total)}</span>
                </div>
                {isOpen ? <div className="border-t border-border p-2"><TmJobBill jobId={job.id} compact onChanged={load} /></div> : null}
              </div>
            );
          })}
        </div>
      )}

      {others.length ? (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <select value={addId} onChange={(e) => setAddId(e.target.value)} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm text-white">
            <option value="">Make another job T&amp;M…</option>
            {others.map((j) => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={addJob} disabled={!addId}>Add</Button>
        </div>
      ) : null}
    </div>
  );
}
