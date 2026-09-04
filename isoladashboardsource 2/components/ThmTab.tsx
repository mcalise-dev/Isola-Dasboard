"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, fmtDate } from "@/lib/format";

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
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("thm_ledger").select("*").order("bucket").order("sort").then(({ data }) => {
      setEntries((data as Entry[]) ?? []);
      setLoading(false);
    });
  }, []);

  const inv94 = entries.filter((e) => e.bucket === "inv94");
  const standalone = entries.filter((e) => e.bucket !== "inv94");
  const sum = (list: Entry[], side: string) => list.filter((e) => e.side === side && !e.is_open).reduce((a, e) => a + Number(e.amount), 0);
  const inv94Balance = sum(inv94, "owes_isola") - sum(inv94, "owes_thm");
  const standaloneBal = sum(standalone, "owes_isola") - sum(standalone, "owes_thm");
  const openItems = entries.filter((e) => e.is_open);

  function row(e: Entry) {
    return (
      <div key={e.id} className={`flex items-start gap-3 rounded-xl border px-3.5 py-2.5 ${e.is_open ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-800 bg-neutral-950"}`}>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{e.description}</div>
          <div className="text-xs text-neutral-500">{[e.ref, e.entry_date ? fmtDate(e.entry_date) : null].filter(Boolean).join(" · ")}{e.is_open ? " · OPEN — number pending" : ""}</div>
        </div>
        <div className={`shrink-0 text-sm font-bold tabular-nums ${e.side === "owes_isola" ? "text-white" : "text-emerald-300"}`}>
          {e.is_open ? "—" : (e.side === "owes_thm" ? "−" : "") + money(Number(e.amount))}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/95 p-4 text-center">
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">THM owes ISOLA — Invoice #94</div>
        <div className="text-3xl font-extrabold tabular-nums text-white mt-1">{loading ? "…" : money(inv94Balance)}</div>
        <div className="text-xs text-neutral-500 mt-1">$40,155.50 opening · {money(sum(inv94, "owes_thm"))} applied</div>
        {standalone.length ? (
          <div className="text-xs text-neutral-400 mt-2 border-t border-neutral-800 pt-2">
            Standalone (not part of #94): <span className="font-semibold text-white">{money(standaloneBal)}</span> owed to ISOLA
          </div>
        ) : null}
      </div>

      {openItems.length ? (
        <div className="rounded-xl border border-amber-500/40 bg-neutral-900 px-3.5 py-2.5 text-xs text-amber-200">
          ⚠️ {openItems.length} open item{openItems.length > 1 ? "s" : ""} not in the balance yet — tell Claude the number when you have it.
        </div>
      ) : null}

      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">Applied against Invoice #94</div>
        <div className="space-y-1.5">{inv94.map(row)}</div>
      </div>

      {standalone.length ? (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">Standalone settlements</div>
          <div className="space-y-1.5">{standalone.map(row)}</div>
        </div>
      ) : null}

      <p className="text-xs text-neutral-600">Green negative amounts pay the tab down. To log a new job closeout, payment, or reimbursement, tell Claude — the ledger and this tab stay in sync with QuickBooks Invoice #94.</p>
    </div>
  );
}
