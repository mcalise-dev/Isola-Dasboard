"use client";
import { useEffect, useMemo, useState } from "react";
import { undoable, showError } from "@/components/Toaster";
import { createClient } from "@/lib/supabase/client";
import { Job, jobLabel } from "@/lib/format";
import { withTimeout, firstError } from "@/lib/load";
import JobPicker from "@/components/JobPicker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionTitle, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { Check, X, Plus, ListChecks, ChevronDown, ChevronUp } from "lucide-react";

type Task = {
  id: string;
  title: string;
  job_id: string | null;
  done: boolean;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  timeframe: string | null;
  created_at: string;
  completed_at: string | null;
};

const TIMEFRAMES = ["Short term", "Long term", "Ongoing", "Someday"];
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDue = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const PRIO_VARIANT: Record<string, "danger" | "warning" | "muted"> = {
  high: "danger",
  medium: "warning",
  low: "muted",
};
const PRIO_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function TasksTab() {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState("");
  const [prio, setPrio] = useState("medium");
  const [jobId, setJobId] = useState("");
  const [when, setWhen] = useState("");
  const [due, setDue] = useState("");

  async function load() {
    setErr(null);
    try {
      const [t, j] = await withTimeout(Promise.all([
        supabase.from("tasks").select("*").order("created_at", { ascending: false }),
        supabase.from("jobs").select("id,job_name,customer,location,job,status,paid_date,priority").order("customer"),
      ]));
      const e = firstError(t, j);
      if (e) throw new Error(e);
      setTasks((t.data as Task[]) ?? []);
      setJobs((j.data as unknown as Job[]) ?? []);
      setLoading(false);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? "Couldn't load tasks.");
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);
  const sortKey = (t: Task) => (t.due_date ? "0" + t.due_date : t.timeframe === "Short term" ? "1" : t.timeframe === "Ongoing" ? "2" : t.timeframe === "Long term" ? "3" : t.timeframe === "Someday" ? "4" : "2z");
  const openTasks = tasks.filter((t) => !t.done).sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority]);
  const doneTasks = tasks.filter((t) => t.done);
  const sections = useMemo(() => {
    const today = todayISO();
    const buckets: { key: string; label: string; cls: string; items: Task[] }[] = [
      { key: "overdue", label: "Overdue", cls: "text-red-300", items: [] },
      { key: "today", label: "Today", cls: "text-amber-300", items: [] },
      { key: "upcoming", label: "Upcoming", cls: "text-white", items: [] },
      { key: "Short term", label: "Short term", cls: "text-white", items: [] },
      { key: "Ongoing", label: "Ongoing", cls: "text-white", items: [] },
      { key: "Long term", label: "Long term", cls: "text-white", items: [] },
      { key: "Someday", label: "Someday", cls: "text-neutral-300", items: [] },
      { key: "nodate", label: "No date", cls: "text-neutral-300", items: [] },
    ];
    const find = (k: string) => buckets.find((b) => b.key === k)!;
    openTasks.forEach((t) => {
      if (t.due_date) {
        if (t.due_date < today) find("overdue").items.push(t);
        else if (t.due_date === today) find("today").items.push(t);
        else find("upcoming").items.push(t);
      } else if (t.timeframe && buckets.some((b) => b.key === t.timeframe)) find(t.timeframe).items.push(t);
      else find("nodate").items.push(t);
    });
    return buckets.filter((b) => b.items.length);
  }, [openTasks]);

  const countOf = (k: string) => sections.find((s) => s.key === k)?.items.length ?? 0;
  const jumpTo = (k: string) => document.getElementById(`tasks-${k}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  async function add() {
    if (!title.trim()) return;
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(), priority: prio, job_id: jobId || null,
      due_date: when === "date" && due ? due : null,
      timeframe: when && when !== "date" ? when : null,
    });
    if (error) { showError("Add failed: " + error.message); return; }
    setTitle(""); setJobId(""); setWhen(""); setDue("");
    load();
  }

  async function toggle(t: Task) {
    await supabase.from("tasks").update({ done: !t.done, completed_at: !t.done ? new Date().toISOString() : null }).eq("id", t.id);
    load();
  }

  function remove(t: Task) {
    const prev = tasks;
    undoable({
      text: "Task deleted",
      hide: () => setTasks(prev.filter((x) => x.id !== t.id)),
      restore: () => setTasks(prev),
      commit: async () => { await supabase.from("tasks").delete().eq("id", t.id); load(); },
    });
  }

  function row(t: Task) {
    return (
      <Card key={t.id} className="flex min-h-[56px] items-center gap-3 px-3 py-2.5">
        <button onClick={() => toggle(t)} aria-label="Toggle done"
          className="-m-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-accent">
          <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border", t.done ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300" : "border-neutral-600 text-transparent hover:text-neutral-500")}>
            <Check size={13} strokeWidth={3} />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm", t.done ? "text-neutral-400 line-through" : "font-medium text-white")}>{t.title}</div>
          <div className="truncate text-xs text-neutral-400">
            {t.due_date ? (
              <span className={!t.done && t.due_date <= todayISO() ? "font-semibold text-red-300" : "text-neutral-400"}>
                {!t.done && t.due_date < todayISO() ? "Overdue · " : "Due "}{fmtDue(t.due_date)}
              </span>
            ) : t.timeframe ? <span>{t.timeframe}</span> : null}
            {t.job_id && jobById[t.job_id] ? <span>{(t.due_date || t.timeframe) ? " · " : ""}<a href={`/?job=${t.job_id}`} className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-200">{jobLabel(jobById[t.job_id])}</a></span> : null}
            {(t as any).auto_key ? <Badge variant="muted" className="ml-1.5 px-1.5 py-0 text-[11px]">auto</Badge> : null}
          </div>
        </div>
        {!t.done ? <Badge variant={PRIO_VARIANT[t.priority] ?? "muted"} className="shrink-0 capitalize">{t.priority}</Badge> : null}
        <Button variant="ghost" size="icon" onClick={() => remove(t)} aria-label="Delete" className="shrink-0 text-neutral-500 hover:text-red-300">
          <X size={16} />
        </Button>
      </Card>
    );
  }

  const header = (
    <PageHeader
      title="Tasks"
      sub={loading ? "Loading…" : `${openTasks.length} open${countOf("overdue") ? ` · ${countOf("overdue")} overdue` : ""} · tasks with a date also show on the calendar`}
    />
  );

  if (err) return <div>{header}<LoadError message={err} onRetry={load} /></div>;

  return (
    <div>
      {header}

      {!loading ? (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Overdue" value={countOf("overdue")} tone={countOf("overdue") ? "bad" : undefined} onClick={countOf("overdue") ? () => jumpTo("overdue") : undefined} />
          <Stat label="Due today" value={countOf("today")} tone={countOf("today") ? "warn" : undefined} onClick={countOf("today") ? () => jumpTo("today") : undefined} />
          <Stat label="Open" value={openTasks.length} />
          <Stat label="Completed" value={doneTasks.length} tone={doneTasks.length ? "ok" : undefined} onClick={doneTasks.length ? () => setShowDone(true) : undefined} />
        </div>
      ) : null}

      <Card className="mb-6 space-y-2.5 p-3.5">
        <Input placeholder="New task…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px_minmax(0,220px)_auto_auto]">
          <JobPicker jobs={jobs} value={jobId} onChange={setJobId} className="min-w-0" />
          <NativeSelect value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Priority">
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </NativeSelect>
          <NativeSelect className="min-w-0" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="When">
            <option value="">When? (optional)</option>
            <option value="date">Specific date…</option>
            {TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </NativeSelect>
          {when === "date" ? <Input type="date" className="md:w-auto" value={due} onChange={(e) => setDue(e.target.value)} /> : <span className="hidden md:block" />}
          <Button onClick={add} disabled={!title.trim()}><Plus size={16} /> Add</Button>
        </div>
      </Card>

      {loading ? <ListSkeleton /> : null}
      <div className="space-y-6">
        {sections.map((s) => (
          <section key={s.key} id={`tasks-${s.key}`} className="scroll-mt-20">
            <SectionTitle>
              <span className={s.cls}>{s.label}</span>
              <span className="ml-1.5 text-sm font-normal text-neutral-500">{s.items.length}</span>
            </SectionTitle>
            <div className="grid gap-2 md:grid-cols-2">{s.items.map(row)}</div>
          </section>
        ))}
      </div>
      {!loading && openTasks.length === 0 ? (
        <Empty icon={<ListChecks size={26} />} title="Nothing open" body="Add a task above. Tasks with a due date also land on the calendar." />
      ) : null}

      {doneTasks.length ? (
        <div className="mt-8">
          <Button variant="ghost" size="sm" onClick={() => setShowDone(!showDone)} className="-ml-2 text-neutral-400">
            {showDone ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {showDone ? "Hide" : "Show"} completed ({doneTasks.length})
          </Button>
          {showDone ? <div className="mt-2.5 grid gap-2 md:grid-cols-2">{doneTasks.map(row)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
