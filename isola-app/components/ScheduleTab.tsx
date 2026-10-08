"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Job, STATUS_META, todayISO } from "@/lib/format";
import { withTimeout, firstError } from "@/lib/load";
import { showError, undoable } from "@/components/Toaster";
import JobPicker from "@/components/JobPicker";
import CalendarLinkCard from "@/components/CalendarLinkCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionTitle, Stat, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X, Check, Navigation, Plus, Star, CalendarDays, ListChecks } from "lucide-react";

type Entry = {
  id: string;
  entry_date: string;
  job_id: string | null;
  label: string | null;
  notes: string | null;
  assignee: string | null;
};

const DOT: Record<string, string> = {
  lead: "bg-neutral-400",
  awaiting: "bg-neutral-400",
  booked: "bg-neutral-400",
  progress: "bg-amber-400",
  complete: "bg-emerald-400",
  lost: "bg-red-500/60",
};

const CHIP: Record<string, string> = {
  lead: "bg-neutral-500/25 text-neutral-200",
  awaiting: "bg-neutral-500/25 text-neutral-200",
  booked: "bg-neutral-500/25 text-neutral-200",
  progress: "bg-amber-500/25 text-amber-200",
  complete: "bg-emerald-500/25 text-emerald-200",
};

// stable per-name color so a crew member reads the same everywhere
const CREW_CLS = [
  "bg-neutral-500/20 text-neutral-200 border-neutral-500/40",
  "bg-neutral-500/20 text-neutral-200 border-neutral-500/40",
  "bg-neutral-500/20 text-neutral-200 border-neutral-500/40",
  "bg-amber-500/20 text-amber-200 border-amber-500/40",
  "bg-neutral-500/20 text-neutral-200 border-neutral-500/40",
];
const crewCls = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CREW_CLS[h % CREW_CLS.length];
};

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function ScheduleTab() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
  const [year, setYear] = useState(ty);
  const [month, setMonth] = useState(tm); // 0-indexed
  const [entries, setEntries] = useState<Entry[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [crew, setCrew] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>(today);
  const [addJobId, setAddJobId] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addWho, setAddWho] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filterWho, setFilterWho] = useState("");
  const [dueTasks, setDueTasks] = useState<any[]>([]);
  const [everScheduled, setEverScheduled] = useState<Set<string>>(new Set());

  const monthStart = iso(year, month, 1);
  const monthEnd = iso(year, month, new Date(year, month + 1, 0).getDate());

  async function load() {
    setErr(null);
    try {
      const [esR, jsR, wsR, tsR, allR] = await withTimeout(Promise.all([
        supabase.from("schedule_entries").select("*").gte("entry_date", monthStart).lte("entry_date", monthEnd).order("sort").order("created_at"),
        supabase.from("jobs").select("*").order("priority", { ascending: false }).order("updated_at", { ascending: false }),
        supabase.from("workers").select("name,active").eq("active", true).order("name"),
        // tasks with a due date show on the calendar, so Tasks and Schedule are one list
        supabase.from("tasks").select("id,title,due_date,job_id,done,priority").not("due_date", "is", null).lte("due_date", monthEnd).eq("done", false),
        supabase.from("schedule_entries").select("job_id").not("job_id", "is", null),
      ]));
      const e = firstError(esR, jsR, wsR, tsR, allR);
      if (e) throw new Error(e);
      const es = esR.data, js = jsR.data, ws = wsR.data, ts = tsR.data, allSe = allR.data;
      setDueTasks(ts ?? []);
      setEverScheduled(new Set((allSe ?? []).map((r: any) => r.job_id)));
      setEntries((es as Entry[]) ?? []);
      setJobs((js as Job[]) ?? []);
      setCrew(ws ?? []);
      setLoading(false);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? "Couldn't load the calendar.");
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year, month]);

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);
  const activeJobs = jobs.filter((j) => j.status !== "complete");
  const visible = useMemo(
    () => (filterWho ? entries.filter((e) => (e.assignee ?? "").split(",").some((n) => n.trim().toLowerCase() === filterWho.toLowerCase())) : entries),
    [entries, filterWho]
  );
  const byDate = useMemo(() => {
    const m: Record<string, Entry[]> = {};
    visible.forEach((e) => { (m[e.entry_date] = m[e.entry_date] ?? []).push(e); });
    return m;
  }, [visible]);

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  async function addEntry() {
    if (!addJobId && !addLabel.trim()) return;
    setBusy(true);
    const payload: any = { entry_date: selected, assignee: addWho || null };
    if (addJobId) payload.job_id = addJobId;
    else payload.label = addLabel.trim();
    const { error } = await supabase.from("schedule_entries").insert(payload);
    setBusy(false);
    if (error) { showError("Add failed: " + error.message); return; }
    await stampStart(addJobId, selected);
    setAddJobId(""); setAddLabel("");
    load();
  }

  // first time a booked job lands on the calendar, that day becomes its start date
  // (the database then closes the "Set a start date" task on its own)
  async function stampStart(jobId: string, day: string) {
    const j = jobId ? jobById[jobId] : null;
    if (j && !j.start_date && (j.status === "booked" || j.status === "progress")) {
      await supabase.from("jobs").update({ start_date: day, updated_at: new Date().toISOString() }).eq("id", jobId);
    }
  }

  async function scheduleJob(jobId: string) {
    setBusy(true);
    const { error } = await supabase.from("schedule_entries").insert({ entry_date: selected, job_id: jobId });
    if (!error) await stampStart(jobId, selected);
    setBusy(false);
    if (error) { showError("Add failed: " + error.message); return; }
    load();
  }

  async function toggleTask(t: any) {
    await supabase.from("tasks").update({ done: true, completed_at: new Date().toISOString() }).eq("id", t.id);
    setDueTasks((x) => x.filter((y) => y.id !== t.id));
  }

  async function setAssignee(e: Entry, who: string) {
    await supabase.from("schedule_entries").update({ assignee: who || null, updated_at: new Date().toISOString() }).eq("id", e.id);
    load();
  }

  function removeEntry(e: Entry) {
    const prev = entries;
    undoable({
      text: "Removed from the calendar",
      hide: () => setEntries(prev.filter((x) => x.id !== e.id)),
      restore: () => setEntries(prev),
      commit: async () => { const r = await supabase.from("schedule_entries").delete().eq("id", e.id); load(); return r; },
    });
  }

  async function move(e: Entry, days: number) {
    const d = new Date(e.entry_date + "T12:00:00");
    d.setDate(d.getDate() + days);
    const next = iso(d.getFullYear(), d.getMonth(), d.getDate());
    await supabase.from("schedule_entries").update({ entry_date: next, updated_at: new Date().toISOString() }).eq("id", e.id);
    load();
  }

  // calendar grid
  const firstDow = new Date(year, month, 1).getDay(); // Sun=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const tasksByDate = useMemo(() => {
    const m: Record<string, any[]> = {};
    dueTasks.forEach((t) => { const k = t.due_date < today ? today : t.due_date; (m[k] = m[k] ?? []).push(t); });
    return m;
  }, [dueTasks, today]);
  const unscheduled = jobs.filter((j) => j.status === "booked" && !j.start_date && !everScheduled.has(j.id));

  const monthName = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const selEntries = byDate[selected] ?? [];
  const selDate = new Date(Number(selected.slice(0, 4)), Number(selected.slice(5, 7)) - 1, Number(selected.slice(8, 10)));
  const selLabel = selDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // route for the selected day, in the order it's scheduled
  const stops = selEntries
    .map((e) => (e.job_id ? jobById[e.job_id]?.location : null))
    .filter((s): s is string => !!s && s.trim().length > 2);
  const routeUrl = (() => {
    if (stops.length === 0) return null;
    if (stops.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stops[0])}`;
    const dest = encodeURIComponent(stops[stops.length - 1]);
    const way = stops.slice(0, -1).map(encodeURIComponent).join("|");
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}&waypoints=${way}&travelmode=driving`;
  })();

  // this week strip (Sun–Sat containing today)
  const now = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    return iso(d.getFullYear(), d.getMonth(), d.getDate());
  });

  const monthCount = visible.length;
  const tasksDueCount = dueTasks.length;
  const overdueTasks = dueTasks.filter((t) => t.due_date < today).length;
  const todayCount = (byDate[today] ?? []).length;
  const goToday = () => { setYear(ty); setMonth(tm); setSelected(today); };

  function entryRow(e: Entry, compact = false) {
    const j = e.job_id ? jobById[e.job_id] : null;
    if (compact) {
      return (
        <div key={e.id} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", j ? DOT[j.status] ?? "bg-neutral-600" : "bg-neutral-600")} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-white">{j ? (j.job_name || j.customer) : e.label}</div>
            {e.assignee ? <span className={cn("mt-0.5 inline-block rounded-full border px-1.5 py-px text-[11px] font-bold", crewCls(e.assignee))}>{e.assignee}</span> : null}
          </div>
        </div>
      );
    }
    return (
      <div key={e.id} className="rounded-xl border border-border bg-neutral-950/60 px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", j ? DOT[j.status] ?? "bg-neutral-600" : "bg-neutral-600")} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{j ? (j.job_name || j.customer) : e.label}</div>
            {j ? <div className="truncate text-xs text-neutral-400">{[j.customer, j.location, j.job].filter(Boolean).join(" · ")}</div> : null}
          </div>
          {j ? <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold", STATUS_META[j.status]?.cls ?? "")}>{STATUS_META[j.status]?.label}</span> : null}
        </div>
        <div className="mt-2 flex items-center gap-1.5 pl-[18px]">
          <NativeSelect value={e.assignee ?? ""} onChange={(ev) => setAssignee(e, ev.target.value)} aria-label="Assign crew"
            className={cn("h-9 min-w-0 flex-1 rounded-full text-xs font-bold", e.assignee ? crewCls(e.assignee) : "text-neutral-400")}>
            <option value="">unassigned</option>
            {crew.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
            {e.assignee && !crew.some((w) => w.name === e.assignee) ? <option value={e.assignee}>{e.assignee}</option> : null}
          </NativeSelect>
          <Button variant="ghost" size="icon" onClick={() => move(e, -1)} title="Move back a day" aria-label="Move back a day"><ChevronLeft size={16} /></Button>
          <Button variant="ghost" size="icon" onClick={() => move(e, 1)} title="Push a day" aria-label="Push a day"><ChevronRight size={16} /></Button>
          <Button variant="ghost" size="icon" onClick={() => removeEntry(e)} aria-label="Remove" className="text-neutral-500 hover:text-red-300"><X size={16} /></Button>
        </div>
      </div>
    );
  }

  const header = (
    <PageHeader
      title="Calendar"
      sub={loading ? "Loading…" : `${monthName} · ${monthCount} scheduled${filterWho ? ` for ${filterWho}` : ""}`}
      actions={<>
        <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={18} /></Button>
        <Button variant="outline" onClick={goToday} disabled={year === ty && month === tm && selected === today}>Today</Button>
        <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={18} /></Button>
      </>}
    />
  );

  if (err) return <div>{header}<LoadError message={err} onRetry={load} /></div>;

  return (
    <div>
      {header}

      {!loading ? (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="On site today" value={todayCount} hint={todayCount ? "Tap to see the day" : "Nothing booked today"} onClick={goToday} />
          <Stat label={`Scheduled in ${monthName.split(" ")[0]}`} value={monthCount} />
          <Stat label="Tasks with a date" value={tasksDueCount} tone={overdueTasks ? "bad" : undefined} hint={overdueTasks ? `${overdueTasks} overdue` : undefined} />
          <Stat label="Booked, no date" value={unscheduled.length} tone={unscheduled.length ? "warn" : undefined} hint={unscheduled.length ? "Pick a day, then tap +" : "All booked jobs dated"} />
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          {/* crew filter */}
          {crew.length ? (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setFilterWho("")}
                className={cn("h-9 rounded-full border px-3 text-xs font-bold", filterWho === "" ? "border-white bg-white text-neutral-900" : "border-border text-neutral-400 hover:text-white")}>
                Everyone
              </button>
              {crew.map((w) => (
                <button key={w.name} onClick={() => setFilterWho(filterWho === w.name ? "" : w.name)}
                  className={cn("h-9 rounded-full border px-3 text-xs font-bold", filterWho === w.name ? crewCls(w.name) : "border-border text-neutral-400 hover:text-white")}>
                  {w.name}
                </button>
              ))}
            </div>
          ) : null}

          <Card className="p-2 md:p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-[17px] font-semibold text-white">{monthName}</h2>
              {(year !== ty || month !== tm) ? <Button variant="link" size="sm" onClick={goToday} className="text-neutral-400">Back to today</Button> : null}
            </div>
            {/* weekday header */}
            <div className="mb-1 grid grid-cols-7">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="py-1 text-center text-xs font-bold text-neutral-500">
                  <span className="md:hidden">{d}</span>
                  <span className="hidden md:inline">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i]}</span>
                </div>
              ))}
            </div>

            {/* calendar grid */}
            {loading ? <div className="skeleton h-[420px] rounded-xl" /> : (
              <div className="grid grid-cols-7 gap-1">
                {cells.map((d, i) => {
                  if (d === null) return <div key={i} />;
                  const ds = iso(year, month, d);
                  const dayEntries = byDate[ds] ?? [];
                  const isToday = ds === today;
                  const isSel = ds === selected;
                  const dayTasks = tasksByDate[ds] ?? [];
                  return (
                    <button key={i} onClick={() => setSelected(ds)} aria-label={`${ds}, ${dayEntries.length} scheduled`}
                      className={cn("flex min-h-[66px] flex-col gap-0.5 rounded-lg border p-1 md:min-h-[96px] md:p-1.5",
                        isSel ? "border-white bg-white/[0.08]" : isToday ? "border-white/40 bg-neutral-950" : "border-white/[0.06] bg-neutral-950 hover:border-white/20")}>
                      <span className={cn("self-center text-xs font-bold leading-none md:self-start", isToday ? "rounded-full bg-white px-1.5 py-0.5 text-neutral-900" : isSel ? "text-white" : "text-neutral-300")}>{d}</span>
                      <span className="flex w-full flex-col gap-0.5 overflow-hidden">
                        {dayEntries.slice(0, 3).map((e) => {
                          const j = e.job_id ? jobById[e.job_id] : null;
                          const name = j ? j.customer : (e.label ?? "");
                          return <span key={e.id} className={cn("w-full truncate rounded px-0.5 py-px text-left text-[8px] font-semibold leading-tight md:px-1 md:text-[11px]", j ? CHIP[j.status] ?? "bg-neutral-800 text-neutral-300" : "bg-neutral-800 text-neutral-300")}>{name}</span>;
                        })}
                        {dayEntries.length > 3 ? <span className="pl-0.5 text-[8px] leading-none text-neutral-400 md:text-[11px]">+{dayEntries.length - 3}</span> : null}
                        {dayTasks.length ? (
                          <span className={cn("flex items-center gap-0.5 pl-0.5 text-left text-[8px] font-bold leading-none md:text-[11px]", ds === today && dueTasks.some((t) => t.due_date < today) ? "text-red-300" : "text-neutral-400")}>
                            <Check size={9} strokeWidth={3} className="md:h-3 md:w-3" />{dayTasks.length}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* this week */}
          <section>
            <SectionTitle>This week</SectionTitle>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {weekDays.map((ds) => {
                const list = byDate[ds] ?? [];
                const d = new Date(Number(ds.slice(0, 4)), Number(ds.slice(5, 7)) - 1, Number(ds.slice(8, 10)));
                return (
                  <button key={ds} onClick={() => { setSelected(ds); if (d.getMonth() !== month || d.getFullYear() !== year) { setYear(d.getFullYear()); setMonth(d.getMonth()); } window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className={cn("flex w-full gap-3 rounded-xl border bg-card px-3 py-2.5 text-left", ds === today ? "border-white/40" : ds === selected ? "border-white/25" : "border-border hover:border-white/20")}>
                    <div className="w-10 shrink-0 text-center">
                      <div className="text-xs font-semibold text-neutral-400">{d.toLocaleDateString("en-US", { weekday: "short" })}</div>
                      <div className={cn("text-base font-bold", ds === today ? "text-white" : "text-neutral-200")}>{d.getDate()}</div>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      {list.length === 0 ? <div className="py-1.5 text-xs text-neutral-500">Nothing scheduled</div> : list.map((e) => entryRow(e, true))}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <CalendarLinkCard />
        </div>

        {/* selected day */}
        <aside className="space-y-4 lg:sticky lg:top-[76px]">
          <Card className="p-4">
            <div className="mb-3 flex items-baseline gap-2">
              <CalendarDays size={16} className="shrink-0 self-center text-neutral-400" />
              <h2 className="text-[15px] font-semibold text-white">{selLabel}</h2>
              <span className="ml-auto text-xs text-neutral-400">{selEntries.length} scheduled</span>
            </div>
            {loading ? <ListSkeleton rows={3} /> : null}
            {!loading && selEntries.length === 0 ? <p className="mb-3 rounded-xl border border-dashed border-white/10 px-4 py-4 text-sm text-neutral-500">Nothing scheduled. Add a job or a shop day below.</p> : null}
            <div className="mb-3 space-y-2">{selEntries.map((e) => entryRow(e))}</div>

            {routeUrl ? (
              <Button asChild variant="outline" className="mb-3 w-full">
                <a href={routeUrl} target="_blank" rel="noopener noreferrer"><Navigation size={15} /> Map the day — {stops.length} stop{stops.length === 1 ? "" : "s"} in order</a>
              </Button>
            ) : null}

            <div className="space-y-2 border-t border-border pt-3">
              <div className="text-[13px] font-semibold text-neutral-400">Add to {selDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
              <JobPicker jobs={jobs} value={addJobId} onChange={(id) => { setAddJobId(id); if (id) setAddLabel(""); }} placeholder="Type to find a job…" />
              <Input placeholder="…or type anything (shop day, dump run)" value={addLabel}
                onChange={(e) => { setAddLabel(e.target.value); if (e.target.value) setAddJobId(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") addEntry(); }} />
              <div className="flex gap-2">
                <NativeSelect className="min-w-0 flex-1" value={addWho} onChange={(e) => setAddWho(e.target.value)} aria-label="Who">
                  <option value="">Who?</option>
                  {crew.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
                </NativeSelect>
                <Button onClick={addEntry} disabled={busy || (!addJobId && !addLabel.trim())} className="shrink-0"><Plus size={16} /> Add</Button>
              </div>
            </div>
          </Card>

          {(tasksByDate[selected] ?? []).length ? (
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <ListChecks size={16} className="text-neutral-400" />
                <h3 className="text-[15px] font-semibold text-white">Tasks due{selected === today ? " (incl. overdue)" : ""}</h3>
              </div>
              <div className="space-y-1.5">
                {(tasksByDate[selected] ?? []).map((t) => {
                  const j = t.job_id ? jobById[t.job_id] : null;
                  const late = t.due_date < today;
                  return (
                    <div key={t.id} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-1.5 py-1">
                      <button onClick={() => toggleTask(t)} aria-label="Done" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-accent">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md border border-neutral-600 text-transparent hover:text-emerald-300"><Check size={13} strokeWidth={3} /></span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-white">{t.title}</div>
                        <div className="truncate text-xs text-neutral-400">{late ? <span className="font-semibold text-red-300">Overdue · </span> : null}{j ? (j.job_name || j.customer) : "No job"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}

          {unscheduled.length ? (
            <Card className="border-amber-500/30 p-4">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-amber-300">Booked — no date yet</h3>
                <Badge variant="warning" className="ml-auto">{unscheduled.length}</Badge>
              </div>
              <div className="space-y-1.5">
                {unscheduled.map((j) => (
                  <div key={j.id} className="flex items-center gap-2 py-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 truncate text-sm text-white">{j.priority ? <Star size={12} className="shrink-0 fill-amber-300 text-amber-300" /> : null}<span className="truncate">{j.job_name || j.customer}</span></div>
                      <div className="truncate text-xs text-neutral-400">{[j.job_name ? j.customer : null, j.location].filter(Boolean).join(" · ")}</div>
                    </div>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => scheduleJob(j.id)} className="h-10 shrink-0 border-amber-400/50 text-amber-200">
                      <Plus size={14} /> {selDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
