"use client";
// v89 (11/19/26) — Performance: how the business is doing across every completed job, on Mike's rules
// (lib/pay.ts): Isola $200 per working day as a job expense, THM 50/50 after the $500 management fee,
// Mike's own labor never a cost. Overview on top (average margin, Isola / you / together), then a
// picker to open any one job's close-out, margin by kind of work, and every job listed underneath.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/load";
import { fmtDate, todayISO } from "@/lib/format";
import { loadPay, payRows, payTotals, overheadPerDay, type PayModel, type PayRow } from "@/lib/pay";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { Segmented } from "@/components/ui/tabs";
import { PageHeader, SectionTitle, Stat, Progress, ListSkeleton, LoadError, Empty } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { ChevronDown, ArrowRight } from "lucide-react";

const f$ = (n: number | null | undefined) =>
  n == null || !isFinite(n) ? "—" : (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (m: number | null | undefined) => (m == null || !isFinite(m) ? "—" : `${Math.round(m * 100)}%`);
const tone = (m: number | null | undefined): "ok" | "warn" | "bad" | undefined =>
  m == null ? undefined : m < 0.1 ? "bad" : m < 0.25 ? "warn" : "ok";
const toneText = (m: number | null | undefined) =>
  m == null ? "text-neutral-500" : m < 0.1 ? "text-red-300" : m < 0.25 ? "text-amber-300" : "text-emerald-300";

type Period = "all" | "year" | "90";
type Kind = "all" | "solo" | "thm";
type Sort = "date" | "margin" | "made";

function inPeriod(d: string | null, p: Period) {
  if (p === "all") return true;
  if (!d) return false;
  const today = todayISO();
  if (p === "year") return d.slice(0, 4) === today.slice(0, 4);
  const t = new Date(today + "T12:00:00"); t.setDate(t.getDate() - 90);
  return d >= t.toISOString().slice(0, 10);
}

/** One job, every line of the close-out. */
function Breakdown({ r, ohd }: { r: PayRow; ohd: number }) {
  const line = (k: string, v: React.ReactNode, cls?: string) => (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-neutral-400">{k}</span><span className={cn("tabular-nums text-neutral-200", cls)}>{v}</span>
    </div>
  );
  return (
    <div className="divide-y divide-border">
      {line("Contract", f$(r.price))}
      {line("Job costs", `− ${f$(r.direct)}`)}
      {line(`Isola (${f$(ohd)} × ${r.days ?? 0} days)`, `− ${f$(r.isola)}`)}
      {r.split ? line("Management fee", `− ${f$(r.fee)}`) : null}
      {r.split ? line("THM's half", `− ${f$(r.thm)}`) : null}
      {r.split ? line("Fee back to you", `+ ${f$(r.fee)}`) : null}
      <div className="grid grid-cols-3 gap-2 pt-2">
        <div><div className="text-xs text-neutral-500">Isola made</div><div className="font-semibold tabular-nums text-white">{f$(r.isola)}</div></div>
        <div><div className="text-xs text-neutral-500">You made</div><div className={cn("font-semibold tabular-nums", r.mike >= 0 ? "text-emerald-300" : "text-red-300")}>{f$(r.mike)}</div></div>
        <div><div className="text-xs text-neutral-500">Together</div><div className={cn("font-semibold tabular-nums", toneText(r.margin))}>{f$(r.together)} · {pct(r.margin)}</div></div>
      </div>
    </div>
  );
}

export default function PerformanceScreen() {
  const sb = useMemo(() => createClient(), []);
  const [data, setData] = useState<{ model: PayModel; jobs: any[]; costs: any[]; owners: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [sort, setSort] = useState<Sort>("date");
  const [pick, setPick] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try { setData(await withTimeout(loadPay(sb))); }
    catch (e: any) { setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e)); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const all = useMemo(() => (data ? payRows(data.model, data.jobs, data.costs, data.owners) : []), [data]);
  const rows = useMemo(() => all.filter((r) =>
    inPeriod(r.completed_date, period) &&
    (kind === "all" || (kind === "thm" ? !!r.partner : !r.partner))
  ), [all, period, kind]);

  const header = <PageHeader title="Performance" sub="Every finished job after all costs, Isola's take per working day and THM's split" />;
  if (err) return <div className="pb-28">{header}<LoadError message={err} onRetry={load} /></div>;
  if (!data) return <div className="pb-28">{header}<ListSkeleton rows={5} /></div>;

  const ohd = overheadPerDay(data.model);
  const t = payTotals(rows);
  const counted = rows.filter((r) => r.counted);
  const waiting = rows.filter((r) => !r.counted);
  const picked = pick ? all.find((r) => r.id === pick) ?? null : null;

  // margin by kind of work (counted jobs only)
  const byType = new Map<string, { rev: number; tog: number; n: number }>();
  for (const r of counted) {
    const k = r.workType || "Other";
    const e = byType.get(k) ?? { rev: 0, tog: 0, n: 0 };
    e.rev += r.price; e.tog += r.together; e.n++;
    byType.set(k, e);
  }
  const types = [...byType.entries()].map(([k, v]) => ({ k, ...v, m: v.rev ? v.tog / v.rev : 0 })).sort((a, b) => b.rev - a.rev);

  const list = [...rows].sort((a, b) =>
    sort === "margin" ? (b.margin ?? -9) - (a.margin ?? -9)
      : sort === "made" ? b.together - a.together
        : (b.completed_date ?? "").localeCompare(a.completed_date ?? ""));
  const best = [...counted].sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0))[0];
  const worst = counted.length > 1 ? [...counted].sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0))[0] : null;

  return (
    <div className="pb-28 space-y-6">
      <div>
        {header}
        <div className="flex flex-wrap gap-2">
          <Segmented value={period} onChange={(v) => setPeriod(v as Period)} options={[{ value: "all", label: "All time" }, { value: "year", label: "This year" }, { value: "90", label: "Last 90 days" }]} />
          <Segmented value={kind} onChange={(v) => setKind(v as Kind)} options={[{ value: "all", label: "All jobs" }, { value: "solo", label: "Solo" }, { value: "thm", label: "With THM" }]} />
        </div>
      </div>

      {/* Overview */}
      {!rows.length ? <Empty title="No finished jobs here" body="Mark a job Complete and it shows up on this page." /> : (
        <section className="space-y-2">
          <Card className={cn("p-5", t.margin != null && t.margin >= 0.25 ? "border-emerald-500/40" : "border-amber-500/40")}>
            <div className="text-[13px] font-medium text-neutral-400">Average margin</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className={cn("text-4xl font-semibold tabular-nums tracking-tight", toneText(t.margin))}>{pct(t.margin)}</span>
              <span className="text-neutral-400">on {f$(t.revenue)} of work</span>
            </div>
            <p className="mt-2 text-sm text-neutral-400">
              Across {t.jobs} job{t.jobs === 1 ? "" : "s"} and {t.days} working days. Each job on its own averages {pct(t.avgJobMargin)}.
              {waiting.length ? <> {waiting.length} more {waiting.length === 1 ? "is" : "are"} left out until costs or days are filled in.</> : null}
            </p>
          </Card>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Isola made" value={f$(t.isola)} hint={`${f$(ohd)} × ${t.days} days`} />
            <Stat label="You made" value={f$(t.mike)} tone={t.mike >= 0 ? "ok" : "bad"} hint={t.perDay != null ? `${f$(t.perDay)} per day` : undefined} />
            <Stat label="Together" value={f$(t.together)} tone={tone(t.margin)} hint={t.togetherPerDay != null ? `${f$(t.togetherPerDay)} per day` : undefined} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Work done" value={f$(t.revenue)} hint={`${t.jobs} jobs`} />
            <Stat label="Job costs" value={f$(t.direct)} hint="crew, materials, rentals" />
            <Stat label="THM's half" value={f$(t.thm)} hint={t.fee ? `after ${f$(t.fee)} in fees` : "split jobs"} />
          </div>
          {best ? (
            <p className="text-xs text-neutral-500">
              Best: {best.name} at {pct(best.margin)}.{worst && worst.id !== best.id ? ` Weakest: ${worst.name} at ${pct(worst.margin)}.` : ""}
            </p>
          ) : null}
        </section>
      )}

      {/* One job */}
      <section>
        <SectionTitle>Look at one job</SectionTitle>
        <NativeSelect value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Pick a job">
          <option value="">Pick a finished job…</option>
          {[...all].sort((a, b) => (b.completed_date ?? "").localeCompare(a.completed_date ?? "")).map((r) => (
            <option key={r.id} value={r.id}>{r.name}{r.completed_date ? ` · ${fmtDate(r.completed_date)}` : ""}</option>
          ))}
        </NativeSelect>
        {picked ? (
          <Card className="mt-2 px-4 py-3">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold text-white">{picked.name}</div>
                <div className="truncate text-xs text-neutral-500">{[picked.customer, picked.split ? "THM 50/50" : picked.partner ? "THM reimbursed" : "Solo", picked.completed_date ? fmtDate(picked.completed_date) : null].filter(Boolean).join(" · ")}</div>
              </div>
              {picked.reason ? <Badge variant="warning">{picked.reason}</Badge> : null}
            </div>
            <Breakdown r={picked} ohd={ohd} />
            <Link href={`/jobs/${picked.id}`} className="mt-2 inline-flex min-h-[40px] items-center gap-1 text-sm text-neutral-300 hover:text-white">Open the job <ArrowRight size={14} /></Link>
          </Card>
        ) : null}
      </section>

      {/* By kind of work */}
      {types.length > 1 ? (
        <section>
          <SectionTitle>Margin by kind of work</SectionTitle>
          <Card className="space-y-3 px-4 py-3">
            {types.map((x) => (
              <div key={x.k}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-neutral-200">{x.k} <span className="text-neutral-500">· {x.n} job{x.n === 1 ? "" : "s"} · {f$(x.rev)}</span></span>
                  <span className={cn("font-semibold tabular-nums", toneText(x.m))}>{pct(x.m)}</span>
                </div>
                <Progress className="mt-1" value={Math.max(0, Math.min(100, x.m * 100))} tone={tone(x.m)} />
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {/* Every job */}
      {rows.length ? (
        <section>
          <SectionTitle right={<Segmented value={sort} onChange={(v) => setSort(v as Sort)} options={[{ value: "date", label: "Newest" }, { value: "margin", label: "Margin" }, { value: "made", label: "Made" }]} />}>
            Every job
          </SectionTitle>
          <div className="grid gap-2 md:grid-cols-2">
            {list.map((r) => {
              const isOpen = open === r.id;
              return (
                <Card key={r.id} className={cn("px-4 py-3", !r.counted && "border-dashed")}>
                  <button onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen} className="flex w-full items-start justify-between gap-3 text-left">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-white">{r.name}</div>
                      <div className="truncate text-sm text-neutral-400">
                        {f$(r.price)}{r.split ? " · THM 50/50" : r.partner ? " · THM reimbursed" : ""}{r.completed_date ? ` · ${fmtDate(r.completed_date)}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {r.counted ? (
                        <>
                          <div className={cn("font-semibold tabular-nums", toneText(r.margin))}>{pct(r.margin)}</div>
                          <div className="text-xs tabular-nums text-neutral-500">{f$(r.together)}</div>
                        </>
                      ) : <Badge variant="warning">{r.reason}</Badge>}
                    </div>
                    <ChevronDown size={16} className={cn("mt-1 shrink-0 text-neutral-500 transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen ? (
                    <div className="mt-2">
                      <Breakdown r={r} ohd={ohd} />
                      <Link href={`/jobs/${r.id}`} className="mt-1 inline-flex min-h-[40px] items-center gap-1 text-sm text-neutral-300 hover:text-white">Open the job <ArrowRight size={14} /></Link>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Margin = what Isola and you made together ÷ the contract. Isola takes {f$(ohd)} per working day as a job expense. On THM 50/50 jobs the $500
            management fee is an expense too, the rest splits with THM, and the fee comes back to you. Your own labor is never a cost; crew pay is.
            Fuel is covered by Isola's take. Jobs with no costs or no days are listed but left out of the totals. Set your days on Money → My pay.
          </p>
        </section>
      ) : null}
    </div>
  );
}
