"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Job, jobLabel, fmtDate, todayISO } from "@/lib/format";

type Visit = {
  id: string;
  visit_date: string | null;
  property_address: string | null;
  client_company: string | null;
  met_with: string | null;
  purpose: string | null;
  job_id: string | null;
  dimensions: string | null;
  observed_conditions: string | null;
  weather: string | null;
  photos_taken: string | null;
  follow_up_needed: string | null;
};

const empty = {
  visit_date: "", property_address: "", client_company: "", met_with: "", purpose: "",
  job_id: "", dimensions: "", observed_conditions: "", weather: "", photos_taken: "", follow_up_needed: "",
};

export default function VisitsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ ...empty, visit_date: todayISO() });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    const [v, j] = await Promise.all([
      supabase.from("site_visits").select("*").order("visit_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("jobs").select("id,job_name,customer,location,job,status").order("customer"),
    ]);
    setVisits((v.data as Visit[]) ?? []);
    setJobs((j.data as Job[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);

  async function save() {
    if (!form.property_address.trim() && !form.client_company.trim()) { alert("Add at least an address or a client."); return; }
    setBusy(true);
    const payload: any = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    const { error } = await supabase.from("site_visits").insert(payload);
    setBusy(false);
    if (error) { alert("Save failed: " + error.message); return; }
    setForm({ ...empty, visit_date: todayISO() });
    setAdding(false);
    load();
  }

  async function remove(v: Visit) {
    if (!confirm("Delete this site visit?")) return;
    await supabase.from("site_visits").delete().eq("id", v.id);
    load();
  }

  const input = "w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
  const label = "block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-neutral-500">Observed conditions only — no pricing on site records.</p>
        <button onClick={() => setAdding(!adding)} className="rounded-lg bg-white text-neutral-900 px-3.5 py-2 text-sm font-semibold shrink-0">
          {adding ? "Close" : "+ Visit"}
        </button>
      </div>

      {adding ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Date</label><input type="date" className={input} value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} /></div>
            <div><label className={label}>Weather</label><input className={input} value={form.weather} onChange={(e) => setForm({ ...form, weather: e.target.value })} /></div>
          </div>
          <div><label className={label}>Property Address</label><input className={input} value={form.property_address} onChange={(e) => setForm({ ...form, property_address: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Client / Company</label><input className={input} value={form.client_company} onChange={(e) => setForm({ ...form, client_company: e.target.value })} /></div>
            <div><label className={label}>Met With</label><input className={input} value={form.met_with} onChange={(e) => setForm({ ...form, met_with: e.target.value })} /></div>
          </div>
          <div><label className={label}>Linked Job</label>
            <select className={input} value={form.job_id} onChange={(e) => setForm({ ...form, job_id: e.target.value })}>
              <option value="">None</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
            </select>
          </div>
          <div><label className={label}>Purpose</label><input className={input} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
          <div><label className={label}>Dimensions</label><input className={input} value={form.dimensions} onChange={(e) => setForm({ ...form, dimensions: e.target.value })} /></div>
          <div><label className={label}>Observed Conditions</label><textarea rows={3} className={input} value={form.observed_conditions} onChange={(e) => setForm({ ...form, observed_conditions: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Photos Taken</label><input className={input} value={form.photos_taken} onChange={(e) => setForm({ ...form, photos_taken: e.target.value })} /></div>
            <div><label className={label}>Follow-up Needed</label><input className={input} value={form.follow_up_needed} onChange={(e) => setForm({ ...form, follow_up_needed: e.target.value })} /></div>
          </div>
          <button onClick={save} disabled={busy} className="w-full rounded-lg bg-white text-neutral-900 py-2.5 text-sm font-semibold disabled:opacity-60">
            {busy ? "Saving…" : "Log Visit"}
          </button>
        </div>
      ) : null}

      {loading ? <p className="text-neutral-500 text-sm">Loading…</p> : null}
      {!loading && visits.length === 0 ? <p className="text-neutral-500 text-sm">No site visits logged yet.</p> : null}

      <div className="space-y-2.5">
        {visits.map((v) => (
          <div key={v.id} className="rounded-xl border border-neutral-800 bg-neutral-900">
            <button className="w-full text-left px-4 py-3" onClick={() => setOpen(open === v.id ? null : v.id)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">{v.property_address ?? v.client_company ?? "Site visit"}</div>
                  <div className="text-xs text-neutral-500 truncate">
                    {[fmtDate(v.visit_date), v.client_company, v.purpose].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
            </button>
            {open === v.id ? (
              <div className="border-t border-neutral-800 px-4 py-3 text-sm space-y-1.5">
                {v.met_with ? <p><span className="text-neutral-500">Met with:</span> {v.met_with}</p> : null}
                {v.job_id && jobById[v.job_id] ? <p><span className="text-neutral-500">Job:</span> {jobLabel(jobById[v.job_id])}</p> : null}
                {v.weather ? <p><span className="text-neutral-500">Weather:</span> {v.weather}</p> : null}
                {v.dimensions ? <p className="whitespace-pre-wrap"><span className="text-neutral-500">Dimensions:</span> {v.dimensions}</p> : null}
                {v.observed_conditions ? <p className="whitespace-pre-wrap"><span className="text-neutral-500">Observed:</span> {v.observed_conditions}</p> : null}
                {v.photos_taken ? <p><span className="text-neutral-500">Photos:</span> {v.photos_taken}</p> : null}
                {v.follow_up_needed ? <p><span className="text-neutral-500">Follow-up:</span> {v.follow_up_needed}</p> : null}
                <button onClick={() => remove(v)} className="mt-1.5 rounded-lg border border-red-900 px-2.5 py-1 text-xs text-red-400">Delete</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
