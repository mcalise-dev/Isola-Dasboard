"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { jobLabel, todayISO } from "@/lib/format";
import { showError } from "@/components/Toaster";

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const t12 = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const hrsBetween = (a: string, b?: string | null) =>
  ((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 3600000;
const elapsed = (from: string) => {
  const ms = Date.now() - new Date(from).getTime();
  return `${Math.floor(ms / 3600000)}h ${String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0")}m`;
};
// a job-specific pay rate (job_pay_rates) beats the worker's default rate
const payFor = (w: any, jobId: string | null | undefined, rates: any[]) => {
  const o = jobId && w ? rates.find((r) => r.job_id === jobId && r.worker_id === w.id) : null;
  return o
    ? { rate: Number(o.rate) as number | null, rate_type: o.rate_type as string, custom: true }
    : { rate: (w?.rate == null ? null : Number(w.rate)) as number | null, rate_type: (w?.rate_type ?? "hourly") as string, custom: false };
};
const amountFor = (p: { rate: number | null; rate_type?: string }, hrs: number) =>
  p.rate == null ? 0 : p.rate_type === "daily" ? p.rate : Math.round(hrs * p.rate * 100) / 100;
const fmtRate = (p: { rate: number | null; rate_type?: string }) =>
  p.rate == null ? "no rate set" : `$${p.rate}/${p.rate_type === "daily" ? "day" : "hr"}`;
async function saveJobRate(supabase: any, w: any, jobId: string, raw: string) {
  const v = Number(String(raw).replace(/[^0-9.]/g, ""));
  if (!jobId || !w || !(v > 0)) return;
  await supabase.from("job_pay_rates").upsert(
    { job_id: jobId, worker_id: w.id, rate: v, rate_type: w.rate_type ?? "hourly", updated_at: new Date().toISOString() },
    { onConflict: "job_id,worker_id" });
}

export default function CrewClock({ onChanged }: { onChanged?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [crew, setCrew] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [open, setOpen] = useState<any[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [rates, setRates] = useState<any[]>([]);
  const [rateIn, setRateIn] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [manual, setManual] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);

  async function load() {
    const [{ data: w }, { data: j }, { data: o }, { data: r }] = await Promise.all([
      supabase.from("workers").select("*").eq("active", true).eq("is_owner", false).order("name"),
      // only work that is actually underway can be clocked against
      supabase.from("jobs").select("id,job_name,customer,location,job").eq("status", "progress").order("job_name"),
      supabase.from("time_clock").select("*").is("clock_out", null),
      supabase.from("job_pay_rates").select("*"),
    ]);
    setCrew(w ?? []); setJobs(j ?? []); setOpen(o ?? []); setRates(r ?? []); setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const punchFor = (wid: string) => open.find((p) => p.worker_id === wid);
  const jobById = (id: string) => jobs.find((j) => j.id === id);

  async function clockIn(w: any) {
    const jid = picks[w.id];
    if (!jid) return;
    setBusy(w.id);
    const typed = rateIn[`${w.id}:${jid}`];
    if (typed != null && typed !== "" && Number(typed) !== payFor(w, jid, rates).rate) await saveJobRate(supabase, w, jid, typed);
    await supabase.from("time_clock").insert({ worker_id: w.id, job_id: jid });
    setBusy(""); setPicks((s) => ({ ...s, [w.id]: "" }));
    load(); onChanged?.();
  }

  async function clockOut(w: any) {
    const p = punchFor(w.id);
    if (!p) return;
    setBusy(w.id);
    const hrs = Math.round(hrsBetween(p.clock_in) * 100) / 100;
    const pay = payFor(w, p.job_id, rates);
    let costId: string | null = null;
    if (p.job_id && hrs > 0) {
      const { data: cost } = await supabase.from("job_costs").insert({
        job_id: p.job_id, entry_date: p.clock_in.slice(0, 10), category: "Labor",
        worker: w.name, hours: hrs, rate: pay.rate, amount: amountFor(pay, hrs), paid: false,
        notes: `Clocked ${t12(p.clock_in)}–${t12(new Date().toISOString())} (by Mike)`, status: "ok",
      }).select("id").single();
      costId = cost?.id ?? null;
    }
    await supabase.from("time_clock").update({ clock_out: new Date().toISOString(), job_cost_id: costId }).eq("id", p.id);
    setBusy(""); load(); onChanged?.();
  }

  if (loading) return <div className="space-y-2" aria-busy="true"><div className="skeleton h-16" /><div className="skeleton h-16" /><div className="skeleton h-16" /></div>;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-neutral-900/60 p-3.5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-neutral-300">Clock the crew</div>
        <button onClick={() => setManual(true)} className="text-xs font-semibold text-neutral-400 underline">＋ Type in time</button>
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
            <div key={w.id} className={`rounded-xl border px-3 py-2.5 ${p ? "border-amber-500/40 bg-amber-500/10" : "border-white/[0.08] bg-neutral-950"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">{w.name}</div>
                  <div className="text-xs text-neutral-400">
                    {(() => { const pp = payFor(w, p?.job_id ?? picks[w.id], rates); return fmtRate(pp) + (pp.custom ? " · this job" : ""); })()}
                  </div>
                </div>
                {p ? (
                  <div className="text-right shrink-0">
                    <div className="text-base font-extrabold text-white tabular-nums">{elapsed(p.clock_in)}</div>
                    <div className="text-xs text-neutral-400">since {t12(p.clock_in)}</div>
                  </div>
                ) : null}
              </div>

              {p ? (
                <>
                  <div className="mt-1 text-xs text-neutral-300 truncate">{j ? jobLabel(j) : "job no longer in progress"}</div>
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
                  {picks[w.id] ? (
                    <input inputMode="decimal" title="Pay rate on this job" placeholder="$/hr"
                      value={rateIn[`${w.id}:${picks[w.id]}`] ?? String(payFor(w, picks[w.id], rates).rate ?? "")}
                      onChange={(e) => setRateIn((s) => ({ ...s, [`${w.id}:${picks[w.id]}`]: e.target.value }))}
                      className="w-16 shrink-0 rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-white" />
                  ) : null}
                  <button onClick={() => clockIn(w)} disabled={busy === w.id || !picks[w.id]}
                    className="shrink-0 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-bold disabled:opacity-40">
                    Clock in
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {crew.length === 0 ? <p className="text-xs text-neutral-500">No active crew. Add someone below.</p> : null}
      </div>

      {manual ? <ManualTime supabase={supabase} crew={crew} rates={rates} onClose={() => setManual(false)} onSaved={() => { setManual(false); load(); onChanged?.(); }} /> : null}
    </div>
  );
}

function ManualTime({ supabase, crew, rates, onClose, onSaved }: any) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [f, setF] = useState({ worker_id: "", job_id: "", date: todayISO(), start: "", end: "", hours: "", note: "", rate: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value, ...(k === "worker_id" || k === "job_id" ? { rate: "" } : {}) }));

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
  const eff = payFor(worker, f.job_id, rates);
  const typed = Number(String(f.rate).replace(/[^0-9.]/g, ""));
  const pay = { rate: f.rate !== "" && typed > 0 ? typed : eff.rate, rate_type: eff.rate_type };
  const amount = !worker ? 0 : amountFor(pay, derived);

  async function save() {
    if (!f.worker_id || !f.job_id) { showError("Pick who it was and which job."); return; }
    if (derived <= 0) { showError("Enter hours, or a start and end time."); return; }
    setBusy(true);
    if (f.rate !== "" && typed > 0 && typed !== eff.rate) await saveJobRate(supabase, worker, f.job_id, f.rate);
    const { data: cost, error } = await supabase.from("job_costs").insert({
      job_id: f.job_id, entry_date: f.date, category: "Labor", worker: worker.name,
      hours: derived, rate: pay.rate, amount, paid: false,
      notes: [f.start && f.end ? `${f.start}–${f.end}` : null, f.note.trim() || null, "entered by hand"].filter(Boolean).join(" · "),
      status: "ok",
    }).select("id").single();
    if (error) { setBusy(false); showError("Save failed: " + error.message); return; }

    // keep the timesheet honest too, not just the job cost
    const startIso = new Date(`${f.date}T${f.start || "08:00"}`).toISOString();
    await supabase.from("time_clock").insert({
      worker_id: f.worker_id, job_id: f.job_id, clock_in: startIso,
      clock_out: new Date(new Date(startIso).getTime() + derived * 3600000).toISOString(),
      note: (f.note.trim() || "entered by hand"), job_cost_id: cost.id,
    });
    setBusy(false); onSaved();
  }

  const inp = "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500";
  const lab = "block text-sm font-semibold text-neutral-400 mb-1";

  return (
    <div className="fixed inset-0 z-50 bg-black/85 overflow-y-auto p-3 anim-fade">
      <div className="mx-auto max-w-sm rounded-2xl bg-white/[0.05] p-4 my-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-white">Type in time</div>
          <button onClick={onClose} className="text-neutral-400 text-lg leading-none">✕</button>
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
          {f.worker_id && f.job_id ? (
            <div><label className={lab}>Pay rate on this job {eff.custom ? "(set for this job)" : "(their default)"}</label>
              <input value={f.rate === "" ? String(eff.rate ?? "") : f.rate} onChange={set("rate")} inputMode="decimal" placeholder="$/hr" className={inp} />
              <p className="mt-1 text-[10px] text-neutral-600">Change it and it sticks for {worker?.name} on this job only.</p>
            </div>
          ) : null}
          <div><label className={lab}>Note</label><input value={f.note} onChange={set("note")} className={inp} placeholder="What they did" /></div>

          {derived > 0 ? (
            <div className="rounded-lg border border-white/[0.07] bg-neutral-900 px-3 py-2 text-xs text-neutral-300">
              {derived.toFixed(2)} hrs{worker ? ` · ${worker.name}` : ""}
              {pay.rate ? ` @ ${fmtRate(pay)} = ` : " · "}
              <span className="font-bold text-white">{pay.rate ? money(amount) : "no rate set — logs at $0"}</span>
            </div>
          ) : null}

          <button onClick={save} disabled={busy} className="w-full rounded-xl bg-white text-black py-2.5 text-sm font-bold disabled:opacity-50">
            {busy ? "Saving…" : "Log it to the job"}
          </button>
          <p className="text-xs text-neutral-500">Goes on the job as unpaid Labor, same as a real punch.</p>
        </div>
      </div>
    </div>
  );
}
