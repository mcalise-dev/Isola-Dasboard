"use client";
// v89 (11/19/26) — Close-out summary on a job's Money card: after every job cost and THM's split,
// what Isola made ($ per working day × Mike's days), what Mike made (the rest), and the two together.
// Same math as Money → My pay (lib/pay.ts payRows), so the numbers match there.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PAY_KEY, parsePayModel, payRows, overheadPerDay, type PayRow } from "@/lib/pay";
import { cn } from "@/lib/utils";

const f$ = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

export default function CloseOutCard({ job, refreshKey }: { job: any; refreshKey?: unknown }) {
  const sb = useMemo(() => createClient(), []);
  const [v, setV] = useState<{ row: PayRow; ohd: number } | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      sb.from("app_settings").select("value").eq("key", PAY_KEY).maybeSingle(),
      sb.from("job_financials").select("contract_total").eq("job_id", job.id).maybeSingle(),
      sb.from("job_costs").select("job_id,category,amount").eq("job_id", job.id),
    ]).then(([s, f, c]: any[]) => {
      if (!live || s.error || f.error || c.error) return;
      const model = parsePayModel(s.data?.value);
      const [row] = payRows(model, [{ ...job, contract_total: f.data?.contract_total ?? null }], c.data ?? []);
      setV({ row, ohd: overheadPerDay(model) });
    });
    return () => { live = false; };
  }, [sb, job, refreshKey]);

  if (!v) return null;
  const { row, ohd } = v;
  const done = job.status === "complete";

  return (
    <div className="mt-3 rounded-lg border border-border px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-white">{done ? "Close-out" : "Close-out so far"}</span>
        <span className="text-xs text-neutral-500">{row.days ? `${row.days} working day${row.days === 1 ? "" : "s"}${row.est ? " (est)" : ""}` : "add your days"}</span>
      </div>
      {row.days ? (
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          <div><div className="text-xs text-neutral-500">Isola made</div><div className="font-semibold tabular-nums text-white">{f$(row.isola)}</div></div>
          <div><div className="text-xs text-neutral-500">You made</div><div className={cn("font-semibold tabular-nums", row.mike >= 0 ? "text-emerald-300" : "text-red-300")}>{f$(row.mike)}</div></div>
          <div><div className="text-xs text-neutral-500">Together</div><div className={cn("font-semibold tabular-nums", row.together >= 0 ? "text-emerald-300" : "text-red-300")}>{f$(row.together)}</div></div>
        </div>
      ) : (
        <p className="mt-1 text-xs text-neutral-500">Enter your days on this job (Money → My pay) and Isola's {f$(ohd)} a day comes out first.</p>
      )}
      <p className="mt-1.5 text-xs text-neutral-500">
        {f$(row.price)} − costs {f$(row.direct)}{row.split ? (Number(job.partner_share) > 0 ? ` − THM ${f$(Number(job.partner_share))}` : " ÷ 2 (THM 50/50)") : ""}{row.days ? ` − Isola ${f$(ohd)} × ${row.days}` : ""}
        {!row.hasCosts ? " · no costs logged yet" : ""}
      </p>
    </div>
  );
}
