"use client";
// v8.0 (10/28/26) Projects: start a new project, and every active project (booked + in progress)
// in one clean list. Selling-side work (leads, quotes, sent) lives on Pipeline.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { STATUS_META, stageTag, fmtPrice, parsePrice, revenueOf } from "@/lib/format";
import { editJob } from "@/components/job/JobForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Empty, Progress, Stat } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { Plus, Search, Briefcase, Star, ChevronRight } from "lucide-react";

const price = (j: any) => Number(j.price_amount) || parsePrice(j.price);

export default function ProjectsScreen() {
  const sb = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [spent, setSpent] = useState<Record<string, number>>({});
  const [scheduled, setScheduled] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  async function load() {
    const [j, c, se] = await Promise.all([
      sb.from("jobs").select("*").in("status", ["booked", "progress"]).order("priority", { ascending: false }).order("start_date", { ascending: true, nullsFirst: false }),
      sb.from("job_costs").select("job_id,amount"),
      sb.from("schedule_entries").select("job_id"),
    ]);
    const s: Record<string, number> = {};
    (c.data ?? []).forEach((r: any) => { if (r.job_id) s[r.job_id] = (s[r.job_id] ?? 0) + Number(r.amount ?? 0); });
    setSpent(s);
    setScheduled(new Set((se.data ?? []).map((r: any) => r.job_id).filter(Boolean)));
    setJobs(j.data ?? []);
  }
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("isola:changed", on);
    return () => window.removeEventListener("isola:changed", on);
    // eslint-disable-next-line
  }, []);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (jobs ?? []).filter((j) => !words.length || words.every((w) => `${j.job_name ?? ""} ${j.customer} ${j.location ?? ""} ${j.job ?? ""}`.toLowerCase().includes(w)));
  const going = shown.filter((j) => j.status === "progress");
  const next = shown.filter((j) => j.status === "booked");
  const backlog = (jobs ?? []).reduce((a, j) => a + revenueOf(j), 0);

  const newProject = () => editJob({ status: "booked" });

  return (
    <div className="pb-28">
      <PageHeader title="Projects" sub={jobs ? `${jobs.length} active${backlog ? ` · $${Math.round(backlog).toLocaleString()} on the books` : ""}` : "Loading…"}
        actions={<Button onClick={newProject}><Plus size={16} /> New project</Button>} />

      {jobs && jobs.length ? (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <Stat label="In progress" value={(jobs ?? []).filter((j) => j.status === "progress").length} />
          <Stat label="Booked, up next" value={(jobs ?? []).filter((j) => j.status === "booked").length} />
        </div>
      ) : null}

      {jobs && jobs.length > 4 ? (
        <div className="relative mb-4 md:w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a project…" className="h-9 pl-9" />
        </div>
      ) : null}

      {jobs === null ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div>
      ) : jobs.length === 0 ? (
        <Empty icon={<Briefcase size={28} />} title="No active projects."
          body="A job lands here once it's booked. Start one from scratch, or mark a sent proposal Booked on the Pipeline."
          action={<Button onClick={newProject}><Plus size={16} /> New project</Button>} />
      ) : (
        <div className="space-y-6">
          <Group title="In progress" jobs={going} spent={spent} scheduled={scheduled} />
          <Group title="Booked — up next" jobs={next} spent={spent} scheduled={scheduled} />
          {!going.length && !next.length ? <p className="text-sm text-neutral-500">No projects match “{q}”.</p> : null}
        </div>
      )}
    </div>
  );
}

function Group({ title, jobs, spent, scheduled }: { title: string; jobs: any[]; spent: Record<string, number>; scheduled: Set<string> }) {
  if (!jobs.length) return null;
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-neutral-500">{title} <span className="text-neutral-600">{jobs.length}</span></h2>
      <div className="grid gap-2 md:grid-cols-2">
        {jobs.map((j) => {
          const p = price(j), s = spent[j.id] ?? 0;
          const pct = p ? Math.round((s / p) * 100) : 0;
          const tag = stageTag(j, { scheduled: scheduled.has(j.id) });
          return (
            <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-white/25 active:bg-white/[0.04]">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-white">{j.priority ? <Star size={13} className="mr-1 inline fill-amber-300 text-amber-300" /> : null}{j.job_name || j.customer}</div>
                <div className="truncate text-xs text-neutral-500">{[j.job_name ? j.customer : null, j.location].filter(Boolean).join(" · ") || STATUS_META[j.status]?.label}</div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  {tag ? <span className={cn("font-semibold", tag.cls)}>{tag.text}</span> : null}
                  {s ? <span className="tabular-nums text-neutral-500">· ${Math.round(s).toLocaleString()} spent{p ? ` (${pct}%)` : ""}</span> : null}
                </div>
                {p && s ? <Progress className="mt-1.5" value={pct} tone={pct >= 90 ? "bad" : pct >= 70 ? "warn" : "ok"} /> : null}
              </div>
              <div className="shrink-0 text-right">
                {j.price ? <div className="text-sm font-semibold tabular-nums text-white">{fmtPrice(j.price)}</div> : null}
              </div>
              <ChevronRight size={16} className="shrink-0 text-neutral-600" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
