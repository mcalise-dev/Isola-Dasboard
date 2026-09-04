"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Contact, STAGES, PTYPES, SECTORS, TIER_ORDER, isDue, scoreLetter } from "@/lib/crm";
import { todayISO } from "@/lib/format";

const coShortName = (n: string | null) => (n ?? "").replace(/\s*\(.*?\)\s*/g, "").trim();
const emptyForm = { sector: "Medical", name: "", company: "", title: "", phone: "", email: "", address: "", buildings: "", prospect_type: "Property Manager", tier: "B", lead_score: 2, angle: "", notes: "" };

export default function CrmTab() {
  const supabase = useMemo(() => createClient(), []);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
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
    const { data } = await supabase.from("contacts").select("*").order("company");
    const list = (data as Contact[]) ?? [];
    setContacts(list);
    setViewing((v) => (v ? list.find((x) => x.id === v.id) ?? null : null));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function patch(c: Contact, fields: Partial<Contact>) {
    await supabase.from("contacts").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", c.id);
    load();
  }

  const companies = useMemo(() => {
    const map = new Map<string, Contact[]>();
    contacts.forEach((c) => {
      const k = c.company ?? "—";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    });
    let list = [...map.entries()];
    list.sort((a, b) => (TIER_ORDER[a[1][0].tier ?? "C"] ?? 9) - (TIER_ORDER[b[1][0].tier ?? "C"] ?? 9) || a[0].localeCompare(b[0]));
    return list;
  }, [contacts]);

  const companyOptions = companies
    .filter(([, ps]) => (!fSector || (ps[0].sector ?? "Medical") === fSector) && (!fTier || ps[0].tier === fTier))
    .map(([co]) => co);
  const isTouched = (p: Contact) => !["Not started", "Client"].includes(p.stage);
  const shown = companies
    .filter(([co, ps]) => (!fCompany || co === fCompany) && (!fSector || (ps[0].sector ?? "Medical") === fSector) && (!fTier || ps[0].tier === fTier) && (!fDueOnly || ps.some(isDue)) && (!fTouchedOnly || ps.some(isTouched)))
    .map(([co, ps]) => {
      let list = ps;
      if (fStage) list = list.filter((p) => p.stage === fStage);
      if (fDueOnly) list = list.filter(isDue);
      if (fTouchedOnly) list = list.filter(isTouched);
      if (q) {
        const ql = q.toLowerCase();
        const coHay = [co, ps[0].buildings, ps[0].address].join(" ").toLowerCase();
        if (!coHay.includes(ql)) list = list.filter((p) => [p.name, p.title, p.notes].join(" ").toLowerCase().includes(ql));
      }
      return [co, list] as const;
    })
    .filter(([, list]) => list.length);

  const all = contacts.filter((c) => !fSector || (c.sector ?? "Medical") === fSector);
  const touched = all.filter((c) => !["Not started", "Client"].includes(c.stage)).length;
  const due = all.filter(isDue).length;

  function startEdit(c: Contact | "new", company?: string) {
    setEditing(c);
    setForm(c === "new" ? { ...emptyForm, company: company ?? "", sector: fSector || "Medical" } : {
      sector: c.sector ?? "Medical", name: c.name, company: c.company ?? "", title: c.title ?? "", phone: c.phone ?? "", email: c.email ?? "",
      address: c.address ?? "", buildings: c.buildings ?? "", prospect_type: c.prospect_type ?? "Property Manager",
      tier: c.tier ?? "B", lead_score: c.lead_score ?? 2, angle: c.angle ?? "", notes: c.notes ?? "",
    });
  }

  async function saveEdit() {
    if (!form.name.trim()) { alert("Name is required."); return; }
    setBusy(true);
    const payload = { ...form, name: form.name.trim(), updated_at: new Date().toISOString() };
    const res = editing === "new"
      ? await supabase.from("contacts").insert({ ...payload, industry: "medical property" })
      : await supabase.from("contacts").update(payload).eq("id", (editing as Contact).id);
    setBusy(false);
    if (res.error) { alert("Save failed: " + res.error.message); return; }
    setEditing(null);
    load();
  }

  async function convertCompany(co: string, ps: Contact[], toClient: boolean) {
    const label = toClient ? `Convert ${co} to a CLIENT? All its contacts move to the Clients group.` : `Move ${co} back to prospect (Grade A)?`;
    if (!confirm(label)) return;
    const ids = ps.map((p) => p.id);
    await supabase.from("contacts").update(toClient
      ? { tier: "Client", stage: "Client", updated_at: new Date().toISOString() }
      : { tier: "A", stage: "Not started", updated_at: new Date().toISOString() }
    ).in("id", ids);
    load();
  }

  async function remove(c: Contact) {
    if (!confirm(`Delete ${c.name}?`)) return;
    await supabase.from("contacts").delete().eq("id", c.id);
    setEditing(null);
    load();
  }

  const input = "w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
  const label = "block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1";

  const shownCompanyCount = shown.length;
  return (
    <div>
      <div className="sticky top-[57px] z-20 -mx-4 px-4 pt-2 pb-2 bg-black/95 backdrop-blur border-b border-neutral-800 mb-3">
        <div className="flex gap-2 mb-2">
          <select className={`${input} flex-1 min-w-0 font-semibold`} value={fSector} onChange={(e) => { setFSector(e.target.value); setFCompany(""); }}>
            <option value="">All sectors</option>
            <option value="Medical">🏥 Medical</option>
            <option value="Commercial">🏢 Commercial</option>
            <option value="Banks">🏦 Banks</option>
          </select>
          <select className={`${input} flex-1 min-w-0 font-semibold`} value={fTier} onChange={(e) => { setFTier(e.target.value); setFCompany(""); }}>
            <option value="">All grades</option>
            <option value="A">Grade A</option>
            <option value="B">Grade B</option>
            <option value="C">Grade C</option>
            <option value="Broker">Brokers</option>
            <option value="Client">★ Clients</option>
          </select>
          <select className={`${input} w-28 shrink-0`} value={fStage} onChange={(e) => setFStage(e.target.value)}>
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <select className={`${input} flex-1 min-w-0`} value={fCompany} onChange={(e) => { setFCompany(e.target.value); if (e.target.value) setOpen(e.target.value); }}>
            <option value="">All companies ({companyOptions.length})</option>
            {companyOptions.map((co) => <option key={co} value={co}>{co}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        <button onClick={() => { setFTier(""); setFStage(""); setQ(""); setFDueOnly(false); setFTouchedOnly(false); setFCompany(""); setFSector(""); }} className="rounded-xl border border-neutral-800 bg-neutral-900 p-2.5 text-center hover:border-neutral-500">
          <div className="text-lg font-bold leading-none tabular-nums text-white">{shownCompanyCount}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">Companies</div>
        </button>
        <button onClick={() => { setFTier(""); setFStage(""); setQ(""); setFDueOnly(false); setFTouchedOnly(false); setFCompany(""); }} className="rounded-xl border border-neutral-800 bg-neutral-900 p-2.5 text-center hover:border-neutral-500">
          <div className="text-lg font-bold leading-none tabular-nums text-white">{all.length}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">Contacts →</div>
        </button>
        <button onClick={() => setFTouchedOnly(!fTouchedOnly)} className={`rounded-xl border p-2.5 text-center hover:border-neutral-400 ${fTouchedOnly ? "border-neutral-300 bg-neutral-800" : "border-neutral-800 bg-neutral-900"}`}>
          <div className="text-lg font-bold leading-none tabular-nums text-white">{touched}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">Touched{fTouchedOnly ? " ✓" : " →"}</div>
        </button>
        <button onClick={() => setFDueOnly(!fDueOnly)} className={`rounded-xl border p-2.5 text-center hover:border-amber-400 ${fDueOnly ? "border-amber-400 bg-neutral-800" : due > 0 ? "border-amber-500/50 bg-neutral-900" : "border-neutral-800 bg-neutral-900"}`}>
          <div className={`text-lg font-bold leading-none tabular-nums ${due > 0 || fDueOnly ? "text-amber-300" : "text-white"}`}>{due}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">Due{fDueOnly ? " ✓" : " →"}</div>
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies, contacts, buildings…" className={input} />
        <button onClick={() => startEdit("new")} className="shrink-0 rounded-lg bg-white text-neutral-900 px-3 text-sm font-semibold">+ Add</button>
      </div>

      {loading ? <p className="text-neutral-500 text-sm">Loading…</p> : null}
      {!loading && shown.length === 0 ? <p className="text-neutral-500 text-sm">Nothing matches.</p> : null}

      <div className="space-y-2.5">
        {shown.map(([co, ps], idx) => {
          const first = ps[0];
          const prevTier = idx > 0 ? (shown[idx - 1][1][0].tier ?? "—") : null;
          const tierHeader = !fTier && (first.tier ?? "—") !== prevTier ? (
            <div className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
              {first.tier === "Client" ? "★ Clients" : first.tier === "Broker" ? "Brokers / referral sources" : `Grade ${first.tier ?? "—"}`}
            </div>
          ) : null;
          const dueN = ps.filter(isDue).length;
          const isOpen = open === co;
          return (
            <div key={co}>
              {tierHeader}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900">
              <button className="w-full text-left px-4 py-3" onClick={() => setOpen(isOpen ? null : co)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate">{co}</div>
                    <div className="text-xs text-neutral-500 truncate">{ps.length} contact{ps.length === 1 ? "" : "s"}{first.buildings ? ` · ${first.buildings.split("·")[0].trim()}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {dueN ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">{dueN} due</span> : null}
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${first.tier === "Client" ? "bg-white text-neutral-900 border-white" : "border-neutral-600 text-neutral-300"}`}>{first.tier ?? "—"}</span>
                  </div>
                </div>
              </button>
              {isOpen ? (
                <div className="border-t border-neutral-800 px-4 py-3 space-y-3">
                  {first.buildings ? <p className="text-xs text-neutral-400"><span className="text-neutral-600 uppercase font-semibold">RI buildings: </span>{first.buildings}</p> : null}
                  {ps.map((c) => (
                    <button key={c.id} onClick={() => setViewing(c)} className="w-full text-left flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 hover:border-neutral-600">
                      <span className="w-8 h-8 shrink-0 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-[11px] font-bold text-neutral-300">{c.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-white truncate">{c.name}</span>
                        <span className="block text-xs text-neutral-500 truncate">{c.title ?? ""}</span>
                      </span>
                      {isDue(c) ? <span className="shrink-0 w-2 h-2 rounded-full bg-amber-400" /> : null}
                      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${c.stage === "Won" || c.stage === "Client" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : c.stage === "Not started" ? "border-neutral-700 text-neutral-500" : "border-neutral-500 text-neutral-200"}`}>{c.stage}</span>
                      <span className="shrink-0 text-neutral-600">›</span>
                    </button>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => startEdit("new", co)} className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300">+ Contact at {co}</button>
                    {first.tier === "Client" ? (
                      <button onClick={() => convertCompany(co, ps, false)} className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-400">↩ Back to prospect</button>
                    ) : (
                      <button onClick={() => convertCompany(co, ps, true)} className="rounded-lg bg-white text-neutral-900 px-2.5 py-1.5 text-xs font-semibold">★ Convert to Client</button>
                    )}
                  </div>
                </div>
              ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {viewing ? (() => {
        const v = viewing;
        const PATH = ["Not started", "Emailed", "Called", "Meeting", "Walk-through", "Proposal", "Won"];
        const curIdx = PATH.indexOf(v.stage);
        const isEmail = (v.email ?? "").includes("@") && !(v.email ?? "").includes("*");
        return (
          <div className="fixed inset-0 z-40 bg-black/80 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) setViewing(null); }}>
            <div className="w-full max-w-lg max-h-[94vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-t-2xl sm:rounded-2xl">
              <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 px-5 pt-4 pb-3 z-10">
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 shrink-0 rounded-full bg-neutral-800 border border-neutral-600 flex items-center justify-center text-sm font-bold text-white">{v.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white leading-tight">{v.name}</div>
                    <div className="text-xs text-neutral-400 truncate">{[v.title, coShortName(v.company)].filter(Boolean).join(" · ")}</div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">{v.sector ?? "Medical"} · Grade {scoreLetter(v.lead_score)}{v.tier === "Client" ? " · ★ Client" : ""}</div>
                  </div>
                  <button onClick={() => setViewing(null)} className="shrink-0 text-neutral-500 hover:text-white text-lg leading-none px-1">✕</button>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {v.phone && /\d{3}/.test(v.phone) ? (
                    <a href={`tel:${v.phone.replace(/[^0-9+]/g, "").slice(0, 11)}`} className="rounded-lg bg-white text-neutral-900 py-1.5 text-center text-xs font-bold">📞 Call</a>
                  ) : <span className="rounded-lg border border-neutral-800 py-1.5 text-center text-xs text-neutral-600">📞 Call</span>}
                  {isEmail ? (
                    <a href={`mailto:${v.email}`} className="rounded-lg bg-white text-neutral-900 py-1.5 text-center text-xs font-bold">✉️ Email</a>
                  ) : <span className="rounded-lg border border-neutral-800 py-1.5 text-center text-xs text-neutral-600">✉️ Email</span>}
                  <a href={`/marketing/campaign?c=${v.id}`} className="rounded-lg border border-neutral-600 py-1.5 text-center text-xs font-semibold text-white">📣 Campaign</a>
                  <button onClick={() => { setViewing(null); startEdit(v); }} className="rounded-lg border border-neutral-600 py-1.5 text-center text-xs font-semibold text-white">✏️ Edit</button>
                </div>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">Pipeline stage</div>
                  <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
                    {PATH.map((s, i) => (
                      <button key={s} onClick={() => patch(v, { stage: s, last_touch: v.last_touch ?? (s === "Not started" ? v.last_touch : todayISO()) } as any)}
                        className={`shrink-0 px-3 py-1.5 text-[11px] font-semibold first:rounded-l-lg last:rounded-r-lg ${i <= curIdx && curIdx >= 0 ? (i === curIdx ? "bg-white text-neutral-900" : "bg-neutral-600 text-white") : "bg-neutral-800 text-neutral-500"}`}>
                        {i < curIdx ? "✓ " : ""}{s}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-1.5">
                    <button onClick={() => patch(v, { stage: "Dead" } as any)} className={`text-[10px] px-2 py-0.5 rounded border ${v.stage === "Dead" ? "border-red-400 text-red-300" : "border-neutral-700 text-neutral-500"}`}>Mark Dead</button>
                    <button onClick={() => patch(v, { stage: "Client", tier: "Client" } as any)} className={`text-[10px] px-2 py-0.5 rounded border ${v.stage === "Client" ? "border-emerald-400 text-emerald-300" : "border-neutral-700 text-neutral-500"}`}>★ Won → Client</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={label}>Follow-up due</label>
                    <input type="date" className={`${input} ${isDue(v) ? "border-amber-500/60" : ""}`} value={v.next_date ?? ""} onChange={(e) => patch(v, { next_date: e.target.value || null } as any)} />
                  </div>
                  <div>
                    <label className={label}>Last touch</label>
                    <input type="date" className={input} value={v.last_touch ?? ""} onChange={(e) => patch(v, { last_touch: e.target.value || null } as any)} />
                  </div>
                  <div className="col-span-2">
                    <label className={label}>Next step</label>
                    <input className={input} placeholder="e.g. send one-pager" defaultValue={v.next_action ?? ""} onBlur={(e) => { if (e.target.value !== (v.next_action ?? "")) patch(v, { next_action: e.target.value || null } as any); }} />
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5 space-y-2 text-sm">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">About</div>
                  {v.phone ? <p><span className="text-neutral-500">Phone: </span><span className="text-neutral-200">{v.phone}</span></p> : null}
                  {v.email ? <p className="break-all"><span className="text-neutral-500">Email/LinkedIn: </span><span className="text-neutral-200">{v.email}</span></p> : null}
                  {v.company ? <p><span className="text-neutral-500">Company: </span><span className="text-neutral-200">{v.company}</span></p> : null}
                  {v.buildings ? <p className="text-xs leading-relaxed"><span className="text-neutral-500">RI buildings: </span><span className="text-neutral-300">{v.buildings}</span></p> : null}
                  {v.angle ? <p className="text-xs leading-relaxed"><span className="text-neutral-500">Angle: </span><span className="text-neutral-300">{v.angle}</span></p> : null}
                  {v.notes ? <p className="text-xs leading-relaxed"><span className="text-neutral-500">Notes: </span><span className="text-neutral-300">{v.notes}</span></p> : null}
                </div>
              </div>
            </div>
          </div>
        );
      })() : null}

      {editing ? (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-t-2xl sm:rounded-2xl p-5">
            <h2 className="font-bold text-white mb-4">{editing === "new" ? "Add contact" : "Edit contact"}</h2>
            <div className="space-y-3">
              <div><label className={label}>Name *</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className={label}>Company</label><input className={input} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Title</label><input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><label className={label}>Phone</label><input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div><label className={label}>Email / LinkedIn</label><input className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className={label}>Sector</label>
                <select className={input} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
                  {SECTORS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={label}>Type</label>
                  <select className={input} value={form.prospect_type} onChange={(e) => setForm({ ...form, prospect_type: e.target.value })}>
                    {PTYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div><label className={label}>Tier</label>
                  <select className={input} value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                    {["A", "B", "C", "Broker", "Client"].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div><label className={label}>Score</label>
                  <select className={input} value={form.lead_score} onChange={(e) => setForm({ ...form, lead_score: Number(e.target.value) })}>
                    <option value={3}>A</option><option value={2}>B</option><option value={1}>C</option>
                  </select>
                </div>
              </div>
              <div><label className={label}>RI buildings</label><textarea rows={2} className={input} value={form.buildings} onChange={(e) => setForm({ ...form, buildings: e.target.value })} /></div>
              <div><label className={label}>Outreach angle (why this person)</label><textarea rows={2} className={input} value={form.angle} onChange={(e) => setForm({ ...form, angle: e.target.value })} /></div>
              <div><label className={label}>Notes</label><textarea rows={2} className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex gap-2 mt-5">
              {editing !== "new" ? <button onClick={() => remove(editing as Contact)} className="rounded-lg border border-red-900 px-4 py-2.5 text-sm text-red-400">Delete</button> : null}
              <button onClick={() => setEditing(null)} className="flex-1 rounded-lg border border-neutral-700 py-2.5 text-sm text-neutral-300">Cancel</button>
              <button onClick={saveEdit} disabled={busy} className="flex-1 rounded-lg bg-white text-neutral-900 py-2.5 text-sm font-semibold disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
