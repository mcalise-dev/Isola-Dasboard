"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ChevronRight } from "lucide-react";

type J = { id: string; name: string; location: string | null; status: string; holder: string; start: string | null };
const STAGE: Record<string, string> = { progress: "In progress", booked: "Booked", future: "Future", awaiting: "Quoted", lead: "Lead", complete: "Complete" };

export default function ThmJobList() {
  const sb = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<J[] | null>(null);
  useEffect(() => { sb.rpc("crew_thm_job_list").then(({ data }) => setJobs((data as J[]) ?? [])); }, [sb]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">THM jobs</h1>
      <p className="text-sm text-neutral-400">Every job THM is on — open one to see the money and log crew, materials, tools and to-dos.</p>
      <div className="mt-4 space-y-2">
        {jobs === null ? <div className="text-sm text-neutral-500">Loading…</div>
          : jobs.length === 0 ? <div className="rounded-xl border border-white/10 p-4 text-sm text-neutral-400">No THM jobs right now.</div>
          : jobs.map((j) => (
            <Link key={j.id} href={`/field/thm/${j.id}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 hover:bg-white/[0.06]">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-white">{j.name}</div>
                <div className="truncate text-xs text-neutral-400">
                  {[STAGE[j.status] ?? j.status, j.holder === "thm" ? "THM's contract" : "Isola's contract", j.location].filter(Boolean).join(" · ")}
                </div>
              </div>
              <ChevronRight size={18} className="shrink-0 text-neutral-500" />
            </Link>
          ))}
      </div>
    </div>
  );
}
