"use client";
// v52 — Home headline: what Mike is making per day vs. his target. Taps through to Money → My pay.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/load";
import { loadPay, payRows, payTotals, overheadPerDay } from "@/lib/pay";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

const f$ = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

export default function PayHeadline() {
  const sb = useMemo(() => createClient(), []);
  const [v, setV] = useState<{ perDay: number | null; target: number; ohd: number; company: number; pct: number | null; days: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    withTimeout(loadPay(sb)).then(({ model, jobs, costs }) => {
      if (!live) return;
      const t = payTotals(payRows(model, jobs, costs));
      setV({ perDay: t.perDay, target: model.owner_day_target, ohd: overheadPerDay(model), company: t.company, pct: t.companyPct, days: t.days });
    }).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [sb]);

  if (failed) return null;
  if (!v) return <div className="skeleton mb-6 h-[92px]" />;
  const over = v.perDay != null && v.perDay >= v.target;

  return (
    <Link href="/money/pay" className={cn("mb-6 flex items-center gap-4 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:border-white/30", over ? "border-emerald-500/40" : "border-amber-500/40")}>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-neutral-400">What you're making per day</div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          <span className={cn("text-3xl font-semibold tabular-nums tracking-tight", over ? "text-emerald-300" : "text-amber-300")}>{v.perDay == null ? "—" : f$(v.perDay)}</span>
          <span className="text-sm text-neutral-400">/ day · target {f$(v.target)}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-neutral-500">
          Company kept {f$(v.company)}{v.pct != null ? ` (${Math.round(v.pct * 100)}%)` : ""} over {v.days} days · after {f$(v.ohd)}/day overhead
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-neutral-500" />
    </Link>
  );
}
