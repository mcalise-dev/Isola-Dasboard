"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { STATUS_META, parsePrice, fmtDate } from "@/lib/format";

const TYPES: Record<string, { label: string; cls: string; hint: string }> = {
  medical:       { label: "Medical",       cls: "bg-rose-500/15 text-rose-300 border-rose-500/30",       hint: "Highest tier — price at the top of the range." },
  property_mgmt: { label: "Property mgmt", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30",       hint: "Commercial tier — above residential." },
  commercial:    { label: "Commercial",    cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",    hint: "Commercial tier — above residential." },
  municipal:     { label: "Municipal",     cls: "bg-teal-500/15 text-teal-300 border-teal-500/30",       hint: "Prevailing-wage / bid rules may apply." },
  partner:       { label: "Partner",       cls: "bg-violet-500/15 text-violet-300 border-violet-500/30", hint: "Partner work — check the THM ledger." },
  residential:   { label: "Residential",   cls: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30", hint: "Standard tier. $35/sq ft floor on pavers." },
};
const LEAD_SOURCES = ["Referral", "Repeat customer", "Google", "Facebook", "Instagram", "Truck / signage", "Drove by", "Property manager", "THM", "Other"];
const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const tel = (p: any) => String(p ?? "").replace(/[^0-9+]/g, "");
const dt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function CustomerProfile({ id }: { id: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [c, setC] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [props, setProps] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [comms, setComms] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [ar, setAr] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"work" | "activity" | "notes">("work");
  const [editing, setEditing] = useState(false);
  const [propEdit, setPropEdit] = useState<any>(null);
  const [contactEdit, setContactEdit] = useState<any>(null);
  const [note, setNote] = useState("");
  const [noteFile, setNoteFile] = useState<{ b64: string; name: string } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  async function load() {
    const [{ data: cust }, { data: js }, { data: ps }, { data: cs }, { data: cm }, { data: snap }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase.from("jobs").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
      supabase.from("properties").select("*").eq("customer_id", id).order("address"),
      supabase.from("customer_contacts").select("*").eq("customer_id", id).order("sort"),
      supabase.from("communications").select("*").eq("customer_id", id).order("occurred_at", { ascending: false }).limit(200),
      supabase.from("money_snapshot").select("data").eq("id", 1).maybeSingle(),
    ]);
    setC(cust); setJobs(js ?? []); setProps(ps ?? []); setContacts(cs ?? []); setComms(cm ?? []);
    const jobIds = (js ?? []).map((j: any) => j.id);
    if (jobIds.length) {
      const [{ data: pl }, { data: sv }] = await Promise.all([
        supabase.from("proposal_links").select("*").in("job_id", jobIds).order("created_at", { ascending: false }),
        supabase.from("site_visits").select("*").in("job_id", jobIds).order("created_at", { ascending: false }),
      ]);
      setLinks(pl ?? []); setVisits(sv ?? []);
    } else { setLinks([]); setVisits([]); }
    setAr(snap?.data ?? null);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <p className="pt-4 text-sm text-neutral-500">Loading…</p>;
  if (!c) return <p className="pt-4 text-sm text-neutral-500">Customer not found. <Link href="/customers" className="underline">Back to customers</Link></p>;

  const t = TYPES[c.client_type] ?? TYPES.residential;
  const names = [c.name, ...(c.qbo_names ?? [])].map((n: string) => n.toLowerCase());
  const myInvoices = (ar?.invoices ?? []).filter((i: any) => names.includes(String(i.customer ?? "").toLowerCase()));
  const balance = myInvoices.reduce((a: number, i: any) => a + Number(i.amount ?? 0), 0);
  const overdue = myInvoices.filter((i: any) => (i.days_overdue ?? 0) > 0);
  const lifetime = jobs.reduce((a, j) => a + parsePrice(j.price), 0);
  const openJobs = jobs.filter((j) => j.status !== "complete");
  const jobsAt = (pid: string) => jobs.filter((j) => j.property_id === pid).length;

  // one chronological story for the whole relationship
  const feed = [
    ...jobs.map((j) => ({ at: j.created_at, icon: "🗂️", text: `Job created — ${j.job_name || j.location}`, sub: j.job })),
    ...jobs.filter((j) => j.completed_date).map((j) => ({ at: j.completed_date + "T17:00:00Z", icon: "✅", text: `Completed — ${j.job_name || j.location}`, sub: j.price })),
    ...jobs.filter((j) => j.invoiced_date).map((j) => ({ at: j.invoiced_date + "T12:00:00Z", icon: "🧾", text: `Invoiced — ${j.job_name || j.location}`, sub: j.price })),
    ...jobs.filter((j) => j.paid_date).map((j) => ({ at: j.paid_date + "T12:00:00Z", icon: "💵", text: `Paid — ${j.job_name || j.location}`, sub: j.price })),
    ...links.map((l) => ({ at: l.sent_at, icon: "📤", text: `Proposal link sent — ${l.title ?? ""}`, sub: l.price ? money(Number(l.price)) : null })),
    ...links.filter((l) => l.viewed_at).map((l) => ({ at: l.viewed_at, icon: "👀", text: `Client opened the proposal${l.view_count > 1 ? ` (${l.view_count}×)` : ""}`, sub: l.title })),
    ...links.filter((l) => l.approved_at).map((l) => ({ at: l.approved_at, icon: "✍️", text: `Proposal approved by ${l.approved_by}`, sub: l.title })),
    ...visits.map((v) => ({ at: v.created_at, icon: "📍", text: "Site visit logged", sub: v.observed_conditions ?? v.purpose })),
    ...comms.map((m) => ({ at: m.occurred_at, icon: m.kind === "call" ? "📞" : m.kind === "email" ? "✉️" : "📝", text: m.body, sub: null })),
  ].filter((e) => e.at).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  async function addNote() {
    if (!note.trim() && !noteFile) return;
    await supabase.from("communications").insert({
      customer_id: id, kind: "note", direction: "out",
      body: note.trim() || (noteFile ? "Attached " + noteFile.name : ""),
      attachment_b64: noteFile?.b64 ?? null, attachment_name: noteFile?.name ?? null,
    });
    setNote(""); setNoteFile(null); load();
  }
  async function delNote(nid: string) { await supabase.from("communications").delete().eq("id", nid); load(); }
  async function delProp(pid: string) {
    if (jobsAt(pid) > 0) { alert("That property has jobs on it — reassign them first."); return; }
    if (!confirm("Delete this property?")) return;
    await supabase.from("properties").delete().eq("id", pid); load();
  }

  return (
    <div className="pt-1 space-y-4">
      <Link href="/customers" className="text-[11px] text-neutral-500 hover:text-neutral-300">‹ All customers</Link>

      {/* header */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-white leading-tight">{c.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${t.cls}`}>{t.label}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-neutral-700 text-neutral-400">
                {c.kind === "individual" ? "Individual" : "Company"}
              </span>
              {(c.tags ?? []).map((tag: string) => (
                <span key={tag} className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-900 text-neutral-300">{tag}</span>
              ))}
              {c.archived ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-red-500/40 text-red-300">Archived</span> : null}
            </div>
          </div>
          <button onClick={() => setEditing(true)} className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-[11px] font-semibold text-neutral-300 hover:border-neutral-500">Edit</button>
        </div>
        <p className="mt-1.5 text-[11px] text-neutral-500">{t.hint}</p>
      </div>

      {/* the numbers that matter */}
      <div className="grid grid-cols-4 gap-2">
        <Tile v={money0(lifetime)} l="Lifetime" />
        <Tile v={money0(balance)} l="Balance" tone={overdue.length ? "red" : balance ? "amber" : undefined} />
        <Tile v={String(jobs.length)} l="Jobs" />
        <Tile v={String(openJobs.length)} l="Open" tone={openJobs.length ? "amber" : undefined} />
      </div>

      {myInvoices.length ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">Open invoices — QuickBooks</div>
          <div className="space-y-1">
            {myInvoices.map((i: any) => (
              <div key={i.ref} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-neutral-300 truncate">#{i.ref}<span className="text-neutral-600"> · due {i.due}</span></span>
                <span className={`shrink-0 font-bold tabular-nums ${i.days_overdue > 0 ? "text-red-300" : "text-neutral-200"}`}>
                  {money(Number(i.amount))}{i.days_overdue > 0 ? ` · ${i.days_overdue}d late` : ""}
                </span>
              </div>
            ))}
          </div>
          {ar?.as_of ? <p className="mt-1.5 text-[10px] text-neutral-600">As of {ar.as_of}</p> : null}
        </div>
      ) : null}

      {/* contact */}
      <Card title="Contact">
        <Row k="Contact" v={c.contact_name} />
        <Row k="Phone" v={c.phone} href={c.phone ? `tel:${tel(c.phone)}` : undefined} />
        <Row k="Email" v={c.email} href={c.email ? `mailto:${c.email}` : undefined} />
        <Row k="Billing address" v={c.address} />
        <Row k="Payment terms" v={c.payment_terms} />
        <Row k="Lead source" v={c.lead_source} />
        <Row k="Client since" v={c.client_since ? fmtDate(c.client_since) : null} />
        {c.notes ? <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-neutral-400">{c.notes}</p> : null}
      </Card>

      {/* additional contacts */}
      <Card title={`People — ${contacts.length}`} action={<button onClick={() => setContactEdit({})} className="text-[11px] font-semibold text-neutral-400 underline">+ Add</button>}>
        {contacts.length === 0 ? <p className="text-xs text-neutral-600">Just the main contact.</p> : null}
        <div className="space-y-1">
          {contacts.map((p) => (
            <div key={p.id} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white">
                  {p.name}{p.role ? <span className="text-neutral-500 font-normal"> · {p.role}</span> : null}
                  {p.is_billing ? <span className="ml-1.5 text-[9px] font-bold px-1.5 py-px rounded-full border border-emerald-500/40 text-emerald-300">BILLING</span> : null}
                </div>
                <div className="text-[11px] text-neutral-500 truncate">{[p.phone, p.email].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <div className="shrink-0 flex gap-1.5">
                {p.phone ? <a href={`tel:${tel(p.phone)}`} className={btn}>📞</a> : null}
                <button onClick={() => setContactEdit(p)} className={btn}>Edit</button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* properties */}
      <Card title={`Properties — ${props.length}`} action={<button onClick={() => setPropEdit({})} className="text-[11px] font-semibold text-neutral-400 underline">+ Add</button>}>
        {props.length === 0 ? <p className="text-xs text-neutral-600">No properties yet.</p> : null}
        <div className="space-y-1">
          {props.map((p) => (
            <div key={p.id} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {p.label ? <div className="text-xs font-bold text-white">{p.label}</div> : null}
                  <div className={`text-xs ${p.label ? "text-neutral-400" : "font-semibold text-white"} truncate`}>{p.address}</div>
                  <div className="text-[11px] text-neutral-600">
                    {[p.city, p.state, p.zip].filter(Boolean).join(", ")}
                    {jobsAt(p.id) ? `${[p.city, p.state, p.zip].filter(Boolean).length ? " · " : ""}${jobsAt(p.id)} job${jobsAt(p.id) === 1 ? "" : "s"}` : ""}
                  </div>
                  {p.access_notes ? <div className="mt-1 text-[11px] text-amber-300/80">⚠ {p.access_notes}</div> : null}
                </div>
                <div className="shrink-0 flex gap-1.5">
                  <a href={`https://maps.google.com/?q=${encodeURIComponent([p.address, p.city, p.state].filter(Boolean).join(", "))}`} target="_blank" rel="noopener noreferrer" className={btn}>🧭</a>
                  <button onClick={() => setPropEdit(p)} className={btn}>Edit</button>
                  <button onClick={() => delProp(p.id)} className={btn}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* tabs */}
      <div className="flex gap-1.5">
        {([["work", "Work"], ["activity", "Activity"], ["notes", "Notes"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${tab === k ? "border-white bg-neutral-800 text-white" : "border-neutral-700 text-neutral-400"}`}>{l}</button>
        ))}
      </div>

      {tab === "work" ? (
        <div className="space-y-3">
          <Card title={`Jobs — ${jobs.length}`}>
            {jobs.length === 0 ? <p className="text-xs text-neutral-600">No jobs yet.</p> : null}
            <div className="space-y-1">
              {jobs.map((j) => {
                const m = STATUS_META[j.status] ?? STATUS_META.booked;
                return (
                  <div key={j.id} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{j.job_name || j.location}</div>
                      <div className="text-[11px] text-neutral-500 truncate">
                        {[j.job, j.price, j.completed_date ? "done " + fmtDate(j.completed_date) : null].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title={`Proposals — ${links.length}`}>
            {links.length === 0 ? <p className="text-xs text-neutral-600">No client links sent.</p> : null}
            <div className="space-y-1">
              {links.map((l) => (
                <div key={l.id} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{l.title ?? "Proposal"}</div>
                    <div className="text-[11px] text-neutral-500">
                      {l.price ? money(Number(l.price)) : "no price"} · sent {dt(l.sent_at)}{l.view_count ? ` · opened ${l.view_count}×` : ""}
                    </div>
                  </div>
                  <a href={`/p/${l.token}`} target="_blank" rel="noopener noreferrer"
                    className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${l.status === "approved" ? "border-emerald-500/40 text-emerald-300" : l.status === "declined" ? "border-neutral-700 text-neutral-500" : "border-blue-500/40 text-blue-300"}`}>
                    {l.status}
                  </a>
                </div>
              ))}
            </div>
          </Card>

          <Card title={`Site visits — ${visits.length}`}>
            {visits.length === 0 ? <p className="text-xs text-neutral-600">None logged.</p> : null}
            <div className="space-y-1">
              {visits.map((v) => (
                <div key={v.id} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
                  <div className="text-[11px] text-neutral-500">{v.visit_date ? fmtDate(v.visit_date) : dt(v.created_at)}</div>
                  <div className="text-xs text-neutral-300 whitespace-pre-wrap">{v.observed_conditions ?? v.purpose ?? "—"}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "activity" ? (
        <Card title={`Everything, newest first — ${feed.length}`}>
          {feed.length === 0 ? <p className="text-xs text-neutral-600">Nothing yet.</p> : null}
          <div className="space-y-0">
            {feed.map((e, i) => (
              <div key={i} className="flex gap-2.5 py-2 border-b border-neutral-900 last:border-0">
                <span className="shrink-0 text-sm leading-tight">{e.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-neutral-200">{e.text}</div>
                  {e.sub ? <div className="text-[11px] text-neutral-600 truncate">{e.sub}</div> : null}
                </div>
                <span className="shrink-0 text-[10px] text-neutral-600">{dt(e.at)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === "notes" ? (
        <Card title="Notes">
          <div className="space-y-2 mb-3">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What should you remember about this customer?"
              className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500" />
            <div className="flex gap-2 items-center">
              <input type="file" accept="image/*" capture="environment"
                onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const bm = await createImageBitmap(f);
                  const scale = Math.min(1, 1100 / Math.max(bm.width, bm.height));
                  const cv = document.createElement("canvas");
                  cv.width = Math.round(bm.width * scale); cv.height = Math.round(bm.height * scale);
                  cv.getContext("2d")!.drawImage(bm, 0, 0, cv.width, cv.height);
                  setNoteFile({ b64: cv.toDataURL("image/jpeg", 0.72), name: f.name });
                }}
                className="flex-1 text-[11px] text-neutral-500 file:mr-2 file:rounded-lg file:border file:border-neutral-700 file:bg-neutral-900 file:px-2 file:py-1 file:text-[11px] file:text-neutral-300" />
              <button onClick={addNote} disabled={!note.trim() && !noteFile} className="rounded-lg bg-white text-black px-4 py-1.5 text-xs font-bold disabled:opacity-40">Save</button>
            </div>
            {noteFile ? <img src={noteFile.b64} alt="" className="h-20 rounded-lg border border-neutral-800" /> : null}
          </div>
          <div className="space-y-1">
            {comms.length === 0 ? <p className="text-xs text-neutral-600">Nothing logged yet.</p> : null}
            {comms.map((m) => (
              <div key={m.id} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs text-neutral-200 whitespace-pre-wrap flex-1">{m.body}</div>
                  <button onClick={() => delNote(m.id)} className="shrink-0 text-neutral-700 hover:text-red-400 text-xs">✕</button>
                </div>
                {m.attachment_b64 ? <img src={m.attachment_b64} alt="" onClick={() => setLightbox(m.attachment_b64)} className="mt-1.5 h-20 rounded border border-neutral-800 cursor-pointer" /> : null}
                <div className="text-[10px] text-neutral-600 mt-0.5">{m.kind} · {new Date(m.occurred_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {editing ? <EditCustomer supabase={supabase} c={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} /> : null}
      {propEdit ? <EditProperty supabase={supabase} customerId={id} p={propEdit.id ? propEdit : null} onClose={() => setPropEdit(null)} onSaved={() => { setPropEdit(null); load(); }} /> : null}
      {contactEdit ? <EditContact supabase={supabase} customerId={id} p={contactEdit.id ? contactEdit : null} onClose={() => setContactEdit(null)} onSaved={() => { setContactEdit(null); load(); }} /> : null}
      {lightbox ? <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setLightbox(null)}><img src={lightbox} alt="" className="max-h-full max-w-full object-contain" /></div> : null}
    </div>
  );
}

const btn = "px-2 py-1 rounded-lg text-[11px] font-semibold border border-neutral-700 text-neutral-300 hover:border-neutral-500";
const inp = "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500";

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3.5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
function Row({ k, v, href }: { k: string; v?: string | null; href?: string }) {
  if (!v) return null;
  return (
    <div className="flex justify-between gap-3 py-1 text-xs border-b border-neutral-900 last:border-0">
      <span className="text-neutral-500 shrink-0">{k}</span>
      {href ? <a href={href} className="text-neutral-200 underline text-right">{v}</a> : <span className="text-neutral-200 text-right">{v}</span>}
    </div>
  );
}
function Tile({ v, l, tone }: { v: string; l: string; tone?: "amber" | "red" }) {
  const b = tone === "red" ? "border-red-500/50" : tone === "amber" ? "border-amber-500/50" : "border-neutral-800";
  const c = tone === "red" ? "text-red-300" : tone === "amber" ? "text-amber-300" : "text-white";
  return (
    <div className={`rounded-xl border ${b} bg-neutral-900 p-2.5 text-center`}>
      <div className={`text-sm font-bold leading-none ${c}`}>{v}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">{l}</div>
    </div>
  );
}
function F({ l, children }: { l: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">{l}</span>{children}</label>;
}
function Modal({ title, onClose, children }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/85 overflow-y-auto p-3">
      <div className="mx-auto max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-4 my-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-white">{title}</div>
          <button onClick={onClose} className="text-neutral-500 text-lg leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditCustomer({ supabase, c, onClose, onSaved }: any) {
  const [f, setF] = useState({
    name: c.name ?? "", kind: c.kind ?? "company", contact_name: c.contact_name ?? "", phone: c.phone ?? "",
    email: c.email ?? "", address: c.address ?? "", client_type: c.client_type ?? "residential",
    lead_source: c.lead_source ?? "", payment_terms: c.payment_terms ?? "", client_since: c.client_since ?? "",
    tags: (c.tags ?? []).join(", "), qbo_names: (c.qbo_names ?? []).join(", "), notes: c.notes ?? "", archived: c.archived ?? false,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));
  const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function save() {
    if (!f.name.trim()) { alert("Name is required."); return; }
    setBusy(true);
    const { error } = await supabase.from("customers").update({
      ...f, name: f.name.trim(), tags: split(f.tags), qbo_names: split(f.qbo_names),
      client_since: f.client_since || null, updated_at: new Date().toISOString(),
    }).eq("id", c.id);
    setBusy(false);
    if (error) alert("Save failed: " + error.message); else onSaved();
  }

  return (
    <Modal title="Edit customer" onClose={onClose}>
      <div className="space-y-2.5">
        <F l="Name"><input value={f.name} onChange={set("name")} className={inp} /></F>
        <div className="grid grid-cols-2 gap-2">
          <F l="Kind"><select value={f.kind} onChange={set("kind")} className={inp}><option value="company">Company</option><option value="individual">Individual</option></select></F>
          <F l="Client type"><select value={f.client_type} onChange={set("client_type")} className={inp}>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select></F>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <F l="Main contact"><input value={f.contact_name} onChange={set("contact_name")} className={inp} /></F>
          <F l="Phone"><input value={f.phone} onChange={set("phone")} inputMode="tel" className={inp} /></F>
        </div>
        <F l="Email"><input value={f.email} onChange={set("email")} inputMode="email" className={inp} /></F>
        <F l="Billing address"><input value={f.address} onChange={set("address")} className={inp} /></F>
        <div className="grid grid-cols-2 gap-2">
          <F l="Lead source"><select value={f.lead_source} onChange={set("lead_source")} className={inp}>
            <option value="">—</option>{LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></F>
          <F l="Client since"><input type="date" value={f.client_since} onChange={set("client_since")} className={inp} /></F>
        </div>
        <F l="Payment terms"><input value={f.payment_terms} onChange={set("payment_terms")} className={inp} /></F>
        <F l="Tags — comma separated"><input value={f.tags} onChange={set("tags")} className={inp} placeholder="snow, repeat, net-30" /></F>
        <F l="QuickBooks name(s) — comma separated, if spelled differently there">
          <input value={f.qbo_names} onChange={set("qbo_names")} className={inp} placeholder="Lincoln Property Management" />
        </F>
        <F l="Notes"><textarea value={f.notes} onChange={set("notes")} rows={3} className={inp} /></F>
        <label className="flex items-center gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={f.archived} onChange={(e) => setF((s) => ({ ...s, archived: e.target.checked }))} />
          Archived — hide from the main list
        </label>
        <button onClick={save} disabled={busy} className="w-full rounded-xl bg-white text-black py-2.5 text-sm font-bold disabled:opacity-50">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}

function EditProperty({ supabase, customerId, p, onClose, onSaved }: any) {
  const [f, setF] = useState({
    label: p?.label ?? "", address: p?.address ?? "", city: p?.city ?? "", state: p?.state ?? "",
    zip: p?.zip ?? "", access_notes: p?.access_notes ?? "", notes: p?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save() {
    if (!f.address.trim()) { alert("Address is required."); return; }
    setBusy(true);
    const row = { ...f, customer_id: customerId, address: f.address.trim(), updated_at: new Date().toISOString() };
    const { error } = p ? await supabase.from("properties").update(row).eq("id", p.id) : await supabase.from("properties").insert(row);
    setBusy(false);
    if (error) alert("Save failed: " + error.message); else onSaved();
  }
  return (
    <Modal title={p ? "Edit property" : "Add property"} onClose={onClose}>
      <div className="space-y-2.5">
        <F l="Nickname (optional)"><input value={f.label} onChange={set("label")} className={inp} placeholder="Building A, rear lot…" /></F>
        <F l="Address"><input value={f.address} onChange={set("address")} className={inp} /></F>
        <div className="grid grid-cols-3 gap-2">
          <F l="City"><input value={f.city} onChange={set("city")} className={inp} /></F>
          <F l="State"><input value={f.state} onChange={set("state")} className={inp} /></F>
          <F l="Zip"><input value={f.zip} onChange={set("zip")} inputMode="numeric" className={inp} /></F>
        </div>
        <F l="Access notes — gates, hand-dig, no equipment, where to park">
          <textarea value={f.access_notes} onChange={set("access_notes")} rows={2} className={inp} />
        </F>
        <F l="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} className={inp} /></F>
        <button onClick={save} disabled={busy} className="w-full rounded-xl bg-white text-black py-2.5 text-sm font-bold disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}

function EditContact({ supabase, customerId, p, onClose, onSaved }: any) {
  const [f, setF] = useState({
    name: p?.name ?? "", role: p?.role ?? "", phone: p?.phone ?? "", email: p?.email ?? "",
    is_billing: p?.is_billing ?? false, notes: p?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save() {
    if (!f.name.trim()) { alert("Name is required."); return; }
    setBusy(true);
    const row = { ...f, customer_id: customerId, name: f.name.trim() };
    const { error } = p ? await supabase.from("customer_contacts").update(row).eq("id", p.id) : await supabase.from("customer_contacts").insert(row);
    setBusy(false);
    if (error) alert("Save failed: " + error.message); else onSaved();
  }
  async function del() {
    if (!p || !confirm("Remove this person?")) return;
    await supabase.from("customer_contacts").delete().eq("id", p.id); onSaved();
  }
  return (
    <Modal title={p ? "Edit person" : "Add person"} onClose={onClose}>
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <F l="Name"><input value={f.name} onChange={set("name")} className={inp} /></F>
          <F l="Role"><input value={f.role} onChange={set("role")} className={inp} placeholder="Property manager, super…" /></F>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <F l="Phone"><input value={f.phone} onChange={set("phone")} inputMode="tel" className={inp} /></F>
          <F l="Email"><input value={f.email} onChange={set("email")} inputMode="email" className={inp} /></F>
        </div>
        <label className="flex items-center gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={f.is_billing} onChange={(e) => setF((s) => ({ ...s, is_billing: e.target.checked }))} />
          Billing contact — this is who gets the invoice
        </label>
        <F l="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} className={inp} /></F>
        <button onClick={save} disabled={busy} className="w-full rounded-xl bg-white text-black py-2.5 text-sm font-bold disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        {p ? <button onClick={del} className="w-full text-xs text-neutral-500 underline">Remove</button> : null}
      </div>
    </Modal>
  );
}
