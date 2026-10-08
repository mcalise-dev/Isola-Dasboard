"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayISO, fmtDate, jobLabel } from "@/lib/format";
import JobPicker from "@/components/JobPicker";
import { showError, showToast, undoable } from "@/components/Toaster";
import { withTimeout, firstError } from "@/lib/load";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Textarea, Field } from "@/components/ui/input";
import { PageHeader, SectionTitle, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, AlertTriangle, NotebookPen } from "lucide-react";

/* ============================================================
   DAILY LOG — the most standard document in construction, and the
   one thing the app never had. Date, weather, who was on site, what
   got done, what held you up. It is how a job gets reconstructed six
   months later when someone disputes it.

   One log per job per day (enforced by a unique index), so the same
   day can be reopened and added to rather than duplicated.
   ============================================================ */

const WEATHER = ["Clear", "Cloudy", "Rain", "Snow", "Wind", "Hot", "Cold"];

export default function DailyLogTab() {
  const supabase = useMemo(() => createClient(), []);
  const [logs, setLogs] = useState<any[] | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setErr(null);
    try {
      const [l, j, w] = await withTimeout(Promise.all([
        supabase.from("daily_logs").select("*").order("log_date", { ascending: false }).limit(120),
        supabase.from("jobs").select("id,job_name,customer,location,job,status,paid_date,priority").neq("status", "complete").order("customer"),
        supabase.from("workers").select("id,name,active").order("name"),
      ]));
      const e = firstError(l, j, w);
      if (e) throw new Error(e);
      setLogs(l.data ?? []);
      setJobs(j.data ?? []);
      setWorkers((w.data ?? []).filter((x: any) => x.active !== false));
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);

  function startNew() {
    setEditing({
      job_id: "", log_date: todayISO(), weather: "", temp_f: "", crew: [] as string[],
      hours_on_site: "", work_performed: "", delays: "", materials_received: "", visitors: "", notes: "",
    });
  }

  async function save() {
    if (!editing.job_id) return showError("Pick the job this log is for.");
    if (!editing.work_performed?.trim()) return showError("Write what got done — that's the whole point of the log.");
    setSaving(true);
    const row: any = {
      job_id: editing.job_id,
      log_date: editing.log_date || todayISO(),
      weather: editing.weather || null,
      temp_f: editing.temp_f === "" ? null : Number(editing.temp_f),
      crew: editing.crew ?? [],
      hours_on_site: editing.hours_on_site === "" ? null : Number(editing.hours_on_site),
      work_performed: editing.work_performed?.trim() || null,
      delays: editing.delays?.trim() || null,
      materials_received: editing.materials_received?.trim() || null,
      visitors: editing.visitors?.trim() || null,
      notes: editing.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    // one log per job per day — reopen the existing one instead of failing
    const { error } = editing.id
      ? await supabase.from("daily_logs").update(row).eq("id", editing.id)
      : await supabase.from("daily_logs").upsert(row, { onConflict: "job_id,log_date" });
    setSaving(false);
    if (error) return showError("Save failed: " + error.message);
    setEditing(null);
    showToast("Log saved");
    load();
  }

  function remove(l: any) {
    const before = logs ?? [];
    undoable({
      text: `Deleted the log for ${fmtDate(l.log_date)}`,
      hide: () => setLogs(before.filter((x) => x.id !== l.id)),
      restore: () => setLogs(before),
      commit: () => supabase.from("daily_logs").delete().eq("id", l.id),
    });
  }

  function toggleCrew(name: string) {
    const cur: string[] = editing.crew ?? [];
    setEditing({ ...editing, crew: cur.includes(name) ? cur.filter((c) => c !== name) : [...cur, name] });
  }

  const header = (
    <PageHeader
      title="Daily log"
      sub="What happened on site, day by day"
      actions={<Button onClick={startNew}><Plus size={16} /> Log today</Button>}
    />
  );

  if (err) return <div>{header}<LoadError message={err} onRetry={load} /></div>;
  if (!logs) return <div>{header}<ListSkeleton /></div>;

  const today = logs.filter((l) => l.log_date === todayISO());
  const earlier = logs.filter((l) => l.log_date !== todayISO());
  const withDelays = logs.filter((l) => l.delays).length;

  function row(l: any) {
    const j = jobById[l.job_id];
    return (
      <Card key={l.id} className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{j ? jobLabel(j) : "—"}</div>
            <div className="text-xs text-neutral-400">
              {fmtDate(l.log_date)}
              {l.weather ? ` · ${l.weather}` : ""}
              {l.temp_f != null ? ` ${l.temp_f}°` : ""}
              {l.hours_on_site ? ` · ${l.hours_on_site} hrs on site` : ""}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="outline" size="icon" onClick={() => setEditing({ ...l, temp_f: l.temp_f ?? "", hours_on_site: l.hours_on_site ?? "" })} aria-label="Edit log"><Pencil size={15} /></Button>
            <Button variant="ghost" size="icon" onClick={() => remove(l)} aria-label="Delete log" className="text-neutral-500 hover:text-red-400"><Trash2 size={15} /></Button>
          </div>
        </div>
        {l.crew?.length ? (
          <div className="flex flex-wrap gap-1">
            {l.crew.map((c: string) => <Badge key={c}>{c}</Badge>)}
          </div>
        ) : null}
        <p className="whitespace-pre-wrap text-sm text-neutral-200">{l.work_performed}</p>
        {l.delays ? (
          <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span><span className="font-bold">Delay:</span> {l.delays}</span>
          </div>
        ) : null}
        {l.materials_received ? <p className="text-xs text-neutral-400"><span className="font-bold">Delivered:</span> {l.materials_received}</p> : null}
        {l.visitors ? <p className="text-xs text-neutral-400"><span className="font-bold">On site:</span> {l.visitors}</p> : null}
        {l.notes ? <p className="whitespace-pre-wrap text-xs text-neutral-400">{l.notes}</p> : null}
      </Card>
    );
  }

  return (
    <div className="space-y-5 pb-28">
      {header}

      {logs.length ? (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Today" value={today.length} hint={today.length ? "logged" : "nothing yet"} tone={today.length ? "ok" : undefined} />
          <Stat label="Recent logs" value={logs.length} />
          <Stat label="With delays" value={withDelays} tone={withDelays ? "warn" : undefined} />
        </div>
      ) : null}

      {editing ? (
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Job">
              <JobPicker jobs={jobs} value={editing.job_id ?? ""} onChange={(id) => setEditing({ ...editing, job_id: id })} placeholder="Type to find the job…" />
            </Field>
            <Field label="Date">
              <Input type="date" value={editing.log_date} onChange={(e) => setEditing({ ...editing, log_date: e.target.value })} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Weather">
              <Input list="weather-opts" value={editing.weather} onChange={(e) => setEditing({ ...editing, weather: e.target.value })} />
              <datalist id="weather-opts">{WEATHER.map((w) => <option key={w} value={w} />)}</datalist>
            </Field>
            <Field label="Temp °F">
              <Input type="number" inputMode="numeric" value={editing.temp_f} onChange={(e) => setEditing({ ...editing, temp_f: e.target.value })} />
            </Field>
            <Field label="Hrs on site">
              <Input type="number" inputMode="decimal" value={editing.hours_on_site} onChange={(e) => setEditing({ ...editing, hours_on_site: e.target.value })} />
            </Field>
          </div>

          <Field label="Who was on site">
            <div className="flex flex-wrap gap-1.5">
              {workers.map((w) => {
                const on = (editing.crew ?? []).includes(w.name);
                return (
                  <Button key={w.id} type="button" size="sm" variant="outline" onClick={() => toggleCrew(w.name)} aria-pressed={on}
                    className={cn("h-10", on ? "border-white/60 bg-white/10 text-white" : "text-neutral-400")}>
                    {w.name}
                  </Button>
                );
              })}
            </div>
          </Field>

          <Field label="Work performed">
            <Textarea rows={3} value={editing.work_performed}
              placeholder="Formed and poured the 24×16 pad, stripped forms on the curb…"
              onChange={(e) => setEditing({ ...editing, work_performed: e.target.value })} />
          </Field>

          <Field label="Delays or problems">
            <Input value={editing.delays} placeholder="Rain until 10, waiting on the gate code…"
              onChange={(e) => setEditing({ ...editing, delays: e.target.value })} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Materials delivered">
              <Input value={editing.materials_received} onChange={(e) => setEditing({ ...editing, materials_received: e.target.value })} />
            </Field>
            <Field label="Visitors">
              <Input value={editing.visitors} placeholder="Inspector, PM, owner"
                onChange={(e) => setEditing({ ...editing, visitors: e.target.value })} />
            </Field>
          </div>

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="flex-1">{saving ? "Saving…" : "Save log"}</Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </Card>
      ) : null}

      {today.length ? (
        <section>
          <SectionTitle>Today</SectionTitle>
          <div className="grid items-start gap-3 md:grid-cols-2">{today.map(row)}</div>
        </section>
      ) : null}

      {earlier.length ? (
        <section>
          <SectionTitle>Earlier</SectionTitle>
          <div className="grid items-start gap-3 md:grid-cols-2">{earlier.map(row)}</div>
        </section>
      ) : null}

      {logs.length === 0 && !editing ? (
        <Empty
          icon={<NotebookPen size={26} />}
          title="No logs yet"
          body="One entry per job per day. Two minutes at the truck before you pull out. It's what settles an argument six months from now about who was there, what the weather did, and when the gate was locked."
          action={<Button variant="outline" size="sm" onClick={startNew}><Plus size={15} /> Log today</Button>}
        />
      ) : null}
    </div>
  );
}
