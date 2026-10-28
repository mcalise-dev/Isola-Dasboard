"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STATUS_META } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { showToast, showError } from "@/components/Toaster";

// v4.6: one add/edit job form for the whole app. Open it with
//   window.dispatchEvent(new CustomEvent("isola:new-job"))            → new job
//   window.dispatchEvent(new CustomEvent("isola:new-job", { detail: job })) → edit that job
// Same rules as before: the customer is picked from the list (no new spellings) and the
// address is tied to one of the customer's properties.
const STATUSES = ["lead", "quote", "awaiting", "future", "booked", "progress", "complete", "lost"] as const;
export const LEAD_SOURCES = ["Referral", "Repeat customer", "Property manager", "Cold outreach", "LinkedIn", "Website", "Google", "Drive-by / sign", "THM", "Other"];
const empty = { job_name: "", customer: "", customer_id: "", location: "", property_id: "", job: "", status: "lead", price: "", contact_name: "", contact_phone: "", notes: "", scope_of_work: "", lead_source: "", referred_by: "", contract_holder: "isola", partner: "", thm_deal: "" };

export function editJob(job?: any) { window.dispatchEvent(new CustomEvent("isola:new-job", { detail: job ?? null })); }

export default function JobForm() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>(empty);
  const [customers, setCustomers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [newCustomer, setNewCustomer] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const on = (e: Event) => {
      const j = (e as CustomEvent).detail;
      // a detail with no id is a pre-filled NEW job (e.g. New project → status booked)
      setEditing(j?.id ? j : null);
      setNewCustomer(false);
      setForm(j ? { ...empty, ...Object.fromEntries(Object.keys(empty).filter((k) => j[k] != null).map((k) => [k, j[k]])) } : { ...empty });
      setOpen(true);
      supabase.from("customers").select("id,name,contact_name,phone,archived,lead_source").eq("archived", false).order("name").then(({ data }: any) => setCustomers(data ?? []));
      supabase.from("properties").select("id,customer_id,label,address").order("address").then(({ data }: any) => setProperties(data ?? []));
    };
    window.addEventListener("isola:new-job", on);
    return () => window.removeEventListener("isola:new-job", on);
  }, [supabase]);

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  async function save() {
    if (!form.customer.trim()) { showError("Pick a customer, or add a new one."); return; }
    setBusy(true);
    const payload: any = { ...form, updated_at: new Date().toISOString() };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    payload.customer = form.customer.trim();
    let cid = form.customer_id || null;
    if (!cid) {
      const hit = customers.find((c) => String(c.name).toLowerCase() === payload.customer.toLowerCase());
      // the list only holds active customers: also check archived ones (case-insensitive) so
      // a job never creates a second spelling, and always store the record's exact spelling
      const found = hit ?? (await supabase.from("customers").select("id,name").ilike("name", payload.customer.replace(/[%_\\]/g, (m: string) => "\\" + m)).limit(1)).data?.[0];
      if (found) { cid = found.id; payload.customer = found.name; }
      else {
        const { data: made, error } = await supabase.from("customers").insert({ name: payload.customer, contact_name: payload.contact_name, phone: payload.contact_phone, lead_source: payload.lead_source }).select("id").single();
        if (error) { setBusy(false); showError("Could not create the customer: " + error.message); return; }
        cid = made.id;
      }
    }
    payload.customer_id = cid;
    if (!payload.property_id && payload.location) {
      const ph = properties.find((p) => p.customer_id === cid && String(p.address).toLowerCase() === String(payload.location).toLowerCase());
      if (ph) payload.property_id = ph.id;
      else {
        const { data: mp } = await supabase.from("properties").insert({ customer_id: cid, address: payload.location }).select("id").single();
        if (mp) payload.property_id = mp.id;
      }
    }
    // THM: a THM-held job always has THM on it; no THM means no deal
    payload.contract_holder = form.contract_holder === "thm" ? "thm" : "isola";
    if (payload.contract_holder === "thm") payload.partner = "THM";
    payload.partner = payload.partner === "THM" ? "THM" : null;
    payload.thm_deal = payload.partner ? (form.thm_deal || "reimburse") : null;
    if (payload.status === "complete" && !editing?.completed_date) payload.completed_date = new Date().toISOString().slice(0, 10);
    const res = editing
      ? await supabase.from("jobs").update(payload).eq("id", editing.id).select("id").single()
      : await supabase.from("jobs").insert(payload).select("id").single();
    setBusy(false);
    if (res.error) { showError("Save failed: " + res.error.message); return; }
    setOpen(false);
    window.dispatchEvent(new Event("isola:changed"));
    showToast(editing ? "Job saved" : "Job added");
    if (!editing && res.data?.id) router.push(`/jobs/${res.data.id}`);
  }

  async function remove() {
    if (!editing) return;
    const nm = editing.job_name || [editing.customer, editing.location].filter(Boolean).join(" — ") || "this job";
    if (!window.confirm(`Delete "${nm}"?\n\nRemoves the job with its photos, schedule entries, checklist and jobbook. This can't be undone.`)) return;
    setBusy(true);
    const { error } = await supabase.from("jobs").delete().eq("id", editing.id);
    setBusy(false);
    if (error) { showError("Delete failed: " + error.message); return; }
    setOpen(false);
    window.dispatchEvent(new Event("isola:changed"));
    showToast("Job deleted");
    router.push("/");
  }

  const theirProps = properties.filter((p) => p.customer_id === form.customer_id);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit job" : ["booked", "progress"].includes(form.status) ? "New project" : form.status === "lead" ? "New lead" : "New job"}</DialogTitle>
          <DialogDescription>The job name is used everywhere: dashboard, files, ledger and QuickBooks.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Job name" className="sm:col-span-2"><Input autoFocus placeholder="e.g. 59 Cedar St" value={form.job_name} onChange={(e) => set({ job_name: e.target.value })} /></Field>
          <Field label="Customer *" className="sm:col-span-2">
            {newCustomer ? (
              <div className="flex gap-2">
                <Input autoFocus placeholder="New customer name" value={form.customer} onChange={(e) => set({ customer: e.target.value, customer_id: "" })} />
                <Button variant="outline" onClick={() => { setNewCustomer(false); set({ customer: "", customer_id: "" }); }}>Cancel</Button>
              </div>
            ) : (
              <NativeSelect value={form.customer_id} onChange={(e) => {
                if (e.target.value === "__new") { setNewCustomer(true); set({ customer: "", customer_id: "", property_id: "" }); return; }
                const c = customers.find((x) => x.id === e.target.value);
                set({ customer_id: e.target.value, customer: c?.name ?? "", property_id: "", contact_name: form.contact_name || c?.contact_name || "", contact_phone: form.contact_phone || c?.phone || "", lead_source: form.lead_source || c?.lead_source || "" });
              }}>
                <option value="">Pick a customer…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__new">+ New customer…</option>
              </NativeSelect>
            )}
            {!newCustomer && form.customer && !form.customer_id ? <p className="mt-1 text-xs text-amber-300">Saved as “{form.customer}”. Pick it from the list to tie it to the customer record.</p> : null}
          </Field>
          {form.customer_id && theirProps.length ? (
            <Field label="Property" className="sm:col-span-2">
              <NativeSelect value={form.property_id} onChange={(e) => { const p = properties.find((x) => x.id === e.target.value); set({ property_id: e.target.value, location: p ? p.address : form.location }); }}>
                <option value="">+ New address, type it below</option>
                {theirProps.map((p) => <option key={p.id} value={p.id}>{p.label ? p.label + " — " : ""}{p.address}</option>)}
              </NativeSelect>
            </Field>
          ) : null}
          <Field label="Location"><Input value={form.location} onChange={(e) => set({ location: e.target.value })} /></Field>
          <Field label="Work type"><Input placeholder="Concrete pad, wall repair…" value={form.job} onChange={(e) => set({ job: e.target.value })} /></Field>
          <Field label="Stage">
            <NativeSelect value={form.status} onChange={(e) => set({ status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Price"><Input placeholder="$9,800 or T&M" value={form.price} onChange={(e) => set({ price: e.target.value })} /></Field>
          <Field label="Contact name"><Input value={form.contact_name} onChange={(e) => set({ contact_name: e.target.value })} /></Field>
          <Field label="Contact phone"><Input inputMode="tel" value={form.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} /></Field>
          <Field label="Lead source">
            <NativeSelect value={form.lead_source} onChange={(e) => set({ lead_source: e.target.value })}>
              <option value="">Not set</option>
              {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Referred by"><Input placeholder="Who sent it (if a referral)" value={form.referred_by} onChange={(e) => set({ referred_by: e.target.value })} /></Field>
          <Field label="Contract holder">
            <NativeSelect value={form.contract_holder || "isola"} onChange={(e) => set({ contract_holder: e.target.value, ...(e.target.value === "thm" ? { partner: "THM", thm_deal: form.thm_deal || "reimburse" } : {}) })}>
              <option value="isola">Isola (my contract)</option>
              <option value="thm">THM (Tyler's contract)</option>
            </NativeSelect>
          </Field>
          <Field label="Is THM on this job?">
            <NativeSelect value={form.contract_holder === "thm" || form.partner === "THM" ? "yes" : "no"} disabled={form.contract_holder === "thm"}
              onChange={(e) => set(e.target.value === "yes" ? { partner: "THM", thm_deal: form.thm_deal || "reimburse" } : { partner: "", thm_deal: "" })}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </NativeSelect>
          </Field>
          {form.contract_holder === "thm" || form.partner === "THM" ? (
            <Field label="Deal with THM" className="sm:col-span-2">
              <NativeSelect value={form.thm_deal || "reimburse"} onChange={(e) => set({ thm_deal: e.target.value })}>
                <option value="reimburse">Reimburse time and equipment (truck, machines, labor), no profit split</option>
                <option value="split">50/50 split of net profit</option>
              </NativeSelect>
              <p className="mt-1 text-xs text-neutral-500">
                {form.contract_holder === "thm" ? "THM holds it: what THM owes you goes on the job's THM tab and onto the running tab."
                  : "You hold it: what you owe THM goes on the job's THM tab and onto the running tab."}
              </p>
            </Field>
          ) : null}
          <Field label="Scope of work" className="sm:col-span-2"><Textarea rows={3} value={form.scope_of_work} onChange={(e) => set({ scope_of_work: e.target.value })} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          {editing ? <Button variant="destructive" className="sm:mr-auto" onClick={remove} disabled={busy}>Delete job</Button> : null}
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add job"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
