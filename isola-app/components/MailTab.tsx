"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Job, jobLabel, fmtDate, todayISO } from "@/lib/format";

type Highlight = {
  id: string;
  received_date: string;
  sender: string | null;
  subject: string | null;
  note: string;
  job_id: string | null;
  gmail_thread_id: string | null;
};
type FollowUp = {
  id: string;
  job_id: string;
  note: string;
  reminder_date: string | null;
  done: boolean;
};

export default function MailTab() {
  const supabase = useMemo(() => createClient(), []);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<false | "mail" | "fu">(false);
  const [form, setForm] = useState<any>({});

  async function load() {
    const [h, f, j] = await Promise.all([
      supabase.from("email_highlights").select("*").order("received_date", { ascending: false }),
      supabase.from("follow_ups").select("*").order("reminder_date", { ascending: true }),
      supabase.from("jobs").select("id,job_name,customer,location,job,status").order("customer"),
    ]);
    setHighlights((h.data as Highlight[]) ?? []);
    setFollowUps((f.data as FollowUp[]) ?? []);
    setJobs((j.data as Job[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);

  async function saveMail() {
    if (!form.note?.trim()) { alert("Add a note."); return; }
    const { error } = await supabase.from("email_highlights").insert({
      received_date: form.received_date || todayISO(),
      sender: form.sender?.trim() || null,
      subject: form.subject?.trim() || null,
      note: form.note.trim(),
      job_id: form.job_id || null,
    });
    if (error) { alert("Save failed: " + error.message); return; }
    setAdding(false); setForm({});
    load();
  }

  async function saveFu() {
    if (!form.note?.trim() || !form.job_id) { alert("Pick a job and add a note."); return; }
    const { error } = await supabase.from("follow_ups").insert({
      job_id: form.job_id,
      note: form.note.trim(),
      reminder_date: form.reminder_date || null,
    });
    if (error) { alert("Save failed: " + error.message); return; }
    setAdding(false); setForm({});
    load();
  }

  async function toggleFu(f: FollowUp) {
    await supabase.from("follow_ups").update({ done: !f.done, completed_at: !f.done ? new Date().toISOString() : null }).eq("id", f.id);
    load();
  }

  async function removeHighlight(h: Highlight) {
    if (!confirm("Remove this mail item?")) return;
    await supabase.from("email_highlights").delete().eq("id", h.id);
    load();
  }

  const input = "w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
  const label = "block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1";
  const openFus = followUps.filter((f) => !f.done);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => { setAdding(adding === "mail" ? false : "mail"); setForm({}); }}
          className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${adding === "mail" ? "border-neutral-400 text-white" : "border-neutral-700 text-neutral-400"}`}>
          + Mail note
        </button>
        <button onClick={() => { setAdding(adding === "fu" ? false : "fu"); setForm({}); }}
          className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${adding === "fu" ? "border-neutral-400 text-white" : "border-neutral-700 text-neutral-400"}`}>
          + Follow-up
        </button>
      </div>

      {adding === "mail" ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Date</label><input type="date" className={input} value={form.received_date ?? todayISO()} onChange={(e) => setForm({ ...form, received_date: e.target.value })} /></div>
            <div><label className={label}>From</label><input className={input} value={form.sender ?? ""} onChange={(e) => setForm({ ...form, sender: e.target.value })} /></div>
          </div>
          <div><label className={label}>Subject</label><input className={input} value={form.subject ?? ""} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
          <div><label className={label}>Note / What to do</label><textarea rows={2} className={input} value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          <div><label className={label}>Linked Job</label>
            <select className={input} value={form.job_id ?? ""} onChange={(e) => setForm({ ...form, job_id: e.target.value })}>
              <option value="">None</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
            </select>
          </div>
          <button onClick={saveMail} className="w-full rounded-lg bg-white text-neutral-900 py-2.5 text-sm font-semibold">Save</button>
        </div>
      ) : null}

      {adding === "fu" ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 mb-4 space-y-3">
          <div><label className={label}>Job</label>
            <select className={input} value={form.job_id ?? ""} onChange={(e) => setForm({ ...form, job_id: e.target.value })}>
              <option value="">Pick a job…</option>
              {jobs.filter((j) => j.status !== "complete").map((j) => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
            </select>
          </div>
          <div><label className={label}>Note</label><textarea rows={2} className={input} value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          <div><label className={label}>Reminder Date</label><input type="date" className={input} value={form.reminder_date ?? ""} onChange={(e) => setForm({ ...form, reminder_date: e.target.value })} /></div>
          <button onClick={saveFu} className="w-full rounded-lg bg-white text-neutral-900 py-2.5 text-sm font-semibold">Save</button>
        </div>
      ) : null}

      {openFus.length ? (
        <div className="mb-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Follow-ups</h3>
          <div className="space-y-2">
            {openFus.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-neutral-900 px-3.5 py-3">
                <button onClick={() => toggleFu(f)} className="w-5 h-5 shrink-0 rounded-md border border-neutral-600" aria-label="Done" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white">{f.note}</div>
                  <div className="text-xs text-neutral-500 truncate">
                    {[jobById[f.job_id] ? jobLabel(jobById[f.job_id]) : null, f.reminder_date ? `remind ${fmtDate(f.reminder_date)}` : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Mail highlights</h3>
      {loading ? <p className="text-neutral-500 text-sm">Loading…</p> : null}
      {!loading && highlights.length === 0 ? <p className="text-neutral-500 text-sm">Nothing logged. Ask Claude to sweep your inbox for job threads.</p> : null}
      <div className="space-y-2">
        {highlights.map((h) => (
          <div key={h.id} className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-white text-sm truncate">{h.subject ?? h.sender ?? "Mail"}</div>
                <div className="text-xs text-neutral-500 truncate">{[fmtDate(h.received_date), h.sender].filter(Boolean).join(" · ")}</div>
              </div>
              <button onClick={() => removeHighlight(h)} className="text-neutral-600 hover:text-red-400 text-sm shrink-0" aria-label="Delete">✕</button>
            </div>
            <p className="text-sm text-neutral-300 mt-1.5">{h.note}</p>
            <div className="flex gap-3 mt-1.5 text-xs">
              {h.job_id && jobById[h.job_id] ? <span className="text-neutral-500">{jobLabel(jobById[h.job_id])}</span> : null}
              {h.gmail_thread_id ? (
                <a className="text-blue-400" target="_blank" rel="noopener"
                  href={`https://mail.google.com/mail/u/0/#all/${h.gmail_thread_id}`}>Open in Gmail →</a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
