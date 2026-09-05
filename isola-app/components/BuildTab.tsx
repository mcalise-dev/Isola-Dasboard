"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MoneyInput from "@/components/MoneyInput";
import { todayISO } from "@/lib/format";

/* ============================================================
   BUILD — the front half of a job: Walk -> Price -> Send.

   Rules this screen enforces (see ISOLA_Project_Instructions.md):
   - Customer is PICKED, never typed. Sets customer_id AND copies the
     exact stored spelling into jobs.customer.
   - The build's title becomes jobs.job_name, verbatim, everywhere.
   - The sell price is NEVER auto-generated. Cost is calculated;
     the number the client sees is typed by Mike.
   - Costs typed here roll into the price book (price_book_learn),
     so the book fills itself in as jobs get built.
   - Crew rates come from public.workers — one source of truth.
   - No SMS anywhere. Email and phone only.
   ============================================================ */

const fmt$ = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmt2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function newToken() {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => abc[b % abc.length]).join("");
}

const CATS = ["Material", "Labor", "Equipment", "Disposal", "Subcontract", "Other"] as const;
type Cat = (typeof CATS)[number];

const CAT_META: Record<string, { icon: string; cls: string }> = {
  Material: { icon: "🧱", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  Labor: { icon: "👷", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  Equipment: { icon: "🚜", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  Disposal: { icon: "🗑️", cls: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30" },
  Subcontract: { icon: "🤝", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  Other: { icon: "•", cls: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30" },
};

// Reference only. These are what the price ROOM looks like by client type —
// never applied automatically, only shown next to the box Mike types in.
const CLIENT_TYPE: Record<string, { label: string; hint: string; lo: number; hi: number }> = {
  medical: { label: "Medical / institutional", hint: "Highest tier — price at the top of the range and hold it", lo: 2.2, hi: 2.8 },
  municipal: { label: "Municipal", hint: "Prevailing-wage and paperwork overhead — price it in", lo: 2.0, hi: 2.6 },
  property_mgmt: { label: "Property management", hint: "Commercial tier — above residential, repeat volume", lo: 1.9, hi: 2.4 },
  commercial: { label: "Commercial", hint: "Commercial tier — above residential", lo: 1.9, hi: 2.4 },
  residential: { label: "Residential", hint: "Standard tier", lo: 1.7, hi: 2.2 },
  partner: { label: "Partner (THM)", hint: "Joint job — net profit splits 50/50, materials reimbursed at cost on top", lo: 1.5, hi: 2.0 },
};

const STALE_DAYS = 183; // ~6 months — flag any cost older than this before relying on it

const inp =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-400 focus:outline-none";
const lbl = "block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1";
const btn =
  "rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-500";
const btnPrimary =
  "rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-neutral-900 hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed";
const card = "rounded-xl border border-neutral-800 bg-neutral-950 p-3.5";

type Est = any;
type Line = any;

export default function BuildTab() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [ests, setEsts] = useState<Est[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [props, setProps] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [book, setBook] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    const [e, c, p, w, b, t] = await Promise.all([
      supabase.from("estimates").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id,name,client_type,contact_name,phone,email,payment_terms").eq("archived", false).order("name"),
      supabase.from("properties").select("id,customer_id,label,address,city,state,access_notes").order("address"),
      supabase.from("workers").select("id,name,rate,rate_type,active,is_owner").order("name"),
      supabase.from("price_items").select("*").eq("active", true).order("name"),
      supabase.from("scope_templates").select("*").order("name"),
    ]);
    setEsts(e.data ?? []);
    setCustomers(c.data ?? []);
    setProps(p.data ?? []);
    setWorkers((w.data ?? []).filter((x: any) => x.active !== false));
    setBook(b.data ?? []);
    setTemplates(t.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const open = ests.find((e) => e.id === openId) || null;

  async function startBuild() {
    const { data, error } = await supabase
      .from("estimates")
      .insert({ title: "", step: "walk", status: "draft", visit_date: todayISO() })
      .select()
      .single();
    if (error) return alert("Could not start a build: " + error.message);
    setEsts([data, ...ests]);
    setOpenId(data.id);
  }

  // Deleting a build removes its lines and photos (FK cascade). If the build
  // already created a job, the JOB IS LEFT ALONE — only the estimate goes.
  async function deleteBuild(e: Est) {
    const warn = e.job_id
      ? `Delete the build "${e.title || "Untitled"}"?\n\nThe job it created stays — only the estimate and its line items are removed.`
      : `Delete the build "${e.title || "Untitled"}"? This can't be undone.`;
    if (!confirm(warn)) return;
    const { error } = await supabase.from("estimates").delete().eq("id", e.id);
    if (error) return alert("Delete failed: " + error.message);
    setEsts((xs) => xs.filter((x) => x.id !== e.id));
    if (openId === e.id) setOpenId(null);
  }

  if (loading) return <div className="p-4 text-sm text-neutral-500">Loading…</div>;

  if (open) {
    return (
      <BuildDetail
        est={open}
        customers={customers}
        props={props}
        workers={workers}
        book={book}
        templates={templates}
        onBack={() => { setOpenId(null); load(); }}
        onChanged={(patch: any) => setEsts((xs) => xs.map((x) => (x.id === open.id ? { ...x, ...patch } : x)))}
        reloadRefs={load}
      />
    );
  }

  const drafts = ests.filter((e) => e.status === "draft");
  const walking = drafts.filter((e) => e.step === "walk");
  const pricing = drafts.filter((e) => e.step === "price");
  const ready = drafts.filter((e) => e.step === "send");
  const sent = ests.filter((e) => e.status !== "draft");
  const won = sent.filter((e) => e.status === "won").length;
  const decided = sent.filter((e) => e.status === "won" || e.status === "lost").length;

  const tile = (label: string, value: string, sub?: string) => (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
      <div className="text-xl font-bold text-white leading-tight">{value}</div>
      {sub ? <div className="text-[11px] text-neutral-500">{sub}</div> : null}
    </div>
  );

  function row(e: Est) {
    const cost = Number(e.cost_total ?? 0);
    const sell = Number(e.sell_price ?? 0);
    return (
      <div key={e.id} role="button" tabIndex={0} onClick={() => setOpenId(e.id)}
        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") setOpenId(e.id); }}
        className="w-full text-left rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-3 hover:border-neutral-600 cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{e.title || "Untitled build"}</div>
            <div className="text-xs text-neutral-500 truncate">
              {[e.customer, e.location].filter(Boolean).join(" — ") || "No customer yet"}
            </div>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <div className="text-right">
              {sell > 0 ? <div className="text-sm font-bold text-white">{fmt$(sell)}</div> : null}
              {cost > 0 && !sell ? <div className="text-xs text-neutral-500">cost {fmt$(cost)}</div> : null}
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                {e.status === "draft" ? e.step : e.status}
              </div>
            </div>
            <button onClick={(ev) => { ev.stopPropagation(); deleteBuild(e); }}
              aria-label="Delete build"
              className="text-neutral-700 hover:text-red-400 text-sm px-1 leading-none">✕</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 pb-28 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">Build</h1>
          <p className="text-xs text-neutral-500">Walk it · Price it · Send it</p>
        </div>
        <button onClick={startBuild} className={btnPrimary}>＋ Start a build</button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {tile("Open", String(drafts.length), `${walking.length} walking · ${pricing.length} pricing`)}
        {tile("Ready to send", String(ready.length))}
        {tile("Win rate", decided ? Math.round((won / decided) * 100) + "%" : "—", decided ? `${won} of ${decided}` : "no decisions yet")}
      </div>

      {drafts.length === 0 && sent.length === 0 ? (
        <div className={card}>
          <div className="text-sm font-semibold text-white">Nothing in the pipe yet.</div>
          <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
            Start a build when you pull up to a walk-through. Capture what you see, price it off the book,
            set your number, and send the client link — without leaving the truck.
          </p>
        </div>
      ) : null}

      {ready.length ? (
        <section className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Priced — ready to send</div>
          {ready.map(row)}
        </section>
      ) : null}
      {pricing.length ? (
        <section className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Pricing</div>
          {pricing.map(row)}
        </section>
      ) : null}
      {walking.length ? (
        <section className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Walking</div>
          {walking.map(row)}
        </section>
      ) : null}
      {sent.length ? (
        <section className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Sent</div>
          {sent.slice(0, 12).map(row)}
        </section>
      ) : null}
    </div>
  );
}

/* ============================ DETAIL ============================ */

function BuildDetail({ est, customers, props, workers, book, templates, onBack, onChanged, reloadRefs }: any) {
  const supabase = useMemo(() => createClient(), []);
  const [e, setE] = useState<Est>(est);
  const [lines, setLines] = useState<Line[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<string>(est.step || "walk");
  const [link, setLink] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const [l, p] = await Promise.all([
        supabase.from("estimate_lines").select("*").eq("estimate_id", est.id).order("sort"),
        // never select * here — photo_b64 would ship every image on load
        supabase.from("estimate_photos").select("id,caption,created_at").eq("estimate_id", est.id).order("created_at"),
      ]);
      setLines(l.data ?? []);
      setPhotos(p.data ?? []);
      if (est.proposal_link_id) {
        const { data } = await supabase.from("proposal_links").select("token,status,view_count").eq("id", est.proposal_link_id).maybeSingle();
        setLink(data);
      }
    })();
    /* eslint-disable-next-line */
  }, [est.id]);

  async function patch(p: any) {
    setE((x: Est) => ({ ...x, ...p }));
    onChanged(p);
    await supabase.from("estimates").update({ ...p, updated_at: new Date().toISOString() }).eq("id", e.id);
  }

  const cust = customers.find((c: any) => c.id === e.customer_id) || null;
  const myProps = props.filter((p: any) => p.customer_id === e.customer_id);
  const tier = CLIENT_TYPE[cust?.client_type ?? "residential"] ?? CLIENT_TYPE.residential;

  const costTotal = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unit_cost || 0), 0);
  const contingency = costTotal * (Number(e.contingency_pct || 0) / 100);
  const totalCost = costTotal + contingency;
  const sell = Number(e.sell_price || 0);
  const profit = sell - totalCost;
  const marginPct = sell > 0 ? (profit / sell) * 100 : 0;

  // keep the stored cost basis in step with the lines so the list view,
  // and anything that reads an estimate later, never shows a stale number
  useEffect(() => {
    if (Math.abs(Number(e.cost_total ?? 0) - totalCost) < 0.005) return;
    const t = setTimeout(() => patch({ cost_total: Math.round(totalCost * 100) / 100 }), 600);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [totalCost]);

  const byCat = CATS.map((c) => ({
    cat: c,
    total: lines.filter((l) => l.category === c).reduce((s, l) => s + Number(l.qty || 0) * Number(l.unit_cost || 0), 0),
  })).filter((x) => x.total > 0);

  /* ---------- lines ---------- */
  async function addLine(category: Cat) {
    const row = {
      estimate_id: e.id,
      sort: lines.length,
      category,
      description: "",
      qty: category === "Labor" ? 8 : 1,
      unit: category === "Labor" ? "hr" : "ea",
      unit_cost: 0,
    };
    const { data, error } = await supabase.from("estimate_lines").insert(row).select().single();
    if (error) return alert(error.message);
    setLines([...lines, data]);
  }
  async function saveLine(id: string, p: any) {
    setLines((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
    await supabase.from("estimate_lines").update(p).eq("id", id);
  }
  async function delLine(id: string) {
    setLines((xs) => xs.filter((x) => x.id !== id));
    await supabase.from("estimate_lines").delete().eq("id", id);
  }

  // The learn-as-you-go hook. Every cost typed against a named item
  // either creates that item in the book or rolls its cost forward.
  async function learn(l: Line) {
    if (l.category === "Labor") return; // rates live in workers
    const name = (l.description || "").trim();
    const cost = Number(l.unit_cost || 0);
    if (!name || !cost) return;
    const { data } = await supabase.rpc("price_book_learn", {
      p_name: name, p_category: l.category, p_unit: l.unit, p_cost: cost, p_vendor: null,
    });
    if (data) await saveLine(l.id, { item_id: data });
    reloadRefs();
  }

  async function useTemplate(t: any) {
    const checklist: any[] = Array.isArray(t.checklist) ? t.checklist : [];
    const seeds = checklist.slice(0, 12).map((c: any, i: number) => ({
      estimate_id: e.id,
      sort: lines.length + i,
      category: "Material" as Cat,
      description: typeof c === "string" ? c : c?.text || c?.label || "",
      qty: 0,
      unit: "ea",
      unit_cost: 0,
    })).filter((r) => r.description);
    if (!seeds.length) return alert("That template has no line items to seed.");
    const { data, error } = await supabase.from("estimate_lines").insert(seeds).select();
    if (error) return alert(error.message);
    setLines([...lines, ...(data ?? [])]);
    if (!e.job_type) patch({ job_type: t.job_type || t.name });
  }

  /* ---------- photos ---------- */
  async function addPhoto(file: File) {
    const b64: string = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const { data, error } = await supabase
      .from("estimate_photos")
      .insert({ estimate_id: e.id, photo_b64: b64, caption: "" })
      .select("id,caption,created_at")
      .single();
    if (error) return alert(error.message);
    setPhotos([...photos, data]);
  }

  const scopeText = useMemo(() => {
    if (e.scope_override?.trim()) return e.scope_override;
    const custom = lines.map((l: Line) => l.scope_line).filter(Boolean);
    if (custom.length) return custom.join("\n");
    return e.observed_conditions || "";
  }, [lines, e.observed_conditions, e.scope_override]);

  /* ---------- send ---------- */
  async function sendIt() {
    if (!e.customer_id) return alert("Pick a customer first.");
    if (!e.title?.trim()) return alert("Give the build a name — it becomes the job name everywhere.");
    if (!sell) return alert("Set your price before sending.");
    setSaving(true);
    try {
      const c = customers.find((x: any) => x.id === e.customer_id);
      const prop = props.find((x: any) => x.id === e.property_id);
      const location = prop ? [prop.address, prop.city].filter(Boolean).join(", ") : e.location;

      // 1. the job — job_name is the build's title, verbatim
      const { data: job, error: je } = await supabase.from("jobs").insert({
        job_name: e.title.trim(),
        customer: c.name,               // exact stored spelling, never a new variant
        customer_id: c.id,
        property_id: e.property_id,
        location,
        job: e.job_type,
        status: "awaiting",             // walked and quoted, waiting on the customer
        price: fmt2(sell),
        contact_name: c.contact_name,
        contact_phone: c.phone,
        quoted_date: todayISO(),
        scope_of_work: scopeText,
        proposal_status: "sent",
        terms: c.payment_terms,
        notes: e.observed_conditions,
      }).select().single();
      if (je) throw je;

      // 2. the site visit — observed conditions only, no pricing
      const { data: sv } = await supabase.from("site_visits").insert({
        visit_date: e.visit_date || todayISO(),
        property_address: location,
        client_company: c.name,
        met_with: e.met_with,
        purpose: "Walk-through / scope",
        job_id: job.id,
        dimensions: e.dimensions,
        observed_conditions: e.observed_conditions,
        weather: e.weather,
        photos_taken: photos.length ? `${photos.length} on file` : null,
      }).select("id").single();

      // 3. photos move to the job as "before"
      if (photos.length) {
        const { data: full } = await supabase.from("estimate_photos").select("photo_b64,caption").eq("estimate_id", e.id);
        if (full?.length) {
          await supabase.from("job_photos").insert(
            full.map((p: any) => ({ job_id: job.id, phase: "before", photo_b64: p.photo_b64, caption: p.caption || "Walk-through" }))
          );
        }
      }

      // 4. the client link
      const token = newToken();
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      const { data: pl, error: pe } = await supabase.from("proposal_links").insert({
        token,
        job_id: job.id,
        title: e.title.trim(),
        intro: e.price_notes || null,
        scope: scopeText,
        price: sell,
        terms: c.payment_terms,
        deposit_pct: 33,
        deposit_amount: Math.round(sell * 0.33 * 100) / 100,
        status: "sent",
        expires_at: expires.toISOString().slice(0, 10),
      }).select().single();
      if (pe) throw pe;

      // 5. access notes learned on the walk stay with the property
      if (e.property_id && e.access_notes) {
        await supabase.from("properties").update({ access_notes: e.access_notes }).eq("id", e.property_id);
      }

      await patch({ status: "sent", step: "send", job_id: job.id, site_visit_id: sv?.id ?? null, proposal_link_id: pl.id, sent_at: new Date().toISOString() });
      setLink(pl);
    } catch (err: any) {
      alert("Could not send: " + (err?.message ?? String(err)));
    } finally {
      setSaving(false);
    }
  }

  /* ---------- render ---------- */
  const STEPS = [
    { key: "walk", label: "Walk", icon: "📍" },
    { key: "price", label: "Price", icon: "🧮" },
    { key: "send", label: "Send", icon: "📤" },
  ];

  return (
    <div className="p-3 pb-28 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className={btn}>← Builds</button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">{e.title || "Untitled build"}</div>
          <div className="text-[11px] text-neutral-500 truncate">{[e.customer, e.location].filter(Boolean).join(" — ")}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {STEPS.map((s) => (
          <button key={s.key} onClick={() => { setStep(s.key); if (e.status === "draft") patch({ step: s.key }); }}
            className={`rounded-lg border px-2 py-2 text-xs font-bold ${step === s.key ? "border-neutral-300 bg-neutral-800 text-white" : "border-neutral-800 bg-neutral-950 text-neutral-500"}`}>
            <span className="mr-1">{s.icon}</span>{s.label}
          </button>
        ))}
      </div>

      {/* ---------------- WALK ---------------- */}
      {step === "walk" ? (
        <div className="space-y-3">
          <div className={card + " space-y-3"}>
            <div>
              <label className={lbl}>Job name — this becomes the job name everywhere</label>
              <input className={inp} value={e.title ?? ""} placeholder="e.g. 407 East Ave — Sidewalk Replacement"
                onChange={(ev) => setE({ ...e, title: ev.target.value })}
                onBlur={(ev) => patch({ title: ev.target.value })} />
            </div>

            <div>
              <label className={lbl}>Customer — pick, don't type</label>
              <select className={inp} value={e.customer_id ?? ""}
                onChange={(ev) => {
                  const c = customers.find((x: any) => x.id === ev.target.value);
                  patch({ customer_id: c?.id ?? null, customer: c?.name ?? null, property_id: null, location: null });
                }}>
                <option value="">Select a customer…</option>
                {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {cust ? (
                <div className="mt-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5">
                  <div className="text-[11px] font-bold text-neutral-300">{tier.label}</div>
                  <div className="text-[11px] text-neutral-500">{tier.hint}</div>
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-neutral-600">
                  New customer? Add them on the Customers tab first so the spelling stays clean.
                </p>
              )}
            </div>

            {e.customer_id ? (
              <div>
                <label className={lbl}>Property</label>
                <select className={inp} value={e.property_id ?? ""}
                  onChange={(ev) => {
                    const p = props.find((x: any) => x.id === ev.target.value);
                    patch({
                      property_id: p?.id ?? null,
                      location: p ? [p.address, p.city].filter(Boolean).join(", ") : null,
                      access_notes: p?.access_notes ?? e.access_notes,
                    });
                  }}>
                  <option value="">Select a property…</option>
                  {myProps.map((p: any) => <option key={p.id} value={p.id}>{p.label ? `${p.label} — ${p.address}` : p.address}</option>)}
                </select>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>Work type</label>
                <input className={inp} list="job-types" value={e.job_type ?? ""} placeholder="Concrete Pad"
                  onChange={(ev) => setE({ ...e, job_type: ev.target.value })}
                  onBlur={(ev) => patch({ job_type: ev.target.value })} />
                <datalist id="job-types">
                  {templates.map((t: any) => <option key={t.id} value={t.job_type || t.name} />)}
                </datalist>
              </div>
              <div>
                <label className={lbl}>Visit date</label>
                <input type="date" className={inp} value={e.visit_date ?? todayISO()}
                  onChange={(ev) => patch({ visit_date: ev.target.value })} />
              </div>
            </div>

            <div>
              <label className={lbl}>Met with</label>
              <input className={inp} value={e.met_with ?? ""} placeholder="Property manager, super, owner…"
                onChange={(ev) => setE({ ...e, met_with: ev.target.value })}
                onBlur={(ev) => patch({ met_with: ev.target.value })} />
            </div>
          </div>

          <div className={card + " space-y-3"}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">What you saw</div>
            <div>
              <label className={lbl}>Observed conditions</label>
              <textarea rows={4} className={inp} value={e.observed_conditions ?? ""}
                placeholder="Cracked and settled, water ponding at the low corner, downspout discharging onto the slab…"
                onChange={(ev) => setE({ ...e, observed_conditions: ev.target.value })}
                onBlur={(ev) => patch({ observed_conditions: ev.target.value })} />
            </div>
            <div>
              <label className={lbl}>Dimensions</label>
              <input className={inp} value={e.dimensions ?? ""} placeholder="24 × 16, 4in slab · curb 38 lf"
                onChange={(ev) => setE({ ...e, dimensions: ev.target.value })}
                onBlur={(ev) => patch({ dimensions: ev.target.value })} />
            </div>
            <div>
              <label className={lbl}>Access notes — saved to the property</label>
              <textarea rows={2} className={inp} value={e.access_notes ?? ""}
                placeholder="Gate code, where to park, what the truck can't reach"
                onChange={(ev) => setE({ ...e, access_notes: ev.target.value })}
                onBlur={(ev) => patch({ access_notes: ev.target.value })} />
            </div>
            <label className="flex items-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5">
              <input type="checkbox" checked={!!e.hand_dig} onChange={(ev) => patch({ hand_dig: ev.target.checked })} className="w-4 h-4" />
              <span className="text-sm font-semibold text-white">Hand-dig corridor — no equipment access</span>
            </label>
            {e.hand_dig ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                Flagged. Hand-dig changes the labor cost structure — price the hours, not the machine.
              </div>
            ) : null}
          </div>

          <div className={card + " space-y-2"}>
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Photos ({photos.length})</div>
              <label className={btn + " cursor-pointer"}>
                📷 Add
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(ev) => { const f = ev.target.files?.[0]; if (f) addPhoto(f); ev.currentTarget.value = ""; }} />
              </label>
            </div>
            {photos.length ? (
              <div className="text-[11px] text-neutral-500">
                {photos.length} photo{photos.length === 1 ? "" : "s"} — they move onto the job as “before” shots when you send.
              </div>
            ) : (
              <div className="text-[11px] text-neutral-600">No photos yet.</div>
            )}
          </div>

          <button onClick={() => { setStep("price"); patch({ step: "price" }); }} className={btnPrimary + " w-full"}>
            Price it →
          </button>
        </div>
      ) : null}

      {/* ---------------- PRICE ---------------- */}
      {step === "price" ? (
        <div className="space-y-3">
          {templates.length ? (
            <div className={card}>
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Start from a scope</div>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t: any) => (
                  <button key={t.id} onClick={() => useTemplate(t)} className={btn}>{t.name}</button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            {lines.map((l) => (
              <LineRow key={l.id} l={l} book={book} workers={workers}
                onSave={(p: any) => saveLine(l.id, p)} onLearn={() => learn(l)} onDelete={() => delLine(l.id)} />
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CATS.filter((c) => c !== "Other").map((c) => (
              <button key={c} onClick={() => addLine(c)} className={btn}>＋ {c}</button>
            ))}
          </div>

          <div className={card + " space-y-2"}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Cost basis</div>
            {byCat.map((b) => (
              <div key={b.cat} className="flex justify-between text-sm">
                <span className="text-neutral-400">{CAT_META[b.cat].icon} {b.cat}</span>
                <span className="text-neutral-200 tabular-nums">{fmt2(b.total)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-800">
              <span className="text-sm text-neutral-400">Contingency</span>
              <div className="flex items-center gap-1.5">
                <input type="number" className="w-16 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-white text-right"
                  value={e.contingency_pct ?? 0} onChange={(ev) => patch({ contingency_pct: Number(ev.target.value) })} />
                <span className="text-xs text-neutral-500">%</span>
                <span className="w-24 text-right text-sm text-neutral-200 tabular-nums">{fmt2(contingency)}</span>
              </div>
            </div>
            <div className="flex justify-between border-t border-neutral-800 pt-2">
              <span className="text-sm font-bold text-white">Total cost</span>
              <span className="text-lg font-bold text-white tabular-nums">{fmt2(totalCost)}</span>
            </div>
          </div>

          {/* ---- the sell price. Typed, never generated. ---- */}
          <div className={card + " space-y-3"}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Your price</div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
              <div className="text-[11px] font-bold text-neutral-300">{tier.label}</div>
              <div className="text-[11px] text-neutral-500">{tier.hint}</div>
              {totalCost > 0 ? (
                <div className="mt-1.5 text-[11px] text-neutral-400">
                  For reference, this tier usually lands between{" "}
                  <span className="font-bold text-neutral-200">{fmt$(totalCost * tier.lo)}</span> and{" "}
                  <span className="font-bold text-neutral-200">{fmt$(totalCost * tier.hi)}</span>. Your call.
                </div>
              ) : null}
            </div>

            <div>
              <label className={lbl}>Contract price</label>
              <MoneyInput className={inp + " text-lg font-bold"} value={e.sell_price ?? ""}
                onChange={(v) => setE({ ...e, sell_price: v })}
                onBlur={(v) => patch({ sell_price: v === "" ? null : Number(v) })} />
            </div>

            {sell > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Net profit</div>
                    <div className={`text-lg font-bold tabular-nums ${profit < 0 ? "text-red-400" : "text-emerald-400"}`}>{fmt2(profit)}</div>
                  </div>
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Margin</div>
                    <div className={`text-lg font-bold tabular-nums ${marginPct < 20 ? "text-amber-400" : "text-emerald-400"}`}>{marginPct.toFixed(1)}%</div>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
                  <div className={`h-full ${profit < 0 ? "bg-red-500" : marginPct < 20 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.max(0, Math.min(100, sell > 0 ? (totalCost / sell) * 100 : 0))}%` }} />
                </div>
                <PaverFloor jobType={e.job_type} dimensions={e.dimensions} sell={sell} />
              </>
            ) : null}

            <div>
              <label className={lbl}>Note for the proposal intro (optional)</label>
              <textarea rows={2} className={inp} value={e.price_notes ?? ""}
                onChange={(ev) => setE({ ...e, price_notes: ev.target.value })}
                onBlur={(ev) => patch({ price_notes: ev.target.value })} />
            </div>
          </div>

          <button onClick={() => { setStep("send"); patch({ step: "send" }); }} disabled={!sell} className={btnPrimary + " w-full"}>
            Send it →
          </button>
        </div>
      ) : null}

      {/* ---------------- SEND ---------------- */}
      {step === "send" ? (
        <div className="space-y-3">
          <div className={card + " space-y-2"}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">What gets created</div>
            <Row k="Job name" v={e.title || "—"} />
            <Row k="Customer" v={e.customer || "—"} />
            <Row k="Property" v={e.location || "—"} />
            <Row k="Work type" v={e.job_type || "—"} />
            <Row k="Status" v="Awaiting — walked and quoted" />
            <Row k="Contract price" v={sell ? fmt2(sell) : "—"} />
            <Row k="Cost basis" v={fmt2(totalCost)} />
            <Row k="Photos" v={photos.length ? `${photos.length} → job "before"` : "none"} />
          </div>

          <div className={card}>
            <label className={lbl}>Scope the client sees</label>
            <textarea rows={6} className={inp} value={e.scope_override ?? scopeText}
              onChange={(ev) => setE({ ...e, scope_override: ev.target.value })}
              onBlur={(ev) => patch({ scope_override: ev.target.value })} />
            <p className="mt-1 text-[11px] text-neutral-600">
              One line per division. This lands on the client hub page and in jobs.scope_of_work.
            </p>
          </div>

          {e.status === "sent" && link ? (
            <div className={card + " space-y-2"}>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">
                ✓ Job created and the client link is live.
              </div>
              <div className="flex flex-wrap gap-1.5">
                <a href={`/p/${link.token}`} target="_blank" rel="noopener noreferrer" className={btn}>View as client</a>
                <button className={btn} onClick={() => {
                  navigator.clipboard?.writeText(`${window.location.origin}/p/${link.token}`);
                  setCopied(true); setTimeout(() => setCopied(false), 1800);
                }}>{copied ? "Copied ✓" : "Copy link"}</button>
                <a href={`/?job=${e.job_id}`} className={btn}>📂 Open job file</a>
              </div>
              <p className="text-[11px] text-neutral-500">
                Email the link or read it out on the phone. The daily sweep will nudge you at day 3, 7 and 14 if it goes quiet.
              </p>
              <div className="flex gap-1.5 pt-1">
                <button className={btn} onClick={() => patch({ status: "won" })}>Mark won</button>
                <button className={btn} onClick={() => patch({ status: "lost" })}>Mark lost</button>
              </div>
            </div>
          ) : (
            <button onClick={sendIt} disabled={saving || !sell || !e.customer_id || !e.title?.trim()} className={btnPrimary + " w-full"}>
              {saving ? "Creating…" : "Create job + client link"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-neutral-500 shrink-0">{k}</span>
      <span className="text-neutral-200 text-right truncate">{v}</span>
    </div>
  );
}

/* ---- $35/sq ft is a FLOOR for properly executed paver work ---- */
function PaverFloor({ jobType, dimensions, sell }: { jobType?: string; dimensions?: string; sell: number }) {
  const isPaver = /paver/i.test(jobType || "") || /paver/i.test(dimensions || "");
  const sqft = useMemo(() => {
    if (!dimensions) return 0;
    const m = dimensions.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    return m ? Number(m[1]) * Number(m[2]) : 0;
  }, [dimensions]);
  if (!isPaver || !sqft || !sell) return null;
  const psf = sell / sqft;
  if (psf >= 35) {
    return <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
      {fmt2(psf)}/sq ft over {sqft.toLocaleString()} sq ft — above the $35 floor.
    </div>;
  }
  return <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
    ⚠ {fmt2(psf)}/sq ft over {sqft.toLocaleString()} sq ft — under the $35/sq ft floor for paver work. Price up.
  </div>;
}

/* ---------------- one estimate line ---------------- */
function LineRow({ l, book, workers, onSave, onLearn, onDelete }: any) {
  const [d, setD] = useState(l);
  const [calc, setCalc] = useState(false);
  useEffect(() => setD(l), [l.id, l.item_id]);

  const meta = CAT_META[d.category] ?? CAT_META.Other;
  const amount = Number(d.qty || 0) * Number(d.unit_cost || 0);
  const item = book.find((b: any) => b.id === d.item_id) || book.find((b: any) => b.name.toLowerCase() === (d.description || "").toLowerCase());
  const stale = item?.last_confirmed
    ? (Date.now() - new Date(item.last_confirmed).getTime()) / 86400000 > STALE_DAYS
    : false;
  const isNew = d.category !== "Labor" && d.description && !item;

  function pickBook(name: string) {
    const b = book.find((x: any) => x.name === name);
    setD({ ...d, description: name });
    if (b) onSave({ description: name, unit: b.unit, unit_cost: Number(b.current_cost || 0), item_id: b.id });
    else onSave({ description: name });
  }
  function pickWorker(name: string) {
    const w = workers.find((x: any) => x.name === name);
    const unit = w?.rate_type === "daily" ? "day" : "hr";
    setD({ ...d, description: name, unit, unit_cost: Number(w?.rate || 0) });
    onSave({ description: name, worker: name, unit, unit_cost: Number(w?.rate || 0), qty: unit === "day" ? 1 : d.qty });
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${meta.cls}`}>{meta.icon} {d.category}</span>
        <div className="ml-auto text-sm font-bold text-white tabular-nums">{fmt2(amount)}</div>
        <button onClick={onDelete} className="text-neutral-600 hover:text-red-400 text-sm px-1">✕</button>
      </div>

      {d.category === "Labor" ? (
        <select className={inp} value={d.description ?? ""} onChange={(ev) => pickWorker(ev.target.value)}>
          <option value="">Who…</option>
          {workers.map((w: any) => (
            <option key={w.id} value={w.name}>{w.name} — ${w.rate ?? "?"}/{w.rate_type === "daily" ? "day" : "hr"}</option>
          ))}
        </select>
      ) : (
        <>
          <input className={inp} list={`book-${d.id}`} value={d.description ?? ""} placeholder="What is it?"
            onChange={(ev) => setD({ ...d, description: ev.target.value })}
            onBlur={(ev) => pickBook(ev.target.value)} />
          <datalist id={`book-${d.id}`}>
            {book.filter((b: any) => b.category === d.category).map((b: any) => (
              <option key={b.id} value={b.name}>{b.current_cost ? `$${b.current_cost}/${b.unit}` : b.unit}</option>
            ))}
          </datalist>
        </>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1.5">
        <input type="number" inputMode="decimal" className={inp + " text-right"} value={d.qty ?? 0}
          onChange={(ev) => setD({ ...d, qty: ev.target.value })}
          onBlur={(ev) => onSave({ qty: Number(ev.target.value || 0) })} />
        <input className="w-14 rounded-lg border border-neutral-700 bg-neutral-900 px-1.5 py-2 text-xs text-center text-neutral-300"
          value={d.unit ?? ""} onChange={(ev) => setD({ ...d, unit: ev.target.value })}
          onBlur={(ev) => onSave({ unit: ev.target.value })} />
        <MoneyInput className={inp + " text-right"} value={d.unit_cost ?? 0}
          onChange={(v) => setD({ ...d, unit_cost: v })}
          onBlur={(v) => { onSave({ unit_cost: Number(v || 0) }); setTimeout(onLearn, 150); }} />
        <button onClick={() => setCalc(!calc)} className="px-1.5 text-lg" title="Quantity calculator">🧮</button>
      </div>

      {calc ? <QtyCalc onApply={(qty: number, unit: string) => { setD({ ...d, qty, unit }); onSave({ qty, unit }); setCalc(false); }} /> : null}

      {d.category === "Labor" && d.description === "Adam" && d.unit === "hr" && amount > 400 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
          ⚠ {fmt2(amount)} at $35/hr is over Adam's $400 day cap. Confirm which applies on this job.
        </div>
      ) : null}
      {stale ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
          ⚠ Last confirmed {new Date(item.last_confirmed).toLocaleDateString("en-US", { month: "short", year: "numeric" })} — over 6 months. Check it before you rely on it.
        </div>
      ) : null}
      {isNew && Number(d.unit_cost) > 0 ? (
        <div className="text-[11px] text-emerald-400">＋ New to the price book — it'll be saved when you leave the cost field.</div>
      ) : null}

      <input className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[11px] text-neutral-300 placeholder:text-neutral-600"
        value={d.scope_line ?? ""} placeholder="Scope line the client reads (optional)"
        onChange={(ev) => setD({ ...d, scope_line: ev.target.value })}
        onBlur={(ev) => onSave({ scope_line: ev.target.value })} />
    </div>
  );
}

/* ---------------- takeoff calculator ---------------- */
function QtyCalc({ onApply }: { onApply: (qty: number, unit: string) => void }) {
  const [L, setL] = useState("");
  const [W, setW] = useState("");
  const [D, setD] = useState("");
  const [waste, setWaste] = useState("10");

  const l = Number(L || 0), w = Number(W || 0), din = Number(D || 0), wf = 1 + Number(waste || 0) / 100;
  const sqft = l * w;
  const cuyd = (sqft * (din / 12)) / 27;
  const tons = cuyd * 1.4; // ~1.4 tons per cu yd for stone/gravel

  const out = (label: string, val: number, unit: string) => (
    <button onClick={() => onApply(Math.round(val * wf * 100) / 100, unit)}
      className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-left hover:border-neutral-500">
      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
      <div className="text-sm font-bold text-white tabular-nums">{(val * wf).toFixed(2)} <span className="text-[11px] font-normal text-neutral-500">{unit}</span></div>
    </button>
  );

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-2.5 space-y-2">
      <div className="grid grid-cols-4 gap-1.5">
        <div><label className={lbl}>L ft</label><input type="number" inputMode="decimal" className={inp} value={L} onChange={(e) => setL(e.target.value)} /></div>
        <div><label className={lbl}>W ft</label><input type="number" inputMode="decimal" className={inp} value={W} onChange={(e) => setW(e.target.value)} /></div>
        <div><label className={lbl}>Depth in</label><input type="number" inputMode="decimal" className={inp} value={D} onChange={(e) => setD(e.target.value)} /></div>
        <div><label className={lbl}>Waste %</label><input type="number" inputMode="decimal" className={inp} value={waste} onChange={(e) => setWaste(e.target.value)} /></div>
      </div>
      {sqft > 0 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {out("Area", sqft, "sq ft")}
          {din > 0 ? out("Volume", cuyd, "cu yd") : <div />}
          {din > 0 ? out("Weight", tons, "ton") : <div />}
        </div>
      ) : <div className="text-[11px] text-neutral-600">Enter length and width. Tap a result to use it as the quantity.</div>}
    </div>
  );
}
