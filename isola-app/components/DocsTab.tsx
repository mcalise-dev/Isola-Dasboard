"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MoneyInput from "@/components/MoneyInput";
import { fmtDate, todayISO } from "@/lib/format";
import { withTimeout, firstError } from "@/lib/load";
import { showError, showToast, undoable } from "@/components/Toaster";
import { PageHeader, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect, Field, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Plus, FileText, Eye, Pencil, Trash2, Paperclip, Check, ShieldCheck, AlertTriangle } from "lucide-react";

/* ============================================================
   COMPLIANCE VAULT — COIs, W-9s, lien waivers, permits, contracts,
   warranties, licenses.

   The point of this screen is expires_at. A property manager asking
   for a current certificate of insurance and getting an expired one
   is how a repeat account goes quiet. Anything inside 60 days shows
   up at the top in amber; anything past due shows red.
   ============================================================ */

const TYPES: { key: string; label: string; icon: string; hint: string }[] = [
  { key: "coi", label: "Insurance (COI)", icon: "", hint: "Certificate of insurance — the one PMs ask for" },
  { key: "lien_waiver", label: "Lien waiver", icon: "", hint: "Partial or final, signed at payment" },
  { key: "permit", label: "Permit", icon: "", hint: "Per town — proposals say permits are not included" },
  { key: "contract", label: "Signed contract", icon: "", hint: "Executed proposal or agreement" },
  { key: "w9", label: "W-9", icon: "", hint: "Yours, or a sub's for 1099 season" },
  { key: "warranty", label: "Warranty", icon: "", hint: "What's covered and until when" },
  { key: "license", label: "License", icon: "", hint: "RI / MA contractor registration" },
  { key: "other", label: "Other", icon: "", hint: "" },
];

export default function DocsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [docs, setDocs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [editing, setEditing] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr(null);
    try {
      const [d, c, j] = await withTimeout(Promise.all([
        // never select * — file_b64 would ship every document on load
        supabase.from("documents")
          .select("id,doc_type,title,customer_id,job_id,issuer,reference,issued_on,expires_at,amount,mime_type,notes,created_at")
          .order("expires_at", { ascending: true, nullsFirst: false }),
        supabase.from("customers").select("id,name").eq("archived", false).order("name"),
        supabase.from("jobs").select("id,job_name,customer").order("created_at", { ascending: false }).limit(60),
      ]));
      const bad = firstError(d, c, j);
      if (bad) throw new Error(bad);
      setDocs(d.data ?? []);
      setCustomers(c.data ?? []);
      setJobs(j.data ?? []);
      setLoading(false);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const custById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c.name])), [customers]);
  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j.job_name])), [jobs]);

  const daysLeft = (d: any) => d.expires_at ? Math.floor((new Date(d.expires_at).getTime() - Date.now()) / 86400000) : null;
  const expiring = docs.filter((d) => { const n = daysLeft(d); return n !== null && n <= 60; });
  const expired = expiring.filter((d) => daysLeft(d)! < 0);
  const shown = filter ? docs.filter((d) => d.doc_type === filter) : docs;

  async function save() {
    if (!editing.title?.trim()) return showError("Give it a title.");
    setBusy(true);
    const row: any = {
      doc_type: editing.doc_type || "other",
      title: editing.title.trim(),
      customer_id: editing.customer_id || null,
      job_id: editing.job_id || null,
      issuer: editing.issuer || null,
      reference: editing.reference || null,
      issued_on: editing.issued_on || null,
      expires_at: editing.expires_at || null,
      amount: editing.amount === "" || editing.amount == null ? null : Number(editing.amount),
      notes: editing.notes || null,
      updated_at: new Date().toISOString(),
    };
    if (editing.file_b64) { row.file_b64 = editing.file_b64; row.mime_type = editing.mime_type; }
    const { error } = editing.id
      ? await supabase.from("documents").update(row).eq("id", editing.id)
      : await supabase.from("documents").insert(row);
    setBusy(false);
    if (error) return showError("Save failed: " + error.message);
    showToast(editing.id ? "Document updated" : "Document filed");
    setEditing(null); load();
  }

  async function attach(file: File) {
    if (file.size > 4_000_000) return showError("That file is over 4 MB — take a photo of it instead, or shrink it first.");
    const b64: string = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    setEditing((e: any) => ({ ...e, file_b64: b64, mime_type: file.type }));
  }

  async function view(d: any) {
    // open the window inside the tap so the pop-up blocker allows it, then fill it
    const w = window.open();
    if (!w) return showError("Allow pop-ups to view the file.");
    const { data, error } = await supabase.from("documents").select("file_b64,mime_type").eq("id", d.id).maybeSingle();
    if (error) { w.close(); return showError("Couldn't load the file: " + error.message); }
    if (!data?.file_b64) { w.close(); return showError("No file attached to this record."); }
    w.document.write(
      data.mime_type?.startsWith("image/")
        ? `<img src="${data.file_b64}" style="max-width:100%">`
        : `<iframe src="${data.file_b64}" style="border:0;width:100%;height:100vh"></iframe>`
    );
  }

  function remove(d: any) {
    const before = docs;
    undoable({
      text: `Deleted "${d.title}"`,
      hide: () => setDocs((cur) => cur.filter((x) => x.id !== d.id)),
      restore: () => setDocs(before),
      commit: () => supabase.from("documents").delete().eq("id", d.id),
    });
  }

  const header = (
    <PageHeader
      title="Documents"
      sub="Insurance, waivers, permits, contracts — with expiry warnings"
      actions={<Button onClick={() => setEditing({ doc_type: "coi", issued_on: todayISO() })}><Plus size={16} /> Add document</Button>}
    />
  );

  if (err) return <div className="pb-28">{header}<LoadError message={err} onRetry={load} /></div>;
  if (loading) return <div className="pb-28">{header}<ListSkeleton /></div>;

  const pill = (active: boolean) => cn(
    "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors",
    active ? "border-white bg-white text-neutral-900" : "border-border bg-neutral-950 text-neutral-400 hover:text-white hover:border-white/25"
  );
  const set = (k: string, v: any) => setEditing((e: any) => ({ ...e, [k]: v }));

  return (
    <div className="pb-28 space-y-5">
      {header}

      <div className="grid grid-cols-3 gap-2">
        <Stat label="On file" value={docs.length} onClick={() => setFilter("")} />
        <Stat label="Due in 60 days" value={expiring.length - expired.length} tone={expiring.length - expired.length ? "warn" : undefined} />
        <Stat label="Expired" value={expired.length} tone={expired.length ? "bad" : undefined} />
      </div>

      {expiring.length ? (
        <Card className="border-amber-500/40 bg-amber-500/[0.07] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300"><AlertTriangle size={16} /> Expiring or expired</div>
          <div className="space-y-1">
            {expiring.map((d) => {
              const n = daysLeft(d)!;
              return (
                <button key={d.id} onClick={() => setEditing({ ...d, amount: d.amount ?? "" })}
                  className="flex min-h-[36px] w-full items-center justify-between gap-2 rounded-md px-1 text-left text-sm hover:bg-white/[0.04]">
                  <span className="truncate text-neutral-200">{d.title}</span>
                  <Badge variant={n < 0 ? "danger" : "warning"} className="shrink-0">
                    {n < 0 ? `expired ${Math.abs(n)}d ago` : `${n}d left`}
                  </Badge>
                </button>
              );
            })}
          </div>
        </Card>
      ) : null}

      <div className="-mx-4 flex gap-1.5 overflow-x-auto no-scrollbar px-4 md:mx-0 md:flex-wrap md:px-0">
        <button onClick={() => setFilter("")} className={pill(!filter)}>
          All <span className="tabular-nums opacity-70">{docs.length}</span>
        </button>
        {TYPES.map((t) => {
          const n = docs.filter((d) => d.doc_type === t.key).length;
          if (!n) return null;
          return (
            <button key={t.key} onClick={() => setFilter(filter === t.key ? "" : t.key)} className={cn(pill(filter === t.key), "shrink-0")}>
              {t.label} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <Empty
          icon={<ShieldCheck size={28} />}
          title="Nothing filed yet."
          body="Start with your general liability COI and your RI registration. Those two get asked for most, and having them a tap away is the difference between answering a property manager today and answering them Monday."
          action={<Button onClick={() => setEditing({ doc_type: "coi", issued_on: todayISO() })}><Plus size={16} /> Add document</Button>}
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {shown.map((d) => {
            const n = daysLeft(d);
            const t = TYPES.find((x) => x.key === d.doc_type);
            return (
              <Card key={d.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-neutral-950 text-neutral-400">
                    <FileText size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{d.title}</div>
                    <div className="truncate text-xs text-neutral-400">
                      {[d.issuer, d.reference, d.customer_id ? custById[d.customer_id] : null, d.job_id ? jobById[d.job_id] : null].filter(Boolean).join(" · ") || t?.label}
                    </div>
                  </div>
                  {n !== null && n < 0 ? <Badge variant="danger">Expired</Badge> : n !== null && n <= 60 ? <Badge variant="warning">{n} days</Badge> : <Badge variant="muted">{t?.label ?? "Other"}</Badge>}
                </div>
                <div className="text-xs text-neutral-400">
                  {d.issued_on ? `Issued ${fmtDate(d.issued_on)}` : ""}
                  {d.expires_at ? `${d.issued_on ? " · " : ""}Expires ${fmtDate(d.expires_at)}` : ""}
                </div>
                <div className="mt-auto flex items-center gap-1.5 pt-1">
                  <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={() => view(d)}><Eye size={14} /> View</Button>
                  <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={() => setEditing({ ...d, amount: d.amount ?? "" })}><Pencil size={14} /> Edit</Button>
                  <Button variant="ghost" size="icon" className="ml-auto text-neutral-500 hover:text-red-400 md:h-8 md:w-8" onClick={() => remove(d)} aria-label={`Delete ${d.title}`}><Trash2 size={16} /></Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        {editing ? (
          <DialogContent wide>
            <DialogHeader><DialogTitle>{editing.id ? "Edit document" : "Add document"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Type</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TYPES.map((t) => (
                    <button key={t.key} type="button" onClick={() => set("doc_type", t.key)} className={pill(editing.doc_type === t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {TYPES.find((t) => t.key === editing.doc_type)?.hint ? (
                  <p className="mt-1 text-xs text-neutral-500">{TYPES.find((t) => t.key === editing.doc_type)?.hint}</p>
                ) : null}
              </div>

              <Field label="Title"><Input value={editing.title ?? ""} placeholder="General liability — Acadia 2026" onChange={(e) => set("title", e.target.value)} /></Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Issuer"><Input value={editing.issuer ?? ""} placeholder="Carrier, town, sub" onChange={(e) => set("issuer", e.target.value)} /></Field>
                <Field label="Reference no."><Input value={editing.reference ?? ""} onChange={(e) => set("reference", e.target.value)} /></Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Issued"><Input type="date" value={editing.issued_on ?? ""} onChange={(e) => set("issued_on", e.target.value)} /></Field>
                <Field label="Expires"><Input type="date" value={editing.expires_at ?? ""} onChange={(e) => set("expires_at", e.target.value)} /></Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Customer">
                  <NativeSelect value={editing.customer_id ?? ""} onChange={(e) => set("customer_id", e.target.value)}>
                    <option value="">—</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Job">
                  <NativeSelect value={editing.job_id ?? ""} onChange={(e) => set("job_id", e.target.value)}>
                    <option value="">—</option>
                    {jobs.map((j) => <option key={j.id} value={j.id}>{j.job_name || j.customer}</option>)}
                  </NativeSelect>
                </Field>
              </div>

              <Field label="Amount — coverage limit or fee">
                <MoneyInput className="h-10 w-full rounded-lg border border-input bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/40" value={editing.amount ?? ""} onChange={(v) => set("amount", v)} />
              </Field>

              <div className="flex items-center gap-2">
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-input px-4 text-sm font-semibold text-foreground hover:border-white/25 hover:bg-accent">
                  <Paperclip size={16} /> Attach file or photo
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); e.currentTarget.value = ""; }} />
                </label>
                {editing.file_b64 ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400"><Check size={14} /> attached</span> : null}
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
