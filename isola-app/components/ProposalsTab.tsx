"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, jobLabel, parsePrice } from "@/lib/format";
import { withTimeout, firstError } from "@/lib/load";
import { getProposalValidDays, getPaymentTerms, daysFromToday, DEFAULT_VALID_DAYS } from "@/lib/settings";
import { showError, showToast } from "@/components/Toaster";
import { copyText } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea, Field } from "@/components/ui/input";
import { PageHeader, SectionTitle, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Eye, Copy, Pencil, Link2, Check, X, RotateCcw, FileText, Plus } from "lucide-react";

const fmt$ = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

function newToken() {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => abc[b % abc.length]).join("");
}

export default function ProposalsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [links, setLinks] = useState<Record<string, any>>({});
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);

  async function load() {
    setErr(null);
    try {
      const [j, pl] = await withTimeout(Promise.all([
        supabase
          .from("jobs")
          .select("id,job_name,customer,location,job,price,status,proposal_status,quoted_date,scope_of_work,terms,contact_phone,updated_at")
          .neq("proposal_status", "none")
          .not("proposal_status", "is", null)
          .order("quoted_date", { ascending: true }),
        supabase
          .from("proposal_links")
          .select("*")
          .order("created_at", { ascending: false }),
      ]));
      const e = firstError(j, pl);
      if (e) throw new Error(e);
      const byJob: Record<string, any> = {};
      (pl.data ?? []).forEach((l: any) => { if (!byJob[l.job_id]) byJob[l.job_id] = l; });
      setLinks(byJob);
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

  async function copy(t: string) {
    await copyText(linkUrl(t), "Link copied");
  }

  const daysOut = (j: any) => (j.quoted_date ? Math.floor((Date.now() - new Date(j.quoted_date + "T12:00:00").getTime()) / 86400000) : null);

  if (err && !jobs) return <div><PageHeader title="Proposals" sub="Out for signature, signed and declined" /><LoadError message={err} onRetry={load} /></div>;
  if (!jobs) return <div><PageHeader title="Proposals" sub="Out for signature, signed and declined" /><ListSkeleton /></div>;

  const sent = jobs.filter((j) => j.proposal_status === "sent").sort((a, b) => (daysOut(b) ?? -1) - (daysOut(a) ?? -1));
  const signed = jobs.filter((j) => j.proposal_status === "signed" || j.proposal_status === "accepted");
  const declined = jobs.filter((j) => j.proposal_status === "declined");
  const outTotal = sent.reduce((a, j) => a + parsePrice(j.price), 0);
  const expiring = sent.filter((j) => (daysOut(j) ?? 0) > 21 && (daysOut(j) ?? 0) <= 30).length;
  const expired = sent.filter((j) => (daysOut(j) ?? 0) > 30).length;
  const viewedCount = sent.filter((j) => links[j.id] && links[j.id].view_count > 0).length;

  function pill(j: any) {
    const d = daysOut(j);
    if (d == null) return <Badge variant="muted">no date</Badge>;
    if (d > 30) return <Badge variant="danger">expired · {d}d</Badge>;
    if (d > 21) return <Badge variant="warning">{30 - d}d left</Badge>;
    if (d > 14) return <Badge variant="warning">{d}d out — check in</Badge>;
    return <Badge>{d}d out</Badge>;
  }

  function hubRow(j: any) {
    const l = links[j.id];
    if (!l) return (
      <Button variant="outline" className="mt-3 w-full border-dashed" onClick={() => setEditing({ job: j })}>
        <Link2 size={15} /> Create client link
      </Button>
    );
    const variant = l.status === "approved" ? "success" : l.status === "declined" ? "muted" : l.view_count > 0 ? "default" : "muted";
    const label = l.status === "approved" ? `Approved by ${l.approved_by ?? "client"}`
      : l.status === "declined" ? "Declined online"
      : l.view_count > 0 ? `Opened ${l.view_count}×${l.viewed_at ? " · last " + new Date(l.viewed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}`
      : "Link sent — not opened yet";
    return (
      <div className="mt-3 space-y-2">
        <Badge variant={variant as any} className="whitespace-normal">
          {l.status === "approved" ? <Check size={12} /> : l.view_count > 0 ? <Eye size={12} /> : <Link2 size={12} />}
          {label}
        </Badge>
        <div className="grid grid-cols-3 gap-2">
          <Button asChild variant="outline" size="sm" className="h-10">
            <a href={`/p/${l.token}`} target="_blank" rel="noopener noreferrer"><Eye size={14} /> View</a>
          </Button>
          <Button variant="outline" size="sm" className="h-10" onClick={() => copy(l.token)}><Copy size={14} /> Copy link</Button>
          <Button variant="outline" size="sm" className="h-10" onClick={() => setEditing({ job: j, link: l })}><Pencil size={14} /> Edit</Button>
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
        sub="Out for signature, signed and declined — with the client sign links"
        actions={<Button asChild variant="outline"><Link href="/build"><Plus size={16} /> New proposal</Link></Button>}
        className="mb-0"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Out now" value={String(sent.length)} />
        <Stat label="Value out" value={fmt$(outTotal)} />
        <Stat label="Opened" value={String(viewedCount)} hint={sent.length ? `of ${sent.length} out` : undefined} />
        <Stat label="Expiring" value={String(expiring + expired)} tone={expiring + expired ? "warn" : undefined} hint={expired ? `${expired} past 30 days` : undefined} />
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

      <p className="text-xs text-neutral-500">New client links expire after the number of days set in Settings (30 unless you change it). A client link lets them read the scope, approve it, and sign right on their phone — you see the moment they open it.</p>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        {editing ? (
          <LinkEditor key={editing.link?.id ?? editing.job.id} supabase={supabase} job={editing.job} link={editing.link}
            onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} newToken={newToken} />
        ) : null}
      </Dialog>
    </div>
  );
}

function LinkEditor({ supabase, job, link, onClose, onSaved, newToken }: any) {
  const price = link?.price ?? parsePrice(job.price);
  const [f, setF] = useState({
    title: link?.title ?? job.job_name ?? "",
    intro: link?.intro ?? "",
    scope: link?.scope ?? job.scope_of_work ?? "",
    price: String(price || ""),
    deposit_pct: String(link?.deposit_pct ?? 33),
    pay_url: link?.pay_url ?? "",
    expires_at: link?.expires_at ?? daysFromToday(DEFAULT_VALID_DAYS),
  });
  const [busy, setBusy] = useState(false);
  // New link: expiry defaults to the validity set in Settings (unless already edited).
  useEffect(() => {
    if (link) return;
    const first = daysFromToday(DEFAULT_VALID_DAYS);
    getProposalValidDays().then((d) => setF((s) => (s.expires_at === first ? { ...s, expires_at: daysFromToday(d) } : s)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    const p = Number(f.price) || null;
    const pct = Number(f.deposit_pct) || null;
    const row: any = {
      job_id: job.id,
      title: f.title || null,
      intro: f.intro || null,
      scope: f.scope || null,
      price: p,
      deposit_pct: pct,
      deposit_amount: p && pct ? Math.round(((p * pct) / 100) * 100) / 100 : null,
      pay_url: f.pay_url || null,
      expires_at: f.expires_at || null,
    };
    let error;
    if (link) ({ error } = await supabase.from("proposal_links").update(row).eq("id", link.id));
    else ({ error } = await supabase.from("proposal_links").insert({ ...row, token: newToken(), terms: job.terms?.trim() || (await getPaymentTerms()) }));
    setBusy(false);
    if (error) showError("Save failed: " + error.message);
    else { showToast(link ? "Client link saved" : "Client link created"); onSaved(); }
  }

  return (
    <DialogContent wide>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <DialogHeader>
          <DialogTitle>{link ? "Edit client link" : "Create client link"}</DialogTitle>
          <DialogDescription>{jobLabel(job)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Title"><Input value={f.title} onChange={set("title")} placeholder="e.g. 148 West River St — Concrete Replacement" /></Field>
          <Field label="Opening note (optional)"><Textarea value={f.intro} onChange={set("intro")} rows={2} placeholder="Thanks for having us out. Here's what we'd do…" /></Field>
          <Field label="Work included — one line per item"><Textarea value={f.scope} onChange={set("scope")} rows={6} placeholder={"Saw cut and remove existing slab\nBase prep and compaction\nPour 4in 3500psi concrete, broom finish"} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Price"><Input value={f.price} onChange={set("price")} inputMode="decimal" /></Field>
            <Field label="Deposit %"><Input value={f.deposit_pct} onChange={set("deposit_pct")} inputMode="numeric" /></Field>
            <Field label="Expires"><Input type="date" value={f.expires_at} onChange={set("expires_at")} /></Field>
          </div>
          <Field label="Deposit payment link (optional — paste a QuickBooks payment link)">
            <Input value={f.pay_url} onChange={set("pay_url")} placeholder="https://…" />
          </Field>
          <p className="text-xs text-neutral-500">Nothing here shows your costs — the client sees the scope, the total, and the deposit only.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : link ? "Save changes" : "Create link"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
