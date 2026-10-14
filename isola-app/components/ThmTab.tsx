"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, fmtDate } from "@/lib/format";
import { withTimeout } from "@/lib/load";
import { Card } from "@/components/ui/card";
import { PageHeader, SectionTitle, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { AlertTriangle, BookOpen, Truck } from "lucide-react";

type Entry = {
  id: string;
  entry_date: string | null;
  description: string;
  ref: string | null;
  side: "owes_isola" | "owes_thm";
  amount: number;
  bucket: string;
  is_open: boolean;
  sort: number;
};

export default function ThmTab() {
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const [{ data, error }, it] = await withTimeout(Promise.all([
        supabase.from("thm_ledger").select("*").order("bucket").order("sort"),
        supabase.from("thm_job_items").select("id,job_id,kind,amount,entry_date,jobs(id,job_name,customer,contract_holder,thm_deal,status)"),
      ]));
      if (error) throw new Error(error.message);
      setEntries((data as Entry[]) ?? []);
      setItems(it.error ? [] : (it.data ?? []));
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const header = (
    <PageHeader
      title="THM tab"
      sub="What you and THM owe each other, job by job, plus the Invoice #94 history"
    />
  );

  if (err) return <div>{header}<LoadError message={err} onRetry={load} /></div>;
  if (!entries) return <div>{header}<ListSkeleton /></div>;

  const inv94 = entries.filter((e) => e.bucket === "inv94");
  const standalone = entries.filter((e) => e.bucket !== "inv94");
  const sum = (list: Entry[], side: string) => list.filter((e) => e.side === side && !e.is_open).reduce((a, e) => a + Number(e.amount), 0);
  const inv94Balance = sum(inv94, "owes_isola") - sum(inv94, "owes_thm");
  const standaloneBal = sum(standalone, "owes_isola") - sum(standalone, "owes_thm");
  const openItems = entries.filter((e) => e.is_open);

  // v5.8 running tab: every job THM is on, from its THM lines (job record > THM tab).
  // Isola holds the contract -> Isola owes THM. THM holds it -> THM owes Isola.
  const jobs = new Map<string, { id: string; name: string; holder: string; deal: string; status: string; total: number; lines: number; last: string | null }>();
  for (const it of items) {
    const j = it.jobs;
    if (!j) continue;
    const cur = jobs.get(j.id) ?? { id: j.id, name: j.job_name || j.customer, holder: j.contract_holder, deal: j.thm_deal, status: j.status, total: 0, lines: 0, last: null };
    cur.total += Number(it.amount || 0); cur.lines += 1;
    if (it.entry_date && (!cur.last || it.entry_date > cur.last)) cur.last = it.entry_date;
    jobs.set(j.id, cur);
  }
  const jobRows = [...jobs.values()].sort((a, b) => String(b.last ?? "").localeCompare(String(a.last ?? "")));
  const running = sum(entries.filter((e) => e.bucket === "running"), "owes_isola") - sum(entries.filter((e) => e.bucket === "running"), "owes_thm");
  const tab = jobRows.reduce((a, j) => a + (j.holder === "thm" ? j.total : -j.total), 0) + running;
  const pending = jobRows.filter((j) => j.status !== "complete").reduce((a, j) => a + (j.holder === "thm" ? j.total : -j.total), 0);

  function row(e: Entry) {
    return (
      <div key={e.id} className={cn("flex items-start gap-3 border-b border-border px-4 py-3 last:border-0", e.is_open && "bg-amber-500/[0.06]")}>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{e.description}</div>
          <div className="text-xs text-neutral-400">
            {[e.ref, e.entry_date ? fmtDate(e.entry_date) : null].filter(Boolean).join(" · ")}
            {e.is_open ? <span className="text-amber-300">{" · OPEN — number pending"}</span> : ""}
          </div>
        </div>
        <div className={cn("shrink-0 text-sm font-bold tabular-nums", e.side === "owes_isola" ? "text-white" : "text-emerald-300")}>
          {e.is_open ? "—" : (e.side === "owes_thm" ? "−" : "") + money(Number(e.amount))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat
          label={tab >= 0 ? "Running tab: THM owes you" : "Running tab: you owe THM"}
          value={money(Math.abs(tab))}
          hint={pending ? `${money(Math.abs(pending))} of it is from jobs still in progress` : jobRows.length ? "All from finished jobs" : "No job lines yet"}
          tone={tab >= 0 ? "ok" : "warn"}
        />
        <Stat
          label="THM owes ISOLA — Invoice #94"
          value={money(inv94Balance)}
          hint={`$40,155.50 opening · ${money(sum(inv94, "owes_thm"))} applied`}
          className="sm:col-span-1"
        />
        {standalone.length ? (
          <Stat label="Standalone (not part of #94)" value={money(standaloneBal)} hint="owed to ISOLA" />
        ) : null}
      </div>

      {openItems.length ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{openItems.length} open item{openItems.length > 1 ? "s" : ""} not in the balance yet — tell Claude the number when you have it.</span>
        </div>
      ) : null}

      <section>
        <SectionTitle>Jobs with THM</SectionTitle>
        {jobRows.length ? (
          <Card className="overflow-hidden">
            {jobRows.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}?tab=thm`} className={cn("flex items-start gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-white/[0.03]", j.status !== "complete" && "bg-amber-500/[0.04]")}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">{j.name}</div>
                  <div className="text-xs text-neutral-400">
                    {j.holder === "thm" ? "THM's contract · THM owes you" : "Your contract · you owe THM"}
                    {" · "}{j.deal === "split" ? "50/50 + reimbursements" : "time + equipment"}
                    {" · "}{j.lines} line{j.lines === 1 ? "" : "s"}
                    {j.status !== "complete" ? <span className="text-amber-300">{" · in progress"}</span> : ""}
                  </div>
                </div>
                <div className={cn("shrink-0 text-sm font-bold tabular-nums", j.holder === "thm" ? "text-white" : "text-emerald-300")}>
                  {(j.holder === "thm" ? "" : "−") + money(j.total)}
                </div>
              </Link>
            ))}
          </Card>
        ) : (
          <Empty icon={<Truck size={24} />} title="No THM job lines yet" body="On a job THM is on, open its THM tab and add the truck, machine and labor time." />
        )}
      </section>

      <section>
        <SectionTitle>Applied against Invoice #94</SectionTitle>
        {inv94.length ? <Card className="overflow-hidden">{inv94.map(row)}</Card>
          : <Empty icon={<BookOpen size={24} />} title="No entries yet" body="Job closeouts, payments and reimbursements against #94 show up here." />}
      </section>

      {standalone.length ? (
        <section>
          <SectionTitle>Standalone settlements</SectionTitle>
          <Card className="overflow-hidden">{standalone.map(row)}</Card>
        </section>
      ) : null}

      <p className="text-xs text-neutral-500">Green negative amounts pay the tab down. To log a new job closeout, payment, or reimbursement, tell Claude — the ledger and this tab stay in sync with QuickBooks Invoice #94.</p>
    </div>
  );
}
