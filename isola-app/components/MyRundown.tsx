"use client";
// v9.0 (11/16/26): My rundown — Mike's own day plan, completely separate from Tasks.
// Each item has the day he plans to do it and a horizon: Immediate · Short term · Long term.
// Table: public.my_rundown (owner-only RLS).
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, firstError } from "@/lib/load";
import { withPhoneLinks } from "@/lib/phoneLinks";
import { undoable, showError } from "@/components/Toaster";
import { SwipeRow } from "@/components/ui/swipe-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/tabs";
import { PageHeader, SectionTitle, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { Check, Plus, Trash2, Undo2, ChevronDown, ChevronUp, Sun, CalendarDays, X } from "lucide-react";

type Horizon = "immediate" | "short" | "long";
type Item = {
  id: string; title: string; notes: string | null; plan_date: string | null;
  horizon: Horizon; done: boolean; done_at: string | null; sort: number; created_at: string;
};
type View = "today" | "tomorrow" | "week" | "all";

const HORIZONS: { key: Horizon; label: string; cls: string }[] = [
  { key: "immediate", label: "Immediate", cls: "text-amber-300" },
  { key: "short", label: "Short term", cls: "text-white" },
  { key: "long", label: "Long term", cls: "text-neutral-300" },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const fmtDay = (s: string) => {
  if (s === addDays(0)) return "Today";
  if (s === addDays(1)) return "Tomorrow";
  if (s === addDays(-1)) return "Yesterday";
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

export default function MyRundown() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  // add form
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(addDays(0));
  const [horizon, setHorizon] = useState<Horizon>("immediate");

  async function load() {
    setErr(null);
    try {
      const [r] = await withTimeout(Promise.all([
        supabase.from("my_rundown").select("*").order("plan_date", { ascending: true, nullsFirst: false }).order("sort").order("created_at"),
      ]));
      const e = firstError(r);
      if (e) throw new Error(e);
      setItems((r.data as Item[]) ?? []);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? "Couldn't load your rundown.");
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const today = addDays(0), tomorrow = addDays(1), weekEnd = addDays(6);
  const open = (items ?? []).filter((i) => !i.done);
  const done = (items ?? []).filter((i) => i.done).sort((a, b) => (a.done_at ?? "") < (b.done_at ?? "") ? 1 : -1);
  // Unfinished items from past days roll forward onto Today.
  const inView = (i: Item) => {
    const d = i.plan_date;
    if (view === "all") return true;
    if (view === "today") return !!d && d <= today;
    if (view === "tomorrow") return d === tomorrow;
    return !!d && d <= weekEnd; // week (includes carried-over)
  };
  const shown = open.filter(inView);
  const countFor = (v: View) => open.filter((i) => {
    const d = i.plan_date;
    if (v === "all") return true;
    if (v === "today") return !!d && d <= today;
    if (v === "tomorrow") return d === tomorrow;
    return !!d && d <= weekEnd;
  }).length;

  async function add() {
    if (!title.trim()) return;
    const { error } = await supabase.from("my_rundown").insert({ title: title.trim(), plan_date: date || null, horizon });
    if (error) { showError("Add failed: " + error.message); return; }
    setTitle("");
    load();
  }

  async function patch(i: Item, p: Partial<Item>) {
    setItems((prev) => (prev ?? []).map((x) => (x.id === i.id ? { ...x, ...p } : x)));
    const { error } = await supabase.from("my_rundown").update(p).eq("id", i.id);
    if (error) { showError("Save failed: " + error.message); load(); }
  }
  const toggle = (i: Item) => patch(i, { done: !i.done, done_at: !i.done ? new Date().toISOString() : null });

  function remove(i: Item) {
    const prev = items ?? [];
    undoable({
      text: "Removed from your rundown",
      hide: () => setItems(prev.filter((x) => x.id !== i.id)),
      restore: () => setItems(prev),
      commit: async () => { await supabase.from("my_rundown").delete().eq("id", i.id); load(); },
    });
  }

  function row(i: Item) {
    const late = !i.done && !!i.plan_date && i.plan_date < today;
    const isEditing = editing === i.id;
    return (
      <SwipeRow key={i.id}
        right={{ label: i.done ? "Reopen" : "Done", icon: i.done ? <Undo2 size={16} /> : <Check size={16} />, tone: "success", onCommit: () => toggle(i) }}
        left={{ label: "Delete", icon: <Trash2 size={16} />, tone: "danger", onCommit: () => remove(i) }}>
        <Card className="px-3 py-2.5">
          <div className="flex min-h-[44px] items-center gap-3">
            <button onClick={() => toggle(i)} aria-label="Toggle done"
              className="-m-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-accent">
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border", i.done ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300" : "border-neutral-600 text-transparent hover:text-neutral-500")}>
                <Check size={13} strokeWidth={3} />
              </span>
            </button>
            <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(isEditing ? null : i.id)}>
              <div className={cn("text-sm", i.done ? "text-neutral-400 line-through" : "font-medium text-white")}>{withPhoneLinks(i.title)}</div>
              <div className="truncate text-xs">
                {i.plan_date
                  ? <span className={late ? "font-semibold text-red-300" : i.plan_date === today ? "text-amber-300" : "text-neutral-400"}>{late ? "Carried over · " : ""}{fmtDay(i.plan_date)}</span>
                  : <span className="text-neutral-500">No day set</span>}
                {i.notes ? <span className="text-neutral-500"> · {i.notes}</span> : null}
              </div>
            </button>
            <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Delete" className="shrink-0 text-neutral-500 hover:text-red-300">
              <X size={16} />
            </Button>
          </div>
          {isEditing ? (
            <div className="mt-2.5 grid gap-2 border-t border-border pt-2.5 sm:grid-cols-2">
              <Input defaultValue={i.title} aria-label="Title" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== i.title) patch(i, { title: v }); }} className="sm:col-span-2" />
              <Input type="date" aria-label="Day" value={i.plan_date ?? ""} onChange={(e) => patch(i, { plan_date: e.target.value || null })} />
              <NativeSelect aria-label="Horizon" value={i.horizon} onChange={(e) => patch(i, { horizon: e.target.value as Horizon })}>
                {HORIZONS.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
              </NativeSelect>
              <Textarea rows={2} placeholder="Notes (optional)" defaultValue={i.notes ?? ""} className="sm:col-span-2"
                onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== i.notes) patch(i, { notes: v }); }} />
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button size="sm" variant="outline" onClick={() => patch(i, { plan_date: today })}>Today</Button>
                <Button size="sm" variant="outline" onClick={() => patch(i, { plan_date: tomorrow })}>Tomorrow</Button>
                <Button size="sm" variant="outline" onClick={() => patch(i, { plan_date: addDays(7) })}>Next week</Button>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEditing(null)}>Close</Button>
              </div>
            </div>
          ) : null}
        </Card>
      </SwipeRow>
    );
  }

  const header = (
    <PageHeader title="My rundown"
      sub={items ? `${countFor("today")} today · ${countFor("tomorrow")} tomorrow · ${open.length} open — just for you, separate from Tasks` : "Loading…"} />
  );
  if (err) return <div>{header}<LoadError message={err} onRetry={load} /></div>;

  return (
    <div>
      {header}

      <Card className="mb-5 space-y-2.5 p-3.5">
        <Input placeholder="What are you going to do?" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-[180px_180px_auto]">
          <Input type="date" aria-label="Day you plan to do it" value={date} onChange={(e) => setDate(e.target.value)} />
          <NativeSelect aria-label="Horizon" value={horizon} onChange={(e) => setHorizon(e.target.value as Horizon)}>
            {HORIZONS.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
          </NativeSelect>
          <Button onClick={add} disabled={!title.trim()} className="col-span-2 md:col-span-1"><Plus size={16} /> Add</Button>
        </div>
        <div className="flex gap-2 text-xs">
          <button className={cn("rounded-md border border-border px-2 py-1", date === today ? "text-white" : "text-neutral-400")} onClick={() => setDate(today)}>Today</button>
          <button className={cn("rounded-md border border-border px-2 py-1", date === tomorrow ? "text-white" : "text-neutral-400")} onClick={() => setDate(tomorrow)}>Tomorrow</button>
          <button className={cn("rounded-md border border-border px-2 py-1", !date ? "text-white" : "text-neutral-400")} onClick={() => setDate("")}>No day</button>
        </div>
      </Card>

      <Segmented<View> className="mb-5" value={view} onChange={setView} options={[
        { value: "today", label: `Today ${countFor("today")}`, icon: <Sun size={14} /> },
        { value: "tomorrow", label: `Tomorrow ${countFor("tomorrow")}` },
        { value: "week", label: `Week ${countFor("week")}`, icon: <CalendarDays size={14} /> },
        { value: "all", label: `All ${countFor("all")}` },
      ]} />

      {!items ? <ListSkeleton /> : (
        <div className="space-y-6">
          {HORIZONS.map((h) => {
            const list = shown.filter((i) => i.horizon === h.key);
            return (
              <section key={h.key}>
                <SectionTitle>
                  <span className={h.cls}>{h.label}</span>
                  <span className="ml-1.5 text-sm font-normal text-neutral-500">{list.length}</span>
                </SectionTitle>
                {list.length ? <div className="grid gap-2 md:grid-cols-2">{list.map(row)}</div>
                  : <p className="text-sm text-neutral-500">Nothing here.</p>}
              </section>
            );
          })}
          {open.length === 0 ? <Empty icon={<Sun size={26} />} title="Clear" body="Add what you're going to do above and pick the day." /> : null}
        </div>
      )}

      {done.length ? (
        <div className="mt-8">
          <Button variant="ghost" size="sm" onClick={() => setShowDone(!showDone)} className="-ml-2 text-neutral-400">
            {showDone ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {showDone ? "Hide" : "Show"} done ({done.length})
          </Button>
          {showDone ? <div className="mt-2.5 grid gap-2 md:grid-cols-2">{done.map(row)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
