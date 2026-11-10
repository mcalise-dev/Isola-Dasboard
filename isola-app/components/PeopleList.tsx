"use client";
// Multiple contact people on one record. Used on properties (property_contacts),
// subs (vendor_contacts.vendor_id) and material vendors (vendor_contacts.material_vendor_id).
// Owner/office only — crew never sees these (RLS + not rendered on crew screens).
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError, showToast, undoable } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { telHref } from "@/lib/phoneLinks";
import { Mail, Pencil, Phone, Plus, Users } from "lucide-react";

type Person = { id: string; name: string; role: string | null; phone: string | null; email: string | null; notes: string | null; sort: number | null };
const BLANK = { name: "", role: "", phone: "", email: "", notes: "" };

export default function PeopleList({ table, fk, id, title = "People", rolePlaceholder = "Super, office, dispatch…" }: {
  table: "property_contacts" | "vendor_contacts"; fk: "property_id" | "vendor_id" | "material_vendor_id"; id: string; title?: string; rolePlaceholder?: string;
}) {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Person[] | null>(null);
  const [edit, setEdit] = useState<(typeof BLANK & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await sb.from(table).select("id,name,role,phone,email,notes,sort").eq(fk, id).order("sort").order("created_at");
    if (error) { showError("Couldn't load people: " + error.message); setRows([]); return; }
    setRows(data as Person[]);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [table, fk, id]);

  async function save() {
    if (!edit) return;
    if (!edit.name.trim()) { showError("Name is required."); return; }
    const row: any = { [fk]: id };
    for (const k of Object.keys(BLANK)) row[k] = String((edit as any)[k] ?? "").trim() || null;
    if (!edit.id) row.sort = rows?.length ?? 0;
    setBusy(true);
    const { error } = edit.id ? await sb.from(table).update(row).eq("id", edit.id) : await sb.from(table).insert(row);
    setBusy(false);
    if (error) { showError("Save failed: " + error.message); return; }
    showToast(edit.id ? "Saved" : "Person added");
    setEdit(null); load();
  }
  function remove(pid: string) {
    const prev = rows ?? [];
    setEdit(null);
    undoable({ text: "Person removed", hide: () => setRows(prev.filter((x) => x.id !== pid)), restore: () => setRows(prev),
      commit: () => sb.from(table).delete().eq("id", pid) });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500"><Users size={13} /> {title}</div>
        <Button variant="ghost" size="sm" className="h-8" onClick={() => setEdit({ ...BLANK })}><Plus size={14} /> Add person</Button>
      </div>
      {rows === null ? null : rows.length === 0 ? (
        <p className="text-xs text-neutral-500">No one added yet.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06]">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-neutral-100">{p.name}{p.role ? <span className="font-normal text-neutral-400"> · {p.role}</span> : null}</div>
                <div className="truncate text-xs text-neutral-500">{[p.phone, p.email].filter(Boolean).join(" · ") || "—"}</div>
                {p.notes ? <div className="truncate text-xs text-neutral-500">{p.notes}</div> : null}
              </div>
              {p.phone ? <Button asChild variant="ghost" size="icon-sm" aria-label={`Call ${p.name}`}><a href={telHref(p.phone)}><Phone size={14} /></a></Button> : null}
              {p.email ? <Button asChild variant="ghost" size="icon-sm" aria-label={`Email ${p.name}`}><a href={`mailto:${p.email}`}><Mail size={14} /></a></Button> : null}
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`}
                onClick={() => setEdit({ id: p.id, name: p.name, role: p.role ?? "", phone: p.phone ?? "", email: p.email ?? "", notes: p.notes ?? "" })}><Pencil size={14} /></Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}>
        {edit ? (
          <DialogContent>
            <DialogHeader><DialogTitle>{edit.id ? "Edit person" : "Add person"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
                <Field label="Role"><Input value={edit.role} placeholder={rolePlaceholder} onChange={(e) => setEdit({ ...edit, role: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone"><Input inputMode="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
                <Field label="Email"><Input inputMode="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
              </div>
              <Field label="Notes"><Textarea rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            </div>
            <DialogFooter>
              {edit.id ? <Button variant="destructive" className="sm:mr-auto" onClick={() => remove(edit.id!)}>Remove</Button> : null}
              <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
