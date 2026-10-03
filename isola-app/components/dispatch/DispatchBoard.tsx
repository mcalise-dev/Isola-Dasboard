"use client";
// v4.6 Dispatch board: crew x day grid on desktop, a day-by-day agenda on a phone.
// Data rules are the same as the Schedule tab and the job record:
//  - one schedule_entries row per job per day, assignee = worker name (null = unassigned)
//  - the first time a booked / in-progress job lands on the board and it has no start date,
//    that day becomes jobs.start_date (the database then closes the "Set a start date" task)
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, GripVertical, MapPin, Plus, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtPrice, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty, PageHeader, Skeleton } from "@/components/ui/bits";
import { Segmented } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { showToast, undoable } from "@/components/Toaster";

type Entry = { id: string; entry_date: string; job_id: string | null; label: string | null; notes: string | null; sort: number | null; assignee: string | null };
type Worker = { id: string; name: string; active: boolean; is_owner: boolean | null; rate: number | null };
type JobRow = { id: string; job_name: string | null; customer: string | null; location: string | null; status: string; start_date: string | null; price: string | null; price_amount: number | null; priority: boolean | null };

const NONE = "__none";
const THM = "THM";
const isThm = (s: string | null | undefined) => !!s && /^thm( corp\.?)?$/i.test(s.trim());

// ---------- dates ----------
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (iso: string, n: number) => { const d = parse(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const mondayOf = (iso: string) => { const d = parse(iso); const dow = d.getDay(); d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); return isoOf(d); };
const isWeekend = (iso: string) => { const g = parse(iso).getDay(); return g === 0 || g === 6; };
const nextWorkday = (iso: string) => { let d = addDays(iso, 1); while (isWeekend(d)) d = addDays(d, 1); return d; };
const dayShort = (iso: string) => parse(iso).toLocaleDateString("en-US", { weekday: "short" });
const dayNum = (iso: string) => parse(iso).getDate();
const dayLong = (iso: string) => parse(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
const md = (iso: string) => parse(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const shortLoc = (s: string | null | undefined) => (s ?? "").split(",")[0].trim();
const jobTitle = (j?: JobRow | null) => (j ? j.job_name || j.customer || "Job" : "Job");

function workDates(start: string, days: number, skipWeekends: boolean) {
  const out: string[] = [];
  let d = start;
  let guard = 0;
  while (out.length < Math.max(1, days) && guard++ < 400) {
    if (!(skipWeekends && isWeekend(d))) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

function useIsPhone() {
  const [phone, setPhone] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

const changed = () => window.dispatchEvent(new Event("isola:changed"));

export default function DispatchBoard() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();
  const phone = useIsPhone();
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [span, setSpan] = useState<"1" | "2">("1");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [everScheduled, setEverScheduled] = useState<Set<string>>(new Set());
  const [hasAhead, setHasAhead] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [fillJob, setFillJob] = useState<{ job: JobRow; date?: string; who?: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const weeks = span === "2" ? 2 : 1;
  const rangeEnd = addDays(weekStart, weeks * 7 - 1);

  const load = useCallback(async () => {
    const [w, se, js, all] = await Promise.all([
      supabase.from("workers").select("id,name,active,is_owner,rate").eq("active", true).order("name"),
      supabase.from("schedule_entries").select("id,entry_date,job_id,label,notes,sort,assignee").gte("entry_date", weekStart).lte("entry_date", rangeEnd).order("sort").order("created_at"),
      supabase.from("jobs").select("id,job_name,customer,location,status,start_date,price,price_amount,priority").order("priority", { ascending: false }).order("updated_at", { ascending: false }),
      supabase.from("schedule_entries").select("job_id,entry_date").not("job_id", "is", null),
    ]);
    if (se.error) showToast("Could not load the board: " + se.error.message);
    setWorkers((w.data as Worker[]) ?? []);
    setEntries((se.data as Entry[]) ?? []);
    setJobs((js.data as JobRow[]) ?? []);
    const allRows: any[] = all.data ?? [];
    setEverScheduled(new Set(allRows.map((r) => r.job_id)));
    setHasAhead(new Set(allRows.filter((r) => r.entry_date >= today).map((r) => r.job_id)));
    setLoading(false);
  }, [supabase, weekStart, rangeEnd, today]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const on = () => load();
    window.addEventListener("isola:changed", on);
    return () => window.removeEventListener("isola:changed", on);
  }, [load]);

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);

  // columns: Mon–Sat per week; Sunday only shows up when something is on it
  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(weekStart, i);
      const sunday = parse(d).getDay() === 0;
      if (sunday && !entries.some((e) => e.entry_date === d)) continue;
      out.push(d);
    }
    return out;
  }, [weekStart, weeks, entries]);

  // rows: owner first, then crew A–Z, then any other names on the board, THM, Unassigned
  const workerNames = useMemo(() => {
    const ws = [...workers].sort((a, b) => Number(!!b.is_owner) - Number(!!a.is_owner) || a.name.localeCompare(b.name));
    return ws.map((w) => w.name);
  }, [workers]);
  const rowOf = useCallback((e: Entry) => {
    if (!e.assignee || !e.assignee.trim()) return NONE;
    if (isThm(e.assignee)) return THM;
    const hit = workerNames.find((n) => n.toLowerCase() === e.assignee!.trim().toLowerCase());
    return hit ?? e.assignee.trim();
  }, [workerNames]);
  const rows = useMemo(() => {
    const extra = Array.from(new Set(entries.map(rowOf).filter((r) => r !== NONE && r !== THM && !workerNames.includes(r))));
    const out = [...workerNames, ...extra];
    if (entries.some((e) => rowOf(e) === THM)) out.push(THM);
    out.push(NONE);
    return out;
  }, [entries, rowOf, workerNames]);
  const assigneeOptions = useMemo(() => {
    const s = [...workerNames];
    const thmSpelling = entries.find((e) => isThm(e.assignee))?.assignee ?? THM;
    return { names: s, thm: thmSpelling };
  }, [workerNames, entries]);
  const rowToAssignee = (row: string) => (row === NONE ? null : row === THM ? assigneeOptions.thm : row);

  const cellMap = useMemo(() => {
    const m: Record<string, Entry[]> = {};
    entries.forEach((e) => { const k = rowOf(e) + "|" + e.entry_date; (m[k] = m[k] ?? []).push(e); });
    return m;
  }, [entries, rowOf]);

  const unscheduled = useMemo(() => jobs.filter((j) => j.status === "booked" && !j.start_date && !everScheduled.has(j.id)), [jobs, everScheduled]);
  const stalled = useMemo(() => jobs.filter((j) => j.status === "progress" && !hasAhead.has(j.id)), [jobs, hasAhead]);

  // ---------- writes ----------
  async function stampStart(jobId: string, day: string) {
    const j = jobById[jobId];
    if (j && !j.start_date && (j.status === "booked" || j.status === "progress")) {
      await supabase.from("jobs").update({ start_date: day, updated_at: new Date().toISOString() }).eq("id", jobId);
    }
  }

  async function scheduleDays(job: JobRow, dates: string[], who: string | null) {
    const { data: have } = await supabase.from("schedule_entries").select("entry_date").eq("job_id", job.id).in("entry_date", dates);
    const taken = new Set((have ?? []).map((r: any) => r.entry_date));
    const rows = dates.filter((d) => !taken.has(d)).map((d) => ({ entry_date: d, job_id: job.id, assignee: who }));
    if (rows.length) {
      const { error } = await supabase.from("schedule_entries").insert(rows);
      if (error) { alert("Could not schedule: " + error.message); return false; }
    }
    if (dates.length) await stampStart(job.id, dates[0]);
    showToast(rows.length ? `${jobTitle(job)} on the board · ${rows.length} day${rows.length === 1 ? "" : "s"}` : "Already on those days");
    await load();
    changed();
    return true;
  }

  async function moveEntry(e: Entry, date: string, assignee: string | null) {
    if (e.entry_date === date && (e.assignee ?? null) === assignee) return;
    if (e.job_id && e.entry_date !== date && entries.some((x) => x.id !== e.id && x.job_id === e.job_id && x.entry_date === date && rowOf(x) === rowOf({ ...e, assignee }))) {
      showToast("That job is already there that day");
      return;
    }
    setEntries((xs) => xs.map((x) => (x.id === e.id ? { ...x, entry_date: date, assignee } : x)));
    const { error } = await supabase.from("schedule_entries").update({ entry_date: date, assignee, updated_at: new Date().toISOString() }).eq("id", e.id);
    if (error) { alert("Move failed: " + error.message); load(); return; }
    if (e.job_id) await stampStart(e.job_id, date);
    showToast("Moved to " + (assignee ?? "Unassigned") + " · " + md(date));
    changed();
  }

  function onDragStart(ev: DragStartEvent) { setDragging(String(ev.active.id)); }
  async function onDragEnd(ev: DragEndEvent) {
    setDragging(null);
    const over = ev.over?.id ? String(ev.over.id) : null;
    if (!over || !over.startsWith("cell:")) return;
    const rest = over.slice(5);
    const cut = rest.lastIndexOf("|");
    const row = rest.slice(0, cut);
    const date = rest.slice(cut + 1);
    if (cut < 0 || !date) return;
    const who = rowToAssignee(row);
    const id = String(ev.active.id);
    if (id.startsWith("job:")) {
      const j = jobById[id.slice(4)];
      if (j) await scheduleDays(j, [date], who);
    } else if (id.startsWith("entry:")) {
      const e = entries.find((x) => x.id === id.slice(6));
      if (e) await moveEntry(e, date, who);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const selected = openEntry ? entries.find((e) => e.id === openEntry) ?? null : null;
  const dragEntry = dragging?.startsWith("entry:") ? entries.find((e) => e.id === dragging.slice(6)) : null;
  const dragJob = dragging?.startsWith("job:") ? jobById[dragging.slice(4)] : null;

  const rangeLabel = `${md(weekStart)} – ${md(rangeEnd)}`;
  const isThisWeek = weekStart === mondayOf(today);

  const header = (
    <PageHeader
      title="Dispatch board"
      sub={<span className="tabular-nums">{rangeLabel}{isThisWeek ? " · this week" : ""}</span>}
      actions={
        <>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7 * weeks))}><ChevronLeft size={16} /></Button>
            <Button variant={isThisWeek ? "secondary" : "outline"} size="sm" onClick={() => setWeekStart(mondayOf(today))}>This week</Button>
            <Button variant="outline" size="icon-sm" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7 * weeks))}><ChevronRight size={16} /></Button>
          </div>
          <Segmented<"1" | "2"> value={span} onChange={setSpan} options={[{ value: "1", label: "1 week" }, { value: "2", label: "2 weeks" }]} />
        </>
      }
    />
  );

  if (loading || phone === null) {
    return (
      <div>
        {header}
        <div className="grid gap-4 md:grid-cols-[1fr_300px]" aria-busy="true">
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        </div>
      </div>
    );
  }

  const unschedPanel = (
    <UnscheduledPanel
      unscheduled={unscheduled}
      stalled={stalled}
      phone={phone}
      onFill={(job) => setFillJob({ job, date: today < weekStart ? weekStart : isWeekend(today) ? nextWorkday(today) : today })}
    />
  );

  return (
    <div>
      {header}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        {phone ? (
          <div className="space-y-5">
            {unschedPanel}
            <Agenda days={days} rows={rows} cellMap={cellMap} jobById={jobById} today={today} onOpen={setOpenEntry} />
          </div>
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0 space-y-3">
              <Grid days={days} rows={rows} cellMap={cellMap} jobById={jobById} today={today} onOpen={setOpenEntry} />
              <Legend />
            </div>
            <div className="lg:sticky lg:top-4">{unschedPanel}</div>
          </div>
        )}
        <DragOverlay dropAnimation={null}>
          {dragEntry ? <BlockBody e={dragEntry} j={dragEntry.job_id ? jobById[dragEntry.job_id] : null} overlay /> : null}
          {dragJob ? <div className="w-56 rounded-lg bg-white px-2.5 py-2 text-sm font-semibold text-neutral-900 shadow-2xl">{jobTitle(dragJob)}</div> : null}
        </DragOverlay>
      </DndContext>

      <EntrySheet
        entry={selected}
        job={selected?.job_id ? jobById[selected.job_id] : null}
        options={assigneeOptions}
        onClose={() => setOpenEntry(null)}
        supabase={supabase}
        entries={entries}
        setEntries={setEntries}
        reload={load}
        stampStart={stampStart}
      />

      <FillDialog
        state={fillJob}
        options={assigneeOptions}
        onClose={() => setFillJob(null)}
        onSave={async (job, date, days, skip, who) => {
          const ok = await scheduleDays(job, workDates(date, days, skip), who);
          if (ok) setFillJob(null);
        }}
      />
    </div>
  );
}

// ---------- grid (desktop) ----------
function Grid({ days, rows, cellMap, jobById, today, onOpen }: { days: string[]; rows: string[]; cellMap: Record<string, Entry[]>; jobById: Record<string, JobRow>; today: string; onOpen: (id: string) => void }) {
  const cols = `124px repeat(${days.length}, minmax(${days.length > 7 ? 96 : 104}px, 1fr))`;
  const empty = rows.every((r) => days.every((d) => !(cellMap[r + "|" + d]?.length)));
  return (
    <div className="overflow-x-auto scroll-thin rounded-xl border border-border bg-card">
      <div className="min-w-fit" style={{ display: "grid", gridTemplateColumns: cols }}>
        <div className="sticky left-0 z-[2] border-b border-border bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-400">Crew</div>
        {days.map((d) => (
          <div key={d} className={cn("border-b border-l border-border px-2 py-2 text-center", d === today ? "bg-white/[0.05]" : "bg-neutral-950", parse(d).getDay() === 1 && d !== days[0] && "border-l-white/20")}>
            <div className={cn("text-xs font-semibold", d === today ? "text-white" : "text-neutral-400")}>{dayShort(d)}</div>
            <div className={cn("text-sm font-semibold tabular-nums", d === today ? "text-white" : "text-neutral-300")}>
              {d === today ? <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-neutral-900">{dayNum(d)}</span> : dayNum(d)}
            </div>
          </div>
        ))}
        {rows.map((r) => (
          <RowCells key={r} row={r} days={days} cellMap={cellMap} jobById={jobById} today={today} onOpen={onOpen} />
        ))}
      </div>
      {empty ? <div className="border-t border-border px-4 py-3 text-sm text-neutral-400">Nothing on the board this week. Drag a job from Unscheduled onto a crew and day.</div> : null}
    </div>
  );
}

function RowCells({ row, days, cellMap, jobById, today, onOpen }: { row: string; days: string[]; cellMap: Record<string, Entry[]>; jobById: Record<string, JobRow>; today: string; onOpen: (id: string) => void }) {
  const count = days.reduce((a, d) => a + (cellMap[row + "|" + d]?.length ?? 0), 0);
  return (
    <>
      <div className="sticky left-0 z-[1] flex flex-col justify-center border-b border-border bg-neutral-950 px-3 py-2">
        <span className={cn("truncate text-sm font-semibold", row === NONE ? "text-neutral-400" : "text-white")}>{row === NONE ? "Unassigned" : row}</span>
        <span className="text-xs tabular-nums text-neutral-500">{count ? `${count} day${count === 1 ? "" : "s"}` : "Open"}</span>
      </div>
      {days.map((d) => (
        <Cell key={d} id={`cell:${row}|${d}`} isToday={d === today}>
          {(cellMap[row + "|" + d] ?? []).map((e) => (
            <Block key={e.id} e={e} j={e.job_id ? jobById[e.job_id] : null} onOpen={() => onOpen(e.id)} />
          ))}
        </Cell>
      ))}
    </>
  );
}

function Cell({ id, isToday, children }: { id: string; isToday: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("min-h-[64px] space-y-1 border-b border-l border-border p-1.5 transition-colors", isToday && "bg-white/[0.03]", isOver && "bg-white/[0.09] ring-1 ring-inset ring-white/40")}>
      {children}
    </div>
  );
}

function BlockBody({ e, j, overlay }: { e: Entry; j: JobRow | null; overlay?: boolean }) {
  if (j) {
    return (
      <div className={cn("rounded-md bg-white px-2 py-1.5 text-left text-neutral-900", overlay && "w-48 shadow-2xl")}>
        <div className="truncate text-[13px] font-semibold leading-tight">{jobTitle(j)}</div>
        {shortLoc(j.location) ? <div className="truncate text-[11px] leading-tight text-neutral-600">{shortLoc(j.location)}</div> : null}
        {e.notes ? <div className="truncate text-[11px] italic leading-tight text-neutral-500">{e.notes}</div> : null}
      </div>
    );
  }
  return (
    <div className={cn("rounded-md border border-white/10 bg-white/[0.06] px-2 py-1.5 text-left text-neutral-300", overlay && "w-48 bg-neutral-900 shadow-2xl")}>
      <div className="truncate text-[13px] font-medium leading-tight">{e.label || "Note"}</div>
      {e.notes ? <div className="truncate text-[11px] leading-tight text-neutral-500">{e.notes}</div> : null}
    </div>
  );
}

function Block({ e, j, onOpen }: { e: Entry; j: JobRow | null; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: "entry:" + e.id });
  return (
    <button ref={setNodeRef} type="button" {...attributes} {...listeners} onClick={onOpen}
      className={cn("block w-full cursor-grab touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-md", isDragging && "opacity-30")}
      aria-label={`${j ? jobTitle(j) : e.label ?? "Entry"}, open details or drag to move`}>
      <BlockBody e={e} j={j} />
    </button>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-neutral-400">
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-white" /> Job day</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm border border-white/10 bg-white/[0.06]" /> Note only (shop day, dump run)</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-white/[0.05] ring-1 ring-inset ring-white/20" /> Today</span>
      <span className="inline-flex items-center gap-1.5"><GripVertical size={13} /> Drag to move or assign · click to open</span>
      <Link href="/schedule" className="ml-auto underline-offset-4 hover:text-white hover:underline">Month calendar</Link>
    </div>
  );
}

// ---------- unscheduled ----------
function UnscheduledPanel({ unscheduled, stalled, phone, onFill }: { unscheduled: JobRow[]; stalled: JobRow[]; phone: boolean; onFill: (j: JobRow) => void }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <h2 className="text-[15px] font-semibold text-white">Unscheduled</h2>
        {unscheduled.length ? <Badge variant="warning">{unscheduled.length}</Badge> : null}
      </div>
      <div className="max-h-[70vh] space-y-1.5 overflow-y-auto scroll-thin p-2.5">
        {unscheduled.length === 0 && stalled.length === 0 ? (
          <Empty className="py-6" icon={<CalendarDays size={20} />} title="Everything booked is on the board" body="New booked jobs with no start date show up here." />
        ) : null}
        {unscheduled.map((j) => <JobCard key={j.id} j={j} phone={phone} onFill={() => onFill(j)} />)}
        {stalled.length ? (
          <>
            <div className="px-1 pb-0.5 pt-2 text-xs font-semibold text-neutral-400">In progress, no days ahead</div>
            {stalled.map((j) => <JobCard key={j.id} j={j} phone={phone} onFill={() => onFill(j)} />)}
          </>
        ) : null}
        {!phone && (unscheduled.length || stalled.length) ? <p className="px-1 pt-1 text-xs text-neutral-500">Drag a card onto a crew and day, or use Fill days.</p> : null}
      </div>
    </section>
  );
}

function JobCard({ j, phone, onFill }: { j: JobRow; phone: boolean; onFill: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: "job:" + j.id, disabled: phone });
  const price = fmtPrice(j.price_amount ?? j.price);
  return (
    <div ref={setNodeRef} className={cn("rounded-lg border border-white/[0.07] bg-white/[0.04] p-2.5", isDragging && "opacity-40")}>
      <div className="flex items-start gap-2">
        {!phone ? (
          <button type="button" {...attributes} {...listeners} className="mt-0.5 cursor-grab touch-none text-neutral-500 hover:text-white" aria-label={`Drag ${jobTitle(j)} onto the board`}>
            <GripVertical size={16} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <Link href={`/jobs/${j.id}`} className="block truncate text-sm font-semibold text-white hover:underline">{jobTitle(j)}</Link>
          <div className="truncate text-xs text-neutral-400">{[j.job_name ? j.customer : null, shortLoc(j.location)].filter(Boolean).join(" · ") || "—"}</div>
        </div>
        {price ? <span className="shrink-0 text-xs font-semibold tabular-nums text-neutral-200">{price}</span> : null}
      </div>
      <div className="mt-2 flex justify-end">
        <Button variant="outline" size="sm" className={cn(phone && "h-11 w-full")} onClick={onFill}>
          <CalendarPlus size={14} /> {phone ? "Schedule" : "Fill days"}
        </Button>
      </div>
    </div>
  );
}

// ---------- agenda (phone) ----------
function Agenda({ days, rows, cellMap, jobById, today, onOpen }: { days: string[]; rows: string[]; cellMap: Record<string, Entry[]>; jobById: Record<string, JobRow>; today: string; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-3">
      {days.map((d) => {
        const groups = rows.map((r) => ({ r, list: cellMap[r + "|" + d] ?? [] })).filter((g) => g.list.length);
        return (
          <section key={d} className={cn("rounded-xl border bg-card", d === today ? "border-white/25" : "border-border")}>
            <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
              <h3 className="text-[15px] font-semibold text-white">{dayLong(d)}</h3>
              {d === today ? <Badge variant="solid">Today</Badge> : null}
              <span className="ml-auto text-xs tabular-nums text-neutral-500">{groups.reduce((a, g) => a + g.list.length, 0) || ""}</span>
            </div>
            {groups.length === 0 ? <p className="px-3.5 py-3 text-sm text-neutral-500">Nothing scheduled.</p> : (
              <div className="divide-y divide-white/[0.05]">
                {groups.map(({ r, list }) => (
                  <div key={r} className="px-3.5 py-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-neutral-400"><Users size={12} />{r === NONE ? "Unassigned" : r}</div>
                    <div className="space-y-1.5">
                      {list.map((e) => (
                        <button key={e.id} type="button" onClick={() => onOpen(e.id)} className="block min-h-[44px] w-full">
                          <BlockBody e={e} j={e.job_id ? jobById[e.job_id] : null} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ---------- entry detail ----------
function AssigneeSelect({ value, onChange, options, className }: { value: string | null; onChange: (v: string | null) => void; options: { names: string[]; thm: string }; className?: string }) {
  const v = value ?? "";
  const known = !v || options.names.includes(v) || isThm(v);
  return (
    <NativeSelect className={className} value={isThm(v) ? options.thm : v} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Unassigned</option>
      {options.names.map((n) => <option key={n} value={n}>{n}</option>)}
      <option value={options.thm}>THM</option>
      {!known ? <option value={v}>{v}</option> : null}
    </NativeSelect>
  );
}

function EntrySheet({ entry, job, options, onClose, supabase, entries, setEntries, reload, stampStart }: {
  entry: Entry | null; job: JobRow | null; options: { names: string[]; thm: string }; onClose: () => void; supabase: any;
  entries: Entry[]; setEntries: React.Dispatch<React.SetStateAction<Entry[]>>; reload: () => Promise<void>; stampStart: (jobId: string, day: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => { setNotes(entry?.notes ?? ""); setLabel(entry?.label ?? ""); setDate(entry?.entry_date ?? ""); }, [entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(p: Partial<Entry>, toast = "Saved") {
    if (!entry) return;
    setEntries((xs) => xs.map((x) => (x.id === entry.id ? { ...x, ...p } : x)));
    const { error } = await supabase.from("schedule_entries").update({ ...p, updated_at: new Date().toISOString() }).eq("id", entry.id);
    if (error) { alert("Save failed: " + error.message); reload(); return; }
    showToast(toast);
    changed();
  }

  async function addNextDay() {
    if (!entry) return;
    let d = nextWorkday(entry.entry_date);
    if (entry.job_id) {
      const { data } = await supabase.from("schedule_entries").select("entry_date").eq("job_id", entry.job_id).gt("entry_date", entry.entry_date);
      const taken = new Set((data ?? []).map((r: any) => r.entry_date));
      while (taken.has(d)) d = nextWorkday(d);
    }
    const row: any = { entry_date: d, assignee: entry.assignee, job_id: entry.job_id, label: entry.job_id ? null : entry.label };
    const { error } = await supabase.from("schedule_entries").insert(row);
    if (error) { alert("Could not add: " + error.message); return; }
    showToast("Added " + dayLong(d));
    await reload();
    changed();
  }

  function removeDay() {
    if (!entry) return;
    const snapshot = entry;
    onClose();
    undoable({
      text: `Removed ${job ? jobTitle(job) : snapshot.label ?? "entry"} · ${md(snapshot.entry_date)}`,
      hide: () => setEntries((xs) => xs.filter((x) => x.id !== snapshot.id)),
      restore: () => setEntries((xs) => (xs.some((x) => x.id === snapshot.id) ? xs : [...xs, snapshot])),
      commit: async () => {
        const { error } = await supabase.from("schedule_entries").delete().eq("id", snapshot.id);
        if (error) throw error;
        changed();
      },
    });
  }

  const sameJobDays = entry?.job_id ? entries.filter((x) => x.job_id === entry.job_id).length : 0;

  return (
    <Sheet open={!!entry} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent title="Scheduled day" className="md:w-[420px]">
        {entry ? (
          <div className="flex-1 space-y-4 overflow-y-auto scroll-thin p-5 pt-5">
            <div className="pr-10">
              <div className="text-[13px] text-neutral-500">{dayLong(entry.entry_date)}</div>
              {job ? (
                <>
                  <Link href={`/jobs/${job.id}`} className="mt-0.5 block text-lg font-semibold leading-tight text-white hover:underline">{jobTitle(job)}</Link>
                  <div className="mt-1 text-sm text-neutral-400">{[job.job_name ? job.customer : null, job.location].filter(Boolean).join(" · ")}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {fmtPrice(job.price_amount ?? job.price) ? <Badge>{fmtPrice(job.price_amount ?? job.price)}</Badge> : null}
                    {sameJobDays ? <Badge variant="muted">{sameJobDays} day{sameJobDays === 1 ? "" : "s"} showing</Badge> : null}
                    {job.location ? (
                      <a className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.location)}`}>
                        <MapPin size={12} /> Map
                      </a>
                    ) : null}
                  </div>
                </>
              ) : (
                <Field label="Label" className="mt-2">
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => { if (label.trim() && label !== entry.label) patch({ label: label.trim() }); }} />
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Who">
                <AssigneeSelect value={entry.assignee} options={options} onChange={(v) => patch({ assignee: v }, "Assigned to " + (v ?? "nobody"))} />
              </Field>
              <Field label="Date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  onBlur={async () => { if (date && date !== entry.entry_date) { await patch({ entry_date: date }, "Moved to " + md(date)); if (entry.job_id) await stampStart(entry.job_id, date); } }} />
              </Field>
            </div>

            <Field label="Notes for this day">
              <Textarea rows={3} value={notes} placeholder="Pour at 7, bring the breaker…" onChange={(e) => setNotes(e.target.value)}
                onBlur={() => { if ((notes || null) !== (entry.notes || null)) patch({ notes: notes.trim() || null }); }} />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={addNextDay}><Plus size={15} /> Add next day</Button>
              <Button variant="destructive" onClick={removeDay}><Trash2 size={15} /> Remove day</Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

// ---------- fill days ----------
function FillDialog({ state, options, onClose, onSave }: {
  state: { job: JobRow; date?: string; who?: string } | null; options: { names: string[]; thm: string }; onClose: () => void;
  onSave: (job: JobRow, date: string, days: number, skip: boolean, who: string | null) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [days, setDays] = useState(1);
  const [skip, setSkip] = useState(true);
  const [who, setWho] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (state) { setDate(state.date ?? todayISO()); setDays(1); setSkip(true); setWho(state.who ?? null); } }, [state]);
  const preview = date ? workDates(date, days, skip) : [];
  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule {state ? jobTitle(state.job) : ""}</DialogTitle>
          <DialogDescription>Puts the job on the board for each working day. The first day becomes the start date if it has none.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First day"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Working days"><Input type="number" min={1} max={60} inputMode="numeric" value={days} onChange={(e) => setDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} /></Field>
          <Field label="Who" className="col-span-2"><AssigneeSelect value={who} options={options} onChange={setWho} /></Field>
          <label className="col-span-2 flex min-h-[44px] items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} className="h-4 w-4 accent-white" /> Skip Saturdays and Sundays
          </label>
        </div>
        {preview.length ? (
          <p className="mt-1 text-xs text-neutral-400">
            {preview.length === 1 ? dayLong(preview[0]) : `${dayLong(preview[0])} → ${dayLong(preview[preview.length - 1])}`}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!date || busy || !state} onClick={async () => { if (!state) return; setBusy(true); await onSave(state.job, date, days, skip, who); setBusy(false); }}>
            {busy ? "Scheduling…" : `Schedule ${preview.length} day${preview.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
