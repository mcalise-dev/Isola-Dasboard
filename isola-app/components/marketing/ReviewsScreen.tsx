"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Star, Mail, Check, Handshake, Plus, X, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { reviewRequest, mailto } from "@/lib/emails";
import { todayISO } from "@/lib/format";
import { PageHeader, Skeleton, Empty, SectionTitle } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { showToast, undoable } from "@/components/Toaster";
import { cn } from "@/lib/utils";
import { shortDate, rel, jobPrice, norm, changed, validEmail } from "./lib";

const WON = ["booked", "progress", "complete"];
const usd0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const SIGN = "Thanks,\nMike Calise\nIsola LLC\n508-933-2661";

type Partner = { key: string; kind: "customer" | "contact"; id: string; name: string; sub: string; email: string | null; contactName: string | null; match: string[] };

export default function ReviewsScreen() {
  const sb = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [cc, setCc] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [reviewUrl, setReviewUrl] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [pickOpen, setPickOpen] = useState(false);
  const [showAllAsked, setShowAllAsked] = useState(false);

  useEffect(() => {
    (async () => {
      const [j, cu, c2, ct, rs] = await Promise.all([
        sb.from("jobs").select("id,job_name,customer,customer_id,status,price,price_amount,completed_date,invoiced_date,paid_date,review_requested_at,contact_name,referred_by,lead_source,created_at"),
        sb.from("customers").select("id,name,contact_name,email,qbo_names,referral_partner,client_type,archived"),
        sb.from("customer_contacts").select("customer_id,name,email,is_billing,sort"),
        sb.from("contacts").select("id,name,company,email,referral_partner,tier"),
        sb.from("app_settings").select("value").eq("key", "google_review_url").maybeSingle(),
      ]);
      setJobs(j.data ?? []);
      setCustomers(cu.data ?? []);
      setCc(c2.data ?? []);
      setContacts(ct.data ?? []);
      setReviewUrl((rs.data as any)?.value ?? "");
      setLoading(false);
    })();
  }, [sb]);

  const custById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  function emailFor(customerId?: string | null, customerName?: string | null) {
    let c = customerId ? custById[customerId] : null;
    if (!c && customerName) {
      const n = norm(customerName);
      c = customers.find((x) => norm(x.name) === n || (x.qbo_names ?? []).some((q: string) => norm(q) === n)) ?? null;
    }
    if (!c) return { to: null as string | null, name: null as string | null };
    const cs = cc.filter((x) => x.customer_id === c.id && x.email);
    const billing = cs.find((x) => x.is_billing) ?? null;
    if (billing) return { to: billing.email, name: billing.name };
    if (c.email) return { to: c.email, name: c.contact_name };
    if (cs[0]) return { to: cs[0].email, name: cs[0].name };
    return { to: null, name: c.contact_name };
  }

  async function saveUrl() {
    const v = urlDraft.trim();
    if (!/^https?:\/\//i.test(v)) { showToast("Paste the full link — it starts with https://"); return; }
    const { error } = await sb.from("app_settings").upsert({ key: "google_review_url", value: v, updated_at: new Date().toISOString() });
    if (error) { alert("Save failed: " + error.message); return; }
    setReviewUrl(v); setUrlDraft(""); showToast("Review link saved");
  }

  const toAsk = jobs.filter((j) => j.status === "complete" && (j.paid_date || j.invoiced_date) && !j.review_requested_at)
    .sort((a, b) => String(b.completed_date ?? b.paid_date ?? "").localeCompare(String(a.completed_date ?? a.paid_date ?? "")));
  const asked = jobs.filter((j) => j.review_requested_at).sort((a, b) => String(b.review_requested_at).localeCompare(String(a.review_requested_at)));

  function markAsked(j: any) {
    const today = todayISO();
    undoable({
      text: `Marked asked: ${j.job_name || j.customer}`,
      hide: () => setJobs((js) => js.map((x) => (x.id === j.id ? { ...x, review_requested_at: today } : x))),
      restore: () => setJobs((js) => js.map((x) => (x.id === j.id ? { ...x, review_requested_at: null } : x))),
      commit: async () => { const { error } = await sb.from("jobs").update({ review_requested_at: today }).eq("id", j.id); if (error) throw error; changed(); },
    });
  }
  async function unAsk(j: any) {
    setJobs((js) => js.map((x) => (x.id === j.id ? { ...x, review_requested_at: null } : x)));
    const { error } = await sb.from("jobs").update({ review_requested_at: null }).eq("id", j.id);
    if (error) { alert("Save failed: " + error.message); return; }
    changed(); showToast("Moved back to ask list");
  }

  // referral partners
  const partners: Partner[] = useMemo(() => [
    ...customers.filter((c) => c.referral_partner).map((c) => {
      const who = emailFor(c.id, c.name);
      return { key: "cu:" + c.id, kind: "customer" as const, id: c.id, name: c.name, sub: "Customer", email: who.to, contactName: who.name ?? c.contact_name, match: [c.name, c.contact_name, ...(c.qbo_names ?? [])].map(norm).filter(Boolean) };
    }),
    ...contacts.filter((c) => c.referral_partner).map((c) => ({ key: "ct:" + c.id, kind: "contact" as const, id: c.id, name: c.name, sub: c.company ?? "Contact", email: validEmail(c.email) ? c.email : null, contactName: c.name, match: [c.name, c.company].map(norm).filter(Boolean) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [customers, contacts, cc]);
  const referred = jobs.filter((j) => norm(j.referred_by));
  const partnerRows = partners.map((p) => {
    const js = referred.filter((j) => p.match.includes(norm(j.referred_by)));
    return { p, jobs: js, won: js.filter((j) => WON.includes(j.status)).reduce((a, j) => a + jobPrice(j), 0) };
  }).sort((a, b) => b.won - a.won || b.jobs.length - a.jobs.length || a.p.name.localeCompare(b.p.name));
  const unmatched = (() => {
    const m = new Map<string, { name: string; n: number }>();
    referred.filter((j) => !partners.some((p) => p.match.includes(norm(j.referred_by)))).forEach((j) => {
      const k = norm(j.referred_by); const r = m.get(k) ?? { name: j.referred_by.trim(), n: 0 }; r.n++; m.set(k, r);
    });
    return [...m.values()];
  })();

  async function setPartner(kind: "customer" | "contact", id: string, on: boolean) {
    const table = kind === "customer" ? "customers" : "contacts";
    if (kind === "customer") setCustomers((cs) => cs.map((c) => (c.id === id ? { ...c, referral_partner: on } : c)));
    else setContacts((cs) => cs.map((c) => (c.id === id ? { ...c, referral_partner: on } : c)));
    const { error } = await sb.from(table).update({ referral_partner: on }).eq("id", id);
    if (error) { alert("Save failed: " + error.message); return; }
    changed();
    showToast(on ? "Added as referral partner" : "Removed from partners");
  }

  function thankYou(p: Partner, js: any[]) {
    const fn = (p.contactName ?? p.name).trim().split(/\s+/)[0] || "there";
    const last = js[0];
    const body = `Hi ${fn},\n\n${last ? `Thanks for sending ${last.customer} our way${last.job_name ? ` for ${last.job_name}` : ""}.` : "Thanks for thinking of us and passing our name along."} Referrals are how a small outfit like ours grows, and I don't take them for granted.\n\nIf anything comes up on your end — concrete, masonry, drainage, asphalt — call me directly and I'll make it a priority.\n\n${SIGN}`;
    return mailto(p.email, { subject: "Thank you for the referral", body });
  }

  if (loading) return <div><PageHeader title="Reviews & referrals" /><div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div></div>;

  return (
    <div>
      <PageHeader title="Reviews & referrals" sub="Turn finished jobs into reviews, and keep the people who send you work close." />
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="min-w-0 space-y-6">
          <section>
            <SectionTitle right={<span className="text-xs text-neutral-500">{toAsk.length} to ask</span>}>Ask for reviews</SectionTitle>
            {!reviewUrl ? (
              <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
                <p className="mb-2 text-xs text-amber-200">Paste your Google review link once and every request includes it. (Google Business Profile → Ask for reviews → copy link)</p>
                <div className="flex gap-2">
                  <Input value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder="https://g.page/r/…/review" />
                  <Button variant="outline" onClick={saveUrl}>Save</Button>
                </div>
              </div>
            ) : null}
            {toAsk.length === 0 ? <Empty icon={<Star size={20} />} title="All caught up" body="Completed, invoiced jobs show up here until you ask the customer for a review." /> : (
              <div className="divide-y divide-border rounded-xl border border-border bg-card">
                {toAsk.map((j, i) => {
                  const who = emailFor(j.customer_id, j.customer);
                  const e = reviewRequest({ contact: who.name ?? j.contact_name, job: j.job_name || j.customer, url: reviewUrl || null });
                  return (
                    <div key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/jobs/${j.id}`} className="block truncate text-sm font-semibold text-white hover:underline">{j.job_name || j.customer}</Link>
                        <div className="truncate text-xs text-neutral-400">{j.customer} · done {shortDate(j.completed_date ?? j.paid_date)}{j.paid_date ? " · paid" : " · invoiced"}{!who.to ? " · no email on file" : ""}</div>
                      </div>
                      <div className="flex gap-2">
                        <Button asChild size="sm" variant={i === 0 ? "default" : "outline"}><a href={mailto(who.to, e)}><Mail size={14} />Draft request</a></Button>
                        <Button size="sm" variant="ghost" onClick={() => markAsked(j)}><Check size={14} />Mark asked</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-neutral-500">Draft request opens an email in your mail app. Nothing sends until you hit send.</p>
          </section>

          <section>
            <SectionTitle right={<span className="text-xs text-neutral-500">{asked.length}</span>}>Asked</SectionTitle>
            {asked.length === 0 ? <p className="text-sm text-neutral-500">No review requests yet.</p> : (
              <div className="divide-y divide-border rounded-xl border border-border bg-card">
                {(showAllAsked ? asked : asked.slice(0, 6)).map((j) => (
                  <div key={j.id} className="flex min-h-[48px] items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-white">{j.job_name || j.customer}</div>
                      <div className="truncate text-xs text-neutral-500">{j.customer}</div>
                    </div>
                    <span className="shrink-0 text-xs text-neutral-400">Asked {rel(j.review_requested_at)}</span>
                    <Button variant="ghost" size="icon-sm" aria-label="Move back to ask list" onClick={() => unAsk(j)}><X size={14} /></Button>
                  </div>
                ))}
                {asked.length > 6 ? <button onClick={() => setShowAllAsked((v) => !v)} className="w-full px-3 py-2 text-left text-xs text-neutral-400 hover:text-white">{showAllAsked ? "Show fewer" : `Show all ${asked.length}`}</button> : null}
              </div>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <section>
            <SectionTitle right={<Button variant="outline" size="sm" onClick={() => setPickOpen(true)}><Plus size={14} />Add partner</Button>}>Referral partners</SectionTitle>
            {partnerRows.length === 0 ? (
              <Empty icon={<Handshake size={20} />} title="No referral partners yet" body="Flag the customers, managers and trades who send you work. Set Referred by on jobs to see what each one brings in."
                action={<Button variant="outline" onClick={() => setPickOpen(true)}>Add a partner</Button>} />
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-card">
                {partnerRows.map(({ p, jobs: js, won }) => (
                  <div key={p.key} className="px-3 py-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">{p.kind === "customer" ? <Link href={`/customers/${p.id}`} className="hover:underline">{p.name}</Link> : <Link href={`/marketing/targets?c=${p.id}`} className="hover:underline">{p.name}</Link>}</div>
                        <div className="text-xs text-neutral-400">{p.sub} · {js.length} referred job{js.length === 1 ? "" : "s"}</div>
                      </div>
                      <div className={cn("shrink-0 text-right text-sm font-semibold tabular-nums", won ? "text-emerald-300" : "text-neutral-500")}>{usd0(won)}</div>
                    </div>
                    {js.length ? <div className="mt-1.5 flex flex-wrap gap-1">{js.slice(0, 4).map((j) => <Link key={j.id} href={`/jobs/${j.id}`}><Badge variant={WON.includes(j.status) ? "success" : "muted"}>{j.job_name || j.customer}</Badge></Link>)}{js.length > 4 ? <Badge variant="muted">+{js.length - 4}</Badge> : null}</div> : null}
                    <div className="mt-2 flex gap-2">
                      <Button asChild size="sm" variant="outline"><a href={thankYou(p, js)}><Mail size={14} />Thank you</a></Button>
                      <Button size="sm" variant="ghost" onClick={() => setPartner(p.kind, p.id, false)}>Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {unmatched.length ? (
              <div className="mt-3 rounded-xl bg-white/[0.04] p-3">
                <p className="mb-1.5 text-xs font-semibold text-neutral-300">Referred jobs from people not flagged as partners</p>
                <div className="flex flex-wrap gap-1.5">{unmatched.map((u) => <Badge key={u.name} variant="default">{u.name} · {u.n}</Badge>)}</div>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold text-white">Weekly marketing rhythm</h3>
            <ul className="space-y-2 text-sm">
              {[
                ["Monday", "Set follow-up dates on every A-tier target and clear Due today."],
                ["Tue – Thu", "Two outreach blocks a day: work the Outreach queue, one walk-through ask."],
                ["Friday", "Ask for reviews on finished jobs and thank anyone who referred work."],
              ].map(([d, t]) => (
                <li key={d} className="flex gap-3"><span className="w-20 shrink-0 font-semibold text-neutral-200">{d}</span><span className="text-neutral-400">{t}</span></li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <PartnerPicker open={pickOpen} onOpenChange={setPickOpen}
        options={[
          ...customers.filter((c) => !c.archived && !c.referral_partner).map((c) => ({ kind: "customer" as const, id: c.id, name: c.name, sub: "Customer" })),
          ...contacts.filter((c) => !c.referral_partner).map((c) => ({ kind: "contact" as const, id: c.id, name: c.name, sub: c.company ?? "Contact" })),
        ]}
        onPick={(k, id) => setPartner(k, id, true)} />
    </div>
  );
}

function PartnerPicker({ open, onOpenChange, options, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; options: { kind: "customer" | "contact"; id: string; name: string; sub: string }[]; onPick: (k: "customer" | "contact", id: string) => void }) {
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const list = options.filter((o) => !q || [o.name, o.sub].join(" ").toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add referral partner</DialogTitle>
          <DialogDescription>Pick a customer or a target contact.</DialogDescription>
        </DialogHeader>
        <div className="relative mb-3">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers and contacts" className="pl-9" autoFocus />
        </div>
        <div className="max-h-[50vh] divide-y divide-border overflow-y-auto scroll-thin rounded-xl border border-border">
          {list.length === 0 ? <p className="p-4 text-sm text-neutral-500">No matches.</p> : list.map((o) => (
            <button key={o.kind + o.id} onClick={() => { onPick(o.kind, o.id); onOpenChange(false); }} className="flex min-h-[48px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.04]">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-white">{o.name}</span><span className="block truncate text-xs text-neutral-400">{o.sub}</span></span>
              <Badge variant="muted">{o.kind === "customer" ? "Customer" : "Contact"}</Badge>
            </button>
          ))}
        </div>
        <DialogFooter><DialogClose asChild><Button variant="outline">Done</Button></DialogClose></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
