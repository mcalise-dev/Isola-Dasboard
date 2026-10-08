"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { coShort } from "@/lib/crm";
import { withTimeout, firstError } from "@/lib/load";
import { showError, showToast, undoable } from "@/components/Toaster";
import { PageHeader, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, Check, X, ChevronDown, Megaphone } from "lucide-react";

type MktTask = {
  id: string;
  title: string;
  contact_id: string | null;
  channel: string | null;
  due_date: string | null;
  timeframe: string | null;
  priority: string;
  done: boolean;
  created_at: string;
  completed_at: string | null;
};
type ContactLite = { id: string; name: string; company: string | null };

const TIMEFRAMES = ["Short term", "Long term", "Ongoing", "Someday"];
const CHANNELS = ["Call", "Email", "LinkedIn", "Walk-through", "One-pager", "Other"];
const PRIO_VARIANT: Record<string, "danger" | "warning" | "muted"> = {
  high: "danger",
  medium: "warning",
  low: "muted",
};
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDue = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function MktTasksTab() {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<MktTask[]>([]);
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [channel, setChannel] = useState("");
  const [prio, setPrio] = useState("medium");
  const [when, setWhen] = useState("");
  const [due, setDue] = useState("");

  async function load() {
    setErr(null);
    try {
      const [t, c] = await withTimeout(Promise.all([
        supabase.from("mkt_tasks").select("*").order("created_at", { ascending: false }),
        supabase.from("contacts").select("id,name,company").order("name"),
      ]));
      const bad = firstError(t, c);
      if (bad) throw new Error(bad);
      setTasks((t.data as MktTask[]) ?? []);
      setContacts((c.data as ContactLite[]) ?? []);
      setLoading(false);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); }, []);

  const contactById = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts]);
  const sortKey = (t: MktTask) => (t.due_date ? "0" + t.due_date : t.timeframe === "Short term" ? "1" : t.timeframe === "Ongoing" ? "2" : t.timeframe === "Long term" ? "3" : t.timeframe === "Someday" ? "4" : "2z");
  const prioN: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const openTasks = tasks.filter((t) => !t.done).sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || (prioN[a.priority] ?? 1) - (prioN[b.priority] ?? 1));
  const doneTasks = tasks.filter((t) => t.done);
  const dueNow = openTasks.filter((t) => t.due_date && t.due_date <= todayISO()).length;
  const sections = useMemo(() => {
    const today = todayISO();
    const buckets: { key: string; label: string; cls: string; items: MktTask[] }[] = [
      { key: "overdue", label: "Overdue", cls: "text-red-400", items: [] },
      { key: "today", label: "Today", cls: "text-amber-300", items: [] },
      { key: "upcoming", label: "Upcoming", cls: "text-neutral-400", items: [] },
      { key: "Short term", label: "Short term", cls: "text-neutral-400", items: [] },
      { key: "Ongoing", label: "Ongoing", cls: "text-neutral-400", items: [] },
      { key: "Long term", label: "Long term", cls: "text-neutral-400", items: [] },
      { key: "Someday", label: "Someday", cls: "text-neutral-500", items: [] },
      { key: "nodate", label: "No date", cls: "text-neutral-500", items: [] },
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

  async function add() {
    if (!title.trim()) return;
    const { error } = await supabase.from("mkt_tasks").insert({
      title: title.trim(),
      contact_id: contactId || null,
      channel: channel || null,
      priority: prio,
      due_date: when === "date" && due ? due : null,
      timeframe: when && when !== "date" ? when : null,
    });
    if (error) { showError("Add failed: " + error.message); return; }
    setTitle(""); setContactId(""); setChannel(""); setWhen(""); setDue("");
    showToast("Task added");
    load();
  }

  async function toggle(t: MktTask) {
    const { error } = await supabase.from("mkt_tasks").update({ done: !t.done, completed_at: !t.done ? new Date().toISOString() : null }).eq("id", t.id);
    if (error) { showError("Save failed: " + error.message); return; }
    load();
  }

  function remove(t: MktTask) {
    const before = tasks;
    undoable({
      text: "Task deleted",
      hide: () => setTasks((cur) => cur.filter((x) => x.id !== t.id)),
      restore: () => setTasks(before),
      commit: () => supabase.from("mkt_tasks").delete().eq("id", t.id),
    });
  }

  function row(t: MktTask) {
    const c = t.contact_id ? contactById[t.contact_id] : null;
    return (
      <Card key={t.id} className="flex items-center gap-2 py-1.5 pl-1.5 pr-1.5">
        <button onClick={() => toggle(t)} aria-label={t.done ? "Mark not done" : "Mark done"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-white/[0.05]">
          <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border", t.done ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300" : "border-neutral-500 text-transparent")}>
            <Check size={13} strokeWidth={3} />
          </span>
        </button>
        <div className="min-w-0 flex-1 py-1">
          <div className={cn("text-sm", t.done ? "text-neutral-400 line-through" : "text-white")}>{t.title}</div>
          <div className="truncate text-xs text-neutral-400">
            {t.due_date ? (
              <span className={!t.done && t.due_date <= todayISO() ? "font-semibold text-red-400" : "text-neutral-400"}>
                {!t.done && t.due_date < todayISO() ? "Overdue · " : "Due "}{fmtDue(t.due_date)}
              </span>
            ) : t.timeframe ? <span>{t.timeframe}</span> : null}
            {t.channel ? <span>{(t.due_date || t.timeframe) ? " · " : ""}{t.channel}</span> : null}
            {c ? <span> · {c.name}{c.company ? ` (${coShort(c.company)})` : ""}</span> : null}
          </div>
        </div>
        {!t.done ? (
          <Badge variant={PRIO_VARIANT[t.priority] ?? "warning"} className="shrink-0 capitalize">{t.priority}</Badge>
        ) : null}
        <Button variant="ghost" size="icon" className="shrink-0 text-neutral-500 hover:text-red-400" onClick={() => remove(t)} aria-label="Delete"><X size={16} /></Button>
      </Card>
    );
  }

  const overdueN = openTasks.filter((t) => t.due_date && t.due_date < todayISO()).length;
  const header = <PageHeader title="Marketing tasks" sub="Outreach to do — calls, emails, walk-throughs" />;

  if (err) return <div className="pb-28">{header}<LoadError message={err} onRetry={load} /></div>;

  return (
    <div className="pb-28">
      {header}

      {!loading ? (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Stat label="Open" value={openTasks.length} />
          <Stat label="Due now" value={dueNow} tone={dueNow ? (overdueN ? "bad" : "warn") : undefined} />
          <Stat label="Done" value={doneTasks.length} tone={doneTasks.length ? "ok" : undefined}
            onClick={doneTasks.length ? () => setShowDone(!showDone) : undefined} />
        </div>
      ) : null}

      <Card className="mb-5 space-y-2.5 p-3.5">
        <Input placeholder="New marketing task… e.g. Call Carpionato PM office" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <NativeSelect className="min-w-0" value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">No contact</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${coShort(c.company)}` : ""}</option>)}
          </NativeSelect>
          <NativeSelect className="w-auto" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">Type</option>
            {CHANNELS.map((c) => <option key={c}>{c}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          <NativeSelect className="min-w-0 flex-1 basis-full sm:basis-auto" value={when} onChange={(e) => setWhen(e.target.value)}>
            <option value="">When? (optional)</option>
            <option value="date">Specific date…</option>
            {TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </NativeSelect>
          {when === "date" ? <Input type="date" className="w-auto min-w-0 flex-1 sm:flex-none" value={due} onChange={(e) => setDue(e.target.value)} /> : null}
          <NativeSelect className="w-auto" value={prio} onChange={(e) => setPrio(e.target.value)}>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </NativeSelect>
          <Button className="ml-auto" onClick={add} disabled={!title.trim()}><Plus size={16} /> Add</Button>
        </div>
      </Card>

      {loading ? <ListSkeleton /> : (
        <>
          <div className="space-y-5">
            {sections.map((s) => (
              <section key={s.key}>
                <div className={cn("flex items-baseline gap-2 pb-2 text-sm font-semibold", s.cls)}>
                  {s.label}<span className="font-semibold tabular-nums text-neutral-500">{s.items.length}</span>
                </div>
                <div className="space-y-2">{s.items.map(row)}</div>
              </section>
            ))}
          </div>
          {openTasks.length === 0 ? (
            <Empty icon={<Megaphone size={28} />} title="No marketing tasks yet." body="Add the week's outreach here." />
          ) : null}

          {doneTasks.length ? (
            <div className="mt-6">
              <Button variant="ghost" size="sm" className="h-10 px-2 text-neutral-400" onClick={() => setShowDone(!showDone)}>
                <ChevronDown size={16} className={cn("transition-transform", showDone && "rotate-180")} />
                {showDone ? "Hide" : "Show"} completed ({doneTasks.length})
              </Button>
              {showDone ? <div className="mt-2.5 space-y-2">{doneTasks.map(row)}</div> : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
