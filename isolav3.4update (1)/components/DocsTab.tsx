"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, todayISO } from "@/lib/format";

/* ============================================================
   COMPLIANCE VAULT — COIs, W-9s, lien waivers, permits, contracts,
   warranties, licenses.

   The point of this screen is expires_at. A property manager asking
   for a current certificate of insurance and getting an expired one
   is how a repeat account goes quiet. Anything inside 60 days shows
   up at the top in amber; anything past due shows red.
   ============================================================ */

const inp =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-400 focus:outline-none";
const lbl = "block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1";
const btn =
  "rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-500";
const btnPrimary =
  "rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-neutral-900 hover:bg-neutral-200 disabled:opacity-40";
const card = "rounded-xl border border-neutral-800 bg-neutral-950 p-3.5";

const TYPES: { key: string; label: string; icon: string; hint: string }[] = [
  { key: "coi", label: "Insurance (COI)", icon: "🛡️", hint: "Certificate of insurance — the one PMs ask for" },
  { key: "lien_waiver", label: "Lien waiver", icon: "✍️", hint: "Partial or final, signed at payment" },
  { key: "permit", label: "Permit", icon: "📋", hint: "Per town — proposals say permits are not included" },
  { key: "contract", label: "Signed contract", icon: "📄", hint: "Executed proposal or agreement" },
  { key: "w9", label: "W-9", icon: "🧾", hint: "Yours, or a sub's for 1099 season" },
  { key: "warranty", label: "Warranty", icon: "🔧", hint: "What's covered and until when" },
  { key: "license", label: "License", icon: "🎫", hint: "RI / MA contractor registration" },
  { key: "other", label: "Other", icon: "📎", hint: "" },
];

export default function DocsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [docs, setDocs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [editing, setEditing] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [d, c, j] = await Promise.all([
      // never select * — file_b64 would ship every document on load
      supabase.from("documents")
        .select("id,doc_type,title,customer_id,job_id,issuer,reference,issued_on,expires_at,amount,mime_type,notes,created_at")
        .order("expires_at", { ascending: true, nullsFirst: false }),
      supabase.from("customers").select("id,name").eq("archived", false).order("name"),
      supabase.from("jobs").select("id,job_name,customer").order("created_at", { ascending: false }).limit(60),
    ]);
    setDocs(d.data ?? []);
    setCustomers(c.data ?? []);
    setJobs(j.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const custById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c.name])), [customers]);
  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j.job_name])), [jobs]);

  const daysLeft = (d: any) => d.expires_at ? Math.floor((new Date(d.expires_at).getTime() - Date.now()) / 86400000) : null;
  const expiring = docs.filter((d) => { const n = daysLeft(d); return n !== null && n <= 60; });
  const shown = filter ? docs.filter((d) => d.doc_type === filter) : docs;

  async function save() {
    if (!editing.title?.trim()) return alert("Give it a title.");
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
    if (error) return alert("Save failed: " + error.message);
    setEditing(null); load();
  }

  async function attach(file: File) {
    if (file.size > 4_000_000) return alert("That file is over 4 MB — take a photo of it instead, or shrink it first.");
    const b64: string = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    setEditing((e: any) => ({ ...e, file_b64: b64, mime_type: file.type }));
  }

  async function view(d: any) {
    const { data } = await supabase.from("documents").select("file_b64,mime_type").eq("id", d.id).maybeSingle();
    if (!data?.file_b64) return alert("No file attached to this record.");
    const w = window.open();
    if (!w) return alert("Allow pop-ups to view the file.");
    w.document.write(
      data.mime_type?.startsWith("image/")
        ? `<img src="${data.file_b64}" style="max-width:100%">`
        : `<iframe src="${data.file_b64}" style="border:0;width:100%;height:100vh"></iframe>`
    );
  }

  async function remove(d: any) {
    if (!confirm(`Delete "${d.title}"?`)) return;
    await supabase.from("documents").delete().eq("id", d.id);
    load();
  }

  if (loading) return <div className="p-4 text-sm text-neutral-500">Loading…</div>;

  return (
    <div className="pb-28 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">Documents</h1>
          <p className="text-xs text-neutral-500">Insurance, waivers, permits, contracts</p>
        </div>
        <button onClick={() => setEditing({ doc_type: "coi", issued_on: todayISO() })} className={btnPrimary}>＋ Add</button>
      </div>

      {expiring.length ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300">Expiring or expired</div>
          {expiring.map((d) => {
            const n = daysLeft(d)!;
            return (
              <div key={d.id} className="flex justify-between gap-2 text-sm">
                <span className="text-neutral-200 truncate">{d.title}</span>
                <span className={`shrink-0 font-semibold ${n < 0 ? "text-red-400" : "text-amber-300"}`}>
                  {n < 0 ? `expired ${Math.abs(n)}d ago` : `${n}d left`}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {editing ? (
        <div className={card + " space-y-3"}>
          <div>
            <label className={lbl}>Type</label>
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t) => (
                <button key={t.key} onClick={() => setEditing({ ...editing, doc_type: t.key })}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${editing.doc_type === t.key ? "border-neutral-300 bg-neutral-800 text-white" : "border-neutral-700 bg-neutral-900 text-neutral-400"}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            {TYPES.find((t) => t.key === editing.doc_type)?.hint ? (
              <p className="mt-1 text-[11px] text-neutral-600">{TYPES.find((t) => t.key === editing.doc_type)?.hint}</p>
            ) : null}
          </div>

          <div><label className={lbl}>Title</label><input className={inp} value={editing.title ?? ""} placeholder="General liability — Acadia 2026" onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>

          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Issuer</label><input className={inp} value={editing.issuer ?? ""} placeholder="Carrier, town, sub" onChange={(e) => setEditing({ ...editing, issuer: e.target.value })} /></div>
            <div><label className={lbl}>Reference no.</label><input className={inp} value={editing.reference ?? ""} onChange={(e) => setEditing({ ...editing, reference: e.target.value })} /></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Issued</label><input type="date" className={inp} value={editing.issued_on ?? ""} onChange={(e) => setEditing({ ...editing, issued_on: e.target.value })} /></div>
            <div><label className={lbl}>Expires</label><input type="date" className={inp} value={editing.expires_at ?? ""} onChange={(e) => setEditing({ ...editing, expires_at: e.target.value })} /></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Customer</label>
              <select className={inp} value={editing.customer_id ?? ""} onChange={(e) => setEditing({ ...editing, customer_id: e.target.value })}>
                <option value="">—</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Job</label>
              <select className={inp} value={editing.job_id ?? ""} onChange={(e) => setEditing({ ...editing, job_id: e.target.value })}>
                <option value="">—</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.job_name || j.customer}</option>)}
              </select>
            </div>
          </div>

          <div><label className={lbl}>Amount — coverage limit or fee</label><input type="number" inputMode="decimal" className={inp} value={editing.amount ?? ""} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} /></div>

          <div className="flex items-center gap-2">
            <label className={btn + " cursor-pointer"}>
              📎 Attach file or photo
              <input type="file" accept="image/*,application/pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); e.currentTarget.value = ""; }} />
            </label>
            {editing.file_b64 ? <span className="text-[11px] text-emerald-400">attached ✓</span> : null}
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className={btnPrimary + " flex-1"}>{busy ? "Saving…" : "Save"}</button>
            <button onClick={() => setEditing(null)} className={btn}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setFilter("")} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${!filter ? "border-neutral-300 bg-neutral-800 text-white" : "border-neutral-700 bg-neutral-900 text-neutral-400"}`}>
          All {docs.length}
        </button>
        {TYPES.map((t) => {
          const n = docs.filter((d) => d.doc_type === t.key).length;
          if (!n) return null;
          return (
            <button key={t.key} onClick={() => setFilter(filter === t.key ? "" : t.key)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${filter === t.key ? "border-neutral-300 bg-neutral-800 text-white" : "border-neutral-700 bg-neutral-900 text-neutral-400"}`}>
              {t.icon} {t.label} {n}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {shown.map((d) => {
          const n = daysLeft(d);
          const t = TYPES.find((x) => x.key === d.doc_type);
          return (
            <div key={d.id} className={card + " space-y-1"}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{t?.icon} {d.title}</div>
                  <div className="text-[11px] text-neutral-500 truncate">
                    {[d.issuer, d.reference, d.customer_id ? custById[d.customer_id] : null, d.job_id ? jobById[d.job_id] : null].filter(Boolean).join(" · ") || t?.label}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => view(d)} className={btn}>View</button>
                  <button onClick={() => setEditing({ ...d, amount: d.amount ?? "" })} className={btn}>Edit</button>
                  <button onClick={() => remove(d)} className="text-neutral-600 hover:text-red-400 text-sm px-1">✕</button>
                </div>
              </div>
              <div className="text-[11px] text-neutral-500">
                {d.issued_on ? `Issued ${fmtDate(d.issued_on)}` : ""}
                {d.expires_at ? ` · Expires ${fmtDate(d.expires_at)}` : ""}
                {n !== null ? <span className={n < 0 ? " text-red-400 font-semibold" : n <= 60 ? " text-amber-300 font-semibold" : ""}>{n < 0 ? ` — expired` : n <= 60 ? ` — ${n} days` : ""}</span> : null}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && !editing ? (
          <div className={card}>
            <div className="text-sm font-semibold text-white">Nothing filed yet.</div>
            <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
              Start with your general liability COI and your RI registration. Those two get asked for
              most, and having them a tap away is the difference between answering a property manager
              today and answering them Monday.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
