"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayISO, fmtDate } from "@/lib/format";

/* ============================================================
   BILLING — payments and change orders, per job.

   The app could previously record exactly ONE payment per job
   (jobs.paid_date / paid_amount / paid_method). Mike's terms are
   33% deposit / 33% midpoint / balance — three. public.payments
   fixes that; this screen is how it gets used.

   Change orders: scope added mid-job. Only an APPROVED change order
   moves the contract total, which is what job_financials sums.
   ============================================================ */

const fmt2 = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

const inp =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-400 focus:outline-none";
const lbl = "block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1";
const btn =
  "rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-500";
const btnPrimary =
  "rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-neutral-900 hover:bg-neutral-200 disabled:opacity-40";
const card = "rounded-xl border border-neutral-800 bg-neutral-950 p-3.5";

const STAGES = [
  { key: "deposit", label: "Deposit", pct: 33 },
  { key: "midpoint", label: "Midpoint", pct: 33 },
  { key: "balance", label: "Balance", pct: 34 },
  { key: "retainage", label: "Retainage", pct: 0 },
  { key: "other", label: "Other", pct: 0 },
];

export default function BillingTab() {
  const supabase = useMemo(() => createClient(), []);
  const [fin, setFin] = useState<any[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [cos, setCos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addPay, setAddPay] = useState<any>(null);
  const [addCo, setAddCo] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("job_financials").select("*").order("contract_total", { ascending: false });
    setFin((data ?? []).filter((f: any) => Number(f.contract_total) > 0 || Number(f.paid_to_date) > 0));
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function openJob(id: string) {
    setOpenId(id);
    const [p, c] = await Promise.all([
      supabase.from("payments").select("*").eq("job_id", id).order("payment_date"),
      supabase.from("change_orders").select("*").eq("job_id", id).order("co_number"),
    ]);
    setPayments(p.data ?? []);
    setCos(c.data ?? []);
  }

  const job = fin.find((f) => f.job_id === openId) || null;

  /* ---------- totals across all jobs ---------- */
  const totContract = fin.reduce((s, f) => s + Number(f.contract_total || 0), 0);
  const totPaid = fin.reduce((s, f) => s + Number(f.paid_to_date || 0), 0);
  const totOwed = fin.reduce((s, f) => s + Number(f.balance_due || 0), 0);

  /* ---------- payments ---------- */
  async function savePayment() {
    if (!addPay.amount) return alert("Enter an amount.");
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
    if (error) return alert(error.message);
    setAddPay(null);
    openJob(openId!); load();
  }
  async function delPayment(id: string) {
    if (!confirm("Delete this payment?")) return;
    await supabase.from("payments").delete().eq("id", id);
    openJob(openId!); load();
  }

  /* ---------- change orders ---------- */
  async function saveCo() {
    if (!addCo.scope_text?.trim()) return alert("Describe the added scope — it goes to the client.");
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
    if (error) return alert(error.message);
    setAddCo(null);
    openJob(openId!); load();
  }
  async function setCoStatus(c: any, status: string) {
    const patch: any = { status, updated_at: new Date().toISOString() };
    if (status === "sent") patch.sent_at = new Date().toISOString();
    if (status === "approved") patch.approved_at = new Date().toISOString();
    if (status === "declined") patch.declined_at = new Date().toISOString();
    await supabase.from("change_orders").update(patch).eq("id", c.id);
    openJob(openId!); load();
  }
  async function delCo(id: string) {
    if (!confirm("Delete this change order?")) return;
    await supabase.from("change_orders").delete().eq("id", id);
    openJob(openId!); load();
  }

  if (loading) return <div className="p-4 text-sm text-neutral-500">Loading…</div>;

  /* ================= DETAIL ================= */
  if (job) {
    const contract = Number(job.contract_total || 0);
    const paid = Number(job.paid_to_date || 0);
    const owed = Number(job.balance_due || 0);
    const pctPaid = contract > 0 ? Math.min(100, (paid / contract) * 100) : 0;
    const paidByStage = (k: string) => payments.filter((p) => p.stage === k).reduce((s, p) => s + Number(p.amount), 0);

    return (
      <div className="pb-28 space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => { setOpenId(null); setAddPay(null); setAddCo(null); }} className={btn}>← Billing</button>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{job.job_name || "—"}</div>
            <div className="text-[11px] text-neutral-500 truncate">{job.customer}</div>
          </div>
        </div>

        <div className={card + " space-y-2"}>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-400">Contract</span>
            <span className="text-neutral-200 tabular-nums">{fmt2(Number(job.contract_base))}</span>
          </div>
          {Number(job.change_orders) > 0 ? (
            <div className="flex justify-between text-sm">
              <span className="text-neutral-400">Approved change orders</span>
              <span className="text-emerald-300 tabular-nums">+{fmt2(Number(job.change_orders))}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-neutral-800 pt-2">
            <span className="text-sm font-bold text-white">Contract total</span>
            <span className="text-lg font-bold text-white tabular-nums">{fmt2(contract)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-400">Paid to date</span>
            <span className="text-emerald-300 tabular-nums">{fmt2(paid)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="font-bold text-white">Still owed</span>
            <span className={`font-bold tabular-nums ${owed > 0 ? "text-amber-300" : "text-emerald-300"}`}>{fmt2(owed)}</span>
          </div>
          <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${pctPaid}%` }} />
          </div>
        </div>

        {/* draw schedule */}
        <div className={card + " space-y-2"}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Draw schedule — 33 / 33 / balance</div>
          {STAGES.slice(0, 3).map((s) => {
            const due = contract * (s.pct / 100);
            const got = paidByStage(s.key);
            const done = got >= due - 0.01 && due > 0;
            return (
              <div key={s.key} className="flex items-center justify-between gap-2 text-sm">
                <span className={`flex items-center gap-2 ${done ? "text-emerald-300" : "text-neutral-400"}`}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-[9px] ${done ? "bg-emerald-500 border-emerald-500 text-black" : "border-neutral-600"}`}>{done ? "✓" : ""}</span>
                  {s.label} <span className="text-neutral-600">({s.pct}%)</span>
                </span>
                <span className="tabular-nums text-neutral-300">
                  {fmt0(got)} <span className="text-neutral-600">of {fmt0(due)}</span>
                </span>
              </div>
            );
          })}
        </div>

        {/* payments */}
        <div className={card + " space-y-2"}>
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Payments ({payments.length})</div>
            <button onClick={() => setAddPay({ payment_date: todayISO(), stage: "deposit", amount: "" })} className={btn}>＋ Record</button>
          </div>

          {addPay ? (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-2.5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>Date</label><input type="date" className={inp} value={addPay.payment_date} onChange={(e) => setAddPay({ ...addPay, payment_date: e.target.value })} /></div>
                <div><label className={lbl}>Amount</label><input type="number" inputMode="decimal" className={inp} value={addPay.amount} onChange={(e) => setAddPay({ ...addPay, amount: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>Stage</label>
                  <select className={inp} value={addPay.stage} onChange={(e) => setAddPay({ ...addPay, stage: e.target.value })}>
                    {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Method</label>
                  <input className={inp} list="pay-methods" value={addPay.method ?? ""} onChange={(e) => setAddPay({ ...addPay, method: e.target.value })} />
                  <datalist id="pay-methods"><option value="check" /><option value="ach" /><option value="card" /><option value="cash" /></datalist>
                </div>
              </div>
              <div><label className={lbl}>Reference — check no. / invoice</label><input className={inp} value={addPay.reference ?? ""} onChange={(e) => setAddPay({ ...addPay, reference: e.target.value })} /></div>
              <div className="flex gap-2">
                <button onClick={savePayment} disabled={busy} className={btnPrimary + " flex-1"}>{busy ? "Saving…" : "Record payment"}</button>
                <button onClick={() => setAddPay(null)} className={btn}>Cancel</button>
              </div>
            </div>
          ) : null}

          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">{fmt2(Number(p.amount))} <span className="text-[11px] font-normal text-neutral-500">{STAGES.find((s) => s.key === p.stage)?.label}</span></div>
                <div className="text-[11px] text-neutral-500 truncate">{fmtDate(p.payment_date)}{p.method ? ` · ${p.method}` : ""}{p.reference ? ` · ${p.reference}` : ""}</div>
              </div>
              <button onClick={() => delPayment(p.id)} className="text-neutral-600 hover:text-red-400 text-sm px-1 shrink-0">✕</button>
            </div>
          ))}
          {payments.length === 0 && !addPay ? <p className="text-[11px] text-neutral-600">Nothing recorded yet.</p> : null}
        </div>

        {/* change orders */}
        <div className={card + " space-y-2"}>
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Change orders ({cos.length})</div>
            <button onClick={() => setAddCo({ amount: "", scope_text: "" })} className={btn}>＋ New</button>
          </div>

          {addCo ? (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-2.5 space-y-2">
              <div><label className={lbl}>Title</label><input className={inp} value={addCo.title ?? ""} placeholder="Added area drain at low corner" onChange={(e) => setAddCo({ ...addCo, title: e.target.value })} /></div>
              <div><label className={lbl}>Why the scope changed</label><input className={inp} value={addCo.reason ?? ""} placeholder="Discovered on excavation — not visible at the walk-through" onChange={(e) => setAddCo({ ...addCo, reason: e.target.value })} /></div>
              <div><label className={lbl}>Scope added — the client reads this</label><textarea rows={3} className={inp} value={addCo.scope_text} onChange={(e) => setAddCo({ ...addCo, scope_text: e.target.value })} /></div>
              <div><label className={lbl}>Amount</label><input type="number" inputMode="decimal" className={inp} value={addCo.amount} onChange={(e) => setAddCo({ ...addCo, amount: e.target.value })} /></div>
              <div className="flex gap-2">
                <button onClick={saveCo} disabled={busy} className={btnPrimary + " flex-1"}>{busy ? "Saving…" : "Create change order"}</button>
                <button onClick={() => setAddCo(null)} className={btn}>Cancel</button>
              </div>
            </div>
          ) : null}

          {cos.map((c) => {
            const tone = c.status === "approved" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : c.status === "declined" ? "border-red-500/30 bg-red-500/10 text-red-300"
              : c.status === "sent" ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
              : "border-neutral-700 bg-neutral-900 text-neutral-400";
            return (
              <div key={c.id} className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-2 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">CO #{c.co_number} — {c.title || "Untitled"}</div>
                    <div className="text-[11px] text-neutral-500">{fmt2(Number(c.amount))}{c.reason ? ` · ${c.reason}` : ""}</div>
                  </div>
                  <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${tone}`}>{c.status}</span>
                </div>
                <p className="text-[11px] text-neutral-400 whitespace-pre-wrap">{c.scope_text}</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.status === "draft" ? <button onClick={() => setCoStatus(c, "sent")} className={btn}>Mark sent</button> : null}
                  {c.status !== "approved" ? <button onClick={() => setCoStatus(c, "approved")} className={btn}>Approved</button> : null}
                  {c.status !== "declined" ? <button onClick={() => setCoStatus(c, "declined")} className={btn}>Declined</button> : null}
                  <button onClick={() => delCo(c.id)} className="text-neutral-600 hover:text-red-400 text-xs px-1">Delete</button>
                </div>
              </div>
            );
          })}
          {cos.length === 0 && !addCo ? (
            <p className="text-[11px] text-neutral-600">None. Scope added mid-job goes here — approved ones raise the contract total.</p>
          ) : null}
        </div>
      </div>
    );
  }

  /* ================= LIST ================= */
  return (
    <div className="pb-28 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-white">Billing</h1>
        <p className="text-xs text-neutral-500">Payments and change orders, job by job</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[["Contracted", fmt0(totContract)], ["Collected", fmt0(totPaid)], ["Outstanding", fmt0(totOwed)]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{k}</div>
            <div className="text-lg font-bold text-white leading-tight tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {fin.map((f) => {
          const owed = Number(f.balance_due || 0);
          const pct = Number(f.contract_total) > 0 ? (Number(f.paid_to_date) / Number(f.contract_total)) * 100 : 0;
          return (
            <button key={f.job_id} onClick={() => openJob(f.job_id)}
              className="w-full text-left rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-3 hover:border-neutral-600 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{f.job_name || "—"}</div>
                  <div className="text-[11px] text-neutral-500 truncate">{f.customer}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-white tabular-nums">{fmt0(Number(f.contract_total))}</div>
                  <div className={`text-[11px] tabular-nums ${owed > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                    {owed > 0 ? `${fmt0(owed)} owed` : "paid in full"}
                  </div>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              {Number(f.open_change_orders) > 0 ? (
                <div className="text-[11px] text-amber-300">{f.open_change_orders} change order{Number(f.open_change_orders) === 1 ? "" : "s"} not approved yet</div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
