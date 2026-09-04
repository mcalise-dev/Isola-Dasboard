"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/format";

const emptyLead = {
  job_name: "", customer: "", location: "", job: "",
  contact_name: "", contact_phone: "", notes: "",
};

const daysSince = (iso: string | null) => {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d < 0 ? 0 : d;
};

export default function LeadsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [leads, setLeads] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ ...emptyLead });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  async function load() {
    const [j, v] = await Promise.all([
      supabase.from("jobs").select("*").eq("status", "lead").order("priority", { ascending: false }).order("created_at", { ascending: true }),
      supabase.from("site_visits").select("job_id,visit_date"),
    ]);
    setLeads(j.data ?? []);
    setVisits(v.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const visitByJob = useMemo(() => {
    const m: Record<string, string> = {};
    visits.forEach((v: any) => {
      if (!v.job_id) return;
      if (!m[v.job_id] || (v.visit_date ?? "") > m[v.job_id]) m[v.job_id] = v.visit_date ?? "";
    });
    return m;
  }, [visits]);

  const shown = leads.filter((l) => {
    if (!q) return true;
    const hay = `${l.job_name ?? ""} ${l.customer ?? ""} ${l.location ?? ""} ${l.job ?? ""} ${l.notes ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  async function addLead() {
    if (!form.job_name.trim() && !form.customer.trim()) { alert("Give it a job name or a customer."); return; }
    setBusy(true);
    const payload: any = { ...form, status: "lead", updated_at: new Date().toISOString() };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    if (!payload.job_name) payload.job_name = payload.customer;
    const { error } = await supabase.from("jobs").insert(payload);
    setBusy(false);
    if (error) { alert("Save failed: " + error.message); return; }
    setForm({ ...emptyLead });
    setAdding(false);
    load();
  }

  async function move(l: any, status: string) {
    const patch: any = { status, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("jobs").update(patch).eq("id", l.id);
    if (error) { alert("Update failed: " + error.message); return; }
    load();
  }

  async function togglePriority(l: any) {
    await supabase.from("jobs").update({ priority: !l.priority }).eq("id", l.id);
    load();
  }

  async function remove(l: any) {
    if (!confirm(`Delete lead ${l.job_name ?? l.customer}? This can't be undone.`)) return;
    const { error } = await supabase.from("jobs").delete().eq("id", l.id);
    if (error) { alert("Delete failed: " + error.message); return; }
    load();
  }

  const input = "w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
  const label = "block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1";
  const btn = "rounded-lg border border-neutral-600 py-1.5 text-center text-xs font-semibold text-white";

  const walked = shown.filter((l) => visitByJob[l.id]);
  const notWalked = shown.filter((l) => !visitByJob[l.id]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
          <div className="text-2xl font-bold text-white leading-none">{notWalked.length}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-violet-200">Need a look</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-2xl font-bold text-white leading-none">{walked.length}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">Walked, needs price</div>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads…" className={input} />
        <button onClick={() => setAdding(!adding)} className="shrink-0 rounded-lg bg-white text-neutral-900 px-3 text-sm font-semibold">{adding ? "Cancel" : "+ Lead"}</button>
      </div>

      {adding ? (
        <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
          <div><label className={label}>Job Name</label><input className={input} placeholder="e.g. 59 Cedar St" value={form.job_name} onChange={(e) => setForm({ ...form, job_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Customer</label><input className={input} value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} /></div>
            <div><label className={label}>Location</label><input className={input} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Job Type</label><input className={input} placeholder="Concrete, wall…" value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })} /></div>
            <div><label className={label}>Contact</label><input className={input} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
          </div>
          <div><label className={label}>Phone</label><input className={input} inputMode="tel" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
          <div><label className={label}>Notes</label><textarea rows={2} className={input} placeholder="What they want looked at" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <button disabled={busy} onClick={addLead} className="w-full rounded-lg bg-white text-neutral-900 py-2 text-sm font-bold disabled:opacity-50">{busy ? "Saving…" : "Save lead"}</button>
        </div>
      ) : null}

      {loading ? <p className="text-neutral-500 text-sm">Loading…</p> : null}
      {!loading && shown.length === 0 ? <p className="text-neutral-500 text-sm">No leads. Anything you still need to go look at goes here.</p> : null}

      <div className="space-y-2.5">
        {shown.map((l) => {
          const age = daysSince(l.created_at);
          const seen = visitByJob[l.id];
          return (
            <div key={l.id} className={`bg-neutral-900 border border-neutral-800 border-l-4 ${seen ? "border-l-emerald-400" : "border-l-violet-400"} rounded-xl px-4 py-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">
                    {l.priority ? <span className="text-amber-300 mr-1">★</span> : null}
                    {l.job_name || l.customer}
                  </div>
                  <div className="text-sm text-neutral-400 truncate">{[l.customer, l.location, l.job].filter(Boolean).join(" · ") || "—"}</div>
                  {l.contact_name || l.contact_phone ? (
                    <div className="text-xs text-neutral-500 truncate mt-0.5">{[l.contact_name, l.contact_phone].filter(Boolean).join(" · ")}</div>
                  ) : null}
                  {l.notes ? <div className="text-xs text-neutral-400 mt-1 whitespace-pre-wrap">{l.notes}</div> : null}
                </div>
                <div className="shrink-0 text-right">
                  <button onClick={() => togglePriority(l)} aria-label="Priority" className={`text-lg leading-none ${l.priority ? "text-amber-300" : "text-neutral-600"}`}>★</button>
                  <div className={`mt-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${seen ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-violet-500/30 bg-violet-500/10 text-violet-200"}`}>
                    {seen ? "Walked" : "Go see"}
                  </div>
                </div>
              </div>

              <div className="mt-1.5 text-[10px] text-neutral-500">
                {seen ? `Visited ${fmtDate(seen)}` : age == null ? "" : age === 0 ? "Added today" : `Waiting ${age} day${age === 1 ? "" : "s"}`}
              </div>

              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {l.location ? (
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(l.location)}`} target="_blank" rel="noreferrer" className={btn}>🧭 Map</a>
                ) : <span />}
                {l.contact_phone ? (
                  <a href={`tel:${String(l.contact_phone).replace(/[^0-9+]/g, "")}`} className={btn}>📞 Call</a>
                ) : <span />}
                <a href="/visits" className={btn}>📍 Log visit</a>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <button onClick={() => move(l, "awaiting")} className="rounded-lg bg-white text-neutral-900 py-1.5 text-xs font-bold">→ Quoting</button>
                <button onClick={() => move(l, "booked")} className={btn}>→ Booked</button>
                <button onClick={() => remove(l)} className="rounded-lg border border-red-500/40 py-1.5 text-xs font-semibold text-red-300">Delete</button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-neutral-600">
        Leads are jobs you still have to go look at. Log the site visit on the Visits tab and the card flips to Walked — then send it to Quoting once it's priced.
      </p>
    </div>
  );
}
