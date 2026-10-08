"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { Building2, LayoutGrid, Rows3, ChevronDown, ChevronUp, ArrowUpRight, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { coShort } from "@/lib/crm";
import { STATUS_META, fmtPrice } from "@/lib/format";
import { PageHeader, Skeleton, Empty, KV, SectionTitle } from "@/components/ui/bits";
import { Segmented } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { showToast, showError } from "@/components/Toaster";
import { cn } from "@/lib/utils";
import { MContact, Activity, TierBadge, rel, shortDate, dueTone, jobPrice, norm, changed, useIsPhone } from "./lib";

type StageKey = "none" | "contact" | "walked" | "proposal" | "won" | "lost";
const COLS: { key: StageKey; label: string }[] = [
  { key: "contact", label: "Contact made" },
  { key: "walked", label: "Site walked" },
  { key: "proposal", label: "Proposal sent" },
  { key: "won", label: "Won account" },
];
const ALL_STAGES: { key: StageKey; label: string }[] = [{ key: "none", label: "Not contacted" }, ...COLS, { key: "lost", label: "Lost" }];
const stageLabel = (k: StageKey) => ALL_STAGES.find((s) => s.key === k)?.label ?? k;
const ACCOUNT_KINDS = ["commercial", "property_mgmt", "medical"];
const OPEN = ["lead", "awaiting", "booked", "progress"];
const usd0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

type Account = {
  key: string; name: string; contacts: MContact[]; customer: any | null; properties: any[]; jobs: any[];
  stage: StageKey; sites: number; main: MContact | null; next: MContact | null; openValue: number; wonValue: number; sector: string | null;
};

function siteCount(b: string | null | undefined) {
  if (!b || /not published/i.test(b)) return 0;
  return b.split(/·|;|\n/).map((x) => x.trim()).filter(Boolean).length;
}

function deriveStage(contacts: MContact[], customer: any | null, jobs: any[]): StageKey {
  const explicit = (contacts.find((c) => c.account_stage)?.account_stage ?? customer?.account_stage) as StageKey | undefined;
  if (explicit && ALL_STAGES.some((s) => s.key === explicit)) return explicit;
  const st = contacts.map((c) => c.stage);
  if (st.some((s) => s === "Won" || s === "Client") || jobs.some((j) => ["booked", "progress", "complete"].includes(j.status))) return "won";
  if (st.includes("Proposal") || jobs.some((j) => j.status === "awaiting")) return "proposal";
  if (st.includes("Walk-through")) return "walked";
  if (contacts.length && st.every((s) => s === "Dead")) return "lost";
  if (contacts.some((c) => c.last_touch || !["Not started", "Dead"].includes(c.stage)) || jobs.length) return "contact";
  return "none";
}

export default function AccountsPipeline() {
  const sb = useMemo(() => createClient(), []);
  const phone = useIsPhone();
  const [contacts, setContacts] = useState<MContact[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [props, setProps] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"board" | "table">("board");
  const [peekKey, setPeekKey] = useState<string | null>(null);
  const [showLost, setShowLost] = useState(false);
  const [showNone, setShowNone] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  useEffect(() => {
    (async () => {
      const [c, cu, p, j] = await Promise.all([
        sb.from("contacts").select("*"),
        sb.from("customers").select("id,name,kind,client_type,qbo_names,account_stage,contact_name,phone,email,archived"),
        sb.from("properties").select("id,customer_id,label,address,city"),
        sb.from("jobs").select("id,job_name,customer,customer_id,status,price,price_amount,completed_date,paid_date,created_at"),
      ]);
      setContacts((c.data as MContact[]) ?? []);
      setCustomers(cu.data ?? []);
      setProps(p.data ?? []);
      setJobs(j.data ?? []);
      setLoading(false);
    })();
  }, [sb]);

  const accounts = useMemo<Account[]>(() => {
    const groups = new Map<string, MContact[]>();
    contacts.filter((c) => c.prospect_type !== "Broker" && c.tier !== "Broker").forEach((c) => {
      const k = norm(c.company) || "—";
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
    });
    const custFor = (name: string) => {
      const a = norm(name), b = norm(coShort(name));
      return customers.find((x) => [norm(x.name), ...(x.qbo_names ?? []).map(norm)].some((n) => n && (n === a || n === b))) ?? null;
    };
    const jobsFor = (cu: any | null) => cu ? jobs.filter((j) => j.customer_id === cu.id || norm(j.customer) === norm(cu.name)) : [];
    const build = (key: string, name: string, cs: MContact[], cu: any | null): Account => {
      const js = jobsFor(cu);
      const pr = cu ? props.filter((p) => p.customer_id === cu.id) : [];
      const main = cs.slice().sort((a, b) => Number(!!b.decision_maker) - Number(!!a.decision_maker) || (a.tier === "A" ? -1 : 0) - (b.tier === "A" ? -1 : 0))[0] ?? null;
      const next = cs.filter((c) => c.next_date).sort((a, b) => (a.next_date ?? "").localeCompare(b.next_date ?? ""))[0] ?? null;
      return {
        key, name, contacts: cs, customer: cu, properties: pr, jobs: js, stage: deriveStage(cs, cu, js),
        sites: Math.max(pr.length, ...cs.map((c) => siteCount(c.buildings)), 0), main, next,
        openValue: js.filter((j) => OPEN.includes(j.status)).reduce((a, j) => a + jobPrice(j), 0),
        wonValue: js.filter((j) => j.status === "complete").reduce((a, j) => a + jobPrice(j), 0),
        sector: cs[0]?.sector ?? (cu?.client_type === "medical" ? "Medical" : cu ? "Commercial" : null),
      };
    };
    const out: Account[] = [];
    const usedCust = new Set<string>();
    groups.forEach((cs, k) => {
      const name = cs[0].company ?? "No company";
      const cu = custFor(name);
      if (cu) usedCust.add(cu.id);
      out.push(build("co:" + k, name, cs, cu));
    });
    customers.filter((cu) => !cu.archived && ACCOUNT_KINDS.includes(cu.client_type) && !usedCust.has(cu.id))
      .forEach((cu) => out.push(build("cu:" + cu.id, cu.name, [], cu)));
    return out.sort((a, b) => b.openValue + b.wonValue - (a.openValue + a.wonValue) || a.name.localeCompare(b.name));
  }, [contacts, customers, props, jobs]);

  async function setStage(acc: Account, stage: StageKey) {
    if (acc.stage === stage) return;
    const ids = acc.contacts.map((c) => c.id);
    setContacts((cs) => cs.map((c) => (ids.includes(c.id) ? { ...c, account_stage: stage } : c)));
    if (acc.customer) setCustomers((cs) => cs.map((c) => (c.id === acc.customer.id ? { ...c, account_stage: stage } : c)));
    const ops: PromiseLike<any>[] = [];
    if (ids.length) ops.push(sb.from("contacts").update({ account_stage: stage, updated_at: new Date().toISOString() }).in("id", ids));
    if (acc.customer) ops.push(sb.from("customers").update({ account_stage: stage }).eq("id", acc.customer.id));
    const res = await Promise.all(ops);
    const err = res.find((r) => r.error)?.error;
    if (err) { showError("Save failed: " + err.message); return; }
    changed();
    showToast(`${acc.name} → ${stageLabel(stage)}`);
  }

  function onDragEnd(e: DragEndEvent) {
    const acc = accounts.find((a) => a.key === e.active.id);
    const to = e.over?.id as StageKey | undefined;
    if (acc && to) setStage(acc, to);
  }

  const by = (k: StageKey) => accounts.filter((a) => a.stage === k);
  const peek = accounts.find((a) => a.key === peekKey) ?? null;
  const pipelineValue = accounts.filter((a) => ["contact", "walked", "proposal"].includes(a.stage)).reduce((s, a) => s + a.openValue, 0);

  const header = (
    <PageHeader title="Commercial pipeline" sub="Property-manager, medical and commercial accounts — from first contact to a won account."
      actions={<Segmented<"board" | "table"> value={mode} onChange={setMode} options={[{ value: "board", label: "Board", icon: <LayoutGrid size={14} /> }, { value: "table", label: "Table", icon: <Rows3 size={14} /> }]} />} />
  );
  if (loading) return <div>{header}<div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}</div></div>;

  const card = (a: Account, draggable: boolean) => <AccountCard key={a.key} a={a} draggable={draggable} phone={phone} onOpen={() => setPeekKey(a.key)} onStage={(s) => setStage(a, s)} />;

  return (
    <div>
      {header}
      <p className="-mt-2 mb-4 text-xs text-neutral-500">{accounts.length} accounts · {by("won").length} won · {usd0(pipelineValue)} open job value in active accounts{!phone && mode === "board" ? " · drag a card to move it" : ""}</p>

      {accounts.length === 0 ? <Empty icon={<Building2 size={20} />} title="No accounts yet" body="Add targets with a company name, or commercial customers, and they show up here." action={<Link href="/marketing/targets?new=1" className="text-sm underline">Add a target</Link>} /> : mode === "board" ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className={cn("grid gap-3", phone ? "grid-cols-1" : "grid-cols-4")}>
            {COLS.map((col) => (
              <Column key={col.key} id={col.key} label={col.label} count={by(col.key).length} value={by(col.key).reduce((s, a) => s + (col.key === "won" ? a.wonValue + a.openValue : a.openValue), 0)}>
                {by(col.key).length === 0 ? <p className="px-1 py-4 text-center text-xs text-neutral-600">{phone ? "None" : "Drop an account here"}</p> : by(col.key).map((a) => card(a, !phone))}
              </Column>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Collapsed id="none" label="Not contacted yet" open={showNone} onToggle={() => setShowNone((v) => !v)} count={by("none").length} phone={phone}>
              {by("none").map((a) => card(a, !phone))}
            </Collapsed>
            <Collapsed id="lost" label="Lost" open={showLost} onToggle={() => setShowLost((v) => !v)} count={by("lost").length} phone={phone}>
              {by("lost").map((a) => card(a, !phone))}
            </Collapsed>
          </div>
        </DndContext>
      ) : phone ? (
        <div className="space-y-2">{accounts.map((a) => card(a, false))}</div>
      ) : (
        <TableWrap>
          <Table>
            <THead><TR><TH>Account</TH><TH>Stage</TH><TH>Main contact</TH><TH className="text-right">Sites</TH><TH>Next action</TH><TH className="text-right">Open value</TH><TH className="text-right">Won</TH></TR></THead>
            <TBody>
              {accounts.map((a) => (
                <TR key={a.key} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => setPeekKey(a.key)}>
                  <TD><div className="max-w-[240px] truncate font-semibold text-white">{a.name}</div><div className="text-xs text-neutral-500">{a.contacts.length} contact{a.contacts.length === 1 ? "" : "s"}{a.customer ? " · customer" : ""}</div></TD>
                  <TD onClick={(e) => e.stopPropagation()}>
                    <NativeSelect value={a.stage} onChange={(e) => setStage(a, e.target.value as StageKey)} className="h-8 w-40 text-xs">{ALL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</NativeSelect>
                  </TD>
                  <TD className="text-sm text-neutral-300">{a.main?.name ?? a.customer?.contact_name ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{a.sites || "—"}</TD>
                  <TD className="text-sm">{a.next ? <><span className="text-neutral-200">{a.next.next_action || "Follow up"}</span> <span className={cn("text-xs", dueTone(a.next.next_date) === "bad" ? "text-red-300" : dueTone(a.next.next_date) === "warn" ? "text-amber-300" : "text-neutral-500")}>{rel(a.next.next_date)}</span></> : <span className="text-neutral-600">—</span>}</TD>
                  <TD className="text-right tabular-nums">{a.openValue ? usd0(a.openValue) : "—"}</TD>
                  <TD className={cn("text-right tabular-nums", a.wonValue ? "text-emerald-300" : "text-neutral-600")}>{a.wonValue ? usd0(a.wonValue) : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}

      <Sheet open={!!peek} onOpenChange={(v) => { if (!v) setPeekKey(null); }}>
        <SheetContent title={peek?.name ?? "Account"}>{peek ? <AccountPeek a={peek} onStage={(s) => setStage(peek, s)} /> : null}</SheetContent>
      </Sheet>
    </div>
  );
}

function Column({ id, label, count, value, children }: { id: string; label: string; count: number; value: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("min-w-0 rounded-xl border border-border bg-white/[0.02] p-2", isOver && "border-white/30 bg-white/[0.05]")}>
      <div className="mb-2 flex items-baseline gap-2 px-1.5 pt-1">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-xs tabular-nums text-neutral-500">{count}</span>
        {value ? <span className="ml-auto text-xs tabular-nums text-neutral-400">{usd0(value)}</span> : null}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Collapsed({ id, label, open, onToggle, count, phone, children }: { id: string; label: string; open: boolean; onToggle: () => void; count: number; phone: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("rounded-xl border border-border p-2", isOver && "border-white/30 bg-white/[0.05]")}>
      <button onClick={onToggle} className="flex min-h-[40px] w-full items-center gap-2 px-1.5 text-left">
        <span className="text-sm font-semibold text-neutral-300">{label}</span>
        <span className="text-xs tabular-nums text-neutral-500">{count}</span>
        <span className="ml-auto text-neutral-500">{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
      </button>
      {open ? <div className={cn("mt-1 grid gap-2", !phone && "sm:grid-cols-2")}>{count ? children : <p className="px-1.5 pb-2 text-xs text-neutral-600">None</p>}</div> : null}
    </div>
  );
}

function AccountCard({ a, draggable, phone, onOpen, onStage }: { a: Account; draggable: boolean; phone: boolean; onOpen: () => void; onStage: (s: StageKey) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: a.key, disabled: !draggable });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const tone = dueTone(a.next?.next_date);
  return (
    <div ref={setNodeRef} style={style} {...(draggable ? { ...listeners, ...attributes } : {})}
      className={cn("rounded-lg border border-border bg-neutral-950 p-3 text-left", draggable && "cursor-grab active:cursor-grabbing", isDragging && "z-50 opacity-80 shadow-2xl ring-1 ring-white/30")}>
      <button onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-white">{a.name}</span>
          {a.main?.tier ? <TierBadge tier={a.main.tier} className="h-5 min-w-5 text-[11px]" /> : a.customer ? <Badge variant="muted">Customer</Badge> : null}
        </div>
        <div className="mt-1 text-xs text-neutral-400">
          {[a.main?.name ?? a.customer?.contact_name, a.sites ? `${a.sites} site${a.sites === 1 ? "" : "s"}` : null, a.contacts.length > 1 ? `${a.contacts.length} contacts` : null].filter(Boolean).join(" · ") || "No contact yet"}
        </div>
        {a.next ? (
          <div className="mt-1.5 flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-neutral-300">{a.next.next_action || "Follow up"}</span>
            <span className={cn("shrink-0", tone === "bad" ? "font-semibold text-red-300" : tone === "warn" ? "font-semibold text-amber-300" : "text-neutral-500")}>{rel(a.next.next_date)}</span>
          </div>
        ) : null}
        {a.openValue || a.wonValue ? (
          <div className="mt-1.5 flex gap-3 text-xs tabular-nums">
            {a.openValue ? <span className="text-neutral-200">{usd0(a.openValue)} open</span> : null}
            {a.wonValue ? <span className="text-emerald-300">{usd0(a.wonValue)} won</span> : null}
          </div>
        ) : null}
      </button>
      {phone ? (
        <NativeSelect value={a.stage} onChange={(e) => onStage(e.target.value as StageKey)} className="mt-2 h-10 text-xs" aria-label="Account stage">
          {ALL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </NativeSelect>
      ) : null}
    </div>
  );
}

function AccountPeek({ a, onStage }: { a: Account; onStage: (s: StageKey) => void }) {
  const sb = useMemo(() => createClient(), []);
  const [acts, setActs] = useState<Activity[] | null>(null);
  useEffect(() => {
    const ids = a.contacts.map((c) => c.id);
    if (!ids.length) { setActs([]); return; }
    sb.from("activities").select("*").in("contact_id", ids).order("occurred_at", { ascending: false }).limit(60).then(({ data }) => setActs((data as Activity[]) ?? []));
  }, [a.key, sb]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameOf = (id: string | null) => a.contacts.find((c) => c.id === id)?.name ?? "";
  const stepIdx = COLS.findIndex((c) => c.key === a.stage);
  return (
    <div className="h-full overflow-y-auto scroll-thin px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
      <div className="pr-10">
        <h2 className="text-lg font-semibold leading-tight text-white">{a.name}</h2>
        <p className="text-sm text-neutral-400">{[a.sector, a.sites ? `${a.sites} site${a.sites === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || "Account"}</p>
      </div>
      <div className="mt-4 flex gap-1 overflow-x-auto no-scrollbar">
        {COLS.map((c, i) => (
          <button key={c.key} onClick={() => onStage(c.key)} className={cn("h-9 shrink-0 rounded-md px-3 text-xs font-semibold", a.stage === c.key ? "bg-white text-neutral-900" : i < stepIdx ? "bg-white/[0.12] text-white" : "bg-white/[0.04] text-neutral-400 hover:text-white")}>{c.label}</button>
        ))}
        <button onClick={() => onStage("lost")} className={cn("h-9 shrink-0 rounded-md px-3 text-xs font-semibold", a.stage === "lost" ? "bg-red-500/15 text-red-300" : "text-neutral-500 hover:text-red-300")}>Lost</button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/[0.04] p-3"><div className="text-xs text-neutral-400">Open job value</div><div className="text-lg font-semibold tabular-nums text-white">{usd0(a.openValue)}</div></div>
        <div className="rounded-lg bg-white/[0.04] p-3"><div className="text-xs text-neutral-400">Revenue won</div><div className={cn("text-lg font-semibold tabular-nums", a.wonValue ? "text-emerald-300" : "text-white")}>{usd0(a.wonValue)}</div></div>
      </div>

      <section className="mt-5">
        <SectionTitle>Contacts</SectionTitle>
        {a.contacts.length === 0 ? <p className="text-xs text-neutral-500">No target contacts at this account. <Link href="/marketing/targets?new=1" className="underline">Add one</Link></p> : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {a.contacts.map((c) => (
              <Link key={c.id} href={`/marketing/targets?c=${c.id}`} className="flex min-h-[48px] items-center gap-3 px-3 py-2 hover:bg-white/[0.03]">
                <TierBadge tier={c.tier} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-white">{c.name}</span><span className="block truncate text-xs text-neutral-400">{[c.title, c.stage].filter(Boolean).join(" · ")}</span></span>
                <ArrowUpRight size={14} className="text-neutral-500" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-5">
        <SectionTitle>Customer record</SectionTitle>
        {a.customer ? (
          <div className="rounded-xl border border-border px-3 py-1">
            <KV k="Customer"><Link href={`/customers/${a.customer.id}`} className="hover:underline">{a.customer.name}</Link></KV>
            {a.customer.contact_name ? <KV k="Contact">{a.customer.contact_name}</KV> : null}
            {a.customer.phone ? <KV k="Phone"><a href={`tel:${a.customer.phone}`} className="hover:underline">{a.customer.phone}</a></KV> : null}
            {a.properties.length ? <KV k="Properties"><span className="font-normal text-neutral-300">{a.properties.map((p) => p.label || p.address).join(", ")}</span></KV> : null}
          </div>
        ) : <p className="text-xs text-neutral-500">Not a customer yet. Once you win work, create the customer with the same company name and it links here.</p>}
      </section>

      {a.jobs.length ? (
        <section className="mt-5">
          <SectionTitle>Jobs</SectionTitle>
          <div className="divide-y divide-border rounded-xl border border-border">
            {a.jobs.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at))).map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`} className="flex min-h-[44px] items-center gap-3 px-3 py-2 text-sm hover:bg-white/[0.03]">
                <span className="min-w-0 flex-1 truncate text-white">{j.job_name || j.customer}</span>
                <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATUS_META[j.status]?.cls)}>{STATUS_META[j.status]?.label ?? j.status}</span>
                <span className="w-20 shrink-0 text-right tabular-nums text-neutral-300">{fmtPrice(j.price_amount ?? j.price) || "—"}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-5">
        <SectionTitle>Timeline</SectionTitle>
        {acts == null ? <Skeleton /> : acts.length === 0 ? <p className="text-xs text-neutral-500">No logged touches. Log calls and emails from a contact&apos;s target panel.</p> : (
          <ol className="space-y-2.5 border-l border-border pl-4">
            {acts.map((x) => (
              <li key={x.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-neutral-500" />
                <div className="flex flex-wrap items-center gap-x-2 text-sm"><MessageSquare size={12} className="text-neutral-500" /><span className="font-medium text-neutral-100">{x.type}</span><span className="text-neutral-400">{nameOf(x.contact_id)}</span><span className="text-xs text-neutral-500">{shortDate(x.occurred_at)}</span></div>
                {x.note ? <p className="mt-0.5 text-xs text-neutral-400">{x.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
