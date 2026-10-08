"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { undoable, showError, showToast } from "@/components/Toaster";
import { ask } from "@/components/Dialogs";
import { createClient } from "@/lib/supabase/client";
import { Job, jobLabel, todayISO } from "@/lib/format";
import { withTimeout, firstError } from "@/lib/load";
import JobPicker from "@/components/JobPicker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { PageHeader, SectionTitle, Stat, Empty, Progress, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { Check, X, Plus, ChevronLeft, ChevronRight, History, Trash2, ClipboardList } from "lucide-react";

type Plan = {
  id: string;
  plan_date: string;
  headline: string | null;
  notes: string | null;
};
type Item = {
  id: string;
  plan_id: string;
  body: string;
  job_id: string | null;
  done: boolean;
  completed_at: string | null;
  sort_order: number;
};
type Sched = { id: string; label: string | null; job_id: string | null; jobs: { job_name: string | null; customer: string | null; location: string | null } | null };

const shiftDate = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};
const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
};
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

export default function GamePlanTab() {
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState(todayISO());
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sched, setSched] = useState<Sched[]>([]);
  const [recent, setRecent] = useState<{ plan_date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [headline, setHeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState("");
  const [draftJob, setDraftJob] = useState("");

  const loadPlan = useCallback(async (d: string) => {
    setLoading(true);
    setErr(null);
    try {
      const [p, s] = await withTimeout(Promise.all([
        supabase.from("game_plans").select("id,plan_date,headline,notes").eq("plan_date", d).maybeSingle(),
        supabase.from("schedule_entries").select("id,label,job_id,jobs(job_name,customer,location)").eq("entry_date", d).order("sort"),
      ]));
      const e = firstError(p, s);
      if (e) throw new Error(e);
      const row = (p.data as Plan | null) ?? null;
      setPlan(row);
      setHeadline(row?.headline ?? "");
      setNotes(row?.notes ?? "");
      setSched(((s.data as unknown) as Sched[]) ?? []);
      if (row) {
        const it = await withTimeout(supabase.from("game_plan_items").select("*").eq("plan_id", row.id).order("sort_order").order("created_at"));
        if (it.error) throw new Error(it.error.message);
        setItems((it.data as Item[]) ?? []);
      } else {
        setItems([]);
      }
      setLoading(false);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? "Couldn't load the game plan.");
    }
  }, [supabase]);

  const loadSide = useCallback(async () => {
    try {
      const [j, r] = await withTimeout(Promise.all([
        supabase.from("jobs").select("id,job_name,customer,location,job,status,paid_date,priority").order("customer"),
        supabase.from("game_plans").select("plan_date").order("plan_date", { ascending: false }).limit(14),
      ]));
      const e = firstError(j, r);
      if (e) throw new Error(e);
      setJobs((j.data as unknown as Job[]) ?? []);
      setRecent((r.data as { plan_date: string }[]) ?? []);
    } catch (e: any) {
      // side data (job list, recent plans) is optional — the plan itself still works
      showError("Couldn't load jobs list: " + (e?.message === "timeout" ? "no response" : e?.message));
    }
  }, [supabase]);

  useEffect(() => { loadSide(); }, [loadSide]);
  useEffect(() => { loadPlan(date); }, [date, loadPlan]);

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);
  const openJobs = useMemo(() => jobs.filter((j) => j.status !== "complete"), [jobs]);
  const doneCount = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  async function ensurePlan(): Promise<Plan | null> {
    if (plan) return plan;
    const { data, error } = await supabase
      .from("game_plans")
      .insert({ plan_date: date, headline: headline.trim() || null })
      .select("id,plan_date,headline,notes")
      .single();
    if (error) { showError("Could not start the game plan: " + error.message); return null; }
    const row = data as Plan;
    setPlan(row);
    loadSide();
    return row;
  }

  async function addItems() {
    const lines = draft.split("\n").map((l) => l.replace(/^\s*[-•*\d.)]+\s*/, "").trim()).filter(Boolean);
    if (!lines.length) return;
    const p = await ensurePlan();
    if (!p) return;
    const base = items.length ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
    const rows = lines.map((body, idx) => ({ plan_id: p.id, body, job_id: draftJob || null, sort_order: base + idx }));
    const { error } = await supabase.from("game_plan_items").insert(rows);
    if (error) { showError("Add failed: " + error.message); return; }
    setDraft(""); setDraftJob("");
    loadPlan(date);
  }

  async function toggle(it: Item) {
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)));
    await supabase.from("game_plan_items")
      .update({ done: !it.done, completed_at: !it.done ? new Date().toISOString() : null })
      .eq("id", it.id);
    loadPlan(date);
  }

  function remove(it: Item) {
    const prev = items;
    undoable({
      text: "Line deleted",
      hide: () => setItems(prev.filter((x) => x.id !== it.id)),
      restore: () => setItems(prev),
      commit: () => supabase.from("game_plan_items").delete().eq("id", it.id),
    });
  }

  async function saveHeader() {
    if (!plan) {
      if (!headline.trim() && !notes.trim()) return;
      const p = await ensurePlan();
      if (!p) return;
      await supabase.from("game_plans").update({ headline: headline.trim() || null, notes: notes.trim() || null, updated_at: new Date().toISOString() }).eq("id", p.id);
      return;
    }
    setSaving(true);
    await supabase.from("game_plans")
      .update({ headline: headline.trim() || null, notes: notes.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", plan.id);
    setSaving(false);
  }

  // Pull anything left unchecked on the most recent earlier plan into this one.
  async function carryOver() {
    const prev = await supabase.from("game_plans").select("id,plan_date").lt("plan_date", date).order("plan_date", { ascending: false }).limit(1).maybeSingle();
    const prevPlan = prev.data as { id: string; plan_date: string } | null;
    if (!prevPlan) { showToast("No earlier game plan to pull from."); return; }
    const left = await supabase.from("game_plan_items").select("body,job_id,sort_order").eq("plan_id", prevPlan.id).eq("done", false).order("sort_order");
    const rows = (left.data as { body: string; job_id: string | null; sort_order: number }[]) ?? [];
    if (!rows.length) { showToast(`Nothing was left open on ${shortDate(prevPlan.plan_date)}.`); return; }
    if (!(await ask({ title: `Bring over ${rows.length} unfinished line${rows.length === 1 ? "" : "s"} from ${shortDate(prevPlan.plan_date)}?`, confirm: "Bring over" }))) return;
    const p = await ensurePlan();
    if (!p) return;
    const base = items.length ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
    const { error } = await supabase.from("game_plan_items").insert(rows.map((r, idx) => ({ plan_id: p.id, body: r.body, job_id: r.job_id, sort_order: base + idx })));
    if (error) { showError("Carry-over failed: " + error.message); return; }
    loadPlan(date);
  }

  async function addSchedLine(s: Sched) {
    const label = s.jobs ? jobLabel(s.jobs) : (s.label ?? "");
    if (!label) return;
    const p = await ensurePlan();
    if (!p) return;
    const base = items.length ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
    await supabase.from("game_plan_items").insert({ plan_id: p.id, body: label, job_id: s.job_id, sort_order: base });
    loadPlan(date);
  }

  async function deletePlan() {
    if (!plan) return;
    if (!(await ask({ title: `Delete the whole game plan for ${shortDate(date)}?`, body: "Every line goes with it.", confirm: "Delete plan", danger: true }))) return;
    await supabase.from("game_plans").delete().eq("id", plan.id);
    setPlan(null); setItems([]); setHeadline(""); setNotes("");
    loadSide();
  }

  const isToday = date === todayISO();
  const openCount = items.length - doneCount;

  const header = (
    <PageHeader
      title="Game plan"
      sub={`${longDate(date)} · ${isToday ? "Today" : plan ? "Saved plan" : "No plan yet"}`}
      actions={<>
        <Button variant="outline" size="icon" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day"><ChevronLeft size={18} /></Button>
        <Input type="date" aria-label="Pick a date" className="w-[160px]" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <Button variant="outline" size="icon" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day"><ChevronRight size={18} /></Button>
        {!isToday ? <Button variant="outline" onClick={() => setDate(todayISO())}>Today</Button> : null}
      </>}
    />
  );

  if (err) return <div>{header}<LoadError message={err} onRetry={() => { loadPlan(date); loadSide(); }} /></div>;

  return (
    <div>
      {header}

      {!loading || items.length ? (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <Stat label="Lines" value={items.length} />
          <Stat label="Done" value={doneCount} tone={items.length && doneCount === items.length ? "ok" : undefined} hint={items.length ? `${pct}%` : undefined} />
          <Stat label="Still open" value={openCount} tone={openCount ? "warn" : undefined} />
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* Headline + progress */}
          <Card className="space-y-3 p-3.5">
            <Input className="font-semibold" placeholder="Game plan for the day — one line (optional)"
              value={headline} onChange={(e) => setHeadline(e.target.value)} onBlur={saveHeader} />
            {items.length ? (
              <div>
                <div className="mb-1 flex items-baseline justify-between text-sm font-semibold text-neutral-300">
                  <span>{doneCount} of {items.length} done</span><span className="tabular-nums">{pct}%</span>
                </div>
                <Progress value={pct} tone="ok" className="h-2" />
              </div>
            ) : null}
          </Card>

          {/* Add lines */}
          <Card className="space-y-2.5 p-3.5">
            <Textarea className="h-24 resize-y" placeholder={"Everything that needs to get done…\nOne per line — paste a whole list and each line becomes its own item."}
              value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addItems(); }} />
            <div className="flex gap-2">
              <JobPicker jobs={jobs} value={draftJob} onChange={setDraftJob} className="min-w-0 flex-1" />
              <Button onClick={addItems} disabled={!draft.trim()} className="shrink-0"><Plus size={16} /> Add</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="h-10" onClick={carryOver}><History size={15} /> Carry over unfinished</Button>
              {plan ? <Button variant="ghost" size="sm" className="h-10 text-neutral-500 hover:text-red-300" onClick={deletePlan}><Trash2 size={15} /> Delete this plan</Button> : null}
              {saving ? <span className="text-xs text-neutral-500">Saving…</span> : null}
            </div>
          </Card>

          {/* The plan */}
          <section>
            <SectionTitle>The plan{items.length ? <span className="ml-1.5 text-sm font-normal text-neutral-500">{items.length}</span> : null}</SectionTitle>
            {loading && !items.length ? <ListSkeleton /> : null}
            {!loading && !items.length ? (
              <Empty icon={<ClipboardList size={26} />} title={`Nothing written down for ${shortDate(date)} yet`} body="Type the day out above, or carry over what was left open last time." />
            ) : null}
            <div className="space-y-2">
              {items.map((it) => (
                <Card key={it.id} className="flex items-start gap-2 px-2 py-1.5">
                  <button onClick={() => toggle(it)} aria-label="Toggle done" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-accent">
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border", it.done ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300" : "border-neutral-600 text-transparent hover:text-neutral-500")}>
                      <Check size={13} strokeWidth={3} />
                    </span>
                  </button>
                  <div className="min-w-0 flex-1 py-2">
                    <div className={cn("whitespace-pre-wrap break-words text-sm", it.done ? "text-neutral-400 line-through" : "text-white")}>{it.body}</div>
                    {it.job_id && jobById[it.job_id] ? <div className="truncate text-xs text-neutral-400">{jobLabel(jobById[it.job_id])}</div> : null}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(it)} aria-label="Delete" className="shrink-0 text-neutral-500 hover:text-red-300"><X size={16} /></Button>
                </Card>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-[76px]">
          {/* On the schedule that day */}
          {sched.length ? (
            <Card className="p-4">
              <h3 className="mb-2 text-[15px] font-semibold text-white">On the schedule</h3>
              <div className="space-y-1">
                {sched.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-400" />
                    <span className="min-w-0 flex-1 truncate text-sm text-neutral-300">{s.jobs ? jobLabel(s.jobs) : s.label}</span>
                    <Button variant="ghost" size="sm" className="h-10 shrink-0" onClick={() => addSchedLine(s)}><Plus size={14} /> Add</Button>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {/* Notes */}
          <Card className="p-4">
            <h3 className="mb-2 text-[15px] font-semibold text-white">Notes for the day</h3>
            <Textarea className="h-28 resize-y" placeholder="Anything that isn't a checkbox — who's on what, what to watch, what to order."
              value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveHeader} />
          </Card>

          {/* Recent plans */}
          {recent.length ? (
            <Card className="p-4">
              <h3 className="mb-2 text-[15px] font-semibold text-white">Recent game plans</h3>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <Button key={r.plan_date} size="sm" variant="outline" onClick={() => setDate(r.plan_date)}
                    className={cn("h-9", r.plan_date === date && "border-white bg-white text-neutral-900 hover:bg-neutral-200")}>
                    {shortDate(r.plan_date)}
                  </Button>
                ))}
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
