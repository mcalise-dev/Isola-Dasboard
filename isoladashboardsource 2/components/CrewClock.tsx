"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { jobLabel, todayISO } from "@/lib/format";

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const t12 = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const hrsBetween = (a: string, b?: string | null) =>
  ((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 3600000;
const elapsed = (from: string) => {
  const ms = Date.now() - new Date(from).getTime();
  return `${Math.floor(ms / 3600000)}h ${String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0")}m`;
};
const amountFor = (w: any, hrs: number) =>
  w.rate == null ? 0 : w.rate_type === "daily" ? Number(w.rate) : Math.round(hrs * Number(w.rate) * 100) / 100;

export default function CrewClock({ onChanged }: { onChanged?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [crew, setCrew] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [open, setOpen] = useState<any[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [manual, setManual] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);

  async function load() {
    const [{ data: w }, { data: j }, { data: o }] = await Promise.all([
      supabase.from("workers").select("*").eq("active", true).eq("is_owner", false).order("name"),
      // only work that is actually underway can be clocked against
      supabase.from("jobs").select("id,job_name,customer,location,job").eq("status", "progress").order("job_name"),
      supabase.from("time_clock").select("*").is("clock_out", null),
    ]);
    setCrew(w ?? []); setJobs(j ?? []); setOpen(o ?? []); setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const punchFor = (wid: string) => open.find((p) => p.worker_id === wid);
  const jobById = (id: string) => jobs.find((j) => j.id === id);

  async function clockIn(w: any) {
    const jid = picks[w.id];
    if (!jid) return;
    setBusy(w.id);
    await supabase.from("time_clock").insert({ worker_id: w.id, job_id: jid });
    setBusy(""); setPicks((s) => ({ ...s, [w.id]: "" }));
    load(); onChanged?.();
  }

  async function clockOut(w: any) {
    const p = punchFor(w.id);
    if (!p) return;
    setBusy(w.id);
    const hrs = Math.round(hrsBetween(p.clock_in) * 100) / 100;
    let costId: string | null = null;
    if (p.job_id && hrs > 0) {
      const { data: cost } = await supabase.from("job_costs").insert({
        job_id: p.job_id, entry_date: p.clock_in.slice(0, 10), category: "Labor",
        worker: w.name, hours: hrs, rate: w.rate, amount: amountFor(w, hrs), paid: false,
        notes: `Clocked ${t12(p.clock_in)}–${t12(new Date().toISOString())} (by Mike)`, status: "ok",
      }).select("id").single();
      costId = cost?.id ?? null;
    }
    await supabase.from("time_clock").update({ clock_out: new Date().toISOString(), job_cost_id: costId }).eq("id", p.id);
    setBusy(""); load(); onChanged?.();
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3.5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">👷 Clock the crew</div>
        <button onClick={() => setManual(true)} className="text-[11px] font-semibold text-neutral-400 underline">＋ Type in time</button>
      </div>

      {jobs.length === 0 ? (
        <p className="text-xs text-amber-300/90 mb-2">
          No jobs are In Progress right now. Flip a job to In Progress on the Jobs tab before anyone can clock onto it.
        </p>
      ) : null}

      <div className="space-y-1.5">
        {crew.map((w) => {
          const p = punchFor(w.id);
          const j = p?.job_id ? jobById(p.job_id) : null;
          return (
            <div key={w.id} className={`rounded-xl border px-3 py-2.5 ${p ? "border-amber-500/40 bg-amber-500/10" : "border-neutral-800 bg-neutral-950"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">{w.name}</div>
                  <div className="text-[11px] text-neutral-500">
                    {w.rate ? `$${w.rate}/${w.rate_type === "daily" ? "day" : "hr"}` : "no rate set"}
                  </div>
                </div>
                {p ? (
                  <div className="text-right shrink-0">
                    <div className="text-base font-extrabold text-white tabular-nums">{elapsed(p.clock_in)}</div>
                    <div className="text-[10px] text-neutral-400">since {t12(p.clock_in)}</div>
                  </div>
                ) : null}
              </div>

              {p ? (
                <>
                  <div className="mt-1 text-[11px] text-neutral-300 truncate">{j ? jobLabel(j) : "job no longer in progress"}</div>
                  <button onClick={() => clockOut(w)} disabled={busy === w.id}
                    className="mt-2 w-full rounded-lg bg-red-600 text-white py-2 text-sm font-bold disabled:opacity-50">
                    {busy === w.id ? "…" : "Clock out"}
                  </button>
                </>
              ) : (
                <div className="mt-2 flex gap-2">
                  <select value={picks[w.id] ?? ""} onChange={(e) => setPicks((s) => ({ ...s, [w.id]: e.target.value }))}
                    className="flex-1 min-w-0 rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-white">
                    <option value="">Job…</option>
                    {jobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
                  </select>
                  <button onClick={() => clockIn(w)} disabled={busy === w.id || !picks[w.id]}
                    className="shrink-0 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-bold disabled:opacity-40">
                    Clock in
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {crew.length === 0 ? <p className="text-xs text-neutral-600">No active crew. Add someone below.</p> : null}
      </div>

      {manual ? <ManualTime supabase={supabase} crew={crew} onClose={() => setManual(false)} onSaved={() => { setManual(false); load(); onChanged?.(); }} /> : null}
    </div>
  );
}

function ManualTime({ supabase, crew, onClose, onSaved }: any) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [f, setF] = useState({ worker_id: "", job_id: "", date: todayISO(), start: "", end: "", hours: "", note: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    supabase.from("jobs").select("id,job_name,customer,location,job").eq("status", "progress").order("job_name")
      .then(({ data }: any) => setJobs(data ?? []));
  }, [supabase]);

  // typing start/end fills the hours for you; typing hours straight in also works
  const derived = (() => {
    if (f.start && f.end) {
      const a = new Date(`${f.date}T${f.start}`), b = new Date(`${f.date}T${f.end}`);
      const h = (b.getTime() - a.getTime()) / 3600000;
      if (h > 0) return Math.round(h * 100) / 100;
    }
    return Number(f.hours) || 0;
  })();

  const worker = crew.find((w: any) => w.id === f.worker_id);
  const amount = !worker || worker.rate == null ? 0
    : worker.rate_type === "daily" ? Number(worker.rate)
    : Math.round(derived * Number(worker.rate) * 100) / 100;

  async function save() {
    if (!f.worker_id || !f.job_id) { alert("Pick who it was and which job."); return; }
    if (derived <= 0) { alert("Enter hours, or a start and end time."); return; }
    setBusy(true);
    const { data: cost, error } = await supabase.from("job_costs").insert({
      job_id: f.job_id, entry_date: f.date, category: "Labor", worker: worker.name,
      hours: derived, rate: worker.rate, amount, paid: false,
      notes: [f.start && f.end ? `${f.start}–${f.end}` : null, f.note.trim() || null, "entered by hand"].filter(Boolean).join(" · "),
      status: "ok",
    }).select("id").single();
    if (error) { setBusy(false); alert("Save failed: " + error.message); return; }

    // keep the timesheet honest too, not just the job cost
    const startIso = new Date(`${f.date}T${f.start || "08:00"}`).toISOString();
    await supabase.from("time_clock").insert({
      worker_id: f.worker_id, job_id: f.job_id, clock_in: startIso,
      clock_out: new Date(new Date(startIso).getTime() + derived * 3600000).toISOString(),
      note: (f.note.trim() || "entered by hand"), job_cost_id: cost.id,
    });
    setBusy(false); onSaved();
  }

  const inp = "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500";
  const lab = "block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1";

  return (
    <div className="fixed inset-0 z-50 bg-black/85 overflow-y-auto p-3">
      <div className="mx-auto max-w-sm rounded-2xl border border-neutral-800 bg-neutral-950 p-4 my-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-white">Type in time</div>
          <button onClick={onClose} className="text-neutral-500 text-lg leading-none">✕</button>
        </div>
        <div className="space-y-2.5">
          <div><label className={lab}>Who</label>
            <select value={f.worker_id} onChange={set("worker_id")} className={inp}>
              <option value="">Pick a crew member…</option>
              {crew.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div><label className={lab}>Job — in progress only</label>
            <select value={f.job_id} onChange={set("job_id")} className={inp}>
              <option value="">Pick a job…</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
            </select>
          </div>
          <div><label className={lab}>Date</label><input type="date" value={f.date} onChange={set("date")} className={inp} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lab}>Start</label><input type="time" value={f.start} onChange={set("start")} className={inp} /></div>
            <div><label className={lab}>End</label><input type="time" value={f.end} onChange={set("end")} className={inp} /></div>
          </div>
          <div><label className={lab}>…or just hours</label>
            <input value={f.hours} onChange={set("hours")} inputMode="decimal" placeholder="e.g. 6.5"
              className={inp} disabled={!!(f.start && f.end)} />
          </div>
          <div><label className={lab}>Note</label><input value={f.note} onChange={set("note")} className={inp} placeholder="What they did" /></div>

          {derived > 0 ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-300">
              {derived.toFixed(2)} hrs{worker ? ` · ${worker.name}` : ""}
              {worker?.rate ? ` @ $${worker.rate}/${worker.rate_type === "daily" ? "day" : "hr"} = ` : " · "}
              <span className="font-bold text-white">{worker?.rate ? money(amount) : "no rate set — logs at $0"}</span>
            </div>
          ) : null}

          <button onClick={save} disabled={busy} className="w-full rounded-xl bg-white text-black py-2.5 text-sm font-bold disabled:opacity-50">
            {busy ? "Saving…" : "Log it to the job"}
          </button>
          <p className="text-[11px] text-neutral-600">Goes on the job as unpaid Labor, same as a real punch.</p>
        </div>
      </div>
    </div>
  );
}
