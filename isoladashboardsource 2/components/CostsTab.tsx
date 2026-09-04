"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Job, jobLabel, money, fmtDate, todayISO } from "@/lib/format";

const CATS = ["Materials", "Fuel", "Equipment / Rental", "Dump / Disposal", "Subcontractor", "Labor", "Permits", "Other"];
const OVERHEAD = "__overhead__";

type Cost = {
  id: string;
  job_id: string | null;
  entry_date: string;
  vendor: string | null;
  category: string | null;
  amount: number | null;
  notes: string | null;
  status: "ok" | "pending";
  by_claude: boolean;
  receipt_b64: string | null;
  worker: string | null;
  hours: number | null;
  rate: number | null;
  paid: boolean;
  created_at: string;
};

export default function CostsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [owedOnly, setOwedOnly] = useState(false);
  const [sheet, setSheet] = useState<Cost | "new" | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({});
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [j, c] = await Promise.all([
      supabase.from("jobs").select("id,job_name,customer,location,job,status").order("customer"),
      supabase.from("job_costs").select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
    ]);
    setJobs((j.data as Job[]) ?? []);
    setCosts((c.data as Cost[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // Completed jobs never show in the picker — only open work.
  const activeJobs = jobs.filter((j) => j.status !== "complete");
  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);
  const labelFor = (id: string | null) => (id && jobById[id] ? jobLabel(jobById[id]) : "Shop / Overhead");

  // Filter chips: jobs that actually have entries (incl. completed, so history stays reachable).
  const chipJobs = useMemo(() => {
    const ids = new Set(costs.map((c) => c.job_id ?? OVERHEAD));
    const list = jobs.filter((j) => ids.has(j.id));
    return { list, hasOverhead: ids.has(OVERHEAD) };
  }, [costs, jobs]);

  const shown = costs.filter((c) => (filter === "all" ? true : (c.job_id ?? OVERHEAD) === filter)).filter((c) => !owedOnly || c.paid === false);
  const owed = costs.filter((c) => c.paid === false).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const monthNow = todayISO().slice(0, 7);
  const total = shown.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const month = shown.filter((c) => (c.entry_date ?? "").slice(0, 7) === monthNow).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const pending = shown.filter((c) => c.status === "pending").length;

  const byCat = useMemo(() => {
    if (filter === "all") return null;
    const m: Record<string, number> = {};
    shown.forEach((c) => { const k = c.category ?? "Other"; m[k] = (m[k] ?? 0) + (Number(c.amount) || 0); });
    return m;
  }, [filter, costs]);

  function openSheet(c: Cost | "new", kind: "receipt" | "labor" = "receipt") {
    setSheet(c);
    setForm(c === "new"
      ? { kind, job_id: filter !== "all" && filter !== OVERHEAD ? filter : (activeJobs[0]?.id ?? OVERHEAD), entry_date: todayISO(), vendor: "", category: kind === "labor" ? "Labor" : "", amount: "", notes: "", receipt_b64: null, worker: "", hours: "", rate: "", paid: true }
      : { kind: c.hours != null || c.worker ? "labor" : "receipt", job_id: c.job_id ?? OVERHEAD, entry_date: c.entry_date, vendor: c.vendor ?? "", category: c.category ?? "", amount: c.amount ?? "", notes: c.notes ?? "", receipt_b64: c.receipt_b64, worker: c.worker ?? "", hours: c.hours ?? "", rate: c.rate ?? "", paid: c.paid !== false });
  }

  function pickPhoto(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const MAX = 1100;
      let w = img.width, h = img.height;
      if (Math.max(w, h) > MAX) { const r = MAX / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
      setForm((s: any) => ({ ...s, receipt_b64: cv.toDataURL("image/jpeg", 0.72) }));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert("Couldn't read that image — try again."); };
    img.src = url;
  }

  async function save() {
    const isLabor = form.kind === "labor";
    const hours = isLabor && String(form.hours ?? "") !== "" ? Number(String(form.hours).replace(/[^0-9.]/g, "")) : null;
    const rate = isLabor && String(form.rate ?? "") !== "" ? Number(String(form.rate).replace(/[^0-9.]/g, "")) : null;
    const amtRaw = String(form.amount ?? "").replace(/[$,\s]/g, "");
    let amount = amtRaw === "" ? null : Number(amtRaw);
    if (isLabor && amount == null && hours != null && rate != null) amount = Math.round(hours * rate * 100) / 100;
    if (amtRaw !== "" && !isFinite(amount!)) { alert("Amount doesn't look like a number."); return; }
    if (isLabor) {
      if (!String(form.worker ?? "").trim()) { alert("Who worked? Add a name."); return; }
      if (amount == null) { alert("Add hours and rate (or a total)."); return; }
    }
    const payload: any = {
      job_id: form.job_id === OVERHEAD ? null : form.job_id,
      entry_date: form.entry_date || todayISO(),
      vendor: form.vendor?.trim() || null,
      category: form.category || null,
      amount,
      notes: form.notes?.trim() || null,
      receipt_b64: form.receipt_b64 || null,
      worker: isLabor ? String(form.worker).trim() : null,
      hours,
      rate,
      paid: form.paid !== false,
      updated_at: new Date().toISOString(),
    };
    if (isLabor) { payload.category = "Labor"; payload.vendor = payload.vendor || String(form.worker).trim(); }
    payload.status = !isLabor && payload.receipt_b64 && (amount == null || !payload.vendor || !payload.category) ? "pending" : "ok";
    if (!isLabor && !payload.receipt_b64 && amount == null) { alert("Add a receipt photo or an amount."); return; }
    setBusy(true);
    const res = sheet === "new"
      ? await supabase.from("job_costs").insert(payload)
      : await supabase.from("job_costs").update(payload).eq("id", (sheet as Cost).id);
    setBusy(false);
    if (res.error) { alert("Save failed: " + res.error.message); return; }
    setSheet(null);
    load();
  }

  async function remove(c: Cost) {
    if (!confirm("Delete this cost entry?")) return;
    const { error } = await supabase.from("job_costs").delete().eq("id", c.id);
    if (error) alert("Delete failed: " + error.message);
    else { setSheet(null); load(); }
  }

  function exportCsv() {
    const rows = [["Date", "Job", "Vendor", "Category", "Amount", "Notes", "Status"]];
    [...costs].sort((a, b) => (a.entry_date ?? "").localeCompare(b.entry_date ?? "")).forEach((c) =>
      rows.push([c.entry_date ?? "", labelFor(c.job_id), c.vendor ?? "", c.category ?? "", c.amount != null ? String(c.amount) : "", c.notes ?? "", c.status])
    );
    const csv = rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "isola_job_costs.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const input = "w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
  const label = "block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1";

  let lastDay: string | null = null;

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-2.5">
          <div className="text-base font-bold text-white leading-none tabular-nums">{money(total)}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">{filter === "all" ? "All costs" : "Job total"}</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-2.5">
          <div className="text-base font-bold text-white leading-none tabular-nums">{money(month)}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">This month</div>
        </div>
        <button onClick={() => setOwedOnly(!owedOnly)} className={`rounded-xl border p-2.5 text-left ${owedOnly ? "border-red-400 bg-neutral-800" : owed > 0 ? "border-red-500/50 bg-neutral-900" : "border-neutral-800 bg-neutral-900"}`}>
          <div className={`text-base font-bold leading-none tabular-nums ${owed > 0 ? "text-red-300" : "text-white"}`}>{money(owed)}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">You owe{owedOnly ? " ✓" : " →"}</div>
        </button>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-2.5">
          <div className={`text-base font-bold leading-none tabular-nums ${pending ? "text-amber-300" : "text-white"}`}>{pending}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">Claude to fill</div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1 [scrollbar-width:none]">
        <button onClick={() => setFilter("all")}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${filter === "all" ? "bg-white text-neutral-900 border-white" : "border-neutral-700 text-neutral-400"}`}>
          All
        </button>
        {chipJobs.list.map((j) => (
          <button key={j.id} onClick={() => setFilter(j.id)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${filter === j.id ? "bg-white text-neutral-900 border-white" : "border-neutral-700 text-neutral-400"}`}>
            {jobLabel(j)}{j.status === "complete" ? " ✓" : ""}
          </button>
        ))}
        {chipJobs.hasOverhead ? (
          <button onClick={() => setFilter(OVERHEAD)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${filter === OVERHEAD ? "bg-white text-neutral-900 border-white" : "border-neutral-700 text-neutral-400"}`}>
            Shop / Overhead
          </button>
        ) : null}
      </div>

      {byCat && Object.keys(byCat).length ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2.5">By category</h3>
          {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
            const max = Math.max(...Object.values(byCat), 1);
            return (
              <div key={cat} className="flex items-center gap-2.5 py-1 text-sm">
                <span className="w-28 shrink-0 text-neutral-400 text-xs">{cat}</span>
                <span className="flex-1 h-1.5 rounded bg-neutral-800 overflow-hidden">
                  <i className="block h-full bg-amber-400/80 rounded" style={{ width: `${Math.max(4, Math.round((amt / max) * 100))}%` }} />
                </span>
                <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{money(amt)}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {loading ? <p className="text-neutral-500 text-sm">Loading…</p> : null}
      {!loading && shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-700 p-7 text-center text-sm text-neutral-500">
          No costs yet{filter !== "all" ? " on this job" : ""}.<br />
          Hit <b className="text-neutral-300">Add cost</b>, snap the receipt, and you're done — Claude reads the rest.
        </div>
      ) : null}

      <div className="space-y-2">
        {shown.map((c) => {
          const day = c.entry_date;
          const header = day !== lastDay ? (
            <div className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-600">{fmtDate(day)}</div>
          ) : null;
          lastDay = day;
          return (
            <div key={c.id}>
              {header}
              <button onClick={() => openSheet(c)}
                className={`w-full text-left flex items-center gap-3 rounded-xl border bg-neutral-900 px-3 py-2.5 ${c.status === "pending" ? "border-amber-500/50" : "border-neutral-800"}`}>
                {c.receipt_b64 ? (
                  <img src={c.receipt_b64} alt="Receipt" className="w-12 h-12 shrink-0 rounded-lg object-cover border border-neutral-800"
                    onClick={(e) => { e.stopPropagation(); setViewer(c.receipt_b64); }} />
                ) : (
                  <span className="w-12 h-12 shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 flex items-center justify-center text-lg">{c.hours != null || c.worker ? "👷" : <i className="not-italic text-[10px] uppercase text-neutral-600">no rcpt</i>}</span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-white truncate">{c.vendor ?? "(vendor pending)"}</span>
                  <span className="block text-xs text-neutral-500 truncate">
                    {c.hours != null ? `${c.hours} hr${c.rate != null ? ` × ${money(Number(c.rate)).replace(".00", "")}/hr` : ""}` : (c.category ?? "—")}{filter === "all" ? ` · ${labelFor(c.job_id)}` : ""}{c.notes ? ` · ${c.notes}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block font-bold tabular-nums ${c.paid === false ? "text-red-300" : ""}`}>{c.amount != null ? money(Number(c.amount)) : "—"}</span>
                  {c.paid === false ? (
                    <span className="text-[10px] font-bold uppercase text-red-400">Owed</span>
                  ) : c.status === "pending" ? (
                    <span className="text-[10px] font-bold uppercase text-amber-300">Claude to fill</span>
                  ) : c.by_claude ? (
                    <span className="text-[10px] font-bold uppercase text-emerald-400">Read by Claude</span>
                  ) : null}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-center text-xs text-neutral-600">
        {costs.length} entr{costs.length === 1 ? "y" : "ies"} ·{" "}
        <button onClick={exportCsv} className="text-neutral-400 underline">Export CSV</button>
      </p>

      <div className="fixed bottom-20 right-4 z-30 flex gap-2">
        <button onClick={() => openSheet("new", "labor")}
          className="rounded-full bg-neutral-800 text-white border border-neutral-600 font-bold text-sm px-4 py-3.5 shadow-lg shadow-black/50">
          👷 Labor
        </button>
        <button onClick={() => openSheet("new")}
          className="rounded-full bg-white text-neutral-900 font-bold text-sm px-5 py-3.5 shadow-lg shadow-black/50">
          ＋ Add cost
        </button>
      </div>

      {sheet ? (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-t-2xl sm:rounded-2xl p-5">
            <h2 className="font-bold text-white mb-3">{sheet === "new" ? (form.kind === "labor" ? "Log labor" : "Add cost") : "Edit cost"}</h2>
            <div className="flex gap-2 mb-4">
              {(["receipt", "labor"] as const).map((k) => (
                <button key={k} onClick={() => setForm({ ...form, kind: k, category: k === "labor" ? "Labor" : form.category === "Labor" ? "" : form.category })}
                  className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${form.kind === k ? "border-neutral-300 text-white bg-neutral-800" : "border-neutral-700 text-neutral-500"}`}>
                  {k === "labor" ? "👷 Labor" : "🧾 Receipt / material"}
                </button>
              ))}
            </div>
            {form.kind !== "labor" && form.receipt_b64 ? (
              <div className="relative mb-3">
                <img src={form.receipt_b64} alt="Receipt preview" className="w-full max-h-56 object-contain rounded-xl border border-neutral-800 bg-neutral-950" />
                <button onClick={() => setForm({ ...form, receipt_b64: null })}
                  className="absolute top-2 right-2 rounded-lg bg-black/70 text-white text-xs px-2.5 py-1">Remove</button>
              </div>
            ) : form.kind !== "labor" ? (
              <button onClick={() => fileRef.current?.click()}
                className="w-full mb-3 rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-950 py-3.5 text-sm font-semibold text-neutral-400">
                📸 Snap / attach receipt photo
              </button>
            ) : null}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={pickPhoto} />
            {form.kind !== "labor" ? (
              <p className="text-xs text-neutral-500 mb-4 leading-relaxed">
                Snap the receipt and save — leave the rest blank and <b className="text-amber-300">Claude fills in vendor, amount, and category</b> from the photo.
              </p>
            ) : null}
            {form.kind === "labor" ? (
              <div className="space-y-3 mb-3">
                <div><label className={label}>Worker *</label><input placeholder="e.g. Mike, Jose, THM crew" className={input} value={form.worker} onChange={(e) => setForm({ ...form, worker: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={label}>Hours</label><input inputMode="decimal" placeholder="8" className={input} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value, amount: "" })} /></div>
                  <div><label className={label}>Rate $/hr</label><input inputMode="decimal" placeholder="45" className={input} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value, amount: "" })} /></div>
                </div>
                {(() => { const h = Number(String(form.hours).replace(/[^0-9.]/g, "")), r = Number(String(form.rate).replace(/[^0-9.]/g, "")); return h > 0 && r > 0 ? (
                  <p className="text-sm text-neutral-300">= <b className="text-white tabular-nums">{money(Math.round(h * r * 100) / 100)}</b> labor cost</p>
                ) : null; })()}
                <div>
                  <label className={label}>Paid yet?</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm({ ...form, paid: true })}
                      className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${form.paid !== false ? "border-emerald-500/60 text-emerald-300 bg-neutral-800" : "border-neutral-700 text-neutral-500"}`}>
                      ✓ Paid
                    </button>
                    <button type="button" onClick={() => setForm({ ...form, paid: false })}
                      className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${form.paid === false ? "border-red-500/60 text-red-300 bg-neutral-800" : "border-neutral-700 text-neutral-500"}`}>
                      💰 I owe this
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="space-y-3">
              <div>
                <label className={label}>Job</label>
                <select className={input} value={form.job_id} onChange={(e) => setForm({ ...form, job_id: e.target.value })}>
                  {activeJobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
                  <option value={OVERHEAD}>Shop / Overhead (no job)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Date</label><input type="date" className={input} value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>
                {form.kind !== "labor" ? (
                  <div><label className={label}>Amount $</label><input inputMode="decimal" placeholder="Claude will read it" className={input} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                ) : (
                  <div><label className={label}>Override total $</label><input inputMode="decimal" placeholder="auto: hrs × rate" className={input} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                )}
              </div>
              {form.kind !== "labor" ? (<>
              <div><label className={label}>Vendor</label><input placeholder="Claude will read it" className={input} value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
              <div>
                <label className={label}>Category</label>
                <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="">(let Claude pick)</option>
                  {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Paid yet?</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm({ ...form, paid: true })}
                    className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${form.paid !== false ? "border-emerald-500/60 text-emerald-300 bg-neutral-800" : "border-neutral-700 text-neutral-500"}`}>
                    ✓ Paid
                  </button>
                  <button type="button" onClick={() => setForm({ ...form, paid: false })}
                    className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${form.paid === false ? "border-red-500/60 text-red-300 bg-neutral-800" : "border-neutral-700 text-neutral-500"}`}>
                    💰 Still owe it
                  </button>
                </div>
              </div>
              </>) : null}
              <div><label className={label}>Notes</label><textarea rows={2} placeholder="optional" className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex gap-2 mt-5">
              {sheet !== "new" ? (
                <button onClick={() => remove(sheet as Cost)} className="rounded-lg border border-red-900 px-4 py-2.5 text-sm text-red-400">Delete</button>
              ) : null}
              <button onClick={() => setSheet(null)} className="flex-1 rounded-lg border border-neutral-700 py-2.5 text-sm text-neutral-300">Cancel</button>
              <button onClick={save} disabled={busy} className="flex-1 rounded-lg bg-white text-neutral-900 py-2.5 text-sm font-semibold disabled:opacity-60">
                {busy ? "Saving…" : "Save cost"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {viewer ? (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setViewer(null)}>
          <img src={viewer} alt="Receipt" className="max-w-full max-h-full rounded-lg" />
        </div>
      ) : null}
    </div>
  );
}
