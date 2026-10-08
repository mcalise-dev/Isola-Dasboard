"use client";
// v4.9 "job is the hub": Money, Proposal and Docs tabs on the job record, so the
// payments, change orders, builds, client links, compliance docs and daily logs
// for one job are reachable without leaving it. Full editing still lives on
// /billing, /build, /proposals, /docs and /log — these panels link there.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, parsePrice, todayISO } from "@/lib/format";
import { withTimeout, firstError } from "@/lib/load";
import { showError, showToast, undoable } from "@/components/Toaster";
import { copyText } from "@/components/Dialogs";
import MoneyInput from "@/components/MoneyInput";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect, Field } from "@/components/ui/input";
import { Empty, ListSkeleton, LoadError, Progress, SectionTitle, Stat } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { Check, Copy, Eye, ExternalLink, FileText, Hammer, Link2, NotebookPen, Plus, Trash2, X } from "lucide-react";

const fmt2 = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const errMsg = (e: any) => (e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

// MoneyInput takes a class string; match the Input primitive (same as BillingTab).
const inp =
  "w-full h-10 rounded-lg border border-input bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/30";

// Same stages and draw percentages as BillingTab.
const STAGES = [
  { key: "deposit", label: "Deposit", pct: 33 },
  { key: "midpoint", label: "Midpoint", pct: 33 },
  { key: "balance", label: "Balance", pct: 34 },
  { key: "retainage", label: "Retainage", pct: 0 },
  { key: "other", label: "Other", pct: 0 },
];

const changed = () => window.dispatchEvent(new Event("isola:changed"));

/* ============================================================
   MONEY — contract, approved change orders, payments, balance.
   Only APPROVED change orders move the contract (business rule,
   same as job_financials / BillingTab).
   ============================================================ */
export function MoneyPanel({ job }: { job: any }) {
  const sb = useMemo(() => createClient(), []);
  const [payments, setPayments] = useState<any[] | null>(null);
  const [cos, setCos] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [addPay, setAddPay] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr(null);
    try {
      const [p, c] = await withTimeout(Promise.all([
        sb.from("payments").select("*").eq("job_id", job.id).order("payment_date"),
        sb.from("change_orders").select("*").eq("job_id", job.id).order("co_number"),
      ]));
      const e = firstError(p, c);
      if (e) throw new Error(e);
      setPayments(p.data ?? []);
      setCos(c.data ?? []);
    } catch (e: any) { setErr(errMsg(e)); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [job.id]);

  async function savePayment() {
    if (!addPay.amount) return showError("Enter an amount.");
    setBusy(true);
    const { error } = await sb.from("payments").insert({
      job_id: job.id,
      payment_date: addPay.payment_date || todayISO(),
      amount: Number(addPay.amount),
      stage: addPay.stage || "other",
      method: addPay.method || null,
      reference: addPay.reference || null,
      notes: addPay.notes || null,
    });
    setBusy(false);
    if (error) return showError("Save failed: " + error.message);
    showToast("Payment recorded");
    setAddPay(null); load(); changed();
  }
  function delPayment(id: string) {
    const prev = payments ?? [];
    undoable({
      text: "Payment deleted",
      hide: () => setPayments(prev.filter((p) => p.id !== id)),
      restore: () => setPayments(prev),
      commit: async () => {
        const r = await sb.from("payments").delete().eq("id", id);
        if (!r.error) { load(); changed(); }
        return r;
      },
    });
  }

  if (err) return <LoadError message={err} onRetry={load} />;
  if (!payments) return <ListSkeleton />;

  const base = Number(job.price_amount) || parsePrice(job.price);
  const coApproved = cos.filter((c) => c.status === "approved").reduce((s, c) => s + Number(c.amount || 0), 0);
  const coOpen = cos.filter((c) => c.status === "draft" || c.status === "sent");
  const contract = base + coApproved;
  const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const owed = contract - paid;
  const pctPaid = contract > 0 ? Math.min(100, (paid / contract) * 100) : 0;
  const paidByStage = (k: string) => payments.filter((p) => p.stage === k).reduce((s, p) => s + Number(p.amount || 0), 0);
  const billingHref = `/billing?job=${job.id}`;

  const row = (l: React.ReactNode, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 text-sm"><span className="text-neutral-400">{l}</span><span className="tabular-nums text-neutral-200">{v}</span></div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Contract" value={fmt0(contract)} hint={coApproved > 0 ? `incl. ${fmt0(coApproved)} COs` : undefined} />
        <Stat label="Paid" value={fmt0(paid)} tone={paid > 0 ? "ok" : undefined} />
        <Stat label="Balance" value={fmt0(owed)} tone={owed > 0.005 ? "warn" : contract > 0 ? "ok" : undefined} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Contract</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {row("Contract price", base ? fmt2(base) : <span className="text-neutral-500">not set</span>)}
              {coApproved > 0 ? row("Approved change orders", <span className="text-emerald-300">+{fmt2(coApproved)}</span>) : null}
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-sm font-semibold text-white">Contract total</span>
                <span className="text-lg font-semibold tabular-nums text-white">{fmt2(contract)}</span>
              </div>
              {row("Paid to date", <span className="text-emerald-300">{fmt2(paid)}</span>)}
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-white">Balance left</span>
                <span className={cn("font-semibold tabular-nums", owed > 0.005 ? "text-amber-300" : "text-emerald-300")}>{fmt2(owed)}</span>
              </div>
              <Progress value={pctPaid} tone="ok" className="h-2" />
              <p className="text-xs text-neutral-500">{Math.round(pctPaid)}% collected</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Draw schedule: 33 / 33 / balance</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {STAGES.slice(0, 3).map((s) => {
                const due = contract * (s.pct / 100);
                const got = paidByStage(s.key);
                const done = got >= due - 0.01 && due > 0;
                return (
                  <div key={s.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className={cn("flex items-center gap-2", done ? "text-emerald-300" : "text-neutral-400")}>
                      <span className={cn("flex h-4 w-4 items-center justify-center rounded border", done ? "border-emerald-500 bg-emerald-500 text-black" : "border-neutral-600")}>{done ? <Check size={12} strokeWidth={3} /> : null}</span>
                      {s.label} <span className="text-neutral-500">({s.pct}%)</span>
                    </span>
                    <span className="tabular-nums text-neutral-300">{fmt0(got)} <span className="text-neutral-500">of {fmt0(due)}</span></span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Button asChild variant="outline" className="h-10 w-full">
            <Link href={billingHref}><ExternalLink size={15} /> Open full billing</Link>
          </Button>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payments ({payments.length})</CardTitle>
              {!addPay ? (
                <Button variant="outline" size="sm" className="ml-auto h-9" onClick={() => setAddPay({ payment_date: todayISO(), stage: payments.length === 0 ? "deposit" : payments.length === 1 ? "midpoint" : "balance", amount: "" })}>
                  <Plus size={14} /> Add payment
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-2">
              {addPay ? (
                <div className="space-y-3 rounded-lg border border-border bg-neutral-950 p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Date"><Input type="date" value={addPay.payment_date} onChange={(e) => setAddPay({ ...addPay, payment_date: e.target.value })} /></Field>
                    <Field label="Amount"><MoneyInput className={inp} value={addPay.amount} onChange={(v) => setAddPay({ ...addPay, amount: v })} autoFocus /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Stage">
                      <NativeSelect value={addPay.stage} onChange={(e) => setAddPay({ ...addPay, stage: e.target.value })}>
                        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </NativeSelect>
                    </Field>
                    <Field label="Method">
                      <Input list="hub-pay-methods" value={addPay.method ?? ""} onChange={(e) => setAddPay({ ...addPay, method: e.target.value })} />
                      <datalist id="hub-pay-methods"><option value="check" /><option value="ach" /><option value="card" /><option value="cash" /></datalist>
                    </Field>
                  </div>
                  <Field label="Reference: check no. / invoice"><Input value={addPay.reference ?? ""} onChange={(e) => setAddPay({ ...addPay, reference: e.target.value })} /></Field>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="outline" onClick={() => setAddPay(null)}><X size={15} /> Cancel</Button>
                    <Button onClick={savePayment} disabled={busy}>{busy ? "Saving…" : "Record payment"}</Button>
                  </div>
                </div>
              ) : null}

              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-neutral-950 py-1.5 pl-3 pr-1">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <span className="tabular-nums">{fmt2(Number(p.amount))}</span>
                      <Badge variant="muted">{STAGES.find((s) => s.key === p.stage)?.label ?? p.stage}</Badge>
                    </div>
                    <div className="truncate text-xs text-neutral-400">{fmtDate(p.payment_date)}{p.method ? ` · ${p.method}` : ""}{p.reference ? ` · ${p.reference}` : ""}</div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Delete payment" className="shrink-0 text-neutral-500 hover:text-red-300" onClick={() => delPayment(p.id)}><Trash2 size={16} /></Button>
                </div>
              ))}
              {payments.length === 0 && !addPay ? <p className="text-sm text-neutral-500">No payments recorded yet.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change orders ({cos.length})</CardTitle>
              {coOpen.length ? <Badge variant="warning" className="ml-auto">{coOpen.length} pending</Badge> : null}
            </CardHeader>
            <CardContent className="space-y-2">
              {cos.map((c) => {
                const tone = c.status === "approved" ? "success" : c.status === "declined" ? "danger" : c.status === "sent" ? "warning" : "muted";
                return (
                  <div key={c.id} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-neutral-950 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">CO #{c.co_number}: {c.title || "Untitled"}</div>
                      <div className="text-xs text-neutral-400"><span className="tabular-nums">{fmt2(Number(c.amount))}</span>{c.reason ? ` · ${c.reason}` : ""}</div>
                    </div>
                    <Badge variant={tone as any} className="shrink-0 capitalize">{c.status}</Badge>
                  </div>
                );
              })}
              {cos.length === 0 ? <p className="text-sm text-neutral-500">None. Only approved change orders raise the contract total.</p> : null}
              <Button asChild variant="ghost" size="sm" className="h-10 w-full">
                <Link href={billingHref}>{cos.length ? "Edit change orders in billing" : "New change order in billing"}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PROPOSAL — builds (estimates) and client proposal links.
   BuildTab has no deep link to one build, so "Open" goes to /build.
   ============================================================ */
function estBadge(e: any) {
  if (e.status === "won") return <Badge variant="success">won</Badge>;
  if (e.status === "lost") return <Badge variant="danger">lost</Badge>;
  if (e.status !== "draft") return <Badge>{e.status}</Badge>;
  return <Badge variant="muted">{e.step || "draft"}</Badge>;
}
function linkBadge(l: any) {
  const expired = l.status === "expired" || (l.status !== "approved" && l.status !== "declined" && l.expires_at && String(l.expires_at).slice(0, 10) < todayISO());
  if (l.status === "approved") return <Badge variant="success"><Check size={12} /> Approved{l.approved_by ? ` by ${l.approved_by}` : ""}</Badge>;
  if (l.status === "declined") return <Badge variant="danger">Declined</Badge>;
  if (expired) return <Badge variant="danger">Expired</Badge>;
  if (l.status === "viewed" || Number(l.view_count) > 0) return <Badge><Eye size={12} /> Viewed</Badge>;
  return <Badge variant="muted"><Link2 size={12} /> Sent, not opened</Badge>;
}

export function ProposalPanel({ jobId }: { jobId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [ests, setEsts] = useState<any[] | null>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const [e, l] = await withTimeout(Promise.all([
        sb.from("estimates").select("*").eq("job_id", jobId).order("created_at", { ascending: false }),
        sb.from("proposal_links").select("*").eq("job_id", jobId).order("created_at", { ascending: false }),
      ]));
      const fe = firstError(e, l);
      if (fe) throw new Error(fe);
      setEsts(e.data ?? []);
      setLinks(l.data ?? []);
    } catch (e: any) { setErr(errMsg(e)); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);

  if (err) return <LoadError message={err} onRetry={load} />;
  if (!ests) return <ListSkeleton />;
  if (ests.length === 0 && links.length === 0) return (
    <Empty icon={<Hammer size={28} />} title="No build or proposal yet"
      body="Price it in Build. Sending it from there creates the client link that shows up here."
      action={<Button asChild><Link href="/build"><Hammer size={15} /> Start a build</Link></Button>} />
  );

  const url = (t: string) => `${window.location.origin}/p/${t}`;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section>
        <SectionTitle right={<Button asChild variant="ghost" size="sm" className="h-9"><Link href="/build">Open Build</Link></Button>}>Builds ({ests.length})</SectionTitle>
        <div className="space-y-2">
          {ests.map((e) => {
            const sell = Number(e.sell_price || 0), cost = Number(e.cost_total || 0);
            const m = sell > 0 && cost > 0 ? Math.round(((sell - cost) / sell) * 100) : null;
            return (
              <Link key={e.id} href="/build" className="block rounded-xl border border-border bg-card px-4 py-3 hover:border-white/20">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 truncate font-semibold text-white">{e.title || "Untitled build"}</div>
                  <div className="shrink-0">{estBadge(e)}</div>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-400">
                  <span>Sell <span className="tabular-nums text-neutral-200">{sell ? fmt0(sell) : "—"}</span></span>
                  <span>Cost <span className="tabular-nums text-neutral-200">{cost ? fmt0(cost) : "—"}</span></span>
                  {m != null ? <span className={cn(m < 10 ? "text-red-300" : m < 30 ? "text-amber-300" : "text-emerald-300")}>{m}% margin</span> : null}
                  <span>{e.sent_at ? `Sent ${shortDate(e.sent_at)}` : "Not sent"}</span>
                </div>
              </Link>
            );
          })}
          {ests.length === 0 ? <p className="text-sm text-neutral-500">No build linked to this job. <Link href="/build" className="underline hover:text-white">Start one</Link></p> : null}
        </div>
      </section>

      <section>
        <SectionTitle right={<Button asChild variant="ghost" size="sm" className="h-9"><Link href="/proposals">All proposals</Link></Button>}>Client links ({links.length})</SectionTitle>
        <div className="space-y-2">
          {links.map((l) => (
            <Card key={l.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-1.5">{linkBadge(l)}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-400">
                <span>Opened {Number(l.view_count || 0)}×{l.viewed_at ? `, last ${shortDate(l.viewed_at)}` : ""}</span>
                {l.approved_at ? <span className="text-emerald-300">Approved {shortDate(l.approved_at)}</span> : null}
                {l.expires_at ? <span>Expires {fmtDate(String(l.expires_at).slice(0, 10))}</span> : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="h-10" onClick={() => copyText(url(l.token), "Link copied")}><Copy size={14} /> Copy link</Button>
                <Button asChild variant="outline" size="sm" className="h-10">
                  <a href={`/p/${l.token}`} target="_blank" rel="noopener noreferrer"><Eye size={14} /> View</a>
                </Button>
              </div>
            </Card>
          ))}
          {links.length === 0 ? <p className="text-sm text-neutral-500">No client link yet. Sending a build creates one.</p> : null}
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   DOCS — this job's compliance documents + recent daily logs.
   Never select file_b64 in the list; fetch it per document on View.
   ============================================================ */
const DOC_LABEL: Record<string, string> = {
  coi: "Insurance (COI)", lien_waiver: "Lien waiver", permit: "Permit", contract: "Signed contract",
  w9: "W-9", warranty: "Warranty", license: "License", other: "Other",
};

function expiryBadge(expires: string | null | undefined) {
  if (!expires) return null;
  const days = Math.floor((new Date(expires).getTime() - Date.now()) / 86400000);
  if (days < 0) return <Badge variant="danger">Expired</Badge>;
  if (days <= 60) return <Badge variant="warning">{days}d left</Badge>;
  return null;
}

export function DocsPanel({ jobId }: { jobId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [docs, setDocs] = useState<any[] | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const [d, l] = await withTimeout(Promise.all([
        sb.from("documents").select("id,doc_type,title,issuer,reference,issued_on,expires_at,mime_type,created_at")
          .eq("job_id", jobId).order("created_at", { ascending: false }),
        sb.from("daily_logs").select("*").eq("job_id", jobId).order("log_date", { ascending: false }).limit(10),
      ]));
      const e = firstError(d, l);
      if (e) throw new Error(e);
      setDocs(d.data ?? []);
      setLogs(l.data ?? []);
    } catch (e: any) { setErr(errMsg(e)); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);

  async function view(d: any) {
    // open the window inside the tap so the pop-up blocker allows it, then fill it
    const w = window.open();
    if (!w) return showError("Allow pop-ups to view the file.");
    const { data, error } = await sb.from("documents").select("file_b64,mime_type").eq("id", d.id).maybeSingle();
    if (error) { w.close(); return showError("Couldn't load the file: " + error.message); }
    if (!data?.file_b64) { w.close(); return showError("No file attached to this record."); }
    w.document.write(
      data.mime_type?.startsWith("image/")
        ? `<img src="${data.file_b64}" style="max-width:100%">`
        : `<iframe src="${data.file_b64}" style="border:0;width:100%;height:100vh"></iframe>`
    );
  }

  if (err) return <LoadError message={err} onRetry={load} />;
  if (!docs) return <ListSkeleton />;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section>
        <SectionTitle right={<Button asChild variant="outline" size="sm" className="h-9"><Link href="/docs"><Plus size={14} /> Add document</Link></Button>}>Documents ({docs.length})</SectionTitle>
        {docs.length === 0 ? (
          <Empty icon={<FileText size={24} />} title="No documents on this job" body="COIs, permits, lien waivers and the signed contract. Add them in Docs and pick this job." />
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-xl border border-border bg-card py-2 pl-4 pr-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-semibold text-white">{d.title || DOC_LABEL[d.doc_type] || "Document"}</span>
                    {expiryBadge(d.expires_at)}
                  </div>
                  <div className="truncate text-xs text-neutral-400">
                    {[DOC_LABEL[d.doc_type] ?? d.doc_type, d.issuer, d.reference].filter(Boolean).join(" · ")}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {d.issued_on ? `Issued ${fmtDate(d.issued_on)}` : ""}{d.expires_at ? `${d.issued_on ? " · " : ""}Expires ${fmtDate(String(d.expires_at).slice(0, 10))}` : ""}
                  </div>
                </div>
                {d.mime_type ? <Button variant="outline" size="sm" className="h-10 shrink-0" onClick={() => view(d)}><Eye size={14} /> View</Button> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle right={<Button asChild variant="ghost" size="sm" className="h-9"><Link href="/log">Daily log</Link></Button>}>Daily logs</SectionTitle>
        {logs.length === 0 ? (
          <Empty icon={<NotebookPen size={24} />} title="No daily logs yet" body="Log weather, crew and work done each day on site." action={<Button asChild variant="outline"><Link href="/log">Write today&apos;s log</Link></Button>} />
        ) : (
          <div className="space-y-2">
            {logs.map((l) => (
              <Card key={l.id} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-white">{fmtDate(l.log_date)}</span>
                  <span className="text-xs text-neutral-400">
                    {[l.weather, l.temp_f != null && l.temp_f !== "" ? `${l.temp_f}°F` : null, l.hours_on_site ? `${l.hours_on_site} hrs` : null].filter(Boolean).join(" · ")}
                  </span>
                </div>
                {Array.isArray(l.crew) && l.crew.length ? <div className="mt-0.5 text-xs text-neutral-400">Crew: {l.crew.join(", ")}</div> : null}
                {l.work_performed ? <p className="mt-1.5 whitespace-pre-wrap text-sm text-neutral-300">{l.work_performed}</p> : null}
                {l.delays ? <p className="mt-1 text-sm text-amber-300">Delays: {l.delays}</p> : null}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

