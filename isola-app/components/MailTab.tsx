"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Job, jobLabel, fmtDate, todayISO } from "@/lib/format";
import JobPicker from "@/components/JobPicker";
import { withTimeout, firstError } from "@/lib/load";
import { showError, showToast, undoable } from "@/components/Toaster";
import { PageHeader, SectionTitle, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Mail, BellPlus, X, ExternalLink, Inbox, Clock } from "lucide-react";

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
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState<false | "mail" | "fu">(false);
  const [form, setForm] = useState<any>({});

  async function load() {
    setErr(null);
    try {
      const [h, f, j] = await withTimeout(Promise.all([
        supabase.from("email_highlights").select("*").order("received_date", { ascending: false }),
        supabase.from("follow_ups").select("*").order("reminder_date", { ascending: true }),
        supabase.from("jobs").select("id,job_name,customer,location,job,status,paid_date,priority").order("customer"),
      ]));
      const bad = firstError(h, f, j);
      if (bad) throw new Error(bad);
      setHighlights((h.data as Highlight[]) ?? []);
      setFollowUps((f.data as FollowUp[]) ?? []);
      setJobs((j.data as unknown as Job[]) ?? []);
      setLoading(false);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); }, []);
  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);

  async function saveMail() {
    if (!form.note?.trim()) { showError("Add a note."); return; }
    const { error } = await supabase.from("email_highlights").insert({
      received_date: form.received_date || todayISO(),
      sender: form.sender?.trim() || null,
      subject: form.subject?.trim() || null,
      note: form.note.trim(),
      job_id: form.job_id || null,
    });
    if (error) { showError("Save failed: " + error.message); return; }
    showToast("Mail note saved");
    setAdding(false); setForm({});
    load();
  }

  async function saveFu() {
    if (!form.note?.trim() || !form.job_id) { showError("Pick a job and add a note."); return; }
    const { error } = await supabase.from("follow_ups").insert({
      job_id: form.job_id,
      note: form.note.trim(),
      reminder_date: form.reminder_date || null,
    });
    if (error) { showError("Save failed: " + error.message); return; }
    showToast("Follow-up added");
    setAdding(false); setForm({});
    load();
  }

  async function toggleFu(f: FollowUp) {
    const { error } = await supabase.from("follow_ups").update({ done: !f.done, completed_at: !f.done ? new Date().toISOString() : null }).eq("id", f.id);
    if (error) { showError("Save failed: " + error.message); return; }
    if (!f.done) showToast("Follow-up done");
    load();
  }

  function removeHighlight(h: Highlight) {
    const before = highlights;
    undoable({
      text: "Mail item removed",
      hide: () => setHighlights((cur) => cur.filter((x) => x.id !== h.id)),
      restore: () => setHighlights(before),
      commit: () => supabase.from("email_highlights").delete().eq("id", h.id),
    });
  }

  const openFus = followUps.filter((f) => !f.done);
  const today = todayISO();

  const header = (
    <PageHeader
      title="Mail"
      sub="Job-related mail and the follow-ups it creates"
      actions={<>
        <Button variant="outline" onClick={() => { setAdding("fu"); setForm({}); }}><BellPlus size={16} /> Follow-up</Button>
        <Button onClick={() => { setAdding("mail"); setForm({}); }}><Mail size={16} /> Mail note</Button>
      </>}
    />
  );

  if (err) return <div className="pb-28">{header}<LoadError message={err} onRetry={load} /></div>;

  return (
    <div className="pb-28">
      {header}

      {loading ? <ListSkeleton /> : (
        <div className="space-y-6">
          {openFus.length ? (
            <section>
              <SectionTitle right={<Badge variant="warning">{openFus.length} open</Badge>}>Follow-ups</SectionTitle>
              <div className="grid gap-2 md:grid-cols-2">
                {openFus.map((f) => {
                  const due = f.reminder_date && f.reminder_date <= today;
                  return (
                    <Card key={f.id} className="flex items-center gap-3 border-amber-500/30 px-3 py-2.5">
                      <button onClick={() => toggleFu(f)} aria-label="Mark done"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-white/[0.05]">
                        <span className="block h-5 w-5 rounded-md border border-neutral-500" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white">{f.note}</div>
                        <div className="truncate text-xs text-neutral-400">
                          {jobById[f.job_id] ? jobLabel(jobById[f.job_id]) : null}
                          {f.reminder_date ? (
                            <span className={due ? "font-semibold text-amber-300" : undefined}>
                              {jobById[f.job_id] ? " · " : ""}remind {fmtDate(f.reminder_date)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section>
            <SectionTitle>Mail highlights</SectionTitle>
            {highlights.length === 0 ? (
              <Empty icon={<Inbox size={28} />} title="Nothing logged."
                body="Ask Claude to sweep your inbox for job threads, or add a mail note yourself."
                action={<Button variant="outline" onClick={() => { setAdding("mail"); setForm({}); }}><Mail size={16} /> Mail note</Button>} />
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {highlights.map((h) => (
                  <Card key={h.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{h.subject ?? h.sender ?? "Mail"}</div>
                        <div className="truncate text-xs text-neutral-400">{[fmtDate(h.received_date), h.sender].filter(Boolean).join(" · ")}</div>
                      </div>
                      <Button variant="ghost" size="icon-sm" className="-mr-1 -mt-1 h-10 w-10 shrink-0 text-neutral-500 hover:text-red-400 md:h-8 md:w-8" onClick={() => removeHighlight(h)} aria-label="Delete"><X size={16} /></Button>
                    </div>
                    <p className="mt-1.5 text-sm text-neutral-300">{h.note}</p>
                    {(h.job_id && jobById[h.job_id]) || h.gmail_thread_id ? (
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                        {h.job_id && jobById[h.job_id] ? <Badge variant="muted">{jobLabel(jobById[h.job_id])}</Badge> : null}
                        {h.gmail_thread_id ? (
                          <a className="inline-flex items-center gap-1 font-semibold text-neutral-300 hover:text-white" target="_blank" rel="noopener"
                            href={`https://mail.google.com/mail/u/0/#all/${h.gmail_thread_id}`}>Open in Gmail <ExternalLink size={12} /></a>
                        ) : null}
                      </div>
                    ) : null}
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <Dialog open={!!adding} onOpenChange={(o) => { if (!o) { setAdding(false); setForm({}); } }}>
        {adding === "mail" ? (
          <DialogContent>
            <DialogHeader><DialogTitle>Mail note</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date"><Input type="date" value={form.received_date ?? todayISO()} onChange={(e) => setForm({ ...form, received_date: e.target.value })} /></Field>
                <Field label="From"><Input value={form.sender ?? ""} onChange={(e) => setForm({ ...form, sender: e.target.value })} /></Field>
              </div>
              <Field label="Subject"><Input value={form.subject ?? ""} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
              <Field label="Note / What to do"><Textarea rows={2} value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
              <Field label="Linked Job">
                <JobPicker jobs={jobs} value={form.job_id ?? ""} onChange={(id) => setForm({ ...form, job_id: id })} />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAdding(false); setForm({}); }}>Cancel</Button>
              <Button onClick={saveMail}>Save</Button>
            </DialogFooter>
          </DialogContent>
        ) : adding === "fu" ? (
          <DialogContent>
            <DialogHeader><DialogTitle>Follow-up</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Field label="Job">
                <JobPicker jobs={jobs} value={form.job_id ?? ""} onChange={(id) => setForm({ ...form, job_id: id })} />
              </Field>
              <Field label="Note"><Textarea rows={2} value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
              <Field label="Reminder Date"><Input type="date" value={form.reminder_date ?? ""} onChange={(e) => setForm({ ...form, reminder_date: e.target.value })} /></Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAdding(false); setForm({}); }}>Cancel</Button>
              <Button onClick={saveFu}><Clock size={16} /> Save</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
