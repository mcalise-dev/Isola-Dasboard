"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { jobLabel } from "@/lib/format";

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const t12 = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const hrsBetween = (a: string, b?: string | null) =>
  ((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 3600000;

function bigElapsed(from: string) {
  const ms = Date.now() - new Date(from).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function MyClock({ jobId, compact }: { jobId?: string; compact?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [me, setMe] = useState<any>(null);
  const [openPunch, setOpenPunch] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [today, setToday] = useState<any[]>([]);
  const [pick, setPick] = useState(jobId ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState("");
  const [rateOpen, setRateOpen] = useState(false);
  const [rateVal, setRateVal] = useState("");
  const [, tick] = useState(0);

  // second-by-second while the clock is running
  useEffect(() => {
    if (!openPunch) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [openPunch]);

  async function load() {
    const { data: w } = await supabase.from("workers").select("*").eq("is_owner", true).maybeSingle();
    if (!w) { setLoading(false); return; }
    setMe(w); setRateVal(w.rate == null ? "" : String(w.rate));

    const [{ data: op }, { data: js }, { data: td }] = await Promise.all([
      supabase.from("time_clock").select("*").eq("worker_id", w.id).is("clock_out", null).order("clock_in", { ascending: false }).limit(1),
      jobId
        ? supabase.from("jobs").select("id,job_name,customer,location,job,status").eq("id", jobId).eq("status", "progress")
        : supabase.from("jobs").select("id,job_name,customer,location,job,status").eq("status", "progress").order("job_name"),
      supabase.from("time_clock").select("id,job_id,clock_in,clock_out").eq("worker_id", w.id).gte("clock_in", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()).order("clock_in", { ascending: false }),
    ]);
    setOpenPunch(op?.[0] ?? null);
    setJobs(js ?? []);
    setToday(td ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (jobId) setPick(jobId); }, [jobId]);

  async function clockIn() {
    if (!pick) { setFlash("Pick the job first."); setTimeout(() => setFlash(""), 2500); return; }
    if (!jobs.some((j) => j.id === pick)) { setFlash("That job isn't In Progress."); setTimeout(() => setFlash(""), 3000); return; }
    setBusy(true);
    const { error } = await supabase.from("time_clock").insert({ worker_id: me.id, job_id: pick, note: note.trim() || null });
    setBusy(false);
    if (error) { setFlash("Couldn't clock in: " + error.message); return; }
    setNote(""); setFlash("Clocked in"); setTimeout(() => setFlash(""), 2500);
    load();
  }

  async function clockOut() {
    setBusy(true);
    const hrs = Math.round(hrsBetween(openPunch.clock_in) * 100) / 100;
    const rate = me.rate == null ? null : Number(me.rate);
    const amount = rate == null ? 0 : (me.rate_type === "daily" ? rate : Math.round(hrs * rate * 100) / 100);
    let costId: string | null = null;

    if (openPunch.job_id && hrs > 0) {
      const { data: cost } = await supabase.from("job_costs").insert({
        job_id: openPunch.job_id, entry_date: openPunch.clock_in.slice(0, 10), category: "Labor",
        worker: me.name, hours: hrs, rate, amount, paid: true,
        notes: `Clocked ${t12(openPunch.clock_in)}–${t12(new Date().toISOString())}` +
               (note.trim() || openPunch.note ? " · " + (note.trim() || openPunch.note) : ""),
        status: "ok",
      }).select("id").single();
      costId = cost?.id ?? null;
    }

    await supabase.from("time_clock").update({
      clock_out: new Date().toISOString(), job_cost_id: costId,
      note: note.trim() || openPunch.note,
    }).eq("id", openPunch.id);

    setBusy(false); setNote("");
    setFlash(`Clocked out — ${hrs.toFixed(2)} hrs${rate ? " · " + money(amount) : ""} logged to the job`);
    setTimeout(() => setFlash(""), 5000);
    load();
  }

  async function saveRate() {
    const v = rateVal.trim() === "" ? null : Number(rateVal);
    await supabase.from("workers").update({ rate: v }).eq("id", me.id);
    setRateOpen(false); load();
  }

  async function scrap() {
    if (!confirm("Throw this punch away without logging any time?")) return;
    await supabase.from("time_clock").delete().eq("id", openPunch.id);
    load();
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!me) return <p className="text-sm text-neutral-500">No owner record set up.</p>;

  const jobById = (id: string) => jobs.find((j) => j.id === id);
  const running = !!openPunch;
  const todayHrs = today.reduce((a, p) => a + hrsBetween(p.clock_in, p.clock_out), 0);

  return (
    <div className={`rounded-2xl border ${running ? "border-emerald-500/50 bg-emerald-500/[0.07]" : "border-neutral-800 bg-neutral-900/60"} p-3.5`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
          ⏱️ My time{compact ? " on this job" : ""}
        </div>
        <div className="text-[10px] text-neutral-500">{todayHrs.toFixed(2)} hrs today</div>
      </div>

      {flash ? <div className="mb-2 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-[11px] text-neutral-200">{flash}</div> : null}

      {running ? (
        <>
          <div className="text-center py-3">
            <div className="text-4xl font-extrabold text-white tabular-nums tracking-tight">{bigElapsed(openPunch.clock_in)}</div>
            <div className="mt-1 text-xs text-neutral-300 truncate">
              {openPunch.job_id ? (jobById(openPunch.job_id) ? jobLabel(jobById(openPunch.job_id)) : "job") : "no job tagged"}
            </div>
            <div className="text-[11px] text-neutral-500">started {t12(openPunch.clock_in)}</div>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What are you doing? (optional)"
            className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500" />
          <button onClick={clockOut} disabled={busy}
            className="mt-2 w-full rounded-xl bg-red-600 text-white py-3.5 text-base font-bold disabled:opacity-50">
            {busy ? "…" : "Clock out"}
          </button>
          <button onClick={scrap} className="mt-1.5 w-full text-[11px] text-neutral-600 underline">discard this punch</button>
        </>
      ) : (
        <>
          {!compact ? (
            <select value={pick} onChange={(e) => setPick(e.target.value)}
              className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-2 text-sm text-white focus:outline-none focus:border-neutral-500">
              <option value="">Tag a job — In Progress only…</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
            </select>
          ) : null}
          {compact && pick && !jobs.some((j) => j.id === pick) ? (
            <p className="text-xs text-amber-300/90">
              This job isn&apos;t In Progress. Flip it to In Progress above and you can clock time onto it.
            </p>
          ) : (
            <>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
                className="mt-2 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500" />
              <button onClick={clockIn} disabled={busy || !pick}
                className="mt-2 w-full rounded-xl bg-emerald-600 text-white py-3.5 text-base font-bold disabled:opacity-40">
                {busy ? "…" : "Clock in"}
              </button>
            </>
          )}
        </>
      )}

      {!compact ? (
        <div className="mt-3 pt-3 border-t border-neutral-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-neutral-500">
              Your rate: {me.rate == null ? <span className="text-amber-300">not set — time logs at $0</span> : `$${me.rate}/${me.rate_type === "daily" ? "day" : "hr"}`}
            </span>
            <button onClick={() => setRateOpen(!rateOpen)} className="text-[11px] text-neutral-400 underline">{rateOpen ? "cancel" : "edit"}</button>
          </div>
          {rateOpen ? (
            <div className="flex gap-2 mt-2">
              <input value={rateVal} onChange={(e) => setRateVal(e.target.value)} inputMode="decimal" placeholder="Leave blank to track hours only"
                className="flex-1 rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600" />
              <button onClick={saveRate} className="rounded-lg border border-neutral-700 px-3 text-[11px] font-semibold text-neutral-300">Save</button>
            </div>
          ) : null}

          {today.filter((p) => p.clock_out).length ? (
            <div className="mt-2.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">Today</div>
              {today.filter((p) => p.clock_out).map((p) => {
                const h = hrsBetween(p.clock_in, p.clock_out);
                const j = p.job_id ? jobById(p.job_id) : null;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-neutral-400 truncate">{j ? jobLabel(j) : "—"}</span>
                    <span className="shrink-0 text-neutral-300 tabular-nums">{t12(p.clock_in)}–{t12(p.clock_out)} · {h.toFixed(2)}h</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
