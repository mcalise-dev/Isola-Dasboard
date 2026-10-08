"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MyClock from "@/components/MyClock";
import CrewClock from "@/components/CrewClock";
import CrewLogins from "@/components/CrewLogins";
import { showError, showToast } from "@/components/Toaster";
import { ask, copyText } from "@/components/Dialogs";
import { withTimeout, firstError } from "@/lib/load";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect, Field } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, SectionTitle, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { Plus, Copy, ExternalLink, LogOut, ChevronRight, Clock } from "lucide-react";

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
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [, setTick] = useState(0);

  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(t); }, []);

  async function load() {
    setErr(null);
    try {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const [w, p, j] = await withTimeout(Promise.all([
        supabase.from("workers").select("*").order("name"),
        supabase.from("time_clock").select("*").gte("clock_in", since).order("clock_in", { ascending: false }),
        supabase.from("jobs").select("id,job_name,customer,location"),
      ]));
      const e = firstError(w, p, j);
      if (e) throw new Error(e);
      setWorkers(w.data ?? []); setPunches(p.data ?? []); setJobs(j.data ?? []); setLoaded(true);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const wName = (id: string) => workers.find((w) => w.id === id)?.name ?? "—";
  const wRow  = (id: string) => workers.find((w) => w.id === id);
  const jName = (id: string) => { const j = jobs.find((x) => x.id === id); return j ? (j.job_name || `${j.customer} — ${j.location}`) : "no job"; };

  async function forceOut(p: any) {
    const w = wRow(p.worker_id);
    if (!w) return;
    if (!(await ask({ title: `Clock ${w.name} out now?`, confirm: "Clock out" }))) return;
    const { error } = await supabase.rpc("crew_punch_out", { p_pin: w.pin, p_note: "Closed by Mike" });
    if (error) showError("Clock out failed: " + error.message); else showToast(`${w.name} clocked out`);
    load();
  }

  const clockUrl = typeof window !== "undefined" ? `${window.location.origin}/clock` : "/clock";
  async function copyClock() {
    await copyText(clockUrl, "Link copied");
  }

  const header = (
    <PageHeader
      title="Crew & time"
      sub="Who's on the clock, hours by job, and crew PINs"
      actions={<Button variant="outline" onClick={() => setEditing({})}><Plus size={16} /> Crew member</Button>}
    />
  );

  if (err) return <div>{header}<LoadError message={err} onRetry={load} /></div>;
  if (!loaded) return <div>{header}<ListSkeleton /></div>;

  const onClock = punches.filter((p) => !p.clock_out);
  const today = new Date().toDateString();
  const todays = punches.filter((p) => new Date(p.clock_in).toDateString() === today);
  const todayHours = todays.reduce((a, p) => a + (new Date(p.clock_out ?? Date.now()).getTime() - new Date(p.clock_in).getTime()) / 3600000, 0);
  const unpaid = punches.filter((p) => p.clock_out);

  return (
    <div className="space-y-5">
      {header}
      <MyClock />
      <CrewClock onChanged={load} />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="On the clock" value={onClock.length} tone={onClock.length ? "warn" : undefined} />
        <Stat label="Hours today" value={todayHours.toFixed(1)} />
        <Stat label="Crew" value={workers.filter((w) => w.active).length} />
      </div>

      <Card className="p-4">
        <div className="text-[15px] font-semibold text-white">Crew clock-in link</div>
        <div className="mt-1 break-all text-xs text-neutral-400">{clockUrl}</div>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" className="h-10" onClick={copyClock}><Copy size={14} /> Copy link</Button>
          <Button asChild variant="outline" size="sm" className="h-10"><a href="/clock" target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open</a></Button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Send this to the guys once — they save it to their home screen and punch in with their PIN. Hours post to the job automatically.</p>
      </Card>

      {onClock.length ? (
        <section>
          <SectionTitle><span className="text-amber-300">On the clock right now</span></SectionTitle>
          <div className="grid gap-2 md:grid-cols-2">
            {onClock.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">{wName(p.worker_id)}</div>
                  <div className="truncate text-xs text-neutral-300">{jName(p.job_id)}</div>
                  <div className="text-xs text-neutral-400">in at {t12(p.clock_in)}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="text-lg font-extrabold tabular-nums text-white">{hhmm(p.clock_in)}</div>
                  <Button variant="outline" size="sm" onClick={() => forceOut(p)}><LogOut size={14} /> Clock out</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <section className="min-w-0">
          <SectionTitle>Last 14 days</SectionTitle>
          {unpaid.length === 0 ? (
            <Empty icon={<Clock size={24} />} title="No punches yet" body="Finished punches from the last two weeks show up here." />
          ) : (
            <Card className="overflow-hidden">
              {unpaid.map((p) => {
                const w = wRow(p.worker_id);
                const hrs = (new Date(p.clock_out).getTime() - new Date(p.clock_in).getTime()) / 3600000;
                const amt = w?.rate_type === "daily" ? w?.rate : hrs * (w?.rate ?? 0);
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 last:border-0">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{wName(p.worker_id)} · <span className="font-normal text-neutral-400">{jName(p.job_id)}</span></div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                        <span>{new Date(p.clock_in).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {t12(p.clock_in)}–{t12(p.clock_out)}</span>
                        {p.job_cost_id ? null : <Badge variant="warning" className="px-1.5 py-0 text-[11px]">not costed</Badge>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold tabular-nums text-white">{hrs.toFixed(2)} h</div>
                      <div className="text-xs tabular-nums text-neutral-400">{money(amt)}</div>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </section>

        <section className="min-w-0">
          <SectionTitle right={<Button variant="ghost" size="sm" onClick={() => setEditing({})}><Plus size={14} /> Add</Button>}>Crew &amp; PINs</SectionTitle>
          {workers.length === 0 ? (
            <Empty title="No crew yet" body="Add each guy with a PIN so they can punch in." />
          ) : (
            <Card className="overflow-hidden">
              {workers.map((w) => (
                <button key={w.id} onClick={() => setEditing(w)} className="flex min-h-[52px] w-full items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-left last:border-0 hover:bg-white/[0.03]">
                  <div className="min-w-0">
                    <div className={cn("text-sm font-semibold", w.active ? "text-white" : "text-neutral-500 line-through")}>{w.name}</div>
                    <div className="text-xs text-neutral-500">PIN {w.pin}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs tabular-nums text-neutral-400">
                    {w.rate ? `$${w.rate}/${w.rate_type === "daily" ? "day" : "hr"}` : "no rate"}
                    <ChevronRight size={15} className="text-neutral-600" />
                  </div>
                </button>
              ))}
            </Card>
          )}
        </section>
      </div>

      <CrewLogins workers={workers} />

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        {editing ? (
          <WorkerEditor key={editing.id ?? "new"} supabase={supabase} worker={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
        ) : null}
      </Dialog>
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
    if (!f.name.trim() || !f.pin.trim()) { showError("Name and PIN are required."); return; }
    setBusy(true);
    const row = { name: f.name.trim(), pin: f.pin.trim(), rate: Number(f.rate) || null, rate_type: f.rate_type, phone: f.phone || null, active: f.active };
    const { error } = worker
      ? await supabase.from("workers").update(row).eq("id", worker.id)
      : await supabase.from("workers").insert(row);
    setBusy(false);
    if (error) showError("Save failed: " + error.message); else { showToast("Saved"); onSaved(); }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{worker ? "Edit crew member" : "Add crew member"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <Field label="Name"><Input value={f.name} onChange={set("name")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="PIN"><Input value={f.pin} onChange={set("pin")} inputMode="numeric" /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rate"><Input value={f.rate} onChange={set("rate")} inputMode="decimal" /></Field>
          <Field label="Per"><NativeSelect value={f.rate_type} onChange={set("rate_type")}><option value="hourly">Hour</option><option value="daily">Day</option></NativeSelect></Field>
        </div>
        <label className="flex min-h-[40px] items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" className="h-4 w-4" checked={f.active} onChange={(e) => setF((s) => ({ ...s, active: e.target.checked }))} />
          Active — can clock in
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
