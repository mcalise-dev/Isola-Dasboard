"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Contact, STAGES, PTYPES, SECTORS, TIER_ORDER, isDue, scoreLetter } from "@/lib/crm";
import { todayISO } from "@/lib/format";
import { withTimeout, firstError } from "@/lib/load";
import { cn } from "@/lib/utils";
import { PageHeader, SectionTitle, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, NativeSelect, Field, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { showError, showToast, undoable } from "@/components/Toaster";
import { ask } from "@/components/Dialogs";
import { Plus, Search, Star, Phone, Mail, Megaphone, Pencil, Check, ChevronDown, ChevronRight, Trash2, Users, Building2, X } from "lucide-react";

const coShortName = (n: string | null) => (n ?? "").replace(/\s*\(.*?\)\s*/g, "").trim();
const initials = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const emptyForm = { sector: "Medical", name: "", company: "", title: "", phone: "", email: "", address: "", buildings: "", prospect_type: "Property Manager", tier: "B", lead_score: 2, angle: "", notes: "" };
const PATH = ["Not started", "Emailed", "Called", "Meeting", "Walk-through", "Proposal", "Won"];

function tierLabel(t: string | null) {
  return t === "Client" ? "Clients" : t === "Broker" ? "Brokers / referral sources" : `Grade ${t ?? "—"}`;
}

export default function CrmTab() {
  const supabase = useMemo(() => createClient(), []);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fTier, setFTier] = useState("");
  const [fStage, setFStage] = useState("");
  const [fSector, setFSector] = useState("");
  const [fDueOnly, setFDueOnly] = useState(false);
  const [fTouchedOnly, setFTouchedOnly] = useState(false);
  const [fCompany, setFCompany] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [viewing, setViewing] = useState<Contact | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr(null);
    try {
      const res = await withTimeout(supabase.from("contacts").select("*").order("company"));
      const e = firstError(res);
      if (e) throw new Error(e);
      const list = (res.data as Contact[]) ?? [];
      setContacts(list);
      setViewing((v) => (v ? list.find((x) => x.id === v.id) ?? null : null));
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function patch(c: Contact, fields: Partial<Contact>) {
    const { error } = await supabase.from("contacts").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) showError("Save failed: " + error.message);
    load();
  }

  const list = contacts ?? [];
  const companies = useMemo(() => {
    const map = new Map<string, Contact[]>();
    (contacts ?? []).forEach((c) => {
      const k = c.company ?? "—";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    });
    const out = [...map.entries()];
    out.sort((a, b) => (TIER_ORDER[a[1][0].tier ?? "C"] ?? 9) - (TIER_ORDER[b[1][0].tier ?? "C"] ?? 9) || a[0].localeCompare(b[0]));
    return out;
  }, [contacts]);

  const companyOptions = companies
    .filter(([, ps]) => (!fSector || (ps[0].sector ?? "Medical") === fSector) && (!fTier || ps[0].tier === fTier))
    .map(([co]) => co);
  const isTouched = (p: Contact) => !["Not started", "Client"].includes(p.stage);
  const shown = companies
    .filter(([co, ps]) => (!fCompany || co === fCompany) && (!fSector || (ps[0].sector ?? "Medical") === fSector) && (!fTier || ps[0].tier === fTier) && (!fDueOnly || ps.some(isDue)) && (!fTouchedOnly || ps.some(isTouched)))
    .map(([co, ps]) => {
      let l = ps;
      if (fStage) l = l.filter((p) => p.stage === fStage);
      if (fDueOnly) l = l.filter(isDue);
      if (fTouchedOnly) l = l.filter(isTouched);
      if (q) {
        const ql = q.toLowerCase();
        const coHay = [co, ps[0].buildings, ps[0].address].join(" ").toLowerCase();
        if (!coHay.includes(ql)) l = l.filter((p) => [p.name, p.title, p.notes].join(" ").toLowerCase().includes(ql));
      }
      return [co, l] as const;
    })
    .filter(([, l]) => l.length);

  // consecutive companies with the same tier → one section
  const sections: { tier: string | null; items: (typeof shown)[number][] }[] = [];
  shown.forEach((row) => {
    const t = row[1][0].tier ?? "—";
    const last = sections[sections.length - 1];
    if (last && (last.tier ?? "—") === t) last.items.push(row);
    else sections.push({ tier: row[1][0].tier, items: [row] });
  });

  const all = list.filter((c) => !fSector || (c.sector ?? "Medical") === fSector);
  const touched = all.filter((c) => !["Not started", "Client"].includes(c.stage)).length;
  const due = all.filter(isDue).length;
  const anyFilter = !!(fTier || fStage || q || fDueOnly || fTouchedOnly || fCompany || fSector);

  function clearFilters(keepSector = false) {
    setFTier(""); setFStage(""); setQ(""); setFDueOnly(false); setFTouchedOnly(false); setFCompany("");
    if (!keepSector) setFSector("");
  }

  function startEdit(c: Contact | "new", company?: string) {
    setEditing(c);
    setForm(c === "new" ? { ...emptyForm, company: company ?? "", sector: fSector || "Medical" } : {
      sector: c.sector ?? "Medical", name: c.name, company: c.company ?? "", title: c.title ?? "", phone: c.phone ?? "", email: c.email ?? "",
      address: c.address ?? "", buildings: c.buildings ?? "", prospect_type: c.prospect_type ?? "Property Manager",
      tier: c.tier ?? "B", lead_score: c.lead_score ?? 2, angle: c.angle ?? "", notes: c.notes ?? "",
    });
  }

  async function saveEdit() {
    if (!form.name.trim()) { showError("Name is required."); return; }
    setBusy(true);
    const payload = { ...form, name: form.name.trim(), updated_at: new Date().toISOString() };
    const res = editing === "new"
      ? await supabase.from("contacts").insert({ ...payload, industry: "medical property" })
      : await supabase.from("contacts").update(payload).eq("id", (editing as Contact).id);
    setBusy(false);
    if (res.error) { showError("Save failed: " + res.error.message); return; }
    showToast(editing === "new" ? "Contact added" : "Saved");
    setEditing(null);
    load();
  }

  async function convertCompany(co: string, ps: Contact[], toClient: boolean) {
    const ok = await ask(toClient
      ? { title: `Convert ${co} to a client?`, body: "All its contacts move to the Clients group.", confirm: "Convert" }
      : { title: `Move ${co} back to prospect?`, body: "Its contacts go back to Grade A, Not started.", confirm: "Move back" });
    if (!ok) return;
    const ids = ps.map((p) => p.id);
    const { error } = await supabase.from("contacts").update(toClient
      ? { tier: "Client", stage: "Client", updated_at: new Date().toISOString() }
      : { tier: "A", stage: "Not started", updated_at: new Date().toISOString() }
    ).in("id", ids);
    if (error) showError("Save failed: " + error.message);
    else showToast(toClient ? `${co} is a client` : `${co} moved back to prospect`);
    load();
  }

  function remove(c: Contact) {
    setEditing(null);
    undoable({
      text: `Deleted ${c.name}`,
      hide: () => { setContacts((cs) => (cs ?? []).filter((x) => x.id !== c.id)); setViewing((v) => (v?.id === c.id ? null : v)); },
      restore: () => load(),
      commit: () => supabase.from("contacts").delete().eq("id", c.id),
    });
  }

  if (err) return <LoadError message={err} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Prospects"
        sub={contacts ? `${shown.length} compan${shown.length === 1 ? "y" : "ies"} · ${all.length} contacts` : "Loading…"}
        actions={<Button onClick={() => startEdit("new")}><Plus size={16} /> Add contact</Button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        <Stat label="Companies" value={shown.length} hint={anyFilter ? "Tap to clear filters" : undefined} onClick={() => clearFilters()} />
        <Stat label="Contacts" value={all.length} hint={fSector || "All sectors"} onClick={() => clearFilters(true)} />
        <Stat label="Touched" value={touched} hint={fTouchedOnly ? "Filter on" : "Tap to filter"} onClick={() => setFTouchedOnly(!fTouchedOnly)}
          className={cn(fTouchedOnly && "border-white/40 bg-white/[0.06]")} />
        <Stat label="Follow-ups due" value={due} tone={due > 0 || fDueOnly ? "warn" : undefined} hint={fDueOnly ? "Filter on" : "Tap to filter"} onClick={() => setFDueOnly(!fDueOnly)}
          className={cn(fDueOnly && "border-amber-400/60 bg-amber-500/[0.06]")} />
      </div>

      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies, contacts, buildings…" className="pl-9" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <NativeSelect value={fSector} onChange={(e) => { setFSector(e.target.value); setFCompany(""); }} aria-label="Sector">
            <option value="">All sectors</option>
            {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
          </NativeSelect>
          <NativeSelect value={fTier} onChange={(e) => { setFTier(e.target.value); setFCompany(""); }} aria-label="Grade">
            <option value="">All grades</option>
            <option value="A">Grade A</option>
            <option value="B">Grade B</option>
            <option value="C">Grade C</option>
            <option value="Broker">Brokers</option>
            <option value="Client">Clients</option>
          </NativeSelect>
          <NativeSelect value={fStage} onChange={(e) => setFStage(e.target.value)} aria-label="Stage">
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </NativeSelect>
          <NativeSelect value={fCompany} onChange={(e) => { setFCompany(e.target.value); if (e.target.value) setOpen(e.target.value); }} aria-label="Company">
            <option value="">All companies ({companyOptions.length})</option>
            {companyOptions.map((co) => <option key={co} value={co}>{co}</option>)}
          </NativeSelect>
        </div>
        {anyFilter ? (
          <button onClick={() => clearFilters()} className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-400 hover:text-white">
            <X size={12} /> Clear filters
          </button>
        ) : null}
      </div>

      {!contacts ? <ListSkeleton /> : shown.length === 0 ? (
        list.length === 0
          ? <Empty icon={<Users size={22} />} title="No prospects yet" body="Add the property managers and facilities people you want to work for." action={<Button onClick={() => startEdit("new")}><Plus size={16} /> Add contact</Button>} />
          : <Empty icon={<Search size={22} />} title="Nothing matches" body="Try a different search or clear the filters." action={<Button variant="outline" onClick={() => clearFilters()}>Clear filters</Button>} />
      ) : (
        <div className="space-y-5">
          {sections.map((sec, si) => (
            <section key={si}>
              {!fTier ? (
                <SectionTitle right={<span className="text-xs text-neutral-500">{sec.items.length}</span>}>
                  <span className="inline-flex items-center gap-1.5">
                    {sec.tier === "Client" ? <Star size={15} className="fill-white text-white" /> : null}
                    {tierLabel(sec.tier)}
                  </span>
                </SectionTitle>
              ) : null}
              <div className="grid grid-cols-1 items-start gap-2.5 md:grid-cols-2">
                {sec.items.map(([co, ps]) => {
                  const first = ps[0];
                  const dueN = ps.filter(isDue).length;
                  const isOpen = open === co;
                  return (
                    <Card key={co} className={cn(isOpen && "md:col-span-2")}>
                      <button className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(isOpen ? null : co)} aria-expanded={isOpen}>
                        <Building2 size={18} className="shrink-0 text-neutral-500" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-white">{co}</div>
                          <div className="truncate text-xs text-neutral-400">{ps.length} contact{ps.length === 1 ? "" : "s"}{first.buildings ? ` · ${first.buildings.split("·")[0].trim()}` : ""}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {dueN ? <Badge variant="warning">{dueN} due</Badge> : null}
                          <Badge variant={first.tier === "Client" ? "solid" : "muted"}>{first.tier === "Client" ? <><Star size={11} className="fill-current" /> Client</> : first.tier ?? "—"}</Badge>
                          {isOpen ? <ChevronDown size={16} className="text-neutral-500" /> : <ChevronRight size={16} className="text-neutral-500" />}
                        </div>
                      </button>
                      {isOpen ? (
                        <div className="space-y-3 border-t border-border px-4 py-3">
                          {first.buildings ? <p className="text-xs text-neutral-400"><span className="font-semibold text-neutral-500">RI buildings: </span>{first.buildings}</p> : null}
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            {ps.map((c) => (
                              <button key={c.id} onClick={() => setViewing(c)} className="flex min-h-[48px] w-full items-center gap-3 rounded-lg border border-transparent bg-white/[0.04] px-3 py-2.5 text-left hover:border-white/15">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-neutral-800 text-xs font-bold text-neutral-300">{initials(c.name)}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-white">{c.name}</span>
                                  <span className="block truncate text-xs text-neutral-400">{c.title ?? ""}</span>
                                </span>
                                {isDue(c) ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-label="Follow-up due" /> : null}
                                <Badge variant={c.stage === "Won" || c.stage === "Client" ? "success" : c.stage === "Dead" ? "danger" : c.stage === "Not started" ? "muted" : "default"} className="shrink-0">{c.stage}</Badge>
                                <ChevronRight size={16} className="shrink-0 text-neutral-500" />
                              </button>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={() => startEdit("new", co)}><Plus size={14} /> Contact at {co}</Button>
                            {first.tier === "Client" ? (
                              <Button variant="ghost" size="sm" onClick={() => convertCompany(co, ps, false)}>Back to prospect</Button>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => convertCompany(co, ps, true)}><Star size={14} /> Convert to client</Button>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* contact peek */}
      <Sheet open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        {viewing ? (() => {
          const v = viewing;
          const curIdx = PATH.indexOf(v.stage);
          const isEmail = (v.email ?? "").includes("@") && !(v.email ?? "").includes("*");
          const hasPhone = !!v.phone && /\d{3}/.test(v.phone);
          return (
            <SheetContent title={v.name}>
              <div className="border-b border-border px-5 pb-3 pt-4">
                <div className="flex items-start gap-3 pr-8">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-600 bg-neutral-800 text-sm font-bold text-white">{initials(v.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-tight text-white">{v.name}</div>
                    <div className="truncate text-xs text-neutral-400">{[v.title, coShortName(v.company)].filter(Boolean).join(" · ")}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-neutral-400">
                      {v.sector ?? "Medical"} · Grade {scoreLetter(v.lead_score)}
                      {v.tier === "Client" ? <><span>·</span><Star size={11} className="fill-current" /> Client</> : null}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {hasPhone ? (
                    <Button asChild size="sm" className="h-10"><a href={`tel:${v.phone!.replace(/[^0-9+]/g, "").slice(0, 11)}`}><Phone size={14} /> Call</a></Button>
                  ) : <Button size="sm" variant="outline" className="h-10" disabled><Phone size={14} /> Call</Button>}
                  {isEmail ? (
                    <Button asChild size="sm" variant="outline" className="h-10"><a href={`mailto:${v.email}`}><Mail size={14} /> Email</a></Button>
                  ) : <Button size="sm" variant="outline" className="h-10" disabled><Mail size={14} /> Email</Button>}
                  <Button asChild size="sm" variant="outline" className="h-10"><a href={`/marketing/campaign?c=${v.id}`}><Megaphone size={14} /> <span className="hidden sm:inline">Campaign</span><span className="sm:hidden">Seq.</span></a></Button>
                  <Button size="sm" variant="outline" className="h-10" onClick={() => { setViewing(null); startEdit(v); }}><Pencil size={14} /> Edit</Button>
                </div>
              </div>
              <div key={v.id} className="flex-1 space-y-4 overflow-y-auto px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <div>
                  <Label>Pipeline stage</Label>
                  <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                    {PATH.map((s, i) => (
                      <button key={s} onClick={() => patch(v, { stage: s, last_touch: v.last_touch ?? (s === "Not started" ? v.last_touch : todayISO()) } as any)}
                        className={cn("inline-flex h-9 shrink-0 items-center gap-1 px-3 text-xs font-semibold first:rounded-l-lg last:rounded-r-lg",
                          i <= curIdx && curIdx >= 0 ? (i === curIdx ? "bg-white text-neutral-900" : "bg-neutral-600 text-white") : "bg-neutral-800 text-neutral-400 hover:text-white")}>
                        {i < curIdx ? <Check size={12} /> : null}{s}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant={v.stage === "Dead" ? "destructive" : "outline"} onClick={() => patch(v, { stage: "Dead" } as any)}>Mark dead</Button>
                    <Button size="sm" variant="outline" className={cn(v.stage === "Client" && "border-emerald-500/50 text-emerald-300")} onClick={() => patch(v, { stage: "Client", tier: "Client" } as any)}>
                      <Star size={13} /> Won → Client
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Follow-up due">
                    <Input type="date" className={cn(isDue(v) && "border-amber-500/60")} value={v.next_date ?? ""} onChange={(e) => patch(v, { next_date: e.target.value || null } as any)} />
                  </Field>
                  <Field label="Last touch">
                    <Input type="date" value={v.last_touch ?? ""} onChange={(e) => patch(v, { last_touch: e.target.value || null } as any)} />
                  </Field>
                  <Field label="Next step" className="col-span-2">
                    <Input placeholder="e.g. send one-pager" defaultValue={v.next_action ?? ""} onBlur={(e) => { if (e.target.value !== (v.next_action ?? "")) patch(v, { next_action: e.target.value || null } as any); }} />
                  </Field>
                </div>
                <Card className="space-y-2 p-4 text-sm">
                  <div className="text-[13px] font-semibold text-neutral-400">About</div>
                  {v.phone ? <p><span className="text-neutral-400">Phone: </span><span className="text-neutral-200">{v.phone}</span></p> : null}
                  {v.email ? <p className="break-all"><span className="text-neutral-400">Email/LinkedIn: </span><span className="text-neutral-200">{v.email}</span></p> : null}
                  {v.company ? <p><span className="text-neutral-400">Company: </span><span className="text-neutral-200">{v.company}</span></p> : null}
                  {v.buildings ? <p className="text-xs leading-relaxed"><span className="text-neutral-400">RI buildings: </span><span className="text-neutral-300">{v.buildings}</span></p> : null}
                  {v.angle ? <p className="text-xs leading-relaxed"><span className="text-neutral-400">Angle: </span><span className="text-neutral-300">{v.angle}</span></p> : null}
                  {v.notes ? <p className="text-xs leading-relaxed"><span className="text-neutral-400">Notes: </span><span className="text-neutral-300">{v.notes}</span></p> : null}
                </Card>
              </div>
            </SheetContent>
          );
        })() : null}
      </Sheet>

      {/* add / edit */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === "new" ? "Add contact" : "Edit contact"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label="Phone"><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            </div>
            <Field label="Email / LinkedIn"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Sector">
              <NativeSelect value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
                {SECTORS.map((s) => <option key={s}>{s}</option>)}
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Type">
                <NativeSelect value={form.prospect_type} onChange={(e) => setForm({ ...form, prospect_type: e.target.value })}>
                  {PTYPES.map((t) => <option key={t}>{t}</option>)}
                </NativeSelect>
              </Field>
              <div className="grid grid-cols-2 gap-3 sm:contents">
                <Field label="Tier">
                  <NativeSelect value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                    {["A", "B", "C", "Broker", "Client"].map((t) => <option key={t}>{t}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Score">
                  <NativeSelect value={form.lead_score} onChange={(e) => setForm({ ...form, lead_score: Number(e.target.value) })}>
                    <option value={3}>A</option><option value={2}>B</option><option value={1}>C</option>
                  </NativeSelect>
                </Field>
              </div>
            </div>
            <Field label="RI buildings"><Textarea rows={2} className="min-h-0" value={form.buildings} onChange={(e) => setForm({ ...form, buildings: e.target.value })} /></Field>
            <Field label="Outreach angle (why this person)"><Textarea rows={2} className="min-h-0" value={form.angle} onChange={(e) => setForm({ ...form, angle: e.target.value })} /></Field>
            <Field label="Notes"><Textarea rows={2} className="min-h-0" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            {editing && editing !== "new" ? (
              <Button variant="destructive" className="sm:mr-auto" onClick={() => remove(editing as Contact)}><Trash2 size={15} /> Delete</Button>
            ) : null}
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
