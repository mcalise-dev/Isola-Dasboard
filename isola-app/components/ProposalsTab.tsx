"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, jobLabel, parsePrice, revenueOf } from "@/lib/format";
import { withTimeout, firstError } from "@/lib/load";
import { getProposalValidDays, getPaymentTerms, daysFromToday, DEFAULT_VALID_DAYS } from "@/lib/settings";
import { showError, showToast } from "@/components/Toaster";
import { copyText } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea, Field, NativeSelect } from "@/components/ui/input";
import { PageHeader, SectionTitle, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Eye, Copy, Pencil, Link2, Check, X, RotateCcw, FileText, Plus, Mail, Download, PenLine, Upload } from "lucide-react";
import { downloadSignedCopy } from "@/lib/signedPdf";
import { newToken, nextCoNumber } from "@/lib/esign";

const fmt$ = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

// Everything on a link except the big signature image — that's fetched only when a signed copy is built.
const LINK_COLS =
  "id,token,job_id,kind,change_order_id,title,intro,scope,price,terms,deposit_pct,deposit_amount,pay_url,status,sent_at,viewed_at,view_count,approved_at,approved_by,signer_email,signer_ip,doc_hash,document_id,declined_at,decline_reason,expires_at,created_at";


const fileToB64 = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = rej;
    r.readAsDataURL(f);
  });

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function ProposalsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [links, setLinks] = useState<Record<string, any[]>>({});
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [dl, setDl] = useState("");
  const [sites, setSites] = useState<Record<string, string>>({});

  async function load() {
    setErr(null);
    try {
      const [j, pl, ss] = await withTimeout(Promise.all([
        supabase
          .from("jobs")
          .select("id,job_name,customer,customer_id,location,job,price,contract_holder,isola_cut,status,proposal_status,quoted_date,scope_of_work,terms,contact_phone,updated_at")
          .neq("proposal_status", "none")
          .not("proposal_status", "is", null)
          .order("quoted_date", { ascending: true }),
        supabase
          .from("proposal_links")
          .select(LINK_COLS)
          .order("created_at", { ascending: true }),
        supabase.from("siteline_shares").select("job_id,token"),
      ]));
      const e = firstError(j, pl);
      if (e) throw new Error(e);
      const byJob: Record<string, any[]> = {};
      (pl.data ?? []).forEach((l: any) => { (byJob[l.job_id] ??= []).push(l); });
      setLinks(byJob);
      setSites(Object.fromEntries((ss.data ?? []).map((s: any) => [s.job_id, s.token])));
      setJobs(j.data ?? []);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function setProposal(j: any, proposal_status: string) {
    const patch: any = { proposal_status, updated_at: new Date().toISOString() };
    if (proposal_status === "sent" && !j.quoted_date) patch.quoted_date = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("jobs").update(patch).eq("id", j.id);
    if (error) showError("Update failed: " + error.message); else load();
  }

  const linkUrl = (t: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/p/${t}`;
  // v7.0: the client gets ONE link per job — the SiteLine project page, where every
  // proposal and change order waits to be signed. Falls back to the signing link itself.
  const shareUrl = (j: any, t: string) => sites[j.id] ? `${typeof window !== "undefined" ? window.location.origin : ""}/site/${sites[j.id]}` : linkUrl(t);

  async function copy(j: any, t: string) {
    await copyText(shareUrl(j, t), sites[j.id] ? "Project page link copied" : "Link copied");
  }

  // Opens Mike's own mail app with the link filled in — nothing goes out until he hits send there.
  function emailLink(j: any, l: any) {
    const word = l.kind === "change_order" ? "change order" : "proposal";
    const name = l.title || j.job_name || "your project";
    const subject = `${name} — ${word} for signature`;
    const body = `Hi,\n\nHere is the ${word} for ${name}. You can review it and sign right from your phone or computer — the same page shows the scope, the schedule and job updates:\n\n${shareUrl(j, l.token)}\n\nAny questions, give me a call.\n\nThank you,\nMike Calise\nIsola LLC\n508-933-2661`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function signedCopy(j: any, l: any) {
    setDl(l.id);
    try { await downloadSignedCopy(supabase, l.id, j); }
    catch (e: any) { showError("Couldn't build the signed copy: " + (e?.message ?? e)); }
    setDl("");
  }

  const daysOut = (j: any) => (j.quoted_date ? Math.floor((Date.now() - new Date(j.quoted_date + "T12:00:00").getTime()) / 86400000) : null);

  if (err && !jobs) return <div><PageHeader title="Proposals" sub="Out for signature, signed and declined" /><LoadError message={err} onRetry={load} /></div>;
  if (!jobs) return <div><PageHeader title="Proposals" sub="Out for signature, signed and declined" /><ListSkeleton /></div>;

  const sent = jobs.filter((j) => j.proposal_status === "sent").sort((a, b) => (daysOut(b) ?? -1) - (daysOut(a) ?? -1));
  const signed = jobs.filter((j) => j.proposal_status === "signed" || j.proposal_status === "accepted");
  const declined = jobs.filter((j) => j.proposal_status === "declined");
  const outTotal = sent.reduce((a, j) => a + revenueOf(j), 0);
  const expiring = sent.filter((j) => (daysOut(j) ?? 0) > 21 && (daysOut(j) ?? 0) <= 30).length;
  const expired = sent.filter((j) => (daysOut(j) ?? 0) > 30).length;
  const viewedCount = sent.filter((j) => (links[j.id] ?? []).some((l) => l.view_count > 0)).length;
  const openCOs = Object.values(links).flat().filter((l: any) => l.kind === "change_order" && (l.status === "sent" || l.status === "viewed")).length;

  function pill(j: any) {
    const d = daysOut(j);
    if (d == null) return <Badge variant="muted">no date</Badge>;
    if (d > 30) return <Badge variant="danger">expired · {d}d</Badge>;
    if (d > 21) return <Badge variant="warning">{30 - d}d left</Badge>;
    if (d > 14) return <Badge variant="warning">{d}d out — check in</Badge>;
    return <Badge>{d}d out</Badge>;
  }

  function linkRow(j: any, l: any) {
    const isCO = l.kind === "change_order";
    const isSigned = l.status === "approved";
    const variant = isSigned ? "success" : l.status === "declined" ? "muted" : l.view_count > 0 ? "default" : "muted";
    const label = isSigned ? `Signed by ${l.approved_by ?? "client"}${l.approved_at ? " · " + shortDate(l.approved_at) : ""}`
      : l.status === "declined" ? `Declined online${l.decline_reason ? " — " + l.decline_reason : ""}`
      : l.view_count > 0 ? `Opened ${l.view_count}×${l.viewed_at ? " · first " + shortDate(l.viewed_at) : ""} — not signed yet`
      : "Link ready — not opened yet";
    return (
      <div key={l.id} className="space-y-2 rounded-lg border border-border p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={isCO ? "warning" : "default"}>{isCO ? "Change order" : "Proposal"}</Badge>
          <Badge variant={variant as any} className="whitespace-normal">
            {isSigned ? <Check size={12} /> : l.view_count > 0 ? <Eye size={12} /> : <Link2 size={12} />}
            {label}
          </Badge>
          {l.price != null ? <span className="ml-auto text-xs font-semibold tabular-nums text-neutral-300">{fmt$(Number(l.price))}</span> : null}
        </div>
        {isCO && l.title ? <div className="truncate text-xs text-neutral-400">{l.title}</div> : null}
        {isSigned ? (
          <div className="text-[11px] leading-snug text-neutral-500">
            {[l.signer_email, l.signer_ip ? "IP " + l.signer_ip : null, l.document_id ? "PDF attached" : null].filter(Boolean).join(" · ")}
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <Button asChild variant="outline" size="sm" className="h-10">
            <a href={`/p/${l.token}`} target="_blank" rel="noopener noreferrer"><Eye size={14} /> View</a>
          </Button>
          <Button variant="outline" size="sm" className="h-10" onClick={() => copy(j, l.token)}><Copy size={14} /> Copy link</Button>
          {isSigned ? (
            <Button variant="outline" size="sm" className="h-10" onClick={() => signedCopy(j, l)} disabled={dl === l.id}>
              <Download size={14} /> {dl === l.id ? "Building…" : "Signed copy"}
            </Button>
          ) : l.status === "declined" ? (
            <Button variant="outline" size="sm" className="h-10" onClick={() => setEditing({ job: j, link: l })}><Pencil size={14} /> Edit</Button>
          ) : (
            <Button variant="outline" size="sm" className="h-10" onClick={() => emailLink(j, l)}><Mail size={14} /> Email it</Button>
          )}
        </div>
        {!isSigned && l.status !== "declined" ? (
          <Button variant="ghost" size="sm" className="h-9 w-full" onClick={() => setEditing({ job: j, link: l })}><Pencil size={14} /> Edit</Button>
        ) : null}
      </div>
    );
  }

  function hubRow(j: any) {
    const ls = links[j.id] ?? [];
    const hasProposal = ls.some((l) => l.kind !== "change_order");
    return (
      <div className="mt-3 space-y-2">
        {ls.map((l) => linkRow(j, l))}
        <div className={`grid gap-2 ${hasProposal ? "grid-cols-1" : "grid-cols-2"}`}>
          {!hasProposal ? (
            <Button variant="outline" className="w-full border-dashed" onClick={() => setEditing({ job: j, kind: "proposal" })}>
              <PenLine size={15} /> Send for signature
            </Button>
          ) : null}
          <Button variant="outline" className="w-full border-dashed" onClick={() => setEditing({ job: j, kind: "change_order" })}>
            <Plus size={15} /> Change order
          </Button>
        </div>
      </div>
    );
  }

  function card(j: any, actions: { label: string; to: string }[]) {
    return (
      <Card key={j.id} className="flex flex-col px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{jobLabel(j)}</div>
            <div className="mt-0.5 text-xs text-neutral-400">{j.quoted_date ? "sent " + fmtDate(j.quoted_date) : "no send date"}{j.price ? " · " + j.price : ""}</div>
          </div>
          <div className="shrink-0">{j.proposal_status === "sent" ? pill(j) : null}</div>
        </div>
        {hubRow(j)}
        <div className="mt-2 flex gap-2 border-t border-border pt-2">
          {actions.map((a) => (
            <Button key={a.to} variant="ghost" size="sm" className="h-10" onClick={() => setProposal(j, a.to)}>
              {a.to === "signed" ? <Check size={14} /> : a.to === "declined" ? <X size={14} /> : <RotateCcw size={14} />}
              {a.label}
            </Button>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proposals"
        sub="Out for signature, signed and declined — with e-signature links"
        actions={<Button asChild variant="outline"><Link href="/build"><Plus size={16} /> New proposal</Link></Button>}
        className="mb-0"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Out now" value={String(sent.length)} />
        <Stat label="Value out" value={fmt$(outTotal)} />
        <Stat label="Opened" value={String(viewedCount)} hint={sent.length ? `of ${sent.length} out` : undefined} />
        <Stat label="Expiring" value={String(expiring + expired)} tone={expiring + expired ? "warn" : undefined} hint={expired ? `${expired} past 30 days` : openCOs ? `${openCOs} change order${openCOs > 1 ? "s" : ""} unsigned` : undefined} />
      </div>

      {sent.length === 0 ? (
        <Empty icon={<FileText size={26} />} title="Nothing out right now"
          body={<>Mark a job&apos;s proposal &quot;Sent&quot; on the Jobs tab and it shows up here with the 30-day clock running.</>} />
      ) : (
        <section>
          <SectionTitle right={<span className="text-sm text-neutral-500">{sent.length}</span>}>Out for signature — 30-day validity</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">{sent.map((j) => card(j, [{ label: "Signed", to: "signed" }, { label: "Declined", to: "declined" }]))}</div>
        </section>
      )}

      {signed.length ? (
        <section>
          <SectionTitle right={<span className="text-sm text-neutral-500">{signed.length}</span>}><span className="text-emerald-300">Signed</span></SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">{signed.map((j) => card(j, [{ label: "Back to sent", to: "sent" }]))}</div>
        </section>
      ) : null}

      {declined.length ? (
        <section>
          <SectionTitle right={<span className="text-sm text-neutral-500">{declined.length}</span>}>Declined</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">{declined.map((j) => card(j, [{ label: "Back to sent", to: "sent" }]))}</div>
        </section>
      ) : null}

      <p className="text-xs text-neutral-500">
        A signature link shows the client your proposal PDF, has them draw their signature and agree to sign electronically, and records their name, email, IP address, time, and a fingerprint of exactly what they signed. Signed documents lock. Changes after that go on a change order. You get a push the moment someone signs. Nothing goes out until you copy or email the link yourself.
      </p>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        {editing ? (
          <LinkEditor key={editing.link?.id ?? editing.job.id + (editing.kind ?? "")} supabase={supabase} job={editing.job} link={editing.link}
            kind={editing.link?.kind ?? editing.kind ?? "proposal"}
            onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
        ) : null}
      </Dialog>
    </div>
  );
}

export function LinkEditor({ supabase, job, link, kind, onClose, onSaved }: any) {
  const isCO = kind === "change_order";
  const price = link?.price ?? (isCO ? "" : parsePrice(job.price));
  const [f, setF] = useState({
    title: link?.title ?? (isCO ? `${job.job_name ?? "Job"} — Change Order` : job.job_name ?? ""),
    intro: link?.intro ?? "",
    scope: link?.scope ?? (isCO ? "" : job.scope_of_work ?? ""),
    price: String(price || ""),
    deposit_pct: String(link?.deposit_pct ?? 33),
    pay_url: link?.pay_url ?? "",
    expires_at: link?.expires_at ?? daysFromToday(DEFAULT_VALID_DAYS),
    document_id: link?.document_id ?? "",
  });
  const [docs, setDocs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [upBusy, setUpBusy] = useState(false);
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function loadDocs() {
    const { data } = await supabase.from("documents")
      .select("id,title,doc_type,created_at")
      .eq("job_id", job.id).in("doc_type", ["proposal", "change_order", "contract"])
      .order("created_at", { ascending: false });
    setDocs(data ?? []);
    return data ?? [];
  }

  useEffect(() => {
    // New link: expiry defaults to the validity set in Settings (unless already edited),
    // and the newest matching PDF on the job's Docs is pre-picked.
    if (link) { loadDocs(); return; }
    const first = daysFromToday(DEFAULT_VALID_DAYS);
    getProposalValidDays().then((d) => setF((s) => (s.expires_at === first ? { ...s, expires_at: daysFromToday(d) } : s)));
    loadDocs().then((d: any[]) => {
      const pick = d.find((x) => x.doc_type === (isCO ? "change_order" : "proposal"));
      if (pick) setF((s) => (s.document_id ? s : { ...s, document_id: pick.id }));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(e: any) {
    const file: File | undefined = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") { showError("Please choose a PDF."); return; }
    setUpBusy(true);
    try {
      const b64 = await fileToB64(file);
      const { data, error } = await supabase.from("documents").insert({
        doc_type: isCO ? "change_order" : "proposal",
        title: file.name.replace(/\.pdf$/i, ""),
        job_id: job.id, customer_id: job.customer_id ?? null,
        issuer: "Isola LLC", issued_on: new Date().toISOString().slice(0, 10),
        amount: Number(f.price) || null, file_b64: b64, mime_type: "application/pdf",
      }).select("id").single();
      if (error) throw error;
      await loadDocs();
      setF((s) => ({ ...s, document_id: data.id }));
      showToast("PDF added to the job's Docs");
    } catch (err: any) {
      showError("Upload failed: " + (err?.message ?? err));
    } finally {
      setUpBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    const p = f.price === "" ? null : Number(f.price);
    const pct = isCO ? null : (Number(f.deposit_pct) || null);
    const row: any = {
      job_id: job.id,
      kind,
      title: f.title || null,
      intro: f.intro || null,
      scope: f.scope || null,
      price: p,
      deposit_pct: pct,
      deposit_amount: p && pct ? Math.round(((p * pct) / 100) * 100) / 100 : null,
      pay_url: isCO ? null : (f.pay_url || null),
      expires_at: f.expires_at || null,
      document_id: f.document_id || null,
    };
    let error: any = null;
    try {
      if (isCO) {
        // keep the Billing tab's change order in step with what the client signs
        const co = { title: f.title || null, reason: f.intro || null, scope_text: f.scope || "", amount: p ?? 0, updated_at: new Date().toISOString() };
        if (link?.change_order_id) {
          const r = await supabase.from("change_orders").update(co).eq("id", link.change_order_id).neq("status", "approved");
          if (r.error) throw r.error;
        } else {
          const r = await supabase.from("change_orders").insert({
            ...co, job_id: job.id, co_number: await nextCoNumber(supabase, job.id), status: "sent", sent_at: new Date().toISOString(),
          }).select("id").single();
          if (r.error) throw r.error;
          row.change_order_id = r.data.id;
        }
      }
      if (link) ({ error } = await supabase.from("proposal_links").update(row).eq("id", link.id));
      else ({ error } = await supabase.from("proposal_links").insert({ ...row, token: newToken(), terms: isCO ? null : (job.terms?.trim() || (await getPaymentTerms())) }));
      // v7.0: a new proposal link puts the job in "Proposals sent" (and a lead becomes awaiting)
      if (!error && !link && !isCO && !["sent", "signed", "accepted"].includes(job.proposal_status)) {
        const jp: any = { proposal_status: "sent", updated_at: new Date().toISOString() };
        if (!job.quoted_date) jp.quoted_date = new Date().toISOString().slice(0, 10);
        if (job.status === "lead" || job.status === "quote") jp.status = "awaiting";
        await supabase.from("jobs").update(jp).eq("id", job.id);
      }
    } catch (e: any) { error = e; }
    setBusy(false);
    if (error) showError("Save failed: " + error.message);
    else { showToast(link ? "Saved" : "Signature link created — copy or email it when you're ready"); onSaved(); }
  }

  return (
    <DialogContent wide>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <DialogHeader>
          <DialogTitle>{link ? "Edit" : "New"} {isCO ? "change order" : "proposal"} for signature</DialogTitle>
          <DialogDescription>{jobLabel(job)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Title"><Input value={f.title} onChange={set("title")} placeholder="e.g. 148 West River St — Concrete Replacement" /></Field>
          <Field label={`${isCO ? "Change order" : "Proposal"} PDF — what the client reads and signs`}>
            <div className="flex gap-2">
              <NativeSelect value={f.document_id} onChange={set("document_id")} className="flex-1">
                <option value="">No PDF — the scope below is the document</option>
                {docs.map((d) => <option key={d.id} value={d.id}>{d.title} · {String(d.doc_type).replace("_", " ")} · {shortDate(d.created_at)}</option>)}
              </NativeSelect>
              <Button asChild type="button" variant="outline" className="h-10 shrink-0">
                <label className="cursor-pointer">
                  <Upload size={14} /> {upBusy ? "…" : "Upload"}
                  <input type="file" accept="application/pdf" onChange={upload} className="hidden" />
                </label>
              </Button>
            </div>
          </Field>
          <Field label="Opening note (optional)"><Textarea value={f.intro} onChange={set("intro")} rows={2} placeholder="Thanks for having us out. Here's what we'd do…" /></Field>
          <Field label={isCO ? "Change in work — one line per item" : "Work included — one line per item"}>
            <Textarea value={f.scope} onChange={set("scope")} rows={5} placeholder={isCO ? "Grind down and patch trip hazards at Units 9 and 78" : "Saw cut and remove existing slab\nBase prep and compaction\nPour 4in 3500psi concrete, broom finish"} />
          </Field>
          <div className={`grid gap-2 ${isCO ? "grid-cols-2" : "grid-cols-3"}`}>
            <Field label={isCO ? "Change amount" : "Price"}><Input value={f.price} onChange={set("price")} inputMode="decimal" /></Field>
            {!isCO ? <Field label="Deposit %"><Input value={f.deposit_pct} onChange={set("deposit_pct")} inputMode="numeric" /></Field> : null}
            <Field label="Expires"><Input type="date" value={f.expires_at} onChange={set("expires_at")} /></Field>
          </div>
          {!isCO ? (
            <Field label="Deposit payment link (optional — paste a QuickBooks payment link)">
              <Input value={f.pay_url} onChange={set("pay_url")} placeholder="https://…" />
            </Field>
          ) : null}
          <p className="text-xs text-neutral-500">Creating the link doesn&apos;t send anything. The client sees the PDF, scope, and price only, never your costs.{isCO ? " This also adds the change order to the job's Billing — it counts toward the contract once the client signs." : ""}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : link ? "Save changes" : "Create signature link"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
