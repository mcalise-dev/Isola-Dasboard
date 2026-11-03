"use client";
// Document Studio (v84): invoices, proposals and change orders for a job, in the Isola v3 look.
// Every part of a document is editable here; the preview on the right is exactly what prints.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { getSetting, setSetting } from "@/lib/settings";
import { showError, showToast } from "@/components/Toaster";
import { ask } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { Input, Textarea, NativeSelect, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Empty, ListSkeleton } from "@/components/ui/bits";
import { Segmented } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  FileText, FilePlus2, Receipt, ClipboardPen, Settings2, X, Printer, Save, Copy, Trash2, ArrowUp, ArrowDown,
  Plus, ChevronDown, ChevronRight, RefreshCw, IndentIncrease, IndentDecrease, Eye, Pencil,
} from "lucide-react";
import {
  type StudioDoc, type StudioSettings, type Section, type Line, type DocKind, type JobData, type Detail, type MatMode,
  DEFAULT_SETTINGS, mergeSettings, blankDoc, fillInvoice, renderDoc, docTotal, lineSum, money2, uid, addDays, qtyNum,
} from "@/lib/docStudio";

const KIND_LABEL: Record<DocKind, string> = { invoice: "Invoice", proposal: "Proposal", change_order: "Change order" };
const KIND_ICON: Record<DocKind, any> = { invoice: Receipt, proposal: FileText, change_order: ClipboardPen };
const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };

async function loadSettings(): Promise<StudioSettings> {
  try { const raw = await getSetting("doc_studio"); return mergeSettings(raw ? JSON.parse(raw) : null); } catch { return DEFAULT_SETTINGS; }
}

// Full-screen layers render into <body> so the app's sidebar / frame can't sit on top of them.
function Layer({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => { setEl(document.body); const o = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = o; }; }, []);
  return el ? createPortal(children, el) : null;
}

// ======================= job page panel =======================
export default function DocStudioPanel({ job }: { job: any }) {
  const sb = useMemo(() => createClient(), []);
  const [docs, setDocs] = useState<any[] | null>(null);
  const [open, setOpen] = useState<{ id: string | null; doc: StudioDoc } | null>(null);
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [setOpenSettings, setSetOpenSettings] = useState(false);

  async function load() {
    const { data, error } = await sb.from("studio_docs").select("id,kind,number,title,status,total,updated_at,data").eq("job_id", job.id).order("updated_at", { ascending: false });
    if (error) { showError(error.message); setDocs([]); return; }
    setDocs(data ?? []);
  }
  useEffect(() => { load(); loadSettings().then(setSettings); }, [job.id]);

  function create(kind: DocKind) {
    const d = blankDoc(kind, settings, job);
    if (kind === "invoice") d.number = job.qbo_invoice_ref || "";
    setOpen({ id: null, doc: d });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => create("invoice")}><Receipt size={15} className="mr-1.5" />New invoice</Button>
        <Button size="sm" variant="outline" onClick={() => create("proposal")}><FileText size={15} className="mr-1.5" />New proposal</Button>
        <Button size="sm" variant="outline" onClick={() => create("change_order")}><ClipboardPen size={15} className="mr-1.5" />New change order</Button>
        <Button size="sm" variant="ghost" onClick={() => setSetOpenSettings(true)}><Settings2 size={15} className="mr-1.5" />Studio settings</Button>
      </div>
      {!docs ? <ListSkeleton rows={2} /> : docs.length === 0 ? (
        <p className="text-sm text-neutral-500">No documents yet. Start an invoice and it fills itself from the hours and materials logged on this job.</p>
      ) : (
        <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          {docs.map((r) => {
            const Icon = KIND_ICON[r.kind as DocKind] ?? FileText;
            return (
              <button key={r.id} onClick={() => setOpen({ id: r.id, doc: { ...blankDoc(r.kind, settings, job), ...r.data } })}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03]">
                <Icon size={17} className="shrink-0 text-neutral-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{KIND_LABEL[r.kind as DocKind]} {r.number ? `· ${r.number}` : ""}</div>
                  <div className="truncate text-xs text-neutral-500">{r.title || "—"} · edited {new Date(r.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                </div>
                <Badge variant={r.status === "paid" || r.status === "signed" ? "success" : r.status === "sent" ? "warning" : "muted"} className="shrink-0">{r.status}</Badge>
                <span className="w-24 shrink-0 text-right text-sm tabular-nums text-neutral-200">{r.total != null ? money2(Number(r.total)) : ""}</span>
              </button>
            );
          })}
        </div>
      )}
      {open ? <Editor job={job} id={open.id} initial={open.doc} settings={settings} onSettings={setSettings}
        onClose={() => setOpen(null)} onSaved={load} /> : null}
      {setOpenSettings ? <SettingsSheet job={job} settings={settings} onClose={() => setSetOpenSettings(false)} onSaved={(s) => setSettings(s)} /> : null}
    </div>
  );
}

// ======================= editor =======================
function Editor({ job, id: initialId, initial, settings, onSettings, onClose, onSaved }: {
  job: any; id: string | null; initial: StudioDoc; settings: StudioSettings; onSettings: (s: StudioSettings) => void; onClose: () => void; onSaved: () => void;
}) {
  const sb = useMemo(() => createClient(), []);
  const [id, setId] = useState<string | null>(initialId);
  const [doc, setDoc] = useState<StudioDoc>(initial);
  const [status, setStatus] = useState("draft");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => { if (initialId) sb.from("studio_docs").select("status").eq("id", initialId).single().then(({ data }: any) => data && setStatus(data.status)); }, [initialId]);

  const upd = (fn: (d: StudioDoc) => StudioDoc | void) => { setDoc((d) => { const c = structuredClone(d); const r = fn(c); return (r ?? c) as StudioDoc; }); setDirty(true); };
  const html = useMemo(() => renderDoc(doc, settings, origin), [doc, settings, origin]);
  const total = docTotal(doc);

  async function save(silent = false) {
    setSaving(true);
    const row = { job_id: job.id, kind: doc.kind, number: doc.number || null, title: doc.facts.find((f) => /JOB|PROJECT/.test(f.k))?.v || job.job_name, status, total, data: doc, updated_at: new Date().toISOString() };
    const res = id ? await sb.from("studio_docs").update(row).eq("id", id).select("id").single() : await sb.from("studio_docs").insert(row).select("id").single();
    setSaving(false);
    if (res.error) { showError("Save failed: " + res.error.message); return false; }
    setId(res.data.id); setDirty(false); onSaved(); if (!silent) showToast("Saved");
    return true;
  }
  function printIt() {
    const w = window.open("", "_blank");
    if (!w) { showError("Allow pop-ups to save the PDF."); return; }
    w.document.open(); w.document.write(html); w.document.close();
    const go = () => { w.focus(); w.print(); };
    const imgs = Array.from(w.document.images);
    if (imgs.every((i) => i.complete)) setTimeout(go, 250); else Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))).then(() => setTimeout(go, 150));
  }
  async function close() {
    if (dirty && !(await ask({ title: "Close without saving?", body: "Your changes to this document will be lost.", confirm: "Close", danger: true }))) return;
    onClose();
  }
  async function del() {
    if (!id) { onClose(); return; }
    if (!(await ask({ title: `Delete this ${KIND_LABEL[doc.kind].toLowerCase()}?`, confirm: "Delete", danger: true }))) return;
    const { error } = await sb.from("studio_docs").delete().eq("id", id);
    if (error) { showError(error.message); return; }
    onSaved(); onClose();
  }
  async function duplicate() {
    const row = { job_id: job.id, kind: doc.kind, number: doc.number ? doc.number + " (copy)" : null, title: job.job_name, status: "draft", total, data: doc };
    const { data, error } = await sb.from("studio_docs").insert(row).select("id").single();
    if (error) { showError(error.message); return; }
    setId(data.id); setStatus("draft"); setDirty(false); onSaved(); showToast("Copy made — you're editing the copy");
  }

  return (
    <Layer><div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        <Button size="icon" variant="ghost" onClick={close} aria-label="Close"><X size={18} /></Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{KIND_LABEL[doc.kind]} {doc.number ? `· ${doc.number}` : ""}{dirty ? <span className="ml-2 text-xs font-normal text-amber-300">unsaved</span> : null}</div>
          <div className="truncate text-xs text-neutral-500">{job.job_name} · {money2(total)}</div>
        </div>
        <NativeSelect value={status} onChange={(e) => { setStatus(e.target.value); setDirty(true); }} className="h-9 w-auto text-xs">
          {["draft", "ready", "sent", "signed", "paid", "void"].map((s) => <option key={s}>{s}</option>)}
        </NativeSelect>
        <div className="lg:hidden"><Segmented value={view} onChange={(v) => setView(v as any)} options={[{ value: "edit", label: "Edit", icon: <Pencil size={14} /> }, { value: "preview", label: "Preview", icon: <Eye size={14} /> }]} /></div>
        <Button size="sm" variant="ghost" onClick={duplicate} title="Duplicate"><Copy size={15} /></Button>
        <Button size="sm" variant="ghost" onClick={del} title="Delete"><Trash2 size={15} /></Button>
        <Button size="sm" variant="outline" onClick={printIt}><Printer size={15} className="mr-1.5" />PDF / Print</Button>
        <Button size="sm" onClick={() => save()} disabled={saving}><Save size={15} className="mr-1.5" />{saving ? "Saving…" : "Save"}</Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className={cn("min-h-0 w-full overflow-y-auto p-3 sm:p-4 lg:w-[480px] lg:shrink-0 lg:border-r lg:border-border", view === "preview" && "hidden lg:block")}>
          <Controls doc={doc} upd={upd} job={job} settings={settings} onSettings={onSettings} />
        </div>
        <div className={cn("min-h-0 flex-1 bg-neutral-800", view === "edit" && "hidden lg:block")}>
          <iframe title="Preview" srcDoc={html} className="h-full w-full border-0" />
        </div>
      </div>
    </div></Layer>
  );
}

// ---------- collapsible group ----------
function Group({ title, children, open: o = false, right }: { title: string; children: React.ReactNode; open?: boolean; right?: React.ReactNode }) {
  const [open, setOpen] = useState(o);
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <div className="flex items-center">
        <button onClick={() => setOpen(!open)} className="flex min-h-[44px] flex-1 items-center gap-2 px-4 text-left text-sm font-semibold text-white">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{title}
        </button>
        {right ? <div className="pr-3">{right}</div> : null}
      </div>
      {open ? <div className="space-y-3 border-t border-white/[0.06] p-4">{children}</div> : null}
    </section>
  );
}
const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-sm text-neutral-300">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-white" />{label}
  </label>
);
const moveIn = <T,>(arr: T[], i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
const numOrNull = (v: string) => (v.trim() === "" || isNaN(Number(v.replace(/[$,]/g, ""))) ? null : Number(v.replace(/[$,]/g, "")));

function Controls({ doc, upd, job, settings, onSettings }: { doc: StudioDoc; upd: (fn: (d: StudioDoc) => any) => void; job: any; settings: StudioSettings; onSettings: (s: StudioSettings) => void }) {
  return (
    <div className="space-y-3 pb-24">
      {doc.kind === "invoice" ? <FillFromWork doc={doc} upd={upd} job={job} settings={settings} /> : null}

      <Group title="Header" open={doc.kind !== "invoice"}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Big word"><Input value={doc.word} onChange={(e) => upd((d) => { d.word = e.target.value; })} /></Field>
          <Field label="Number"><Input value={doc.number} onChange={(e) => upd((d) => { d.number = e.target.value; })} /></Field>
        </div>
        <Field label="Date line"><Input value={doc.date} onChange={(e) => upd((d) => { d.date = e.target.value; })} /></Field>
        <Field label="Yellow tag (blank hides it)"><Input value={doc.pill} onChange={(e) => upd((d) => { d.pill = e.target.value; })} /></Field>
        <Field label="Page footer"><Input value={doc.footer} onChange={(e) => upd((d) => { d.footer = e.target.value; })} /></Field>
        <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Info boxes</div>
        {doc.facts.map((f, i) => (
          <div key={i} className="flex gap-2">
            <Input className="w-[38%]" value={f.k} onChange={(e) => upd((d) => { d.facts[i].k = e.target.value; })} />
            <Textarea rows={1} className="min-h-[40px] flex-1" value={f.v} onChange={(e) => upd((d) => { d.facts[i].v = e.target.value; })} />
            <Button size="icon" variant="ghost" onClick={() => upd((d) => { d.facts.splice(i, 1); })}><X size={15} /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => upd((d) => { d.facts.push({ k: "LABEL", v: "" }); })}><Plus size={14} className="mr-1" />Info box</Button>
      </Group>

      <Group title="Overview text">
        <Field label="Heading"><Input value={doc.overviewTitle} onChange={(e) => upd((d) => { d.overviewTitle = e.target.value; })} /></Field>
        <Textarea rows={6} value={doc.overview} placeholder="Blank hides this section" onChange={(e) => upd((d) => { d.overview = e.target.value; })} />
      </Group>

      <Group title={`Line items · ${money2(doc.sections.reduce((a, s) => a + lineSum(s), 0))}`} open>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Table heading"><Input value={doc.tableTitle} onChange={(e) => upd((d) => { d.tableTitle = e.target.value; })} /></Field>
          <Field label="Qty column name"><Input value={doc.qtyHeader} onChange={(e) => upd((d) => { d.qtyHeader = e.target.value; })} /></Field>
        </div>
        <div className="flex flex-wrap gap-x-4">
          <Toggle label="Qty" checked={doc.cols.qty} onChange={(v) => upd((d) => { d.cols.qty = v; })} />
          <Toggle label="Rate" checked={doc.cols.rate} onChange={(v) => upd((d) => { d.cols.rate = v; })} />
          <Toggle label="Amounts" checked={doc.cols.amount} onChange={(v) => upd((d) => { d.cols.amount = v; })} />
          <Toggle label="Details under lines" checked={doc.cols.desc} onChange={(v) => upd((d) => { d.cols.desc = v; })} />
        </div>
        {doc.sections.map((s, si) => <SectionEditor key={s.id} s={s} si={si} n={doc.sections.length} upd={upd} />)}
        <Button size="sm" variant="outline" onClick={() => upd((d) => { d.sections.push({ id: uid(), title: "NEW SECTION", showSubtotal: false, lines: [] }); })}><Plus size={14} className="mr-1" />Section</Button>
      </Group>

      <Group title={`Totals · ${money2(docTotal(doc))}`}>
        <Toggle label="Show total bar" checked={doc.showTotal} onChange={(v) => upd((d) => { d.showTotal = v; })} />
        <Field label="Total bar label"><Input value={doc.totalLabel} onChange={(e) => upd((d) => { d.totalLabel = e.target.value; })} /></Field>
        <Field label="Set the total by hand (blank = add up the lines)">
          <Input inputMode="decimal" value={doc.totalOverride ?? ""} onChange={(e) => upd((d) => { d.totalOverride = numOrNull(e.target.value); })} />
        </Field>
        {doc.sections.length > 1 || doc.showSectionSummary ? <Toggle label="List each section's total above the total bar" checked={doc.showSectionSummary} onChange={(v) => upd((d) => { d.showSectionSummary = v; })} /> : null}
        {doc.kind === "invoice" ? <Field label="Payments received"><Input inputMode="decimal" value={doc.payments || ""} onChange={(e) => upd((d) => { d.payments = numOrNull(e.target.value) ?? 0; })} /></Field> : null}
        <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Extra rows (adds to the total — use a minus for credits)</div>
        {doc.extraSummary.map((x, i) => (
          <div key={i} className="flex gap-2">
            <Input className="flex-1" value={x.label} onChange={(e) => upd((d) => { d.extraSummary[i].label = e.target.value; })} />
            <Input className="w-28" inputMode="decimal" value={x.amount} onChange={(e) => upd((d) => { d.extraSummary[i].amount = numOrNull(e.target.value) ?? 0; })} />
            <Button size="icon" variant="ghost" onClick={() => upd((d) => { d.extraSummary.splice(i, 1); })}><X size={15} /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => upd((d) => { d.extraSummary.push({ label: "Discount", amount: 0 }); })}><Plus size={14} className="mr-1" />Row</Button>
        {doc.kind !== "invoice" ? (
          <>
            <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Price options (each gets its own bar — replaces the total bar)</div>
            {doc.options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input className="flex-1" value={o.label} onChange={(e) => upd((d) => { d.options[i].label = e.target.value; })} />
                <Input className="w-28" inputMode="decimal" value={o.amount} onChange={(e) => upd((d) => { d.options[i].amount = numOrNull(e.target.value) ?? 0; })} />
                <Button size="icon" variant="ghost" onClick={() => upd((d) => { d.options.splice(i, 1); })}><X size={15} /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => upd((d) => { d.options.push({ label: `OPTION ${d.options.length + 1}`, amount: 0 }); })}><Plus size={14} className="mr-1" />Option</Button>
          </>
        ) : null}
      </Group>

      {doc.kind !== "invoice" || doc.scope.length ? (
        <Group title="Detailed scope">
          {doc.scope.map((b, i) => (
            <div key={b.id} className="space-y-2 rounded-xl border border-white/[0.06] p-3">
              <div className="flex gap-2">
                <Input className="flex-1" value={b.title} onChange={(e) => upd((d) => { d.scope[i].title = e.target.value; })} />
                <Button size="icon" variant="ghost" onClick={() => upd((d) => { moveIn(d.scope, i, -1); })}><ArrowUp size={15} /></Button>
                <Button size="icon" variant="ghost" onClick={() => upd((d) => { d.scope.splice(i, 1); })}><X size={15} /></Button>
              </div>
              <Textarea rows={4} value={b.bullets.join("\n")} placeholder="One bullet per line" onChange={(e) => upd((d) => { d.scope[i].bullets = e.target.value.split("\n"); })} />
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => upd((d) => { d.scope.push({ id: uid(), title: "Scope item", bullets: [""] }); })}><Plus size={14} className="mr-1" />Scope block</Button>
        </Group>
      ) : null}

      <Group title={doc.kind === "invoice" ? "Payment & notes" : "Terms & conditions"}>
        {doc.blocks.map((b, i) => (
          <div key={b.id} className="space-y-2 rounded-xl border border-white/[0.06] p-3">
            <div className="flex gap-1">
              <Input className="flex-1" value={b.title} onChange={(e) => upd((d) => { d.blocks[i].title = e.target.value; })} />
              <Button size="icon" variant="ghost" onClick={() => upd((d) => { moveIn(d.blocks, i, -1); })}><ArrowUp size={15} /></Button>
              <Button size="icon" variant="ghost" onClick={() => upd((d) => { moveIn(d.blocks, i, 1); })}><ArrowDown size={15} /></Button>
              <Button size="icon" variant="ghost" onClick={() => upd((d) => { d.blocks.splice(i, 1); })}><X size={15} /></Button>
            </div>
            <Textarea rows={4} value={b.body} onChange={(e) => upd((d) => { d.blocks[i].body = e.target.value; })} />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => upd((d) => { d.blocks.push({ id: uid(), title: "New heading", body: "" }); })}><Plus size={14} className="mr-1" />Text block</Button>
          {doc.kind !== "invoice" ? (
            <Button size="sm" variant="ghost" onClick={async () => {
              const next = { ...settings, proposalTerms: doc.blocks.map((b) => ({ ...b })) };
              try { await setSetting("doc_studio", JSON.stringify(next)); onSettings(next); showToast("Saved as default terms for new proposals"); } catch (e: any) { showError(e.message); }
            }}>Save as my default terms</Button>
          ) : null}
        </div>
        <Toggle label="Signature lines" checked={doc.signature} onChange={(v) => upd((d) => { d.signature = v; })} />
        {doc.signature ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Left caption"><Input value={doc.signLeft} onChange={(e) => upd((d) => { d.signLeft = e.target.value; })} /></Field>
            <Field label="Right caption"><Input value={doc.signRight} onChange={(e) => upd((d) => { d.signRight = e.target.value; })} /></Field>
          </div>
        ) : null}
        <Field label="Closing line"><Input value={doc.closing} onChange={(e) => upd((d) => { d.closing = e.target.value; })} /></Field>
      </Group>

      <Group title="Look">
        <div className="grid grid-cols-3 gap-2">
          {(["ink", "accent", "band"] as const).map((k) => (
            <Field key={k} label={k === "ink" ? "Dark color" : k === "accent" ? "Accent" : "Row shading"}>
              <input type="color" value={doc.look[k]} onChange={(e) => upd((d) => { d.look[k] = e.target.value; })} className="h-10 w-full cursor-pointer rounded-lg border border-border bg-transparent" />
            </Field>
          ))}
        </div>
        <Field label={`Text size · ${doc.look.font}%`}>
          <input type="range" min={85} max={120} step={5} value={doc.look.font} onChange={(e) => upd((d) => { d.look.font = Number(e.target.value); })} className="w-full accent-white" />
        </Field>
        <Toggle label="Isola logo in the header" checked={doc.look.logo} onChange={(v) => upd((d) => { d.look.logo = v; })} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={async () => {
            const next = { ...settings, look: { ...doc.look } };
            try { await setSetting("doc_studio", JSON.stringify(next)); onSettings(next); showToast("Look saved as default"); } catch (e: any) { showError(e.message); }
          }}>Use this look for every new document</Button>
          <Button size="sm" variant="ghost" onClick={() => upd((d) => { d.look = { ...DEFAULT_SETTINGS.look }; })}>Reset to Isola black & yellow</Button>
        </div>
      </Group>
    </div>
  );
}

function SectionEditor({ s, si, n, upd }: { s: Section; si: number; n: number; upd: (fn: (d: StudioDoc) => any) => void }) {
  const [open, setOpen] = useState(true);
  const L = (fn: (lines: Line[], sec: Section) => void) => upd((d) => { fn(d.sections[si].lines, d.sections[si]); });
  return (
    <div className="rounded-xl border border-white/[0.08]">
      <div className="flex items-center gap-1 border-b border-white/[0.06] p-2">
        <button onClick={() => setOpen(!open)} className="p-1 text-neutral-400">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
        <Input className="h-9 flex-1 text-xs font-semibold" value={s.title} placeholder="Section title (blank hides it)" onChange={(e) => L((_, sec) => { sec.title = e.target.value; })} />
        <span className="w-24 text-right text-xs tabular-nums text-neutral-300">{money2(lineSum(s))}</span>
        <Button size="icon" variant="ghost" disabled={si === 0} onClick={() => upd((d) => { moveIn(d.sections, si, -1); })}><ArrowUp size={14} /></Button>
        <Button size="icon" variant="ghost" disabled={si === n - 1} onClick={() => upd((d) => { moveIn(d.sections, si, 1); })}><ArrowDown size={14} /></Button>
        <Button size="icon" variant="ghost" onClick={async () => { if (await ask({ title: "Remove this section?", confirm: "Remove", danger: true })) upd((d) => { d.sections.splice(si, 1); }); }}><Trash2 size={14} /></Button>
      </div>
      {open ? (
        <div className="space-y-2 p-2">
          {s.lines.map((l, li) => (
            <div key={l.id} className={cn("rounded-lg border p-2", l.kind === "group" ? "border-amber-400/30 bg-amber-400/[0.04]" : l.kind === "note" ? "border-sky-400/20" : "border-white/[0.06]", l.indent && "ml-4")}>
              <div className="flex items-center gap-1">
                <NativeSelect className="h-8 w-[92px] text-xs" value={l.kind} onChange={(e) => L((ls) => { ls[li].kind = e.target.value as any; })}>
                  <option value="item">Line</option><option value="group">Heading</option><option value="note">Note</option>
                </NativeSelect>
                <Input className="h-8 flex-1 text-sm font-semibold" value={l.name} onChange={(e) => L((ls) => { ls[li].name = e.target.value; })} />
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => L((ls) => { ls[li].indent = !ls[li].indent; })} title="Indent">{l.indent ? <IndentDecrease size={14} /> : <IndentIncrease size={14} />}</Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => L((ls) => moveIn(ls, li, -1))}><ArrowUp size={14} /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => L((ls) => moveIn(ls, li, 1))}><ArrowDown size={14} /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => L((ls) => { ls.splice(li, 1); })}><X size={14} /></Button>
              </div>
              {l.kind !== "note" ? (
                <Input className="mt-1 h-8 text-xs" value={l.desc ?? ""} placeholder={l.kind === "group" ? "Note beside the heading (optional)" : "Details under the line (times, what was done…)"} onChange={(e) => L((ls) => { ls[li].desc = e.target.value; })} />
              ) : null}
              {l.kind === "item" ? (
                <div className="mt-1 grid grid-cols-3 gap-1">
                  <Input className="h-8 text-xs" value={l.qty ?? ""} placeholder="Qty (8 hr, 14 bags)" onChange={(e) => L((ls) => { const x = ls[li]; x.qty = e.target.value; const q = qtyNum(x.qty); if (q != null && x.rate != null) x.amount = Math.round(q * x.rate * 100) / 100; })} />
                  <Input className="h-8 text-xs" inputMode="decimal" value={l.rate ?? ""} placeholder="Rate" onChange={(e) => L((ls) => { const x = ls[li]; x.rate = numOrNull(e.target.value); const q = qtyNum(x.qty); if (q != null && x.rate != null) x.amount = Math.round(q * x.rate * 100) / 100; })} />
                  <Input className="h-8 text-xs font-semibold" inputMode="decimal" value={l.amount ?? ""} placeholder="Amount" onChange={(e) => L((ls) => { ls[li].amount = numOrNull(e.target.value); })} />
                </div>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => L((ls) => { ls.push({ id: uid(), kind: "item", name: "New line", qty: "", rate: null, amount: null }); })}><Plus size={14} className="mr-1" />Line</Button>
            <Button size="sm" variant="outline" onClick={() => L((ls) => { ls.push({ id: uid(), kind: "group", name: "HEADING" }); })}><Plus size={14} className="mr-1" />Heading</Button>
            <Button size="sm" variant="ghost" onClick={() => L((ls) => { ls.push({ id: uid(), kind: "note", name: "Note" }); })}><Plus size={14} className="mr-1" />Note</Button>
          </div>
          <div className="flex items-center gap-2">
            <Toggle label="Subtotal" checked={s.showSubtotal} onChange={(v) => L((_, sec) => { sec.showSubtotal = v; })} />
            {s.showSubtotal ? <Input className="h-8 flex-1 text-xs" value={s.subtotalLabel ?? ""} placeholder="Subtotal label" onChange={(e) => L((_, sec) => { sec.subtotalLabel = e.target.value; })} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------- invoice: fill from logged hours & materials ----------
function FillFromWork({ doc, upd, job, settings }: { doc: StudioDoc; upd: (fn: (d: StudioDoc) => any) => void; job: any; settings: StudioSettings }) {
  const sb = useMemo(() => createClient(), []);
  const [siblings, setSiblings] = useState<any[]>([]);
  const [picked, setPicked] = useState<string[]>([job.id]);
  const [detail, setDetail] = useState<Detail>(settings.invoice.detail);
  const [mat, setMat] = useState<MatMode>(settings.invoice.materials);
  const [clock, setClock] = useState(settings.invoice.clock);
  const [due, setDue] = useState(job.due_date || addDays(todayIso(), settings.invoice.dueDays));
  const [busy, setBusy] = useState(false);
  const auto = useRef(false);

  useEffect(() => {
    let q = sb.from("jobs").select("id,job_name,location,status,qbo_invoice_ref,billing_type");
    q = job.customer_id ? q.eq("customer_id", job.customer_id) : q.eq("customer", job.customer ?? "");
    q.neq("id", job.id).order("created_at", { ascending: false }).then(({ data }: any) => {
      const sib = (data ?? []).filter((j: any) => j.status !== "lost");
      setSiblings(sib);
      // jobs billed on the same invoice number come along by default
      if (job.qbo_invoice_ref) setPicked([job.id, ...sib.filter((j: any) => j.qbo_invoice_ref === job.qbo_invoice_ref).map((j: any) => j.id)]);
    });
  }, [job.id]);

  async function fill() {
    setBusy(true);
    try {
      const ids = picked;
      const [j, c, t, r, w] = await Promise.all([
        sb.from("jobs").select("*").in("id", ids),
        sb.from("job_costs").select("id,job_id,entry_date,category,worker,vendor,hours,rate,amount,bill_amount,notes").in("job_id", ids).order("entry_date"),
        sb.from("time_clock").select("job_id,job_cost_id,clock_in,clock_out").in("job_id", ids),
        sb.from("job_pay_rates").select("*").in("job_id", ids),
        sb.from("workers").select("id,name,rate,is_owner"),
      ]);
      const err = j.error || c.error || w.error; if (err) throw new Error(err.message);
      const order = [job.id, ...ids.filter((x) => x !== job.id)];
      const data: JobData[] = order.map((jid) => ({
        job: (j.data ?? []).find((x: any) => x.id === jid),
        costs: (c.data ?? []).filter((x: any) => x.job_id === jid),
        clocks: (t.data ?? []).filter((x: any) => x.job_id === jid),
        rates: (r.data ?? []).filter((x: any) => x.job_id === jid),
        workers: w.data ?? [],
      })).filter((x) => x.job);
      upd((d) => fillInvoice(d, data, { detail, materials: mat, clock, positions: settings.positions, ownerPosition: settings.ownerPosition, defaultPosition: settings.defaultPosition }, settings, due));
    } catch (e: any) { showError("Couldn't load the logged work: " + e.message); }
    setBusy(false);
  }
  // a brand-new invoice fills itself once
  useEffect(() => { if (!auto.current && doc.sections.length === 0) { auto.current = true; setTimeout(fill, 300); } }, [siblings]);

  return (
    <Group title="Fill from logged work" open={doc.sections.length === 0}
      right={<Button size="sm" variant="outline" onClick={fill} disabled={busy}><RefreshCw size={14} className={cn("mr-1.5", busy && "animate-spin")} />{busy ? "Loading" : "Refill"}</Button>}>
      <p className="text-xs text-neutral-500">Refill rebuilds the line items from what's logged right now. Edits you made to lines are replaced; header, text and look stay.</p>
      <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Jobs on this invoice</div>
      <div className="flex min-h-[32px] items-center gap-2 text-sm text-white"><input type="checkbox" checked readOnly disabled className="h-4 w-4 accent-white" />{job.job_name}</div>
      {siblings.map((s) => (
        <Toggle key={s.id} label={`${s.job_name}${s.qbo_invoice_ref ? ` · ${s.qbo_invoice_ref}` : ""}`} checked={picked.includes(s.id)}
          onChange={(v) => setPicked((p) => (v ? [...p, s.id] : p.filter((x) => x !== s.id)))} />
      ))}
      <Field label="Labor detail">
        <Segmented value={detail} onChange={(v) => setDetail(v as Detail)} options={[{ value: "day", label: "By day" }, { value: "position", label: "By position" }, { value: "total", label: "One line" }]} />
      </Field>
      <Field label="Materials">
        <Segmented value={mat} onChange={(v) => setMat(v as MatMode)} options={[{ value: "itemized", label: "Itemized" }, { value: "single", label: "One line" }]} />
      </Field>
      <Toggle label="Show clock-in / clock-out times" checked={clock} onChange={setClock} />
      <Field label="Due date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
    </Group>
  );
}

// ======================= studio settings =======================
function SettingsSheet({ job, settings, onClose, onSaved }: { job: any; settings: StudioSettings; onClose: () => void; onSaved: (s: StudioSettings) => void }) {
  const sb = useMemo(() => createClient(), []);
  const [s, setS] = useState<StudioSettings>(structuredClone(settings));
  const [workers, setWorkers] = useState<any[]>([]);
  useEffect(() => { sb.from("workers").select("name,is_owner,active").eq("active", true).order("name").then(({ data }: any) => setWorkers(data ?? [])); }, []);
  const set = (fn: (x: StudioSettings) => void) => setS((p) => { const c = structuredClone(p); fn(c); return c; });
  async function save() {
    try { await setSetting("doc_studio", JSON.stringify(s)); onSaved(s); showToast("Studio settings saved"); onClose(); } catch (e: any) { showError(e.message); }
  }
  return (
    <Layer><div className="fixed inset-0 z-[60] overflow-y-auto bg-background">
      <div className="mx-auto max-w-2xl space-y-3 p-4 pb-24">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={onClose}><X size={18} /></Button>
          <div className="flex-1 text-base font-semibold text-white">Studio settings</div>
          <Button size="sm" onClick={save}><Save size={15} className="mr-1.5" />Save</Button>
        </div>
        <p className="text-xs text-neutral-500">These are the starting point for every new invoice, proposal and change order. Anything can still be changed on a single document.</p>
        <Group title="Company block (header)" open>
          <Field label="Name"><Input value={s.company.name} onChange={(e) => set((x) => { x.company.name = e.target.value; })} /></Field>
          <Field label="Line under the name"><Input value={s.company.sub} onChange={(e) => set((x) => { x.company.sub = e.target.value; })} /></Field>
          <Field label="Address"><Input value={s.company.address} onChange={(e) => set((x) => { x.company.address = e.target.value; })} /></Field>
          <Field label="Phone / email"><Input value={s.company.contact} onChange={(e) => set((x) => { x.company.contact = e.target.value; })} /></Field>
        </Group>
        <Group title="Crew positions on invoices" open>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Owner shows as"><Input value={s.ownerPosition} onChange={(e) => set((x) => { x.ownerPosition = e.target.value; })} /></Field>
            <Field label="Everyone else, unless set below"><Input value={s.defaultPosition} onChange={(e) => set((x) => { x.defaultPosition = e.target.value; })} /></Field>
          </div>
          {workers.map((w) => (
            <div key={w.name} className="flex items-center gap-2">
              <span className="w-32 truncate text-sm text-neutral-300">{w.name}</span>
              <Input className="flex-1" value={s.positions[w.name] ?? ""} placeholder={w.is_owner ? s.ownerPosition : s.defaultPosition}
                onChange={(e) => set((x) => { if (e.target.value) x.positions[w.name] = e.target.value; else delete x.positions[w.name]; })} />
            </div>
          ))}
        </Group>
        <Group title="Invoice defaults">
          <Field label="Labor detail"><Segmented value={s.invoice.detail} onChange={(v) => set((x) => { x.invoice.detail = v as Detail; })} options={[{ value: "day", label: "By day" }, { value: "position", label: "By position" }, { value: "total", label: "One line" }]} /></Field>
          <Field label="Materials"><Segmented value={s.invoice.materials} onChange={(v) => set((x) => { x.invoice.materials = v as MatMode; })} options={[{ value: "itemized", label: "Itemized" }, { value: "single", label: "One line" }]} /></Field>
          <Toggle label="Show clock times" checked={s.invoice.clock} onChange={(v) => set((x) => { x.invoice.clock = v; })} />
          <Field label="Days until due"><Input inputMode="numeric" value={s.invoice.dueDays} onChange={(e) => set((x) => { x.invoice.dueDays = Number(e.target.value) || 0; })} /></Field>
          <Field label="Payment instructions ({due} and {number} fill in)"><Textarea rows={4} value={s.invoice.payText} onChange={(e) => set((x) => { x.invoice.payText = e.target.value; })} /></Field>
          <Field label="Closing line"><Input value={s.invoice.closing} onChange={(e) => set((x) => { x.invoice.closing = e.target.value; })} /></Field>
        </Group>
        <Group title="Proposal defaults">
          <Field label="Text after the date"><Input value={s.proposalValid} onChange={(e) => set((x) => { x.proposalValid = e.target.value; })} /></Field>
          {s.proposalTerms.map((t, i) => (
            <div key={t.id} className="space-y-2 rounded-xl border border-white/[0.06] p-3">
              <div className="flex gap-1">
                <Input className="flex-1" value={t.title} onChange={(e) => set((x) => { x.proposalTerms[i].title = e.target.value; })} />
                <Button size="icon" variant="ghost" onClick={() => set((x) => { moveIn(x.proposalTerms, i, -1); })}><ArrowUp size={15} /></Button>
                <Button size="icon" variant="ghost" onClick={() => set((x) => { x.proposalTerms.splice(i, 1); })}><X size={15} /></Button>
              </div>
              <Textarea rows={3} value={t.body} onChange={(e) => set((x) => { x.proposalTerms[i].body = e.target.value; })} />
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => set((x) => { x.proposalTerms.push({ id: uid(), title: "New clause", body: "" }); })}><Plus size={14} className="mr-1" />Clause</Button>
        </Group>
      </div>
    </div></Layer>
  );
}
