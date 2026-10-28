"use client";
// Material vendors phone book — yards, quarries, rental counters, supply houses.
// Backed by public.material_vendors (owner only). Separate from public.vendors, which is
// subs + COI/W-9 paperwork. Lives under Projects (/projects/vendors) and opens from the
// "Vendors" tile on every job page so a number is one tap away from the field.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError, showToast, undoable } from "@/components/Toaster";
import { PageHeader, Empty, ListSkeleton } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { telHref } from "@/lib/phoneLinks";
import { Phone, MapPin, Plus, Pencil, Search, Clock, Truck } from "lucide-react";

type MV = {
  id: string; name: string; phone: string | null; phone2: string | null; contact: string | null;
  address: string | null; carries: string | null; hours: string | null; notes: string | null; sort: number;
};
const BLANK = { name: "", phone: "", phone2: "", contact: "", address: "", carries: "", hours: "", notes: "" };
const mapsHref = (a: string) => "https://maps.google.com/?q=" + encodeURIComponent(a);

export default function MaterialVendors({ compact = false }: { compact?: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<MV[] | null>(null);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<(typeof BLANK & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await sb.from("material_vendors").select("*").order("sort").order("name");
    if (error) { showError("Couldn't load vendors: " + error.message); setRows([]); return; }
    setRows(data as MV[]);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const shown = (rows ?? []).filter((v) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [v.name, v.carries, v.address, v.contact, v.notes].some((x) => String(x ?? "").toLowerCase().includes(s));
  });

  async function save() {
    if (!edit) return;
    if (!edit.name.trim()) { showError("Add the vendor's name."); return; }
    const payload: any = {};
    for (const k of Object.keys(BLANK)) payload[k] = String((edit as any)[k] ?? "").trim() || null;
    payload.updated_at = new Date().toISOString();
    setBusy(true);
    const res = edit.id
      ? await sb.from("material_vendors").update(payload).eq("id", edit.id)
      : await sb.from("material_vendors").insert(payload);
    setBusy(false);
    if (res.error) { showError("Save failed: " + res.error.message); return; }
    showToast(edit.id ? "Vendor updated" : "Vendor added");
    setEdit(null); load();
  }
  function remove(id: string) {
    const prev = rows ?? [];
    setEdit(null);
    undoable({ text: "Vendor deleted", hide: () => setRows(prev.filter((x) => x.id !== id)), restore: () => setRows(prev),
      commit: async () => { const { error } = await sb.from("material_vendors").delete().eq("id", id); if (error) { load(); throw error; } } });
  }

  return (
    <div>
      {!compact ? (
        <PageHeader title="Material vendors" sub="Yards, quarries, rentals and supply houses. Tap a number to call."
          actions={<Button size="sm" onClick={() => setEdit({ ...BLANK })}><Plus size={15} /> Add vendor</Button>} />
      ) : null}

      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <Input className="pl-9" placeholder="Search name, material, town…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {compact ? <Button size="sm" variant="outline" onClick={() => setEdit({ ...BLANK })}><Plus size={15} /> Add</Button> : null}
      </div>

      {rows === null ? <ListSkeleton rows={4} /> : shown.length === 0 ? (
        <Empty icon={<Truck size={26} />} title={rows.length ? "No match" : "No vendors yet"} body={rows.length ? "Try a different word." : "Add the yards and supply houses you buy from."} />
      ) : (
        <div className="space-y-2">
          {shown.map((v) => (
            <div key={v.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">{v.name}</div>
                  {v.carries ? <div className="text-xs text-neutral-400">{v.carries}</div> : null}
                </div>
                <button onClick={() => setEdit({ ...BLANK, ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, (v as any)[k] ?? ""])), id: v.id } as any)}
                  aria-label={`Edit ${v.name}`} className="shrink-0 rounded p-1.5 text-neutral-500 hover:text-white"><Pencil size={15} /></button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[v.phone, v.phone2].filter(Boolean).map((p) => (
                  <a key={p!} href={telHref(p!)} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-neutral-950">
                    <Phone size={15} /> {p}
                  </a>
                ))}
                {v.address ? (
                  <a href={mapsHref(v.address)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm text-neutral-200 hover:border-white/30">
                    <MapPin size={15} /> Directions
                  </a>
                ) : null}
              </div>
              <div className="mt-2 space-y-0.5 text-xs text-neutral-500">
                {v.address ? <div>{v.address}</div> : null}
                {v.contact ? <div>Ask for {v.contact}</div> : null}
                {v.hours ? <div className="flex items-center gap-1"><Clock size={12} /> {v.hours}</div> : null}
                {v.notes ? <div className="text-neutral-400">{v.notes}</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}>
        {edit ? (
          <DialogContent>
            <DialogHeader><DialogTitle>{edit.id ? "Edit vendor" : "Add vendor"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Case Materials" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone"><Input inputMode="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
                <Field label="Second phone"><Input inputMode="tel" value={edit.phone2} onChange={(e) => setEdit({ ...edit, phone2: e.target.value })} /></Field>
              </div>
              <Field label="Address"><Input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
              <Field label="What they carry"><Input value={edit.carries} onChange={(e) => setEdit({ ...edit, carries: e.target.value })} placeholder="Rip rap, crushed stone, loam" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact"><Input value={edit.contact} onChange={(e) => setEdit({ ...edit, contact: e.target.value })} /></Field>
                <Field label="Hours"><Input value={edit.hours} onChange={(e) => setEdit({ ...edit, hours: e.target.value })} placeholder="Mon–Fri 7–4" /></Field>
              </div>
              <Field label="Notes"><Textarea rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            </div>
            <DialogFooter>
              {edit.id ? <Button variant="destructive" className="sm:mr-auto" onClick={() => remove(edit.id!)}>Delete</Button> : null}
              <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
