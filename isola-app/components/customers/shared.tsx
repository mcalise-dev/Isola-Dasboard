"use client";
// Shared pieces for the v4.6 customer list and customer record.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { STATUS_META, parsePrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { showToast, showError } from "@/components/Toaster";

export const TYPES: Record<string, { label: string; hint: string }> = {
  medical: { label: "Medical", hint: "Highest tier — price at the top of the range." },
  property_mgmt: { label: "Property mgmt", hint: "Commercial tier — above residential." },
  commercial: { label: "Commercial", hint: "Commercial tier — above residential." },
  municipal: { label: "Municipal", hint: "Prevailing-wage / bid rules may apply." },
  partner: { label: "Partner", hint: "Partner work — check the THM ledger." },
  residential: { label: "Residential", hint: "Standard tier. $35/sq ft floor on pavers." },
};
export const LEAD_SOURCES = ["Referral", "Repeat customer", "Google", "Facebook", "Instagram", "Truck / signage", "Drove by", "Property manager", "THM", "Other"];

export const money0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const money2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const tel = (p: any) => String(p ?? "").replace(/[^0-9+]/g, "");
export const digits = (s: any) => String(s ?? "").replace(/\D/g, "").slice(-10);
export const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const lower = (s: any) => String(s ?? "").trim().toLowerCase();
export const jobPrice = (j: any) => Number(j?.price_amount) || parsePrice(j?.price);
export const jobName = (j: any) => j?.job_name || j?.location || j?.customer || "Job";
export const OPEN = ["lead", "awaiting", "booked", "progress"] as const;
export const changed = () => window.dispatchEvent(new Event("isola:changed"));

// most recent meaningful date on a job
export const jobDate = (j: any): string => (j.completed_date || j.start_date || j.quoted_date || String(j.created_at ?? "").slice(0, 10) || "");

// customer → jobs: jobs.customer_id first, falling back to a case-insensitive name match
export function jobsByCustomer(customers: any[], jobs: any[]) {
  const byName: Record<string, string> = {};
  customers.forEach((c) => { const k = lower(c.name); if (k && !byName[k]) byName[k] = c.id; });
  const ids = new Set(customers.map((c) => c.id));
  const out: Record<string, any[]> = {};
  jobs.forEach((j) => {
    const cid = j.customer_id && ids.has(j.customer_id) ? j.customer_id : byName[lower(j.customer)];
    if (cid) (out[cid] = out[cid] ?? []).push(j);
  });
  return out;
}

// QuickBooks open invoices for a customer (name or any qbo_names alias, case-insensitive)
export function invoicesFor(c: any, snap: any) {
  const names = new Set([c.name, ...(c.qbo_names ?? [])].map(lower).filter(Boolean));
  return (snap?.invoices ?? []).filter((i: any) => names.has(lower(i.customer)));
}

export function StageChip({ status, className }: { status: string; className?: string }) {
  const m = STATUS_META[status] ?? STATUS_META.lead;
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold", m.cls, className)}>{m.label}</span>;
}

// small stage-count chips: "To Quote 2 · Sent 1"
export function StageCounts({ jobs, className }: { jobs: any[]; className?: string }) {
  const counts = OPEN.map((s) => ({ s, n: jobs.filter((j) => j.status === s).length })).filter((x) => x.n);
  if (!counts.length) return <span className="text-xs text-neutral-500">—</span>;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {counts.map(({ s, n }) => (
        <span key={s} className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[11px] font-semibold tabular-nums", STATUS_META[s].cls)}>
          {STATUS_META[s].label} {n}
        </span>
      ))}
    </span>
  );
}

const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

// ---------- new customer (with duplicate-spelling guard) ----------
export function NewCustomerDialog({ open, onOpenChange, supabase, customers, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; supabase: any; customers: any[]; onSaved: (id: string) => void }) {
  const blank = { name: "", kind: "company", contact_name: "", phone: "", email: "", address: "", client_type: "residential" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(blank); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));
  const exact = useMemo(() => customers.find((c) => lower(c.name) === lower(f.name) && f.name.trim()), [customers, f.name]);
  const similar = useMemo(() => {
    const n = norm(f.name);
    if (n.length < 3 || exact) return [];
    return customers.filter((c) => { const m = norm(c.name); return m && (m.startsWith(n) || n.startsWith(m) || (digits(f.phone) && digits(f.phone) === digits(c.phone))); }).slice(0, 3);
  }, [customers, f.name, f.phone, exact]);

  async function save() {
    if (!f.name.trim()) { showError("Name is required."); return; }
    if (exact) return;
    setBusy(true);
    const { data, error } = await supabase.from("customers").insert({ ...f, name: f.name.trim(), client_since: new Date().toISOString().slice(0, 10) }).select("id").single();
    setBusy(false);
    if (error) { showError(error.message.includes("duplicate") ? "You already have a customer with that name." : "Save failed: " + error.message); return; }
    showToast("Customer added");
    changed();
    onSaved(data.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>Properties, extra contacts, tags and notes live on the record once it exists.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Customer or company name"><Input autoFocus value={f.name} onChange={set("name")} /></Field>
          {exact ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              “{exact.name}” already exists. <Link href={`/customers/${exact.id}`} className="font-semibold underline" onClick={() => onOpenChange(false)}>Open that record</Link>{exact.archived ? " (archived)" : ""}
            </div>
          ) : similar.length ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Did you mean{" "}
              {similar.map((c, i) => (
                <span key={c.id}>{i ? ", " : ""}<Link href={`/customers/${c.id}`} className="font-semibold underline" onClick={() => onOpenChange(false)}>{c.name}</Link></span>
              ))}
              ? Use the existing record so jobs stay under one spelling.
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind"><NativeSelect value={f.kind} onChange={set("kind")}><option value="company">Company</option><option value="individual">Individual</option></NativeSelect></Field>
            <Field label="Client type"><NativeSelect value={f.client_type} onChange={set("client_type")}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</NativeSelect></Field>
          </div>
          <Field label="Contact person"><Input value={f.contact_name} onChange={set("contact_name")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><Input inputMode="tel" value={f.phone} onChange={set("phone")} /></Field>
            <Field label="Email"><Input inputMode="email" value={f.email} onChange={set("email")} /></Field>
          </div>
          <Field label="Billing address"><Input value={f.address} onChange={set("address")} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !!exact || !f.name.trim()}>{busy ? "Saving…" : "Add customer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- edit customer (every field, incl. archive) ----------
export function EditCustomerDialog({ c, open, onOpenChange, supabase, customers, onSaved }: { c: any; open: boolean; onOpenChange: (o: boolean) => void; supabase: any; customers?: any[]; onSaved: () => void }) {
  const init = () => ({
    name: c?.name ?? "", kind: c?.kind ?? "company", contact_name: c?.contact_name ?? "", phone: c?.phone ?? "",
    email: c?.email ?? "", address: c?.address ?? "", client_type: c?.client_type ?? "residential",
    lead_source: c?.lead_source ?? "", payment_terms: c?.payment_terms ?? "", client_since: c?.client_since ?? "",
    tags: (c?.tags ?? []).join(", "), qbo_names: (c?.qbo_names ?? []).join(", "), notes: c?.notes ?? "", archived: !!c?.archived,
    referral_partner: !!c?.referral_partner,
  });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(init()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));
  const clash = (customers ?? []).find((x) => x.id !== c?.id && lower(x.name) === lower(f.name));

  async function save() {
    if (!f.name.trim()) { showError("Name is required."); return; }
    if (clash) return;
    setBusy(true);
    const { error } = await supabase.from("customers").update({
      ...f, name: f.name.trim(), tags: split(f.tags), qbo_names: split(f.qbo_names),
      client_since: f.client_since || null, updated_at: new Date().toISOString(),
    }).eq("id", c.id);
    setBusy(false);
    if (error) { showError(error.message.includes("duplicate") ? "Another customer already has that name." : "Save failed: " + error.message); return; }
    showToast("Saved");
    changed();
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader><DialogTitle>Edit customer</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><Input value={f.name} onChange={set("name")} /></Field>
          {clash ? <p className="-mt-1 text-sm text-amber-300 sm:col-span-2">“{clash.name}” already exists — <Link className="underline" href={`/customers/${clash.id}`}>open it</Link> or merge the two from the customer list.</p> : null}
          <Field label="Kind"><NativeSelect value={f.kind} onChange={set("kind")}><option value="company">Company</option><option value="individual">Individual</option></NativeSelect></Field>
          <Field label="Client type"><NativeSelect value={f.client_type} onChange={set("client_type")}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</NativeSelect></Field>
          <Field label="Main contact"><Input value={f.contact_name} onChange={set("contact_name")} /></Field>
          <Field label="Phone"><Input inputMode="tel" value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Email" className="sm:col-span-2"><Input inputMode="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="Billing address" className="sm:col-span-2"><Input value={f.address} onChange={set("address")} /></Field>
          <Field label="Lead source"><NativeSelect value={f.lead_source} onChange={set("lead_source")}><option value="">—</option>{LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}{f.lead_source && !LEAD_SOURCES.includes(f.lead_source) ? <option value={f.lead_source}>{f.lead_source}</option> : null}</NativeSelect></Field>
          <Field label="Client since"><Input type="date" value={f.client_since} onChange={set("client_since")} /></Field>
          <Field label="Payment terms" className="sm:col-span-2"><Input value={f.payment_terms} onChange={set("payment_terms")} placeholder="Net 30, 50% deposit…" /></Field>
          <Field label="Tags — comma separated" className="sm:col-span-2"><Input value={f.tags} onChange={set("tags")} placeholder="snow, repeat, net-30" /></Field>
          <Field label="QuickBooks name(s) — comma separated, if spelled differently there" className="sm:col-span-2"><Input value={f.qbo_names} onChange={set("qbo_names")} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={f.notes} onChange={set("notes")} /></Field>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" className="h-4 w-4 accent-white" checked={f.referral_partner} onChange={(e) => setF((s) => ({ ...s, referral_partner: e.target.checked }))} /> Referral partner
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" className="h-4 w-4 accent-white" checked={f.archived} onChange={(e) => setF((s) => ({ ...s, archived: e.target.checked }))} /> Archived — hide from the main list
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !!clash}>{busy ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- property ----------
export function PropertyDialog({ p, open, onOpenChange, supabase, customerId, onSaved }: { p: any | null; open: boolean; onOpenChange: (o: boolean) => void; supabase: any; customerId: string; onSaved: () => void }) {
  const init = () => ({ label: p?.label ?? "", address: p?.address ?? "", city: p?.city ?? "", state: p?.state ?? "", zip: p?.zip ?? "", access_notes: p?.access_notes ?? "", notes: p?.notes ?? "" });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(init()); }, [open, p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save() {
    if (!f.address.trim()) { showError("Address is required."); return; }
    setBusy(true);
    const row = { ...f, customer_id: customerId, address: f.address.trim(), updated_at: new Date().toISOString() };
    const { error } = p ? await supabase.from("properties").update(row).eq("id", p.id) : await supabase.from("properties").insert(row);
    setBusy(false);
    if (error) { showError("Save failed: " + error.message); return; }
    showToast(p ? "Property saved" : "Property added");
    changed();
    onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{p ? "Edit property" : "Add property"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Nickname (optional)"><Input value={f.label} onChange={set("label")} placeholder="Building A, rear lot…" /></Field>
          <Field label="Address"><Input value={f.address} onChange={set("address")} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="City"><Input value={f.city} onChange={set("city")} /></Field>
            <Field label="State"><Input value={f.state} onChange={set("state")} /></Field>
            <Field label="Zip"><Input inputMode="numeric" value={f.zip} onChange={set("zip")} /></Field>
          </div>
          <Field label="Access notes — gates, hand-dig, no equipment, where to park"><Textarea rows={2} value={f.access_notes} onChange={set("access_notes")} /></Field>
          <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={set("notes")} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- contact person ----------
export function ContactDialog({ p, open, onOpenChange, supabase, customerId, onSaved, onRemove }: { p: any | null; open: boolean; onOpenChange: (o: boolean) => void; supabase: any; customerId: string; onSaved: () => void; onRemove?: (p: any) => void }) {
  const init = () => ({ name: p?.name ?? "", role: p?.role ?? "", phone: p?.phone ?? "", email: p?.email ?? "", is_billing: !!p?.is_billing, notes: p?.notes ?? "" });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(init()); }, [open, p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save() {
    if (!f.name.trim()) { showError("Name is required."); return; }
    setBusy(true);
    const row = { ...f, customer_id: customerId, name: f.name.trim() };
    const { error } = p ? await supabase.from("customer_contacts").update(row).eq("id", p.id) : await supabase.from("customer_contacts").insert(row);
    setBusy(false);
    if (error) { showError("Save failed: " + error.message); return; }
    showToast(p ? "Saved" : "Person added");
    changed();
    onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{p ? "Edit person" : "Add person"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><Input value={f.name} onChange={set("name")} /></Field>
            <Field label="Role"><Input value={f.role} onChange={set("role")} placeholder="Property manager, super…" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><Input inputMode="tel" value={f.phone} onChange={set("phone")} /></Field>
            <Field label="Email"><Input inputMode="email" value={f.email} onChange={set("email")} /></Field>
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" className="h-4 w-4 accent-white" checked={f.is_billing} onChange={(e) => setF((s) => ({ ...s, is_billing: e.target.checked }))} /> Billing contact — this is who gets the invoice
          </label>
          <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={set("notes")} /></Field>
        </div>
        <DialogFooter className="sm:justify-between">
          {p && onRemove ? <Button variant="destructive" onClick={() => { onOpenChange(false); onRemove(p); }}>Remove</Button> : <span />}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- merge ----------
export function PickTwoDialog({ open, onOpenChange, rows, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; rows: any[]; onPick: (a: any, b: any) => void }) {
  const [a, setA] = useState(""); const [b, setB] = useState("");
  useEffect(() => { if (open) { setA(""); setB(""); } }, [open]);
  const ra = rows.find((r) => r.id === a), rb = rows.find((r) => r.id === b);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Merge two customers</DialogTitle><DialogDescription>Pick the two records that are the same customer.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Field label="First"><NativeSelect value={a} onChange={(e) => setA(e.target.value)}><option value="">Pick a customer…</option>{rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</NativeSelect></Field>
          <Field label="Second"><NativeSelect value={b} onChange={(e) => setB(e.target.value)}><option value="">Pick a customer…</option>{rows.filter((r) => r.id !== a).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</NativeSelect></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!ra || !rb} onClick={() => ra && rb && onPick(ra, rb)}>Next — choose which to keep</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MergeDialog({ pair, onOpenChange, supabase, jobsFor, propsFor, onDone }: { pair: { a: any; b: any } | null; onOpenChange: (o: boolean) => void; supabase: any; jobsFor: (id: string) => any[]; propsFor: (id: string) => any[]; onDone: () => void }) {
  const score = (c: any) => jobsFor(c.id).length + (c.email ? 1 : 0) + (c.address ? 1 : 0) + (c.notes ? 1 : 0);
  const [keepId, setKeepId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (pair) { setKeepId(score(pair.a) >= score(pair.b) ? pair.a.id : pair.b.id); setErr(""); } }, [pair]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pair) return <Dialog open={false} onOpenChange={onOpenChange} />;
  const { a, b } = pair;
  const keep = keepId === a.id ? a : b;
  const dead = keepId === a.id ? b : a;

  async function go() {
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("merge_customers", { p_keep: keep.id, p_dead: dead.id });
    setBusy(false);
    if (error || !data?.ok) { setErr(error?.message ?? data?.error ?? "Merge failed"); return; }
    showToast(`Merged into ${keep.name}`);
    changed();
    onDone();
  }
  const card = (c: any) => {
    const picked = keepId === c.id;
    return (
      <button type="button" key={c.id} onClick={() => setKeepId(c.id)}
        className={cn("w-full rounded-xl border px-3 py-2.5 text-left", picked ? "border-white/60 bg-white/[0.06]" : "border-border bg-neutral-950 hover:border-white/20")}>
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-semibold text-white">{c.name}</div>
          {picked ? <span className="shrink-0 text-xs font-semibold text-emerald-300">Keep this name</span> : null}
        </div>
        <div className="mt-1 space-y-0.5 text-xs text-neutral-400">
          <div>{c.contact_name || "—"}{c.phone ? " · " + c.phone : ""}</div>
          {c.email ? <div className="truncate">{c.email}</div> : null}
          {c.address ? <div className="truncate">{c.address}</div> : null}
          <div>{jobsFor(c.id).length} job{jobsFor(c.id).length === 1 ? "" : "s"} · {propsFor(c.id).length} propert{propsFor(c.id).length === 1 ? "y" : "ies"}</div>
        </div>
      </button>
    );
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge into one customer</DialogTitle>
          <DialogDescription>Pick the name to keep. Jobs, properties, notes and contacts all move onto it — nothing is thrown away.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">{card(a)}{card(b)}</div>
        <p className="mt-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-neutral-400">
          Keeping <span className="font-semibold text-white">{keep.name}</span>. Everything under <span className="font-semibold text-white">{dead.name}</span> moves across, and “{dead.name}” is kept as a QuickBooks alias so invoices under the old name still match.
        </p>
        {err ? <p className="mt-2 text-sm text-red-300">{err}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={go} disabled={busy}>{busy ? "Merging…" : `Merge into ${keep.name}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
