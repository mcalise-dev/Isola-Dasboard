"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { undoable, showError, showToast } from "@/components/Toaster";
import { ask } from "@/components/Dialogs";
import Dictate from "@/components/Dictate";
import { withTimeout, firstError } from "@/lib/load";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea, NativeSelect, Field } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PageHeader, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { Plus, HardHat, Camera, Images, Download, Check, Receipt, X, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Job, jobLabel, money, fmtDate, todayISO } from "@/lib/format";

const CATS = ["Materials", "Fuel", "Equipment / Rental", "Dump / Disposal", "Subcontractor", "Labor", "Permits", "Other"];
const OVERHEAD = "__overhead__";

// Downscale + JPEG-compress a picked image so a receipt stays well under the row limit.
function shrink(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const MAX = 1100;
      let w = img.width, h = img.height;
      if (Math.max(w, h) > MAX) { const r = MAX / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable image")); };
    img.src = url;
  });
}

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
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [owedOnly, setOwedOnly] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [monthOnly, setMonthOnly] = useState(false);
  const [workerFilter, setWorkerFilter] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Cost | "new" | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({});
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);

  async function load() {
    setErr(null);
    try {
      const [j, c] = await withTimeout(Promise.all([
        supabase.from("jobs").select("id,job_name,customer,location,job,status").order("customer"),
        supabase.from("job_costs").select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
      ]));
      const e = firstError(j, c);
      if (e) throw new Error(e);
      setJobs((j.data as Job[]) ?? []);
      setCosts((c.data as Cost[]) ?? []);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
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

  const base = costs.filter((c) => (filter === "all" ? true : (c.job_id ?? OVERHEAD) === filter));
  const monthNow = todayISO().slice(0, 7);
  const shown = base
    .filter((c) => !owedOnly || c.paid === false)
    .filter((c) => !pendingOnly || c.status === "pending")
    .filter((c) => !monthOnly || (c.entry_date ?? "").slice(0, 7) === monthNow)
    .filter((c) => !workerFilter || (c.worker || c.vendor || "Unknown").trim() === workerFilter);
  const owed = base.filter((c) => c.paid === false).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const total = shown.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const month = base.filter((c) => (c.entry_date ?? "").slice(0, 7) === monthNow).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const pending = base.filter((c) => c.status === "pending").length;
  const noToggles = !owedOnly && !pendingOnly && !monthOnly && !workerFilter;

  // What you owe your workers — unpaid Labor grouped by name (respects job filter).
  const owedWorkers: Record<string, { amt: number; hours: number; n: number }> = {};
  base.filter((c) => c.paid === false && c.category === "Labor").forEach((c) => {
    const k = (c.worker || c.vendor || "Unknown").trim();
    if (!owedWorkers[k]) owedWorkers[k] = { amt: 0, hours: 0, n: 0 };
    owedWorkers[k].amt += Number(c.amount) || 0;
    owedWorkers[k].hours += Number(c.hours) || 0;
    owedWorkers[k].n += 1;
  });
  const owedOther = base.filter((c) => c.paid === false && c.category !== "Labor").reduce((s, c) => s + (Number(c.amount) || 0), 0);

  async function markWorkerPaid(name: string) {
    const w = owedWorkers[name];
    if (!w) return;
    if (!(await ask({ title: `Mark ${name} paid?`, body: `${money(w.amt)} · ${w.n} entr${w.n === 1 ? "y" : "ies"}`, confirm: "Mark paid" }))) return;
    const ids = base.filter((c) => c.paid === false && c.category === "Labor" && (c.worker || c.vendor || "Unknown").trim() === name).map((c) => c.id);
    const { error } = await supabase.from("job_costs").update({ paid: true, updated_at: new Date().toISOString() }).in("id", ids);
    if (error) showError("Update failed: " + error.message);
    else { showToast(`${name} marked paid`); if (workerFilter === name) setWorkerFilter(null); load(); }
  }

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

  // One handler for both inputs. One photo fills the open form; several from the
  // library each become their own pending cost row, so a roll of receipts lands in one go.
  async function pickPhotos(ev: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(ev.target.files ?? []);
    ev.target.value = "";
    if (!files.length) return;
    setBusy(true);
    let imgs: string[];
    try { imgs = await Promise.all(files.map(shrink)); }
    catch { setBusy(false); showError("Couldn't read one of those images — try again."); return; }
    if (imgs.length === 1) { setForm((s: any) => ({ ...s, receipt_b64: imgs[0] })); setBusy(false); return; }
    const rows = imgs.map((b64) => ({
      job_id: form.job_id === OVERHEAD ? null : form.job_id,
      entry_date: form.entry_date || todayISO(),
      receipt_b64: b64,
      status: "pending",
      paid: true,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("job_costs").insert(rows);
    setBusy(false);
    if (error) { showError("Save failed: " + error.message); return; }
    setSheet(null);
    setPendingOnly(true);
    load();
    showToast(rows.length + " receipts saved as pending — ask Claude to read them and it'll fill in vendor, amount and category.", 6000);
  }

  async function save() {
    const isLabor = form.kind === "labor";
    const hours = isLabor && String(form.hours ?? "") !== "" ? Number(String(form.hours).replace(/[^0-9.]/g, "")) : null;
    const rate = isLabor && String(form.rate ?? "") !== "" ? Number(String(form.rate).replace(/[^0-9.]/g, "")) : null;
    const amtRaw = String(form.amount ?? "").replace(/[$,\s]/g, "");
    let amount = amtRaw === "" ? null : Number(amtRaw);
    if (isLabor && amount == null && hours != null && rate != null) amount = Math.round(hours * rate * 100) / 100;
    if (amtRaw !== "" && !isFinite(amount!)) { showError("Amount doesn't look like a number."); return; }
    if (isLabor) {
      if (!String(form.worker ?? "").trim()) { showError("Who worked? Add a name."); return; }
      if (amount == null) { showError("Add hours and rate (or a total)."); return; }
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
    if (!isLabor && !payload.receipt_b64 && amount == null) { showError("Add a receipt photo or an amount."); return; }
    setBusy(true);
    const res = sheet === "new"
      ? await supabase.from("job_costs").insert(payload)
      : await supabase.from("job_costs").update(payload).eq("id", (sheet as Cost).id);
    setBusy(false);
    if (res.error) { showError("Save failed: " + res.error.message); return; }
    showToast(sheet === "new" ? (isLabor ? "Labor logged" : "Cost saved") : "Cost updated");
    setSheet(null);
    load();
  }

  function remove(c: Cost) {
    const prev = costs;
    setSheet(null);
    undoable({
      text: "Cost deleted",
      hide: () => setCosts(prev.filter((x) => x.id !== c.id)),
      restore: () => setCosts(prev),
      // undoable restores the row and shows the error if the delete fails
      commit: async () => {
        const r = await supabase.from("job_costs").delete().eq("id", c.id);
        if (!r.error) load();
        return r;
      },
    });
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

  const isLaborRow = (c: Cost) => c.hours != null || !!c.worker;
  const detail = (c: Cost) => (c.hours != null ? `${c.hours} hr${c.rate != null ? ` × ${money(Number(c.rate)).replace(".00", "")}/hr` : ""}` : (c.category ?? "—"));
  const statusBadge = (c: Cost) =>
    c.paid === false ? <Badge variant="danger">Owed</Badge>
    : c.status === "pending" ? <Badge variant="warning">Claude to fill</Badge>
    : c.by_claude ? <Badge variant="success">Read by Claude</Badge>
    : null;
  const thumb = (c: Cost, size = "h-12 w-12") => c.receipt_b64 ? (
    <img src={c.receipt_b64} alt="Receipt" className={cn(size, "shrink-0 cursor-zoom-in rounded-lg border border-border object-cover")}
      onClick={(e) => { e.stopPropagation(); setViewer(c.receipt_b64); }} />
  ) : (
    <span className={cn(size, "flex shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-neutral-500")}>
      {isLaborRow(c) ? <HardHat size={18} /> : <span className="text-[11px] leading-tight text-center">no rcpt</span>}
    </span>
  );
  const pill = (on: boolean) => cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold",
    on ? "border-white bg-white text-neutral-900" : "border-white/10 text-neutral-400 hover:border-white/25 hover:text-white");
  const active = "border-white bg-white/[0.08]";

  // plain render helper (not a component) so it doesn't remount on every keystroke
  function paidToggle(owe: string) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setForm({ ...form, paid: true })}
          className={cn("inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold", form.paid !== false ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" : "border-input text-neutral-400")}>
          <Check size={15} /> Paid
        </button>
        <button type="button" onClick={() => setForm({ ...form, paid: false })}
          className={cn("inline-flex h-10 items-center justify-center rounded-lg border text-sm font-semibold", form.paid === false ? "border-red-500/60 bg-red-500/10 text-red-300" : "border-input text-neutral-400")}>
          {owe}
        </button>
      </div>
    );
  }

  let lastDay: string | null = null;

  const header = (
    <PageHeader title="Costs" sub="Receipts, labor and what you still owe — tax included in receipt totals"
      actions={<>
        <Button variant="ghost" className="hidden md:inline-flex" onClick={exportCsv} disabled={!costs.length}><Download size={16} /> Export CSV</Button>
        <Button variant="outline" onClick={() => openSheet("new", "labor")} disabled={loading || !!err}><HardHat size={16} /> Log labor</Button>
        <Button onClick={() => openSheet("new")} disabled={loading || !!err}><Plus size={16} /> Add cost</Button>
      </>} />
  );

  if (err) return <div>{header}<LoadError message={err} onRetry={() => { setLoading(true); load(); }} /></div>;

  return (
    <div>
      {header}

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label={filter === "all" ? "All costs" : "Job total"} value={money(total)} hint={noToggles ? "Showing everything" : "Tap to clear filters"}
          className={cn(noToggles && active)}
          onClick={() => { setOwedOnly(false); setPendingOnly(false); setMonthOnly(false); setWorkerFilter(null); }} />
        <Stat label="This month" value={money(month)} hint={monthOnly ? "Filtering" : "Tap to filter"}
          className={cn(monthOnly && active)} onClick={() => setMonthOnly(!monthOnly)} />
        <Stat label="You owe" value={money(owed)} tone={owed > 0 ? "bad" : undefined} hint={owedOnly ? "Filtering" : "Tap to see who"}
          className={cn(owedOnly ? active : owed > 0 && "border-red-500/40")}
          onClick={() => { const next = !owedOnly; setOwedOnly(next); if (!next) setWorkerFilter(null); }} />
        <Stat label="Claude to fill" value={pending} tone={pending ? "warn" : undefined} hint={pendingOnly ? "Filtering" : "Receipts waiting"}
          className={cn(pendingOnly ? active : pending > 0 && "border-amber-500/40")} onClick={() => setPendingOnly(!pendingOnly)} />
      </div>

      {owedOnly && (Object.keys(owedWorkers).length > 0 || owedOther > 0) ? (
        <Card className="mb-4 border-red-500/30">
          <CardHeader><CardTitle className="text-red-300">You owe your workers</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(owedWorkers).sort((a, b) => b[1].amt - a[1].amt).map(([name, w]) => (
              <div key={name} className={cn("-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5", workerFilter === name && "bg-white/[0.06]")}>
                <button onClick={() => setWorkerFilter(workerFilter === name ? null : name)} className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2.5 text-left">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-white/[0.05] text-neutral-400"><User size={15} /></span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-white">{name}</span>
                    <span className="block text-xs text-neutral-400">{w.hours > 0 ? `${w.hours} hr · ` : ""}{w.n} entr{w.n === 1 ? "y" : "ies"}</span>
                  </span>
                </button>
                <span className="shrink-0 font-semibold tabular-nums text-red-300">{money(w.amt)}</span>
                <Button size="sm" variant="outline" className="border-emerald-500/50 text-emerald-300 hover:border-emerald-400" onClick={() => markWorkerPaid(name)}>
                  <Check size={14} /> Pay
                </Button>
              </div>
            ))}
            {owedOther > 0 ? (
              <div className="-mx-2 mt-1 flex items-center gap-2.5 border-t border-border px-2 pt-2">
                <span className="flex-1 text-xs text-neutral-400">Other unpaid (materials, subs, etc.)</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-red-300/80">{money(owedOther)}</span>
              </div>
            ) : null}
            <p className="pt-1 text-xs text-neutral-500">Tap a name to see their entries · Pay marks all their unpaid labor paid</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 no-scrollbar md:mx-0 md:flex-wrap md:px-0">
        <button onClick={() => setFilter("all")} className={pill(filter === "all")}>All</button>
        {chipJobs.list.map((j) => (
          <button key={j.id} onClick={() => setFilter(j.id)} className={pill(filter === j.id)}>
            {jobLabel(j)}{j.status === "complete" ? <Check size={13} className="opacity-70" /> : null}
          </button>
        ))}
        {chipJobs.hasOverhead ? (
          <button onClick={() => setFilter(OVERHEAD)} className={pill(filter === OVERHEAD)}>Shop / Overhead</button>
        ) : null}
      </div>

      {byCat && Object.keys(byCat).length ? (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-neutral-300">By category</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
              const max = Math.max(...Object.values(byCat), 1);
              return (
                <div key={cat} className="flex items-center gap-2.5 py-1 text-sm">
                  <span className="w-28 shrink-0 text-xs text-neutral-400">{cat}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded bg-white/[0.08]">
                    <i className="block h-full rounded bg-white" style={{ width: `${Math.max(4, Math.round((amt / max) * 100))}%` }} />
                  </span>
                  <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{money(amt)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {loading ? <ListSkeleton /> : shown.length === 0 ? (
        <Empty icon={<Receipt size={28} />} title={`No costs yet${filter !== "all" ? " on this job" : ""}`}
          body={noToggles ? "Hit Add cost, shoot the receipt or pick photos from your roll, and you're done — Claude reads the rest." : "Nothing matches these filters."}
          action={noToggles
            ? <Button onClick={() => openSheet("new")}><Plus size={16} /> Add cost</Button>
            : <Button variant="outline" onClick={() => { setOwedOnly(false); setPendingOnly(false); setMonthOnly(false); setWorkerFilter(null); }}>Clear filters</Button>} />
      ) : (
        <>
          {/* phone: grouped by day */}
          <div className="space-y-2 md:hidden">
            {shown.map((c) => {
              const day = c.entry_date;
              const dayHead = day !== lastDay ? <div className="pt-2 text-sm font-semibold text-neutral-500">{fmtDate(day)}</div> : null;
              lastDay = day;
              return (
                <div key={c.id}>
                  {dayHead}
                  <button onClick={() => openSheet(c)}
                    className={cn("flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left active:bg-white/[0.04]", c.status === "pending" ? "border-amber-500/40" : "border-border")}>
                    {thumb(c)}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-white">{c.vendor ?? "(vendor pending)"}</span>
                      <span className="block truncate text-xs text-neutral-400">
                        {detail(c)}{filter === "all" ? ` · ${labelFor(c.job_id)}` : ""}{c.notes ? ` · ${c.notes}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={cn("font-semibold tabular-nums", c.paid === false ? "text-red-300" : "text-white")}>{c.amount != null ? money(Number(c.amount)) : "—"}</span>
                      {statusBadge(c)}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* md+: table */}
          <TableWrap className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH className="w-14" />
                  <TH>Date</TH>
                  <TH>Vendor / worker</TH>
                  {filter === "all" ? <TH>Job</TH> : null}
                  <TH>Detail</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {shown.map((c) => (
                  <TR key={c.id} onClick={() => openSheet(c)} className={cn("cursor-pointer hover:bg-white/[0.03]", c.status === "pending" && "bg-amber-500/[0.03]")}>
                    <TD className="py-2">{thumb(c, "h-10 w-10")}</TD>
                    <TD className="whitespace-nowrap text-neutral-400">{fmtDate(c.entry_date)}</TD>
                    <TD className="max-w-[200px]"><div className="truncate font-semibold text-white">{c.vendor ?? "(vendor pending)"}</div>{c.notes ? <div className="truncate text-xs text-neutral-500">{c.notes}</div> : null}</TD>
                    {filter === "all" ? <TD className="max-w-[200px] truncate text-neutral-300">{labelFor(c.job_id)}</TD> : null}
                    <TD className="whitespace-nowrap text-neutral-400">{detail(c)}</TD>
                    <TD className={cn("whitespace-nowrap text-right font-semibold tabular-nums", c.paid === false ? "text-red-300" : "text-white")}>{c.amount != null ? money(Number(c.amount)) : "—"}</TD>
                    <TD>{statusBadge(c)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </>
      )}

      <p className="mt-5 text-center text-xs text-neutral-500">
        {costs.length} entr{costs.length === 1 ? "y" : "ies"} ·{" "}
        <button onClick={exportCsv} className="text-neutral-400 underline">Export CSV</button>
      </p>

      <Dialog open={!!sheet} onOpenChange={(o) => { if (!o) setSheet(null); }}>
        {sheet ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{sheet === "new" ? (form.kind === "labor" ? "Log labor" : "Add cost") : "Edit cost"}</DialogTitle>
            </DialogHeader>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {(["receipt", "labor"] as const).map((k) => (
                <button key={k} onClick={() => setForm({ ...form, kind: k, category: k === "labor" ? "Labor" : form.category === "Labor" ? "" : form.category })}
                  className={cn("inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold", form.kind === k ? "border-white bg-white/[0.08] text-white" : "border-input text-neutral-400")}>
                  {k === "labor" ? <><HardHat size={15} /> Labor</> : <><Receipt size={15} /> Receipt / material</>}
                </button>
              ))}
            </div>
            {form.kind !== "labor" && form.receipt_b64 ? (
              <div className="relative mb-3">
                <img src={form.receipt_b64} alt="Receipt preview" className="max-h-56 w-full rounded-xl bg-white/[0.05] object-contain" />
                <Button size="sm" variant="secondary" onClick={() => setForm({ ...form, receipt_b64: null })} className="absolute right-2 top-2 bg-black/70">
                  <X size={14} /> Remove
                </Button>
              </div>
            ) : form.kind !== "labor" ? (
              <div className="mb-3 grid grid-cols-2 gap-2">
                <button onClick={() => camRef.current?.click()} disabled={busy}
                  className="inline-flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-input bg-neutral-950 py-3.5 text-sm font-semibold text-neutral-400 hover:text-white disabled:opacity-50">
                  <Camera size={20} /> Camera
                </button>
                <button onClick={() => libRef.current?.click()} disabled={busy}
                  className="inline-flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-input bg-neutral-950 py-3.5 text-sm font-semibold text-neutral-400 hover:text-white disabled:opacity-50">
                  <Images size={20} /> Photos
                </button>
              </div>
            ) : null}
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pickPhotos} />
            <input ref={libRef} type="file" accept="image/*" multiple hidden onChange={pickPhotos} />
            {form.kind !== "labor" ? (
              <p className="mb-4 text-xs leading-relaxed text-neutral-400">
                Shoot it or pull it from your roll — leave the rest blank and <b className="text-amber-300">Claude fills in vendor, amount, and category</b>. Pick several photos at once and each one saves as its own pending receipt.
              </p>
            ) : null}
            {form.kind === "labor" ? (
              <div className="mb-3 space-y-3">
                <Field label="Worker *"><Input placeholder="e.g. Mike, Jose, THM crew" value={form.worker} onChange={(e) => setForm({ ...form, worker: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Hours"><Input inputMode="decimal" placeholder="8" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value, amount: "" })} /></Field>
                  <Field label="Rate $/hr"><Input inputMode="decimal" placeholder="45" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value, amount: "" })} /></Field>
                </div>
                {(() => { const h = Number(String(form.hours).replace(/[^0-9.]/g, "")), r = Number(String(form.rate).replace(/[^0-9.]/g, "")); return h > 0 && r > 0 ? (
                  <p className="text-sm text-neutral-300">= <b className="tabular-nums text-white">{money(Math.round(h * r * 100) / 100)}</b> labor cost</p>
                ) : null; })()}
                <Field label="Paid yet?">{paidToggle("I owe this")}</Field>
              </div>
            ) : null}
            <div className="space-y-3">
              <Field label="Job">
                <NativeSelect value={form.job_id} onChange={(e) => setForm({ ...form, job_id: e.target.value })}>
                  {activeJobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
                  <option value={OVERHEAD}>Shop / Overhead (no job)</option>
                </NativeSelect>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date"><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></Field>
                {form.kind !== "labor" ? (
                  <Field label="Amount $"><Input inputMode="decimal" placeholder="Claude will read it" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
                ) : (
                  <Field label="Override total $"><Input inputMode="decimal" placeholder="auto: hrs × rate" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
                )}
              </div>
              {form.kind !== "labor" ? (<>
                <Field label="Vendor"><Input placeholder="Claude will read it" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></Field>
                <Field label="Category">
                  <NativeSelect value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value="">(let Claude pick)</option>
                    {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Paid yet?">{paidToggle("Still owe it")}</Field>
              </>) : null}
              <Field label="Notes"><div className="flex items-start gap-2"><Textarea rows={2} className="min-h-0 flex-1" placeholder="optional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /><Dictate hasText={!!form.notes} onText={(t) => setForm((p: any) => ({ ...p, notes: (p.notes ?? "") + t }))} /></div></Field>
            </div>
            <DialogFooter>
              {sheet !== "new" ? (
                <Button variant="destructive" className="sm:mr-auto" onClick={() => remove(sheet as Cost)}>Delete</Button>
              ) : null}
              <Button variant="outline" onClick={() => setSheet(null)}>Cancel</Button>
              <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save cost"}</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {viewer ? (
        <div className="fixed inset-0 z-[80] flex cursor-zoom-out items-center justify-center bg-black/95 p-4 anim-fade" onClick={() => setViewer(null)}>
          <img src={viewer} alt="Receipt" className="max-h-full max-w-full rounded-lg" />
          <button aria-label="Close" className="absolute right-3 top-3 rounded-md p-2 text-neutral-300 hover:bg-white/10 hover:text-white"><X size={20} /></button>
        </div>
      ) : null}
    </div>
  );
}
