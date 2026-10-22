"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown, ChevronRight } from "lucide-react";

// Tyler's statement: what THM is owed, job by job, every line itemized.
// 50/50 jobs show the split math (price − costs = net ÷ 2) plus anything paid back on top.
type Line = { kind: string; label: string; detail: string | null; amount: number; estimate: boolean; pending?: boolean };
type Job = {
  id: string; name: string; location: string | null; status: string; holder: string; deal: string;
  direction: "isola_owes_thm" | "thm_owes_isola"; settled: boolean; estimate: boolean; lines: Line[]; total: number;
};
type Data = { jobs: Job[]; owed_to_thm: number; owed_to_isola: number; net: number; waiting: number };

const usd = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Number(n || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STAGE: Record<string, string> = { progress: "In progress", booked: "Booked", future: "Future", awaiting: "Quoted", lead: "Lead", complete: "Complete" };

export default function ThmStatement() {
  const sb = useMemo(() => createClient(), []);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  useEffect(() => {
    sb.rpc("crew_thm_statement").then(({ data, error }) => { if (error || !data) setErr(true); else setD(data as Data); });
  }, [sb]);

  if (err) return null;
  if (!d) return <div className="text-sm text-neutral-500">Loading what you're owed…</div>;

  const open = d.jobs.filter((j) => !j.settled && j.lines.length > 0);
  const settled = d.jobs.filter((j) => j.settled);
  const anyEstimate = open.some((j) => j.estimate);

  return (
    <section>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">{d.net >= 0 ? "Isola owes THM" : "THM owes Isola"}</div>
        <div className="mt-1 text-4xl font-extrabold tabular-nums text-white">{usd(Math.abs(d.net))}</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-white/10 px-3 py-2">
            <div className="text-neutral-400">Owed to THM</div>
            <div className="font-semibold tabular-nums text-emerald-300">{usd(d.owed_to_thm)}</div>
          </div>
          <div className="rounded-lg border border-white/10 px-3 py-2">
            <div className="text-neutral-400">THM owes Isola</div>
            <div className="font-semibold tabular-nums text-white">{usd(d.owed_to_isola)}</div>
          </div>
        </div>
        {anyEstimate ? <p className="mt-2 text-xs text-amber-300">Jobs still going are estimates — the split is final at closeout.</p> : null}
        {d.waiting > 0 ? <p className="mt-1 text-xs text-amber-300">{usd(d.waiting)} in receipts waiting for Mike's OK — not counted yet.</p> : null}
      </div>

      <h2 className="mt-5 text-[11px] font-bold uppercase tracking-widest text-neutral-400">By job</h2>
      <div className="mt-2 space-y-3">
        {open.length === 0 ? <div className="rounded-xl border border-white/10 p-4 text-sm text-neutral-400">Nothing open right now.</div>
          : open.map((j) => <JobCard key={j.id} j={j} />)}
      </div>

      {settled.length ? (
        <div className="mt-5">
          <button onClick={() => setShowSettled(!showSettled)} className="flex w-full items-center justify-between text-[11px] font-bold uppercase tracking-widest text-neutral-400">
            <span>Settled — Invoice #94 ({settled.length})</span>
            <ChevronDown size={16} className={showSettled ? "rotate-180" : ""} />
          </button>
          {showSettled ? <div className="mt-2 space-y-3">{settled.map((j) => <JobCard key={j.id} j={j} />)}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

function JobCard({ j }: { j: Job }) {
  const toThm = j.direction === "isola_owes_thm";
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      <Link href={`/field/thm/${j.id}`} className="flex items-start gap-3 border-b border-white/10 px-4 py-3 hover:bg-white/[0.05]">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-white">{j.name}</div>
          <div className="truncate text-xs text-neutral-400">
            {[STAGE[j.status] ?? j.status, j.deal === "split" ? "50/50 of net" : "time + equipment",
              toThm ? "Isola pays THM" : "THM pays Isola", j.settled ? "settled" : j.estimate ? "estimate" : null].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-base font-extrabold tabular-nums ${toThm ? "text-emerald-300" : "text-white"}`}>{usd(j.total)}</div>
        </div>
        <ChevronRight size={16} className="mt-1 shrink-0 text-neutral-500" />
      </Link>
      <div className="divide-y divide-white/[0.06]">
        {j.lines.map((l, i) => (
          <div key={i} className={`flex items-start gap-3 px-4 py-2.5 ${l.pending ? "opacity-60" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-white">{l.label}{l.estimate && !l.pending ? <span className="ml-1.5 text-[11px] text-amber-300">est.</span> : null}</div>
              {l.detail ? <div className="text-xs text-neutral-400">{l.detail}</div> : null}
            </div>
            <div className={`shrink-0 text-sm font-semibold tabular-nums ${l.pending ? "text-neutral-500 line-through" : "text-white"}`}>{usd(l.amount)}</div>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="font-semibold text-neutral-300">{toThm ? "Owed to THM" : "THM owes Isola"}</span>
          <span className="font-extrabold tabular-nums text-white">{usd(j.total)}</span>
        </div>
      </div>
    </div>
  );
}
