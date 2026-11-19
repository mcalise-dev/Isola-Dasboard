"use client";
// v52 — My pay: what Mike is actually making per day vs. what the company keeps,
// job by job, after costs, THM splits and overhead. Plus a price check for quoting.
// v89: Isola takes a flat $/working day (default $200); profit shows Isola / you / together.
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
  const [owners, setOwners] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [showOH, setShowOH] = useState(false);
  const [busy, setBusy] = useState("");
  const [calc, setCalc] = useState({ direct: "", days: "", margin: "20" });

  async function load() {
    setErr(null);
    try {
      const r = await withTimeout(loadPay(sb));
      setModel(r.model); setDraft(r.model); setJobs(r.jobs); setCosts(r.costs); setOwners(r.owners);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const rows = useMemo(
    () => payRows(model, jobs ?? [], costs, owners).sort((a, b) => ((a.completed_date ?? "") < (b.completed_date ?? "") ? 1 : -1)),
    [model, jobs, costs, owners]
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
      isola_per_day: Number(draft.isola_per_day) || 0,
      overhead: draft.overhead.filter((o) => o.label.trim()).map((o) => ({ label: o.label.trim(), monthly: Number(o.monthly) || 0 })),
    };
    setBusy("model");
    try {
      await setJSON(PAY_KEY, clean);
      setModel(clean); setDraft(clean); showToast("Saved");
    } catch (e: any) { showError("Save failed: " + (e?.message ?? e)); }
    setBusy("");
  }

  const header = <PageHeader title="My pay" sub="What Isola made, what you made, and the two together — after costs, THM splits and Isola's take per working day" />;
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
            Across {t.jobs} completed job{t.jobs === 1 ? "" : "s"} and {t.days} days on site, after Isola's {f$(ohd)} per working day.
            {t.waiting ? <> {t.waiting} more job{t.waiting === 1 ? " is" : "s are"} waiting on costs or days — fill those in below.</> : null}
          </p>
        </Card>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat label="Isola made" value={f$(t.isola)} hint={`${f$(ohd)} × ${t.days} days`} />
          <Stat label="You made" value={f$(t.mike)} tone={t.mike >= 0 ? "ok" : "bad"} hint="after all expenses" />
          <Stat label="Together" value={f$(t.together)} tone={t.together >= 0 ? "ok" : "bad"} hint="Isola + you" />
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
            <Stat label="Floor — you + Isola" value={f$(pc.floor)} hint="never quote under this" />
            <Stat label={`Price @ ${Math.min(90, Math.max(0, Number(calc.margin) || 0))}% company`} value={f$(pc.price)} tone="ok" hint="starting number" />
          </div>
          <p className="mt-2 text-xs text-neutral-500">Direct costs = crew labor, materials, dump, rentals (not fuel — Isola's per-day take covers it). On a THM job, the split comes after: quote the whole job, you keep half the net.</p>
        </CardContent>
      </Card>

      {/* Overhead */}
      <Card>
        <button onClick={() => setShowOH(!showOH)} aria-expanded={showOH} className="flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left">
          <span className="text-[15px] font-semibold text-white">Isola's take &amp; monthly bills</span>
          <span className="ml-auto text-sm tabular-nums text-neutral-400">{f$(ohd)}/working day · bills {f$(overheadMonthly(model))}/mo</span>
          <ChevronDown size={16} className={cn("text-neutral-500 transition-transform", showOH && "rotate-180")} />
        </button>
        {showOH ? (
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Isola $ per working day"><Input inputMode="decimal" value={String(draft.isola_per_day)} onChange={(e) => setDraft({ ...draft, isola_per_day: e.target.value as any })} /></Field>
              <Field label="Your target $ a day"><Input inputMode="decimal" value={String(draft.owner_day_target)} onChange={(e) => setDraft({ ...draft, owner_day_target: e.target.value as any })} /></Field>
            </div>
            <p className="pt-2 text-xs text-neutral-500">Monthly bills — only the Cash flow forecast uses these now.</p>
            {draft.overhead.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input value={o.label} onChange={(e) => { const ov = [...draft.overhead]; ov[i] = { ...o, label: e.target.value }; setDraft({ ...draft, overhead: ov }); }} />
                <Input className="w-28 text-right tabular-nums" inputMode="decimal" value={String(o.monthly)}
                  onChange={(e) => { const ov = [...draft.overhead]; ov[i] = { ...o, monthly: e.target.value as any }; setDraft({ ...draft, overhead: ov }); }} />
                <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setDraft({ ...draft, overhead: draft.overhead.filter((_, k) => k !== i) })}><X size={16} /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setDraft({ ...draft, overhead: [...draft.overhead, { label: "", monthly: 0 }] })}><Plus size={14} /> Add expense</Button>
            <Button className="w-full" onClick={saveModel} disabled={busy === "model"}>{busy === "model" ? "Saving…" : "Save"}</Button>
          </CardContent>
        ) : null}
      </Card>

      {/* Per job */}
      <section>
        <SectionTitle right={<span className="text-sm text-neutral-500">{rows.length} jobs</span>}>Completed jobs — Isola, you, together</SectionTitle>
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
                        {f$(r.price)}{r.partner ? (r.split ? ` · ${r.partner} 50/50` : ` · ${r.partner} reimbursed`) : ""}{r.completed_date ? ` · ${fmtDate(r.completed_date)}` : ""}
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
                      Costs {f$(r.direct)}{r.split ? ` · fee ${f$(r.fee)} · THM ${f$(r.thm)}` : ""}
                      {r.days ? <> · Isola {f$(r.isola)} · <span className={r.mike >= 0 ? "text-emerald-300" : "text-red-300"}>you {f$(r.mike)}</span> · together {f$(r.together)}</> : null}
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
          Isola made = {f$(ohd)} × your days, a job expense. On THM 50/50 jobs the $500 management fee is also an expense, the rest splits with THM, and the fee comes back to you. Your own labor is never a cost; crew pay is. Per day = you made ÷ your days. Job-logged fuel isn't counted — Isola's per-day take covers it.
          "est" days were estimated from crew time on that job; correct any that are off and the numbers update.
        </p>
      </section>
    </div>
  );
}
