"use client";
// v8.1 (10/28/26) RFI log: numbered questions to the GC / engineer / owner, with who it's to,
// due date, answer, and an optional link back to the plan pin that raised it. PDF log or a single
// RFI to email out.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError, showToast } from "@/components/Toaster";
import { ask } from "@/components/Dialogs";
import { fmtDate, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Empty } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { newReport } from "@/lib/fieldPdf";
import { photoToJpeg, saveFile, fileSafe } from "@/lib/fieldFiles";
import { Plus, FileDown, FileQuestion, Trash2, Camera, MapPin } from "lucide-react";

const STATUS: Record<string, { label: string; variant: "muted" | "warning" | "success" | "default" }> = {
  draft: { label: "Draft", variant: "muted" },
  open: { label: "Waiting on answer", variant: "warning" },
  answered: { label: "Answered", variant: "success" },
  closed: { label: "Closed", variant: "default" },
};
const daysLate = (d: string | null) => (d ? Math.floor((Date.now() - new Date(d + "T23:59:59").getTime()) / 86400000) : -1);

export default function RfiPanel({ job, onCount }: { job: any; onCount?: (n: number) => void }) {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const jobName = job.job_name || job.customer;

  async function load() {
    const { data, error } = await sb.from("rfis").select("id,number,subject,question,to_name,to_email,due_date,status,answer,answered_on,pin_id,created_at,updated_at").eq("job_id", job.id).order("number");
    if (error) { showError("Couldn't load RFIs: " + error.message); setRows([]); return; }
    setRows(data ?? []);
    onCount?.((data ?? []).filter((r) => r.status === "open" || r.status === "draft").length);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [job.id]);

  const nextNumber = () => Math.max(0, ...(rows ?? []).map((r) => r.number)) + 1;

  async function openEdit(r?: any) {
    if (!r) { setEdit({ number: nextNumber(), status: "draft", subject: "", question: "", to_name: "", to_email: "", due_date: "", answer: "", photo: "" }); return; }
    setEdit({ ...r, photo: "" });
    const { data } = await sb.from("rfis").select("photo_b64").eq("id", r.id).maybeSingle();
    if (data?.photo_b64) setEdit((cur: any) => (cur?.id === r.id ? { ...cur, photoView: data.photo_b64 } : cur));
  }

  async function save(statusOverride?: string) {
    const e = edit;
    if (!e.subject?.trim()) return showError("Give the RFI a subject.");
    setBusy(true);
    const status = statusOverride ?? (e.answer?.trim() && (e.status === "open" || e.status === "draft") ? "answered" : e.status);
    const row: any = {
      subject: e.subject.trim(), question: e.question?.trim() || null, to_name: e.to_name?.trim() || null, to_email: e.to_email?.trim() || null,
      due_date: e.due_date || null, status, answer: e.answer?.trim() || null,
      answered_on: status === "answered" || status === "closed" ? (e.answered_on || todayISO()) : null,
      updated_at: new Date().toISOString(), ...(e.photo ? { photo_b64: e.photo } : {}),
    };
    const res = e.id ? await sb.from("rfis").update(row).eq("id", e.id) : await sb.from("rfis").insert({ ...row, job_id: job.id, number: e.number });
    setBusy(false);
    if (res.error) return showError("Save failed: " + res.error.message);
    // closing / answering the RFI closes its plan pin too
    if (e.pin_id && (status === "answered" || status === "closed")) await sb.from("plan_pins").update({ status: "done", done_at: new Date().toISOString() }).eq("id", e.pin_id);
    showToast(e.id ? "RFI saved" : `RFI #${e.number} added`);
    setEdit(null); load();
  }

  async function remove(e: any) {
    if (!(await ask({ title: `Delete RFI #${e.number}?`, body: "This can't be undone.", confirm: "Delete", danger: true }))) return;
    const { error } = await sb.from("rfis").delete().eq("id", e.id);
    if (error) return showError(error.message);
    setEdit(null); load();
  }

  async function pdfLog() {
    if (!rows?.length) return;
    const r = await newReport("RFI log", jobName, [job.customer && job.job_name ? job.customer : null, job.location].filter(Boolean).join("  -  "));
    r.table(
      [{ label: "#", width: 26 }, { label: "Subject", width: 170 }, { label: "To", width: 90 }, { label: "Sent", width: 62 }, { label: "Due", width: 62 }, { label: "Status", width: 80 }, { label: "Answered", width: 62 }],
      rows.map((x) => [String(x.number), x.subject, x.to_name ?? "", (x.created_at ?? "").slice(0, 10), x.due_date ?? "", STATUS[x.status]?.label ?? x.status, x.answered_on ?? ""]),
    );
    for (const x of rows) {
      r.heading(`RFI #${x.number} - ${x.subject}`);
      r.kv([["To", [x.to_name, x.to_email].filter(Boolean).join(" - ")], ["Due", x.due_date], ["Status", STATUS[x.status]?.label]]);
      if (x.question) { r.para("Question", { bold: true, size: 9.5 }); r.para(x.question); }
      if (x.answer) { r.para("Answer", { bold: true, size: 9.5 }); r.para(x.answer); }
    }
    saveFile(await r.save(), `${fileSafe(jobName)}_RFI_Log.pdf`);
  }

  async function pdfOne(x: any) {
    const r = await newReport(`RFI #${x.number}`, jobName, [job.customer && job.job_name ? job.customer : null, job.location].filter(Boolean).join("  -  "));
    r.kv([["Subject", x.subject], ["To", [x.to_name, x.to_email].filter(Boolean).join(" - ")], ["Date", fmtDate((x.created_at ?? "").slice(0, 10))], ["Response needed by", x.due_date ? fmtDate(x.due_date) : null]]);
    r.heading("Question");
    r.para(x.question || "(no question written)");
    if (x.photo || x.photoView) { r.heading("Photo"); await r.image(x.photo || x.photoView, undefined, 320); }
    r.heading("Response");
    if (x.answer) r.para(x.answer);
    else { r.para("Response:", { size: 9 }); r.y -= 90; r.para("Responded by: ______________________________    Date: ______________", { size: 9 }); }
    saveFile(await r.save(), `${fileSafe(jobName)}_RFI_${x.number}.pdf`);
  }

  if (rows === null) return <div className="skeleton h-32" />;
  const open = rows.filter((r) => r.status === "open" || r.status === "draft");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-neutral-400">{rows.length ? `${open.length} open of ${rows.length}` : ""}</p>
        {rows.length ? <Button variant="outline" size="sm" className="h-9" onClick={pdfLog}><FileDown size={15} /> RFI log PDF</Button> : null}
        <Button size="sm" className="h-9" onClick={() => openEdit()}><Plus size={15} /> New RFI</Button>
      </div>
      {rows.length === 0 ? (
        <Empty icon={<FileQuestion size={28} />} title="No RFIs on this job."
          body="When something on the plans doesn't match the field, write it up here — or drop an RFI pin right on the plan." />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {rows.map((x) => {
            const late = x.status === "open" && daysLate(x.due_date) > 0;
            return (
              <button key={x.id} onClick={() => openEdit(x)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]">
                <span className="w-8 shrink-0 text-sm font-semibold tabular-nums text-neutral-400">#{x.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{x.subject}</span>
                  <span className={cn("block truncate text-xs", late ? "text-red-400" : "text-neutral-500")}>
                    {[x.to_name ? `To ${x.to_name}` : null, x.due_date ? (late ? `${daysLate(x.due_date)}d late` : `due ${fmtDate(x.due_date).replace(/^\w+, /, "")}`) : null, x.pin_id ? "on plan" : null].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <Badge variant={STATUS[x.status]?.variant}>{STATUS[x.status]?.label}</Badge>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => { if (!o && !busy) setEdit(null); }}>
        {edit ? (
          <DialogContent wide>
            <DialogHeader><DialogTitle>RFI #{edit.number}{edit.pin_id ? <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-neutral-400"><MapPin size={12} /> from a plan pin</span> : null}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Field label="Subject"><Input value={edit.subject} placeholder="Catch basin rim elevation" onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></Field>
              <Field label="Question"><Textarea rows={4} value={edit.question ?? ""} placeholder="Plan shows rim at 42.10; existing grade at that spot is 41.60. Confirm rim elevation before we set." onChange={(e) => setEdit({ ...edit, question: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="To (name / company)"><Input value={edit.to_name ?? ""} onChange={(e) => setEdit({ ...edit, to_name: e.target.value })} /></Field>
                <Field label="Their email"><Input type="email" value={edit.to_email ?? ""} onChange={(e) => setEdit({ ...edit, to_email: e.target.value })} /></Field>
              </div>
              <Field label="Answer needed by"><Input type="date" value={edit.due_date ?? ""} onChange={(e) => setEdit({ ...edit, due_date: e.target.value })} /></Field>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-[13px] font-semibold hover:bg-accent">
                  <Camera size={15} /> {edit.photo || edit.photoView ? "Replace photo" : "Add photo"}
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const f = e.target.files?.[0]; e.currentTarget.value = ""; if (!f) return;
                    const { dataUrl } = await photoToJpeg(f, 1400, 0.72); setEdit((cur: any) => ({ ...cur, photo: dataUrl }));
                  }} />
                </label>
              </div>
              {edit.photo || edit.photoView ? <img src={edit.photo || edit.photoView} alt="" className="max-h-48 rounded-lg border border-border" /> : null}
              {edit.id && edit.status !== "draft" ? (
                <Field label="Answer"><Textarea rows={3} value={edit.answer ?? ""} placeholder="Paste or type their response" onChange={(e) => setEdit({ ...edit, answer: e.target.value })} /></Field>
              ) : null}
            </div>
            <DialogFooter className="flex-wrap gap-2">
              {edit.id ? <Button variant="ghost" className="text-neutral-500" onClick={() => remove(edit)}><Trash2 size={15} /></Button> : null}
              {edit.id ? <Button variant="outline" onClick={() => pdfOne(edit)}><FileDown size={15} /> PDF</Button> : null}
              {edit.status === "draft" ? <Button variant="outline" onClick={() => save("draft")} disabled={busy}>Save draft</Button> : null}
              {edit.status === "draft" ? <Button onClick={() => save("open")} disabled={busy}>Mark sent</Button>
                : edit.status === "answered" ? <Button onClick={() => save("closed")} disabled={busy}>Close it</Button>
                : <Button onClick={() => save()} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>}
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
