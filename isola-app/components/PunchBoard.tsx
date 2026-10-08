"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, jobLabel } from "@/lib/format";
import { SwipeRow } from "@/components/ui/swipe-row";

/* Every open punch item across all jobs, grouped by job, worst first.
   Open items are what stand between a finished job and final payment. */

const card = "rounded-xl bg-white/[0.05] p-3.5";

export default function PunchBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<any[]>([]);
  const [jobs, setJobs] = useState<Record<string, any>>({});
  const [shares, setShares] = useState<Record<string, any>>({});
  const [showDone, setShowDone] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    // photos stay out of this query — they're viewed on the job itself
    const q = supabase.from("punch_list").select("id,job_id,item,priority,due_date,done,done_at,raised_by,added_via,created_at").order("created_at", { ascending: false });
    const { data: p } = showDone ? await q.limit(400) : await q.eq("done", false);
    const ids = Array.from(new Set((p ?? []).map((x: any) => x.job_id)));
    const [j, s] = ids.length
      ? await Promise.all([
          supabase.from("jobs").select("id,job_name,customer,location,job,status").in("id", ids),
          supabase.from("punch_shares").select("job_id,signed_off_by,signed_off_at,viewed_at").in("job_id", ids),
        ])
      : [{ data: [] }, { data: [] }];
    setItems(p ?? []);
    setJobs(Object.fromEntries((j.data ?? []).map((x: any) => [x.id, x])));
    setShares(Object.fromEntries((s.data ?? []).map((x: any) => [x.job_id, x])));
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showDone]);

  async function toggle(t: any) {
    const done = !t.done;
    setItems(items.map((x) => (x.id === t.id ? { ...x, done } : x)));
    await supabase.from("punch_list").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", t.id);
  }

  const today = new Date().toISOString().slice(0, 10);
  const groups = useMemo(() => {
    const by: Record<string, any[]> = {};
    for (const it of items) (by[it.job_id] ||= []).push(it);
    const score = (list: any[]) => {
      const open = list.filter((x) => !x.done);
      return open.filter((x) => x.due_date && x.due_date < today).length * 100 + open.filter((x) => x.priority === "high").length * 10 + open.length;
    };
    return Object.entries(by).sort((a, b) => score(b[1]) - score(a[1]));
  }, [items, today]);

  const openCount = items.filter((x) => !x.done).length;
  const overdue = items.filter((x) => !x.done && x.due_date && x.due_date < today).length;
  const fromClient = items.filter((x) => !x.done && x.added_via === "client").length;

  if (loading) return <div className="space-y-2" aria-busy="true"><div className="skeleton h-16" /><div className="skeleton h-16" /></div>;

  return (
    <div className="pb-28 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">Punch list</h1>
          <p className="text-xs text-neutral-400">Open items on every job — what's holding up final payment</p>
        </div>
        <button onClick={() => setShowDone(!showDone)} className="rounded-lg border border-neutral-700 px-3 py-2 text-xs font-semibold text-neutral-200">
          {showDone ? "Hide done" : "Show done"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className={card}><div className="text-xl font-bold text-white">{openCount}</div><div className="text-xs text-neutral-400">Open items</div></div>
        <div className={card}><div className={`text-xl font-bold ${overdue ? "text-red-400" : "text-white"}`}>{overdue}</div><div className="text-xs text-neutral-400">Overdue</div></div>
        <div className={card}><div className={`text-xl font-bold ${fromClient ? "text-sky-300" : "text-white"}`}>{fromClient}</div><div className="text-xs text-neutral-400">From clients</div></div>
      </div>

      {groups.map(([jobId, list]) => {
        const j = jobs[jobId];
        const sh = shares[jobId];
        const open = list.filter((x) => !x.done);
        return (
          <div key={jobId} className={card + " space-y-2"}>
            <div className="flex items-start justify-between gap-2">
              <Link href={`/jobs/${jobId}`} className="min-w-0">
                <div className="truncate text-sm font-semibold text-white hover:underline">{j ? jobLabel(j) : "Job"}</div>
                <div className="truncate text-xs text-neutral-400">{[j?.customer, j?.location].filter(Boolean).join(" · ")}</div>
              </Link>
              <div className="shrink-0 text-right text-xs">
                <div className="font-semibold text-neutral-200">{open.length} open</div>
                {sh?.signed_off_at ? <div className="text-emerald-400">signed off</div> : sh ? <div className="text-neutral-500">{sh.viewed_at ? "client viewed" : "link sent"}</div> : null}
              </div>
            </div>
            <div className="space-y-1">
              {list.map((t) => {
                const late = !t.done && t.due_date && t.due_date < today;
                return (
                  <SwipeRow key={t.id} className="rounded-md"
                    right={{ label: t.done ? "Reopen" : "Done", tone: "success", onCommit: () => toggle(t) }}>
                  <div className="flex items-start gap-2.5 py-0.5">
                    <button onClick={() => toggle(t)}
                      className={`shrink-0 mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center text-xs ${t.done ? "bg-emerald-400 border-emerald-400 text-neutral-900" : "border-neutral-600 text-transparent"}`}>✓</button>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm ${t.done ? "text-neutral-500 line-through" : "text-neutral-100"}`}>
                        {t.priority === "high" && !t.done ? <span className="text-amber-300 mr-1">!</span> : null}{t.item}
                      </div>
                      <div className="flex flex-wrap gap-x-2 text-xs text-neutral-500">
                        {t.added_via === "client" ? <span className="text-sky-300">from client</span> : null}
                        {t.raised_by ? <span>{t.raised_by}</span> : null}
                        {t.due_date ? <span className={late ? "text-red-400 font-semibold" : ""}>due {fmtDate(t.due_date)}</span> : null}
                      </div>
                    </div>
                  </div>
                  </SwipeRow>
                );
              })}
            </div>
          </div>
        );
      })}

      {groups.length === 0 ? (
        <div className={card}>
          <div className="text-sm font-semibold text-white">{showDone ? "No punch items yet." : "Nothing open. Every job is clear."}</div>
          <p className="mt-1 text-xs text-neutral-400">Add items from a job's Tasks section, or send the property manager the client link so they can add their own.</p>
        </div>
      ) : null}
    </div>
  );
}
