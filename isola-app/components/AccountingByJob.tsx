"use client";
// v8.0 (10/28/26) Accounting at a glance: who owes what, from which job — both directions.
//   Owed to me  = job_financials.balance_due (contract + approved change orders − payments)
//   I owe crew  = unpaid Labor lines in job_costs (same rule as Owed to crew / payroll)
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { jobLabel } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

const fmt$ = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export default function AccountingByJob() {
  const sb = useMemo(() => createClient(), []);
  const [toMe, setToMe] = useState<any[] | null>(null);
  const [toCrew, setToCrew] = useState<{ jobId: string | null; label: string; total: number; people: string[] }[] | null>(null);

  useEffect(() => {
    (async () => {
      const [f, c, j] = await Promise.all([
        sb.from("job_financials").select("job_id,job_name,customer,status,balance_due,contract_total,paid_to_date").gt("balance_due", 0).neq("status", "lost"),
        sb.from("job_costs").select("job_id,worker,vendor,amount").eq("paid", false).eq("category", "Labor").gt("amount", 0),
        sb.from("jobs").select("id,job_name,customer,location,job"),
      ]);
      // only work that's actually underway or done is "owed"; a quote isn't a receivable yet
      setToMe((f.data ?? []).filter((r: any) => ["booked", "progress", "complete"].includes(r.status)).sort((a: any, b: any) => b.balance_due - a.balance_due));
      const byJob = new Map<string, { jobId: string | null; label: string; total: number; people: Set<string> }>();
      for (const r of c.data ?? []) {
        const k = r.job_id ?? "none";
        const jb = (j.data ?? []).find((x: any) => x.id === r.job_id);
        const cur = byJob.get(k) ?? { jobId: r.job_id, label: jb ? jobLabel(jb) : "No job (overhead)", total: 0, people: new Set<string>() };
        cur.total += Number(r.amount) || 0;
        const who = r.worker || r.vendor; if (who) cur.people.add(who);
        byJob.set(k, cur);
      }
      setToCrew([...byJob.values()].map((v) => ({ ...v, people: [...v.people] })).sort((a, b) => b.total - a.total));
    })();
  }, [sb]);

  const meTotal = (toMe ?? []).reduce((a, r) => a + Number(r.balance_due), 0);
  const crewTotal = (toCrew ?? []).reduce((a, r) => a + r.total, 0);

  return (
    <div className="mb-6 grid gap-3 md:grid-cols-2">
      <Side title="Owed to me" total={meTotal} tone="ok" loading={toMe === null} empty="Nobody owes you on an active or finished job."
        rows={(toMe ?? []).map((r) => ({ key: r.job_id, href: `/jobs/${r.job_id}?tab=money`, name: r.job_name || r.customer, sub: r.job_name ? r.customer : r.status, amount: Number(r.balance_due) }))} />
      <Side title="I owe crew & subs" total={crewTotal} tone="warn" loading={toCrew === null} empty="You're square with everyone." more={{ href: "/payroll", label: "Pay them" }}
        rows={(toCrew ?? []).map((r) => ({ key: r.jobId ?? "none", href: r.jobId ? `/jobs/${r.jobId}?tab=money` : "/payroll", name: r.label, sub: r.people.join(", "), amount: r.total }))} />
    </div>
  );
}

function Side({ title, total, tone, rows, loading, empty, more }: {
  title: string; total: number; tone: "ok" | "warn"; loading: boolean; empty: string;
  rows: { key: string; href: string; name: string; sub: string; amount: number }[]; more?: { href: string; label: string };
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <div className="text-sm font-semibold text-white">{title} <span className="font-normal text-neutral-500">· by job</span></div>
        <div className={cn("text-lg font-semibold tabular-nums", tone === "ok" ? "text-emerald-300" : "text-amber-300")}>{loading ? "…" : fmt$(total)}</div>
      </div>
      {loading ? <div className="px-4 py-3 text-sm text-neutral-500">Loading…</div>
        : rows.length === 0 ? <div className="px-4 py-3 text-sm text-neutral-500">{empty}</div>
        : (
          <div className="divide-y divide-border">
            {rows.slice(0, 8).map((r) => (
              <Link key={r.key} href={r.href} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-white/[0.03]">
                <div className="min-w-0"><div className="truncate font-medium text-neutral-100">{r.name}</div>{r.sub ? <div className="truncate text-xs text-neutral-500">{r.sub}</div> : null}</div>
                <div className="shrink-0 tabular-nums font-semibold text-white">{fmt$(r.amount)}</div>
              </Link>
            ))}
            {rows.length > 8 ? <div className="px-4 py-2 text-xs text-neutral-500">+{rows.length - 8} more</div> : null}
          </div>
        )}
      {more && rows.length ? (
        <Link href={more.href} className="flex items-center justify-end gap-1 border-t border-border px-4 py-2 text-xs font-semibold text-neutral-300 hover:text-white">{more.label} <ArrowRight size={13} /></Link>
      ) : null}
    </Card>
  );
}
