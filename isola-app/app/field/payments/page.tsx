"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Empty } from "@/components/field/shared";

// v6.7: a crew member's own pay — what they've been paid (checks/cash), the work those
// payments covered, and what's still owed. Only their own lines; no rates, no job prices.
type Data = {
  payments: { date: string; amount: number; method: string | null; reference: string | null }[];
  paid_total: number;
  paid_work: { job: string; date: string; amount: number }[];
  owed_total: number;
};
const usd = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FieldPayments() {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [showWork, setShowWork] = useState(false);

  useEffect(() => {
    supabase.rpc("crew_my_payments").then(({ data, error }) => { if (error) setErr(true); else setD(data as Data); });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Payments</h1>
      {err ? <p className="mt-4 text-sm text-neutral-400">Payments aren't available yet — check back soon.</p> : null}
      {!d && !err ? <div className="mt-4 h-24 rounded-xl bg-neutral-900 animate-pulse" /> : null}
      {d ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/[0.05] px-4 py-3">
              <div className="text-xs text-neutral-400">Still owed</div>
              <div className="mt-0.5 text-xl font-bold tabular-nums text-amber-300">{usd(d.owed_total)}</div>
            </div>
            <div className="rounded-xl bg-white/[0.05] px-4 py-3">
              <div className="text-xs text-neutral-400">Paid to you</div>
              <div className="mt-0.5 text-xl font-bold tabular-nums text-emerald-300">{usd(d.paid_total)}</div>
            </div>
          </div>

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-bold text-white">Payments received</h2>
            {d.payments.length ? (
              <div className="divide-y divide-neutral-800 rounded-xl bg-white/[0.05]">
                {d.payments.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white">{p.date}</div>
                      <div className="text-xs text-neutral-400">{[p.method, p.reference ? `#${p.reference}` : null].filter(Boolean).join(" ") || "Payment"}</div>
                    </div>
                    <div className="shrink-0 text-sm font-bold tabular-nums text-emerald-300">{usd(Number(p.amount))}</div>
                  </div>
                ))}
              </div>
            ) : <Empty title="No payments recorded yet" />}
          </section>

          <section className="mt-6">
            <button onClick={() => setShowWork((v) => !v)} className="mb-2 flex w-full items-baseline justify-between text-left">
              <h2 className="text-sm font-bold text-white">Paid work <span className="font-normal text-neutral-400">· {d.paid_work.length} day{d.paid_work.length === 1 ? "" : "s"}</span></h2>
              <span className="text-xs font-semibold text-neutral-400 underline">{showWork ? "Hide" : "Show"}</span>
            </button>
            {showWork ? (d.paid_work.length ? (
              <div className="divide-y divide-neutral-800 rounded-xl bg-white/[0.05]">
                {d.paid_work.map((w, i) => (
                  <div key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white truncate">{w.job}</div>
                      <div className="text-xs text-neutral-400">{w.date}</div>
                    </div>
                    <div className="shrink-0 text-sm font-bold tabular-nums text-white">{usd(Number(w.amount))}</div>
                  </div>
                ))}
              </div>
            ) : <Empty title="Nothing marked paid yet" />) : null}
          </section>
          <p className="mt-6 text-sm text-neutral-400">Something look wrong? Tell Mike.</p>
        </>
      ) : null}
    </div>
  );
}
