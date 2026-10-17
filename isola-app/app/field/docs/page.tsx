"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileText, Upload, Lock, Trash2, CheckCircle2 } from "lucide-react";
import { Empty } from "@/components/field/shared";
import { showToast, showError } from "@/components/Toaster";
import { ask } from "@/components/Dialogs";
import { readDocFile, openDoc, docDate } from "@/lib/docfile";

// v6.6: every crew login gets a Docs tab to upload their own W-9 (photo or PDF).
// Only they and Mike can open it — crew_doc_* RPCs are scoped to the signed-in login.
type Doc = { id: string; kind: string; file_name: string | null; mime: string; size: number | null; uploaded_at: string };

export default function FieldDocs() {
  const sb = useMemo(() => createClient(), []);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function load() {
    const { data, error } = await sb.rpc("crew_doc_list");
    if (error) { showError("Couldn't load your documents. Check your signal."); setDocs([]); return; }
    setDocs((data as Doc[]) ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const f = await readDocFile(file);
      const { data, error } = await sb.rpc("crew_doc_upload", { p_kind: "w9", p_name: f.name || "W-9", p_mime: f.mime, p_b64: f.b64 });
      if (error) throw new Error("Upload didn't go through. Check your signal and try again.");
      if (!(data as any)?.ok) throw new Error((data as any)?.error || "Upload didn't go through.");
      showToast("W-9 uploaded");
      load();
    } catch (err: any) { showError(err.message); }
    setBusy(false);
  }

  async function remove(d: Doc) {
    if (!(await ask({ title: "Remove this file?", body: "Mike won't see it anymore. You can upload a new one.", confirm: "Remove", danger: true }))) return;
    const { error } = await sb.rpc("crew_doc_delete", { p_id: d.id });
    if (error) return showError("Couldn't remove it.");
    showToast("Removed");
    load();
  }

  const w9 = (docs ?? []).filter((d) => d.kind === "w9");

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Documents</h1>
      <p className="text-sm text-neutral-400">Upload your W-9 so Mike has it for taxes.</p>

      <div className="mt-4 rounded-xl border border-white/[0.08] bg-neutral-900 p-4">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-white" />
          <span className="font-semibold text-white">W-9</span>
          {w9.length ? <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-emerald-300"><CheckCircle2 size={14} /> On file</span>
            : docs ? <span className="ml-auto text-xs font-semibold text-amber-300">Needed</span> : null}
        </div>
        <p className="mt-2 text-sm text-neutral-400">
          Take a clear photo of your filled-out, signed W-9, or upload the PDF. Make sure every number is readable.
          No blank form? Get one at irs.gov/w9.
        </p>
        <input ref={input} type="file" accept="image/*,application/pdf" className="hidden" onChange={pick} />
        <button onClick={() => input.current?.click()} disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand text-neutral-950 min-h-[52px] font-bold disabled:opacity-60">
          <Upload size={19} /> {busy ? "Uploading…" : w9.length ? "Upload a new W-9" : "Upload W-9"}
        </button>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500"><Lock size={12} /> Private — only you and Mike can see it.</p>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold text-white">Your files</h2>
        {docs === null ? <div className="h-16 rounded-xl bg-neutral-900 animate-pulse" />
          : docs.length === 0 ? <Empty title="Nothing uploaded yet" />
          : (
            <div className="divide-y divide-neutral-800 rounded-xl bg-white/[0.05]">
              {docs.map((d) => (
                <div key={d.id} className="flex items-center gap-2 px-3.5 py-2">
                  <button className="min-w-0 flex-1 text-left min-h-[44px]"
                    onClick={() => openDoc(async () => { const { data } = await sb.rpc("crew_doc_get", { p_id: d.id }); return (data as any) ?? null; })}>
                    <div className="text-sm font-semibold text-white truncate">{d.kind === "w9" ? "W-9" : "Document"} · {d.file_name || "file"}</div>
                    <div className="text-xs text-neutral-400">Uploaded {docDate(d.uploaded_at)} · tap to view</div>
                  </button>
                  <button onClick={() => remove(d)} aria-label="Remove" className="shrink-0 rounded-lg p-2.5 text-neutral-400 hover:text-red-300"><Trash2 size={17} /></button>
                </div>
              ))}
            </div>
          )}
      </section>
    </div>
  );
}
