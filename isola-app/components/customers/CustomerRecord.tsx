"use client";
// v4.6 customer record: header + stats, tabs on the left (properties & jobs, jobs table,
// activity, documents), right rail of key/value cards (contacts, details, notes, invoices).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowUp, Archive, ArchiveRestore, Briefcase, ChevronDown, ChevronRight, FileText, Mail, MapPin, MoreHorizontal,
  Pencil, Phone, Plus, StickyNote, Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, KV, Skeleton, Stat } from "@/components/ui/bits";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { editJob } from "@/components/job/JobForm";
import { showToast, undoable, showError } from "@/components/Toaster";
import {
  ContactDialog, EditCustomerDialog, PropertyDialog, StageChip, TYPES,
  changed, invoicesFor, jobDate, jobName, jobPrice, lower, money0, money2, tel,
} from "@/components/customers/shared";

const dt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
type SortKey = "name" | "status" | "price" | "where" | "date";
const STAGE_ORDER: Record<string, number> = { lead: 0, awaiting: 1, booked: 2, progress: 3, complete: 4, lost: 5 };

export default function CustomerRecord({ id }: { id: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [c, setC] = useState<any>(null);
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [props, setProps] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [comms, setComms] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [snap, setSnap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("props");
  const [editing, setEditing] = useState(false);
  const [propEdit, setPropEdit] = useState<any | null>(null);
  const [contactEdit, setContactEdit] = useState<any | null>(null);
  const [openProps, setOpenProps] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const { data: cust } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
    if (!cust) { setC(null); setLoading(false); return; }
    const [byId, byName, ps, cs, cm, ms, ac] = await Promise.all([
      supabase.from("jobs").select("*").eq("customer_id", id),
      supabase.from("jobs").select("*").is("customer_id", null).ilike("customer", String(cust.name).replace(/[%_\\]/g, (m: string) => "\\" + m)),
      supabase.from("properties").select("*").eq("customer_id", id).order("address"),
      supabase.from("customer_contacts").select("*").eq("customer_id", id).order("sort"),
      supabase.from("communications").select("*").eq("customer_id", id).order("occurred_at", { ascending: false }).limit(200),
      supabase.from("money_snapshot").select("data").eq("id", 1).maybeSingle(),
      supabase.from("customers").select("id,name"),
    ]);
    const js = [...(byId.data ?? []), ...(byName.data ?? []).filter((j: any) => lower(j.customer) === lower(cust.name))]
      .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
    setC(cust); setJobs(js); setProps(ps.data ?? []); setContacts(cs.data ?? []); setSnap((ms.data as any)?.data ?? null); setAllCustomers(ac.data ?? []);
    const jobIds = js.map((j: any) => j.id);
    let all = cm.data ?? [];
    if (jobIds.length) {
      const [pl, sv, jc] = await Promise.all([
        supabase.from("proposal_links").select("*").in("job_id", jobIds).order("created_at", { ascending: false }),
        supabase.from("site_visits").select("*").in("job_id", jobIds).order("created_at", { ascending: false }),
        supabase.from("communications").select("*").in("job_id", jobIds).order("occurred_at", { ascending: false }).limit(200),
      ]);
      setLinks(pl.data ?? []); setVisits(sv.data ?? []);
      const seen = new Set(all.map((m: any) => m.id));
      all = [...all, ...(jc.data ?? []).filter((m: any) => !seen.has(m.id))];
    } else { setLinks([]); setVisits([]); }
    setComms(all.sort((a: any, b: any) => String(b.occurred_at).localeCompare(String(a.occurred_at))));
    setLoading(false);
  }
  useEffect(() => { setLoading(true); load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // deep link from the properties table: /customers/<id>?p=<propertyId>
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("p");
    if (p) setOpenProps(new Set([p]));
  }, [id]);

  if (loading) {
    return (
      <div aria-busy="true">
        <Skeleton className="mb-2 h-4 w-28" />
        <Skeleton className="mb-5 h-8 w-72" />
        <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[74px]" />)}</div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
      </div>
    );
  }
  if (!c) {
    return <Empty title="Customer not found" body="It may have been merged into another record." action={<Button asChild variant="outline"><Link href="/customers">All customers</Link></Button>} />;
  }

  const t = TYPES[c.client_type];
  const myInvoices = invoicesFor(c, snap);
  const owed = myInvoices.reduce((a: number, i: any) => a + Number(i.amount ?? 0), 0);
  const overdue = myInvoices.some((i: any) => (i.days_overdue ?? 0) > 0);
  const lifetime = jobs.filter((j) => j.status === "complete").reduce((a, j) => a + jobPrice(j), 0);
  const openJobs = jobs.filter((j) => ["lead", "awaiting", "booked", "progress"].includes(j.status));
  const pipeline = openJobs.reduce((a, j) => a + jobPrice(j), 0);
  const billing = contacts.find((p) => p.is_billing);

  async function patchCustomer(p: any, toast = "Saved") {
    setC((x: any) => ({ ...x, ...p }));
    const { error } = await supabase.from("customers").update({ ...p, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { showError("Save failed: " + error.message); load(); return; }
    showToast(toast);
    changed();
  }

  async function newJob() {
    setCreating(true);
    const row = { job_name: `New job — ${c.name}`, customer: c.name, customer_id: c.id, status: "lead", contact_name: c.contact_name || null, contact_phone: c.phone || null, lead_source: c.lead_source || null };
    const { data, error } = await supabase.from("jobs").insert(row).select("*").single();
    setCreating(false);
    if (error) { showError("Could not create the job: " + error.message); return; }
    changed();
    router.push(`/jobs/${data.id}`);
    setTimeout(() => editJob(data), 50);
  }

  function removeProperty(p: any) {
    const n = jobs.filter((j) => j.property_id === p.id).length;
    if (n) { showError("That property has jobs on it — move them to another property first."); return; }
    undoable({
      text: `Removed ${p.address}`,
      hide: () => setProps((xs) => xs.filter((x) => x.id !== p.id)),
      restore: () => setProps((xs) => (xs.some((x) => x.id === p.id) ? xs : [...xs, p].sort((a, b) => String(a.address).localeCompare(String(b.address))))),
      commit: async () => { const { error } = await supabase.from("properties").delete().eq("id", p.id); if (error) throw error; changed(); },
    });
  }
  function removeContact(p: any) {
    undoable({
      text: `Removed ${p.name}`,
      hide: () => setContacts((xs) => xs.filter((x) => x.id !== p.id)),
      restore: () => setContacts((xs) => (xs.some((x) => x.id === p.id) ? xs : [...xs, p])),
      commit: async () => { const { error } = await supabase.from("customer_contacts").delete().eq("id", p.id); if (error) throw error; changed(); },
    });
  }
  function removeComm(m: any) {
    undoable({
      text: "Entry removed",
      hide: () => setComms((xs) => xs.filter((x) => x.id !== m.id)),
      restore: () => setComms((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m].sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at))))),
      commit: async () => { const { error } = await supabase.from("communications").delete().eq("id", m.id); if (error) throw error; },
    });
  }

  const attachments = comms.filter((m) => m.attachment_b64);

  return (
    <div>
      {/* header */}
      <div className="mb-5">
        <Link href="/customers" className="text-[13px] text-neutral-500 hover:text-neutral-300">Customers</Link>
        <div className="mt-1 flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-tight text-white">{c.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="muted">{c.kind === "individual" ? "Individual" : "Company"}</Badge>
              {t ? <Badge>{t.label}</Badge> : null}
              {c.referral_partner ? <Badge>Referral partner</Badge> : null}
              {(c.tags ?? []).map((tag: string) => <Badge key={tag} variant="muted">{tag}</Badge>)}
              {c.archived ? <Badge variant="danger">Archived</Badge> : null}
            </div>
            <div className="mt-2 text-sm text-neutral-400">
              {[c.contact_name, c.phone, c.email].filter(Boolean).join(" · ") || "No main contact on file"}
            </div>
            {t ? <p className="mt-1 text-xs text-neutral-500">{t.hint}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {c.phone ? <Button asChild variant="outline" size="sm"><a href={`tel:${tel(c.phone)}`}><Phone size={14} /> Call</a></Button> : null}
            {c.email ? <Button asChild variant="outline" size="sm"><a href={`mailto:${c.email}`}><Mail size={14} /> Email</a></Button> : null}
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="More"><MoreHorizontal size={16} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setPropEdit({})}><MapPin size={14} /> Add property</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setContactEdit({})}><Plus size={14} /> Add person</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => patchCustomer({ archived: !c.archived }, c.archived ? "Restored" : "Archived")}>
                  {c.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />} {c.archived ? "Unarchive" : "Archive"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={newJob} disabled={creating}><Plus size={14} /> {creating ? "Creating…" : "New job"}</Button>
          </div>
        </div>
      </div>

      {/* stats */}
      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Lifetime revenue" value={money0(lifetime)} hint="Completed jobs" />
        <Stat label="Open pipeline" value={money0(pipeline)} hint={`${openJobs.length} open job${openJobs.length === 1 ? "" : "s"}`} />
        <Stat label="Owed" value={money0(owed)} tone={overdue ? "bad" : owed ? "warn" : undefined} hint={myInvoices.length ? `${myInvoices.length} open invoice${myInvoices.length === 1 ? "" : "s"}` : "Nothing open in QuickBooks"} />
        <Stat label="Jobs" value={jobs.length} hint={`${jobs.filter((j) => j.status === "complete").length} complete`} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* main */}
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="props">Properties & jobs</TabsTrigger>
              <TabsTrigger value="jobs">Jobs <span className="ml-1 tabular-nums text-neutral-500">{jobs.length}</span></TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="docs">Documents <span className="ml-1 tabular-nums text-neutral-500">{links.length + visits.length + attachments.length || ""}</span></TabsTrigger>
            </TabsList>

            <TabsContent value="props">
              <PropertiesTab props={props} jobs={jobs} open={openProps} setOpen={setOpenProps} onAdd={() => setPropEdit({})} onEdit={(p) => setPropEdit(p)} onRemove={removeProperty} onNewJob={newJob} />
            </TabsContent>

            <TabsContent value="jobs">
              <JobsTable jobs={jobs} props={props} onNewJob={newJob} />
            </TabsContent>

            <TabsContent value="activity">
              <ActivityTab supabase={supabase} customerId={id} jobs={jobs} links={links} visits={visits} comms={comms} onAdded={load} onRemove={removeComm} onImage={setLightbox} />
            </TabsContent>

            <TabsContent value="docs">
              <DocumentsTab links={links} visits={visits} attachments={attachments} jobs={jobs} onImage={setLightbox} />
            </TabsContent>
          </Tabs>
        </div>

        {/* right rail */}
        <div className="space-y-4">
          {myInvoices.length ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-[15px]">Open invoices</CardTitle></CardHeader>
              <CardContent>
                {myInvoices.map((i: any) => (
                  <KV key={i.ref} k={<span>#{i.ref} <span className="text-neutral-500">· due {i.due}</span></span>}>
                    <span className={cn("shrink-0 whitespace-nowrap text-right tabular-nums", i.days_overdue > 0 ? "text-red-300" : "")}>{money2(Number(i.amount))}{i.days_overdue > 0 ? ` · ${i.days_overdue}d late` : ""}</span>
                  </KV>
                ))}
                {snap?.as_of ? <p className="mt-2 text-xs text-neutral-500">QuickBooks as of {snap.as_of}</p> : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[15px]">Contacts</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setContactEdit({})}><Plus size={14} /> Add</Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {c.contact_name || c.phone || c.email ? (
                <ContactRow name={c.contact_name || "Main contact"} role="Main contact" phone={c.phone} email={c.email} onEdit={() => setEditing(true)} />
              ) : null}
              {contacts.map((p) => (
                <ContactRow key={p.id} name={p.name} role={p.role} phone={p.phone} email={p.email} billing={p.is_billing} onEdit={() => setContactEdit(p)} />
              ))}
              {!contacts.length && !c.contact_name && !c.phone && !c.email ? <p className="py-2 text-sm text-neutral-500">No one on file yet.</p> : null}
              {!billing && contacts.length ? <p className="pt-1 text-xs text-neutral-500">No billing contact set — edit a person to mark one.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[15px]">Details</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</Button>
            </CardHeader>
            <CardContent>
              <KV k="Client type">
                <NativeSelect className="h-8 w-auto py-0 text-right text-sm" value={c.client_type ?? ""} onChange={(e) => patchCustomer({ client_type: e.target.value || null })}>
                  <option value="">—</option>
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </NativeSelect>
              </KV>
              <KV k="Kind">{c.kind === "individual" ? "Individual" : "Company"}</KV>
              <KV k="Payment terms">{c.payment_terms || <span className="text-neutral-500">—</span>}</KV>
              <KV k="Client since">{c.client_since ? fmtDate(c.client_since) : <span className="text-neutral-500">—</span>}</KV>
              <KV k="Lead source">{c.lead_source || <span className="text-neutral-500">—</span>}</KV>
              <KV k="Billing address">{c.address || <span className="text-neutral-500">—</span>}</KV>
              <KV k="Tags">{(c.tags ?? []).length ? (c.tags ?? []).join(", ") : <span className="text-neutral-500">—</span>}</KV>
              <KV k="QuickBooks names">{(c.qbo_names ?? []).length ? (c.qbo_names ?? []).join(", ") : <span className="text-neutral-500">Same as name</span>}</KV>
              <KV k="Referral partner">
                <button type="button" role="switch" aria-checked={!!c.referral_partner} onClick={() => patchCustomer({ referral_partner: !c.referral_partner }, c.referral_partner ? "No longer a referral partner" : "Marked as referral partner")}
                  className={cn("relative inline-flex h-6 w-10 items-center rounded-full transition-colors", c.referral_partner ? "bg-white" : "bg-white/15")}>
                  <span className={cn("inline-block h-5 w-5 rounded-full transition-transform", c.referral_partner ? "translate-x-[18px] bg-neutral-900" : "translate-x-0.5 bg-neutral-400")} />
                </button>
              </KV>
            </CardContent>
          </Card>

          <NotesCard value={c.notes ?? ""} onSave={(v) => patchCustomer({ notes: v || null }, "Notes saved")} />
        </div>
      </div>

      <EditCustomerDialog c={c} open={editing} onOpenChange={setEditing} supabase={supabase} customers={allCustomers} onSaved={() => { setEditing(false); load(); }} />
      <PropertyDialog p={propEdit?.id ? propEdit : null} open={!!propEdit} onOpenChange={(o) => { if (!o) setPropEdit(null); }} supabase={supabase} customerId={id} onSaved={() => { setPropEdit(null); load(); }} />
      <ContactDialog p={contactEdit?.id ? contactEdit : null} open={!!contactEdit} onOpenChange={(o) => { if (!o) setContactEdit(null); }} supabase={supabase} customerId={id} onSaved={() => { setContactEdit(null); load(); }} onRemove={removeContact} />
      <Dialog open={!!lightbox} onOpenChange={(o) => { if (!o) setLightbox(null); }}>
        <DialogContent wide className="sm:max-w-4xl">
          <DialogTitle className="sr-only">Attachment</DialogTitle>
          {lightbox ? <img src={lightbox} alt="" className="mx-auto max-h-[80vh] max-w-full object-contain" /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- rail bits ----------
function ContactRow({ name, role, phone, email, billing, onEdit }: { name: string; role?: string | null; phone?: string | null; email?: string | null; billing?: boolean; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-white/[0.05] py-2 last:border-0">
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-white">{name}</span>
          {billing ? <Badge variant="success" className="px-1.5 py-0 text-[11px]">Billing</Badge> : null}
        </div>
        <div className="truncate text-xs text-neutral-500">{[role, phone, email].filter(Boolean).join(" · ") || "—"}</div>
      </button>
      {phone ? <Button asChild variant="ghost" size="icon-sm" aria-label={`Call ${name}`}><a href={`tel:${tel(phone)}`}><Phone size={14} /></a></Button> : null}
      {email ? <Button asChild variant="ghost" size="icon-sm" aria-label={`Email ${name}`}><a href={`mailto:${email}`}><Mail size={14} /></a></Button> : null}
    </div>
  );
}

function NotesCard({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-[15px]">Notes</CardTitle></CardHeader>
      <CardContent>
        <Textarea rows={5} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.trim() !== value.trim()) onSave(v.trim()); }}
          placeholder="Gate codes, who to call first, how they like to be billed…" />
        <p className="mt-1 text-xs text-neutral-500">Saves when you click away.</p>
      </CardContent>
    </Card>
  );
}

// ---------- properties & jobs ----------
function PropertiesTab({ props, jobs, open, setOpen, onAdd, onEdit, onRemove, onNewJob }: {
  props: any[]; jobs: any[]; open: Set<string>; setOpen: (s: Set<string>) => void; onAdd: () => void; onEdit: (p: any) => void; onRemove: (p: any) => void; onNewJob: () => void;
}) {
  const loose = jobs.filter((j) => !j.property_id || !props.some((p) => p.id === j.property_id));
  const toggle = (k: string) => { const n = new Set(open); n.has(k) ? n.delete(k) : n.add(k); setOpen(n); };
  if (!props.length && !jobs.length) {
    return <Empty icon={<MapPin size={22} />} title="No properties or jobs yet" body="Add the addresses you work at for this customer, or start a job." action={<div className="flex gap-2"><Button variant="outline" onClick={onAdd}><MapPin size={15} /> Add property</Button><Button variant="outline" onClick={onNewJob}><Plus size={15} /> New job</Button></div>} />;
  }
  const groups = [
    ...props.map((p) => ({ key: p.id, p, js: jobs.filter((j) => j.property_id === p.id) })),
    ...(loose.length ? [{ key: "__loose", p: null as any, js: loose }] : []),
  ];
  return (
    <div className="space-y-2">
      {groups.map(({ key, p, js }) => {
        const isOpen = open.has(key) || groups.length === 1;
        const last = js.map(jobDate).filter(Boolean).sort().pop();
        return (
          <div key={key} className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button type="button" onClick={() => toggle(key)} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left">
                {isOpen ? <ChevronDown size={16} className="shrink-0 text-neutral-500" /> : <ChevronRight size={16} className="shrink-0 text-neutral-500" />}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{p ? (p.label ? `${p.label} — ${p.address}` : p.address) : "No property on file"}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {[p ? [p.city, p.state, p.zip].filter(Boolean).join(", ") : null, `${js.length} job${js.length === 1 ? "" : "s"}`, last ? "last " + fmtDate(last) : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </button>
              {p ? (
                <div className="flex shrink-0 items-center">
                  <Button asChild variant="ghost" size="icon-sm" aria-label="Open in Maps">
                    <a href={`https://maps.google.com/?q=${encodeURIComponent([p.address, p.city, p.state].filter(Boolean).join(", "))}`} target="_blank" rel="noopener noreferrer"><MapPin size={14} /></a>
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Edit property" onClick={() => onEdit(p)}><Pencil size={14} /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Remove property" onClick={() => onRemove(p)}><Trash2 size={14} /></Button>
                </div>
              ) : null}
            </div>
            {isOpen ? (
              <div className="border-t border-border px-3 py-2">
                {p?.access_notes ? <p className="mb-2 rounded-md bg-amber-500/[0.08] px-2.5 py-1.5 text-xs text-amber-200">Access: {p.access_notes}</p> : null}
                {p?.notes ? <p className="mb-2 whitespace-pre-wrap text-xs text-neutral-400">{p.notes}</p> : null}
                {js.length === 0 ? <p className="py-1.5 text-sm text-neutral-500">No jobs at this address yet.</p> : (
                  <ul className="divide-y divide-white/[0.05]">
                    {js.slice().sort((a, b) => jobDate(b).localeCompare(jobDate(a))).map((j) => (
                      <li key={j.id}>
                        <Link href={`/jobs/${j.id}`} className="flex min-h-[44px] items-center gap-2 py-1.5 text-sm hover:bg-white/[0.02]">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-neutral-100">{jobName(j)}</span>
                            <span className="block truncate text-xs text-neutral-500">{[j.job, jobDate(j) ? fmtDate(jobDate(j)) : null].filter(Boolean).join(" · ")}</span>
                          </span>
                          <StageChip status={j.status} />
                          <span className="w-20 shrink-0 text-right tabular-nums text-neutral-300">{fmtPrice(j.price_amount ?? j.price) || "—"}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
      <Button variant="outline" size="sm" onClick={onAdd}><MapPin size={14} /> Add property</Button>
    </div>
  );
}

function JobsTable({ jobs, props, onNewJob }: { jobs: any[]; props: any[]; onNewJob: () => void }) {
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "date", dir: -1 });
  const where = (j: any) => { const p = props.find((x) => x.id === j.property_id); return p ? (p.label || p.address) : j.location || ""; };
  const val = (j: any, k: SortKey): string | number => k === "name" ? lower(jobName(j)) : k === "status" ? STAGE_ORDER[j.status] ?? 9 : k === "price" ? jobPrice(j) : k === "where" ? lower(where(j)) : jobDate(j);
  const rows = jobs.slice().sort((a, b) => { const x = val(a, sort.k), y = val(b, sort.k); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  const th = (k: SortKey, label: string, right = false) => (
    <TH className={right ? "text-right" : ""}>
      <button type="button" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : k === "date" || k === "price" ? -1 : 1 }))} className={cn("inline-flex items-center gap-1 hover:text-white", sort.k === k && "text-white")}>
        {label}{sort.k === k ? (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null}
      </button>
    </TH>
  );
  if (!jobs.length) return <Empty icon={<Briefcase size={22} />} title="No jobs yet" body="Start the first job for this customer." action={<Button variant="outline" onClick={onNewJob}><Plus size={15} /> New job</Button>} />;
  return (
    <>
      <TableWrap className="hidden md:block">
        <Table>
          <THead><TR>{th("name", "Job")}{th("status", "Stage")}{th("where", "Property")}{th("price", "Price", true)}{th("date", "Date", true)}</TR></THead>
          <TBody>
            {rows.map((j) => (
              <TR key={j.id} className="hover:bg-white/[0.03]">
                <TD className="max-w-[260px]"><Link href={`/jobs/${j.id}`} className="block truncate font-medium text-white hover:underline">{jobName(j)}</Link>{j.job ? <div className="truncate text-xs text-neutral-500">{j.job}</div> : null}</TD>
                <TD><StageChip status={j.status} /></TD>
                <TD className="max-w-[220px] truncate text-neutral-300">{where(j) || "—"}</TD>
                <TD className="text-right tabular-nums text-neutral-200">{fmtPrice(j.price_amount ?? j.price) || "—"}</TD>
                <TD className="text-right text-neutral-400">{jobDate(j) ? fmtDate(jobDate(j)) : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <div className="mb-2 flex items-center gap-2 md:hidden">
        <span className="text-xs text-neutral-500">Sort</span>
        <NativeSelect className="h-9 w-auto" value={sort.k} onChange={(e) => setSort({ k: e.target.value as SortKey, dir: e.target.value === "date" || e.target.value === "price" ? -1 : 1 })}>
          <option value="date">Newest</option><option value="price">Price</option><option value="status">Stage</option><option value="name">Name</option>
        </NativeSelect>
      </div>
      <div className="space-y-2 md:hidden">
        {rows.map((j) => (
          <Link key={j.id} href={`/jobs/${j.id}`} className="block rounded-xl border border-border bg-card px-3.5 py-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-white">{jobName(j)}</div>
                <div className="truncate text-xs text-neutral-500">{[where(j), jobDate(j) ? fmtDate(jobDate(j)) : null].filter(Boolean).join(" · ")}</div>
              </div>
              <StageChip status={j.status} />
            </div>
            {fmtPrice(j.price_amount ?? j.price) ? <div className="mt-1 text-sm tabular-nums text-neutral-300">{fmtPrice(j.price_amount ?? j.price)}</div> : null}
          </Link>
        ))}
      </div>
    </>
  );
}

// ---------- activity ----------
function ActivityTab({ supabase, customerId, jobs, links, visits, comms, onAdded, onRemove, onImage }: {
  supabase: any; customerId: string; jobs: any[]; links: any[]; visits: any[]; comms: any[]; onAdded: () => void; onRemove: (m: any) => void; onImage: (s: string) => void;
}) {
  const [kind, setKind] = useState("note");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<{ b64: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const jobById: Record<string, any> = Object.fromEntries(jobs.map((j) => [j.id, j]));

  async function add() {
    if (!body.trim() && !file) return;
    setBusy(true);
    const { error } = await supabase.from("communications").insert({
      customer_id: customerId, kind, direction: "out",
      body: body.trim() || (file ? "Attached " + file.name : ""),
      attachment_b64: file?.b64 ?? null, attachment_name: file?.name ?? null,
    });
    setBusy(false);
    if (error) { showError("Save failed: " + error.message); return; }
    setBody(""); setFile(null);
    showToast("Logged");
    onAdded();
  }

  type Ev = { at: string; text: string; sub?: string | null; kind: string; comm?: any; href?: string };
  const feed: Ev[] = [
    ...jobs.map((j) => ({ at: j.created_at, kind: "Job", text: `Job created — ${jobName(j)}`, sub: j.job, href: `/jobs/${j.id}` })),
    ...jobs.filter((j) => j.quoted_date).map((j) => ({ at: j.quoted_date + "T12:00:00", kind: "Proposal", text: `Proposal sent — ${jobName(j)}`, sub: fmtPrice(j.price_amount ?? j.price) || null, href: `/jobs/${j.id}` })),
    ...jobs.filter((j) => j.start_date).map((j) => ({ at: j.start_date + "T08:00:00", kind: "Job", text: `Start — ${jobName(j)}`, sub: null, href: `/jobs/${j.id}` })),
    ...jobs.filter((j) => j.completed_date).map((j) => ({ at: j.completed_date + "T17:00:00", kind: "Job", text: `Completed — ${jobName(j)}`, sub: fmtPrice(j.price_amount ?? j.price) || null, href: `/jobs/${j.id}` })),
    ...jobs.filter((j) => j.invoiced_date).map((j) => ({ at: j.invoiced_date + "T12:00:00", kind: "Money", text: `Invoiced — ${jobName(j)}`, sub: fmtPrice(j.price_amount ?? j.price) || null, href: `/jobs/${j.id}` })),
    ...jobs.filter((j) => j.paid_date).map((j) => ({ at: j.paid_date + "T12:00:00", kind: "Money", text: `Paid — ${jobName(j)}`, sub: fmtPrice(j.paid_amount ?? j.price_amount ?? j.price) || null, href: `/jobs/${j.id}` })),
    ...jobs.filter((j) => j.lost_date).map((j) => ({ at: j.lost_date + "T12:00:00", kind: "Job", text: `Lost — ${jobName(j)}`, sub: j.lost_reason, href: `/jobs/${j.id}` })),
    ...links.map((l) => ({ at: l.sent_at, kind: "Proposal", text: `Proposal link sent — ${l.title ?? ""}`, sub: l.price ? money2(Number(l.price)) : null })),
    ...links.filter((l) => l.viewed_at).map((l) => ({ at: l.viewed_at, kind: "Proposal", text: `Client opened the proposal${l.view_count > 1 ? ` (${l.view_count}×)` : ""}`, sub: l.title })),
    ...links.filter((l) => l.approved_at).map((l) => ({ at: l.approved_at, kind: "Proposal", text: `Proposal approved by ${l.approved_by}`, sub: l.title })),
    ...visits.map((v) => ({ at: v.visit_date ? v.visit_date + "T09:00:00" : v.created_at, kind: "Visit", text: "Site visit logged", sub: v.observed_conditions ?? v.purpose })),
    ...comms.map((m) => ({ at: m.occurred_at, kind: m.kind === "call" ? "Call" : m.kind === "email" ? "Email" : "Note", text: m.body, sub: m.job_id && jobById[m.job_id] ? jobName(jobById[m.job_id]) : null, comm: m })),
  ].filter((e) => e.at).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-3">
        <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Log a call, an email, or something to remember…" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <NativeSelect className="h-9 w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
            <option value="note">Note</option><option value="call">Call</option><option value="email">Email</option>
          </NativeSelect>
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input px-3 text-[13px] font-semibold text-neutral-300 hover:bg-accent">
            <FileText size={14} /> {file ? "Photo added" : "Photo"}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              const bm = await createImageBitmap(f);
              const scale = Math.min(1, 1100 / Math.max(bm.width, bm.height));
              const cv = document.createElement("canvas");
              cv.width = Math.round(bm.width * scale); cv.height = Math.round(bm.height * scale);
              cv.getContext("2d")!.drawImage(bm, 0, 0, cv.width, cv.height);
              setFile({ b64: cv.toDataURL("image/jpeg", 0.72), name: f.name });
            }} />
          </label>
          {file ? <img src={file.b64} alt="" className="h-9 rounded border border-white/10" /> : null}
          <Button size="sm" variant="secondary" className="ml-auto" disabled={busy || (!body.trim() && !file)} onClick={add}>{busy ? "Saving…" : "Log it"}</Button>
        </div>
      </div>

      {feed.length === 0 ? <Empty icon={<StickyNote size={22} />} title="Nothing yet" body="Calls, notes, proposals, visits and job milestones show up here." /> : (
        <ol className="relative ml-2 border-l border-white/10">
          {feed.map((e, i) => (
            <li key={i} className="relative pb-3 pl-5">
              <span className={cn("absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-neutral-950", e.kind === "Money" ? "bg-emerald-400" : e.comm ? "bg-white" : "bg-neutral-500")} />
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-neutral-500">{e.kind} · {dt(e.at)}</div>
                  {e.href ? <Link href={e.href} className="block text-sm text-neutral-100 hover:underline">{e.text}</Link> : <div className="whitespace-pre-wrap text-sm text-neutral-100">{e.text}</div>}
                  {e.sub ? <div className="truncate text-xs text-neutral-500">{e.sub}</div> : null}
                  {e.comm?.attachment_b64 ? <img src={e.comm.attachment_b64} alt="" onClick={() => onImage(e.comm.attachment_b64)} className="mt-1.5 h-20 cursor-pointer rounded border border-white/10" /> : null}
                </div>
                {e.comm ? <Button variant="ghost" size="icon-sm" aria-label="Remove entry" onClick={() => onRemove(e.comm)}><Trash2 size={13} /></Button> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------- documents ----------
function DocumentsTab({ links, visits, attachments, jobs, onImage }: { links: any[]; visits: any[]; attachments: any[]; jobs: any[]; onImage: (s: string) => void }) {
  const jobById: Record<string, any> = Object.fromEntries(jobs.map((j) => [j.id, j]));
  if (!links.length && !visits.length && !attachments.length) {
    return <Empty icon={<FileText size={22} />} title="No documents yet" body="Proposal links, site visit records and photos you attach to notes collect here." />;
  }
  return (
    <div className="space-y-5">
      {links.length ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-white">Proposals</h3>
          <div className="divide-y divide-white/[0.05] rounded-xl border border-border bg-card">
            {links.map((l) => (
              <div key={l.id} className="flex items-center gap-2 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{l.title ?? "Proposal"}</div>
                  <div className="text-xs text-neutral-500">{l.price ? money2(Number(l.price)) : "No price"}{l.sent_at ? ` · sent ${dt(l.sent_at)}` : ""}{l.view_count ? ` · opened ${l.view_count}×` : ""}{l.job_id && jobById[l.job_id] ? ` · ${jobName(jobById[l.job_id])}` : ""}</div>
                </div>
                <Badge variant={l.status === "approved" ? "success" : l.status === "declined" ? "muted" : "default"}>{l.status}</Badge>
                <Button asChild variant="outline" size="sm"><a href={`/p/${l.token}`} target="_blank" rel="noopener noreferrer">Open</a></Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {visits.length ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-white">Site visits</h3>
          <div className="divide-y divide-white/[0.05] rounded-xl border border-border bg-card">
            {visits.map((v) => (
              <div key={v.id} className="px-3.5 py-2.5">
                <div className="text-xs text-neutral-500">{v.visit_date ? fmtDate(v.visit_date) : dt(v.created_at)}{v.job_id && jobById[v.job_id] ? ` · ${jobName(jobById[v.job_id])}` : ""}</div>
                <div className="whitespace-pre-wrap text-sm text-neutral-200">{v.observed_conditions ?? v.purpose ?? "—"}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {attachments.length ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-white">Photos from notes</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {attachments.map((m) => (
              <button key={m.id} type="button" onClick={() => onImage(m.attachment_b64)} className="overflow-hidden rounded-lg border border-border">
                <img src={m.attachment_b64} alt={m.attachment_name ?? ""} className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
