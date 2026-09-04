"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const elapsed = (from: string) => {
  const ms = Date.now() - new Date(from).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${String(m).padStart(2, "0")}m`;
};

export default function ClockApp() {
  const [pin, setPin] = useState("");
  const [state, setState] = useState<any>(null);
  const [jobId, setJobId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  const [flash, setFlash] = useState("");

  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30000); return () => clearInterval(t); }, []);

  async function loadState(p: string) {
    const supabase = createClient();
    const { data } = await supabase.rpc("crew_state", { p_pin: p });
    if (!data?.ok) { setErr("That PIN didn't work."); setState(null); return false; }
    setErr(""); setState(data); return true;
  }

  async function signIn() {
    if (pin.length < 3) return;
    setBusy(true); await loadState(pin); setBusy(false);
  }

  async function punchIn() {
    if (!jobId) { setErr("Pick the job you're working on."); return; }
    setBusy(true); setErr("");
    const supabase = createClient();
    const { data } = await supabase.rpc("crew_punch_in", { p_pin: pin, p_job_id: jobId, p_note: note });
    setBusy(false);
    if (!data?.ok) { setErr("Couldn't clock in — try again."); return; }
    setNote(""); setFlash("Clocked in"); setTimeout(() => setFlash(""), 2500);
    loadState(pin);
  }

  async function punchOut() {
    setBusy(true); setErr("");
    const supabase = createClient();
    const { data } = await supabase.rpc("crew_punch_out", { p_pin: pin, p_note: note });
    setBusy(false);
    if (!data?.ok) { setErr("Couldn't clock out — try again."); return; }
    setNote("");
    setFlash(`Clocked out — ${Number(data.hours).toFixed(2)} hrs logged`);
    setTimeout(() => setFlash(""), 4000);
    loadState(pin);
  }

  if (!state) return (
    <Shell>
      <h1 className="text-lg font-bold text-white text-center">Time Clock</h1>
      <p className="text-center text-sm text-neutral-400 mt-1">Enter your PIN</p>
      <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric" type="password" placeholder="••••"
        onKeyDown={(e) => e.key === "Enter" && signIn()}
        className="mt-5 w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-4 text-center text-3xl tracking-[0.5em] text-white focus:outline-none focus:border-neutral-400" />
      {err ? <p className="mt-3 text-center text-sm text-red-400">{err}</p> : null}
      <button onClick={signIn} disabled={busy || pin.length < 3}
        className="mt-4 w-full rounded-xl bg-white text-black py-3.5 font-bold disabled:opacity-40">
        {busy ? "…" : "Continue"}
      </button>
    </Shell>
  );

  const open = state.open;
  const openJob = open ? state.jobs.find((j: any) => j.id === open.job_id) : null;

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-white">{state.worker.name}</div>
          <div className="text-xs text-neutral-500">{Number(state.today_hours).toFixed(2)} hrs today</div>
        </div>
        <button onClick={() => { setState(null); setPin(""); }} className="text-xs text-neutral-500 underline">Switch</button>
      </div>

      {flash ? <div className="mt-4 rounded-xl border border-emerald-600/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 text-center">{flash}</div> : null}

      {open ? (
        <div className="mt-5">
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-5 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">On the clock</div>
            <div className="mt-1 text-4xl font-extrabold text-white tabular-nums">{elapsed(open.clock_in)}</div>
            <div className="mt-1 text-sm text-neutral-300">{openJob?.label ?? "—"}</div>
            <div className="text-[11px] text-neutral-500">
              since {new Date(open.clock_in).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </div>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you get done? (optional)"
            className="mt-3 w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500" />
          <button onClick={punchOut} disabled={busy}
            className="mt-3 w-full rounded-xl bg-red-600 text-white py-4 text-base font-bold disabled:opacity-50">
            {busy ? "…" : "Clock out"}
          </button>
        </div>
      ) : (
        <div className="mt-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-2">Pick a job</div>
          <div className="space-y-1.5 max-h-[46vh] overflow-y-auto">
            {state.jobs.length === 0 ? <p className="text-sm text-neutral-500">No active jobs right now.</p> : null}
            {state.jobs.map((j: any) => (
              <button key={j.id} onClick={() => setJobId(j.id)}
                className={`w-full text-left rounded-xl border px-3.5 py-3 ${jobId === j.id ? "border-white bg-neutral-800" : "border-neutral-800 bg-neutral-950"}`}>
                <div className="text-sm font-semibold text-white">{j.label}</div>
                {j.location ? <div className="text-xs text-neutral-500 truncate">{j.location}</div> : null}
              </button>
            ))}
          </div>
          {err ? <p className="mt-3 text-sm text-red-400">{err}</p> : null}
          <button onClick={punchIn} disabled={busy || !jobId}
            className="mt-4 w-full rounded-xl bg-emerald-600 text-white py-4 text-base font-bold disabled:opacity-40">
            {busy ? "…" : "Clock in"}
          </button>
        </div>
      )}
      <p className="mt-6 text-center text-[11px] text-neutral-600">Hours post straight to the job when you clock out.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black px-4 py-8">
      <div className="mx-auto max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <img src="/logo.png" alt="" className="h-9 w-9 rounded-full" />
          <span className="font-bold tracking-tight text-white">Isola</span>
        </div>
        {children}
      </div>
    </div>
  );
}
