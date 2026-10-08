"use client";
import { propose } from "@/lib/mkt";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Copy, Mail, Check, ArrowUp, ArrowDown, Trash2, Pencil, Workflow, Search, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SECTORS, TIER_ORDER } from "@/lib/crm";
import { todayISO } from "@/lib/format";
import { PageHeader, Skeleton, Empty, Stat, SectionTitle } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect, Textarea, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { showToast, showError } from "@/components/Toaster";
import { cn } from "@/lib/utils";
import {
  MContact, Campaign, Step, CHANNELS, TierBadge, SeqBar, SeqLine, stepsOf, nextStep, logTouch, fillTemplate,
  copyText, rel, dueTone, isOpen, validEmail, changed, norm,
} from "./lib";

const RESPONDED_STAGES = ["Meeting", "Walk-through", "Proposal", "Won", "Client"];
const MEETING_STAGES = ["Meeting", "Walk-through", "Proposal", "Won"];
const touchFor = (channel: string) => {
  const c = channel.split("/")[0].trim().toLowerCase();
  return c.startsWith("drop") ? "Drop-by" : c.startsWith("link") ? "LinkedIn" : c.startsWith("meet") ? "Meeting" : c.startsWith("call") ? "Call" : "Email";
};

function Inner() {
  const sb = useMemo(() => createClient(), []);
  const params = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<MContact[]>([]);
  const [acts, setActs] = useState<{ contact_id: string | null; type: string }[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [partners, setPartners] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(params.get("camp"));
  const [editOpen, setEditOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [k, c, a, j, cu] = await Promise.all([
        sb.from("campaigns").select("*").order("created_at"),
        sb.from("contacts").select("*"),
        sb.from("activities").select("contact_id,type"),
        sb.from("jobs").select("id,referred_by,lead_source"),
        sb.from("customers").select("name,referral_partner").eq("referral_partner", true),
      ]);
      const ks = (k.data as Campaign[]) ?? [];
      const cs = (c.data as MContact[]) ?? [];
      setCampaigns(ks);
      setContacts(cs);
      setActs(a.data ?? []);
      setJobs(j.data ?? []);
      setPartners([...(cu.data ?? []).map((x: any) => x.name), ...cs.filter((x) => x.referral_partner).map((x) => x.name)]);
      setSel((s) => s ?? (ks.slice().sort((x, y) => cs.filter((q) => q.campaign_id === y.id).length - cs.filter((q) => q.campaign_id === x.id).length)[0]?.id ?? null));
      setLoading(false);
    })();
  }, [sb]);

  const today = todayISO();
  const replied = useMemo(() => new Set(acts.filter((a) => /repl|respon/i.test(a.type)).map((a) => a.contact_id)), [acts]);
  const met = useMemo(() => new Set(acts.filter((a) => a.type === "Meeting").map((a) => a.contact_id)), [acts]);
  const didRespond = (c: MContact) => RESPONDED_STAGES.includes(c.stage) || replied.has(c.id) || ["Responded", "Conversation"].includes(c.li_status) || ["Responded", "Conversation"].includes(c.em_status);
  const didMeet = (c: MContact) => MEETING_STAGES.includes(c.stage) || met.has(c.id);

  const byCamp = useMemo(() => {
    const m: Record<string, MContact[]> = {};
    contacts.forEach((c) => { if (c.campaign_id) (m[c.campaign_id] ??= []).push(c); });
    return m;
  }, [contacts]);
  const dueFor = (camp: Campaign) => (byCamp[camp.id] ?? []).filter((c) => { const n = nextStep(c, stepsOf(camp)); return isOpen(c) && n && n.due && n.due <= today; });

  const enrolledAll = contacts.filter((c) => c.campaign_id && isOpen(c));
  const enrolledEver = contacts.filter((c) => c.campaign_id);
  const respRate = enrolledEver.length ? Math.round((enrolledEver.filter(didRespond).length / enrolledEver.length) * 100) + "%" : "—";
  const meetings = enrolledEver.filter(didMeet).length;
  const partnersReferring = partners.filter((p) => jobs.some((j) => norm(j.referred_by) && norm(j.referred_by) === norm(p))).length;

  const camp = campaigns.find((c) => c.id === sel) ?? null;
  const steps = stepsOf(camp);
  const enrolled = camp ? (byCamp[camp.id] ?? []).slice().sort((a, b) => (TIER_ORDER[a.tier ?? "C"] ?? 9) - (TIER_ORDER[b.tier ?? "C"] ?? 9) || a.name.localeCompare(b.name)) : [];
  const due = camp ? dueFor(camp).sort((a, b) => (nextStep(a, steps)?.due ?? "").localeCompare(nextStep(b, steps)?.due ?? "")) : [];
  // where the group is on the sequence: the most common current step
  const groupStep = enrolled.length ? Math.min(...enrolled.filter(isOpen).map((c) => c.seq_step ?? 0).concat([steps.length])) : undefined;

  const patchLocal = (id: string, p: Partial<MContact>) => setContacts((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));

  // v4.7: put the exact email into Approvals. Nothing is sent from here.
  async function queueEmail(c: MContact, subject: string, body: string, stepIdx: number) {
    if (!camp) return;
    setBusy("q" + c.id);
    const r = await propose({
      action_type: "email.send", connector: "gmail", title: `${camp.name}: step ${stepIdx + 1} to ${c.name}`,
      payload: { subject, body }, recipients: [String(c.email).trim()],
      target: { contact_id: c.id, campaign_id: camp.id, step: stepIdx + 1 }, contact_id: c.id, campaign_id: camp.id,
    });
    setBusy(null);
    showToast(r.error ? r.error : "Queued in Approvals. Nothing has been sent");
  }

  async function markDone(c: MContact) {
    const n = nextStep(c, steps);
    if (!n) return;
    setBusy(c.id);
    try {
      const p = await logTouch(sb, c, touchFor(n.step.channel), `Step ${n.idx + 1}: ${n.step.label}`, steps, true);
      patchLocal(c.id, p);
      setActs((a) => [...a, { contact_id: c.id, type: touchFor(n.step.channel) }]);
      showToast(`Step ${n.idx + 1} done for ${c.name}`);
    } catch (e: any) { showError("Could not save: " + e.message); }
    setBusy(null);
  }

  async function saveSteps(next: Step[] | null) {
    if (!camp) return;
    const { error } = await sb.from("campaigns").update({ steps: next }).eq("id", camp.id);
    if (error) { showError("Save failed: " + error.message); return; }
    setCampaigns((ks) => ks.map((k) => (k.id === camp.id ? { ...k, steps: next } : k)));
    showToast("Sequence saved");
  }

  async function enroll(ids: string[]) {
    if (!camp || !ids.length) return;
    const { error } = await sb.from("contacts").update({ campaign_id: camp.id, seq_step: 0, seq_started: today, updated_at: new Date().toISOString() }).in("id", ids);
    if (error) { showError("Enroll failed: " + error.message); return; }
    setContacts((cs) => cs.map((c) => (ids.includes(c.id) ? { ...c, campaign_id: camp.id, seq_step: 0, seq_started: today } : c)));
    changed();
    showToast(`Enrolled ${ids.length} target${ids.length === 1 ? "" : "s"}`);
  }

  if (loading) return <div><PageHeader title="Outreach" sub="Step-by-step sequences for your targets." /><div className="grid gap-3 md:grid-cols-[280px_1fr]"><Skeleton className="h-72" /><Skeleton className="h-96" /></div></div>;

  return (
    <div>
      <PageHeader title="Outreach" sub="Step-by-step sequences. Nothing sends by itself — copy the message or open a draft, send it yourself, then mark the step done."
        actions={<Button variant="outline" size="sm" asChild><Link href="/marketing/campaign">Classic campaign view</Link></Button>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="In outreach" value={enrolledAll.length} hint="Enrolled and still open" />
        <Stat label="Response rate" value={respRate} hint="Replied, met, or moved forward" />
        <Stat label="Meetings" value={meetings} tone={meetings ? "ok" : undefined} hint="From enrolled targets" />
        <Stat label="Partners referring" value={partnersReferring} hint={`${partners.length} referral partner${partners.length === 1 ? "" : "s"}`} />
      </div>

      {campaigns.length === 0 ? <Empty icon={<Workflow size={20} />} title="No campaigns yet" body="Create one from the classic campaign view." /> : (
        <div className="grid gap-5 md:grid-cols-[260px_1fr] lg:grid-cols-[300px_1fr]">
          {/* campaign list */}
          <div>
            <div className="md:hidden">
              <NativeSelect value={sel ?? ""} onChange={(e) => setSel(e.target.value)}>
                {campaigns.map((k) => <option key={k.id} value={k.id}>{k.name} · {(byCamp[k.id] ?? []).length} enrolled{dueFor(k).length ? ` · ${dueFor(k).length} due` : ""}</option>)}
              </NativeSelect>
            </div>
            <div className="hidden divide-y divide-border overflow-hidden rounded-xl border border-border bg-card md:block">
              {campaigns.map((k) => {
                const en = byCamp[k.id] ?? [];
                const d = dueFor(k).length;
                return (
                  <button key={k.id} onClick={() => setSel(k.id)} className={cn("block w-full px-3.5 py-3 text-left hover:bg-white/[0.03]", sel === k.id && "bg-white/[0.06]")}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{k.name}</span>
                      {d ? <Badge variant="warning">{d} due</Badge> : null}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {k.status === "active" ? "Active" : k.status ?? "—"} · {en.length} enrolled · {en.filter(didRespond).length} replied · {en.filter(didMeet).length} met
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* selected campaign */}
          {camp ? (
            <div className="min-w-0 space-y-5">
              <div>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                    <h2 className="text-xl font-semibold text-white">{camp.name}</h2>
                    {camp.objective ? <p className="mt-0.5 text-sm text-neutral-400">{camp.objective}</p> : null}
                    {camp.target ? <p className="mt-0.5 text-xs text-neutral-500">Targets: {camp.target}</p> : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil size={14} />Edit steps</Button>
                    <Button size="sm" onClick={() => setEnrollOpen(true)}><Plus size={14} />Enroll targets</Button>
                  </div>
                </div>
                {!camp.steps ? <p className="mt-2 text-xs text-amber-300/90">Using the default 5-step sequence. Edit steps to make it this campaign&apos;s own.</p> : null}
              </div>

              <SeqLine steps={steps} current={groupStep} />

              <section>
                <SectionTitle right={<span className="text-xs text-neutral-500">{due.length} due</span>}>Due today</SectionTitle>
                {due.length === 0 ? (
                  <Empty title="Nothing due in this campaign" body={enrolled.length ? "Every enrolled target is waiting on a later step." : "Enroll targets to start the sequence."}
                    action={!enrolled.length ? <Button variant="outline" onClick={() => setEnrollOpen(true)}>Enroll targets</Button> : undefined} />
                ) : (
                  <div className="space-y-2">
                    {due.map((c) => {
                      const n = nextStep(c, steps)!;
                      const msg = fillTemplate(n.step.template, c);
                      const isEmail = /email/i.test(n.step.channel);
                      const tone = dueTone(n.due);
                      return (
                        <div key={c.id} className="rounded-xl border border-border bg-card p-3">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <TierBadge tier={c.tier} />
                            <Link href={`/marketing/targets?c=${c.id}`} className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-white hover:underline">{c.name}</div>
                              <div className="truncate text-xs text-neutral-400">{c.company ?? ""}</div>
                            </Link>
                            <div className="text-right text-xs">
                              <div className="text-neutral-200">Step {n.idx + 1}: {n.step.label}</div>
                              <div className={cn(tone === "bad" ? "font-semibold text-red-300" : "font-semibold text-amber-300")}>{n.step.channel} · {rel(n.due)}</div>
                            </div>
                          </div>
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" disabled={busy === c.id} onClick={() => markDone(c)}><Check size={14} />Mark step done</Button>
                            {msg ? <Button variant="outline" size="sm" onClick={async () => showToast((await copyText(msg)) ? "Message copied" : "Copy failed")}><Copy size={14} />Copy message</Button> : null}
                            {isEmail ? (validEmail(c.email)
                              ? <>
                                <Button variant="outline" size="sm" disabled={busy === "q" + c.id} onClick={() => queueEmail(c, fillTemplate(n.step.subject || "Exterior work at {company}", c), msg, n.idx)}><ShieldCheck size={14} />Queue for approval</Button>
                                <Button variant="ghost" size="sm" asChild><a href={`mailto:${encodeURIComponent(c.email!)}?subject=${encodeURIComponent(fillTemplate(n.step.subject || "Exterior work at {company}", c))}&body=${encodeURIComponent(msg)}`}><Mail size={14} />Open in my mail app</a></Button>
                              </>
                              : <span className="self-center text-xs text-neutral-500">No email on file</span>) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section>
                <SectionTitle right={<span className="text-xs text-neutral-500">{enrolled.length}</span>}>Enrolled</SectionTitle>
                {enrolled.length === 0 ? <Empty title="No one enrolled" body="Pick B-tier targets that fit this campaign and enroll them." action={<Button variant="outline" onClick={() => setEnrollOpen(true)}>Enroll targets</Button>} /> : (
                  <div className="divide-y divide-border rounded-xl border border-border bg-card">
                    {enrolled.map((c) => {
                      const n = nextStep(c, steps);
                      const done = Math.min(c.seq_step ?? 0, steps.length);
                      return (
                        <Link key={c.id} href={`/marketing/targets?c=${c.id}`} className="flex min-h-[52px] items-center gap-3 px-3 py-2 hover:bg-white/[0.03]">
                          <TierBadge tier={c.tier} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-white">{c.name}</div>
                            <div className="truncate text-xs text-neutral-400">{!isOpen(c) ? c.stage : n ? `Next: ${n.step.label} · ${rel(n.due)}` : "Sequence finished"}{didRespond(c) ? " · replied" : ""}</div>
                          </div>
                          <div className="hidden w-28 sm:block"><SeqBar total={steps.length} done={done} /></div>
                          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-neutral-500">{done}/{steps.length}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          ) : <Empty title="Pick a campaign" />}
        </div>
      )}

      {camp ? <EditStepsDialog open={editOpen} onOpenChange={setEditOpen} initial={steps} isDefault={!camp.steps} onSave={saveSteps} /> : null}
      {camp ? <EnrollDialog open={enrollOpen} onOpenChange={setEnrollOpen} contacts={contacts.filter((c) => !c.campaign_id && isOpen(c))} campName={camp.name} onEnroll={enroll} /> : null}
    </div>
  );
}

function EditStepsDialog({ open, onOpenChange, initial, isDefault, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; initial: Step[]; isDefault: boolean; onSave: (s: Step[] | null) => Promise<void> }) {
  const [rows, setRows] = useState<Step[]>([]);
  useEffect(() => { if (open) setRows(initial.map((s) => ({ ...s }))); }, [open, initial]);
  const upd = (i: number, p: Partial<Step>) => setRows((r) => r.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, d: number) => setRows((r) => { const n = r.slice(); const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Edit sequence</DialogTitle>
          <DialogDescription>Day is counted from the date a target is enrolled. Use {"{first_name}"} and {"{company}"} in templates.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {rows.map((s, i) => (
            <div key={i} className="rounded-xl border border-border p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold text-white">Step {i + 1}</span>
                <div className="ml-auto flex gap-1">
                  <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={14} /></Button>
                  <Button variant="ghost" size="icon-sm" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={14} /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} aria-label="Remove step"><Trash2 size={14} /></Button>
                </div>
              </div>
              <div className="grid grid-cols-[72px_1fr] gap-2 sm:grid-cols-[72px_150px_1fr]">
                <div><Label>Day</Label><Input type="number" min={0} value={s.day} onChange={(e) => upd(i, { day: Math.max(0, Number(e.target.value) || 0) })} /></div>
                <div><Label>Channel</Label>
                  <NativeSelect value={s.channel} onChange={(e) => upd(i, { channel: e.target.value })}>
                    {[...CHANNELS, ...(CHANNELS.includes(s.channel as any) ? [] : [s.channel])].map((c) => <option key={c}>{c}</option>)}
                  </NativeSelect>
                </div>
                <div className="col-span-2 sm:col-span-1"><Label>Label</Label><Input value={s.label} onChange={(e) => upd(i, { label: e.target.value })} /></div>
              </div>
              {/email/i.test(s.channel) ? <div className="mt-2"><Label>Email subject</Label><Input value={s.subject ?? ""} onChange={(e) => upd(i, { subject: e.target.value })} placeholder="Exterior work at {company}" /></div> : null}
              <div className="mt-2"><Label>Template</Label><Textarea rows={3} value={s.template ?? ""} onChange={(e) => upd(i, { template: e.target.value })} /></div>
            </div>
          ))}
          <Button variant="outline" className="w-full" onClick={() => setRows((r) => [...r, { day: (r[r.length - 1]?.day ?? 0) + 3, channel: "Email", label: "New step", template: "" }])}><Plus size={15} />Add step</Button>
        </div>
        <DialogFooter>
          {!isDefault ? <Button variant="ghost" onClick={async () => { await onSave(null); onOpenChange(false); }} className="sm:mr-auto">Reset to default</Button> : null}
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button disabled={!rows.length || rows.some((r) => !r.label.trim())} onClick={async () => {
            const clean = rows.map((r) => ({ ...r, label: r.label.trim() })).sort((a, b) => a.day - b.day);
            await onSave(clean); onOpenChange(false);
          }}>Save steps</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnrollDialog({ open, onOpenChange, contacts, campName, onEnroll }: { open: boolean; onOpenChange: (v: boolean) => void; contacts: MContact[]; campName: string; onEnroll: (ids: string[]) => Promise<void> }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [fTier, setFTier] = useState("");
  const [fSector, setFSector] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => { if (open) { setPicked(new Set()); setQ(""); } }, [open]);
  const list = contacts.filter((c) => (!fTier || c.tier === fTier) && (!fSector || c.sector === fSector) && (!q || [c.name, c.company].join(" ").toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (TIER_ORDER[a.tier ?? "C"] ?? 9) - (TIER_ORDER[b.tier ?? "C"] ?? 9) || (a.company ?? "").localeCompare(b.company ?? ""));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = list.length > 0 && list.every((c) => picked.has(c.id));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Enroll in {campName}</DialogTitle>
          <DialogDescription>Targets not in any campaign. The sequence starts today.</DialogDescription>
        </DialogHeader>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_120px_140px]">
          <div className="relative col-span-2 sm:col-span-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-9" />
          </div>
          <NativeSelect value={fTier} onChange={(e) => setFTier(e.target.value)}><option value="">All tiers</option>{["A", "B", "C", "Broker"].map((t) => <option key={t}>{t}</option>)}</NativeSelect>
          <NativeSelect value={fSector} onChange={(e) => setFSector(e.target.value)}><option value="">All sectors</option>{SECTORS.map((t) => <option key={t}>{t}</option>)}</NativeSelect>
        </div>
        <div className="mb-2 flex items-center justify-between text-xs text-neutral-400">
          <button className="hover:text-white" onClick={() => setPicked((s) => { const n = new Set(s); list.forEach((c) => (allOn ? n.delete(c.id) : n.add(c.id))); return n; })}>{allOn ? "Clear shown" : `Select all ${list.length}`}</button>
          <span>{picked.size} selected</span>
        </div>
        <div className="max-h-[46vh] divide-y divide-border overflow-y-auto scroll-thin rounded-xl border border-border">
          {list.length === 0 ? <p className="p-4 text-sm text-neutral-500">No targets match.</p> : list.map((c) => (
            <label key={c.id} className="flex min-h-[48px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-white/[0.03]">
              <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 accent-white" />
              <TierBadge tier={c.tier} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{c.name}</span>
                <span className="block truncate text-xs text-neutral-400">{[c.company, c.sector].filter(Boolean).join(" · ")}</span>
              </span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button disabled={!picked.size} onClick={async () => { await onEnroll([...picked]); onOpenChange(false); }}>Enroll {picked.size || ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OutreachScreen() {
  return (
    <Suspense fallback={<div className="grid gap-3 md:grid-cols-[280px_1fr]"><Skeleton className="h-72" /><Skeleton className="h-96" /></div>}>
      <Inner />
    </Suspense>
  );
}
