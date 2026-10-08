"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/format";

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

const inp =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-neutral-400 focus:outline-none";
const lbl = "block text-sm font-semibold text-neutral-300 mb-1";
const btn =
  "rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-500";
const btnPrimary =
  "rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-neutral-900 hover:bg-neutral-200 disabled:opacity-40";
const card = "rounded-xl bg-white/[0.05] p-3.5";
const chip = (on: boolean) =>
  `rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${on ? "border-neutral-300 bg-neutral-800 text-white" : "border-neutral-700 bg-neutral-900 text-neutral-400"}`;

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "New — review", cls: "bg-sky-500/15 text-sky-300" },
  updated: { label: "Updated — review", cls: "bg-sky-500/15 text-sky-300" },
  approved: { label: "Approved", cls: "bg-emerald-500/15 text-emerald-300" },
  inactive: { label: "Inactive", cls: "bg-neutral-700/50 text-neutral-400" },
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
  const [filter, setFilter] = useState<"" | "review" | "coi" | "w9">("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [upload, setUpload] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("vendor_overview").select("*").order("company");
    if (error) alert("Couldn't load vendors: " + error.message);
    setRows(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function loadDocs(id: string) {
    const { data } = await supabase
      .from("vendor_documents")
      .select("id,doc_type,file_name,mime_type,expires_at,insurer,submitted_at")
      .eq("vendor_id", id)
      .order("submitted_at", { ascending: false });
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
    if (!editing.company?.trim()) return alert("Company name is required.");
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
    if (error) return alert(error.message.includes("vendors_company_email_uq") ? "That vendor is already on the list." : "Save failed: " + error.message);
    setEditing(null); load();
  }

  async function setStatus(v: any, status: string) {
    const { error } = await supabase.from("vendors").update({ status, updated_at: new Date().toISOString() }).eq("id", v.id);
    if (error) return alert(error.message);
    load();
  }

  async function remove(v: any) {
    if (!confirm(`Delete ${v.company} and all of its documents?`)) return;
    const { error } = await supabase.from("vendors").delete().eq("id", v.id);
    if (error) return alert(error.message);
    setOpenId(null); load();
  }

  async function saveUpload(v: any) {
    if (!upload?.file_b64) return alert("Attach the file first.");
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
    if (error) return alert("Upload failed: " + error.message);
    setUpload(null); loadDocs(v.id); load();
  }

  async function view(d: any) {
    const w = window.open();
    if (!w) return alert("Allow pop-ups to view the file.");
    const { data } = await supabase.from("vendor_documents").select("file_b64,mime_type").eq("id", d.id).maybeSingle();
    if (!data?.file_b64) { w.close(); return alert("File not found."); }
    w.document.write(
      data.mime_type?.startsWith("image/")
        ? `<img src="${data.file_b64}" style="max-width:100%">`
        : `<iframe src="${data.file_b64}" style="border:0;width:100%;height:100vh"></iframe>`
    );
  }

  async function removeDoc(v: any, d: any) {
    if (!confirm(`Delete this ${d.doc_type.toUpperCase()}?`)) return;
    await supabase.from("vendor_documents").delete().eq("id", d.id);
    loadDocs(v.id); load();
  }

  async function copyLink() {
    const url = `${window.location.origin}/vendor-submit`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { prompt("Copy this link:", url); }
  }

  if (loading) return <div className="space-y-2" aria-busy="true"><div className="skeleton h-16" /><div className="skeleton h-16" /><div className="skeleton h-16" /></div>;

  return (
    <div className="pb-28 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">Vendors</h1>
          <p className="text-xs text-neutral-400">Subs & suppliers — COIs and W-9s</p>
        </div>
        <div className="flex gap-2">
          <button onClick={copyLink} className={btn}>{copied ? "Link copied ✓" : "Copy upload link"}</button>
          <button onClick={() => { setOpenId(null); setEditing({ status: "approved" }); }} className={btnPrimary}>＋ Add</button>
        </div>
      </div>

      {rows.length ? (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => setFilter(filter === "review" ? "" : "review")} className={card + " text-left"}>
            <div className={`text-xl font-bold ${counts.review ? "text-sky-300" : "text-white"}`}>{counts.review}</div>
            <div className="text-xs text-neutral-400">To review</div>
          </button>
          <button onClick={() => setFilter(filter === "coi" ? "" : "coi")} className={card + " text-left"}>
            <div className={`text-xl font-bold ${counts.coi ? "text-red-400" : "text-white"}`}>{counts.coi}</div>
            <div className="text-xs text-neutral-400">COI problems</div>
          </button>
          <button onClick={() => setFilter(filter === "w9" ? "" : "w9")} className={card + " text-left"}>
            <div className={`text-xl font-bold ${counts.w9 ? "text-amber-300" : "text-white"}`}>{counts.w9}</div>
            <div className="text-xs text-neutral-400">Missing W-9</div>
          </button>
        </div>
      ) : null}

      {editing ? (
        <div className={card + " space-y-3"}>
          <div className="text-sm font-semibold text-white">{editing.id ? "Edit vendor" : "New vendor"}</div>
          <div><label className={lbl}>Company</label><input className={inp} value={editing.company ?? ""} onChange={(e) => setEditing({ ...editing, company: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Contact</label><input className={inp} value={editing.contact_name ?? ""} onChange={(e) => setEditing({ ...editing, contact_name: e.target.value })} /></div>
            <div><label className={lbl}>Trade</label><input className={inp} value={editing.trade ?? ""} placeholder="Concrete finishing, supplier…" onChange={(e) => setEditing({ ...editing, trade: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Phone</label><input className={inp} type="tel" value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
            <div><label className={lbl}>Email</label><input className={inp} type="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
          </div>
          <div><label className={lbl}>Address</label><input className={inp} value={editing.address ?? ""} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
          <div><label className={lbl}>Notes</label><textarea className={inp} rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
          <div>
            <label className={lbl}>Status</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(STATUS).map(([k, s]) => (
                <button key={k} onClick={() => setEditing({ ...editing, status: k })} className={chip(editing.status === k)}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className={btnPrimary + " flex-1"}>{busy ? "Saving…" : "Save"}</button>
            <button onClick={() => setEditing(null)} className={btn}>Cancel</button>
          </div>
        </div>
      ) : null}

      {rows.length ? (
        <div className="space-y-2">
          <input className={inp} placeholder="Search company, contact, trade…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilter("")} className={chip(!filter)}>All {rows.length}</button>
            <button onClick={() => setFilter("review")} className={chip(filter === "review")}>To review {counts.review}</button>
            <button onClick={() => setFilter("coi")} className={chip(filter === "coi")}>COI problems {counts.coi}</button>
            <button onClick={() => setFilter("w9")} className={chip(filter === "w9")}>Missing W-9 {counts.w9}</button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {shown.map((v) => {
          const c = coiState(v);
          const st = STATUS[v.status] ?? { label: v.status, cls: "bg-neutral-700/50 text-neutral-300" };
          const open = openId === v.id;
          return (
            <div key={v.id} className={card + " space-y-2"}>
              <button onClick={() => toggle(v)} className="w-full text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{v.company}</div>
                    <div className="text-xs text-neutral-400 truncate">{[v.trade, v.contact_name].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-semibold">
                  <span className={c.cls}>{c.text}</span>
                  <span className={v.w9_id ? "text-emerald-400" : "text-amber-300"}>{v.w9_id ? "W-9 on file" : "No W-9"}</span>
                </div>
              </button>

              {open ? (
                <div className="space-y-3 border-t border-neutral-800 pt-3">
                  <div className="space-y-0.5 text-sm text-neutral-300">
                    {v.phone ? <div><a className="underline decoration-neutral-600" href={`tel:${v.phone}`}>{v.phone}</a></div> : null}
                    {v.email ? <div><a className="underline decoration-neutral-600" href={`mailto:${v.email}`}>{v.email}</a></div> : null}
                    {v.address ? <div className="text-neutral-400">{v.address}</div> : null}
                    {v.coi_insurer ? <div className="text-neutral-400">Insurer: {v.coi_insurer}</div> : null}
                    {v.notes ? <div className="text-neutral-400 whitespace-pre-wrap">{v.notes}</div> : null}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {needsReview(v) ? <button onClick={() => setStatus(v, "approved")} className={btn + " border-emerald-700 text-emerald-300"}>Mark approved</button> : null}
                    <button onClick={() => { setOpenId(null); setEditing({ ...v }); }} className={btn}>Edit</button>
                    <button onClick={() => setUpload({ doc_type: "coi" })} className={btn}>＋ COI</button>
                    <button onClick={() => setUpload({ doc_type: "w9" })} className={btn}>＋ W-9</button>
                    <button onClick={() => setUpload({ doc_type: "other" })} className={btn}>＋ Other</button>
                    {v.status !== "inactive"
                      ? <button onClick={() => setStatus(v, "inactive")} className={btn}>Set inactive</button>
                      : <button onClick={() => setStatus(v, "approved")} className={btn}>Reactivate</button>}
                    <button onClick={() => remove(v)} className="px-2 text-sm text-neutral-500 hover:text-red-400">Delete</button>
                  </div>

                  {upload ? (
                    <div className="rounded-lg border border-neutral-800 p-3 space-y-2">
                      <div className="text-sm font-semibold text-white">Add {upload.doc_type === "coi" ? "COI" : upload.doc_type === "w9" ? "W-9" : "document"}</div>
                      {upload.doc_type === "coi" ? (
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className={lbl}>Expires</label><input type="date" className={inp} value={upload.expires_at ?? ""} onChange={(e) => setUpload({ ...upload, expires_at: e.target.value })} /></div>
                          <div><label className={lbl}>Insurer</label><input className={inp} value={upload.insurer ?? ""} onChange={(e) => setUpload({ ...upload, insurer: e.target.value })} /></div>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <label className={btn + " cursor-pointer"}>
                          Attach file or photo
                          <input type="file" accept="image/*,application/pdf" className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0]; e.currentTarget.value = "";
                              if (!f) return;
                              if (f.size > 8_000_000) return alert("That file is over 8 MB — take a photo of it instead.");
                              const b64 = await readFile(f);
                              setUpload((u: any) => ({ ...u, file_b64: b64, file_name: f.name, mime_type: f.type }));
                            }} />
                        </label>
                        {upload.file_b64 ? <span className="truncate text-xs text-emerald-400">{upload.file_name} ✓</span> : null}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveUpload(v)} disabled={busy || !upload.file_b64} className={btnPrimary + " flex-1"}>{busy ? "Saving…" : "Save document"}</button>
                        <button onClick={() => setUpload(null)} className={btn}>Cancel</button>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Documents</div>
                    {docs.length === 0 ? <div className="text-xs text-neutral-500">None on file.</div> : null}
                    {docs.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <span className="font-semibold text-neutral-200">{d.doc_type === "coi" ? "COI" : d.doc_type === "w9" ? "W-9" : "Other"}</span>
                          <span className="text-neutral-400"> · {fmtDate(d.submitted_at?.slice(0, 10))}{d.expires_at ? ` · exp ${fmtDate(d.expires_at)}` : ""}</span>
                          {d.file_name ? <div className="truncate text-xs text-neutral-500">{d.file_name}</div> : null}
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button onClick={() => view(d)} className={btn}>View</button>
                          <button onClick={() => removeDoc(v, d)} className="px-1 text-sm text-neutral-500 hover:text-red-400">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {rows.length && shown.length === 0 ? <div className="text-sm text-neutral-500">Nothing matches.</div> : null}

        {rows.length === 0 && !editing ? (
          <div className={card}>
            <div className="text-sm font-semibold text-white">No vendors yet.</div>
            <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
              Add the subs you use, or text them the upload link — they fill in their info and attach
              their COI and W-9 themselves, and it shows up here to review. A sub working uninsured on
              your job is a claim on your policy.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
