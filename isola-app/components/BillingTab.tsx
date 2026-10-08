"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MoneyInput from "@/components/MoneyInput";
import { todayISO, fmtDate } from "@/lib/format";
import { showError, showToast, undoable } from "@/components/Toaster";
import { withTimeout, firstError } from "@/lib/load";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea, NativeSelect, Field } from "@/components/ui/input";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PageHeader, Stat, Empty, ListSkeleton, LoadError, Progress } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check, Pencil, Plus, Receipt, Trash2, X, FilePlus2 } from "lucide-react";

/* ============================================================
   BILLING — payments and change orders, per job, plus the job's
   own money fields.

   The app could previously record exactly ONE payment per job
   (jobs.paid_date / paid_amount / paid_method). Mike's terms are
   33% deposit / 33% midpoint / balance — three. public.payments
   fixes that; this screen is how it gets used.

   Change orders: scope added mid-job. Only an APPROVED change order
   moves the contract total, which is what job_financials sums.

   Partner share: on a THM joint job, net profit splits 50/50 and the
   partner's reimbursements come off the top too. "You keep" is the
   number that actually matters and it is not the same as net profit.
   ============================================================ */

const fmt2 = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

// MoneyInput takes a class string; match the Input primitive.
const inp =
  "w-full h-10 rounded-lg border border-input bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/30";

const STAGES = [
  { key: "deposit", label: "Deposit", pct: 33 },
  { key: "midpoint", label: "Midpoint", pct: 33 },
  { key: "balance", label: "Balance", pct: 34 },
  { key: "retainage", label: "Retainage", pct: 0 },
  { key: "other", label: "Other", pct: 0 },
];

const STATUSES = ["lead", "awaiting", "booked", "progress", "complete"];

type Filter = "all" | "collected" | "outstanding";

export default function BillingTab() {
  const supabase = useMemo(() => createClient(), []);
  const [fin, setFin] = useState<any[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [cos, setCos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addPay, setAddPay] = useState<any>(null);
  const [addCo, setAddCo] = useState<any>(null);
  const [editJob, setEditJob] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const [err, setErr] = useState<string | null>(null);
  const [subErr, setSubErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const r = await withTimeout(supabase.from("job_financials").select("*").order("contract_total", { ascending: false }));
      if (r.error) throw new Error(r.error.message);
      setFin((r.data ?? []).filter((f: any) => Number(f.contract_total) > 0 || Number(f.paid_to_date) > 0));
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Deep link from Reports: /billing?job=<id> opens straight into that job.
  useEffect(() => {
    if (loading || openId) return;
    const id = new URLSearchParams(window.location.search).get("job");
    if (id && fin.some((f) => f.job_id === id)) openJob(id);
    /* eslint-disable-next-line */
  }, [loading, fin]);

  async function openJob(id: string) {
    setOpenId(id); setEditJob(null); setAddPay(null); setAddCo(null); setSubErr(null);
    try {
      const [p, c] = await withTimeout(Promise.all([
        supabase.from("payments").select("*").eq("job_id", id).order("payment_date"),
        supabase.from("change_orders").select("*").eq("job_id", id).order("co_number"),
      ]));
      const e = firstError(p, c);
      if (e) throw new Error(e);
      setPayments(p.data ?? []);
      setCos(c.data ?? []);
    } catch (e: any) {
      setSubErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }

  const job = fin.find((f) => f.job_id === openId) || null;

  const totContract = fin.reduce((s, f) => s + Number(f.contract_total || 0), 0);
  const totPaid = fin.reduce((s, f) => s + Number(f.paid_to_date || 0), 0);
  const totOwed = fin.reduce((s, f) => s + Math.max(0, Number(f.balance_due || 0)), 0);

  /* ---------- payments ---------- */
  async function savePayment() {
    if (!addPay.amount) return showError("Enter an amount.");
    setBusy(true);
    const { error } = await supabase.from("payments").insert({
      job_id: openId,
      payment_date: addPay.payment_date || todayISO(),
      amount: Number(addPay.amount),
      stage: addPay.stage || "other",
      method: addPay.method || null,
      reference: addPay.reference || null,
      notes: addPay.notes || null,
    });
    setBusy(false);
    if (error) return showError("Save failed: " + error.message);
    showToast("Payment recorded");
    setAddPay(null); openJob(openId!); load();
  }
  function delPayment(id: string) {
    const prev = payments;
    const jobId = openId!;
    undoable({
      text: "Payment deleted",
      hide: () => setPayments(prev.filter((p) => p.id !== id)),
      restore: () => setPayments(prev),
      // undoable puts the row back and shows the error if the delete fails
      commit: async () => {
        const r = await supabase.from("payments").delete().eq("id", id);
        if (!r.error) { openJob(jobId); load(); }
        return r;
      },
    });
  }

  /* ---------- change orders ---------- */
  async function saveCo() {
    if (!addCo.scope_text?.trim()) return showError("Describe the added scope — it goes to the client.");
    setBusy(true);
    const nextNo = (cos.reduce((m, c) => Math.max(m, c.co_number || 0), 0) || 0) + 1;
    const { error } = await supabase.from("change_orders").insert({
      job_id: openId,
      co_number: addCo.co_number ? Number(addCo.co_number) : nextNo,
      title: addCo.title || null,
      reason: addCo.reason || null,
      scope_text: addCo.scope_text.trim(),
      amount: Number(addCo.amount || 0),
      status: "draft",
    });
    setBusy(false);
    if (error) return showError("Save failed: " + error.message);
    showToast("Change order created");
    setAddCo(null); openJob(openId!); load();
  }
  async function setCoStatus(c: any, status: string) {
    const patch: any = { status, updated_at: new Date().toISOString() };
    if (status === "sent") patch.sent_at = new Date().toISOString();
    if (status === "approved") patch.approved_at = new Date().toISOString();
    if (status === "declined") patch.declined_at = new Date().toISOString();
    const { error } = await supabase.from("change_orders").update(patch).eq("id", c.id);
    if (error) return showError("Update failed: " + error.message);
    showToast(`CO #${c.co_number} marked ${status}`);
    openJob(openId!); load();
  }
  function delCo(id: string) {
    const prev = cos;
    const jobId = openId!;
    undoable({
      text: "Change order deleted",
      hide: () => setCos(prev.filter((c) => c.id !== id)),
      restore: () => setCos(prev),
      commit: async () => {
        const r = await supabase.from("change_orders").delete().eq("id", id);
        if (!r.error) { openJob(jobId); load(); }
        return r;
      },
    });
  }

  /* ---------- the job itself ---------- */
  function startEdit() {
    setEditJob({
      price: Number(job.contract_base) || "",
      job: job.work_type ?? "",
      status: job.status ?? "awaiting",
      qbo_invoice_ref: job.qbo_invoice_ref ?? "",
      invoiced_date: job.invoiced_date ?? "",
      completed_date: job.completed_date ?? "",
      partner: job.partner ?? "",
      partner_share: Number(job.partner_share) || "",
    });
  }

  async function saveJob() {
    setBusy(true);
    // jobs.price is free text by design — price_amount is a generated column
    // that parses it — so write a clean, parseable currency string.
    const n = editJob.price === "" ? null : Number(editJob.price);
    const patch: any = {
      price: n == null ? null : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      job: editJob.job?.trim() || null,
      status: editJob.status,
      qbo_invoice_ref: editJob.qbo_invoice_ref?.trim() || null,
      invoiced_date: editJob.invoiced_date || null,
      completed_date: editJob.completed_date || null,
      partner: editJob.partner?.trim() || null,
      partner_share: editJob.partner_share === "" ? null : Number(editJob.partner_share),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("jobs").update(patch).eq("id", openId);
    setBusy(false);
    if (error) return showError("Save failed: " + error.message);
    showToast("Job saved");
    setEditJob(null); await load();
  }

  if (err) return (
    <div>
      <PageHeader title="Billing" sub="Payments and change orders, per job" />
      <LoadError message={err} onRetry={() => { setLoading(true); load(); }} />
    </div>
  );
  if (loading) return (
    <div>
      <PageHeader title="Billing" sub="Payments and change orders, per job" />
      <ListSkeleton />
    </div>
  );

  const row = (l: React.ReactNode, v: React.ReactNode, cls?: string) => (
    <div className={cn("flex justify-between gap-3 text-sm", cls)}>
      <span className="text-neutral-400">{l}</span>
      <span className="tabular-nums text-neutral-200">{v}</span>
    </div>
  );

  /* ================= DETAIL ================= */
  if (job) {
    const contract = Number(job.contract_total || 0);
    const paid = Number(job.paid_to_date || 0);
    const owed = Number(job.balance_due || 0);
    const pctPaid = contract > 0 ? Math.min(100, (paid / contract) * 100) : 0;
    const paidByStage = (k: string) => payments.filter((p) => p.stage === k).reduce((s, p) => s + Number(p.amount), 0);
    const cost = Number(job.actual_cost || 0);
    const share = Number(job.partner_share || 0);

    return (
      <div className="pb-28 md:pb-8">
        <PageHeader
          crumb={<button onClick={() => { setOpenId(null); setEditJob(null); }} className="inline-flex min-h-[32px] items-center gap-1 hover:text-white"><ArrowLeft size={14} /> Billing</button>}
          title={job.job_name || "—"}
          sub={<>{job.customer}{job.qbo_invoice_ref ? ` · QB ${job.qbo_invoice_ref}` : ""}</>}
          actions={<Button variant="outline" onClick={() => (editJob ? setEditJob(null) : startEdit())}>
            {editJob ? <><X size={16} /> Close</> : <><Pencil size={16} /> Edit job</>}
          </Button>} />

        {subErr ? <LoadError className="mb-4" message={subErr} onRetry={() => openJob(job.job_id)} /> : null}

        <div className="mb-4 grid grid-cols-3 gap-2">
          <Stat label="Contract total" value={fmt0(contract)} />
          <Stat label="Paid to date" value={fmt0(paid)} tone={paid > 0 ? "ok" : undefined} />
          <Stat label="Still owed" value={fmt0(owed)} tone={owed > 0 ? "warn" : "ok"} />
        </div>

        {/* ---- edit the job's own fields ---- */}
        {editJob ? (
          <Card className="mb-4">
            <CardHeader><CardTitle>Edit job</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contract price">
                  <MoneyInput className={inp} value={editJob.price} onChange={(v) => setEditJob({ ...editJob, price: v })} />
                </Field>
                <Field label="Work type">
                  <Input value={editJob.job} placeholder="Concrete, asphalt…" onChange={(e) => setEditJob({ ...editJob, job: e.target.value })} />
                </Field>
              </div>

              <Field label="Status">
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <button key={s} onClick={() => setEditJob({ ...editJob, status: s })}
                      className={cn("h-9 rounded-lg border px-3 text-[13px] font-semibold capitalize", editJob.status === s ? "border-white bg-white text-neutral-900" : "border-input text-neutral-400 hover:text-white")}>
                      {s}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="QuickBooks invoice">
                <Input value={editJob.qbo_invoice_ref} placeholder="2026-ISOLA-060, or several separated by commas"
                  onChange={(e) => setEditJob({ ...editJob, qbo_invoice_ref: e.target.value })} />
                <p className="mt-1 text-xs text-neutral-500">
                  Linking the invoice is what moves this job from quoted pipeline into real receivables.
                </p>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Invoiced"><Input type="date" value={editJob.invoiced_date} onChange={(e) => setEditJob({ ...editJob, invoiced_date: e.target.value })} /></Field>
                <Field label="Completed"><Input type="date" value={editJob.completed_date} onChange={(e) => setEditJob({ ...editJob, completed_date: e.target.value })} /></Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Partner"><Input value={editJob.partner} placeholder="THM, or blank" onChange={(e) => setEditJob({ ...editJob, partner: e.target.value })} /></Field>
                <Field label="Owed to partner">
                  <MoneyInput className={inp} value={editJob.partner_share} onChange={(v) => setEditJob({ ...editJob, partner_share: v })} />
                </Field>
              </div>
              <p className="text-xs text-neutral-500">
                Their 50% of net profit plus anything they fronted — the whole amount due to them, off the top.
              </p>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setEditJob(null)}>Cancel</Button>
                <Button onClick={saveJob} disabled={busy}>{busy ? "Saving…" : "Save job"}</Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Contract</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {row("Contract", fmt2(Number(job.contract_base)))}
                {Number(job.change_orders) > 0 ? row("Approved change orders", <span className="text-emerald-300">+{fmt2(Number(job.change_orders))}</span>) : null}
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="text-sm font-semibold text-white">Contract total</span>
                  <span className="text-lg font-semibold tabular-nums text-white">{fmt2(contract)}</span>
                </div>
                {row("Paid to date", <span className="text-emerald-300">{fmt2(paid)}</span>)}
                <div className="flex justify-between text-sm">
                  <span className="font-semibold text-white">Still owed</span>
                  <span className={cn("font-semibold tabular-nums", owed > 0 ? "text-amber-300" : "text-emerald-300")}>{fmt2(owed)}</span>
                </div>
                <Progress value={pctPaid} tone="ok" className="h-2" />
              </CardContent>
            </Card>

            {/* ---- what's actually left after costs and the partner ---- */}
            {cost > 0 || share > 0 ? (
              <Card>
                <CardHeader><CardTitle>What&apos;s left</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {row("Job costs", `−${fmt2(cost)}`)}
                  {row("Net profit", fmt2(Number(job.net_profit)))}
                  {share > 0 ? row(`To ${job.partner || "partner"}`, <span className="text-amber-300">−{fmt2(share)}</span>) : null}
                  <div className="flex justify-between border-t border-border pt-2">
                    <span className="text-sm font-semibold text-white">You keep</span>
                    <span className="text-lg font-semibold tabular-nums text-emerald-300">{fmt2(Number(job.net_to_isola))}</span>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* ---- draw schedule ---- */}
            <Card>
              <CardHeader><CardTitle>Draw schedule — 33 / 33 / balance</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {STAGES.slice(0, 3).map((s) => {
                  const due = contract * (s.pct / 100);
                  const got = paidByStage(s.key);
                  const done = got >= due - 0.01 && due > 0;
                  return (
                    <div key={s.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className={cn("flex items-center gap-2", done ? "text-emerald-300" : "text-neutral-400")}>
                        <span className={cn("flex h-4 w-4 items-center justify-center rounded border", done ? "border-emerald-500 bg-emerald-500 text-black" : "border-neutral-600")}>{done ? <Check size={12} strokeWidth={3} /> : null}</span>
                        {s.label} <span className="text-neutral-500">({s.pct}%)</span>
                      </span>
                      <span className="tabular-nums text-neutral-300">
                        {fmt0(got)} <span className="text-neutral-500">of {fmt0(due)}</span>
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {/* ---- payments ---- */}
            <Card>
              <CardHeader>
                <CardTitle>Payments ({payments.length})</CardTitle>
                <Button variant="outline" size="sm" className="ml-auto h-9" onClick={() => setAddPay({ payment_date: todayISO(), stage: "deposit", amount: "" })}><Plus size={14} /> Record</Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {addPay ? (
                  <div className="space-y-3 rounded-lg border border-border bg-neutral-950 p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Date"><Input type="date" value={addPay.payment_date} onChange={(e) => setAddPay({ ...addPay, payment_date: e.target.value })} /></Field>
                      <Field label="Amount"><MoneyInput className={inp} value={addPay.amount} onChange={(v) => setAddPay({ ...addPay, amount: v })} /></Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Stage">
                        <NativeSelect value={addPay.stage} onChange={(e) => setAddPay({ ...addPay, stage: e.target.value })}>
                          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </NativeSelect>
                      </Field>
                      <Field label="Method">
                        <Input list="pay-methods" value={addPay.method ?? ""} onChange={(e) => setAddPay({ ...addPay, method: e.target.value })} />
                        <datalist id="pay-methods"><option value="check" /><option value="ach" /><option value="card" /><option value="cash" /></datalist>
                      </Field>
                    </div>
                    <Field label="Reference — check no. / invoice"><Input value={addPay.reference ?? ""} onChange={(e) => setAddPay({ ...addPay, reference: e.target.value })} /></Field>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button variant="outline" onClick={() => setAddPay(null)}>Cancel</Button>
                      <Button onClick={savePayment} disabled={busy}>{busy ? "Saving…" : "Record payment"}</Button>
                    </div>
                  </div>
                ) : null}

                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-neutral-950 py-1.5 pl-3 pr-1">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white"><span className="tabular-nums">{fmt2(Number(p.amount))}</span> <Badge variant="muted">{STAGES.find((s) => s.key === p.stage)?.label}</Badge></div>
                      <div className="truncate text-xs text-neutral-400">{fmtDate(p.payment_date)}{p.method ? ` · ${p.method}` : ""}{p.reference ? ` · ${p.reference}` : ""}</div>
                    </div>
                    <Button variant="ghost" size="icon" aria-label="Delete payment" className="shrink-0 text-neutral-500 hover:text-red-300" onClick={() => delPayment(p.id)}><Trash2 size={16} /></Button>
                  </div>
                ))}
                {payments.length === 0 && !addPay ? <p className="text-sm text-neutral-500">Nothing recorded yet.</p> : null}
              </CardContent>
            </Card>

            {/* ---- change orders ---- */}
            <Card>
              <CardHeader>
                <CardTitle>Change orders ({cos.length})</CardTitle>
                <Button variant="outline" size="sm" className="ml-auto h-9" onClick={() => setAddCo({ amount: "", scope_text: "" })}><FilePlus2 size={14} /> New</Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {addCo ? (
                  <div className="space-y-3 rounded-lg border border-border bg-neutral-950 p-3">
                    <Field label="Title"><Input value={addCo.title ?? ""} placeholder="Added area drain at low corner" onChange={(e) => setAddCo({ ...addCo, title: e.target.value })} /></Field>
                    <Field label="Why the scope changed"><Input value={addCo.reason ?? ""} placeholder="Discovered on excavation — not visible at the walk-through" onChange={(e) => setAddCo({ ...addCo, reason: e.target.value })} /></Field>
                    <Field label="Scope added — the client reads this"><Textarea rows={3} value={addCo.scope_text} onChange={(e) => setAddCo({ ...addCo, scope_text: e.target.value })} /></Field>
                    <Field label="Amount"><MoneyInput className={inp} value={addCo.amount} onChange={(v) => setAddCo({ ...addCo, amount: v })} /></Field>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button variant="outline" onClick={() => setAddCo(null)}>Cancel</Button>
                      <Button onClick={saveCo} disabled={busy}>{busy ? "Saving…" : "Create change order"}</Button>
                    </div>
                  </div>
                ) : null}

                {cos.map((c) => {
                  const tone = c.status === "approved" ? "success" : c.status === "declined" ? "danger" : c.status === "sent" ? "warning" : "muted";
                  return (
                    <div key={c.id} className="space-y-2 rounded-lg border border-border bg-neutral-950 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">CO #{c.co_number} — {c.title || "Untitled"}</div>
                          <div className="text-xs text-neutral-400"><span className="tabular-nums">{fmt2(Number(c.amount))}</span>{c.reason ? ` · ${c.reason}` : ""}</div>
                        </div>
                        <Badge variant={tone as any} className="shrink-0 capitalize">{c.status}</Badge>
                      </div>
                      <p className="whitespace-pre-wrap text-xs text-neutral-400">{c.scope_text}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {c.status === "draft" ? <Button variant="outline" size="sm" className="h-9" onClick={() => setCoStatus(c, "sent")}>Mark sent</Button> : null}
                        {c.status !== "approved" ? <Button variant="outline" size="sm" className="h-9" onClick={() => setCoStatus(c, "approved")}>Approved</Button> : null}
                        {c.status !== "declined" ? <Button variant="outline" size="sm" className="h-9" onClick={() => setCoStatus(c, "declined")}>Declined</Button> : null}
                        <Button variant="ghost" size="sm" className="ml-auto h-9 text-neutral-500 hover:text-red-300" onClick={() => delCo(c.id)}><Trash2 size={14} /> Delete</Button>
                      </div>
                    </div>
                  );
                })}
                {cos.length === 0 && !addCo ? (
                  <p className="text-sm text-neutral-500">None. Scope added mid-job goes here — approved ones raise the contract total.</p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  /* ================= LIST ================= */
  const shown =
    filter === "collected"   ? fin.filter((f) => Number(f.paid_to_date) > 0)
    : filter === "outstanding" ? fin.filter((f) => Number(f.balance_due) > 0)
    : fin;

  const tile = (key: Filter, label: string, value: string, sub: string, tone?: "ok" | "warn") => (
    <Stat key={key} label={label} value={value} hint={sub} tone={tone} onClick={() => setFilter(key)}
      className={cn(filter === key && "border-white bg-white/[0.08]")} />
  );

  const extras = (f: any) => (
    <>
      {Number(f.partner_share) > 0 ? <span className="text-amber-300/80">{f.partner} {fmt0(Number(f.partner_share))}</span> : null}
      {Number(f.actual_cost) > 0 ? <span>you keep {fmt0(Number(f.net_to_isola))}</span> : <span>no costs logged</span>}
      {Number(f.open_change_orders) > 0 ? <span className="text-amber-300">{f.open_change_orders} CO pending</span> : null}
    </>
  );

  return (
    <div className="pb-28 md:pb-8">
      <PageHeader title="Billing" sub="Payments and change orders, per job · tap a number to see what's behind it" />

      <div className="mb-4 grid grid-cols-3 gap-2">
        {tile("all", "Contracted", fmt0(totContract), `${fin.length} jobs`)}
        {tile("collected", "Collected", fmt0(totPaid), `${fin.filter((f) => Number(f.paid_to_date) > 0).length} paid`, totPaid > 0 ? "ok" : undefined)}
        {tile("outstanding", "Outstanding", fmt0(totOwed), `${fin.filter((f) => Number(f.balance_due) > 0).length} owing`, totOwed > 0 ? "warn" : undefined)}
      </div>

      {filter !== "all" ? (
        <div className="mb-3 flex items-center gap-2 text-sm text-neutral-300">
          Showing {shown.length} {filter === "collected" ? "jobs with money in" : "jobs still owing"}
          <button onClick={() => setFilter("all")} className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs font-semibold text-neutral-300 hover:text-white">Show all</button>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <Empty icon={<Receipt size={28} />} title="Nothing in this view"
          body={filter === "all" ? "Jobs show up here once they have a contract price or a payment." : "Try another number above."}
          action={filter !== "all" ? <Button variant="outline" onClick={() => setFilter("all")}>Show all</Button> : null} />
      ) : (
        <>
          {/* phone: cards */}
          <div className="space-y-2 md:hidden">
            {shown.map((f) => {
              const owed = Number(f.balance_due || 0);
              const pct = Number(f.contract_total) > 0 ? (Number(f.paid_to_date) / Number(f.contract_total)) * 100 : 0;
              return (
                <button key={f.job_id} onClick={() => openJob(f.job_id)}
                  className="w-full space-y-2 rounded-xl border border-border bg-card px-4 py-3 text-left active:bg-white/[0.04]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">{f.job_name || "—"}</div>
                      <div className="truncate text-sm text-neutral-400">
                        {f.customer}{f.qbo_invoice_ref ? ` · QB ${f.qbo_invoice_ref}` : " · not invoiced"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold tabular-nums text-white">{fmt0(Number(f.contract_total))}</div>
                      <div className={cn("text-xs tabular-nums", owed > 0 ? "text-amber-300" : "text-emerald-300")}>
                        {owed > 0 ? `${fmt0(owed)} owed` : "paid in full"}
                      </div>
                    </div>
                  </div>
                  <Progress value={Math.min(100, pct)} tone="ok" />
                  <div className="flex flex-wrap gap-2 text-xs text-neutral-500">{extras(f)}</div>
                </button>
              );
            })}
          </div>

          {/* md+: table */}
          <TableWrap className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Job</TH>
                  <TH>QuickBooks</TH>
                  <TH className="text-right">Contract</TH>
                  <TH className="text-right">Paid</TH>
                  <TH className="w-32">Progress</TH>
                  <TH className="text-right">Owed</TH>
                  <TH>Notes</TH>
                </TR>
              </THead>
              <TBody>
                {shown.map((f) => {
                  const owed = Number(f.balance_due || 0);
                  const pct = Number(f.contract_total) > 0 ? (Number(f.paid_to_date) / Number(f.contract_total)) * 100 : 0;
                  return (
                    <TR key={f.job_id} onClick={() => openJob(f.job_id)} className="cursor-pointer hover:bg-white/[0.03]">
                      <TD className="max-w-[240px]"><div className="truncate font-semibold text-white">{f.job_name || "—"}</div><div className="truncate text-xs text-neutral-500">{f.customer}</div></TD>
                      <TD className="whitespace-nowrap text-neutral-400">{f.qbo_invoice_ref ? f.qbo_invoice_ref : <span className="text-neutral-600">not invoiced</span>}</TD>
                      <TD className="text-right font-semibold tabular-nums text-white">{fmt0(Number(f.contract_total))}</TD>
                      <TD className="text-right tabular-nums text-neutral-300">{fmt0(Number(f.paid_to_date))}</TD>
                      <TD><Progress value={Math.min(100, pct)} tone="ok" /></TD>
                      <TD className={cn("whitespace-nowrap text-right tabular-nums", owed > 0 ? "text-amber-300" : "text-emerald-300")}>{owed > 0 ? fmt0(owed) : <span className="inline-flex items-center gap-1"><Check size={13} /> Paid</span>}</TD>
                      <TD><div className="flex flex-wrap gap-x-2 text-xs text-neutral-500">{extras(f)}</div></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        </>
      )}
    </div>
  );
}
