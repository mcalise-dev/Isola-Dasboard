import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import MyClock from "@/components/MyClock";

export default async function HomePage() {
  const supabase = await createClient();
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const aging = new Date(now); aging.setDate(aging.getDate() - 14);
  const agingCut = `${aging.getFullYear()}-${String(aging.getMonth() + 1).padStart(2, "0")}-${String(aging.getDate()).padStart(2, "0")}`;
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const [{ count: activeJobs }, { count: openTasks }, { data: dueTasks }, { count: contacts }, { data: due }, { data: mktDueRows }, { data: sched }, { data: agingProps }, { data: moneyRow }, { data: thmRows }] = await Promise.all([
    supabase.from("jobs").select("id", { count: "exact", head: true }).neq("status", "complete"),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("done", false),
    supabase.from("tasks").select("id").eq("done", false).lte("due_date", today),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("contacts").select("id,next_date,stage").lte("next_date", today),
    supabase.from("mkt_tasks").select("id").eq("done", false).lte("due_date", today),
    supabase.from("schedule_entries").select("id,label,job_id,jobs(job_name,customer,location,status)").eq("entry_date", today).order("sort"),
    supabase.from("jobs").select("id,customer,location,quoted_date").eq("proposal_status", "sent").neq("status", "complete").lte("quoted_date", agingCut),
    supabase.from("money_snapshot").select("data,updated_at").eq("id", 1),
    supabase.from("thm_ledger").select("side,amount,bucket,is_open"),
  ]);
  const snap: any = (moneyRow ?? [])[0]?.data ?? null;
  const snapDate: string | null = (moneyRow ?? [])[0]?.updated_at ?? null;
  const thmBal = (thmRows ?? []).filter((e: any) => e.bucket === "inv94" && !e.is_open).reduce((a: number, e: any) => a + (e.side === "owes_isola" ? 1 : -1) * Number(e.amount), 0);
  const fmt$ = (n: number) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const followupsDue = (due ?? []).filter((c: any) => !["Won", "Dead", "Client"].includes(c.stage)).length + (mktDueRows ?? []).length;
  const tasksDue = (dueTasks ?? []).length;
  const todaySched = (sched ?? []) as any[];
  const agingList = (agingProps ?? []) as any[];

  const tile = "rounded-xl border p-3 text-center";
  const appIcon = "flex flex-col items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-950 py-3.5 hover:border-neutral-500";
  const iconTxt = "text-2xl leading-none";
  const iconLbl = "text-[11px] font-semibold text-neutral-300";

  return (
    <div className="pt-4 space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">{greeting}, Mike</h1>
        <p className="text-sm text-neutral-500">{dateStr}</p>
      </div>

      <MyClock />

      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">Today</div>
        <div className="grid grid-cols-3 gap-2">
          <Link href="/marketing/campaign?due=1" className={`${tile} ${followupsDue ? "border-amber-500/50 bg-neutral-900" : "border-neutral-800 bg-neutral-900"} hover:border-amber-400`}>
            <div className={`text-2xl font-bold tabular-nums ${followupsDue ? "text-amber-300" : "text-white"}`}>{followupsDue}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500">Follow-ups due</div>
          </Link>
          <Link href="/tasks" className={`${tile} ${tasksDue ? "border-red-500/50 bg-neutral-900" : "border-neutral-800 bg-neutral-900"} hover:border-neutral-400`}>
            <div className={`text-2xl font-bold tabular-nums ${tasksDue ? "text-red-300" : "text-white"}`}>{tasksDue}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500">Tasks due</div>
          </Link>
          <Link href="/" className={`${tile} border-neutral-800 bg-neutral-900 hover:border-neutral-400`}>
            <div className="text-2xl font-bold tabular-nums text-white">{activeJobs ?? 0}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500">Active jobs</div>
          </Link>
        </div>
      </div>

      <Link href="/schedule" className="block rounded-2xl border border-neutral-800 bg-neutral-900/95 p-4 hover:border-neutral-600">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-extrabold tracking-widest text-white uppercase">📅 Today's Schedule</h2>
          <span className="text-xs text-blue-300 font-semibold">Open →</span>
        </div>
        {todaySched.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing scheduled today — tap to set up the week.</p>
        ) : (
          <div className="space-y-1.5">
            {todaySched.map((e: any) => (
              <div key={e.id} className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <span className="text-sm font-semibold text-white truncate">{e.jobs?.job_name ?? e.jobs?.customer ?? e.label}</span>
                {e.jobs?.location ? <span className="text-xs text-neutral-500 truncate">{e.jobs.location}</span> : null}
              </div>
            ))}
          </div>
        )}
      </Link>

      {agingList.length ? (
        <Link href="/proposals" className="block rounded-2xl border border-amber-500/40 bg-neutral-900/95 p-4 hover:border-amber-400">
          <div className="flex items-baseline justify-between mb-1.5">
            <h2 className="text-sm font-extrabold tracking-widest text-amber-300 uppercase">⚠️ Proposals aging</h2>
            <span className="text-xs text-neutral-500">14+ days, no answer</span>
          </div>
          <div className="text-sm text-neutral-300">
            {agingList.map((p: any) => `${p.customer}${p.location ? " (" + p.location + ")" : ""}`).join(" · ")}
          </div>
          <p className="text-xs text-neutral-500 mt-1">Proposals expire at 30 days — a quick check-in call keeps them alive.</p>
        </Link>
      ) : null}

      {snap ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/95 p-4">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-extrabold tracking-widest text-white uppercase">💵 <Link href="/money" className="hover:underline">Money</Link></h2>
            <span className="text-[10px] text-neutral-600">QuickBooks · {snapDate ? new Date(snapDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2.5">
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-center">
              <div className="text-xl font-extrabold tabular-nums text-white">{fmt$(snap.total_ar)}</div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mt-0.5">Owed to you</div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-center">
              <div className={`text-xl font-extrabold tabular-nums ${snap.overdue > 0 ? "text-amber-300" : "text-white"}`}>{fmt$(snap.overdue)}</div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mt-0.5">Overdue</div>
            </div>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-neutral-800 mb-1.5">
            {snap.buckets.current > 0 ? <div className="bg-emerald-400" style={{ width: (snap.buckets.current / snap.total_ar) * 100 + "%" }} /> : null}
            {snap.buckets.d1_30 > 0 ? <div className="bg-yellow-400" style={{ width: (snap.buckets.d1_30 / snap.total_ar) * 100 + "%" }} /> : null}
            {snap.buckets.d31_60 > 0 ? <div className="bg-amber-400" style={{ width: (snap.buckets.d31_60 / snap.total_ar) * 100 + "%" }} /> : null}
            {snap.buckets.d61_90 > 0 ? <div className="bg-orange-400" style={{ width: (snap.buckets.d61_90 / snap.total_ar) * 100 + "%" }} /> : null}
            {snap.buckets.d91_plus > 0 ? <div className="bg-red-400" style={{ width: (snap.buckets.d91_plus / snap.total_ar) * 100 + "%" }} /> : null}
          </div>
          <div className="text-[10px] text-neutral-500 mb-2.5">🟢 current · 🟡 1–30 · 🟠 31–90 · 🔴 91+ days</div>
          <div className="space-y-1">
            {(snap.invoices ?? []).filter((i: any) => i.days_overdue > 0).slice(0, 3).map((i: any, idx: number) => (
              <div key={idx} className="flex justify-between text-xs">
                <span className="text-neutral-300 truncate">{i.customer}</span>
                <span className="shrink-0 text-neutral-400 tabular-nums">{fmt$(i.amount)} · {i.days_overdue}d late</span>
              </div>
            ))}
          </div>
          <Link href="/thm" className="mt-2.5 flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 hover:border-neutral-600">
            <span className="text-xs font-semibold text-white">🤝 THM tab — Invoice #94</span>
            <span className="text-xs font-bold text-white tabular-nums">{fmt$(thmBal)} →</span>
          </Link>
          <p className="text-[10px] text-neutral-600 mt-2">Ask Claude to "refresh the money panel" to pull the latest from QuickBooks.</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/95 p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-extrabold tracking-widest text-white uppercase">Operations</h2>
          <span className="text-xs text-neutral-500">{openTasks ?? 0} open tasks</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Link href="/" className={appIcon}><span className={iconTxt}>🗂️</span><span className={iconLbl}>Jobs</span></Link>
          <Link href="/schedule" className={appIcon}><span className={iconTxt}>📅</span><span className={iconLbl}>Schedule</span></Link>
          <Link href="/costs" className={appIcon}><span className={iconTxt}>🧾</span><span className={iconLbl}>Costs</span></Link>
          <Link href="/tasks" className={appIcon}><span className={iconTxt}>✅</span><span className={iconLbl}>Tasks</span></Link>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-2">
          <Link href="/proposals" className={appIcon}><span className={iconTxt}>📤</span><span className={iconLbl}>Proposals</span></Link>
          <Link href="/money" className={appIcon}><span className={iconTxt}>💵</span><span className={iconLbl}>Money</span></Link>
          <Link href="/visits" className={appIcon}><span className={iconTxt}>📍</span><span className={iconLbl}>Visits</span></Link>
          <Link href="/mail" className={appIcon}><span className={iconTxt}>✉️</span><span className={iconLbl}>Mail</span></Link>
          <Link href="/thm" className={appIcon}><span className={iconTxt}>🤝</span><span className={iconLbl}>THM</span></Link>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/95 p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-extrabold tracking-widest text-white uppercase">Marketing</h2>
          <span className="text-xs text-neutral-500">{contacts ?? 0} contacts</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Link href="/marketing" className={appIcon}><span className={iconTxt}>📇</span><span className={iconLbl}>CRM</span></Link>
          <Link href="/marketing/campaign" className={appIcon}><span className={iconTxt}>📣</span><span className={iconLbl}>Campaign</span></Link>
          <Link href="/marketing/tasks" className={appIcon}><span className={iconTxt}>📋</span><span className={iconLbl}>Mkt tasks</span></Link>
        </div>
      </div>
    </div>
  );
}
