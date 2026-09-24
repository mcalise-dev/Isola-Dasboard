"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { parsePrice, daysSince } from "@/lib/format";

// Pipeline numbers (v4.1, 9/22/26) — is pricing holding, and where is the money sitting.
// Everything is computed from the jobs rows you pass in, so it's always in step with the list.
const fmt$ = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const val = (j: any) => Number(j.price_amount) || parsePrice(j.price);
const dayDiff = (a: string, b: string) => Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86400000);

export function pipelineStats(jobs: any[]) {
  const sent = jobs.filter((j) => j.status === "awaiting");
  const toQuote = jobs.filter((j) => j.status === "lead");
  const backlog = jobs.filter((j) => j.status === "booked" || j.status === "progress");
  const since = new Date(); since.setDate(since.getDate() - 180);
  const cut = since.toISOString().slice(0, 10);
  // Decided proposals in the last 6 months: won = moved from selling into work; lost = Lost.
  const won = jobs.filter((j) => j.won_date && j.won_date >= cut);
  const lost = jobs.filter((j) => j.status === "lost" && (j.lost_date ?? "") >= cut);
  const decided = won.length + lost.length;
  const winRate = decided ? Math.round((won.length / decided) * 100) : null;
  const wonDollars = won.reduce((a, j) => a + val(j), 0);
  const lostDollars = lost.reduce((a, j) => a + val(j), 0);
  const closeDays = won.filter((j) => j.quoted_date).map((j) => Math.max(0, dayDiff(j.quoted_date, j.won_date)));
  const avgClose = closeDays.length ? Math.round(closeDays.reduce((a, b) => a + b, 0) / closeDays.length) : null;
  const avgOut = sent.length ? Math.round(sent.reduce((a, j) => a + daysSince(j.quoted_date), 0) / sent.length) : null;
  const reasons: Record<string, number> = {};
  lost.forEach((j) => { const r = j.lost_reason || "No reason given"; reasons[r] = (reasons[r] ?? 0) + 1; });
  const topReasons = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const month = new Date().toISOString().slice(0, 7);
  const collectedMonth = jobs.filter((j) => (j.paid_date ?? "").startsWith(month)).reduce((a, j) => a + (Number(j.paid_amount) || val(j)), 0);
  return {
    sentN: sent.length, sent$: sent.reduce((a, j) => a + val(j), 0), avgOut,
    toQuoteN: toQuote.length, toQuote$: toQuote.reduce((a, j) => a + val(j), 0),
    backlogN: backlog.length, backlog$: backlog.reduce((a, j) => a + val(j), 0),
    wonN: won.length, lostN: lost.length, winRate, wonDollars, lostDollars, avgClose, topReasons, collectedMonth,
  };
}

export default function PipelineNumbers({ jobs, compact = false }: { jobs: any[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { try { setOpen(localStorage.getItem("isola.numbers") === "1"); } catch {} }, []);
  const toggle = () => setOpen((o) => { try { localStorage.setItem("isola.numbers", o ? "0" : "1"); } catch {} return !o; });
  const s = pipelineStats(jobs);

  const tile = "rounded-xl bg-white/[0.05] p-2.5";
  const big = "text-lg font-extrabold tabular-nums text-white leading-none";
  const small = "mt-1 text-sm text-neutral-400 leading-tight";

  if (compact) {
    return (
      <Link href="/" className="block rounded-2xl border border-white/[0.07] bg-neutral-900/95 p-4 hover:border-neutral-600">
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className="text-sm font-extrabold text-white">Pipeline</h2>
          <span className="text-xs text-neutral-300 font-semibold">Jobs →</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className={tile}><div className={big}>{fmt$(s.sent$)}</div><div className={small}>In Sent · {s.sentN}</div></div>
          <div className={tile}><div className={big}>{fmt$(s.backlog$)}</div><div className={small}>Booked work</div></div>
          <div className={tile}><div className={big}>{s.winRate == null ? "—" : s.winRate + "%"}</div><div className={small}>Win rate</div></div>
        </div>
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.07] bg-neutral-900 mb-4 overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left">
        <span className="text-xs text-neutral-500 w-3">{open ? "▾" : "▸"}</span>
        <span className="text-sm font-semibold text-neutral-300">Numbers</span>
        <span className="ml-auto text-xs text-neutral-400 tabular-nums">{fmt$(s.sent$)} in Sent · {s.winRate == null ? "win rate —" : `${s.winRate}% won`}</span>
      </button>
      {open ? (
        <div className="px-3.5 pb-3.5 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className={tile}><div className={big}>{fmt$(s.sent$)}</div><div className={small}>Waiting on answers · {s.sentN}</div></div>
            <div className={tile}><div className={big}>{fmt$(s.backlog$)}</div><div className={small}>Booked / in progress · {s.backlogN}</div></div>
            <div className={tile}><div className={big}>{fmt$(s.collectedMonth)}</div><div className={small}>Collected this month</div></div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className={tile}>
              <div className={big}>{s.winRate == null ? "—" : s.winRate + "%"}</div>
              <div className={small}>Win rate · {s.wonN} won / {s.lostN} lost</div>
            </div>
            <div className={tile}><div className={big}>{s.avgClose == null ? "—" : s.avgClose + "d"}</div><div className={small}>Sent → yes, average</div></div>
            <div className={tile}><div className={`${big} ${s.avgOut != null && s.avgOut > 14 ? "text-amber-300" : ""}`}>{s.avgOut == null ? "—" : s.avgOut + "d"}</div><div className={small}>Avg age of Sent</div></div>
          </div>
          <div className={tile}>
            <div className="text-sm font-semibold text-neutral-300 mb-1">Why jobs are lost</div>
            {s.topReasons.length ? s.topReasons.map(([r, n]) => (
              <div key={r} className="flex justify-between text-xs text-neutral-300"><span>{r}</span><span className="tabular-nums text-neutral-400">{n}</span></div>
            )) : <div className="text-xs text-neutral-400">Nothing marked lost yet. Mark declined work Lost with a reason and this fills in.</div>}
            {s.lostDollars ? <div className="mt-1 text-xs text-neutral-400">{fmt$(s.lostDollars)} lost vs {fmt$(s.wonDollars)} won (last 6 months)</div> : null}
          </div>
          <p className="text-xs text-neutral-500">Win rate and close time count proposals decided in the last 6 months, starting 9/22/26. They get sharper as more jobs move through Sent.</p>
        </div>
      ) : null}
    </div>
  );
}
