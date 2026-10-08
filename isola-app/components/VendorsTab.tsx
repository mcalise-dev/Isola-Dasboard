"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/format";
import { withTimeout } from "@/lib/load";
import { showError, showToast, undoable } from "@/components/Toaster";
import { copyText } from "@/components/Dialogs";
import { PageHeader, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea, Field, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Plus, Link2, Search, ChevronDown, Phone, Mail, Pencil, Trash2, Eye, Paperclip, Check, X, Users, FileText } from "lucide-react";

/* ============================================================
   VENDORS — subs and suppliers, and the paperwork Isola needs
   from them: a current COI (so a sub's claim doesn't land on
   Isola's policy) and a W-9 (so 1099 season isn't a scramble).

   Backed by public.vendors + public.vendor_documents, listed
   through public.vendor_overview (no file payloads on load).
   Vendors can also send their own papers through the public
   page at /vendor-submit — those land here as "new" or
   "updated" so they get reviewed.
   ============================================================ */

const chip = (on: boolean) => cn(
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors",
  on ? "border-white bg-white text-neutral-900" : "border-border bg-neutral-950 text-neutral-400 hover:text-white hover:border-white/25"
);

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "New — review", cls: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  updated: { label: "Updated — review", cls: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  approved: { label: "Approved", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  inactive: { label: "Inactive", cls: "border-white/10 bg-transparent text-neutral-400" },
};
const needsReview = (v: any) => v.status === "new" || v.status === "updated";

const daysTo = (iso: string | null | undefined) =>
  iso ? Math.floor((new Date(iso + "T12:00:00").getTime() - Date.now()) / 86400000) : null;

function coiState(v: any): { text: string; cls: string; bad: boolean } {
  if (!v.coi_id) return { text: "No COI", cls: "text-red-400", bad: true };
  const n = daysTo(v.coi_expires);
  if (n === null) return { text: "COI — no expiry date", cls: "text-amber-300", bad: true };
  if (n < 0) return { text: `COI expired ${fmtDate(v.coi_expires)}`, cls: "text-red-400", bad: true };
  if (n <= 30) return { text: `COI expires in ${n}d`, cls: "text-amber-300", bad: true };
  return { text: `COI good to ${fmtDate(v.coi_expires)}`, cls: "text-emerald-400", bad: false };
}

async function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export default function VendorsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"" | "review" | "coi" | "w9">("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [upload, setUpload] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr(null);
    try {
      const { data, error } = await withTimeout(supabase.from("vendor_overview").select("*").order("company"));
      if (error) throw new Error("Couldn't load vendors: " + error.message);
      setRows(data ?? []);
      setLoading(false);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function loadDocs(id: string) {
    const { data, error } = await supabase
      .from("vendor_documents")
      .select("id,doc_type,file_name,mime_type,expires_at,insurer,submitted_at")
      .eq("vendor_id", id)
      .order("submitted_at", { ascending: false });
    if (error) showError("Couldn't load documents: " + error.message);
    setDocs(data ?? []);
  }

  function toggle(v: any) {
    setUpload(null);
    if (openId === v.id) { setOpenId(null); return; }
    setOpenId(v.id); setDocs([]); loadDocs(v.id);
  }

  const counts = useMemo(() => ({
    review: rows.filter(needsReview).length,
    coi: rows.filter((v) => v.status !== "inactive" && coiState(v).bad).length,
    w9: rows.filter((v) => v.status !== "inactive" && !v.w9_id).length,
  }), [rows]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((v) => {
      if (filter === "review" && !needsReview(v)) return false;
      if (filter === "coi" && (v.status === "inactive" || !coiState(v).bad)) return false;
      if (filter === "w9" && (v.status === "inactive" || v.w9_id)) return false;
      if (!s) return true;
      return [v.company, v.contact_name, v.trade, v.email, v.phone].some((x) => x?.toLowerCase().includes(s));
    });
  }, [rows, filter, q]);

  async function save() {
    if (!editing.company?.trim()) return showError("Company name is required.");
    setBusy(true);
    const row: any = {
      company: editing.company.trim(),
      contact_name: editing.contact_name?.trim() || null,
      trade: editing.trade?.trim() || null,
      phone: editing.phone?.trim() || null,
      email: editing.email?.trim() || null,
      address: editing.address?.trim() || null,
      notes: editing.notes?.trim() || null,
      status: editing.status || "approved",
      updated_at: new Date().toISOString(),
    };
    const { error } = editing.id
      ? await supabase.from("vendors").update(row).eq("id", editing.id)
      : await supabase.from("vendors").insert(row);
    setBusy(false);
    if (error) return showError(error.message.includes("vendors_company_email_uq") ? "That vendor is already on the list." : "Save failed: " + error.message);
    showToast(editing.id ? "Vendor updated" : "Vendor added");
    setEditing(null); load();
  }

  async function setStatus(v: any, status: string) {
    const { error } = await supabase.from("vendors").update({ status, updated_at: new Date().toISOString() }).eq("id", v.id);
    if (error) return showError(error.message);
    showToast(`${v.company} → ${STATUS[status]?.label ?? status}`);
    load();
  }

  // deleting a vendor takes its documents with it — the row disappears now, Undo puts it back
  function remove(v: any) {
    const before = rows;
    setOpenId(null);
    undoable({
      text: `Deleted ${v.company} and its documents`,
      hide: () => setRows((cur) => cur.filter((x) => x.id !== v.id)),
      restore: () => setRows(before),
      commit: () => supabase.from("vendors").delete().eq("id", v.id),
    });
  }

  async function saveUpload(v: any) {
    if (!upload?.file_b64) return showError("Attach the file first.");
    setBusy(true);
    const { error } = await supabase.from("vendor_documents").insert({
      vendor_id: v.id,
      doc_type: upload.doc_type,
      file_name: upload.file_name,
      mime_type: upload.mime_type,
      file_b64: upload.file_b64,
      expires_at: upload.doc_type === "coi" ? upload.expires_at || null : null,
      insurer: upload.doc_type === "coi" ? upload.insurer?.trim() || null : null,
    });
    setBusy(false);
    if (error) return showError("Upload failed: " + error.message);
    showToast("Document saved");
    setUpload(null); loadDocs(v.id); load();
  }

  async function view(d: any) {
    const w = window.open();
    if (!w) return showError("Allow pop-ups to view the file.");
    const { data } = await supabase.from("vendor_documents").select("file_b64,mime_type").eq("id", d.id).maybeSingle();
    if (!data?.file_b64) { w.close(); return showError("File not found."); }
    w.document.write(
      data.mime_type?.startsWith("image/")
        ? `<img src="${data.file_b64}" style="max-width:100%">`
        : `<iframe src="${data.file_b64}" style="border:0;width:100%;height:100vh"></iframe>`
    );
  }

  function removeDoc(v: any, d: any) {
    const before = docs;
    undoable({
      text: `Deleted ${d.doc_type === "w9" ? "W-9" : d.doc_type.toUpperCase()}`,
      hide: () => setDocs((cur) => cur.filter((x) => x.id !== d.id)),
      restore: () => setDocs(before),
      commit: async () => {
        const r = await supabase.from("vendor_documents").delete().eq("id", d.id);
        if (!r.error) load(); // COI / W-9 status on the vendor row comes from its documents
        return r;
      },
    });
  }

  async function copyLink() {
    const url = `${window.location.origin}/vendor-submit`;
    await copyText(url, "Upload link copied");
  }

  const header = (
    <PageHeader
      title="Vendors"
      sub="Subs & suppliers — COIs and W-9s"
      actions={<>
        <Button variant="outline" onClick={copyLink}><Link2 size={16} /> Copy upload link</Button>
        <Button onClick={() => { setOpenId(null); setEditing({ status: "approved" }); }}><Plus size={16} /> Add vendor</Button>
      </>}
    />
  );

  if (err) return <div className="pb-28">{header}<LoadError message={err} onRetry={load} /></div>;
  if (loading) return <div className="pb-28">{header}<ListSkeleton /></div>;

  const set = (k: string, val: any) => setEditing((e: any) => ({ ...e, [k]: val }));

  return (
    <div className="pb-28 space-y-5">
      {header}

      {rows.length ? (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="To review" value={<span className={counts.review ? "text-sky-300" : undefined}>{counts.review}</span>}
            onClick={() => setFilter(filter === "review" ? "" : "review")} className={cn(filter === "review" && "border-white/60")} />
          <Stat label="COI problems" value={counts.coi} tone={counts.coi ? "bad" : undefined}
            onClick={() => setFilter(filter === "coi" ? "" : "coi")} className={cn(filter === "coi" && "border-white/60")} />
          <Stat label="Missing W-9" value={counts.w9} tone={counts.w9 ? "warn" : undefined}
            onClick={() => setFilter(filter === "w9" ? "" : "w9")} className={cn(filter === "w9" && "border-white/60")} />
        </div>
      ) : null}

      {rows.length ? (
        <div className="space-y-2 md:flex md:items-center md:gap-3 md:space-y-0">
          <div className="relative md:w-72">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <Input className="pl-9" placeholder="Search company, contact, trade…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto no-scrollbar px-4 md:mx-0 md:px-0">
            <button onClick={() => setFilter("")} className={chip(!filter)}>All <span className="tabular-nums opacity-70">{rows.length}</span></button>
            <button onClick={() => setFilter("review")} className={chip(filter === "review")}>To review <span className="tabular-nums opacity-70">{counts.review}</span></button>
            <button onClick={() => setFilter("coi")} className={chip(filter === "coi")}>COI problems <span className="tabular-nums opacity-70">{counts.coi}</span></button>
            <button onClick={() => setFilter("w9")} className={chip(filter === "w9")}>Missing W-9 <span className="tabular-nums opacity-70">{counts.w9}</span></button>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-2 md:grid-cols-2">
        {shown.map((v) => {
          const c = coiState(v);
          const st = STATUS[v.status] ?? { label: v.status, cls: "border-white/10 text-neutral-300" };
          const open = openId === v.id;
          return (
            <Card key={v.id} className={cn("overflow-hidden", open && "border-white/25 md:col-span-2")}>
              <button onClick={() => toggle(v)} className="w-full px-4 py-3.5 text-left hover:bg-white/[0.02]" aria-expanded={open}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{v.company}</div>
                    <div className="truncate text-xs text-neutral-400">{[v.trade, v.contact_name].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge className={st.cls}>{st.label}</Badge>
                    <ChevronDown size={16} className={cn("text-neutral-500 transition-transform", open && "rotate-180")} />
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-semibold">
                  <span className={c.cls}>{c.text}</span>
                  <span className={v.w9_id ? "text-emerald-400" : "text-amber-300"}>{v.w9_id ? "W-9 on file" : "No W-9"}</span>
                </div>
              </button>

              {open ? (
                <div className="space-y-4 border-t border-border px-4 py-4">
                  <div className="space-y-1 text-sm text-neutral-300">
                    {v.phone ? <a className="flex min-h-[32px] items-center gap-2 hover:text-white" href={`tel:${v.phone}`}><Phone size={14} className="text-neutral-500" />{v.phone}</a> : null}
                    {v.email ? <a className="flex min-h-[32px] items-center gap-2 hover:text-white" href={`mailto:${v.email}`}><Mail size={14} className="text-neutral-500" />{v.email}</a> : null}
                    {v.address ? <div className="text-neutral-400">{v.address}</div> : null}
                    {v.coi_insurer ? <div className="text-neutral-400">Insurer: {v.coi_insurer}</div> : null}
                    {v.notes ? <div className="whitespace-pre-wrap text-neutral-400">{v.notes}</div> : null}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {needsReview(v) ? <Button variant="success" size="sm" className="h-10 md:h-8" onClick={() => setStatus(v, "approved")}><Check size={14} /> Mark approved</Button> : null}
                    <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={() => { setOpenId(null); setEditing({ ...v }); }}><Pencil size={14} /> Edit</Button>
                    <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={() => setUpload({ doc_type: "coi" })}><Plus size={14} /> COI</Button>
                    <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={() => setUpload({ doc_type: "w9" })}><Plus size={14} /> W-9</Button>
                    <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={() => setUpload({ doc_type: "other" })}><Plus size={14} /> Other</Button>
                    {v.status !== "inactive"
                      ? <Button variant="ghost" size="sm" className="h-10 md:h-8" onClick={() => setStatus(v, "inactive")}>Set inactive</Button>
                      : <Button variant="ghost" size="sm" className="h-10 md:h-8" onClick={() => setStatus(v, "approved")}>Reactivate</Button>}
                    <Button variant="destructive" size="sm" className="h-10 md:h-8" onClick={() => remove(v)}><Trash2 size={14} /> Delete</Button>
                  </div>

                  {upload ? (
                    <div className="space-y-3 rounded-lg border border-border bg-neutral-950 p-3">
                      <div className="text-sm font-semibold text-white">Add {upload.doc_type === "coi" ? "COI" : upload.doc_type === "w9" ? "W-9" : "document"}</div>
                      {upload.doc_type === "coi" ? (
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Expires"><Input type="date" value={upload.expires_at ?? ""} onChange={(e) => setUpload({ ...upload, expires_at: e.target.value })} /></Field>
                          <Field label="Insurer"><Input value={upload.insurer ?? ""} onChange={(e) => setUpload({ ...upload, insurer: e.target.value })} /></Field>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <label className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-input px-4 text-sm font-semibold text-foreground hover:border-white/25 hover:bg-accent">
                          <Paperclip size={16} /> Attach file or photo
                          <input type="file" accept="image/*,application/pdf" className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0]; e.currentTarget.value = "";
                              if (!f) return;
                              if (f.size > 8_000_000) return showError("That file is over 8 MB — take a photo of it instead.");
                              const b64 = await readFile(f);
                              setUpload((u: any) => ({ ...u, file_b64: b64, file_name: f.name, mime_type: f.type }));
                            }} />
                        </label>
                        {upload.file_b64 ? <span className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-emerald-400"><Check size={14} className="shrink-0" /><span className="truncate">{upload.file_name}</span></span> : null}
                      </div>
                      <div className="flex gap-2">
                        <Button className="flex-1 sm:flex-none" onClick={() => saveUpload(v)} disabled={busy || !upload.file_b64}>{busy ? "Saving…" : "Save document"}</Button>
                        <Button variant="outline" onClick={() => setUpload(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-neutral-500">Documents</Label>
                    {docs.length === 0 ? <div className="text-sm text-neutral-500">None on file.</div> : null}
                    {docs.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-neutral-950 px-3 py-2 text-sm">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <FileText size={16} className="shrink-0 text-neutral-500" />
                          <div className="min-w-0">
                            <span className="font-semibold text-neutral-200">{d.doc_type === "coi" ? "COI" : d.doc_type === "w9" ? "W-9" : "Other"}</span>
                            <span className="text-neutral-400"> · {fmtDate(d.submitted_at?.slice(0, 10))}{d.expires_at ? ` · exp ${fmtDate(d.expires_at)}` : ""}</span>
                            {d.file_name ? <div className="truncate text-xs text-neutral-500">{d.file_name}</div> : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={() => view(d)}><Eye size={14} /> View</Button>
                          <Button variant="ghost" size="icon" className="text-neutral-500 hover:text-red-400 md:h-8 md:w-8" onClick={() => removeDoc(v, d)} aria-label="Delete document"><X size={16} /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {rows.length && shown.length === 0 ? <Empty title="Nothing matches." body="Try a different search or filter." /> : null}

      {rows.length === 0 ? (
        <Empty
          icon={<Users size={28} />}
          title="No vendors yet."
          body="Add the subs you use, or text them the upload link — they fill in their info and attach their COI and W-9 themselves, and it shows up here to review. A sub working uninsured on your job is a claim on your policy."
          action={<Button variant="outline" onClick={copyLink}><Link2 size={16} /> Copy upload link</Button>}
        />
      ) : null}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        {editing ? (
          <DialogContent>
            <DialogHeader><DialogTitle>{editing.id ? "Edit vendor" : "New vendor"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Field label="Company"><Input value={editing.company ?? ""} onChange={(e) => set("company", e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Contact"><Input value={editing.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} /></Field>
                <Field label="Trade"><Input value={editing.trade ?? ""} placeholder="Concrete finishing, supplier…" onChange={(e) => set("trade", e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Phone"><Input type="tel" value={editing.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
                <Field label="Email"><Input type="email" value={editing.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
              </div>
              <Field label="Address"><Input value={editing.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
              <Field label="Notes"><Textarea rows={2} value={editing.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
              <div>
                <Label>Status</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(STATUS).map(([k, s]) => (
                    <button key={k} type="button" onClick={() => set("status", k)} className={chip(editing.status === k)}>{s.label}</button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
