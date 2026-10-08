"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, fmtDate } from "@/lib/format";
import { withTimeout } from "@/lib/load";
import { Card } from "@/components/ui/card";
import { PageHeader, SectionTitle, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { AlertTriangle, BookOpen } from "lucide-react";

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
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const { data, error } = await withTimeout(supabase.from("thm_ledger").select("*").order("bucket").order("sort"));
      if (error) throw new Error(error.message);
      setEntries((data as Entry[]) ?? []);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const header = (
    <PageHeader
      title="THM tab"
      sub="Running balance with THM — settled against QuickBooks Invoice #94"
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
