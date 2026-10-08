"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MoneyInput from "@/components/MoneyInput";
import { todayISO } from "@/lib/format";
import { withTimeout, firstError } from "@/lib/load";
import { getProposalValidDays, getPaymentTerms, daysFromToday } from "@/lib/settings";
import { showError, showToast, undoable } from "@/components/Toaster";
import { copyText } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea, NativeSelect, Field, Label } from "@/components/ui/input";
import { PageHeader, SectionTitle, Stat, Empty, ListSkeleton, LoadError, KV, Progress, Stepper } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import {
  Plus, ArrowLeft, ArrowRight, Trash2, Calculator, Camera, Package, HardHat, Truck, Recycle, Handshake, Ellipsis,
  TriangleAlert, CircleCheck, Eye, Copy, ExternalLink, ClipboardList, Hammer, type LucideIcon,
} from "lucide-react";

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

const CAT_META: Record<string, { icon: LucideIcon; cls: string }> = {
  Material: { icon: Package, cls: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30" },
  Labor: { icon: HardHat, cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  Equipment: { icon: Truck, cls: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30" },
  Disposal: { icon: Recycle, cls: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30" },
  Subcontract: { icon: Handshake, cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  Other: { icon: Ellipsis, cls: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30" },
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

// MoneyInput takes a raw class string; this matches the Input primitive
// (left padding is MoneyInput's own, to clear the "$").
const moneyCls =
  "h-10 w-full rounded-lg border border-input bg-neutral-950 pr-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/30";

// line-item grid: stacked on a phone, one table row per line at md+
const LINE_GRID = "grid grid-cols-6 gap-2 md:grid-cols-[112px_minmax(0,1fr)_80px_64px_116px_96px_40px_40px] md:items-center";

type Est = any;
type Line = any;

const timeoutMsg = (e: any) => (e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));

function stageBadge(e: Est) {
  if (e.status === "won") return <Badge variant="success">won</Badge>;
  if (e.status === "lost") return <Badge variant="danger">lost</Badge>;
  if (e.status !== "draft") return <Badge>{e.status}</Badge>;
  return <Badge variant="muted">{e.step}</Badge>;
}

export default function BuildTab() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ests, setEsts] = useState<Est[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [props, setProps] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [book, setBook] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [starting, setStarting] = useState(false);

  async function load() {
    setErr(null);
    try {
      const [e, c, p, w, b, t] = await withTimeout(Promise.all([
        supabase.from("estimates").select("*").order("created_at", { ascending: false }),
        supabase.from("customers").select("id,name,client_type,contact_name,phone,email,payment_terms").eq("archived", false).order("name"),
        supabase.from("properties").select("id,customer_id,label,address,city,state,access_notes").order("address"),
        supabase.from("workers").select("id,name,rate,rate_type,active,is_owner").order("name"),
        supabase.from("price_items").select("*").eq("active", true).order("name"),
        supabase.from("scope_templates").select("*").order("name"),
      ]));
      const fe = firstError(e, c, p, w, b, t);
      if (fe) throw new Error(fe);
      setEsts(e.data ?? []);
      setCustomers(c.data ?? []);
      setProps(p.data ?? []);
      setWorkers((w.data ?? []).filter((x: any) => x.active !== false));
      setBook(b.data ?? []);
      setTemplates(t.data ?? []);
    } catch (e: any) {
      setErr(timeoutMsg(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const open = ests.find((e) => e.id === openId) || null;

  async function startBuild() {
    setStarting(true);
    const { data, error } = await supabase
      .from("estimates")
      .insert({ title: "", step: "walk", status: "draft", visit_date: todayISO() })
      .select()
      .single();
    setStarting(false);
    if (error) return showError("Could not start a build: " + error.message);
    setEsts([data, ...ests]);
    setOpenId(data.id);
  }

  // Deleting a build removes its lines and photos (FK cascade). If the build
  // already created a job, the JOB IS LEFT ALONE — only the estimate goes.
  function deleteBuild(e: Est) {
    const idx = ests.findIndex((x) => x.id === e.id);
    const name = e.title || "Untitled";
    undoable({
      text: e.job_id ? `Deleted "${name}" — the job it created stays` : `Deleted "${name}"`,
      hide: () => {
        setEsts((xs) => xs.filter((x) => x.id !== e.id));
        if (openId === e.id) setOpenId(null);
      },
      restore: () => setEsts((xs) => {
        if (xs.some((x) => x.id === e.id)) return xs;
        const n = [...xs];
        n.splice(Math.max(0, Math.min(idx, n.length)), 0, e);
        return n;
      }),
      commit: () => supabase.from("estimates").delete().eq("id", e.id),
    });
  }

  const header = (
    <PageHeader
      title="Build & price"
      sub="Walk it · Price it · Send it"
      actions={<Button onClick={startBuild} disabled={starting || loading || !!err}><Plus size={16} /> {starting ? "Starting…" : "Start a build"}</Button>}
    />
  );

  if (err && !ests.length) return <div>{header}<LoadError message={err} onRetry={() => { setLoading(true); load(); }} /></div>;
  if (loading) return <div>{header}<ListSkeleton /></div>;

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

  function row(e: Est) {
    const cost = Number(e.cost_total ?? 0);
    const sell = Number(e.sell_price ?? 0);
    return (
      <Card key={e.id} role="button" tabIndex={0} onClick={() => setOpenId(e.id)}
        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") setOpenId(e.id); }}
        className="group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:border-white/20">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{e.title || "Untitled build"}</div>
          <div className="truncate text-xs text-neutral-400">
            {[e.customer, e.location].filter(Boolean).join(" — ") || "No customer yet"}
          </div>
          <div className="mt-1.5">{stageBadge(e)}</div>
        </div>
        <div className="shrink-0 text-right">
          {sell > 0 ? <div className="text-sm font-semibold tabular-nums text-white">{fmt$(sell)}</div> : null}
          {cost > 0 && !sell ? <div className="text-xs tabular-nums text-neutral-400">cost {fmt$(cost)}</div> : null}
        </div>
        <Button variant="ghost" size="icon" aria-label="Delete build" className="-my-1 -mr-2 shrink-0 text-neutral-500 hover:text-red-300"
          onClick={(ev) => { ev.stopPropagation(); deleteBuild(e); }}>
          <Trash2 size={16} />
        </Button>
      </Card>
    );
  }

  const section = (title: string, list: Est[]) => list.length ? (
    <section>
      <SectionTitle right={<span className="text-sm text-neutral-500">{list.length}</span>}>{title}</SectionTitle>
      <div className="grid gap-2 md:grid-cols-2">{list.map(row)}</div>
    </section>
  ) : null;

  return (
    <div className="space-y-6">
      <div>
        {header}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Open" value={String(drafts.length)} hint={`${walking.length} walking · ${pricing.length} pricing`} />
          <Stat label="Ready to send" value={String(ready.length)} />
          <Stat label="Win rate" value={decided ? Math.round((won / decided) * 100) + "%" : "—"} hint={decided ? `${won} of ${decided}` : "no decisions yet"} />
        </div>
      </div>

      {drafts.length === 0 && sent.length === 0 ? (
        <Empty icon={<ClipboardList size={26} />} title="Nothing in the pipe yet."
          body="Start a build when you pull up to a walk-through. Capture what you see, price it off the book, set your number, and send the client link — without leaving the truck."
          />
      ) : null}

      {section("Priced — ready to send", ready)}
      {section("Pricing", pricing)}
      {section("Walking", walking)}
      {section("Sent", sent.slice(0, 12))}
    </div>
  );
}

/* ============================ DETAIL ============================ */

function BuildDetail({ est, customers, props, workers, book, templates, onBack, onChanged, reloadRefs }: any) {
  const supabase = useMemo(() => createClient(), []);
  const [e, setE] = useState<Est>(est);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<string>(est.step || "walk");
  const [link, setLink] = useState<any>(null);

  async function loadDetail() {
    setLoadErr(null);
    try {
      const [l, p] = await withTimeout(Promise.all([
        supabase.from("estimate_lines").select("*").eq("estimate_id", est.id).order("sort"),
        // never select * here — photo_b64 would ship every image on load
        supabase.from("estimate_photos").select("id,caption,created_at").eq("estimate_id", est.id).order("created_at"),
      ]));
      const fe = firstError(l, p);
      if (fe) throw new Error(fe);
      setPhotos(p.data ?? []);
      if (est.proposal_link_id) {
        const { data } = await withTimeout(supabase.from("proposal_links").select("token,status,view_count").eq("id", est.proposal_link_id).maybeSingle());
        setLink(data);
      }
      setLines(l.data ?? []);
    } catch (err: any) {
      setLoadErr(timeoutMsg(err));
    }
  }
  useEffect(() => {
    loadDetail();
    /* eslint-disable-next-line */
  }, [est.id]);

  async function patch(p: any) {
    setE((x: Est) => ({ ...x, ...p }));
    onChanged(p);
    const { error } = await supabase.from("estimates").update({ ...p, updated_at: new Date().toISOString() }).eq("id", e.id);
    if (error) showError("Save failed: " + error.message);
  }

  const ls: Line[] = lines ?? [];
  const cust = customers.find((c: any) => c.id === e.customer_id) || null;
  const myProps = props.filter((p: any) => p.customer_id === e.customer_id);
  const tier = CLIENT_TYPE[cust?.client_type ?? "residential"] ?? CLIENT_TYPE.residential;

  const costTotal = ls.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unit_cost || 0), 0);
  const contingency = costTotal * (Number(e.contingency_pct || 0) / 100);
  const totalCost = costTotal + contingency;
  const sell = Number(e.sell_price || 0);
  const profit = sell - totalCost;
  const marginPct = sell > 0 ? (profit / sell) * 100 : 0;

  // keep the stored cost basis in step with the lines so the list view,
  // and anything that reads an estimate later, never shows a stale number
  useEffect(() => {
    if (lines === null) return; // not loaded yet — don't zero out the stored basis
    if (Math.abs(Number(e.cost_total ?? 0) - totalCost) < 0.005) return;
    const t = setTimeout(() => patch({ cost_total: Math.round(totalCost * 100) / 100 }), 600);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [totalCost, lines === null]);

  const byCat = CATS.map((c) => ({
    cat: c,
    total: ls.filter((l) => l.category === c).reduce((s, l) => s + Number(l.qty || 0) * Number(l.unit_cost || 0), 0),
  })).filter((x) => x.total > 0);

  /* ---------- lines ---------- */
  async function addLine(category: Cat) {
    const row = {
      estimate_id: e.id,
      sort: ls.length,
      category,
      description: "",
      qty: category === "Labor" ? 8 : 1,
      unit: category === "Labor" ? "hr" : "ea",
      unit_cost: 0,
    };
    const { data, error } = await supabase.from("estimate_lines").insert(row).select().single();
    if (error) return showError("Could not add the line: " + error.message);
    setLines([...ls, data]);
  }
  async function saveLine(id: string, p: any) {
    setLines((xs) => (xs ?? []).map((x) => (x.id === id ? { ...x, ...p } : x)));
    const { error } = await supabase.from("estimate_lines").update(p).eq("id", id);
    if (error) showError("Line not saved: " + error.message);
  }
  function delLine(id: string) {
    const idx = ls.findIndex((x) => x.id === id);
    const gone = ls[idx];
    if (!gone) return;
    undoable({
      text: `Removed ${gone.description || gone.category + " line"}`,
      hide: () => setLines((xs) => (xs ?? []).filter((x) => x.id !== id)),
      restore: () => setLines((xs) => {
        const cur = xs ?? [];
        if (cur.some((x) => x.id === id)) return cur;
        const n = [...cur];
        n.splice(Math.max(0, Math.min(idx, n.length)), 0, gone);
        return n;
      }),
      commit: () => supabase.from("estimate_lines").delete().eq("id", id),
    });
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
      sort: ls.length + i,
      category: "Material" as Cat,
      description: typeof c === "string" ? c : c?.text || c?.label || "",
      qty: 0,
      unit: "ea",
      unit_cost: 0,
    })).filter((r) => r.description);
    if (!seeds.length) return showError("That template has no line items to seed.");
    const { data, error } = await supabase.from("estimate_lines").insert(seeds).select();
    if (error) return showError("Could not add the template: " + error.message);
    setLines([...ls, ...(data ?? [])]);
    showToast(`Added ${data?.length ?? seeds.length} lines from ${t.name}`);
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
    if (error) return showError("Photo not saved: " + error.message);
    setPhotos([...photos, data]);
    showToast("Photo added");
  }

  const scopeText = useMemo(() => {
    if (e.scope_override?.trim()) return e.scope_override;
    const custom = ls.map((l: Line) => l.scope_line).filter(Boolean);
    if (custom.length) return custom.join("\n");
    return e.observed_conditions || "";
    /* eslint-disable-next-line */
  }, [lines, e.observed_conditions, e.scope_override]);

  /* ---------- send ---------- */
  async function sendIt() {
    if (!e.customer_id) return showError("Pick a customer first.");
    if (!e.title?.trim()) return showError("Give the build a name — it becomes the job name everywhere.");
    if (!sell) return showError("Set your price before sending.");
    setSaving(true);
    try {
      const c = customers.find((x: any) => x.id === e.customer_id);
      const prop = props.find((x: any) => x.id === e.property_id);
      const location = prop ? [prop.address, prop.city].filter(Boolean).join(", ") : e.location;
      // Settings defaults: customer's own terms win; otherwise the default terms from Settings.
      const [validDays, defaultTerms] = await Promise.all([getProposalValidDays(), getPaymentTerms()]);
      const terms = c.payment_terms?.trim() || defaultTerms;

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
        terms,
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
      const { data: pl, error: pe } = await supabase.from("proposal_links").insert({
        token,
        job_id: job.id,
        title: e.title.trim(),
        intro: e.price_notes || null,
        scope: scopeText,
        price: sell,
        terms,
        deposit_pct: 33,
        deposit_amount: Math.round(sell * 0.33 * 100) / 100,
        status: "sent",
        expires_at: daysFromToday(validDays),
      }).select().single();
      if (pe) throw pe;

      // 5. access notes learned on the walk stay with the property
      if (e.property_id && e.access_notes) {
        await supabase.from("properties").update({ access_notes: e.access_notes }).eq("id", e.property_id);
      }

      await patch({ status: "sent", step: "send", job_id: job.id, site_visit_id: sv?.id ?? null, proposal_link_id: pl.id, sent_at: new Date().toISOString() });
      setLink(pl);
      showToast("Job created — client link is live");
    } catch (err: any) {
      showError("Could not send: " + (err?.message ?? String(err)));
    } finally {
      setSaving(false);
    }
  }

  /* ---------- render ---------- */
  const STEPS = [
    { key: "walk", label: "Walk" },
    { key: "price", label: "Price" },
    { key: "send", label: "Send" },
  ];
  const stepIdx = Math.max(0, STEPS.findIndex((s) => s.key === step));
  const goStep = (k: string) => { setStep(k); if (e.status === "draft") patch({ step: k }); };

  const header = (
    <PageHeader
      crumb={<button onClick={onBack} className="inline-flex min-h-[32px] items-center gap-1 font-semibold text-neutral-400 hover:text-white"><ArrowLeft size={14} /> Builds</button>}
      title={e.title || "Untitled build"}
      sub={[e.customer, e.location].filter(Boolean).join(" — ") || "No customer yet"}
      actions={<div className="flex items-center gap-2">{stageBadge(e)}{sell > 0 ? <span className="text-lg font-semibold tabular-nums text-white">{fmt$(sell)}</span> : null}</div>}
    />
  );

  if (loadErr && lines === null) return <div>{header}<LoadError message={loadErr} onRetry={loadDetail} /></div>;
  if (lines === null) return <div>{header}<ListSkeleton rows={3} /></div>;

  return (
    <div className="space-y-5">
      <div>
        {header}
        <Stepper steps={STEPS} current={stepIdx} done={(i) => i < stepIdx || e.status !== "draft"} onPick={goStep} />
      </div>

      {/* ---------------- WALK ---------------- */}
      {step === "walk" ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 md:items-start">
            <Card>
              <CardHeader><CardTitle>The job</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Job name — this becomes the job name everywhere">
                  <Input value={e.title ?? ""} placeholder="e.g. 407 East Ave — Sidewalk Replacement"
                    onChange={(ev) => setE({ ...e, title: ev.target.value })}
                    onBlur={(ev) => patch({ title: ev.target.value })} />
                </Field>

                <div>
                  <Field label="Customer — pick, don't type">
                    <NativeSelect value={e.customer_id ?? ""}
                      onChange={(ev) => {
                        const c = customers.find((x: any) => x.id === ev.target.value);
                        patch({ customer_id: c?.id ?? null, customer: c?.name ?? null, property_id: null, location: null });
                      }}>
                      <option value="">Select a customer…</option>
                      {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </NativeSelect>
                  </Field>
                  {cust ? (
                    <div className="mt-1.5 rounded-lg border border-border bg-neutral-950 px-3 py-2">
                      <div className="text-xs font-semibold text-neutral-300">{tier.label}</div>
                      <div className="text-xs text-neutral-400">{tier.hint}</div>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-neutral-500">
                      New customer? Add them on the Customers tab first so the spelling stays clean.
                    </p>
                  )}
                </div>

                {e.customer_id ? (
                  <Field label="Property">
                    <NativeSelect value={e.property_id ?? ""}
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
                    </NativeSelect>
                  </Field>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Work type">
                    <Input list="job-types" value={e.job_type ?? ""} placeholder="Concrete Pad"
                      onChange={(ev) => setE({ ...e, job_type: ev.target.value })}
                      onBlur={(ev) => patch({ job_type: ev.target.value })} />
                    <datalist id="job-types">
                      {templates.map((t: any) => <option key={t.id} value={t.job_type || t.name} />)}
                    </datalist>
                  </Field>
                  <Field label="Visit date">
                    <Input type="date" value={e.visit_date ?? todayISO()}
                      onChange={(ev) => patch({ visit_date: ev.target.value })} />
                  </Field>
                </div>

                <Field label="Met with">
                  <Input value={e.met_with ?? ""} placeholder="Property manager, super, owner…"
                    onChange={(ev) => setE({ ...e, met_with: ev.target.value })}
                    onBlur={(ev) => patch({ met_with: ev.target.value })} />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>What you saw</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Observed conditions">
                  <Textarea rows={4} value={e.observed_conditions ?? ""}
                    placeholder="Cracked and settled, water ponding at the low corner, downspout discharging onto the slab…"
                    onChange={(ev) => setE({ ...e, observed_conditions: ev.target.value })}
                    onBlur={(ev) => patch({ observed_conditions: ev.target.value })} />
                </Field>
                <Field label="Dimensions">
                  <Input value={e.dimensions ?? ""} placeholder="24 × 16, 4in slab · curb 38 lf"
                    onChange={(ev) => setE({ ...e, dimensions: ev.target.value })}
                    onBlur={(ev) => patch({ dimensions: ev.target.value })} />
                </Field>
                <Field label="Access notes — saved to the property">
                  <Textarea rows={2} className="min-h-0" value={e.access_notes ?? ""}
                    placeholder="Gate code, where to park, what the truck can't reach"
                    onChange={(ev) => setE({ ...e, access_notes: ev.target.value })}
                    onBlur={(ev) => patch({ access_notes: ev.target.value })} />
                </Field>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-neutral-950 px-3 py-2.5">
                  <input type="checkbox" checked={!!e.hand_dig} onChange={(ev) => patch({ hand_dig: ev.target.checked })} className="h-4 w-4 accent-white" />
                  <Hammer size={15} className="text-neutral-400" />
                  <span className="text-sm font-semibold text-white">Hand-dig corridor — no equipment access</span>
                </label>
                {e.hand_dig ? (
                  <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    <TriangleAlert size={14} className="mt-px shrink-0" />
                    Flagged. Hand-dig changes the labor cost structure — price the hours, not the machine.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Photos <span className="ml-1 font-normal text-neutral-500">{photos.length}</span></CardTitle>
              <Button asChild variant="outline" size="sm" className="ml-auto h-10 cursor-pointer">
                <label>
                  <Camera size={15} /> Add
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(ev) => { const f = ev.target.files?.[0]; if (f) addPhoto(f); ev.currentTarget.value = ""; }} />
                </label>
              </Button>
            </CardHeader>
            <CardContent>
              {photos.length ? (
                <p className="text-xs text-neutral-400">
                  {photos.length} photo{photos.length === 1 ? "" : "s"} — they move onto the job as “before” shots when you send.
                </p>
              ) : (
                <p className="text-xs text-neutral-500">No photos yet.</p>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button size="lg" className="w-full md:w-auto" onClick={() => goStep("price")}>
              Price it <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---------------- PRICE ---------------- */}
      {step === "price" ? (
        <div className="space-y-4">
          {templates.length ? (
            <Card>
              <CardHeader><CardTitle>Start from a scope</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {templates.map((t: any) => (
                  <Button key={t.id} variant="outline" size="sm" className="h-10" onClick={() => useTemplate(t)}>{t.name}</Button>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <section>
            <SectionTitle right={<span className="text-sm tabular-nums text-neutral-400">{fmt2(costTotal)}</span>}>Line items</SectionTitle>
            {ls.length ? (
              <div className="md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-card">
                <div className={cn(LINE_GRID, "hidden border-b border-border bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-400 md:grid")}>
                  <span>Type</span><span>Item</span><span className="text-right">Qty</span><span className="text-center">Unit</span>
                  <span className="text-right">Unit cost</span><span className="text-right">Amount</span><span /><span />
                </div>
                <div className="space-y-2 md:space-y-0">
                  {ls.map((l) => (
                    <LineRow key={l.id} l={l} book={book} workers={workers}
                      onSave={(p: any) => saveLine(l.id, p)} onLearn={() => learn(l)} onDelete={() => delLine(l.id)} />
                  ))}
                </div>
              </div>
            ) : (
              <Empty title="No line items yet" body="Add material, labor, equipment, disposal or a sub below — or start from a scope." />
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            {CATS.filter((c) => c !== "Other").map((c) => {
              const Icon = CAT_META[c].icon;
              return (
                <Button key={c} variant="outline" size="sm" className="h-10" onClick={() => addLine(c)}>
                  <Plus size={14} /><Icon size={14} /> {c}
                </Button>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2 md:items-start">
            <Card>
              <CardHeader><CardTitle>Cost basis</CardTitle></CardHeader>
              <CardContent>
                {byCat.map((b) => {
                  const Icon = CAT_META[b.cat].icon;
                  return (
                    <KV key={b.cat} k={<span className="inline-flex items-center gap-1.5"><Icon size={14} /> {b.cat}</span>}>
                      <span className="tabular-nums">{fmt2(b.total)}</span>
                    </KV>
                  );
                })}
                <div className="flex items-center justify-between gap-2 border-t border-border py-2">
                  <span className="text-sm text-neutral-400">Contingency</span>
                  <div className="flex items-center gap-1.5">
                    <Input type="number" inputMode="decimal" className="w-20 text-right"
                      value={e.contingency_pct ?? 0} onChange={(ev) => patch({ contingency_pct: Number(ev.target.value) })} />
                    <span className="text-xs text-neutral-400">%</span>
                    <span className="w-24 text-right text-sm tabular-nums text-neutral-200">{fmt2(contingency)}</span>
                  </div>
                </div>
                <div className="flex items-baseline justify-between border-t border-border pt-2">
                  <span className="text-sm font-semibold text-white">Total cost</span>
                  <span className="text-lg font-semibold tabular-nums text-white">{fmt2(totalCost)}</span>
                </div>
              </CardContent>
            </Card>

            {/* ---- the sell price. Typed, never generated. ---- */}
            <Card>
              <CardHeader><CardTitle>Your price</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-border bg-neutral-950 px-3 py-2">
                  <div className="text-xs font-semibold text-neutral-300">{tier.label}</div>
                  <div className="text-xs text-neutral-400">{tier.hint}</div>
                  {totalCost > 0 ? (
                    <div className="mt-1.5 text-xs text-neutral-400">
                      For reference, this tier usually lands between{" "}
                      <span className="font-semibold text-neutral-200">{fmt$(totalCost * tier.lo)}</span> and{" "}
                      <span className="font-semibold text-neutral-200">{fmt$(totalCost * tier.hi)}</span>. Your call.
                    </div>
                  ) : null}
                </div>

                <div>
                  <Label>Contract price</Label>
                  <MoneyInput className={cn(moneyCls, "h-12 text-lg font-semibold")} value={e.sell_price ?? ""}
                    onChange={(v) => setE({ ...e, sell_price: v })}
                    onBlur={(v) => patch({ sell_price: v === "" ? null : Number(v) })} />
                </div>

                {sell > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Stat label="Net profit" value={fmt2(profit)} tone={profit < 0 ? "bad" : "ok"} className="bg-neutral-950" />
                      <Stat label="Margin" value={marginPct.toFixed(1) + "%"} tone={marginPct < 20 ? "warn" : "ok"} className="bg-neutral-950" />
                    </div>
                    <Progress value={sell > 0 ? (totalCost / sell) * 100 : 0} tone={profit < 0 ? "bad" : marginPct < 20 ? "warn" : "ok"} className="h-2" />
                    <PaverFloor jobType={e.job_type} dimensions={e.dimensions} sell={sell} />
                  </>
                ) : null}

                <Field label="Note for the proposal intro (optional)">
                  <Textarea rows={2} className="min-h-0" value={e.price_notes ?? ""}
                    onChange={(ev) => setE({ ...e, price_notes: ev.target.value })}
                    onBlur={(ev) => patch({ price_notes: ev.target.value })} />
                </Field>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button size="lg" className="w-full md:w-auto" onClick={() => goStep("send")} disabled={!sell}>
              Send it <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---------------- SEND ---------------- */}
      {step === "send" ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 md:items-start">
            <Card>
              <CardHeader><CardTitle>What gets created</CardTitle></CardHeader>
              <CardContent>
                <KV k="Job name">{e.title || "—"}</KV>
                <KV k="Customer">{e.customer || "—"}</KV>
                <KV k="Property">{e.location || "—"}</KV>
                <KV k="Work type">{e.job_type || "—"}</KV>
                <KV k="Status">Sent — proposal is with the customer</KV>
                <KV k="Contract price"><span className="tabular-nums">{sell ? fmt2(sell) : "—"}</span></KV>
                <KV k="Cost basis"><span className="tabular-nums">{fmt2(totalCost)}</span></KV>
                <KV k="Photos">{photos.length ? `${photos.length} → job "before"` : "none"}</KV>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Scope the client sees</CardTitle></CardHeader>
              <CardContent>
                <Textarea rows={8} value={e.scope_override ?? scopeText}
                  onChange={(ev) => setE({ ...e, scope_override: ev.target.value })}
                  onBlur={(ev) => patch({ scope_override: ev.target.value })} />
                <p className="mt-1 text-xs text-neutral-500">
                  One line per division. This lands on the client hub page and in jobs.scope_of_work.
                </p>
              </CardContent>
            </Card>
          </div>

          {e.status === "sent" && link ? (
            <Card>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">
                  <CircleCheck size={16} /> Job created and the client link is live.
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button asChild variant="outline">
                    <a href={`/p/${link.token}`} target="_blank" rel="noopener noreferrer"><Eye size={15} /> View as client</a>
                  </Button>
                  <Button variant="outline" onClick={() => copyText(`${window.location.origin}/p/${link.token}`, "Link copied")}>
                    <Copy size={15} /> Copy link
                  </Button>
                  <Button asChild variant="outline">
                    <a href={`/?job=${e.job_id}`}><ExternalLink size={15} /> Open job file</a>
                  </Button>
                </div>
                <p className="text-xs text-neutral-400">
                  Email the link or read it out on the phone. The daily sweep will nudge you at day 3, 7 and 14 if it goes quiet.
                </p>
                <div className="flex gap-2 border-t border-border pt-3">
                  <Button variant="outline" onClick={() => patch({ status: "won" })}>Mark won</Button>
                  <Button variant="outline" onClick={() => patch({ status: "lost" })}>Mark lost</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex justify-end">
              <Button size="lg" className="w-full md:w-auto" onClick={sendIt} disabled={saving || !sell || !e.customer_id || !e.title?.trim()}>
                {saving ? "Creating…" : "Create job + client link"}
              </Button>
            </div>
          )}
        </div>
      ) : null}
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
    return <div className="flex gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
      <CircleCheck size={14} className="mt-px shrink-0" />
      {fmt2(psf)}/sq ft over {sqft.toLocaleString()} sq ft — above the $35 floor.
    </div>;
  }
  return <div className="flex gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
    <TriangleAlert size={14} className="mt-px shrink-0" />
    {fmt2(psf)}/sq ft over {sqft.toLocaleString()} sq ft — under the $35/sq ft floor for paver work. Price up.
  </div>;
}

/* ---------------- one estimate line ---------------- */
// Phone: a stacked card. md+: one row of the line-item table (LINE_GRID).
function LineRow({ l, book, workers, onSave, onLearn, onDelete }: any) {
  const [d, setD] = useState(l);
  const [calc, setCalc] = useState(false);
  useEffect(() => setD(l), [l.id, l.item_id]);

  const meta = CAT_META[d.category] ?? CAT_META.Other;
  const Icon = meta.icon;
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
    <div className="space-y-2 rounded-xl border border-border bg-card p-3 md:rounded-none md:border-0 md:border-b md:bg-transparent md:px-3 md:py-2.5 md:last:border-b-0">
      <div className={LINE_GRID}>
        {/* type chip (+ amount and delete on phone) */}
        <div className="col-span-6 flex items-center gap-2 md:col-span-1">
          <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold", meta.cls)}><Icon size={12} /> {d.category}</span>
          <div className="ml-auto text-sm font-semibold tabular-nums text-white md:hidden">{fmt2(amount)}</div>
          <Button variant="ghost" size="icon" className="-mr-2 text-neutral-500 hover:text-red-300 md:hidden" onClick={onDelete} aria-label="Remove line"><Trash2 size={16} /></Button>
        </div>

        <div className="col-span-6 md:col-span-1">
          {d.category === "Labor" ? (
            <NativeSelect aria-label="Who" value={d.description ?? ""} onChange={(ev) => pickWorker(ev.target.value)}>
              <option value="">Who…</option>
              {workers.map((w: any) => (
                <option key={w.id} value={w.name}>{w.name} — ${w.rate ?? "?"}/{w.rate_type === "daily" ? "day" : "hr"}</option>
              ))}
            </NativeSelect>
          ) : (
            <>
              <Input aria-label="Item" list={`book-${d.id}`} value={d.description ?? ""} placeholder="What is it?"
                onChange={(ev) => setD({ ...d, description: ev.target.value })}
                onBlur={(ev) => pickBook(ev.target.value)} />
              <datalist id={`book-${d.id}`}>
                {book.filter((b: any) => b.category === d.category).map((b: any) => (
                  <option key={b.id} value={b.name}>{b.current_cost ? `$${b.current_cost}/${b.unit}` : b.unit}</option>
                ))}
              </datalist>
            </>
          )}
        </div>

        <Input aria-label="Quantity" type="number" inputMode="decimal" className="col-span-2 text-right md:col-span-1" value={d.qty ?? 0}
          onChange={(ev) => setD({ ...d, qty: ev.target.value })}
          onBlur={(ev) => onSave({ qty: Number(ev.target.value || 0) })} />
        <Input aria-label="Unit" className="col-span-1 px-1.5 text-center text-xs text-neutral-300 md:col-span-1"
          value={d.unit ?? ""} onChange={(ev) => setD({ ...d, unit: ev.target.value })}
          onBlur={(ev) => onSave({ unit: ev.target.value })} />
        <div className="col-span-2 md:col-span-1">
          <MoneyInput className={cn(moneyCls, "text-right")} value={d.unit_cost ?? 0}
            onChange={(v) => setD({ ...d, unit_cost: v })}
            onBlur={(v) => { onSave({ unit_cost: Number(v || 0) }); setTimeout(onLearn, 150); }} />
        </div>
        <div className="hidden text-right text-sm font-semibold tabular-nums text-white md:block">{fmt2(amount)}</div>
        <Button variant={calc ? "secondary" : "ghost"} size="icon" className="col-span-1 w-full md:w-10" onClick={() => setCalc(!calc)} title="Quantity calculator" aria-label="Quantity calculator">
          <Calculator size={16} />
        </Button>
        <Button variant="ghost" size="icon" className="hidden text-neutral-500 hover:text-red-300 md:inline-flex" onClick={onDelete} aria-label="Remove line"><Trash2 size={16} /></Button>
      </div>

      {calc ? <QtyCalc onApply={(qty: number, unit: string) => { setD({ ...d, qty, unit }); onSave({ qty, unit }); setCalc(false); }} /> : null}

      {d.category === "Labor" && d.description === "Adam" && d.unit === "hr" && amount > 400 ? (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200">
          <TriangleAlert size={14} className="mt-px shrink-0" />
          {fmt2(amount)} at $35/hr is over Adam's $400 day cap. Confirm which applies on this job.
        </div>
      ) : null}
      {stale ? (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200">
          <TriangleAlert size={14} className="mt-px shrink-0" />
          Last confirmed {new Date(item.last_confirmed).toLocaleDateString("en-US", { month: "short", year: "numeric" })} — over 6 months. Check it before you rely on it.
        </div>
      ) : null}
      {isNew && Number(d.unit_cost) > 0 ? (
        <div className="flex items-center gap-1 text-xs text-emerald-400"><Plus size={12} /> New to the price book — it'll be saved when you leave the cost field.</div>
      ) : null}

      <Input className="h-9 text-xs text-neutral-300 md:ml-[120px] md:w-[calc(100%-120px)]"
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
      className="min-h-[44px] rounded-lg border border-border bg-neutral-950 px-3 py-1.5 text-left transition-colors hover:border-white/25">
      <div className="text-xs font-semibold text-neutral-400">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-white">{(val * wf).toFixed(2)} <span className="text-xs font-normal text-neutral-400">{unit}</span></div>
    </button>
  );

  return (
    <div className="space-y-2 rounded-lg border border-border bg-neutral-950/60 p-3 md:ml-[120px]">
      <div className="grid grid-cols-4 gap-2 md:max-w-lg">
        <Field label="L ft"><Input type="number" inputMode="decimal" value={L} onChange={(e) => setL(e.target.value)} /></Field>
        <Field label="W ft"><Input type="number" inputMode="decimal" value={W} onChange={(e) => setW(e.target.value)} /></Field>
        <Field label="Depth in"><Input type="number" inputMode="decimal" value={D} onChange={(e) => setD(e.target.value)} /></Field>
        <Field label="Waste %"><Input type="number" inputMode="decimal" value={waste} onChange={(e) => setWaste(e.target.value)} /></Field>
      </div>
      {sqft > 0 ? (
        <div className="grid grid-cols-3 gap-2 md:max-w-lg">
          {out("Area", sqft, "sq ft")}
          {din > 0 ? out("Volume", cuyd, "cu yd") : <div />}
          {din > 0 ? out("Weight", tons, "ton") : <div />}
        </div>
      ) : <div className="text-xs text-neutral-500">Enter length and width. Tap a result to use it as the quantity.</div>}
    </div>
  );
}
