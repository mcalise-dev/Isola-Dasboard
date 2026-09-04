"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MyClock from "@/components/MyClock";
import CrewClock from "@/components/CrewClock";

const money = (n: any) => (n == null ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const hhmm = (from: string, to?: string | null) => {
  const ms = (to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime();
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${String(m).padStart(2, "0")}m`;
};
const t12 = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function CrewTab() {
  const supabase = useMemo(() => createClient(), []);
  const [workers, setWorkers] = useState<any[]>([]);
  const [punches, setPunches] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(t); }, []);

  async function load() {
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const [{ data: w }, { data: p }, { data: j }] = await Promise.all([
      supabase.from("workers").select("*").order("name"),
      supabase.from("time_clock").select("*").gte("clock_in", since).order("clock_in", { ascending: false }),
      supabase.from("jobs").select("id,job_name,customer,location"),
    ]);
    setWorkers(w ?? []); setPunches(p ?? []); setJobs(j ?? []); setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const wName = (id: string) => workers.find((w) => w.id === id)?.name ?? "—";
  const wRow  = (id: string) => workers.find((w) => w.id === id);
  const jName = (id: string) => { const j = jobs.find((x) => x.id === id); return j ? (j.job_name || `${j.customer} — ${j.location}`) : "no job"; };

  async function forceOut(p: any) {
    const w = wRow(p.worker_id);
    if (!w) return;
    if (!confirm(`Clock ${w.name} out now?`)) return;
    await supabase.rpc("crew_punch_out", { p_pin: w.pin, p_note: "Closed by Mike" });
    load();
  }

  const clockUrl = typeof window !== "undefined" ? `${window.location.origin}/clock` : "/clock";
  async function copyClock() {
    try { await navigator.clipboard.writeText(clockUrl); } catch { window.prompt("Copy this link:", clockUrl); }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <p className="pt-4 text-sm text-neutral-500">Loading…</p>;

  const onClock = punches.filter((p) => !p.clock_out);
  const today = new Date().toDateString();
  const todays = punches.filter((p) => new Date(p.clock_in).toDateString() === today);
  const todayHours = todays.reduce((a, p) => a + (new Date(p.clock_out ?? Date.now()).getTime() - new Date(p.clock_in).getTime()) / 3600000, 0);
  const unpaid = punches.filter((p) => p.clock_out);

  return (
    <div className="pt-2 space-y-3">
      <MyClock />
      <CrewClock onChanged={load} />
      <div className="grid grid-cols-3 gap-2">
        <Tile v={String(onClock.length)} l="On the clock" tone={onClock.length ? "amber" : undefined} />
        <Tile v={todayHours.toFixed(1)} l="Hours today" />
        <Tile v={String(workers.filter((w) => w.active).length)} l="Crew" />
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Crew clock-in link</div>
        <div className="mt-1 text-xs text-neutral-400 break-all">{clockUrl}</div>
        <div className="flex gap-1.5 mt-2">
          <button onClick={copyClock} className={btn}>{copied ? "Copied ✓" : "Copy link"}</button>
          <a href="/clock" target="_blank" rel="noopener noreferrer" className={btn}>Open</a>
        </div>
        <p className="mt-2 text-[11px] text-neutral-600">Send this to the guys once — they save it to their home screen and punch in with their PIN. Hours post to the job automatically.</p>
      </div>

      {onClock.length ? (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-1.5">On the clock right now</div>
          <div className="space-y-1.5">
            {onClock.map((p) => (
              <div key={p.id} className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">{wName(p.worker_id)}</div>
                  <div className="text-xs text-neutral-300 truncate">{jName(p.job_id)}</div>
                  <div className="text-[11px] text-neutral-500">in at {t12(p.clock_in)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-extrabold text-white tabular-nums">{hhmm(p.clock_in)}</div>
                  <button onClick={() => forceOut(p)} className="text-[10px] text-neutral-400 underline">clock out</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">Last 14 days</div>
        <div className="space-y-1">
          {unpaid.length === 0 ? <p className="text-xs text-neutral-600">No punches yet.</p> : null}
          {unpaid.map((p) => {
            const w = wRow(p.worker_id);
            const hrs = (new Date(p.clock_out).getTime() - new Date(p.clock_in).getTime()) / 3600000;
            const amt = w?.rate_type === "daily" ? w?.rate : hrs * (w?.rate ?? 0);
            return (
              <div key={p.id} className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">{wName(p.worker_id)} · <span className="text-neutral-400 font-normal">{jName(p.job_id)}</span></div>
                  <div className="text-[11px] text-neutral-600">
                    {new Date(p.clock_in).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {t12(p.clock_in)}–{t12(p.clock_out)}
                    {p.job_cost_id ? "" : " · not costed"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold text-white tabular-nums">{hrs.toFixed(2)} h</div>
                  <div className="text-[11px] text-neutral-500 tabular-nums">{money(amt)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Crew &amp; PINs</div>
          <button onClick={() => setEditing({})} className="text-[11px] font-semibold text-neutral-300 underline">+ Add</button>
        </div>
        <div className="space-y-1">
          {workers.map((w) => (
            <button key={w.id} onClick={() => setEditing(w)} className="w-full text-left rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 flex items-center justify-between gap-2 hover:border-neutral-600">
              <div>
                <div className={`text-xs font-semibold ${w.active ? "text-white" : "text-neutral-600 line-through"}`}>{w.name}</div>
                <div className="text-[11px] text-neutral-600">PIN {w.pin}</div>
              </div>
              <div className="text-[11px] text-neutral-400 tabular-nums">
                {w.rate ? `$${w.rate}/${w.rate_type === "daily" ? "day" : "hr"}` : "no rate"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {editing ? <WorkerEditor supabase={supabase} worker={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} /> : null}
    </div>
  );
}

function Tile({ v, l, tone }: { v: string; l: string; tone?: "amber" }) {
  return (
    <div className={`rounded-xl border ${tone === "amber" ? "border-amber-500/50" : "border-neutral-800"} bg-neutral-900 p-2.5 text-center`}>
      <div className={`text-base font-bold leading-none ${tone === "amber" ? "text-amber-300" : "text-white"}`}>{v}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">{l}</div>
    </div>
  );
}

function WorkerEditor({ supabase, worker, onClose, onSaved }: any) {
  const [f, setF] = useState({
    name: worker?.name ?? "", pin: worker?.pin ?? "", rate: String(worker?.rate ?? ""),
    rate_type: worker?.rate_type ?? "hourly", phone: worker?.phone ?? "", active: worker?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    if (!f.name.trim() || !f.pin.trim()) { alert("Name and PIN are required."); return; }
    setBusy(true);
    const row = { name: f.name.trim(), pin: f.pin.trim(), rate: Number(f.rate) || null, rate_type: f.rate_type, phone: f.phone || null, active: f.active };
    const { error } = worker
      ? await supabase.from("workers").update(row).eq("id", worker.id)
      : await supabase.from("workers").insert(row);
    setBusy(false);
    if (error) alert("Save failed: " + error.message); else onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-white">{worker ? "Edit crew member" : "Add crew member"}</div>
          <button onClick={onClose} className="text-neutral-500 text-lg leading-none">✕</button>
        </div>
        <div className="space-y-2.5">
          <F l="Name"><input value={f.name} onChange={set("name")} className={inp} /></F>
          <div className="grid grid-cols-2 gap-2">
            <F l="PIN"><input value={f.pin} onChange={set("pin")} inputMode="numeric" className={inp} /></F>
            <F l="Phone"><input value={f.phone} onChange={set("phone")} inputMode="tel" className={inp} /></F>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <F l="Rate"><input value={f.rate} onChange={set("rate")} inputMode="decimal" className={inp} /></F>
            <F l="Per"><select value={f.rate_type} onChange={set("rate_type")} className={inp}><option value="hourly">Hour</option><option value="daily">Day</option></select></F>
          </div>
          <label className="flex items-center gap-2 text-xs text-neutral-300">
            <input type="checkbox" checked={f.active} onChange={(e) => setF((s) => ({ ...s, active: e.target.checked }))} />
            Active — can clock in
          </label>
          <button onClick={save} disabled={busy} className="w-full rounded-xl bg-white text-black py-2.5 text-sm font-bold disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500";
const btn = "px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-neutral-700 text-neutral-300 hover:border-neutral-500 whitespace-nowrap";
function F({ l, children }: { l: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">{l}</span>{children}</label>;
}
