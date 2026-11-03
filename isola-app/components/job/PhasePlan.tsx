"use client";
// v85 Phase plan — for each phase of a job: who supplies the materials, which subs, which equipment.
// Suppliers come from material_vendors, subs from vendors; any name can be typed in instead.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError, showToast } from "@/components/Toaster";
import { ask, askText } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { Input, Textarea, NativeSelect, Field } from "@/components/ui/input";
import { Segmented } from "@/components/ui/tabs";
import { ListSkeleton, LoadError } from "@/components/ui/bits";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { withTimeout, firstError } from "@/lib/load";
import { telHref } from "@/lib/phoneLinks";
import { money, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Package, HardHat, Truck, Ellipsis, Plus, Phone, Pencil, Trash2, ArrowUp, ArrowDown, CalendarDays, KeyRound, Users, X, Check, MapPin, type LucideIcon } from "lucide-react";

type Kind = "material" | "sub" | "rental" | "equipment" | "other";
const KINDS: { k: Kind; label: string; icon: LucideIcon; statuses: string[] }[] = [
  { k: "material", label: "Materials", icon: Package, statuses: ["to order", "ordered", "confirmed", "delivered"] },
  { k: "sub", label: "Subs", icon: HardHat, statuses: ["to call", "called", "booked", "done"] },
  { k: "rental", label: "Rentals", icon: KeyRound, statuses: ["to reserve", "reserved", "picked up", "returned"] },
  { k: "equipment", label: "Equipment", icon: Truck, statuses: ["needed", "scheduled", "on site", "off site"] },
  { k: "other", label: "Other", icon: Ellipsis, statuses: ["to do", "in progress", "done"] },
];
const KMETA = Object.fromEntries(KINDS.map((x) => [x.k, x])) as Record<Kind, (typeof KINDS)[number]>;
// stored status is the position in the kind's list ("0".."3") so it survives renaming the labels
const stIdx = (s: string) => { const n = Number(s); return isNaN(n) ? 0 : n; };
const stTone = (k: Kind, s: string) => { const i = stIdx(s); const last = KMETA[k].statuses.length - 1;
  return i >= last ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : i === 0 ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-sky-500/30 bg-sky-500/10 text-sky-300"; };
const SINGULAR: Record<Kind, string> = { material: "Supplier", sub: "Sub", rental: "Rental", equipment: "Equipment", other: "Other" };
const PHASE_STATUS = ["planned", "in progress", "done"];
const SUGGEST = ["Demo & removal", "Excavation", "Base & prep", "Forms", "Pour", "Masonry", "Drainage", "Backfill", "Restoration", "Cleanup"];

type Row = { id: string; phase_id: string; kind: Kind; material_vendor_id: string | null; vendor_id: string | null; name: string | null; what: string | null; needed_date: string | null; status: string; est_cost: number | null; notes: string | null; sort: number };
const BLANK = { kind: "material" as Kind, name: "", what: "", needed_date: "", status: "0", est_cost: "", notes: "", p_phone: "", p_contact: "", p_address: "", p_extra: "", p_email: "", p_save: false };
const mapsHref = (a: string) => "https://maps.google.com/?q=" + encodeURIComponent(a);

export default function PhasePlan({ jobId }: { jobId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [phases, setPhases] = useState<any[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [workers, setWorkers] = useState<string[]>([]);
  const [crewFor, setCrewFor] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<(typeof BLANK & { id?: string; phase_id: string }) | null>(null);
  const [view, setView] = useState<"phases" | Kind>("phases");

  async function load() {
    setErr(null);
    try {
      const [p, r, m, v, wk] = await withTimeout(Promise.all([
        sb.from("job_phases").select("*").eq("job_id", jobId).order("sort").order("created_at"),
        sb.from("job_phase_vendors").select("*").eq("job_id", jobId).order("sort").order("created_at"),
        sb.from("material_vendors").select("*").order("name"),
        sb.from("vendors").select("id,company,contact_name,trade,phone,email,address,status").order("company"),
        sb.from("workers").select("name").eq("active", true).order("name"),
      ]));
      const e = firstError(p, r, m, v); if (e) throw new Error(e);
      setWorkers(((wk as any).data ?? []).map((x: any) => x.name));
      setPhases(p.data ?? []); setRows((r.data ?? []) as Row[]); setSuppliers(m.data ?? []); setSubs((v.data ?? []).filter((x: any) => x.status !== "rejected"));
    } catch (e: any) { setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message); }
  }
  useEffect(() => { load(); }, [jobId]);

  const who = (r: Row) => {
    if (r.material_vendor_id) { const s = suppliers.find((x) => x.id === r.material_vendor_id); if (s) return { name: s.name, phone: s.phone, address: s.address }; }
    if (r.vendor_id) { const s = subs.find((x) => x.id === r.vendor_id); if (s) return { name: s.company, phone: s.phone, address: s.address }; }
    return { name: r.name || "Not picked yet", phone: null, address: null };
  };
  // the phone-book record a typed name matches: subs → vendors, everything else → material_vendors (then vendors)
  const matchOf = (kind: Kind, name: string): { table: "material_vendors" | "vendors"; rec: any } | null => {
    const nm = name.trim().toLowerCase(); if (!nm) return null;
    if (kind !== "sub") { const m = suppliers.find((x) => String(x.name).toLowerCase() === nm); if (m) return { table: "material_vendors", rec: m }; }
    const v = subs.find((x) => String(x.company).toLowerCase() === nm); if (v) return { table: "vendors", rec: v };
    if (kind === "sub") { const m = suppliers.find((x) => String(x.name).toLowerCase() === nm); if (m) return { table: "material_vendors", rec: m }; }
    return null;
  };
  const profileFields = (m: { table: string; rec: any } | null) => m ? (m.table === "vendors"
    ? { p_phone: m.rec.phone ?? "", p_contact: m.rec.contact_name ?? "", p_address: m.rec.address ?? "", p_extra: m.rec.trade ?? "", p_email: m.rec.email ?? "" }
    : { p_phone: m.rec.phone ?? "", p_contact: m.rec.contact ?? "", p_address: m.rec.address ?? "", p_extra: m.rec.carries ?? "", p_email: "" })
    : { p_phone: "", p_contact: "", p_address: "", p_extra: "", p_email: "" };
  const rowToEdit = (r: Row) => { const w = who(r); const nm = w.name === "Not picked yet" ? "" : w.name;
    return { ...BLANK, id: r.id, phase_id: r.phase_id, kind: r.kind, name: nm, what: r.what ?? "", needed_date: r.needed_date ?? "", status: r.status, est_cost: r.est_cost != null ? String(r.est_cost) : "", notes: r.notes ?? "", ...profileFields(matchOf(r.kind, nm)) }; };

  async function addPhase(name?: string) {
    const n = name ?? (await askText({ title: "New phase", placeholder: "e.g. Excavation, Pour, Masonry" }));
    if (!n?.trim()) return;
    const { error } = await sb.from("job_phases").insert({ job_id: jobId, name: n.trim(), sort: (phases?.length ?? 0) * 10 });
    if (error) { showError(error.message); return; }
    load();
  }
  async function updPhase(id: string, patch: any) {
    setPhases((ps) => (ps ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const { error } = await sb.from("job_phases").update(patch).eq("id", id);
    if (error) { showError(error.message); load(); }
  }
  async function movePhase(i: number, dir: -1 | 1) {
    const ps = [...(phases ?? [])]; const j = i + dir; if (j < 0 || j >= ps.length) return;
    [ps[i], ps[j]] = [ps[j], ps[i]]; setPhases(ps);
    await Promise.all(ps.map((p, k) => sb.from("job_phases").update({ sort: k * 10 }).eq("id", p.id)));
  }
  async function delPhase(p: any) {
    const n = rows.filter((r) => r.phase_id === p.id).length;
    if (!(await ask({ title: `Delete "${p.name}"?`, body: n ? `Its ${n} vendor/sub line${n > 1 ? "s" : ""} go with it.` : undefined, confirm: "Delete", danger: true }))) return;
    const { error } = await sb.from("job_phases").delete().eq("id", p.id);
    if (error) { showError(error.message); return; }
    load();
  }
  async function bump(r: Row) {
    const n = (stIdx(r.status) + 1) % KMETA[r.kind].statuses.length;
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: String(n) } : x)));
    const { error } = await sb.from("job_phase_vendors").update({ status: String(n) }).eq("id", r.id);
    if (error) { showError(error.message); load(); }
  }
  async function saveRow() {
    if (!edit) return;
    const m = matchOf(edit.kind, edit.name);
    let mvId: string | null = m?.table === "material_vendors" ? m.rec.id : null;
    let vId: string | null = m?.table === "vendors" ? m.rec.id : null;
    const t = (x: string) => x.trim() || null;
    if (m) {
      // update the phone-book profile if anything in it was changed here
      const cur = profileFields(m);
      if (["p_phone", "p_contact", "p_address", "p_extra", "p_email"].some((k) => (cur as any)[k] !== (edit as any)[k])) {
        const patch = m.table === "vendors"
          ? { phone: t(edit.p_phone), contact_name: t(edit.p_contact), address: t(edit.p_address), trade: t(edit.p_extra), email: t(edit.p_email), updated_at: new Date().toISOString() }
          : { phone: t(edit.p_phone), contact: t(edit.p_contact), address: t(edit.p_address), carries: t(edit.p_extra), updated_at: new Date().toISOString() };
        const { error } = await sb.from(m.table).update(patch).eq("id", m.rec.id);
        if (error) { showError("Couldn't update the vendor profile: " + error.message); return; }
      }
    } else if (edit.p_save && edit.name.trim()) {
      // new vendor → into the phone book (subs into the vendor list, everyone else into material vendors)
      const ins = edit.kind === "sub"
        ? await sb.from("vendors").insert({ company: edit.name.trim(), status: "approved", phone: t(edit.p_phone), contact_name: t(edit.p_contact), address: t(edit.p_address), trade: t(edit.p_extra), email: t(edit.p_email) }).select("id").single()
        : await sb.from("material_vendors").insert({ name: edit.name.trim(), phone: t(edit.p_phone), contact: t(edit.p_contact), address: t(edit.p_address), carries: t(edit.p_extra) }).select("id").single();
      if (ins.error) { showError("Couldn't add to the phone book: " + ins.error.message); return; }
      if (edit.kind === "sub") vId = ins.data.id; else mvId = ins.data.id;
    }
    const row = {
      phase_id: edit.phase_id, job_id: jobId, kind: edit.kind,
      material_vendor_id: mvId, vendor_id: mvId ? null : vId,
      name: edit.name.trim() || null, what: edit.what.trim() || null, needed_date: edit.needed_date || null,
      status: edit.status, est_cost: edit.est_cost === "" ? null : Number(String(edit.est_cost).replace(/[$,]/g, "")) || null, notes: edit.notes.trim() || null,
    };
    const res = edit.id ? await sb.from("job_phase_vendors").update(row).eq("id", edit.id)
      : await sb.from("job_phase_vendors").insert({ ...row, sort: rows.filter((r) => r.phase_id === edit.phase_id).length * 10 });
    if (res.error) { showError(res.error.message); return; }
    setEdit(null); load(); showToast("Saved");
  }
  async function delRow(r: Row) {
    if (!(await ask({ title: `Remove ${who(r).name}?`, confirm: "Remove", danger: true }))) return;
    const { error } = await sb.from("job_phase_vendors").delete().eq("id", r.id);
    if (error) { showError(error.message); return; }
    setEdit(null); load();
  }

  if (err) return <LoadError message={err} onRetry={load} />;
  if (!phases) return <ListSkeleton rows={2} />;
  const open = rows.filter((r) => stIdx(r.status) === 0).length;
  const est = rows.reduce((a, r) => a + Number(r.est_cost || 0), 0);
  const names = edit ? (edit.kind === "sub" ? subs.map((s) => s.company) : [...suppliers.map((s) => s.name), ...(edit.kind === "other" ? subs.map((s) => s.company) : [])]) : [];

  return (
    <div className="space-y-4">
      {phases.length ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-400">
          <span>{phases.length} phase{phases.length > 1 ? "s" : ""}</span>
          <span>{rows.length} supplier/sub line{rows.length === 1 ? "" : "s"}</span>
          {(() => { const c = new Set(phases.flatMap((p) => p.crew ?? [])); return c.size ? <span>{c.size} on the crew</span> : null; })()}
          {open ? <span className="text-amber-300">{open} still to order / call</span> : rows.length ? <span className="text-emerald-300">everything lined up</span> : null}
          {est ? <span>est. {money(est)}</span> : null}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">Add the phases of this job, then who's supplying each one's materials, which subs are coming, and what equipment you need.</p>
      )}

      {phases.length ? (
        <Segmented value={view} onChange={(v) => setView(v as any)} options={[{ value: "phases", label: "By phase" }, ...KINDS.slice(0, 4).map((x) => ({ value: x.k, label: `${x.label}${rows.filter((r) => r.kind === x.k).length ? ` ${rows.filter((r) => r.kind === x.k).length}` : ""}` }))]} />
      ) : null}

      {view !== "phases" ? (() => {
        const list = rows.filter((r) => r.kind === view).sort((a, b) => String(a.needed_date ?? "9").localeCompare(String(b.needed_date ?? "9")));
        const tot = list.reduce((a, r) => a + Number(r.est_cost || 0), 0);
        return (
          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
            {list.length === 0 ? <p className="p-2 text-sm text-neutral-500">No {KMETA[view].label.toLowerCase()} on this job yet. Add them from a phase.</p> : (
              <div className="divide-y divide-white/[0.05]">
                {list.map((r) => { const w = who(r); const ph = phases.find((p) => p.id === r.phase_id); const st = KMETA[r.kind].statuses; return (
                  <div key={r.id} className="flex min-h-[52px] items-center gap-2 py-1.5">
                    <button className="min-w-0 flex-1 text-left" onClick={() => setEdit(rowToEdit(r))}>
                      <div className="truncate text-sm font-semibold text-white">{w.name}{r.what ? <span className="font-normal text-neutral-400"> · {r.what}</span> : null}</div>
                      <div className="truncate text-xs text-neutral-500">{[ph?.name, r.needed_date ? fmtDate(r.needed_date) : "no date", r.est_cost ? `est. ${money(Number(r.est_cost))}` : null].filter(Boolean).join(" · ")}</div>
                    </button>
                    {w.address ? <a href={mapsHref(w.address)} target="_blank" rel="noreferrer" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-300 hover:bg-white/[0.06]" aria-label="Directions"><MapPin size={16} /></a> : null}
                    {w.phone ? <a href={telHref(w.phone)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-300 hover:bg-white/[0.06]"><Phone size={16} /></a> : null}
                    <button onClick={() => bump(r)} className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold", stTone(r.kind, r.status))}>{st[stIdx(r.status)] ?? st[0]}</button>
                  </div>
                ); })}
                {tot ? <div className="pt-2 text-right text-sm text-neutral-300">est. {money(tot)}</div> : null}
              </div>
            )}
          </section>
        );
      })() : null}

      {view === "phases" && phases.map((p, i) => {
        const pr = rows.filter((r) => r.phase_id === p.id);
        return (
          <section key={p.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-bold text-neutral-300">{i + 1}</span>
              <Input defaultValue={p.name} onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && updPhase(p.id, { name: e.target.value.trim() })}
                className="h-9 min-w-[140px] flex-1 border-transparent bg-transparent text-[15px] font-semibold text-white hover:border-border" />
              <NativeSelect value={p.status} onChange={(e) => updPhase(p.id, { status: e.target.value })} className={cn("h-9 w-auto text-xs", p.status === "done" && "text-emerald-300", p.status === "in progress" && "text-sky-300")}>
                {PHASE_STATUS.map((s) => <option key={s}>{s}</option>)}
              </NativeSelect>
              <div className="flex items-center">
                <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => movePhase(i, -1)}><ArrowUp size={15} /></Button>
                <Button size="icon" variant="ghost" disabled={i === phases.length - 1} onClick={() => movePhase(i, 1)}><ArrowDown size={15} /></Button>
                <Button size="icon" variant="ghost" onClick={() => delPhase(p)}><Trash2 size={15} /></Button>
              </div>
              <div className="flex w-full items-center gap-2 text-xs text-neutral-400 sm:w-auto">
                <CalendarDays size={14} />
                <Input type="date" value={p.start_date ?? ""} onChange={(e) => updPhase(p.id, { start_date: e.target.value || null })} className="h-8 w-[138px] text-xs" />
                <span>to</span>
                <Input type="date" value={p.end_date ?? ""} onChange={(e) => updPhase(p.id, { end_date: e.target.value || null })} className="h-8 w-[138px] text-xs" />
              </div>
            </div>
            <div className="space-y-3 p-3">
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-500"><Users size={13} />Crew{(p.crew ?? []).length ? ` · ${(p.crew ?? []).length}` : ""}</div>
                <div className="flex flex-wrap gap-1.5">
                  {(p.crew ?? []).map((n: string) => (
                    <span key={n} className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] pl-3 pr-1 text-xs font-semibold text-white">
                      {n}<button onClick={() => updPhase(p.id, { crew: (p.crew ?? []).filter((x: string) => x !== n) })} className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:text-white" aria-label={`Take ${n} off`}><X size={12} /></button>
                    </span>
                  ))}
                  <button onClick={() => setCrewFor(crewFor === p.id ? null : p.id)} className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-dashed border-white/20 px-3 text-xs text-neutral-400 hover:text-white"><Plus size={12} />Add workers</button>
                </div>
                {crewFor === p.id ? (
                  <div className="mt-2 flex flex-wrap gap-1.5 rounded-xl border border-white/[0.08] p-2">
                    {workers.map((n) => { const on = (p.crew ?? []).includes(n); return (
                      <button key={n} onClick={() => updPhase(p.id, { crew: on ? (p.crew ?? []).filter((x: string) => x !== n) : [...(p.crew ?? []), n] })}
                        className={cn("min-h-[36px] rounded-full border px-3 text-xs font-semibold", on ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" : "border-white/10 text-neutral-300 hover:border-white/25")}>
                        {on ? <Check size={12} className="mr-1 inline" /> : null}{n}
                      </button>
                    ); })}
                    <button onClick={async () => { const n = await askText({ title: "Add a name", placeholder: "Someone not on your crew list" }); if (n?.trim()) updPhase(p.id, { crew: [...(p.crew ?? []), n.trim()] }); }}
                      className="min-h-[36px] rounded-full border border-dashed border-white/20 px-3 text-xs text-neutral-400 hover:text-white">+ Other name</button>
                    <button onClick={() => setCrewFor(null)} className="ml-auto min-h-[36px] px-3 text-xs font-semibold text-white">Done</button>
                  </div>
                ) : null}
              </div>
              {KINDS.map(({ k, label, icon: Icon, statuses }) => {
                const kr = pr.filter((r) => r.kind === k);
                if (!kr.length) return null;
                return (
                  <div key={k}>
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-500"><Icon size={13} />{label}</div>
                    <div className="divide-y divide-white/[0.05]">
                      {kr.map((r) => {
                        const w = who(r);
                        return (
                          <div key={r.id} className="flex min-h-[48px] items-center gap-2 py-1.5">
                            <button className="min-w-0 flex-1 text-left" onClick={() => setEdit(rowToEdit(r))}>
                              <div className={cn("truncate text-sm font-semibold", w.name === "Not picked yet" ? "text-amber-300" : "text-white")}>{w.name}</div>
                              <div className="truncate text-xs text-neutral-500">{[r.what, r.needed_date ? fmtDate(r.needed_date) : null, r.est_cost ? `est. ${money(Number(r.est_cost))}` : null, r.notes].filter(Boolean).join(" · ") || "Tap to add details"}</div>
                            </button>
                            {w.address ? <a href={mapsHref(w.address)} target="_blank" rel="noreferrer" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-300 hover:bg-white/[0.06]" aria-label="Directions"><MapPin size={16} /></a> : null}
                    {w.phone ? <a href={telHref(w.phone)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-300 hover:bg-white/[0.06]" aria-label={`Call ${w.name}`}><Phone size={16} /></a> : null}
                            <button onClick={() => bump(r)} className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold", stTone(r.kind, r.status))} title="Tap to move to the next step">
                              {statuses[stIdx(r.status)] ?? statuses[0]}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2">
                {KINDS.slice(0, 4).map(({ k, icon: Icon }) => (
                  <Button key={k} size="sm" variant="outline" onClick={() => setEdit({ ...BLANK, kind: k, phase_id: p.id })}>
                    <Icon size={14} className="mr-1.5" />{SINGULAR[k]}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setEdit({ ...BLANK, kind: "other", phase_id: p.id })}><Plus size={14} className="mr-1" />Other</Button>
              </div>
            </div>
          </section>
        );
      })}

      <div className={cn("flex flex-wrap items-center gap-2", view !== "phases" && "hidden")}>
        <Button size="sm" onClick={() => addPhase()}><Plus size={15} className="mr-1.5" />Add phase</Button>
        {SUGGEST.filter((s) => !phases.some((p) => p.name.toLowerCase() === s.toLowerCase())).slice(0, 6).map((s) => (
          <button key={s} onClick={() => addPhase(s)} className="min-h-[32px] rounded-full border border-white/10 px-3 text-xs text-neutral-400 hover:border-white/25 hover:text-white">+ {s}</button>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit" : "Add"} {edit ? SINGULAR[edit.kind].toLowerCase() : ""}</DialogTitle></DialogHeader>
          {edit ? (
            <div className="space-y-3">
              <Segmented value={edit.kind} onChange={(v) => setEdit({ ...edit, kind: v as Kind, status: "0" })}
                options={KINDS.map((x) => ({ value: x.k, label: SINGULAR[x.k] }))} />
              <Field label={edit.kind === "sub" ? "Sub (from your vendor list, or type a name)" : "Who (from your phone book, or type a name)"}>
                <Input list="phase-who" value={edit.name} onChange={(e) => { const nm = e.target.value; const m = matchOf(edit.kind, nm); setEdit({ ...edit, name: nm, ...(m ? profileFields(m) : {}) }); }} placeholder={edit.kind === "sub" ? "e.g. Jimmy's Concrete" : edit.kind === "rental" ? "e.g. Sunbelt, Pro Tool" : edit.kind === "equipment" ? "e.g. THM excavator, our dump trailer" : "e.g. Concrete plant"} autoFocus />
                <datalist id="phase-who">{names.map((n) => <option key={n} value={n} />)}</datalist>
              </Field>
              <Field label="What for"><Input value={edit.what} onChange={(e) => setEdit({ ...edit, what: e.target.value })} placeholder={edit.kind === "material" ? "e.g. 6 yd 4000 psi, 20 tons crushed stone" : edit.kind === "sub" ? "e.g. finish the slab" : edit.kind === "rental" ? "e.g. plate compactor, 2 days" : "e.g. mini excavator, 3 days"} /></Field>
              {(() => { const m = matchOf(edit.kind, edit.name); const show = !!m || edit.p_save; const sub = m ? m.table === "vendors" : edit.kind === "sub"; return (
                <div className="space-y-2 rounded-xl border border-white/[0.08] p-3">
                  {m ? <div className="text-xs font-semibold text-emerald-300">In your phone book — changes here update their profile</div>
                    : edit.name.trim() ? (
                      <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-sm text-neutral-300">
                        <input type="checkbox" checked={edit.p_save} onChange={(e) => setEdit({ ...edit, p_save: e.target.checked })} className="h-4 w-4 accent-white" />
                        Save {edit.name.trim()} to my {edit.kind === "sub" ? "vendor list" : "phone book"}
                      </label>
                    ) : <div className="text-xs text-neutral-500">Type a name to pick from your phone book or add a new one.</div>}
                  {show ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Phone"><Input type="tel" value={edit.p_phone} onChange={(e) => setEdit({ ...edit, p_phone: e.target.value })} /></Field>
                      <Field label="Contact"><Input value={edit.p_contact} onChange={(e) => setEdit({ ...edit, p_contact: e.target.value })} /></Field>
                      <div className="col-span-2"><Field label="Address (pickup / yard)"><Input value={edit.p_address} onChange={(e) => setEdit({ ...edit, p_address: e.target.value })} /></Field></div>
                      <Field label={sub ? "Trade" : "Carries"}><Input value={edit.p_extra} onChange={(e) => setEdit({ ...edit, p_extra: e.target.value })} placeholder={sub ? "e.g. concrete finishing" : "e.g. stone, loam, block"} /></Field>
                      {sub ? <Field label="Email"><Input type="email" value={edit.p_email} onChange={(e) => setEdit({ ...edit, p_email: e.target.value })} /></Field> : null}
                    </div>
                  ) : null}
                </div>
              ); })()}
              <div className="grid grid-cols-2 gap-2">
                <Field label={edit.kind === "rental" || edit.kind === "equipment" ? "Date (puts it on the Schedule)" : "Needed / coming"}><Input type="date" value={edit.needed_date} onChange={(e) => setEdit({ ...edit, needed_date: e.target.value })} /></Field>
                <Field label="Est. cost"><Input inputMode="decimal" value={edit.est_cost} onChange={(e) => setEdit({ ...edit, est_cost: e.target.value })} placeholder="$" /></Field>
              </div>
              <Field label="Status">
                <NativeSelect value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                  {KMETA[edit.kind].statuses.map((s, i) => <option key={s} value={String(i)}>{s}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Notes"><Textarea rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="Order #, contact, delivery window…" /></Field>
            </div>
          ) : null}
          <DialogFooter>
            {edit?.id ? <Button variant="ghost" onClick={() => { const r = rows.find((x) => x.id === edit.id); if (r) delRow(r); }}><Trash2 size={15} className="mr-1.5" />Remove</Button> : null}
            <Button onClick={saveRow}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
