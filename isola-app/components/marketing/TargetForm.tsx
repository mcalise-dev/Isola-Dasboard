"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SECTORS, PTYPES } from "@/lib/crm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input, NativeSelect, Field, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/Toaster";
import { MContact, changed } from "./lib";

const blank = { name: "", company: "", title: "", phone: "", email: "", linkedin: "", tier: "B", sector: "Medical", prospect_type: "Property Manager", next_action: "", next_date: "", buildings: "", angle: "" };

/** Add (contact = null) or edit a target. */
export default function TargetForm({ open, onOpenChange, contact, defaults, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; contact?: MContact | null; defaults?: Partial<typeof blank>; onSaved: (c: MContact) => void;
}) {
  const [f, setF] = useState<typeof blank>(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(contact ? {
      name: contact.name ?? "", company: contact.company ?? "", title: contact.title ?? "", phone: contact.phone ?? "", email: contact.email ?? "",
      linkedin: contact.linkedin ?? "", tier: contact.tier ?? "B", sector: contact.sector ?? "Medical", prospect_type: contact.prospect_type ?? "Property Manager",
      next_action: contact.next_action ?? "", next_date: contact.next_date ?? "", buildings: contact.buildings ?? "", angle: contact.angle ?? "",
    } : { ...blank, ...(defaults ?? {}) });
  }, [open, contact, defaults]);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save() {
    if (!f.name.trim()) { showToast("Name is required"); return; }
    setBusy(true);
    const sb = createClient();
    const payload: any = {
      ...f, name: f.name.trim(), company: f.company.trim() || null, title: f.title || null, phone: f.phone || null, email: f.email || null,
      linkedin: f.linkedin || null, next_action: f.next_action || null, next_date: f.next_date || null, buildings: f.buildings || null, angle: f.angle || null,
      lead_score: f.tier === "A" ? 3 : f.tier === "B" ? 2 : 1, updated_at: new Date().toISOString(),
    };
    const res = contact
      ? await sb.from("contacts").update(payload).eq("id", contact.id).select("*").single()
      : await sb.from("contacts").insert({ ...payload, stage: "Not started", li_status: "Not Contacted", em_status: "Not Contacted", industry: f.sector === "Medical" ? "medical property" : null }).select("*").single();
    setBusy(false);
    if (res.error) { alert("Save failed: " + res.error.message); return; }
    showToast(contact ? "Saved" : "Target added");
    changed();
    onSaved(res.data as MContact);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{contact ? "Edit target" : "Add target"}</DialogTitle>
          <DialogDescription>{contact ? "Contact details for this target." : "A person at an account you want work from."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={f.name} onChange={set("name")} autoFocus /></Field>
          <Field label="Company"><Input value={f.company} onChange={set("company")} /></Field>
          <Field label="Title"><Input value={f.title} onChange={set("title")} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
          <Field label="Email"><Input value={f.email} onChange={set("email")} inputMode="email" /></Field>
          <Field label="LinkedIn URL"><Input value={f.linkedin} onChange={set("linkedin")} placeholder="https://linkedin.com/in/…" /></Field>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <Field label="Tier"><NativeSelect value={f.tier} onChange={set("tier")}>{["A", "B", "C", "Broker", "Client"].map((t) => <option key={t}>{t}</option>)}</NativeSelect></Field>
            <Field label="Sector"><NativeSelect value={f.sector} onChange={set("sector")}>{SECTORS.map((t) => <option key={t}>{t}</option>)}</NativeSelect></Field>
            <Field label="Type"><NativeSelect value={f.prospect_type} onChange={set("prospect_type")}>{[...PTYPES, ...(PTYPES.includes(f.prospect_type) ? [] : [f.prospect_type])].map((t) => <option key={t}>{t}</option>)}</NativeSelect></Field>
          </div>
          <Field label="Next action"><Input value={f.next_action} onChange={set("next_action")} placeholder="e.g. Intro call" /></Field>
          <Field label="Due"><Input type="date" value={f.next_date} onChange={set("next_date")} /></Field>
          <Field label="Buildings / sites" className="sm:col-span-2"><Textarea rows={2} className="min-h-[60px]" value={f.buildings} onChange={set("buildings")} /></Field>
          <Field label="Angle (why this person)" className="sm:col-span-2"><Textarea rows={2} className="min-h-[60px]" value={f.angle} onChange={set("angle")} /></Field>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : contact ? "Save" : "Add target"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
