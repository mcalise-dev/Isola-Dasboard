"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayISO, fmtDate, jobLabel } from "@/lib/format";

/* ============================================================
   DAILY LOG — the most standard document in construction, and the
   one thing the app never had. Date, weather, who was on site, what
   got done, what held you up. It is how a job gets reconstructed six
   months later when someone disputes it.

   One log per job per day (enforced by a unique index), so the same
   day can be reopened and added to rather than duplicated.
   ============================================================ */

const inp =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-400 focus:outline-none";
const lbl = "block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1";
const btn =
  "rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-500";
const btnPrimary =
  "rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-neutral-900 hover:bg-neutral-200 disabled:opacity-40";
const card = "rounded-xl border border-neutral-800 bg-neutral-950 p-3.5";

const WEATHER = ["Clear", "Cloudy", "Rain", "Snow", "Wind", "Hot", "Cold"];

export default function DailyLogTab() {
  const supabase = useMemo(() => createClient(), []);
  const [logs, setLogs] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [l, j, w] = await Promise.all([
      supabase.from("daily_logs").select("*").order("log_date", { ascending: false }).limit(120),
      supabase.from("jobs").select("id,job_name,customer,location,job,status").neq("status", "complete").order("customer"),
      supabase.from("workers").select("id,name,active").order("name"),
    ]);
    setLogs(l.data ?? []);
    setJobs(j.data ?? []);
    setWorkers((w.data ?? []).filter((x: any) => x.active !== false));
    setLoading(false);
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
    if (!editing.job_id) return alert("Pick the job this log is for.");
    if (!editing.work_performed?.trim()) return alert("Write what got done — that's the whole point of the log.");
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
    if (error) return alert("Save failed: " + error.message);
    setEditing(null);
    load();
  }

  async function remove(l: any) {
    if (!confirm(`Delete the log for ${fmtDate(l.log_date)}?`)) return;
    await supabase.from("daily_logs").delete().eq("id", l.id);
    load();
  }

  function toggleCrew(name: string) {
    const cur: string[] = editing.crew ?? [];
    setEditing({ ...editing, crew: cur.includes(name) ? cur.filter((c) => c !== name) : [...cur, name] });
  }

  if (loading) return <div className="p-4 text-sm text-neutral-500">Loading…</div>;

  const today = logs.filter((l) => l.log_date === todayISO());
  const earlier = logs.filter((l) => l.log_date !== todayISO());

  function row(l: any) {
    const j = jobById[l.job_id];
    return (
      <div key={l.id} className={card + " space-y-1.5"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{j ? jobLabel(j) : "—"}</div>
            <div className="text-[11px] text-neutral-500">
              {fmtDate(l.log_date)}
              {l.weather ? ` · ${l.weather}` : ""}
              {l.temp_f != null ? ` ${l.temp_f}°` : ""}
              {l.hours_on_site ? ` · ${l.hours_on_site} hrs on site` : ""}
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => setEditing({ ...l, temp_f: l.temp_f ?? "", hours_on_site: l.hours_on_site ?? "" })} className={btn}>Edit</button>
            <button onClick={() => remove(l)} className="text-neutral-600 hover:text-red-400 text-sm px-1">✕</button>
          </div>
        </div>
        {l.crew?.length ? (
          <div className="flex flex-wrap gap-1">
            {l.crew.map((c: string) => (
              <span key={c} className="rounded-md border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-300">{c}</span>
            ))}
          </div>
        ) : null}
        <p className="text-sm text-neutral-200 whitespace-pre-wrap">{l.work_performed}</p>
        {l.delays ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
            <span className="font-bold">Delay:</span> {l.delays}
          </div>
        ) : null}
        {l.materials_received ? <p className="text-[11px] text-neutral-500"><span className="font-bold">Delivered:</span> {l.materials_received}</p> : null}
        {l.visitors ? <p className="text-[11px] text-neutral-500"><span className="font-bold">On site:</span> {l.visitors}</p> : null}
        {l.notes ? <p className="text-[11px] text-neutral-500 whitespace-pre-wrap">{l.notes}</p> : null}
      </div>
    );
  }

  return (
    <div className="pb-28 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">Daily log</h1>
          <p className="text-xs text-neutral-500">What happened on site, day by day</p>
        </div>
        <button onClick={startNew} className={btnPrimary}>＋ Log today</button>
      </div>

      {editing ? (
        <div className={card + " space-y-3"}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Job</label>
              <select className={inp} value={editing.job_id ?? ""} onChange={(e) => setEditing({ ...editing, job_id: e.target.value })}>
                <option value="">Pick a job…</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Date</label>
              <input type="date" className={inp} value={editing.log_date} onChange={(e) => setEditing({ ...editing, log_date: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={lbl}>Weather</label>
              <input className={inp} list="weather-opts" value={editing.weather} onChange={(e) => setEditing({ ...editing, weather: e.target.value })} />
              <datalist id="weather-opts">{WEATHER.map((w) => <option key={w} value={w} />)}</datalist>
            </div>
            <div>
              <label className={lbl}>Temp °F</label>
              <input type="number" inputMode="numeric" className={inp} value={editing.temp_f} onChange={(e) => setEditing({ ...editing, temp_f: e.target.value })} />
            </div>
            <div>
              <label className={lbl}>Hrs on site</label>
              <input type="number" inputMode="decimal" className={inp} value={editing.hours_on_site} onChange={(e) => setEditing({ ...editing, hours_on_site: e.target.value })} />
            </div>
          </div>

          <div>
            <label className={lbl}>Who was on site</label>
            <div className="flex flex-wrap gap-1.5">
              {workers.map((w) => {
                const on = (editing.crew ?? []).includes(w.name);
                return (
                  <button key={w.id} onClick={() => toggleCrew(w.name)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${on ? "border-neutral-300 bg-neutral-800 text-white" : "border-neutral-700 bg-neutral-900 text-neutral-400"}`}>
                    {w.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={lbl}>Work performed</label>
            <textarea rows={3} className={inp} value={editing.work_performed}
              placeholder="Formed and poured the 24×16 pad, stripped forms on the curb…"
              onChange={(e) => setEditing({ ...editing, work_performed: e.target.value })} />
          </div>

          <div>
            <label className={lbl}>Delays or problems</label>
            <input className={inp} value={editing.delays} placeholder="Rain until 10, waiting on the gate code…"
              onChange={(e) => setEditing({ ...editing, delays: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Materials delivered</label>
              <input className={inp} value={editing.materials_received} onChange={(e) => setEditing({ ...editing, materials_received: e.target.value })} />
            </div>
            <div>
              <label className={lbl}>Visitors</label>
              <input className={inp} value={editing.visitors} placeholder="Inspector, PM, owner"
                onChange={(e) => setEditing({ ...editing, visitors: e.target.value })} />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className={btnPrimary + " flex-1"}>{saving ? "Saving…" : "Save log"}</button>
            <button onClick={() => setEditing(null)} className={btn}>Cancel</button>
          </div>
        </div>
      ) : null}

      {today.length ? (
        <section className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Today</div>
          {today.map(row)}
        </section>
      ) : null}

      {earlier.length ? (
        <section className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Earlier</div>
          {earlier.map(row)}
        </section>
      ) : null}

      {logs.length === 0 && !editing ? (
        <div className={card}>
          <div className="text-sm font-semibold text-white">No logs yet.</div>
          <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
            One entry per job per day. Two minutes at the truck before you pull out. It's what settles
            an argument six months from now about who was there, what the weather did, and when the
            gate was locked.
          </p>
        </div>
      ) : null}
    </div>
  );
}
