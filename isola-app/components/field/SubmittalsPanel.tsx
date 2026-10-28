"use client";
// v8.1 (10/28/26) Submittals: each product that needs approval before it goes in (sealant,
// block, mix design…), its spec sheet, who's reviewing, and the answer. PDF log; the cover sheet
// plus the attached product data PDF go out together.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError, showToast } from "@/components/Toaster";
import { ask } from "@/components/Dialogs";
import { fmtDate, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea, NativeSelect, Field } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Empty } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { newReport } from "@/lib/fieldPdf";
import { readDataUrl, photoToJpeg, saveFile, fileSafe } from "@/lib/fieldFiles";
import { Plus, FileDown, PackageCheck, Trash2, Paperclip, Eye } from "lucide-react";

const STATUS: Record<string, { label: string; variant: "muted" | "warning" | "success" | "danger" | "default" }> = {
  draft: { label: "Not sent", variant: "muted" },
  submitted: { label: "Under review", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  approved_as_noted: { label: "Approved as noted", variant: "success" },
  revise_resubmit: { label: "Revise & resubmit", variant: "danger" },
  rejected: { label: "Rejected", variant: "danger" },
};

export default function SubmittalsPanel({ job }: { job: any }) {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const jobName = job.job_name || job.customer;

  async function load() {
    const { data, error } = await sb.from("submittals").select("id,number,title,spec_section,product,manufacturer,reviewer,submitted_on,due_date,status,response_notes,file_name,mime_type,created_at").eq("job_id", job.id).order("number");
    if (error) { showError("Couldn't load submittals: " + error.message); setRows([]); return; }
    setRows(data ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [job.id]);

  const next = () => Math.max(0, ...(rows ?? []).map((r) => r.number)) + 1;

  async function save(patch: Record<string, any> = {}) {
    const e = { ...edit, ...patch };
    if (!e.title?.trim()) return showError("What's being submitted?");
    setBusy(true);
    const row: any = {
      title: e.title.trim(), spec_section: e.spec_section?.trim() || null, product: e.product?.trim() || null, manufacturer: e.manufacturer?.trim() || null,
      reviewer: e.reviewer?.trim() || null, submitted_on: e.submitted_on || null, due_date: e.due_date || null, status: e.status,
      response_notes: e.response_notes?.trim() || null, updated_at: new Date().toISOString(),
      ...(e.file_b64 ? { file_b64: e.file_b64, file_name: e.file_name, mime_type: e.mime_type } : {}),
    };
    const res = e.id ? await sb.from("submittals").update(row).eq("id", e.id) : await sb.from("submittals").insert({ ...row, job_id: job.id, number: e.number });
    setBusy(false);
    if (res.error) return showError("Save failed: " + res.error.message);
    showToast(e.id ? "Submittal saved" : `Submittal #${e.number} added`);
    setEdit(null); load();
  }

  async function remove(e: any) {
    if (!(await ask({ title: `Delete submittal #${e.number}?`, body: "This can't be undone.", confirm: "Delete", danger: true }))) return;
    const { error } = await sb.from("submittals").delete().eq("id", e.id);
    if (error) return showError(error.message);
    setEdit(null); load();
  }

  async function viewFile(e: any) {
    const w = window.open();
    if (!w) return showError("Allow pop-ups to view the file.");
    const { data } = await sb.from("submittals").select("file_b64,mime_type").eq("id", e.id).maybeSingle();
    if (!data?.file_b64) { w.close(); return showError("No file attached."); }
    w.document.write(data.mime_type?.startsWith("image/") ? `<img src="${data.file_b64}" style="max-width:100%">` : `<iframe src="${data.file_b64}" style="border:0;width:100%;height:100vh"></iframe>`);
  }

  async function pdfLog() {
    if (!rows?.length) return;
    const r = await newReport("Submittal log", jobName, [job.customer && job.job_name ? job.customer : null, job.location].filter(Boolean).join("  -  "));
    r.table(
      [{ label: "#", width: 24 }, { label: "Item", width: 150 }, { label: "Spec", width: 50 }, { label: "Product / mfr", width: 120 }, { label: "Sent", width: 58 }, { label: "Due", width: 58 }, { label: "Status", width: 90 }],
      rows.map((x) => [String(x.number), x.title, x.spec_section ?? "", [x.product, x.manufacturer].filter(Boolean).join(" - "), x.submitted_on ?? "", x.due_date ?? "", STATUS[x.status]?.label ?? x.status]),
    );
    const notes = rows.filter((x) => x.response_notes);
    if (notes.length) { r.heading("Review comments"); for (const x of notes) { r.para(`#${x.number} ${x.title}`, { bold: true, size: 9.5 }); r.para(x.response_notes); } }
    saveFile(await r.save(), `${fileSafe(jobName)}_Submittal_Log.pdf`);
  }

  // transmittal cover sheet + the product data appended (PDF pages copied, or the image)
  async function pdfPackage(x: any) {
    const r = await newReport(`Submittal #${x.number}`, jobName, [job.customer && job.job_name ? job.customer : null, job.location].filter(Boolean).join("  -  "));
    r.kv([["Item", x.title], ["Spec section", x.spec_section], ["Product", x.product], ["Manufacturer", x.manufacturer], ["Submitted to", x.reviewer], ["Date submitted", x.submitted_on ? fmtDate(x.submitted_on) : fmtDate(todayISO())], ["Response needed by", x.due_date ? fmtDate(x.due_date) : null]]);
    r.heading("Reviewer action");
    r.para("[  ] Approved     [  ] Approved as noted     [  ] Revise & resubmit     [  ] Rejected", { size: 10 });
    r.y -= 40;
    r.para("Reviewed by: ______________________________    Date: ______________", { size: 9 });
    const { data } = await sb.from("submittals").select("file_b64,mime_type").eq("id", x.id).maybeSingle();
    if (data?.file_b64) {
      if (String(data.mime_type).includes("pdf")) {
        const { PDFDocument } = await import("pdf-lib");
        const bytes = Uint8Array.from(atob(String(data.file_b64).replace(/^data:[^,]*,/, "")), (c) => c.charCodeAt(0));
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        (await r.pdf.copyPages(src, src.getPageIndices())).forEach((p) => r.pdf.addPage(p));
      } else { r.heading("Product data"); await r.image(data.file_b64, undefined, 560); }
    }
    saveFile(await r.save(), `${fileSafe(jobName)}_Submittal_${x.number}.pdf`);
  }

  if (rows === null) return <div className="skeleton h-32" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-neutral-400">{rows.length ? `${rows.filter((r) => r.status === "approved" || r.status === "approved_as_noted").length} of ${rows.length} approved` : ""}</p>
        {rows.length ? <Button variant="outline" size="sm" className="h-9" onClick={pdfLog}><FileDown size={15} /> Log PDF</Button> : null}
        <Button size="sm" className="h-9" onClick={() => setEdit({ number: next(), status: "draft", title: "" })}><Plus size={15} /> New submittal</Button>
      </div>
      {rows.length === 0 ? (
        <Empty icon={<PackageCheck size={28} />} title="No submittals on this job."
          body="Log each product that needs sign-off before it goes in — the sealant, the block, the mix — with its spec sheet attached." />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {rows.map((x) => (
            <button key={x.id} onClick={() => setEdit({ ...x })} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]">
              <span className="w-8 shrink-0 text-sm font-semibold tabular-nums text-neutral-400">#{x.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{x.title}</span>
                <span className="block truncate text-xs text-neutral-500">{[x.spec_section ? `Spec ${x.spec_section}` : null, x.product, x.reviewer ? `to ${x.reviewer}` : null, x.file_name ? "spec sheet attached" : null].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              <Badge variant={STATUS[x.status]?.variant}>{STATUS[x.status]?.label}</Badge>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => { if (!o && !busy) setEdit(null); }}>
        {edit ? (
          <DialogContent wide>
            <DialogHeader><DialogTitle>Submittal #{edit.number}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Field label="Item"><Input value={edit.title} placeholder="Joint sealant — window perimeter" onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Product"><Input value={edit.product ?? ""} placeholder="Spectrem 3" onChange={(e) => setEdit({ ...edit, product: e.target.value })} /></Field>
                <Field label="Manufacturer"><Input value={edit.manufacturer ?? ""} placeholder="Tremco" onChange={(e) => setEdit({ ...edit, manufacturer: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Spec section"><Input value={edit.spec_section ?? ""} placeholder="07 92 00" onChange={(e) => setEdit({ ...edit, spec_section: e.target.value })} /></Field>
                <Field label="Submitted to"><Input value={edit.reviewer ?? ""} placeholder="Architect / PM" onChange={(e) => setEdit({ ...edit, reviewer: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Date sent"><Input type="date" value={edit.submitted_on ?? ""} onChange={(e) => setEdit({ ...edit, submitted_on: e.target.value })} /></Field>
                <Field label="Answer needed by"><Input type="date" value={edit.due_date ?? ""} onChange={(e) => setEdit({ ...edit, due_date: e.target.value })} /></Field>
              </div>
              <Field label="Status">
                <NativeSelect value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value, ...(e.target.value === "submitted" && !edit.submitted_on ? { submitted_on: todayISO() } : {}) })}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </NativeSelect>
              </Field>
              {edit.status !== "draft" && edit.status !== "submitted" ? (
                <Field label="Reviewer comments"><Textarea rows={3} value={edit.response_notes ?? ""} onChange={(e) => setEdit({ ...edit, response_notes: e.target.value })} /></Field>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-[13px] font-semibold hover:bg-accent">
                  <Paperclip size={15} /> {edit.file_name ? "Replace spec sheet" : "Attach spec sheet"}
                  <input type="file" accept="application/pdf,image/*" className="hidden" onChange={async (e) => {
                    const f = e.target.files?.[0]; e.currentTarget.value = ""; if (!f) return;
                    if (!f.type.startsWith("image/") && f.size > 8_000_000) return showError("That file is over 8 MB.");
                    const b64 = f.type.startsWith("image/") ? (await photoToJpeg(f, 2000, 0.8)).dataUrl : await readDataUrl(f);
                    setEdit((cur: any) => ({ ...cur, file_b64: b64, file_name: f.name, mime_type: f.type.startsWith("image/") ? "image/jpeg" : f.type || "application/pdf" }));
                  }} />
                </label>
                {edit.file_name ? <span className={cn("truncate text-xs", edit.file_b64 ? "text-emerald-400" : "text-neutral-400")}>{edit.file_name}</span> : null}
                {edit.id && edit.file_name && !edit.file_b64 ? <Button variant="ghost" size="sm" onClick={() => viewFile(edit)}><Eye size={14} /> View</Button> : null}
              </div>
            </div>
            <DialogFooter className="flex-wrap gap-2">
              {edit.id ? <Button variant="ghost" className="text-neutral-500" onClick={() => remove(edit)}><Trash2 size={15} /></Button> : null}
              {edit.id ? <Button variant="outline" onClick={() => pdfPackage(edit)}><FileDown size={15} /> Submittal PDF</Button> : null}
              <Button onClick={() => save()} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
