"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, todayISO } from "@/lib/format";

/* ============================================================
   RECURRING WORK — snow above all.

   Snow is an entire revenue line that lived nowhere in the app.
   The arrangement: the accounts are Mike's, sourced and managed by
   him; THM performs the work; Mike earns 10% commission on TOP-LINE
   gross revenue, with no cost deductions before the 10%.

   So commission is always billed_amount × commission_pct. The screen
   computes it that way and does not offer a "less costs" option,
   because that would be the wrong deal.
   ============================================================ */

const fmt2 = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

const inp =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-400 focus:outline-none";
const lbl = "block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1";
const btn = "rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-500";
const btnPrimary = "rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-neutral-900 hover:bg-neutral-200 disabled:opacity-40";
const card = "rounded-xl border border-neutral-800 bg-neutral-950 p-3.5";

const RATE_TYPES = [
  { key: "per_event", label: "Per event" },
  { key: "per_inch", label: "Per inch" },
  { key: "seasonal", label: "Seasonal" },
  { key: "hourly", label: "Hourly" },
];

export default function SnowTab() {
  const supabase = useMemo(() => createClient(), []);
  const [contracts, setContracts] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editC, setEditC] = useState<any>(null);
  const [addE, setAddE] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [c, e, cu, p] = await Promise.all([
      supabase.from("recurring_contracts").select("*").order("name"),
      supabase.from("service_events").select("*").order("event_date", { ascending: false }).limit(200),
      supabase.from("customers").select("id,name").eq("archived", false).order("name"),
      supabase.from("properties").select("id,customer_id,address,label").order("address"),
    ]);
    setContracts(c.data ?? []); setEvents(e.data ?? []);
    setCustomers(cu.data ?? []); setProperties(p.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const custById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c.name])), [customers]);
  const eventsFor = (id: string) => events.filter((e) => e.contract_id === id);

  const grossYTD = events.reduce((s, e) => s + Number(e.billed_amount || 0), 0);
  const commYTD = events.reduce((s, e) => s + Number(e.commission_amount || 0), 0);
  const uninvoiced = events.filter((e) => !e.invoiced).reduce((s, e) => s + Number(e.billed_amount || 0), 0);

  async function saveContract() {
    if (!editC.name?.trim()) return alert("Name the contract.");
    setBusy(true);
    const row: any = {
      name: editC.name.trim(),
      customer_id: editC.customer_id || null,
      property_id: editC.property_id || null,
      service_type: editC.service_type || "snow",
      season_start: editC.season_start || null,
      season_end: editC.season_end || null,
      rate_type: editC.rate_type || "per_event",
      rate: editC.rate === "" || editC.rate == null ? null : Number(editC.rate),
      commission_pct: editC.commission_pct === "" || editC.commission_pct == null ? 10 : Number(editC.commission_pct),
      performed_by: editC.performed_by || "THM",
      active: editC.active ?? true,
      notes: editC.notes || null,
    };
    const { error } = editC.id
      ? await supabase.from("recurring_contracts").update(row).eq("id", editC.id)
      : await supabase.from("recurring_contracts").insert(row);
    setBusy(false);
    if (error) return alert(error.message);
    setEditC(null); load();
  }

  async function saveEvent() {
    if (!addE.billed_amount) return alert("Enter what the account was billed — that's what the commission comes off.");
    const c = contracts.find((x) => x.id === addE.contract_id);
    const pct = Number(c?.commission_pct ?? 10);
    const gross = Number(addE.billed_amount);
    setBusy(true);
    const { error } = await supabase.from("service_events").insert({
      contract_id: addE.contract_id,
      event_date: addE.event_date || todayISO(),
      description: addE.description || null,
      inches: addE.inches === "" || addE.inches == null ? null : Number(addE.inches),
      hours: addE.hours === "" || addE.hours == null ? null : Number(addE.hours),
      billed_amount: gross,
      commission_amount: Math.round(gross * (pct / 100) * 100) / 100,
      invoice_ref: addE.invoice_ref || null,
      notes: addE.notes || null,
    });
    setBusy(false);
    if (error) return alert(error.message);
    setAddE(null); load();
  }

  // Deleting an account takes its events with it (FK cascade), which is why
  // the count is spelled out in the prompt rather than a bare "are you sure".
  async function deleteContract(c: any) {
    const n = eventsFor(c.id).length;
    const msg = n
      ? `Delete "${c.name}" and its ${n} logged event${n === 1 ? "" : "s"}?\n\nThat removes ${fmt2(eventsFor(c.id).reduce((s: number, e: any) => s + Number(e.commission_amount || 0), 0))} of tracked commission. Consider Archive instead.`
      : `Delete "${c.name}"?`;
    if (!confirm(msg)) return;
    const { error } = await supabase.from("recurring_contracts").delete().eq("id", c.id);
    if (error) return alert("Delete failed: " + error.message);
    load();
  }

  // Archive keeps the history and the commission record — the right move
  // at the end of a season.
  async function toggleActive(c: any) {
    await supabase.from("recurring_contracts").update({ active: !c.active }).eq("id", c.id);
    load();
  }

  async function toggleEvent(e: any, field: "invoiced" | "paid") {
    await supabase.from("service_events").update({ [field]: !e[field] }).eq("id", e.id);
    load();
  }
  async function delEvent(id: string) {
    if (!confirm("Delete this event?")) return;
    await supabase.from("service_events").delete().eq("id", id);
    load();
  }

  if (loading) return <div className="p-4 text-sm text-neutral-500">Loading…</div>;

  return (
    <div className="pb-28 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">Recurring</h1>
          <p className="text-xs text-neutral-500">Snow and seasonal accounts</p>
        </div>
        <button onClick={() => setEditC({ service_type: "snow", rate_type: "per_event", commission_pct: 10, performed_by: "THM", active: true })} className={btnPrimary}>＋ Account</button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[["Gross billed", fmt0(grossYTD)], ["Your commission", fmt0(commYTD)], ["Not invoiced", fmt0(uninvoiced)]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{k}</div>
            <div className="text-lg font-bold text-white leading-tight tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      {editC ? (
        <div className={card + " space-y-3"}>
          <div><label className={lbl}>Account name</label><input className={inp} value={editC.name ?? ""} placeholder="Lincoln Property Mgmt — winter 26/27" onChange={(e) => setEditC({ ...editC, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Customer</label>
              <select className={inp} value={editC.customer_id ?? ""} onChange={(e) => setEditC({ ...editC, customer_id: e.target.value, property_id: "" })}>
                <option value="">—</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Property</label>
              <select className={inp} value={editC.property_id ?? ""} onChange={(e) => setEditC({ ...editC, property_id: e.target.value })}>
                <option value="">—</option>
                {properties.filter((p) => !editC.customer_id || p.customer_id === editC.customer_id).map((p) => (
                  <option key={p.id} value={p.id}>{p.label ? `${p.label} — ${p.address}` : p.address}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Season start</label><input type="date" className={inp} value={editC.season_start ?? ""} onChange={(e) => setEditC({ ...editC, season_start: e.target.value })} /></div>
            <div><label className={lbl}>Season end</label><input type="date" className={inp} value={editC.season_end ?? ""} onChange={(e) => setEditC({ ...editC, season_end: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={lbl}>Rate type</label>
              <select className={inp} value={editC.rate_type} onChange={(e) => setEditC({ ...editC, rate_type: e.target.value })}>
                {RATE_TYPES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <div><label className={lbl}>Rate</label><input type="number" inputMode="decimal" className={inp} value={editC.rate ?? ""} onChange={(e) => setEditC({ ...editC, rate: e.target.value })} /></div>
            <div><label className={lbl}>Your %</label><input type="number" inputMode="decimal" className={inp} value={editC.commission_pct ?? 10} onChange={(e) => setEditC({ ...editC, commission_pct: e.target.value })} /></div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[11px] text-neutral-400">
            Commission is calculated on top-line gross — no costs come out before your cut.
          </div>
          <div className="flex gap-2">
            <button onClick={saveContract} disabled={busy} className={btnPrimary + " flex-1"}>{busy ? "Saving…" : "Save account"}</button>
            <button onClick={() => setEditC(null)} className={btn}>Cancel</button>
          </div>
        </div>
      ) : null}

      {contracts.map((c) => {
        const evs = eventsFor(c.id);
        const gross = evs.reduce((s, e) => s + Number(e.billed_amount || 0), 0);
        const comm = evs.reduce((s, e) => s + Number(e.commission_amount || 0), 0);
        return (
          <div key={c.id} className={card + " space-y-2" + (c.active ? "" : " opacity-60")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">{c.name}</div>
                <div className="text-[11px] text-neutral-500 truncate">
                  {[c.customer_id ? custById[c.customer_id] : null, RATE_TYPES.find((r) => r.key === c.rate_type)?.label,
                    c.rate ? fmt0(Number(c.rate)) : null, `${c.commission_pct}% to you`, c.performed_by].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => setAddE({ contract_id: c.id, event_date: todayISO(), billed_amount: "" })} className={btn}>＋ Event</button>
                <button onClick={() => setEditC({ ...c, rate: c.rate ?? "" })} className={btn}>Edit</button>
                <button onClick={() => toggleActive(c)} className={btn}>{c.active ? "Archive" : "Reopen"}</button>
                <button onClick={() => deleteContract(c)} aria-label="Delete account"
                  className="text-neutral-700 hover:text-red-400 text-sm px-1">✕</button>
              </div>
            </div>

            <div className="flex gap-3 text-[11px] text-neutral-500">
              <span>{evs.length} event{evs.length === 1 ? "" : "s"}</span>
              <span>{fmt0(gross)} gross</span>
              <span className="text-emerald-400 font-semibold">{fmt2(comm)} yours</span>
            </div>

            {addE?.contract_id === c.id ? (
              <div className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-2.5 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={lbl}>Date</label><input type="date" className={inp} value={addE.event_date} onChange={(e) => setAddE({ ...addE, event_date: e.target.value })} /></div>
                  <div><label className={lbl}>Inches</label><input type="number" inputMode="decimal" className={inp} value={addE.inches ?? ""} onChange={(e) => setAddE({ ...addE, inches: e.target.value })} /></div>
                </div>
                <div><label className={lbl}>Billed to the account (gross)</label><input type="number" inputMode="decimal" className={inp} value={addE.billed_amount} onChange={(e) => setAddE({ ...addE, billed_amount: e.target.value })} /></div>
                {addE.billed_amount ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-200">
                    Your {c.commission_pct}%: <span className="font-bold">{fmt2(Number(addE.billed_amount) * (Number(c.commission_pct) / 100))}</span>
                  </div>
                ) : null}
                <div><label className={lbl}>Notes</label><input className={inp} value={addE.description ?? ""} placeholder="Plowed and salted, 2 lots" onChange={(e) => setAddE({ ...addE, description: e.target.value })} /></div>
                <div className="flex gap-2">
                  <button onClick={saveEvent} disabled={busy} className={btnPrimary + " flex-1"}>{busy ? "Saving…" : "Log event"}</button>
                  <button onClick={() => setAddE(null)} className={btn}>Cancel</button>
                </div>
              </div>
            ) : null}

            {evs.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5">
                <div className="min-w-0">
                  <div className="text-[13px] text-white truncate">
                    {fmtDate(e.event_date)}{e.inches ? ` · ${e.inches}"` : ""} — {fmt0(Number(e.billed_amount))}
                    <span className="text-emerald-400"> ({fmt2(Number(e.commission_amount))})</span>
                  </div>
                  {e.description ? <div className="text-[11px] text-neutral-500 truncate">{e.description}</div> : null}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => toggleEvent(e, "invoiced")} className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${e.invoiced ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-neutral-700 text-neutral-500"}`}>INV</button>
                  <button onClick={() => toggleEvent(e, "paid")} className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${e.paid ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-neutral-700 text-neutral-500"}`}>PAID</button>
                  <button onClick={() => delEvent(e.id)} className="text-neutral-600 hover:text-red-400 text-xs px-1">✕</button>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {contracts.length === 0 && !editC ? (
        <div className={card}>
          <div className="text-sm font-semibold text-white">No accounts set up yet.</div>
          <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
            Add each snow account here before the season. Log an event per storm with what the account
            was billed, and your 10% is calculated and tracked — which also gives you a clean number to
            settle against the THM tab instead of reconstructing it in March.
          </p>
        </div>
      ) : null}
    </div>
  );
}
