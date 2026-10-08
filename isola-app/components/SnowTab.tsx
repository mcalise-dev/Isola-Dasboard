"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MoneyInput from "@/components/MoneyInput";
import { fmtDate, todayISO } from "@/lib/format";
import { showError, showToast, undoable } from "@/components/Toaster";
import { ask } from "@/components/Dialogs";
import { withTimeout, firstError } from "@/lib/load";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect, Field } from "@/components/ui/input";
import { PageHeader, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, Snowflake, Check, X } from "lucide-react";

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

// MoneyInput renders a raw <input>; give it the same look as the design-system Input.
const moneyCls =
  "h-10 w-full rounded-lg border border-input bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/30";

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
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editC, setEditC] = useState<any>(null);
  const [addE, setAddE] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr(null);
    try {
      const [c, e, cu, p] = await withTimeout(Promise.all([
        supabase.from("recurring_contracts").select("*").order("name"),
        supabase.from("service_events").select("*").order("event_date", { ascending: false }).limit(200),
        supabase.from("customers").select("id,name").eq("archived", false).order("name"),
        supabase.from("properties").select("id,customer_id,address,label").order("address"),
      ]));
      const fe = firstError(c, e, cu, p);
      if (fe) throw new Error(fe);
      setContracts(c.data ?? []); setEvents(e.data ?? []);
      setCustomers(cu.data ?? []); setProperties(p.data ?? []);
      setLoaded(true);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const custById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c.name])), [customers]);
  const eventsFor = (id: string) => events.filter((e) => e.contract_id === id);

  const grossYTD = events.reduce((s, e) => s + Number(e.billed_amount || 0), 0);
  const commYTD = events.reduce((s, e) => s + Number(e.commission_amount || 0), 0);
  const uninvoiced = events.filter((e) => !e.invoiced).reduce((s, e) => s + Number(e.billed_amount || 0), 0);

  async function saveContract() {
    if (!editC.name?.trim()) return showError("Name the contract.");
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
    if (error) return showError(error.message);
    setEditC(null); showToast("Account saved"); load();
  }

  async function saveEvent() {
    if (!addE.billed_amount) return showError("Enter what the account was billed — that's what the commission comes off.");
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
    if (error) return showError(error.message);
    setAddE(null); showToast("Event logged"); load();
  }

  // Deleting an account takes its events with it (FK cascade), which is why
  // the count is spelled out in the prompt rather than a bare "are you sure".
  async function deleteContract(c: any) {
    const n = eventsFor(c.id).length;
    const ok = await ask({
      title: n ? `Delete "${c.name}" and its ${n} logged event${n === 1 ? "" : "s"}?` : `Delete "${c.name}"?`,
      body: n
        ? `That removes ${fmt2(eventsFor(c.id).reduce((s: number, e: any) => s + Number(e.commission_amount || 0), 0))} of tracked commission. Consider Archive instead.`
        : undefined,
      confirm: "Delete",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("recurring_contracts").delete().eq("id", c.id);
    if (error) return showError("Delete failed: " + error.message);
    showToast("Account deleted");
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
  function delEvent(id: string) {
    const before = events;
    undoable({
      text: "Deleted event",
      hide: () => setEvents(before.filter((x) => x.id !== id)),
      restore: () => setEvents(before),
      commit: () => supabase.from("service_events").delete().eq("id", id),
    });
  }

  const newAccount = () => setEditC({ service_type: "snow", rate_type: "per_event", commission_pct: 10, performed_by: "THM", active: true });

  const header = (
    <PageHeader
      title="Recurring"
      sub="Snow and seasonal accounts — your commission is 10% of top-line gross"
      actions={<Button onClick={newAccount}><Plus size={16} /> Account</Button>}
    />
  );

  if (err) return <div>{header}<LoadError message={err} onRetry={load} /></div>;
  if (!loaded) return <div>{header}<ListSkeleton /></div>;

  return (
    <div className="space-y-5 pb-28">
      {header}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Gross billed" value={fmt0(grossYTD)} />
        <Stat label="Your commission" value={fmt0(commYTD)} tone={commYTD ? "ok" : undefined} />
        <Stat label="Not invoiced" value={fmt0(uninvoiced)} tone={uninvoiced ? "warn" : undefined} />
      </div>

      {editC ? (
        <Card className="space-y-3 p-4">
          <Field label="Account name"><Input value={editC.name ?? ""} placeholder="Lincoln Property Mgmt — winter 26/27" onChange={(e) => setEditC({ ...editC, name: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer">
              <NativeSelect value={editC.customer_id ?? ""} onChange={(e) => setEditC({ ...editC, customer_id: e.target.value, property_id: "" })}>
                <option value="">—</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Property">
              <NativeSelect value={editC.property_id ?? ""} onChange={(e) => setEditC({ ...editC, property_id: e.target.value })}>
                <option value="">—</option>
                {properties.filter((p) => !editC.customer_id || p.customer_id === editC.customer_id).map((p) => (
                  <option key={p.id} value={p.id}>{p.label ? `${p.label} — ${p.address}` : p.address}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Season start"><Input type="date" value={editC.season_start ?? ""} onChange={(e) => setEditC({ ...editC, season_start: e.target.value })} /></Field>
            <Field label="Season end"><Input type="date" value={editC.season_end ?? ""} onChange={(e) => setEditC({ ...editC, season_end: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Rate type">
              <NativeSelect value={editC.rate_type} onChange={(e) => setEditC({ ...editC, rate_type: e.target.value })}>
                {RATE_TYPES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Rate"><MoneyInput className={moneyCls} value={editC.rate ?? ""} onChange={(v) => setEditC({ ...editC, rate: v })} /></Field>
            <Field label="Your %"><Input type="number" inputMode="decimal" value={editC.commission_pct ?? 10} onChange={(e) => setEditC({ ...editC, commission_pct: e.target.value })} /></Field>
          </div>
          <div className="rounded-lg border border-border bg-neutral-950 px-3 py-2 text-xs text-neutral-400">
            Commission is calculated on top-line gross — no costs come out before your cut.
          </div>
          <div className="flex gap-2">
            <Button onClick={saveContract} disabled={busy} className="flex-1">{busy ? "Saving…" : "Save account"}</Button>
            <Button variant="outline" onClick={() => setEditC(null)}>Cancel</Button>
          </div>
        </Card>
      ) : null}

      {contracts.length ? (
        <div className="grid items-start gap-3 md:grid-cols-2">
          {contracts.map((c) => {
            const evs = eventsFor(c.id);
            const gross = evs.reduce((s, e) => s + Number(e.billed_amount || 0), 0);
            const comm = evs.reduce((s, e) => s + Number(e.commission_amount || 0), 0);
            return (
              <Card key={c.id} className={cn("space-y-3 p-4", !c.active && "opacity-60")}>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-white">{c.name}</div>
                  <div className="truncate text-xs text-neutral-400">
                    {[c.customer_id ? custById[c.customer_id] : null, RATE_TYPES.find((r) => r.key === c.rate_type)?.label,
                      c.rate ? fmt0(Number(c.rate)) : null, `${c.commission_pct}% to you`, c.performed_by].filter(Boolean).join(" · ")}
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-400">
                  <span>{evs.length} event{evs.length === 1 ? "" : "s"}</span>
                  <span className="tabular-nums">{fmt0(gross)} gross</span>
                  <span className="font-semibold tabular-nums text-emerald-400">{fmt2(comm)} yours</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="h-10" onClick={() => setAddE({ contract_id: c.id, event_date: todayISO(), billed_amount: "" })}><Plus size={14} /> Event</Button>
                  <Button size="sm" variant="outline" className="h-10" onClick={() => setEditC({ ...c, rate: c.rate ?? "" })}><Pencil size={14} /> Edit</Button>
                  <Button size="sm" variant="outline" className="h-10" onClick={() => toggleActive(c)}>
                    {c.active ? <><Archive size={14} /> Archive</> : <><ArchiveRestore size={14} /> Reopen</>}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteContract(c)} aria-label="Delete account" className="ml-auto text-neutral-500 hover:text-red-400"><Trash2 size={15} /></Button>
                </div>

                {addE?.contract_id === c.id ? (
                  <div className="space-y-3 rounded-lg border border-border bg-neutral-950 p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Date"><Input type="date" value={addE.event_date} onChange={(e) => setAddE({ ...addE, event_date: e.target.value })} /></Field>
                      <Field label="Inches"><Input type="number" inputMode="decimal" value={addE.inches ?? ""} onChange={(e) => setAddE({ ...addE, inches: e.target.value })} /></Field>
                    </div>
                    <Field label="Billed to the account (gross)"><MoneyInput className={moneyCls} value={addE.billed_amount} onChange={(v) => setAddE({ ...addE, billed_amount: v })} /></Field>
                    {addE.billed_amount ? (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                        Your {c.commission_pct}%: <span className="font-bold">{fmt2(Number(addE.billed_amount) * (Number(c.commission_pct) / 100))}</span>
                      </div>
                    ) : null}
                    <Field label="Notes"><Input value={addE.description ?? ""} placeholder="Plowed and salted, 2 lots" onChange={(e) => setAddE({ ...addE, description: e.target.value })} /></Field>
                    <div className="flex gap-2">
                      <Button onClick={saveEvent} disabled={busy} className="flex-1">{busy ? "Saving…" : "Log event"}</Button>
                      <Button variant="outline" onClick={() => setAddE(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : null}

                {evs.length ? (
                  <div className="overflow-hidden rounded-lg border border-border">
                    {evs.slice(0, 8).map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-2 border-b border-border bg-neutral-950 px-3 py-2 last:border-0">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] text-white">
                            {fmtDate(e.event_date)}{e.inches ? ` · ${e.inches}"` : ""} — {fmt0(Number(e.billed_amount))}
                            <span className="text-emerald-400"> ({fmt2(Number(e.commission_amount))})</span>
                          </div>
                          {e.description ? <div className="truncate text-xs text-neutral-400">{e.description}</div> : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button onClick={() => toggleEvent(e, "invoiced")} aria-pressed={!!e.invoiced}
                            className={cn("inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-bold", e.invoiced ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-border text-neutral-400 hover:text-white")}>
                            {e.invoiced ? <Check size={12} /> : null}INV
                          </button>
                          <button onClick={() => toggleEvent(e, "paid")} aria-pressed={!!e.paid}
                            className={cn("inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-bold", e.paid ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-border text-neutral-400 hover:text-white")}>
                            {e.paid ? <Check size={12} /> : null}PAID
                          </button>
                          <Button size="icon-sm" variant="ghost" onClick={() => delEvent(e.id)} aria-label="Delete event" className="text-neutral-500 hover:text-red-400"><X size={14} /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : null}

      {contracts.length === 0 && !editC ? (
        <Empty
          icon={<Snowflake size={26} />}
          title="No accounts set up yet"
          body="Add each snow account here before the season. Log an event per storm with what the account was billed, and your 10% is calculated and tracked — which also gives you a clean number to settle against the THM tab instead of reconstructing it in March."
          action={<Button variant="outline" size="sm" onClick={newAccount}><Plus size={15} /> Add an account</Button>}
        />
      ) : null}
    </div>
  );
}
