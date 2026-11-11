"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Timer } from "lucide-react";

// In-app clock for a logged-in crew member. No PIN — it uses their own login.
type Status = { open: { id: string; job_id: string | null; job_name: string | null; clock_in: string } | null; jobs: { id: string; job_name: string }[]; today_hours: number };

const t12 = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
function elapsed(from: string) {
  const ms = Math.max(0, Date.now() - new Date(from).getTime());
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
const ERR: Record<string, string> = {
  already_in: "You're already clocked in.",
  job_not_in_progress: "That job isn't open for time right now. Ask Mike.",
  not_in: "You're not clocked in.",
};

export default function CrewClockCard({ onChange }: { onChange?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [st, setSt] = useState<Status | null>(null);
  const [pick, setPick] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [, tick] = useState(0);

  async function load() {
    const { data, error } = await supabase.rpc("crew_clock_status");
    if (error) { setMsg("Couldn't load your clock: " + error.message); setSt({ open: null, jobs: [], today_hours: 0 }); return; }
    const s = data as Status;
    setSt(s);
    if (!pick && s.jobs.length === 1) setPick(s.jobs[0].id);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    if (!st?.open) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [st?.open]);

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(""), 5000); }

  async function clockIn() {
    if (!pick) { flash("Pick the job first."); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("crew_clock_in", { p_job: pick, p_note: note.trim() || null });
    setBusy(false);
    const r: any = data;
    if (error || !r?.ok) { flash(error ? "Couldn't clock in: " + error.message : ERR[r?.error] ?? "Couldn't clock in."); load(); return; }
    setNote(""); flash("Clocked in"); load(); onChange?.();
  }

  async function clockOut() {
    setBusy(true);
    const { data, error } = await supabase.rpc("crew_clock_out", { p_note: note.trim() || null });
    setBusy(false);
    const r: any = data;
    if (error || !r?.ok) { flash(error ? "Couldn't clock out: " + error.message : ERR[r?.error] ?? "Couldn't clock out."); load(); return; }
    setNote(""); flash(`Clocked out — ${Number(r.hours).toFixed(2)} hrs`); load(); onChange?.();
  }

  if (!st) return <div className="mt-4 h-40 rounded-2xl skeleton" />;
  const open = st.open;

  return (
    <div className={`mt-4 rounded-2xl border p-4 ${open ? "border-emerald-500/50 bg-emerald-500/[0.07]" : "border-white/[0.08] bg-neutral-950"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-300"><Timer size={16} /> My time clock</div>
        <div className="text-xs text-neutral-400">{Number(st.today_hours).toFixed(2)} hrs today</div>
      </div>
      {msg ? <div className="mt-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200">{msg}</div> : null}

      {open ? (
        <>
          <div className="py-3 text-center">
            <div className="text-4xl font-extrabold tabular-nums text-white">{elapsed(open.clock_in)}</div>
            <div className="mt-1 truncate text-sm text-neutral-300">{open.job_name ?? "No job tagged"}</div>
            <div className="text-xs text-neutral-400">clocked in at {t12(open.clock_in)}</div>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you get done? (optional)"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-[15px] text-white placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none" />
          <button onClick={clockOut} disabled={busy} className="mt-2 w-full min-h-[56px] rounded-xl bg-red-600 text-lg font-bold text-white disabled:opacity-50">
            {busy ? "…" : "Clock out"}
          </button>
        </>
      ) : (
        <>
          <select value={pick} onChange={(e) => setPick(e.target.value)}
            className="mt-3 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-[15px] text-white focus:border-neutral-500 focus:outline-none">
            <option value="">Which job?</option>
            {st.jobs.map((j) => <option key={j.id} value={j.id}>{j.job_name}</option>)}
          </select>
          {!st.jobs.length ? <p className="mt-2 text-xs text-amber-300/90">No jobs are open for time right now. Ask Mike.</p> : null}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
            className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-[15px] text-white placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none" />
          <button onClick={clockIn} disabled={busy || !pick} className="mt-2 w-full min-h-[56px] rounded-xl bg-emerald-600 text-lg font-bold text-white disabled:opacity-40">
            {busy ? "…" : "Clock in"}
          </button>
        </>
      )}
    </div>
  );
}
