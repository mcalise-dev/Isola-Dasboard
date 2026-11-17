"use client";
// v8.8 owner side: places the crew can tap for directions (job site, dump, material/asphalt pickup).
// Pick from the supplier phone book or type any address. Shows on the crew job screen.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError, showToast, undoable } from "@/components/Toaster";
import { MapPin, Plus, Navigation, X } from "lucide-react";
import { directionsUrl, placeIcon } from "@/components/field/PlacesCard";

const KINDS: { v: string; label: string }[] = [
  { v: "site", label: "Job site" }, { v: "disposal", label: "Disposal / dump" }, { v: "pickup", label: "Material pickup" },
  { v: "supply", label: "Supply house" }, { v: "parking", label: "Parking / staging" }, { v: "other", label: "Other" },
];
const blank = { kind: "pickup", label: "", name: "", address: "", phone: "", notes: "", material_vendor_id: "" };

export default function JobPlaces({ jobId, jobLocation }: { jobId: string; jobLocation?: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [form, setForm] = useState<any | null>(null);

  async function load() {
    const [{ data: p }, { data: v }] = await Promise.all([
      supabase.from("job_places").select("*").eq("job_id", jobId).order("sort").order("created_at"),
      supabase.from("material_vendors").select("id,name,address,phone").order("name"),
    ]);
    setRows(p ?? []); setVendors((v ?? []).filter((x: any) => x.address));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);

  function pickVendor(id: string) {
    const v = vendors.find((x) => x.id === id);
    setForm((f: any) => ({ ...f, material_vendor_id: id, name: v?.name ?? f.name, address: v?.address ?? f.address, phone: v?.phone ?? f.phone }));
  }
  async function save() {
    if (!form.address.trim()) { showError("Add an address."); return; }
    const row = {
      job_id: jobId, kind: form.kind, label: form.label.trim() || KINDS.find((k) => k.v === form.kind)?.label, name: form.name.trim() || null,
      address: form.address.trim(), phone: form.phone.trim() || null, notes: form.notes.trim() || null,
      material_vendor_id: form.material_vendor_id || null, sort: form.id ? form.sort : rows.length + 1,
    };
    const { error } = form.id ? await supabase.from("job_places").update(row).eq("id", form.id) : await supabase.from("job_places").insert(row);
    if (error) { showError("Couldn't save: " + error.message); return; }
    setForm(null); showToast("Place saved"); load();
  }
  function remove(p: any) {
    const prev = rows;
    undoable({
      text: "Place removed",
      hide: () => setRows((r) => r.filter((x) => x.id !== p.id)),
      restore: () => setRows(prev),
      commit: async () => { const { error } = await supabase.from("job_places").delete().eq("id", p.id); if (error) showError("Couldn't remove: " + error.message); load(); },
    });
  }

  const inp = "w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 min-h-[44px] text-[15px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500";
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold text-white"><MapPin size={18} /> Places for the crew</h2>
        {!form ? <button onClick={() => setForm({ ...blank, ...(rows.some((r) => r.kind === "site") || !jobLocation ? {} : { kind: "site", address: jobLocation }) })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 min-h-[36px] text-[13px] font-semibold text-neutral-300 hover:text-white"><Plus size={14} /> Add place</button> : null}
      </div>
      <p className="mb-3 text-[12px] text-neutral-500">Job site, dump, pickups. Crew get a Directions button for each one.</p>

      {rows.length ? (
        <div className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.08] bg-neutral-950">
          {rows.map((p) => {
            const Icon = placeIcon(p.kind);
            return (
              <div key={p.id} className="flex items-start gap-3 px-3.5 py-3">
                <Icon size={18} className="mt-0.5 shrink-0 text-neutral-400" />
                <button onClick={() => setForm({ ...blank, ...p, label: p.label ?? "", name: p.name ?? "", phone: p.phone ?? "", notes: p.notes ?? "", material_vendor_id: p.material_vendor_id ?? "" })} className="min-w-0 flex-1 text-left">
                  <div className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">{p.label}</div>
                  <div className="text-[15px] font-semibold text-white">{p.name || p.address}</div>
                  {p.name ? <div className="text-[13px] text-neutral-400">{p.address}</div> : null}
                  {p.notes ? <div className="text-[13px] text-amber-200/90">{p.notes}</div> : null}
                </button>
                <a href={directionsUrl(p.address)} target="_blank" rel="noreferrer" aria-label="Directions" className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-300 hover:bg-white/[0.06]"><Navigation size={17} /></a>
                <button onClick={() => remove(p)} aria-label="Remove" className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 hover:bg-white/[0.06] hover:text-white"><X size={17} /></button>
              </div>
            );
          })}
        </div>
      ) : !form ? <p className="text-sm text-neutral-500">No places yet.</p> : null}

      {form ? (
        <div className="mt-3 space-y-2.5 rounded-xl border border-white/[0.1] bg-neutral-950 p-3.5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inp}>
              {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
            </select>
            <select value={form.material_vendor_id} onChange={(e) => pickVendor(e.target.value)} className={inp}>
              <option value="">From supplier phone book…</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Label (e.g. Disposal + material pickup)" className={inp} />
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name (e.g. J&J Materials)" className={inp} />
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" className={inp + " sm:col-span-2"} />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (supplier only — no customer numbers)" className={inp} />
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Note for crew (e.g. they take asphalt)" className={inp} />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="rounded-lg bg-brand px-4 min-h-[40px] text-sm font-bold text-neutral-950">Save</button>
            <button onClick={() => setForm(null)} className="rounded-lg border border-white/[0.12] px-4 min-h-[40px] text-sm font-semibold text-neutral-300">Cancel</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
