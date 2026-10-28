"use client";
// v8.1 (10/28/26) Plans: drawing sheets for a job with pins (Fieldwire-style).
// Upload a PDF (every page becomes a sheet) or a photo of a drawing. Tap "Drop pin", then tap the
// sheet: the pin is a task, note, photo or RFI. A new revision of a sheet carries its open pins
// forward; "Compare" fades the previous revision over the current one.
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError, showToast } from "@/components/Toaster";
import { ask } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { Input, Textarea, NativeSelect, Field } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Empty } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { photoToJpeg, pdfToJpegs, isPdf } from "@/lib/fieldFiles";
import { Upload, MapPin, Plus, Minus, Layers, Check, Trash2, RotateCcw, Camera, FileQuestion, ChevronDown } from "lucide-react";

type Sheet = { id: string; sheet_key: string; title: string | null; revision: number; is_current: boolean; created_at: string; revision_note: string | null; width: number | null; height: number | null };
type Pin = { id: string; sheet_id: string; x: number; y: number; kind: string; title: string; body: string | null; status: string; rfi_id: string | null; created_at: string };

const KIND: Record<string, { label: string; cls: string }> = {
  task: { label: "Task", cls: "bg-amber-400 text-neutral-950" },
  note: { label: "Note", cls: "bg-sky-400 text-neutral-950" },
  photo: { label: "Photo", cls: "bg-violet-400 text-neutral-950" },
  rfi: { label: "RFI", cls: "bg-red-500 text-white" },
};

export default function PlansPanel({ jobId, onRfi }: { jobId: string; onRfi?: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [curKey, setCurKey] = useState<string | null>(null);
  const [img, setImg] = useState<Record<string, string>>({}); // sheet id -> data url
  const [zoom, setZoom] = useState(1);
  const [dropping, setDropping] = useState(false);
  const [compare, setCompare] = useState(false);
  const [fade, setFade] = useState(50);
  const [upload, setUpload] = useState<{ files: File[]; key: string; title: string; asRevisionOf: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinEdit, setPinEdit] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [s, p] = await Promise.all([
      sb.from("plan_sheets").select("id,sheet_key,title,revision,is_current,created_at,revision_note,width,height").eq("job_id", jobId).order("sheet_key").order("revision"),
      sb.from("plan_pins").select("id,sheet_id,x,y,kind,title,body,status,rfi_id,created_at").eq("job_id", jobId).order("created_at"),
    ]);
    if (s.error) { showError("Couldn't load plans: " + s.error.message); setSheets([]); return; }
    setSheets(s.data as Sheet[]);
    setPins((p.data ?? []) as Pin[]);
    setCurKey((k) => k ?? (s.data as Sheet[]).find((x) => x.is_current)?.sheet_key ?? null);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);

  const current = useMemo(() => (sheets ?? []).filter((s) => s.is_current), [sheets]);
  const sheet = current.find((s) => s.sheet_key === curKey) ?? current[0] ?? null;
  const prev = sheet ? (sheets ?? []).filter((s) => s.sheet_key === sheet.sheet_key && s.revision < sheet.revision).sort((a, b) => b.revision - a.revision)[0] ?? null : null;
  const sheetPins = sheet ? pins.filter((p) => p.sheet_id === sheet.id) : [];
  const ordered = [...sheetPins.filter((p) => p.status === "open"), ...sheetPins.filter((p) => p.status !== "open")];
  const numOf = (p: Pin) => ordered.indexOf(p) + 1;

  async function ensureImg(id: string) {
    if (img[id]) return;
    const { data, error } = await sb.from("plan_sheets").select("image_b64").eq("id", id).maybeSingle();
    if (error || !data) return showError("Couldn't open that sheet.");
    setImg((m) => ({ ...m, [id]: data.image_b64 }));
  }
  useEffect(() => { if (sheet) ensureImg(sheet.id); /* eslint-disable-next-line */ }, [sheet?.id]);
  useEffect(() => { if (compare && prev) ensureImg(prev.id); /* eslint-disable-next-line */ }, [compare, prev?.id]);

  function pickFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const base = files[0].name.replace(/\.[^.]+$/, "");
    setUpload({ files, key: base, title: "", asRevisionOf: "", note: "" });
  }

  async function saveUpload() {
    if (!upload) return;
    setBusy(true);
    try {
      // every PDF page / photo becomes one image
      const pages: { dataUrl: string; width: number; height: number }[] = [];
      for (const f of upload.files) {
        if (isPdf(f)) pages.push(...(await pdfToJpegs(f)));
        else pages.push(await photoToJpeg(f, 2400, 0.75));
      }
      if (!pages.length) throw new Error("Nothing to upload.");
      if (upload.asRevisionOf) {
        // new revision of an existing sheet (first page only), open pins carry forward
        const old = current.find((s) => s.sheet_key === upload.asRevisionOf)!;
        const pg = pages[0];
        const { data: made, error } = await sb.from("plan_sheets").insert({
          job_id: jobId, sheet_key: old.sheet_key, title: old.title, revision: old.revision + 1, revision_note: upload.note.trim() || null,
          image_b64: pg.dataUrl, width: pg.width, height: pg.height, file_name: upload.files[0].name, is_current: true,
        }).select("id").single();
        if (error) throw new Error(error.message);
        await sb.from("plan_sheets").update({ is_current: false }).eq("id", old.id);
        await sb.from("plan_pins").update({ sheet_id: made.id }).eq("sheet_id", old.id).eq("status", "open");
        setCurKey(old.sheet_key);
        showToast(`${old.sheet_key} is now rev ${old.revision + 1}`);
      } else {
        const key = upload.key.trim() || "Sheet";
        const taken = new Set(current.map((s) => s.sheet_key.toLowerCase()));
        let first: string | null = null;
        for (let i = 0; i < pages.length; i++) {
          let k = pages.length > 1 ? `${key} p${i + 1}` : key;
          let n = 2; while (taken.has(k.toLowerCase())) k = `${pages.length > 1 ? `${key} p${i + 1}` : key} (${n++})`;
          taken.add(k.toLowerCase());
          const pg = pages[i];
          const { error } = await sb.from("plan_sheets").insert({
            job_id: jobId, sheet_key: k, title: upload.title.trim() || null, revision: 0,
            image_b64: pg.dataUrl, width: pg.width, height: pg.height, file_name: upload.files[0].name, is_current: true,
          });
          if (error) throw new Error(error.message);
          first = first ?? k;
        }
        setCurKey(first);
        showToast(pages.length > 1 ? `${pages.length} sheets added` : "Sheet added");
      }
      setUpload(null);
      await load();
    } catch (e: any) {
      showError("Upload failed: " + (e?.message ?? String(e)));
    } finally { setBusy(false); }
  }

  function tapSheet(e: React.MouseEvent<HTMLDivElement>) {
    if (!dropping || !sheet) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setDropping(false);
    setPinEdit({ x, y, kind: "task", title: "", body: "", photo: "" });
  }

  async function savePin() {
    const p = pinEdit;
    if (!p.title?.trim()) return showError("Give the pin a short title.");
    setBusy(true);
    try {
      if (p.id) {
        const { error } = await sb.from("plan_pins").update({ title: p.title.trim(), body: p.body?.trim() || null, kind: p.kind, ...(p.photo ? { photo_b64: p.photo } : {}) }).eq("id", p.id);
        if (error) throw new Error(error.message);
      } else {
        let rfiId: string | null = null;
        if (p.kind === "rfi") {
          // an RFI pin opens a real RFI with the next number on this job
          const { data: last } = await sb.from("rfis").select("number").eq("job_id", jobId).order("number", { ascending: false }).limit(1);
          const number = (last?.[0]?.number ?? 0) + 1;
          const { data: rfi, error } = await sb.from("rfis").insert({ job_id: jobId, number, subject: p.title.trim(), question: p.body?.trim() || null, status: "draft", photo_b64: p.photo || null }).select("id").single();
          if (error) throw new Error(error.message);
          rfiId = rfi.id;
        }
        const { data: pin, error } = await sb.from("plan_pins").insert({
          job_id: jobId, sheet_id: sheet!.id, x: p.x, y: p.y, kind: p.kind, title: p.title.trim(), body: p.body?.trim() || null, photo_b64: p.photo || null, rfi_id: rfiId,
        }).select("id").single();
        if (error) throw new Error(error.message);
        if (rfiId) { await sb.from("rfis").update({ pin_id: pin.id }).eq("id", rfiId); showToast("Pin dropped — RFI drafted"); onRfi?.(); }
        else showToast("Pin dropped");
      }
      setPinEdit(null); load();
    } catch (e: any) { showError("Save failed: " + (e?.message ?? String(e))); }
    finally { setBusy(false); }
  }

  async function openPin(p: Pin) {
    setPinEdit({ ...p, photo: "" });
    const { data } = await sb.from("plan_pins").select("photo_b64").eq("id", p.id).maybeSingle();
    if (data?.photo_b64) setPinEdit((cur: any) => (cur?.id === p.id ? { ...cur, photoView: data.photo_b64 } : cur));
  }
  async function toggleDone(p: any) {
    const open = p.status === "open";
    const { error } = await sb.from("plan_pins").update({ status: open ? "done" : "open", done_at: open ? new Date().toISOString() : null }).eq("id", p.id);
    if (error) return showError(error.message);
    showToast(open ? "Marked done" : "Reopened"); setPinEdit(null); load();
  }
  async function deletePin(p: any) {
    if (!(await ask({ title: "Delete this pin?", body: p.rfi_id ? "The RFI it opened stays in the RFI log." : "This can't be undone.", confirm: "Delete", danger: true }))) return;
    const { error } = await sb.from("plan_pins").delete().eq("id", p.id);
    if (error) return showError(error.message);
    setPinEdit(null); load();
  }
  async function deleteSheet(s: Sheet) {
    if (!(await ask({ title: `Delete ${s.sheet_key} rev ${s.revision}?`, body: "Its pins go with it. Older revisions stay.", confirm: "Delete", danger: true }))) return;
    const { error } = await sb.from("plan_sheets").delete().eq("id", s.id);
    if (error) return showError(error.message);
    if (prev) await sb.from("plan_sheets").update({ is_current: true }).eq("id", prev.id);
    setCurKey(prev ? s.sheet_key : null); load();
  }

  if (sheets === null) return <div className="skeleton h-48" />;

  const fileInput = (
    <input ref={fileRef} type="file" multiple accept="application/pdf,image/*" className="hidden"
      onChange={(e) => { pickFiles(e.target.files); e.currentTarget.value = ""; }} />
  );

  return (
    <div className="space-y-3">
      {fileInput}
      {current.length === 0 ? (
        <Empty icon={<Layers size={28} />} title="No plans on this job yet."
          body="Upload the drawing set (PDF) or snap a photo of a plan. Every page becomes a sheet you can drop pins on."
          action={<Button onClick={() => fileRef.current?.click()}><Upload size={16} /> Upload plans</Button>} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <NativeSelect value={sheet?.sheet_key ?? ""} onChange={(e) => { setCurKey(e.target.value); setCompare(false); setZoom(1); }} className="pr-8">
                {current.map((s) => {
                  const open = pins.filter((p) => p.sheet_id === s.id && p.status === "open").length;
                  return <option key={s.id} value={s.sheet_key}>{s.sheet_key}{s.title ? ` — ${s.title}` : ""} · rev {s.revision}{open ? ` · ${open} open` : ""}</option>;
                })}
              </NativeSelect>
            </div>
            <Button variant="outline" size="sm" className="h-10" onClick={() => fileRef.current?.click()}><Upload size={15} /> Upload</Button>
          </div>

          {sheet ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" className="h-9" variant={dropping ? "default" : "outline"} onClick={() => setDropping(!dropping)}>
                  <MapPin size={15} /> {dropping ? "Tap the sheet…" : "Drop pin"}
                </Button>
                <Button size="icon-sm" variant="outline" className="h-9 w-9" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.5))}><Minus size={15} /></Button>
                <span className="w-10 text-center text-xs tabular-nums text-neutral-400">{Math.round(zoom * 100)}%</span>
                <Button size="icon-sm" variant="outline" className="h-9 w-9" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.5))}><Plus size={15} /></Button>
                {prev ? <Button size="sm" className="h-9" variant={compare ? "default" : "outline"} onClick={() => setCompare(!compare)}><Layers size={15} /> Compare rev {prev.revision}</Button> : null}
                <Button size="sm" variant="ghost" className="ml-auto h-9 text-neutral-500" onClick={() => deleteSheet(sheet)} aria-label="Delete sheet"><Trash2 size={15} /></Button>
              </div>
              {compare && prev ? (
                <div className="flex items-center gap-3 text-xs text-neutral-400">
                  <span>Rev {sheet.revision}</span>
                  <input type="range" min={0} max={100} step={1} value={fade} onChange={(e) => setFade(Number(e.target.value))} className="flex-1" aria-label="Fade between revisions" />
                  <span>Rev {prev.revision}</span>
                </div>
              ) : null}
              {sheet.revision_note ? <p className="text-xs text-neutral-400">Rev {sheet.revision}: {sheet.revision_note}</p> : null}

              <div className="overflow-auto rounded-xl border border-border bg-white" style={{ maxHeight: "70vh" }}>
                <div className={cn("relative", dropping && "cursor-crosshair")} style={{ width: `${zoom * 100}%` }} onClick={tapSheet}>
                  {img[sheet.id] ? <img src={img[sheet.id]} alt={sheet.sheet_key} className="block w-full select-none" draggable={false} />
                    : <div className="skeleton" style={{ aspectRatio: `${sheet.width || 11} / ${sheet.height || 8.5}` }} />}
                  {compare && prev && img[prev.id] ? <img src={img[prev.id]} alt="" className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity: fade / 100, mixBlendMode: "multiply" }} /> : null}
                  {ordered.map((p) => (
                    <button key={p.id} onClick={(e) => { e.stopPropagation(); openPin(p); }}
                      className={cn("absolute flex h-7 w-7 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none border-2 border-white text-[11px] font-bold shadow-md",
                        p.status === "open" ? KIND[p.kind]?.cls : "bg-emerald-500 text-white")}
                      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} aria-label={`Pin ${numOf(p)}: ${p.title}`}>
                      {p.status === "open" ? numOf(p) : <Check size={13} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-border rounded-xl border border-border">
                {ordered.length === 0 ? <div className="px-3 py-3 text-sm text-neutral-500">No pins on this sheet. Tap “Drop pin”, then tap the spot.</div> : null}
                {ordered.map((p) => (
                  <button key={p.id} onClick={() => openPin(p)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]">
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", p.status === "open" ? KIND[p.kind]?.cls : "bg-emerald-500 text-white")}>
                      {p.status === "open" ? numOf(p) : <Check size={12} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm", p.status === "open" ? "font-medium text-white" : "text-neutral-500 line-through")}>{p.title}</span>
                      <span className="block truncate text-xs text-neutral-500">{KIND[p.kind]?.label}{p.body ? ` · ${p.body}` : ""}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}

      {/* upload dialog */}
      <Dialog open={!!upload} onOpenChange={(o) => { if (!o && !busy) setUpload(null); }}>
        {upload ? (
          <DialogContent>
            <DialogHeader><DialogTitle>Add plans</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-neutral-400">{upload.files.map((f) => f.name).join(", ")}</p>
              {current.length ? (
                <Field label="This is…">
                  <NativeSelect value={upload.asRevisionOf} onChange={(e) => setUpload({ ...upload, asRevisionOf: e.target.value })}>
                    <option value="">New sheet(s)</option>
                    {current.map((s) => <option key={s.id} value={s.sheet_key}>New revision of {s.sheet_key} (now rev {s.revision})</option>)}
                  </NativeSelect>
                </Field>
              ) : null}
              {upload.asRevisionOf ? (
                <Field label="What changed (optional)"><Input value={upload.note} placeholder="Moved catch basin 4 ft east" onChange={(e) => setUpload({ ...upload, note: e.target.value })} /></Field>
              ) : (
                <>
                  <Field label="Sheet number or name"><Input value={upload.key} placeholder="C-101" onChange={(e) => setUpload({ ...upload, key: e.target.value })} /></Field>
                  <Field label="Title (optional)"><Input value={upload.title} placeholder="Site drainage plan" onChange={(e) => setUpload({ ...upload, title: e.target.value })} /></Field>
                  <p className="text-xs text-neutral-500">A multi-page PDF becomes one sheet per page (p1, p2…).</p>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUpload(null)} disabled={busy}>Cancel</Button>
              <Button onClick={saveUpload} disabled={busy}>{busy ? "Processing…" : "Add"}</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* pin dialog */}
      <Dialog open={!!pinEdit} onOpenChange={(o) => { if (!o && !busy) setPinEdit(null); }}>
        {pinEdit ? (
          <DialogContent>
            <DialogHeader><DialogTitle>{pinEdit.id ? `Pin ${ordered.findIndex((x) => x.id === pinEdit.id) + 1}` : "New pin"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {!pinEdit.id || pinEdit.kind !== "rfi" ? (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(KIND).filter(([k]) => pinEdit.id ? k !== "rfi" : true).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => setPinEdit({ ...pinEdit, kind: k })}
                      className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold", pinEdit.kind === k ? "border-white bg-white/10 text-white" : "border-border text-neutral-400")}>
                      {k === "rfi" ? <FileQuestion size={14} /> : k === "photo" ? <Camera size={14} /> : null}{v.label}
                    </button>
                  ))}
                </div>
              ) : <p className="text-xs text-neutral-400">This pin opened an RFI. Answer it on the RFIs tab.</p>}
              <Field label="Title"><Input autoFocus={!pinEdit.id} value={pinEdit.title} placeholder={pinEdit.kind === "rfi" ? "Pipe invert doesn't match field" : "Set catch basin, check grade"} onChange={(e) => setPinEdit({ ...pinEdit, title: e.target.value })} /></Field>
              <Field label={pinEdit.kind === "rfi" ? "Question" : "Notes"}><Textarea rows={3} value={pinEdit.body ?? ""} onChange={(e) => setPinEdit({ ...pinEdit, body: e.target.value })} /></Field>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-[13px] font-semibold hover:bg-accent">
                  <Camera size={15} /> {pinEdit.photo || pinEdit.photoView ? "Replace photo" : "Add photo"}
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const f = e.target.files?.[0]; e.currentTarget.value = ""; if (!f) return;
                    const { dataUrl } = await photoToJpeg(f, 1400, 0.72); setPinEdit((cur: any) => ({ ...cur, photo: dataUrl }));
                  }} />
                </label>
              </div>
              {pinEdit.photo || pinEdit.photoView ? <img src={pinEdit.photo || pinEdit.photoView} alt="" className="max-h-56 rounded-lg border border-border" /> : null}
            </div>
            <DialogFooter className="flex-wrap gap-2">
              {pinEdit.id ? (
                <>
                  <Button variant="ghost" className="text-neutral-500" onClick={() => deletePin(pinEdit)}><Trash2 size={15} /></Button>
                  <Button variant="outline" onClick={() => toggleDone(pinEdit)}>{pinEdit.status === "open" ? <><Check size={15} /> Mark done</> : <><RotateCcw size={15} /> Reopen</>}</Button>
                </>
              ) : <Button variant="outline" onClick={() => setPinEdit(null)}>Cancel</Button>}
              <Button onClick={savePin} disabled={busy}>{busy ? "Saving…" : pinEdit.id ? "Save" : pinEdit.kind === "rfi" ? "Drop pin + draft RFI" : "Drop pin"}</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
