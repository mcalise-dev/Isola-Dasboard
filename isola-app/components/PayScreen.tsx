"use client";
// v52 — My pay: what Mike is actually making per day vs. what the company keeps,
// job by job, after costs, THM splits and overhead. Plus a price check for quoting.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/format";
import { withTimeout } from "@/lib/load";
import { setJSON } from "@/lib/settings";
import { showError, showToast } from "@/components/Toaster";
import { PayModel, PAY_KEY, DEFAULT_PAY, loadPay, overheadMonthly, overheadPerDay, payRows, payTotals, priceCheck } from "@/lib/pay";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, SectionTitle, Stat, ListSkeleton, LoadError, Empty } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus, X, Calculator } from "lucide-react";

const f$ = (n: number | null | undefined) =>
  n == null || !isFinite(n) ? "—" : (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

export default function PayScreen() {
  const sb = useMemo(() => createClient(), []);
  const [model, setModel] = useState<PayModel>(DEFAULT_PAY);
  const [draft, setDraft] = useState<PayModel>(DEFAULT_PAY);
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [costs, setCosts] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [showOH, setShowOH] = useState(false);
  const [busy, setBusy] = useState("");
  const [calc, setCalc] = useState({ direct: "", days: "", margin: "20" });

  async function load() {
    setErr(null);
    try {
      const r = await withTimeout(loadPay(sb));
      setModel(r.model); setDraft(r.model); setJobs(r.jobs); setCosts(r.costs);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const rows = useMemo(
    () => payRows(model, jobs ?? [], costs).sort((a, b) => ((a.completed_date ?? "") < (b.completed_date ?? "") ? 1 : -1)),
    [model, jobs, costs]
  );
  const t = payTotals(rows);
  const ohd = overheadPerDay(model);
  const tgt = model.owner_day_target;

  async function saveDays(id: string, v: string) {
    const n = v.trim() === "" ? null : Number(v);
    if (n != null && !(n >= 0)) { showError("Days must be a number, like 1 or 0.5"); return; }
    setBusy(id);
    const { error } = await sb.from("jobs").update({ mike_days: n, mike_days_est: false, updated_at: new Date().toISOString() }).eq("id", id);
    setBusy("");
    if (error) { showError("Save failed: " + error.message); return; }
    setJobs((js) => (js ?? []).map((j) => (j.id === id ? { ...j, mike_days: n, mike_days_est: false } : j)));
    showToast("Days saved");
  }

  async function saveModel() {
    const clean: PayModel = {
      owner_day_target: Number(draft.owner_day_target) || 0,
      work_days_per_month: Number(draft.work_days_per_month) || 1,
      overhead: draft.overhead.filter((o) => o.label.trim()).map((o) => ({ label: o.label.trim(), monthly: Number(o.monthly) || 0 })),
    };
    setBusy("model");
    try {
      await setJSON(PAY_KEY, clean);
      setModel(clean); setDraft(clean); showToast("Overhead saved");
    } catch (e: any) { showError("Save failed: " + (e?.message ?? e)); }
    setBusy("");
  }

  const header = <PageHeader title="My pay" sub="What you make per day vs. what the company keeps — after costs, THM splits and overhead" />;
  if (err) return <div>{header}<LoadError message={err} onRetry={load} /></div>;
  if (!jobs) return <div>{header}<ListSkeleton /></div>;

  const over = t.perDay != null && t.perDay >= tgt;
  const gap = t.perDay != null ? t.perDay - tgt : null;
  const pc = priceCheck(model, Number(calc.direct) || 0, Number(calc.days) || 0, Number(calc.margin) || 0);

  return (
    <div className="space-y-6">
      <div>
        {header}
        {/* The headline */}
        <Card className={cn("p-5", over ? "border-emerald-500/40" : "border-amber-500/40")}>
          <div className="text-[13px] font-medium text-neutral-400">What you're making per day</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={cn("text-4xl font-semibold tabular-nums tracking-tight", over ? "text-emerald-300" : "text-amber-300")}>{f$(t.perDay)}</span>
            <span className="text-neutral-400">/ day</span>
            {gap != null ? <Badge variant={gap >= 0 ? "success" : "danger"}>{gap >= 0 ? `${f$(gap)} over` : `${f$(-gap)} short`} your {f$(tgt)} target</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-neutral-400">
            Across {t.jobs} completed job{t.jobs === 1 ? "" : "s"} and {t.days} days on site, after {f$(ohd)}/day company overhead.
            {t.waiting ? <> {t.waiting} more job{t.waiting === 1 ? " is" : "s are"} waiting on costs or days — fill those in below.</> : null}
          </p>
        </Card>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat label={`You @ ${f$(tgt)}/day`} value={f$(t.myPay)} hint={`${t.days} days`} />
          <Stat label="Company kept" value={f$(t.company)} tone={t.company >= 0 ? "ok" : "bad"} hint="after paying you" />
          <Stat label="Company %" value={t.companyPct == null ? "—" : Math.round(t.companyPct * 100) + "%"} tone={(t.companyPct ?? 0) >= 0.15 ? "ok" : "warn"} hint="aim for 15–20%" />
        </div>
      </div>

      {/* Price check */}
      <Card>
        <CardHeader><Calculator size={16} className="text-neutral-400" /><CardTitle>Price check — before you quote</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Direct costs $"><Input inputMode="decimal" value={calc.direct} onChange={(e) => setCalc({ ...calc, direct: e.target.value })} placeholder="1150" /></Field>
            <Field label="Your days"><Input inputMode="decimal" value={calc.days} onChange={(e) => setCalc({ ...calc, days: e.target.value })} placeholder="1" /></Field>
            <Field label="Company %"><Input inputMode="decimal" value={calc.margin} onChange={(e) => setCalc({ ...calc, margin: e.target.value })} /></Field>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Floor — you + overhead" value={f$(pc.floor)} hint="never quote under this" />
            <Stat label={`Price @ ${Math.min(90, Math.max(0, Number(calc.margin) || 0))}% company`} value={f$(pc.price)} tone="ok" hint="starting number" />
          </div>
          <p className="mt-2 text-xs text-neutral-500">Direct costs = crew labor, materials, dump, rentals (not fuel — that's in overhead). On a THM job, the split comes after: quote the whole job, you keep half the net.</p>
        </CardContent>
      </Card>

      {/* Overhead */}
      <Card>
        <button onClick={() => setShowOH(!showOH)} aria-expanded={showOH} className="flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left">
          <span className="text-[15px] font-semibold text-white">Company overhead</span>
          <span className="ml-auto text-sm tabular-nums text-neutral-400">{f$(overheadMonthly(model))}/mo · {f$(ohd)}/day</span>
          <ChevronDown size={16} className={cn("text-neutral-500 transition-transform", showOH && "rotate-180")} />
        </button>
        {showOH ? (
          <CardContent className="space-y-2">
            {draft.overhead.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input value={o.label} onChange={(e) => { const ov = [...draft.overhead]; ov[i] = { ...o, label: e.target.value }; setDraft({ ...draft, overhead: ov }); }} />
                <Input className="w-28 text-right tabular-nums" inputMode="decimal" value={String(o.monthly)}
                  onChange={(e) => { const ov = [...draft.overhead]; ov[i] = { ...o, monthly: e.target.value as any }; setDraft({ ...draft, overhead: ov }); }} />
                <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setDraft({ ...draft, overhead: draft.overhead.filter((_, k) => k !== i) })}><X size={16} /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setDraft({ ...draft, overhead: [...draft.overhead, { label: "", monthly: 0 }] })}><Plus size={14} /> Add expense</Button>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Field label="Billable days a month"><Input inputMode="decimal" value={String(draft.work_days_per_month)} onChange={(e) => setDraft({ ...draft, work_days_per_month: e.target.value as any })} /></Field>
              <Field label="Your target $ a day"><Input inputMode="decimal" value={String(draft.owner_day_target)} onChange={(e) => setDraft({ ...draft, owner_day_target: e.target.value as any })} /></Field>
            </div>
            <Button className="w-full" onClick={saveModel} disabled={busy === "model"}>{busy === "model" ? "Saving…" : "Save overhead"}</Button>
          </CardContent>
        ) : null}
      </Card>

      {/* Per job */}
      <section>
        <SectionTitle right={<span className="text-sm text-neutral-500">{rows.length} jobs</span>}>Completed jobs — you vs. company</SectionTitle>
        {!rows.length ? <Empty title="No completed jobs yet" body="Mark a job Complete and it shows up here." /> : (
          <div className="grid gap-2 md:grid-cols-2">
            {rows.map((r) => {
              const good = r.perDay != null && r.perDay >= tgt;
              return (
                <Card key={r.id} className={cn("px-4 py-3", !r.counted && "border-dashed")}>
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/jobs/${r.id}`} className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-white">{r.name}</div>
                      <div className="truncate text-sm text-neutral-400">
                        {f$(r.price)}{r.partner ? ` · ${r.partner} 50/50` : ""}{r.completed_date ? ` · ${fmtDate(r.completed_date)}` : ""}
                      </div>
                    </Link>
                    <div className="shrink-0 text-right">
                      {r.counted ? (
                        <div className={cn("font-semibold tabular-nums", good ? "text-emerald-300" : (r.perDay ?? 0) > 0 ? "text-amber-300" : "text-red-300")}>{f$(r.perDay)}<span className="text-xs font-normal text-neutral-500">/day</span></div>
                      ) : <Badge variant="warning">{r.reason}</Badge>}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-neutral-400">
                    <span className="min-w-0">
                      Costs {f$(r.direct)}{r.partner ? ` · your half ${f$(r.share)}` : ` · left ${f$(r.share)}`}
                      {r.days ? <> · overhead {f$(r.overhead)} · <span className={r.company >= 0 ? "text-emerald-300" : "text-red-300"}>company {f$(r.company)}</span></> : null}
                    </span>
                    <label className="flex shrink-0 items-center gap-1.5">
                      <Input key={`${r.id}-${r.days ?? ""}`} defaultValue={r.days ?? ""} inputMode="decimal" placeholder="—" aria-label="Your days on this job"
                        className="h-9 w-16 px-2 text-right tabular-nums"
                        onBlur={(e) => { if (e.target.value.trim() !== String(r.days ?? "")) saveDays(r.id, e.target.value); }} />
                      <span>{busy === r.id ? "…" : r.est ? "days (est)" : "days"}</span>
                    </label>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Per day = (contract − direct costs, halved on THM jobs, − overhead) ÷ your days. Job-logged fuel isn't counted twice — it's in overhead.
          "est" days were estimated from crew time on that job; correct any that are off and the numbers update.
        </p>
      </section>
    </div>
  );
}
