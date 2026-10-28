"use client";
// v8.1 (10/28/26) the job's Field tab: Plans · RFIs · Submittals · Inspections (sub-tabs).
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import PlansPanel from "@/components/field/PlansPanel";
import RfiPanel from "@/components/field/RfiPanel";
import SubmittalsPanel from "@/components/field/SubmittalsPanel";
import InspectionsPanel from "@/components/field/InspectionsPanel";

const SUBS = [
  { k: "plans", label: "Plans" },
  { k: "rfis", label: "RFIs" },
  { k: "submittals", label: "Submittals" },
  { k: "inspections", label: "Inspections" },
] as const;
type Sub = (typeof SUBS)[number]["k"];

export default function FieldTab({ job }: { job: any }) {
  const sb = useMemo(() => createClient(), []);
  const [sub, setSub] = useState<Sub>("plans");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [bump, setBump] = useState(0);

  // open-item counts on the chips
  useEffect(() => {
    (async () => {
      const [p, r, s, i] = await Promise.all([
        sb.from("plan_pins").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("status", "open"),
        sb.from("rfis").select("id", { count: "exact", head: true }).eq("job_id", job.id).in("status", ["draft", "open"]),
        sb.from("submittals").select("id", { count: "exact", head: true }).eq("job_id", job.id).in("status", ["draft", "submitted", "revise_resubmit"]),
        sb.from("form_entries").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("status", "draft"),
      ]);
      setCounts({ plans: p.count ?? 0, rfis: r.count ?? 0, submittals: s.count ?? 0, inspections: i.count ?? 0 });
    })();
  }, [sb, job.id, sub, bump]);

  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
        {SUBS.map(({ k, label }) => (
          <button key={k} onClick={() => setSub(k)} aria-pressed={sub === k}
            className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold",
              sub === k ? "border-white bg-white text-neutral-950" : "border-white/10 text-neutral-400 hover:border-white/25 hover:text-white")}>
            {label}{counts[k] ? <span className={cn("tabular-nums", sub === k ? "text-neutral-500" : "text-amber-300")}>{counts[k]}</span> : null}
          </button>
        ))}
      </div>
      {sub === "plans" ? <PlansPanel jobId={job.id} onRfi={() => setBump((b) => b + 1)} />
        : sub === "rfis" ? <RfiPanel job={job} onCount={() => setBump((b) => b + 1)} />
        : sub === "submittals" ? <SubmittalsPanel job={job} />
        : <InspectionsPanel job={job} />}
    </div>
  );
}
